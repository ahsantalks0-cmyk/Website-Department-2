/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — TASK MONITOR CONTROLLER (dashboard-tasks.js)
 * ==============================================================================
 * Renders and controls the Phase 4 Orchestrator & Task Graph Engine in the UI:
 * - Live DAG execution monitor with node state transitions and progress bars
 * - Run Pipeline Test (executes the canonical 4-node verification pipeline)
 * - Pause, Resume, and Cancel execution controls
 * - Node Inspector modal with attempts, timing, errors, and output JSON
 * - SQLite history stream of recent pipeline executions
 * ==============================================================================
 */

(function () {
  let activeGraph = null;
  let unsubscribeEvents = null;
  let statusCheckTimer = null;

  function getOrchestratorApi() {
    if (window.orchestrator) return window.orchestrator;
    if (window.api && window.api.orchestrator) return window.api.orchestrator;
    if (window.electronAPI && window.electronAPI.orchestrator) return window.electronAPI.orchestrator;
    return null;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDuration(startedAt, finishedAt) {
    if (!startedAt) return '-';
    const start = new Date(startedAt).getTime();
    const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
    if (isNaN(start) || isNaN(end) || end < start) return '-';
    const diffMs = end - start;
    if (diffMs < 1000) return `${diffMs}ms`;
    const sec = (diffMs / 1000).toFixed(1);
    return `${sec}s`;
  }

  function formatRelativeTime(dateVal) {
    if (!dateVal) return 'Recently';
    let date;
    if (typeof dateVal === 'string' && !dateVal.includes('T') && !dateVal.endsWith('Z')) {
      date = new Date(dateVal.replace(' ', 'T') + 'Z');
    } else {
      date = new Date(dateVal);
    }
    if (isNaN(date.getTime())) return 'Recently';

    const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (diffSec < 45) return 'Just now';
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /**
   * Initializes event subscriptions and UI hooks.
   */
  async function initTaskMonitor() {
    bindActionButtons();
    initInspectorModal();
    subscribeOrchestratorEvents();

    // Load initial active graph or most recent run
    await loadInitialGraph();
    await loadGraphHistory();
  }

  /**
   * Subscribes to real-time events emitted from the main process Orchestrator.
   */
  function subscribeOrchestratorEvents() {
    const api = getOrchestratorApi();
    if (!api || typeof api.onEvent !== 'function') {
      console.warn('[TaskMonitor] Orchestrator IPC event subscription not available.');
      return;
    }

    if (unsubscribeEvents) {
      unsubscribeEvents();
    }

    unsubscribeEvents = api.onEvent((payload) => {
      handleOrchestratorEvent(payload);
    });

    console.log('[TaskMonitor] Subscribed to live orchestrator event stream.');
  }

  /**
   * Handles an incoming orchestrator event.
   * @param {object} payload
   */
  function handleOrchestratorEvent(payload) {
    if (!payload || !payload.eventType) return;
    const { eventType, graphId, nodeId, data } = payload;
    console.log(`[TaskMonitor Event] ${eventType}:`, { graphId, nodeId, data });

    // Handle graph lifecycle
    if (eventType.startsWith('graph:')) {
      if (activeGraph && activeGraph.graphId === graphId) {
        if (eventType === 'graph:started') {
          activeGraph.status = 'running';
        } else if (eventType === 'graph:paused') {
          activeGraph.status = 'paused';
        } else if (eventType === 'graph:resumed') {
          activeGraph.status = 'running';
        } else if (eventType === 'graph:completed') {
          activeGraph.status = data?.status || 'completed';
        } else if (eventType === 'graph:failed') {
          activeGraph.status = data?.status || 'failed';
        } else if (eventType === 'graph:cancelled') {
          activeGraph.status = 'cancelled';
        }
        renderGraphView(activeGraph);
      } else {
        // Different or new graph triggered
        reloadActiveGraph(graphId);
      }
      loadGraphHistory();
      return;
    }

    // Handle task lifecycle
    if (eventType.startsWith('task:')) {
      if (!activeGraph || activeGraph.graphId !== graphId) {
        reloadActiveGraph(graphId);
        return;
      }

      const node = activeGraph.nodes?.find((n) => n.id === nodeId);
      if (!node) {
        reloadActiveGraph(graphId);
        return;
      }

      if (eventType === 'task:started') {
        node.status = 'running';
        node.startedAt = new Date().toISOString();
        node.attempts = data?.attempt || (node.attempts || 0) + 1;
        node.progressPercent = 5;
      } else if (eventType === 'task:progress') {
        node.progressPercent = typeof data?.progress === 'number' ? data.progress : 50;
        node.progressMessage = data?.message || '';
      } else if (eventType === 'task:completed') {
        node.status = 'completed';
        node.progressPercent = 100;
        node.finishedAt = new Date().toISOString();
        node.output = data?.output !== undefined ? data.output : node.output;
      } else if (eventType === 'task:waiting_for_user') {
        node.status = 'waiting_for_user';
        node.progressPercent = 100;
        node.finishedAt = new Date().toISOString();
        node.output = data?.output !== undefined ? data.output : node.output;
      } else if (eventType === 'task:failed') {
        node.status = 'failed';
        node.finishedAt = new Date().toISOString();
        node.error = data?.error || 'Task failed';
      } else if (eventType === 'task:skipped') {
        node.status = 'skipped';
        node.finishedAt = new Date().toISOString();
        node.error = data?.reason || 'Skipped due to dependency';
      }

      renderGraphView(activeGraph);
    }
  }

  /**
   * Reloads graph detail from main process.
   * @param {string} graphId
   */
  async function reloadActiveGraph(graphId) {
    const api = getOrchestratorApi();
    if (!api) return;

    try {
      const detail = await api.getGraphDetail(graphId);
      if (detail && detail.graph) {
        activeGraph = {
          graphId: detail.graph.graph_id || detail.graph.graphId,
          name: detail.graph.name,
          status: detail.graph.status,
          nodes: detail.nodes || [],
        };
        renderGraphView(activeGraph);
      }
    } catch (err) {
      console.warn('[TaskMonitor] Failed to reload graph detail:', err);
    }
  }

  /**
   * Loads initial active graph or latest historical graph.
   */
  async function loadInitialGraph() {
    const api = getOrchestratorApi();
    if (!api) return;

    try {
      const running = await api.getActiveGraph();
      if (running) {
        activeGraph = running;
        renderGraphView(activeGraph);
        return;
      }

      // If no running graph, fetch latest from history
      const history = await api.getGraphHistory(1);
      if (history && history.length > 0) {
        const latestId = history[0].graphId;
        await reloadActiveGraph(latestId);
      }
    } catch (err) {
      console.warn('[TaskMonitor] loadInitialGraph error:', err);
    }
  }

  /**
   * Loads past graph execution records from SQLite.
   */
  async function loadGraphHistory() {
    const api = getOrchestratorApi();
    const container = document.getElementById('task-history-list');
    if (!api || !container) return;

    try {
      const history = await api.getGraphHistory(10);
      if (!history || history.length === 0) {
        container.innerHTML = `
          <div style="padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center;">
            No execution history yet. Click "Run Pipeline Test" above to start your first run.
          </div>
        `;
        return;
      }

      container.innerHTML = history
        .map((g) => {
          const statusClass = `status-${(g.status || 'idle').toLowerCase()}`;
          const durationStr = g.result?.durationMs
            ? `${(g.result.durationMs / 1000).toFixed(1)}s`
            : '-';
          const stats = g.stats || g.result?.nodeStats;
          const completedCount = stats ? `${stats.completed || 0}/${stats.total || 4}` : '-';
          const relativeTime = formatRelativeTime(g.createdAt);

          return `
            <div class="task-history-row" data-graph-id="${escapeHtml(g.graphId)}" title="Click to view graph execution in monitor">
              <div class="task-history-row-left">
                <span class="orch-status-pill ${statusClass}">${escapeHtml(g.status)}</span>
                <span class="task-history-name">${escapeHtml(g.name)}</span>
              </div>
              <div class="task-history-row-right">
                <span title="Completed tasks">${completedCount} tasks</span>
                <span title="Total run duration">${durationStr}</span>
                <span title="${escapeHtml(g.createdAt)}">${relativeTime}</span>
              </div>
            </div>
          `;
        })
        .join('');

      // Attach click listeners to view past runs
      container.querySelectorAll('.task-history-row').forEach((row) => {
        row.addEventListener('click', () => {
          const gid = row.getAttribute('data-graph-id');
          if (gid) reloadActiveGraph(gid);
        });
      });
    } catch (err) {
      console.error('[TaskMonitor] Error loading graph history:', err);
    }
  }

  /**
   * Binds the run, pause, resume, and cancel buttons.
   */
  function bindActionButtons() {
    const runBtn = document.getElementById('btn-run-pipeline-test');
    const pauseBtn = document.getElementById('btn-pause-pipeline');
    const resumeBtn = document.getElementById('btn-resume-pipeline');
    const cancelBtn = document.getElementById('btn-cancel-pipeline');
    const refreshHistoryBtn = document.getElementById('btn-refresh-task-history');

    if (runBtn) {
      runBtn.addEventListener('click', async () => {
        const api = getOrchestratorApi();
        if (!api) {
          alert('Task Orchestrator is only available inside the desktop application.');
          return;
        }

        try {
          runBtn.disabled = true;
          const res = await api.runDemoGraph();
          if (res && res.success) {
            console.log('[TaskMonitor] Demo graph launched with ID:', res.graphId);
            await reloadActiveGraph(res.graphId);
          } else {
            alert('Failed to launch pipeline test: ' + (res?.error || 'Unknown error'));
            runBtn.disabled = false;
          }
        } catch (err) {
          console.error('[TaskMonitor] Failed to run demo graph:', err);
          alert('Execution error: ' + err.message);
          runBtn.disabled = false;
        }
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', async () => {
        if (!activeGraph) return;
        const api = getOrchestratorApi();
        if (!api) return;

        pauseBtn.disabled = true;
        const res = await api.pauseGraph(activeGraph.graphId);
        if (res?.success) {
          activeGraph.status = 'paused';
          renderGraphView(activeGraph);
        }
      });
    }

    if (resumeBtn) {
      resumeBtn.addEventListener('click', async () => {
        if (!activeGraph) return;
        const api = getOrchestratorApi();
        if (!api) return;

        resumeBtn.disabled = true;
        const res = await api.resumeGraph(activeGraph.graphId);
        if (res?.success) {
          activeGraph.status = 'running';
          renderGraphView(activeGraph);
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        if (!activeGraph) return;
        const api = getOrchestratorApi();
        if (!api) return;

        cancelBtn.disabled = true;
        const res = await api.cancelGraph(activeGraph.graphId);
        if (res?.success) {
          activeGraph.status = 'cancelled';
          renderGraphView(activeGraph);
        }
      });
    }

    if (refreshHistoryBtn) {
      refreshHistoryBtn.addEventListener('click', () => {
        loadGraphHistory();
      });
    }
  }

  /**
   * Renders the current graph and its nodes in the Task Monitor.
   * @param {object} graph
   */
  function renderGraphView(graph) {
    if (!graph) return;

    const nameEl = document.getElementById('orch-graph-name');
    const statusEl = document.getElementById('orch-graph-status');
    const subtitleEl = document.getElementById('orch-graph-subtitle');
    const nodesContainer = document.getElementById('task-nodes-grid');
    const counterEl = document.getElementById('orch-nodes-counter');

    const runBtn = document.getElementById('btn-run-pipeline-test');
    const pauseBtn = document.getElementById('btn-pause-pipeline');
    const resumeBtn = document.getElementById('btn-resume-pipeline');
    const cancelBtn = document.getElementById('btn-cancel-pipeline');

    const status = (graph.status || 'idle').toLowerCase();

    // 1. Update Header Information
    if (nameEl) nameEl.textContent = graph.name || 'Task Graph';
    if (statusEl) {
      statusEl.className = `orch-status-pill status-${status}`;
      statusEl.textContent = status.replace(/_/g, ' ');
    }

    if (subtitleEl) {
      subtitleEl.textContent = `Graph ID: ${graph.graphId} • Main Process Orchestration`;
    }

    // 2. Update Action Controls
    const isRunning = status === 'running';
    const isPaused = status === 'paused';
    const isFinished = status === 'completed' || status === 'completed_with_errors' || status === 'failed' || status === 'cancelled';

    if (runBtn) runBtn.disabled = isRunning || isPaused;

    if (pauseBtn && resumeBtn) {
      if (isPaused) {
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'inline-flex';
        resumeBtn.disabled = false;
      } else {
        pauseBtn.style.display = 'inline-flex';
        pauseBtn.disabled = !isRunning;
        resumeBtn.style.display = 'none';
      }
    }

    if (cancelBtn) {
      cancelBtn.disabled = !isRunning && !isPaused;
    }

    // 3. Render Nodes Grid
    const nodes = graph.nodes || [];
    const completedCount = nodes.filter((n) => n.status === 'completed').length;

    if (counterEl) {
      counterEl.textContent = `${completedCount} / ${nodes.length} Completed`;
    }

    if (!nodesContainer) return;

    if (nodes.length === 0) {
      nodesContainer.innerHTML = `
        <div class="task-nodes-empty">
          <p>No nodes defined in this graph.</p>
        </div>
      `;
      return;
    }

    nodesContainer.innerHTML = nodes
      .map((node) => {
        const nodeStatus = (node.status || 'pending').toLowerCase();
        const duration = formatDuration(node.startedAt, node.finishedAt);
        const progress = typeof node.progressPercent === 'number'
          ? Math.min(100, Math.max(0, node.progressPercent))
          : (nodeStatus === 'completed' ? 100 : 0);

        // Status badge icon and label
        let iconHtml = '';
        let statusBadgeClass = `status-${nodeStatus}`;

        if (nodeStatus === 'running') {
          iconHtml = `
            <svg class="task-spinner-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="2" x2="12" y2="6"></line>
              <line x1="12" y1="18" x2="12" y2="22"></line>
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
              <line x1="2" y1="12" x2="6" y2="12"></line>
              <line x1="18" y1="12" x2="22" y2="12"></line>
              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
            </svg>
          `;
        } else if (nodeStatus === 'completed') {
          iconHtml = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `;
        } else if (nodeStatus === 'waiting_for_user') {
          iconHtml = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="10" y1="15" x2="10" y2="9"></line>
              <line x1="14" y1="15" x2="14" y2="9"></line>
            </svg>
          `;
        } else if (nodeStatus === 'failed') {
          iconHtml = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          `;
        } else if (nodeStatus === 'skipped') {
          iconHtml = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          `;
        } else {
          iconHtml = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9"></circle>
            </svg>
          `;
        }

        // Dependencies chips
        const depsHtml = node.dependsOn && node.dependsOn.length > 0
          ? `<div class="task-node-deps">
               <span style="font-size: 10px; color: var(--text-faint);">after:</span>
               ${node.dependsOn.map((d) => `<span class="task-dep-chip">${escapeHtml(d)}</span>`).join('')}
             </div>`
          : '<div class="task-node-deps"><span style="font-size: 10px; color: var(--text-faint);">root task</span></div>';

        // Attempts badge
        const attemptsBadge = (node.attempts > 1 || node.maxRetries > 0)
          ? `<span class="task-node-attempts-badge" title="Attempts count">Try ${node.attempts || 1}${node.maxRetries ? `/${node.maxRetries + 1}` : ''}</span>`
          : '';

        return `
          <div class="task-node-card node-${nodeStatus}" data-node-id="${escapeHtml(node.id)}" title="Click to view outputs, errors, and metadata">
            <div class="task-node-top">
              <div class="task-node-id">${escapeHtml(node.id)}</div>
              <span class="task-handler-badge">${escapeHtml(node.handler)}</span>
            </div>

            ${depsHtml}

            <div class="task-node-progress-container">
              <div class="task-node-progress-bar" style="width: ${progress}%;"></div>
            </div>

            <div class="task-node-bottom">
              <div class="task-node-status-inline">
                <span class="orch-status-pill ${statusBadgeClass}" style="padding: 2px 6px; font-size: 10px;">
                  ${iconHtml}
                  <span>${escapeHtml(nodeStatus.replace(/_/g, ' '))}</span>
                </span>
                ${attemptsBadge}
              </div>
              <div class="task-node-time" title="Execution duration">${duration}</div>
            </div>

            ${nodeStatus === 'waiting_for_user' ? `
              <div class="review-gate-inline-actions">
                <button class="btn btn-primary btn-xs btn-review-approve" data-node-id="${escapeHtml(node.id)}">
                  ✓ Approve Direction
                </button>
                <button class="btn btn-secondary btn-xs btn-review-revise" data-node-id="${escapeHtml(node.id)}">
                  ↻ Request Revision
                </button>
              </div>
            ` : ''}
          </div>
        `;
      })
      .join('');

    // Attach click handlers to review gate inline buttons
    nodesContainer.querySelectorAll('.btn-review-approve').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nid = btn.getAttribute('data-node-id');
        const api = getOrchestratorApi();
        if (!api || !activeGraph) return;
        btn.disabled = true;
        btn.textContent = 'Approving...';
        try {
          if (api.respondToReview) {
            await api.respondToReview({
              graphId: activeGraph.graphId,
              nodeId: nid,
              approved: true,
              feedback: 'Approved by user via Task Monitor',
            });
          } else {
            await api.resumeGraph(activeGraph.graphId);
          }
          await reloadActiveGraph(activeGraph.graphId);
        } catch (err) {
          console.error('[TaskMonitor] Review approval error:', err);
        }
      });
    });

    nodesContainer.querySelectorAll('.btn-review-revise').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nid = btn.getAttribute('data-node-id');
        const feedback = prompt('Provide revision feedback or adjustments:');
        if (feedback === null) return;
        const api = getOrchestratorApi();
        if (!api || !activeGraph) return;
        btn.disabled = true;
        btn.textContent = 'Submitting...';
        try {
          if (api.respondToReview) {
            await api.respondToReview({
              graphId: activeGraph.graphId,
              nodeId: nid,
              approved: false,
              feedback,
            });
          } else {
            await api.resumeGraph(activeGraph.graphId);
          }
          await reloadActiveGraph(activeGraph.graphId);
        } catch (err) {
          console.error('[TaskMonitor] Review revision error:', err);
        }
      });
    });

    // Attach click handlers to open inspector modal
    nodesContainer.querySelectorAll('.task-node-card').forEach((card) => {
      card.addEventListener('click', () => {
        const nid = card.getAttribute('data-node-id');
        const node = activeGraph.nodes?.find((n) => n.id === nid);
        if (node) {
          openNodeInspector(node);
        }
      });
    });
  }

  /**
   * Initializes the Task Inspector Modal dialog.
   */
  function initInspectorModal() {
    const modal = document.getElementById('task-inspector-modal');
    const closeBtn = document.getElementById('btn-close-task-modal');
    const closeBtn2 = document.getElementById('btn-close-task-inspector');

    const closeModal = () => {
      if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
      }
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (closeBtn2) closeBtn2.addEventListener('click', closeModal);

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }
  }

  /**
   * Opens and populates the Task Inspector Modal.
   * @param {object} node
   */
  function openNodeInspector(node) {
    const modal = document.getElementById('task-inspector-modal');
    if (!modal) return;

    const idEl = document.getElementById('modal-task-id');
    const statusEl = document.getElementById('modal-task-status');
    const handlerEl = document.getElementById('modal-task-handler');
    const attemptsEl = document.getElementById('modal-task-attempts');
    const durationEl = document.getElementById('modal-task-duration');
    const startedEl = document.getElementById('modal-task-started');
    const finishedEl = document.getElementById('modal-task-finished');
    const errorBox = document.getElementById('modal-task-error-box');
    const errorText = document.getElementById('modal-task-error-text');
    const outputPre = document.getElementById('modal-task-output');

    const nodeStatus = (node.status || 'pending').toLowerCase();

    if (idEl) idEl.textContent = node.id;
    if (statusEl) {
      statusEl.className = `orch-status-pill status-${nodeStatus}`;
      statusEl.textContent = nodeStatus;
    }
    if (handlerEl) handlerEl.textContent = node.handler;
    if (attemptsEl) attemptsEl.textContent = `${node.attempts || 0}${node.maxRetries ? ` (max: ${node.maxRetries + 1})` : ''}`;
    if (durationEl) durationEl.textContent = formatDuration(node.startedAt, node.finishedAt);
    if (startedEl) startedEl.textContent = node.startedAt ? new Date(node.startedAt).toLocaleTimeString() : '-';
    if (finishedEl) finishedEl.textContent = node.finishedAt ? new Date(node.finishedAt).toLocaleTimeString() : '-';

    // Handle error message
    if (node.error && (nodeStatus === 'failed' || nodeStatus === 'skipped')) {
      if (errorBox) errorBox.style.display = 'block';
      if (errorText) errorText.textContent = node.error;
    } else {
      if (errorBox) errorBox.style.display = 'none';
    }

    // Handle output JSON
    if (outputPre) {
      if (node.output !== undefined && node.output !== null) {
        try {
          outputPre.textContent = typeof node.output === 'object'
            ? JSON.stringify(node.output, null, 2)
            : String(node.output);
        } catch (e) {
          outputPre.textContent = String(node.output);
        }
      } else {
        outputPre.textContent = nodeStatus === 'completed'
          ? 'Completed with no returned output payload.'
          : (nodeStatus === 'running' ? 'Task is currently running...' : 'No output generated yet.');
      }
    }

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  // Auto-init on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initTaskMonitor();
  });

  window.TaskMonitorController = {
    init: initTaskMonitor,
    reload: reloadActiveGraph,
    loadHistory: loadGraphHistory,
  };
})();
