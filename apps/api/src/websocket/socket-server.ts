import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type { Http2SecureServer, Http2Server } from 'http2';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

type HttpServerType = HttpServer | Http2SecureServer | Http2Server;
import type {
  WSMessage,
  WSMessageType,
  WSSubscribe,
  WSUnsubscribe,
} from '@wallstreetsim/types';

// Redis channel names (mirroring engine's redis.ts)
const CHANNELS = {
  TICK: 'channel:tick',
  TICK_UPDATES: 'channel:tick_updates', // Legacy alias
  MARKET_ALL: 'channel:market:all',
  MARKET_UPDATES: 'channel:market', // Legacy alias
  PRICE_UPDATES: 'channel:prices',
  NEWS_UPDATES: 'channel:news',
  LEADERBOARD_UPDATES: 'channel:leaderboard',
  TRADES: 'channel:trades',
  EVENTS: 'channel:events',
  AGENT_UPDATES: (agentId: string) => `channel:agent:${agentId}`,
  MARKET_SYMBOL: (symbol: string) => `channel:market:${symbol}`,
  SYMBOL_UPDATES: (symbol: string) => `channel:market:${symbol}`, // Legacy alias
};

// Public channels that don't require authentication
const PUBLIC_CHANNELS = new Set([
  'tick',
  'tick_updates', // Legacy alias
  'market',
  'market:all',
  'prices',
  'news',
  'leaderboard',
  'trades',
  'events',
]);

// Private channels that require authentication
const PRIVATE_CHANNEL_PREFIXES = ['portfolio', 'orders', 'messages', 'alerts', 'investigations'] as const;
type PrivateChannelType = typeof PRIVATE_CHANNEL_PREFIXES[number];

interface AuthenticatedSocket extends Socket {
  agentId?: string;
  authenticatedAt?: Date;
}

function isPrivateChannel(channel: string): boolean {
  return PRIVATE_CHANNEL_PREFIXES.some(prefix => channel === prefix || channel.startsWith(`${prefix}:`));
}

function isAgentChannel(channel: string): boolean {
  return channel.startsWith('agent:');
}

function getAgentIdFromChannel(channel: string): string | null {
  if (!isAgentChannel(channel)) return null;
  return channel.replace('agent:', '');
}

function isPublicChannel(channel: string): boolean {
  // Exact match public channels
  if (PUBLIC_CHANNELS.has(channel)) return true;

  // Pattern match market:SYMBOL channels (e.g., market:APEX, market:NOVA)
  if (channel.startsWith('market:') && channel !== 'market:all') return true;

  // Legacy pattern match symbol:SYMBOL channels (e.g., symbol:APEX)
  if (channel.startsWith('symbol:')) return true;

  return false;
}

function getPrivateChannelRoom(channel: string, agentId: string): string {
  // All private channels are scoped to the agent
  return `private:${agentId}:${channel}`;
}

export interface SocketServerOptions {
  enableRedisAdapter?: boolean;
}

export class SocketServer {
  private io: SocketIOServer;
  private redisSubscriber: Redis;
  private redisPub?: Redis;
  private redisSub?: Redis;
  private subscribedChannels: Set<string> = new Set();
  private redisAdapterEnabled: boolean = false;

  constructor(httpServer: HttpServerType, options: SocketServerOptions = {}) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redisSubscriber = new Redis(redisUrl);

    // Enable Redis adapter for horizontal scaling if requested or via env var
    const enableAdapter = options.enableRedisAdapter ?? process.env.SOCKET_REDIS_ADAPTER === 'true';
    if (enableAdapter) {
      this.setupRedisAdapter(redisUrl);
    }

    this.setupRedisSubscriptions();
    this.setupSocketHandlers();
  }

  private setupRedisAdapter(redisUrl: string): void {
    try {
      this.redisPub = new Redis(redisUrl);
      this.redisSub = new Redis(redisUrl);

      this.io.adapter(createAdapter(this.redisPub, this.redisSub));
      this.redisAdapterEnabled = true;
      console.log('[Socket.io] Redis adapter enabled for horizontal scaling');
    } catch (error) {
      console.error('[Socket.io] Failed to initialize Redis adapter:', error);
      console.log('[Socket.io] Continuing without Redis adapter (single instance mode)');
    }
  }

  /**
   * Check if Redis adapter is enabled
   */
  public isRedisAdapterEnabled(): boolean {
    return this.redisAdapterEnabled;
  }

  private setupRedisSubscriptions(): void {
    // Subscribe to global public channels
    this.subscribeToRedisChannel(CHANNELS.TICK);
    this.subscribeToRedisChannel(CHANNELS.TICK_UPDATES); // Legacy
    this.subscribeToRedisChannel(CHANNELS.MARKET_ALL);
    this.subscribeToRedisChannel(CHANNELS.MARKET_UPDATES); // Legacy
    this.subscribeToRedisChannel(CHANNELS.PRICE_UPDATES);
    this.subscribeToRedisChannel(CHANNELS.NEWS_UPDATES);
    this.subscribeToRedisChannel(CHANNELS.LEADERBOARD_UPDATES);
    this.subscribeToRedisChannel(CHANNELS.TRADES);
    this.subscribeToRedisChannel(CHANNELS.EVENTS);

    // Handle Redis messages
    this.redisSubscriber.on('message', (channel: string, message: string) => {
      this.handleRedisMessage(channel, message);
    });
  }

  private subscribeToRedisChannel(channel: string): void {
    if (!this.subscribedChannels.has(channel)) {
      this.redisSubscriber.subscribe(channel);
      this.subscribedChannels.add(channel);
    }
  }

  private handleRedisMessage(channel: string, message: string): void {
    try {
      const parsed = JSON.parse(message) as WSMessage;

      if (channel === CHANNELS.TICK || channel === CHANNELS.TICK_UPDATES) {
        // Broadcast tick updates to all connected clients (both 'tick' and legacy 'tick_updates' rooms)
        this.io.to('tick').emit('TICK_UPDATE', parsed);
        this.io.to('tick_updates').emit('TICK_UPDATE', parsed);
      } else if (channel === CHANNELS.MARKET_ALL || channel === CHANNELS.MARKET_UPDATES) {
        // Broadcast market updates to subscribers (both 'market:all' and legacy 'market' rooms)
        this.io.to('market:all').emit('MARKET_UPDATE', parsed);
        this.io.to('market').emit('MARKET_UPDATE', parsed);
      } else if (channel === CHANNELS.PRICE_UPDATES) {
        // Broadcast price updates to subscribers
        this.io.to('prices').emit('PRICE_UPDATE', parsed);
      } else if (channel === CHANNELS.NEWS_UPDATES) {
        // Broadcast news updates to subscribers
        this.io.to('news').emit('NEWS', parsed);
      } else if (channel === CHANNELS.LEADERBOARD_UPDATES) {
        // Broadcast leaderboard updates to subscribers
        this.io.to('leaderboard').emit('LEADERBOARD_UPDATE', parsed);
      } else if (channel === CHANNELS.TRADES) {
        // Broadcast trade updates to subscribers
        this.io.to('trades').emit('TRADE', parsed);
      } else if (channel === CHANNELS.EVENTS) {
        // Broadcast event updates to subscribers
        this.io.to('events').emit('EVENT', parsed);
      } else if (channel.startsWith('channel:market:')) {
        // Symbol-specific updates (e.g., channel:market:APEX)
        const symbol = channel.replace('channel:market:', '');
        // Broadcast to both market:SYMBOL and legacy symbol:SYMBOL rooms
        this.io.to(`market:${symbol}`).emit('MARKET_UPDATE', parsed);
        this.io.to(`symbol:${symbol}`).emit('MARKET_UPDATE', parsed);
      } else if (channel.startsWith('channel:agent:')) {
        // Agent-specific updates (private)
        const agentId = channel.replace('channel:agent:', '');
        this.handleAgentPrivateMessage(agentId, parsed);
      }
    } catch {
      console.error(`Failed to parse Redis message from ${channel}`);
    }
  }

  private handleAgentPrivateMessage(agentId: string, message: WSMessage): void {
    // Route message to appropriate private channel based on type
    const eventType = message.type;

    switch (eventType) {
      case 'ORDER_UPDATE':
      case 'ORDER_FILLED':
        // Send to agent's orders room
        this.io.to(`private:${agentId}:orders`).emit(eventType, message);
        // Also send to the general agent room for backwards compatibility
        this.io.to(`agent:${agentId}`).emit(eventType, message);
        break;
      case 'PORTFOLIO_UPDATE':
        // Send to agent's portfolio room
        this.io.to(`private:${agentId}:portfolio`).emit(eventType, message);
        this.io.to(`agent:${agentId}`).emit(eventType, message);
        break;
      case 'PRIVATE_MESSAGE':
        // Send to agent's messages room
        this.io.to(`private:${agentId}:messages`).emit(eventType, message);
        this.io.to(`agent:${agentId}`).emit(eventType, message);
        break;
      case 'ALERT':
      case 'MARGIN_CALL':
        // Send to agent's alerts room
        this.io.to(`private:${agentId}:alerts`).emit(eventType, message);
        this.io.to(`agent:${agentId}`).emit(eventType, message);
        break;
      case 'INVESTIGATION':
        // Send to agent's investigations room
        this.io.to(`private:${agentId}:investigations`).emit(eventType, message);
        this.io.to(`agent:${agentId}`).emit(eventType, message);
        break;
      default:
        // Generic agent update - send to all agent rooms
        this.io.to(`agent:${agentId}`).emit('AGENT_UPDATE', message);
        break;
    }
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`[Socket.io] Client connected: ${socket.id}`);

      // Auto-join tick rooms - clients can connect without authentication
      // and receive public data (tick updates, prices, news, etc.)
      socket.join('tick');
      socket.join('tick_updates'); // Legacy room for backward compatibility

      // Emit connected event with available public channels
      socket.emit('CONNECTED', {
        type: 'CONNECTED',
        payload: {
          socketId: socket.id,
          authenticated: false,
          publicChannels: ['tick', 'market:all', 'news', 'leaderboard', 'trades', 'events', 'prices', 'tick_updates', 'market'],
          message: 'Connected to WallStreetSim. Authentication optional for public data.',
        },
        timestamp: new Date().toISOString(),
      });

      // Handle authentication
      socket.on('AUTH', (data: { apiKey: string }) => {
        this.handleAuth(socket, data.apiKey);
      });

      // Handle subscriptions
      socket.on('SUBSCRIBE', (data: WSSubscribe['payload']) => {
        this.handleSubscribe(socket, data.channels);
      });

      socket.on('UNSUBSCRIBE', (data: WSUnsubscribe['payload']) => {
        this.handleUnsubscribe(socket, data.channels);
      });

      // Handle ping/pong for keepalive
      socket.on('PING', () => {
        socket.emit('PONG', {
          type: 'PONG',
          payload: null,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}, reason: ${reason}`);
      });
    });
  }

  private handleAuth(socket: AuthenticatedSocket, apiKey: string): void {
    // TODO: Validate API key against database
    // For now, we'll accept any non-empty key and extract agent ID
    if (apiKey && apiKey.length > 0) {
      // In production, this would verify the key and get the real agent ID
      socket.agentId = apiKey.split('_')[1] || 'unknown';
      socket.authenticatedAt = new Date();
      socket.emit('AUTH_SUCCESS', {
        type: 'AUTH_SUCCESS',
        payload: {
          agentId: socket.agentId,
          privateChannels: PRIVATE_CHANNEL_PREFIXES,
        },
        timestamp: new Date().toISOString(),
      });

      // Subscribe to agent-specific Redis channel
      const agentChannel = CHANNELS.AGENT_UPDATES(socket.agentId);
      this.subscribeToRedisChannel(agentChannel);

      // Join agent-specific room
      socket.join(`agent:${socket.agentId}`);

      console.log(`[Socket.io] Client ${socket.id} authenticated as agent: ${socket.agentId}`);
    } else {
      socket.emit('AUTH_ERROR', {
        type: 'AUTH_ERROR',
        payload: { message: 'Invalid API key' },
        timestamp: new Date().toISOString(),
      });
    }
  }

  private handleSubscribe(socket: AuthenticatedSocket, channels: string[]): void {
    const subscribedChannels: string[] = [];
    const failedChannels: { channel: string; reason: string }[] = [];

    for (const channel of channels) {
      // Check if this is an agent-specific channel (agent:*)
      if (isAgentChannel(channel)) {
        const targetAgentId = getAgentIdFromChannel(channel);
        if (!socket.agentId) {
          // Agent channel requires authentication
          failedChannels.push({
            channel,
            reason: 'Authentication required for agent channels',
          });
          continue;
        }
        if (targetAgentId !== socket.agentId) {
          // Can only subscribe to own agent channel
          failedChannels.push({
            channel,
            reason: 'Can only subscribe to own agent channel',
          });
          continue;
        }
        // Join the agent-specific room (already joined on auth, but allow explicit subscription)
        socket.join(`agent:${socket.agentId}`);
        // Subscribe to agent-specific Redis channel
        this.subscribeToRedisChannel(CHANNELS.AGENT_UPDATES(socket.agentId));
        subscribedChannels.push(channel);
        console.log(`[Socket.io] Client ${socket.id} (agent: ${socket.agentId}) subscribed to agent channel: ${channel}`);
        continue;
      }

      // Check if this is a private channel
      if (isPrivateChannel(channel)) {
        if (!socket.agentId) {
          // Private channel requires authentication
          failedChannels.push({
            channel,
            reason: 'Authentication required for private channels',
          });
          continue;
        }
        // Join the private room for this agent
        const privateRoom = getPrivateChannelRoom(channel, socket.agentId);
        socket.join(privateRoom);
        subscribedChannels.push(channel);
        console.log(`[Socket.io] Client ${socket.id} (agent: ${socket.agentId}) subscribed to private channel: ${channel}`);
        continue;
      }

      // Public channels - use isPublicChannel helper for validation
      if (isPublicChannel(channel)) {
        // Handle tick channels
        if (channel === 'tick') {
          socket.join('tick');
          subscribedChannels.push(channel);
        } else if (channel === 'tick_updates') {
          // Legacy alias
          socket.join('tick_updates');
          subscribedChannels.push(channel);
        }
        // Handle market channels
        else if (channel === 'market:all') {
          socket.join('market:all');
          subscribedChannels.push(channel);
        } else if (channel === 'market') {
          // Legacy alias
          socket.join('market');
          subscribedChannels.push(channel);
        } else if (channel.startsWith('market:')) {
          // Symbol-specific: market:SYMBOL (e.g., market:APEX)
          const symbol = channel.replace('market:', '');
          socket.join(`market:${symbol}`);
          // Subscribe to symbol-specific Redis channel
          this.subscribeToRedisChannel(CHANNELS.MARKET_SYMBOL(symbol));
          subscribedChannels.push(channel);
        } else if (channel.startsWith('symbol:')) {
          // Legacy symbol-specific: symbol:SYMBOL (e.g., symbol:APEX)
          const symbol = channel.replace('symbol:', '');
          socket.join(`symbol:${symbol}`);
          // Subscribe to symbol-specific Redis channel
          this.subscribeToRedisChannel(CHANNELS.SYMBOL_UPDATES(symbol));
          subscribedChannels.push(channel);
        }
        // Handle other public channels
        else if (channel === 'prices') {
          socket.join('prices');
          subscribedChannels.push(channel);
        } else if (channel === 'news') {
          socket.join('news');
          subscribedChannels.push(channel);
        } else if (channel === 'leaderboard') {
          socket.join('leaderboard');
          subscribedChannels.push(channel);
        } else if (channel === 'trades') {
          socket.join('trades');
          subscribedChannels.push(channel);
        } else if (channel === 'events') {
          socket.join('events');
          subscribedChannels.push(channel);
        }
      } else {
        failedChannels.push({
          channel,
          reason: 'Unknown channel',
        });
      }
    }

    socket.emit('SUBSCRIBED', {
      type: 'SUBSCRIBED',
      payload: {
        channels: subscribedChannels,
        failed: failedChannels.length > 0 ? failedChannels : undefined,
      },
      timestamp: new Date().toISOString(),
    });

    if (subscribedChannels.length > 0) {
      console.log(`[Socket.io] Client ${socket.id} subscribed to: ${subscribedChannels.join(', ')}`);
    }
  }

  private handleUnsubscribe(socket: AuthenticatedSocket, channels: string[]): void {
    const unsubscribedChannels: string[] = [];

    for (const channel of channels) {
      // Check if this is an agent-specific channel (agent:*)
      if (isAgentChannel(channel)) {
        const targetAgentId = getAgentIdFromChannel(channel);
        // Only allow unsubscribing from own agent channel
        if (socket.agentId && targetAgentId === socket.agentId) {
          socket.leave(`agent:${socket.agentId}`);
          unsubscribedChannels.push(channel);
        }
        continue;
      }

      // Check if this is a private channel
      if (isPrivateChannel(channel)) {
        if (socket.agentId) {
          const privateRoom = getPrivateChannelRoom(channel, socket.agentId);
          socket.leave(privateRoom);
          unsubscribedChannels.push(channel);
        }
        continue;
      }

      // Public channels - use isPublicChannel helper for validation
      if (isPublicChannel(channel)) {
        socket.leave(channel);
        unsubscribedChannels.push(channel);
      }
    }

    socket.emit('UNSUBSCRIBED', {
      type: 'UNSUBSCRIBED',
      payload: { channels: unsubscribedChannels },
      timestamp: new Date().toISOString(),
    });

    console.log(`[Socket.io] Client ${socket.id} unsubscribed from: ${unsubscribedChannels.join(', ')}`);
  }

  /**
   * Broadcast a message to all clients in a room
   */
  public broadcast(room: string, event: WSMessageType, data: WSMessage): void {
    this.io.to(room).emit(event, data);
  }

  /**
   * Send a message to a specific agent
   */
  public sendToAgent(agentId: string, event: WSMessageType, data: WSMessage): void {
    this.io.to(`agent:${agentId}`).emit(event, data);
  }

  /**
   * Send a private channel event to a specific agent
   */
  public sendPrivateEvent(
    agentId: string,
    channel: PrivateChannelType,
    event: WSMessageType,
    data: WSMessage
  ): void {
    const room = getPrivateChannelRoom(channel, agentId);
    this.io.to(room).emit(event, data);
    // Also send to the general agent room for backwards compatibility
    this.io.to(`agent:${agentId}`).emit(event, data);
  }

  /**
   * Check if an agent has authenticated clients
   */
  public hasAuthenticatedClients(agentId: string): boolean {
    const room = this.io.sockets.adapter.rooms.get(`agent:${agentId}`);
    return room !== undefined && room.size > 0;
  }

  /**
   * Get the number of connected clients
   */
  public getConnectedCount(): number {
    return this.io.engine.clientsCount;
  }

  /**
   * Get the Socket.io server instance
   */
  public getIO(): SocketIOServer {
    return this.io;
  }

  /**
   * Close the server and cleanup
   */
  public async close(): Promise<void> {
    // Close Redis adapter connections if enabled
    if (this.redisPub) {
      await this.redisPub.quit();
    }
    if (this.redisSub) {
      await this.redisSub.quit();
    }
    await this.redisSubscriber.quit();
    this.io.close();
  }
}

let socketServer: SocketServer | null = null;

/**
 * Initialize the Socket.io server
 */
export function initSocketServer(httpServer: HttpServerType, options?: SocketServerOptions): SocketServer {
  if (!socketServer) {
    socketServer = new SocketServer(httpServer, options);
  }
  return socketServer;
}

/**
 * Get the current Socket.io server instance
 */
export function getSocketServer(): SocketServer | null {
  return socketServer;
}
