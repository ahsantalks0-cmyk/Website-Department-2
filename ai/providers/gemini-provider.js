/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — GEMINI PROVIDER (ai/providers/gemini-provider.js)
 * ==============================================================================
 * Direct REST implementation targeting Google Gemini Generative Language API.
 * Uses native fetch() without external heavy SDKs.
 * Securely called strictly within the Electron Main Process.
 * ALL models are discovered LIVE from https://generativelanguage.googleapis.com/v1beta/models.
 * ==============================================================================
 */

const { AIProvider } = require('../provider');

class GeminiProvider extends AIProvider {
  /**
   * @param {object} config
   * @param {string} [config.apiKey]
   * @param {string} [config.baseUrl]
   */
  constructor(config = {}) {
    super({
      id: 'google',
      name: 'Google Gemini',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
    });
  }

  /**
   * Returns active API key from instance or environment.
   * @returns {string}
   */
  getApiKey() {
    return this.config.apiKey || process.env.GEMINI_API_KEY || '';
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
        if (lastUserTurn) {
          lastUserTurn.parts.push(...imageParts);
        } else {
          normalized.push({ role: 'user', parts: imageParts });
        }
      }
    }

    return normalized;
  }

  /**
   * Discovers models LIVE from Google Gemini API.
   * Filter: keep ONLY models where supportedGenerationMethods includes "generateContent".
   * Model ID = response name field minus "models/" prefix.
   *
   * @returns {Promise<{success: boolean, models: Array<object>, error?: string}>}
   */
  async listModels() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Please enter your Google AI Studio API key first.',
        models: [],
      };
    }

    try {
      console.log('[GeminiProvider] Fetching live models from Google Gemini API...');
      const response = await fetch(`${this.config.baseUrl}/models?pageSize=100`, {
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
        const errorMsg = this.mapHttpStatusError(response.status, errJson);
        console.error(`[GeminiProvider] listModels failed (${response.status}):`, errorMsg);
        return {
          success: false,
          error: errorMsg,
          models: [],
        };
      }

      const data = await response.json();
      const rawModels = data.models || [];

      // Strict filter: supportedGenerationMethods must include "generateContent"
      const cleanModels = rawModels
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => {
          const id = (m.name || '').replace(/^models\//, '');
          const lowerId = id.toLowerCase();
          const isVision =
            lowerId.includes('vision') ||
            lowerId.includes('flash') ||
            lowerId.includes('pro') ||
            lowerId.includes('1.5') ||
            lowerId.includes('2.0') ||
            lowerId.includes('2.5');

          return {
            id,
            displayName: m.displayName || id,
            provider: 'google',
            description: m.description || '',
            supportedFeatures: {
              chat: true,
              vision: isVision,
              structuredOutput: true,
            },
          };
        });

      console.log(`[GeminiProvider] Successfully fetched ${cleanModels.length} live chat-capable models.`);
      return {
        success: true,
        models: cleanModels,
      };
    } catch (err) {
      console.error('[GeminiProvider] Network failure during listModels:', err.message);
      return {
        success: false,
        error: `Network error connecting to Google Gemini API: ${err.message}`,
        models: [],
      };
    }
  }

  /**
   * Executes generation against Google Gemini REST endpoint.
   *
   * @param {object} params
   * @returns {Promise<{success: boolean, data?: object, error?: string, status?: number}>}
   */
  async generate(params = {}) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        status: 401,
        error: 'Please enter your Google AI Studio API key first.',
      };
    }

    const model = params.model;
    if (!model) {
      return {
        success: false,
        status: 400,
        error: 'No model specified for generation.',
      };
    }

    const endpoint = `${this.config.baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
    const normalizedContents = this.normalizeContents(params.contents, params.images);

    const requestBody = {
      contents: normalizedContents,
    };

    // System instruction
    if (params.systemInstruction && typeof params.systemInstruction === 'string' && params.systemInstruction.trim()) {
      requestBody.systemInstruction = {
        parts: [{ text: params.systemInstruction.trim() }],
      };
    }

    // Generation config
    const generationConfig = {};
    if (typeof params.temperature === 'number') {
      generationConfig.temperature = params.temperature;
    }
    if (typeof params.maxTokens === 'number') {
      generationConfig.maxOutputTokens = params.maxTokens;
    }

    // Structured JSON output
    if (params.schema && typeof params.schema === 'object') {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = params.schema;
    }

    if (Object.keys(generationConfig).length > 0) {
      requestBody.generationConfig = generationConfig;
    }

    try {
      console.log(`[GeminiProvider] Sending generateContent request to model: "${model}"`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: params.signal,
      });

      if (!response.ok) {
        let errJson = null;
        try {
          errJson = await response.json();
        } catch {
          errJson = null;
        }

        const friendlyError = this.mapHttpStatusError(response.status, errJson);
        console.error(`[GeminiProvider] generateContent failed with status ${response.status}:`, friendlyError);
        return {
          success: false,
          status: response.status,
          error: friendlyError,
        };
      }

      const data = await response.json();
      const firstCandidate = data.candidates && data.candidates[0];
      const text = firstCandidate?.content?.parts?.map((p) => p.text || '').join('') || '';

      const promptTokens = data.usageMetadata?.promptTokenCount || 0;
      const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

      return {
        success: true,
        data: {
          text,
          usage: {
            promptTokens,
            outputTokens,
          },
          model,
        },
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          status: 408,
          error: 'Request timed out or was aborted.',
        };
      }
      return {
        success: false,
        status: 500,
        error: `Network error connecting to Gemini API: ${err.message}`,
      };
    }
  }
}

module.exports = {
  GeminiProvider,
};
