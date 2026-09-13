/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — SENIOR CHAT CONTROLLER (src/js/chat.js)
 * ==============================================================================
 * Apple-style chat interface for Agent 1: Senior Project Lead.
 * Features:
 * - Conversation management (thread switching, + new consultation, delete)
 * - Real-time typing indicators & message streaming
 * - Vision reference attachments (paperclip, thumbnail previews, lightbox viewer)
 * - Missing-items checklist card embedded in turns
 * - Interactive suggestion chips for zero-typing answers
 * - Instant handoff status linking directly to Orchestrator Task Monitor
 * ==============================================================================
 */

(function () {
  'use strict';

  function getChatApi() {
    return window.chat || window.api?.chat || window.electronAPI?.chat || null;
  }

  function getStoreApi() {
    return window.store || window.api?.store || window.electronAPI?.store || null;
  }

  class ChatController {
    constructor() {
      this.conversations = [];
      this.currentConversationId = null;
      this.currentProject = null;
      this.pendingImages = [];
      this.isSubmitting = false;
      this.typingUnsubscribe = null;
      this.initDomReferences();
      this.bindEvents();
    }

    initDomReferences() {
      this.convListEl = document.getElementById('chat-conversations-list');
      this.btnNewConv = document.getElementById('btn-new-chat');
      this.messagesContainer = document.getElementById('chat-messages-stream');
      this.chatTitleEl = document.getElementById('chat-header-title');
      this.chatSubtitleEl = document.getElementById('chat-header-subtitle');
      this.chatProjectBadge = document.getElementById('chat-project-badge');
      this.chatChecklistBtn = document.getElementById('chat-btn-view-checklist');
      this.typingIndicator = document.getElementById('chat-typing-indicator');
      this.inputEl = document.getElementById('chat-input-textarea');
      this.btnSend = document.getElementById('chat-btn-send');
      this.btnAttach = document.getElementById('chat-btn-attach');
      this.fileInputFallback = document.getElementById('chat-file-input-fallback');
      this.attachmentPreviewBar = document.getElementById('chat-attachment-preview-bar');
      this.suggestionsBar = document.getElementById('chat-suggestions-bar');
      this.statusNotice = document.getElementById('chat-status-notice');

      // Model badge in chat header
      this.modelBadge = document.getElementById('chat-model-badge');
      this.modelBadgeName = document.getElementById('chat-model-badge-name');
      this.modelDot = document.getElementById('chat-model-dot');

      // Lightbox modal elements
      this.lightboxModal = document.getElementById('chat-image-lightbox');
      this.lightboxImg = document.getElementById('chat-lightbox-img');
      this.lightboxClose = document.getElementById('chat-lightbox-close');

      // Checklist modal elements
      this.checklistModal = document.getElementById('chat-checklist-modal');
      this.checklistContent = document.getElementById('chat-checklist-modal-content');
      this.checklistClose = document.getElementById('chat-checklist-close');
    }

    bindEvents() {
      if (this.btnNewConv) {
        this.btnNewConv.addEventListener('click', () => this.createNewConversation());
      }

      if (this.btnSend) {
        this.btnSend.addEventListener('click', () => this.sendMessage());
      }

      if (this.inputEl) {
        this.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        });

        // Auto-expand textarea height
        this.inputEl.addEventListener('input', () => {
          this.inputEl.style.height = 'auto';
          this.inputEl.style.height = `${Math.min(160, this.inputEl.scrollHeight)}px`;
          this.updateSendButtonState();
        });
      }

      if (this.btnAttach) {
        this.btnAttach.addEventListener('click', () => this.handleAttachClick());
      }

      if (this.fileInputFallback) {
        this.fileInputFallback.addEventListener('change', (e) => this.handleFallbackFileInput(e));
      }

      if (this.chatChecklistBtn) {
        this.chatChecklistBtn.addEventListener('click', () => this.openChecklistModal());
      }

      if (this.lightboxClose) {
        this.lightboxClose.addEventListener('click', () => this.closeLightbox());
      }
      if (this.lightboxModal) {
        this.lightboxModal.addEventListener('click', (e) => {
          if (e.target === this.lightboxModal) this.closeLightbox();
        });
      }

      if (this.checklistClose) {
        this.checklistClose.addEventListener('click', () => this.closeChecklistModal());
      }
      if (this.checklistModal) {
        this.checklistModal.addEventListener('click', (e) => {
          if (e.target === this.checklistModal) this.closeChecklistModal();
        });
      }

      if (this.modelBadge) {
        this.modelBadge.addEventListener('click', () => {
          const settingsBtn = document.querySelector('[data-tab="settings"]');
          if (settingsBtn) settingsBtn.click();
          setTimeout(() => {
            const aiSettingsTab = document.querySelector('[data-settings-tab="ai"]');
            if (aiSettingsTab) aiSettingsTab.click();
          }, 50);
        });
      }

      // Listen for window focus to refresh model badge when user returns from settings
      window.addEventListener('focus', () => {
        this.updateActiveModelBadge();
      });

      // Listen for AI config changes broadcast by settings
      window.addEventListener('ai-config-changed', () => {
        this.updateActiveModelBadge();
      });

      // Listen for typing events from main process
      const api = getChatApi();
      if (api && typeof api.onTyping === 'function') {
        this.typingUnsubscribe = api.onTyping(({ isTyping, conversationId }) => {
          if (!this.currentConversationId || Number(this.currentConversationId) === Number(conversationId)) {
            this.setTyping(isTyping);
          }
        });
      }
    }

    /**
     * Initializes and refreshes the chat view.
     */
    async load() {
      await Promise.all([
        this.loadConversations(),
        this.updateActiveModelBadge(),
      ]);
    }

    /**
     * Updates the active model badge in the chat header to verify the active model live.
     */
    async updateActiveModelBadge() {
      try {
        if (!window.ai || typeof window.ai.getActiveConfig !== 'function') {
          if (this.modelBadgeName) this.modelBadgeName.textContent = 'AI Offline';
          if (this.modelDot) this.modelDot.className = 'chat-model-dot unconfigured';
          return;
        }

        const config = await window.ai.getActiveConfig();
        if (config) {
          const modelName = config.model || 'gemini-2.0-flash';
          const isConfigured = Boolean(config.configured);
          
          if (this.modelBadgeName) {
            const pretty = modelName
              .split('-')
              .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
              .join(' ');
            this.modelBadgeName.textContent = pretty;
          }
          if (this.modelDot) {
            this.modelDot.className = isConfigured ? 'chat-model-dot' : 'chat-model-dot unconfigured';
          }
          if (this.modelBadge) {
            this.modelBadge.title = isConfigured
              ? `Active: ${config.provider || 'Google'} (${modelName}) — Click to configure`
              : `API key not configured for ${config.provider || 'Google'} — Click to add key`;
          }
        }
      } catch (err) {
        console.warn('[ChatUI] Could not load active model badge:', err.message);
      }
    }

    /**
     * Fetches all conversations and selects the active or latest thread.
     */
    async loadConversations() {
      const api = getChatApi();
      if (!api) {
        this.showNotice('Chat API is currently unavailable', 'error');
        return;
      }

      try {
        const convs = await api.getConversations();
        this.conversations = Array.isArray(convs) ? convs : [];

        this.renderConversationsList();

        if (this.conversations.length > 0) {
          if (!this.currentConversationId) {
            await this.selectConversation(this.conversations[0].id);
          } else {
            await this.loadMessages(this.currentConversationId);
          }
        } else {
          await this.createNewConversation();
        }
      } catch (err) {
        console.error('[ChatController] loadConversations error:', err);
      }
    }

    /**
     * Renders the left sidebar list of conversation threads.
     */
    renderConversationsList() {
      if (!this.convListEl) return;

      if (this.conversations.length === 0) {
        this.convListEl.innerHTML = `
          <div class="chat-conv-empty">
            <span>No consultations yet</span>
          </div>
        `;
        return;
      }

      this.convListEl.innerHTML = this.conversations
        .map((c) => {
          const isActive = Number(c.id) === Number(this.currentConversationId);
          const timeFormatted = this.formatRelativeTime(c.updated_at || c.created_at);
          const msgSnippet = c.last_message ? this.escapeHtml(c.last_message.slice(0, 48)) : 'New consultation';

          return `
            <div class="chat-conv-item ${isActive ? 'active' : ''}" data-conv-id="${c.id}">
              <div class="chat-conv-item-main">
                <div class="chat-conv-item-title">${this.escapeHtml(c.title || 'Consultation')}</div>
                <div class="chat-conv-item-snippet">${msgSnippet}</div>
                <div class="chat-conv-item-meta">
                  <span class="chat-conv-time">${timeFormatted}</span>
                  ${c.project_name ? `<span class="chat-conv-proj-pill">${this.escapeHtml(c.project_name)}</span>` : ''}
                </div>
              </div>
              <button class="chat-conv-delete-btn" title="Delete conversation" data-delete-conv="${c.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          `;
        })
        .join('');

      // Attach click listeners
      this.convListEl.querySelectorAll('.chat-conv-item').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.chat-conv-delete-btn')) return;
          const convId = el.getAttribute('data-conv-id');
          this.selectConversation(convId);
        });
      });

      this.convListEl.querySelectorAll('.chat-conv-delete-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const convId = btn.getAttribute('data-delete-conv');
          this.deleteConversation(convId);
        });
      });
    }

    /**
     * Creates a fresh conversation.
     */
    async createNewConversation(projectId = null) {
      const api = getChatApi();
      if (!api) return;

      try {
        const newConv = await api.newConversation(projectId);
        if (newConv && newConv.id) {
          this.currentConversationId = newConv.id;
          await this.loadConversations();
          await this.selectConversation(newConv.id);
        }
      } catch (err) {
        console.error('[ChatController] createNewConversation error:', err);
      }
    }

    /**
     * Selects an active conversation thread.
     */
    async selectConversation(convId) {
      this.currentConversationId = Number(convId);
      this.renderConversationsList();

      const conv = this.conversations.find((c) => Number(c.id) === Number(convId));
      if (conv) {
        if (this.chatTitleEl) this.chatTitleEl.textContent = conv.title || 'Senior Project Lead';
        if (this.chatSubtitleEl) {
          this.chatSubtitleEl.textContent = conv.project_name
            ? `Linked to Project: ${conv.project_name}`
            : 'Interactive Requirement Discovery & Architecture';
        }
        if (this.chatProjectBadge) {
          if (conv.project_id) {
            this.chatProjectBadge.style.display = 'inline-flex';
            this.chatProjectBadge.textContent = conv.project_name || `Project #${conv.project_id}`;
            this.chatProjectBadge.onclick = () => {
              if (window.AppNavigator) {
                window.AppNavigator.navigateTo('projects');
                setTimeout(() => {
                  if (window.ProjectsController && window.ProjectsController.openProjectDetail) {
                    window.ProjectsController.openProjectDetail(conv.project_id);
                  }
                }, 100);
              }
            };
          } else {
            this.chatProjectBadge.style.display = 'none';
          }
        }
        if (this.chatChecklistBtn) {
          this.chatChecklistBtn.style.display = conv.project_id ? 'inline-flex' : 'none';
        }
      }

      await this.loadMessages(convId);
    }

    /**
     * Loads and renders messages for the active conversation.
     */
    async loadMessages(convId) {
      const api = getChatApi();
      if (!api || !this.messagesContainer) return;

      try {
        const messages = await api.getMessages(convId);

        if (!messages || messages.length === 0) {
          this.renderEmptyState();
          this.renderSuggestions([
            'Build a modern 3D travel agency website',
            'Next.js + Tailwind + Supabase dashboard',
            'Simple HTML/CSS/JS portfolio',
            'You design it for me (unique premium look)',
          ]);
          return;
        }

        this.messagesContainer.innerHTML = '';
        let lastSuggestions = [];

        messages.forEach((msg) => {
          const bubble = this.createMessageElement(msg);
          this.messagesContainer.appendChild(bubble);

          if (msg.role === 'agent' && msg.extracted?.suggestions?.length > 0) {
            lastSuggestions = msg.extracted.suggestions;
          }
        });

        this.renderSuggestions(lastSuggestions);
        this.scrollToBottom();
      } catch (err) {
        console.error('[ChatController] loadMessages error:', err);
      }
    }

    /**
     * Creates a DOM element for a message turn.
     */
    createMessageElement(msg) {
      const isAgent = msg.role === 'agent';
      const container = document.createElement('div');
      container.className = `chat-message-row ${isAgent ? 'agent' : 'user'}`;

      let imagesHtml = '';
      if (Array.isArray(msg.images) && msg.images.length > 0) {
        imagesHtml = `
          <div class="chat-message-images">
            ${msg.images
              .map((img, idx) => {
                const src = img.data || '';
                return `
                  <div class="chat-img-thumb" data-full-src="${this.escapeHtml(src)}" title="${this.escapeHtml(img.filename || 'Reference Image')}">
                    <img src="${this.escapeHtml(src)}" alt="${this.escapeHtml(img.filename || 'Reference')}" />
                    <span class="chat-img-thumb-caption">${this.escapeHtml(img.filename || 'Reference')}</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        `;
      }

      // Check for checklist card or missing items
      let checklistHtml = '';
      if (isAgent && msg.extracted) {
        const ext = msg.extracted;
        const isDeptHead = ext.author === 'Department Head';

        // Department Head Collapsible Plan Card
        if (ext.departmentHeadPlan && Array.isArray(ext.departmentHeadPlan.phases)) {
          const plan = ext.departmentHeadPlan;
          let totalTasksCount = 0;
          plan.phases.forEach((ph) => {
            if (Array.isArray(ph.tasks)) totalTasksCount += ph.tasks.length;
          });

          checklistHtml += `
            <div class="chat-dept-plan-card">
              <div class="chat-dept-plan-header">
                <div class="chat-dept-plan-badge">
                  <span class="plan-pulse-dot"></span>
                  <span>Execution Graph Compiled (${plan.phases.length} Phases • ${totalTasksCount} Tasks)</span>
                </div>
                <button type="button" class="chat-plan-toggle-btn" id="btn-toggle-plan-${msg.id || Date.now()}">
                  <span>View Details</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
              </div>
              <div class="chat-dept-plan-body" style="display: none;" id="plan-body-${msg.id || Date.now()}">
                <div class="chat-dept-plan-reasoning">${this.escapeHtml(plan.reasoning || '')}</div>
                <div class="chat-dept-plan-phases-list">
                  ${plan.phases.map((phase, pIdx) => `
                    <div class="chat-dept-phase-item">
                      <div class="chat-dept-phase-title">
                        <span class="phase-num">${pIdx + 1}</span>
                        <span>${this.escapeHtml(phase.name)}</span>
                      </div>
                      <div class="chat-dept-phase-desc">${this.escapeHtml(phase.description || '')}</div>
                      <div class="chat-dept-tasks-grid">
                        ${(phase.tasks || []).map((t) => {
                          const isGate = t.id.startsWith('review-') || t.title.toLowerCase().includes('review') || t.title.toLowerCase().includes('gate');
                          return `
                            <div class="chat-dept-task-row ${isGate ? 'task-gate' : ''}">
                              <div class="task-row-main">
                                <span class="task-dept-tag tag-${this.escapeHtml(t.department || 'eng')}">${this.escapeHtml(t.department || 'eng').toUpperCase()}</span>
                                <span class="task-title-text">${this.escapeHtml(t.title)}</span>
                              </div>
                              <span class="task-est-text">${t.estimatedMinutes || 15}m</span>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          `;
        }

        if (Array.isArray(ext.missingItems) && ext.missingItems.length > 0) {
          checklistHtml += `
            <div class="chat-turn-checklist-card">
              <div class="chat-turn-checklist-header">
                <span class="chat-turn-checklist-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                  </svg>
                  Architecture Missing Items (${ext.missingItems.length})
                </span>
                <span class="chat-turn-checklist-pill">Discovery in Progress</span>
              </div>
              <ul class="chat-turn-checklist-items">
                ${ext.missingItems.map((item) => `<li><span class="checklist-bullet">•</span> ${this.escapeHtml(item)}</li>`).join('')}
              </ul>
            </div>
          `;
        }

        // Handoff card if just created
        if (ext.justCreatedProject) {
          checklistHtml += `
            <div class="chat-handoff-banner">
              <div class="chat-handoff-icon">🚀</div>
              <div class="chat-handoff-text">
                <div class="chat-handoff-title">Project Initialized & Handed Off</div>
                <div class="chat-handoff-sub">Project Knowledge Store populated. Task graph "project-handoff" dispatched to Orchestrator.</div>
              </div>
              <button class="chat-handoff-btn" id="btn-view-task-monitor">View Task Monitor</button>
            </div>
          `;
        }

        // Review Gate interactive card
        if (ext.isReviewGate || msg.intent === 'REVIEW_GATE') {
          checklistHtml += `
            <div class="chat-review-gate-card">
              <div class="chat-review-gate-header">
                <span>🛡️ Visual Design Review Gate Active</span>
              </div>
              <p style="font-size: 13px; color: var(--text-2); margin: 4px 0 10px;">
                Pipeline execution is paused waiting for your inspection of <strong>${this.escapeHtml(ext.taskTitle || ext.summary || 'Visual Design Direction')}</strong>.
              </p>
              <div class="chat-review-gate-actions">
                <button class="btn-gate-approve" id="btn-chat-approve-${msg.id || Date.now()}" data-graph-id="${this.escapeHtml(ext.graphId || '')}" data-node-id="${this.escapeHtml(ext.nodeId || ext.gateId || '')}">
                  ✓ Approve Direction
                </button>
                <button class="btn-gate-reject" id="btn-chat-reject-${msg.id || Date.now()}" data-graph-id="${this.escapeHtml(ext.graphId || '')}" data-node-id="${this.escapeHtml(ext.nodeId || ext.gateId || '')}">
                  ↻ Request Revision
                </button>
              </div>
            </div>
          `;
        }
      }

      const formattedText = this.formatMessageText(msg.text || '');
      const isError = Boolean(msg.isError || msg.intent === 'error');
      const isDeptHead = isAgent && msg.extracted?.author === 'Department Head';
      const bubbleClass = `chat-bubble${isError ? ' error-bubble' : ''}${isDeptHead ? ' dept-head-bubble' : ''}`;

      const authorLabel = isAgent
        ? (isDeptHead ? 'Department Head (Agent 2)' : (isError ? 'Senior Project Lead (Error)' : 'Senior Project Lead (Agent 1)'))
        : 'You';

      const avatarContent = isAgent
        ? (isError ? '<span style="color:var(--danger-color);">⚠️</span>' : (isDeptHead ? '<span>DH</span>' : '<span>SP</span>'))
        : '<span>You</span>';

      container.innerHTML = `
        <div class="chat-avatar ${isDeptHead ? 'avatar-dept-head' : ''}">
          ${avatarContent}
        </div>
        <div class="${bubbleClass}">
          <div class="chat-bubble-header">
            <span class="chat-author-name ${isDeptHead ? 'author-dept-head' : ''}">${authorLabel}</span>
            <span class="chat-time">${this.formatMessageTime(msg.created_at)}</span>
          </div>
          ${imagesHtml}
          <div class="chat-bubble-content">${formattedText}</div>
          ${checklistHtml}
        </div>
      `;

      // Wire plan toggle button if present
      const togglePlanBtn = container.querySelector(`[id^="btn-toggle-plan-"]`);
      if (togglePlanBtn) {
        togglePlanBtn.addEventListener('click', () => {
          const body = container.querySelector('.chat-dept-plan-body');
          if (body) {
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'block' : 'none';
            togglePlanBtn.querySelector('span').textContent = isHidden ? 'Hide Details' : 'View Details';
            togglePlanBtn.classList.toggle('expanded', isHidden);
          }
        });
      }

      // Attach image lightbox triggers
      container.querySelectorAll('.chat-img-thumb').forEach((thumb) => {
        thumb.addEventListener('click', () => {
          const src = thumb.getAttribute('data-full-src');
          this.openLightbox(src);
        });
      });

      // Attach handoff button click to navigate to dashboard Task Monitor
      const handoffBtn = container.querySelector('#btn-view-task-monitor');
      if (handoffBtn) {
        handoffBtn.addEventListener('click', () => {
          if (window.AppNavigator) {
            window.AppNavigator.navigateTo('dashboard');
          }
        });
      }

      // Attach review gate approve button
      const gateApproveBtn = container.querySelector('.btn-gate-approve');
      if (gateApproveBtn) {
        gateApproveBtn.addEventListener('click', async () => {
          const graphId = gateApproveBtn.getAttribute('data-graph-id');
          const nodeId = gateApproveBtn.getAttribute('data-node-id');
          gateApproveBtn.disabled = true;
          gateApproveBtn.textContent = 'Approving...';

          try {
            const api = window.orchestrator || window.api?.orchestrator || window.electronAPI?.orchestrator;
            if (api && typeof api.respondToReview === 'function') {
              await api.respondToReview({
                graphId,
                nodeId,
                approved: true,
                feedback: 'Approved by user via Chat',
              });
            }
            gateApproveBtn.textContent = '✓ Approved';
            this.showNotice('Visual design approved! Resuming execution pipeline.', 'success');
            await this.loadMessages(this.currentConversationId);
          } catch (err) {
            console.error('[Chat] Review approve error:', err);
            gateApproveBtn.disabled = false;
            gateApproveBtn.textContent = '✓ Approve Direction';
          }
        });
      }

      // Attach review gate reject button
      const gateRejectBtn = container.querySelector('.btn-gate-reject');
      if (gateRejectBtn) {
        gateRejectBtn.addEventListener('click', async () => {
          const graphId = gateRejectBtn.getAttribute('data-graph-id');
          const nodeId = gateRejectBtn.getAttribute('data-node-id');
          const feedback = prompt('Please describe the design revisions you would like:');
          if (feedback === null) return;

          gateRejectBtn.disabled = true;
          gateRejectBtn.textContent = 'Submitting...';

          try {
            const api = window.orchestrator || window.api?.orchestrator || window.electronAPI?.orchestrator;
            if (api && typeof api.respondToReview === 'function') {
              await api.respondToReview({
                graphId,
                nodeId,
                approved: false,
                feedback,
              });
            }
            gateRejectBtn.textContent = '↻ Revision Requested';
            this.showNotice('Revision requested. Regenerating design direction...', 'info');
            await this.loadMessages(this.currentConversationId);
          } catch (err) {
            console.error('[Chat] Review reject error:', err);
            gateRejectBtn.disabled = false;
            gateRejectBtn.textContent = '↻ Request Revision';
          }
        });
      }

      return container;
    }

    /**
     * Renders clean initial welcome state when no messages exist yet.
     */
    renderEmptyState() {
      if (!this.messagesContainer) return;

      this.messagesContainer.innerHTML = `
        <div class="chat-empty-state">
          <div class="chat-empty-icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h2 class="chat-empty-title">Meet Your Senior Project Lead</h2>
          <p class="chat-empty-desc">
            You only need to type in chat — zero manual forms, zero dropdowns. Describe your vision, attach reference mockups, or answer a few clarifying questions.
          </p>

          <div class="chat-quick-starters">
            <div class="chat-starter-card" data-prompt="Build me a modern 3D travel agency website with a dark twilight aesthetic, hero booking banner, and destination cards.">
              <span class="chat-starter-icon">🌍</span>
              <div class="chat-starter-info">
                <strong>3D Travel Agency Site</strong>
                <span>Dark luxury palette, high-contrast typography, destination showcase</span>
              </div>
            </div>
            <div class="chat-starter-card" data-prompt="Create a Next.js + Tailwind + shadcn SaaS analytics dashboard with telemetry charts and Supabase backend timing deferred.">
              <span class="chat-starter-icon">📊</span>
              <div class="chat-starter-info">
                <strong>SaaS Analytics Dashboard</strong>
                <span>Next.js stack, balanced density, deferred database configuration</span>
              </div>
            </div>
            <div class="chat-starter-card" data-prompt="Design a clean minimalist portfolio website for a product designer. You design it for me with unique, high-craft aesthetics.">
              <span class="chat-starter-icon">✨</span>
              <div class="chat-starter-info">
                <strong>Product Designer Portfolio</strong>
                <span>Self-design rule: unique Apple-inspired minimalism</span>
              </div>
            </div>
          </div>
        </div>
      `;

      this.messagesContainer.querySelectorAll('.chat-starter-card').forEach((card) => {
        card.addEventListener('click', () => {
          const prompt = card.getAttribute('data-prompt');
          if (this.inputEl) {
            this.inputEl.value = prompt;
            this.inputEl.focus();
            this.updateSendButtonState();
          }
        });
      });
    }

    /**
     * Renders clickable suggestions chips above input bar.
     */
    renderSuggestions(suggestions) {
      if (!this.suggestionsBar) return;

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        this.suggestionsBar.style.display = 'none';
        this.suggestionsBar.innerHTML = '';
        return;
      }

      this.suggestionsBar.style.display = 'flex';
      this.suggestionsBar.innerHTML = suggestions
        .map(
          (s) => `
          <button class="chat-suggestion-chip" type="button">
            ${this.escapeHtml(s)}
          </button>
        `
        )
        .join('');

      this.suggestionsBar.querySelectorAll('.chat-suggestion-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const text = chip.textContent.trim();
          if (this.inputEl) {
            this.inputEl.value = text;
            this.sendMessage();
          }
        });
      });
    }

    /**
     * Sends the current user message and attached images to Senior Chat Agent.
     */
    async sendMessage() {
      if (this.isSubmitting) return;

      const text = (this.inputEl ? this.inputEl.value : '').trim();
      const hasImages = this.pendingImages.length > 0;

      if (!text && !hasImages) return;

      const api = getChatApi();
      if (!api) {
        this.showNotice('Chat system unavailable', 'error');
        return;
      }

      this.isSubmitting = true;
      this.updateSendButtonState();

      // Clear input and attachment bar
      const messageText = text;
      const attachedImages = [...this.pendingImages];
      this.pendingImages = [];
      this.renderAttachmentPreviews();
      if (this.inputEl) {
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';
      }

      // Optimistically render user message in UI
      const optimisticMsg = {
        role: 'user',
        text: messageText,
        images: attachedImages,
        created_at: new Date().toISOString(),
      };

      // Remove empty state if present
      const emptyState = this.messagesContainer.querySelector('.chat-empty-state');
      if (emptyState) emptyState.remove();

      const userElem = this.createMessageElement(optimisticMsg);
      this.messagesContainer.appendChild(userElem);
      this.scrollToBottom();

      // Show typing indicator
      this.setTyping(true);

      try {
        const response = await api.sendMessage({
          conversationId: this.currentConversationId,
          text: messageText,
          images: attachedImages,
        });

        this.setTyping(false);

        if (response && response.success) {
          if (response.conversationId) {
            this.currentConversationId = response.conversationId;
          }

          if (response.agentMessage) {
            const agentElem = this.createMessageElement(response.agentMessage);
            this.messagesContainer.appendChild(agentElem);
            this.scrollToBottom();
          }

          if (response.suggestions) {
            this.renderSuggestions(response.suggestions);
          }

          // Refresh conversations to show new title/message snippet
          await this.loadConversations();
        } else {
          const errMsg = response?.error || 'Failed to generate agent response';
          this.showNotice(errMsg, 'error');
          const errorElem = this.createMessageElement({
            role: 'agent',
            text: `⚠️ **AI Model Error**: ${errMsg}\n\nPlease check your API key and active model in **Settings > AI Models**.`,
            created_at: new Date().toISOString(),
            isError: true,
          });
          this.messagesContainer.appendChild(errorElem);
          this.scrollToBottom();
        }
      } catch (err) {
        console.error('[ChatController] sendMessage error:', err);
        this.setTyping(false);
        const errMsg = err.message || 'Error communicating with Senior Chat Agent';
        this.showNotice(errMsg, 'error');
        const errorElem = this.createMessageElement({
          role: 'agent',
          text: `⚠️ **Error**: ${errMsg}\n\nPlease verify your network and AI configuration in **Settings > AI Models**.`,
          created_at: new Date().toISOString(),
          isError: true,
        });
        this.messagesContainer.appendChild(errorElem);
        this.scrollToBottom();
      } finally {
        this.isSubmitting = false;
        this.updateSendButtonState();
      }
    }

    /**
     * Handles image attachment click (Electron native dialog or web fallback).
     */
    async handleAttachClick() {
      const api = getChatApi();
      if (api && typeof api.attachImage === 'function') {
        try {
          const res = await api.attachImage();
          if (res && res.success && res.image) {
            this.pendingImages.push(res.image);
            this.renderAttachmentPreviews();
            this.updateSendButtonState();
            return;
          }
        } catch (e) {
          console.warn('[ChatController] Native attach failed, trying fallback input:', e.message);
        }
      }

      if (this.fileInputFallback) {
        this.fileInputFallback.click();
      }
    }

    /**
     * Fallback file reader for non-Electron or browser preview testing.
     */
    handleFallbackFileInput(e) {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
          this.pendingImages.push({
            filename: file.name,
            mimeType: file.type || 'image/png',
            data: loadEvent.target.result,
            size: file.size,
          });
          this.renderAttachmentPreviews();
          this.updateSendButtonState();
        };
        reader.readAsDataURL(file);
      });

      // Reset file input
      this.fileInputFallback.value = '';
    }

    /**
     * Renders pending image attachments in preview tray above input.
     */
    renderAttachmentPreviews() {
      if (!this.attachmentPreviewBar) return;

      if (this.pendingImages.length === 0) {
        this.attachmentPreviewBar.style.display = 'none';
        this.attachmentPreviewBar.innerHTML = '';
        return;
      }

      this.attachmentPreviewBar.style.display = 'flex';
      this.attachmentPreviewBar.innerHTML = this.pendingImages
        .map(
          (img, idx) => `
          <div class="chat-attachment-pill">
            <img src="${this.escapeHtml(img.data)}" alt="Preview" class="chat-attachment-thumb" />
            <span class="chat-attachment-name">${this.escapeHtml(img.filename || 'Image')}</span>
            <button type="button" class="chat-attachment-remove" data-remove-idx="${idx}" title="Remove image">×</button>
          </div>
        `
        )
        .join('');

      this.attachmentPreviewBar.querySelectorAll('.chat-attachment-remove').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-remove-idx'));
          this.pendingImages.splice(idx, 1);
          this.renderAttachmentPreviews();
          this.updateSendButtonState();
        });
      });
    }

    /**
     * Controls the pulsing typing indicator.
     */
    setTyping(isTyping) {
      if (!this.typingIndicator) return;
      if (isTyping) {
        this.typingIndicator.style.display = 'flex';
        this.scrollToBottom();
      } else {
        this.typingIndicator.style.display = 'none';
      }
    }

    /**
     * Updates disabled state of the send button.
     */
    updateSendButtonState() {
      if (!this.btnSend) return;
      const hasText = this.inputEl && this.inputEl.value.trim().length > 0;
      const hasImages = this.pendingImages.length > 0;
      this.btnSend.disabled = this.isSubmitting || (!hasText && !hasImages);
    }

    /**
     * Smoothly scrolls message stream to bottom.
     */
    scrollToBottom() {
      if (!this.messagesContainer) return;
      requestAnimationFrame(() => {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      });
    }

    /**
     * Deletes a conversation thread.
     */
    async deleteConversation(convId) {
      const api = getChatApi();
      if (!api) return;

      try {
        await api.deleteConversation(convId);
        if (Number(this.currentConversationId) === Number(convId)) {
          this.currentConversationId = null;
        }
        await this.loadConversations();
      } catch (err) {
        console.error('[ChatController] deleteConversation error:', err);
      }
    }

    /**
     * Opens image lightbox modal.
     */
    openLightbox(src) {
      if (!this.lightboxModal || !this.lightboxImg) return;
      this.lightboxImg.src = src;
      this.lightboxModal.classList.add('active');
    }

    closeLightbox() {
      if (!this.lightboxModal) return;
      this.lightboxModal.classList.remove('active');
      if (this.lightboxImg) this.lightboxImg.src = '';
    }

    /**
     * Opens full project checklist modal with interactive checkboxes.
     */
    async openChecklistModal() {
      if (!this.checklistModal || !this.checklistContent) return;

      const conv = this.conversations.find((c) => Number(c.id) === Number(this.currentConversationId));
      if (!conv || !conv.project_id) return;

      const api = getChatApi();
      if (!api) return;

      try {
        const checklist = await api.getChecklist(conv.project_id);
        const items = checklist && Array.isArray(checklist.items) ? checklist.items : [];

        this.checklistContent.innerHTML = `
          <div class="checklist-modal-header">
            <h3>Project Checklist & Missing Items</h3>
            <p>Single source of truth tracking all architectural requirements for <strong>${this.escapeHtml(conv.project_name || 'Project')}</strong>.</p>
          </div>
          <div class="checklist-items-list">
            ${items
              .map(
                (item) => `
              <div class="checklist-interactive-row ${item.done ? 'done' : 'pending'}" data-item-id="${item.id}">
                <label class="checklist-interactive-label">
                  <input type="checkbox" class="checklist-checkbox" data-item-id="${item.id}" ${item.done ? 'checked' : ''} />
                  <span class="checklist-item-text">${this.escapeHtml(item.text)}</span>
                </label>
                <span class="checklist-status-badge ${item.done ? 'badge-done' : 'badge-pending'}">
                  ${item.done ? 'Completed' : 'Pending'}
                </span>
              </div>
            `
              )
              .join('')}
          </div>
        `;

        this.checklistContent.querySelectorAll('.checklist-checkbox').forEach((checkbox) => {
          checkbox.addEventListener('change', async (e) => {
            const itemId = e.target.getAttribute('data-item-id');
            await api.markChecklistDone(conv.project_id, itemId);
            this.openChecklistModal(); // Re-render
          });
        });

        this.checklistModal.classList.add('active');
      } catch (err) {
        console.error('[ChatController] openChecklistModal error:', err);
      }
    }

    closeChecklistModal() {
      if (!this.checklistModal) return;
      this.checklistModal.classList.remove('active');
    }

    /**
     * Formats raw text with markdown paragraphs, bolding, and lists.
     */
    formatMessageText(rawText) {
      if (!rawText) return '';
      let escaped = this.escapeHtml(rawText);

      // Markdown bold: **text**
      escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      // Inline code: `code`
      escaped = escaped.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

      // Unordered lists: lines starting with "- " or "* "
      const lines = escaped.split('\n');
      let inList = false;
      let output = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/^(\-|\*)\s+/.test(line)) {
          if (!inList) {
            output += '<ul class="chat-bullet-list">';
            inList = true;
          }
          output += `<li>${line.replace(/^(\-|\*)\s+/, '')}</li>`;
        } else {
          if (inList) {
            output += '</ul>';
            inList = false;
          }
          if (line.length > 0) {
            output += `<p>${line}</p>`;
          }
        }
      }
      if (inList) output += '</ul>';

      return output || `<p>${escaped}</p>`;
    }

    formatRelativeTime(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diffSec < 60) return 'just now';
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } catch {
        return '';
      }
    }

    formatMessageTime(dateStr) {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    }

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    showNotice(text, type = 'info') {
      if (!this.statusNotice) return;
      this.statusNotice.textContent = text;
      this.statusNotice.className = `chat-notice-banner ${type}`;
      this.statusNotice.style.display = 'block';

      setTimeout(() => {
        if (this.statusNotice) {
          this.statusNotice.style.display = 'none';
        }
      }, 4000);
    }
  }

  // Expose on window
  window.ChatController = new ChatController();

  document.addEventListener('DOMContentLoaded', () => {
    window.ChatController.initDomReferences();
    window.ChatController.bindEvents();
  });
})();
