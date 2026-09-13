/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — DESIGN SEED AGENT (agents/design-seed-agent.js)
 * ==============================================================================
 * Agent 3 of 46: Lead Visual Architect & Design Seed Director.
 *
 * Responsibilities:
 * - Generates initial 9-axis design seed upon project handoff
 * - Extracts color palettes, typography, and density metrics in Exact-Copy Mode (R10)
 * - Re-evaluates designs against Anti-Generic craft rules (anti-generic.js)
 * - Regenerates seeds with guaranteed variety (R1) upon user change requests
 * - Persists design-seed.json and design-tokens.json into Knowledge Store
 * ==============================================================================
 */

const { designSeedEngine } = require('../core/design-seed-engine');
const { antiGeneric } = require('../core/anti-generic');
const { knowledgeStore } = require('../core/knowledge-store');
const { agentsRegistry } = require('./agents-registry');

class DesignSeedAgent {
  constructor(options = {}) {
    this.aiHandler = options.aiHandler || null;
    this.knowledgeStore = options.knowledgeStore || knowledgeStore;
  }

  setAiHandler(aiHandler) {
    this.aiHandler = aiHandler;
  }

  /**
   * Generates or regenerates a 9-axis design seed for a project.
   * @param {number|string} projectId
   * @param {object} [options]
   * @param {boolean} [options.regenerate=false]
   * @param {string} [options.feedback]
   * @returns {Promise<object>} Complete seed and tokens result
   */
  async generateSeed(projectId, options = {}) {
    const isRegen = Boolean(options.regenerate);
    const feedback = options.feedback || '';

    agentsRegistry.setActivity('agent-3-design-seed', `Generating ${isRegen ? 'fresh' : 'initial'} 9-axis design seed for project #${projectId}`);
    agentsRegistry.logAction('agent-3-design-seed', `${isRegen ? 'Regenerating' : 'Formulating'} 9-axis design seed`);

    let project = null;
    let brief = null;
    try {
      project = this.knowledgeStore.getProject(projectId);
      brief = this.knowledgeStore.getBrief(projectId);
    } catch (_) {}

    const projectName = brief?.projectName || project?.name || `Project #${projectId}`;
    const designMode = brief?.designMode || 'self-design';
    const isExact = designMode.includes('exact');

    let seed;
    if (this.aiHandler) {
      try {
        const { DESIGN_SEED_SYSTEM_PROMPT, DESIGN_SEED_RESPONSE_SCHEMA, buildDesignSeedUserPrompt } = require('./prompts/design-seed-prompt');
        let userPrompt = buildDesignSeedUserPrompt({ projectId, projectName, brief });
        if (isRegen && feedback) {
          userPrompt += `\n\nUSER FEEDBACK / CHANGE REQUEST: "${feedback}". Please provide a distinctly different aesthetic direction addressing this feedback.`;
        }

        const response = await this.aiHandler.generate({
          systemInstruction: DESIGN_SEED_SYSTEM_PROMPT,
          prompt: userPrompt,
          taskProfile: 'reasoning',
          responseSchema: DESIGN_SEED_RESPONSE_SCHEMA,
          temperature: isRegen ? 0.6 : 0.3,
          maxTokens: 3000,
        });

        if (response && response.success && (response.parsed || response.text)) {
          seed = response.parsed || JSON.parse(response.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim());
          seed.seedId = `seed-${projectId}-${Date.now().toString(36)}`;
          seed.projectId = projectId;
          seed.generatedAt = new Date().toISOString();
        }
      } catch (aiErr) {
        console.warn('[DesignSeedAgent] AI seed generation fallback to rule engine:', aiErr.message);
      }
    }

    if (!seed) {
      seed = designSeedEngine.generateDeterministicSeed(projectId, projectName, brief, isRegen);
    }

    // Exact-Copy Mode overrides (R10)
    if (isExact) {
      seed.conceptName = `Exact Specification Match • ${seed.typography?.displayFont || 'Precision'}`;
      seed.philosophy = `Strict 1:1 implementation matching user provided mockup reference without unsolicited deviation.`;
    }

    // Validate anti-generic compliance
    const report = antiGeneric.validateSeed(seed);
    if (!report.valid) {
      seed = antiGeneric.autoCorrectSeed(seed);
    }

    // Compile and save tokens
    const tokens = designSeedEngine.compileTokensFromSeed(seed);
    this.knowledgeStore.saveSeed(projectId, seed);
    this.knowledgeStore.saveTokens(projectId, tokens, isRegen ? 'Seed regeneration (R1)' : 'Initial seed generation');

    // Log decision in Knowledge Store
    this.knowledgeStore.logDecision(projectId, {
      decision: `Design Seed formulated: ${seed.conceptName} (${seed.colorDirection?.name || 'Custom Palette'}, ${seed.typography?.displayFont || 'Outfit'})`,
      rationale: isRegen ? `User requested regeneration: ${feedback || 'New variety seed'}` : 'Initial visual direction synthesis',
      scope: 'global',
      target: 'design-tokens',
    });

    agentsRegistry.setActivity('agent-3-design-seed', `Design seed active: "${seed.conceptName}"`);
    agentsRegistry.logAction('agent-3-design-seed', `Published design-seed.json & design-tokens.json for project #${projectId}`);

    return {
      success: true,
      seed,
      tokens,
      compliance: report,
    };
  }

  /**
   * Retrieves current seed from Knowledge Store.
   * @param {number|string} projectId
   */
  getSeed(projectId) {
    return this.knowledgeStore.getSeed(projectId);
  }

  /**
   * Runs anti-generic validation report on existing seed.
   * @param {number|string} projectId
   */
  getAntiGenericReport(projectId) {
    const seed = this.knowledgeStore.getSeed(projectId);
    return antiGeneric.validateSeed(seed);
  }
}

const designSeedAgent = new DesignSeedAgent();

module.exports = {
  DesignSeedAgent,
  designSeedAgent,
};
