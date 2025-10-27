/**
 * AWS Credentials Manager for Lightning Mode
 * Handles storage and retrieval of AWS credentials in sessionStorage
 */

const CREDENTIALS_KEY = 'tm_aws_credentials';

/**
 * CredentialsManager class for managing AWS credentials in browser sessionStorage
 */
export class CredentialsManager {
  /**
   * Store AWS credentials in sessionStorage
   * @param {Object} credentials - AWS credentials object
   * @param {string} credentials.accessKeyId - AWS Access Key ID
   * @param {string} credentials.secretAccessKey - AWS Secret Access Key
   * @param {string} [credentials.sessionToken] - AWS Session Token (optional)
   * @param {string} credentials.region - AWS Region
   */
  setCredentials(credentials) {
    const credentialsData = {
      accessKeyId: (credentials.accessKeyId || '').trim(),
      secretAccessKey: (credentials.secretAccessKey || '').trim(),
      sessionToken: credentials.sessionToken ? credentials.sessionToken.trim() : null,
      region: (credentials.region || '').trim(),
      timestamp: Date.now()
    };
    
    sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentialsData));
  }

  /**
   * Retrieve AWS credentials from sessionStorage
   * @returns {Object|null} Credentials object or null if not found
   */
  getCredentials() {
    const stored = sessionStorage.getItem(CREDENTIALS_KEY);
    if (!stored) {
      return null;
    }
    
    try {
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to parse stored credentials:', error);
      return null;
    }
  }

  /**
   * Clear AWS credentials from sessionStorage
   */
  clearCredentials() {
    sessionStorage.removeItem(CREDENTIALS_KEY);
  }

  /**
   * Check if valid credentials are stored
   * @returns {boolean} True if valid credentials exist
   */
  hasValidCredentials() {
    const creds = this.getCredentials();
    return !!(creds && creds.accessKeyId && creds.secretAccessKey && creds.region);
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
