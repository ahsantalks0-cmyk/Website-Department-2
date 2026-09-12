/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — DASHBOARD CONTROLLER (dashboard.js)
 * ==============================================================================
 * Queries real database metrics and activity logs via IPC bridge:
 * - Real table counts for Projects, Pages, Variety Seeds, and Reviews
 * - Dynamic audit stream with relative timestamp calculations
 * - Fallback handling for browser preview environments
 * ==============================================================================
 */

(function () {
  /**
   * Formats an ISO or SQLite date string into a human-friendly relative label.
   * e.g. "Just now", "2 min ago", "3 hrs ago", "Yesterday", "3 days ago"
   * @param {string|Date} dateVal
   * @returns {string}
   */
  function formatRelativeTime(dateVal) {
    if (!dateVal) return 'Recently';

    // Handle SQLite datetime('now') format "YYYY-MM-DD HH:MM:SS" or ISO string
    let date;
    if (typeof dateVal === 'string' && !dateVal.includes('T') && !dateVal.endsWith('Z')) {
      date = new Date(dateVal.replace(' ', 'T') + 'Z');
    } else {
      date = new Date(dateVal);
    }

    if (isNaN(date.getTime())) return 'Recently';

    const now = new Date();
    const diffSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

    if (diffSeconds < 45) {
      return 'Just now';
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes} min${diffMinutes > 1 ? 's' : ''} ago`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) {
      return 'Yesterday';
    }
    if (diffDays < 30) {
      return `${diffDays} days ago`;
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /**
   * Safely acquires the DB API from window.api or window.electronAPI,
   * falling back to local storage mock in browser preview environments.
   */
  function getDbApi() {
    if (window.api && window.api.db) return window.api.db;
    if (window.electronAPI && window.electronAPI.db) return window.electronAPI.db;
    return null;
  }

  /**
   * Loads real statistical counts from the database and animates the cards.
   */
  async function loadDashboardStats() {
    const db = getDbApi();
    if (!db) return;

    try {
      const stats = await db.stats.get();
      if (!stats) return;

      const projectsEl = document.getElementById('stat-projects-count');
      const pagesEl = document.getElementById('stat-pages-count');
      const seedsEl = document.getElementById('stat-seeds-count');
      const reviewsEl = document.getElementById('stat-reviews-count');

      if (projectsEl) projectsEl.textContent = stats.projects ?? 0;
      if (pagesEl) pagesEl.textContent = stats.pages ?? 0;
      if (seedsEl) seedsEl.textContent = stats.seeds ?? 0;
      if (reviewsEl) reviewsEl.textContent = stats.reviews ?? 0;

      // Update footer states
      const projectsFooter = document.getElementById('stat-projects-footer');
      if (projectsFooter) {
        projectsFooter.textContent = stats.projects > 0
          ? `${stats.projects} active in SQLite`
          : 'Ready for initialization';
      }

      const pagesFooter = document.getElementById('stat-pages-footer');
      if (pagesFooter) {
        pagesFooter.textContent = stats.pages > 0
          ? `${stats.pages} stored in workspace`
          : 'Synthesizer standby';
      }
    } catch (err) {
      console.error('[Dashboard] Error querying database stats:', err);
    }
  }

  /**
   * Loads recent activity rows from the database and renders them into the stream.
   */
  async function loadRecentActivity() {
    const db = getDbApi();
    if (!db) return;

    const listContainer = document.getElementById('dashboard-activity-list');
    if (!listContainer) return;

    try {
      const activities = await db.activity.list(15);

      if (!activities || activities.length === 0) {
        listContainer.innerHTML = `
          <div class="activity-empty-state">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 14 14"></polyline>
            </svg>
            <span>No activity yet</span>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = activities
        .map((act) => {
          const timeLabel = formatRelativeTime(act.created_at);
          const projectBadge = act.project_name
            ? `<span class="activity-project-pill">${escapeHtml(act.project_name)}</span>`
            : '';

          return `
            <div class="activity-row" data-id="${act.id}">
              <div class="activity-main">
                <div class="activity-dot"></div>
                <div>
                  <div class="activity-title">${escapeHtml(act.message)}</div>
                  <div class="activity-desc">${projectBadge} SQLite record #${act.id}</div>
                </div>
              </div>
              <div class="activity-time" title="${escapeHtml(act.created_at || '')}">${timeLabel}</div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      console.error('[Dashboard] Error querying activity stream:', err);
      listContainer.innerHTML = '<div class="activity-empty-state"><span>Unable to load activity stream.</span></div>';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Public controller refresh hook.
   */
  function refreshDashboard() {
    loadDashboardStats();
    loadRecentActivity();
  }

  window.DashboardController = {
    refresh: refreshDashboard,
    loadStats: loadDashboardStats,
    loadActivity: loadRecentActivity,
    formatRelativeTime,
  };

  document.addEventListener('DOMContentLoaded', () => {
    refreshDashboard();
  });
})();
