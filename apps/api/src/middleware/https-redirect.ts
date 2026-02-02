import { Context, Next, MiddlewareHandler } from 'hono';

export interface HttpsRedirectOptions {
  /**
   * Whether HTTPS redirect is enabled. Defaults to true in production.
   */
  enabled?: boolean;

  /**
   * Paths to exclude from HTTPS redirect (e.g., health checks).
   * Defaults to ['/health', '/health/ready'].
   */
  excludePaths?: string[];

  /**
   * Status code for redirect. Defaults to 301 (permanent).
   * Use 302 for temporary redirects during testing.
   */
  redirectStatusCode?: 301 | 302 | 307 | 308;
}

/**
 * Determines if the request is using HTTPS by checking:
 * 1. X-Forwarded-Proto header (set by reverse proxies like Nginx)
 * 2. X-Forwarded-Ssl header (alternative proxy header)
 * 3. Protocol from the request URL
 */
function isSecure(c: Context): boolean {
  // Check X-Forwarded-Proto header (most common with Nginx/load balancers)
  const forwardedProto = c.req.header('x-forwarded-proto');
  if (forwardedProto === 'https') {
    return true;
  }

  // Check X-Forwarded-Ssl header (alternative proxy header)
  const forwardedSsl = c.req.header('x-forwarded-ssl');
  if (forwardedSsl === 'on') {
    return true;
  }

  // Check the request URL protocol
  const url = new URL(c.req.url);
  if (url.protocol === 'https:') {
    return true;
  }

  return false;
}

/**
 * Builds the HTTPS redirect URL from the original request
 */
function buildRedirectUrl(c: Context): string {
  const url = new URL(c.req.url);

  // Use X-Forwarded-Host if available (proxy scenarios)
  const forwardedHost = c.req.header('x-forwarded-host');
  if (forwardedHost) {
    url.host = forwardedHost;
  }

  url.protocol = 'https:';

  return url.toString();
}

/**
 * Middleware to redirect HTTP requests to HTTPS.
 *
 * This middleware checks incoming requests and redirects non-HTTPS traffic
 * to the secure version. It properly handles reverse proxy scenarios by
 * checking the X-Forwarded-Proto header.
 *
 * @example
 * ```typescript
 * // Enable in production only
 * app.use('*', httpsRedirect({ enabled: process.env.NODE_ENV === 'production' }));
 *
 * // Exclude health check paths
 * app.use('*', httpsRedirect({ excludePaths: ['/health', '/health/ready'] }));
 * ```
 */
export function httpsRedirect(options: HttpsRedirectOptions = {}): MiddlewareHandler {
  const {
    enabled = process.env.NODE_ENV === 'production',
    excludePaths = ['/health', '/health/ready'],
    redirectStatusCode = 301,
  } = options;

  return async (c: Context, next: Next) => {
    // Skip if disabled
    if (!enabled) {
      return next();
    }

    // Skip excluded paths (e.g., health checks for load balancers)
    const path = c.req.path;
    if (excludePaths.includes(path)) {
      return next();
    }

    // Skip if already secure
    if (isSecure(c)) {
      return next();
    }

    // Redirect to HTTPS
    const httpsUrl = buildRedirectUrl(c);
    return c.redirect(httpsUrl, redirectStatusCode);
  };
}
