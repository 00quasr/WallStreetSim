import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import {
  agents,
  agentsRelations,
  alliances,
  alliancesRelations,
  companies,
  companiesRelations,
  holdings,
  holdingsRelations,
  orders,
  ordersRelations,
  trades,
  tradesRelations,
  actions,
  actionsRelations,
  investigations,
  investigationsRelations,
  news,
  messages,
  messagesRelations,
  worldState,
} from './schema';

describe('database schema validation', () => {
  describe('agents table', () => {
    it('should have 21 columns', () => {
      const columns = getTableColumns(agents);
      expect(Object.keys(columns)).toHaveLength(21);
    });

    it('should have uuid primary key', () => {
      const columns = getTableColumns(agents);
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have foreign key reference to alliances', () => {
      const columns = getTableColumns(agents);
      expect(columns.allianceId).toBeDefined();
      expect(columns.allianceId.notNull).toBe(false);
    });

    it('should have relations defined', () => {
      expect(agentsRelations).toBeDefined();
    });
  });

  describe('alliances table', () => {
    it('should have 8 columns', () => {
      const columns = getTableColumns(alliances);
      expect(Object.keys(columns)).toHaveLength(8);
    });

    it('should have uuid primary key', () => {
      const columns = getTableColumns(alliances);
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have relations defined', () => {
      expect(alliancesRelations).toBeDefined();
    });
  });

  describe('companies table', () => {
    it('should have 24 columns', () => {
      const columns = getTableColumns(companies);
      expect(Object.keys(columns)).toHaveLength(24);
    });

    it('should have uuid primary key', () => {
      const columns = getTableColumns(companies);
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have unique symbol', () => {
      const columns = getTableColumns(companies);
      expect(columns.symbol.isUnique).toBe(true);
    });

    it('should have relations defined', () => {
      expect(companiesRelations).toBeDefined();
    });
  });

  describe('holdings table', () => {
    it('should have 7 columns', () => {
      const columns = getTableColumns(holdings);
      expect(Object.keys(columns)).toHaveLength(7);
    });

    it('should have uuid primary key', () => {
      const columns = getTableColumns(holdings);
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have agentId as required', () => {
      const columns = getTableColumns(holdings);
      expect(columns.agentId.notNull).toBe(true);
    });

    it('should have relations defined', () => {
      expect(holdingsRelations).toBeDefined();
    });
  });

  describe('orders table', () => {
    it('should have 14 columns', () => {
      const columns = getTableColumns(orders);
      expect(Object.keys(columns)).toHaveLength(14);
    });

    it('should have uuid primary key', () => {
      const columns = getTableColumns(orders);
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have required order fields', () => {
      const columns = getTableColumns(orders);
      expect(columns.agentId.notNull).toBe(true);
      expect(columns.symbol.notNull).toBe(true);
      expect(columns.side.notNull).toBe(true);
      expect(columns.orderType.notNull).toBe(true);
      expect(columns.quantity.notNull).toBe(true);
    });

    it('should have relations defined', () => {
      expect(ordersRelations).toBeDefined();
    });
  });

  describe('trades table', () => {
    it('should have 10 columns', () => {
      const columns = getTableColumns(trades);
      expect(Object.keys(columns)).toHaveLength(10);
    });

    it('should have uuid primary key', () => {
      const columns = getTableColumns(trades);
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have required trade fields', () => {
      const columns = getTableColumns(trades);
      expect(columns.tick.notNull).toBe(true);
      expect(columns.symbol.notNull).toBe(true);
      expect(columns.quantity.notNull).toBe(true);
      expect(columns.price.notNull).toBe(true);
    });

    it('should have nullable buyer/seller (for market maker trades)', () => {
      const columns = getTableColumns(trades);
      expect(columns.buyerId.notNull).toBe(false);
      expect(columns.sellerId.notNull).toBe(false);
    });

    it('should have relations defined', () => {
      expect(tradesRelations).toBeDefined();
    });
  });

  describe('actions table', () => {
    it('should have 10 columns', () => {
      const columns = getTableColumns(actions);
      expect(Object.keys(columns)).toHaveLength(10);
    });

    it('should have uuid primary key', () => {
      const columns = getTableColumns(actions);
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have required action fields', () => {
      const columns = getTableColumns(actions);
      expect(columns.tick.notNull).toBe(true);
      expect(columns.agentId.notNull).toBe(true);
      expect(columns.actionType.notNull).toBe(true);
      expect(columns.payload.notNull).toBe(true);
    });

    it('should have relations defined', () => {
      expect(actionsRelations).toBeDefined();
    });
  });

  describe('investigations table', () => {
    it('should have 11 columns', () => {
      const columns = getTableColumns(investigations);
      expect(Object.keys(columns)).toHaveLength(11);
    });

    it('should have uuid primary key', () => {
      const columns = getTableColumns(investigations);
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have required investigation fields', () => {
      const columns = getTableColumns(investigations);
      expect(columns.agentId.notNull).toBe(true);
      expect(columns.crimeType.notNull).toBe(true);
      expect(columns.tickOpened.notNull).toBe(true);
    });

    it('should have relations defined', () => {
      expect(investigationsRelations).toBeDefined();
    });
  });

  describe('news table', () => {
    it('should have 9 columns', () => {
      const columns = getTableColumns(news);
      expect(Object.keys(columns)).toHaveLength(9);
    });

    it('should have uuid primary key', () => {
      const columns = getTableColumns(news);
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have required news fields', () => {
      const columns = getTableColumns(news);
      expect(columns.tick.notNull).toBe(true);
      expect(columns.headline.notNull).toBe(true);
    });
  });

  describe('messages table', () => {
    it('should have 11 columns', () => {
      const columns = getTableColumns(messages);
      expect(Object.keys(columns)).toHaveLength(11);
    });

    it('should have uuid primary key', () => {
      const columns = getTableColumns(messages);
      expect(columns.id.dataType).toBe('string');
      expect(columns.id.primary).toBe(true);
    });

    it('should have required message fields', () => {
      const columns = getTableColumns(messages);
      expect(columns.tick.notNull).toBe(true);
      expect(columns.senderId.notNull).toBe(true);
      expect(columns.content.notNull).toBe(true);
    });

    it('should have nullable recipientId for broadcasts', () => {
      const columns = getTableColumns(messages);
      expect(columns.recipientId.notNull).toBe(false);
    });

    it('should have relations defined', () => {
      expect(messagesRelations).toBeDefined();
    });
  });

  describe('worldState table', () => {
    it('should have 8 columns', () => {
      const columns = getTableColumns(worldState);
      expect(Object.keys(columns)).toHaveLength(8);
    });

    it('should have integer primary key', () => {
      const columns = getTableColumns(worldState);
      expect(columns.id.dataType).toBe('number');
      expect(columns.id.primary).toBe(true);
    });

    it('should have required world state fields', () => {
      const columns = getTableColumns(worldState);
      expect(columns.currentTick.notNull).toBe(true);
      expect(columns.marketOpen.notNull).toBe(true);
      expect(columns.interestRate.notNull).toBe(true);
      expect(columns.inflationRate.notNull).toBe(true);
      expect(columns.gdpGrowth.notNull).toBe(true);
      expect(columns.regime.notNull).toBe(true);
    });

    it('should have default values for all required fields', () => {
      const columns = getTableColumns(worldState);
      expect(columns.id.hasDefault).toBe(true);
      expect(columns.currentTick.hasDefault).toBe(true);
      expect(columns.marketOpen.hasDefault).toBe(true);
      expect(columns.interestRate.hasDefault).toBe(true);
      expect(columns.inflationRate.hasDefault).toBe(true);
      expect(columns.gdpGrowth.hasDefault).toBe(true);
      expect(columns.regime.hasDefault).toBe(true);
    });
  });
});

describe('table relationships', () => {
  it('agents should have alliance relationship', () => {
    const columns = getTableColumns(agents);
    expect(columns.allianceId).toBeDefined();
  });

  it('holdings should reference agents', () => {
    const columns = getTableColumns(holdings);
    expect(columns.agentId).toBeDefined();
    expect(columns.agentId.notNull).toBe(true);
  });

  it('orders should reference agents', () => {
    const columns = getTableColumns(orders);
    expect(columns.agentId).toBeDefined();
    expect(columns.agentId.notNull).toBe(true);
  });

  it('trades should reference agents and orders', () => {
    const columns = getTableColumns(trades);
    expect(columns.buyerId).toBeDefined();
    expect(columns.sellerId).toBeDefined();
    expect(columns.buyerOrderId).toBeDefined();
    expect(columns.sellerOrderId).toBeDefined();
  });

  it('actions should reference agents', () => {
    const columns = getTableColumns(actions);
    expect(columns.agentId).toBeDefined();
    expect(columns.targetAgentId).toBeDefined();
  });

  it('investigations should reference agents', () => {
    const columns = getTableColumns(investigations);
    expect(columns.agentId).toBeDefined();
  });

  it('messages should reference sender and recipient agents', () => {
    const columns = getTableColumns(messages);
    expect(columns.senderId).toBeDefined();
    expect(columns.recipientId).toBeDefined();
  });

  it('companies should reference CEO agent', () => {
    const columns = getTableColumns(companies);
    expect(columns.ceoAgentId).toBeDefined();
  });
});
