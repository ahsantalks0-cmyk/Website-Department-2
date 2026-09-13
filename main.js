/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — ELECTRON MAIN PROCESS (main.js)
 * ==============================================================================
 * Responsible for:
 * - Application lifecycle management and single-instance locking
 * - Secure BrowserWindow creation with contextIsolation enabled
 * - Safe IPC communication bridging renderer and system actions
 * - Background and manual auto-update lifecycle management via electron-updater
 * ==============================================================================
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { getDb, runMigrations, closeDb } = require('./db/database');
const { registerAiHandlers, aiHandler } = require('./ai/ai-handler.js');
const { registerOrchestratorHandlers, orchestrator } = require('./core/orchestrator-ipc.js');
const { registerStoreIpcHandlers } = require('./core/store-handler.js');
const { registerChatIpcHandlers } = require('./agents/chat-handler.js');

// Keep global reference of the window object to prevent garbage collection
let mainWindow = null;

// Configure electron-updater
// autoDownload = false ensures the user initiates download explicitly via the UI
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

/**
 * Enforce Single Instance Lock
 * Prevents multiple instances from running concurrently.
 * If a second instance is launched, focus the existing window.
 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[App] Another instance is already running. Quitting this instance.');
  app.quit();
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // When Electron initialization finishes, run migrations then create the primary window
  app.whenReady().then(() => {
    console.log('[App] Initializing Phase 2 database migrations...');
    runMigrations();
    const db = getDb();
    console.log('[App] Initializing Phase 3 AI subsystem and registering IPC handlers...');
    registerAiHandlers(db);
    console.log('[App] Initializing Phase 4 Task Orchestrator & Graph Engine...');
    registerOrchestratorHandlers(db, aiHandler);
    console.log('[App] Initializing Phase 5 Project Knowledge Store...');
    registerStoreIpcHandlers();
    console.log('[App] Initializing Phase 6 Senior Chat Agent...');
    registerChatIpcHandlers(aiHandler, orchestrator);

    createWindow();

    // macOS standard behavior: re-create window when dock icon is clicked
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('will-quit', () => {
    closeDb();
  });
}

/**
 * Creates the primary application window with Apple-like aesthetics
 * and strict security constraints.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'AI Design Department',
    backgroundColor: '#FAFAFA',
    show: false, // Prevents white flash before content loads
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Crucial for security
      nodeIntegration: false, // Prevents renderer from accessing Node internals
      sandbox: true,
      spellcheck: false,
    },
  });

  // Remove default menu for a clean, modern desktop shell appearance
  mainWindow.setMenuBarVisibility(false);

  // Load renderer entry point
  const indexPath = path.join(__dirname, 'src', 'index.html');
  mainWindow.loadFile(indexPath).catch((err) => {
    console.error('[Window] Failed to load index.html:', err);
  });

  // Gracefully show window once DOM and styles are painted
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('[Window] AI Design Department window presented successfully.');

    // Silently check for updates in background on app start (packaged builds only)
    initializeAutoUpdater();
  });

  // Window error diagnostics
  mainWindow.webContents.on('render-process-gone', (_event, detailed) => {
    console.error('[Window] Renderer process terminated unexpectedly:', detailed.reason);
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[Window] Renderer process has become temporarily unresponsive.');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Quit when all windows are closed, except on macOS (Darwin),
 * where applications typically remain active in the dock until Cmd+Q.
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==============================================================================
// AUTO-UPDATER & IPC HANDLERS
// ==============================================================================

/**
 * Sets up electron-updater event hooks to communicate progress, availability,
 * and error messages directly to the renderer process via WebContents.
 */
function initializeAutoUpdater() {
  // Listen for updater events
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates on GitHub Releases...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes || 'New features, UI enhancements, and performance stability improvements.',
        releaseDate: info.releaseDate,
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] Up to date. Latest version is:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available', {
        version: info.version,
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', {
        percent: Math.round(progressObj.percent || 0),
        transferred: progressObj.transferred || 0,
        total: progressObj.total || 0,
        bytesPerSecond: progressObj.bytesPerSecond || 0,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded successfully for version:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Encountered error:', err == null ? 'unknown' : (err.stack || err).toString());
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: err ? err.message : 'An error occurred while connecting to update servers.',
      });
    }
  });

  // Background silent check on startup
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[AutoUpdater] Initial background update check failed:', err.message);
    });
  } else {
    console.log('[AutoUpdater] Running in development mode (npm start). Auto-updater network calls bypassed.');
  }
}

/**
 * IPC Channel: 'get-app-version'
 * Retrieves current version from package.json via Electron's app API
 */
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

/**
 * IPC Channel: 'check-for-updates'
 * Triggered manually by the user clicking "Check for Updates" in Settings UI
 */
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return {
      status: 'dev-mode',
      message: 'Auto-updater is active in packaged builds. In development mode (npm start), release feeds are simulated.',
      version: app.getVersion(),
    };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      status: 'success',
      updateInfo: result ? result.updateInfo : null,
    };
  } catch (error) {
    console.error('[AutoUpdater] Manual check error:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: error.message || 'Unable to check for updates. Please verify your connection.',
      });
    }
    return {
      status: 'error',
      message: error.message,
    };
  }
});

/**
 * IPC Channel: 'download-update'
 * Triggered when user clicks "Download Update" after an update is announced
 */
ipcMain.handle('download-update', async () => {
  if (!app.isPackaged) {
    return {
      status: 'dev-mode',
      message: 'Update downloading is supported in packaged builds.',
    };
  }

  try {
    await autoUpdater.downloadUpdate();
    return { status: 'success' };
  } catch (error) {
    console.error('[AutoUpdater] Download failed:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: error.message || 'Failed to download update file.',
      });
    }
    return {
      status: 'error',
      message: error.message,
    };
  }
});

/**
 * IPC Channel: 'install-update'
 * Quits the application and installs the downloaded update
 */
ipcMain.handle('install-update', () => {
  console.log('[AutoUpdater] Executing quitAndInstall()...');
  setImmediate(() => {
    // isSilent: false, isForceRunAfter: true
    autoUpdater.quitAndInstall(false, true);
  });
  return { status: 'success' };
});

/**
 * IPC Channel: 'open-external'
 * Securely opens external URLs in the default system browser
 */
ipcMain.handle('open-external', async (_event, url) => {
  if (url && typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      console.error('[Shell] Failed to open external URL:', err);
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'Invalid URL scheme' };
});

// ==============================================================================
// PHASE 2: DATABASE IPC HANDLERS (Prepared Statements & Input Validation)
// ==============================================================================

/**
 * Helper: Safely logs an event message to the activity_log table.
 * @param {import('better-sqlite3').Database} db
 * @param {number|null} projectId
 * @param {string} message
 */
function logActivity(db, projectId, message) {
  try {
    const stmt = db.prepare('INSERT INTO activity_log (project_id, message, created_at) VALUES (?, ?, datetime(\'now\'))');
    stmt.run(projectId || null, message);
  } catch (err) {
    console.error('[Database] Failed to log activity:', err.message);
  }
}

/**
 * IPC Channel: 'db:projects:list'
 * Returns all projects ordered newest first.
 */
ipcMain.handle('db:projects:list', async () => {
  const db = getDb();
  if (!db) {
    return { success: false, error: 'Database connection unavailable', data: [] };
  }

  try {
    const stmt = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM pages WHERE project_id = p.id) AS page_count
      FROM projects p
      ORDER BY p.id DESC
    `);
    const projects = stmt.all();
    return { success: true, data: projects };
  } catch (err) {
    console.error('[IPC db:projects:list] Error:', err.message);
    return { success: false, error: err.message, data: [] };
  }
});

/**
 * IPC Channel: 'db:projects:create'
 * Creates a new project, logs the action, and returns the newly inserted row.
 */
ipcMain.handle('db:projects:create', async (_event, payload) => {
  const db = getDb();
  if (!db) {
    return { success: false, error: 'Database connection unavailable' };
  }

  const { name, project_type, description } = payload || {};

  // Input Validation
  if (!name || typeof name !== 'string' || !name.trim()) {
    return { success: false, error: 'Project name is required and cannot be empty.' };
  }

  const validTypes = ['website', 'saas_dashboard', 'ui_only'];
  const sanitizedType = validTypes.includes(project_type) ? project_type : 'website';
  const sanitizedName = name.trim();
  const sanitizedDesc = typeof description === 'string' ? description.trim() : '';

  try {
    const insertTx = db.transaction(() => {
      const insertStmt = db.prepare(`
        INSERT INTO projects (name, project_type, description, status, created_at, updated_at)
        VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))
      `);
      const info = insertStmt.run(sanitizedName, sanitizedType, sanitizedDesc);
      const projectId = Number(info.lastInsertRowid);

      logActivity(db, projectId, `Project created: ${sanitizedName}`);

      const selectStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
      return selectStmt.get(projectId);
    });

    const newProject = insertTx();
    return { success: true, data: newProject };
  } catch (err) {
    console.error('[IPC db:projects:create] Error:', err.message);
    return { success: false, error: err.message };
  }
});

/**
 * IPC Channel: 'db:projects:update'
 * Updates project details and bumps updated_at.
 */
ipcMain.handle('db:projects:update', async (_event, payload) => {
  const db = getDb();
  if (!db) {
    return { success: false, error: 'Database connection unavailable' };
  }

  const { id, name, description, status } = payload || {};
  const projectId = parseInt(id, 10);
  if (!projectId || projectId <= 0) {
    return { success: false, error: 'Valid project ID is required.' };
  }

  try {
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!existing) {
      return { success: false, error: `Project not found with ID: ${projectId}` };
    }

    const updatedName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
    const updatedDesc = typeof description === 'string' ? description.trim() : existing.description;
    const validStatuses = ['active', 'completed', 'archived'];
    const updatedStatus = validStatuses.includes(status) ? status : existing.status;

    const updateStmt = db.prepare(`
      UPDATE projects
      SET name = ?, description = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    updateStmt.run(updatedName, updatedDesc, updatedStatus, projectId);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    return { success: true, data: updated };
  } catch (err) {
    console.error('[IPC db:projects:update] Error:', err.message);
    return { success: false, error: err.message };
  }
});

/**
 * IPC Channel: 'db:projects:delete'
 * Deletes a project by ID with cascading removal of pages, seeds, tokens, and reviews.
 */
ipcMain.handle('db:projects:delete', async (_event, id) => {
  const db = getDb();
  if (!db) {
    return { success: false, error: 'Database connection unavailable' };
  }

  const projectId = parseInt(id, 10);
  if (!projectId || projectId <= 0) {
    return { success: false, error: 'Valid project ID is required.' };
  }

  try {
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
    const projectName = project ? project.name : `ID #${projectId}`;

    const deleteTx = db.transaction(() => {
      const deleteStmt = db.prepare('DELETE FROM projects WHERE id = ?');
      deleteStmt.run(projectId);
      logActivity(db, null, `Project deleted: ${projectName}`);
    });

    deleteTx();
    return { success: true, id: projectId };
  } catch (err) {
    console.error('[IPC db:projects:delete] Error:', err.message);
    return { success: false, error: err.message };
  }
});

/**
 * IPC Channel: 'db:pages:list'
 * Returns all pages for a given project_id ordered by page_order.
 */
ipcMain.handle('db:pages:list', async (_event, projectId) => {
  const db = getDb();
  if (!db) {
    return { success: false, error: 'Database connection unavailable', data: [] };
  }

  const pid = parseInt(projectId, 10);
  if (!pid || pid <= 0) {
    return { success: false, error: 'Valid project ID is required.', data: [] };
  }

  try {
    const stmt = db.prepare('SELECT * FROM pages WHERE project_id = ? ORDER BY page_order ASC, id ASC');
    const pages = stmt.all(pid);
    return { success: true, data: pages };
  } catch (err) {
    console.error('[IPC db:pages:list] Error:', err.message);
    return { success: false, error: err.message, data: [] };
  }
});

/**
 * IPC Channel: 'db:pages:create'
 * Adds a new page record to a project.
 */
ipcMain.handle('db:pages:create', async (_event, payload) => {
  const db = getDb();
  if (!db) {
    return { success: false, error: 'Database connection unavailable' };
  }

  const { project_id, name, page_order } = payload || {};
  const pid = parseInt(project_id, 10);
  if (!pid || pid <= 0) {
    return { success: false, error: 'Valid project_id is required.' };
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return { success: false, error: 'Page name is required.' };
  }

  const order = typeof page_order === 'number' ? page_order : 0;
  const pageName = name.trim();

  try {
    const insertTx = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO pages (project_id, name, page_order, status, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `);
      const info = stmt.run(pid, pageName, order);
      const pageId = Number(info.lastInsertRowid);

      logActivity(db, pid, `Page added: ${pageName}`);
      return db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);
    });

    const newPage = insertTx();
    return { success: true, data: newPage };
  } catch (err) {
    console.error('[IPC db:pages:create] Error:', err.message);
    return { success: false, error: err.message };
  }
});

/**
 * IPC Channel: 'db:pages:update-status'
 * Updates a page review/design status.
 */
ipcMain.handle('db:pages:update-status', async (_event, payload) => {
  const db = getDb();
  if (!db) {
    return { success: false, error: 'Database connection unavailable' };
  }

  const { id, status } = payload || {};
  const pageId = parseInt(id, 10);
  const validStatuses = ['pending', 'in_design', 'review', 'approved'];

  if (!pageId || !validStatuses.includes(status)) {
    return { success: false, error: 'Valid page ID and status are required.' };
  }

  try {
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);
    if (!page) {
      return { success: false, error: 'Page not found.' };
    }

    db.prepare(`
      UPDATE pages
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, pageId);

    logActivity(db, page.project_id, `Page "${page.name}" status updated to ${status}`);
    return { success: true, id: pageId, status };
  } catch (err) {
    console.error('[IPC db:pages:update-status] Error:', err.message);
    return { success: false, error: err.message };
  }
});

/**
 * IPC Channel: 'db:settings:get'
 * Retrieves a key-value setting.
 */
ipcMain.handle('db:settings:get', async (_event, key) => {
  const db = getDb();
  if (!db || !key || typeof key !== 'string') {
    return null;
  }

  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key.trim());
    return row ? row.value : null;
  } catch (err) {
    console.error('[IPC db:settings:get] Error:', err.message);
    return null;
  }
});

/**
 * IPC Channel: 'db:settings:set'
 * Upserts a key-value setting.
 */
ipcMain.handle('db:settings:set', async (_event, payload) => {
  const db = getDb();
  if (!db) {
    return { success: false, error: 'Database connection unavailable' };
  }

  const { key, value } = payload || {};
  if (!key || typeof key !== 'string') {
    return { success: false, error: 'Setting key is required.' };
  }

  try {
    const valString = value !== undefined && value !== null ? String(value) : '';
    db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key.trim(), valString);

    return { success: true, key: key.trim(), value: valString };
  } catch (err) {
    console.error('[IPC db:settings:set] Error:', err.message);
    return { success: false, error: err.message };
  }
});

/**
 * IPC Channel: 'db:activity:list'
 * Returns the last N activity log entries (default 20).
 */
ipcMain.handle('db:activity:list', async (_event, limit) => {
  const db = getDb();
  if (!db) {
    return [];
  }

  const maxRows = typeof limit === 'number' && limit > 0 ? Math.min(limit, 100) : 20;

  try {
    const rows = db.prepare(`
      SELECT a.*, p.name AS project_name
      FROM activity_log a
      LEFT JOIN projects p ON a.project_id = p.id
      ORDER BY a.id DESC
      LIMIT ?
    `).all(maxRows);
    return rows;
  } catch (err) {
    console.error('[IPC db:activity:list] Error:', err.message);
    return [];
  }
});

/**
 * IPC Channel: 'db:stats:get'
 * Returns real count metrics across tables for the dashboard.
 */
ipcMain.handle('db:stats:get', async () => {
  const db = getDb();
  if (!db) {
    return { projects: 0, pages: 0, seeds: 0, reviews: 0 };
  }

  try {
    const projectsCount = db.prepare('SELECT COUNT(*) AS count FROM projects').get().count || 0;
    const pagesCount = db.prepare('SELECT COUNT(*) AS count FROM pages').get().count || 0;
    const seedsCount = db.prepare('SELECT COUNT(*) AS count FROM design_seeds').get().count || 0;
    const reviewsCount = db.prepare('SELECT COUNT(*) AS count FROM reviews').get().count || 0;

    return {
      projects: projectsCount,
      pages: pagesCount,
      seeds: seedsCount,
      reviews: reviewsCount,
    };
  } catch (err) {
    console.error('[IPC db:stats:get] Error:', err.message);
    return { projects: 0, pages: 0, seeds: 0, reviews: 0 };
  }
});

