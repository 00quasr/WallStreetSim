import type { Order, OrderBook, OrderBookLevel, Trade } from '@wallstreetsim/types';
import { generateUUID, round } from '@wallstreetsim/utils';

export class MarketEngine {
  private orderBooks: Map<string, OrderBook> = new Map();
  private currentTick: number = 0;

  /**
   * Initialize order books for symbols
   */
  initialize(symbols: string[]): void {
    for (const symbol of symbols) {
      this.orderBooks.set(symbol, {
        symbol,
        bids: [],
        asks: [],
        lastPrice: 0,
        lastTick: 0,
      });
    }
  }

  /**
   * Set current tick
   */
  setTick(tick: number): void {
    this.currentTick = tick;
  }

  /**
   * Submit an order and attempt to match
   */
  submitOrder(order: Order): { fills: Trade[]; remainingQuantity: number } {
    const orderBook = this.orderBooks.get(order.symbol);
    if (!orderBook) {
      return { fills: [], remainingQuantity: order.quantity };
    }

    if (order.type === 'MARKET') {
      return this.executeMarketOrder(order, orderBook);
    } else {
      return this.executeLimitOrder(order, orderBook);
    }
  }

  /**
   * Execute a market order
   */
  private executeMarketOrder(
    order: Order,
    book: OrderBook
  ): { fills: Trade[]; remainingQuantity: number } {
    const fills: Trade[] = [];
    let remainingQty = order.quantity;
    const levels = order.side === 'BUY' ? book.asks : book.bids;

    while (remainingQty > 0 && levels.length > 0) {
      const level = levels[0];
      const restingOrder = level.orders[0];
      const fillQty = Math.min(remainingQty, level.quantity);

      fills.push({
        id: generateUUID(),
        symbol: order.symbol,
        buyerId: order.side === 'BUY' ? order.agentId : restingOrder.agentId,
        sellerId: order.side === 'SELL' ? order.agentId : restingOrder.agentId,
        buyerOrderId: order.side === 'BUY' ? order.id : restingOrder.id,
        sellerOrderId: order.side === 'SELL' ? order.id : restingOrder.id,
        price: level.price,
        quantity: fillQty,
        tick: this.currentTick,
        createdAt: new Date(),
      });

      remainingQty -= fillQty;
      level.quantity -= fillQty;
      level.orders[0] = {
        ...restingOrder,
        filledQuantity: restingOrder.filledQuantity + fillQty,
      };

      if (level.quantity <= 0) {
        levels.shift();
      }

      book.lastPrice = level.price;
      book.lastTick = this.currentTick;
    }

    return { fills, remainingQuantity: remainingQty };
  }

  /**
   * Execute a limit order
   */
  private executeLimitOrder(
    order: Order,
    book: OrderBook
  ): { fills: Trade[]; remainingQuantity: number } {
    const fills: Trade[] = [];
    let remainingQty = order.quantity;
    const oppositeLevels = order.side === 'BUY' ? book.asks : book.bids;

    // Try to match against opposite side
    while (remainingQty > 0 && oppositeLevels.length > 0) {
      const level = oppositeLevels[0];

      // Check if prices cross
      const pricesCross = order.side === 'BUY'
        ? order.price! >= level.price
        : order.price! <= level.price;

      if (!pricesCross) break;

      const restingOrder = level.orders[0];
      const fillQty = Math.min(remainingQty, level.quantity);

      fills.push({
        id: generateUUID(),
        symbol: order.symbol,
        buyerId: order.side === 'BUY' ? order.agentId : restingOrder.agentId,
        sellerId: order.side === 'SELL' ? order.agentId : restingOrder.agentId,
        buyerOrderId: order.side === 'BUY' ? order.id : restingOrder.id,
        sellerOrderId: order.side === 'SELL' ? order.id : restingOrder.id,
        price: level.price,
        quantity: fillQty,
        tick: this.currentTick,
        createdAt: new Date(),
      });

      remainingQty -= fillQty;
      level.quantity -= fillQty;
      level.orders[0] = {
        ...restingOrder,
        filledQuantity: restingOrder.filledQuantity + fillQty,
      };

      if (level.quantity <= 0) {
        oppositeLevels.shift();
      }

      book.lastPrice = level.price;
      book.lastTick = this.currentTick;
    }

    // Add remaining to book
    if (remainingQty > 0) {
      this.addToBook(order, remainingQty, book);
    }

    return { fills, remainingQuantity: remainingQty };
  }

  /**
   * Add order to order book
   */
  private addToBook(order: Order, quantity: number, book: OrderBook): void {
    const levels = order.side === 'BUY' ? book.bids : book.asks;
    const price = order.price!;

    // Find or create level
    let level = levels.find(l => l.price === price);
    if (!level) {
      level = {
        price,
        quantity: 0,
        orderCount: 0,
        orders: [],
      };
      levels.push(level);

      // Sort: bids descending, asks ascending
      if (order.side === 'BUY') {
        levels.sort((a, b) => b.price - a.price);
      } else {
        levels.sort((a, b) => a.price - b.price);
      }
    }

    level.quantity += quantity;
    level.orderCount += 1;
    level.orders.push({ ...order, quantity, filledQuantity: order.quantity - quantity });
  }

  /**
   * Cancel an order
   */
  cancelOrder(symbol: string, orderId: string): boolean {
    const book = this.orderBooks.get(symbol);
    if (!book) return false;

    for (const levels of [book.bids, book.asks]) {
      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        const orderIndex = level.orders.findIndex(o => o.id === orderId);
        if (orderIndex !== -1) {
          const order = level.orders[orderIndex];
          level.quantity -= (order.quantity - order.filledQuantity);
          level.orderCount -= 1;
          level.orders.splice(orderIndex, 1);

          if (level.quantity <= 0) {
            levels.splice(i, 1);
          }
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get order book for a symbol
   */
  getOrderBook(symbol: string): OrderBook | undefined {
    return this.orderBooks.get(symbol);
  }

  /**
   * Get best bid/ask for a symbol
   */
  getBestBidAsk(symbol: string): { bid: number | null; ask: number | null } {
    const book = this.orderBooks.get(symbol);
    if (!book) return { bid: null, ask: null };

    return {
      bid: book.bids[0]?.price ?? null,
      ask: book.asks[0]?.price ?? null,
    };
  }

  /**
   * Get mid price for a symbol
   */
  getMidPrice(symbol: string, fallbackPrice: number): number {
    const { bid, ask } = this.getBestBidAsk(symbol);
    if (bid !== null && ask !== null) {
      return (bid + ask) / 2;
    }
    if (bid !== null) return bid;
    if (ask !== null) return ask;
    return fallbackPrice;
  }

  /**
   * Get order book depth (total volume) for a symbol
   */
  getDepth(symbol: string): { bidDepth: number; askDepth: number } {
    const book = this.orderBooks.get(symbol);
    if (!book) return { bidDepth: 0, askDepth: 0 };

    const bidDepth = book.bids.reduce((sum, l) => sum + l.quantity * l.price, 0);
    const askDepth = book.asks.reduce((sum, l) => sum + l.quantity * l.price, 0);

    return { bidDepth, askDepth };
  }

  /**
   * Clear all order books (for reset)
   */
  clearAll(): void {
    for (const [symbol, book] of this.orderBooks) {
      book.bids = [];
      book.asks = [];
    }
  }

  /**
   * Seed liquidity orders directly to the book without matching
   * Used for initial market maker liquidity provision
   */
  seedLiquidity(orders: Order[]): void {
    for (const order of orders) {
      if (order.type !== 'LIMIT' || order.price === undefined) {
        continue;
      }

      const book = this.orderBooks.get(order.symbol);
      if (!book) {
        continue;
      }

      this.addToBook(order, order.quantity, book);
    }
  }
}
