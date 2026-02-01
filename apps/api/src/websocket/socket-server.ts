import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type { Http2SecureServer, Http2Server } from 'http2';
import Redis from 'ioredis';

type HttpServerType = HttpServer | Http2SecureServer | Http2Server;
import type {
  WSMessage,
  WSMessageType,
  WSSubscribe,
  WSUnsubscribe,
} from '@wallstreetsim/types';

// Redis channel names (mirroring engine's redis.ts)
const CHANNELS = {
  TICK_UPDATES: 'channel:tick_updates',
  MARKET_UPDATES: 'channel:market',
  PRICE_UPDATES: 'channel:prices',
  NEWS_UPDATES: 'channel:news',
  LEADERBOARD_UPDATES: 'channel:leaderboard',
  AGENT_UPDATES: (agentId: string) => `channel:agent:${agentId}`,
  SYMBOL_UPDATES: (symbol: string) => `channel:market:${symbol}`,
};

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

function getPrivateChannelRoom(channel: string, agentId: string): string {
  // All private channels are scoped to the agent
  return `private:${agentId}:${channel}`;
}

export class SocketServer {
  private io: SocketIOServer;
  private redisSubscriber: Redis;
  private subscribedChannels: Set<string> = new Set();

  constructor(httpServer: HttpServerType) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redisSubscriber = new Redis(redisUrl);

    this.setupRedisSubscriptions();
    this.setupSocketHandlers();
  }

  private setupRedisSubscriptions(): void {
    // Subscribe to global public channels
    this.subscribeToRedisChannel(CHANNELS.TICK_UPDATES);
    this.subscribeToRedisChannel(CHANNELS.MARKET_UPDATES);
    this.subscribeToRedisChannel(CHANNELS.PRICE_UPDATES);
    this.subscribeToRedisChannel(CHANNELS.NEWS_UPDATES);
    this.subscribeToRedisChannel(CHANNELS.LEADERBOARD_UPDATES);

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

      if (channel === CHANNELS.TICK_UPDATES) {
        // Broadcast tick updates to all connected clients
        this.io.to('tick_updates').emit('TICK_UPDATE', parsed);
      } else if (channel === CHANNELS.MARKET_UPDATES) {
        // Broadcast market updates to subscribers
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
      } else if (channel.startsWith('channel:market:')) {
        // Symbol-specific updates
        const symbol = channel.replace('channel:market:', '');
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

      // Auto-join tick updates room
      socket.join('tick_updates');

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

      // Public channels
      if (channel === 'market') {
        socket.join('market');
        subscribedChannels.push(channel);
      } else if (channel === 'prices') {
        socket.join('prices');
        subscribedChannels.push(channel);
      } else if (channel === 'news') {
        socket.join('news');
        subscribedChannels.push(channel);
      } else if (channel === 'leaderboard') {
        socket.join('leaderboard');
        subscribedChannels.push(channel);
      } else if (channel.startsWith('symbol:')) {
        const symbol = channel.replace('symbol:', '');
        socket.join(`symbol:${symbol}`);
        // Subscribe to symbol-specific Redis channel
        this.subscribeToRedisChannel(CHANNELS.SYMBOL_UPDATES(symbol));
        subscribedChannels.push(channel);
      } else if (channel === 'tick_updates') {
        socket.join('tick_updates');
        subscribedChannels.push(channel);
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
      // Check if this is a private channel
      if (isPrivateChannel(channel)) {
        if (socket.agentId) {
          const privateRoom = getPrivateChannelRoom(channel, socket.agentId);
          socket.leave(privateRoom);
          unsubscribedChannels.push(channel);
        }
        continue;
      }

      // Public channels
      if (channel === 'market') {
        socket.leave('market');
        unsubscribedChannels.push(channel);
      } else if (channel === 'prices') {
        socket.leave('prices');
        unsubscribedChannels.push(channel);
      } else if (channel === 'news') {
        socket.leave('news');
        unsubscribedChannels.push(channel);
      } else if (channel === 'leaderboard') {
        socket.leave('leaderboard');
        unsubscribedChannels.push(channel);
      } else if (channel.startsWith('symbol:')) {
        socket.leave(channel);
        unsubscribedChannels.push(channel);
      } else if (channel === 'tick_updates') {
        socket.leave('tick_updates');
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
    await this.redisSubscriber.quit();
    this.io.close();
  }
}

let socketServer: SocketServer | null = null;

/**
 * Initialize the Socket.io server
 */
export function initSocketServer(httpServer: HttpServerType): SocketServer {
  if (!socketServer) {
    socketServer = new SocketServer(httpServer);
  }
  return socketServer;
}

/**
 * Get the current Socket.io server instance
 */
export function getSocketServer(): SocketServer | null {
  return socketServer;
}
