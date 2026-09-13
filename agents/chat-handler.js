/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — CHAT IPC HANDLER (agents/chat-handler.js)
 * ==============================================================================
 * Bridges Electron Main Process, SQLite Conversation Store, Senior Chat Agent,
 * Native File Dialogs (for image attachment), and Renderer UI.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
let electron = null;
let ipcMain = null;
let dialog = null;

if (process.versions && process.versions.electron) {
  try {
    electron = require('electron');
    ipcMain = electron?.ipcMain;
    dialog = electron?.dialog;
  } catch (_) {}
}

const { conversationStore } = require('./conversation-store');
const { projectChecklist } = require('./project-checklist');
const { seniorChatAgent } = require('./senior-chat');

/**
 * Registers all Chat IPC endpoints.
 * @param {object} [aiHandler]
 * @param {object} [orchestratorInstance]
 */
function registerChatIpcHandlers(aiHandler, orchestratorInstance) {
  if (!ipcMain) {
    console.warn('[ChatHandler] ipcMain not available in current environment.');
    return;
  }

  if (aiHandler) {
    seniorChatAgent.setAiHandler(aiHandler);
  }
  if (orchestratorInstance) {
    seniorChatAgent.orchestrator = orchestratorInstance;
  }

  console.log('[ChatHandler] Registering chat IPC handlers...');

  // 1. chat:getConversations
  ipcMain.handle('chat:getConversations', async () => {
    try {
      return conversationStore.getConversations();
    } catch (err) {
      console.error('[ChatHandler] chat:getConversations error:', err.message);
      return [];
    }
  });

  // 2. chat:newConversation(projectId)
  ipcMain.handle('chat:newConversation', async (_event, projectId = null) => {
    try {
      return conversationStore.createConversation('New Project Consultation', projectId);
    } catch (err) {
      console.error('[ChatHandler] chat:newConversation error:', err.message);
      return null;
    }
  });

  // 3. chat:getMessages(conversationId)
  ipcMain.handle('chat:getMessages', async (_event, conversationId) => {
    try {
      return conversationStore.getMessages(conversationId, 100);
    } catch (err) {
      console.error('[ChatHandler] chat:getMessages error:', err.message);
      return [];
    }
  });

  // 4. chat:sendMessage(payload)
  ipcMain.handle('chat:sendMessage', async (event, payload) => {
    try {
      const { conversationId, text, images } = payload || {};

      // Notify window of agent typing state
      event.sender.send('chat:typing', { isTyping: true, conversationId });

      const result = await seniorChatAgent.handleUserMessage({
        conversationId,
        text,
        images: Array.isArray(images) ? images : [],
      });

      event.sender.send('chat:typing', { isTyping: false, conversationId });
      return result;
    } catch (err) {
      console.error('[ChatHandler] chat:sendMessage error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 5. chat:attachImage() -> native file picker
  ipcMain.handle('chat:attachImage', async () => {
    if (!dialog) {
      return { success: false, error: 'Native file dialog unavailable' };
    }

    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Reference Design or Mockup',
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] },
        ],
      });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const filePath = result.filePaths[0];
      const filename = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
      };
      const mimeType = mimeMap[ext] || 'image/png';

      const fileBuffer = fs.readFileSync(filePath);
      const base64Data = fileBuffer.toString('base64');
      const dataUri = `data:${mimeType};base64,${base64Data}`;

      console.log(`[ChatHandler] Attached image "${filename}" (${Math.round(fileBuffer.length / 1024)} KB)`);

      return {
        success: true,
        image: {
          filename,
          mimeType,
          data: dataUri,
          size: fileBuffer.length,
        },
      };
    } catch (err) {
      console.error('[ChatHandler] chat:attachImage error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 6. chat:getChecklist(projectId)
  ipcMain.handle('chat:getChecklist', async (_event, projectId) => {
    try {
      return projectChecklist.getChecklist(projectId);
    } catch (err) {
      console.error('[ChatHandler] chat:getChecklist error:', err.message);
      return null;
    }
  });

  // 7. chat:markChecklistDone({ projectId, itemKey })
  ipcMain.handle('chat:markChecklistDone', async (_event, { projectId, itemKey }) => {
    try {
      const ok = projectChecklist.markDone(projectId, itemKey);
      return { success: ok, checklist: projectChecklist.getChecklist(projectId) };
    } catch (err) {
      console.error('[ChatHandler] chat:markChecklistDone error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // 8. chat:deleteConversation(id)
  ipcMain.handle('chat:deleteConversation', async (_event, id) => {
    try {
      const ok = conversationStore.deleteConversation(id);
      return { success: ok };
    } catch (err) {
      console.error('[ChatHandler] chat:deleteConversation error:', err.message);
      return { success: false, error: err.message };
    }
  });

  console.log('[ChatHandler] Chat IPC handlers registered successfully.');
}

module.exports = {
  registerChatIpcHandlers,
};
