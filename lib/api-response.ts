import { Result, AppError, ok, err, toAppError } from '@/lib/result';

/**
 * @deprecated Use Result<T> instead. This type is kept for backward compatibility.
 */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

/**
 * @deprecated Use ok() from @/lib/result instead.
 */
export const success = <T>(data: T): ApiResponse<T> => {
  return { success: true, data };
};

/**
 * @deprecated Use err() from @/lib/result instead.
 */
export const failure = (
  error: string,
  code?: string
): ApiResponse<never> => {
  return { success: false, error, code };
};

/**
 * @deprecated Use toAppError() from @/lib/result instead.
 */
export const handleApiError = (error: unknown): ApiResponse<never> => {
  if (error instanceof Error) {
    console.error("API Error:", error.message);
    return failure(error.message, error.name);
  }
  console.error("Unknown API Error:", error);
  return failure("An unknown error occurred", "UNKNOWN_ERROR");
};

/**
 * Creates a successful JSON Response from Result<T>.
 * Use this in route handlers to return successful results.
 * 
 * @param data - The data to return
 * @returns A Response with JSON body containing { ok: true, data }
 */
export function jsonOk<T>(data: T): Response {
  return Response.json(ok(data));
}

/**
 * Creates an error JSON Response from AppError.
 * Use this in route handlers to return error results.
 * 
 * @param error - The AppError to return
 * @returns A Response with JSON body containing { ok: false, error }
 */
export function jsonErr(error: AppError): Response {
  return Response.json(err(error.code, error.message, error.details));
}

/**
 * Creates a JSON Response from a Result<T>.
 * Automatically handles both success and error cases.
 * 
 * @param result - The Result to convert to a Response
 * @returns A Response with appropriate JSON body
 */
export function jsonResult<T>(result: Result<T>): Response {
  if (result.ok) {
    return jsonOk(result.data);
  }
  return jsonErr(result.error);
}

