// Storage Abstraction Layer
// This module provides a unified storage interface that can be extended
// to support IndexedDB when chrome.storage.local approaches its 10MB limit.
//
// MIGRATION PATH:
// 1. Currently uses chrome.storage.local (10MB limit)
// 2. When data grows large, can migrate to IndexedDB (no practical limit)
// 3. The abstraction allows seamless transition without changing consumer code

(function(window) {
  'use strict';

  // Storage backends
  const BACKEND_CHROME_STORAGE = 'chrome-storage';
  const BACKEND_INDEXED_DB = 'indexeddb';

  // Configuration
  const DB_NAME = 'uk-test-tracker';
  const DB_VERSION = 1;
  const STORE_NAME = 'sessions';

  // Current backend (default to chrome.storage.local)
  let currentBackend = BACKEND_CHROME_STORAGE;
  let db = null;

  // Threshold for suggesting IndexedDB migration (7MB)
  const MIGRATION_THRESHOLD_BYTES = 7 * 1024 * 1024;

  /**
   * Initialize IndexedDB connection
   * @returns {Promise<IDBDatabase>}
   */
  function initIndexedDB() {
    return new Promise((resolve, reject) => {
      if (db) {
        resolve(db);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        // Create sessions store if it doesn't exist
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('url', 'url', { unique: false });
          store.createIndex('startTime', 'startTime', { unique: false });
        }
      };
    });
  }

  /**
   * Get all sessions from storage
   * @returns {Promise<Array>}
   */
  async function getSessions() {
    if (currentBackend === BACKEND_INDEXED_DB) {
      return getSessionsFromIndexedDB();
    }
    return getSessionsFromChromeStorage();
  }

  /**
   * Get sessions from chrome.storage.local
   * @returns {Promise<Array>}
   */
  function getSessionsFromChromeStorage() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['testSessions'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result.testSessions || []);
      });
    });
  }

  /**
   * Get sessions from IndexedDB
   * @returns {Promise<Array>}
   */
  async function getSessionsFromIndexedDB() {
    const database = await initIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error('Failed to read from IndexedDB'));
      };
    });
  }

  /**
   * Save all sessions to storage
   * @param {Array} sessions
   * @returns {Promise<void>}
   */
  async function saveSessions(sessions) {
    if (currentBackend === BACKEND_INDEXED_DB) {
      return saveSessionsToIndexedDB(sessions);
    }
    return saveSessionsToChromeStorage(sessions);
  }

  /**
   * Save sessions to chrome.storage.local
   * @param {Array} sessions
   * @returns {Promise<void>}
   */
  function saveSessionsToChromeStorage(sessions) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ testSessions: sessions }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Save sessions to IndexedDB
   * @param {Array} sessions
   * @returns {Promise<void>}
   */
  async function saveSessionsToIndexedDB(sessions) {
    const database = await initIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      // Clear existing data and add all sessions
      store.clear();

      for (const session of sessions) {
        store.put(session);
      }

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error('Failed to write to IndexedDB'));
      };
    });
  }

  /**
   * Check if migration to IndexedDB is recommended
   * @returns {Promise<{shouldMigrate: boolean, bytesUsed: number, percentUsed: number}>}
   */
  function checkMigrationNeeded() {
    return new Promise((resolve) => {
      chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
        if (chrome.runtime.lastError) {
          resolve({ shouldMigrate: false, bytesUsed: 0, percentUsed: 0 });
          return;
        }

        const limitBytes = 10 * 1024 * 1024; // 10MB
        const percentUsed = Math.round((bytesInUse / limitBytes) * 100);

        resolve({
          shouldMigrate: bytesInUse >= MIGRATION_THRESHOLD_BYTES,
          bytesUsed: bytesInUse,
          percentUsed,
          currentBackend
        });
      });
    });
  }

  /**
   * Migrate data from chrome.storage.local to IndexedDB
   * @returns {Promise<{success: boolean, sessionsMigrated: number}>}
   */
  async function migrateToIndexedDB() {
    try {
      // Get data from chrome.storage.local
      const sessions = await getSessionsFromChromeStorage();

      if (sessions.length === 0) {
        return { success: true, sessionsMigrated: 0 };
      }

      // Initialize IndexedDB and save data
      await initIndexedDB();
      await saveSessionsToIndexedDB(sessions);

      // Switch to IndexedDB backend
      currentBackend = BACKEND_INDEXED_DB;

      // Clear chrome.storage.local (optional - can keep as backup)
      // await clearChromeStorage();

      return { success: true, sessionsMigrated: sessions.length };
    } catch (error) {
      console.error('[UK Test Tracker] Migration failed:', error);
      return { success: false, sessionsMigrated: 0, error: error.message };
    }
  }

  /**
   * Get the current storage backend
   * @returns {string}
   */
  function getCurrentBackend() {
    return currentBackend;
  }

  /**
   * Switch to a specific backend (for testing or manual override)
   * @param {string} backend
   */
  function setBackend(backend) {
    if (backend === BACKEND_CHROME_STORAGE || backend === BACKEND_INDEXED_DB) {
      currentBackend = backend;
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<{backend: string, bytesUsed: number, sessionCount: number}>}
   */
  async function getStorageStats() {
    const sessions = await getSessions();

    if (currentBackend === BACKEND_CHROME_STORAGE) {
      return new Promise((resolve) => {
        chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
          resolve({
            backend: currentBackend,
            bytesUsed: chrome.runtime.lastError ? -1 : bytesInUse,
            sessionCount: sessions.length,
            questionCount: sessions.reduce((sum, s) => sum + (s.questions?.length || 0), 0)
          });
        });
      });
    }

    // IndexedDB doesn't have a direct bytes API, estimate from data
    const dataString = JSON.stringify(sessions);
    return {
      backend: currentBackend,
      bytesUsed: new Blob([dataString]).size,
      sessionCount: sessions.length,
      questionCount: sessions.reduce((sum, s) => sum + (s.questions?.length || 0), 0)
    };
  }

  // Export the storage abstraction API
  window.StorageAbstraction = {
    // Core operations
    getSessions,
    saveSessions,

    // Migration utilities
    checkMigrationNeeded,
    migrateToIndexedDB,

    // Backend management
    getCurrentBackend,
    setBackend,
    getStorageStats,

    // Constants
    BACKEND_CHROME_STORAGE,
    BACKEND_INDEXED_DB
  };

})(window);
