/**
 * Error handling for embedded backend
 * Provides consistent error responses matching Python backend format
 */

/**
 * Error types with HTTP-equivalent status codes
 */
export const ERROR_TYPES = {
  VALIDATION_ERROR: { code: 400, message: "Validation failed" },
  UNAUTHORIZED: { code: 401, message: "Unauthorized access" },
  NOT_FOUND: { code: 404, message: "Resource not found" },
  CREDENTIALS_ERROR: { code: 401, message: "Invalid credentials" },
  MODEL_ERROR: { code: 422, message: "Model invocation failed" },
  INTERNAL_ERROR: { code: 500, message: "Internal server error" },
  OPENAI_AUTH_ERROR: { code: 401, message: "OpenAI authentication failed" },
  OPENAI_RATE_LIMIT_ERROR: { code: 429, message: "OpenAI rate limit exceeded" },
  MODEL_PROVIDER_ERROR: { code: 422, message: "Model provider error" },
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
    this.name = "ThreatModelingError";
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
      error: ERROR_TYPES[this.type]?.message || "Unknown error",
      message: this.message,
      job_id: this.jobId,
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
        data: this.toResponse(),
      },
    };
  }
}

/**
 * Wrap a function with error handling that converts errors to fetch-like format
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn) {
  return async function (...args) {
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
        "INTERNAL_ERROR",
        error.message || "An unexpected error occurred",
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
  const missing = required.filter((key) => params[key] === undefined || params[key] === null);

  if (missing.length > 0) {
    throw new ThreatModelingError(
      "VALIDATION_ERROR",
      `Missing required parameters: ${missing.join(", ")}`,
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
    throw new ThreatModelingError("CREDENTIALS_ERROR", "AWS credentials not configured", null);
  }

  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new ThreatModelingError(
      "CREDENTIALS_ERROR",
      "Invalid AWS credentials: missing accessKeyId or secretAccessKey",
      null
    );
  }

  if (!credentials.region) {
    throw new ThreatModelingError("CREDENTIALS_ERROR", "AWS region not configured", null);
  }
}

/**
 * OpenAI Authentication Error
 * Thrown when OpenAI API key is invalid or missing
 */
export class OpenAIAuthenticationError extends Error {
  constructor(message = "OpenAI API authentication failed. Please check your API key.") {
    super(message);
    this.name = "OpenAIAuthenticationError";
    this.type = "OPENAI_AUTH_ERROR";
    this.statusCode = 401;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OpenAIAuthenticationError);
    }
  }

  toResponse() {
    return {
      error: ERROR_TYPES.OPENAI_AUTH_ERROR.message,
      message: this.message,
    };
  }

  toFetchError() {
    return {
      response: {
        status: this.statusCode,
        data: this.toResponse(),
      },
    };
  }
}

/**
 * OpenAI Rate Limit Error
 * Thrown when OpenAI rate limits or quotas are exceeded
 */
export class OpenAIRateLimitError extends Error {
  constructor(message = "OpenAI rate limit exceeded. Please try again later or check your quota.") {
    super(message);
    this.name = "OpenAIRateLimitError";
    this.type = "OPENAI_RATE_LIMIT_ERROR";
    this.statusCode = 429;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OpenAIRateLimitError);
    }
  }

  toResponse() {
    return {
      error: ERROR_TYPES.OPENAI_RATE_LIMIT_ERROR.message,
      message: this.message,
    };
  }

  toFetchError() {
    return {
      response: {
        status: this.statusCode,
        data: this.toResponse(),
      },
    };
  }
}

/**
 * Model Provider Error
 * Generic error for provider-specific issues
 */
export class ModelProviderError extends Error {
  constructor(message, provider = "unknown") {
    super(message);
    this.name = "ModelProviderError";
    this.type = "MODEL_PROVIDER_ERROR";
    this.statusCode = 422;
    this.provider = provider;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ModelProviderError);
    }
  }

  toResponse() {
    return {
      error: ERROR_TYPES.MODEL_PROVIDER_ERROR.message,
      message: this.message,
      provider: this.provider,
    };
  }

  toFetchError() {
    return {
      response: {
        status: this.statusCode,
        data: this.toResponse(),
      },
    };
  }
}

/**
 * Detect and map OpenAI-specific errors to standardized error types
 * @param {Error} error - The error to analyze
 * @param {string} provider - The provider type ('openai' or 'bedrock')
 * @returns {Error} Mapped error with appropriate type
 */
export function mapProviderError(error, provider = "unknown") {
  const errorMsg = error.message?.toLowerCase() || "";
  const errorString = error.toString().toLowerCase();

  // OpenAI-specific error detection
  if (provider === "openai") {
    // Authentication errors
    if (
      errorMsg.includes("authentication") ||
      errorMsg.includes("api_key") ||
      errorMsg.includes("api key") ||
      errorMsg.includes("unauthorized") ||
      errorMsg.includes("invalid api key") ||
      errorString.includes("401")
    ) {
      return new OpenAIAuthenticationError(
        "OpenAI API authentication failed. Please verify your API key is correct and active."
      );
    }

    // Rate limit errors
    if (
      errorMsg.includes("rate_limit") ||
      errorMsg.includes("rate limit") ||
      errorMsg.includes("quota") ||
      errorMsg.includes("too many requests") ||
      errorString.includes("429")
    ) {
      return new OpenAIRateLimitError(
        "OpenAI rate limit exceeded. Please wait a moment and try again, or check your account quota."
      );
    }

    // Generic OpenAI provider error
    return new ModelProviderError(`OpenAI API error: ${error.message}`, "openai");
  }

  // Bedrock-specific error detection
  if (provider === "bedrock") {
    // AWS authentication errors
    if (
      errorMsg.includes("credentials") ||
      errorMsg.includes("access denied") ||
      errorMsg.includes("unauthorized")
    ) {
      return new ThreatModelingError(
        "CREDENTIALS_ERROR",
        `Amazon Bedrock authentication failed: ${error.message}`,
        null
      );
    }

    // Generic Bedrock provider error
    return new ModelProviderError(`Amazon Bedrock error: ${error.message}`, "bedrock");
  }

  // Unknown provider or generic error
  return new ModelProviderError(`Model provider error: ${error.message}`, provider);
}

/**
 * Wrap model invocation with provider-aware error handling
 * @param {Function} fn - Async function that invokes a model
 * @param {string} provider - Provider type ('openai' or 'bedrock')
 * @returns {Function} Wrapped function with error handling
 */
export function withProviderErrorHandling(fn, provider) {
  return async function (...args) {
    try {
      return await fn(...args);
    } catch (error) {
      // Map provider-specific errors
      const mappedError = mapProviderError(error, provider);

      // If it's one of our custom error types, convert to fetch format
      if (
        mappedError instanceof OpenAIAuthenticationError ||
        mappedError instanceof OpenAIRateLimitError ||
        mappedError instanceof ModelProviderError ||
        mappedError instanceof ThreatModelingError
      ) {
        throw mappedError.toFetchError();
      }

      // Pass through if already in fetch error format
      if (error.response && error.response.status && error.response.data) {
        throw error;
      }

      // Convert unknown errors
      const internalError = new ThreatModelingError(
        "INTERNAL_ERROR",
        error.message || "An unexpected error occurred",
        null
      );
      throw internalError.toFetchError();
    }
  };
}
