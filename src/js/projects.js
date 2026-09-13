/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — PROJECTS CONTROLLER (projects.js)
 * ==============================================================================
 * Handles:
 * - Real-time listing of projects in a responsive Apple-style card grid
 * - Project creation via modal dialog with dynamic multi-page tag input
 * - Project deletion with double-confirmation dialog
 * - Project export / import archive triggers
 * - Direct navigation to Project Detail view upon card selection
 * ==============================================================================
 */

(function () {
  let activeProjects = [];
  let pendingDeleteProject = null;
  let pendingDeleteCallback = null;
  let newProjectPages = ['Home']; // default initial page

  function getStoreApi() {
    if (window.store) return window.store;
    if (window.api && window.api.store) return window.api.store;
    if (window.electronAPI && window.electronAPI.store) return window.electronAPI.store;
    return null;
  }

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
      case 'saas-dashboard':
      case 'saas_dashboard':
        return 'SaaS Dashboard';
      case 'ui-only':
      case 'ui_only':
        return 'UI Only';
      case 'custom':
        return 'Custom';
      case 'website':
      default:
        return 'Website';
    }
  }

  function getTypeBadgeClass(type) {
    switch (type) {
      case 'saas-dashboard':
      case 'saas_dashboard':
        return 'badge-type-saas';
      case 'ui-only':
      case 'ui_only':
        return 'badge-type-ui';
      case 'custom':
        return 'badge-type-custom';
      case 'website':
      default:
        return 'badge-type-website';
    }
  }

  /**
   * Fetches all projects and renders the grid.
   */
  async function loadProjects() {
    const store = getStoreApi();
    const db = getDbApi();

    const gridContainer = document.getElementById('projects-grid');
    const emptyState = document.getElementById('projects-empty-state');
    const countBadge = document.getElementById('projects-count-badge');
    const counterText = document.getElementById('projects-counter-text');

    try {
      let projects = [];
      if (store && typeof store.getProjects === 'function') {
        const res = await store.getProjects();
        if (res && res.success && Array.isArray(res.data)) {
          projects = res.data;
        } else if (Array.isArray(res)) {
          projects = res;
        }
      } else if (db && db.projects) {
        const res = await db.projects.list();
        projects = (res && res.success) ? res.data : (Array.isArray(res) ? res : []);
      }

      activeProjects = projects;

      // Update badge count
      if (countBadge) {
        countBadge.textContent = projects.length;
        countBadge.style.display = projects.length > 0 ? 'inline-flex' : 'none';
      }
      if (counterText) {
        counterText.textContent = `${projects.length} Knowledge Store Repositories`;
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
    const typeLabel = formatTypeLabel(proj.type || proj.project_type);
    const badgeClass = getTypeBadgeClass(proj.type || proj.project_type);
    const dateLabel = formatDate(proj.updated_at || proj.created_at);
    const desc = proj.description && proj.description.trim()
      ? escapeHtml(proj.description.trim())
      : '<span class="project-desc-empty">No description provided</span>';

    const pageCount = proj.page_count !== undefined ? proj.page_count : (proj.pages_count || 1);
    const pageCountLabel = pageCount === 1 ? '1 Page' : `${pageCount} Pages`;

    return `
      <div class="card project-card" data-id="${proj.id}" id="project-card-${proj.id}" tabindex="0" role="button" aria-label="Open project ${escapeHtml(proj.name)}">
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
            <span class="project-status-text">${proj.status === 'active' ? 'Active' : (proj.status || 'Draft')}</span>
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
    // Card clicks -> open detail
    const cards = document.querySelectorAll('.project-card');
    cards.forEach((card) => {
      card.addEventListener('click', (e) => {
        // If delete button clicked, ignore card click
        if (e.target.closest('.btn-delete-project')) return;
        const id = card.getAttribute('data-id');
        if (id && window.ProjectDetailController) {
          window.ProjectDetailController.open(id);
        }
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target.closest('.btn-delete-project')) return;
          const id = card.getAttribute('data-id');
          if (id && window.ProjectDetailController) {
            window.ProjectDetailController.open(id);
          }
        }
      });
    });

    // Delete buttons
    const deleteButtons = document.querySelectorAll('.btn-delete-project');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const target = activeProjects.find((p) => String(p.id) === String(id));
        if (target) {
          openDeleteModal(target);
        }
      });
    });
  }

  /**
   * Render the chips for pages in New Project modal
   */
  function renderPageChips() {
    const container = document.getElementById('project-pages-tags-container');
    if (!container) return;

    if (newProjectPages.length === 0) {
      container.innerHTML = '<span class="form-hint" style="margin: 0; font-size: 12px;">Add at least one page (e.g. Home)</span>';
      return;
    }

    container.innerHTML = newProjectPages.map((pageName, idx) => `
      <span class="page-tag-chip">
        <span>${escapeHtml(pageName)}</span>
        <button type="button" class="page-tag-remove-btn" data-index="${idx}" aria-label="Remove ${escapeHtml(pageName)}">&times;</button>
      </span>
    `).join('');

    const removeBtns = container.querySelectorAll('.page-tag-remove-btn');
    removeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const index = parseInt(btn.getAttribute('data-index'), 10);
        newProjectPages.splice(index, 1);
        renderPageChips();
      });
    });
  }

  function addPageFromInput() {
    const input = document.getElementById('project-page-add-input');
    if (!input) return;
    const name = input.value.trim();
    if (name && !newProjectPages.includes(name)) {
      newProjectPages.push(name);
      input.value = '';
      renderPageChips();
    }
    input.focus();
  }

  /**
   * Modal: New Project Handling
   */
  function openNewProjectModal() {
    const modal = document.getElementById('new-project-modal');
    const form = document.getElementById('new-project-form');
    const errorAlert = document.getElementById('new-project-error');
    const nameInput = document.getElementById('project-name-input');
    const pageInput = document.getElementById('project-page-add-input');

    newProjectPages = ['Home']; // reset to default page

    if (form) form.reset();
    if (pageInput) pageInput.value = '';
    renderPageChips();

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
    const store = getStoreApi();
    const db = getDbApi();

    const nameInput = document.getElementById('project-name-input');
    const typeSelect = document.getElementById('project-type-select');
    const descInput = document.getElementById('project-desc-input');
    const errorAlert = document.getElementById('new-project-error');
    const submitBtn = document.getElementById('btn-submit-project');

    const name = nameInput ? nameInput.value.trim() : '';
    const type = typeSelect ? typeSelect.value : 'website';
    const description = descInput ? descInput.value.trim() : '';
    const pages = newProjectPages.length > 0 ? newProjectPages : ['Home'];

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

      let res;
      if (store && typeof store.createProject === 'function') {
        res = await store.createProject({
          name,
          type,
          description,
          pages,
        });
      } else if (db && db.projects) {
        res = await db.projects.create({
          name,
          project_type: type,
          description,
        });
      }

      if (res && res.success && res.data) {
        closeNewProjectModal();
        await loadProjects();
        if (window.DashboardController) {
          window.DashboardController.refresh();
        }
        // Open newly created project in detail view
        const createdId = res.data.id || (res.data.project && res.data.project.id);
        if (createdId && window.ProjectDetailController) {
          window.ProjectDetailController.open(createdId);
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
  function openDeleteModal(project, callback) {
    pendingDeleteProject = project;
    pendingDeleteCallback = callback || null;
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
    pendingDeleteCallback = null;
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteProject) return;
    const store = getStoreApi();
    const db = getDbApi();

    const deleteBtn = document.getElementById('btn-confirm-delete-project');
    const projectId = pendingDeleteProject.id;
    const cb = pendingDeleteCallback;

    try {
      if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
      }

      let res;
      if (store && typeof store.deleteProject === 'function') {
        res = await store.deleteProject(projectId);
      } else if (db && db.projects) {
        res = await db.projects.delete(projectId);
      }

      if (res && res.success) {
        closeDeleteModal();
        await loadProjects();
        if (window.DashboardController) {
          window.DashboardController.refresh();
        }
        if (typeof cb === 'function') {
          cb();
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

  /**
   * Trigger Import Project ZIP
   */
  async function handleImportProject() {
    const store = getStoreApi();
    if (!store || typeof store.importProject !== 'function') {
      alert('Import feature requires active Knowledge Store subsystem');
      return;
    }

    try {
      const res = await store.importProject();
      if (res && res.success && res.data) {
        await loadProjects();
        if (window.DashboardController) {
          window.DashboardController.refresh();
        }
        if (res.data.id && window.ProjectDetailController) {
          window.ProjectDetailController.open(res.data.id);
        }
      } else if (!res.cancelled) {
        alert(res?.error || 'Failed to import project');
      }
    } catch (err) {
      console.error('[Projects] Import error:', err);
      alert(err.message);
    }
  }

  window.ProjectsController = {
    load: loadProjects,
    openNewModal: openNewProjectModal,
    closeNewModal: closeNewProjectModal,
    openDeleteModal: openDeleteModal,
    importProject: handleImportProject,
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

    // Import button in toolbar
    const importBtn = document.getElementById('btn-import-project');
    if (importBtn) importBtn.addEventListener('click', handleImportProject);

    // Page Add button inside New Project modal
    const addPageBtn = document.getElementById('btn-add-page-to-new-project');
    const pageInput = document.getElementById('project-page-add-input');
    if (addPageBtn) addPageBtn.addEventListener('click', addPageFromInput);
    if (pageInput) {
      pageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addPageFromInput();
        }
      });
    }

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
