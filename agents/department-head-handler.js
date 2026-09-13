/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — DEPARTMENT HEAD & AGENTS IPC HANDLER
 * ==============================================================================
 * (agents/department-head-handler.js)
 * Bridges Electron Main Process, Agents Registry, and Department Head Agent.
 * ==============================================================================
 */

let electron = null;
let ipcMain = null;

if (process.versions && process.versions.electron) {
  try {
    electron = require('electron');
    ipcMain = electron?.ipcMain;
  } catch (_) {}
}

const { agentsRegistry } = require('./agents-registry');
const { departmentHeadAgent } = require('./department-head');

/**
 * Registers all Agents & Department Head IPC endpoints.
 * @param {object} [aiHandler]
 * @param {object} [orchestratorInstance]
 */
function registerDepartmentHeadHandlers(aiHandler, orchestratorInstance) {
  if (aiHandler) {
    departmentHeadAgent.setAiHandler(aiHandler);
  }
  if (orchestratorInstance) {
    departmentHeadAgent.setOrchestrator(orchestratorInstance);
  }

  if (!ipcMain) {
    console.warn('[DeptHeadHandler] ipcMain not available in current environment.');
    return;
  }

  console.log('[DeptHeadHandler] Registering agents & department head IPC endpoints...');

  // 1. agents:getAll -> returns list of all 46 agents
  ipcMain.handle('agents:getAll', async () => {
    try {
      return agentsRegistry.getAll();
    } catch (err) {
      console.error('[DeptHeadHandler] agents:getAll error:', err.message);
      return [];
    }
  });

  // 2. agents:getAgent -> returns single agent by id/num
  ipcMain.handle('agents:getAgent', async (_event, idOrNum) => {
    try {
      return agentsRegistry.getAgent(idOrNum);
    } catch (err) {
      console.error('[DeptHeadHandler] agents:getAgent error:', err.message);
      return null;
    }
  });

  // 3. dept-head:getPlan -> returns generated plan for projectId
  ipcMain.handle('dept-head:getPlan', async (_event, projectId) => {
    try {
      return agentsRegistry.getPlan(projectId);
    } catch (err) {
      console.error('[DeptHeadHandler] dept-head:getPlan error:', err.message);
      return null;
    }
  });

  // 4. orch:respondReview / dept-head:respondReview -> unpauses and responds to review gate
  const handleReviewResponse = async (_event, payload) => {
    try {
      return await departmentHeadAgent.respondToReview(payload || {});
    } catch (err) {
      console.error('[DeptHeadHandler] respondToReview error:', err.message);
      return { success: false, error: err.message };
    }
  };

  ipcMain.handle('orch:respondReview', handleReviewResponse);
  ipcMain.handle('dept-head:respondReview', handleReviewResponse);

  // 5. Seed Engine IPC channels
  const { designSeedAgent } = require('./design-seed-agent');
  if (aiHandler) {
    designSeedAgent.setAiHandler(aiHandler);
  }

  ipcMain.handle('seed:get', async (_event, projectId) => {
    try {
      return designSeedAgent.getSeed(projectId);
    } catch (err) {
      console.error('[DeptHeadHandler] seed:get error:', err.message);
      return null;
    }
  });

  ipcMain.handle('seed:regenerate', async (_event, { projectId, feedback }) => {
    try {
      return await designSeedAgent.generateSeed(projectId, { regenerate: true, feedback });
    } catch (err) {
      console.error('[DeptHeadHandler] seed:regenerate error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('seed:getReport', async (_event, projectId) => {
    try {
      return designSeedAgent.getAntiGenericReport(projectId);
    } catch (err) {
      console.error('[DeptHeadHandler] seed:getReport error:', err.message);
      return { valid: false, score: 0, violations: [] };
    }
  });
}

module.exports = {
  registerDepartmentHeadHandlers,
  departmentHeadAgent,
  agentsRegistry,
};
