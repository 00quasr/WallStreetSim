import { serve } from '@hono/node-server';
import { createLogger } from '@wallstreetsim/utils';
import { app } from './app';
import { initSocketServer } from './websocket';

const logger = createLogger({ service: 'api' });

const port = parseInt(process.env.API_PORT || '8080', 10);

logger.info('');
logger.info('╔═══════════════════════════════════════════════════════╗');
logger.info('║         WALLSTREETSIM - API SERVER                    ║');
logger.info('║         THE MARKET NEVER SLEEPS                       ║');
logger.info('╚═══════════════════════════════════════════════════════╝');
logger.info('');

// Create HTTP server with Hono app
const server = serve({
  fetch: app.fetch,
  port,
});

// Initialize Socket.io server alongside HTTP server (synchronously)
// This ensures WebSocket is ready to accept connections as soon as HTTP starts listening
// Enable Redis adapter when SOCKET_REDIS_ADAPTER=true for horizontal scaling
const socketServer = initSocketServer(server, {
  enableRedisAdapter: process.env.SOCKET_REDIS_ADAPTER === 'true',
});
const adapterStatus = socketServer.isRedisAdapterEnabled()
  ? '(Redis adapter enabled for horizontal scaling)'
  : '(single instance mode)';
logger.info({ adapterStatus }, 'Socket.io server initialized');

// Log server info once HTTP server is ready
server.on('listening', () => {
  logger.info({ port }, 'API server running');
  logger.info('');

  logger.info('REST Endpoints:');
  logger.info('  GET  /              - API info');
  logger.info('  GET  /health        - Health check');
  logger.info('  GET  /metrics       - Prometheus metrics');
  logger.info('  POST /auth/register - Register agent');
  logger.info('  POST /auth/verify   - Verify API key');
  logger.info('  GET  /agents        - List agents');
  logger.info('  GET  /agents/:id    - Get agent');
  logger.info('  GET  /market/stocks - List stocks');
  logger.info('  GET  /market/stocks/:symbol - Get stock');
  logger.info('  GET  /market/orderbook/:symbol - Get order book');
  logger.info('  POST /actions       - Submit actions');
  logger.info('  GET  /news          - Get news');
  logger.info('  GET  /world/status  - Get world status');
  logger.info('  GET  /world/tick    - Get current tick');
  logger.info('  GET  /world/leaderboard - Get leaderboard');
  logger.info('');
  logger.info('WebSocket (Socket.io):');
  logger.info({ url: `ws://localhost:${port}` }, 'Connect via Socket.io client');
  logger.info('');
  logger.info('WebSocket Events:');
  logger.info('  AUTH        - Authenticate with API key');
  logger.info('  SUBSCRIBE   - Subscribe to channels (market, symbol:*, tick_updates)');
  logger.info('  UNSUBSCRIBE - Unsubscribe from channels');
  logger.info('  PING        - Keep connection alive');
  logger.info('');
});

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully...');
  await socketServer.close();
  server.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
