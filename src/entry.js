import './styles/main.css';
import './js/theme.js';
import './js/app.js';
import './js/dashboard.js';
import './js/projects.js';
import './js/updater-ui.js';

// Self-healing initialization runner: guarantees all controllers run regardless of DOM timing
function initializeControllers() {
  try {
    if (window.ThemeManager && typeof window.ThemeManager.getStoredTheme === 'function') {
      window.ThemeManager.setTheme(window.ThemeManager.getStoredTheme());
    }
    if (window.AppNavigator && typeof window.AppNavigator.navigateTo === 'function') {
      window.AppNavigator.navigateTo(window.AppNavigator.getActiveTab() || 'dashboard');
    }
    if (window.DashboardController && typeof window.DashboardController.refresh === 'function') {
      window.DashboardController.refresh();
    }
    if (window.ProjectsController && typeof window.ProjectsController.load === 'function') {
      window.ProjectsController.load();
    }
  } catch (err) {
    console.error('[AI Design Dept] Initialization error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeControllers);
} else {
  initializeControllers();
}
