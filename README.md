# Life in UK Test Tracker

A Chrome extension that tracks your quiz answers on the Life in the UK Test practice website (lifeintheuktestweb.co.uk) for later analysis with Claude or other AI assistants.

## Chrome Web Store Description

**Short description (132 chars):**
> Track your Life in the UK test answers automatically. Review mistakes, export results, and study smarter with detailed session data.

**Long description:**

Preparing for the Life in the UK citizenship test? This extension automatically captures every answer you submit on lifeintheuktestweb.co.uk—so you can focus on learning, not note-taking.

✓ Automatic answer tracking – Records your answers, correct answers, and results as you practice
✓ Session management – Questions organized by test session for easy review
✓ Mistake analysis – Quickly identify which questions you got wrong and why
✓ Export your data – Download results as JSON or CSV (Excel-compatible) for offline study
✓ Privacy-first – All data stays in your browser; nothing sent to external servers

Perfect for:
- Citizenship and ILR test candidates
- Anyone who wants to track their practice progress
- Learners who prefer reviewing mistakes over retaking entire tests

Simply install, start practicing on lifeintheuktestweb.co.uk, and let the extension handle the rest. Your practice history is always one click away in the extension popup.

---

## Features

- **Automatic tracking**: Automatically captures your answers when you click "Check" on each question
- **Visual feedback**: Shows a notification when a question is tracked (green for correct, red for incorrect)
- **Session management**: Groups questions by test session
- **Export options**:
  - JSON format (detailed data)
  - CSV format (perfect for sharing with Claude for analysis)
- **Statistics**: View your overall correct/incorrect ratio

## Installation

1. **Download the extension files** to a folder on your computer

2. **Open Chrome** and go to `chrome://extensions/`

3. **Enable Developer Mode** by clicking the toggle in the top-right corner

4. **Click "Load unpacked"** and select the folder containing the extension files

5. **Pin the extension** by clicking the puzzle piece icon in the toolbar and clicking the pin next to "Life in UK Test Tracker"

## Usage

1. **Navigate to a test** on https://lifeintheuktestweb.co.uk (e.g., Test 1, Test 2, etc.)

2. **Answer questions normally** - select your answer and click "Check"

3. **The extension automatically tracks** each question with:
   - The question text
   - Your answer
   - The correct answer
   - Whether you were correct or incorrect
   - Timestamp

4. **Click the extension icon** to view your tracked data and statistics

5. **Export your data** when ready:
   - Click "Export Data (JSON)" for detailed data
   - Click "Export for Claude (CSV)" for a format optimized for AI analysis

## Exporting for Claude Analysis

When you're ready to analyze your results with Claude:

1. Click the extension icon
2. Click "Export for Claude (CSV)"
3. Upload the CSV file to Claude
4. Ask Claude to analyze your results, for example:
   - "What topics am I struggling with the most?"
   - "What are the common themes in questions I got wrong?"
   - "Can you help me study the topics I got wrong?"

## Data Structure

### JSON Export
```json
{
  "testName": "Life in the UK Test 1",
  "url": "https://lifeintheuktestweb.co.uk/test-1/",
  "startTime": "2024-01-15T10:30:00.000Z",
  "questions": [
    {
      "questionNumber": 1,
      "questionText": "Who were the first people to arrive in Britain...",
      "userAnswer": "Farmers",
      "correctAnswer": "Hunter-gatherers",
      "isCorrect": false,
      "timestamp": "2024-01-15T10:30:45.000Z"
    }
  ]
}
```

### CSV Export
| Test Name | Question Number | Question | Your Answer | Correct Answer | Result | Date |
|-----------|-----------------|----------|-------------|----------------|--------|------|
| Test 1 | 1 | Who were the first... | Farmers | Hunter-gatherers | Incorrect | 1/15/2024 |

## Privacy

- All data is stored **locally** in your browser using Chrome's storage API
- **No data is sent** to any external servers
- You have full control over your data and can clear it at any time

## Troubleshooting

**Extension not tracking questions?**
- Make sure you're on the correct website (lifeintheuktestweb.co.uk)
- Refresh the page after installing the extension
- Check that the extension is enabled in chrome://extensions/

**Data not appearing?**
- Click "Check" on a question to trigger tracking
- Wait for the answer feedback to appear before moving to the next question

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main tracking script that runs on quiz pages
- `content.css` - Styles for the notification
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality
- `icon*.png` - Extension icons
