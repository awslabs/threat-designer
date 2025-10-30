// Stub for node:async_hooks to enable browser compatibility
// AsyncLocalStorage is not available in browsers, so we provide a minimal implementation

export class AsyncLocalStorage {
  constructor() {
    this.store = new Map();
  }

  run(store, callback, ...args) {
    const previousStore = this.store;
    this.store = new Map(previousStore);
    this.store.set("current", store);

    try {
      return callback(...args);
    } finally {
      this.store = previousStore;
    }
  }

  getStore() {
    return this.store.get("current");
  }

  enterWith(store) {
    this.store.set("current", store);
  }

  disable() {
    this.store.delete("current");
  }

  exit(callback, ...args) {
    const previousStore = this.store;
    this.store = new Map();

    try {
      return callback(...args);
    } finally {
      this.store = previousStore;
    }
  }
}

export default {
  AsyncLocalStorage,
};
