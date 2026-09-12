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
};

// Expose on both `window.api` and `window.electronAPI` for developer ergonomics and backward compatibility
contextBridge.exposeInMainWorld('api', apiBridge);
contextBridge.exposeInMainWorld('electronAPI', apiBridge);
