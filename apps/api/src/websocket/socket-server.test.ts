import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { SocketServer } from './socket-server';

// Mock the Redis adapter with the proper adapter interface
vi.mock('@socket.io/redis-adapter', () => ({
  createAdapter: vi.fn((pub: unknown, sub: unknown) => {
    // Return a function that creates a mock adapter instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function MockRedisAdapter(this: any, nsp: unknown) {
      // Call the base Adapter constructor behavior
      return Object.assign(this, {
        nsp,
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
        _pub: pub,
        _sub: sub,
      });
    };
  }),
}));

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

    it('should emit CONNECTED event with public channel info on connection', async () => {
      const connectedPromise = new Promise<{
        type: string;
        payload: {
          socketId: string;
          authenticated: boolean;
          publicChannels: string[];
          message: string;
        };
        timestamp: string;
      }>((resolve) => {
        clientSocket = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        clientSocket.on('CONNECTED', resolve);
      });

      const result = await connectedPromise;
      expect(result.type).toBe('CONNECTED');
      expect(result.payload.authenticated).toBe(false);
      // New public channels
      expect(result.payload.publicChannels).toContain('tick');
      expect(result.payload.publicChannels).toContain('market:all');
      expect(result.payload.publicChannels).toContain('news');
      expect(result.payload.publicChannels).toContain('leaderboard');
      expect(result.payload.publicChannels).toContain('trades');
      expect(result.payload.publicChannels).toContain('events');
      expect(result.payload.publicChannels).toContain('prices');
      // Legacy channels still supported
      expect(result.payload.publicChannels).toContain('tick_updates');
      expect(result.payload.publicChannels).toContain('market');
      expect(result.payload.socketId).toBeDefined();
    });
  });

  describe('unauthenticated access', () => {
    it('should allow clients to connect without authentication', async () => {
      const client = await connectClient();
      expect(client.connected).toBe(true);
      // Client should not have an auth token but still be connected
    });

    it('should allow unauthenticated clients to subscribe to public channels', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[]; failed?: { channel: string; reason: string }[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      // Subscribe to all public channels without authentication
      client.emit('SUBSCRIBE', { channels: ['market', 'prices', 'news', 'leaderboard', 'tick_updates'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('market');
      expect(result.payload.channels).toContain('prices');
      expect(result.payload.channels).toContain('news');
      expect(result.payload.channels).toContain('leaderboard');
      expect(result.payload.channels).toContain('tick_updates');
      expect(result.payload.failed).toBeUndefined();
    });

    it('should allow unauthenticated clients to subscribe to symbol-specific channels (legacy)', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['symbol:APEX', 'symbol:NOVA', 'symbol:QUANTUM'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('symbol:APEX');
      expect(result.payload.channels).toContain('symbol:NOVA');
      expect(result.payload.channels).toContain('symbol:QUANTUM');
    });

    it('should allow unauthenticated clients to subscribe to market:SYMBOL channels', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['market:APEX', 'market:NOVA', 'market:QUANTUM'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('market:APEX');
      expect(result.payload.channels).toContain('market:NOVA');
      expect(result.payload.channels).toContain('market:QUANTUM');
    });

    it('should allow unauthenticated clients to subscribe to new public channels', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[]; failed?: { channel: string; reason: string }[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      // Subscribe to all new public channels without authentication
      client.emit('SUBSCRIBE', { channels: ['tick', 'market:all', 'news', 'leaderboard', 'trades', 'events'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('tick');
      expect(result.payload.channels).toContain('market:all');
      expect(result.payload.channels).toContain('news');
      expect(result.payload.channels).toContain('leaderboard');
      expect(result.payload.channels).toContain('trades');
      expect(result.payload.channels).toContain('events');
      expect(result.payload.failed).toBeUndefined();
    });

    it('should automatically join tick room on connect', async () => {
      const client = await connectClient();

      // The client should already be in tick room
      // We verify by unsubscribing (which would succeed if subscribed)
      const unsubPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('UNSUBSCRIBED', resolve);
      });

      client.emit('UNSUBSCRIBE', { channels: ['tick'] });

      const result = await unsubPromise;
      expect(result.type).toBe('UNSUBSCRIBED');
      expect(result.payload.channels).toContain('tick');
    });

    it('should automatically join tick_updates room on connect', async () => {
      const client = await connectClient();

      // The client should already be in tick_updates room
      // We verify by unsubscribing (which would fail if not subscribed)
      const unsubPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('UNSUBSCRIBED', resolve);
      });

      client.emit('UNSUBSCRIBE', { channels: ['tick_updates'] });

      const result = await unsubPromise;
      expect(result.type).toBe('UNSUBSCRIBED');
      expect(result.payload.channels).toContain('tick_updates');
    });

    it('should reject unauthenticated clients from private channels', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[]; failed?: { channel: string; reason: string }[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['portfolio', 'orders', 'messages', 'alerts', 'investigations'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toHaveLength(0);
      expect(result.payload.failed).toBeDefined();
      expect(result.payload.failed).toHaveLength(5);
      for (const failure of result.payload.failed!) {
        expect(failure.reason).toContain('Authentication required');
      }
    });

    it('should allow PING/PONG without authentication', async () => {
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

    it('should allow subscribing to prices channel', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['prices'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('prices');
    });

    it('should allow subscribing to news channel', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['news'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('news');
    });

    it('should allow subscribing to leaderboard channel', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['leaderboard'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('leaderboard');
    });

    it('should allow subscribing to trades channel', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['trades'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('trades');
    });

    it('should allow subscribing to events channel', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['events'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('events');
    });

    it('should allow subscribing to market:all channel', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['market:all'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('market:all');
    });

    it('should allow subscribing to tick channel', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['tick'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('tick');
    });

    it('should allow subscribing to market:SYMBOL channels', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['market:AAPL', 'market:GOOG'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('market:AAPL');
      expect(result.payload.channels).toContain('market:GOOG');
    });

    it('should allow subscribing to multiple public channels', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['tick', 'tick_updates', 'prices', 'news', 'leaderboard', 'trades', 'events', 'market:all'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('tick');
      expect(result.payload.channels).toContain('tick_updates');
      expect(result.payload.channels).toContain('prices');
      expect(result.payload.channels).toContain('news');
      expect(result.payload.channels).toContain('leaderboard');
      expect(result.payload.channels).toContain('trades');
      expect(result.payload.channels).toContain('events');
      expect(result.payload.channels).toContain('market:all');
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

    it('should allow unsubscribing from public channels', async () => {
      const client = await connectClient();

      // First subscribe
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['prices', 'news', 'leaderboard'] });
      });

      // Then unsubscribe
      const unsubPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('UNSUBSCRIBED', resolve);
      });

      client.emit('UNSUBSCRIBE', { channels: ['prices', 'news', 'leaderboard'] });

      const result = await unsubPromise;
      expect(result.type).toBe('UNSUBSCRIBED');
      expect(result.payload.channels).toContain('prices');
      expect(result.payload.channels).toContain('news');
      expect(result.payload.channels).toContain('leaderboard');
    });

    it('should allow unsubscribing from new public channels', async () => {
      const client = await connectClient();

      // First subscribe
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['trades', 'events', 'market:all', 'market:AAPL'] });
      });

      // Remove SUBSCRIBED listener before setting up UNSUBSCRIBED
      client.removeAllListeners('SUBSCRIBED');

      // Then unsubscribe
      const unsubPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('UNSUBSCRIBED', resolve);
      });

      client.emit('UNSUBSCRIBE', { channels: ['trades', 'events', 'market:all', 'market:AAPL'] });

      const result = await unsubPromise;
      expect(result.type).toBe('UNSUBSCRIBED');
      expect(result.payload.channels).toContain('trades');
      expect(result.payload.channels).toContain('events');
      expect(result.payload.channels).toContain('market:all');
      expect(result.payload.channels).toContain('market:AAPL');
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

  describe('private channels', () => {
    it('should reject private channel subscription without authentication', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[]; failed?: { channel: string; reason: string }[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['portfolio'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toHaveLength(0);
      expect(result.payload.failed).toBeDefined();
      expect(result.payload.failed).toHaveLength(1);
      expect(result.payload.failed![0].channel).toBe('portfolio');
      expect(result.payload.failed![0].reason).toContain('Authentication required');
    });

    it('should allow private channel subscription after authentication', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Then subscribe to private channel
      const subPromise = new Promise<{ type: string; payload: { channels: string[]; failed?: { channel: string; reason: string }[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['portfolio'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('portfolio');
      expect(result.payload.failed).toBeUndefined();
    });

    it('should allow subscribing to orders private channel', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['orders'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('orders');
    });

    it('should allow subscribing to messages private channel', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['messages'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('messages');
    });

    it('should allow subscribing to alerts private channel', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['alerts'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('alerts');
    });

    it('should allow subscribing to investigations private channel', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['investigations'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('investigations');
    });

    it('should allow subscribing to multiple private channels at once', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['portfolio', 'orders', 'messages', 'alerts', 'investigations'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('portfolio');
      expect(result.payload.channels).toContain('orders');
      expect(result.payload.channels).toContain('messages');
      expect(result.payload.channels).toContain('alerts');
      expect(result.payload.channels).toContain('investigations');
    });

    it('should allow mixed public and private channel subscription when authenticated', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      const subPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['market', 'portfolio', 'prices', 'orders'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('market');
      expect(result.payload.channels).toContain('portfolio');
      expect(result.payload.channels).toContain('prices');
      expect(result.payload.channels).toContain('orders');
    });

    it('should return available private channels in AUTH_SUCCESS', async () => {
      const client = await connectClient();

      const authPromise = new Promise<{ type: string; payload: { agentId: string; privateChannels: string[] } }>((resolve) => {
        client.on('AUTH_SUCCESS', resolve);
      });

      client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });

      const result = await authPromise;
      expect(result.type).toBe('AUTH_SUCCESS');
      expect(result.payload.privateChannels).toBeDefined();
      expect(result.payload.privateChannels).toContain('portfolio');
      expect(result.payload.privateChannels).toContain('orders');
      expect(result.payload.privateChannels).toContain('messages');
      expect(result.payload.privateChannels).toContain('alerts');
      expect(result.payload.privateChannels).toContain('investigations');
    });

    it('should allow unsubscribing from private channels', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Subscribe to private channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['portfolio', 'orders'] });
      });

      // Remove SUBSCRIBED listener before setting up UNSUBSCRIBED
      client.removeAllListeners('SUBSCRIBED');

      // Unsubscribe
      const unsubPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('UNSUBSCRIBED', resolve);
      });

      client.emit('UNSUBSCRIBE', { channels: ['portfolio', 'orders'] });

      const result = await unsubPromise;
      expect(result.type).toBe('UNSUBSCRIBED');
      expect(result.payload.channels).toContain('portfolio');
      expect(result.payload.channels).toContain('orders');
    });
  });

  describe('private event methods', () => {
    it('should have sendPrivateEvent method', () => {
      expect(typeof socketServer.sendPrivateEvent).toBe('function');
    });

    it('should have hasAuthenticatedClients method', () => {
      expect(typeof socketServer.hasAuthenticatedClients).toBe('function');
    });

    it('should return false for hasAuthenticatedClients when no clients', () => {
      expect(socketServer.hasAuthenticatedClients('nonexistent')).toBe(false);
    });

    it('should return true for hasAuthenticatedClients after authentication', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      expect(socketServer.hasAuthenticatedClients('agent123')).toBe(true);
    });
  });

  describe('Redis adapter', () => {
    it('should have isRedisAdapterEnabled method', () => {
      expect(typeof socketServer.isRedisAdapterEnabled).toBe('function');
    });

    it('should return false when Redis adapter is not enabled', () => {
      expect(socketServer.isRedisAdapterEnabled()).toBe(false);
    });

    it('should enable Redis adapter when option is passed', async () => {
      // Close the default server
      if (clientSocket?.connected) {
        clientSocket.disconnect();
      }
      await socketServer.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });

      // Create a new server with Redis adapter enabled
      const adapterHttpServer = createServer();
      const adapterSocketServer = new SocketServer(adapterHttpServer, { enableRedisAdapter: true });

      await new Promise<void>((resolve) => {
        adapterHttpServer.listen(TEST_PORT + 1, resolve);
      });

      expect(adapterSocketServer.isRedisAdapterEnabled()).toBe(true);

      // Cleanup
      await adapterSocketServer.close();
      await new Promise<void>((resolve) => {
        adapterHttpServer.close(() => resolve());
      });

      // Restore original server for subsequent tests
      httpServer = createServer();
      socketServer = new SocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(TEST_PORT, resolve);
      });
    });
  });

  describe('agent:* private channels', () => {
    it('should reject agent channel subscription without authentication', async () => {
      const client = await connectClient();

      const subPromise = new Promise<{ type: string; payload: { channels: string[]; failed?: { channel: string; reason: string }[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      client.emit('SUBSCRIBE', { channels: ['agent:someagent'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toHaveLength(0);
      expect(result.payload.failed).toBeDefined();
      expect(result.payload.failed).toHaveLength(1);
      expect(result.payload.failed![0].channel).toBe('agent:someagent');
      expect(result.payload.failed![0].reason).toContain('Authentication required');
    });

    it('should reject subscription to another agent\'s channel', async () => {
      const client = await connectClient();

      // First authenticate as agent123
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      const subPromise = new Promise<{ type: string; payload: { channels: string[]; failed?: { channel: string; reason: string }[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      // Try to subscribe to a different agent's channel
      client.emit('SUBSCRIBE', { channels: ['agent:differentagent'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toHaveLength(0);
      expect(result.payload.failed).toBeDefined();
      expect(result.payload.failed).toHaveLength(1);
      expect(result.payload.failed![0].channel).toBe('agent:differentagent');
      expect(result.payload.failed![0].reason).toContain('Can only subscribe to own agent channel');
    });

    it('should allow subscription to own agent channel after authentication', async () => {
      const client = await connectClient();

      // First authenticate as agent123
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      const subPromise = new Promise<{ type: string; payload: { channels: string[]; failed?: { channel: string; reason: string }[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      // Subscribe to own agent channel
      client.emit('SUBSCRIBE', { channels: ['agent:agent123'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('agent:agent123');
      expect(result.payload.failed).toBeUndefined();
    });

    it('should allow unsubscribing from own agent channel', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Subscribe to own agent channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['agent:agent123'] });
      });

      // Remove SUBSCRIBED listener before setting up UNSUBSCRIBED
      client.removeAllListeners('SUBSCRIBED');

      // Unsubscribe
      const unsubPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('UNSUBSCRIBED', resolve);
      });

      client.emit('UNSUBSCRIBE', { channels: ['agent:agent123'] });

      const result = await unsubPromise;
      expect(result.type).toBe('UNSUBSCRIBED');
      expect(result.payload.channels).toContain('agent:agent123');
    });

    it('should not allow unsubscribing from another agent\'s channel', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Try to unsubscribe from another agent's channel
      const unsubPromise = new Promise<{ type: string; payload: { channels: string[] } }>((resolve) => {
        client.on('UNSUBSCRIBED', resolve);
      });

      client.emit('UNSUBSCRIBE', { channels: ['agent:differentagent'] });

      const result = await unsubPromise;
      expect(result.type).toBe('UNSUBSCRIBED');
      // Should not include the other agent's channel in the unsubscribed list
      expect(result.payload.channels).not.toContain('agent:differentagent');
    });

    it('should allow mixed public, private, and agent channel subscription when authenticated', async () => {
      const client = await connectClient();

      // First authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      const subPromise = new Promise<{ type: string; payload: { channels: string[]; failed?: { channel: string; reason: string }[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      // Subscribe to public, private, and agent channels
      client.emit('SUBSCRIBE', { channels: ['market', 'portfolio', 'agent:agent123'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('market');
      expect(result.payload.channels).toContain('portfolio');
      expect(result.payload.channels).toContain('agent:agent123');
      expect(result.payload.failed).toBeUndefined();
    });

    it('should reject other agent channels while allowing own in the same request', async () => {
      const client = await connectClient();

      // First authenticate as agent123
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      const subPromise = new Promise<{ type: string; payload: { channels: string[]; failed?: { channel: string; reason: string }[] } }>((resolve) => {
        client.on('SUBSCRIBED', resolve);
      });

      // Try to subscribe to own and other agent channels
      client.emit('SUBSCRIBE', { channels: ['agent:agent123', 'agent:otheragent'] });

      const result = await subPromise;
      expect(result.type).toBe('SUBSCRIBED');
      expect(result.payload.channels).toContain('agent:agent123');
      expect(result.payload.channels).not.toContain('agent:otheragent');
      expect(result.payload.failed).toBeDefined();
      expect(result.payload.failed).toHaveLength(1);
      expect(result.payload.failed![0].channel).toBe('agent:otheragent');
    });
  });
});
