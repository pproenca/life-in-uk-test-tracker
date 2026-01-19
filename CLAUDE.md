# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome Extension (Manifest V3) that tracks quiz answers on the Life in the UK Test practice website (lifeintheuktestweb.co.uk). It captures user answers, correct answers, and results for later export and analysis.

## Architecture

**Content Script (`content.js`)**: Injected into lifeintheuktestweb.co.uk pages. Captures quiz data via:
- Click event listener on "Check" buttons
- MutationObserver watching for `good`/`bad` class additions on answer labels
- Extracts question text, user answer, correct answer, and timestamps
- Saves to `chrome.storage.local` with session management (2-hour session window)

**Popup (`popup.html` + `shared.js`)**: Extension UI showing:
- Statistics (total/correct/incorrect counts)
- Session list and question review tabs
- Export functions (JSON and CSV with UTF-8 BOM for Excel)
- Data clearing functionality

**Side Panel (`sidepanel.html` + `shared.js`)**: Same functionality as popup but in Chrome's side panel.

**Shared Module (`shared.js`)**: Extracted shared code for popup and sidepanel UIs.

**Export Worker (`csv-export-worker.js`)**: Web Worker for large CSV exports to prevent UI freezing.

**Styles**: Notification toast styles are embedded in `content.js` using Shadow DOM for CSS isolation.

## Key Implementation Details

- Sessions are identified by URL + 2-hour time window
- Questions are deduplicated by question number OR question text
- Multi-select questions are handled differently from single-choice
- Answer correctness is determined by presence of `label.good` (correct) and `label.bad` (incorrect selection) classes
- Debounced saves prevent duplicate storage writes

## Testing

No automated test framework. Manual testing requires:
1. Load extension unpacked in Chrome (`chrome://extensions/`)
2. Navigate to https://lifeintheuktestweb.co.uk/test-1/ (or similar)
3. Answer questions and verify tracking via popup and console logs (`[UK Test Tracker]` prefix)

## Chrome Extension APIs Used

- `chrome.storage.local` - Persistent data storage
- `chrome.storage.session` - Session-scoped storage for pending saves recovery
- `chrome.storage.onChanged` - Real-time storage change notifications
- `chrome.runtime.onMessage` - Communication between content script and popup
- `chrome.sidePanel` - Side panel API for alternative UI
- Content scripts auto-inject via `manifest.json` matches
