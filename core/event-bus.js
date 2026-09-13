/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — ORCHESTRATOR EVENT BUS (core/event-bus.js)
 * ==============================================================================
 * Main-process publish/subscribe event bus.
 * - Publishes graph and task lifecycle events
 * - Dispatches events in real time to renderer via Electron webContents
 * - Persists all events to SQLite `task_events` audit table
 * ==============================================================================
 */

const { EventEmitter } = require('events');

let electron = null;
if (process.versions && process.versions.electron) {
  try {
    electron = require('electron');
  } catch (e) {
    // Graceful fallback for non-Electron test runtimes
  }
}

class OrchestratorEventBus extends EventEmitter {
  constructor() {
    super();
    this.db = null;
    this.insertEventStmt = null;
  }

  /**
   * Sets the database instance and prepares SQL statements.
   * @param {import('better-sqlite3').Database} db
   */
  setDb(db) {
    this.db = db;
    if (db) {
      try {
        this.insertEventStmt = db.prepare(`
          INSERT INTO task_events (graph_id, node_id, event_type, data_json, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `);
      } catch (err) {
        console.warn('[EventBus] Could not prepare insert statement for task_events:', err.message);
        this.insertEventStmt = null;
      }
    }
  }

  /**
   * Broadcasts an event to all open Electron windows.
   * @param {string} channel
   * @param {any} payload
   */
  broadcastToRenderer(channel, payload) {
    if (!electron || !electron.BrowserWindow) return;

    try {
      const windows = electron.BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (win && !win.isDestroyed() && win.webContents) {
          win.webContents.send(channel, payload);
        }
      }
    } catch (err) {
      console.warn('[EventBus] Failed to forward event to renderer:', err.message);
    }
  }

  /**
   * Publishes an orchestrator or task event.
   * Supported types:
   * - graph:started, graph:paused, graph:resumed, graph:completed, graph:failed, graph:cancelled
   * - task:started, task:progress, task:completed, task:failed, task:skipped
   *
   * @param {string} eventType
   * @param {object} param1
   * @param {string} param1.graphId
   * @param {string} [param1.nodeId]
   * @param {any} [param1.data]
   * @returns {object} The full event envelope
   */
  publish(eventType, { graphId, nodeId = null, data = {} } = {}) {
    const timestamp = new Date().toISOString();
    const eventPayload = {
      eventType,
      graphId,
      nodeId,
      timestamp,
      data,
    };

    // 1. Emit locally on Node EventEmitter
    this.emit(eventType, eventPayload);
    this.emit('*', eventPayload);

    // 2. Persist to SQLite task_events table
    if (this.db) {
      try {
        let dataJson = '{}';
        try {
          dataJson = JSON.stringify(data || {});
        } catch (e) {
          dataJson = JSON.stringify({ serializationError: e.message });
        }

        if (this.insertEventStmt) {
          this.insertEventStmt.run(graphId, nodeId, eventType, dataJson, timestamp);
        } else {
          this.db.prepare(`
            INSERT INTO task_events (graph_id, node_id, event_type, data_json, timestamp)
            VALUES (?, ?, ?, ?, ?)
          `).run(graphId, nodeId, eventType, dataJson, timestamp);
        }
      } catch (err) {
        console.warn(`[EventBus] Failed to persist task_event "${eventType}":`, err.message);
      }
    }

    // 3. Dispatch to Electron renderer
    this.broadcastToRenderer('orchestrator:event', eventPayload);

    return eventPayload;
  }
}

// Global singleton event bus
const eventBus = new OrchestratorEventBus();

module.exports = {
  OrchestratorEventBus,
  eventBus,
};
