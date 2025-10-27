/**
 * Error handling for embedded backend
 * Provides consistent error responses matching Python backend format
 */

/**
 * Error types with HTTP-equivalent status codes
 */
export const ERROR_TYPES = {
  VALIDATION_ERROR: { code: 400, message: 'Validation failed' },
  UNAUTHORIZED: { code: 401, message: 'Unauthorized access' },
  NOT_FOUND: { code: 404, message: 'Resource not found' },
  CREDENTIALS_ERROR: { code: 401, message: 'Invalid AWS credentials' },
  MODEL_ERROR: { code: 422, message: 'Model invocation failed' },
  INTERNAL_ERROR: { code: 500, message: 'Internal server error' }
};

/**
 * Custom error class for threat modeling operations
 */
export class ThreatModelingError extends Error {
  /**
   * Create a ThreatModelingError
   * @param {string} type - Error type from ERROR_TYPES
   * @param {string} message - Detailed error message
   * @param {string|null} jobId - Optional job ID associated with the error
   */
  constructor(type, message, jobId = null) {
    super(message);
    this.name = 'ThreatModelingError';
    this.type = type;
    this.statusCode = ERROR_TYPES[type]?.code || 500;
    this.jobId = jobId;
    
    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ThreatModelingError);
    }
  }

  /**
   * Convert error to response format matching Python backend
   * @returns {Object} Error response object
   */
  toResponse() {
    return {
      error: ERROR_TYPES[this.type]?.message || 'Unknown error',
      message: this.message,
      job_id: this.jobId
    };
  }

  /**
   * Convert error to fetch-like error format for API adapter
   * @returns {Object} Error object with response property
   */
  toFetchError() {
    return {
      response: {
        status: this.statusCode,
        data: this.toResponse()
      }
    };
  }
}

/**
 * Wrap a function with error handling that converts errors to fetch-like format
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn) {
  return async function(...args) {
    try {
      return await fn(...args);
    } catch (error) {
      // If it's already a ThreatModelingError, convert to fetch format
      if (error instanceof ThreatModelingError) {
        throw error.toFetchError();
      }
      
      // If it's already in fetch error format, pass through
      if (error.response && error.response.status && error.response.data) {
        throw error;
      }
      
      // Convert unknown errors to INTERNAL_ERROR
      const internalError = new ThreatModelingError(
        'INTERNAL_ERROR',
        error.message || 'An unexpected error occurred',
        null
      );
      throw internalError.toFetchError();
    }
  };
}

/**
 * Validate required parameters
 * @param {Object} params - Parameters to validate
 * @param {Array<string>} required - Required parameter names
 * @throws {ThreatModelingError} If validation fails
 */
export function validateParams(params, required) {
  const missing = required.filter(key => params[key] === undefined || params[key] === null);
  
  if (missing.length > 0) {
    throw new ThreatModelingError(
      'VALIDATION_ERROR',
      `Missing required parameters: ${missing.join(', ')}`,
      params.id || null
    );
  }
}

/**
 * Validate AWS credentials
 * @param {Object} credentials - Credentials object
 * @throws {ThreatModelingError} If credentials are invalid
 */
export function validateCredentials(credentials) {
  if (!credentials) {
    throw new ThreatModelingError(
      'CREDENTIALS_ERROR',
      'AWS credentials not configured',
      null
    );
  }
  
  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new ThreatModelingError(
      'CREDENTIALS_ERROR',
      'Invalid AWS credentials: missing accessKeyId or secretAccessKey',
      null
    );
  }
  
  if (!credentials.region) {
    throw new ThreatModelingError(
      'CREDENTIALS_ERROR',
      'AWS region not configured',
      null
    );
  }
}

