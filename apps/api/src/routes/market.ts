import { Hono } from 'hono';
import { db, companies, trades } from '@wallstreetsim/db';
import { eq, desc } from 'drizzle-orm';
import { PaginationSchema } from '@wallstreetsim/utils';
import type { Sector } from '@wallstreetsim/types';

const market = new Hono();

/**
 * GET /market/stocks - List all stocks
 */
market.get('/stocks', async (c) => {
  const query = c.req.query();
  const pagination = PaginationSchema.safeParse(query);
  const sector = query.sector as Sector | undefined;

  const page = pagination.success ? pagination.data.page : 1;
  const pageSize = pagination.success ? pagination.data.pageSize : 50;
  const offset = (page - 1) * pageSize;

  let baseQuery = db
    .select({
      symbol: companies.symbol,
      name: companies.name,
      sector: companies.sector,
      price: companies.currentPrice,
      previousClose: companies.previousClose,
      high: companies.highPrice,
      low: companies.lowPrice,
      marketCap: companies.marketCap,
      volatility: companies.volatility,
    })
    .from(companies)
    .where(eq(companies.isPublic, true))
    .orderBy(desc(companies.marketCap))
    .limit(pageSize)
    .offset(offset);

  const rows = await baseQuery;

  const stocks = rows.map(row => {
    const price = parseFloat(row.price || '0');
    const previousClose = parseFloat(row.previousClose || '0');
    const change = price - previousClose;
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

    return {
      symbol: row.symbol,
      name: row.name,
      sector: row.sector,
      price,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      high: parseFloat(row.high || '0'),
      low: parseFloat(row.low || '0'),
      marketCap: parseFloat(row.marketCap || '0'),
      volatility: parseFloat(row.volatility || '0'),
    };
  });

  return c.json({
    success: true,
    data: {
      items: stocks,
      page,
      pageSize,
      hasMore: rows.length === pageSize,
    },
  });
});

/**
 * GET /market/stocks/:symbol - Get stock details
 */
market.get('/stocks/:symbol', async (c) => {
  const { symbol } = c.req.param();

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.symbol, symbol.toUpperCase()));

  if (!company) {
    return c.json(
      {
        success: false,
        error: 'Stock not found',
      },
      404
    );
  }

  const price = parseFloat(company.currentPrice || '0');
  const previousClose = parseFloat(company.previousClose || '0');
  const change = price - previousClose;
  const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

  return c.json({
    success: true,
    data: {
      symbol: company.symbol,
      name: company.name,
      sector: company.sector,
      industry: company.industry,
      price,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      open: parseFloat(company.openPrice || '0'),
      high: parseFloat(company.highPrice || '0'),
      low: parseFloat(company.lowPrice || '0'),
      previousClose,
      marketCap: parseFloat(company.marketCap || '0'),
      sharesOutstanding: company.sharesOutstanding,
      volatility: parseFloat(company.volatility || '0'),
      beta: parseFloat(company.beta || '0'),
      sentiment: parseFloat(company.sentiment || '0'),
      isPublic: company.isPublic,
    },
  });
});

/**
 * GET /market/orderbook/:symbol - Get order book
 * Note: In production this would come from Redis/memory, not DB
 */
market.get('/orderbook/:symbol', async (c) => {
  const { symbol } = c.req.param();

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.symbol, symbol.toUpperCase()));

  if (!company) {
    return c.json(
      {
        success: false,
        error: 'Stock not found',
      },
      404
    );
  }

  const price = parseFloat(company.currentPrice || '0');

  // Generate synthetic order book for demo
  const bids = [];
  const asks = [];

  for (let i = 0; i < 10; i++) {
    const bidPrice = Math.round((price * (1 - 0.001 * (i + 1))) * 100) / 100;
    const askPrice = Math.round((price * (1 + 0.001 * (i + 1))) * 100) / 100;
    const quantity = Math.floor(Math.random() * 10000) + 100;

    bids.push({ price: bidPrice, quantity, total: bids.reduce((s, b) => s + b.quantity, 0) + quantity });
    asks.push({ price: askPrice, quantity, total: asks.reduce((s, a) => s + a.quantity, 0) + quantity });
  }

  return c.json({
    success: true,
    data: {
      symbol: company.symbol,
      lastPrice: price,
      bids,
      asks,
    },
  });
});

/**
 * GET /market/trades/:symbol - Get recent trades
 */
market.get('/trades/:symbol', async (c) => {
  const { symbol } = c.req.param();
  const limit = parseInt(c.req.query('limit') || '50', 10);

  const recentTrades = await db
    .select()
    .from(trades)
    .where(eq(trades.symbol, symbol.toUpperCase()))
    .orderBy(desc(trades.createdAt))
    .limit(Math.min(limit, 100));

  return c.json({
    success: true,
    data: recentTrades.map(t => ({
      id: t.id,
      symbol: t.symbol,
      price: parseFloat(t.price),
      quantity: t.quantity,
      tick: t.tick,
      createdAt: t.createdAt,
    })),
  });
});

export { market };
