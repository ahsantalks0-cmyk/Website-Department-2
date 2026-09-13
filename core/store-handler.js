/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — STORE IPC HANDLER (core/store-handler.js)
 * ==============================================================================
 * Exposes the Knowledge Store engine to the Renderer process via secure IPC.
 * All handlers strictly conform to the `{ success: boolean, data?: any, error?: string }`
 * response contract wrapped in defensive try/catch blocks to ensure no dead UI buttons.
 * ==============================================================================
 */

const { ipcMain, dialog, BrowserWindow } = require('electron');
const path = require('path');
const { knowledgeStore } = require('./knowledge-store');

/**
 * Registers all `store:*` IPC handlers on `ipcMain`.
 */
function registerStoreIpcHandlers() {
  /**
   * Helper to safely get focused window for dialogs.
   */
  function getParentWindow() {
    return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
  }

  // 1. Create Project
  ipcMain.handle('store:createProject', async (_event, payload) => {
    try {
      const data = await knowledgeStore.createProject(payload || {});
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:createProject failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 2. Get All Projects (List)
  ipcMain.handle('store:getProjects', async () => {
    try {
      const data = await knowledgeStore.getProjects();
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:getProjects failed:', err.message);
      return { success: false, error: err.message, data: [] };
    }
  });

  // 3. Get Project Detail (Full 7 Documents)
  ipcMain.handle('store:getProject', async (_event, projectId) => {
    try {
      if (!projectId) {
        return { success: false, error: 'Project ID is required' };
      }
      const data = await knowledgeStore.getProject(projectId);
      return { success: true, data };
    } catch (err) {
      console.error(`[Store IPC] store:getProject(${projectId}) failed:`, err.message);
      return { success: false, error: err.message };
    }
  });

  // 4. Update Brief
  ipcMain.handle('store:updateBrief', async (_event, payload) => {
    try {
      const { projectId, partial } = payload || {};
      if (!projectId) return { success: false, error: 'Project ID is required' };
      const data = await knowledgeStore.updateBrief(projectId, partial || {});
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:updateBrief failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 5. Generate Seed Placeholder
  ipcMain.handle('store:generateSeedPlaceholder', async (_event, projectId) => {
    try {
      if (!projectId) return { success: false, error: 'Project ID is required' };
      const data = await knowledgeStore.generateSeedPlaceholder(projectId);
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:generateSeedPlaceholder failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 6. Update Design Tokens (New Version with Reason)
  ipcMain.handle('store:updateTokens', async (_event, payload) => {
    try {
      const { projectId, changes, reason } = payload || {};
      if (!projectId) return { success: false, error: 'Project ID is required' };
      const data = await knowledgeStore.updateTokens(projectId, changes || {}, reason);
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:updateTokens failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 7. Pages: Add Page
  ipcMain.handle('store:addPage', async (_event, payload) => {
    try {
      const { projectId, page } = payload || {};
      if (!projectId) return { success: false, error: 'Project ID is required' };
      const data = await knowledgeStore.addPage(projectId, page || {});
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:addPage failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 8. Pages: Update Page Status
  ipcMain.handle('store:updatePageStatus', async (_event, payload) => {
    try {
      const { projectId, pageId, status } = payload || {};
      if (!projectId || !pageId || !status) {
        return { success: false, error: 'Project ID, Page ID, and Status are required' };
      }
      const data = await knowledgeStore.updatePageStatus(projectId, pageId, status);
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:updatePageStatus failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 9. Pages: Reorder Pages
  ipcMain.handle('store:reorderPages', async (_event, payload) => {
    try {
      const { projectId, pageIds } = payload || {};
      if (!projectId || !Array.isArray(pageIds)) {
        return { success: false, error: 'Project ID and pageIds array are required' };
      }
      const data = await knowledgeStore.reorderPages(projectId, pageIds);
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:reorderPages failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 10. Pages: Remove Page
  ipcMain.handle('store:removePage', async (_event, payload) => {
    try {
      const { projectId, pageId } = payload || {};
      if (!projectId || !pageId) {
        return { success: false, error: 'Project ID and Page ID are required' };
      }
      const data = await knowledgeStore.removePage(projectId, pageId);
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:removePage failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 11. Review: Log Review
  ipcMain.handle('store:logReview', async (_event, payload) => {
    try {
      const { projectId, entry } = payload || {};
      if (!projectId || !entry) {
        return { success: false, error: 'Project ID and review entry are required' };
      }
      const data = await knowledgeStore.logReview(projectId, entry);
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:logReview failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 12. Decisions: Log Decision
  ipcMain.handle('store:logDecision', async (_event, payload) => {
    try {
      const { projectId, entry } = payload || {};
      if (!projectId || !entry) {
        return { success: false, error: 'Project ID and decision entry are required' };
      }
      const data = await knowledgeStore.logDecision(projectId, entry);
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:logDecision failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 13. Query Document
  ipcMain.handle('store:query', async (_event, payload) => {
    try {
      const { projectId, documentType } = payload || {};
      if (!projectId || !documentType) {
        return { success: false, error: 'Project ID and documentType are required' };
      }
      const data = await knowledgeStore.query(projectId, documentType);
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:query failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 14. Delete Project
  ipcMain.handle('store:deleteProject', async (_event, projectId) => {
    try {
      if (!projectId) return { success: false, error: 'Project ID is required' };
      const data = await knowledgeStore.deleteProject(projectId, true);
      return { success: true, data };
    } catch (err) {
      console.error('[Store IPC] store:deleteProject failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 15. Export Project (ZIP)
  ipcMain.handle('store:exportProject', async (_event, payload) => {
    try {
      const projectId = typeof payload === 'object' ? payload.projectId : payload;
      let targetPath = typeof payload === 'object' ? payload.targetPath : null;

      if (!projectId) return { success: false, error: 'Project ID is required' };

      // If no explicit target path given, present native Save Dialog
      if (!targetPath && dialog) {
        const win = getParentWindow();
        const saveRes = await dialog.showSaveDialog(win, {
          title: 'Export Project Knowledge Store',
          defaultPath: `project-${projectId}-knowledge.zip`,
          filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        });

        if (saveRes.canceled || !saveRes.filePath) {
          return { success: false, cancelled: true };
        }
        targetPath = saveRes.filePath;
      }

      if (!targetPath) {
        return { success: false, error: 'No export path selected' };
      }

      const result = await knowledgeStore.exportProject(projectId, targetPath);
      return { success: true, data: result };
    } catch (err) {
      console.error('[Store IPC] store:exportProject failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 16. Import Project (ZIP)
  ipcMain.handle('store:importProject', async (_event, payload) => {
    try {
      let zipPath = typeof payload === 'string' ? payload : (payload?.zipPath || null);

      if (!zipPath && dialog) {
        const win = getParentWindow();
        const openRes = await dialog.showOpenDialog(win, {
          title: 'Import Project Knowledge Store',
          properties: ['openFile'],
          filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        });

        if (openRes.canceled || !openRes.filePaths || openRes.filePaths.length === 0) {
          return { success: false, cancelled: true };
        }
        zipPath = openRes.filePaths[0];
      }

      if (!zipPath) {
        return { success: false, error: 'No zip file selected' };
      }

      const importedProject = await knowledgeStore.importProject(zipPath);
      return { success: true, data: importedProject };
    } catch (err) {
      console.error('[Store IPC] store:importProject failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  console.log('[Store IPC] Knowledge Store IPC handlers registered successfully.');
}

module.exports = {
  registerStoreIpcHandlers,
};
