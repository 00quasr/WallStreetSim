import { Context, Next } from 'hono';
import { ZodError } from 'zod';

/**
 * Error handling middleware
 */
export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    console.error('API Error:', error);

    // Zod validation error
    if (error instanceof ZodError) {
      return c.json(
        {
          success: false,
          error: 'Validation error',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        400
      );
    }

    // Generic error
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = (error as any).status || 500;

    return c.json(
      {
        success: false,
        error: message,
      },
      status
    );
  }
}

/**
 * Not found handler
 */
export function notFoundHandler(c: Context) {
  return c.json(
    {
      success: false,
      error: 'Not found',
    },
    404
  );
}
