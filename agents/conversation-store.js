/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — CONVERSATION STORE (agents/conversation-store.js)
 * ==============================================================================
 * SQLite persistence for conversations, turns, vision attachments, and extracted
 * project metadata.
 *
 * Exposes:
 * - getConversations()
 * - createConversation(title, projectId)
 * - getConversation(id)
 * - updateConversationTitle(id, title)
 * - linkConversationToProject(id, projectId)
 * - addMessage({ conversationId, role, text, images, intent, extracted })
 * - getMessages(conversationId, limit)
 * - getRecentHistory(conversationId, limit)
 * - deleteConversation(id)
 * ==============================================================================
 */

class ConversationStore {
  /**
   * @param {object} [options]
   * @param {import('better-sqlite3').Database} [options.db]
   */
  constructor(options = {}) {
    this.db = options.db || null;
  }

  getDb() {
    if (this.db) return this.db;
    try {
      const { getDb } = require('../db/database');
      this.db = getDb();
      this.ensureTables();
      return this.db;
    } catch (err) {
      console.warn('[ConversationStore] Database not yet accessible:', err.message);
      return null;
    }
  }

  ensureTables() {
    if (!this.db) return;
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER,
          title TEXT NOT NULL DEFAULT 'New Project Consultation',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          text TEXT NOT NULL,
          images_json TEXT,
          intent TEXT,
          extracted_json TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at ASC);
      `);
    } catch (err) {
      console.warn('[ConversationStore] Table check warning:', err.message);
    }
  }

  /**
   * Retrieves all conversations ordered by recent activity.
   */
  getConversations() {
    const db = this.getDb();
    if (!db) return [];

    try {
      const rows = db.prepare(`
        SELECT c.*, 
               (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
               (SELECT m.text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
               p.name AS project_name
        FROM conversations c
        LEFT JOIN projects p ON p.id = c.project_id
        ORDER BY c.updated_at DESC
      `).all();

      return rows;
    } catch (err) {
      console.error('[ConversationStore] Failed to list conversations:', err.message);
      return [];
    }
  }

  /**
   * Creates a new conversation thread.
   * @param {string} [title]
   * @param {number|null} [projectId]
   */
  createConversation(title = 'New Project Consultation', projectId = null) {
    const db = this.getDb();
    if (!db) throw new Error('Database is unavailable');

    const stmt = db.prepare(`
      INSERT INTO conversations (title, project_id, created_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `);
    const info = stmt.run(title, projectId);
    const id = info.lastInsertRowid;

    console.log(`[ConversationStore] Created conversation #${id} ("${title}")`);
    return this.getConversation(id);
  }

  /**
   * Fetches a conversation by ID.
   * @param {number|string} id
   */
  getConversation(id) {
    const db = this.getDb();
    if (!db) return null;

    try {
      const row = db.prepare(`
        SELECT c.*, p.name AS project_name, p.type AS project_type
        FROM conversations c
        LEFT JOIN projects p ON p.id = c.project_id
        WHERE c.id = ?
      `).get(Number(id));
      return row || null;
    } catch (err) {
      console.error(`[ConversationStore] Error getting conversation ${id}:`, err.message);
      return null;
    }
  }

  /**
   * Renames a conversation.
   * @param {number|string} id
   * @param {string} title
   */
  updateConversationTitle(id, title) {
    const db = this.getDb();
    if (!db || !title) return false;

    try {
      db.prepare(`
        UPDATE conversations
        SET title = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(title.trim(), Number(id));
      return true;
    } catch (err) {
      console.error(`[ConversationStore] Error updating title for #${id}:`, err.message);
      return false;
    }
  }

  /**
   * Associates an ongoing conversation with a created project ID.
   * @param {number|string} conversationId
   * @param {number|string} projectId
   */
  linkConversationToProject(conversationId, projectId) {
    const db = this.getDb();
    if (!db) return false;

    try {
      db.prepare(`
        UPDATE conversations
        SET project_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(Number(projectId), Number(conversationId));
      console.log(`[ConversationStore] Linked conversation #${conversationId} to project #${projectId}`);
      return true;
    } catch (err) {
      console.error('[ConversationStore] Error linking to project:', err.message);
      return false;
    }
  }

  /**
   * Persists a message turn into SQLite.
   * @param {object} params
   * @param {number|string} params.conversationId
   * @param {'user'|'agent'} params.role
   * @param {string} params.text
   * @param {Array} [params.images]
   * @param {string} [params.intent]
   * @param {object} [params.extracted]
   */
  addMessage({ conversationId, role, text, images = [], intent = null, extracted = null }) {
    const db = this.getDb();
    if (!db) throw new Error('Database is unavailable');

    const imagesJson = Array.isArray(images) && images.length > 0 ? JSON.stringify(images) : null;
    const extractedJson = extracted ? JSON.stringify(extracted) : null;

    const stmt = db.prepare(`
      INSERT INTO messages (conversation_id, role, text, images_json, intent, extracted_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const info = stmt.run(
      Number(conversationId),
      role,
      text || '',
      imagesJson,
      intent,
      extractedJson
    );

    // Update conversation updated_at
    db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(Number(conversationId));

    // Auto-update conversation title from first user message if still default
    if (role === 'user' && text) {
      const conv = this.getConversation(conversationId);
      if (conv && conv.title === 'New Project Consultation') {
        const generatedTitle = text.slice(0, 36).replace(/\n/g, ' ').trim() + (text.length > 36 ? '...' : '');
        this.updateConversationTitle(conversationId, generatedTitle);
      }
    }

    return {
      id: info.lastInsertRowid,
      conversation_id: Number(conversationId),
      role,
      text,
      images: images || [],
      intent,
      extracted,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Retrieves messages for a conversation.
   * @param {number|string} conversationId
   * @param {number} [limit=100]
   */
  getMessages(conversationId, limit = 100) {
    const db = this.getDb();
    if (!db) return [];

    try {
      const rows = db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY id ASC
        LIMIT ?
      `).all(Number(conversationId), limit);

      return rows.map((r) => ({
        id: r.id,
        conversation_id: r.conversation_id,
        role: r.role,
        text: r.text,
        images: r.images_json ? JSON.parse(r.images_json) : [],
        intent: r.intent,
        extracted: r.extracted_json ? JSON.parse(r.extracted_json) : null,
        created_at: r.created_at,
      }));
    } catch (err) {
      console.error(`[ConversationStore] Error getting messages for #${conversationId}:`, err.message);
      return [];
    }
  }

  /**
   * Retrieves recent message context formatted for AI prompt windows.
   * @param {number|string} conversationId
   * @param {number} [limit=20]
   */
  getRecentHistory(conversationId, limit = 20) {
    const db = this.getDb();
    if (!db) return [];

    try {
      const rows = db.prepare(`
        SELECT role, text, images_json FROM (
          SELECT id, role, text, images_json
          FROM messages
          WHERE conversation_id = ?
          ORDER BY id DESC
          LIMIT ?
        ) ORDER BY id ASC
      `).all(Number(conversationId), limit);

      return rows.map((r) => ({
        role: r.role,
        text: r.text,
        images: r.images_json ? JSON.parse(r.images_json) : [],
      }));
    } catch (err) {
      console.error('[ConversationStore] Error reading recent history:', err.message);
      return [];
    }
  }

  /**
   * Deletes a conversation and its messages.
   * @param {number|string} id
   */
  deleteConversation(id) {
    const db = this.getDb();
    if (!db) return false;

    try {
      db.prepare(`DELETE FROM conversations WHERE id = ?`).run(Number(id));
      console.log(`[ConversationStore] Deleted conversation #${id}`);
      return true;
    } catch (err) {
      console.error(`[ConversationStore] Error deleting conversation #${id}:`, err.message);
      return false;
    }
  }
}

const conversationStore = new ConversationStore();

module.exports = {
  ConversationStore,
  conversationStore,
};
