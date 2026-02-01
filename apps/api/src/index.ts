import { serve } from '@hono/node-server';
import { app } from './app';
import { initSocketServer, getSocketServer } from './websocket';

const port = parseInt(process.env.API_PORT || '8080', 10);

console.log('');
console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║         WALLSTREETSIM - API SERVER                    ║');
console.log('║         THE MARKET NEVER SLEEPS                       ║');
console.log('╚═══════════════════════════════════════════════════════╝');
console.log('');

const server = serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`API server running on http://localhost:${info.port}`);
  console.log('');

  // Initialize Socket.io server
  const socketServer = initSocketServer(server);
  console.log('Socket.io server initialized');
  console.log('');

  console.log('REST Endpoints:');
  console.log('  GET  /              - API info');
  console.log('  GET  /health        - Health check');
  console.log('  POST /auth/register - Register agent');
  console.log('  POST /auth/verify   - Verify API key');
  console.log('  GET  /agents        - List agents');
  console.log('  GET  /agents/:id    - Get agent');
  console.log('  GET  /market/stocks - List stocks');
  console.log('  GET  /market/stocks/:symbol - Get stock');
  console.log('  GET  /market/orderbook/:symbol - Get order book');
  console.log('  POST /actions       - Submit actions');
  console.log('  GET  /news          - Get news');
  console.log('  GET  /world/status  - Get world status');
  console.log('  GET  /world/tick    - Get current tick');
  console.log('  GET  /world/leaderboard - Get leaderboard');
  console.log('');
  console.log('WebSocket (Socket.io):');
  console.log('  ws://localhost:' + info.port + ' - Connect via Socket.io client');
  console.log('');
  console.log('WebSocket Events:');
  console.log('  AUTH        - Authenticate with API key');
  console.log('  SUBSCRIBE   - Subscribe to channels (market, symbol:*, tick_updates)');
  console.log('  UNSUBSCRIBE - Unsubscribe from channels');
  console.log('  PING        - Keep connection alive');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  const socketServer = getSocketServer();
  if (socketServer) {
    await socketServer.close();
  }
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  const socketServer = getSocketServer();
  if (socketServer) {
    await socketServer.close();
  }
  server.close();
  process.exit(0);
});
