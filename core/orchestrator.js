/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — ORCHESTRATOR ENGINE (core/orchestrator.js)
 * ==============================================================================
 * Main process execution engine for Directed Acyclic Task Graphs:
 * - Concurrency control with configurable limits
 * - Dynamic dependency resolution upon task completion
 * - Failure propagation with branch isolation and node skipping
 * - Graceful pause, resume, and cancellation (AbortController)
 * - SQLite lifecycle persistence & crash recovery
 * - Decoupled event broadcasting via EventBus
 * ==============================================================================
 */

const {
  createGraph,
  getReadyNodes,
  propagateSkipped,
  getNodeStats,
  isGraphFinished,
  NodeState,
  GraphState,
} = require('./task-graph');
const { TaskRunner } = require('./task-runner');
const { eventBus } = require('./event-bus');

class Orchestrator {
  /**
   * @param {object} options
   * @param {object} [options.db] SQLite database instance
   * @param {object} [options.aiHandler] Reference to AI subsystem
   * @param {number} [options.maxConcurrency] Global maximum concurrent tasks (default 3)
   */
  constructor(options = {}) {
    this.db = options.db || null;
    this.aiHandler = options.aiHandler || null;
    this.maxConcurrency = options.maxConcurrency || 3;

    this.runner = new TaskRunner({
      aiHandler: this.aiHandler,
      db: this.db,
    });

    /** @type {Map<string, object>} active graphs in memory */
    this.activeGraphs = new Map();

    /** @type {Map<string, AbortController>} graph cancellation controllers */
    this.abortControllers = new Map();

    /** @type {Map<string, Set<string>>} graphId -> Set of currently running nodeIds */
    this.runningNodes = new Map();

    /** @type {string|null} ID of current active or most recent graph */
    this.currentActiveGraphId = null;

    this.isInitialized = false;
  }

  /**
   * Initializes the Orchestrator with database and crash recovery.
   * @param {import('better-sqlite3').Database} db
   * @param {object} [aiHandler]
   */
  init(db, aiHandler = null) {
    if (this.isInitialized && !db) return;

    this.db = db;
    if (aiHandler) this.aiHandler = aiHandler;

    this.runner = new TaskRunner({
      aiHandler: this.aiHandler,
      db: this.db,
    });

    eventBus.setDb(this.db);

    if (this.db) {
      this.recoverInterruptedGraphs();
    }

    this.isInitialized = true;
    console.log('[Orchestrator] Task Orchestrator Engine initialized.');
  }

  /**
   * Recovers graphs from SQLite that were left in RUNNING status when the app crashed/restarted.
   * Marks them and their running nodes as INTERRUPTED so they can be inspected or resumed.
   */
  recoverInterruptedGraphs() {
    if (!this.db) return;

    try {
      const runningGraphs = this.db.prepare(`
        SELECT graph_id, name FROM task_graphs WHERE status = 'running'
      `).all();

      if (runningGraphs.length > 0) {
        console.warn(`[Orchestrator] Detected ${runningGraphs.length} interrupted graph(s) from previous session.`);

        for (const g of runningGraphs) {
          console.log(`[Orchestrator] Marking interrupted graph "${g.graph_id}" (${g.name})...`);

          // Mark interrupted tasks
          this.db.prepare(`
            UPDATE tasks
            SET status = 'interrupted', finished_at = datetime('now'), error = 'Process terminated unexpectedly'
            WHERE graph_id = ? AND status = 'running'
          `).run(g.graph_id);

          // Update graph status to interrupted
          this.db.prepare(`
            UPDATE task_graphs
            SET status = 'interrupted', updated_at = datetime('now')
            WHERE graph_id = ?
          `).run(g.graph_id);

          eventBus.publish('graph:failed', {
            graphId: g.graph_id,
            data: { reason: 'Interrupted by application restart' },
          });
        }
      }
    } catch (err) {
      console.error('[Orchestrator] Failed to recover interrupted graphs:', err.message);
    }
  }

  /**
   * Persists the initial graph definition and node rows into SQLite.
   * @param {object} graph
   */
  persistNewGraph(graph) {
    if (!this.db) return;

    try {
      const stats = getNodeStats(graph);
      const insertGraphStmt = this.db.prepare(`
        INSERT INTO task_graphs (graph_id, name, status, created_at, updated_at, stats_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertTaskStmt = this.db.prepare(`
        INSERT INTO tasks (graph_id, node_id, handler, status, attempts)
        VALUES (?, ?, ?, ?, 0)
      `);

      const tx = this.db.transaction(() => {
        insertGraphStmt.run(
          graph.graphId,
          graph.name,
          graph.status,
          graph.createdAt,
          graph.updatedAt,
          JSON.stringify(stats)
        );

        for (const node of graph.nodes) {
          insertTaskStmt.run(graph.graphId, node.id, node.handler, node.status);
        }
      });

      tx();
    } catch (err) {
      console.warn('[Orchestrator] Failed to persist new graph into SQLite:', err.message);
    }
  }

  /**
   * Updates an individual task row in SQLite.
   * @param {string} graphId
   * @param {object} node
   */
  persistTaskState(graphId, node) {
    if (!this.db) return;

    try {
      let outputJson = null;
      if (node.output !== undefined && node.output !== null) {
        try {
          outputJson = JSON.stringify(node.output);
        } catch (e) {
          outputJson = JSON.stringify({ serializationError: e.message });
        }
      }

      this.db.prepare(`
        UPDATE tasks
        SET status = ?, attempts = ?, started_at = ?, finished_at = ?, error = ?, output_json = ?
        WHERE graph_id = ? AND node_id = ?
      `).run(
        node.status,
        node.attempts || 0,
        node.startedAt,
        node.finishedAt,
        node.error,
        outputJson,
        graphId,
        node.id
      );
    } catch (err) {
      console.warn(`[Orchestrator] Failed to persist task state "${node.id}":`, err.message);
    }
  }

  /**
   * Updates graph record in SQLite.
   * @param {object} graph
   * @param {object} [result]
   */
  persistGraphState(graph, result = null) {
    if (!this.db) return;

    try {
      const stats = getNodeStats(graph);
      const statsJson = JSON.stringify(stats);
      const resultJson = result ? JSON.stringify(result) : null;
      const updatedAt = new Date().toISOString();

      this.db.prepare(`
        UPDATE task_graphs
        SET status = ?, updated_at = ?, stats_json = ?, result_json = COALESCE(?, result_json)
        WHERE graph_id = ?
      `).run(graph.status, updatedAt, statsJson, resultJson, graph.graphId);
    } catch (err) {
      console.warn(`[Orchestrator] Failed to persist graph state "${graph.graphId}":`, err.message);
    }
  }

  /**
   * Accepts and executes a task graph.
   *
   * @param {object} rawGraph Input graph specification
   * @returns {Promise<object>} Terminal graph result
   */
  async runGraph(rawGraph) {
    const graph = createGraph(rawGraph);
    const graphId = graph.graphId;
    rawGraph.graphId = graphId;

    console.log(`[Orchestrator] Graph started: "${graph.name}" (${graphId}) with ${graph.nodes.length} nodes.`);

    graph.status = GraphState.RUNNING;
    graph.startedAt = new Date().toISOString();
    this.activeGraphs.set(graphId, graph);
    this.runningNodes.set(graphId, new Set());
    this.currentActiveGraphId = graphId;

    if (!this.activeSessions) {
      this.activeSessions = new Map();
    }

    const abortController = new AbortController();
    this.abortControllers.set(graphId, abortController);

    this.persistNewGraph(graph);

    eventBus.publish('graph:started', {
      graphId,
      data: {
        name: graph.name,
        nodesCount: graph.nodes.length,
        maxConcurrency: graph.maxConcurrency || this.maxConcurrency,
      },
    });

    const startTime = Date.now();

    return new Promise((resolve) => {
      let isResolved = false;

      const scheduleNext = () => {
        if (isResolved) return;

        // If graph was paused or cancelled, stop dispatching new tasks
        if (graph.status === GraphState.PAUSED) {
          console.log(`[Orchestrator] Graph "${graphId}" is paused. No new tasks will be scheduled.`);
          return;
        }
        if (graph.status === GraphState.CANCELLED) {
          return;
        }

        const currentlyRunning = this.runningNodes.get(graphId) || new Set();
        const effectiveConcurrency = graph.maxConcurrency || this.maxConcurrency;
        const availableSlots = effectiveConcurrency - currentlyRunning.size;

        if (availableSlots > 0) {
          const readyNodes = getReadyNodes(graph);
          const nodesToDispatch = readyNodes.slice(0, availableSlots);

          for (const node of nodesToDispatch) {
            this.dispatchNode(graph, node, scheduleNext, finishCheck);
          }
        }

        finishCheck();
      };

      const finishCheck = () => {
        if (isResolved) return;
        const currentlyRunning = this.runningNodes.get(graphId) || new Set();

        if (isGraphFinished(graph) && currentlyRunning.size === 0) {
          isResolved = true;
          this.activeSessions.delete(graphId);

          const durationMs = Date.now() - startTime;
          const stats = getNodeStats(graph);

          let terminalStatus = GraphState.COMPLETED;
          if (graph.status === GraphState.CANCELLED) {
            terminalStatus = GraphState.CANCELLED;
          } else if (stats.failed > 0 || stats.skipped > 0) {
            terminalStatus = stats.completed > 0 ? GraphState.COMPLETED_WITH_ERRORS : GraphState.FAILED;
          }

          graph.status = terminalStatus;
          graph.finishedAt = new Date().toISOString();

          const result = {
            graphId,
            name: graph.name,
            status: terminalStatus,
            nodeStats: {
              total: stats.total,
              completed: stats.completed,
              failed: stats.failed,
              skipped: stats.skipped,
              cancelled: stats.cancelled,
            },
            durationMs,
          };

          this.persistGraphState(graph, result);

          const eventName = terminalStatus === GraphState.COMPLETED
            ? 'graph:completed'
            : (terminalStatus === GraphState.CANCELLED ? 'graph:cancelled' : 'graph:failed');

          console.log(`[Orchestrator] Graph "${graphId}" finalized with status "${terminalStatus}" in ${durationMs}ms.`);

          eventBus.publish(eventName, {
            graphId,
            data: result,
          });

          this.abortControllers.delete(graphId);
          resolve(result);
        }
      };

      this.activeSessions.set(graphId, { scheduleNext, finishCheck, resolve });

      // Kick off initial ready nodes
      scheduleNext();
    });
  }

  /**
   * Dispatches a single ready node asynchronously.
   * @param {object} graph
   * @param {object} node
   * @param {Function} scheduleNext
   * @param {Function} finishCheck
   */
  async dispatchNode(graph, node, scheduleNext, finishCheck) {
    const graphId = graph.graphId;
    const runningSet = this.runningNodes.get(graphId);
    if (!runningSet) return;

    runningSet.add(node.id);
    this.persistTaskState(graphId, node);

    const abortController = this.abortControllers.get(graphId);
    const signal = abortController ? abortController.signal : null;

    try {
      const outcome = await this.runner.runNode(graph, node, signal);

      if (!outcome.success && node.status === NodeState.FAILED) {
        // Propagate SKIPPED to any pending nodes depending on this failed node
        const newlySkipped = propagateSkipped(graph, node.id);
        for (const skippedId of newlySkipped) {
          const skippedNode = graph.nodes.find((n) => n.id === skippedId);
          if (skippedNode) {
            this.persistTaskState(graphId, skippedNode);
            eventBus.publish('task:skipped', {
              graphId,
              nodeId: skippedId,
              data: {
                reason: `Dependency "${node.id}" failed`,
              },
            });
          }
        }
      }
    } catch (err) {
      console.error(`[Orchestrator] Unexpected fatal error in node "${node.id}":`, err.message);
      node.status = NodeState.FAILED;
      node.error = err.message;
      node.finishedAt = new Date().toISOString();
      propagateSkipped(graph, node.id);
    } finally {
      this.persistTaskState(graphId, node);
      this.persistGraphState(graph);
      runningSet.delete(node.id);

      // Trigger next round of ready tasks
      scheduleNext();
      finishCheck();
    }
  }

  /**
   * Pauses an actively running graph. Running tasks finish, but no new tasks start.
   * @param {string} graphId
   * @returns {{ success: boolean, message?: string }}
   */
  pauseGraph(graphId) {
    const graph = this.activeGraphs.get(graphId);
    if (!graph) {
      return { success: false, message: `Graph "${graphId}" not found in active memory` };
    }

    if (graph.status !== GraphState.RUNNING) {
      return { success: false, message: `Graph is not in running state (current: ${graph.status})` };
    }

    graph.status = GraphState.PAUSED;
    this.persistGraphState(graph);

    eventBus.publish('graph:paused', {
      graphId,
      data: { message: 'Graph execution paused' },
    });

    console.log(`[Orchestrator] Graph "${graphId}" paused.`);
    return { success: true };
  }

  /**
   * Resumes a paused graph.
   * @param {string} graphId
   * @returns {{ success: boolean, message?: string }}
   */
  resumeGraph(graphId) {
    const graph = this.activeGraphs.get(graphId);
    if (!graph) {
      return { success: false, message: `Graph "${graphId}" not found in active memory` };
    }

    if (graph.status !== GraphState.PAUSED) {
      return { success: false, message: `Graph is not paused (current: ${graph.status})` };
    }

    graph.status = GraphState.RUNNING;
    this.persistGraphState(graph);

    eventBus.publish('graph:resumed', {
      graphId,
      data: { message: 'Graph execution resumed' },
    });

    console.log(`[Orchestrator] Graph "${graphId}" resumed. Scheduling ready tasks...`);

    const session = this.activeSessions?.get(graphId);
    if (session && typeof session.scheduleNext === 'function') {
      session.scheduleNext();
    }

    return { success: true };
  }

  /**
   * Cancels a graph. Aborts running tasks and marks pending nodes as CANCELLED.
   * @param {string} graphId
   * @returns {{ success: boolean, message?: string }}
   */
  cancelGraph(graphId) {
    const graph = this.activeGraphs.get(graphId);
    if (!graph) {
      return { success: false, message: `Graph "${graphId}" not found in active memory` };
    }

    console.log(`[Orchestrator] Cancelling graph "${graphId}"...`);
    graph.status = GraphState.CANCELLED;

    // Trigger AbortController to signal all running tasks
    const abortController = this.abortControllers.get(graphId);
    if (abortController) {
      abortController.abort(new Error('Graph cancelled by user'));
    }

    // Mark all pending nodes as CANCELLED
    for (const node of graph.nodes) {
      if (node.status === NodeState.PENDING) {
        node.status = NodeState.CANCELLED;
        node.finishedAt = new Date().toISOString();
        node.error = 'Cancelled before execution';
        this.persistTaskState(graphId, node);
      }
    }

    this.persistGraphState(graph, {
      status: GraphState.CANCELLED,
      cancelledAt: new Date().toISOString(),
    });

    eventBus.publish('graph:cancelled', {
      graphId,
      data: { message: 'Graph cancelled by user' },
    });

    return { success: true };
  }

  /**
   * Retrieves the currently active in-memory graph or most recent active graph.
   * @returns {object|null}
   */
  getActiveGraph() {
    if (this.currentActiveGraphId) {
      const g = this.activeGraphs.get(this.currentActiveGraphId);
      if (g) return g;
    }

    // Fallback: search any running or paused graph
    for (const g of this.activeGraphs.values()) {
      if (g.status === GraphState.RUNNING || g.status === GraphState.PAUSED) {
        return g;
      }
    }

    return null;
  }

  /**
   * Queries past graphs from SQLite.
   * @param {number} [limit=20]
   * @returns {object[]}
   */
  getGraphHistory(limit = 20) {
    if (!this.db) {
      // Return in-memory history if db not yet loaded
      return Array.from(this.activeGraphs.values()).slice(0, limit);
    }

    try {
      const rows = this.db.prepare(`
        SELECT id, graph_id, name, status, created_at, updated_at, result_json, stats_json
        FROM task_graphs
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);

      return rows.map((r) => ({
        id: r.id,
        graphId: r.graph_id,
        name: r.name,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        result: r.result_json ? JSON.parse(r.result_json) : null,
        stats: r.stats_json ? JSON.parse(r.stats_json) : null,
      }));
    } catch (err) {
      console.error('[Orchestrator] getGraphHistory error:', err.message);
      return [];
    }
  }

  /**
   * Retrieves full details (nodes and events) for a specific graph from SQLite.
   * @param {string} graphId
   * @returns {object} { graph, nodes[], events[] }
   */
  getGraphDetail(graphId) {
    if (!this.db) {
      const inMemory = this.activeGraphs.get(graphId);
      return { graph: inMemory || null, nodes: inMemory?.nodes || [], events: [] };
    }

    try {
      const graphRow = this.db.prepare(`
        SELECT id, graph_id, name, status, created_at, updated_at, result_json, stats_json
        FROM task_graphs
        WHERE graph_id = ?
      `).get(graphId);

      const nodesRows = this.db.prepare(`
        SELECT id, graph_id, node_id, handler, status, attempts, started_at, finished_at, error, output_json
        FROM tasks
        WHERE graph_id = ?
        ORDER BY id ASC
      `).all(graphId);

      const eventsRows = this.db.prepare(`
        SELECT id, graph_id, node_id, event_type, data_json, timestamp
        FROM task_events
        WHERE graph_id = ?
        ORDER BY id ASC
      `).all(graphId);

      return {
        graph: graphRow ? {
          ...graphRow,
          result: graphRow.result_json ? JSON.parse(graphRow.result_json) : null,
          stats: graphRow.stats_json ? JSON.parse(graphRow.stats_json) : null,
        } : null,
        nodes: nodesRows.map((n) => ({
          id: n.node_id,
          handler: n.handler,
          status: n.status,
          attempts: n.attempts,
          startedAt: n.started_at,
          finishedAt: n.finished_at,
          error: n.error,
          output: n.output_json ? JSON.parse(n.output_json) : null,
        })),
        events: eventsRows.map((e) => ({
          id: e.id,
          nodeId: e.node_id,
          eventType: e.event_type,
          data: e.data_json ? JSON.parse(e.data_json) : null,
          timestamp: e.timestamp,
        })),
      };
    } catch (err) {
      console.error(`[Orchestrator] getGraphDetail error for "${graphId}":`, err.message);
      return { graph: null, nodes: [], events: [] };
    }
  }

  /**
   * Builds the canonical Phase 4 demo graph to prove all capabilities:
   * - wait(2s) + ai-ping in parallel
   * - fail-test depends on both
   * - final wait(1s) depends on fail-test
   * @returns {object}
   */
  buildDemoGraph() {
    const timestamp = Date.now();
    return {
      graphId: `demo-graph-${timestamp}`,
      name: `Pipeline Validation Demo • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
      maxConcurrency: 3,
      nodes: [
        {
          id: 'demo-wait-1',
          handler: 'demo.wait',
          dependsOn: [],
          params: { durationMs: 2000 },
          priority: 1,
          maxRetries: 0,
          timeoutMs: 10000,
        },
        {
          id: 'demo-ai-ping',
          handler: 'demo.ai-ping',
          dependsOn: [],
          params: { prompt: 'Reply with exactly: OK' },
          priority: 1,
          maxRetries: 1,
          timeoutMs: 30000,
        },
        {
          id: 'demo-fail-test',
          handler: 'demo.fail-test',
          dependsOn: ['demo-wait-1', 'demo-ai-ping'],
          params: { failFirstTime: true },
          priority: 2,
          maxRetries: 2,
          timeoutMs: 15000,
        },
        {
          id: 'demo-wait-final',
          handler: 'demo.wait',
          dependsOn: ['demo-fail-test'],
          params: { durationMs: 1000 },
          priority: 3,
          maxRetries: 0,
          timeoutMs: 10000,
        },
      ],
    };
  }

  /**
   * Convenience method to build and run the demo pipeline.
   * @returns {Promise<object>}
   */
  async runDemoGraph() {
    const demoSpec = this.buildDemoGraph();
    // Start asynchronous execution in background
    const runPromise = this.runGraph(demoSpec);

    // Return graphId immediately so UI can attach
    return {
      success: true,
      graphId: demoSpec.graphId,
      promise: runPromise,
    };
  }
}

// Global singleton orchestrator
const orchestrator = new Orchestrator();

module.exports = {
  Orchestrator,
  orchestrator,
};
