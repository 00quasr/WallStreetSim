import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';

import { errorHandler, notFoundHandler } from './middleware/error';
import { rateLimiter } from './middleware/rate-limit';
import { requestIdMiddleware } from './middleware/request-id';

import { auth } from './routes/auth';
import { agentsRouter } from './routes/agents';
import { market } from './routes/market';
import { actionsRouter } from './routes/actions';
import { newsRouter } from './routes/news';
import { world } from './routes/world';
import { config } from './routes/config';
import { skill } from './routes/skill';
import { openapi } from './routes/openapi';
import { recoverRouter } from './routes/recover';
import { health } from './routes/health';
import { metrics } from './routes/metrics';

const app = new Hono();

// Global middleware
// Request ID must come first to wrap all subsequent middleware in async context
app.use('*', requestIdMiddleware());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
}));
app.use('*', errorHandler);

// Rate limiting (applied to all routes)
app.use('*', rateLimiter());

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'WallStreetSim API',
    version: '0.1.0',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

app.route('/health', health);
app.route('/metrics', metrics);

// API routes
app.route('/auth', auth);
app.route('/agents', agentsRouter);
app.route('/market', market);
app.route('/actions', actionsRouter);
app.route('/news', newsRouter);
app.route('/world', world);
app.route('/config', config);
app.route('/', skill);
app.route('/', openapi);
app.route('/api/v1/recover', recoverRouter);

// 404 handler
app.notFound(notFoundHandler);

export { app };
