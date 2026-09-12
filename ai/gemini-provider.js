/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — GEMINI REST PROVIDER (ai/gemini-provider.js)
 * ==============================================================================
 * Direct REST implementation targeting Google Gemini Generative Language API.
 * Uses native fetch() without external heavy SDKs.
 * Securely called strictly within the Electron Main Process.
 * ==============================================================================
 */

const { AIProvider } = require('./provider');

class GeminiProvider extends AIProvider {
  /**
   * @param {object} config
   * @param {string} [config.apiKey]
   * @param {string} [config.baseUrl]
   */
  constructor(config = {}) {
    super(config);
    this.baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  }

  /**
   * Returns current active API key from instance configuration or environment.
   * @returns {string}
   */
  getApiKey() {
    return this.config.apiKey || process.env.GEMINI_API_KEY || '';
  }

  /**
   * Updates the provider's active API key.
   * @param {string} key
   */
  setApiKey(key) {
    this.config.apiKey = (key || '').trim();
  }

  /**
   * Maps HTTP error statuses and error bodies to clear, human-actionable feedback.
   * @param {number} status
   * @param {any} errorBody
   * @returns {string}
   */
  mapHttpStatusError(status, errorBody = null) {
    const rawMessage = errorBody?.error?.message || errorBody?.message || '';
    if (status === 400) {
      return rawMessage ? `Invalid request: ${rawMessage}` : 'Invalid request. Check prompt/schema format.';
    }
    if (status === 403) {
      return 'API key invalid or lacks permission.';
    }
    if (status === 404) {
      return 'Model not found. Check model ID in settings.';
    }
    if (status === 429) {
      return 'Rate limit hit. Retrying automatically...';
    }
    if (status === 500 || status === 503) {
      return 'Google server error. Retrying...';
    }
    return rawMessage || `Google API error (Status ${status}).`;
  }

  /**
   * Normalizes contents into valid Gemini API structures.
   * Supports:
   * - String prompt
   * - Formatted contents array [{ role, parts }]
   * - Inlined images: [{ mimeType, data }]
   *
   * @param {string|Array} contents
   * @param {Array<{mimeType: string, data: string}>} [images]
   * @returns {Array<{role: string, parts: Array}>}
   */
  normalizeContents(contents, images = []) {
    let normalized = [];

    if (typeof contents === 'string') {
      const parts = [];
      if (contents.trim()) {
        parts.push({ text: contents });
      }
      normalized = [{ role: 'user', parts }];
    } else if (Array.isArray(contents)) {
      normalized = contents.map((turn) => {
        if (typeof turn === 'string') {
          return { role: 'user', parts: [{ text: turn }] };
        }
        if (turn && turn.parts && Array.isArray(turn.parts)) {
          return turn;
        }
        if (turn && turn.text) {
          return { role: turn.role || 'user', parts: [{ text: turn.text }] };
        }
        return { role: 'user', parts: [turn] };
      });
    } else {
      normalized = [{ role: 'user', parts: [{ text: '' }] }];
    }

    // Attach any auxiliary images to the latest user turn
    if (Array.isArray(images) && images.length > 0) {
      const imageParts = images
        .filter((img) => img && (img.data || img.base64))
        .map((img) => ({
          inlineData: {
            mimeType: img.mimeType || 'image/png',
            data: (img.data || img.base64).replace(/^data:image\/[a-zA-Z+]+;base64,/, ''),
          },
        }));

      if (imageParts.length > 0) {
        let lastUserTurn = null;
        for (let i = normalized.length - 1; i >= 0; i--) {
          if (normalized[i].role === 'user') {
            lastUserTurn = normalized[i];
            break;
          }
        }
        if (!lastUserTurn) {
          lastUserTurn = { role: 'user', parts: [] };
          normalized.push(lastUserTurn);
        }
        lastUserTurn.parts.push(...imageParts);
      }
    }

    return normalized;
  }

  /**
   * Generates AI output from prompt contents.
   *
   * @param {object} params
   * @param {Array|string} params.contents
   * @param {string} [params.model]
   * @param {object} [params.schema]
   * @param {Array} [params.tools]
   * @param {string} [params.systemInstruction]
   * @param {Array} [params.images]
   * @param {object} [params.options]
   * @param {AbortSignal} [params.signal]
   * @returns {Promise<{success: boolean, data?: object, error?: string, status?: number}>}
   */
  async generate(params = {}) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Please add your Google AI Studio API key first',
        status: 403,
      };
    }

    const {
      contents,
      model = 'gemini-2.5-flash-lite',
      schema,
      tools,
      systemInstruction,
      images,
      options = {},
      signal,
    } = params;

    // Build REST request body
    const requestBody = {
      contents: this.normalizeContents(contents, images),
    };

    // System instruction
    if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction.trim() }],
      };
    }

    // Generation Config
    const generationConfig = {};
    if (typeof options.temperature === 'number') generationConfig.temperature = options.temperature;
    if (typeof options.maxOutputTokens === 'number') generationConfig.maxOutputTokens = options.maxOutputTokens;
    if (typeof options.topP === 'number') generationConfig.topP = options.topP;
    if (typeof options.topK === 'number') generationConfig.topK = options.topK;

    // Structured output schema
    if (schema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = schema;
    } else if (options.responseMimeType) {
      generationConfig.responseMimeType = options.responseMimeType;
    }

    if (Object.keys(generationConfig).length > 0) {
      requestBody.generationConfig = generationConfig;
    }

    // Function calling / tools
    if (Array.isArray(tools) && tools.length > 0) {
      requestBody.tools = tools;
    }

    // Clean model ID
    const cleanModel = model.replace(/^models\//, '');
    const endpoint = `${this.baseUrl}/models/${cleanModel}:generateContent`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      if (!response.ok) {
        let errorData = null;
        try {
          errorData = await response.json();
        } catch {
          errorData = null;
        }

        const friendlyMsg = this.mapHttpStatusError(response.status, errorData);
        return {
          success: false,
          status: response.status,
          error: friendlyMsg,
          rawError: errorData,
        };
      }

      const json = await response.json();

      // Extract response structure safely
      const candidate = json.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const finishReason = candidate?.finishReason || 'STOP';

      let textOutput = '';
      const functionCalls = [];

      for (const part of parts) {
        if (part.text) {
          textOutput += part.text;
        }
        if (part.functionCall) {
          functionCalls.push(part.functionCall);
        }
      }

      const usageMetadata = {
        promptTokens: json.usageMetadata?.promptTokenCount || 0,
        outputTokens: json.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: json.usageMetadata?.totalTokenCount || 0,
      };

      return {
        success: true,
        data: {
          text: textOutput,
          functionCalls,
          usageMetadata,
          finishReason,
          raw: json,
        },
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          status: 408,
          error: 'Request timed out after 120 seconds.',
        };
      }
      return {
        success: false,
        status: 500,
        error: `Network error connecting to Gemini API: ${err.message}`,
      };
    }
  }

  /**
   * Queries list of models to verify credentials.
   * @returns {Promise<{success: boolean, models: Array<{id: string, name: string}>, error?: string}>}
   */
  async listModels() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Please add your Google AI Studio API key first',
        models: [],
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/models?pageSize=50`, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
        },
      });

      if (!response.ok) {
        let errJson = null;
        try {
          errJson = await response.json();
        } catch {
          errJson = null;
        }
        return {
          success: false,
          error: this.mapHttpStatusError(response.status, errJson),
          models: [],
        };
      }

      const data = await response.json();
      const rawModels = data.models || [];
      const cleanModels = rawModels
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => {
          const id = (m.name || '').replace(/^models\//, '');
          return {
            id,
            name: m.displayName || id,
            description: m.description || '',
          };
        });

      return {
        success: true,
        models: cleanModels,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to query models: ${err.message}`,
        models: [],
      };
    }
  }

  /**
   * Verifies connectivity and key validity via listModels.
   * @returns {Promise<{success: boolean, models: string[], error?: string}>}
   */
  async testConnection() {
    const result = await this.listModels();
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Connection failed',
        models: [],
      };
    }

    const modelIds = (result.models || []).map((m) => m.id);
    return {
      success: true,
      models: modelIds,
    };
  }
}

module.exports = {
  GeminiProvider,
};
