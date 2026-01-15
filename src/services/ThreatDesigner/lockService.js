import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../config.js";

const baseUrl = config.controlPlaneAPI + "/threat-designer";

/**
 * LockService - Singleton service for managing threat model edit locks.
 * Lives outside React's lifecycle to avoid StrictMode double-render issues.
 *
 * Components subscribe to lock state changes rather than managing locks directly.
 */
class LockService {
  constructor() {
    // Map of threatModelId -> lock state
    this.locks = new Map();
    // Map of threatModelId -> Set of subscriber callbacks
    this.subscribers = new Map();
    // Heartbeat interval in ms
    this.heartbeatIntervalMs = 30000;
    // Poll interval for checking lock availability
    this.pollIntervalMs = 30000;
  }

  /**
   * Get authorization headers with JWT token
   */
  async getAuthHeaders() {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens.idToken.toString();
      return {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
    } catch (error) {
      throw new Error("Failed to get authentication token");
    }
  }

  /**
   * Get or create lock state for a threat model
   */
  getLockState(threatModelId) {
    if (!this.locks.has(threatModelId)) {
      this.locks.set(threatModelId, {
        lockToken: null,
        isLocked: false,
        isAcquiring: false, // Track if acquisition is in progress
        isReadOnly: true,
        lockStatus: null, // { lockedBy, since, message } when conflict
        heartbeatInterval: null,
        pollInterval: null,
        releaseTimeout: null,
        subscriberCount: 0,
      });
    }
    return this.locks.get(threatModelId);
  }

  /**
   * Subscribe to lock state changes for a threat model
   * Returns unsubscribe function
   */
  subscribe(threatModelId, callback) {
    if (!this.subscribers.has(threatModelId)) {
      this.subscribers.set(threatModelId, new Set());
    }

    const subs = this.subscribers.get(threatModelId);
    subs.add(callback);

    const state = this.getLockState(threatModelId);
    state.subscriberCount++;

    // Cancel any pending release
    if (state.releaseTimeout) {
      clearTimeout(state.releaseTimeout);
      state.releaseTimeout = null;
      console.log(`[LockService] Cancelled pending release for ${threatModelId}`);
    }

    // If this is the first subscriber and we don't have a lock and not already acquiring, acquire it
    if (state.subscriberCount === 1 && !state.isLocked && !state.isAcquiring) {
      console.log(`[LockService] First subscriber for ${threatModelId}, acquiring lock`);
      this.acquireLock(threatModelId);
    } else {
      // Notify new subscriber of current state immediately
      callback(this.getPublicState(threatModelId));
    }

    // Return unsubscribe function
    return () => {
      subs.delete(callback);
      state.subscriberCount--;

      console.log(
        `[LockService] Subscriber removed for ${threatModelId}, count: ${state.subscriberCount}`
      );

      // If no more subscribers, schedule lock release with small delay
      // This handles StrictMode re-renders where cleanup runs before next effect
      if (state.subscriberCount <= 0) {
        console.log(`[LockService] Scheduling lock release for ${threatModelId}`);
        state.releaseTimeout = setTimeout(() => {
          // Double-check no new subscribers joined
          if (state.subscriberCount <= 0) {
            console.log(`[LockService] Releasing lock for ${threatModelId}`);
            this.releaseLock(threatModelId);
          }
          state.releaseTimeout = null;
        }, 100);
      }
    };
  }

  /**
   * Get public state (what components see)
   */
  getPublicState(threatModelId) {
    const state = this.getLockState(threatModelId);
    return {
      isReadOnly: state.isReadOnly,
      lockStatus: state.lockStatus,
      hasLock: state.isLocked && state.lockToken !== null,
    };
  }

  /**
   * Notify all subscribers of state change
   */
  notifySubscribers(threatModelId) {
    const subs = this.subscribers.get(threatModelId);
    if (subs) {
      const publicState = this.getPublicState(threatModelId);
      subs.forEach((callback) => callback(publicState));
    }
  }

  /**
   * Acquire lock for a threat model
   */
  async acquireLock(threatModelId) {
    const state = this.getLockState(threatModelId);

    // Already have lock or already acquiring
    if (state.isLocked && state.lockToken) {
      console.log(`[LockService] Already have lock for ${threatModelId}`);
      return;
    }

    if (state.isAcquiring) {
      console.log(`[LockService] Already acquiring lock for ${threatModelId}`);
      return;
    }

    state.isAcquiring = true;

    try {
      console.log(`[LockService] Acquiring lock for ${threatModelId}`);
      const headers = await this.getAuthHeaders();
      const response = await axios.post(`${baseUrl}/${threatModelId}/lock`, {}, { headers });

      if (response.data.success) {
        state.lockToken = response.data.lock_token;
        state.isLocked = true;
        state.isReadOnly = false;
        state.lockStatus = null;

        console.log(`[LockService] Lock acquired for ${threatModelId}, token: ${state.lockToken}`);

        this.startHeartbeat(threatModelId);
        this.notifySubscribers(threatModelId);
      } else {
        console.log(
          `[LockService] Failed to acquire lock for ${threatModelId}:`,
          response.data.message
        );
        state.isReadOnly = true;
        this.notifySubscribers(threatModelId);
      }
    } catch (error) {
      if (error.response?.status === 409) {
        // Lock held by another user
        const data = error.response.data;
        console.log(
          `[LockService] Lock conflict for ${threatModelId}, held by:`,
          data.username || data.held_by
        );

        state.isReadOnly = true;
        state.lockStatus = {
          lockedBy: data.username || data.held_by,
          since: data.since,
          message: data.message || "Threat model is locked by another user",
        };

        this.startPolling(threatModelId);
        this.notifySubscribers(threatModelId);
      } else {
        console.error(`[LockService] Error acquiring lock for ${threatModelId}:`, error);
        state.isReadOnly = true;
        this.notifySubscribers(threatModelId);
      }
    } finally {
      state.isAcquiring = false;
    }
  }

  /**
   * Release lock for a threat model
   */
  async releaseLock(threatModelId, useBeacon = false) {
    const state = this.getLockState(threatModelId);

    this.stopHeartbeat(threatModelId);
    this.stopPolling(threatModelId);

    if (!state.lockToken) {
      console.log(`[LockService] No lock token for ${threatModelId}, skipping release`);
      this.cleanupLockState(threatModelId);
      return;
    }

    try {
      if (useBeacon && navigator.sendBeacon) {
        // Beacon mode - just clear state, let TTL handle expiration
        console.log(`[LockService] Releasing via TTL for ${threatModelId} (beacon mode)`);
      } else {
        const headers = await this.getAuthHeaders();
        console.log(`[LockService] Releasing lock for ${threatModelId}`);

        await axios.delete(`${baseUrl}/${threatModelId}/lock`, {
          headers,
          data: { lock_token: state.lockToken },
        });

        console.log(`[LockService] Lock released for ${threatModelId}`);
      }
    } catch (error) {
      console.error(`[LockService] Failed to release lock for ${threatModelId}:`, error);
    }

    this.cleanupLockState(threatModelId);
  }

  /**
   * Clean up lock state
   */
  cleanupLockState(threatModelId) {
    const state = this.locks.get(threatModelId);
    if (state) {
      state.lockToken = null;
      state.isLocked = false;
      state.isAcquiring = false;
      state.isReadOnly = true;
      state.lockStatus = null;
    }
    // Don't delete from map - keep subscriber count
  }

  /**
   * Start heartbeat for a lock
   */
  startHeartbeat(threatModelId) {
    const state = this.getLockState(threatModelId);

    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval);
    }

    console.log(`[LockService] Starting heartbeat for ${threatModelId}`);

    state.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat(threatModelId);
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat for a lock
   */
  stopHeartbeat(threatModelId) {
    const state = this.locks.get(threatModelId);
    if (state?.heartbeatInterval) {
      console.log(`[LockService] Stopping heartbeat for ${threatModelId}`);
      clearInterval(state.heartbeatInterval);
      state.heartbeatInterval = null;
    }
  }

  /**
   * Send heartbeat to maintain lock
   */
  async sendHeartbeat(threatModelId) {
    const state = this.locks.get(threatModelId);

    if (!state?.lockToken) {
      console.warn(`[LockService] No lock token for heartbeat ${threatModelId}`);
      this.stopHeartbeat(threatModelId);
      return;
    }

    try {
      const headers = await this.getAuthHeaders();
      await axios.put(
        `${baseUrl}/${threatModelId}/lock/heartbeat`,
        { lock_token: state.lockToken },
        { headers }
      );
      console.log(`[LockService] Heartbeat success for ${threatModelId}`);
    } catch (error) {
      if (error.response?.status === 410) {
        console.warn(`[LockService] Lock lost (410) for ${threatModelId}`);
        this.handleLockLost(threatModelId);
      } else {
        console.error(`[LockService] Heartbeat error for ${threatModelId}:`, error);
      }
    }
  }

  /**
   * Handle lock loss
   */
  handleLockLost(threatModelId) {
    const state = this.locks.get(threatModelId);
    if (state) {
      this.stopHeartbeat(threatModelId);
      state.lockToken = null;
      state.isLocked = false;
      state.isReadOnly = true;
      state.lockStatus = null;
      this.notifySubscribers(threatModelId);
    }
  }

  /**
   * Start polling for lock availability
   */
  startPolling(threatModelId) {
    const state = this.getLockState(threatModelId);

    if (state.isLocked && state.lockToken) {
      console.log(`[LockService] Already have lock, skipping polling for ${threatModelId}`);
      return;
    }

    if (state.pollInterval) {
      console.log(`[LockService] Already polling for ${threatModelId}`);
      return;
    }

    console.log(`[LockService] Starting polling for ${threatModelId}`);

    state.pollInterval = setInterval(async () => {
      // Stop if we got the lock or no more subscribers
      if ((state.isLocked && state.lockToken) || state.subscriberCount <= 0) {
        this.stopPolling(threatModelId);
        return;
      }

      try {
        const status = await this.checkLockStatus(threatModelId);

        if (!status.locked) {
          console.log(`[LockService] Lock available for ${threatModelId}, acquiring`);
          this.stopPolling(threatModelId);
          await this.acquireLock(threatModelId);
        }
      } catch (error) {
        console.error(`[LockService] Polling error for ${threatModelId}:`, error);
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stop polling for lock availability
   */
  stopPolling(threatModelId) {
    const state = this.locks.get(threatModelId);
    if (state?.pollInterval) {
      console.log(`[LockService] Stopping polling for ${threatModelId}`);
      clearInterval(state.pollInterval);
      state.pollInterval = null;
    }
  }

  /**
   * Check lock status
   */
  async checkLockStatus(threatModelId) {
    const headers = await this.getAuthHeaders();
    const response = await axios.get(`${baseUrl}/${threatModelId}/lock/status`, { headers });

    return {
      locked: response.data.locked,
      userId: response.data.user_id,
      since: response.data.since,
      expiresAt: response.data.expires_at,
    };
  }

  /**
   * Check if we have a lock for a threat model
   */
  hasLock(threatModelId) {
    const state = this.locks.get(threatModelId);
    return state?.isLocked && state?.lockToken !== null;
  }

  /**
   * Get lock manager ref for a threat model (for backwards compatibility)
   */
  getLockManagerRef(threatModelId) {
    return {
      hasLock: () => this.hasLock(threatModelId),
      releaseLock: (useBeacon) => this.releaseLock(threatModelId, useBeacon),
    };
  }

  /**
   * Release lock on page unload
   */
  handleBeforeUnload() {
    this.locks.forEach((state, threatModelId) => {
      if (state.lockToken) {
        this.releaseLock(threatModelId, true);
      }
    });
  }
}

// Singleton instance
const lockService = new LockService();

// Handle page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    lockService.handleBeforeUnload();
  });
}

export default lockService;
