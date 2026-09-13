/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — SENIOR CHAT AGENT (agents/senior-chat.js)
 * ==============================================================================
 * Agent 1 of 46: Senior Project Lead.
 * The conversational gateway to the entire AI Design Department.
 *
 * Core Responsibility:
 * 1. Interview user on tech stack, design style, page hierarchy, and database timing.
 * 2. Enforce exact design / self design rules.
 * 3. Classify intents via InstructionClassifier (preserving precise-change boundaries).
 * 4. Auto-create project in Knowledge Store when requirements crystallize.
 * 5. Track missing items in checklist.json.
 * 6. Initiate orchestrator handoff stub ("department-head.stub") into the live task graph.
 * ==============================================================================
 */

const { SENIOR_CHAT_SYSTEM_PROMPT, SENIOR_CHAT_RESPONSE_SCHEMA } = require('./prompts/senior-chat-prompt');
const { conversationStore } = require('./conversation-store');
const { projectChecklist } = require('./project-checklist');
const { InstructionClassifier } = require('../core/instruction-classifier');
const { KnowledgeStore } = require('../core/knowledge-store');
const { orchestrator } = require('../core/orchestrator');
const { TaskGraph } = require('../core/task-graph');

class SeniorChatAgent {
  /**
   * @param {object} [options]
   * @param {object} [options.aiHandler]
   * @param {object} [options.knowledgeStore]
   */
  constructor(options = {}) {
    this.aiHandler = options.aiHandler || null;
    this.knowledgeStore = options.knowledgeStore || new KnowledgeStore();
    this.classifier = new InstructionClassifier({ aiHandler: this.aiHandler });
    this.orchestrator = options.orchestrator || orchestrator;
    console.log('[SeniorChatAgent] Senior Chat Agent initialized.');
  }

  setAiHandler(handler) {
    this.aiHandler = handler;
    this.classifier.setAiHandler(handler);
  }

  /**
   * Primary entry point: processes incoming user turn and generates agent response.
   * @param {object} params
   * @param {number|string} [params.conversationId]
   * @param {string} params.text
   * @param {Array<{ data: string, mimeType: string, filename?: string }>} [params.images]
   * @returns {Promise<object>}
   */
  async handleUserMessage({ conversationId, text = '', images = [] }) {
    try {
      // 1. Ensure conversation exists
      let convId = conversationId;
      let conv = convId ? conversationStore.getConversation(convId) : null;
      if (!conv) {
        conv = conversationStore.createConversation('New Project Consultation');
        convId = conv.id;
      }

      // 2. Classify user message
      const recentHistory = conversationStore.getRecentHistory(convId, 6);
      const classification = await this.classifier.classify({
        text,
        images,
        recentHistory,
      });

      // 3. Persist incoming user message to SQLite
      const userMsgRecord = conversationStore.addMessage({
        conversationId: convId,
        role: 'user',
        text,
        images,
        intent: classification.intent,
      });

      // 4. Retrieve project knowledge context if conversation is linked
      let projectId = conv.project_id || null;
      let projectData = null;
      let currentMissingItems = [];

      if (projectId) {
        projectData = this.knowledgeStore.getProject(projectId);
        currentMissingItems = projectChecklist.getMissingItems(projectId);
      }

      // 5. Build dynamic system context for AI prompt
      let contextAddition = '';
      if (projectData) {
        contextAddition += `\n\n=== ACTIVE PROJECT CONTEXT (Project #${projectId}: "${projectData.name}") ===\n`;
        contextAddition += `Type: ${projectData.type || 'website'}\n`;
        if (projectData.brief) {
          contextAddition += `Brief Summary: ${projectData.brief.summary || 'In progress'}\n`;
          contextAddition += `Tech Stack: ${projectData.brief.techStack || 'Unspecified'}\n`;
          contextAddition += `Target Audience: ${projectData.brief.targetAudience || 'General'}\n`;
        }
        if (Array.isArray(projectData.pages)) {
          contextAddition += `Pages: ${projectData.pages.map((p) => p.name).join(', ')}\n`;
        }
        if (currentMissingItems.length > 0) {
          contextAddition += `Active Missing Items (${currentMissingItems.length}):\n- ${currentMissingItems.join('\n- ')}\n`;
        } else {
          contextAddition += `Active Missing Items: None. Ready for full execution.\n`;
        }
      } else {
        contextAddition += `\n\n=== CURRENT DISCOVERY STATE ===\nNo project has been initialized yet. Guide the user through the interview (Tech stack, Design direction, Pages, Database timing).\n`;
      }

      contextAddition += `\nInstruction Classifier Assessment:
Intent: ${classification.intent}
Scope: ${classification.scope || 'none'}
Change Targets: ${classification.changeTargets?.join(', ') || 'none'}`;

      const systemInstruction = SENIOR_CHAT_SYSTEM_PROMPT + contextAddition;

      // 6. Build prompt turns
      const fullHistory = conversationStore.getRecentHistory(convId, 20);
      const promptText = `User says: "${text}"\nAttached images count: ${images.length}`;

      // 7. Invoke Multi-Provider AI Engine with Vision & Structured Schema
      let aiResponse = null;
      if (this.aiHandler && typeof this.aiHandler.generate === 'function') {
        try {
          aiResponse = await this.aiHandler.generate({
            prompt: promptText,
            systemInstruction,
            temperature: 0.3,
            images,
            responseSchema: SENIOR_CHAT_RESPONSE_SCHEMA,
            taskProfile: 'reasoning',
          });
        } catch (err) {
          console.warn('[SeniorChatAgent] AI call encountered error:', err.message);
        }
      }

      // 8. Parse structured result or fall back gracefully
      let parsedResult = this.parseAiResponse(aiResponse?.text || aiResponse?.content, text, classification, projectData);

      // 9. Save any attached images as project assets if project is active
      if (projectId && Array.isArray(images) && images.length > 0) {
        for (const img of images) {
          try {
            const buffer = Buffer.from(img.data.replace(/^data:image\/[a-zA-Z+]+;base64,/, ''), 'base64');
            this.knowledgeStore.saveAsset(projectId, {
              filename: img.filename || `ref-${Date.now()}.png`,
              buffer,
              mimeType: img.mimeType || 'image/png',
              description: 'User-provided reference mockup or asset',
              category: 'reference',
            });
            console.log(`[SeniorChatAgent] Saved reference asset to project #${projectId}`);
          } catch (assetErr) {
            console.warn('[SeniorChatAgent] Failed to save asset to knowledge store:', assetErr.message);
          }
        }
      }

      // 10. Handle Precise Changes logging
      if (projectId && classification.intent === 'PRECISE_CHANGE') {
        this.knowledgeStore.logDecision(projectId, {
          decision: `User precise modification: ${text}`,
          rationale: 'Direct user instruction',
          scope: classification.scope || 'component',
          target: classification.changeTargets?.join(', ') || 'ui',
        });
      }

      // 11. Auto-create project if requirements complete and no project exists
      let justCreatedProject = false;
      if (
        !projectId &&
        (parsedResult.interviewState === 'complete' ||
          (parsedResult.extractedData &&
            parsedResult.extractedData.techStack &&
            parsedResult.extractedData.designMode &&
            parsedResult.extractedData.pages?.length > 0))
      ) {
        try {
          const ext = parsedResult.extractedData;
          const projectName = ext.projectName || this.generateProjectName(text);
          const projectType = ext.projectType || 'website';
          const pages = ext.pages && ext.pages.length > 0 ? ext.pages : ['Home', 'About', 'Contact'];

          const newProj = this.knowledgeStore.createProject({
            name: projectName,
            type: projectType,
            description: ext.designDescription || text,
            pages,
            brandArchetype: ext.designMode === 'self-design' ? 'Premium Modern' : 'Custom Matched',
          });

          projectId = newProj.id;
          conversationStore.linkConversationToProject(convId, projectId);
          conversationStore.updateConversationTitle(convId, projectName);

          // Log foundational decisions
          if (ext.techStack) {
            this.knowledgeStore.logDecision(projectId, {
              decision: `Tech Stack selected: ${ext.techStack}`,
              rationale: 'User interview selection',
              scope: 'global',
              target: 'stack',
            });
          }
          if (ext.designMode) {
            this.knowledgeStore.logDecision(projectId, {
              decision: `Design Direction: ${ext.designMode}`,
              rationale: 'User interview selection',
              scope: 'global',
              target: 'design-system',
            });
          }
          if (ext.databaseTiming) {
            this.knowledgeStore.logDecision(projectId, {
              decision: `Database timing: ${ext.databaseTiming}`,
              rationale: 'User interview selection',
              scope: 'global',
              target: 'database',
            });
          }

          // Initialize checklist in project folder
          projectChecklist.initChecklist(projectId, pages, {
            techStack: ext.techStack,
            databaseTiming: ext.databaseTiming,
            projectType,
            features: ext.features,
          });

          // Save attached images to newly created project assets
          if (Array.isArray(images) && images.length > 0) {
            for (const img of images) {
              try {
                const buffer = Buffer.from(img.data.replace(/^data:image\/[a-zA-Z+]+;base64,/, ''), 'base64');
                this.knowledgeStore.saveAsset(projectId, {
                  filename: img.filename || `ref-${Date.now()}.png`,
                  buffer,
                  mimeType: img.mimeType || 'image/png',
                  description: 'Initial design reference',
                  category: 'reference',
                });
              } catch (_) {}
            }
          }

          // Trigger HANDOFF STUB in Orchestrator
          this.triggerDepartmentHeadHandoff(projectId, projectName);

          justCreatedProject = true;
          console.log(`[SeniorChatAgent] Successfully auto-created project #${projectId} ("${projectName}") and triggered handoff!`);
        } catch (createErr) {
          console.error('[SeniorChatAgent] Project auto-creation error:', createErr.message);
        }
      }

      // 12. Refresh Missing Items list
      if (projectId) {
        currentMissingItems = projectChecklist.getMissingItems(projectId);
        parsedResult.missingItems = currentMissingItems;
      }

      // 13. Persist agent message to SQLite
      const agentMsgRecord = conversationStore.addMessage({
        conversationId: convId,
        role: 'agent',
        text: parsedResult.replyToUser,
        intent: parsedResult.intent,
        extracted: {
          ...parsedResult.extractedData,
          missingItems: parsedResult.missingItems,
          suggestions: parsedResult.suggestions || [],
          interviewState: parsedResult.interviewState,
          projectId,
          justCreatedProject,
        },
      });

      const checklistData = projectId ? projectChecklist.getChecklist(projectId) : null;

      return {
        success: true,
        conversationId: convId,
        projectId,
        userMessage: userMsgRecord,
        agentMessage: agentMsgRecord,
        checklist: checklistData,
        missingItems: parsedResult.missingItems || [],
        suggestions: parsedResult.suggestions || [],
        justCreatedProject,
      };
    } catch (err) {
      console.error('[SeniorChatAgent] Critical error in handleUserMessage:', err);
      return {
        success: false,
        error: err.message,
        replyToUser: 'I apologize, but I encountered an unexpected error while processing your request. Please try again or rephrase your message.',
      };
    }
  }

  /**
   * Spawns the Phase 6 Handoff Stub TaskGraph in the live orchestrator.
   * @param {number|string} projectId
   * @param {string} projectName
   */
  triggerDepartmentHeadHandoff(projectId, projectName) {
    try {
      const graphId = `handoff-${projectId}-${Date.now()}`;
      const graph = new TaskGraph({
        id: graphId,
        name: `Handoff: ${projectName}`,
      });

      graph.addNode('dept-head-handoff', {
        handler: 'department-head.stub',
        params: {
          projectId,
          projectName,
        },
      });

      this.orchestrator.runGraph(graph).catch((err) => {
        console.warn('[SeniorChatAgent] Background handoff graph error:', err.message);
      });

      console.log(`[SeniorChatAgent] Launched TaskGraph "${graphId}" for Department Head handoff`);
    } catch (err) {
      console.warn('[SeniorChatAgent] Could not trigger orchestrator handoff:', err.message);
    }
  }

  /**
   * Derives a sensible, professional project name from text.
   * @param {string} text
   */
  generateProjectName(text) {
    const cleaned = (text || '')
      .replace(/build\s+(me\s+)?(a\s+)?/i, '')
      .replace(/create\s+(a\s+)?/i, '')
      .replace(/website|app|ui|portal|dashboard/gi, '')
      .trim();

    if (cleaned.length > 3 && cleaned.length < 30) {
      return cleaned
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
    return `Project ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  /**
   * Parses or generates fallback structured response.
   */
  parseAiResponse(rawText, userText, classification, activeProject) {
    if (rawText) {
      try {
        let jsonStr = rawText.trim();
        const startIdx = jsonStr.indexOf('{');
        const endIdx = jsonStr.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1) {
          jsonStr = jsonStr.substring(startIdx, endIdx + 1);
        }
        const parsed = JSON.parse(jsonStr);
        if (parsed.replyToUser) {
          return {
            replyToUser: parsed.replyToUser,
            intent: parsed.intent || classification.intent.toLowerCase(),
            interviewState: parsed.interviewState || 'gathering',
            extractedData: parsed.extractedData || {},
            missingItems: Array.isArray(parsed.missingItems) ? parsed.missingItems : [],
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
          };
        }
      } catch (e) {
        console.warn('[SeniorChatAgent] Could not parse AI JSON output directly, using fallback wrapper:', e.message);
      }
    }

    // Heuristic conversation flow fallback
    return this.buildConversationalFallback(userText, classification, activeProject);
  }

  /**
   * Generates a warm, professional fallback response strictly following interview protocol.
   */
  buildConversationalFallback(text, classification, activeProject) {
    const lower = (text || '').toLowerCase();

    // If an active project exists
    if (activeProject) {
      if (classification.intent === 'PRECISE_CHANGE') {
        return {
          replyToUser: `Understood! I have logged this precise change for **${activeProject.name}**. Our architectural rule is strict: we will modify only what you specified (${classification.changeTargets?.join(', ') || 'this element'}) and preserve everything else perfectly.`,
          intent: 'precise_change',
          interviewState: 'complete',
          extractedData: { designDescription: text },
          missingItems: projectChecklist.getMissingItems(activeProject.id),
          suggestions: ['Preview changes', 'View checklist', 'Looks good'],
        };
      }

      return {
        replyToUser: `I'm tracking your updates for **${activeProject.name}**. What specific adjustment or new feature would you like to focus on next?`,
        intent: 'general_chat',
        interviewState: 'complete',
        extractedData: {},
        missingItems: projectChecklist.getMissingItems(activeProject.id),
        suggestions: ['Review pages', 'Check design tokens', 'Add another page'],
      };
    }

    // Interview flow for new projects
    const hasStack = /(next\.js|html|css|tailwind|supabase|simple)/i.test(lower);
    const hasDesign = /(you design it|self design|exact|reference|image|my design)/i.test(lower);
    const hasPages = /(home|about|pricing|contact|dashboard|pages)/i.test(lower);
    const hasDbTiming = /(database|after design|now|defer)/i.test(lower);

    if (hasStack && hasDesign && (hasPages || hasDbTiming)) {
      const tech = lower.includes('html') ? 'html-css-js' : 'nextjs-tailwind-shadcn-supabase';
      const mode = lower.includes('you design') ? 'self-design' : 'exact-copy';
      const dbTiming = lower.includes('now') ? 'now' : 'after-design';

      return {
        replyToUser: `Excellent! I have all the requirements needed to initialize your project:
- **Stack:** ${tech === 'html-css-js' ? 'Lightweight HTML/CSS/JS' : 'Next.js + Tailwind CSS + shadcn/ui + Supabase'}
- **Design Direction:** ${mode === 'self-design' ? 'Department Custom Craft' : 'Exact Match to Specification'}
- **Database:** ${dbTiming === 'after-design' ? 'Deferred until visual design approval' : 'Configured up-front'}

I am creating your project in the Knowledge Store and handing off the blueprint to our Department Head!`,
        intent: 'interview_answer',
        interviewState: 'complete',
        extractedData: {
          projectName: this.generateProjectName(text),
          projectType: 'website',
          techStack: tech,
          designMode: mode,
          pages: ['Home', 'About', 'Pricing', 'Contact'],
          databaseTiming: dbTiming,
        },
        missingItems: [],
        suggestions: ['View Task Monitor', 'Check project details', 'Add another page'],
      };
    }

    // Default interview first turn
    return {
      replyToUser: `Welcome to the AI Design Department! I'm your Senior Project Lead. I'm here to understand your vision and orchestrate our entire multi-agent design department for you.

To make sure we build exactly what you need, let's clarify a couple of quick details:

1. **Tech Stack:** Would you like a simple, lightning-fast **HTML/CSS/JS** site, or a modern full-stack application (**Next.js + Tailwind + shadcn + Supabase**)?
2. **Design Direction:** Should our department design a unique, premium aesthetic for you, or do you have a specific design / reference image in mind?
3. **Database Timing:** Would you prefer setting up the database now, or deferring it until after you've approved the visual design?

Feel free to answer naturally or click a suggestion below!`,
      intent: 'new_project',
      interviewState: 'gathering',
      extractedData: {
        projectName: this.generateProjectName(text),
        projectType: 'website',
      },
      missingItems: [
        'Tech stack selection pending',
        'Design direction unconfirmed',
        'Page structure verification',
        'Database setup timing decision',
      ],
      suggestions: [
        'Next.js + Tailwind + Supabase',
        'Simple HTML/CSS/JS',
        'You design it for me',
        'Setup DB after design approval',
      ],
    };
  }
}

const seniorChatAgent = new SeniorChatAgent();

module.exports = {
  SeniorChatAgent,
  seniorChatAgent,
};
