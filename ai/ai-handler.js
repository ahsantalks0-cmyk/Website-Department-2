/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — MULTI-PROVIDER AI IPC HANDLER (ai/ai-handler.js)
 * ==============================================================================
 * Central coordinator wiring Electron Main Process, SQLite encrypted settings,
 * Multi-Provider Registry, Model Discovery Service, Pricing Metadata, and Request Queue.
 *
 * Exposes secure IPC channels:
 * - ai:getProviders
 * - ai:selectProvider
 * - ai:saveApiKey
 * - ai:testConnection
 * - ai:refreshModels
 * - ai:selectModel
 * - ai:generate
 * - ai:getActiveConfig
 * - ai:getUsageStats
 * ==============================================================================
 */

let ipcMain = null;
let safeStorage = null;
if (process.versions && process.versions.electron) {
  try {
    const electron = require('electron');
    ipcMain = electron?.ipcMain;
    safeStorage = electron?.safeStorage;
  } catch (e) {
    // Fallback
  }
}
const { ProviderRegistry } = require('./provider-registry');
const { ModelService } = require('./model-service');
const { RequestQueue } = require('./request-queue');
const { getModelPricing } = require('./pricing-metadata');
const { getDb } = require('../db/database');

class AIHandler {
  constructor() {
    this.registry = new ProviderRegistry({
      decryptFn: (v) => this.decryptValue(v),
      encryptFn: (v) => this.encryptValue(v),
    });
    this.modelService = new ModelService({ registry: this.registry });
    this.queue = new RequestQueue();
    this.isInitialized = false;
  }

  /**
   * Initializes the AI subsystem with database references and starts background auto-refresh.
   * @param {object} [dbInstance]
   */
  initialize(dbInstance) {
    if (this.isInitialized) return;

    const db = dbInstance || getDb();
    if (db) {
      console.log('[AIHandler] Attaching SQLite database to ProviderRegistry, ModelService, and RequestQueue...');
      this.registry.init(db, (v) => this.decryptValue(v), (v) => this.encryptValue(v));
      this.modelService.setDb(db);
      this.queue.setDb(db);
      this.modelService.startAutoRefresh();
    } else {
      console.warn('[AIHandler] SQLite database instance is not available during initialize.');
    }

    // Register IPC listeners
    this.registerIpcHandlers();

    this.isInitialized = true;
    console.log('[AIHandler] Multi-provider AI subsystem initialized successfully.');
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
        return cipherText;
      }
    } catch (err) {
      console.error('[AIHandler] Failed to decrypt stored value:', err.message);
      return '';
    }
    return '';
  }

  /**
   * Wires all IPC endpoints for multi-provider live model architecture.
   */
  registerIpcHandlers() {
    console.log('[AIHandler] Registering multi-provider IPC channels...');

    // 1. ai:getProviders -> [{ id, name, configured, activeModel }]
    ipcMain.handle('ai:getProviders', async () => {
      try {
        const providers = this.registry.getProviders();
        return providers;
      } catch (err) {
        console.error('[AIHandler IPC] ai:getProviders error:', err.message);
        return [];
      }
    });

    // 2. ai:selectProvider(id) -> { success, configured, activeModel, models }
    ipcMain.handle('ai:selectProvider', async (_event, providerId) => {
      try {
        console.log(`[AIHandler IPC] Provider selected: "${providerId}"`);
        const success = this.registry.setActiveProvider(providerId);
        if (!success) {
          return { success: false, error: `Invalid provider ID: ${providerId}` };
        }

        const provider = this.registry.getProvider(providerId);
        const apiKey = provider ? provider.getApiKey() : '';
        const configured = Boolean(apiKey && apiKey.trim().length > 3);
        const activeModel = this.registry.getActiveModel(providerId);
        const cachedModels = this.modelService.getCachedModels(providerId);

        return {
          success: true,
          configured,
          activeModel,
          models: cachedModels,
        };
      } catch (err) {
        console.error('[AIHandler IPC] ai:selectProvider error:', err.message);
        return { success: false, error: err.message };
      }
    });

    // 3. ai:saveApiKey(provider, key) -> { success, error?: string }
    ipcMain.handle('ai:saveApiKey', async (_event, providerIdOrKey, maybeKey) => {
      try {
        let providerId = providerIdOrKey;
        let key = maybeKey;

        // Backward compatibility: if single argument passed, assume active provider
        if (maybeKey === undefined) {
          key = providerIdOrKey;
          providerId = this.registry.getActiveProviderId();
        }

        console.log(`[AIHandler IPC] Key saved for provider: "${providerId}"`);
        const result = this.registry.saveApiKey(providerId, key);
        return result;
      } catch (err) {
        console.error('[AIHandler IPC] ai:saveApiKey error:', err.message);
        return { success: false, error: err.message };
      }
    });

    // 4. ai:testConnection(provider) -> { success, models[], error } (returns LIVE models)
    ipcMain.handle('ai:testConnection', async (_event, maybeProviderId) => {
      try {
        const providerId = maybeProviderId || this.registry.getActiveProviderId();
        console.log(`[AIHandler IPC] Testing connection for provider "${providerId}"...`);

        const provider = this.registry.getProvider(providerId);
        if (!provider || !provider.getApiKey()) {
          return {
            success: false,
            error: `Please enter and save your ${provider ? provider.name : 'AI'} API key first.`,
            models: [],
          };
        }

        // Live API call: validates key AND fetches fresh live models
        const result = await this.modelService.fetchModels(providerId);
        console.log(`[AIHandler IPC] Connection test for "${providerId}":`, result.success ? `Success (${result.models.length} models fetched)` : `Failed: ${result.error}`);
        return result;
      } catch (err) {
        console.error('[AIHandler IPC] ai:testConnection error:', err.message);
        return { success: false, error: err.message, models: [] };
      }
    });

    // 5. ai:refreshModels(provider) -> { success, models[], error }
    ipcMain.handle('ai:refreshModels', async (_event, maybeProviderId) => {
      try {
        const providerId = maybeProviderId || this.registry.getActiveProviderId();
        console.log(`[AIHandler IPC] Force refreshing models for provider "${providerId}"...`);
        const result = await this.modelService.fetchModels(providerId);
        return result;
      } catch (err) {
        console.error('[AIHandler IPC] ai:refreshModels error:', err.message);
        return { success: false, error: err.message, models: [] };
      }
    });

    // 6. ai:selectModel(provider, modelId) -> { success, features, tier, warning, note }
    ipcMain.handle('ai:selectModel', async (_event, providerId, modelId) => {
      try {
        const pId = providerId || this.registry.getActiveProviderId();
        console.log(`[AIHandler IPC] Model selected: "${modelId}" on provider "${pId}"`);
        const success = this.registry.setActiveModel(pId, modelId);

        const pricing = getModelPricing(pId, modelId);
        const cachedModels = this.modelService.getCachedModels(pId);
        const modelMeta = cachedModels.find((m) => m.id === modelId);

        return {
          success,
          features: modelMeta ? modelMeta.supportedFeatures : { chat: true, vision: false, structuredOutput: false },
          tier: pricing.tier,
          note: pricing.note,
          warning: pricing.warning,
        };
      } catch (err) {
        console.error('[AIHandler IPC] ai:selectModel error:', err.message);
        return { success: false, error: err.message };
      }
    });

    // 7. ai:generate(params) -> Uses active provider + active model EXACTLY
    ipcMain.handle('ai:generate', async (_event, params = {}) => {
      try {
        const activeProviderId = (params.provider || this.registry.getActiveProviderId()).toLowerCase();
        const provider = this.registry.getProvider(activeProviderId);

        if (!provider) {
          return { success: false, error: `Invalid active provider: "${activeProviderId}"` };
        }

        if (!provider.getApiKey()) {
          return {
            success: false,
            error: `Please enter and save your ${provider.name} API key first.`,
          };
        }

        // Determine exact model ID
        let exactModel = params.model || this.registry.getActiveModel(activeProviderId);

        if (!exactModel) {
          // If no active model is selected yet, inspect cached models
          const cached = this.modelService.getCachedModels(activeProviderId);
          if (cached && cached.length > 0) {
            exactModel = cached[0].id;
            this.registry.setActiveModel(activeProviderId, exactModel);
          } else {
            return {
              success: false,
              error: 'No model selected. Please select a model from the dropdown or click "Test Connection" to discover live models.',
            };
          }
        }

        console.log(`[AIHandler IPC] Request sent to provider "${activeProviderId}" with exact model: "${exactModel}"`);

        const res = await this.queue.enqueue(
          (signal) =>
            provider.generate({
              ...params,
              model: exactModel,
              signal,
            }),
          {
            model: exactModel,
            provider: activeProviderId,
          }
        );

        console.log(
          `[AIHandler IPC] Model request completed for "${exactModel}":`,
          res?.success ? 'Success' : `Error (${res?.status}): ${res?.error}`
        );

        return res || { success: false, error: 'Empty response returned from model execution.' };
      } catch (err) {
        console.error('[AIHandler IPC] ai:generate error:', err.message);
        return { success: false, error: err.message };
      }
    });

    // 8. ai:getActiveConfig -> { provider, model, tier, features, configured, warning, note }
    ipcMain.handle('ai:getActiveConfig', async () => {
      try {
        const activeProviderId = this.registry.getActiveProviderId();
        const provider = this.registry.getActiveProvider();
        const apiKey = provider ? provider.getApiKey() : '';
        const configured = Boolean(apiKey && apiKey.trim().length > 3);
        const activeModel = this.registry.getActiveModel(activeProviderId);

        const pricing = activeModel ? getModelPricing(activeProviderId, activeModel) : { tier: 'unknown', warning: null, note: '' };
        const cachedModels = this.modelService.getCachedModels(activeProviderId);
        const modelMeta = cachedModels.find((m) => m.id === activeModel);

        return {
          provider: activeProviderId,
          providerName: provider ? provider.name : activeProviderId,
          model: activeModel,
          tier: pricing.tier,
          note: pricing.note,
          warning: pricing.warning,
          features: modelMeta ? modelMeta.supportedFeatures : null,
          configured,
          modelsCount: cachedModels.length,
        };
      } catch (err) {
        console.error('[AIHandler IPC] ai:getActiveConfig error:', err.message);
        return { provider: 'google', configured: false, error: err.message };
      }
    });

    // 9. ai:getUsageStats -> { requestsToday, tokensToday }
    ipcMain.handle('ai:getUsageStats', async () => {
      try {
        const stats = await this.queue.getTodayUsage();
        return stats || { requestsToday: 0, tokensToday: 0 };
      } catch (err) {
        console.error('[AIHandler IPC] ai:getUsageStats error:', err.message);
        return { requestsToday: 0, tokensToday: 0, error: err.message };
      }
    });

    // 10. Backward compatibility for ai:getStatus
    ipcMain.handle('ai:getStatus', async () => {
      try {
        const provider = this.registry.getActiveProvider();
        const key = provider ? provider.getApiKey() : '';
        return { configured: Boolean(key && key.trim().length > 3) };
      } catch (err) {
        return { configured: false, error: err.message };
      }
    });

    console.log('[AIHandler] All Multi-Provider AI IPC channels registered successfully.');
  }
}

// Singleton instance
const aiHandler = new AIHandler();

/**
 * Explicit initialization helper
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
