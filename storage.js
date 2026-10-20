/* ZEREOS AI Shorts storage layer
 * IndexedDB first; cloud sync can be added behind the same adapter contract later.
 */
(() => {
  'use strict';
  const DB_NAME = 'zereos-shorts-db';
  const DB_VERSION = 1;
  const STORE = 'projects';
  const ACTIVE_KEY = 'zereos-shorts-active-project';
  let dbPromise;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('تعذر فتح قاعدة بيانات المشاريع'));
    });
    return dbPromise;
  }

  async function transaction(mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try { result = action(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('فشلت عملية حفظ المشروع'));
      tx.onabort = () => reject(tx.error || new Error('أُلغيت عملية حفظ المشروع'));
    });
  }

  const adapter = {
    async listProjects() {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a,b) => b.updatedAt - a.updatedAt));
        req.onerror = () => reject(req.error);
      });
    },
    async getProject(id) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },
    async saveProject(project) {
      const now = Date.now();
      const record = { ...project, updatedAt: now, createdAt: project.createdAt || now, schemaVersion: 1 };
      await transaction('readwrite', store => store.put(record));
      try { localStorage.setItem(ACTIVE_KEY, record.id); } catch (_) {}
      return record;
    },
    async deleteProject(id) {
      await transaction('readwrite', store => store.delete(id));
      try { if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY); } catch (_) {}
    },
    async activeProjectId() {
      try { return localStorage.getItem(ACTIVE_KEY); } catch (_) { return null; }
    },
    setActiveProjectId(id) {
      try { localStorage.setItem(ACTIVE_KEY, id); } catch (_) {}
    }
  };

  // Stable adapter boundary: a future cloud adapter can implement these methods
  // without coupling the editor UI to a specific provider.
  window.ZereosStorage = Object.freeze({
    local: adapter,
    async getAdapter() { return adapter; },
    async estimate() {
      if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
      return null;
    }
  });
})();