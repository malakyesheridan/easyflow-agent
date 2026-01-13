/**
 * Result type for error handling.
 * Represents either a successful result with data or a failure with an error.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

/**
 * Application error type.
 * All errors in the application should use this format.
 */
export type AppError = {
  code: string;
  message: string;
  details?: unknown;
};

/**
 * Creates a successful Result.
 * 
 * @param data - The data to wrap in a successful result
 * @returns A Result with ok: true and the data
 */
export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

/**
 * Creates a failed Result.
 * 
 * @param code - Error code (e.g., 'NOT_FOUND', 'VALIDATION_ERROR')
 * @param message - Human-readable error message
 * @param details - Optional additional error details
 * @returns A Result with ok: false and the error
 */
export function err(
  code: string,
  message: string,
  details?: unknown
): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * Converts an unknown error to an AppError.
 * Used for catching unexpected exceptions.
 * 
 * @param error - The unknown error to convert
 * @returns An AppError with appropriate code and message
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof Error) {
    return {
      code: error.name || 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred',
      details: error,
    };
  }

  if (typeof error === 'string') {
    return {
      code: 'ERROR',
      message: error,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    details: error,
  };
}

