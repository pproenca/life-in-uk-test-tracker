// Life in UK Test Tracker - Service Worker

// Detect first-time installation for onboarding
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set flag to show onboarding modal on first popup/sidepanel open
    chrome.storage.local.set({ onboardingComplete: false });
  }
});

// Enable side panel to open when clicking the extension icon
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => {
    // FIX #21: Log but don't fail if side panel behavior can't be set
    console.warn('[UK Test Tracker] Could not set panel behavior:', error);
  });

// Enable side panel only on the target site
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;

  try {
    const url = new URL(tab.url);
    const enabled = url.origin === 'https://lifeintheuktestweb.co.uk';
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled
    });
  } catch (e) {
    // FIX #21: Better error handling - distinguish URL parsing errors from API errors
    if (e instanceof TypeError || e.message?.includes('Invalid URL')) {
      // Invalid URL is expected for special pages (chrome://, about:, etc.)
      // Silently disable side panel for these
      try {
        await chrome.sidePanel.setOptions({
          tabId,
          enabled: false
        });
      } catch (innerError) {
        // Tab may no longer exist, ignore
        console.debug('[UK Test Tracker] Could not disable side panel:', innerError);
      }
    } else {
      // Log unexpected errors
      console.error('[UK Test Tracker] Side panel error:', e);
    }
  }
});
