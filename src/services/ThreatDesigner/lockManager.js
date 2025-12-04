import axios from "axios";
import { fetchAuthSession } from "aws-amplify/auth";
import { config } from "../../config.js";

const baseUrl = config.controlPlaneAPI + "/threat-designer";

/**
 * LockManager handles acquiring, maintaining, and releasing edit locks for threat models.
 * It implements a heartbeat mechanism to keep locks alive and handles lock loss scenarios.
 */
class LockManager {
  constructor(threatModelId, onLockLost = null, onLockAcquired = null) {
    this.threatModelId = threatModelId;
    this.lockToken = null;
    this.heartbeatInterval = null;
    this.pollInterval = null;
    this.isLocked = false;
    this.onLockLost = onLockLost; // Callback when lock is lost
    this.onLockAcquired = onLockAcquired; // Callback when lock is acquired
    this.heartbeatIntervalMs = 30000; // 30 seconds
    this.pollIntervalMs = 30000; // 30 seconds - poll for lock availability
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
   * Acquire an edit lock on the threat model
   * @returns {Promise<Object>} Lock acquisition result with success status and lock_token
   */
  async acquireLock() {
    try {
      console.log(`Attempting to acquire lock for threat model: ${this.threatModelId}`);
      const headers = await this.getAuthHeaders();
      const response = await axios.post(`${baseUrl}/${this.threatModelId}/lock`, {}, { headers });

      if (response.data.success) {
        this.lockToken = response.data.lock_token;
        this.isLocked = true;
        console.log(`Lock acquired successfully for ${this.threatModelId}, token:`, this.lockToken);
        this.startHeartbeat();

        if (this.onLockAcquired) {
          this.onLockAcquired();
        }

        return {
          success: true,
          lockToken: this.lockToken,
        };
      }

      console.log(`Failed to acquire lock for ${this.threatModelId}:`, response.data.message);
      return {
        success: false,
        message: response.data.message,
      };
    } catch (error) {
      if (error.response?.status === 409) {
        // Lock held by another user
        const data = error.response.data;
        console.log(
          `Lock conflict for ${this.threatModelId}, held by:`,
          data.username || data.held_by
        );

        // Start polling for lock availability
        this.startPolling();

        return {
          success: false,
          conflict: true,
          lockedBy: data.username || data.held_by, // Use username for display
          userId: data.held_by, // Keep user_id for reference
          since: data.since,
          message: data.message || "Threat model is locked by another user",
        };
      }
      console.error(`Error acquiring lock for ${this.threatModelId}:`, error);
      throw error;
    }
  }

  /**
   * Start polling for lock availability
   * Checks every 30 seconds if the lock has been released
   */
  startPolling() {
    // Don't start polling if manager is destroyed or we already have the lock
    if (this.isDestroyed) {
      console.log(`[Polling] Manager destroyed, skipping polling for ${this.threatModelId}`);
      return;
    }

    if (this.isLocked && this.lockToken) {
      console.log(`[Polling] Skipping polling for ${this.threatModelId}, we already have the lock`);
      return;
    }

    if (this.pollInterval) {
      console.log(`[Polling] Already polling for ${this.threatModelId}`);
      return;
    }

    console.log(`[Polling] Starting lock availability polling for ${this.threatModelId}`);
    this.pollInterval = setInterval(async () => {
      // Stop polling if manager is destroyed or we already have the lock
      if (this.isDestroyed || (this.isLocked && this.lockToken)) {
        console.log(
          `[Polling] Stopping polling for ${this.threatModelId} (destroyed or have lock)`
        );
        this.stopPolling();
        return;
      }

      try {
        console.log(`[Polling] Checking lock status for ${this.threatModelId}`);
        const status = await this.checkLockStatus();

        // Check again after async operation
        if (this.isDestroyed || (this.isLocked && this.lockToken)) {
          this.stopPolling();
          return;
        }

        if (!status.locked) {
          console.log(
            `[Polling] Lock is now available for ${this.threatModelId}, attempting to acquire`
          );
          this.stopPolling();

          // Try to acquire the lock
          const result = await this.acquireLock();
          if (result.success) {
            console.log(`[Polling] Successfully acquired lock for ${this.threatModelId}`);
          }
        } else {
          console.log(`[Polling] Lock still held for ${this.threatModelId} by ${status.userId}`);
        }
      } catch (error) {
        console.error(`[Polling] Error checking lock status for ${this.threatModelId}:`, error);
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stop polling for lock availability
   */
  stopPolling() {
    if (this.pollInterval) {
      console.log(`[Polling] Stopping lock availability polling for ${this.threatModelId}`);
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Start the heartbeat mechanism to maintain the lock
   * Sends a heartbeat every 30 seconds to refresh the lock timestamp
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      console.log(`[Heartbeat] Clearing existing heartbeat interval for ${this.threatModelId}`);
      clearInterval(this.heartbeatInterval);
    }

    console.log(
      `[Heartbeat] Starting heartbeat for ${this.threatModelId} with interval ${this.heartbeatIntervalMs}ms`
    );
    this.heartbeatInterval = setInterval(async () => {
      try {
        console.log(`[Heartbeat] Sending heartbeat for ${this.threatModelId}`);
        await this.sendHeartbeat();
      } catch (error) {
        console.error(`[Heartbeat] Failed for ${this.threatModelId}:`, error);
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Send a heartbeat to refresh the lock timestamp
   * @returns {Promise<Object>} Heartbeat result
   */
  async sendHeartbeat() {
    if (!this.lockToken) {
      console.warn(
        `[Heartbeat] No lock token available for ${this.threatModelId}, stopping heartbeat`
      );
      this.stopHeartbeat();
      return { success: false, message: "No lock token available" };
    }

    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.put(
        `${baseUrl}/${this.threatModelId}/lock/heartbeat`,
        { lock_token: this.lockToken },
        { headers }
      );

      console.log(`[Heartbeat] Success for ${this.threatModelId}`);
      return { success: true };
    } catch (error) {
      if (error.response?.status === 410) {
        // Lock has been lost (410 Gone)
        console.warn(`[Heartbeat] Lock lost (410) for ${this.threatModelId}`);
        this.handleLockLost();
        return { success: false, lockLost: true };
      }
      console.error(`[Heartbeat] Error for ${this.threatModelId}:`, error);
      throw error;
    }
  }

  /**
   * Stop the heartbeat mechanism
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      console.log(`[Heartbeat] Stopping heartbeat for ${this.threatModelId}`);
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Handle lock loss scenario
   * Stops heartbeat and notifies via callback
   */
  handleLockLost() {
    this.stopHeartbeat();
    this.isLocked = false;
    this.lockToken = null;

    if (this.onLockLost) {
      this.onLockLost();
    }
  }

  /**
   * Release the lock gracefully
   * @param {boolean} useBeacon - Use sendBeacon for synchronous release (for page unload)
   * @returns {Promise<Object>} Release result
   */
  async releaseLock(useBeacon = false) {
    this.stopHeartbeat();

    if (!this.lockToken) {
      console.log("No lock token available, skipping release call");
      this.isLocked = false;
      return { success: true, message: "No active lock to release" };
    }

    try {
      if (useBeacon && navigator.sendBeacon) {
        // Use sendBeacon for reliable delivery during page unload
        const headers = await this.getAuthHeaders();
        const url = `${baseUrl}/${this.threatModelId}/lock`;
        const blob = new Blob([JSON.stringify({ lock_token: this.lockToken })], {
          type: "application/json",
        });

        console.log(`Releasing lock via sendBeacon for ${this.threatModelId}`);

        // Note: sendBeacon doesn't support custom headers or DELETE method
        // We'll need to use POST with a special flag or accept that it might not work
        // For now, just clear local state and let TTL handle it
        this.lockToken = null;
        this.isLocked = false;

        return { success: true, message: "Lock will expire via TTL" };
      }

      const headers = await this.getAuthHeaders();
      console.log(`Releasing lock for ${this.threatModelId} with token:`, this.lockToken);

      await axios.delete(`${baseUrl}/${this.threatModelId}/lock`, {
        headers,
        data: { lock_token: this.lockToken },
      });

      this.lockToken = null;
      this.isLocked = false;

      console.log(`Lock released successfully for ${this.threatModelId}`);
      return { success: true };
    } catch (error) {
      // Even if release fails, clear local state
      this.lockToken = null;
      this.isLocked = false;

      console.error("Failed to release lock:", error);
      return {
        success: false,
        message: error.response?.data?.message || "Failed to release lock",
      };
    }
  }

  /**
   * Check the current lock status for the threat model
   * @returns {Promise<Object>} Lock status information
   */
  async checkLockStatus() {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(`${baseUrl}/${this.threatModelId}/lock/status`, { headers });

      return {
        locked: response.data.locked,
        userId: response.data.user_id,
        since: response.data.since,
        expiresAt: response.data.expires_at,
      };
    } catch (error) {
      console.error("Failed to check lock status:", error);
      throw error;
    }
  }

  /**
   * Check if this manager currently holds a valid lock
   * @returns {boolean} True if lock is held
   */
  hasLock() {
    return this.isLocked && this.lockToken !== null;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopHeartbeat();
    this.stopPolling();
    this.lockToken = null;
    this.isLocked = false;
    this.onLockLost = null;
    this.onLockAcquired = null;
  }
}

export default LockManager;
