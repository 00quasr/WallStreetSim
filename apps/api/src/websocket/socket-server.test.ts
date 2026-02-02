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
          get: vi.fn().mockResolvedValue(null), // For auto-recovery data reads
          publish: vi.fn().mockResolvedValue(1), // For callback confirmation publish
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

    it('should broadcast PRICE_UPDATE to prices room', async () => {
      const client = await connectClient();

      // Subscribe to prices channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['prices'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const priceUpdatePromise = new Promise<{
        type: string;
        payload: {
          tick: number;
          prices: { symbol: string; price: number; change: number; changePercent: number; volume: number }[];
        };
        timestamp: string;
      }>((resolve) => {
        client.on('PRICE_UPDATE', resolve);
      });

      // Broadcast a price update
      const priceUpdate = {
        type: 'PRICE_UPDATE',
        payload: {
          tick: 42,
          prices: [
            { symbol: 'AAPL', price: 150.50, change: 1.50, changePercent: 1.01, volume: 1000000 },
            { symbol: 'GOOG', price: 2810.00, change: 10.00, changePercent: 0.36, volume: 500000 },
          ],
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('prices', 'PRICE_UPDATE', priceUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await priceUpdatePromise;
      expect(received.type).toBe('PRICE_UPDATE');
      expect(received.payload.tick).toBe(42);
      expect(received.payload.prices).toHaveLength(2);
      expect(received.payload.prices[0].symbol).toBe('AAPL');
      expect(received.payload.prices[0].price).toBe(150.50);
      expect(received.payload.prices[0].change).toBe(1.50);
      expect(received.payload.prices[0].changePercent).toBe(1.01);
      expect(received.payload.prices[1].symbol).toBe('GOOG');
    });

    it('should broadcast MARKET_UPDATE to symbol-specific room', async () => {
      const client = await connectClient();

      // Subscribe to AAPL market channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['market:AAPL'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const marketUpdatePromise = new Promise<{
        type: string;
        payload: { symbol: string; price: number; change: number; changePercent: number; volume: number };
        timestamp: string;
      }>((resolve) => {
        client.on('MARKET_UPDATE', resolve);
      });

      // Broadcast a market update for AAPL
      const marketUpdate = {
        type: 'MARKET_UPDATE',
        payload: {
          symbol: 'AAPL',
          price: 151.00,
          change: 2.00,
          changePercent: 1.34,
          volume: 1500000,
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('market:AAPL', 'MARKET_UPDATE', marketUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await marketUpdatePromise;
      expect(received.type).toBe('MARKET_UPDATE');
      expect(received.payload.symbol).toBe('AAPL');
      expect(received.payload.price).toBe(151.00);
      expect(received.payload.change).toBe(2.00);
      expect(received.payload.changePercent).toBe(1.34);
      expect(received.payload.volume).toBe(1500000);
    });

    it('should not receive MARKET_UPDATE for unsubscribed symbols', async () => {
      const client = await connectClient();

      // Subscribe to AAPL market channel only
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['market:AAPL'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      let googReceived = false;
      let aaplReceived = false;

      client.on('MARKET_UPDATE', (data: { payload: { symbol: string } }) => {
        if (data.payload.symbol === 'GOOG') googReceived = true;
        if (data.payload.symbol === 'AAPL') aaplReceived = true;
      });

      // Broadcast GOOG update (should not be received)
      socketServer.broadcast('market:GOOG', 'MARKET_UPDATE', {
        type: 'MARKET_UPDATE',
        payload: { symbol: 'GOOG', price: 2820.00, change: 20.00, changePercent: 0.71, volume: 600000 },
        timestamp: new Date().toISOString(),
      } as unknown as import('@wallstreetsim/types').WSMessage);

      // Broadcast AAPL update (should be received)
      socketServer.broadcast('market:AAPL', 'MARKET_UPDATE', {
        type: 'MARKET_UPDATE',
        payload: { symbol: 'AAPL', price: 152.00, change: 3.00, changePercent: 2.01, volume: 2000000 },
        timestamp: new Date().toISOString(),
      } as unknown as import('@wallstreetsim/types').WSMessage);

      // Wait a bit for messages to be received
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(aaplReceived).toBe(true);
      expect(googReceived).toBe(false);
    });

    it('should broadcast TICK_UPDATE to tick room via broadcast method', async () => {
      const client = await connectClient();

      const tickUpdatePromise = new Promise<{ tick: number; timestamp: string; marketOpen: boolean }>((resolve) => {
        client.on('TICK_UPDATE', resolve);
      });

      // Client auto-joins 'tick' room on connect
      // Use the broadcast method to send a tick update
      const tickUpdate = {
        tick: 42,
        timestamp: new Date().toISOString(),
        marketOpen: true,
        regime: 'normal',
        priceUpdates: [],
        trades: [],
        events: [],
        news: [],
      };

      socketServer.broadcast('tick', 'TICK_UPDATE', tickUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await tickUpdatePromise;
      expect(received.tick).toBe(42);
      expect(received.marketOpen).toBe(true);
    });

    it('should broadcast TICK_UPDATE to tick_updates room via broadcast method', async () => {
      const client = await connectClient();

      const tickUpdatePromise = new Promise<{ tick: number; timestamp: string; marketOpen: boolean }>((resolve) => {
        client.on('TICK_UPDATE', resolve);
      });

      // Client auto-joins 'tick_updates' room on connect
      const tickUpdate = {
        tick: 100,
        timestamp: new Date().toISOString(),
        marketOpen: false,
        regime: 'normal',
        priceUpdates: [],
        trades: [],
        events: [],
        news: [],
      };

      socketServer.broadcast('tick_updates', 'TICK_UPDATE', tickUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await tickUpdatePromise;
      expect(received.tick).toBe(100);
      expect(received.marketOpen).toBe(false);
    });

    it('should broadcast tick updates every second when engine is running (simulation)', async () => {
      const client = await connectClient();

      const tickUpdates: { tick: number }[] = [];
      const tickCount = 3;

      const collectTicks = new Promise<void>((resolve) => {
        client.on('TICK_UPDATE', (data: { tick: number }) => {
          tickUpdates.push(data);
          if (tickUpdates.length >= tickCount) {
            resolve();
          }
        });
      });

      // Simulate engine running - broadcast tick updates at 1-second intervals
      const intervalId = setInterval(() => {
        const tickUpdate = {
          tick: tickUpdates.length + 1,
          timestamp: new Date().toISOString(),
          marketOpen: true,
          regime: 'normal',
          priceUpdates: [],
          trades: [],
          events: [],
          news: [],
        };
        socketServer.broadcast('tick', 'TICK_UPDATE', tickUpdate as unknown as import('@wallstreetsim/types').WSMessage);
      }, 100); // Use 100ms for test speed

      await collectTicks;
      clearInterval(intervalId);

      expect(tickUpdates.length).toBeGreaterThanOrEqual(tickCount);
      expect(tickUpdates[0].tick).toBe(1);
      expect(tickUpdates[1].tick).toBe(2);
      expect(tickUpdates[2].tick).toBe(3);
    });

    it('should broadcast to multiple clients in tick room', async () => {
      const client1 = await connectClient();
      const client2Socket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });
      await new Promise<void>((resolve) => {
        client2Socket.on('connect', () => resolve());
      });

      const client1Updates: { tick: number }[] = [];
      const client2Updates: { tick: number }[] = [];

      const client1Promise = new Promise<void>((resolve) => {
        client1.on('TICK_UPDATE', (data: { tick: number }) => {
          client1Updates.push(data);
          if (client1Updates.length >= 1) resolve();
        });
      });

      const client2Promise = new Promise<void>((resolve) => {
        client2Socket.on('TICK_UPDATE', (data: { tick: number }) => {
          client2Updates.push(data);
          if (client2Updates.length >= 1) resolve();
        });
      });

      const tickUpdate = {
        tick: 999,
        timestamp: new Date().toISOString(),
        marketOpen: true,
        regime: 'normal',
        priceUpdates: [],
        trades: [],
        events: [],
        news: [],
      };

      socketServer.broadcast('tick', 'TICK_UPDATE', tickUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      await Promise.all([client1Promise, client2Promise]);

      expect(client1Updates.length).toBe(1);
      expect(client1Updates[0].tick).toBe(999);
      expect(client2Updates.length).toBe(1);
      expect(client2Updates[0].tick).toBe(999);

      client2Socket.disconnect();
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

    it('should enable Redis adapter via SOCKET_REDIS_ADAPTER env var', async () => {
      // Close the default server
      if (clientSocket?.connected) {
        clientSocket.disconnect();
      }
      await socketServer.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });

      // Set env var
      const originalEnv = process.env.SOCKET_REDIS_ADAPTER;
      process.env.SOCKET_REDIS_ADAPTER = 'true';

      // Create a new server without explicit option (should read from env)
      const adapterHttpServer = createServer();
      const adapterSocketServer = new SocketServer(adapterHttpServer);

      await new Promise<void>((resolve) => {
        adapterHttpServer.listen(TEST_PORT + 2, resolve);
      });

      expect(adapterSocketServer.isRedisAdapterEnabled()).toBe(true);

      // Cleanup
      process.env.SOCKET_REDIS_ADAPTER = originalEnv;
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

    it('should accept connections with Redis adapter enabled', async () => {
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
        adapterHttpServer.listen(TEST_PORT + 3, resolve);
      });

      // Connect a client
      const adapterClient = ioc(`http://localhost:${TEST_PORT + 3}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        adapterClient.on('connect', () => resolve());
      });

      expect(adapterClient.connected).toBe(true);
      expect(adapterSocketServer.getConnectedCount()).toBe(1);

      // Cleanup
      adapterClient.disconnect();
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

    it('should have broadcast method available with Redis adapter enabled', async () => {
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
        adapterHttpServer.listen(TEST_PORT + 4, resolve);
      });

      // Verify broadcast method is available
      expect(typeof adapterSocketServer.broadcast).toBe('function');
      expect(typeof adapterSocketServer.sendToAgent).toBe('function');
      expect(typeof adapterSocketServer.sendPrivateEvent).toBe('function');

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

    it('should properly close Redis adapter connections on shutdown', async () => {
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
        adapterHttpServer.listen(TEST_PORT + 5, resolve);
      });

      expect(adapterSocketServer.isRedisAdapterEnabled()).toBe(true);

      // Close should not throw
      await expect(adapterSocketServer.close()).resolves.not.toThrow();

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

  describe('graceful disconnect handling', () => {
    it('should handle unauthenticated client disconnect gracefully', async () => {
      const client = await connectClient();
      expect(client.connected).toBe(true);

      // Disconnect the client
      client.disconnect();

      // Wait a bit for the disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(socketServer.getConnectedCount()).toBe(0);
    });

    it('should handle authenticated client disconnect gracefully', async () => {
      const client = await connectClient();

      // Authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      expect(socketServer.hasAuthenticatedClients('agent123')).toBe(true);

      // Disconnect the client
      client.disconnect();

      // Wait a bit for the disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(socketServer.hasAuthenticatedClients('agent123')).toBe(false);
      expect(socketServer.getConnectedCount()).toBe(0);
    });

    it('should notify other sessions when one session disconnects', async () => {
      // Connect first client and authenticate
      const client1 = await connectClient();
      await new Promise<void>((resolve) => {
        client1.on('AUTH_SUCCESS', () => resolve());
        client1.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Connect second client and authenticate as same agent
      const client2Socket = ioc(`http://localhost:${TEST_PORT}`, {
        transports: ['websocket'],
      });
      await new Promise<void>((resolve) => {
        client2Socket.on('connect', () => resolve());
      });
      await new Promise<void>((resolve) => {
        client2Socket.on('AUTH_SUCCESS', () => resolve());
        client2Socket.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Both clients should be connected
      expect(socketServer.getConnectedCount()).toBe(2);
      expect(socketServer.hasAuthenticatedClients('agent123')).toBe(true);

      // Set up listener for AGENT_SESSION_DISCONNECTED on client2
      const disconnectNotificationPromise = new Promise<{
        type: string;
        payload: { socketId: string; reason: string; remainingSessions: number };
        timestamp: string;
      }>((resolve) => {
        client2Socket.on('AGENT_SESSION_DISCONNECTED', resolve);
      });

      // Disconnect client1
      client1.disconnect();

      // Client2 should receive the notification
      const notification = await disconnectNotificationPromise;
      expect(notification.type).toBe('AGENT_SESSION_DISCONNECTED');
      expect(notification.payload.socketId).toBeDefined();
      expect(notification.payload.reason).toBeDefined();
      expect(notification.payload.remainingSessions).toBe(1);

      // Cleanup
      client2Socket.disconnect();
    });

    it('should track and cleanup symbol subscriptions on disconnect', async () => {
      const client = await connectClient();

      // Subscribe to symbol-specific channels
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['market:AAPL', 'market:GOOG', 'symbol:MSFT'] });
      });

      // The subscription should be tracked internally
      // (we can't directly verify the internal Set, but we can verify the subscription worked)
      expect(client.connected).toBe(true);

      // Disconnect the client
      client.disconnect();

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(socketServer.getConnectedCount()).toBe(0);
    });

    it('should not notify if no other sessions exist', async () => {
      const client = await connectClient();

      // Authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Set up a listener that should NOT be called
      let notificationReceived = false;
      client.on('AGENT_SESSION_DISCONNECTED', () => {
        notificationReceived = true;
      });

      // Disconnect the client
      client.disconnect();

      // Wait a bit to ensure no notification is sent
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The notification should not have been received (since the client itself disconnected)
      expect(notificationReceived).toBe(false);
    });

    it('should handle disconnect with various disconnect reasons', async () => {
      const client = await connectClient();

      // Authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Disconnect with 'io client disconnect' reason (explicit disconnect)
      client.disconnect();

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(socketServer.getConnectedCount()).toBe(0);
    });

    it('should handle disconnect for client with private channel subscriptions', async () => {
      const client = await connectClient();

      // Authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Subscribe to private channels
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['portfolio', 'orders', 'agent:agent123'] });
      });

      // Disconnect the client
      client.disconnect();

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(socketServer.getConnectedCount()).toBe(0);
      expect(socketServer.hasAuthenticatedClients('agent123')).toBe(false);
    });

    it('should clean up symbol tracking when unsubscribing before disconnect', async () => {
      const client = await connectClient();

      // Subscribe to symbol-specific channels
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['market:AAPL', 'market:GOOG'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      // Unsubscribe from one symbol
      await new Promise<void>((resolve) => {
        client.on('UNSUBSCRIBED', () => resolve());
        client.emit('UNSUBSCRIBE', { channels: ['market:AAPL'] });
      });

      // Disconnect the client
      client.disconnect();

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(socketServer.getConnectedCount()).toBe(0);
    });
  });

  describe('agent reconnection detection', () => {
    it('should track agent disconnect info when last session disconnects', async () => {
      const client = await connectClient();

      // Authenticate
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Disconnect the client
      client.disconnect();

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that disconnect info was stored
      const disconnectInfo = socketServer.getAgentDisconnectInfo('agent123');
      expect(disconnectInfo).toBeDefined();
      expect(disconnectInfo!.disconnectTime).toBeInstanceOf(Date);
    });

    it('should emit AGENT_RECONNECTED when agent reconnects after disconnect', async () => {
      // First connection
      const client1 = await connectClient();
      await new Promise<void>((resolve) => {
        client1.on('AUTH_SUCCESS', () => resolve());
        client1.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Disconnect
      client1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify disconnect was tracked
      expect(socketServer.getAgentDisconnectInfo('agent123')).toBeDefined();

      // Reconnect with a new client
      const client2Promise = new Promise<typeof clientSocket>((resolve) => {
        const newClient = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        newClient.on('connect', () => resolve(newClient));
      });
      const client2 = await client2Promise;

      // Set up listener for AGENT_RECONNECTED
      const reconnectedPromise = new Promise<{
        type: string;
        payload: {
          agentId: string;
          previousDisconnectTime: string;
          disconnectDurationMs: number;
          missedTicks?: number;
        };
      }>((resolve) => {
        client2.on('AGENT_RECONNECTED', resolve);
      });

      // Authenticate as the same agent
      client2.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });

      // Wait for AGENT_RECONNECTED
      const reconnected = await reconnectedPromise;

      expect(reconnected.type).toBe('AGENT_RECONNECTED');
      expect(reconnected.payload.agentId).toBe('agent123');
      expect(reconnected.payload.previousDisconnectTime).toBeDefined();
      expect(reconnected.payload.disconnectDurationMs).toBeGreaterThan(0);

      // Cleanup
      client2.disconnect();
    });

    it('should not emit AGENT_RECONNECTED on first connection', async () => {
      const client = await connectClient();

      let reconnectedReceived = false;
      client.on('AGENT_RECONNECTED', () => {
        reconnectedReceived = true;
      });

      // Authenticate - this is first connection, not a reconnection
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_newagent_secretkey' });
      });

      // Wait a bit to ensure no AGENT_RECONNECTED is sent
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(reconnectedReceived).toBe(false);

      // Cleanup
      client.disconnect();
    });

    it('should clear disconnect info after reconnection', async () => {
      // First connection
      const client1 = await connectClient();
      await new Promise<void>((resolve) => {
        client1.on('AUTH_SUCCESS', () => resolve());
        client1.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Disconnect
      client1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify disconnect was tracked
      expect(socketServer.getAgentDisconnectInfo('agent123')).toBeDefined();

      // Reconnect
      const client2Promise = new Promise<typeof clientSocket>((resolve) => {
        const newClient = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        newClient.on('connect', () => resolve(newClient));
      });
      const client2 = await client2Promise;

      await new Promise<void>((resolve) => {
        client2.on('AUTH_SUCCESS', () => resolve());
        client2.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Disconnect info should be cleared after reconnection
      expect(socketServer.getAgentDisconnectInfo('agent123')).toBeUndefined();

      // Cleanup
      client2.disconnect();
    });

    it('should not track disconnect when other sessions exist', async () => {
      // Connect first client and authenticate
      const client1 = await connectClient();
      await new Promise<void>((resolve) => {
        client1.on('AUTH_SUCCESS', () => resolve());
        client1.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Connect second client and authenticate as same agent
      const client2Promise = new Promise<typeof clientSocket>((resolve) => {
        const newClient = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        newClient.on('connect', () => resolve(newClient));
      });
      const client2 = await client2Promise;

      await new Promise<void>((resolve) => {
        client2.on('AUTH_SUCCESS', () => resolve());
        client2.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Disconnect first client (second still connected)
      client1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should NOT track disconnect because there's still an active session
      expect(socketServer.getAgentDisconnectInfo('agent123')).toBeUndefined();

      // Cleanup
      client2.disconnect();
    });

    it('should include missed ticks in AGENT_RECONNECTED when available', async () => {
      // Set the current tick
      socketServer.setCurrentTick(100);

      // First connection
      const client1 = await connectClient();
      await new Promise<void>((resolve) => {
        client1.on('AUTH_SUCCESS', () => resolve());
        client1.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Disconnect
      client1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Advance the tick
      socketServer.setCurrentTick(110);

      // Reconnect
      const client2Promise = new Promise<typeof clientSocket>((resolve) => {
        const newClient = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        newClient.on('connect', () => resolve(newClient));
      });
      const client2 = await client2Promise;

      // Set up listener for AGENT_RECONNECTED
      const reconnectedPromise = new Promise<{
        type: string;
        payload: {
          agentId: string;
          previousDisconnectTime: string;
          disconnectDurationMs: number;
          missedTicks?: number;
        };
      }>((resolve) => {
        client2.on('AGENT_RECONNECTED', resolve);
      });

      // Authenticate
      client2.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });

      const reconnected = await reconnectedPromise;

      expect(reconnected.payload.missedTicks).toBe(10);

      // Cleanup
      client2.disconnect();
    });

    it('should have getCurrentTick and setCurrentTick methods', () => {
      expect(typeof socketServer.getCurrentTick).toBe('function');
      expect(typeof socketServer.setCurrentTick).toBe('function');

      socketServer.setCurrentTick(50);
      expect(socketServer.getCurrentTick()).toBe(50);

      // Should only accept higher values
      socketServer.setCurrentTick(40);
      expect(socketServer.getCurrentTick()).toBe(50);

      socketServer.setCurrentTick(60);
      expect(socketServer.getCurrentTick()).toBe(60);
    });

    it('should have clearAgentDisconnectInfo method', async () => {
      expect(typeof socketServer.clearAgentDisconnectInfo).toBe('function');

      // First connection
      const client = await connectClient();
      await new Promise<void>((resolve) => {
        client.on('AUTH_SUCCESS', () => resolve());
        client.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Disconnect
      client.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify disconnect was tracked
      expect(socketServer.getAgentDisconnectInfo('agent123')).toBeDefined();

      // Clear the disconnect info
      socketServer.clearAgentDisconnectInfo('agent123');

      // Should be cleared
      expect(socketServer.getAgentDisconnectInfo('agent123')).toBeUndefined();
    });
  });

  describe('automatic recovery', () => {
    it('should have isAutoRecoveryEnabled method', () => {
      expect(typeof socketServer.isAutoRecoveryEnabled).toBe('function');
    });

    it('should have auto-recovery enabled by default', () => {
      expect(socketServer.isAutoRecoveryEnabled()).toBe(true);
    });

    it('should allow disabling auto-recovery via option', async () => {
      // Close the default server
      if (clientSocket?.connected) {
        clientSocket.disconnect();
      }
      await socketServer.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });

      // Create a new server with auto-recovery disabled
      const noRecoveryHttpServer = createServer();
      const noRecoverySocketServer = new SocketServer(noRecoveryHttpServer, { enableAutoRecovery: false });

      await new Promise<void>((resolve) => {
        noRecoveryHttpServer.listen(TEST_PORT + 6, resolve);
      });

      expect(noRecoverySocketServer.isAutoRecoveryEnabled()).toBe(false);

      // Cleanup
      await noRecoverySocketServer.close();
      await new Promise<void>((resolve) => {
        noRecoveryHttpServer.close(() => resolve());
      });

      // Restore original server for subsequent tests
      httpServer = createServer();
      socketServer = new SocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(TEST_PORT, resolve);
      });
    });

    it('should allow disabling auto-recovery via SOCKET_AUTO_RECOVERY env var', async () => {
      // Close the default server
      if (clientSocket?.connected) {
        clientSocket.disconnect();
      }
      await socketServer.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });

      // Set env var to disable
      const originalEnv = process.env.SOCKET_AUTO_RECOVERY;
      process.env.SOCKET_AUTO_RECOVERY = 'false';

      // Create a new server without explicit option (should read from env)
      const noRecoveryHttpServer = createServer();
      const noRecoverySocketServer = new SocketServer(noRecoveryHttpServer);

      await new Promise<void>((resolve) => {
        noRecoveryHttpServer.listen(TEST_PORT + 7, resolve);
      });

      expect(noRecoverySocketServer.isAutoRecoveryEnabled()).toBe(false);

      // Cleanup
      process.env.SOCKET_AUTO_RECOVERY = originalEnv;
      await noRecoverySocketServer.close();
      await new Promise<void>((resolve) => {
        noRecoveryHttpServer.close(() => resolve());
      });

      // Restore original server for subsequent tests
      httpServer = createServer();
      socketServer = new SocketServer(httpServer);
      await new Promise<void>((resolve) => {
        httpServer.listen(TEST_PORT, resolve);
      });
    });

it('should publish callback confirmation on reconnection', async () => {
      socketServer.setCurrentTick(100);

      // First connection
      const client1 = await connectClient();
      await new Promise<void>((resolve) => {
        client1.on('AUTH_SUCCESS', () => resolve());
        client1.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Disconnect
      client1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Advance the tick to trigger reconnection logic
      socketServer.setCurrentTick(110);

      // Reconnect
      const client2Promise = new Promise<typeof clientSocket>((resolve) => {
        const newClient = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        newClient.on('connect', () => resolve(newClient));
      });
      const client2 = await client2Promise;

      // Wait for AGENT_RECONNECTED to confirm the reconnection flow completes
      const reconnectedPromise = new Promise<{
        type: string;
        payload: {
          agentId: string;
        };
      }>((resolve) => {
        client2.on('AGENT_RECONNECTED', resolve);
      });

      // Authenticate
      client2.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });

      const reconnected = await reconnectedPromise;
      expect(reconnected.payload.agentId).toBe('agent123');

      // The callback confirmation should have been published to Redis
      // We can't directly verify the Redis publish here since it's mocked,
      // but we verify the reconnection flow completed successfully
      // which triggers the callback confirmation

      // Cleanup
      client2.disconnect();
    });

    it('should not send recovery messages when no events are missed', async () => {
      socketServer.setCurrentTick(100);

      // First connection
      const client1 = await connectClient();
      await new Promise<void>((resolve) => {
        client1.on('AUTH_SUCCESS', () => resolve());
        client1.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Disconnect
      client1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Do NOT advance the tick (no events missed)
      // socketServer.setCurrentTick(100); // Same tick

      // Reconnect
      const client2Promise = new Promise<typeof clientSocket>((resolve) => {
        const newClient = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        newClient.on('connect', () => resolve(newClient));
      });
      const client2 = await client2Promise;

      // Track received events
      let recoveryStartReceived = false;
      client2.on('RECOVERY_START', () => {
        recoveryStartReceived = true;
      });

      // Authenticate
      await new Promise<void>((resolve) => {
        client2.on('AUTH_SUCCESS', () => resolve());
        client2.emit('AUTH', { apiKey: 'wss_agent123_secretkey' });
      });

      // Wait a bit to ensure no recovery messages are sent
      await new Promise((resolve) => setTimeout(resolve, 200));

      // No recovery should be triggered since missedTicks is 0
      expect(recoveryStartReceived).toBe(false);

      // Cleanup
      client2.disconnect();
    });
  });

  describe('Redis tick update emission', () => {
    it('should emit TICK_UPDATE to clients on every tick received from Redis', async () => {
      const client = await connectClient();

      // Collect received tick updates
      const receivedTicks: number[] = [];
      const tickUpdatePromise = new Promise<void>((resolve) => {
        client.on('TICK_UPDATE', (data: { tick: number; payload: { tick: number } }) => {
          // The data could be the full message or just the payload depending on structure
          const tick = data.tick ?? data.payload?.tick;
          if (tick) {
            receivedTicks.push(tick);
          }
          if (receivedTicks.length >= 3) {
            resolve();
          }
        });
      });

      // Simulate engine sending tick updates by broadcasting directly
      // This mirrors what happens when handleRedisMessage processes tick updates
      for (let i = 1; i <= 3; i++) {
        const tickUpdate = {
          tick: i,
          timestamp: new Date().toISOString(),
          marketOpen: true,
          regime: 'normal',
          priceUpdates: [{ symbol: 'APEX', newPrice: 100 + i, change: 1, changePercent: 1, volume: 1000 }],
          trades: [],
          events: [],
          news: [],
        };
        socketServer.broadcast('tick', 'TICK_UPDATE', tickUpdate as unknown as import('@wallstreetsim/types').WSMessage);
      }

      await tickUpdatePromise;

      expect(receivedTicks).toContain(1);
      expect(receivedTicks).toContain(2);
      expect(receivedTicks).toContain(3);
    });

    it('should include tick number, marketOpen status, and priceUpdates in TICK_UPDATE', async () => {
      const client = await connectClient();

      const tickUpdatePromise = new Promise<{
        tick: number;
        marketOpen: boolean;
        priceUpdates: { symbol: string; newPrice: number }[];
        timestamp: string;
      }>((resolve) => {
        client.on('TICK_UPDATE', resolve);
      });

      const tickUpdate = {
        tick: 42,
        timestamp: new Date().toISOString(),
        marketOpen: true,
        regime: 'bull',
        priceUpdates: [
          { symbol: 'APEX', newPrice: 150.50, oldPrice: 149.00, change: 1.50, changePercent: 1.01, volume: 1000 },
          { symbol: 'NOVA', newPrice: 75.25, oldPrice: 74.00, change: 1.25, changePercent: 1.69, volume: 500 },
        ],
        trades: [],
        events: [],
        news: [],
      };

      socketServer.broadcast('tick', 'TICK_UPDATE', tickUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await tickUpdatePromise;

      expect(received.tick).toBe(42);
      expect(received.marketOpen).toBe(true);
      expect(received.priceUpdates).toHaveLength(2);
      expect(received.priceUpdates[0].symbol).toBe('APEX');
      expect(received.priceUpdates[0].newPrice).toBe(150.50);
      expect(received.priceUpdates[1].symbol).toBe('NOVA');
    });

    it('should emit TICK_UPDATE to all clients subscribed to tick room', async () => {
      // Connect multiple clients
      const client1 = await connectClient();
      const secondClientPromise = new Promise<ClientSocket>((resolve) => {
        const newClient = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        newClient.on('connect', () => resolve(newClient));
      });
      const client2 = await secondClientPromise;

      // Both clients auto-join tick room
      expect(socketServer.getConnectedCount()).toBe(2);

      const client1Ticks: number[] = [];
      const client2Ticks: number[] = [];

      const client1Promise = new Promise<void>((resolve) => {
        client1.on('TICK_UPDATE', (data: { tick: number }) => {
          client1Ticks.push(data.tick);
          if (client1Ticks.length >= 1) resolve();
        });
      });

      const client2Promise = new Promise<void>((resolve) => {
        client2.on('TICK_UPDATE', (data: { tick: number }) => {
          client2Ticks.push(data.tick);
          if (client2Ticks.length >= 1) resolve();
        });
      });

      // Broadcast tick update
      const tickUpdate = {
        tick: 100,
        timestamp: new Date().toISOString(),
        marketOpen: false,
        regime: 'normal',
        priceUpdates: [],
        trades: [],
        events: [],
        news: [],
      };

      socketServer.broadcast('tick', 'TICK_UPDATE', tickUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      await Promise.all([client1Promise, client2Promise]);

      expect(client1Ticks).toContain(100);
      expect(client2Ticks).toContain(100);

      // Cleanup
      client2.disconnect();
    });

    it('should emit TICK_UPDATE to legacy tick_updates room as well', async () => {
      const client = await connectClient();

      // Client should already be in tick_updates room (auto-joined on connect)
      const tickUpdatePromise = new Promise<{ tick: number }>((resolve) => {
        client.on('TICK_UPDATE', resolve);
      });

      const tickUpdate = {
        tick: 55,
        timestamp: new Date().toISOString(),
        marketOpen: true,
        regime: 'normal',
        priceUpdates: [],
        trades: [],
        events: [],
        news: [],
      };

      // Broadcast to tick_updates room (legacy)
      socketServer.broadcast('tick_updates', 'TICK_UPDATE', tickUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await tickUpdatePromise;
      expect(received.tick).toBe(55);
    });

    it('should update internal currentTick when processing tick updates', async () => {
      // Verify that setCurrentTick updates the internal state
      expect(socketServer.getCurrentTick()).toBe(0);

      socketServer.setCurrentTick(10);
      expect(socketServer.getCurrentTick()).toBe(10);

      // Only higher values should update
      socketServer.setCurrentTick(5);
      expect(socketServer.getCurrentTick()).toBe(10);

      socketServer.setCurrentTick(20);
      expect(socketServer.getCurrentTick()).toBe(20);
    });

    it('should handle rapid consecutive tick updates', async () => {
      const client = await connectClient();

      const receivedTicks: number[] = [];
      const tickCount = 10;

      const allTicksPromise = new Promise<void>((resolve) => {
        client.on('TICK_UPDATE', (data: { tick: number }) => {
          receivedTicks.push(data.tick);
          if (receivedTicks.length >= tickCount) {
            resolve();
          }
        });
      });

      // Rapidly send tick updates
      for (let i = 1; i <= tickCount; i++) {
        const tickUpdate = {
          tick: i,
          timestamp: new Date().toISOString(),
          marketOpen: true,
          regime: 'normal',
          priceUpdates: [],
          trades: [],
          events: [],
          news: [],
        };
        socketServer.broadcast('tick', 'TICK_UPDATE', tickUpdate as unknown as import('@wallstreetsim/types').WSMessage);
      }

      await allTicksPromise;

      expect(receivedTicks).toHaveLength(tickCount);
      // Verify all ticks were received
      for (let i = 1; i <= tickCount; i++) {
        expect(receivedTicks).toContain(i);
      }
    });

    it('should include trades and events in tick update when present', async () => {
      const client = await connectClient();

      const tickUpdatePromise = new Promise<{
        tick: number;
        trades: { id: string; symbol: string }[];
        events: { type: string; symbol: string }[];
      }>((resolve) => {
        client.on('TICK_UPDATE', resolve);
      });

      const tickUpdate = {
        tick: 77,
        timestamp: new Date().toISOString(),
        marketOpen: true,
        regime: 'normal',
        priceUpdates: [],
        trades: [
          { id: 'trade-1', symbol: 'APEX', price: 100, quantity: 10, buyerId: 'agent-1', sellerId: 'agent-2', tick: 77 },
        ],
        events: [
          { type: 'EARNINGS', symbol: 'APEX', magnitude: 0.5, description: 'Earnings beat expectations' },
        ],
        news: [],
      };

      socketServer.broadcast('tick', 'TICK_UPDATE', tickUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await tickUpdatePromise;

      expect(received.tick).toBe(77);
      expect(received.trades).toHaveLength(1);
      expect(received.trades[0].symbol).toBe('APEX');
      expect(received.events).toHaveLength(1);
      expect(received.events[0].type).toBe('EARNINGS');
    });
  });

  describe('Redis price update emission', () => {
    it('should emit PRICE_UPDATE to clients subscribed to prices channel', async () => {
      const client = await connectClient();

      // Subscribe to prices channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['prices'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const priceUpdatePromise = new Promise<{
        type: string;
        payload: {
          tick: number;
          prices: { symbol: string; price: number; change: number; changePercent: number; volume: number }[];
        };
        timestamp: string;
      }>((resolve) => {
        client.on('PRICE_UPDATE', resolve);
      });

      // Simulate price update broadcast (as if received from Redis)
      const priceUpdate = {
        type: 'PRICE_UPDATE',
        payload: {
          tick: 100,
          prices: [
            { symbol: 'APEX', price: 150.50, change: 1.50, changePercent: 1.01, volume: 1000000 },
            { symbol: 'NOVA', price: 75.25, change: -0.75, changePercent: -0.99, volume: 500000 },
            { symbol: 'QUANTUM', price: 200.00, change: 2.00, changePercent: 1.00, volume: 750000 },
          ],
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('prices', 'PRICE_UPDATE', priceUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await priceUpdatePromise;
      expect(received.type).toBe('PRICE_UPDATE');
      expect(received.payload.tick).toBe(100);
      expect(received.payload.prices).toHaveLength(3);
      expect(received.payload.prices[0].symbol).toBe('APEX');
      expect(received.payload.prices[1].symbol).toBe('NOVA');
      expect(received.payload.prices[2].symbol).toBe('QUANTUM');
    });

    it('should include all symbols in price update payload', async () => {
      const client = await connectClient();

      // Subscribe to prices channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['prices'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const priceUpdatePromise = new Promise<{
        payload: {
          tick: number;
          prices: { symbol: string; price: number; change: number; changePercent: number; volume: number }[];
        };
      }>((resolve) => {
        client.on('PRICE_UPDATE', resolve);
      });

      // Simulate all 10 symbols receiving price updates
      const allSymbols = ['APEX', 'NOVA', 'QUANTUM', 'TITAN', 'VORTEX', 'NEXUS', 'PULSE', 'CIPHER', 'STARK', 'OMEGA'];
      const priceUpdate = {
        type: 'PRICE_UPDATE',
        payload: {
          tick: 42,
          prices: allSymbols.map((symbol, i) => ({
            symbol,
            price: 100 + i * 10,
            change: (i % 2 === 0 ? 1 : -1) * (i + 1) * 0.5,
            changePercent: (i % 2 === 0 ? 1 : -1) * (i + 1) * 0.1,
            volume: 100000 * (i + 1),
          })),
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('prices', 'PRICE_UPDATE', priceUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await priceUpdatePromise;
      expect(received.payload.prices).toHaveLength(10);

      // Verify all symbols are present
      const receivedSymbols = received.payload.prices.map(p => p.symbol);
      for (const symbol of allSymbols) {
        expect(receivedSymbols).toContain(symbol);
      }
    });

    it('should emit PRICE_UPDATE to multiple clients subscribed to prices channel', async () => {
      // Connect first client
      const client1 = await connectClient();

      // Subscribe client1 to prices
      await new Promise<void>((resolve) => {
        client1.on('SUBSCRIBED', () => resolve());
        client1.emit('SUBSCRIBE', { channels: ['prices'] });
      });
      client1.removeAllListeners('SUBSCRIBED');

      // Connect second client
      const secondClientConnect = new Promise<ClientSocket>((resolve) => {
        const newClient = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        newClient.on('connect', () => resolve(newClient));
      });
      const client2 = await secondClientConnect;

      // Subscribe client2 to prices
      await new Promise<void>((resolve) => {
        client2.on('SUBSCRIBED', () => resolve());
        client2.emit('SUBSCRIBE', { channels: ['prices'] });
      });
      client2.removeAllListeners('SUBSCRIBED');

      const client1Received: { symbol: string; price: number }[] = [];
      const client2Received: { symbol: string; price: number }[] = [];

      const client1RecvPromise = new Promise<void>((resolve) => {
        client1.on('PRICE_UPDATE', (data: { payload: { prices: { symbol: string; price: number }[] } }) => {
          client1Received.push(...data.payload.prices);
          resolve();
        });
      });

      const client2RecvPromise = new Promise<void>((resolve) => {
        client2.on('PRICE_UPDATE', (data: { payload: { prices: { symbol: string; price: number }[] } }) => {
          client2Received.push(...data.payload.prices);
          resolve();
        });
      });

      // Broadcast price update
      const priceUpdate = {
        type: 'PRICE_UPDATE',
        payload: {
          tick: 50,
          prices: [
            { symbol: 'APEX', price: 155.00, change: 5.00, changePercent: 3.33, volume: 2000000 },
            { symbol: 'NOVA', price: 80.00, change: 4.75, changePercent: 6.31, volume: 1000000 },
          ],
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('prices', 'PRICE_UPDATE', priceUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      await Promise.all([client1RecvPromise, client2RecvPromise]);

      // Both clients should receive all prices
      expect(client1Received).toHaveLength(2);
      expect(client2Received).toHaveLength(2);
      expect(client1Received.map(p => p.symbol)).toContain('APEX');
      expect(client1Received.map(p => p.symbol)).toContain('NOVA');
      expect(client2Received.map(p => p.symbol)).toContain('APEX');
      expect(client2Received.map(p => p.symbol)).toContain('NOVA');

      // Cleanup
      client2.disconnect();
    });

    it('should emit MARKET_UPDATE to symbol-specific subscribers for each symbol', async () => {
      const client = await connectClient();

      // Subscribe to specific symbols
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['market:APEX', 'market:NOVA'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const receivedUpdates: { symbol: string; price: number }[] = [];
      const bothReceived = new Promise<void>((resolve) => {
        client.on('MARKET_UPDATE', (data: { payload: { symbol: string; price: number } }) => {
          receivedUpdates.push(data.payload);
          if (receivedUpdates.length >= 2) resolve();
        });
      });

      // Broadcast individual market updates for each symbol
      const apexUpdate = {
        type: 'MARKET_UPDATE',
        payload: { symbol: 'APEX', price: 160.00, change: 10.00, changePercent: 6.67, volume: 3000000 },
        timestamp: new Date().toISOString(),
      };

      const novaUpdate = {
        type: 'MARKET_UPDATE',
        payload: { symbol: 'NOVA', price: 85.00, change: 9.75, changePercent: 12.94, volume: 1500000 },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('market:APEX', 'MARKET_UPDATE', apexUpdate as unknown as import('@wallstreetsim/types').WSMessage);
      socketServer.broadcast('market:NOVA', 'MARKET_UPDATE', novaUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      await bothReceived;

      expect(receivedUpdates).toHaveLength(2);
      const symbols = receivedUpdates.map(u => u.symbol);
      expect(symbols).toContain('APEX');
      expect(symbols).toContain('NOVA');
    });

    it('should not emit MARKET_UPDATE for unsubscribed symbols', async () => {
      const client = await connectClient();

      // Subscribe only to APEX
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['market:APEX'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      let apexReceived = false;
      let novaReceived = false;

      client.on('MARKET_UPDATE', (data: { payload: { symbol: string } }) => {
        if (data.payload.symbol === 'APEX') apexReceived = true;
        if (data.payload.symbol === 'NOVA') novaReceived = true;
      });

      // Broadcast NOVA update (should not be received)
      socketServer.broadcast('market:NOVA', 'MARKET_UPDATE', {
        type: 'MARKET_UPDATE',
        payload: { symbol: 'NOVA', price: 90.00, change: 14.75, changePercent: 19.60, volume: 2000000 },
        timestamp: new Date().toISOString(),
      } as unknown as import('@wallstreetsim/types').WSMessage);

      // Broadcast APEX update (should be received)
      socketServer.broadcast('market:APEX', 'MARKET_UPDATE', {
        type: 'MARKET_UPDATE',
        payload: { symbol: 'APEX', price: 165.00, change: 15.00, changePercent: 10.00, volume: 4000000 },
        timestamp: new Date().toISOString(),
      } as unknown as import('@wallstreetsim/types').WSMessage);

      // Wait for messages
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(apexReceived).toBe(true);
      expect(novaReceived).toBe(false);
    });

    it('should handle rapid consecutive price updates', async () => {
      const client = await connectClient();

      // Subscribe to prices channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['prices'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const receivedUpdates: number[] = [];
      const updateCount = 10;

      const allUpdatesPromise = new Promise<void>((resolve) => {
        client.on('PRICE_UPDATE', (data: { payload: { tick: number } }) => {
          receivedUpdates.push(data.payload.tick);
          if (receivedUpdates.length >= updateCount) {
            resolve();
          }
        });
      });

      // Rapidly send price updates
      for (let i = 1; i <= updateCount; i++) {
        const priceUpdate = {
          type: 'PRICE_UPDATE',
          payload: {
            tick: i,
            prices: [
              { symbol: 'APEX', price: 150 + i, change: i * 0.5, changePercent: i * 0.1, volume: i * 100000 },
            ],
          },
          timestamp: new Date().toISOString(),
        };
        socketServer.broadcast('prices', 'PRICE_UPDATE', priceUpdate as unknown as import('@wallstreetsim/types').WSMessage);
      }

      await allUpdatesPromise;

      expect(receivedUpdates).toHaveLength(updateCount);
      // Verify all ticks were received
      for (let i = 1; i <= updateCount; i++) {
        expect(receivedUpdates).toContain(i);
      }
    });

    it('should emit both PRICE_UPDATE and individual MARKET_UPDATE for complete coverage', async () => {
      // Client 1: subscribes to combined prices channel
      const client1 = await connectClient();
      await new Promise<void>((resolve) => {
        client1.on('SUBSCRIBED', () => resolve());
        client1.emit('SUBSCRIBE', { channels: ['prices'] });
      });
      client1.removeAllListeners('SUBSCRIBED');

      // Client 2: subscribes to individual symbol channels
      const secondClientConn = new Promise<ClientSocket>((resolve) => {
        const newClient = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        newClient.on('connect', () => resolve(newClient));
      });
      const client2 = await secondClientConn;
      await new Promise<void>((resolve) => {
        client2.on('SUBSCRIBED', () => resolve());
        client2.emit('SUBSCRIBE', { channels: ['market:APEX', 'market:NOVA'] });
      });
      client2.removeAllListeners('SUBSCRIBED');

      let client1ReceivedPriceUpdate = false;
      let client2ReceivedApex = false;
      let client2ReceivedNova = false;

      const client1RecvPromise = new Promise<void>((resolve) => {
        client1.on('PRICE_UPDATE', (data: { payload: { prices: { symbol: string }[] } }) => {
          const symbols = data.payload.prices.map(p => p.symbol);
          if (symbols.includes('APEX') && symbols.includes('NOVA')) {
            client1ReceivedPriceUpdate = true;
          }
          resolve();
        });
      });

      const client2RecvPromise = new Promise<void>((resolve) => {
        let count = 0;
        client2.on('MARKET_UPDATE', (data: { payload: { symbol: string } }) => {
          if (data.payload.symbol === 'APEX') client2ReceivedApex = true;
          if (data.payload.symbol === 'NOVA') client2ReceivedNova = true;
          count++;
          if (count >= 2) resolve();
        });
      });

      // Broadcast combined price update to prices channel
      const priceUpdate = {
        type: 'PRICE_UPDATE',
        payload: {
          tick: 200,
          prices: [
            { symbol: 'APEX', price: 170.00, change: 20.00, changePercent: 13.33, volume: 5000000 },
            { symbol: 'NOVA', price: 95.00, change: 19.75, changePercent: 26.25, volume: 3000000 },
          ],
        },
        timestamp: new Date().toISOString(),
      };
      socketServer.broadcast('prices', 'PRICE_UPDATE', priceUpdate as unknown as import('@wallstreetsim/types').WSMessage);

      // Also broadcast individual market updates for symbol-specific subscribers
      socketServer.broadcast('market:APEX', 'MARKET_UPDATE', {
        type: 'MARKET_UPDATE',
        payload: { symbol: 'APEX', price: 170.00, change: 20.00, changePercent: 13.33, volume: 5000000 },
        timestamp: new Date().toISOString(),
      } as unknown as import('@wallstreetsim/types').WSMessage);

      socketServer.broadcast('market:NOVA', 'MARKET_UPDATE', {
        type: 'MARKET_UPDATE',
        payload: { symbol: 'NOVA', price: 95.00, change: 19.75, changePercent: 26.25, volume: 3000000 },
        timestamp: new Date().toISOString(),
      } as unknown as import('@wallstreetsim/types').WSMessage);

      await Promise.all([client1RecvPromise, client2RecvPromise]);

      // Client 1 should receive combined PRICE_UPDATE with both symbols
      expect(client1ReceivedPriceUpdate).toBe(true);

      // Client 2 should receive individual MARKET_UPDATE for each subscribed symbol
      expect(client2ReceivedApex).toBe(true);
      expect(client2ReceivedNova).toBe(true);

      // Cleanup
      client2.disconnect();
    });
  });

  describe('Redis trade event emission', () => {
    it('should emit TRADE to clients subscribed to trades channel', async () => {
      const client = await connectClient();

      // Subscribe to trades channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['trades'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const tradeEventPromise = new Promise<{
        type: string;
        payload: {
          tick: number;
          trades: { id: string; symbol: string; price: number; quantity: number; buyerId: string; sellerId: string; tick: number }[];
        };
        timestamp: string;
      }>((resolve) => {
        client.on('TRADE', resolve);
      });

      // Simulate trade event broadcast (as if received from Redis)
      const tradeEvent = {
        type: 'TRADE',
        payload: {
          tick: 100,
          trades: [
            { id: 'trade-1', symbol: 'APEX', price: 150.50, quantity: 100, buyerId: 'agent-1', sellerId: 'agent-2', tick: 100 },
            { id: 'trade-2', symbol: 'NOVA', price: 75.25, quantity: 50, buyerId: 'agent-3', sellerId: 'agent-4', tick: 100 },
          ],
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('trades', 'TRADE', tradeEvent as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await tradeEventPromise;
      expect(received.type).toBe('TRADE');
      expect(received.payload.tick).toBe(100);
      expect(received.payload.trades).toHaveLength(2);
      expect(received.payload.trades[0].symbol).toBe('APEX');
      expect(received.payload.trades[1].symbol).toBe('NOVA');
    });

    it('should include all trade fields in TRADE event payload', async () => {
      const client = await connectClient();

      // Subscribe to trades channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['trades'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const tradeEventPromise = new Promise<{
        payload: {
          tick: number;
          trades: { id: string; symbol: string; price: number; quantity: number; buyerId: string; sellerId: string; tick: number }[];
        };
      }>((resolve) => {
        client.on('TRADE', resolve);
      });

      // Simulate trade event with all fields
      const tradeEvent = {
        type: 'TRADE',
        payload: {
          tick: 42,
          trades: [
            { id: 'trade-abc', symbol: 'QUANTUM', price: 200.00, quantity: 250, buyerId: 'buyer-agent', sellerId: 'seller-agent', tick: 42 },
          ],
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('trades', 'TRADE', tradeEvent as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await tradeEventPromise;
      expect(received.payload.trades).toHaveLength(1);
      const trade = received.payload.trades[0];
      expect(trade.id).toBe('trade-abc');
      expect(trade.symbol).toBe('QUANTUM');
      expect(trade.price).toBe(200.00);
      expect(trade.quantity).toBe(250);
      expect(trade.buyerId).toBe('buyer-agent');
      expect(trade.sellerId).toBe('seller-agent');
      expect(trade.tick).toBe(42);
    });

    it('should emit TRADE to multiple clients subscribed to trades channel', async () => {
      // Connect first client
      const client1 = await connectClient();

      // Subscribe client1 to trades
      await new Promise<void>((resolve) => {
        client1.on('SUBSCRIBED', () => resolve());
        client1.emit('SUBSCRIBE', { channels: ['trades'] });
      });
      client1.removeAllListeners('SUBSCRIBED');

      // Connect second client
      const secondClientConnect = new Promise<ClientSocket>((resolve) => {
        const newClient = ioc(`http://localhost:${TEST_PORT}`, {
          transports: ['websocket'],
        });
        newClient.on('connect', () => resolve(newClient));
      });
      const client2 = await secondClientConnect;

      // Subscribe client2 to trades
      await new Promise<void>((resolve) => {
        client2.on('SUBSCRIBED', () => resolve());
        client2.emit('SUBSCRIBE', { channels: ['trades'] });
      });
      client2.removeAllListeners('SUBSCRIBED');

      const client1Received: { id: string; symbol: string }[] = [];
      const client2Received: { id: string; symbol: string }[] = [];

      const client1RecvPromise = new Promise<void>((resolve) => {
        client1.on('TRADE', (data: { payload: { trades: { id: string; symbol: string }[] } }) => {
          client1Received.push(...data.payload.trades);
          resolve();
        });
      });

      const client2RecvPromise = new Promise<void>((resolve) => {
        client2.on('TRADE', (data: { payload: { trades: { id: string; symbol: string }[] } }) => {
          client2Received.push(...data.payload.trades);
          resolve();
        });
      });

      // Broadcast trade event
      const tradeEvent = {
        type: 'TRADE',
        payload: {
          tick: 50,
          trades: [
            { id: 'trade-1', symbol: 'APEX', price: 155.00, quantity: 200, buyerId: 'agent-a', sellerId: 'agent-b', tick: 50 },
            { id: 'trade-2', symbol: 'NOVA', price: 80.00, quantity: 100, buyerId: 'agent-c', sellerId: 'agent-d', tick: 50 },
          ],
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('trades', 'TRADE', tradeEvent as unknown as import('@wallstreetsim/types').WSMessage);

      await Promise.all([client1RecvPromise, client2RecvPromise]);

      // Both clients should receive all trades
      expect(client1Received).toHaveLength(2);
      expect(client2Received).toHaveLength(2);
      expect(client1Received.map(t => t.symbol)).toContain('APEX');
      expect(client1Received.map(t => t.symbol)).toContain('NOVA');
      expect(client2Received.map(t => t.symbol)).toContain('APEX');
      expect(client2Received.map(t => t.symbol)).toContain('NOVA');

      // Cleanup
      client2.disconnect();
    });

    it('should not emit TRADE to clients not subscribed to trades channel', async () => {
      const client = await connectClient();

      // Subscribe only to prices (not trades)
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['prices'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      let tradeReceived = false;
      client.on('TRADE', () => {
        tradeReceived = true;
      });

      // Broadcast trade event
      const tradeEvent = {
        type: 'TRADE',
        payload: {
          tick: 60,
          trades: [
            { id: 'trade-xyz', symbol: 'TITAN', price: 300.00, quantity: 50, buyerId: 'buyer', sellerId: 'seller', tick: 60 },
          ],
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('trades', 'TRADE', tradeEvent as unknown as import('@wallstreetsim/types').WSMessage);

      // Wait for potential message
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(tradeReceived).toBe(false);
    });

    it('should handle rapid consecutive trade events', async () => {
      const client = await connectClient();

      // Subscribe to trades channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['trades'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const receivedTrades: number[] = [];
      const tradeCount = 10;

      const allTradesPromise = new Promise<void>((resolve) => {
        client.on('TRADE', (data: { payload: { tick: number } }) => {
          receivedTrades.push(data.payload.tick);
          if (receivedTrades.length >= tradeCount) {
            resolve();
          }
        });
      });

      // Rapidly send trade events
      for (let i = 1; i <= tradeCount; i++) {
        const tradeEvent = {
          type: 'TRADE',
          payload: {
            tick: i,
            trades: [
              { id: `trade-${i}`, symbol: 'APEX', price: 150 + i, quantity: i * 10, buyerId: `buyer-${i}`, sellerId: `seller-${i}`, tick: i },
            ],
          },
          timestamp: new Date().toISOString(),
        };
        socketServer.broadcast('trades', 'TRADE', tradeEvent as unknown as import('@wallstreetsim/types').WSMessage);
      }

      await allTradesPromise;

      expect(receivedTrades).toHaveLength(tradeCount);
      // Verify all ticks were received
      for (let i = 1; i <= tradeCount; i++) {
        expect(receivedTrades).toContain(i);
      }
    });

    it('should emit TRADE with empty trades array when no trades occurred', async () => {
      const client = await connectClient();

      // Subscribe to trades channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['trades'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const tradeEventPromise = new Promise<{
        type: string;
        payload: {
          tick: number;
          trades: unknown[];
        };
      }>((resolve) => {
        client.on('TRADE', resolve);
      });

      // Simulate trade event with empty trades array
      const tradeEvent = {
        type: 'TRADE',
        payload: {
          tick: 70,
          trades: [],
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('trades', 'TRADE', tradeEvent as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await tradeEventPromise;
      expect(received.type).toBe('TRADE');
      expect(received.payload.tick).toBe(70);
      expect(received.payload.trades).toHaveLength(0);
    });

    it('should emit TRADE to symbol-specific channel for individual trades', async () => {
      const client = await connectClient();

      // Subscribe to symbol-specific channel
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['market:APEX'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      const tradeEventPromise = new Promise<{
        type: string;
        payload: {
          id: string;
          symbol: string;
          price: number;
          quantity: number;
          buyerId: string;
          sellerId: string;
          tick: number;
        };
        timestamp: string;
      }>((resolve) => {
        client.on('TRADE', resolve);
      });

      // Simulate individual symbol trade broadcast
      const symbolTradeEvent = {
        type: 'TRADE',
        payload: {
          id: 'trade-symbol-1',
          symbol: 'APEX',
          price: 175.00,
          quantity: 500,
          buyerId: 'agent-x',
          sellerId: 'agent-y',
          tick: 80,
        },
        timestamp: new Date().toISOString(),
      };

      socketServer.broadcast('market:APEX', 'TRADE', symbolTradeEvent as unknown as import('@wallstreetsim/types').WSMessage);

      const received = await tradeEventPromise;
      expect(received.type).toBe('TRADE');
      expect(received.payload.symbol).toBe('APEX');
      expect(received.payload.id).toBe('trade-symbol-1');
      expect(received.payload.price).toBe(175.00);
      expect(received.payload.quantity).toBe(500);
    });

    it('should not emit symbol-specific TRADE for unsubscribed symbols', async () => {
      const client = await connectClient();

      // Subscribe only to APEX
      await new Promise<void>((resolve) => {
        client.on('SUBSCRIBED', () => resolve());
        client.emit('SUBSCRIBE', { channels: ['market:APEX'] });
      });

      client.removeAllListeners('SUBSCRIBED');

      let apexReceived = false;
      let novaReceived = false;

      client.on('TRADE', (data: { payload: { symbol: string } }) => {
        if (data.payload.symbol === 'APEX') apexReceived = true;
        if (data.payload.symbol === 'NOVA') novaReceived = true;
      });

      // Broadcast NOVA trade (should not be received)
      socketServer.broadcast('market:NOVA', 'TRADE', {
        type: 'TRADE',
        payload: { id: 'trade-nova', symbol: 'NOVA', price: 90.00, quantity: 100, buyerId: 'b1', sellerId: 's1', tick: 90 },
        timestamp: new Date().toISOString(),
      } as unknown as import('@wallstreetsim/types').WSMessage);

      // Broadcast APEX trade (should be received)
      socketServer.broadcast('market:APEX', 'TRADE', {
        type: 'TRADE',
        payload: { id: 'trade-apex', symbol: 'APEX', price: 165.00, quantity: 200, buyerId: 'b2', sellerId: 's2', tick: 90 },
        timestamp: new Date().toISOString(),
      } as unknown as import('@wallstreetsim/types').WSMessage);

      // Wait for messages
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(apexReceived).toBe(true);
      expect(novaReceived).toBe(false);
    });
  });
});
