/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — TASK RUNNER (core/task-runner.js)
 * ==============================================================================
 * Executes a single task graph node with:
 * - Handler resolution from HandlerRegistry
 * - Context injection: { graphId, nodeId, emit, ai, db, log }
 * - AbortController signal handling
 * - Timeout enforcement with automatic abort
 * - Configurable retry loop with 3-second backoff
 * - Bulletproof exception shielding (never crashes the desktop process)
 * ==============================================================================
 */

const { handlerRegistry } = require('./handler-registry');
const { eventBus } = require('./event-bus');
const { NodeState } = require('./task-graph');

class TaskRunner {
  /**
   * @param {object} options
   * @param {object} [options.aiHandler] Reference to main-process AIHandler
   * @param {object} [options.db] SQLite database connection
   * @param {number} [options.retryDelayMs] Delay between retries in milliseconds (default 3000ms)
   */
  constructor(options = {}) {
    this.aiHandler = options.aiHandler || null;
    this.db = options.db || null;
    this.retryDelayMs = typeof options.retryDelayMs === 'number' ? options.retryDelayMs : 3000;
  }

  /**
   * Helper delay utility respecting AbortSignal.
   * @param {number} ms
   * @param {AbortSignal} signal
   * @returns {Promise<void>}
   */
  delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        return reject(new Error('Task was aborted'));
      }
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('Task was aborted'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  /**
   * Executes a single task node to completion or terminal failure.
   *
   * @param {object} graph
   * @param {object} node
   * @param {AbortSignal} [parentSignal] Signal from orchestrator for graph-level cancel
   * @returns {Promise<object>} Node execution outcome: { success: boolean, output?: any, error?: string, attempts: number }
   */
  async runNode(graph, node, parentSignal = null) {
    const graphId = graph.graphId;
    const nodeId = node.id;
    const handlerName = node.handler;
    const maxRetries = typeof node.maxRetries === 'number' ? node.maxRetries : 0;
    const timeoutMs = typeof node.timeoutMs === 'number' ? node.timeoutMs : 120000;

    let handler;
    try {
      handler = handlerRegistry.getHandler(handlerName);
    } catch (registryErr) {
      console.error(`[TaskRunner] Handler lookup failed for node "${nodeId}":`, registryErr.message);
      node.status = NodeState.FAILED;
      node.error = registryErr.message;
      node.finishedAt = new Date().toISOString();

      eventBus.publish('task:failed', {
        graphId,
        nodeId,
        data: {
          error: registryErr.message,
          attempts: 0,
          fatal: true,
        },
      });

      return {
        success: false,
        error: registryErr.message,
        attempts: 0,
      };
    }

    node.status = NodeState.RUNNING;
    node.startedAt = new Date().toISOString();

    let attempt = 0;
    let lastError = null;

    while (attempt <= maxRetries) {
      if (parentSignal?.aborted) {
        console.warn(`[TaskRunner] Node "${nodeId}" cancelled before attempt ${attempt + 1}.`);
        node.status = NodeState.CANCELLED;
        node.finishedAt = new Date().toISOString();
        node.error = 'Task was cancelled';
        return { success: false, error: 'Task was cancelled', attempts: attempt };
      }

      attempt++;
      node.attempts = attempt;

      console.log(`[TaskRunner] Node started: "${nodeId}" (handler: "${handlerName}", attempt: ${attempt}/${maxRetries + 1})`);

      // Publish task:started
      eventBus.publish('task:started', {
        graphId,
        nodeId,
        data: {
          handler: handlerName,
          attempt,
          maxRetries,
          timeoutMs,
        },
      });

      // Prepare isolated abort controller combined with parent signal and timeout
      const abortController = new AbortController();
      let isTimedOut = false;

      const onParentAbort = () => {
        abortController.abort(new Error('Parent graph cancelled'));
      };

      if (parentSignal) {
        if (parentSignal.aborted) {
          abortController.abort(new Error('Parent graph cancelled'));
        } else {
          parentSignal.addEventListener('abort', onParentAbort, { once: true });
        }
      }

      // Timeout watchdog
      const timeoutTimer = setTimeout(() => {
        isTimedOut = true;
        abortController.abort(new Error('Task timed out'));
      }, timeoutMs);

      // Construct context object for handler
      const context = {
        graphId,
        nodeId,
        attempt,
        maxRetries,
        db: this.db,
        log: (msg) => {
          console.log(`[Task ${nodeId} | Attempt ${attempt}] ${msg}`);
        },
        emit: (eventType, data = {}) => {
          // Normalize progress events
          if (eventType === 'progress' || (typeof data === 'object' && data.progress !== undefined)) {
            const percent = typeof data === 'number' ? data : (data.progress || data.percent || 0);
            node.progressPercent = Math.min(100, Math.max(0, Math.round(percent)));
            eventBus.publish('task:progress', {
              graphId,
              nodeId,
              data: {
                progress: node.progressPercent,
                message: data.message || '',
                attempt,
              },
            });
          } else {
            eventBus.publish(eventType, {
              graphId,
              nodeId,
              data: { ...data, attempt },
            });
          }
        },
        ai: {
          generate: async (aiParams) => {
            if (!this.aiHandler) {
              throw new Error('AI subsystem is not initialized in orchestrator context');
            }
            return this.aiHandler.generate({
              ...aiParams,
              signal: abortController.signal,
            });
          },
        },
      };

      let result;
      try {
        result = await handler({
          params: node.params,
          context,
          signal: abortController.signal,
        });
      } catch (err) {
        const errorMsg = isTimedOut ? 'Task timed out' : (err.message || 'Unknown execution error');
        result = {
          success: false,
          error: errorMsg,
          retryable: err.retryable !== undefined ? Boolean(err.retryable) : !isTimedOut,
        };
      } finally {
        clearTimeout(timeoutTimer);
        if (parentSignal) {
          parentSignal.removeEventListener('abort', onParentAbort);
        }
      }

      // Check success
      if (result && result.success) {
        if (result.status === NodeState.WAITING_FOR_USER || result.waitingForUser) {
          console.log(`[TaskRunner] Node "${nodeId}" reached review gate (waiting for user) in ${attempt} attempt(s)`);
          node.status = NodeState.WAITING_FOR_USER;
          node.progressPercent = 100;
          node.output = result.output !== undefined ? result.output : null;
          node.finishedAt = new Date().toISOString();
          node.error = null;

          eventBus.publish('task:waiting_for_user', {
            graphId,
            nodeId,
            data: {
              output: node.output,
              attempts: attempt,
              message: result.output?.message || 'Waiting for your review',
            },
          });

          return {
            success: true,
            status: NodeState.WAITING_FOR_USER,
            output: node.output,
            attempts: attempt,
          };
        }

        console.log(`[TaskRunner] Node completed: "${nodeId}" in ${attempt} attempt(s)`);
        node.status = NodeState.COMPLETED;
        node.progressPercent = 100;
        node.output = result.output !== undefined ? result.output : null;
        node.finishedAt = new Date().toISOString();
        node.error = null;

        eventBus.publish('task:completed', {
          graphId,
          nodeId,
          data: {
            output: node.output,
            attempts: attempt,
          },
        });

        return {
          success: true,
          output: node.output,
          attempts: attempt,
        };
      }

      // If we reach here, this attempt failed
      lastError = result?.error || 'Task failed';
      console.warn(`[TaskRunner] Node "${nodeId}" attempt ${attempt} failed: ${lastError}`);

      // Check retryability
      const isRetryable = result?.retryable !== false && !parentSignal?.aborted;

      if (!isRetryable || attempt > maxRetries) {
        break;
      }

      console.log(`[TaskRunner] Waiting ${this.retryDelayMs}ms before retrying node "${nodeId}"...`);
      try {
        await this.delay(this.retryDelayMs, parentSignal);
      } catch (delayErr) {
        console.warn(`[TaskRunner] Retry wait aborted for node "${nodeId}":`, delayErr.message);
        break;
      }
    }

    // Terminal failure for this node
    console.error(`[TaskRunner] Node failed: "${nodeId}" after ${attempt} attempt(s). Error: ${lastError}`);
    node.status = parentSignal?.aborted ? NodeState.CANCELLED : NodeState.FAILED;
    node.finishedAt = new Date().toISOString();
    node.error = lastError;

    eventBus.publish('task:failed', {
      graphId,
      nodeId,
      data: {
        error: lastError,
        attempts: attempt,
        retriesExhausted: attempt > maxRetries,
      },
    });

    return {
      success: false,
      error: lastError,
      attempts: attempt,
    };
  }
}

module.exports = {
  TaskRunner,
};
