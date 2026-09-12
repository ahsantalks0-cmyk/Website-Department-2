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
   * @param {string} [config.apiKey]
   * @param {string} [config.baseUrl]
   * @param {object} [config.defaultOptions]
   */
  constructor(config = {}) {
    if (new.target === AIProvider) {
      throw new TypeError('Cannot construct AIProvider instances directly. Subclass must implement.');
    }
    this.config = config;
  }

  /**
   * Generates AI output from prompt contents, supporting text, structured JSON,
   * vision payloads, and tool declarations.
   *
   * @param {object} params
   * @param {Array<{role: string, parts: Array}>|string} params.contents - User / assistant turns or raw text
   * @param {string} [params.taskProfile] - 'cheap' | 'reasoning' | 'vision' | 'structured'
   * @param {string} [params.model] - Explicit model override
   * @param {object} [params.schema] - JSON schema for structured output validation
   * @param {Array} [params.tools] - Function declarations array
   * @param {string} [params.systemInstruction] - System persona / prompt
   * @param {Array<{mimeType: string, data: string}>} [params.images] - Base64 images
   * @param {object} [params.options] - Generation config (temperature, maxOutputTokens, topP, etc.)
   * @returns {Promise<{success: boolean, data?: {text: string, functionCalls: Array, usageMetadata: {promptTokens: number, outputTokens: number}, finishReason: string}, error?: string}>}
   */
  async generate(_params) {
    throw new Error('generate() must be implemented by provider subclass');
  }

  /**
   * Validates credentials and verifies that the upstream AI endpoint is reachable.
   * @returns {Promise<{success: boolean, models: string[], error?: string}>}
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by provider subclass');
  }

  /**
   * Lists available models accessible with the active provider credentials.
   * @returns {Promise<{success: boolean, models: Array<{id: string, name: string, description?: string}>, error?: string}>}
   */
  async listModels() {
    throw new Error('listModels() must be implemented by provider subclass');
  }
}

module.exports = {
  AIProvider,
};
