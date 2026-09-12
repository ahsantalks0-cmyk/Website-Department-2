/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — PROVIDER ABSTRACTION (ai/provider.js)
 * ==============================================================================
 * Standard AI Provider base interface.
 * All present and future LLM providers (Gemini, Claude, OpenAI, Ollama/local)
 * must implement this contract.
 * ==============================================================================
 */

class AIProvider {
  /**
   * @param {object} config
   * @param {string} [config.id]
   * @param {string} [config.name]
   * @param {string} [config.apiKey]
   * @param {string} [config.baseUrl]
   * @param {object} [config.defaultOptions]
   */
  constructor(config = {}) {
    if (new.target === AIProvider) {
      throw new TypeError('Cannot construct AIProvider instances directly. Subclass must implement.');
    }
    this.config = config;
    this.id = config.id || 'unknown';
    this.name = config.name || 'Unknown Provider';
  }

  /**
   * Returns active API key from instance configuration or environment.
   * @returns {string}
   */
  getApiKey() {
    return this.config.apiKey || '';
  }

  /**
   * Updates provider API key in memory.
   * @param {string} key
   */
  setApiKey(key) {
    this.config.apiKey = (key || '').trim();
  }

  /**
   * Maps HTTP error statuses and error bodies to friendly, actionable feedback per provider.
   * @param {number} status
   * @param {any} errorBody
   * @returns {string}
   */
  mapHttpStatusError(status, errorBody = null) {
    const rawMessage =
      errorBody?.error?.message ||
      errorBody?.message ||
      (typeof errorBody === 'string' ? errorBody : '');

    if (status === 400) {
      return rawMessage ? `Invalid request: ${rawMessage}` : 'Invalid request parameters or format.';
    }
    if (status === 401) {
      return 'API key invalid. Please verify your credentials.';
    }
    if (status === 403) {
      return 'API key lacks permission, or billing is inactive for this model.';
    }
    if (status === 404) {
      return 'Model not found on provider. Check model ID in settings.';
    }
    if (status === 429) {
      return 'Rate limit hit. Retrying automatically...';
    }
    if (status >= 500 && status <= 599) {
      return `${this.name} server error (${status}). Retrying...`;
    }
    return rawMessage || `${this.name} API error (Status ${status}).`;
  }

  /**
   * Generates AI output from prompt contents.
   * Unified return shape:
   * {
   *   success: boolean,
   *   data?: {
   *     text: string,
   *     usage: { promptTokens: number, outputTokens: number },
   *     model: string,
   *     latencyMs?: number
   *   },
   *   error?: string,
   *   status?: number
   * }
   *
   * @param {object} params
   * @param {string|Array} params.contents
   * @param {string} [params.model]
   * @param {string} [params.systemInstruction]
   * @param {object} [params.schema]
   * @param {Array} [params.images]
   * @param {number} [params.temperature]
   * @param {number} [params.maxTokens]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{success: boolean, data?: object, error?: string, status?: number}>}
   */
  async generate(_params) {
    throw new Error('generate() must be implemented by provider subclass');
  }

  /**
   * Lists available models accessible with active credentials.
   * Returns:
   * [{
   *   id: string,
   *   displayName: string,
   *   provider: string,
   *   supportedFeatures: { chat: boolean, vision: boolean, structuredOutput: boolean }
   * }]
   *
   * @returns {Promise<{success: boolean, models: Array<object>, error?: string}>}
   */
  async listModels() {
    throw new Error('listModels() must be implemented by provider subclass');
  }

  /**
   * Validates credentials and verifies that the upstream AI endpoint is reachable.
   * Returns live discovered models on success.
   *
   * @returns {Promise<{success: boolean, models: string[], error?: string}>}
   */
  async testConnection() {
    const res = await this.listModels();
    if (!res.success) {
      return {
        success: false,
        error: res.error || 'Connection failed',
        models: [],
      };
    }
    return {
      success: true,
      models: (res.models || []).map((m) => m.id),
    };
  }
}

module.exports = {
  AIProvider,
};
