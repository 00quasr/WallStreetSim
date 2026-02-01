import type { Order } from './order';

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastPrice: number;
  lastTick: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
  orders: Order[];
}

export interface Trade {
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
}

export interface PriceUpdate {
  symbol: string;
  oldPrice: number;
  newPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  tick: number;
  drivers: PriceDrivers;
}

export interface PriceDrivers {
  agentPressure: number;
  randomWalk: number;
  sectorCorrelation: number;
  eventImpact: number;
}

export interface MarketSnapshot {
  tick: number;
  timestamp: Date;
  stocks: StockQuote[];
  indices: MarketIndex[];
  totalMarketCap: number;
  totalVolume: number;
}

export interface StockQuote {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  marketCap: number;
}

export interface MarketIndex {
  name: string;
  value: number;
  change: number;
  changePercent: number;
}

export interface OHLCV {
  symbol: string;
  tick: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  timestamp: Date;
}

export interface AffectedRestingOrder {
  orderId: string;
  filledQuantity: number;
  totalQuantity: number;
  avgFillPrice: number;
}
