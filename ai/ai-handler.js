/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — AI IPC HANDLER (ai/ai-handler.js)
 * ==============================================================================
 * Central coordinator wiring Electron Main Process, SQLite encrypted settings,
 * Model Registry, Gemini Provider, and Request Queue.
 *
 * Exposes secure IPC channels strictly adhering to contextIsolation:
 * - ai:getStatus
 * - ai:saveApiKey
 * - ai:testConnection
 * - ai:generate
 * - ai:getUsageStats
 * - ai:getProfiles
 * - ai:setProfile
 * ==============================================================================
 */

const { ipcMain, safeStorage } = require('electron');
const { GeminiProvider } = require('./gemini-provider');
const { ModelRegistry } = require('./model-registry');
const { RequestQueue } = require('./request-queue');
const { getDb } = require('../db/database');

class AIHandler {
  constructor() {
    this.provider = new GeminiProvider();
    this.registry = new ModelRegistry();
    this.queue = new RequestQueue();
    this.isInitialized = false;
  }

  /**
   * Initializes the AI subsystem with database references, stored encrypted
   * API key, and task profile bindings.
   * @param {object} [dbInstance] Optional direct SQLite database instance
   */
  initialize(dbInstance) {
    if (this.isInitialized) return;

    const db = dbInstance || getDb();
    if (db) {
      console.log('[AIHandler] Attaching database to ModelRegistry and RequestQueue...');
      this.registry.initFromDb(db);
      this.queue.setDb(db);
    } else {
      console.warn('[AIHandler] SQLite database instance is not available during initialize.');
    }

    // Load and decrypt stored Gemini API key
    this.loadStoredApiKey();

    // Register IPC listeners
    this.registerIpcHandlers();

    this.isInitialized = true;
    console.log('[AIHandler] Phase 3 Model Adapter subsystem initialized successfully.');
  }

  /**
   * Encrypts a string using safeStorage if available, falling back to base64 encoding.
   * @param {string} plaintext
   * @returns {string} Encrypted string encoded in base64
   */
  encryptValue(plaintext) {
    if (!plaintext) return '';
    try {
      if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
        const encryptedBuffer = safeStorage.encryptString(plaintext);
        return `enc:${encryptedBuffer.toString('base64')}`;
      }
    } catch (err) {
      console.warn('[AIHandler] safeStorage encryption failed, using fallback base64:', err.message);
    }
    return `b64:${Buffer.from(plaintext, 'utf-8').toString('base64')}`;
  }

  /**
   * Decrypts a previously encrypted key string.
   * @param {string} cipherText
   * @returns {string}
   */
  decryptValue(cipherText) {
    if (!cipherText || typeof cipherText !== 'string') return '';
    try {
      if (cipherText.startsWith('enc:')) {
        const rawBase64 = cipherText.slice(4);
        const buffer = Buffer.from(rawBase64, 'base64');
        if (safeStorage && typeof safeStorage.decryptString === 'function') {
          return safeStorage.decryptString(buffer);
        }
      } else if (cipherText.startsWith('b64:')) {
        return Buffer.from(cipherText.slice(4), 'base64').toString('utf-8');
      } else {
        // Raw or legacy value fallback
        return cipherText;
      }
    } catch (err) {
      console.error('[AIHandler] Failed to decrypt stored value:', err.message);
      return '';
    }
    return '';
  }

  /**
   * Loads stored API key from SQLite settings table and provides it to GeminiProvider.
   */
  loadStoredApiKey() {
    const db = getDb();
    let key = '';

    if (db) {
      try {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
        if (row && row.value) {
          key = this.decryptValue(row.value);
        }
      } catch (err) {
        console.error('[AIHandler] Error loading API key from SQLite:', err.message);
      }
    }

    if (!key && process.env.GEMINI_API_KEY) {
      key = process.env.GEMINI_API_KEY;
    }

    if (key) {
      this.provider.setApiKey(key);
      console.log('[AIHandler] API key loaded into Gemini provider securely.');
    }
  }

  /**
   * Saves and securely stores the API key into SQLite.
   * @param {string} rawKey
   * @returns {{success: boolean, error?: string}}
   */
  saveApiKey(rawKey) {
    const key = (rawKey || '').trim();
    if (!key) {
      return { success: false, error: 'Please enter a valid API key.' };
    }

    const db = getDb();
    if (!db) {
      console.error('[AIHandler] Cannot save API key: SQLite database unavailable.');
      return { success: false, error: 'Database connection unavailable' };
    }

    try {
      const encrypted = this.encryptValue(key);
      db.prepare(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('gemini_api_key', ?)`
      ).run(encrypted);

      this.provider.setApiKey(key);
      console.log('[AIHandler] Gemini API key saved to SQLite and provider updated successfully.');
      return { success: true };
    } catch (err) {
      console.error('[AIHandler] Failed to persist API key to SQLite:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Wires all IPC endpoints requested by Phase 3 architecture.
   * Every handler is wrapped in a try/catch and always returns a valid object
   * to guarantee the renderer promise never hangs.
   */
  registerIpcHandlers() {
    console.log('[AIHandler] Registering IPC channels: ai:getStatus, ai:saveApiKey, ai:testConnection, ai:generate, ai:getUsageStats, ai:getProfiles, ai:setProfile');

    // 1. ai:getStatus -> { configured: boolean, error?: string }
    ipcMain.handle('ai:getStatus', async () => {
      try {
        const apiKey = this.provider.getApiKey();
        const configured = Boolean(apiKey && apiKey.length > 5);
        console.log('[AIHandler IPC] ai:getStatus -> configured:', configured);
        return { configured };
      } catch (err) {
        console.error('[AIHandler IPC] ai:getStatus error:', err.message);
        return { configured: false, error: err.message };
      }
    });

    // 2. ai:saveApiKey -> { success: boolean, error?: string }
    ipcMain.handle('ai:saveApiKey', async (_event, key) => {
      try {
        console.log('[AIHandler IPC] ai:saveApiKey received request');
        const res = this.saveApiKey(key);
        console.log('[AIHandler IPC] ai:saveApiKey completed with result:', res);
        return res;
      } catch (err) {
        console.error('[AIHandler IPC] ai:saveApiKey error:', err.message);
        return { success: false, error: err.message };
      }
    });

    // 3. ai:testConnection -> { success: boolean, models: string[], error?: string }
    ipcMain.handle('ai:testConnection', async () => {
      try {
        console.log('[AIHandler IPC] ai:testConnection started');
        const apiKey = this.provider.getApiKey();
        if (!apiKey) {
          console.log('[AIHandler IPC] ai:testConnection: No API key set');
          return {
            success: false,
            error: 'Please add your Google AI Studio API key first',
            models: [],
          };
        }

        const res = await this.provider.testConnection();
        console.log(
          '[AIHandler IPC] ai:testConnection completed:',
          res.success ? `Success (${res.models ? res.models.length : 0} models)` : `Failed: ${res.error}`
        );

        if (res && res.success && Array.isArray(res.models)) {
          res.models.forEach((modelId) => {
            this.registry.registerModel(modelId);
          });
        }
        return res || { success: false, error: 'Empty test connection response', models: [] };
      } catch (err) {
        console.error('[AIHandler IPC] ai:testConnection unexpected error:', err.message);
        return { success: false, error: err.message, models: [] };
      }
    });

    // 4. ai:generate -> { success: boolean, data?: object, error?: string }
    ipcMain.handle('ai:generate', async (_event, params = {}) => {
      try {
        console.log('[AIHandler IPC] ai:generate invoked with profile:', params?.taskProfile || 'cheap');
        const apiKey = this.provider.getApiKey();
        if (!apiKey) {
          return {
            success: false,
            error: 'Please add your Google AI Studio API key first',
          };
        }

        const taskProfile = params?.taskProfile || 'cheap';
        const resolvedModel = params?.model || this.registry.getModelForProfile(taskProfile);

        const res = await this.queue.enqueue(
          (signal) =>
            this.provider.generate({
              ...params,
              model: resolvedModel,
              signal,
            }),
          {
            model: resolvedModel,
            profile: taskProfile,
          }
        );
        console.log('[AIHandler IPC] ai:generate execution finished:', res?.success ? 'Success' : `Error: ${res?.error}`);
        return res || { success: false, error: 'No response returned from model execution' };
      } catch (err) {
        console.error('[AIHandler IPC] ai:generate unexpected error:', err.message);
        return { success: false, error: err.message };
      }
    });

    // 5. ai:getUsageStats -> { requestsToday: number, tokensToday: number, error?: string }
    ipcMain.handle('ai:getUsageStats', async () => {
      try {
        const stats = await this.queue.getTodayUsage();
        return stats || { requestsToday: 0, tokensToday: 0 };
      } catch (err) {
        console.error('[AIHandler IPC] ai:getUsageStats error:', err.message);
        return { requestsToday: 0, tokensToday: 0, error: err.message };
      }
    });

    // 6. ai:getProfiles -> { profiles: Array, availableModels: Array, error?: string }
    ipcMain.handle('ai:getProfiles', async () => {
      try {
        return {
          profiles: this.registry.getProfiles() || [],
          availableModels: this.registry.getAvailableModels() || [],
        };
      } catch (err) {
        console.error('[AIHandler IPC] ai:getProfiles error:', err.message);
        return { profiles: [], availableModels: [], error: err.message };
      }
    });

    // 7. ai:setProfile -> { success: boolean, error?: string }
    ipcMain.handle('ai:setProfile', async (_event, payload = {}) => {
      try {
        const { profile, model } = payload || {};
        if (!profile || !model) {
          return { success: false, error: 'Profile and model are required.' };
        }
        const success = this.registry.setProfile(profile, model);
        console.log(`[AIHandler IPC] ai:setProfile (${profile} -> ${model}) result:`, success);
        return { success };
      } catch (err) {
        console.error('[AIHandler IPC] ai:setProfile error:', err.message);
        return { success: false, error: err.message };
      }
    });

    console.log('[AIHandler] All AI IPC handlers registered successfully.');
  }
}

// Singleton instance
const aiHandler = new AIHandler();

/**
 * Explicit helper function to register handlers and initialize subsystem
 * with the established SQLite database.
 * @param {object} [db]
 */
function registerAiHandlers(db) {
  aiHandler.initialize(db);
}

module.exports = {
  AIHandler,
  aiHandler,
  registerAiHandlers,
};
