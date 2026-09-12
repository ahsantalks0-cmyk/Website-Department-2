/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — CORE APP CONTROLLER (app.js)
 * ==============================================================================
 * Handles:
 * - Single-page sidebar navigation (Dashboard, Projects, Settings)
 * - Dynamic view switching and top bar title synchronization
 * - Synchronization of database controllers on view switches
 * - Safe browser-preview fallback shim for non-Electron web testing
 * ==============================================================================
 */

// ------------------------------------------------------------------------------
// Browser Preview Shim: Provides mock DB in localStorage when running outside Electron
// ------------------------------------------------------------------------------
(function initBrowserShim() {
  if (typeof window === 'undefined') return;
  if (window.api && window.api.db) return;
  if (window.electronAPI && window.electronAPI.db) return;

  console.info('[AI Design Department] Running outside Electron shell: Initializing LocalStorage SQLite shim for preview...');

  const STORAGE_KEY_PROJECTS = 'aidepartment_mock_projects';
  const STORAGE_KEY_PAGES = 'aidepartment_mock_pages';
  const STORAGE_KEY_ACTIVITY = 'aidepartment_mock_activity';
  const STORAGE_KEY_SETTINGS = 'aidepartment_mock_settings';

  function getStored(key, defaultVal) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  function setStored(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('Storage quota exceeded:', e);
    }
  }

  // Seed default items if virgin state
  let projects = getStored(STORAGE_KEY_PROJECTS, null);
  if (!projects || projects.length === 0) {
    projects = [
      {
        id: 1,
        name: 'Nexus SaaS Landing Page',
        project_type: 'website',
        description: 'Modern developer analytics marketing page with high-contrast typography.',
        status: 'active',
        created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        updated_at: new Date().toISOString(),
        page_count: 3,
      },
      {
        id: 2,
        name: 'Synthetix Command Center',
        project_type: 'saas_dashboard',
        description: 'Multi-tenant admin dashboard with real-time variety telemetry.',
        status: 'active',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        updated_at: new Date().toISOString(),
        page_count: 5,
      },
    ];
    setStored(STORAGE_KEY_PROJECTS, projects);

    const initialActivity = [
      { id: 1, project_id: 1, project_name: 'Nexus SaaS Landing Page', message: 'Project created: Nexus SaaS Landing Page', created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString() },
      { id: 2, project_id: 2, project_name: 'Synthetix Command Center', message: 'Project created: Synthetix Command Center', created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
      { id: 3, project_id: 2, project_name: 'Synthetix Command Center', message: 'Page added: Analytics Overview', created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
    ];
    setStored(STORAGE_KEY_ACTIVITY, initialActivity);
  }

  const mockDbApi = {
    projects: {
      async list() {
        const list = getStored(STORAGE_KEY_PROJECTS, []);
        return { success: true, data: list.sort((a, b) => b.id - a.id) };
      },
      async create(payload) {
        const list = getStored(STORAGE_KEY_PROJECTS, []);
        const nextId = list.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
        const newProj = {
          id: nextId,
          name: payload.name.trim(),
          project_type: payload.project_type || 'website',
          description: payload.description || '',
          status: 'active',
          page_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        list.push(newProj);
        setStored(STORAGE_KEY_PROJECTS, list);

        // Activity log
        const activities = getStored(STORAGE_KEY_ACTIVITY, []);
        const actId = activities.reduce((max, a) => Math.max(max, a.id || 0), 0) + 1;
        activities.unshift({
          id: actId,
          project_id: nextId,
          project_name: newProj.name,
          message: `Project created: ${newProj.name}`,
          created_at: new Date().toISOString(),
        });
        setStored(STORAGE_KEY_ACTIVITY, activities);

        return { success: true, data: newProj };
      },
      async update(payload) {
        const list = getStored(STORAGE_KEY_PROJECTS, []);
        const idx = list.findIndex((p) => p.id === payload.id);
        if (idx === -1) return { success: false, error: 'Not found' };
        list[idx] = { ...list[idx], ...payload, updated_at: new Date().toISOString() };
        setStored(STORAGE_KEY_PROJECTS, list);
        return { success: true, data: list[idx] };
      },
      async delete(id) {
        let list = getStored(STORAGE_KEY_PROJECTS, []);
        const target = list.find((p) => p.id === id);
        list = list.filter((p) => p.id !== id);
        setStored(STORAGE_KEY_PROJECTS, list);

        if (target) {
          const activities = getStored(STORAGE_KEY_ACTIVITY, []);
          const actId = activities.reduce((max, a) => Math.max(max, a.id || 0), 0) + 1;
          activities.unshift({
            id: actId,
            project_id: null,
            project_name: null,
            message: `Project deleted: ${target.name}`,
            created_at: new Date().toISOString(),
          });
          setStored(STORAGE_KEY_ACTIVITY, activities);
        }

        return { success: true, id };
      },
    },

    pages: {
      async list(projectId) {
        const pages = getStored(STORAGE_KEY_PAGES, []);
        return { success: true, data: pages.filter((p) => p.project_id === projectId) };
      },
      async create(payload) {
        const pages = getStored(STORAGE_KEY_PAGES, []);
        const nextId = pages.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
        const newPage = {
          id: nextId,
          project_id: payload.project_id,
          name: payload.name,
          page_order: payload.page_order || 0,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        pages.push(newPage);
        setStored(STORAGE_KEY_PAGES, pages);
        return { success: true, data: newPage };
      },
      async updateStatus(id, status) {
        const pages = getStored(STORAGE_KEY_PAGES, []);
        const idx = pages.findIndex((p) => p.id === id);
        if (idx !== -1) {
          pages[idx].status = status;
          pages[idx].updated_at = new Date().toISOString();
          setStored(STORAGE_KEY_PAGES, pages);
        }
        return { success: true, id, status };
      },
    },

    settings: {
      async get(key) {
        const settings = getStored(STORAGE_KEY_SETTINGS, {});
        return settings[key] !== undefined ? settings[key] : null;
      },
      async set(key, value) {
        const settings = getStored(STORAGE_KEY_SETTINGS, {});
        settings[key] = value;
        setStored(STORAGE_KEY_SETTINGS, settings);
        return { success: true, key, value };
      },
    },

    activity: {
      async list(limit = 20) {
        const activities = getStored(STORAGE_KEY_ACTIVITY, []);
        return activities.slice(0, limit);
      },
    },

    stats: {
      async get() {
        const list = getStored(STORAGE_KEY_PROJECTS, []);
        const pages = getStored(STORAGE_KEY_PAGES, []);
        return {
          projects: list.length,
          pages: pages.length + 8,
          seeds: 12,
          reviews: 4,
        };
      },
    },
  };

  const STORAGE_KEY_AI_KEY = 'aidepartment_mock_ai_key';
  const STORAGE_KEY_AI_PROFILES = 'aidepartment_mock_ai_profiles';
  const STORAGE_KEY_AI_USAGE = 'aidepartment_mock_ai_usage';

  const mockAiApi = {
    async getStatus() {
      const key = localStorage.getItem(STORAGE_KEY_AI_KEY) || '';
      return { configured: key.length > 5 };
    },
    async saveApiKey(key) {
      if (!key) return { success: false, error: 'Key required' };
      localStorage.setItem(STORAGE_KEY_AI_KEY, key.trim());
      return { success: true };
    },
    async testConnection() {
      const key = localStorage.getItem(STORAGE_KEY_AI_KEY) || '';
      if (!key) {
        return { success: false, error: 'Please add your Google AI Studio API key first', models: [] };
      }
      return {
        success: true,
        models: [
          'gemini-2.5-flash-lite',
          'gemini-2.5-flash',
          'gemini-1.5-flash',
          'gemini-1.5-pro'
        ]
      };
    },
    async generate(params) {
      const key = localStorage.getItem(STORAGE_KEY_AI_KEY) || '';
      if (!key) {
        return { success: false, error: 'Please add your Google AI Studio API key first' };
      }

      // Record simulated usage in localStorage
      const usage = getStored(STORAGE_KEY_AI_USAGE, { requestsToday: 0, tokensToday: 0 });
      usage.requestsToday += 1;
      usage.tokensToday += 268;
      setStored(STORAGE_KEY_AI_USAGE, usage);

      return {
        success: true,
        data: {
          text: `1. Clarity Over Decoration: Prioritize essential desktop actions with high typographic contrast and generous negative space.\n2. Direct Manipulation: Ensure interface states provide instant tactile feedback and clear spatial continuity.\n3. Adaptive Hierarchy: Group related tools into cohesive clusters, surfacing secondary controls on demand.`,
          modelUsed: params?.taskProfile === 'reasoning' ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite',
          latencyMs: 342,
          usageMetadata: { promptTokens: 48, outputTokens: 220, totalTokens: 268 },
        }
      };
    },
    async getUsageStats() {
      return getStored(STORAGE_KEY_AI_USAGE, { requestsToday: 0, tokensToday: 0 });
    },
    async getProfiles() {
      const defaults = [
        { profile: 'cheap', model: 'gemini-2.5-flash-lite', description: 'Simple content drafts, micro-copy, taglines, and repetitive formatting.' },
        { profile: 'reasoning', model: 'gemini-2.5-flash', description: 'Complex design architectures, component logic, CSS layouts, and heuristics.' },
        { profile: 'vision', model: 'gemini-2.5-flash', description: 'Visual hierarchy inspection, screenshot analysis, and reference design critique.' },
        { profile: 'structured', model: 'gemini-2.5-flash-lite', description: 'Strict JSON schemas, token generation, and structured design seeds.' },
      ];
      const saved = getStored(STORAGE_KEY_AI_PROFILES, null);
      return {
        profiles: saved || defaults,
        availableModels: [
          { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
          { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        ]
      };
    },
    async setProfile(profile, model) {
      const profiles = (await mockAiApi.getProfiles()).profiles;
      const target = profiles.find(p => p.profile === profile);
      if (target) {
        target.model = model;
        setStored(STORAGE_KEY_AI_PROFILES, profiles);
      }
      return { success: true };
    }
  };

  const shim = {
    getAppVersion: async () => '1.0.4',
    db: mockDbApi,
    ai: mockAiApi,
    updater: null,
  };

  window.api = window.api || shim;
  window.electronAPI = window.electronAPI || shim;
})();

(function () {
  const views = {
    dashboard: {
      id: 'view-dashboard',
      title: 'Dashboard',
      subtitle: 'Foundation Overview & System Metrics',
    },
    projects: {
      id: 'view-projects',
      title: 'Projects',
      subtitle: 'AI Canvas & Generated Interfaces',
    },
    settings: {
      id: 'view-settings',
      title: 'Settings',
      subtitle: 'System Preferences & Auto-Updates',
    },
  };

  let activeTab = 'dashboard';

  /**
   * Switches the active viewport and updates top bar indicators.
   * @param {'dashboard' | 'projects' | 'settings'} tabKey
   */
  function navigateTo(tabKey) {
    if (!views[tabKey]) return;
    activeTab = tabKey;

    // Update navigation buttons
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    navItems.forEach((btn) => {
      const target = btn.getAttribute('data-target');
      if (target === tabKey) {
        btn.classList.add('active');
        btn.setAttribute('aria-current', 'page');
      } else {
        btn.classList.remove('active');
        btn.removeAttribute('aria-current');
      }
    });

    // Update view panes
    const viewPanes = document.querySelectorAll('.view-pane');
    viewPanes.forEach((pane) => {
      pane.classList.remove('active');
    });

    const targetPane = document.getElementById(views[tabKey].id);
    if (targetPane) {
      targetPane.classList.add('active');
    }

    // Update Topbar Title & Subtitle
    const titleEl = document.getElementById('current-page-title');
    const subtitleEl = document.getElementById('current-page-subtitle');
    if (titleEl) titleEl.textContent = views[tabKey].title;
    if (subtitleEl) subtitleEl.textContent = views[tabKey].subtitle;

    // Synchronize View State with Controllers
    if (tabKey === 'dashboard' && window.DashboardController) {
      window.DashboardController.refresh();
    } else if (tabKey === 'projects' && window.ProjectsController) {
      window.ProjectsController.load();
    } else if (tabKey === 'settings' && window.SettingsAIController) {
      window.SettingsAIController.refreshStatus();
      window.SettingsAIController.loadUsageStats();
    }
  }

  // Public navigator hook
  window.AppNavigator = {
    navigateTo,
    getActiveTab: () => activeTab,
  };

  document.addEventListener('DOMContentLoaded', () => {
    // Attach click listeners to all navigation buttons
    const navButtons = document.querySelectorAll('.nav-item[data-target]');
    navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        navigateTo(target);
      });
    });

    // Topbar update pill banner clicks navigate to settings directly
    const updateBanner = document.getElementById('topbar-update-banner');
    if (updateBanner) {
      updateBanner.addEventListener('click', () => {
        navigateTo('settings');
      });
    }

    // Set initial view
    navigateTo('dashboard');
  });
})();
