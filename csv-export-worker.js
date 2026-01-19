// CSV Export Web Worker
// Handles CSV generation off the main thread for large datasets
// to prevent UI freezing during export operations.

'use strict';

// SYNC: This function is duplicated in shared.js
// Workers cannot import from main thread - keep both versions in sync
/**
 * Format a timestamp to a locale string
 * @param {string} timestamp
 * @returns {{date: string, time: string, datetime: string}}
 */
function formatDate(timestamp) {
  const fallback = 'Unknown';
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

// SYNC: This function is duplicated in shared.js
// Workers cannot import from main thread - keep both versions in sync
/**
 * Convert sessions array to CSV string
 * @param {Array} sessions
 * @returns {string}
 */
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

  // Convert to CSV string with proper escaping including newlines
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

/**
 * Convert sessions array to JSON string
 * @param {Array} sessions
 * @returns {string}
 */
function convertToJSON(sessions) {
  return JSON.stringify(sessions, null, 2);
}

// Listen for messages from the main thread
self.onmessage = function(event) {
  const { type, sessions, requestId } = event.data;

  try {
    let result;
    let filename;
    let mimeType;

    switch (type) {
      case 'csv':
        result = convertToCSV(sessions);
        filename = 'uk-test-tracker-data.csv';
        mimeType = 'text/csv;charset=utf-8';
        break;

      case 'json':
        result = convertToJSON(sessions);
        filename = 'uk-test-tracker-data.json';
        mimeType = 'application/json';
        break;

      default:
        throw new Error('Unknown export type: ' + type);
    }

    // Send the result back to the main thread
    self.postMessage({
      success: true,
      requestId,
      data: result,
      filename,
      mimeType,
      stats: {
        sessionCount: sessions.length,
        questionCount: sessions.reduce((sum, s) => sum + (s.questions?.length || 0), 0),
        byteSize: new Blob([result]).size
      }
    });

  } catch (error) {
    self.postMessage({
      success: false,
      requestId,
      error: error.message
    });
  }
};
