/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — MODEL SERVICE (ai/model-service.js)
 * ==============================================================================
 * Live model discovery, SQLite caching (models_cache), and automated refresh.
 *
 * ABSOLUTE PRINCIPLE:
 * NEVER hardcode any model ID anywhere. ALL models must be fetched LIVE from
 * each provider's API. No fake models, no expired models, no fallback lists.
 * ==============================================================================
 */

class ModelService {
  /**
   * @param {object} options
   * @param {import('./provider-registry').ProviderRegistry} options.registry
   * @param {import('better-sqlite3').Database} [options.db]
   * @param {number} [options.refreshIntervalMs=300000] 5 minutes default
   */
  constructor(options = {}) {
    this.registry = options.registry;
    this.db = options.db || null;
    this.refreshIntervalMs = options.refreshIntervalMs || 300000;
    this.autoRefreshTimer = null;
  }

  /**
   * Binds SQLite database.
   * @param {import('better-sqlite3').Database} db
   */
  setDb(db) {
    this.db = db;
  }

  /**
   * Fetches models LIVE from the provider's API endpoint.
   * If successful, updates the SQLite `models_cache` table:
   * - Inserts or updates live discovered models
   * - Prunes models for that provider that are no longer present in the API
   *
   * IF FAILED: returns friendly error and NEVER falls back to a hardcoded list.
   *
   * @param {string} providerId
   * @returns {Promise<{success: boolean, models: Array<object>, error?: string}>}
   */
  async fetchModels(providerId) {
    const pId = (providerId || this.registry.getActiveProviderId() || 'google').toLowerCase();
    const provider = this.registry.getProvider(pId);

    if (!provider) {
      return {
        success: false,
        error: `Unknown provider: "${pId}"`,
        models: [],
      };
    }

    const apiKey = provider.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: `Please enter and save your ${provider.name} API key first.`,
        models: [],
      };
    }

    console.log(`[ModelService] Fetching live models for provider: "${pId}"...`);
    const liveResult = await provider.listModels();

    if (!liveResult.success) {
      console.warn(`[ModelService] Live model fetch failed for "${pId}":`, liveResult.error);
      return {
        success: false,
        error: liveResult.error || 'Failed to fetch models from provider API.',
        models: [],
      };
    }

    const liveModels = liveResult.models || [];
    console.log(`[ModelService] Models fetched (${liveModels.length}) from ${pId} API.`);

    // Persist live models into SQLite models_cache table
    if (this.db && liveModels.length > 0) {
      try {
        const syncTx = this.db.transaction(() => {
          // 1. Upsert all currently discovered models
          const upsertStmt = this.db.prepare(`
            INSERT INTO models_cache (provider, model_id, display_name, features_json, fetched_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(provider, model_id) DO UPDATE SET
              display_name = excluded.display_name,
              features_json = excluded.features_json,
              fetched_at = datetime('now')
          `);

          for (const m of liveModels) {
            upsertStmt.run(pId, m.id, m.displayName || m.id, JSON.stringify(m.supportedFeatures || {}));
          }

          // 2. Prune any models in the cache that disappeared from the live API
          const liveIds = liveModels.map((m) => m.id);
          const placeholders = liveIds.map(() => '?').join(',');
          this.db
            .prepare(`DELETE FROM models_cache WHERE provider = ? AND model_id NOT IN (${placeholders})`)
            .run(pId, ...liveIds);
        });

        syncTx();
        console.log(`[ModelService] Synced ${liveModels.length} models into models_cache for ${pId}.`);
      } catch (dbErr) {
        console.error('[ModelService] Error caching live models in SQLite:', dbErr.message);
      }
    }

    // Auto-select first model if no active model is selected yet
    const currentActive = this.registry.getActiveModel(pId);
    if (!currentActive && liveModels.length > 0) {
      this.registry.setActiveModel(pId, liveModels[0].id);
    }

    return {
      success: true,
      models: liveModels,
    };
  }

  /**
   * Retrieves cached models from SQLite if available.
   * @param {string} providerId
   * @returns {Array<object>}
   */
  getCachedModels(providerId) {
    const pId = (providerId || this.registry.getActiveProviderId() || 'google').toLowerCase();
    if (!this.db) return [];

    try {
      const rows = this.db
        .prepare('SELECT model_id, display_name, features_json, fetched_at FROM models_cache WHERE provider = ? ORDER BY display_name ASC')
        .all(pId);

      return rows.map((r) => {
        let features = { chat: true, vision: false, structuredOutput: false };
        try {
          features = JSON.parse(r.features_json);
        } catch {}

        return {
          id: r.model_id,
          displayName: r.display_name,
          provider: pId,
          supportedFeatures: features,
          fetchedAt: r.fetched_at,
        };
      });
    } catch (err) {
      console.error(`[ModelService] Failed to query cached models for ${pId}:`, err.message);
      return [];
    }
  }

  /**
   * Returns models for a provider: if cache exists, returns it, otherwise triggers live fetch.
   * @param {string} providerId
   * @returns {Promise<{success: boolean, models: Array<object>, error?: string}>}
   */
  async getModels(providerId) {
    const cached = this.getCachedModels(providerId);
    if (cached.length > 0) {
      return { success: true, models: cached };
    }
    return this.fetchModels(providerId);
  }

  /**
   * Returns currently active/selected model for the active provider.
   * Logs the exact model ID for full transparency and verification.
   *
   * @param {string} [providerId]
   * @returns {string|null}
   */
  getActiveModel(providerId) {
    const pId = providerId || this.registry.getActiveProviderId();
    const model = this.registry.getActiveModel(pId);
    return model;
  }

  /**
   * Starts periodic auto-refresh background timer (default 5 minutes).
   * Re-fetches models for the ACTIVE provider to keep the cache continuously in sync.
   */
  startAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
    }

    this.autoRefreshTimer = setInterval(async () => {
      try {
        const activeProviderId = this.registry.getActiveProviderId();
        const provider = this.registry.getProvider(activeProviderId);
        if (provider && provider.getApiKey()) {
          console.log(`[ModelService] Auto-refreshing models for active provider "${activeProviderId}"...`);
          await this.fetchModels(activeProviderId);
        }
      } catch (err) {
        console.warn('[ModelService] Auto-refresh cycle encountered an issue:', err.message);
      }
    }, this.refreshIntervalMs);

    console.log(`[ModelService] Auto-refresh scheduled every ${this.refreshIntervalMs / 1000}s.`);
  }

  /**
   * Stops auto-refresh interval timer.
   */
  stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }
}

module.exports = {
  ModelService,
};
