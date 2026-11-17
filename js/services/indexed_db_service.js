/**
 * IndexedDBService - High-Performance Binary Storage Service
 * Provides persistent local caching for Float32Array datasets (VSLB format)
 * with automated Versioning & Stale-While-Revalidate Hot-Reloading.
 */

(function () {
  'use strict';

  const DB_NAME = 'SignSpeakDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'datasets';

  class IndexedDBService {
    /**
     * Check if IndexedDB is supported in the current environment
     * @returns {boolean}
     */
    static isAvailable() {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    }

    /**
     * Open or upgrade the database
     * @returns {Promise<IDBDatabase>}
     */
    static _openDB() {
      if (!this.isAvailable()) {
        return Promise.reject(new Error('[IndexedDBService] IndexedDB not supported'));
      }

      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };

        request.onsuccess = (event) => {
          resolve(event.target.result);
        };

        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    }

    /**
     * Get the full record { key, buffer, hash, version, updatedAt }
     * @param {string} key
     * @returns {Promise<Object|null>}
     */
    static async getRecord(key) {
      if (!this.isAvailable()) return null;

      try {
        const db = await this._openDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([STORE_NAME], 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.get(key);

          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
      } catch (err) {
        console.warn(`[IndexedDBService] Failed to read record "${key}":`, err);
        return null;
      }
    }

    /**
     * Get only the binary ArrayBuffer by key
     * @param {string} key
     * @returns {Promise<ArrayBuffer|null>}
     */
    static async get(key) {
      const record = await this.getRecord(key);
      return record ? record.buffer : null;
    }

    /**
     * Store a binary dataset ArrayBuffer by key
     * @param {string} key
     * @param {ArrayBuffer} buffer
     * @param {Object} extraMeta
     * @returns {Promise<boolean>}
     */
    static async set(key, buffer, extraMeta = {}) {
      if (!this.isAvailable() || !buffer) return false;

      try {
        const db = await this._openDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([STORE_NAME], 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const record = {
            key,
            buffer,
            byteLength: buffer.byteLength,
            updatedAt: Date.now(),
            ...extraMeta
          };

          const request = store.put(record);

          request.onsuccess = () => resolve(true);
          request.onerror = () => reject(request.error);
        });
      } catch (err) {
        console.warn(`[IndexedDBService] Failed to write "${key}":`, err);
        return false;
      }
    }

    /**
     * Automated Versioning with Stale-While-Revalidate:
     * 1. Returns cached ArrayBuffer immediately for 0ms boot.
     * 2. Checks versionUrl in background. If remote hash is newer,
     *    fetches new binary, caches it, and triggers onHotReload callback.
     *
     * @param {string} key
     * @param {string} binUrl
     * @param {string} [versionUrl]
     * @param {Function} [onHotReload] (freshBuffer, versionMeta) => void
     * @returns {Promise<{ buffer: ArrayBuffer, fromCache: boolean, version: string }>}
     */
    static async getOrFetch(key, binUrl, versionUrl = null, onHotReload = null) {
      // 1. Try cache first
      const cachedRecord = await this.getRecord(key);
      if (cachedRecord && cachedRecord.buffer && cachedRecord.buffer.byteLength > 0) {
        console.log(`[IndexedDBService] ⚡ Cache HIT for "${key}" (v${cachedRecord.version || '1.0.0'}, 0ms boot)`);

        // Check remote version manifest asynchronously in background
        if (versionUrl) {
          this._checkRemoteVersion(key, binUrl, versionUrl, cachedRecord.hash, onHotReload);
        }

        return {
          buffer: cachedRecord.buffer,
          fromCache: true,
          version: cachedRecord.version || '1.0.0'
        };
      }

      // 2. Cache miss: Fetch remote version & binary
      console.log(`[IndexedDBService] Cache MISS for "${key}". Fetching fresh dataset...`);

      let versionMeta = { version: '1.0.0', hash: '' };
      if (versionUrl) {
        try {
          const vRes = await fetch(`${versionUrl}?t=${Date.now()}`);
          if (vRes.ok) {
            versionMeta = await vRes.json();
          }
        } catch (_vErr) {}
      }

      const res = await fetch(binUrl);
      if (!res.ok) {
        throw new Error(`[IndexedDBService] Network error ${res.status} fetching ${binUrl}`);
      }

      const freshBuffer = await res.arrayBuffer();

      // Save to IndexedDB with version metadata
      this.set(key, freshBuffer, {
        hash: versionMeta.hash || '',
        version: versionMeta.version || '1.0.0'
      }).catch((err) => {
        console.warn(`[IndexedDBService] Cache save error:`, err);
      });

      return {
        buffer: freshBuffer,
        fromCache: false,
        version: versionMeta.version || '1.0.0'
      };
    }

    /**
     * Check remote version in background and trigger hot-reload if changed
     */
    static async _checkRemoteVersion(key, binUrl, versionUrl, cachedHash, onHotReload) {
      try {
        const vRes = await fetch(`${versionUrl}?t=${Date.now()}`);
        if (!vRes.ok) return;

        const remoteMeta = await vRes.json();
        if (remoteMeta.hash && remoteMeta.hash !== cachedHash) {
          console.log(`[IndexedDBService] 🚀 New dataset version detected! v${remoteMeta.version} (current: ${cachedHash.substring(0, 8)}... vs remote: ${remoteMeta.hash.substring(0, 8)}...)`);

          // Fetch fresh binary with cache-buster
          const binRes = await fetch(`${binUrl}?h=${remoteMeta.hash}`);
          if (!binRes.ok) return;

          const freshBuffer = await binRes.arrayBuffer();

          // Save new version to IndexedDB
          await this.set(key, freshBuffer, {
            hash: remoteMeta.hash,
            version: remoteMeta.version,
            totalWords: remoteMeta.totalWords
          });

          console.log(`[IndexedDBService] ✅ Updated IndexedDB cache to v${remoteMeta.version}`);

          // Trigger hot-reload in RAM
          if (typeof onHotReload === 'function') {
            onHotReload(freshBuffer, remoteMeta);
          }
        }
      } catch (err) {
        console.warn(`[IndexedDBService] Background version check warning:`, err);
      }
    }

    /**
     * Delete a key from the database
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    static async delete(key) {
      if (!this.isAvailable()) return false;

      try {
        const db = await this._openDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([STORE_NAME], 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.delete(key);

          request.onsuccess = () => resolve(true);
          request.onerror = () => reject(request.error);
        });
      } catch (err) {
        console.warn(`[IndexedDBService] Failed to delete "${key}":`, err);
        return false;
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = IndexedDBService;
  } else {
    window.IndexedDBService = IndexedDBService;
  }
})();
