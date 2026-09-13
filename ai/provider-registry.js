/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — PROVIDER REGISTRY (ai/provider-registry.js)
 * ==============================================================================
 * Provider factory, lifecycle orchestrator, and per-provider state manager.
 * Wires Google, OpenAI, Anthropic, and Groq with SQLite settings persistence.
 * ==============================================================================
 */

const { GeminiProvider } = require('./providers/gemini-provider');
const { OpenAIProvider } = require('./providers/openai-provider');
const { AnthropicProvider } = require('./providers/anthropic-provider');
const { GroqProvider } = require('./providers/groq-provider');

const PROVIDER_DEFS = [
  { id: 'google', name: 'Google (Gemini)', ProviderClass: GeminiProvider, envKey: 'GEMINI_API_KEY' },
  { id: 'openai', name: 'OpenAI', ProviderClass: OpenAIProvider, envKey: 'OPENAI_API_KEY' },
  { id: 'anthropic', name: 'Anthropic (Claude)', ProviderClass: AnthropicProvider, envKey: 'ANTHROPIC_API_KEY' },
  { id: 'groq', name: 'Groq (Fast Inference)', ProviderClass: GroqProvider, envKey: 'GROQ_API_KEY' },
];

class ProviderRegistry {
  /**
   * @param {object} [options]
   * @param {import('better-sqlite3').Database} [options.db]
   * @param {Function} [options.decryptFn]
   * @param {Function} [options.encryptFn]
   */
  constructor(options = {}) {
    this.db = options.db || null;
    this.decryptFn = options.decryptFn || ((val) => val);
    this.encryptFn = options.encryptFn || ((val) => val);

    // Initialize provider instances
    this.instances = new Map();
    for (const def of PROVIDER_DEFS) {
      this.instances.set(def.id, new def.ProviderClass());
    }

    this.activeProviderId = 'google';
  }

  /**
   * Binds SQLite database and cryptography functions.
   * @param {import('better-sqlite3').Database} db
   * @param {Function} decryptFn
   * @param {Function} encryptFn
   */
  init(db, decryptFn, encryptFn) {
    this.db = db;
    if (decryptFn) this.decryptFn = decryptFn;
    if (encryptFn) this.encryptFn = encryptFn;

    this.loadStateFromDb();
  }

  /**
   * Loads active provider and API keys from SQLite settings table.
   */
  loadStateFromDb() {
    if (!this.db) return;

    try {
      // 1. Load active provider
      const activeRow = this.db.prepare("SELECT value FROM settings WHERE key = 'active_provider'").get();
      if (activeRow && activeRow.value && this.instances.has(activeRow.value)) {
        this.activeProviderId = activeRow.value;
      }
      console.log(`Active provider restored: ${this.activeProviderId}`);

      // 2. Load API keys for each provider
      for (const def of PROVIDER_DEFS) {
        let key = '';

        // Check new per-provider key: api_key_google, api_key_openai, etc.
        const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(`api_key_${def.id}`);
        if (row && row.value) {
          key = this.decryptFn(row.value);
        }

        // Backward compatibility for google: check 'gemini_api_key'
        if (!key && def.id === 'google') {
          const legacyRow = this.db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
          if (legacyRow && legacyRow.value) {
            key = this.decryptFn(legacyRow.value);
          }
        }

        // Fallback to environment variable
        if (!key && def.envKey && process.env[def.envKey]) {
          key = process.env[def.envKey];
        }

        if (key) {
          const instance = this.instances.get(def.id);
          if (instance) {
            instance.setApiKey(key);
            console.log(`API key loaded for provider ${def.id} on startup`);
          }
        }
      }

      // 3. Restore active model for active provider
      const activeModel = this.getActiveModel(this.activeProviderId);
      if (activeModel) {
        console.log(`Active model restored: ${activeModel}`);
      } else if (this.activeProviderId === 'google') {
        const defaultGoogleModel = 'gemini-2.0-flash';
        this.setActiveModel('google', defaultGoogleModel);
        console.log(`Active model restored: ${defaultGoogleModel}`);
      }
    } catch (err) {
      console.error('[ProviderRegistry] Failed to load state from SQLite:', err.message);
    }
  }

  /**
   * Returns list of supported providers with configured status and active model.
   * @returns {Array<{id: string, name: string, configured: boolean, activeModel: string|null}>}
   */
  getProviders() {
    return PROVIDER_DEFS.map((def) => {
      const instance = this.instances.get(def.id);
      const key = instance ? instance.getApiKey() : '';
      const configured = Boolean(key && key.trim().length > 3);
      const activeModel = this.getActiveModel(def.id);

      return {
        id: def.id,
        name: def.name,
        configured,
        activeModel,
      };
    });
  }

  /**
   * Gets specific provider instance by ID.
   * @param {string} providerId
   * @returns {import('./provider').AIProvider | null}
   */
  getProvider(providerId) {
    const id = (providerId || '').toLowerCase();
    return this.instances.get(id) || null;
  }

  /**
   * Returns current active provider instance.
   * @returns {import('./provider').AIProvider}
   */
  getActiveProvider() {
    return this.getProvider(this.activeProviderId) || this.instances.get('google');
  }

  /**
   * Returns active provider ID.
   * @returns {string}
   */
  getActiveProviderId() {
    return this.activeProviderId;
  }

  /**
   * Switches active provider and persists to SQLite.
   * @param {string} providerId
   * @returns {boolean}
   */
  setActiveProvider(providerId) {
    const id = (providerId || '').toLowerCase();
    if (!this.instances.has(id)) {
      console.warn(`[ProviderRegistry] Unknown provider ID "${providerId}", rejected.`);
      return false;
    }

    this.activeProviderId = id;
    console.log(`[ProviderRegistry] Provider selected: "${id}"`);

    if (this.db) {
      try {
        this.db
          .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_provider', ?)")
          .run(id);
      } catch (err) {
        console.error('[ProviderRegistry] Error persisting active_provider:', err.message);
      }
    }
    return true;
  }

  /**
   * Retrieves active/selected model for a provider from SQLite settings.
   * @param {string} providerId
   * @returns {string|null}
   */
  getActiveModel(providerId) {
    const id = (providerId || this.activeProviderId || 'google').toLowerCase();
    if (this.db) {
      try {
        const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(`active_model_${id}`);
        if (row && row.value && row.value.trim()) {
          return row.value.trim();
        }
      } catch (err) {
        console.error(`[ProviderRegistry] Error reading active_model_${id}:`, err.message);
      }
    }
    return null;
  }

  /**
   * Sets active model for a provider and persists to SQLite settings.
   * @param {string} providerId
   * @param {string} modelId
   * @returns {boolean}
   */
  setActiveModel(providerId, modelId) {
    const pId = (providerId || this.activeProviderId || 'google').toLowerCase();
    const mId = (modelId || '').trim();
    if (!mId) return false;

    console.log(`[ProviderRegistry] Model selected for ${pId}: "${mId}"`);

    if (this.db) {
      try {
        this.db
          .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run(`active_model_${pId}`, mId);
        return true;
      } catch (err) {
        console.error(`[ProviderRegistry] Error saving active_model_${pId}:`, err.message);
        return false;
      }
    }
    return true;
  }

  /**
   * Saves API key for a provider into memory and encrypted SQLite settings.
   * @param {string} providerId
   * @param {string} rawKey
   * @returns {{success: boolean, error?: string}}
   */
  saveApiKey(providerId, rawKey) {
    const pId = (providerId || this.activeProviderId || 'google').toLowerCase();
    const instance = this.instances.get(pId);
    if (!instance) {
      return { success: false, error: `Invalid provider ID: ${pId}` };
    }

    const key = (rawKey || '').trim();
    if (!key) {
      return { success: false, error: 'API key cannot be empty.' };
    }

    instance.setApiKey(key);

    if (this.db) {
      try {
        const encrypted = this.encryptFn(key);
        this.db
          .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run(`api_key_${pId}`, encrypted);

        // Keep legacy gemini_api_key in sync for google
        if (pId === 'google') {
          this.db
            .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_api_key', ?)")
            .run(encrypted);
        }

        // Verify write by reading back immediately
        const verifyRow = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(`api_key_${pId}`);
        if (!verifyRow || !verifyRow.value) {
          throw new Error(`Immediate verification failed for api_key_${pId}`);
        }

        console.log(`API key saved for provider ${pId}`);
      } catch (err) {
        console.error(`[ProviderRegistry] Error saving encrypted key for ${pId}:`, err.message);
        return { success: false, error: `Storage failure: ${err.message}` };
      }
    } else {
      console.log(`API key saved for provider ${pId}`);
    }

    return { success: true };
  }
}

module.exports = {
  ProviderRegistry,
  PROVIDER_DEFS,
};
