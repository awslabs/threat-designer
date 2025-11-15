/**
 * Credentials Manager for Lightning Mode
 * Handles storage and retrieval of provider credentials in memory only
 * Supports Amazon Bedrock and OpenAI providers
 * Credentials are cleared on page reload for maximum security
 */

// In-memory storage for credentials
let credentialsStore = null;

// 4 hours in milliseconds
const EXPIRATION_TIME = 4 * 60 * 60 * 1000;

/**
 * CredentialsManager class for managing provider credentials in memory
 */
export class CredentialsManager {
  /**
   * Store provider credentials in memory
   * @param {Object} credentials - Provider credentials object
   * @param {string} credentials.provider - Provider type ('bedrock' or 'openai')
   * @param {string} [credentials.accessKeyId] - AWS Access Key ID (Bedrock)
   * @param {string} [credentials.secretAccessKey] - AWS Secret Access Key (Bedrock)
   * @param {string} [credentials.sessionToken] - AWS Session Token (Bedrock, optional)
   * @param {string} [credentials.region] - AWS Region (Bedrock)
   * @param {string} [credentials.openaiApiKey] - OpenAI API Key (OpenAI)
   */
  setCredentials(credentials) {
    const timestamp = Date.now();
    const provider = (credentials.provider || "bedrock").trim();

    // Store credentials in memory with timestamp and provider
    credentialsStore = {
      provider,
      timestamp,
    };

    // Store provider-specific fields
    if (provider === "bedrock") {
      credentialsStore.accessKeyId = (credentials.accessKeyId || "").trim();
      credentialsStore.secretAccessKey = (credentials.secretAccessKey || "").trim();
      credentialsStore.sessionToken = credentials.sessionToken
        ? credentials.sessionToken.trim()
        : null;
      credentialsStore.region = (credentials.region || "").trim();
    } else if (provider === "openai") {
      credentialsStore.openaiApiKey = (credentials.openaiApiKey || "").trim();
    }
  }

  /**
   * Retrieve provider credentials from memory and validate timestamp
   * @returns {Object|null} Credentials object with provider type or null if not found or expired
   */
  getCredentials() {
    try {
      // Check if credentials exist in memory
      if (!credentialsStore) {
        return null;
      }

      // Check if provider field is present
      if (!credentialsStore.provider) {
        return null;
      }

      const provider = credentialsStore.provider;

      // Check if provider-specific required fields are present
      if (provider === "bedrock") {
        if (
          !credentialsStore.accessKeyId ||
          !credentialsStore.secretAccessKey ||
          !credentialsStore.region
        ) {
          return null;
        }
      } else if (provider === "openai") {
        if (!credentialsStore.openaiApiKey) {
          return null;
        }
      } else {
        // Unknown provider
        return null;
      }

      // Validate timestamp (4-hour expiration check)
      const currentTime = Date.now();
      const timeDiff = currentTime - credentialsStore.timestamp;

      if (timeDiff > EXPIRATION_TIME) {
        // Credentials expired, clear them
        this.clearCredentials();
        return null;
      }

      // Return credentials object with provider type
      const credentials = {
        provider,
        timestamp: credentialsStore.timestamp,
      };

      // Add provider-specific fields
      if (provider === "bedrock") {
        credentials.accessKeyId = credentialsStore.accessKeyId;
        credentials.secretAccessKey = credentialsStore.secretAccessKey;
        credentials.sessionToken = credentialsStore.sessionToken;
        credentials.region = credentialsStore.region;
      } else if (provider === "openai") {
        credentials.openaiApiKey = credentialsStore.openaiApiKey;
      }

      return credentials;
    } catch (error) {
      console.error("Failed to retrieve credentials from memory:", error);
      return null;
    }
  }

  /**
   * Clear provider credentials and configuration from memory
   */
  clearCredentials() {
    credentialsStore = null;
  }

  /**
   * Check if valid credentials are stored for any provider
   * @returns {boolean} True if valid credentials exist
   */
  hasValidCredentials() {
    const creds = this.getCredentials();
    if (!creds || !creds.provider) {
      return false;
    }

    if (creds.provider === "bedrock") {
      return !!(creds.accessKeyId && creds.secretAccessKey && creds.region);
    } else if (creds.provider === "openai") {
      return !!creds.openaiApiKey;
    }

    return false;
  }
}

// Export singleton instance
const credentialsManager = new CredentialsManager();

export default credentialsManager;

// Export convenience functions
export const setCredentials = (credentials) => credentialsManager.setCredentials(credentials);
export const getCredentials = () => credentialsManager.getCredentials();
export const clearCredentials = () => credentialsManager.clearCredentials();
export const hasValidCredentials = () => credentialsManager.hasValidCredentials();
