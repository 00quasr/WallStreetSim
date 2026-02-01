import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { SocketServer } from './socket-server';

describe('SocketServer', () => {
  let httpServer: HttpServer;
  let socketServer: SocketServer;
  let clientSocket: ClientSocket;
  const TEST_PORT = 9999;

  beforeAll(() => {
    // Mock Redis - we don't need actual Redis for these tests
    vi.mock('ioredis', () => {
      return {
        default: vi.fn().mockImplementation(() => ({
          subscribe: vi.fn(),
          on: vi.fn(),
          quit: vi.fn().mockResolvedValue(undefined),
        })),
      };
    });
  });

  beforeEach(async () => {
    httpServer = createServer();
    socketServer = new SocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, resolve);
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

  describe('connection', () => {
    it('should accept client connections', async () => {
      const client = await connectClient();
      expect(client.connected).toBe(true);
    });

    it('should track connected clients count', async () => {
      await connectClient();
      expect(socketServer.getConnectedCount()).toBe(1);
    });
  });

  describe('PING/PONG', () => {
    it('should respond to PING with PONG', async () => {
      const client = await connectClient();

      const pongPromise = new Promise<{ type: string; timestamp: string }>((resolve) => {
        client.on('PONG', resolve);
      });

      client.emit('PING');

      const pong = await pongPromise;
      expect(pong.type).toBe('PONG');
      expect(pong.timestamp).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('should authenticate with valid API key', async () => {
      const client = await connectClient();

      const authPromise = new Promise<{ type: string; payload: { agentId: string } }>((resolve) => {
        client.on('AUTH_SUCCESS', resolve);
      });

      client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });

      const result = await authPromise;
      expect(result.type).toBe('AUTH_SUCCESS');
      expect(result.payload.agentId).toBe('agent123');
    });

    it('should reject empty API key', async () => {
      const client = await connectClient();

      const errorPromise = new Promise<{ type: string; payload: { message: string } }>((resolve) => {
        client.on('AUTH_ERROR', resolve);
      });

      client.emit('AUTH', { apiKey: '' });

      const result = await errorPromise;
      expect(result.type).toBe('AUTH_ERROR');
      expect(result.payload.message).toBe('Invalid API key');
    });
  });

  describe('subscriptions', () => {
    it('should allow subscribing to channels', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['market', 'symbol:AAPL'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('market');
      expect(result.payload.channels).toContain('symbol:AAPL');
    });

    it('should allow unsubscribing from channels', async () => {
      const client = await connectClient();

      // First subscribe
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['market'] });
      });

      // Then unsubscribe
      const unsubPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('UNSUBSCRIBED', resolve);
      });

      client.emit('UNSUBSCRIBE', { channels: ['market'] });

      const result = await unsubPromise;
      expect(result.type).toBe('UNSUBSCRIBED');
      expect(result.payload.channels).toContain('market');
    });
  });

  describe('broadcasting', () => {
    it('should have broadcast method', () => {
      expect(typeof socketServer.broadcast).toBe('function');
    });

    it('should have sendToAgent method', () => {
      expect(typeof socketServer.sendToAgent).toBe('function');
    });
  });

  describe('Socket.io server instance', () => {
    it('should return the io instance', () => {
      const io = socketServer.getIO();
      expect(io).toBeDefined();
    });
  });
});
