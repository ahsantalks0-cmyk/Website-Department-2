/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — ANTHROPIC PROVIDER (ai/providers/anthropic-provider.js)
 * ==============================================================================
 * Direct REST implementation targeting Anthropic Messages API.
 * Uses native fetch() without external heavy SDKs.
 * Securely executed strictly in the Electron Main Process.
 * ALL models are discovered LIVE from https://api.anthropic.com/v1/models.
 * ==============================================================================
 */

const { AIProvider } = require('../provider');

class AnthropicProvider extends AIProvider {
  /**
   * @param {object} config
   * @param {string} [config.apiKey]
   * @param {string} [config.baseUrl]
   */
  constructor(config = {}) {
    super({
      id: 'anthropic',
      name: 'Anthropic Claude',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.anthropic.com/v1',
    });
  }

  /**
   * Returns active API key from instance or environment.
   * @returns {string}
   */
  getApiKey() {
    return this.config.apiKey || process.env.ANTHROPIC_API_KEY || '';
  }

  /**
   * Formats prompt and images into Anthropic Messages API format.
   *
   * @param {string|Array} contents
   * @param {Array<{mimeType: string, data: string}>} [images]
   * @returns {Array<{role: string, content: any}>}
   */
  formatMessages(contents, images = []) {
    if (Array.isArray(contents)) {
      return contents.map((turn) => {
        if (typeof turn === 'string') {
          return { role: 'user', content: turn };
        }
        if (turn && turn.role && turn.content) {
          const role = turn.role === 'model' || turn.role === 'assistant' ? 'assistant' : 'user';
          return { role, content: turn.content };
        }
        if (turn && turn.parts) {
          const text = turn.parts.map((p) => p.text || '').join('\n');
          return { role: turn.role === 'model' ? 'assistant' : 'user', content: text };
        }
        return { role: 'user', content: String(turn) };
      });
    }

    const text = typeof contents === 'string' ? contents : '';
    if (images && images.length > 0) {
      const contentParts = [];
      for (const img of images) {
        const mime = img.mimeType || 'image/png';
        const rawData = (img.data || img.base64 || '').replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
        contentParts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mime,
            data: rawData,
          },
        });
      }
      if (text.trim()) {
        contentParts.push({
          type: 'text',
          text,
        });
      }
      return [{ role: 'user', content: contentParts }];
    }

    return [{ role: 'user', content: text || 'Hello' }];
  }

  /**
   * Fetches models LIVE from Anthropic API.
   * Endpoint: GET https://api.anthropic.com/v1/models
   * All returned models are chat-capable.
   *
   * @returns {Promise<{success: boolean, models: Array<object>, error?: string}>}
   */
  async listModels() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Please enter your Anthropic API key first.',
        models: [],
      };
    }

    try {
      console.log('[AnthropicProvider] Fetching live models from Anthropic API...');
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
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
        console.error(`[AnthropicProvider] listModels failed (${response.status}):`, errorMsg);
        return {
          success: false,
          error: errorMsg,
          models: [],
        };
      }

      const data = await response.json();
      const rawModels = data.data || [];

      const cleanModels = rawModels.map((m) => {
        const id = m.id;
        const lowerId = id.toLowerCase();
        // All Claude 3 and newer families support vision
        const isVision = lowerId.includes('claude-3') || lowerId.includes('claude-4');

        return {
          id,
          displayName: m.display_name || id,
          provider: 'anthropic',
          supportedFeatures: {
            chat: true,
            vision: isVision,
            structuredOutput: true,
          },
        };
      });

      // Sort alphabetically
      cleanModels.sort((a, b) => a.id.localeCompare(b.id));

      console.log(`[AnthropicProvider] Successfully fetched ${cleanModels.length} live models.`);
      return {
        success: true,
        models: cleanModels,
      };
    } catch (err) {
      console.error('[AnthropicProvider] Network failure during listModels:', err.message);
      return {
        success: false,
        error: `Network error connecting to Anthropic API: ${err.message}`,
        models: [],
      };
    }
  }

  /**
   * Executes message generation against Anthropic endpoint.
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
        error: 'Please enter your Anthropic API key first.',
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

    const messages = this.formatMessages(params.contents, params.images);

    const requestBody = {
      model,
      messages,
      max_tokens: typeof params.maxTokens === 'number' ? params.maxTokens : 4096,
    };

    if (params.systemInstruction && typeof params.systemInstruction === 'string' && params.systemInstruction.trim()) {
      requestBody.system = params.systemInstruction.trim();
    }

    if (typeof params.temperature === 'number') {
      requestBody.temperature = Math.max(0, Math.min(1, params.temperature));
    }

    if (params.schema && typeof params.schema === 'object') {
      // Direct instruction to output valid JSON conforming to schema
      const jsonPrompt = `\nCRITICAL: Respond ONLY with a valid JSON object matching this schema:\n${JSON.stringify(params.schema, null, 2)}`;
      if (requestBody.system) {
        requestBody.system += jsonPrompt;
      } else {
        requestBody.system = jsonPrompt;
      }
    }

    try {
      console.log(`[AnthropicProvider] Sending messages request to model: "${model}"`);
      const response = await fetch(`${this.config.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
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
        console.error(`[AnthropicProvider] generate failed with status ${response.status}:`, friendlyError);
        return {
          success: false,
          status: response.status,
          error: friendlyError,
        };
      }

      const data = await response.json();
      const textParts = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text || '');
      const text = textParts.join('\n');

      const promptTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;

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
        error: `Network error connecting to Anthropic API: ${err.message}`,
      };
    }
  }
}

module.exports = {
  AnthropicProvider,
};
