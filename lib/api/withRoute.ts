import { Result, toAppError, err } from '@/lib/result';
import { jsonResult } from '@/lib/api-response';
import type { AppError } from '@/lib/result';

/**
 * Route handler function type.
 * Accepts a Request and returns a Promise<Result<T>>.
 */
type RouteHandler<T = unknown> = (req: Request) => Promise<Result<T>>;

/**
 * Wraps a route handler to provide consistent error handling.
 * 
 * - Catches unexpected exceptions
 * - Converts them to AppError
 * - Returns consistent JSON responses
 * - Logs errors for debugging
 * 
 * @param handler - The route handler function
 * @returns A Next.js route handler function
 * 
 * @example
 * ```typescript
 * // app/api/jobs/route.ts
 * import { withRoute } from '@/lib/api/withRoute';
 * import { createJob } from '@/lib/mutations/jobs';
 * 
 * export const POST = withRoute(async (req) => {
 *   const data = await req.json();
 *   return await createJob(data);
 * });
 * ```
 */
export function withRoute<T = unknown>(
  handler: RouteHandler<T>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      const result = await handler(req);
      return jsonResult(result);
    } catch (error) {
      // Unexpected error - log it and convert to AppError
      const appError = toAppError(error);
      console.error('Unexpected error in route handler:', {
        code: appError.code,
        message: appError.message,
        details: appError.details,
        url: req.url,
        method: req.method,
      });

      // Return error response
      const errorResult: Result<never> = err(
        appError.code,
        appError.message,
        appError.details
      );
      return jsonResult(errorResult);
    }
  };
}

