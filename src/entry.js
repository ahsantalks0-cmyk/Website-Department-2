import './styles/main.css';
import './js/theme.js';
import './js/chat.js';
import './js/app.js';
import './js/dashboard.js';
import './js/dashboard-tasks.js';
import './js/projects.js';
import './js/project-detail.js';
import './js/updater-ui.js';
import './js/settings-ai.js';

// Self-healing initialization runner: guarantees all controllers run regardless of DOM timing
function initializeControllers() {
  try {
    if (window.ThemeManager && typeof window.ThemeManager.getStoredTheme === 'function') {
      window.ThemeManager.setTheme(window.ThemeManager.getStoredTheme());
    }
    if (window.ChatController && typeof window.ChatController.load === 'function') {
      window.ChatController.load();
    }
    if (window.AppNavigator && typeof window.AppNavigator.navigateTo === 'function') {
      window.AppNavigator.navigateTo(window.AppNavigator.getActiveTab() || 'chat');
    }
    if (window.DashboardController && typeof window.DashboardController.refresh === 'function') {
      window.DashboardController.refresh();
    }
    if (window.ProjectsController && typeof window.ProjectsController.load === 'function') {
      window.ProjectsController.load();
    }
    if (window.SettingsAIController && typeof window.SettingsAIController.init === 'function') {
      window.SettingsAIController.init();
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
