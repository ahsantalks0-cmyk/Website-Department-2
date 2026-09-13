/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — INSTRUCTION CLASSIFIER (core/instruction-classifier.js)
 * ==============================================================================
 * Classifies every user message to establish architectural intent and enforce the
 * "precise-instruction" rule.
 *
 * Intents:
 * - FULL_REQUEST: user wants a brand-new website or full UI
 * - PRECISE_CHANGE: user requests a surgical modification to an existing element
 * - DESIGN_DESCRIPTION: user describes desired aesthetic/layout in detail
 * - DESIGN_REFERENCE: user provides reference images or mockups
 * - INTERVIEW_ANSWER: user is answering an interview question (tech stack, pages, etc.)
 * - QUESTION: user is asking an informational or technical question
 * - GENERAL_CHAT: greetings, pleasantries, or general remarks
 *
 * Output: { intent, confidence, scope, changeTargets }
 * ==============================================================================
 */

class InstructionClassifier {
  /**
   * @param {object} [options]
   * @param {object} [options.aiHandler]
   */
  constructor(options = {}) {
    this.aiHandler = options.aiHandler || null;
  }

  setAiHandler(handler) {
    this.aiHandler = handler;
  }

  /**
   * Classifies a user's incoming message.
   * @param {object} params
   * @param {string} params.text
   * @param {Array} [params.images]
   * @param {Array} [params.recentHistory]
   * @returns {Promise<{ intent: string, confidence: number, scope: 'global'|'page'|'component'|null, changeTargets: string[], raw?: any }>}
   */
  async classify({ text = '', images = [], recentHistory = [] }) {
    const trimmed = (text || '').trim();
    const hasImages = Array.isArray(images) && images.length > 0;

    // Fast-path heuristic detection if AI isn't configured
    const fallback = this.heuristicClassify(trimmed, hasImages);

    if (!this.aiHandler || typeof this.aiHandler.generate !== 'function') {
      console.log(`[InstructionClassifier] Heuristic classification: ${fallback.intent} (AI handler unavailable)`);
      return fallback;
    }

    const systemInstruction = `You are the Instruction Classifier for an AI Design Department.
Your job is to classify the user's message into one of these exact intents:
- FULL_REQUEST: User wants an entire new website, app, or UI built from scratch.
- PRECISE_CHANGE: User wants ONE specific modification to an existing UI element (e.g., "make buttons pill-shaped", "change header color to navy", "increase padding on cards").
- DESIGN_DESCRIPTION: User is describing an aesthetic, color scheme, typography style, or layout structure.
- DESIGN_REFERENCE: User is sharing or pointing to an image/mockup/reference design.
- INTERVIEW_ANSWER: User is answering a clarifying interview question (tech stack, pages list, database timing, etc.).
- QUESTION: User is asking an informational or technical question.
- GENERAL_CHAT: Greetings, conversational remarks, thanks, confirmations.

Crucial Scope Rule for PRECISE_CHANGE:
- Scope MUST be 'component' if modifying specific buttons/cards/headers.
- Scope MUST be 'page' if modifying a whole page layout.
- Scope MUST be 'global' if altering brand-wide tokens.
- Identify changeTargets (e.g., ["button.border-radius", "button.background"]).

Respond with ONLY this JSON schema:
{
  "intent": "FULL_REQUEST" | "PRECISE_CHANGE" | "DESIGN_DESCRIPTION" | "DESIGN_REFERENCE" | "INTERVIEW_ANSWER" | "QUESTION" | "GENERAL_CHAT",
  "confidence": 0.0 to 1.0,
  "scope": "global" | "page" | "component" | null,
  "changeTargets": ["string"]
}`;

    const promptText = `User message: "${trimmed}"\nHas attached reference images: ${hasImages}\nRecent context summary: ${recentHistory.slice(-2).map((m) => `${m.role}: ${m.text.slice(0, 100)}`).join(' | ')}`;

    try {
      const response = await this.aiHandler.generate({
        prompt: promptText,
        systemInstruction,
        taskProfile: 'cheap',
        temperature: 0.1,
        responseSchema: {
          type: 'object',
          properties: {
            intent: {
              type: 'string',
              enum: [
                'FULL_REQUEST',
                'PRECISE_CHANGE',
                'DESIGN_DESCRIPTION',
                'DESIGN_REFERENCE',
                'INTERVIEW_ANSWER',
                'QUESTION',
                'GENERAL_CHAT',
              ],
            },
            confidence: { type: 'number' },
            scope: { type: 'string', enum: ['global', 'page', 'component'] },
            changeTargets: { type: 'array', items: { type: 'string' } },
          },
          required: ['intent', 'confidence'],
        },
      });

      const responseText = response?.data?.text || response?.text || '';
      if (response && response.success && responseText) {
        let parsed;
        try {
          parsed = JSON.parse(responseText);
        } catch (_) {
          const match = responseText.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        }

        if (parsed && parsed.intent) {
          const result = {
            intent: parsed.intent,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
            scope: parsed.scope || null,
            changeTargets: Array.isArray(parsed.changeTargets) ? parsed.changeTargets : [],
          };
          console.log(`[InstructionClassifier] AI classified: "${result.intent}" (scope: ${result.scope || 'none'}, targets: ${result.changeTargets.join(', ') || 'none'})`);
          return result;
        }
      }

      return fallback;
    } catch (err) {
      console.warn('[InstructionClassifier] AI classification failed, using heuristic fallback:', err.message);
      return fallback;
    }
  }

  /**
   * Deterministic rule-based fallback classification.
   * @param {string} text
   * @param {boolean} hasImages
   */
  heuristicClassify(text, hasImages) {
    const lower = (text || '').toLowerCase();

    if (hasImages && (!text || text.length < 50)) {
      return { intent: 'DESIGN_REFERENCE', confidence: 0.9, scope: 'global', changeTargets: [] };
    }

    if (/^(hi|hello|hey|salam|namaste|good\s(morning|evening|afternoon)|sup)\b/i.test(lower) && lower.length < 30) {
      return { intent: 'GENERAL_CHAT', confidence: 0.9, scope: null, changeTargets: [] };
    }

    if (/^(make|change|update|fix|remove|add|shrink|enlarge|turn)\s+(the\s+)?(button|color|font|border|margin|padding|navbar|header|footer|hero)/i.test(lower)) {
      const targets = [];
      if (lower.includes('button')) targets.push('button');
      if (lower.includes('color')) targets.push('color');
      if (lower.includes('font')) targets.push('typography');
      if (lower.includes('border') || lower.includes('round')) targets.push('border-radius');
      return {
        intent: 'PRECISE_CHANGE',
        confidence: 0.85,
        scope: targets.length > 0 ? 'component' : 'page',
        changeTargets: targets,
      };
    }

    if (
      /(next\.js|html|css|tailwind|supabase|you design it|self design|exact copy|after design|now|defer|database|pages|home|pricing|about)/i.test(lower) &&
      lower.length < 120
    ) {
      return { intent: 'INTERVIEW_ANSWER', confidence: 0.85, scope: 'global', changeTargets: [] };
    }

    if (/(build|create|make|design|generate|develop)\s+(me\s+)?(a|an)?\s+(website|landing|dashboard|app|portfolio|store|saas)/i.test(lower)) {
      return { intent: 'FULL_REQUEST', confidence: 0.9, scope: 'global', changeTargets: [] };
    }

    if (/(how|what|why|can you|explain|tell me|where)/i.test(lower) && lower.includes('?')) {
      return { intent: 'QUESTION', confidence: 0.85, scope: null, changeTargets: [] };
    }

    if (/(dark mode|minimalist|glass|neon|modern|sleek|luxury|typography|palette)/i.test(lower)) {
      return { intent: 'DESIGN_DESCRIPTION', confidence: 0.8, scope: 'global', changeTargets: [] };
    }

    return { intent: 'GENERAL_CHAT', confidence: 0.7, scope: null, changeTargets: [] };
  }
}

module.exports = {
  InstructionClassifier,
};
