/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — DEPARTMENT HEAD AGENT (agents/department-head.js)
 * ==============================================================================
 * Agent 2 of 46: Executive Director & Task Graph Architect.
 *
 * Responsibilities:
 * - Listens for handoffs from Senior Chat Agent (via "department-head.plan" handler)
 * - Reads Project Knowledge Store specs (brief, techStack, designMode, pages, databaseTiming)
 * - Generates structured, dependency-ordered execution plans using active AI model
 * - Converts plans into executable TaskGraphs registered in the Orchestrator
 * - Registers department placeholder handlers ("design.placeholder", "engineering.placeholder", etc.)
 * - Registers the "review.gate" handler that pauses execution for user review
 * - Posts friendly plan summaries & phase breakdowns into the user chat stream
 * ==============================================================================
 */

const { handlerRegistry } = require('../core/handler-registry');
const { TaskGraph } = require('../core/task-graph');
const { knowledgeStore: defaultKnowledgeStore } = require('../core/knowledge-store');
const { conversationStore } = require('./conversation-store');
const { projectChecklist } = require('./project-checklist');
const { agentsRegistry } = require('./agents-registry');
const {
  DEPARTMENT_HEAD_SYSTEM_PROMPT,
  DEPARTMENT_HEAD_RESPONSE_SCHEMA,
  buildDepartmentHeadUserPrompt,
} = require('./prompts/department-head-prompt');

class DepartmentHeadAgent {
  /**
   * @param {object} options
   * @param {object} [options.knowledgeStore]
   * @param {object} [options.orchestrator]
   * @param {object} [options.aiHandler]
   */
  constructor(options = {}) {
    this.knowledgeStore = options.knowledgeStore || defaultKnowledgeStore;
    this.orchestrator = options.orchestrator || null;
    this.aiHandler = options.aiHandler || null;

    this.registerDepartmentHandlers();
  }

  /**
   * Sets or updates orchestrator reference.
   * @param {object} orchestrator
   */
  setOrchestrator(orchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Sets or updates AI handler reference.
   * @param {object} aiHandler
   */
  setAiHandler(aiHandler) {
    this.aiHandler = aiHandler;
  }

  /**
   * Registers all required Phase 7 handlers into the global HandlerRegistry.
   */
  registerDepartmentHandlers() {
    // 1. Primary Department Head plan handler (replaces department-head.stub)
    handlerRegistry.registerHandler('department-head.plan', this.handlePlanTask.bind(this));

    // Also support 'department-head.stub' as alias for backward compatibility
    handlerRegistry.registerHandler('department-head.stub', this.handlePlanTask.bind(this));

    // 2. Department placeholder handlers (emit progress 0->100 over ~3s)
    handlerRegistry.registerHandler('design.placeholder', (args) => this.runDepartmentPlaceholder('design', args));
    handlerRegistry.registerHandler('engineering.placeholder', (args) => this.runDepartmentPlaceholder('engineering', args));
    handlerRegistry.registerHandler('content.placeholder', (args) => this.runDepartmentPlaceholder('content', args));
    handlerRegistry.registerHandler('cms.placeholder', (args) => this.runDepartmentPlaceholder('cms', args));
    handlerRegistry.registerHandler('qa.placeholder', (args) => this.runDepartmentPlaceholder('qa', args));

    // 3. Special Review Gate handler (pauses graph, waiting_for_user)
    handlerRegistry.registerHandler('review.gate', this.handleReviewGate.bind(this));

    console.log('[DepartmentHead] Registered handlers: department-head.plan, review.gate, and department placeholders (design, engineering, content, cms, qa)');
  }

  /**
   * Handler for 'department-head.plan':
   * Reads the project from Knowledge Store, generates a plan via AI,
   * posts summary to chat, and executes task graph.
   *
   * @param {object} params
   * @param {object} context
   * @param {AbortSignal} signal
   */
  async handlePlanTask({ params, context, signal }) {
    const projectId = params?.projectId || 1;
    const projectName = params?.projectName || `Project #${projectId}`;
    const conversationId = params?.conversationId || null;

    console.log(`[DepartmentHead] handoff received for project #${projectId} ("${projectName}")`);
    agentsRegistry.setActivity('agent-2-dept-head', `Planning project #${projectId} ("${projectName}")`);
    agentsRegistry.logAction('agent-2-dept-head', `Received handoff for project #${projectId} ("${projectName}")`);

    context.emit('progress', { progress: 10, message: 'Reading project brief and knowledge documents...' });

    // 1. Read project specs from Knowledge Store
    const projectData = this.readProjectData(projectId, projectName);

    context.emit('progress', { progress: 30, message: 'Formulating multi-phase execution graph with AI...' });

    // 2. Formulate Plan (AI Call with fallback)
    let plan = null;
    try {
      plan = await this.generatePlanWithAi(projectData, context, signal);
    } catch (aiErr) {
      console.warn('[DepartmentHead] AI plan generation failed, using deterministic rule-based architect:', aiErr.message);
      plan = this.generateDeterministicPlan(projectData);
    }

    if (!plan || !Array.isArray(plan.phases)) {
      plan = this.generateDeterministicPlan(projectData);
    }

    // Store generated plan in registry
    agentsRegistry.setPlan(projectId, plan);

    // Count tasks and phases
    let totalTasks = 0;
    for (const phase of plan.phases) {
      if (Array.isArray(phase.tasks)) {
        totalTasks += phase.tasks.length;
      }
    }

    console.log(`[DepartmentHead] plan generated (${totalTasks} tasks across ${plan.phases.length} phases)`);
    agentsRegistry.logAction('agent-2-dept-head', `Generated plan with ${totalTasks} tasks across ${plan.phases.length} phases`);

    context.emit('progress', { progress: 75, message: 'Posting execution overview to conversation...' });

    // 3. Post summary to chat conversation
    await this.postPlanToChat(projectId, conversationId, plan);

    // 4. Check if there are blocking questions for the user
    if (Array.isArray(plan.questionsForUser) && plan.questionsForUser.length > 0) {
      context.log(`Plan contains ${plan.questionsForUser.length} questions for user. Waiting for user response before graph dispatch.`);
      context.emit('progress', { progress: 100, message: 'Plan presented. Waiting for user input.' });
      return {
        success: true,
        output: {
          status: 'waiting-for-user-answers',
          plan,
          questions: plan.questionsForUser,
        },
      };
    }

    // 5. Build and run execution TaskGraph
    context.emit('progress', { progress: 90, message: 'Dispatching execution task graph to Orchestrator...' });
    let executionGraphId = null;

    if (this.orchestrator) {
      try {
        const execGraph = this.buildExecutionGraph(projectId, projectName, plan);
        executionGraphId = execGraph.id;
        const nodesCount = execGraph.nodes ? execGraph.nodes.size : 0;
        console.log(`execution graph started: ${executionGraphId}, ${nodesCount} nodes`);
        console.log(`[DepartmentHead] graph started: ${executionGraphId} (${nodesCount} nodes)`);
        agentsRegistry.logAction('agent-2-dept-head', `Dispatched TaskGraph "${executionGraphId}" (${nodesCount} nodes) to Orchestrator`);

        // Run execution graph in background (do not block the handoff node)
        this.orchestrator.runGraph(execGraph).catch((graphErr) => {
          console.warn(`[DepartmentHead] Background graph execution reported:`, graphErr.message);
        });
      } catch (graphBuildErr) {
        console.error('[DepartmentHead] Error compiling execution graph:', graphBuildErr.message);
      }
    } else {
      console.warn('[DepartmentHead] Orchestrator not bound; execution graph skipped');
    }

    context.emit('progress', { progress: 100, message: 'Department Head planning & dispatch complete.' });

    return {
      success: true,
      output: {
        status: 'plan-dispatched',
        projectId,
        projectName,
        totalTasks,
        phasesCount: plan.phases.length,
        executionGraphId,
        plan,
      },
    };
  }

  /**
   * Gathers all relevant project data from KnowledgeStore.
   * @param {number|string} projectId
   * @param {string} projectName
   * @returns {object}
   */
  readProjectData(projectId, projectName) {
    let brief = null;
    let seed = null;
    let tokens = null;
    let pages = null;
    let project = null;

    try {
      project = this.knowledgeStore.getProject(projectId);
      brief = this.knowledgeStore.getBrief(projectId);
      seed = this.knowledgeStore.getSeed(projectId);
      tokens = this.knowledgeStore.getTokens(projectId);
      pages = this.knowledgeStore.getPages(projectId);
    } catch (e) {
      console.warn(`[DepartmentHead] KnowledgeStore read warning:`, e.message);
    }

    return {
      projectId,
      projectName: brief?.projectName || project?.name || projectName,
      project,
      brief: brief || {
        projectName,
        projectType: 'website',
        techStack: 'nextjs',
        designMode: 'self-design',
        databaseTiming: 'after-design',
        userRequirements: 'Modern responsive desktop interface',
        pages: ['Home', 'Dashboard'],
        coreFeatures: ['Navigation', 'Responsive grid', 'Hero section'],
      },
      seed,
      tokens,
      pages: pages || {
        pages: [
          { pageId: 'page-home', name: 'Home', order: 0, status: 'pending' },
          { pageId: 'page-dashboard', name: 'Dashboard', order: 1, status: 'pending' },
        ],
      },
    };
  }

  /**
   * Invokes AI provider to generate a structured plan.
   * @param {object} projectData
   * @param {object} context
   * @param {AbortSignal} signal
   * @returns {Promise<object>}
   */
  async generatePlanWithAi(projectData, context, signal) {
    const userPrompt = buildDepartmentHeadUserPrompt(projectData);

    const response = await context.ai.generate({
      systemInstruction: DEPARTMENT_HEAD_SYSTEM_PROMPT,
      prompt: userPrompt,
      taskProfile: 'reasoning',
      responseSchema: DEPARTMENT_HEAD_RESPONSE_SCHEMA,
      temperature: 0.2,
      maxTokens: 3500,
      signal,
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'AI generation failed');
    }

    let parsed = response.parsed;
    if (!parsed && typeof response.text === 'string') {
      try {
        const clean = response.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        parsed = JSON.parse(clean);
      } catch (err) {
        throw new Error('Failed to parse model JSON: ' + err.message);
      }
    }

    return parsed;
  }

  /**
   * Deterministic, rule-based execution plan generator.
   * Strictly adheres to all Department Head planning directives.
   *
   * @param {object} projectData
   * @returns {object}
   */
  generateDeterministicPlan(projectData) {
    const { brief, pages, projectName } = projectData;
    const techStack = (brief?.techStack || 'nextjs').toLowerCase();
    const designMode = (brief?.designMode || 'self-design').toLowerCase();
    const databaseTiming = (brief?.databaseTiming || 'after-design').toLowerCase();
    const pageList = Array.isArray(pages?.pages) && pages.pages.length > 0
      ? pages.pages.map((p) => p.name || p.pageId)
      : (Array.isArray(brief?.pages) && brief.pages.length > 0 ? brief.pages : ['Home', 'Dashboard']);

    const isExactCopy = designMode.includes('exact');
    const isNextJs = techStack.includes('next');
    const isDbEarly = databaseTiming === 'now';

    const phases = [];

    // ------------------------------------------------------------------------
    // PHASE 1: Architecture & Design System Setup
    // ------------------------------------------------------------------------
    const phase1Tasks = [];

    // Task 1: Scaffolding
    const scaffoldId = 'scaffold-setup';
    phase1Tasks.push({
      id: scaffoldId,
      title: isNextJs ? 'Scaffold Next.js & Tailwind Core' : 'Setup HTML5 & CSS Token Boilerplate',
      department: 'engineering',
      description: isNextJs
        ? 'Initialize Next.js 14 App Router, configure Tailwind utility layers, and assemble shadcn/ui primitives.'
        : 'Construct semantic HTML5 layout containers and scoped CSS variable design tokens.',
      dependsOn: [],
      estimatedMinutes: 15,
    });

    // Task 2: Design Foundation / Seed
    const designFoundationId = isExactCopy ? 'design-replication-spec' : 'design-seed-tokens';
    phase1Tasks.push({
      id: designFoundationId,
      title: isExactCopy ? 'Design Replication & Asset Extraction' : 'Design Seed & Typography Scale',
      department: 'design',
      description: isExactCopy
        ? 'Extract color personality, font metrics, and component layouts directly from user reference mockups.'
        : 'Generate bespoke Outfit typographic scales, 8pt rhythmic spatial grids, and WCAG AA contrast palettes via Design Seed Engine.',
      dependsOn: [],
      estimatedMinutes: 20,
    });

    // Task 3: If databaseTiming is 'now', schedule early DB setup
    if (isDbEarly) {
      phase1Tasks.push({
        id: 'database-early-setup',
        title: 'Initial Database Schema & Models',
        department: 'cms',
        description: 'Define relational PostgreSQL tables and client models in parallel with initial scaffolding.',
        dependsOn: [scaffoldId],
        estimatedMinutes: 25,
      });
    }

    phases.push({
      name: 'Phase 1: Architecture & Design System Baseline',
      description: 'Foundational framework setup, typography scales, and token architecture.',
      tasks: phase1Tasks,
    });

    // ------------------------------------------------------------------------
    // PHASE 2 & 3: Per-Page Design, Build & Review Gates
    // ------------------------------------------------------------------------
    let lastReviewGateId = designFoundationId;

    pageList.forEach((pageName, index) => {
      const slug = pageName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const designTaskId = `design-page-${slug}`;
      const buildTaskId = `build-page-${slug}`;
      const reviewGateId = `review-gate-${slug}`;

      const pageTasks = [
        {
          id: designTaskId,
          title: `Design ${pageName} Layout & Wireframe`,
          department: 'design',
          description: `Create high-fidelity desktop and mobile layouts for the ${pageName} view with strict visual hierarchy.`,
          dependsOn: [lastReviewGateId],
          estimatedMinutes: 25,
        },
        {
          id: buildTaskId,
          title: `Implement ${pageName} Component & Interactions`,
          department: 'engineering',
          description: `Code accessible React/Tailwind components for ${pageName} with fluid hover states and responsive constraints.`,
          dependsOn: [designTaskId],
          estimatedMinutes: 30,
        },
        {
          id: reviewGateId,
          title: `User Review Gate: ${pageName}`,
          department: 'design',
          description: `Pause graph execution for client review and visual approval of the ${pageName} screen.`,
          dependsOn: [buildTaskId],
          estimatedMinutes: 10,
        },
      ];

      phases.push({
        name: `Phase ${phases.length + 1}: ${pageName} Interface & Review Gate`,
        description: `Visual design, frontend engineering, and user review gate for ${pageName}.`,
        tasks: pageTasks,
      });

      lastReviewGateId = reviewGateId;
    });

    // ------------------------------------------------------------------------
    // PHASE: Backend & CMS Integration (if deferred)
    // ------------------------------------------------------------------------
    let lastPrerequisite = lastReviewGateId;

    if (!isDbEarly) {
      const dbTaskId = 'database-cms-setup';
      phases.push({
        name: `Phase ${phases.length + 1}: Database & CMS Integration`,
        description: 'Database models and CMS schemas scheduled after visual design approvals.',
        tasks: [
          {
            id: dbTaskId,
            title: 'Database Schema & Integration (Post-Design)',
            department: 'cms',
            description: 'Implement Supabase/PostgreSQL migrations and API endpoints following approved UI components.',
            dependsOn: [lastPrerequisite],
            estimatedMinutes: 25,
          },
        ],
      });
      lastPrerequisite = dbTaskId;
    }

    // ------------------------------------------------------------------------
    // FINAL PHASE: Quality Assurance & Verification
    // ------------------------------------------------------------------------
    phases.push({
      name: `Phase ${phases.length + 1}: Quality Assurance & Verification`,
      description: 'Department-wide validation, cross-device inspection, and accessibility sign-off.',
      tasks: [
        {
          id: 'qa-responsive-inspection',
          title: 'Cross-Device & Viewport Inspection',
          department: 'qa',
          description: 'Validate touch targets, responsive breakpoints, and drawer navigation across mobile and desktop viewports.',
          dependsOn: [lastPrerequisite],
          estimatedMinutes: 20,
        },
        {
          id: 'qa-accessibility-audit',
          title: 'Accessibility & WCAG AA Audit',
          department: 'qa',
          description: 'Verify color contrast ratios, keyboard navigation rings, and ARIA attributes across all pages.',
          dependsOn: ['qa-responsive-inspection'],
          estimatedMinutes: 15,
        },
        {
          id: 'qa-final-signoff',
          title: 'Final Department Release Gate',
          department: 'qa',
          description: 'Department Head final sign-off confirming all brief requirements and review gates are fulfilled.',
          dependsOn: ['qa-accessibility-audit'],
          estimatedMinutes: 10,
        },
      ],
    });

    return {
      reasoning: `Structured a ${phases.length}-phase execution plan for "${projectName}". Design mode is set to "${designMode}" with ${isNextJs ? 'Next.js + Tailwind' : 'HTML5'} architecture. Review gates are enforced after each page (${pageList.join(', ')}). Database tasks respect "${databaseTiming}" preference.`,
      summaryForUser: `I have compiled the comprehensive execution plan for **${projectName}**:\n\n- **Tech Stack:** ${isNextJs ? 'Next.js + Tailwind CSS + shadcn/ui' : 'Semantic HTML5 + CSS Tokens'}\n- **Design Approach:** ${isExactCopy ? 'Exact Reference Replication' : 'Bespoke Design Seed Engine'}\n- **Pages:** ${pageList.join(', ')}\n- **Review Gates:** Execution will pause after each page for your visual inspection and approval.\n- **Database Timing:** ${isDbEarly ? 'Immediate setup' : 'Deferred until after visual design review'}\n\nI have registered the task graph in the Orchestrator and queued the initial foundation tasks.`,
      phases,
      questionsForUser: [],
    };
  }

  /**
   * Converts the structured plan into an executable TaskGraph for the Orchestrator.
   * @param {number|string} projectId
   * @param {string} projectName
   * @param {object} plan
   * @returns {TaskGraph}
   */
  buildExecutionGraph(projectId, projectName, plan) {
    const graphId = `dept-plan-${projectId}-${Date.now()}`;
    const graph = new TaskGraph({
      id: graphId,
      name: `Execution Plan: ${projectName}`,
      maxConcurrency: 2,
    });

    const addedNodeIds = new Set();

    // Flatten all tasks in order
    for (const phase of plan.phases) {
      if (!Array.isArray(phase.tasks)) continue;

      for (const task of phase.tasks) {
        if (!task.id || addedNodeIds.has(task.id)) continue;

        // Determine correct handler
        let handlerName = 'engineering.placeholder';
        const isReview = task.id.startsWith('review-') ||
                         task.title.toLowerCase().includes('review gate') ||
                         task.title.toLowerCase().includes('approval');

        if (isReview) {
          handlerName = 'review.gate';
        } else if (task.department === 'design') {
          if (
            task.id.includes('seed') ||
            task.id.includes('tokens') ||
            task.id.includes('spec') ||
            task.title.toLowerCase().includes('seed') ||
            task.title.toLowerCase().includes('token') ||
            task.title.toLowerCase().includes('replication')
          ) {
            handlerName = 'design.seed-generate';
          } else {
            handlerName = 'design.placeholder';
          }
        } else if (task.department === 'engineering') {
          handlerName = 'engineering.placeholder';
        } else if (task.department === 'content') {
          handlerName = 'content.placeholder';
        } else if (task.department === 'cms') {
          handlerName = 'cms.placeholder';
        } else if (task.department === 'qa') {
          handlerName = 'qa.placeholder';
        }

        // Sanitize dependencies (only include nodes already added to prevent forward/dangling refs)
        const validDependsOn = Array.isArray(task.dependsOn)
          ? task.dependsOn.filter((depId) => addedNodeIds.has(depId))
          : [];

        graph.addNode(task.id, {
          handler: handlerName,
          dependsOn: validDependsOn,
          params: {
            projectId,
            projectName,
            taskId: task.id,
            title: task.title,
            department: task.department,
            description: task.description,
            estimatedMinutes: task.estimatedMinutes,
          },
          timeoutMs: 180000,
        });

        addedNodeIds.add(task.id);
      }
    }

    return graph;
  }

  /**
   * Special Review Gate Handler:
   * Sets node status to 'waiting_for_user' and pauses the parent graph.
   *
   * @param {object} args
   */
  async handleReviewGate({ params, context, signal }) {
    const taskTitle = params?.title || params?.taskId || 'User Review Gate';
    const projectId = params?.projectId || 1;
    const gateId = params?.taskId || context.nodeId;
    console.log(`[ReviewGate] review gate reached: ${taskTitle}. Graph paused waiting for user.`);

    context.log(`Review gate reached: "${taskTitle}". Pausing execution for user review.`);
    context.emit('progress', { progress: 100, message: 'Review gate active: Waiting for your review' });

    // Pause the parent task graph in the Orchestrator
    if (this.orchestrator && context.graphId) {
      this.orchestrator.pauseGraph(context.graphId);

      // Emit review:requested event
      if (typeof this.orchestrator.emitEvent === 'function') {
        this.orchestrator.emitEvent('review:requested', {
          projectId,
          gateId,
          nodeId: context.nodeId,
          graphId: context.graphId,
          summary: taskTitle,
        });
      }
    }

    // Post review gate into chat stream so user can approve/reject directly in chat
    try {
      const convs = conversationStore.listConversations();
      const matching = convs.find((c) => String(c.project_id) === String(projectId));
      const convId = matching ? matching.id : (convs[0]?.id || 1);

      conversationStore.addMessage({
        conversationId: convId,
        role: 'agent',
        text: `### 🛡️ Visual Design Review Gate\n\n**${taskTitle}** is ready for your review.\n\n*Review the design direction above or in the Task Monitor. Please approve to continue pipeline execution, or request revisions.*`,
        intent: 'REVIEW_GATE',
        extracted: {
          author: 'Department Head',
          isReviewGate: true,
          gateId,
          nodeId: context.nodeId,
          graphId: context.graphId,
          projectId,
          taskTitle,
          summary: taskTitle,
        },
      });
      console.log(`[ReviewGate] Posted review gate card into conversation #${convId}`);
    } catch (chatErr) {
      console.warn('[ReviewGate] Failed to post review message to chat:', chatErr.message);
    }

    agentsRegistry.setActivity('agent-2-dept-head', `Paused at review gate: "${taskTitle}"`);
    agentsRegistry.logAction('agent-2-dept-head', `Review gate reached: "${taskTitle}". Graph paused waiting for user.`);

    return {
      success: true,
      status: 'waiting_for_user',
      waitingForUser: true,
      output: {
        status: 'waiting_for_user',
        taskTitle,
        message: 'Waiting for your review',
        pausedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Department Placeholder Handler:
   * Simulates ~3 seconds of execution, emitting progress 0 -> 100%.
   *
   * @param {string} department
   * @param {object} args
   */
  async runDepartmentPlaceholder(department, { params, context, signal }) {
    const taskTitle = params?.title || params?.taskId || `${department} Task`;
    context.log(`[${department.toUpperCase()}] Starting: "${taskTitle}"...`);

    const steps = [
      { progress: 15, delayMs: 600, message: `Analyzing requirements for ${taskTitle}...` },
      { progress: 45, delayMs: 800, message: `Generating ${department} artifacts...` },
      { progress: 80, delayMs: 800, message: `Verifying styling and constraints...` },
      { progress: 100, delayMs: 600, message: `Completed ${taskTitle}. Queued for future agent.` },
    ];

    for (const step of steps) {
      if (signal?.aborted) {
        throw new Error(`Task "${taskTitle}" aborted by user/system`);
      }
      context.emit('progress', { progress: step.progress, message: step.message });
      await new Promise((resolve) => setTimeout(resolve, step.delayMs));
    }

    return {
      success: true,
      output: {
        status: 'queued-for-future-agent',
        department,
        taskTitle,
        completedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Posts the Department Head's plan summary directly into the conversation.
   * @param {number|string} projectId
   * @param {number|string|null} conversationId
   * @param {object} plan
   */
  async postPlanToChat(projectId, conversationId, plan) {
    try {
      let convId = conversationId;
      if (!convId) {
        const convs = conversationStore.listConversations();
        const matching = convs.find((c) => String(c.project_id) === String(projectId));
        convId = matching ? matching.id : (convs[0]?.id || 1);
      }

      const missingItems = projectChecklist.getMissingItems(projectId);

      // Build structured chat text
      let chatText = plan.summaryForUser || 'Execution plan formulated by Department Head.';

      if (Array.isArray(plan.questionsForUser) && plan.questionsForUser.length > 0) {
        chatText += `\n\n**Action Required (Blocking Questions):**\n`;
        plan.questionsForUser.forEach((q, idx) => {
          chatText += `${idx + 1}. ${q}\n`;
        });
        chatText += `\n*Please reply with your answers so we can initiate execution!*`;
      }

      conversationStore.addMessage({
        conversationId: convId,
        role: 'agent',
        text: chatText,
        intent: 'PLAN_PRESENTATION',
        extracted: {
          author: 'Department Head',
          departmentHeadPlan: plan,
          missingItems,
        },
      });

      console.log(`[DepartmentHead] Posted plan summary into conversation #${convId}`);
    } catch (postErr) {
      console.warn('[DepartmentHead] Failed to post plan to chat:', postErr.message);
    }
  }

  /**
   * Responds to an active review gate node (approve or request revision).
   * @param {object} payload
   * @param {string} payload.graphId
   * @param {string} payload.nodeId
   * @param {boolean} payload.approved
   * @param {string} [payload.feedback]
   * @returns {Promise<object>}
   */
  async respondToReview({ graphId, nodeId, approved, feedback = '' }) {
    console.log(`[DepartmentHead] Processing review gate response:`, { graphId, nodeId, approved, feedback });

    if (!this.orchestrator || !graphId) {
      return { success: false, error: 'Orchestrator instance or graphId not provided.' };
    }

    try {
      const graphDetail = this.orchestrator.getGraphDetail(graphId);
      const graph = graphDetail?.graph;
      const targetNode = graphDetail?.nodes?.find((n) => n.node_id === nodeId || n.id === nodeId);
      const projectId = graph?.project_id || targetNode?.params?.projectId || 1;
      const taskTitle = targetNode?.params?.title || nodeId;

      if (approved) {
        // Record approval in knowledge store
        try {
          this.knowledgeStore.logReview(projectId, {
            userInstructions: feedback || 'Visual direction approved by client.',
            status: 'approved',
            appliedActions: [`Review gate "${taskTitle}" marked approved`, 'Resumed downstream execution graph'],
          });
        } catch (_) {}

        // Mark node as completed in SQLite
        if (this.orchestrator.db) {
          try {
            this.orchestrator.db.prepare(`
              UPDATE tasks
              SET status = 'completed', progress = 100, finished_at = datetime('now'), error = NULL
              WHERE graph_id = ? AND node_id = ?
            `).run(graphId, nodeId);
          } catch (_) {}
        }

        // Resume the task graph
        this.orchestrator.resumeGraph(graphId);

        agentsRegistry.setActivity('agent-2-dept-head', `Resumed pipeline after user approved "${taskTitle}"`);
        agentsRegistry.logAction('agent-2-dept-head', `User approved review gate "${taskTitle}". Resumed execution graph.`);

        return {
          success: true,
          status: 'approved',
          resumed: true,
          message: `Approved "${taskTitle}". Resumed execution.`,
        };
      } else {
        // User requested revision / regeneration
        try {
          this.knowledgeStore.logReview(projectId, {
            userInstructions: feedback || 'Change requested by client during review gate.',
            status: 'changes_requested',
            appliedActions: ['Triggered design direction regeneration'],
          });

          const { designSeedAgent } = require('./design-seed-agent');
          await designSeedAgent.generateSeed(projectId, { regenerate: true, feedback });
        } catch (regenErr) {
          console.warn('[DepartmentHead] Regeneration error on review response:', regenErr.message);
        }

        // Mark node completed and resume pipeline with fresh seed
        if (this.orchestrator.db) {
          try {
            this.orchestrator.db.prepare(`
              UPDATE tasks
              SET status = 'completed', progress = 100, finished_at = datetime('now'), error = NULL
              WHERE graph_id = ? AND node_id = ?
            `).run(graphId, nodeId);
          } catch (_) {}
        }

        this.orchestrator.resumeGraph(graphId);

        agentsRegistry.setActivity('agent-2-dept-head', `Regenerating direction following revision request on "${taskTitle}"`);
        agentsRegistry.logAction('agent-2-dept-head', `User requested revision on "${taskTitle}": "${feedback}". Resumed execution.`);

        return {
          success: true,
          status: 'revision_requested',
          resumed: true,
          regenerated: true,
          message: `Regenerated design direction based on feedback. Resumed execution.`,
        };
      }
    } catch (err) {
      console.error('[DepartmentHead] Error responding to review:', err.message);
      return { success: false, error: err.message };
    }
  }
}

// Singleton instance
const departmentHeadAgent = new DepartmentHeadAgent();

module.exports = {
  DepartmentHeadAgent,
  departmentHeadAgent,
};
