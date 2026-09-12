/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — PROJECTS CONTROLLER (projects.js)
 * ==============================================================================
 * Handles:
 * - Real-time listing of SQLite projects in a responsive Apple-style card grid
 * - Instant creation via modal dialog without full-page reloads
 * - Project deletion with double-confirmation dialog & cascading removal
 * - Empty state transitions and dynamic counts
 * ==============================================================================
 */

(function () {
  let activeProjects = [];
  let pendingDeleteProject = null;

  function getDbApi() {
    if (window.api && window.api.db) return window.api.db;
    if (window.electronAPI && window.electronAPI.db) return window.electronAPI.db;
    return null;
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

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z'));
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  function formatTypeLabel(type) {
    switch (type) {
      case 'saas_dashboard':
        return 'SaaS Dashboard';
      case 'ui_only':
        return 'UI Only';
      case 'website':
      default:
        return 'Website';
    }
  }

  function getTypeBadgeClass(type) {
    switch (type) {
      case 'saas_dashboard':
        return 'badge-type-saas';
      case 'ui_only':
        return 'badge-type-ui';
      case 'website':
      default:
        return 'badge-type-website';
    }
  }

  /**
   * Fetches all projects from the database and renders the grid.
   */
  async function loadProjects() {
    const db = getDbApi();
    if (!db) return;

    const gridContainer = document.getElementById('projects-grid');
    const emptyState = document.getElementById('projects-empty-state');
    const countBadge = document.getElementById('projects-count-badge');

    try {
      const res = await db.projects.list();
      const projects = (res && res.success) ? res.data : (Array.isArray(res) ? res : []);
      activeProjects = projects;

      // Update badge count
      if (countBadge) {
        countBadge.textContent = projects.length;
        countBadge.style.display = projects.length > 0 ? 'inline-flex' : 'none';
      }

      if (!projects || projects.length === 0) {
        if (gridContainer) gridContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        return;
      }

      if (emptyState) emptyState.style.display = 'none';
      if (gridContainer) {
        gridContainer.innerHTML = projects.map(renderProjectCard).join('');
        attachCardListeners();
      }
    } catch (err) {
      console.error('[Projects] Failed to load projects:', err);
    }
  }

  /**
   * Generates the HTML for an individual project card.
   */
  function renderProjectCard(proj) {
    const typeLabel = formatTypeLabel(proj.project_type);
    const badgeClass = getTypeBadgeClass(proj.project_type);
    const dateLabel = formatDate(proj.created_at);
    const desc = proj.description && proj.description.trim()
      ? escapeHtml(proj.description.trim())
      : '<span class="project-desc-empty">No description provided</span>';

    const pageCount = proj.page_count !== undefined ? proj.page_count : 0;
    const pageCountLabel = pageCount === 1 ? '1 Page' : `${pageCount} Pages`;

    return `
      <div class="card project-card" data-id="${proj.id}" id="project-card-${proj.id}">
        <div class="project-card-header">
          <div class="project-title-group">
            <h3 class="project-card-title" title="${escapeHtml(proj.name)}">${escapeHtml(proj.name)}</h3>
            <span class="project-type-badge ${badgeClass}">${typeLabel}</span>
          </div>
          <button class="btn-icon btn-delete-project" data-id="${proj.id}" title="Delete project" aria-label="Delete project ${escapeHtml(proj.name)}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>

        <div class="project-card-body">
          <p class="project-card-desc">${desc}</p>
        </div>

        <div class="project-card-footer">
          <div class="project-status-indicator">
            <span class="status-indicator-dot status-${proj.status || 'active'}"></span>
            <span class="project-status-text">${proj.status === 'active' ? 'Active' : proj.status}</span>
          </div>
          <div class="project-meta-right">
            <span class="project-pages-pill">${pageCountLabel}</span>
            <span class="project-date">${dateLabel}</span>
          </div>
        </div>
      </div>
    `;
  }

  function attachCardListeners() {
    const deleteButtons = document.querySelectorAll('.btn-delete-project');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const target = activeProjects.find((p) => p.id === id);
        if (target) {
          openDeleteModal(target);
        }
      });
    });
  }

  /**
   * Modal: New Project Handling
   */
  function openNewProjectModal() {
    const modal = document.getElementById('new-project-modal');
    const form = document.getElementById('new-project-form');
    const errorAlert = document.getElementById('new-project-error');
    const nameInput = document.getElementById('project-name-input');

    if (form) form.reset();
    if (errorAlert) {
      errorAlert.style.display = 'none';
      errorAlert.textContent = '';
    }
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
    if (nameInput) {
      setTimeout(() => nameInput.focus(), 80);
    }
  }

  function closeNewProjectModal() {
    const modal = document.getElementById('new-project-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  async function handleCreateProjectSubmit(e) {
    e.preventDefault();
    const db = getDbApi();
    if (!db) return;

    const nameInput = document.getElementById('project-name-input');
    const typeSelect = document.getElementById('project-type-select');
    const descInput = document.getElementById('project-desc-input');
    const errorAlert = document.getElementById('new-project-error');
    const submitBtn = document.getElementById('btn-submit-project');

    const name = nameInput ? nameInput.value.trim() : '';
    const project_type = typeSelect ? typeSelect.value : 'website';
    const description = descInput ? descInput.value.trim() : '';

    if (!name) {
      if (errorAlert) {
        errorAlert.textContent = 'Please enter a project name.';
        errorAlert.style.display = 'block';
      }
      if (nameInput) nameInput.focus();
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
      }

      const res = await db.projects.create({
        name,
        project_type,
        description,
      });

      if (res && res.success && res.data) {
        closeNewProjectModal();
        // Immediately reload list and refresh dashboard stats
        await loadProjects();
        if (window.DashboardController) {
          window.DashboardController.refresh();
        }
      } else {
        const errorMsg = (res && res.error) ? res.error : 'Failed to create project.';
        if (errorAlert) {
          errorAlert.textContent = errorMsg;
          errorAlert.style.display = 'block';
        }
      }
    } catch (err) {
      console.error('[Projects] Creation exception:', err);
      if (errorAlert) {
        errorAlert.textContent = err.message || 'An unexpected error occurred.';
        errorAlert.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Project';
      }
    }
  }

  /**
   * Modal: Delete Project Confirmation
   */
  function openDeleteModal(project) {
    pendingDeleteProject = project;
    const modal = document.getElementById('delete-confirm-modal');
    const nameSpan = document.getElementById('delete-project-target-name');

    if (nameSpan) {
      nameSpan.textContent = project.name;
    }
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeDeleteModal() {
    pendingDeleteProject = null;
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteProject) return;
    const db = getDbApi();
    if (!db) return;

    const deleteBtn = document.getElementById('btn-confirm-delete-project');
    const projectId = pendingDeleteProject.id;

    try {
      if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
      }

      const res = await db.projects.delete(projectId);
      if (res && res.success) {
        closeDeleteModal();
        await loadProjects();
        if (window.DashboardController) {
          window.DashboardController.refresh();
        }
      } else {
        console.error('[Projects] Failed to delete project:', res?.error);
        if (deleteBtn) deleteBtn.textContent = 'Error deleting';
      }
    } catch (err) {
      console.error('[Projects] Delete error:', err);
      if (deleteBtn) deleteBtn.textContent = 'Error deleting';
    } finally {
      if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete Project';
      }
    }
  }

  window.ProjectsController = {
    load: loadProjects,
    openNewModal: openNewProjectModal,
    closeNewModal: closeNewProjectModal,
  };

  document.addEventListener('DOMContentLoaded', () => {
    // New project modal triggers
    const openBtn = document.getElementById('btn-open-new-project');
    const emptyCreateBtn = document.getElementById('btn-create-first-project');
    const closeBtn = document.getElementById('btn-close-new-modal');
    const cancelBtn = document.getElementById('btn-cancel-new-project');
    const form = document.getElementById('new-project-form');

    if (openBtn) openBtn.addEventListener('click', openNewProjectModal);
    if (emptyCreateBtn) emptyCreateBtn.addEventListener('click', openNewProjectModal);
    if (closeBtn) closeBtn.addEventListener('click', closeNewProjectModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeNewProjectModal);
    if (form) form.addEventListener('submit', handleCreateProjectSubmit);

    // Delete modal triggers
    const cancelDeleteBtn = document.getElementById('btn-cancel-delete');
    const closeDeleteBtn = document.getElementById('btn-close-delete-modal');
    const confirmDeleteBtn = document.getElementById('btn-confirm-delete-project');

    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', closeDeleteModal);
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', handleConfirmDelete);

    // Close modals on overlay backdrop click or Escape key
    const modals = [
      document.getElementById('new-project-modal'),
      document.getElementById('delete-confirm-modal'),
    ];

    modals.forEach((modal) => {
      if (!modal) return;
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeNewProjectModal();
          closeDeleteModal();
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeNewProjectModal();
        closeDeleteModal();
      }
    });

    loadProjects();
  });
})();
