// Life in UK Test Tracker - Content Script
// Captures quiz data when user clicks "Check" button

(function() {
  'use strict';

  // Storage quota constants (Chrome storage.local limit is ~10MB)
  const STORAGE_QUOTA_WARNING_BYTES = 8 * 1024 * 1024; // 8MB warning threshold
  const STORAGE_QUOTA_LIMIT_BYTES = 10 * 1024 * 1024;  // 10MB hard limit

  // Session timeout constant
  const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

  // Shadow DOM container for CSS isolation
  let shadowHost = null;
  let shadowRoot = null;
  let notificationElement = null;

  // Focus mode state and toolbar
  let focusModeEnabled = false;
  let toolbarHost = null;
  let toolbarShadow = null;
  let focusModeStyleElement = null;

  // Returns CSS styles for the notification (moved from content.css)
  function getNotificationStyles() {
    return `
      .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        left: auto;
        bottom: auto;
        padding: 14px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        z-index: 2147483647;
        opacity: 0;
        transform: translateY(-20px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        min-width: 180px;
        max-width: 300px;
        box-sizing: border-box;
        margin: 0;
        border: none;
        text-align: left;
        pointer-events: auto;
        display: block;
        visibility: visible;
      }

      .notification.show {
        opacity: 1;
        transform: translateY(0);
      }

      .notification.correct {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
      }

      .notification.incorrect {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: white;
      }

      .notification-title {
        font-weight: bold;
        margin-bottom: 4px;
        font-size: 14px;
        color: inherit;
      }

      .notification-body {
        font-size: 12px;
        opacity: 0.9;
        color: inherit;
      }

      @media (prefers-reduced-motion: reduce) {
        .notification,
        .notification *,
        .notification *::before,
        .notification *::after {
          animation-duration: 0.01ms;
          animation-iteration-count: 1;
          transition-duration: 0.01ms;
        }
      }
    `;
  }

  // Returns CSS styles for focus mode (injected into page, not Shadow DOM)
  function getFocusModeStyles() {
    return `
      /* Focus Mode - Hide distracting elements */
      body.uk-test-focus-mode header.elementor-location-header,
      body.uk-test-focus-mode footer.elementor-location-footer,
      body.uk-test-focus-mode [data-id="6d15d5e"],
      body.uk-test-focus-mode iframe[title*="Advertisement"],
      body.uk-test-focus-mode .ai-viewport-3,
      body.uk-test-focus-mode .elementor-widget-sidebar,
      body.uk-test-focus-mode aside {
        display: none !important;
      }

      /* Expand quiz area to full width */
      body.uk-test-focus-mode .elementor-location-single,
      body.uk-test-focus-mode [data-id="5ef2d2e"] {
        max-width: 900px !important;
        margin: 0 auto !important;
        width: 100% !important;
      }

      /* Ensure main content takes full width */
      body.uk-test-focus-mode .elementor-section-wrap > .elementor-section {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }
    `;
  }

  // Returns CSS styles for the focus mode toolbar (inside Shadow DOM)
  function getToolbarStyles() {
    return `
      .toolbar {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        gap: 8px;
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .toolbar-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 14px;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      .toolbar-btn:focus {
        outline: 2px solid #3b82f6;
        outline-offset: 2px;
      }

      .toolbar-btn:active {
        transform: scale(0.97);
      }

      .focus-btn {
        background: rgba(59, 130, 246, 0.9);
        color: white;
      }

      .focus-btn:hover {
        background: rgba(37, 99, 235, 0.95);
      }

      .focus-btn.active {
        background: rgba(16, 185, 129, 0.9);
      }

      .focus-btn.active:hover {
        background: rgba(5, 150, 105, 0.95);
      }

      .exams-btn {
        background: rgba(107, 114, 128, 0.9);
        color: white;
      }

      .exams-btn:hover {
        background: rgba(75, 85, 99, 0.95);
      }

      .btn-icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      @media (prefers-reduced-motion: reduce) {
        .toolbar-btn {
          transition: none;
        }
      }

      @media (max-width: 480px) {
        .toolbar {
          bottom: 10px;
          right: 10px;
          flex-direction: column;
        }

        .toolbar-btn {
          padding: 8px 12px;
          font-size: 12px;
        }
      }
    `;
  }

  // Inject focus mode styles into the page
  function injectFocusModeStyles() {
    if (focusModeStyleElement) return;

    focusModeStyleElement = document.createElement('style');
    focusModeStyleElement.id = 'uk-test-tracker-focus-mode-styles';
    focusModeStyleElement.textContent = getFocusModeStyles();
    document.head.appendChild(focusModeStyleElement);
  }

  // SVG icons for toolbar buttons
  const ICONS = {
    eyeOpen: `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    eyeClosed: `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
    arrowRight: `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`
  };

  // Create focus mode toolbar with Shadow DOM
  function createFocusModeToolbar() {
    if (toolbarHost && document.body.contains(toolbarHost)) {
      return;
    }

    // Inject focus mode styles into the page
    injectFocusModeStyles();

    // Create host element
    toolbarHost = document.createElement('div');
    toolbarHost.id = 'uk-test-tracker-toolbar';

    // Attach shadow DOM
    toolbarShadow = toolbarHost.attachShadow({ mode: 'open' });

    // Inject styles
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(getToolbarStyles());
    toolbarShadow.adoptedStyleSheets = [styleSheet];

    // Create toolbar container
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Quiz tools');

    // Focus mode toggle button
    const focusBtn = document.createElement('button');
    focusBtn.className = 'toolbar-btn focus-btn';
    focusBtn.setAttribute('aria-pressed', 'false');
    focusBtn.setAttribute('title', 'Toggle Focus Mode - hide distractions');
    focusBtn.innerHTML = `${ICONS.eyeOpen}<span>Focus</span>`;
    focusBtn.addEventListener('click', () => toggleFocusMode());

    // Exams navigation button
    const examsBtn = document.createElement('button');
    examsBtn.className = 'toolbar-btn exams-btn';
    examsBtn.setAttribute('title', 'Go to Exams page');
    examsBtn.innerHTML = `<span>Exams</span>${ICONS.arrowRight}`;
    examsBtn.addEventListener('click', navigateToExams);

    toolbar.appendChild(focusBtn);
    toolbar.appendChild(examsBtn);
    toolbarShadow.appendChild(toolbar);

    document.body.appendChild(toolbarHost);

    // Load saved focus mode state
    loadFocusModeState();
  }

  // Toggle focus mode on/off
  function toggleFocusMode(enabled) {
    // If no argument, toggle current state
    if (typeof enabled !== 'boolean') {
      enabled = !focusModeEnabled;
    }

    focusModeEnabled = enabled;
    document.body.classList.toggle('uk-test-focus-mode', enabled);

    // Update button state
    if (toolbarShadow) {
      const focusBtn = toolbarShadow.querySelector('.focus-btn');
      if (focusBtn) {
        focusBtn.classList.toggle('active', enabled);
        focusBtn.setAttribute('aria-pressed', enabled.toString());
        focusBtn.innerHTML = `${enabled ? ICONS.eyeClosed : ICONS.eyeOpen}<span>Focus</span>`;
        focusBtn.setAttribute('title', enabled ? 'Exit Focus Mode' : 'Toggle Focus Mode - hide distractions');
      }
    }

    // Persist preference
    saveFocusModeState(enabled);

    console.log(`[UK Test Tracker] Focus mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Save focus mode state to storage
  function saveFocusModeState(enabled) {
    if (!isExtensionContextValid()) return;

    chrome.storage.local.set({ focusModeEnabled: enabled }, () => {
      if (chrome.runtime.lastError) {
        console.debug('[UK Test Tracker] Could not save focus mode state:', chrome.runtime.lastError.message);
      }
    });
  }

  // Load focus mode state from storage
  function loadFocusModeState() {
    if (!isExtensionContextValid()) return;

    chrome.storage.local.get(['focusModeEnabled'], (result) => {
      if (chrome.runtime.lastError) {
        console.debug('[UK Test Tracker] Could not load focus mode state:', chrome.runtime.lastError.message);
        return;
      }

      if (result.focusModeEnabled === true) {
        toggleFocusMode(true);
      }
    });
  }

  // Navigate to exams page
  function navigateToExams() {
    window.location.href = 'https://lifeintheuktestweb.co.uk/exams/';
  }

  // Creates or returns the Shadow DOM container for notifications
  function getNotificationContainer() {
    if (shadowHost && document.body.contains(shadowHost)) {
      return { host: shadowHost, root: shadowRoot, notification: notificationElement };
    }

    // Create host element
    shadowHost = document.createElement('div');
    shadowHost.id = 'uk-test-tracker-notification';

    // Attach shadow DOM (closed mode would hide internals, open is fine for debugging)
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    // Inject styles using adoptedStyleSheets API
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(getNotificationStyles());
    shadowRoot.adoptedStyleSheets = [styleSheet];

    // Create notification element inside shadow DOM
    notificationElement = document.createElement('div');
    notificationElement.className = 'notification';
    notificationElement.setAttribute('role', 'status');
    notificationElement.setAttribute('aria-live', 'polite');
    notificationElement.setAttribute('aria-atomic', 'true');
    shadowRoot.appendChild(notificationElement);

    document.body.appendChild(shadowHost);

    return { host: shadowHost, root: shadowRoot, notification: notificationElement };
  }

  // Normalize URL to prevent duplicate sessions from trailing slashes/query params/fragments
  function normalizeUrl(urlString) {
    try {
      const url = new URL(urlString);
      return url.origin + url.pathname.replace(/\/$/, '');
    } catch (e) {
      // Fallback for invalid URLs
      return urlString.split('?')[0].split('#')[0].replace(/\/$/, '');
    }
  }

  // Normalize text to prevent duplicates from whitespace differences
  function normalizeText(text) {
    return (text || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  // Store captured data for current session
  let currentTestUrl = normalizeUrl(window.location.href);
  let testName = document.title.match(/Test\s*\d+/i)?.[0] || document.querySelector('h1')?.textContent?.trim() || 'Unknown Test';

  // Create a unique session ID based on URL and page load time (prevents multi-tab collision)
  const sessionId = `${currentTestUrl}_${Date.now()}`;
  let sessionStartTime = new Date().toISOString();

  // AbortController for cleanup of event listeners
  const abortController = new AbortController();

  // Check if extension context is still valid (handles extension reload/update)
  function isExtensionContextValid() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  // Wrapper for storage operations with context validation
  function safeStorageGet(keys) {
    return new Promise((resolve, reject) => {
      if (!isExtensionContextValid()) {
        cleanup();
        resolve(null);
        return;
      }
      try {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            if (chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
              cleanup();
              resolve(null);
            } else {
              reject(new Error(chrome.runtime.lastError.message));
            }
            return;
          }
          resolve(result);
        });
      } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
          cleanup();
          resolve(null);
        } else {
          reject(error);
        }
      }
    });
  }

  function safeStorageSet(data) {
    return new Promise((resolve, reject) => {
      if (!isExtensionContextValid()) {
        cleanup();
        resolve(false);
        return;
      }
      try {
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            if (chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
              cleanup();
              resolve(false);
            } else {
              reject(new Error(chrome.runtime.lastError.message));
            }
            return;
          }
          resolve(true);
        });
      } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
          cleanup();
          resolve(false);
        } else {
          reject(error);
        }
      }
    });
  }

  // Reference to MutationObserver for cleanup
  let mutationObserver = null;

  // Track observer timeout for cleanup
  let observerTimeout = null;

  // Save queue to prevent race conditions in storage operations
  let saveQueue = Promise.resolve();

  // Unified debounce mechanism for save operations
  let pendingSave = null;
  let saveTimeout = null;
  const DEBOUNCE_DELAY = 300;

  // Store message listener reference for cleanup
  let messageListener = null;

  // PERF: Session index maps for O(1) lookups (replaces O(n) findIndex)
  let sessionIndexById = new Map();     // sessionId → array index
  let sessionIndexByUrl = new Map();    // normalizedUrl → {index, startTime}

  function rebuildSessionIndex(sessions) {
    sessionIndexById.clear();
    sessionIndexByUrl.clear();
    sessions.forEach((session, index) => {
      sessionIndexById.set(session.id, index);
      const url = normalizeUrl(session.url);
      const existing = sessionIndexByUrl.get(url);
      // Keep most recent session for each URL
      if (!existing || new Date(session.startTime) > new Date(existing.startTime)) {
        sessionIndexByUrl.set(url, { index, startTime: session.startTime });
      }
    });
  }

  // PERF: Question index maps for O(1) deduplication
  let questionIndexMap = new Map();  // `${sessionId}_${qNum}_${textHash}` → index

  function fastTextHash(text) {
    const normalized = normalizeText(text);
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  function rebuildQuestionIndex(sessionId, questions) {
    // Clear entries for this session
    for (const key of questionIndexMap.keys()) {
      if (key.startsWith(sessionId + '_')) questionIndexMap.delete(key);
    }
    questions.forEach((q, index) => {
      const key = `${sessionId}_${q.questionNumber}_${fastTextHash(q.questionText)}`;
      questionIndexMap.set(key, index);
      // Also index by question number only for re-answer detection
      const numKey = `${sessionId}_num_${q.questionNumber}`;
      questionIndexMap.set(numKey, index);
    });
  }

  // PERF: Cache size limits to prevent unbounded memory growth
  const MAX_CACHED_SESSIONS = 50;
  const MAX_QUESTION_INDEX_ENTRIES = 5000;

  function trimCaches() {
    // Trim session index maps if they grow too large
    // Clear both maps together to prevent desync
    if (sessionIndexById.size > MAX_CACHED_SESSIONS * 2) {
      // Clear both maps and let them rebuild on next storage read
      // This is safer than partial eviction which could leave maps inconsistent
      sessionIndexById.clear();
      sessionIndexByUrl.clear();
    }

    // Trim question index map if it grows too large
    if (questionIndexMap.size > MAX_QUESTION_INDEX_ENTRIES) {
      // Clear and let it rebuild on next access
      questionIndexMap.clear();
    }
  }

  // Initialize
  console.log('[UK Test Tracker] Extension loaded');

  // Check storage quota before saving
  async function checkStorageQuota() {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, function(bytesInUse) {
        if (chrome.runtime.lastError) {
          console.error('[UK Test Tracker] Quota check error:', chrome.runtime.lastError);
          // Return ok: false when quota check errors to prevent potentially corrupted saves
          resolve({ ok: false, bytesInUse: -1, error: chrome.runtime.lastError.message });
          return;
        }

        if (bytesInUse >= STORAGE_QUOTA_LIMIT_BYTES) {
          console.error('[UK Test Tracker] Storage quota exceeded!');
          showQuotaWarning(true);
          resolve({ ok: false, bytesInUse });
          return;
        }

        if (bytesInUse >= STORAGE_QUOTA_WARNING_BYTES) {
          console.warn('[UK Test Tracker] Storage quota warning:', bytesInUse, 'bytes used');
          showQuotaWarning(false);
        }

        resolve({ ok: true, bytesInUse });
      });
    });
  }

  // Show storage quota warning to user using Shadow DOM for CSS isolation
  // ACCESSIBILITY: Added ARIA live region for screen reader announcements
  function showQuotaWarning(isCritical) {
    const { notification } = getNotificationContainer();

    // Update ARIA role for warnings (more assertive than regular notifications)
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'assertive');

    // Clear existing content
    notification.textContent = '';

    const title = document.createElement('div');
    title.className = 'notification-title';
    title.textContent = isCritical ? 'Storage Full!' : 'Storage Warning';
    notification.appendChild(title);

    const body = document.createElement('div');
    body.className = 'notification-body';
    body.textContent = isCritical ? 'Cannot save - please export and clear data' : 'Storage nearly full - consider exporting data';
    notification.appendChild(body);

    notification.className = 'notification incorrect show';

    setTimeout(() => {
      notification.classList.remove('show');
    }, 5000);
  }

  // Helper function to determine if user's answer is correct
  function determineCorrectness(userAnswers, correctAnswers, isMultiSelect, hasBadAnswer) {
    if (userAnswers.length > 0 && correctAnswers.length > 0) {
      if (isMultiSelect) {
        // For multi-select: must have all correct and no wrong
        const userSet = new Set(userAnswers);
        const correctSet = new Set(correctAnswers);
        return userSet.size === correctSet.size &&
               [...userSet].every(a => correctSet.has(a)) &&
               !hasBadAnswer;
      } else {
        return userAnswers[0] === correctAnswers[0];
      }
    } else if (userAnswers.length === 0 && correctAnswers.length > 0) {
      // User didn't answer but correct answers exist
      return false;
    }
    return null;
  }

  // Function to extract question data from a question container
  function extractQuestionData(container) {
    const questionText = container.querySelector('.question')?.textContent?.trim() ||
                         container.querySelector('.question_text')?.textContent?.trim() || '';

    const answers = [];
    let userAnswers = [];
    let correctAnswers = [];

    // Get all labels (answer options)
    const labels = container.querySelectorAll('label');

    // Better multi-select detection - only check inputs within answer labels
    const answerInputs = container.querySelectorAll('label input');
    const isMultiSelect = Array.from(answerInputs).some(input => input.type === 'checkbox');

    // First pass: collect correct answers and track user selections
    labels.forEach((label, index) => {
      const input = label.querySelector('input');
      if (!input) return; // Skip labels without inputs (not answer options)

      const answerText = label.textContent?.trim() || '';
      const isCorrectAnswer = label.classList.contains('good');
      const isIncorrectSelection = label.classList.contains('bad');
      const isChecked = input.checked;

      answers.push({
        text: answerText,
        index: index,
        isCorrectAnswer: isCorrectAnswer,
        wasSelected: isChecked || isIncorrectSelection
      });

      // Track correct answers (marked with 'good' class)
      if (isCorrectAnswer) {
        correctAnswers.push(answerText);
      }

      // Track user's selections based on checked state or bad class
      if (isMultiSelect) {
        // In multi-select, track all checked inputs
        if (isChecked) {
          userAnswers.push(answerText);
        }
      } else {
        // Single-select: if bad class, that's the wrong selection
        if (isIncorrectSelection) {
          userAnswers.push(answerText);
        }
      }
    });

    // For single-select: only assume correct if good class present AND user actually selected
    const hasBadAnswer = container.querySelector('label.bad');
    const hasGoodAnswer = container.querySelector('label.good');
    if (!isMultiSelect && !hasBadAnswer && hasGoodAnswer && correctAnswers.length > 0) {
      // Check if there's a checked input that corresponds to the good label
      const goodLabel = container.querySelector('label.good');
      const goodInput = goodLabel?.querySelector('input');
      if (goodInput && goodInput.checked) {
        userAnswers = [...correctAnswers];
      }
    }

    // Format answers as strings for storage
    const userAnswer = userAnswers.length > 1 ? userAnswers.join('; ') : userAnswers[0] || null;
    const correctAnswer = correctAnswers.length > 1 ? correctAnswers.join('; ') : correctAnswers[0] || null;

    // Determine if user was correct
    const isCorrect = determineCorrectness(userAnswers, correctAnswers, isMultiSelect, hasBadAnswer);

    // Get explanation if available
    const explanation = container.querySelector('.message')?.textContent?.trim() || '';

    return {
      questionText,
      answers,
      userAnswer,
      correctAnswer,
      isCorrect,
      isMultiSelect,
      explanation,
      timestamp: new Date().toISOString()
    };
  }

  // Function to capture a single question (after clicking Check)
  function captureSingleQuestion() {
    const activeContainer = document.querySelector('.container_question.active');

    if (!activeContainer) {
      return null;
    }

    // Check if this question has been answered
    const hasAnswer = activeContainer.querySelector('label.good') || activeContainer.querySelector('label.bad');

    if (!hasAnswer) {
      return null;
    }

    const questionData = extractQuestionData(activeContainer);

    // Question number detection: data attributes first, then pattern matching
    const questionNumAttr = activeContainer.dataset?.questionNumber || activeContainer.dataset?.question;
    if (questionNumAttr) {
      questionData.questionNumber = parseInt(questionNumAttr, 10);
    } else {
      // Look for "Question X of Y" pattern
      const progressEl = document.querySelector('.question-progress, .progress-text, [class*="progress"]');
      const searchText = progressEl?.textContent || '';
      const questionMatch = searchText.match(/Question\s+(\d+)\s+of\s+(\d+)/i);
      if (questionMatch) {
        questionData.questionNumber = parseInt(questionMatch[1], 10);
        questionData.totalQuestions = parseInt(questionMatch[2], 10);
      } else {
        // Fallback: count the container index
        const containers = document.querySelectorAll('.container_question');
        const activeIndex = Array.from(containers).indexOf(activeContainer);
        questionData.questionNumber = activeIndex + 1;
      }
    }

    return questionData;
  }

  // Function to save data to Chrome storage (queued to prevent race conditions)
  async function saveToStorage(data) {
    // Check extension context before any storage operations
    if (!isExtensionContextValid()) {
      cleanup();
      return;
    }

    // Check quota before saving
    const quotaCheck = await checkStorageQuota();
    if (!quotaCheck.ok) {
      console.error('[UK Test Tracker] Cannot save - quota exceeded');
      return;
    }

    // Chain save operation and recover on error
    saveQueue = saveQueue.then(async () => {
      const result = await safeStorageGet(['testSessions']);
      if (result === null) {
        // Context invalidated, cleanup already called
        return;
      }

      let sessions = result.testSessions || [];

      // Rebuild index maps after storage read to handle concurrent tab modifications
      if (sessions.length > 0) {
        rebuildSessionIndex(sessions);
      } else {
        sessionIndexById.clear();
        sessionIndexByUrl.clear();
      }

      // PERF: O(1) session lookup by ID first (replaces O(n) findIndex)
      let sessionIndex = sessionIndexById.get(sessionId) ?? -1;

      if (sessionIndex === -1) {
        // PERF: O(1) lookup by URL for backwards compatibility
        const urlEntry = sessionIndexByUrl.get(currentTestUrl);
        if (urlEntry && (Date.now() - new Date(urlEntry.startTime).getTime()) < SESSION_TIMEOUT_MS) {
          sessionIndex = urlEntry.index;
        }
      }

      if (sessionIndex === -1) {
        // Create new session with stats cache
        sessions.push({
          id: sessionId,
          testName: testName,
          url: currentTestUrl,
          startTime: sessionStartTime,
          questions: [],
          _stats: { total: 0, correct: 0, incorrect: 0 }
        });
        sessionIndex = sessions.length - 1;
        // Update index maps
        rebuildSessionIndex(sessions);
      }

      // Get the session
      let currentSession = sessions[sessionIndex];

      // PERF: Initialize stats cache if missing (for older sessions)
      if (!currentSession._stats) {
        currentSession._stats = { total: 0, correct: 0, incorrect: 0 };
        currentSession.questions.forEach(q => {
          currentSession._stats.total++;
          if (q.isCorrect === true) currentSession._stats.correct++;
          if (q.isCorrect === false) currentSession._stats.incorrect++;
        });
      }

      // PERF: O(1) question lookup by hash (replaces O(n) findIndex)
      const questionKey = `${currentSession.id}_${data.questionNumber}_${fastTextHash(data.questionText)}`;
      const numKey = `${currentSession.id}_num_${data.questionNumber}`;
      let existingIndex = questionIndexMap.get(questionKey) ?? -1;

      // Track old correctness for stats adjustment
      let oldIsCorrect = null;
      let isNewQuestion = false;

      if (existingIndex >= 0) {
        // Update existing question (matched by number AND text)
        oldIsCorrect = currentSession.questions[existingIndex].isCorrect;
        currentSession.questions[existingIndex] = data;
      } else {
        // PERF: O(1) check by question number only
        const byNumberIndex = questionIndexMap.get(numKey) ?? -1;
        if (byNumberIndex >= 0) {
          oldIsCorrect = currentSession.questions[byNumberIndex].isCorrect;
          currentSession.questions[byNumberIndex] = data;
          existingIndex = byNumberIndex;
        } else {
          currentSession.questions.push(data);
          isNewQuestion = true;
        }
      }

      // PERF: Incremental stats update (O(1) instead of O(n) filter)
      if (isNewQuestion) {
        currentSession._stats.total++;
      } else if (oldIsCorrect !== null) {
        // Adjust for replaced question
        if (oldIsCorrect === true) currentSession._stats.correct--;
        if (oldIsCorrect === false) currentSession._stats.incorrect--;
      }
      if (data.isCorrect === true) currentSession._stats.correct++;
      if (data.isCorrect === false) currentSession._stats.incorrect++;

      // Rebuild question index for this session
      rebuildQuestionIndex(currentSession.id, currentSession.questions);

      currentSession.lastUpdated = new Date().toISOString();

      // Update the session in the array
      sessions[sessionIndex] = currentSession;

      const saved = await safeStorageSet({ testSessions: sessions });
      if (!saved) {
        // Context invalidated, cleanup already called
        return;
      }

      // PERF: Use cached stats (O(1) instead of O(n) filter)
      const totalQuestions = currentSession._stats.total;
      const correctCount = currentSession._stats.correct;
      const incorrectCount = currentSession._stats.incorrect;

      showNotification(data.isCorrect, totalQuestions, correctCount, incorrectCount);

      // PERF: Periodically trim caches to prevent unbounded memory growth
      trimCaches();
    }).catch((error) => {
      // Reset saveQueue on error to allow subsequent saves
      console.error('[UK Test Tracker] Save queue error:', error);
      saveQueue = Promise.resolve();
    });
  }

  // Show visual notification using Shadow DOM for CSS isolation
  // ACCESSIBILITY: Added ARIA live region for screen reader announcements
  function showNotification(isCorrect, total, correct, incorrect) {
    const { notification } = getNotificationContainer();

    // Clear existing content
    notification.textContent = '';

    const title = document.createElement('div');
    title.className = 'notification-title';
    title.textContent = isCorrect ? '✓ Correct' : '✗ Incorrect';
    notification.appendChild(title);

    const body = document.createElement('div');
    body.className = 'notification-body';
    body.textContent = `Total: ${total} | ✓ ${correct} | ✗ ${incorrect}`;
    notification.appendChild(body);

    notification.className = `notification ${isCorrect ? 'correct' : 'incorrect'} show`;

    setTimeout(() => {
      notification.classList.remove('show');
    }, 2500);
  }

  // Debounced save function to consolidate rapid saves
  function debouncedSave(questionData) {
    // Store pending save data
    pendingSave = questionData;

    // Clear any existing timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(() => {
      if (pendingSave) {
        saveToStorage(pendingSave);
        pendingSave = null;
      }
      saveTimeout = null;
    }, DEBOUNCE_DELAY);
  }

  // Flush pending saves before page unload (stored in chrome.storage.session for recovery)
  const PENDING_SAVE_MAX_LIMIT = 50;

  function flushPendingSave() {
    if (!pendingSave) {
      return;
    }

    const data = pendingSave;
    pendingSave = null;

    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    // Store pending save in chrome.storage.session for recovery on next page load
    chrome.storage.session.get(['pendingSaves'], function(result) {
      if (chrome.runtime.lastError) {
        return; // Can't do anything more during unload
      }

      let pending = result.pendingSaves || [];

      if (pending.length >= PENDING_SAVE_MAX_LIMIT) {
        pending = pending.slice(-PENDING_SAVE_MAX_LIMIT + 1);
      }

      pending.push({
        sessionId,
        data,
        timestamp: Date.now()
      });

      chrome.storage.session.set({ pendingSaves: pending });
    });
  }

  // Listen for Check button clicks
  function setupCheckButtonListener() {
    document.addEventListener('click', function(e) {
      const checkButton = e.target.closest('button');

      if (checkButton && (checkButton.textContent.trim() === 'Check' ||
                          checkButton.classList.contains('check') ||
                          checkButton.id?.includes('check'))) {

        // Backup capture attempt (MutationObserver is primary)
        setTimeout(() => {
          const questionData = captureSingleQuestion();
          if (questionData && questionData.correctAnswer) {
            debouncedSave(questionData);
          }
        }, 500);
      }
    }, { signal: abortController.signal });
  }

  // MutationObserver to detect when answers are revealed
  function setupMutationObserver() {
    mutationObserver = new MutationObserver(function(mutations) {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          // Check if a label got 'good' or 'bad' class (answer revealed)
          if (target.tagName === 'LABEL' && (target.classList.contains('good') || target.classList.contains('bad'))) {
            // Track timeout for cleanup
            if (observerTimeout) {
              clearTimeout(observerTimeout);
            }

            observerTimeout = setTimeout(() => {
              const questionData = captureSingleQuestion();
              if (questionData && questionData.correctAnswer) {
                debouncedSave(questionData);
              }
              observerTimeout = null;
            }, DEBOUNCE_DELAY);

            break; // Only need to detect once per mutation batch
          }
        }
      }
    });

    // Observe narrower quiz area to reduce mutation processing overhead
    const quizArea = document.querySelector('.container_question')?.parentElement ||
                     document.querySelector('.main-content') ||
                     document.body;
    mutationObserver.observe(quizArea, {
      attributes: true,
      subtree: true,
      attributeFilter: ['class']
    });
  }

  // Cleanup function to prevent memory leaks
  function cleanup() {
    abortController.abort();

    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }

    // Clear observer timeout
    if (observerTimeout) {
      clearTimeout(observerTimeout);
      observerTimeout = null;
    }

    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }

    // Remove message listener
    if (messageListener) {
      chrome.runtime.onMessage.removeListener(messageListener);
      messageListener = null;
    }

    // Remove toolbar
    if (toolbarHost && toolbarHost.parentNode) {
      toolbarHost.parentNode.removeChild(toolbarHost);
      toolbarHost = null;
      toolbarShadow = null;
    }

    // Remove focus mode styles
    if (focusModeStyleElement && focusModeStyleElement.parentNode) {
      focusModeStyleElement.parentNode.removeChild(focusModeStyleElement);
      focusModeStyleElement = null;
    }

    // Remove focus mode class from body
    document.body.classList.remove('uk-test-focus-mode');
  }

  // Register cleanup on page unload with pending save flush
  window.addEventListener('beforeunload', function() {
    flushPendingSave();
    cleanup();
  }, { signal: abortController.signal });
  window.addEventListener('pagehide', function() {
    flushPendingSave();
    cleanup();
  }, { signal: abortController.signal });

  // Check for pending saves from previous page load
  function processPendingSaves() {
    if (!isExtensionContextValid()) {
      return;
    }

    chrome.storage.session.get(['pendingSaves'], function(result) {
      if (chrome.runtime.lastError) {
        console.debug('[UK Test Tracker] Could not read pending saves:', chrome.runtime.lastError.message);
        return;
      }

      const pending = result.pendingSaves || [];
      if (pending.length > 0) {
        chrome.storage.session.remove('pendingSaves');
        processPendingItems(pending);
      }
    });
  }

  // Process pending items sequentially with deduplication
  function processPendingItems(items) {
    if (items.length === 0) {
      return;
    }

    // Deduplicate by sessionId + questionNumber + timestamp (keep latest)
    const seen = new Map();
    for (const item of items) {
      if (item.data && item.data.questionNumber !== undefined) {
        const key = `${item.sessionId}_${item.data.questionNumber}`;
        const existing = seen.get(key);
        if (!existing || item.timestamp > existing.timestamp) {
          seen.set(key, item);
        }
      }
    }

    // Process deduplicated items
    const uniqueItems = Array.from(seen.values());
    console.log(`[UK Test Tracker] Processing ${uniqueItems.length} pending saves`);

    // Chain saves sequentially to avoid race conditions
    let chain = Promise.resolve();
    for (const item of uniqueItems) {
      chain = chain.then(() => {
        if (item.data) {
          return saveToStorage(item.data);
        }
      }).catch(err => {
        console.error('[UK Test Tracker] Error processing pending save:', err);
      });
    }
  }

  // Initialize listeners
  setupCheckButtonListener();
  setupMutationObserver();
  processPendingSaves();

  // Initialize focus mode toolbar
  createFocusModeToolbar();

  // Message listener with context and sender validation
  messageListener = function(request, sender, sendResponse) {
    // Check extension context before responding
    if (!isExtensionContextValid()) {
      cleanup();
      return false;
    }

    // Only respond to messages from our own extension
    if (!sender || sender.id !== chrome.runtime.id) {
      return false;
    }

    if (request.action === 'captureAll') {
      // Use async/await with safe wrapper
      (async () => {
        const result = await safeStorageGet(['testSessions']);
        if (result === null) {
          sendResponse({ sessions: [], error: 'Extension context invalidated' });
          return;
        }
        const sessions = result.testSessions || [];
        sendResponse({ sessions: sessions });
      })();
      return true; // Keep channel open for async response
    } else if (request.action === 'getStatus') {
      sendResponse({ active: true, testName: testName });
      return false; // Synchronous response
    }
  };
  chrome.runtime.onMessage.addListener(messageListener);
})();
