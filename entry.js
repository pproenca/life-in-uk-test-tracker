// Life in UK Test Tracker - Unified Entry Point
// Replaces popup.js and sidepanel.js with shared initialization logic

document.addEventListener('DOMContentLoaded', function() {
  if (window.UKTestTracker) {
    window.UKTestTracker.init();
  }
});

// Cleanup when popup/sidepanel is closed
window.addEventListener('unload', function() {
  if (window.UKTestTracker) {
    window.UKTestTracker.cleanup();
  }
});
