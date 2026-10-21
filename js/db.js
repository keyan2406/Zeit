// Lokale Datenverwaltung mit IndexedDB und localStorage Fallback
class TimeTrackingDB {
    constructor() {
        this.dbName = "TimeTrackingDB";
        this.storeName = "entries";
        this.settingsStore = "settings";
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: "id", autoIncrement: true });
                }
                if (!db.objectStoreNames.contains(this.settingsStore)) {
                    db.createObjectStore(this.settingsStore, { keyPath: "key" });
                }
            };
        });
    }

    async getAllEntries() {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], "readonly");
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async saveEntry(entry) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);
            
            if (!entry.id) {
                delete entry.id;
                const request = store.add(entry);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } else {
                const request = store.put(entry);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            }
        });
    }

    async deleteEntry(id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(Number(id));
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async getSetting(key, defaultValue) {
        await this.init();
        return new Promise((resolve) => {
            const transaction = this.db.transaction([this.settingsStore], "readonly");
            const store = transaction.objectStore(this.settingsStore);
            const request = store.get(key);
            
            request.onsuccess = () => {
                resolve(request.result ? request.result.value : defaultValue);
            };
            request.onerror = () => resolve(defaultValue);
        });
    }

    async saveSetting(key, value) {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.settingsStore], "readwrite");
            const store = transaction.objectStore(this.settingsStore);
            const request = store.put({ key, value });
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async clearAll() {
        await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName, this.settingsStore], "readwrite");
            transaction.objectStore(this.storeName).clear();
            transaction.objectStore(this.settingsStore).clear();
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
        });
    }
}

const db = new TimeTrackingDB();