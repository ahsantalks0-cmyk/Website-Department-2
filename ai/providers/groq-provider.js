/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — GROQ PROVIDER (ai/providers/groq-provider.js)
 * ==============================================================================
 * Direct REST implementation targeting Groq OpenAI-compatible Inference API.
 * Uses native fetch() without external heavy SDKs.
 * Securely executed strictly in the Electron Main Process.
 * ALL models are discovered LIVE from https://api.groq.com/openai/v1/models.
 * ==============================================================================
 */

const { AIProvider } = require('../provider');

class GroqProvider extends AIProvider {
  /**
   * @param {object} config
   * @param {string} [config.apiKey]
   * @param {string} [config.baseUrl]
   */
  constructor(config = {}) {
    super({
      id: 'groq',
      name: 'Groq',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || 'https://api.groq.com/openai/v1',
    });
  }

  /**
   * Returns active API key from instance or environment.
   * @returns {string}
   */
  getApiKey() {
    return this.config.apiKey || process.env.GROQ_API_KEY || '';
  }

  /**
   * Formats prompt and images into Groq/OpenAI compatible chat messages.
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
   * Discovers models LIVE from Groq API.
   * Filters to active chat models (excluding whisper/audio models).
   *
   * @returns {Promise<{success: boolean, models: Array<object>, error?: string}>}
   */
  async listModels() {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Please enter your Groq API key first.',
        models: [],
      };
    }

    try {
      console.log('[GroqProvider] Fetching live models from Groq API...');
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
        console.error(`[GroqProvider] listModels failed (${response.status}):`, errorMsg);
        return {
          success: false,
          error: errorMsg,
          models: [],
        };
      }

      const data = await response.json();
      const rawModels = data.data || [];

      // Exclude whisper / audio-only transcription models
      const cleanModels = rawModels
        .filter((m) => {
          const id = (m.id || '').toLowerCase();
          return !id.includes('whisper') && m.active !== false;
        })
        .map((m) => {
          const id = m.id;
          const lowerId = id.toLowerCase();
          const isVision = lowerId.includes('vision');
          const isStructured =
            lowerId.includes('llama') || lowerId.includes('mixtral') || lowerId.includes('gemma');

          return {
            id,
            displayName: id,
            provider: 'groq',
            supportedFeatures: {
              chat: true,
              vision: isVision,
              structuredOutput: isStructured,
            },
          };
        });

      cleanModels.sort((a, b) => a.id.localeCompare(b.id));

      console.log(`[GroqProvider] Successfully fetched ${cleanModels.length} live models.`);
      return {
        success: true,
        models: cleanModels,
      };
    } catch (err) {
      console.error('[GroqProvider] Network failure during listModels:', err.message);
      return {
        success: false,
        error: `Network error connecting to Groq API: ${err.message}`,
        models: [],
      };
    }
  }

  /**
   * Executes chat completion against Groq endpoint.
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
        error: 'Please enter your Groq API key first.',
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

    if (typeof params.temperature === 'number') {
      requestBody.temperature = params.temperature;
    }
    if (typeof params.maxTokens === 'number') {
      requestBody.max_tokens = params.maxTokens;
    }

    if (params.schema && typeof params.schema === 'object') {
      requestBody.response_format = { type: 'json_object' };
    }

    try {
      console.log(`[GroqProvider] Sending chat completion request to model: "${model}"`);
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
        console.error(`[GroqProvider] generate failed with status ${response.status}:`, friendlyError);
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
        error: `Network error connecting to Groq API: ${err.message}`,
      };
    }
  }
}

module.exports = {
  GroqProvider,
};
