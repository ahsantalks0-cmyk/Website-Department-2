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
   */
  initialize() {
    if (this.isInitialized) return;

    const db = getDb();
    if (db) {
      this.registry.initFromDb(db);
      this.queue.setDb(db);
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
    const db = getDb();
    if (!db) {
      return { success: false, error: 'Database connection unavailable' };
    }

    try {
      const encrypted = this.encryptValue(key);
      db.prepare(
        `
        INSERT INTO settings (key, value)
        VALUES ('gemini_api_key', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `
      ).run(encrypted);

      this.provider.setApiKey(key);
      return { success: true };
    } catch (err) {
      console.error('[AIHandler] Failed to persist API key:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Wires all IPC endpoints requested by Phase 3 architecture.
   */
  registerIpcHandlers() {
    // 1. ai:getStatus -> { configured: boolean }
    ipcMain.handle('ai:getStatus', async () => {
      const apiKey = this.provider.getApiKey();
      return {
        configured: Boolean(apiKey && apiKey.length > 5),
      };
    });

    // 2. ai:saveApiKey -> { success: boolean, error?: string }
    ipcMain.handle('ai:saveApiKey', async (_event, key) => {
      return this.saveApiKey(key);
    });

    // 3. ai:testConnection -> { success: boolean, models: string[], error?: string }
    ipcMain.handle('ai:testConnection', async () => {
      const apiKey = this.provider.getApiKey();
      if (!apiKey) {
        return {
          success: false,
          error: 'Please add your Google AI Studio API key first',
          models: [],
        };
      }

      const res = await this.provider.testConnection();
      if (res.success && Array.isArray(res.models)) {
        // Register any discovered models into registry
        res.models.forEach((modelId) => {
          this.registry.registerModel(modelId);
        });
      }
      return res;
    });

    // 4. ai:generate -> { success: boolean, data?: object, error?: string }
    ipcMain.handle('ai:generate', async (_event, params = {}) => {
      const apiKey = this.provider.getApiKey();
      if (!apiKey) {
        return {
          success: false,
          error: 'Please add your Google AI Studio API key first',
        };
      }

      const taskProfile = params.taskProfile || 'cheap';
      const resolvedModel = params.model || this.registry.getModelForProfile(taskProfile);

      // Route through concurrency & rate-limiting queue
      return this.queue.enqueue(
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
    });

    // 5. ai:getUsageStats -> { requestsToday: number, tokensToday: number }
    ipcMain.handle('ai:getUsageStats', async () => {
      return this.queue.getTodayUsage();
    });

    // 6. ai:getProfiles -> Array<{ profile, model, description }>
    ipcMain.handle('ai:getProfiles', async () => {
      return {
        profiles: this.registry.getProfiles(),
        availableModels: this.registry.getAvailableModels(),
      };
    });

    // 7. ai:setProfile -> { success: boolean, error?: string }
    ipcMain.handle('ai:setProfile', async (_event, payload = {}) => {
      const { profile, model } = payload;
      if (!profile || !model) {
        return { success: false, error: 'Profile and model are required.' };
      }
      const success = this.registry.setProfile(profile, model);
      return { success };
    });
  }
}

// Singleton instance
const aiHandler = new AIHandler();

module.exports = {
  AIHandler,
  aiHandler,
};
