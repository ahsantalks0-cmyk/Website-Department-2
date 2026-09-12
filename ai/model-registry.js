/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — MODEL REGISTRY (ai/model-registry.js)
 * ==============================================================================
 * Central model routing and task profile management.
 * Future agents request capabilities by profile name ("cheap", "reasoning", etc.)
 * rather than hardcoded model identifiers.
 * Overrides are persisted in the SQLite settings table.
 * ==============================================================================
 */

class ModelRegistry {
  constructor() {
    // Known models catalog (editable & extensible)
    this.models = {
      'gemini-2.5-flash-lite': {
        id: 'gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash Lite',
        description: 'Fast, cost-efficient, high-volume generation for rapid drafts & structured JSON.',
        strengths: ['speed', 'cost', 'formatting'],
      },
      'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Balanced multimodal model with strong reasoning, code generation, and vision analysis.',
        strengths: ['reasoning', 'coding', 'multimodal'],
      },
    };

    // Task profile defaults
    this.profiles = {
      cheap: 'gemini-2.5-flash-lite',
      reasoning: 'gemini-2.5-flash',
      vision: 'gemini-2.5-flash',
      structured: 'gemini-2.5-flash-lite',
    };

    this.profileDescriptions = {
      cheap: 'Simple content drafts, micro-copy, taglines, and repetitive formatting.',
      reasoning: 'Complex design architectures, component logic, CSS layouts, and heuristics.',
      vision: 'Visual hierarchy inspection, screenshot analysis, and reference design critique.',
      structured: 'Strict JSON schemas, token generation, and structured design seeds.',
    };

    this.db = null;
  }

  /**
   * Initializes profiles from the SQLite settings store.
   * @param {import('better-sqlite3').Database} db
   */
  initFromDb(db) {
    this.db = db;
    if (!this.db) return;

    try {
      const row = this.db.prepare("SELECT value FROM settings WHERE key = 'ai_task_profiles'").get();
      if (row && row.value) {
        const saved = JSON.parse(row.value);
        if (typeof saved === 'object' && saved !== null) {
          this.profiles = {
            ...this.profiles,
            ...saved,
          };
        }
      }
    } catch (err) {
      console.warn('[ModelRegistry] Could not load persisted task profiles:', err.message);
    }
  }

  /**
   * Saves current task profiles mapping into SQLite settings.
   */
  persistProfiles() {
    if (!this.db) return;
    try {
      this.db
        .prepare(
          `
        INSERT INTO settings (key, value)
        VALUES ('ai_task_profiles', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `
        )
        .run(JSON.stringify(this.profiles));
    } catch (err) {
      console.error('[ModelRegistry] Error persisting task profiles:', err.message);
    }
  }

  /**
   * Resolves a task profile or model name to a valid model ID.
   * Defaults to the "cheap" profile if unrecognized.
   *
   * @param {string} [profileName='cheap']
   * @returns {string} Model identifier (e.g. "gemini-2.5-flash-lite")
   */
  getModelForProfile(profileName = 'cheap') {
    if (!profileName) profileName = 'cheap';
    if (this.profiles[profileName]) {
      return this.profiles[profileName];
    }
    // If the input is already a registered model ID, return it directly
    if (this.models[profileName]) {
      return profileName;
    }
    return this.profiles.cheap || 'gemini-2.5-flash-lite';
  }

  /**
   * Returns all profiles with descriptions and currently bound models.
   * @returns {Array<{profile: string, model: string, description: string}>}
   */
  getProfiles() {
    return Object.keys(this.profiles).map((key) => ({
      profile: key,
      model: this.profiles[key],
      description: this.profileDescriptions[key] || '',
    }));
  }

  /**
   * Updates the model assigned to a task profile.
   *
   * @param {string} profileName
   * @param {string} modelId
   * @returns {boolean}
   */
  setProfile(profileName, modelId) {
    if (!profileName || !modelId) return false;
    this.profiles[profileName] = modelId.trim();
    this.persistProfiles();
    return true;
  }

  /**
   * Returns known models catalog.
   * @returns {Array<{id: string, name: string, description: string}>}
   */
  getAvailableModels() {
    return Object.values(this.models);
  }

  /**
   * Registers a dynamically discovered or custom model ID.
   * @param {string} modelId
   * @param {object} [metadata]
   */
  registerModel(modelId, metadata = {}) {
    if (!modelId) return;
    const cleanId = modelId.replace(/^models\//, '');
    this.models[cleanId] = {
      id: cleanId,
      name: metadata.name || cleanId,
      description: metadata.description || 'Custom / Dynamic Gemini model',
      strengths: metadata.strengths || [],
    };
  }
}

module.exports = {
  ModelRegistry,
};
