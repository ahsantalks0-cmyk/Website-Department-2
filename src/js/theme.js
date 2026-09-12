/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — THEME SYSTEM (theme.js)
 * ==============================================================================
 * Apple-inspired dual-theme manager:
 * - Default: follows OS preference (prefers-color-scheme)
 * - Manual override persisted in localStorage
 * - Immediate execution on DOM load to prevent flash of unstyled theme
 * ==============================================================================
 */

(function () {
  const THEME_STORAGE_KEY = 'ai_design_theme';
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  /**
   * Resolves the effective theme ('light' or 'dark') based on storage or OS.
   * @returns {'light' | 'dark'}
   */
  function getSystemTheme() {
    return mediaQuery.matches ? 'dark' : 'light';
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) || 'system';
    } catch (e) {
      return 'system';
    }
  }

  /**
   * Applies the theme attribute to <html> element
   * @param {'light' | 'dark' | 'system'} preference
   */
  function applyTheme(preference) {
    const effectiveTheme = preference === 'system' ? getSystemTheme() : preference;

    if (effectiveTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    // Update UI representations
    updateThemeUI(preference, effectiveTheme);
  }

  /**
   * Updates state of settings theme cards and topbar button
   */
  function updateThemeUI(preference, effectiveTheme) {
    const themeCards = document.querySelectorAll('.theme-card');
    themeCards.forEach((card) => {
      const cardTheme = card.getAttribute('data-theme-val');
      if (cardTheme === preference) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
      toggleBtn.setAttribute(
        'aria-label',
        `Current: ${effectiveTheme}. Click to switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'}.`
      );
      toggleBtn.setAttribute('title', `Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} mode`);
    }
  }

  /**
   * Sets the theme preference, stores it, and triggers update
   * @param {'light' | 'dark' | 'system'} theme
   */
  function setTheme(theme) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {
      console.warn('Could not persist theme to localStorage:', e);
    }
    applyTheme(theme);
  }

  /**
   * Toggles directly between light and dark mode
   */
  function toggleTheme() {
    const currentEffective = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const targetTheme = currentEffective === 'dark' ? 'light' : 'dark';
    setTheme(targetTheme);
  }

  // Listen to OS-level theme preference shifts in real time
  mediaQuery.addEventListener('change', () => {
    if (getStoredTheme() === 'system') {
      applyTheme('system');
    }
  });

  // Expose global ThemeManager
  window.ThemeManager = {
    setTheme,
    toggleTheme,
    getStoredTheme,
    getResolvedTheme: () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'),
  };

  // Immediate execution: apply theme right away
  const initialPref = getStoredTheme();
  applyTheme(initialPref);

  // Hook UI elements once DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getStoredTheme());

    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
    }

    const themeCards = document.querySelectorAll('.theme-card');
    themeCards.forEach((card) => {
      card.addEventListener('click', () => {
        const themeVal = card.getAttribute('data-theme-val');
        if (themeVal) {
          setTheme(themeVal);
        }
      });
    });
  });
})();
