/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — PROJECT DETAIL CONTROLLER (project-detail.js)
 * ==============================================================================
 * Manages the Project Knowledge Store view in the renderer process.
 * Displays and mutates the 7 canonical project documents:
 * 1. Header: Meta, Status badge, Type badge, Export ZIP, Delete
 * 2. Pages: Sequential page list, status changes, reordering, add/remove
 * 3. Design Tokens: Visual swatches, typography, spacing, radius, version history, update
 * 4. Review Log: Page-by-page verdict timeline (approved, rejected, change_requested)
 * 5. Architectural Decisions: Scope-enforced decisions (global, page, component)
 * 6. Knowledge Store: Collapsible raw JSON document inspector
 * ==============================================================================
 */

(function () {
  let currentProjectId = null;
  let currentProjectData = null;
  let activeKnowledgeTab = 'brief';

  function getStoreApi() {
    if (window.store) return window.store;
    if (window.api && window.api.store) return window.api.store;
    if (window.electronAPI && window.electronAPI.store) return window.electronAPI.store;
    return null;
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'Just now';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  function formatTypeLabel(type) {
    switch (type) {
      case 'saas-dashboard':
      case 'saas_dashboard':
        return 'SaaS Dashboard';
      case 'ui-only':
      case 'ui_only':
        return 'UI Only';
      case 'custom':
        return 'Custom';
      case 'website':
      default:
        return 'Website';
    }
  }

  /**
   * Opens and renders the project detail view for a specific project ID.
   * @param {string|number} projectId
   */
  async function openProject(projectId) {
    currentProjectId = projectId;
    const store = getStoreApi();

    if (window.AppNavigator) {
      window.AppNavigator.navigateTo('project-detail');
    }

    const container = document.getElementById('project-detail-content');
    if (container) {
      container.innerHTML = `
        <div class="pdetail-loading">
          <div class="ai-spinner"></div>
          <span>Loading Project Knowledge Store...</span>
        </div>
      `;
    }

    try {
      if (!store) {
        throw new Error('Knowledge Store API bridge unavailable');
      }

      const res = await store.getProject(projectId);
      if (!res || !res.success || !res.data) {
        throw new Error(res?.error || 'Failed to load project knowledge store');
      }

      currentProjectData = res.data;
      render();
    } catch (err) {
      console.error('[ProjectDetail] Failed to load project:', err);
      if (container) {
        container.innerHTML = `
          <div class="card pdetail-error-card">
            <h3>Failed to Load Knowledge Store</h3>
            <p>${escapeHtml(err.message)}</p>
            <button class="btn btn-secondary" id="btn-pdetail-back-error">
              &larr; Back to Projects
            </button>
          </div>
        `;
        const backBtn = document.getElementById('btn-pdetail-back-error');
        if (backBtn) {
          backBtn.addEventListener('click', () => {
            if (window.AppNavigator) window.AppNavigator.navigateTo('projects');
          });
        }
      }
    }
  }

  /**
   * Refreshes the active project data.
   */
  async function reloadActiveProject() {
    if (!currentProjectId) return;
    const store = getStoreApi();
    if (!store) return;
    try {
      const res = await store.getProject(currentProjectId);
      if (res && res.success && res.data) {
        currentProjectData = res.data;
        render();
      }
    } catch (err) {
      console.error('[ProjectDetail] Refresh failed:', err);
    }
  }

  /**
   * Renders the complete project detail interface.
   */
  function render() {
    const container = document.getElementById('project-detail-content');
    if (!container || !currentProjectData) return;

    const { project, brief, seed, tokens, pages, reviewLog, decisions } = currentProjectData;

    container.innerHTML = `
      <!-- A) TOP HEADER BAR -->
      <div class="pdetail-header-card card">
        <div class="pdetail-header-left">
          <button class="btn btn-secondary btn-sm" id="btn-pdetail-back" title="Return to Projects">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Projects</span>
          </button>
          <div class="pdetail-title-group">
            <div class="pdetail-title-row">
              <h1 class="pdetail-title" id="pdetail-project-name">${escapeHtml(project.name)}</h1>
              <span class="project-type-badge badge-type-${project.type}">${formatTypeLabel(project.type)}</span>
              <span class="status-pill status-${project.status || 'draft'}">${project.status || 'draft'}</span>
            </div>
            <p class="pdetail-desc">${escapeHtml(project.description || brief.userRequirements || 'No description provided.')}</p>
            <div class="pdetail-meta-row">
              <span>Created ${formatDate(project.created_at)}</span>
              <span>&bull;</span>
              <span>Updated ${formatDate(project.updated_at)}</span>
              <span>&bull;</span>
              <span class="pdetail-folder-path" title="${escapeHtml(project.folder_path || '')}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                ${escapeHtml(project.folder_path ? project.folder_path.split(/[\\/]/).slice(-2).join('/') : 'Knowledge Store Active')}
              </span>
            </div>
          </div>
        </div>

        <div class="pdetail-header-actions">
          <button class="btn btn-secondary btn-sm" id="btn-export-project" title="Export Project Knowledge Store as ZIP bundle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Export ZIP</span>
          </button>
          <button class="btn btn-danger btn-sm" id="btn-delete-active-project" title="Delete this project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Delete</span>
          </button>
        </div>
      </div>

      <!-- INLINE STATUS MESSAGE -->
      <div id="pdetail-toast" class="pdetail-toast" style="display: none;"></div>

      <!-- MAIN SPLIT / SECTIONS -->
      <div class="pdetail-body-grid">
        <!-- LEFT COLUMN: PAGES & REVIEWS -->
        <div class="pdetail-column">
          <!-- B) PAGES SECTION -->
          <div class="card pdetail-card">
            <div class="pdetail-card-header">
              <div class="pdetail-card-title-group">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                <h3>Pages Workflow</h3>
                <span class="pdetail-count-badge">${pages.pages.length}</span>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-open-add-page">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Add Page</span>
              </button>
            </div>

            <div class="pdetail-card-desc">
              Sequential page specifications and review statuses tracked by the knowledge store.
            </div>

            <!-- Page List -->
            <div class="pdetail-pages-list" id="pdetail-pages-list">
              ${renderPagesList(pages.pages)}
            </div>
          </div>

          <!-- D) REVIEW LOG SECTION -->
          <div class="card pdetail-card">
            <div class="pdetail-card-header">
              <div class="pdetail-card-title-group">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                </svg>
                <h3>Review History Log</h3>
                <span class="pdetail-count-badge">${reviewLog.entries.length}</span>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-open-add-review">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Log Review</span>
              </button>
            </div>

            <div class="pdetail-card-desc">
              Verbatim user review feedback guiding agent iterations page-by-page.
            </div>

            <div class="pdetail-review-list">
              ${renderReviewLog(reviewLog.entries, pages.pages)}
            </div>
          </div>

          <!-- E) ARCHITECTURAL DECISIONS SECTION -->
          <div class="card pdetail-card">
            <div class="pdetail-card-header">
              <div class="pdetail-card-title-group">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <h3>Scope-Enforced Decisions</h3>
                <span class="pdetail-count-badge">${decisions.entries.length}</span>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-open-add-decision">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Log Decision</span>
              </button>
            </div>

            <div class="pdetail-card-desc">
              Enforces architectural boundaries: global changes vs. page or component isolated edits.
            </div>

            <div class="pdetail-decisions-list">
              ${renderDecisions(decisions.entries)}
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: TOKENS & KNOWLEDGE VIEWER -->
        <div class="pdetail-column">
          <!-- C) DESIGN TOKENS SECTION -->
          <div class="card pdetail-card">
            <div class="pdetail-card-header">
              <div class="pdetail-card-title-group">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="13.5" cy="6.5" r=".5"></circle>
                  <circle cx="17.5" cy="10.5" r=".5"></circle>
                  <circle cx="8.5" cy="7.5" r=".5"></circle>
                  <circle cx="6.5" cy="12.5" r=".5"></circle>
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
                </svg>
                <h3>Design Tokens</h3>
                <span class="pdetail-version-badge">v${tokens.version || 1}</span>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-open-update-tokens">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>Update Tokens</span>
              </button>
            </div>

            <div class="pdetail-card-desc">
              Semantic tokens versioned with change justifications. History is permanently preserved.
            </div>

            <!-- Visual Color Swatches Grid -->
            <div class="token-subheading">Color Palette</div>
            <div class="token-swatches-grid">
              ${renderColorSwatches(tokens.colors)}
            </div>

            <!-- Typography & Scales -->
            <div class="token-subheading">Typography</div>
            <div class="token-typography-box">
              <div class="token-font-row">
                <span class="token-key">Display:</span>
                <span class="token-val font-display-preview">${escapeHtml(tokens.typography?.displayFont || 'Outfit')}</span>
              </div>
              <div class="token-font-row">
                <span class="token-key">Body:</span>
                <span class="token-val">${escapeHtml(tokens.typography?.bodyFont || 'Outfit')}</span>
              </div>
              <div class="token-scales-row">
                ${Object.entries(tokens.typography?.scale || {}).map(([k, v]) => `
                  <span class="token-scale-chip"><strong>${k.toUpperCase()}</strong>: ${v}</span>
                `).join('')}
              </div>
            </div>

            <!-- Spacing & Radii -->
            <div class="token-subheading">Spacing & Radius</div>
            <div class="token-metrics-row">
              <div class="token-metric-group">
                <span class="token-key">Spacing:</span>
                <div class="token-chips-wrap">
                  ${Object.entries(tokens.spacing || {}).map(([k, v]) => `
                    <span class="token-chip">${k}: ${v}</span>
                  `).join('')}
                </div>
              </div>
              <div class="token-metric-group">
                <span class="token-key">Radius:</span>
                <div class="token-chips-wrap">
                  ${Object.entries(tokens.radius || {}).map(([k, v]) => `
                    <span class="token-chip">${k}: ${v}</span>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Token Version History -->
            <div class="token-subheading">Version History</div>
            <div class="token-version-history">
              ${renderTokenVersions(tokens.versions)}
            </div>
          </div>

          <!-- F) RAW KNOWLEDGE DOCUMENTS (Collapsible) -->
          <div class="card pdetail-card">
            <div class="pdetail-card-header">
              <div class="pdetail-card-title-group">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                <h3>Knowledge Store Documents</h3>
              </div>
              <button class="btn btn-text btn-sm" id="btn-copy-knowledge-json">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copy JSON</span>
              </button>
            </div>

            <div class="pdetail-card-desc">
              Raw single-source-of-truth documents read and written by future agents.
            </div>

            <!-- Tab Pills for Document Selection -->
            <div class="knowledge-tabs-bar">
              <button class="k-tab-btn ${activeKnowledgeTab === 'brief' ? 'active' : ''}" data-doc="brief">brief.json</button>
              <button class="k-tab-btn ${activeKnowledgeTab === 'seed' ? 'active' : ''}" data-doc="seed">design-seed.json</button>
              <button class="k-tab-btn ${activeKnowledgeTab === 'tokens' ? 'active' : ''}" data-doc="tokens">design-tokens.json</button>
              <button class="k-tab-btn ${activeKnowledgeTab === 'pages' ? 'active' : ''}" data-doc="pages">pages.json</button>
              <button class="k-tab-btn ${activeKnowledgeTab === 'review-log' ? 'active' : ''}" data-doc="review-log">review-log.json</button>
              <button class="k-tab-btn ${activeKnowledgeTab === 'decisions' ? 'active' : ''}" data-doc="decisions">decisions.json</button>
            </div>

            <!-- Seed Placeholder Action if Seed Tab Active -->
            <div id="seed-action-bar" style="display: ${activeKnowledgeTab === 'seed' ? 'flex' : 'none'}; margin-bottom: 10px; justify-content: flex-end;">
              <button class="btn btn-secondary btn-sm" id="btn-regen-seed">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                <span>Generate Seed Placeholder</span>
              </button>
            </div>

            <!-- JSON Pre Viewer -->
            <pre class="knowledge-json-viewer" id="knowledge-json-viewer">${getActiveKnowledgeJson()}</pre>
          </div>
        </div>
      </div>
    `;

    attachEventListeners();
  }

  /**
   * Generates formatted JSON for the active knowledge tab.
   */
  function getActiveKnowledgeJson() {
    if (!currentProjectData) return '{}';
    let data;
    switch (activeKnowledgeTab) {
      case 'brief':
        data = currentProjectData.brief;
        break;
      case 'seed':
        data = currentProjectData.seed;
        break;
      case 'tokens':
        data = currentProjectData.tokens;
        break;
      case 'pages':
        data = currentProjectData.pages;
        break;
      case 'review-log':
        data = currentProjectData.reviewLog;
        break;
      case 'decisions':
        data = currentProjectData.decisions;
        break;
      default:
        data = currentProjectData.brief;
    }
    return escapeHtml(JSON.stringify(data, null, 2));
  }

  function renderPagesList(pages = []) {
    if (!pages || pages.length === 0) {
      return '<div class="pdetail-empty-item">No pages specified. Click "Add Page" to begin.</div>';
    }

    return pages.map((page, index) => {
      const isFirst = index === 0;
      const isLast = index === pages.length - 1;
      return `
        <div class="page-row" data-id="${page.pageId}">
          <div class="page-row-left">
            <span class="page-order-num">${index + 1}</span>
            <div class="page-info">
              <span class="page-name">${escapeHtml(page.name)}</span>
              <span class="page-id">${escapeHtml(page.pageId)}</span>
            </div>
          </div>

          <div class="page-row-right">
            <!-- Status Dropdown Selector -->
            <select class="form-select form-select-sm page-status-select" data-id="${page.pageId}">
              <option value="pending" ${page.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="designing" ${page.status === 'designing' ? 'selected' : ''}>Designing</option>
              <option value="in_review" ${page.status === 'in_review' ? 'selected' : ''}>In Review</option>
              <option value="approved" ${page.status === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="rejected" ${page.status === 'rejected' ? 'selected' : ''}>Rejected</option>
              <option value="redesigning" ${page.status === 'redesigning' ? 'selected' : ''}>Redesigning</option>
            </select>

            <!-- Reorder Controls -->
            <div class="page-reorder-btns">
              <button class="btn-icon btn-page-move-up" data-id="${page.pageId}" ${isFirst ? 'disabled' : ''} title="Move Up">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </button>
              <button class="btn-icon btn-page-move-down" data-id="${page.pageId}" ${isLast ? 'disabled' : ''} title="Move Down">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>

            <!-- Remove Page -->
            <button class="btn-icon btn-page-remove" data-id="${page.pageId}" data-name="${escapeHtml(page.name)}" title="Remove page">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderColorSwatches(colors = {}) {
    return Object.entries(colors).map(([key, hex]) => `
      <div class="color-swatch-card" title="${key}: ${hex}">
        <div class="color-swatch-circle" style="background-color: ${hex};"></div>
        <div class="color-swatch-info">
          <span class="color-swatch-key">${key}</span>
          <span class="color-swatch-hex">${hex}</span>
        </div>
      </div>
    `).join('');
  }

  function renderTokenVersions(versions = []) {
    if (!versions || versions.length === 0) {
      return '<div class="pdetail-empty-item">Initial v1 generation active.</div>';
    }

    return versions.map((v) => `
      <div class="token-version-row">
        <div class="token-version-left">
          <span class="token-version-tag">v${v.version}</span>
          <span class="token-version-reason">${escapeHtml(v.reason || 'Token adjustment')}</span>
        </div>
        <span class="token-version-time">${formatDate(v.timestamp)}</span>
      </div>
    `).join('');
  }

  function renderReviewLog(entries = [], pages = []) {
    if (!entries || entries.length === 0) {
      return '<div class="pdetail-empty-item">No review verdicts recorded yet. The page-by-page review loop will log feedback here.</div>';
    }

    const pageMap = new Map((pages || []).map((p) => [p.pageId, p.name]));

    return entries.slice().reverse().map((entry) => {
      const pageName = pageMap.get(entry.pageId) || entry.pageId || 'Project-Wide';
      const verdict = entry.userVerdict || 'approved';
      const verdictClass = `verdict-${verdict}`;
      const verdictLabel = verdict.replace(/_/g, ' ').toUpperCase();

      return `
        <div class="review-entry-card">
          <div class="review-entry-header">
            <div class="review-entry-meta">
              <span class="verdict-pill ${verdictClass}">${verdictLabel}</span>
              <span class="review-page-pill">${escapeHtml(pageName)}</span>
            </div>
            <span class="review-entry-time">${formatDate(entry.timestamp)}</span>
          </div>

          <div class="review-user-instructions">
            &ldquo;${escapeHtml(entry.userInstructions || 'No user feedback recorded.')}&rdquo;
          </div>

          ${Array.isArray(entry.appliedActions) && entry.appliedActions.length > 0 ? `
            <div class="review-actions-wrap">
              ${entry.appliedActions.map((act) => `
                <span class="review-action-tag">&bull; ${escapeHtml(act)}</span>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function renderDecisions(entries = []) {
    if (!entries || entries.length === 0) {
      return '<div class="pdetail-empty-item">No decisions logged. Record scope decisions to prevent downstream agent over-editing.</div>';
    }

    return entries.slice().reverse().map((dec) => {
      const scopeClass = `scope-${dec.scope || 'global'}`;
      const scopeLabel = (dec.scope || 'global').toUpperCase();

      return `
        <div class="decision-card">
          <div class="decision-header">
            <span class="decision-scope-pill ${scopeClass}">${scopeLabel}</span>
            <span class="decision-time">${formatDate(dec.timestamp)}</span>
          </div>
          <div class="decision-body">
            <strong>${escapeHtml(dec.decision)}</strong>
            ${dec.reason ? `<p class="decision-reason">${escapeHtml(dec.reason)}</p>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function showToast(message, isError = false) {
    const toast = document.getElementById('pdetail-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `pdetail-toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
  }

  /**
   * Binds interactive controls and listeners in the project detail view.
   */
  function attachEventListeners() {
    const store = getStoreApi();
    if (!store) return;

    // Back to projects
    const backBtn = document.getElementById('btn-pdetail-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (window.AppNavigator) window.AppNavigator.navigateTo('projects');
      });
    }

    // Export ZIP
    const exportBtn = document.getElementById('btn-export-project');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          exportBtn.disabled = true;
          exportBtn.textContent = 'Exporting...';
          const res = await store.exportProject(currentProjectId);
          if (res && res.success) {
            showToast('Project Knowledge Store exported successfully!');
          } else if (!res.cancelled) {
            showToast(res.error || 'Export failed', true);
          }
        } catch (err) {
          showToast(err.message, true);
        } finally {
          exportBtn.disabled = false;
          exportBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Export ZIP</span>
          `;
        }
      });
    }

    // Delete project
    const deleteBtn = document.getElementById('btn-delete-active-project');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (window.ProjectsController && currentProjectData?.project) {
          window.ProjectsController.openDeleteModal(currentProjectData.project, () => {
            if (window.AppNavigator) window.AppNavigator.navigateTo('projects');
          });
        }
      });
    }

    // Page Status Change Dropdowns
    const statusSelects = document.querySelectorAll('.page-status-select');
    statusSelects.forEach((sel) => {
      sel.addEventListener('change', async (e) => {
        const pageId = sel.getAttribute('data-id');
        const newStatus = e.target.value;
        try {
          const res = await store.updatePageStatus(currentProjectId, pageId, newStatus);
          if (res && res.success) {
            showToast(`Page status updated to ${newStatus}`);
            await reloadActiveProject();
          } else {
            showToast(res?.error || 'Failed to update page status', true);
          }
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });

    // Page Move Up / Down
    const moveUpBtns = document.querySelectorAll('.btn-page-move-up');
    moveUpBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pageId = btn.getAttribute('data-id');
        const pages = currentProjectData.pages.pages;
        const idx = pages.findIndex((p) => p.pageId === pageId);
        if (idx > 0) {
          const newOrder = pages.map((p) => p.pageId);
          const temp = newOrder[idx];
          newOrder[idx] = newOrder[idx - 1];
          newOrder[idx - 1] = temp;
          await store.reorderPages(currentProjectId, newOrder);
          await reloadActiveProject();
        }
      });
    });

    const moveDownBtns = document.querySelectorAll('.btn-page-move-down');
    moveDownBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pageId = btn.getAttribute('data-id');
        const pages = currentProjectData.pages.pages;
        const idx = pages.findIndex((p) => p.pageId === pageId);
        if (idx < pages.length - 1) {
          const newOrder = pages.map((p) => p.pageId);
          const temp = newOrder[idx];
          newOrder[idx] = newOrder[idx + 1];
          newOrder[idx + 1] = temp;
          await store.reorderPages(currentProjectId, newOrder);
          await reloadActiveProject();
        }
      });
    });

    // Page Remove
    const removeBtns = document.querySelectorAll('.btn-page-remove');
    removeBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pageId = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        if (confirm(`Remove page "${name}" from this project?`)) {
          try {
            const res = await store.removePage(currentProjectId, pageId);
            if (res && res.success) {
              showToast(`Removed page "${name}"`);
              await reloadActiveProject();
            } else {
              showToast(res?.error || 'Failed to remove page', true);
            }
          } catch (err) {
            showToast(err.message, true);
          }
        }
      });
    });

    // Add Page modal trigger
    const addPageBtn = document.getElementById('btn-open-add-page');
    if (addPageBtn) {
      addPageBtn.addEventListener('click', () => {
        openAddPageModal();
      });
    }

    // Update Tokens modal trigger
    const updateTokensBtn = document.getElementById('btn-open-update-tokens');
    if (updateTokensBtn) {
      updateTokensBtn.addEventListener('click', () => {
        openUpdateTokensModal();
      });
    }

    // Log Review modal trigger
    const addReviewBtn = document.getElementById('btn-open-add-review');
    if (addReviewBtn) {
      addReviewBtn.addEventListener('click', () => {
        openAddReviewModal();
      });
    }

    // Log Decision modal trigger
    const addDecisionBtn = document.getElementById('btn-open-add-decision');
    if (addDecisionBtn) {
      addDecisionBtn.addEventListener('click', () => {
        openAddDecisionModal();
      });
    }

    // Knowledge Tabs selection
    const kTabs = document.querySelectorAll('.k-tab-btn');
    kTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        kTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        activeKnowledgeTab = tab.getAttribute('data-doc');

        const pre = document.getElementById('knowledge-json-viewer');
        if (pre) pre.innerHTML = getActiveKnowledgeJson();

        const seedBar = document.getElementById('seed-action-bar');
        if (seedBar) {
          seedBar.style.display = activeKnowledgeTab === 'seed' ? 'flex' : 'none';
        }
      });
    });

    // Copy JSON
    const copyBtn = document.getElementById('btn-copy-knowledge-json');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const text = getActiveKnowledgeJson().replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        try {
          await navigator.clipboard.writeText(text);
          showToast('JSON document copied to clipboard!');
        } catch (_) {
          showToast('Could not copy to clipboard', true);
        }
      });
    }

    // Generate Seed Placeholder
    const regenSeedBtn = document.getElementById('btn-regen-seed');
    if (regenSeedBtn) {
      regenSeedBtn.addEventListener('click', async () => {
        try {
          regenSeedBtn.disabled = true;
          const res = await store.generateSeedPlaceholder(currentProjectId);
          if (res && res.success) {
            showToast('New seed placeholder generated');
            await reloadActiveProject();
          } else {
            showToast(res?.error || 'Failed to generate seed', true);
          }
        } catch (err) {
          showToast(err.message, true);
        } finally {
          regenSeedBtn.disabled = false;
        }
      });
    }
  }

  // ==============================================================================
  // MODAL CONTROLLERS (Add Page, Update Tokens, Log Review, Log Decision)
  // ==============================================================================

  function openAddPageModal() {
    const modal = document.getElementById('pdetail-add-page-modal');
    const input = document.getElementById('new-page-name-input');
    if (input) input.value = '';
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      setTimeout(() => input?.focus(), 80);
    }
  }

  function openUpdateTokensModal() {
    const modal = document.getElementById('pdetail-update-tokens-modal');
    if (!modal || !currentProjectData) return;

    const tokens = currentProjectData.tokens;
    const primaryInput = document.getElementById('token-edit-primary');
    const accentInput = document.getElementById('token-edit-accent');
    const bgInput = document.getElementById('token-edit-bg');
    const textInput = document.getElementById('token-edit-text');
    const reasonInput = document.getElementById('token-edit-reason');

    if (primaryInput) primaryInput.value = tokens.colors?.primary || '#0071E3';
    if (accentInput) accentInput.value = tokens.colors?.accent || '#0A84FF';
    if (bgInput) bgInput.value = tokens.colors?.background || '#FAFAFA';
    if (textInput) textInput.value = tokens.colors?.text || '#1D1D1F';
    if (reasonInput) reasonInput.value = '';

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => reasonInput?.focus(), 80);
  }

  function openAddReviewModal() {
    const modal = document.getElementById('pdetail-add-review-modal');
    const pageSelect = document.getElementById('review-page-select');
    const instructionsInput = document.getElementById('review-instructions-input');
    const actionsInput = document.getElementById('review-actions-input');

    if (pageSelect && currentProjectData) {
      pageSelect.innerHTML = `
        <option value="global">Project-Wide / Global</option>
        ${currentProjectData.pages.pages.map((p) => `
          <option value="${p.pageId}">${escapeHtml(p.name)}</option>
        `).join('')}
      `;
    }

    if (instructionsInput) instructionsInput.value = '';
    if (actionsInput) actionsInput.value = '';

    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      setTimeout(() => instructionsInput?.focus(), 80);
    }
  }

  function openAddDecisionModal() {
    const modal = document.getElementById('pdetail-add-decision-modal');
    const decisionInput = document.getElementById('decision-text-input');
    const reasonInput = document.getElementById('decision-reason-input');

    if (decisionInput) decisionInput.value = '';
    if (reasonInput) reasonInput.value = '';

    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      setTimeout(() => decisionInput?.focus(), 80);
    }
  }

  function closeAllModals() {
    const modals = document.querySelectorAll('.pdetail-modal');
    modals.forEach((m) => {
      m.classList.remove('active');
      m.setAttribute('aria-hidden', 'true');
    });
  }

  // Setup Global Listeners for Modals on DOM Ready
  document.addEventListener('DOMContentLoaded', () => {
    const store = getStoreApi();

    // Add Page Form
    const addPageForm = document.getElementById('pdetail-add-page-form');
    if (addPageForm) {
      addPageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('new-page-name-input');
        const name = input?.value.trim();
        if (!name || !currentProjectId) return;

        try {
          const res = await store.addPage(currentProjectId, { name });
          if (res && res.success) {
            closeAllModals();
            showToast(`Page "${name}" added successfully`);
            await reloadActiveProject();
          } else {
            showToast(res?.error || 'Failed to add page', true);
          }
        } catch (err) {
          showToast(err.message, true);
        }
      });
    }

    // Update Tokens Form
    const updateTokensForm = document.getElementById('pdetail-update-tokens-form');
    if (updateTokensForm) {
      updateTokensForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentProjectId) return;

        const primary = document.getElementById('token-edit-primary')?.value.trim();
        const accent = document.getElementById('token-edit-accent')?.value.trim();
        const bg = document.getElementById('token-edit-bg')?.value.trim();
        const text = document.getElementById('token-edit-text')?.value.trim();
        const reason = document.getElementById('token-edit-reason')?.value.trim() || 'Updated color tokens';

        const changes = {
          colors: {
            primary,
            accent,
            background: bg,
            text,
          },
        };

        try {
          const res = await store.updateTokens(currentProjectId, changes, reason);
          if (res && res.success) {
            closeAllModals();
            showToast(`Design tokens updated to v${res.data.version}`);
            await reloadActiveProject();
          } else {
            showToast(res?.error || 'Failed to update tokens', true);
          }
        } catch (err) {
          showToast(err.message, true);
        }
      });
    }

    // Add Review Form
    const addReviewForm = document.getElementById('pdetail-add-review-form');
    if (addReviewForm) {
      addReviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentProjectId) return;

        const pageId = document.getElementById('review-page-select')?.value || 'global';
        const verdict = document.getElementById('review-verdict-select')?.value || 'approved';
        const instructions = document.getElementById('review-instructions-input')?.value.trim() || '';
        const actionsRaw = document.getElementById('review-actions-input')?.value.trim() || '';
        const actions = actionsRaw ? actionsRaw.split('\n').map((a) => a.trim()).filter(Boolean) : [];

        try {
          const res = await store.logReview(currentProjectId, {
            pageId,
            verdict,
            instructions,
            actions,
          });
          if (res && res.success) {
            closeAllModals();
            showToast('Review entry recorded in knowledge log');
            await reloadActiveProject();
          } else {
            showToast(res?.error || 'Failed to log review', true);
          }
        } catch (err) {
          showToast(err.message, true);
        }
      });
    }

    // Add Decision Form
    const addDecisionForm = document.getElementById('pdetail-add-decision-form');
    if (addDecisionForm) {
      addDecisionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentProjectId) return;

        const scope = document.getElementById('decision-scope-select')?.value || 'global';
        const decision = document.getElementById('decision-text-input')?.value.trim() || '';
        const reason = document.getElementById('decision-reason-input')?.value.trim() || '';

        try {
          const res = await store.logDecision(currentProjectId, {
            scope,
            decision,
            reason,
          });
          if (res && res.success) {
            closeAllModals();
            showToast(`Decision logged [${scope}]`);
            await reloadActiveProject();
          } else {
            showToast(res?.error || 'Failed to log decision', true);
          }
        } catch (err) {
          showToast(err.message, true);
        }
      });
    }

    // Modal Close Buttons
    const closeButtons = document.querySelectorAll('.pdetail-modal-close');
    closeButtons.forEach((btn) => {
      btn.addEventListener('click', closeAllModals);
    });

    const cancelButtons = document.querySelectorAll('.pdetail-modal-cancel');
    cancelButtons.forEach((btn) => {
      btn.addEventListener('click', closeAllModals);
    });

    // Close on backdrop click
    const modals = document.querySelectorAll('.pdetail-modal');
    modals.forEach((m) => {
      m.addEventListener('click', (e) => {
        if (e.target === m) closeAllModals();
      });
    });
  });

  window.ProjectDetailController = {
    open: openProject,
    reload: reloadActiveProject,
    closeModals: closeAllModals,
  };
})();
