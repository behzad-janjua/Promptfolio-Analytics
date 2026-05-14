export type Sector =
  | "Technology"
  | "Finance"
  | "Healthcare"
  | "Consumer"
  | "Energy"
  | "Industrial"
  | "ETF";

export interface DailyClose {
  date: string; // YYYY-MM-DD
  close: number;
  volume: number;
}

export interface StockMeta {
  ticker: string;
  name: string;
  sector: Sector;
  description: string;
  marketCap: number; // in dollars
  pe: number | null; // null for ETFs
  dividendYield: number; // percent
  beta: number;
  week52High: number;
  week52Low: number;
  history: DailyClose[]; // 365 days, oldest first
}

export type OrderType = "market" | "limit" | "stop_loss" | "trailing_stop";
export type OrderSide = "buy" | "sell";
export type OrderStatus = "open" | "filled" | "cancelled";

export interface Order {
  id: string;
  ticker: string;
  side: OrderSide;
  type: OrderType;
  shares: number;
  createdAt: number; // timestamp
  filledAt?: number;
  status: OrderStatus;
  // Prices
  limitPrice?: number; // for limit orders
  stopPrice?: number; // for stop loss
  trailingPercent?: number; // for trailing stop — e.g. 3 means 3%
  trailingPeak?: number; // highest price seen since order was placed
  executionPrice?: number; // actual fill price
  realizedPnl?: number; // for sell orders
}

export interface Position {
  ticker: string;
  shares: number;
  avgCost: number; // average cost per share
}

export type SignalStrength = "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell";

export interface Signal {
  strength: SignalStrength;
  rationale: string;
  rsi?: number;
  sma20?: number;
  sma50?: number;
  sma200?: number;
}

export interface PortfolioState {
  cash: number;
  positions: Position[];
  openOrders: Order[];
  tradeHistory: Order[];
}

export interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** base64 data-URLs (e.g. "data:image/png;base64,...") — used by Gemini vision */
  images?: string[];
}

export interface OllamaModel {
  name: string;
  size: number;
}

/** Structured holding extracted from a screenshot by Gemini vision */
export interface ExtractedHolding {
  ticker: string;
  shares: number;
  avgCost?: number;
}
