export type OrderSide = 'BUY' | 'SELL';

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP';

export type OrderStatus =
  | 'pending'    // Newly submitted, waiting to be processed
  | 'open'       // Processed and resting on the order book
  | 'filled'
  | 'partial'
  | 'cancelled'
  | 'rejected';

export interface Order {
  id: string;
  agentId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  status: OrderStatus;
  filledQuantity: number;
  avgFillPrice?: number;
  tickSubmitted: number;
  tickFilled?: number;
  createdAt: Date;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  fills: OrderFill[];
  reason?: string;
}

export interface OrderFill {
  orderId: string;
  price: number;
  quantity: number;
  tick: number;
  timestamp: Date;
}

export interface CreateOrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
}
