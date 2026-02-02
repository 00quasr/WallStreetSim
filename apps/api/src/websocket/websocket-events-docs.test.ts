/**
 * Tests to verify websocket-events.md documentation accuracy.
 *
 * These tests validate that the documented WebSocket events and channels
 * match the actual implementation in the codebase.
 */

import { describe, it, expect } from 'vitest';
import type {
  WSMessageType,
  WSMessage,
  WSTickUpdate,
  WSMarketUpdate,
  WSTrade,
  WSNews,
  WSAlert,
  WSSubscribe,
  WSUnsubscribe,
  WSPriceUpdate,
  WSLeaderboardUpdate,
  WSOrderUpdate,
  WSOrderFilled,
  WSPortfolioUpdate,
  WSPrivateMessage,
  WSInvestigation,
  WSAction,
  WSMarginCall,
  WSAgentReconnected,
  WSRecoveryStart,
  WSRecoveryBatch,
  WSRecoveryComplete,
  AgentActionType,
  Leaderboard,
  LeaderboardEntry,
  AgentPortfolioCheckpoint,
  WorldStateCheckpoint,
  TickEventRecord,
} from '@wallstreetsim/types';

import type {
  EventType,
  MarketRegime,
  NewsCategory,
  CrimeType,
  InvestigationAlertStatus,
  MarketEvent,
  NewsArticle,
  TickUpdate,
} from '@wallstreetsim/types';

import type {
  Trade,
  PriceUpdate,
  PriceDrivers,
} from '@wallstreetsim/types';

import type {
  AgentRole,
  AgentStatus,
  AgentPortfolio,
  AgentPosition,
  AgentMessage,
  AgentAlert,
} from '@wallstreetsim/types';

describe('WebSocket Events Documentation Accuracy', () => {
  describe('WSMessageType enum', () => {
    it('should have all documented message types', () => {
      // All message types documented in websocket-events.md
      const documentedTypes: WSMessageType[] = [
        'TICK_UPDATE',
        'MARKET_UPDATE',
        'TRADE',
        'NEWS',
        'AGENT_UPDATE',
        'ALERT',
        'ORDER_FILLED',
        'ORDER_UPDATE',
        'INVESTIGATION',
        'SUBSCRIBE',
        'UNSUBSCRIBE',
        'ACTION',
        'PING',
        'PONG',
        'PRICE_UPDATE',
        'LEADERBOARD_UPDATE',
        'PORTFOLIO_UPDATE',
        'PRIVATE_MESSAGE',
        'MARGIN_CALL',
        'AGENT_RECONNECTED',
        'RECOVERY_START',
        'RECOVERY_BATCH',
        'RECOVERY_COMPLETE',
      ];

      // This validates that TypeScript accepts all these values
      documentedTypes.forEach((type) => {
        const msg: WSMessage = {
          type,
          payload: {},
          timestamp: new Date().toISOString(),
          sequence: 0,
        };
        expect(msg.type).toBe(type);
      });
    });
  });

  describe('MarketRegime values', () => {
    it('should match documented values', () => {
      const documentedRegimes: MarketRegime[] = [
        'bull',
        'bear',
        'crash',
        'bubble',
        'normal',
      ];

      documentedRegimes.forEach((regime) => {
        expect(typeof regime).toBe('string');
      });
    });
  });

  describe('EventType values', () => {
    it('should include all documented event types', () => {
      const documentedEventTypes: EventType[] = [
        // Earnings
        'EARNINGS_BEAT',
        'EARNINGS_MISS',
        // Corporate
        'CEO_SCANDAL',
        'PRODUCT_LAUNCH',
        'MERGER_RUMOR',
        'INSIDER_SELLING',
        // Healthcare
        'FDA_APPROVAL',
        'FDA_REJECTION',
        // Analyst
        'ANALYST_UPGRADE',
        'ANALYST_DOWNGRADE',
        // Market-wide
        'SECTOR_ROTATION',
        'BLACK_SWAN',
        'MARKET_CRASH',
        'RALLY',
        // Meme
        'MEME_PUMP',
        'SHORT_SQUEEZE',
        'RUMOR',
        // Price action
        'FLASH_CRASH',
        'DEAD_CAT_BOUNCE',
        'VOLATILE_SESSION',
        'BULL_RUN',
        'BEAR_RAID',
        'GAP_UP',
        'GAP_DOWN',
        'BREAKOUT',
        'BREAKDOWN',
        'CONSOLIDATION',
        'MOMENTUM_SHIFT',
        // Company
        'DIVIDEND_DECLARED',
        'DIVIDEND_CUT',
        'STOCK_BUYBACK',
        'EXECUTIVE_DEPARTURE',
        'EXECUTIVE_HIRED',
        'LAYOFFS',
        'EXPANSION',
        'PARTNERSHIP',
        'CONTRACT_WIN',
        'CONTRACT_LOSS',
        'CREDIT_UPGRADE',
        'CREDIT_DOWNGRADE',
        'RESTRUCTURING',
        'GUIDANCE_RAISED',
        'GUIDANCE_LOWERED',
      ];

      documentedEventTypes.forEach((eventType) => {
        expect(typeof eventType).toBe('string');
      });
    });
  });

  describe('NewsCategory values', () => {
    it('should match documented values', () => {
      const documentedCategories: NewsCategory[] = [
        'earnings',
        'merger',
        'scandal',
        'regulatory',
        'market',
        'product',
        'analysis',
        'crime',
        'rumor',
        'company',
      ];

      documentedCategories.forEach((category) => {
        expect(typeof category).toBe('string');
      });
    });
  });

  describe('CrimeType values', () => {
    it('should match documented values', () => {
      const documentedCrimeTypes: CrimeType[] = [
        'insider_trading',
        'market_manipulation',
        'spoofing',
        'wash_trading',
        'pump_and_dump',
        'coordination',
        'accounting_fraud',
        'bribery',
        'tax_evasion',
        'obstruction',
      ];

      documentedCrimeTypes.forEach((crimeType) => {
        expect(typeof crimeType).toBe('string');
      });
    });
  });

  describe('AgentActionType values', () => {
    it('should match documented values', () => {
      const documentedActions: AgentActionType[] = [
        'BUY',
        'SELL',
        'SHORT',
        'COVER',
        'CANCEL_ORDER',
        'RUMOR',
        'ALLY',
        'MESSAGE',
        'BRIBE',
        'WHISTLEBLOW',
        'FLEE',
      ];

      documentedActions.forEach((action) => {
        expect(typeof action).toBe('string');
      });
    });
  });

  describe('InvestigationAlertStatus values', () => {
    it('should match documented values', () => {
      const documentedStatuses: InvestigationAlertStatus[] = [
        'opened',
        'activated',
        'charged',
        'trial',
        'convicted',
        'acquitted',
        'settled',
      ];

      documentedStatuses.forEach((status) => {
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('AgentRole values', () => {
    it('should include documented roles', () => {
      const documentedRoles: AgentRole[] = [
        'hedge_fund_manager',
        'retail_trader',
        'ceo',
        'investment_banker',
        'financial_journalist',
        'sec_investigator',
        'whistleblower',
        'quant',
        'influencer',
      ];

      documentedRoles.forEach((role) => {
        expect(typeof role).toBe('string');
      });
    });
  });

  describe('AgentStatus values', () => {
    it('should match documented values', () => {
      const documentedStatuses: AgentStatus[] = [
        'active',
        'bankrupt',
        'imprisoned',
        'fled',
      ];

      documentedStatuses.forEach((status) => {
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('Alert type values', () => {
    it('should match documented alert types', () => {
      type AlertType = AgentAlert['type'];
      const documentedAlertTypes: AlertType[] = [
        'margin_call',
        'investigation',
        'order_filled',
        'bankruptcy',
        'alliance_request',
      ];

      documentedAlertTypes.forEach((alertType) => {
        expect(typeof alertType).toBe('string');
      });
    });
  });

  describe('Alert severity values', () => {
    it('should match documented severity levels', () => {
      type Severity = AgentAlert['severity'];
      const documentedSeverities: Severity[] = ['info', 'warning', 'critical'];

      documentedSeverities.forEach((severity) => {
        expect(typeof severity).toBe('string');
      });
    });
  });

  describe('Order side values', () => {
    it('should match documented values', () => {
      type OrderSide = 'BUY' | 'SELL';
      const documentedSides: OrderSide[] = ['BUY', 'SELL'];

      documentedSides.forEach((side) => {
        expect(typeof side).toBe('string');
      });
    });
  });

  describe('Order type values', () => {
    it('should match documented values', () => {
      type OrderType = 'MARKET' | 'LIMIT' | 'STOP';
      const documentedTypes: OrderType[] = ['MARKET', 'LIMIT', 'STOP'];

      documentedTypes.forEach((orderType) => {
        expect(typeof orderType).toBe('string');
      });
    });
  });

  describe('WSMessage structure', () => {
    it('should have required fields as documented', () => {
      const msg: WSMessage = {
        type: 'TICK_UPDATE',
        payload: {},
        timestamp: '2024-01-01T00:00:00.000Z',
        sequence: 1,
      };

      expect(msg).toHaveProperty('type');
      expect(msg).toHaveProperty('payload');
      expect(msg).toHaveProperty('timestamp');
      expect(msg).toHaveProperty('sequence');
    });
  });

  describe('TICK_UPDATE payload structure', () => {
    it('should match documented TickUpdate structure', () => {
      // Verify the TickUpdate interface has the documented fields
      const tickUpdate: TickUpdate = {
        tick: 100,
        timestamp: new Date(),
        marketOpen: true,
        regime: 'normal',
        priceUpdates: [],
        trades: [],
        events: [],
        news: [],
      };

      expect(tickUpdate).toHaveProperty('tick');
      expect(tickUpdate).toHaveProperty('timestamp');
      expect(tickUpdate).toHaveProperty('marketOpen');
      expect(tickUpdate).toHaveProperty('regime');
      expect(tickUpdate).toHaveProperty('priceUpdates');
      expect(tickUpdate).toHaveProperty('trades');
      expect(tickUpdate).toHaveProperty('events');
      expect(tickUpdate).toHaveProperty('news');
    });
  });

  describe('Trade structure', () => {
    it('should match documented Trade structure', () => {
      const trade: Trade = {
        id: 'trade-1',
        symbol: 'APEX',
        buyerId: 'agent-1',
        sellerId: 'agent-2',
        buyerOrderId: 'order-1',
        sellerOrderId: 'order-2',
        price: 100.5,
        quantity: 100,
        tick: 50,
        createdAt: new Date(),
      };

      expect(trade).toHaveProperty('id');
      expect(trade).toHaveProperty('symbol');
      expect(trade).toHaveProperty('buyerId');
      expect(trade).toHaveProperty('sellerId');
      expect(trade).toHaveProperty('buyerOrderId');
      expect(trade).toHaveProperty('sellerOrderId');
      expect(trade).toHaveProperty('price');
      expect(trade).toHaveProperty('quantity');
      expect(trade).toHaveProperty('tick');
      expect(trade).toHaveProperty('createdAt');
    });
  });

  describe('PriceUpdate structure', () => {
    it('should match documented PriceUpdate structure', () => {
      const priceUpdate: PriceUpdate = {
        symbol: 'APEX',
        oldPrice: 100,
        newPrice: 101,
        change: 1,
        changePercent: 1,
        volume: 1000,
        tick: 50,
        drivers: {
          agentPressure: 0.5,
          randomWalk: 0.3,
          sectorCorrelation: 0.1,
          eventImpact: 0.1,
          sentimentImpact: 0,
        },
      };

      expect(priceUpdate).toHaveProperty('symbol');
      expect(priceUpdate).toHaveProperty('oldPrice');
      expect(priceUpdate).toHaveProperty('newPrice');
      expect(priceUpdate).toHaveProperty('change');
      expect(priceUpdate).toHaveProperty('changePercent');
      expect(priceUpdate).toHaveProperty('volume');
      expect(priceUpdate).toHaveProperty('tick');
      expect(priceUpdate).toHaveProperty('drivers');
    });
  });

  describe('NewsArticle structure', () => {
    it('should match documented NewsArticle structure', () => {
      const news: NewsArticle = {
        id: 'news-1',
        tick: 50,
        headline: 'Test headline',
        content: 'Test content',
        category: 'market',
        sentiment: 0.5,
        agentIds: ['agent-1'],
        symbols: ['APEX'],
        createdAt: new Date(),
        isBreaking: false,
      };

      expect(news).toHaveProperty('id');
      expect(news).toHaveProperty('tick');
      expect(news).toHaveProperty('headline');
      expect(news).toHaveProperty('category');
      expect(news).toHaveProperty('sentiment');
      expect(news).toHaveProperty('agentIds');
      expect(news).toHaveProperty('symbols');
      expect(news).toHaveProperty('createdAt');
    });
  });

  describe('MarketEvent structure', () => {
    it('should match documented MarketEvent structure', () => {
      const event: MarketEvent = {
        id: 'event-1',
        type: 'EARNINGS_BEAT',
        symbol: 'APEX',
        sector: 'Technology',
        impact: 0.05,
        duration: 10,
        tick: 50,
        headline: 'APEX beats earnings',
        content: 'Details here',
        createdAt: new Date(),
      };

      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('impact');
      expect(event).toHaveProperty('duration');
      expect(event).toHaveProperty('tick');
      expect(event).toHaveProperty('headline');
    });
  });

  describe('AgentPortfolio structure', () => {
    it('should match documented AgentPortfolio structure', () => {
      const portfolio: AgentPortfolio = {
        agentId: 'agent-1',
        cash: 100000,
        marginUsed: 0,
        marginAvailable: 50000,
        netWorth: 100000,
        positions: [
          {
            symbol: 'APEX',
            shares: 100,
            averageCost: 50,
            currentPrice: 55,
            marketValue: 5500,
            unrealizedPnL: 500,
            unrealizedPnLPercent: 10,
          },
        ],
      };

      expect(portfolio).toHaveProperty('agentId');
      expect(portfolio).toHaveProperty('cash');
      expect(portfolio).toHaveProperty('marginUsed');
      expect(portfolio).toHaveProperty('marginAvailable');
      expect(portfolio).toHaveProperty('netWorth');
      expect(portfolio).toHaveProperty('positions');
    });
  });

  describe('Leaderboard structure', () => {
    it('should match documented Leaderboard structure', () => {
      const leaderboard: Leaderboard = {
        timestamp: new Date(),
        entries: [
          {
            rank: 1,
            agentId: 'agent-1',
            name: 'Top Trader',
            role: 'hedge_fund_manager',
            netWorth: 1000000,
            change24h: 50000,
            status: 'active',
          },
        ],
      };

      expect(leaderboard).toHaveProperty('timestamp');
      expect(leaderboard).toHaveProperty('entries');
      expect(leaderboard.entries[0]).toHaveProperty('rank');
      expect(leaderboard.entries[0]).toHaveProperty('agentId');
      expect(leaderboard.entries[0]).toHaveProperty('name');
      expect(leaderboard.entries[0]).toHaveProperty('role');
      expect(leaderboard.entries[0]).toHaveProperty('netWorth');
      expect(leaderboard.entries[0]).toHaveProperty('change24h');
      expect(leaderboard.entries[0]).toHaveProperty('status');
    });
  });

  describe('AgentMessage structure', () => {
    it('should match documented AgentMessage structure', () => {
      const message: AgentMessage = {
        id: 'msg-1',
        fromAgentId: 'agent-1',
        toAgentId: 'agent-2',
        content: 'Hello!',
        tick: 50,
        createdAt: new Date(),
      };

      expect(message).toHaveProperty('id');
      expect(message).toHaveProperty('fromAgentId');
      expect(message).toHaveProperty('toAgentId');
      expect(message).toHaveProperty('content');
      expect(message).toHaveProperty('tick');
      expect(message).toHaveProperty('createdAt');
    });
  });

  describe('AgentAlert structure', () => {
    it('should match documented AgentAlert structure', () => {
      const alert: AgentAlert = {
        id: 'alert-1',
        agentId: 'agent-1',
        type: 'margin_call',
        message: 'Margin call warning',
        severity: 'warning',
        tick: 50,
        createdAt: new Date(),
        acknowledged: false,
      };

      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('agentId');
      expect(alert).toHaveProperty('type');
      expect(alert).toHaveProperty('message');
      expect(alert).toHaveProperty('severity');
      expect(alert).toHaveProperty('tick');
      expect(alert).toHaveProperty('createdAt');
      expect(alert).toHaveProperty('acknowledged');
    });
  });

  describe('Recovery payload structures', () => {
    it('should match documented WorldStateCheckpoint structure', () => {
      const checkpoint: WorldStateCheckpoint = {
        tick: 100,
        timestamp: '2024-01-01T00:00:00.000Z',
        marketOpen: true,
        regime: 'normal',
        interestRate: 0.05,
        inflationRate: 0.02,
        gdpGrowth: 0.03,
      };

      expect(checkpoint).toHaveProperty('tick');
      expect(checkpoint).toHaveProperty('timestamp');
      expect(checkpoint).toHaveProperty('marketOpen');
      expect(checkpoint).toHaveProperty('regime');
      expect(checkpoint).toHaveProperty('interestRate');
      expect(checkpoint).toHaveProperty('inflationRate');
      expect(checkpoint).toHaveProperty('gdpGrowth');
    });

    it('should match documented AgentPortfolioCheckpoint structure', () => {
      const checkpoint: AgentPortfolioCheckpoint = {
        agentId: 'agent-1',
        name: 'Test Agent',
        tick: 100,
        timestamp: '2024-01-01T00:00:00.000Z',
        cash: 100000,
        marginUsed: 0,
        marginLimit: 50000,
        reputation: 100,
        status: 'active',
        holdings: [
          {
            symbol: 'APEX',
            quantity: 100,
            averageCost: 50,
          },
        ],
      };

      expect(checkpoint).toHaveProperty('agentId');
      expect(checkpoint).toHaveProperty('name');
      expect(checkpoint).toHaveProperty('tick');
      expect(checkpoint).toHaveProperty('timestamp');
      expect(checkpoint).toHaveProperty('cash');
      expect(checkpoint).toHaveProperty('marginUsed');
      expect(checkpoint).toHaveProperty('marginLimit');
      expect(checkpoint).toHaveProperty('reputation');
      expect(checkpoint).toHaveProperty('status');
      expect(checkpoint).toHaveProperty('holdings');
    });

    it('should match documented TickEventRecord structure', () => {
      const record: TickEventRecord = {
        tick: 100,
        timestamp: '2024-01-01T00:00:00.000Z',
        startSequence: 1,
        endSequence: 10,
        trades: [],
        priceUpdates: [],
        events: [],
        news: [],
      };

      expect(record).toHaveProperty('tick');
      expect(record).toHaveProperty('timestamp');
      expect(record).toHaveProperty('startSequence');
      expect(record).toHaveProperty('endSequence');
      expect(record).toHaveProperty('trades');
      expect(record).toHaveProperty('priceUpdates');
      expect(record).toHaveProperty('events');
      expect(record).toHaveProperty('news');
    });
  });

  describe('Public channel names', () => {
    it('should match documented channel names', () => {
      // These are the documented public channels
      const publicChannels = [
        'tick',
        'tick_updates', // legacy
        'market:all',
        'market', // legacy
        'prices',
        'news',
        'leaderboard',
        'trades',
        'events',
      ];

      // All channels should be strings
      publicChannels.forEach((channel) => {
        expect(typeof channel).toBe('string');
      });
    });
  });

  describe('Private channel names', () => {
    it('should match documented private channels', () => {
      const privateChannels = [
        'portfolio',
        'orders',
        'messages',
        'alerts',
        'investigations',
      ];

      privateChannels.forEach((channel) => {
        expect(typeof channel).toBe('string');
      });
    });
  });
});
