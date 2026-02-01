import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Server as HttpServer } from 'http';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { SocketServer } from './websocket';

// Mock ioredis for tests
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      subscribe: vi.fn(),
      on: vi.fn(),
      quit: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

// Mock Redis adapter
vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn(() => {
    return function MockRedisAdapter(this: unknown) {
      return Object.assign(this as object, {
        rooms: new Map(),
        sids: new Map(),
        init: vi.fn(),
        close: vi.fn(),
        addAll: vi.fn(),
        del: vi.fn(),
        delAll: vi.fn(),
        broadcast: vi.fn(),
        serverSideEmit: vi.fn(),
        fetchSockets: vi.fn().mockResolvedValue([]),
        addSockets: vi.fn(),
        delSockets: vi.fn(),
        disconnectSockets: vi.fn(),
        serverCount: vi.fn().mockResolvedValue(1),
      });
    };
  }),
}));

describe('API Server with Socket.io Integration', () => {
  const TEST_PORT = 9998;
  let httpServer: HttpServer;
  let socketServer: SocketServer;
  let clientSocket: ClientSocket;

  beforeEach(async () => {
    const app = new Hono();
    app.get('/health', (c) => c.json({ status: 'ok' }));

    // Mimic the startup pattern from index.ts:
    // Create HTTP server and initialize Socket.io synchronously
    httpServer = serve({
      fetch: app.fetch,
      port: TEST_PORT,
    });

    // Socket.io should be initialized alongside HTTP server (not in callback)
    // Use SocketServer class directly to avoid singleton interference
    socketServer = new SocketServer(httpServer);

    // Wait for server to be listening
    await new Promise<void>((resolve) => {
      if (httpServer.listening) {
        resolve();
      } else {
        httpServer.on('listening', resolve);
      }
    });
  });

  afterEach(async () => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
    await socketServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  function connectClient(): Promise<ClientSocket> {
    return new Promise((resolve) => {
      clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });
      clientSocket.on('connect', () => resolve(clientSocket));
    });
  }

  describe('Synchronous initialization', () => {
    it('should have Socket.io server ready before HTTP starts listening', async () => {
      // The socketServer should exist and be functional
      expect(socketServer).toBeDefined();
      expect(socketServer.getIO()).toBeDefined();
    });

    it('should accept WebSocket connections immediately after server starts', async () => {
      const client = await connectClient();
      expect(client.connected).toBe(true);
    });

    it('should handle WebSocket events immediately after server starts', async () => {
      const client = await connectClient();

      const pongPromise = new Promise<{ type: string }>((resolve) => {
        client.on('PONG', resolve);
      });

      client.emit('PING');

      const result = await pongPromise;
      expect(result.type).toBe('PONG');
    });
  });

  describe('HTTP and WebSocket coexistence', () => {
    it('should serve both HTTP and WebSocket on the same port', async () => {
      // Test HTTP
      const httpResponse = await fetch(`http://localhost:${TEST_PORT}/health`);
      expect(httpResponse.ok).toBe(true);
      const data = await httpResponse.json();
      expect(data.status).toBe('ok');

      // Test WebSocket
      const client = await connectClient();
      expect(client.connected).toBe(true);
    });

    it('should allow multiple WebSocket clients alongside HTTP requests', async () => {
      const client1 = await connectClient();
      const client2Promise = new Promise<ClientSocket>((resolve) => {
        const c2 = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        c2.on('connect', () => resolve(c2));
      });
      const client2 = await client2Promise;

      expect(client1.connected).toBe(true);
      expect(client2.connected).toBe(true);

      // HTTP should still work
      const httpResponse = await fetch(`http://localhost:${TEST_PORT}/health`);
      expect(httpResponse.ok).toBe(true);

      // Cleanup client2
      client2.disconnect();
    });
  });

  describe('Connection count tracking', () => {
    it('should track connected WebSocket clients', async () => {
      expect(socketServer.getConnectedCount()).toBe(0);

      const client = await connectClient();
      expect(client.connected).toBe(true);
      expect(socketServer.getConnectedCount()).toBe(1);
    });
  });
});
