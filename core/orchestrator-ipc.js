/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — ORCHESTRATOR IPC HANDLER (core/orchestrator-ipc.js)
 * ==============================================================================
 * Exposes IPC channels bridging the Electron Renderer with the Orchestrator Engine:
 * - orch:runDemoGraph
 * - orch:pauseGraph
 * - orch:resumeGraph
 * - orch:cancelGraph
 * - orch:getActiveGraph
 * - orch:getGraphHistory
 * - orch:getGraphDetail
 * - orch:runGraph
 * ==============================================================================
 */

let ipcMain = null;
if (process.versions && process.versions.electron) {
  try {
    const electron = require('electron');
    ipcMain = electron?.ipcMain;
  } catch (e) {
    // Non-electron environment fallback
  }
}

const { orchestrator } = require('./orchestrator');
const { registerDemoHandlers } = require('./demo-handlers');

function registerOrchestratorHandlers(db, aiHandler) {
  // 1. Register demo handlers into registry
  registerDemoHandlers();

  // 2. Initialize orchestrator engine with DB and AIHandler
  orchestrator.init(db, aiHandler);

  if (!ipcMain) {
    console.warn('[OrchestratorIPC] ipcMain unavailable, skipping IPC channel registration.');
    return;
  }

  // orch:runDemoGraph() -> { success: boolean, graphId: string }
  ipcMain.handle('orch:runDemoGraph', async () => {
    try {
      console.log('[OrchestratorIPC] Triggering Demo Graph execution...');
      const res = await orchestrator.runDemoGraph();
      return { success: true, graphId: res.graphId };
    } catch (err) {
      console.error('[OrchestratorIPC] orch:runDemoGraph failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // orch:pauseGraph(graphId) -> { success: boolean, message?: string }
  ipcMain.handle('orch:pauseGraph', async (_event, graphId) => {
    try {
      console.log(`[OrchestratorIPC] Pausing graph "${graphId}"...`);
      return orchestrator.pauseGraph(graphId);
    } catch (err) {
      console.error('[OrchestratorIPC] orch:pauseGraph failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // orch:resumeGraph(graphId) -> { success: boolean, message?: string }
  ipcMain.handle('orch:resumeGraph', async (_event, graphId) => {
    try {
      console.log(`[OrchestratorIPC] Resuming graph "${graphId}"...`);
      return orchestrator.resumeGraph(graphId);
    } catch (err) {
      console.error('[OrchestratorIPC] orch:resumeGraph failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // orch:cancelGraph(graphId) -> { success: boolean, message?: string }
  ipcMain.handle('orch:cancelGraph', async (_event, graphId) => {
    try {
      console.log(`[OrchestratorIPC] Cancelling graph "${graphId}"...`);
      return orchestrator.cancelGraph(graphId);
    } catch (err) {
      console.error('[OrchestratorIPC] orch:cancelGraph failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  // orch:getActiveGraph() -> graph or null
  ipcMain.handle('orch:getActiveGraph', async () => {
    try {
      return orchestrator.getActiveGraph();
    } catch (err) {
      console.error('[OrchestratorIPC] orch:getActiveGraph failed:', err.message);
      return null;
    }
  });

  // orch:getGraphHistory(limit) -> graphs[]
  ipcMain.handle('orch:getGraphHistory', async (_event, limit = 20) => {
    try {
      return orchestrator.getGraphHistory(limit);
    } catch (err) {
      console.error('[OrchestratorIPC] orch:getGraphHistory failed:', err.message);
      return [];
    }
  });

  // orch:getGraphDetail(graphId) -> { graph, nodes[], events[] }
  ipcMain.handle('orch:getGraphDetail', async (_event, graphId) => {
    try {
      return orchestrator.getGraphDetail(graphId);
    } catch (err) {
      console.error(`[OrchestratorIPC] orch:getGraphDetail failed for "${graphId}":`, err.message);
      return { graph: null, nodes: [], events: [] };
    }
  });

  // orch:runGraph(graphObject) -> custom graph execution
  ipcMain.handle('orch:runGraph', async (_event, graphObject) => {
    try {
      const runPromise = orchestrator.runGraph(graphObject);
      return { success: true, graphId: graphObject.graphId, promise: runPromise };
    } catch (err) {
      console.error('[OrchestratorIPC] orch:runGraph failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  console.log('[OrchestratorIPC] All orchestrator IPC channels registered successfully.');
}

module.exports = {
  registerOrchestratorHandlers,
};
