
import { HistoryRecord } from '../types';

const DB_NAME = 'KuromiPromptDB';
const STORE_NAME = 'history';
const DB_VERSION = 1;

// Utility to open DB
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('folderName', 'folderName', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

// Helper to convert File to Base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export const historyService = {
  async addRecord(record: HistoryRecord): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // Ensure generatedImages is initialized
      if (!record.generatedImages) {
        record.generatedImages = {};
      }
      
      const request = store.add(record);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getAllRecords(): Promise<HistoryRecord[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev'); // Newest first
      const results: HistoryRecord[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async deleteRecord(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async deleteFolder(folderName: string): Promise<void> {
    const records = await this.getAllRecords();
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    records.forEach(record => {
      if (record.folderName === folderName) {
        store.delete(record.id);
      }
    });

    return new Promise((resolve) => {
        transaction.oncomplete = () => resolve();
    });
  },

  async renameFolder(oldName: string, newName: string): Promise<void> {
    const records = await this.getAllRecords();
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    records.forEach(record => {
      if (record.folderName === oldName) {
        record.folderName = newName;
        store.put(record);
      }
    });

    return new Promise((resolve) => {
        transaction.oncomplete = () => resolve();
    });
  },

  async saveGeneratedImage(recordId: string, promptHash: string, imageBase64: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(recordId);

      getRequest.onsuccess = () => {
        const record = getRequest.result as HistoryRecord;
        if (record) {
          if (!record.generatedImages) {
            record.generatedImages = {};
          }
          record.generatedImages[promptHash] = imageBase64;
          const updateRequest = store.put(record);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error("Record not found"));
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }
};
