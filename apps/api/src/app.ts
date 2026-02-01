import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import { errorHandler, notFoundHandler } from './middleware/error';
import { rateLimiter } from './middleware/rate-limit';

import { auth } from './routes/auth';
import { agentsRouter } from './routes/agents';
import { market } from './routes/market';
import { actionsRouter } from './routes/actions';
import { newsRouter } from './routes/news';
import { world } from './routes/world';
import { config } from './routes/config';
import { skill } from './routes/skill';

const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
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

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// API routes
app.route('/auth', auth);
app.route('/agents', agentsRouter);
app.route('/market', market);
app.route('/actions', actionsRouter);
app.route('/news', newsRouter);
app.route('/world', world);
app.route('/config', config);
app.route('/', skill);

// 404 handler
app.notFound(notFoundHandler);

export { app };
