/**
 * AI DESIGN DEPARTMENT — TASK GRAPH BUILDER ALIAS (core/task-graph-builder.js)
 * Re-exports TaskGraph and helpers from core/task-graph.js for backward-compatibility.
 */

const {
  TaskGraph,
  createGraph,
  NodeState,
  GraphState,
  getReadyNodes,
  getExecutionOrder,
  propagateSkipped,
  getNodeStats,
  isGraphFinished,
} = require('./task-graph');

module.exports = {
  TaskGraph,
  createGraph,
  NodeState,
  GraphState,
  getReadyNodes,
  getExecutionOrder,
  propagateSkipped,
  getNodeStats,
  isGraphFinished,
};
