// Life in UK Test Tracker - Shared Module
// Extracted shared code for popup.js and sidepanel.js

(function(window) {
  'use strict';

  // Storage utility functions - DRY wrappers for Chrome storage API
  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      });
    });
  }

  function storageSet(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  // Storage quota constants (Chrome storage.local limit is ~10MB)
  const STORAGE_QUOTA_WARNING_BYTES = 8 * 1024 * 1024; // 8MB warning threshold
  const STORAGE_QUOTA_LIMIT_BYTES = 10 * 1024 * 1024;  // 10MB hard limit

  // Check storage quota and show warning banner if approaching limit
  async function checkStorageQuota() {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, function(bytesInUse) {
        if (chrome.runtime.lastError) {
          console.error('[UK Test Tracker] Quota check error:', chrome.runtime.lastError);
          resolve({ ok: true, bytesInUse: 0 }); // Don't block on error
          return;
        }

        const percentage = Math.round((bytesInUse / STORAGE_QUOTA_LIMIT_BYTES) * 100);
        const isCritical = bytesInUse >= STORAGE_QUOTA_LIMIT_BYTES;
        const isWarning = bytesInUse >= STORAGE_QUOTA_WARNING_BYTES;

        updateStorageWarningBanner(isWarning, isCritical, percentage, bytesInUse);

        resolve({ ok: !isCritical, bytesInUse, percentage });
      });
    });
  }

  // Update the storage warning banner UI
  function updateStorageWarningBanner(isWarning, isCritical, percentage, bytesInUse) {
    const banner = document.getElementById('storage-warning-banner');
    const text = document.getElementById('storage-warning-text');
    const fill = document.getElementById('storage-usage-fill');

    if (!banner || !text || !fill) return;

    if (!isWarning && !isCritical) {
      banner.style.display = 'none';
      return;
    }

    banner.style.display = 'block';
    banner.classList.toggle('critical', isCritical);

    const mbUsed = (bytesInUse / (1024 * 1024)).toFixed(1);
    const mbLimit = (STORAGE_QUOTA_LIMIT_BYTES / (1024 * 1024)).toFixed(0);

    if (isCritical) {
      text.textContent = `Storage full (${mbUsed}/${mbLimit} MB) - Export and clear data to continue`;
    } else {
      text.textContent = `Storage ${percentage}% full (${mbUsed}/${mbLimit} MB) - Consider exporting data`;
    }

    fill.style.width = Math.min(percentage, 100) + '%';
  }

  // Web Worker for large CSV exports (threshold: 500 questions)
  const WORKER_EXPORT_THRESHOLD = 500;
  let exportWorker = null;
  let pendingExportRequests = new Map();

  /**
   * Initialize the export worker if not already initialized
   * @returns {Worker|null}
   */
  function getExportWorker() {
    if (exportWorker) return exportWorker;

    try {
      exportWorker = new Worker('csv-export-worker.js');

      exportWorker.onmessage = function(event) {
        const { success, requestId, data, filename, mimeType, error } = event.data;
        const pending = pendingExportRequests.get(requestId);

        if (pending) {
          pendingExportRequests.delete(requestId);
          if (success) {
            pending.resolve({ data, filename, mimeType });
          } else {
            pending.reject(new Error(error || 'Export failed'));
          }
        }
      };

      exportWorker.onerror = function(error) {
        console.error('[UK Test Tracker] Export worker error:', error);
        // Reject all pending requests
        for (const [requestId, pending] of pendingExportRequests) {
          pending.reject(new Error('Worker error: ' + error.message));
          pendingExportRequests.delete(requestId);
        }
      };

      return exportWorker;
    } catch (e) {
      console.warn('[UK Test Tracker] Web Worker not available, using main thread');
      return null;
    }
  }

  /**
   * Export data using Web Worker (for large datasets)
   * @param {string} type - 'csv' or 'json'
   * @param {Array} sessions
   * @returns {Promise<{data: string, filename: string, mimeType: string}>}
   */
  function exportWithWorker(type, sessions) {
    return new Promise((resolve, reject) => {
      const worker = getExportWorker();
      if (!worker) {
        reject(new Error('Worker not available'));
        return;
      }

      const requestId = Date.now() + Math.random().toString(36);
      pendingExportRequests.set(requestId, { resolve, reject });

      worker.postMessage({ type, sessions, requestId });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingExportRequests.has(requestId)) {
          pendingExportRequests.delete(requestId);
          reject(new Error('Export timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Count total questions across all sessions
   * @param {Array} sessions
   * @returns {number}
   */
  function countTotalQuestions(sessions) {
    return sessions.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
  }

  // Track storage change listener for cleanup
  let storageChangeListener = null;

  // Track last rendered hash to enable incremental updates
  let lastRenderedHash = null;

  // SYNC: This function is duplicated in csv-export-worker.js
  // Workers cannot import from main thread - keep both versions in sync
  // Date formatting utility - DRY helper for date validation and formatting
  function formatDate(timestamp, options = {}) {
    const fallback = options.fallback || 'Unknown';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return { date: fallback, time: '', datetime: fallback };
      return {
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString(),
        datetime: date.toLocaleString()
      };
    } catch (e) {
      return { date: fallback, time: '', datetime: fallback };
    }
  }

  // SYNC: This function is duplicated in csv-export-worker.js
  // Workers cannot import from main thread - keep both versions in sync
  // Timestamp suffix for export filenames (snake_case format)
  function getTimestampSuffix() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `_${year}_${month}_${day}_${hours}_${minutes}_${seconds}`;
  }

  // PERF: Sorted questions cache for O(1) timeline rendering
  let sortedQuestionsCache = new Map(); // sessionId → {sorted, count, lastUpdated}

  // FIX: Improved hash function for change detection - includes multiple signals to reduce collisions
  function hashSessions(sessions) {
    if (!sessions || sessions.length === 0) return '0_empty';
    const totalQuestions = sessions.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
    const lastUpdates = sessions.map(s => s.lastUpdated || '').join('|');
    return `${sessions.length}_${totalQuestions}_${lastUpdates.length}`;
  }

  // PERF: Get sorted questions with caching (O(q log q) → O(1) on cache hit)
  function getSortedQuestions(session) {
    if (!session || !session.questions || session.questions.length === 0) {
      return [];
    }

    const cached = sortedQuestionsCache.get(session.id);

    // Check if cache is valid (same count and lastUpdated)
    if (cached &&
        cached.count === session.questions.length &&
        cached.lastUpdated === session.lastUpdated) {
      return cached.sorted;
    }

    // Rebuild cache - pre-parse timestamps for efficient sorting
    const sorted = session.questions
      .map(q => ({ ...q, _ts: new Date(q.timestamp || 0).getTime() }))
      .sort((a, b) => b._ts - a._ts);

    sortedQuestionsCache.set(session.id, {
      sorted,
      count: session.questions.length,
      lastUpdated: session.lastUpdated
    });

    // PERF: Trim cache to prevent unbounded memory growth
    trimSortedCache();

    return sorted;
  }

  // PERF: Clear all caches (called on data clear)
  function clearCaches() {
    sortedQuestionsCache.clear();
    lastRenderedHash = null;
  }

  // PERF: Cache size limit to prevent unbounded memory growth
  const MAX_SORTED_CACHE_SIZE = 50;

  function trimSortedCache() {
    if (sortedQuestionsCache.size > MAX_SORTED_CACHE_SIZE) {
      // Remove oldest entries (first half)
      const keysToRemove = [...sortedQuestionsCache.keys()].slice(0, Math.floor(sortedQuestionsCache.size / 2));
      keysToRemove.forEach(key => sortedQuestionsCache.delete(key));
    }
  }

  // FIX #13: Use storage.onChanged instead of polling
  function setupStorageListener() {
    // FIX #7: Remove any existing listener first
    if (storageChangeListener) {
      chrome.storage.onChanged.removeListener(storageChangeListener);
    }

    storageChangeListener = function(changes, namespace) {
      if (namespace === 'local' && changes.testSessions) {
        loadData();
      }
    };

    chrome.storage.onChanged.addListener(storageChangeListener);
  }

  // FIX: Converted to async/await for cleaner code
  async function loadData() {
    try {
      const result = await storageGet(['testSessions']);
      const sessions = result.testSessions || [];

      // Store sessions for filter indicator name lookup
      sessionsData = sessions;

      // FIX #12: Only re-render if data actually changed
      const currentHash = hashSessions(sessions);
      if (currentHash === lastRenderedHash) {
        return; // No changes, skip render
      }
      lastRenderedHash = currentHash;

      updateStats(sessions);
      renderSessions(sessions);
      renderQuestions(sessions);

      // Update storage warning banner after data load
      checkStorageQuota();
    } catch (e) {
      console.error('loadData error:', e);
      showError('Unable to load data');
    }
  }

  function showError(message) {
    const container = document.getElementById('sessions-list');
    if (container) {
      container.innerHTML = `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
    }
  }

  function updateStats(sessions) {
    let total = 0;
    let correct = 0;
    let incorrect = 0;

    sessions.forEach(session => {
      // PERF: Use cached _stats if available (O(1) instead of O(q) per session)
      if (session._stats) {
        total += session._stats.total;
        correct += session._stats.correct;
        incorrect += session._stats.incorrect;
      } else if (session.questions && Array.isArray(session.questions)) {
        // Fallback for sessions without cache
        session.questions.forEach(q => {
          total++;
          if (q.isCorrect === true) correct++;
          if (q.isCorrect === false) incorrect++;
        });
      }
    });

    const totalEl = document.getElementById('total-count');
    const correctEl = document.getElementById('correct-count');
    const incorrectEl = document.getElementById('incorrect-count');

    if (totalEl) totalEl.textContent = total;
    if (correctEl) correctEl.textContent = correct;
    if (incorrectEl) incorrectEl.textContent = incorrect;

    // Update success rate display
    const successRateContainer = document.getElementById('success-rate-container');
    const successRateFill = document.getElementById('success-rate-fill');
    const successRatePercent = document.getElementById('success-rate-percent');

    if (successRateContainer && successRateFill && successRatePercent) {
      if (total > 0) {
        const percentage = Math.round((correct / total) * 100);
        successRateContainer.style.display = 'block';
        successRateFill.style.width = percentage + '%';
        successRatePercent.textContent = percentage;
      } else {
        successRateContainer.style.display = 'none';
      }
    }
  }

  function renderSessions(sessions) {
    const container = document.getElementById('sessions-list');
    if (!container) return;

    if (!sessions || sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p><strong>No data yet</strong></p>
          <p class="empty-hint">Visit a practice website and answer some questions. This extension automatically tracks your answers when you click "Check".</p>
          <p class="empty-hint"><strong>Practice sites:</strong></p>
          <div class="practice-links">
            <a href="https://lifeintheuktestweb.co.uk/test-1/" target="_blank">lifeintheuktestweb.co.uk</a>
            <a href="https://lifeintheuktestpractice.co.uk/" target="_blank">lifeintheuktestpractice.co.uk</a>
            <a href="https://theuktest.com/" target="_blank">theuktest.com</a>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = sessions.map(session => {
      // PERF: Use cached _stats if available (O(1) instead of O(q) × 2 filter)
      const questions = session.questions || [];
      const correctCount = session._stats?.correct ??
        questions.filter(q => q.isCorrect === true).length;
      const incorrectCount = session._stats?.incorrect ??
        questions.filter(q => q.isCorrect === false).length;

      const { date: dateStr, time: timeStr } = formatDate(session.startTime, { fallback: 'Unknown date' });

      return `
        <div class="session-item" data-session-id="${escapeHtml(session.id)}" role="button" tabindex="0">
          <h3>${escapeHtml(session.testName || 'Unknown Test')}</h3>
          <p>${escapeHtml(dateStr)} at ${escapeHtml(timeStr)}</p>
          <div class="session-stats">
            <span class="correct">${correctCount} correct</span>
            <span class="incorrect">${incorrectCount} incorrect</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderQuestions(sessions) {
    const container = document.getElementById('question-list');
    if (!container) return;

    // Filter sessions that have questions and sort by most recent activity
    const sessionsWithQuestions = sessions
      .filter(session => session.questions && session.questions.length > 0)
      .sort((a, b) => {
        const aTime = a.lastUpdated || a.startTime || 0;
        const bTime = b.lastUpdated || b.startTime || 0;
        return new Date(bTime) - new Date(aTime);
      });

    if (sessionsWithQuestions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p><strong>No questions tracked yet</strong></p>
          <p class="empty-hint">Answer questions on the practice website and they'll appear here for review.</p>
        </div>
      `;
      return;
    }

    // Build timeline HTML with test headers
    let html = '';
    sessionsWithQuestions.forEach(session => {
      const { date: dateStr } = formatDate(session.lastUpdated || session.startTime, { fallback: 'Unknown date' });
      const sessionId = escapeHtml(session.id);

      // Test header
      html += `
        <div class="test-header" data-session-id="${sessionId}">
          <span class="test-name">${escapeHtml(session.testName || 'Unknown Test')}</span>
          <span class="test-date">${escapeHtml(dateStr)}</span>
        </div>
      `;

      // PERF: Use cached sorted questions (O(1) on cache hit instead of O(n log n))
      const sortedQuestions = getSortedQuestions(session);

      // Render questions using map().join() for cleaner code
      html += sortedQuestions.map(q => {
        const statusIcon = q.isCorrect ? '✓' : '✗';
        const statusText = q.isCorrect ? 'Correct' : 'Incorrect';
        return `
        <div class="question-item ${q.isCorrect ? 'correct' : 'incorrect'}" data-session-id="${sessionId}">
          <div class="question-header">
            <span class="status-indicator ${q.isCorrect ? 'correct' : 'incorrect'}" aria-label="${statusText}">${statusIcon}</span>
            <div class="question-text">${escapeHtml(q.questionText || '')}</div>
          </div>
          <div class="answer-row user">Your answer: ${escapeHtml(q.userAnswer || 'Not answered')}</div>
          <div class="answer-row correct-answer">Correct: ${escapeHtml(q.correctAnswer || 'Unknown')}</div>
        </div>
      `;
      }).join('');
    });

    container.innerHTML = html;
  }

  // Tab activation helper function
  function activateTab(tab) {
    const tabName = tab.dataset.tab;
    const tabs = document.querySelectorAll('.tab[role="tab"]');
    const panels = document.querySelectorAll('.tab-content[role="tabpanel"]');

    // Update ARIA and visual states for all tabs
    tabs.forEach(t => {
      const isSelected = t === tab;
      t.classList.toggle('active', isSelected);
      t.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      t.setAttribute('tabindex', isSelected ? '0' : '-1');
    });

    // Update content panels
    panels.forEach(panel => {
      const isActive = panel.id === `${tabName}-content`;
      panel.classList.toggle('active', isActive);
      panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });
  }

  function setupEventListeners() {
    // Tab switching - click handler
    document.querySelectorAll('.tab[role="tab"]').forEach(tab => {
      tab.addEventListener('click', function() {
        activateTab(this);
      });
    });

    // Tab keyboard navigation
    const tablist = document.querySelector('.tabs[role="tablist"]');
    if (tablist) {
      tablist.addEventListener('keydown', function(e) {
        const tabs = Array.from(document.querySelectorAll('.tab[role="tab"]'));
        const currentTab = document.activeElement;
        const currentIndex = tabs.indexOf(currentTab);

        if (currentIndex === -1) return;

        let newIndex = currentIndex;

        switch (e.key) {
          case 'ArrowLeft':
          case 'ArrowUp':
            e.preventDefault();
            newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
            break;
          case 'ArrowRight':
          case 'ArrowDown':
            e.preventDefault();
            newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
            break;
          case 'Home':
            e.preventDefault();
            newIndex = 0;
            break;
          case 'End':
            e.preventDefault();
            newIndex = tabs.length - 1;
            break;
          default:
            return;
        }

        tabs[newIndex].focus();
        activateTab(tabs[newIndex]);
      });
    }

    // Export JSON - Uses Web Worker for large datasets (500+ questions)
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', async function() {
        setButtonLoading(exportBtn, true);
        try {
          const result = await storageGet(['testSessions']);
          const sessions = result.testSessions || [];
          const totalQuestions = countTotalQuestions(sessions);

          // Use Web Worker for large datasets
          if (totalQuestions >= WORKER_EXPORT_THRESHOLD && getExportWorker()) {
            const { data, filename, mimeType } = await exportWithWorker('json', sessions);
            downloadFile(data, filename, mimeType);
          } else {
            const dataStr = JSON.stringify(sessions, null, 2);
            downloadFile(dataStr, `uk-test-tracker-data${getTimestampSuffix()}.json`, 'application/json');
          }
          showSuccessToast('Data exported');
        } catch (e) {
          console.error('Export error:', e);
          showSuccessToast('Export failed');
        } finally {
          setButtonLoading(exportBtn, false);
        }
      });
    }

    // Export CSV for Claude - Uses Web Worker for large datasets (500+ questions)
    const exportCsvBtn = document.getElementById('export-csv-btn');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', async function() {
        setButtonLoading(exportCsvBtn, true);
        try {
          const result = await storageGet(['testSessions']);
          const sessions = result.testSessions || [];
          const totalQuestions = countTotalQuestions(sessions);

          // Use Web Worker for large datasets
          if (totalQuestions >= WORKER_EXPORT_THRESHOLD && getExportWorker()) {
            const { data, filename, mimeType } = await exportWithWorker('csv', sessions);
            downloadFile(data, filename, mimeType);
          } else {
            const csvData = convertToCSV(sessions);
            downloadFile(csvData, `uk-test-tracker-data${getTimestampSuffix()}.csv`, 'text/csv;charset=utf-8');
          }
          showSuccessToast('CSV exported');
        } catch (e) {
          console.error('Export CSV error:', e);
          showSuccessToast('Export failed');
        } finally {
          setButtonLoading(exportCsvBtn, false);
        }
      });
    }

    // Clear data with custom modal and undo functionality
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        confirmClear();
      });
    }

    // Modal button handlers
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');

    if (modalCancel) {
      modalCancel.addEventListener('click', function() {
        hideModal();
        if (modalResolve) {
          modalResolve(false);
          modalResolve = null;
        }
      });
    }

    if (modalConfirm) {
      modalConfirm.addEventListener('click', async function() {
        hideModal();
        try {
          // Store backup before clearing
          const result = await storageGet(['testSessions']);
          undoBackup = result.testSessions || [];

          // Clear the data
          await storageSet({ testSessions: [] });

          // PERF: Clear all caches when data is cleared
          clearCaches();
          loadData();
          showUndoToast();
        } catch (e) {
          console.error('Clear error:', e);
          showSuccessToast('Failed to clear data');
          undoBackup = null;
        }
        if (modalResolve) {
          modalResolve(true);
          modalResolve = null;
        }
      });
    }

    // Modal overlay click to close
    const modalOverlay = document.getElementById('confirm-modal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function(e) {
        if (e.target === modalOverlay) {
          hideModal();
          if (modalResolve) {
            modalResolve(false);
            modalResolve = null;
          }
        }
      });

      // Escape key to close modal
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          // Close confirm modal if open
          if (modalOverlay.classList.contains('show')) {
            hideModal();
            if (modalResolve) {
              modalResolve(false);
              modalResolve = null;
            }
          }
          // Close onboarding modal if open
          const onboardingModal = document.getElementById('onboarding-modal');
          if (onboardingModal && onboardingModal.classList.contains('show')) {
            completeOnboarding();
          }
        }
      });
    }

    // Undo button handler
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
      undoBtn.addEventListener('click', function() {
        restoreBackup();
      });
    }

    // Search input handler
    const searchInput = document.getElementById('question-search');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          currentSearchTerm = this.value;
          applyQuestionFilters();
        }, 150);
      });
    }

    // Filter buttons handler
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        filterButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        this.classList.add('active');
        this.setAttribute('aria-pressed', 'true');
        currentFilter = this.dataset.filter;
        applyQuestionFilters();
      });
    });

    // Session click → switch to Timeline filtered by that session
    const sessionsList = document.getElementById('sessions-list');
    if (sessionsList) {
      sessionsList.addEventListener('click', (e) => {
        const item = e.target.closest('.session-item[data-session-id]');
        if (item) {
          currentSessionFilter = item.dataset.sessionId;
          activateTab(document.getElementById('tab-questions'));
          applyQuestionFilters();
          updateFilterIndicator();
        }
      });

      // Keyboard support for sessions (Enter/Space)
      sessionsList.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const item = e.target.closest('.session-item[data-session-id]');
          if (item) {
            e.preventDefault();
            currentSessionFilter = item.dataset.sessionId;
            activateTab(document.getElementById('tab-questions'));
            applyQuestionFilters();
            updateFilterIndicator();
          }
        }
      });
    }

    // Clear session filter button
    const clearFilterBtn = document.getElementById('clear-session-filter');
    if (clearFilterBtn) {
      clearFilterBtn.addEventListener('click', clearSessionFilter);
    }

    // Onboarding dismiss button
    const onboardingDismiss = document.getElementById('onboarding-dismiss');
    if (onboardingDismiss) {
      onboardingDismiss.addEventListener('click', completeOnboarding);
    }

    // Onboarding modal overlay click to close
    const onboardingOverlay = document.getElementById('onboarding-modal');
    if (onboardingOverlay) {
      onboardingOverlay.addEventListener('click', function(e) {
        if (e.target === onboardingOverlay) {
          completeOnboarding();
        }
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      // Check for Ctrl/Cmd modifier
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (!modifier) return;

      // Don't trigger shortcuts when typing in search input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'e':
        case 'E':
          // Ctrl/Cmd+E: Export JSON
          e.preventDefault();
          const exportBtn = document.getElementById('export-btn');
          if (exportBtn) exportBtn.click();
          break;
        case '1':
          // Ctrl/Cmd+1: Switch to Sessions tab
          e.preventDefault();
          const sessionsTab = document.getElementById('tab-sessions');
          if (sessionsTab) {
            sessionsTab.click();
            sessionsTab.focus();
          }
          break;
        case '2':
          // Ctrl/Cmd+2: Switch to Timeline tab
          e.preventDefault();
          const questionsTab = document.getElementById('tab-questions');
          if (questionsTab) {
            questionsTab.click();
            questionsTab.focus();
          }
          break;
        case '/':
          // Ctrl/Cmd+/: Focus search
          e.preventDefault();
          const searchInput = document.getElementById('question-search');
          if (searchInput) {
            // Switch to Questions tab first if needed
            const questionsContent = document.getElementById('questions-content');
            if (!questionsContent.classList.contains('active')) {
              const qTab = document.getElementById('tab-questions');
              if (qTab) qTab.click();
            }
            searchInput.focus();
          }
          break;
      }
    });
  }

  // SYNC: This function is duplicated in csv-export-worker.js
  // Workers cannot import from main thread - keep both versions in sync
  function convertToCSV(sessions) {
    const rows = [['Test Name', 'Question Number', 'Question', 'Your Answer', 'Correct Answer', 'Result', 'Type', 'Date']];

    sessions.forEach(session => {
      const questions = session.questions || [];
      questions.forEach(q => {
        const { datetime: dateStr } = formatDate(q.timestamp);

        rows.push([
          session.testName || 'Unknown',
          q.questionNumber || '',
          q.questionText || '',
          q.userAnswer || '',
          q.correctAnswer || '',
          q.isCorrect ? 'Correct' : 'Incorrect',
          q.isMultiSelect ? 'Multi-select' : 'Single',
          dateStr
        ]);
      });
    });

    // FIX #15: Convert to CSV string with proper escaping including newlines
    const csvContent = rows.map(row =>
      row.map(cell => {
        let cellStr = String(cell);
        // Replace newlines with spaces to prevent CSV row breaks
        cellStr = cellStr.replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' ');
        // Always wrap in quotes and escape internal quotes
        return '"' + cellStr.replace(/"/g, '""') + '"';
      }).join(',')
    ).join('\r\n'); // Use CRLF for better Excel compatibility

    // Add UTF-8 BOM for Excel compatibility
    return '\uFEFF' + csvContent;
  }

  function downloadFile(content, filename, type) {
    try {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download error:', e);
      alert('Failed to download file');
    }
  }

  // FIX #26: More efficient HTML escaping using a cached element
  const escapeEl = document.createElement('div');
  function escapeHtml(text) {
    if (text === null || text === undefined) {
      return '';
    }
    escapeEl.textContent = String(text);
    return escapeEl.innerHTML;
  }

  // Onboarding modal functions
  async function checkAndShowOnboarding() {
    try {
      const result = await storageGet(['onboardingComplete']);
      // Show onboarding only if flag is explicitly false (fresh install)
      // undefined means existing user (pre-onboarding) - don't show
      if (result.onboardingComplete === false) {
        showOnboardingModal();
      }
    } catch (e) {
      console.error('[UK Test Tracker] Error checking onboarding:', e);
    }
  }

  function showOnboardingModal() {
    const modal = document.getElementById('onboarding-modal');
    if (modal) {
      modal.classList.add('show');
      // Focus the dismiss button for accessibility
      const dismissBtn = document.getElementById('onboarding-dismiss');
      if (dismissBtn) dismissBtn.focus();
    }
  }

  function hideOnboardingModal() {
    const modal = document.getElementById('onboarding-modal');
    if (modal) {
      modal.classList.remove('show');
    }
  }

  async function completeOnboarding() {
    try {
      await storageSet({ onboardingComplete: true });
      hideOnboardingModal();
    } catch (e) {
      console.error('[UK Test Tracker] Error completing onboarding:', e);
      hideOnboardingModal(); // Still hide the modal
    }
  }

  // Modal helper functions
  let modalResolve = null;

  function showModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) {
      modal.classList.add('show');
      // Focus the cancel button for accessibility
      const cancelBtn = document.getElementById('modal-cancel');
      if (cancelBtn) cancelBtn.focus();
    }
  }

  function hideModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) {
      modal.classList.remove('show');
    }
  }

  function confirmClear() {
    return new Promise((resolve) => {
      modalResolve = resolve;
      showModal();
    });
  }

  // Undo functionality
  let undoBackup = null;
  let undoTimeout = null;
  let undoInterval = null;

  function showUndoToast() {
    const toast = document.getElementById('undo-toast');
    const timerEl = document.getElementById('undo-timer');
    if (!toast) return;

    let secondsLeft = 30;
    if (timerEl) timerEl.textContent = secondsLeft;

    toast.classList.add('show');

    undoInterval = setInterval(() => {
      secondsLeft--;
      if (timerEl) timerEl.textContent = secondsLeft;
      if (secondsLeft <= 0) {
        clearInterval(undoInterval);
        undoInterval = null;
      }
    }, 1000);

    undoTimeout = setTimeout(() => {
      hideUndoToast();
      undoBackup = null;
    }, 30000);
  }

  function hideUndoToast() {
    const toast = document.getElementById('undo-toast');
    if (toast) {
      toast.classList.remove('show');
    }
    if (undoInterval) {
      clearInterval(undoInterval);
      undoInterval = null;
    }
    if (undoTimeout) {
      clearTimeout(undoTimeout);
      undoTimeout = null;
    }
  }

  async function restoreBackup() {
    if (undoBackup) {
      try {
        await storageSet({ testSessions: undoBackup });
        hideUndoToast();
        undoBackup = null;
        loadData();
        showSuccessToast('Data restored');
      } catch (e) {
        console.error('Restore error:', e);
        showSuccessToast('Failed to restore data');
      }
    }
  }

  // Success toast
  function showSuccessToast(message) {
    const toast = document.getElementById('success-toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }
  }

  // Loading state helpers
  function setButtonLoading(button, loading) {
    if (button) {
      if (loading) {
        button.classList.add('loading');
        button.dataset.originalText = button.textContent;
        button.textContent = '';
      } else {
        button.classList.remove('loading');
        if (button.dataset.originalText) {
          button.textContent = button.dataset.originalText;
        }
      }
    }
  }

  // Search/filter state
  let currentSearchTerm = '';
  let currentFilter = 'all';
  let currentSessionFilter = null;
  let sessionsData = []; // Store sessions for filter name lookup

  function applyQuestionFilters() {
    const container = document.getElementById('question-list');
    if (!container) return;

    const items = container.querySelectorAll('.question-item');
    const searchLower = currentSearchTerm.toLowerCase();

    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      const isCorrect = item.classList.contains('correct');
      const isIncorrect = item.classList.contains('incorrect');

      let showByFilter = currentFilter === 'all' ||
        (currentFilter === 'correct' && isCorrect) ||
        (currentFilter === 'incorrect' && isIncorrect);

      let showBySearch = !searchLower || text.includes(searchLower);

      // Session filter check
      let showBySession = !currentSessionFilter ||
        item.dataset.sessionId === currentSessionFilter;

      item.style.display = (showByFilter && showBySearch && showBySession) ? '' : 'none';
    });

    // Also hide/show test headers based on their visible children
    const testHeaders = container.querySelectorAll('.test-header');
    testHeaders.forEach(header => {
      // Session filter check for headers
      if (currentSessionFilter && header.dataset.sessionId !== currentSessionFilter) {
        header.style.display = 'none';
        return;
      }

      // Find next siblings until next header or end
      let hasVisibleQuestions = false;
      let sibling = header.nextElementSibling;
      while (sibling && !sibling.classList.contains('test-header')) {
        if (sibling.classList.contains('question-item') && sibling.style.display !== 'none') {
          hasVisibleQuestions = true;
          break;
        }
        sibling = sibling.nextElementSibling;
      }
      header.style.display = hasVisibleQuestions ? '' : 'none';
    });
  }

  function updateFilterIndicator() {
    const indicator = document.getElementById('session-filter-indicator');
    const nameSpan = document.getElementById('session-filter-name');
    if (!indicator || !nameSpan) return;

    if (currentSessionFilter) {
      const session = sessionsData.find(s => s.id === currentSessionFilter);
      const sessionName = session ? (session.testName || 'Unknown Test') : 'Selected session';
      nameSpan.textContent = `Viewing: ${sessionName}`;
      indicator.style.display = 'flex';
    } else {
      indicator.style.display = 'none';
    }
  }

  function clearSessionFilter() {
    currentSessionFilter = null;
    updateFilterIndicator();
    applyQuestionFilters();
  }

  // FIX: Show skeleton loading state for faster perceived loading
  function renderSkeleton() {
    const sessionsContainer = document.getElementById('sessions-list');
    const questionsContainer = document.getElementById('question-list');

    if (sessionsContainer) {
      sessionsContainer.innerHTML = `
        <div class="skeleton-loading">
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
        </div>
      `;
    }

    if (questionsContainer) {
      questionsContainer.innerHTML = `
        <div class="skeleton-loading">
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
        </div>
      `;
    }
  }

  // Initialize function to be called from popup.js or sidepanel.js
  function init() {
    // FIX: Show skeleton immediately for faster perceived loading
    renderSkeleton();

    // Check and show onboarding for first-time users
    checkAndShowOnboarding();

    // Check storage quota and show warning if approaching limit
    checkStorageQuota();

    loadData();
    setupEventListeners();
    setupStorageListener();

    // FIX: Remove polling fallback - storage.onChanged is sufficient
    // Polling was causing unnecessary CPU usage and was only a fallback
    // The storage listener provides reliable real-time updates

    // Use visibility API to refresh when popup regains focus
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        loadData(); // Immediate refresh when becoming visible
      }
    });
  }

  // Cleanup function for when the page is unloaded
  function cleanup() {
    // FIX: Removed refreshIntervalId cleanup since polling was removed
    if (storageChangeListener) {
      chrome.storage.onChanged.removeListener(storageChangeListener);
      storageChangeListener = null;
    }

    // Terminate export worker if running
    if (exportWorker) {
      exportWorker.terminate();
      exportWorker = null;
      pendingExportRequests.clear();
    }
  }

  // Export functions for use by popup.js and sidepanel.js
  window.UKTestTracker = {
    init: init,
    cleanup: cleanup,
    loadData: loadData
  };

})(window);
