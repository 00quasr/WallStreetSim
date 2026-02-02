import { serve } from '@hono/node-server';
import cluster from 'cluster';
import { createLogger, createChildLogger } from '@wallstreetsim/utils';
import { app } from './app';
import { initSocketServer } from './websocket';

// Worker ID for cluster mode logging (0 = primary/fork mode)
const workerId = cluster.isWorker ? cluster.worker?.id ?? 0 : 0;
const baseLogger = createLogger({ service: 'api' });
const logger = createChildLogger(baseLogger, { workerId });

const port = parseInt(process.env.API_PORT || '8080', 10);

// Track shutdown state to prevent double shutdown
let isShuttingDown = false;

logger.info('');
logger.info('╔═══════════════════════════════════════════════════════╗');
logger.info('║         WALLSTREETSIM - API SERVER                    ║');
logger.info('║         THE MARKET NEVER SLEEPS                       ║');
logger.info('╚═══════════════════════════════════════════════════════╝');
logger.info({ workerId, pid: process.pid }, 'Worker starting');

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
  logger.info({ port, workerId, pid: process.pid }, 'API server running');
  logger.info('');

  // Only log full endpoint list from first worker to avoid spam in cluster mode
  if (workerId <= 1) {
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
  }

  // Signal PM2 that the worker is ready to accept connections
  // This is required for PM2 cluster mode with wait_ready: true
  if (typeof process.send === 'function') {
    process.send('ready');
    logger.info({ workerId }, 'Sent ready signal to PM2');
  }
});

// Graceful shutdown handler with connection draining
async function shutdown(signal: string): Promise<void> {
  // Prevent double shutdown
  if (isShuttingDown) {
    logger.info({ signal, workerId }, 'Shutdown already in progress, ignoring signal');
    return;
  }
  isShuttingDown = true;

  logger.info({ signal, workerId, pid: process.pid }, 'Shutting down gracefully...');

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      logger.error({ err, workerId }, 'Error closing HTTP server');
    } else {
      logger.info({ workerId }, 'HTTP server closed');
    }
  });

  try {
    // Close WebSocket connections gracefully
    // This gives clients time to reconnect to other workers
    await socketServer.close();
    logger.info({ workerId }, 'Socket.io server closed');
  } catch (err) {
    logger.error({ err, workerId }, 'Error closing Socket.io server');
  }

  // Give a moment for cleanup then exit
  setTimeout(() => {
    logger.info({ workerId }, 'Shutdown complete');
    process.exit(0);
  }, 100);
}

// Handle PM2 shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle PM2 message for graceful shutdown
process.on('message', (msg) => {
  if (msg === 'shutdown') {
    shutdown('PM2_SHUTDOWN');
  }
});
