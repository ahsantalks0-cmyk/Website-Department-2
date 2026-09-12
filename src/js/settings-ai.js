/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — SETTINGS AI CONTROLLER (src/js/settings-ai.js)
 * ==============================================================================
 * Manages the AI Provider section in Settings:
 * - Secure API key persistence via main-process encrypted safeStorage
 * - Real-time connection testing and model discovery
 * - Dynamic task profile routing configuration
 * - Interactive test prompt execution with token/latency telemetry
 * - Daily usage metric tracking
 * ==============================================================================
 */

export class SettingsAIController {
  constructor() {
    this.dom = {
      keyInput: document.getElementById('ai-api-key-input'),
      toggleKeyBtn: document.getElementById('btn-toggle-key-visibility'),
      keyVisibilityIcon: document.getElementById('key-visibility-icon'),
      saveKeyBtn: document.getElementById('btn-save-ai-key'),
      testConnBtn: document.getElementById('btn-test-ai-connection'),
      keyStatusBadge: document.getElementById('ai-key-status-badge'),
      connFeedback: document.getElementById('ai-connection-feedback'),
      profilesTableBody: document.getElementById('ai-profiles-table-body'),
      statRequestsToday: document.getElementById('ai-stat-requests-today'),
      statTokensToday: document.getElementById('ai-stat-tokens-today'),
      testPromptInput: document.getElementById('ai-test-prompt-input'),
      sendTestBtn: document.getElementById('btn-send-ai-test'),
      testResultBox: document.getElementById('ai-test-result-box'),
      testMetricModel: document.getElementById('ai-test-metric-model'),
      testMetricTokens: document.getElementById('ai-test-metric-tokens'),
      testMetricLatency: document.getElementById('ai-test-metric-latency'),
      testOutputContent: document.getElementById('ai-test-output-content'),
    };

    this.isKeyConfigured = false;
    this.isKeyRevealed = false;
  }

  /**
   * Initializes event listeners and loads current configuration.
   */
  async init() {
    this.attachEventListeners();
    await this.refreshStatus();
    await this.loadProfiles();
    await this.loadUsageStats();
  }

  /**
   * Safe access to the AI IPC bridge across desktop Electron and web preview environments.
   */
  get aiApi() {
    return window.api?.ai || window.electronAPI?.ai || null;
  }

  attachEventListeners() {
    // 1. Toggle Key Visibility
    if (this.dom.toggleKeyBtn && this.dom.keyInput) {
      this.dom.toggleKeyBtn.addEventListener('click', () => {
        this.isKeyRevealed = !this.isKeyRevealed;
        this.dom.keyInput.type = this.isKeyRevealed ? 'text' : 'password';
        this.dom.toggleKeyBtn.title = this.isKeyRevealed ? 'Hide key' : 'Show key';
      });
    }

    // 2. Save API Key
    if (this.dom.saveKeyBtn && this.dom.keyInput) {
      this.dom.saveKeyBtn.addEventListener('click', async () => {
        await this.handleSaveKey();
      });

      this.dom.keyInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await this.handleSaveKey();
        }
      });
    }

    // 3. Test Connection
    if (this.dom.testConnBtn) {
      this.dom.testConnBtn.addEventListener('click', async () => {
        await this.handleTestConnection();
      });
    }

    // 4. Send Test Prompt
    if (this.dom.sendTestBtn) {
      this.dom.sendTestBtn.addEventListener('click', async () => {
        await this.handleSendTest();
      });
    }
  }

  /**
   * Checks current stored key status and updates the UI badge.
   */
  async refreshStatus() {
    if (!this.aiApi?.getStatus) {
      this.updateKeyBadge(false, 'Local Preview');
      return;
    }

    try {
      const res = await this.aiApi.getStatus();
      this.isKeyConfigured = Boolean(res?.configured);
      this.updateKeyBadge(this.isKeyConfigured);
    } catch (err) {
      console.warn('[SettingsAI] Status check failed:', err);
      this.updateKeyBadge(false, 'Error checking');
    }
  }

  /**
   * Updates the key status badge element.
   * @param {boolean} isSaved
   * @param {string} [customText]
   */
  updateKeyBadge(isSaved, customText) {
    if (!this.dom.keyStatusBadge) return;

    this.dom.keyStatusBadge.className = 'ai-status-badge';
    if (isSaved) {
      this.dom.keyStatusBadge.classList.add('saved');
      this.dom.keyStatusBadge.textContent = customText || 'Key Saved';
    } else {
      this.dom.keyStatusBadge.classList.add('missing');
      this.dom.keyStatusBadge.textContent = customText || 'No Key Set';
    }
  }

  /**
   * Persists API key securely.
   */
  async handleSaveKey() {
    const rawKey = this.dom.keyInput?.value?.trim();
    if (!rawKey) {
      this.showFeedback('Please enter a valid Gemini API key.', 'error');
      return;
    }

    if (!this.aiApi?.saveApiKey) {
      this.showFeedback('API key storage is active in the Electron desktop environment.', 'error');
      return;
    }

    try {
      this.dom.saveKeyBtn.disabled = true;
      this.dom.saveKeyBtn.textContent = 'Saving...';

      const res = await this.aiApi.saveApiKey(rawKey);
      if (res?.success) {
        this.dom.keyInput.value = '';
        this.isKeyConfigured = true;
        this.updateKeyBadge(true, 'Key Saved');
        this.showFeedback('API key successfully encrypted and stored in local settings.', 'success');
        await this.refreshStatus();
      } else {
        this.showFeedback(res?.error || 'Failed to persist API key.', 'error');
      }
    } catch (err) {
      this.showFeedback(`Save failed: ${err.message}`, 'error');
    } finally {
      if (this.dom.saveKeyBtn) {
        this.dom.saveKeyBtn.disabled = false;
        this.dom.saveKeyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          Save Key
        `;
      }
    }
  }

  /**
   * Tests API key and connection to Google Gemini endpoints.
   */
  async handleTestConnection() {
    if (!this.aiApi?.testConnection) {
      this.showFeedback('Connection testing is available in the desktop application.', 'error');
      return;
    }

    try {
      this.dom.testConnBtn.disabled = true;
      this.dom.testConnBtn.textContent = 'Testing...';
      this.updateKeyBadge(false, 'Testing...');
      this.dom.keyStatusBadge.className = 'ai-status-badge testing';

      const res = await this.aiApi.testConnection();

      if (res?.success) {
        this.updateKeyBadge(true, 'Connected');
        const modelsList = Array.isArray(res.models) && res.models.length > 0
          ? res.models.slice(0, 8).map(m => `<span class="ai-model-chip">${m}</span>`).join('')
          : '<span class="ai-model-chip">gemini-2.5-flash-lite</span><span class="ai-model-chip">gemini-2.5-flash</span>';

        this.showFeedback(
          `Connection verified successfully! Google Gemini API is accessible with available models:
           <div class="ai-model-chips">${modelsList}</div>`,
          'success',
          true
        );

        // Reload profiles in case custom models were registered
        await this.loadProfiles();
      } else {
        const errorMsg = res?.error || 'Please add your Google AI Studio API key first';
        this.updateKeyBadge(this.isKeyConfigured);
        this.showFeedback(errorMsg, 'error');
      }
    } catch (err) {
      this.updateKeyBadge(this.isKeyConfigured);
      this.showFeedback(`Connection test failed: ${err.message}`, 'error');
    } finally {
      if (this.dom.testConnBtn) {
        this.dom.testConnBtn.disabled = false;
        this.dom.testConnBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Test Connection
        `;
      }
    }
  }

  /**
   * Loads task profiles and populates the routing table.
   */
  async loadProfiles() {
    if (!this.dom.profilesTableBody) return;

    let profiles = [
      { profile: 'cheap', model: 'gemini-2.5-flash-lite', description: 'Simple content drafts, micro-copy, taglines, and repetitive formatting.' },
      { profile: 'reasoning', model: 'gemini-2.5-flash', description: 'Complex design architectures, component logic, CSS layouts, and heuristics.' },
      { profile: 'vision', model: 'gemini-2.5-flash', description: 'Visual hierarchy inspection, screenshot analysis, and reference design critique.' },
      { profile: 'structured', model: 'gemini-2.5-flash-lite', description: 'Strict JSON schemas, token generation, and structured design seeds.' },
    ];

    let availableModels = [
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ];

    if (this.aiApi?.getProfiles) {
      try {
        const data = await this.aiApi.getProfiles();
        if (data?.profiles && Array.isArray(data.profiles)) {
          profiles = data.profiles;
        }
        if (data?.availableModels && Array.isArray(data.availableModels)) {
          availableModels = data.availableModels;
        }
      } catch (err) {
        console.warn('[SettingsAI] Could not load profiles via IPC:', err);
      }
    }

    this.dom.profilesTableBody.innerHTML = profiles
      .map((item) => {
        const optionsHtml = availableModels
          .map(
            (m) =>
              `<option value="${m.id}" ${m.id === item.model ? 'selected' : ''}>${m.name || m.id}</option>`
          )
          .join('');

        return `
        <tr>
          <td>
            <span class="ai-profile-name-badge">${item.profile}</span>
          </td>
          <td style="color: var(--text-secondary); font-size: 13px;">
            ${item.description}
          </td>
          <td>
            <select class="ai-profile-select" data-profile="${item.profile}">
              ${optionsHtml}
            </select>
          </td>
        </tr>
      `;
      })
      .join('');

    // Attach change handlers on dropdowns
    const selects = this.dom.profilesTableBody.querySelectorAll('.ai-profile-select');
    selects.forEach((select) => {
      select.addEventListener('change', async (e) => {
        const target = e.target;
        const profile = target.getAttribute('data-profile');
        const newModel = target.value;
        if (this.aiApi?.setProfile) {
          try {
            await this.aiApi.setProfile(profile, newModel);
            this.showFeedback(`Task profile "${profile}" remapped to ${newModel}`, 'success');
          } catch (err) {
            console.error('[SettingsAI] Failed to update profile binding:', err);
          }
        }
      });
    });
  }

  /**
   * Retrieves usage metrics and updates cards.
   */
  async loadUsageStats() {
    if (!this.aiApi?.getUsageStats) return;

    try {
      const stats = await this.aiApi.getUsageStats();
      if (this.dom.statRequestsToday) {
        this.dom.statRequestsToday.textContent = (stats?.requestsToday || 0).toLocaleString();
      }
      if (this.dom.statTokensToday) {
        this.dom.statTokensToday.textContent = (stats?.tokensToday || 0).toLocaleString();
      }
    } catch (err) {
      console.warn('[SettingsAI] Usage stats query failed:', err);
    }
  }

  /**
   * Executes a test prompt through the AI Request Queue.
   */
  async handleSendTest() {
    const prompt = this.dom.testPromptInput?.value?.trim();
    if (!prompt) {
      this.showFeedback('Please write a prompt to test.', 'error');
      return;
    }

    if (!this.aiApi?.generate) {
      this.showFeedback('AI generation runs through the Electron Main Process.', 'error');
      return;
    }

    try {
      this.dom.sendTestBtn.disabled = true;
      this.dom.sendTestBtn.textContent = 'Generating...';

      if (this.dom.testResultBox) {
        this.dom.testResultBox.style.display = 'block';
      }
      if (this.dom.testOutputContent) {
        this.dom.testOutputContent.textContent = 'Processing request through queue and rate limiter...';
      }

      const res = await this.aiApi.generate({
        contents: prompt,
        taskProfile: 'cheap',
      });

      if (res?.success && res.data) {
        const text = res.data.text || '(No text returned)';
        const latency = res.data.latencyMs ? `${res.data.latencyMs} ms` : 'N/A';
        const model = res.data.modelUsed || 'gemini-2.5-flash-lite';
        const tokens = res.data.usageMetadata?.totalTokens
          ? `${res.data.usageMetadata.totalTokens} tokens`
          : 'N/A';

        if (this.dom.testMetricModel) this.dom.testMetricModel.textContent = `Model: ${model}`;
        if (this.dom.testMetricTokens) this.dom.testMetricTokens.textContent = `Tokens: ${tokens}`;
        if (this.dom.testMetricLatency) this.dom.testMetricLatency.textContent = `Latency: ${latency}`;
        if (this.dom.testOutputContent) this.dom.testOutputContent.textContent = text;

        await this.loadUsageStats();
      } else {
        const errorMsg = res?.error || 'Please add your Google AI Studio API key first';
        if (this.dom.testOutputContent) {
          this.dom.testOutputContent.textContent = `Error: ${errorMsg}`;
        }
        this.showFeedback(errorMsg, 'error');
      }
    } catch (err) {
      if (this.dom.testOutputContent) {
        this.dom.testOutputContent.textContent = `Execution failed: ${err.message}`;
      }
      this.showFeedback(`Test prompt failed: ${err.message}`, 'error');
    } finally {
      if (this.dom.sendTestBtn) {
        this.dom.sendTestBtn.disabled = false;
        this.dom.sendTestBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          Send Test Prompt
        `;
      }
    }
  }

  /**
   * Displays temporary feedback alert.
   * @param {string} msg
   * @param {'success' | 'error'} type
   * @param {boolean} [isHtml=false]
   */
  showFeedback(msg, type = 'success', isHtml = false) {
    if (!this.dom.connFeedback) return;

    this.dom.connFeedback.className = `ai-connection-feedback ${type}`;
    if (isHtml) {
      this.dom.connFeedback.innerHTML = msg;
    } else {
      this.dom.connFeedback.textContent = msg;
    }

    this.dom.connFeedback.style.display = 'block';

    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    if (type === 'success' && !isHtml) {
      this.feedbackTimer = setTimeout(() => {
        if (this.dom.connFeedback) {
          this.dom.connFeedback.style.display = 'none';
        }
      }, 5000);
    }
  }
}

export const settingsAIController = new SettingsAIController();
if (typeof window !== 'undefined') {
  window.SettingsAIController = settingsAIController;
}

