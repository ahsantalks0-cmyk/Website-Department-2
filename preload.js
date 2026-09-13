/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — PRELOAD SCRIPT (preload.js)
 * ==============================================================================
 * Secure IPC Bridge between the Node.js Main Process and the Browser Renderer.
 * Ensures contextIsolation compliance by exposing typed database and updater APIs.
 * ==============================================================================
 */

const { contextBridge, ipcRenderer } = require('electron');

const apiBridge = {
  /**
   * Retrieves the packaged or development application version.
   * @returns {Promise<string>} e.g. "1.0.2"
   */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /**
   * Database API (Phase 2 Local SQLite via IPC)
   */
  db: {
    projects: {
      /**
       * Lists all projects ordered newest first.
       * @returns {Promise<{success: boolean, data: Array, error?: string}>}
       */
      list: () => ipcRenderer.invoke('db:projects:list'),

      /**
       * Creates a new project.
       * @param {{ name: string, project_type?: string, description?: string }} data
       * @returns {Promise<{success: boolean, data?: object, error?: string}>}
       */
      create: (data) => ipcRenderer.invoke('db:projects:create', data),

      /**
       * Updates an existing project.
       * @param {{ id: number, name?: string, description?: string, status?: string }} data
       * @returns {Promise<{success: boolean, data?: object, error?: string}>}
       */
      update: (data) => ipcRenderer.invoke('db:projects:update', data),

      /**
       * Deletes a project by ID.
       * @param {number} id
       * @returns {Promise<{success: boolean, id?: number, error?: string}>}
       */
      delete: (id) => ipcRenderer.invoke('db:projects:delete', id),
    },

    pages: {
      /**
       * Lists all pages for a given project.
       * @param {number} projectId
       * @returns {Promise<{success: boolean, data: Array, error?: string}>}
       */
      list: (projectId) => ipcRenderer.invoke('db:pages:list', projectId),

      /**
       * Creates a new page under a project.
       * @param {{ project_id: number, name: string, page_order?: number }} data
       * @returns {Promise<{success: boolean, data?: object, error?: string}>}
       */
      create: (data) => ipcRenderer.invoke('db:pages:create', data),

      /**
       * Updates the review or workflow status of a page.
       * @param {number} id
       * @param {'pending' | 'in_design' | 'review' | 'approved'} status
       * @returns {Promise<{success: boolean, id?: number, status?: string, error?: string}>}
       */
      updateStatus: (id, status) => ipcRenderer.invoke('db:pages:update-status', { id, status }),
    },

    settings: {
      /**
       * Fetches a setting by key.
       * @param {string} key
       * @returns {Promise<string|null>}
       */
      get: (key) => ipcRenderer.invoke('db:settings:get', key),

      /**
       * Upserts a setting key-value pair.
       * @param {string} key
       * @param {any} value
       * @returns {Promise<{success: boolean, key: string, value: string, error?: string}>}
       */
      set: (key, value) => ipcRenderer.invoke('db:settings:set', { key, value }),
    },

    activity: {
      /**
       * Retrieves recent activity log records.
       * @param {number} [limit=20]
       * @returns {Promise<Array<{id: number, project_id: number|null, message: string, created_at: string, project_name?: string}>>}
       */
      list: (limit = 20) => ipcRenderer.invoke('db:activity:list', limit),
    },

    stats: {
      /**
       * Returns dashboard counts for projects, pages, seeds, and reviews.
       * @returns {Promise<{projects: number, pages: number, seeds: number, reviews: number}>}
       */
      get: () => ipcRenderer.invoke('db:stats:get'),
    },
  },

  /**
   * Auto-updater IPC Methods & Event Subscription (Phase 1 untouched)
   */
  updater: {
    check: () => ipcRenderer.invoke('check-for-updates'),
    download: () => ipcRenderer.invoke('download-update'),
    install: () => ipcRenderer.invoke('install-update'),

    onUpdateAvailable: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('update-available', handler);
      return () => ipcRenderer.removeListener('update-available', handler);
    },

    onUpdateNotAvailable: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('update-not-available', handler);
      return () => ipcRenderer.removeListener('update-not-available', handler);
    },

    onDownloadProgress: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('download-progress', handler);
      return () => ipcRenderer.removeListener('download-progress', handler);
    },

    onUpdateDownloaded: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('update-downloaded', handler);
      return () => ipcRenderer.removeListener('update-downloaded', handler);
    },

    onUpdateError: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('update-error', handler);
      return () => ipcRenderer.removeListener('update-error', handler);
    },
  },

  // Direct updater channel shortcuts
  'updater:check': () => ipcRenderer.invoke('check-for-updates'),
  'updater:download': () => ipcRenderer.invoke('download-update'),
  'updater:install': () => ipcRenderer.invoke('install-update'),

  /**
   * Opens external URLs securely in the default browser
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
};

/**
 * Multi-Provider AI IPC Bridge
 * Exposes methods matching the multi-provider live model architecture:
 * getProviders, selectProvider, saveApiKey, testConnection, refreshModels,
 * selectModel, generate, getActiveConfig, getUsageStats
 */
const aiBridge = {
  getProviders: () => {
    console.log('[Preload] Invoking ai:getProviders');
    return ipcRenderer.invoke('ai:getProviders');
  },

  selectProvider: (providerId) => {
    console.log('[Preload] Invoking ai:selectProvider', providerId);
    return ipcRenderer.invoke('ai:selectProvider', providerId);
  },

  saveApiKey: (providerIdOrKey, maybeKey) => {
    console.log('[Preload] Invoking ai:saveApiKey');
    return ipcRenderer.invoke('ai:saveApiKey', providerIdOrKey, maybeKey);
  },

  testConnection: (maybeProviderId) => {
    console.log('[Preload] Invoking ai:testConnection', maybeProviderId);
    return ipcRenderer.invoke('ai:testConnection', maybeProviderId);
  },

  refreshModels: (maybeProviderId) => {
    console.log('[Preload] Invoking ai:refreshModels', maybeProviderId);
    return ipcRenderer.invoke('ai:refreshModels', maybeProviderId);
  },

  selectModel: (providerId, modelId) => {
    console.log('[Preload] Invoking ai:selectModel', { providerId, modelId });
    return ipcRenderer.invoke('ai:selectModel', providerId, modelId);
  },

  generate: (params) => {
    console.log('[Preload] Invoking ai:generate');
    return ipcRenderer.invoke('ai:generate', params);
  },

  getActiveConfig: () => {
    console.log('[Preload] Invoking ai:getActiveConfig');
    return ipcRenderer.invoke('ai:getActiveConfig');
  },

  getStatus: () => {
    console.log('[Preload] Invoking ai:getStatus');
    return ipcRenderer.invoke('ai:getStatus');
  },

  getUsageStats: () => {
    console.log('[Preload] Invoking ai:getUsageStats');
    return ipcRenderer.invoke('ai:getUsageStats');
  },

  getProfiles: () => {
    console.log('[Preload] Invoking ai:getProfiles');
    return ipcRenderer.invoke('ai:getProfiles');
  },

  setProfile: (profile, model) => {
    console.log('[Preload] Invoking ai:setProfile', { profile, model });
    return ipcRenderer.invoke('ai:setProfile', { profile, model });
  },
};

/**
 * ==============================================================================
 * PHASE 4: ORCHESTRATOR & TASK GRAPH BRIDGE
 * ==============================================================================
 */
const orchestratorBridge = {
  runDemoGraph: () => {
    console.log('[Preload] Invoking orch:runDemoGraph');
    return ipcRenderer.invoke('orch:runDemoGraph');
  },
  pauseGraph: (graphId) => {
    console.log('[Preload] Invoking orch:pauseGraph', graphId);
    return ipcRenderer.invoke('orch:pauseGraph', graphId);
  },
  resumeGraph: (graphId) => {
    console.log('[Preload] Invoking orch:resumeGraph', graphId);
    return ipcRenderer.invoke('orch:resumeGraph', graphId);
  },
  cancelGraph: (graphId) => {
    console.log('[Preload] Invoking orch:cancelGraph', graphId);
    return ipcRenderer.invoke('orch:cancelGraph', graphId);
  },
  getActiveGraph: () => {
    return ipcRenderer.invoke('orch:getActiveGraph');
  },
  getGraphHistory: (limit = 20) => {
    return ipcRenderer.invoke('orch:getGraphHistory', limit);
  },
  getGraphDetail: (graphId) => {
    return ipcRenderer.invoke('orch:getGraphDetail', graphId);
  },
  runGraph: (graphObject) => {
    return ipcRenderer.invoke('orch:runGraph', graphObject);
  },
  onEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, payload) => {
      try {
        callback(payload);
      } catch (err) {
        console.error('[Preload] Error in orchestrator onEvent callback:', err);
      }
    };
    ipcRenderer.on('orchestrator:event', subscription);
    return () => {
      ipcRenderer.removeListener('orchestrator:event', subscription);
    };
  },
};

// Expose exact `window.ai` and `window.orchestrator` namespaces required by renderer
contextBridge.exposeInMainWorld('ai', aiBridge);
contextBridge.exposeInMainWorld('orchestrator', orchestratorBridge);

// Expose on both `window.api` and `window.electronAPI` for developer ergonomics and backward compatibility
const fullBridge = {
  ...apiBridge,
  ai: aiBridge,
  orchestrator: orchestratorBridge,
};

contextBridge.exposeInMainWorld('api', fullBridge);
contextBridge.exposeInMainWorld('electronAPI', fullBridge);
console.log('[Preload] contextBridge initialized with window.ai, window.orchestrator, window.api, and window.electronAPI');
