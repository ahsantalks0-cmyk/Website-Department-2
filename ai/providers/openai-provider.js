/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — OPENAI PROVIDER (ai/providers/openai-provider.js)
 * ==============================================================================
 * Direct REST implementation targeting OpenAI Chat Completions API.
 * Uses native fetch() without external heavy SDKs.
 * Securely executed strictly in the Electron Main Process.
 * ALL models are discovered LIVE from https://api.openai.com/v1/models.
 * ==============================================================================
 */

const { AIProvider } = require('../provider');

class OpenAIProvider extends AIProvider {
  /**
   * @param {object} config
   * @param {string} [config.apiKey]
   * @param {string} [config.baseUrl]
   */
  constructor(config = {}) {
    super({
      id: 'openai',
      name: 'OpenAI',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
    });
  }

  /**
   * Returns active API key from instance or environment.
   * @returns {string}
   */
  getApiKey() {
    return this.config.apiKey || process.env.OPENAI_API_KEY || '';
  }

  /**
   * Formats prompt, images, and history into OpenAI standard messages array.
   *
   * @param {string|Array} contents
   * @param {string} [systemInstruction]
   * @param {Array<{mimeType: string, data: string}>} [images]
   * @returns {Array<{role: string, content: any}>}
   */
  formatMessages(contents, systemInstruction, images = []) {
    const messages = [];

    if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()) {
      messages.push({
        role: 'system',
        content: systemInstruction.trim(),
      });
    }

    let userPromptText = '';
    if (typeof contents === 'string') {
      userPromptText = contents;
    } else if (Array.isArray(contents)) {
      // If array of turns, process sequentially
      for (const turn of contents) {
        if (typeof turn === 'string') {
          messages.push({ role: 'user', content: turn });
        } else if (turn && turn.role && turn.content) {
          messages.push(turn);
        } else if (turn && turn.parts) {
          const text = turn.parts.map((p) => p.text || '').join('\n');
          messages.push({ role: turn.role === 'model' ? 'assistant' : 'user', content: text });
        }
      }
      return messages;
    }

    // Single prompt with possible images
    if (images && images.length > 0) {
      const contentParts = [];
      if (userPromptText.trim()) {
        contentParts.push({ type: 'text', text: userPromptText });
      }
      for (const img of images) {
        const mime = img.mimeType || 'image/png';
        const rawData = (img.data || img.base64 || '').replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${mime};base64,${rawData}`,
          },
        });
      }
      messages.push({ role: 'user', content: contentParts });
    } else {
      messages.push({ role: 'user', content: userPromptText });
    }

    return messages;
  }

  /**
   * Fetches models LIVE from OpenAI API.
   * Filters to chat-capable models containing "gpt" or "o1"/"o3"/"o4",
   * excluding audio, embeddings, tts, dall-e, whisper, realtime models.
   *
   * @returns {Promise<{success: boolean, models: Array<object>, error?: string}>}
   */
  async listModels() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Please enter your OpenAI API key first.',
        models: [],
      };
    }

    try {
      console.log('[OpenAIProvider] Fetching live models from OpenAI API...');
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
        console.error(`[OpenAIProvider] listModels failed (${response.status}):`, errorMsg);
        return {
          success: false,
          error: errorMsg,
          models: [],
        };
      }

      const data = await response.json();
      const rawModels = data.data || [];

      // Exclusions: non-chat / audio / embedding / moderation / tts / dall-e models
      const excludePatterns = [
        'embedding',
        'tts',
        'whisper',
        'dall-e',
        'davinci',
        'babbage',
        'moderation',
        'realtime',
        'audio',
        'transcription',
        'search',
        'similarity',
      ];

      const cleanModels = rawModels
        .filter((m) => {
          const id = (m.id || '').toLowerCase();
          const isChatCandidate = id.includes('gpt') || /^o[134]/i.test(id);
          if (!isChatCandidate) return false;
          const isExcluded = excludePatterns.some((pattern) => id.includes(pattern));
          return !isExcluded;
        })
        .map((m) => {
          const id = m.id;
          const lowerId = id.toLowerCase();
          const isVision =
            lowerId.includes('gpt-4o') ||
            lowerId.includes('gpt-4.1') ||
            lowerId.includes('gpt-4-turbo') ||
            lowerId.includes('gpt-4-vision') ||
            lowerId.includes('o1') ||
            lowerId.includes('o3') ||
            lowerId.includes('o4');

          return {
            id,
            displayName: id,
            provider: 'openai',
            supportedFeatures: {
              chat: true,
              vision: isVision,
              structuredOutput: true,
            },
          };
        });

      // Sort alphabetically for clean UI presentation
      cleanModels.sort((a, b) => a.id.localeCompare(b.id));

      console.log(`[OpenAIProvider] Successfully fetched ${cleanModels.length} live chat-capable models.`);
      return {
        success: true,
        models: cleanModels,
      };
    } catch (err) {
      console.error('[OpenAIProvider] Network failure during listModels:', err.message);
      return {
        success: false,
        error: `Network error connecting to OpenAI API: ${err.message}`,
        models: [],
      };
    }
  }

  /**
   * Executes chat completion against OpenAI endpoint.
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
        error: 'Please enter your OpenAI API key first.',
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

    const messages = this.formatMessages(params.contents, params.systemInstruction, params.images);

    const requestBody = {
      model,
      messages,
    };

    // Temperature & max_tokens (Note: reasoning models like o1/o3/o4 may require max_completion_tokens)
    const isReasoningModel = /^o[134]/i.test(model);
    if (!isReasoningModel && typeof params.temperature === 'number') {
      requestBody.temperature = params.temperature;
    }

    if (typeof params.maxTokens === 'number') {
      if (isReasoningModel) {
        requestBody.max_completion_tokens = params.maxTokens;
      } else {
        requestBody.max_tokens = params.maxTokens;
      }
    }

    // Structured output
    if (params.schema && typeof params.schema === 'object') {
      requestBody.response_format = { type: 'json_object' };
    }

    try {
      console.log(`[OpenAIProvider] Sending chat completion request to model: "${model}"`);
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
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
        console.error(`[OpenAIProvider] generate failed with status ${response.status}:`, friendlyError);
        return {
          success: false,
          status: response.status,
          error: friendlyError,
        };
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      const promptTokens = data.usage?.prompt_tokens || 0;
      const outputTokens = data.usage?.completion_tokens || 0;

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
        error: `Network error connecting to OpenAI API: ${err.message}`,
      };
    }
  }
}

module.exports = {
  OpenAIProvider,
};
