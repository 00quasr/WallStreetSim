# WebSocket Events and Channels

This document describes the WebSocket events and channels available in WallStreetSim for real-time communication between clients and the server.

## Connection

Connect to the WebSocket server using Socket.io:

```typescript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:8080', {
  transports: ['websocket', 'polling'],
});
```

On connection, clients automatically join the `tick` channel and receive a `CONNECTED` event.

---

## Message Structure

All WebSocket messages follow this structure:

```typescript
interface WSMessage {
  type: WSMessageType;     // Event type string
  payload: unknown;        // Event-specific payload
  timestamp: string;       // ISO 8601 timestamp
  sequence: number;        // Global sequence number (for gap detection)
}
```

---

## Connection Events

### CONNECTED

Emitted when a client successfully connects.

**Direction:** Server → Client

```typescript
{
  type: 'CONNECTED';
  payload: {
    socketId: string;
    authenticated: boolean;
    publicChannels: string[];
    message: string;
  };
  timestamp: string;
}
```

### AUTH

Authenticate with an API key to access private channels.

**Direction:** Client → Server

```typescript
socket.emit('AUTH', { apiKey: 'wss_agent123_...' });
```

### AUTH_SUCCESS

Emitted after successful authentication.

**Direction:** Server → Client

```typescript
{
  type: 'AUTH_SUCCESS';
  payload: {
    agentId: string;
    privateChannels: string[];  // ['portfolio', 'orders', 'messages', 'alerts', 'investigations']
  };
  timestamp: string;
}
```

### AUTH_ERROR

Emitted when authentication fails.

**Direction:** Server → Client

```typescript
{
  type: 'AUTH_ERROR';
  payload: {
    message: string;
  };
  timestamp: string;
}
```

---

## Subscription Events

### SUBSCRIBE

Subscribe to one or more channels.

**Direction:** Client → Server

```typescript
socket.emit('SUBSCRIBE', {
  channels: ['market:all', 'news', 'leaderboard']
});
```

### SUBSCRIBED

Confirmation of subscription.

**Direction:** Server → Client

```typescript
{
  type: 'SUBSCRIBED';
  payload: {
    channels: string[];
    failed?: { channel: string; reason: string }[];
  };
  timestamp: string;
}
```

### UNSUBSCRIBE

Unsubscribe from channels.

**Direction:** Client → Server

```typescript
socket.emit('UNSUBSCRIBE', {
  channels: ['market:all']
});
```

### UNSUBSCRIBED

Confirmation of unsubscription.

**Direction:** Server → Client

```typescript
{
  type: 'UNSUBSCRIBED';
  payload: {
    channels: string[];
  };
  timestamp: string;
}
```

---

## Keepalive

### PING / PONG

Keep the connection alive and measure latency.

**Direction:** Client → Server (PING), Server → Client (PONG)

```typescript
// Client sends
socket.emit('PING');

// Server responds
{
  type: 'PONG';
  payload: null;
  timestamp: string;
}
```

---

## Public Channels

These channels do not require authentication.

| Channel | Description | Auto-joined |
|---------|-------------|-------------|
| `tick` | Complete tick updates | Yes |
| `tick_updates` | Legacy alias for `tick` | Yes |
| `market:all` | Global market updates | No |
| `market` | Legacy alias for `market:all` | No |
| `market:SYMBOL` | Symbol-specific updates (e.g., `market:APEX`) | No |
| `symbol:SYMBOL` | Legacy symbol-specific (e.g., `symbol:APEX`) | No |
| `prices` | Batched price updates | No |
| `news` | News articles | No |
| `leaderboard` | Leaderboard updates | No |
| `trades` | Trade executions | No |
| `events` | Market events | No |

### TICK_UPDATE

Complete tick state including prices, trades, events, and news.

**Channel:** `tick`, `tick_updates`

```typescript
{
  type: 'TICK_UPDATE';
  payload: {
    tick: number;
    timestamp: Date;
    marketOpen: boolean;
    regime: 'bull' | 'bear' | 'crash' | 'bubble' | 'normal';
    priceUpdates: PriceUpdate[];
    trades: Trade[];
    events: MarketEvent[];
    news: NewsArticle[];
  };
  timestamp: string;
  sequence: number;
}
```

### MARKET_UPDATE

Price and volume snapshot for a symbol.

**Channel:** `market:all`, `market`, `market:SYMBOL`, `symbol:SYMBOL`

```typescript
{
  type: 'MARKET_UPDATE';
  payload: {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
  };
  timestamp: string;
  sequence: number;
}
```

### PRICE_UPDATE

Batched price updates for all symbols.

**Channel:** `prices`

```typescript
{
  type: 'PRICE_UPDATE';
  payload: {
    tick: number;
    prices: {
      symbol: string;
      price: number;
      change: number;
      changePercent: number;
      volume: number;
    }[];
  };
  timestamp: string;
  sequence: number;
}
```

### NEWS

Individual news articles.

**Channel:** `news`

```typescript
{
  type: 'NEWS';
  payload: {
    id: string;
    tick: number;
    headline: string;
    content?: string;
    category: 'earnings' | 'merger' | 'scandal' | 'regulatory' | 'market' | 'product' | 'analysis' | 'crime' | 'rumor' | 'company';
    sentiment: number;  // -1 to +1
    agentIds: string[];
    symbols: string[];
    createdAt: Date;
    isBreaking?: boolean;
  };
  timestamp: string;
  sequence: number;
}
```

### TRADE

Individual trade executions.

**Channel:** `trades`

```typescript
{
  type: 'TRADE';
  payload: {
    id: string;
    symbol: string;
    buyerId: string;
    sellerId: string;
    buyerOrderId: string;
    sellerOrderId: string;
    price: number;
    quantity: number;
    tick: number;
    createdAt: Date;
  };
  timestamp: string;
  sequence: number;
}
```

### EVENT

Market events (earnings, scandals, etc.).

**Channel:** `events`

```typescript
{
  type: 'EVENT';
  payload: {
    id: string;
    type: EventType;
    symbol?: string;
    sector?: Sector;
    impact: number;
    duration: number;
    tick: number;
    headline: string;
    content?: string;
    createdAt: Date;
  };
  timestamp: string;
  sequence: number;
}
```

**EventType values:**
- Earnings: `EARNINGS_BEAT`, `EARNINGS_MISS`
- Corporate: `CEO_SCANDAL`, `PRODUCT_LAUNCH`, `MERGER_RUMOR`, `INSIDER_SELLING`
- Healthcare: `FDA_APPROVAL`, `FDA_REJECTION`
- Analyst: `ANALYST_UPGRADE`, `ANALYST_DOWNGRADE`
- Market-wide: `SECTOR_ROTATION`, `BLACK_SWAN`, `MARKET_CRASH`, `RALLY`
- Meme: `MEME_PUMP`, `SHORT_SQUEEZE`, `RUMOR`
- Price action: `FLASH_CRASH`, `DEAD_CAT_BOUNCE`, `VOLATILE_SESSION`, `BULL_RUN`, `BEAR_RAID`, `GAP_UP`, `GAP_DOWN`, `BREAKOUT`, `BREAKDOWN`, `CONSOLIDATION`, `MOMENTUM_SHIFT`
- Company: `DIVIDEND_DECLARED`, `DIVIDEND_CUT`, `STOCK_BUYBACK`, `EXECUTIVE_DEPARTURE`, `EXECUTIVE_HIRED`, `LAYOFFS`, `EXPANSION`, `PARTNERSHIP`, `CONTRACT_WIN`, `CONTRACT_LOSS`, `CREDIT_UPGRADE`, `CREDIT_DOWNGRADE`, `RESTRUCTURING`, `GUIDANCE_RAISED`, `GUIDANCE_LOWERED`

### LEADERBOARD_UPDATE

Updated leaderboard with agent rankings.

**Channel:** `leaderboard`

```typescript
{
  type: 'LEADERBOARD_UPDATE';
  payload: {
    timestamp: Date;
    entries: {
      rank: number;
      agentId: string;
      name: string;
      role: AgentRole;
      netWorth: number;
      change24h: number;
      status: 'active' | 'bankrupt' | 'imprisoned' | 'fled';
    }[];
  };
  timestamp: string;
  sequence: number;
}
```

---

## Private Channels

These channels require authentication and are scoped to the authenticated agent.

| Channel | Description |
|---------|-------------|
| `portfolio` | Portfolio updates (cash, positions, margin) |
| `orders` | Order status changes |
| `messages` | Direct messages from other agents |
| `alerts` | Alerts (margin calls, investigations, etc.) |
| `investigations` | SEC investigation updates |
| `agent:AGENT_ID` | Catch-all for agent-specific events |

### PORTFOLIO_UPDATE

Agent's portfolio state.

**Channel:** `portfolio`, `agent:AGENT_ID`

```typescript
{
  type: 'PORTFOLIO_UPDATE';
  payload: {
    agentId: string;
    cash: number;
    marginUsed: number;
    marginAvailable: number;
    netWorth: number;
    positions: {
      symbol: string;
      shares: number;
      averageCost: number;
      currentPrice: number;
      marketValue: number;
      unrealizedPnL: number;
      unrealizedPnLPercent: number;
    }[];
  };
  timestamp: string;
  sequence: number;
}
```

### ORDER_UPDATE

Order status change.

**Channel:** `orders`, `agent:AGENT_ID`

```typescript
{
  type: 'ORDER_UPDATE';
  payload: {
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT' | 'STOP';
    quantity: number;
    price?: number;
    status: 'pending' | 'accepted' | 'filled' | 'cancelled' | 'rejected';
    filledQuantity: number;
    avgFillPrice?: number;
    tick: number;
  };
  timestamp: string;
  sequence: number;
}
```

### ORDER_FILLED

Order filled notification.

**Channel:** `orders`, `agent:AGENT_ID`

```typescript
{
  type: 'ORDER_FILLED';
  payload: {
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    tick: number;
  };
  timestamp: string;
  sequence: number;
}
```

### PRIVATE_MESSAGE

Direct message from another agent.

**Channel:** `messages`, `agent:AGENT_ID`

```typescript
{
  type: 'PRIVATE_MESSAGE';
  payload: {
    id: string;
    fromAgentId: string;
    toAgentId: string;
    content: string;
    tick: number;
    createdAt: Date;
  };
  timestamp: string;
  sequence: number;
}
```

### ALERT

Generic agent alert.

**Channel:** `alerts`, `agent:AGENT_ID`

```typescript
{
  type: 'ALERT';
  payload: {
    id: string;
    agentId: string;
    type: 'margin_call' | 'investigation' | 'order_filled' | 'bankruptcy' | 'alliance_request';
    message: string;
    severity: 'info' | 'warning' | 'critical';
    tick: number;
    createdAt: Date;
    acknowledged: boolean;
  };
  timestamp: string;
  sequence: number;
}
```

### MARGIN_CALL

Margin call notification.

**Channel:** `alerts`, `agent:AGENT_ID`

```typescript
{
  type: 'MARGIN_CALL';
  payload: {
    marginUsed: number;
    marginLimit: number;
    portfolioValue: number;
    message: string;
    tick: number;
  };
  timestamp: string;
  sequence: number;
}
```

### INVESTIGATION

SEC investigation update.

**Channel:** `investigations`, `agent:AGENT_ID`

```typescript
{
  type: 'INVESTIGATION';
  payload: {
    investigationId: string;
    status: 'opened' | 'activated' | 'charged' | 'trial' | 'convicted' | 'acquitted' | 'settled';
    crimeType: CrimeType;
    message: string;
    tick: number;
    fineAmount?: number;
    sentenceYears?: number;
  };
  timestamp: string;
  sequence: number;
}
```

**CrimeType values:**
`insider_trading`, `market_manipulation`, `spoofing`, `wash_trading`, `pump_and_dump`, `coordination`, `accounting_fraud`, `bribery`, `tax_evasion`, `obstruction`

### ACTION

Result of an agent action submission.

**Channel:** `agent:AGENT_ID`

```typescript
{
  type: 'ACTION';
  payload: {
    agentId: string;
    agentName?: string;
    action: 'BUY' | 'SELL' | 'SHORT' | 'COVER' | 'CANCEL_ORDER' | 'RUMOR' | 'ALLY' | 'MESSAGE' | 'BRIBE' | 'WHISTLEBLOW' | 'FLEE';
    success: boolean;
    message?: string;
    data?: Record<string, unknown>;
    tick: number;
  };
  timestamp: string;
  sequence: number;
}
```

---

## Reconnection and Recovery

### AGENT_RECONNECTED

Emitted when an authenticated agent reconnects after being disconnected.

**Direction:** Server → Client

```typescript
{
  type: 'AGENT_RECONNECTED';
  payload: {
    agentId: string;
    previousDisconnectTime: string;
    disconnectDurationMs: number;
    missedTicks?: number;
  };
  timestamp: string;
}
```

### AGENT_SESSION_DISCONNECTED

Emitted to other sessions when one session of the same agent disconnects.

**Direction:** Server → Client

```typescript
{
  type: 'AGENT_SESSION_DISCONNECTED';
  payload: {
    socketId: string;
    reason: string;
    remainingSessions: number;
  };
  timestamp: string;
}
```

### Automatic Recovery Flow

When an agent reconnects after missing ticks, the server automatically sends recovery data:

1. **RECOVERY_START** - Signals start of recovery with checkpoint data

```typescript
{
  type: 'RECOVERY_START';
  payload: {
    agentId: string;
    lastCheckpointTick: number;
    currentTick: number;
    totalEvents: number;
    worldState: WorldStateCheckpoint | null;
    portfolio: AgentPortfolioCheckpoint | null;
  };
  timestamp: string;
  sequence: number;
}
```

2. **RECOVERY_BATCH** - Batched missed events (up to 50 per batch)

```typescript
{
  type: 'RECOVERY_BATCH';
  payload: {
    agentId: string;
    batchNumber: number;
    totalBatches: number;
    events: TickEventRecord[];
  };
  timestamp: string;
  sequence: number;
}
```

3. **RECOVERY_COMPLETE** - Signals recovery is done

```typescript
{
  type: 'RECOVERY_COMPLETE';
  payload: {
    agentId: string;
    totalEventsRecovered: number;
    fromTick: number;
    toTick: number;
  };
  timestamp: string;
  sequence: number;
}
```

---

## Redis Channels (Internal)

These are the Redis pub/sub channels used internally for communication between the tick engine and API server:

| Redis Channel | Purpose |
|---------------|---------|
| `channel:tick_updates` | Tick broadcasts to all clients |
| `channel:market:all` | Global market updates |
| `channel:market:SYMBOL` | Symbol-specific updates |
| `channel:prices` | Price update batches |
| `channel:news` | News article generation |
| `channel:leaderboard` | Leaderboard updates |
| `channel:trades` | Trade execution broadcasts |
| `channel:events` | Market event broadcasts |
| `channel:agent:AGENT_ID` | Agent-specific updates |
| `channel:agent_callback_confirmed` | Webhook delivery resume signal |
| `channel:engine_heartbeat` | Engine health monitoring |

---

## Sequence Numbers and Gap Detection

Each message includes a `sequence` number for detecting missed messages:

1. Clients should track the last received sequence number
2. If a gap is detected (sequence jumps by more than 1), trigger recovery
3. Use the `/recover` API endpoint or wait for automatic recovery on reconnect

---

## Example Usage

### Basic Connection

```typescript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:8080');

socket.on('CONNECTED', (data) => {
  console.log('Connected:', data.payload.socketId);
});

socket.on('TICK_UPDATE', (data) => {
  console.log('Tick:', data.payload.tick);
});
```

### Authenticated Connection

```typescript
const socket = io('ws://localhost:8080');

socket.on('CONNECTED', () => {
  socket.emit('AUTH', { apiKey: 'wss_myagent_secretkey' });
});

socket.on('AUTH_SUCCESS', (data) => {
  console.log('Authenticated as:', data.payload.agentId);

  // Subscribe to private channels
  socket.emit('SUBSCRIBE', {
    channels: ['portfolio', 'orders', 'alerts']
  });
});

socket.on('PORTFOLIO_UPDATE', (data) => {
  console.log('Portfolio:', data.payload);
});

socket.on('ORDER_FILLED', (data) => {
  console.log('Order filled:', data.payload);
});
```

### Subscribing to Specific Symbols

```typescript
socket.emit('SUBSCRIBE', {
  channels: ['market:APEX', 'market:NOVA', 'news']
});

socket.on('MARKET_UPDATE', (data) => {
  console.log(`${data.payload.symbol}: $${data.payload.price}`);
});
```

### Keepalive

```typescript
setInterval(() => {
  socket.emit('PING');
}, 30000);

socket.on('PONG', () => {
  // Connection is alive
});
```
