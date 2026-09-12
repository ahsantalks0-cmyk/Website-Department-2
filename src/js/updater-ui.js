/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — AUTO-UPDATER UI CONTROLLER (updater-ui.js)
 * ==============================================================================
 * Handles:
 * - IPC communication with Electron main process via preload bridge
 * - Presentation of update availability notification badges
 * - Accurate real-time download progress bar (0-100%, MB transferred, MB/s)
 * - Safe error handling with human-readable diagnostic messages
 * - Graceful browser preview fallback (for testing in standard web environments)
 * ==============================================================================
 */

(function () {
  // DOM Elements
  let appVersionEl;
  let statusTextEl;
  let btnCheckUpdates;
  let btnDownloadUpdate;
  let btnRestartInstall;
  let updateAlertBox;
  let updateAlertVersion;
  let updateAlertNotes;
  let progressContainer;
  let progressBarFill;
  let progressPercentText;
  let progressTransferredText;
  let progressSpeedText;
  let errorAlertBox;
  let errorMessageText;
  let settingsUpdateBadge;
  let topbarUpdateBanner;
  let topbarUpdateVersion;

  // State
  let availableUpdateInfo = null;
  let isChecking = false;
  let isDownloading = false;
  let isDownloaded = false;

  /**
   * Safe bytes formatting helper (e.g. 24.5 MB)
   */
  function formatMB(bytes) {
    if (!bytes || isNaN(bytes)) return '0.0 MB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Safe speed formatting helper (e.g. 3.2 MB/s or 450 KB/s)
   */
  function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || isNaN(bytesPerSecond)) return '0.0 MB/s';
    const mbps = bytesPerSecond / (1024 * 1024);
    if (mbps >= 1.0) {
      return mbps.toFixed(1) + ' MB/s';
    }
    const kbps = bytesPerSecond / 1024;
    return Math.round(kbps) + ' KB/s';
  }

  /**
   * Initializes updater UI hooks and IPC listeners
   */
  async function initUpdater() {
    // Cache element references
    appVersionEl = document.getElementById('app-version-display');
    statusTextEl = document.getElementById('update-status-text');
    btnCheckUpdates = document.getElementById('btn-check-updates');
    btnDownloadUpdate = document.getElementById('btn-download-update');
    btnRestartInstall = document.getElementById('btn-restart-install');
    updateAlertBox = document.getElementById('update-alert-box');
    updateAlertVersion = document.getElementById('update-alert-version');
    updateAlertNotes = document.getElementById('update-alert-notes');
    progressContainer = document.getElementById('download-progress-container');
    progressBarFill = document.getElementById('progress-bar-fill');
    progressPercentText = document.getElementById('progress-percent-text');
    progressTransferredText = document.getElementById('progress-transferred-text');
    progressSpeedText = document.getElementById('progress-speed-text');
    errorAlertBox = document.getElementById('update-error-alert');
    errorMessageText = document.getElementById('update-error-message');
    settingsUpdateBadge = document.getElementById('settings-update-badge');
    topbarUpdateBanner = document.getElementById('topbar-update-banner');
    topbarUpdateVersion = document.getElementById('topbar-update-version');

    const btnOpenReleases = document.getElementById('btn-open-github-releases');
    if (btnOpenReleases) {
      btnOpenReleases.addEventListener('click', () => {
        const repoReleasesUrl = 'https://github.com/ahsantalks0-cmyk/Website-Department-2/releases';
        if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
          window.electronAPI.openExternal(repoReleasesUrl);
        } else {
          window.open(repoReleasesUrl, '_blank');
        }
      });
    }

    const btnRetryUpdate = document.getElementById('btn-retry-update');
    if (btnRetryUpdate) {
      btnRetryUpdate.addEventListener('click', () => {
        handleCheckForUpdates();
      });
    }

    // Attach button actions
    if (btnCheckUpdates) btnCheckUpdates.addEventListener('click', handleCheckForUpdates);
    if (btnDownloadUpdate) btnDownloadUpdate.addEventListener('click', handleDownloadUpdate);
    if (btnRestartInstall) btnRestartInstall.addEventListener('click', handleInstallUpdate);

    // Load current application version
    await loadAppVersion();

    // Setup IPC listeners if running in Electron environment
    if (window.electronAPI && window.electronAPI.updater) {
      setupElectronListeners();
    } else {
      console.info('[Updater] Web browser environment detected. Simulation fallback enabled.');
      showWebEnvironmentNotice();
    }
  }

  /**
   * Fetches version from main process or package.json
   */
  async function loadAppVersion() {
    let version = '1.0.0';
    if (window.electronAPI && typeof window.electronAPI.getAppVersion === 'function') {
      try {
        version = await window.electronAPI.getAppVersion();
      } catch (err) {
        console.warn('Could not read version via IPC:', err);
      }
    }

    if (appVersionEl) appVersionEl.textContent = `v${version}`;
    const sidebarVersion = document.getElementById('sidebar-app-version');
    if (sidebarVersion) sidebarVersion.textContent = `v${version}`;
  }

  /**
   * Connects to Electron IPC event streams
   */
  function setupElectronListeners() {
    const { updater } = window.electronAPI;

    updater.onUpdateAvailable((info) => {
      console.log('[Updater UI] Update available event:', info);
      onUpdateFound(info);
    });

    updater.onUpdateNotAvailable((info) => {
      console.log('[Updater UI] Update not available event:', info);
      isChecking = false;
      resetCheckingState();
      setStatusText('You are currently running the latest available version.');
    });

    updater.onDownloadProgress((progress) => {
      console.log('[Updater UI] Download progress:', progress);
      onProgressUpdate(progress);
    });

    updater.onUpdateDownloaded((info) => {
      console.log('[Updater UI] Update downloaded event:', info);
      onDownloadComplete(info);
    });

    updater.onUpdateError((err) => {
      console.error('[Updater UI] Update error event:', err);
      showError(err.message || 'An unexpected error occurred during the update process.');
    });
  }

  /**
   * Invoked when user triggers "Check for Updates"
   */
  async function handleCheckForUpdates() {
    if (isChecking || isDownloading) return;
    hideError();
    isChecking = true;

    if (btnCheckUpdates) {
      btnCheckUpdates.disabled = true;
      btnCheckUpdates.innerHTML = `
        <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
        </svg>
        Checking...
      `;
    }

    setStatusText('Connecting to GitHub Releases server...');

    // In Electron Desktop
    if (window.electronAPI && window.electronAPI.updater) {
      try {
        const response = await window.electronAPI.updater.check();
        if (response && response.status === 'dev-mode') {
          // Dev mode friendly prompt
          setTimeout(() => {
            resetCheckingState();
            setStatusText(response.message);
          }, 600);
        }
      } catch (err) {
        resetCheckingState();
        showError(err.message || 'Failed to check for updates.');
      }
    } else {
      // Browser preview mode simulation
      simulateUpdateCheck();
    }
  }

  /**
   * Invoked when user clicks "Download Update"
   */
  async function handleDownloadUpdate() {
    if (isDownloading || isDownloaded) return;
    hideError();
    isDownloading = true;

    if (btnDownloadUpdate) {
      btnDownloadUpdate.style.display = 'none';
    }

    if (progressContainer) {
      progressContainer.classList.add('visible');
    }

    setStatusText('Downloading release package from GitHub...');

    // In Electron Desktop
    if (window.electronAPI && window.electronAPI.updater) {
      try {
        await window.electronAPI.updater.download();
      } catch (err) {
        isDownloading = false;
        showError(err.message || 'Download initialization failed.');
      }
    } else {
      // Browser preview mode simulation
      simulateDownloadProgress();
    }
  }

  /**
   * Invoked when user clicks "Restart & Install"
   */
  async function handleInstallUpdate() {
    if (btnRestartInstall) {
      btnRestartInstall.disabled = true;
      btnRestartInstall.textContent = 'Restarting Application...';
    }

    setStatusText('Shutting down and applying installer package...');

    if (window.electronAPI && window.electronAPI.updater) {
      try {
        await window.electronAPI.updater.install();
      } catch (err) {
        showError(err.message || 'Unable to restart application.');
      }
    } else {
      setStatusText('Simulating restart and reloading application preview...');
      setTimeout(() => {
        location.reload();
      }, 800);
    }
  }

  /**
   * UI State: Update Found
   */
  function onUpdateFound(info) {
    availableUpdateInfo = info;
    resetCheckingState();
    setStatusText(`New update found: Version ${info.version}`);

    // Update alert card
    if (updateAlertBox) updateAlertBox.classList.add('visible');
    if (updateAlertVersion) updateAlertVersion.textContent = `v${info.version}`;
    if (updateAlertNotes) updateAlertNotes.textContent = info.releaseNotes || 'Maintenance and stability release.';

    // Show Download Button
    if (btnDownloadUpdate) btnDownloadUpdate.style.display = 'inline-flex';

    // Show Badges
    if (settingsUpdateBadge) settingsUpdateBadge.classList.add('visible');
    if (topbarUpdateBanner) {
      topbarUpdateBanner.classList.add('visible');
      if (topbarUpdateVersion) topbarUpdateVersion.textContent = `v${info.version}`;
    }
  }

  /**
   * UI State: Download Progress Update
   */
  function onProgressUpdate(data) {
    const percent = Math.min(100, Math.max(0, data.percent || 0));
    const transferred = formatMB(data.transferred);
    const total = formatMB(data.total || 48 * 1024 * 1024);
    const speed = formatSpeed(data.bytesPerSecond);

    if (progressBarFill) progressBarFill.style.width = `${percent}%`;
    if (progressPercentText) progressPercentText.textContent = `${percent}%`;
    if (progressTransferredText) progressTransferredText.textContent = `${transferred} / ${total}`;
    if (progressSpeedText) progressSpeedText.textContent = `${speed}`;

    setStatusText(`Downloading update: ${percent}% completed`);
  }

  /**
   * UI State: Download Complete
   */
  function onDownloadComplete(info) {
    isDownloading = false;
    isDownloaded = true;

    if (progressBarFill) progressBarFill.style.width = '100%';
    if (progressPercentText) progressPercentText.textContent = '100%';

    setStatusText(`Update v${info.version || 'latest'} downloaded. Ready to restart.`);

    // Hide download progress container after brief pause
    setTimeout(() => {
      if (progressContainer) progressContainer.classList.remove('visible');
    }, 600);

    // Show Restart & Install Button
    if (btnRestartInstall) {
      btnRestartInstall.style.display = 'inline-flex';
    }
  }

  /**
   * UI State: Reset checking button
   */
  function resetCheckingState() {
    isChecking = false;
    if (btnCheckUpdates) {
      btnCheckUpdates.disabled = false;
      btnCheckUpdates.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
          <path d="M16 21h5v-5"></path>
        </svg>
        Check for Updates
      `;
    }
  }

  function setStatusText(msg) {
    if (statusTextEl) statusTextEl.textContent = msg;
  }

  function showError(msg) {
    resetCheckingState();
    isDownloading = false;

    // Hide stuck download progress bar
    if (progressContainer) {
      progressContainer.classList.remove('visible');
    }

    // Restore download button so user can retry or re-initiate
    if (btnDownloadUpdate) {
      btnDownloadUpdate.style.display = 'inline-flex';
      btnDownloadUpdate.disabled = false;
    }

    if (errorAlertBox) errorAlertBox.classList.add('visible');

    let formattedMsg = msg;
    if (typeof msg === 'string' && (msg.includes('404') || msg.includes('status 404'))) {
      formattedMsg = 'The release installer file could not be found on GitHub (HTTP 404). This happens when the release file name on GitHub does not match latest.yml. You can click "Download Manually from GitHub" below or wait for the automatic build to finish.';
    }

    if (errorMessageText) errorMessageText.textContent = formattedMsg;
    setStatusText('Update check completed with warning.');
  }

  function hideError() {
    if (errorAlertBox) errorAlertBox.classList.remove('visible');
  }

  function showWebEnvironmentNotice() {
    const notice = document.getElementById('web-preview-notice');
    if (notice) notice.style.display = 'block';
  }

  /**
   * Browser Preview Simulation: Allows testing the full updater UI lifecycle
   * directly in the AI Studio web container preview without needing a Windows binary.
   */
  function simulateUpdateCheck() {
    setTimeout(() => {
      resetCheckingState();
      onUpdateFound({
        version: '1.0.1',
        releaseNotes: 'Performance optimization, streamlined IPC message passing, and Phase 1 UI polish.',
      });
    }, 1200);
  }

  function simulateDownloadProgress() {
    let pct = 0;
    const totalBytes = 48.6 * 1024 * 1024;
    const interval = setInterval(() => {
      pct += Math.floor(Math.random() * 9) + 6;
      if (pct >= 100) {
        pct = 100;
        clearInterval(interval);
        onProgressUpdate({
          percent: 100,
          transferred: totalBytes,
          total: totalBytes,
          bytesPerSecond: 3.4 * 1024 * 1024,
        });
        setTimeout(() => {
          onDownloadComplete({ version: '1.0.1' });
        }, 400);
      } else {
        const transferredBytes = (pct / 100) * totalBytes;
        onProgressUpdate({
          percent: pct,
          transferred: transferredBytes,
          total: totalBytes,
          bytesPerSecond: (2.5 + Math.random() * 1.8) * 1024 * 1024,
        });
      }
    }, 280);
  }

  // Hook into DOM lifecycle
  document.addEventListener('DOMContentLoaded', initUpdater);
})();
