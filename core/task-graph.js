/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — TASK GRAPH MODEL (core/task-graph.js)
 * ==============================================================================
 * Graph validation, dependency resolution, cycle detection, topological sorting,
 * and state management for task execution graphs.
 * ==============================================================================
 */

const crypto = require('crypto');

/**
 * Valid node lifecycle states.
 */
const NodeState = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  WAITING_FOR_USER: 'waiting_for_user',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  INTERRUPTED: 'interrupted',
  CANCELLED: 'cancelled',
});

/**
 * Valid graph lifecycle states.
 */
const GraphState = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  COMPLETED_WITH_ERRORS: 'completed_with_errors',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

/**
 * Detects cycles in a directed graph using DFS.
 * @param {Map<string, string[]>} adjList map of nodeId -> array of dependent nodeIds
 * @returns {string[]|null} Array of node IDs representing the cycle path, or null if acyclic
 */
function findCycleInGraph(adjList) {
  const visited = new Set();
  const recursionStack = new Set();
  const parentMap = new Map();

  for (const node of adjList.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }

  function dfs(curr) {
    visited.add(curr);
    recursionStack.add(curr);

    const neighbors = adjList.get(curr) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        parentMap.set(neighbor, curr);
        const cycle = dfs(neighbor);
        if (cycle) return cycle;
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected: construct path from neighbor back to curr and to neighbor
        const path = [neighbor];
        let p = curr;
        while (p && p !== neighbor) {
          path.push(p);
          p = parentMap.get(p);
        }
        path.push(neighbor);
        return path.reverse();
      }
    }

    recursionStack.delete(curr);
    return null;
  }

  return null;
}

/**
 * Validates and normalizes an input graph specification.
 * Throws a descriptive Error if the graph is invalid or has cycles.
 *
 * @param {object} graphObject
 * @returns {object} Normalized graph object
 */
function createGraph(graphObject) {
  if (!graphObject || typeof graphObject !== 'object') {
    throw new Error('[TaskGraph] Invalid graph: input must be a valid object');
  }

  const graphId = graphObject.graphId || `graph-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const name = String(graphObject.name || 'Untitled Graph').trim();

  if (!Array.isArray(graphObject.nodes) || graphObject.nodes.length === 0) {
    throw new Error(`[TaskGraph] Graph "${name}" must have a non-empty "nodes" array`);
  }

  // 1. Verify unique node IDs
  const nodeMap = new Map();
  const nodeIds = new Set();

  for (const rawNode of graphObject.nodes) {
    if (!rawNode || typeof rawNode !== 'object') {
      throw new Error(`[TaskGraph] Invalid node in graph "${name}": node must be an object`);
    }

    const id = String(rawNode.id || '').trim();
    if (!id) {
      throw new Error(`[TaskGraph] Node missing required "id" in graph "${name}"`);
    }

    if (nodeIds.has(id)) {
      throw new Error(`[TaskGraph] Duplicate node ID "${id}" detected in graph "${name}"`);
    }
    nodeIds.add(id);

    const handler = String(rawNode.handler || '').trim();
    if (!handler) {
      throw new Error(`[TaskGraph] Node "${id}" missing required "handler"`);
    }

    const dependsOn = Array.isArray(rawNode.dependsOn)
      ? rawNode.dependsOn.map((d) => String(d).trim()).filter(Boolean)
      : [];

    nodeMap.set(id, {
      id,
      handler,
      dependsOn,
      params: rawNode.params && typeof rawNode.params === 'object' ? { ...rawNode.params } : {},
      priority: typeof rawNode.priority === 'number' ? rawNode.priority : 1,
      maxRetries: typeof rawNode.maxRetries === 'number' ? Math.max(0, rawNode.maxRetries) : 0,
      timeoutMs: typeof rawNode.timeoutMs === 'number' ? Math.max(1000, rawNode.timeoutMs) : 120000,
      status: rawNode.status || NodeState.PENDING,
      attempts: typeof rawNode.attempts === 'number' ? rawNode.attempts : 0,
      startedAt: rawNode.startedAt || null,
      finishedAt: rawNode.finishedAt || null,
      error: rawNode.error || null,
      output: rawNode.output !== undefined ? rawNode.output : null,
      progressPercent: typeof rawNode.progressPercent === 'number' ? rawNode.progressPercent : 0,
    });
  }

  // 2. Validate dependencies: verify all dependsOn targets exist and don't self-reference
  const adjList = new Map(); // node -> array of nodes it points to (dependsOn)
  for (const [id, node] of nodeMap.entries()) {
    adjList.set(id, []);
    for (const depId of node.dependsOn) {
      if (!nodeIds.has(depId)) {
        throw new Error(`[TaskGraph] Unknown dependency: node "${id}" depends on non-existent node "${depId}"`);
      }
      if (depId === id) {
        throw new Error(`[TaskGraph] Self-dependency detected: node "${id}" cannot depend on itself`);
      }
      adjList.get(id).push(depId);
    }
  }

  // 3. Cycle Detection
  const cycle = findCycleInGraph(adjList);
  if (cycle) {
    const cycleString = cycle.join(' -> ');
    throw new Error(`[TaskGraph] Cycle detected in task graph: ${cycleString}`);
  }

  const nodes = Array.from(nodeMap.values());

  return {
    graphId,
    name,
    status: graphObject.status || GraphState.PENDING,
    createdAt: graphObject.createdAt || new Date().toISOString(),
    updatedAt: graphObject.updatedAt || new Date().toISOString(),
    maxConcurrency: typeof graphObject.maxConcurrency === 'number' ? graphObject.maxConcurrency : 3,
    nodes,
  };
}

/**
 * Returns nodes whose status is PENDING and whose dependencies are all COMPLETED.
 * Ready nodes are sorted by priority ascending (lower priority number = runs earlier).
 *
 * @param {object} graph
 * @returns {object[]} Array of ready node objects
 */
function getReadyNodes(graph) {
  if (!graph || !Array.isArray(graph.nodes)) return [];

  const completedSet = new Set(
    graph.nodes.filter((n) => n.status === NodeState.COMPLETED).map((n) => n.id)
  );

  const ready = graph.nodes.filter((node) => {
    if (node.status !== NodeState.PENDING) return false;
    return node.dependsOn.every((depId) => completedSet.has(depId));
  });

  // Sort by priority ASC (lower number runs first)
  ready.sort((a, b) => a.priority - b.priority);
  return ready;
}

/**
 * Calculates topological execution order of nodes using Kahn's algorithm.
 * Useful for display and sequential validation.
 *
 * @param {object} graph
 * @returns {string[]} Node IDs in topological order
 */
function getExecutionOrder(graph) {
  if (!graph || !Array.isArray(graph.nodes)) return [];

  const inDegree = new Map();
  const dependentsMap = new Map(); // node -> array of nodes that depend on it

  for (const node of graph.nodes) {
    inDegree.set(node.id, node.dependsOn.length);
    dependentsMap.set(node.id, []);
  }

  for (const node of graph.nodes) {
    for (const dep of node.dependsOn) {
      if (dependentsMap.has(dep)) {
        dependentsMap.get(dep).push(node.id);
      }
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const order = [];
  while (queue.length > 0) {
    // Pick node with lowest priority first if possible
    queue.sort((a, b) => {
      const nodeA = graph.nodes.find((n) => n.id === a);
      const nodeB = graph.nodes.find((n) => n.id === b);
      return (nodeA?.priority || 0) - (nodeB?.priority || 0);
    });

    const curr = queue.shift();
    order.push(curr);

    const dependents = dependentsMap.get(curr) || [];
    for (const depNodeId of dependents) {
      const newDeg = inDegree.get(depNodeId) - 1;
      inDegree.set(depNodeId, newDeg);
      if (newDeg === 0) {
        queue.push(depNodeId);
      }
    }
  }

  return order;
}

/**
 * Recursively propagates SKIPPED status to all pending nodes that depend on a failed or skipped node.
 *
 * @param {object} graph
 * @param {string} failedNodeId
 * @returns {string[]} IDs of newly skipped nodes
 */
function propagateSkipped(graph, failedNodeId) {
  const skippedIds = [];
  const blockedSet = new Set([failedNodeId]);

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of graph.nodes) {
      if (node.status === NodeState.PENDING) {
        // If any of its dependencies is blocked (failed or skipped), mark it skipped
        const hasBlockedDep = node.dependsOn.some((dep) => blockedSet.has(dep));
        if (hasBlockedDep) {
          node.status = NodeState.SKIPPED;
          node.finishedAt = new Date().toISOString();
          node.error = `Skipped due to failed/skipped dependency`;
          blockedSet.add(node.id);
          skippedIds.push(node.id);
          changed = true;
        }
      }
    }
  }

  return skippedIds;
}

/**
 * Returns summary metrics of all nodes in the graph.
 * @param {object} graph
 * @returns {object} { total, pending, running, completed, failed, skipped, interrupted, cancelled }
 */
function getNodeStats(graph) {
  const stats = {
    total: graph.nodes.length,
    pending: 0,
    running: 0,
    completed: 0,
    waiting_for_user: 0,
    failed: 0,
    skipped: 0,
    interrupted: 0,
    cancelled: 0,
  };

  for (const node of graph.nodes) {
    if (stats[node.status] !== undefined) {
      stats[node.status]++;
    }
  }

  return stats;
}

/**
 * Checks whether the graph has finished execution.
 * Finished means no nodes are currently RUNNING, PENDING, or WAITING_FOR_USER.
 *
 * @param {object} graph
 * @returns {boolean}
 */
function isGraphFinished(graph) {
  const activeNodes = graph.nodes.filter(
    (n) => n.status === NodeState.RUNNING || n.status === NodeState.PENDING || n.status === NodeState.WAITING_FOR_USER
  );
  return activeNodes.length === 0;
}

module.exports = {
  NodeState,
  GraphState,
  createGraph,
  getReadyNodes,
  getExecutionOrder,
  propagateSkipped,
  getNodeStats,
  isGraphFinished,
};
