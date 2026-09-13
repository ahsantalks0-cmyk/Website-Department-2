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

  const STORAGE_KEY_STORE_PREFIX = 'aidepartment_store_proj_';

  const mockStoreApi = {
    async getProjects() {
      const list = getStored(STORAGE_KEY_PROJECTS, []);
      return { success: true, data: list.sort((a, b) => b.id - a.id) };
    },
    async getProject(projectId) {
      const list = getStored(STORAGE_KEY_PROJECTS, []);
      const proj = list.find((p) => String(p.id) === String(projectId));
      if (!proj) return { success: false, error: 'Project not found' };

      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      let data = getStored(storeKey, null);
      if (!data) {
        data = {
          project: proj,
          brief: {
            projectId: proj.id,
            projectName: proj.name,
            projectType: proj.type || proj.project_type || 'website',
            userRequirements: proj.description || 'Production desktop interface specification.',
            targetAudience: 'Product engineers and interface designers',
            targetDevices: ['desktop'],
            coreFeatures: ['Navigation', 'Workspace Grid', 'Telemetry Dashboard'],
            createdAt: proj.created_at || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          seed: {
            projectId: proj.id,
            brandArchetype: 'Modernist Tech Architecture',
            colorPersonality: 'Monochrome slate with electric international blue accents',
            density: 'balanced',
            contrast: 'high',
            designPrinciples: [
              'Direct tactile feedback on all input states',
              'Surgical typographic hierarchy with mathematical line scales',
              'Consistent 8pt spatial grid with generous border gutters',
            ],
            createdAt: new Date().toISOString(),
          },
          tokens: {
            projectId: proj.id,
            version: 1,
            colors: {
              primary: '#0071E3',
              secondary: '#6E6E73',
              accent: '#0A84FF',
              background: '#FAFAFA',
              surface: '#FFFFFF',
              text: '#1D1D1F',
              muted: '#86868B',
              border: '#E5E5EA',
            },
            typography: {
              displayFont: 'Outfit',
              bodyFont: 'Outfit',
              scale: { h1: '32px', h2: '24px', h3: '18px', body: '14px', small: '12px' },
            },
            spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
            radius: { sm: '6px', md: '10px', lg: '16px' },
            motion: { duration: '200ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
            versions: [
              {
                version: 1,
                reason: 'Initial token baseline generation',
                timestamp: new Date().toISOString(),
                snapshot: { primary: '#0071E3', background: '#FAFAFA' },
              },
            ],
          },
          pages: {
            projectId: proj.id,
            pages: [
              { pageId: 'page-home', name: 'Home', order: 0, status: 'approved', lastReviewedAt: new Date().toISOString() },
              { pageId: 'page-dashboard', name: 'Dashboard', order: 1, status: 'designing', lastReviewedAt: null },
              { pageId: 'page-settings', name: 'Settings', order: 2, status: 'pending', lastReviewedAt: null },
            ],
          },
          reviewLog: {
            projectId: proj.id,
            entries: [
              {
                id: 'rev-1',
                pageId: 'page-home',
                userVerdict: 'approved',
                userInstructions: 'Hero banner typography looks refined. Spacing matches Apple HIG guidelines.',
                appliedActions: ['Adjusted H1 letter tracking to -0.02em', 'Aligned primary action button padding'],
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
              },
            ],
          },
          decisions: {
            projectId: proj.id,
            entries: [
              {
                id: 'dec-1',
                scope: 'global',
                decision: 'Adopt Outfit typeface paired with strict 8pt spatial rhythmic scales across all views',
                reason: 'Guarantees typographic clarity and scannability on dense Retina desktop displays',
                timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
              },
            ],
          },
          assets: {
            projectId: proj.id,
            items: [],
          },
        };
        setStored(storeKey, data);
      }
      return { success: true, data };
    },
    async createProject(payload) {
      const dbRes = await mockDbApi.projects.create({
        name: payload.name,
        project_type: payload.type || 'website',
        description: payload.description || '',
      });
      if (!dbRes.success) return dbRes;
      const proj = dbRes.data;
      const pagesList = Array.isArray(payload.pages) && payload.pages.length > 0
        ? payload.pages.map((pName, i) => ({
            pageId: `page-${pName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || i}`,
            name: pName,
            order: i,
            status: i === 0 ? 'designing' : 'pending',
            lastReviewedAt: null,
          }))
        : [{ pageId: 'page-home', name: 'Home', order: 0, status: 'pending', lastReviewedAt: null }];

      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${proj.id}`;
      const storeData = {
        project: { ...proj, type: payload.type || 'website', folder_path: `projects/${proj.id}` },
        brief: {
          projectId: proj.id,
          projectName: proj.name,
          projectType: payload.type || 'website',
          userRequirements: payload.description || '',
          targetAudience: 'Desktop and Web Users',
          targetDevices: ['desktop'],
          coreFeatures: pagesList.map((p) => p.name),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        seed: {
          projectId: proj.id,
          brandArchetype: 'Modernist Tech Architecture',
          colorPersonality: 'Monochrome slate with electric international blue accents',
          density: 'balanced',
          contrast: 'high',
          designPrinciples: ['Direct tactile feedback', 'Clear typographic hierarchy', '8pt layout grid'],
          createdAt: new Date().toISOString(),
        },
        tokens: {
          projectId: proj.id,
          version: 1,
          colors: {
            primary: '#0071E3',
            secondary: '#6E6E73',
            accent: '#0A84FF',
            background: '#FAFAFA',
            surface: '#FFFFFF',
            text: '#1D1D1F',
            muted: '#86868B',
            border: '#E5E5EA',
          },
          typography: {
            displayFont: 'Outfit',
            bodyFont: 'Outfit',
            scale: { h1: '32px', h2: '24px', h3: '18px', body: '14px', small: '12px' },
          },
          spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
          radius: { sm: '6px', md: '10px', lg: '16px' },
          motion: { duration: '200ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
          versions: [
            {
              version: 1,
              reason: 'Initial token baseline generation',
              timestamp: new Date().toISOString(),
              snapshot: { primary: '#0071E3', background: '#FAFAFA' },
            },
          ],
        },
        pages: {
          projectId: proj.id,
          pages: pagesList,
        },
        reviewLog: { projectId: proj.id, entries: [] },
        decisions: {
          projectId: proj.id,
          entries: [
            {
              id: 'dec-1',
              scope: 'global',
              decision: `Project ${proj.name} initialized with ${pagesList.length} pages specification.`,
              reason: 'Initial architectural baseline established.',
              timestamp: new Date().toISOString(),
            },
          ],
        },
        assets: { projectId: proj.id, items: [] },
      };
      setStored(storeKey, storeData);
      return { success: true, data: proj };
    },
    async updateTokens(projectId, changes, reason) {
      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      const data = getStored(storeKey, null);
      if (!data) return { success: false, error: 'Project not found' };
      const nextVersion = (data.tokens.version || 1) + 1;
      if (changes.colors) data.tokens.colors = { ...data.tokens.colors, ...changes.colors };
      if (changes.typography) data.tokens.typography = { ...data.tokens.typography, ...changes.typography };
      data.tokens.version = nextVersion;
      data.tokens.versions = data.tokens.versions || [];
      data.tokens.versions.push({
        version: nextVersion,
        reason: reason || 'Updated tokens',
        timestamp: new Date().toISOString(),
        snapshot: { ...data.tokens.colors },
      });
      setStored(storeKey, data);
      return { success: true, data: data.tokens };
    },
    async addPage(projectId, page) {
      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      const data = getStored(storeKey, null);
      if (!data) return { success: false, error: 'Project not found' };
      const pageId = `page-${page.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || Date.now()}`;
      const newPage = {
        pageId,
        name: page.name,
        order: data.pages.pages.length,
        status: 'pending',
        lastReviewedAt: null,
      };
      data.pages.pages.push(newPage);
      setStored(storeKey, data);
      return { success: true, data: newPage };
    },
    async updatePageStatus(projectId, pageId, status) {
      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      const data = getStored(storeKey, null);
      if (!data) return { success: false, error: 'Project not found' };
      const p = data.pages.pages.find((item) => item.pageId === pageId);
      if (!p) return { success: false, error: 'Page not found' };
      p.status = status;
      if (status === 'approved') p.lastReviewedAt = new Date().toISOString();
      setStored(storeKey, data);
      return { success: true, data: p };
    },
    async reorderPages(projectId, pageIds) {
      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      const data = getStored(storeKey, null);
      if (!data) return { success: false, error: 'Project not found' };
      const map = new Map(data.pages.pages.map((p) => [p.pageId, p]));
      const reordered = [];
      pageIds.forEach((id, idx) => {
        const p = map.get(id);
        if (p) {
          p.order = idx;
          reordered.push(p);
        }
      });
      data.pages.pages = reordered;
      setStored(storeKey, data);
      return { success: true, data: data.pages };
    },
    async removePage(projectId, pageId) {
      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      const data = getStored(storeKey, null);
      if (!data) return { success: false, error: 'Project not found' };
      data.pages.pages = data.pages.pages.filter((p) => p.pageId !== pageId);
      data.pages.pages.forEach((p, idx) => (p.order = idx));
      setStored(storeKey, data);
      return { success: true, data: data.pages };
    },
    async logReview(projectId, entry) {
      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      const data = getStored(storeKey, null);
      if (!data) return { success: false, error: 'Project not found' };
      const newEntry = {
        id: `rev-${Date.now()}`,
        pageId: entry.pageId || 'global',
        userVerdict: entry.verdict || 'approved',
        userInstructions: entry.instructions || '',
        appliedActions: entry.actions || [],
        timestamp: new Date().toISOString(),
      };
      data.reviewLog.entries.push(newEntry);
      setStored(storeKey, data);
      return { success: true, data: newEntry };
    },
    async logDecision(projectId, entry) {
      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      const data = getStored(storeKey, null);
      if (!data) return { success: false, error: 'Project not found' };
      const newEntry = {
        id: `dec-${Date.now()}`,
        scope: entry.scope || 'global',
        decision: entry.decision || '',
        reason: entry.reason || '',
        timestamp: new Date().toISOString(),
      };
      data.decisions.entries.push(newEntry);
      setStored(storeKey, data);
      return { success: true, data: newEntry };
    },
    async generateSeedPlaceholder(projectId) {
      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      const data = getStored(storeKey, null);
      if (!data) return { success: false, error: 'Project not found' };
      data.seed = {
        projectId,
        brandArchetype: 'Editorial Minimalism',
        colorPersonality: 'Oatmeal canvas with deep espresso typography and vermillion micro-accents',
        density: 'compact',
        contrast: 'maximum',
        designPrinciples: [
          'High density information architecture',
          'Monospaced numerical indicators for tabular data',
          'Tactile inset shadows on actionable toggles',
        ],
        createdAt: new Date().toISOString(),
      };
      setStored(storeKey, data);
      return { success: true, data: data.seed };
    },
    async deleteProject(projectId) {
      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      localStorage.removeItem(storeKey);
      return mockDbApi.projects.delete(projectId);
    },
    async exportProject(projectId) {
      const storeKey = `${STORAGE_KEY_STORE_PREFIX}${projectId}`;
      const data = getStored(storeKey, null);
      if (!data) return { success: false, error: 'Project not found' };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `project-${projectId}-knowledge.json`;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true, data: { path: `project-${projectId}-knowledge.json` } };
    },
    async importProject() {
      return { success: false, error: 'Native zip import requires Electron runtime environment.' };
    },
  };

  const STORAGE_KEY_CHAT_CONVS = 'aidepartment_mock_chat_convs';
  const STORAGE_KEY_CHAT_MSGS = 'aidepartment_mock_chat_msgs';
  const STORAGE_KEY_CHECKLISTS = 'aidepartment_mock_checklists';

  const mockChatApi = {
    async getConversations() {
      let convs = getStored(STORAGE_KEY_CHAT_CONVS, null);
      if (!convs) {
        convs = [
          {
            id: 1,
            project_id: 1,
            project_name: 'Nexus SaaS Landing Page',
            title: 'Nexus SaaS Landing Page Architecture',
            created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
            updated_at: new Date().toISOString(),
            last_message: 'Project brief and design tokens recorded. Handoff to Department Head completed.',
          },
        ];
        setStored(STORAGE_KEY_CHAT_CONVS, convs);
      }
      return convs;
    },
    async newConversation(projectId = null) {
      const convs = getStored(STORAGE_KEY_CHAT_CONVS, []);
      const newId = convs.reduce((m, c) => Math.max(m, c.id || 0), 0) + 1;
      const newConv = {
        id: newId,
        project_id: projectId,
        title: 'New Project Consultation',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      convs.unshift(newConv);
      setStored(STORAGE_KEY_CHAT_CONVS, convs);
      return newConv;
    },
    async getMessages(conversationId) {
      const allMsgs = getStored(STORAGE_KEY_CHAT_MSGS, {});
      let msgs = allMsgs[conversationId];
      if (!msgs) {
        if (Number(conversationId) === 1) {
          msgs = [
            {
              id: 1,
              conversation_id: 1,
              role: 'user',
              text: 'Build me a modern developer analytics marketing page with high-contrast typography.',
              created_at: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
            },
            {
              id: 2,
              conversation_id: 1,
              role: 'agent',
              text: 'Welcome to the AI Design Department! I have structured the requirements for **Nexus SaaS Landing Page**:\n\n- **Tech Stack:** Next.js + Tailwind CSS + shadcn/ui + Supabase\n- **Design Style:** Modernist Tech Architecture with strict 8pt spatial grid\n- **Pages:** Home, Dashboard, Settings\n- **Database Timing:** Deferred until UI approval\n\nAll documents are populated in the Knowledge Store and handed off to our Department Head.',
              created_at: new Date(Date.now() - 1000 * 60 * 33).toISOString(),
              extracted: {
                projectName: 'Nexus SaaS Landing Page',
                missingItems: ['Database setup (deferred until UI approval)', 'Final QA verification'],
                suggestions: ['View Task Monitor', 'Check project details', 'Review pages'],
                interviewState: 'complete',
              },
            },
          ];
          allMsgs[conversationId] = msgs;
          setStored(STORAGE_KEY_CHAT_MSGS, allMsgs);
        } else {
          msgs = [];
        }
      }
      return msgs;
    },
    async sendMessage(payload) {
      const { conversationId, text, images = [] } = payload;
      const allMsgs = getStored(STORAGE_KEY_CHAT_MSGS, {});
      const msgs = allMsgs[conversationId] || [];

      const userMsg = {
        id: Date.now(),
        conversation_id: Number(conversationId),
        role: 'user',
        text,
        images,
        created_at: new Date().toISOString(),
      };
      msgs.push(userMsg);

      // Determine conversational state
      const lower = (text || '').toLowerCase();
      let replyText = '';
      let missingItems = [];
      let suggestions = [];
      let interviewState = 'gathering';
      let justCreatedProject = false;
      let projectId = null;

      if (/(next\.js|html|css|tailwind|you design it|self design|defer|after design|build)/i.test(lower)) {
        interviewState = 'complete';
        replyText = `Understood! I have captured all architectural requirements:\n- **Tech Stack:** Next.js + Tailwind + shadcn + Supabase\n- **Design Direction:** Unique Department Custom Craft (Apple-grade contrast & density)\n- **Pages:** Home, About, Pricing, Contact\n- **Database Timing:** Deferred until after visual design approval\n\nI have initialized your project in the **Project Knowledge Store** and dispatched the "project-handoff" task graph to the Orchestrator!`;
        missingItems = ['Database setup (deferred)', 'Cross-device QA check'];
        suggestions = ['View Task Monitor', 'Check project details', 'Add another page'];
        justCreatedProject = true;
        projectId = 1;

        // Update conversation title
        const convs = getStored(STORAGE_KEY_CHAT_CONVS, []);
        const targetConv = convs.find((c) => c.id === Number(conversationId));
        if (targetConv) {
          targetConv.title = text.slice(0, 32);
          targetConv.project_id = 1;
          targetConv.project_name = 'Nexus SaaS Landing Page';
          targetConv.updated_at = new Date().toISOString();
          setStored(STORAGE_KEY_CHAT_CONVS, convs);
        }
      } else {
        replyText = `Welcome to the AI Design Department! I'm your Senior Project Lead.\n\nTo ensure we build your exact vision, could you clarify:\n1. **Tech Stack:** Simple HTML/CSS/JS or modern Next.js + Tailwind + shadcn + Supabase?\n2. **Design Direction:** Would you like to share a reference image, describe a specific style, or should our department design it uniquely for you?\n3. **Database Timing:** Set up now, or defer until after visual design approval?`;
        missingItems = ['Tech stack unconfirmed', 'Design direction needed', 'Database timing pending'];
        suggestions = ['Next.js + Tailwind stack', 'Simple HTML/CSS/JS', 'You design it for me', 'Setup DB after design approval'];
      }

      const agentMsg = {
        id: Date.now() + 1,
        conversation_id: Number(conversationId),
        role: 'agent',
        text: replyText,
        created_at: new Date().toISOString(),
        extracted: {
          missingItems,
          suggestions,
          interviewState,
          justCreatedProject,
          projectId,
        },
      };
      msgs.push(agentMsg);
      allMsgs[conversationId] = msgs;
      setStored(STORAGE_KEY_CHAT_MSGS, allMsgs);

      return {
        success: true,
        conversationId,
        userMessage: userMsg,
        agentMessage: agentMsg,
        missingItems,
        suggestions,
        justCreatedProject,
      };
    },
    async attachImage() {
      return { success: false, error: 'File picker fallback available via button' };
    },
    async getChecklist(projectId) {
      return {
        projectId,
        items: [
          { id: 'design-system', text: 'Design system & token definition', done: true },
          { id: 'page-design-1', text: 'Generate layout & code for Home page', done: true },
          { id: 'page-design-2', text: 'Generate layout & code for Dashboard page', done: false },
          { id: 'database-setup', text: 'Database setup (deferred until UI approval)', done: false },
          { id: 'seo-meta', text: 'SEO metadata & open graph tags', done: false },
          { id: 'final-qa', text: 'Cross-device QA & accessibility validation', done: false },
        ],
      };
    },
    async markChecklistDone(projectId, itemKey) {
      return { success: true };
    },
    async deleteConversation(id) {
      const convs = getStored(STORAGE_KEY_CHAT_CONVS, []).filter((c) => c.id !== Number(id));
      setStored(STORAGE_KEY_CHAT_CONVS, convs);
      return true;
    },
    onTyping() {
      return () => {};
    },
  };

  const shim = {
    getAppVersion: async () => '1.0.4',
    db: mockDbApi,
    ai: mockAiApi,
    store: mockStoreApi,
    chat: mockChatApi,
    updater: null,
  };

  window.api = window.api || shim;
  window.electronAPI = window.electronAPI || shim;
  window.store = window.store || mockStoreApi;
  window.chat = window.chat || mockChatApi;
})();

(function () {
  const views = {
    chat: {
      id: 'view-chat',
      title: 'Senior Chat Agent',
      subtitle: 'Project Lead • Requirements, Design & Orchestration',
    },
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
    'project-detail': {
      id: 'view-project-detail',
      title: 'Project Knowledge Store',
      subtitle: 'Single Source of Truth & Document Specifications',
    },
    settings: {
      id: 'view-settings',
      title: 'Settings',
      subtitle: 'System Preferences & Auto-Updates',
    },
  };

  let activeTab = 'chat';

  /**
   * Switches the active viewport and updates top bar indicators.
   * @param {'chat' | 'dashboard' | 'projects' | 'settings'} tabKey
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
    if (tabKey === 'chat' && window.ChatController) {
      window.ChatController.load();
    } else if (tabKey === 'dashboard' && window.DashboardController) {
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

    // Set initial view: Senior Chat Agent first!
    navigateTo('chat');
  });
})();
