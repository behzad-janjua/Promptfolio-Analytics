import type { Order, OrderSide, OrderType, Position, PortfolioState } from "@/types";

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createOrder(params: {
  ticker: string;
  side: OrderSide;
  type: OrderType;
  shares: number;
  limitPrice?: number;
  stopPrice?: number;
  trailingPercent?: number;
  currentPrice: number;
}): Order {
  return {
    id: uuid(),
    ticker: params.ticker,
    side: params.side,
    type: params.type,
    shares: params.shares,
    createdAt: Date.now(),
    status: params.type === "market" ? "filled" : "open",
    limitPrice: params.limitPrice,
    stopPrice: params.stopPrice,
    trailingPercent: params.trailingPercent,
    trailingPeak: params.type === "trailing_stop" ? params.currentPrice : undefined,
    executionPrice: params.type === "market" ? params.currentPrice : undefined,
    filledAt: params.type === "market" ? Date.now() : undefined,
  };
}

export function applyFilledOrder(
  state: PortfolioState,
  order: Order
): PortfolioState {
  const price = order.executionPrice!;
  let cash = state.cash;
  let positions = [...state.positions];

  if (order.side === "buy") {
    const cost = price * order.shares;
    if (cost > cash) return state; // insufficient funds
    cash -= cost;
    const idx = positions.findIndex((p) => p.ticker === order.ticker);
    if (idx >= 0) {
      const existing = positions[idx];
      const totalShares = existing.shares + order.shares;
      const avgCost =
        (existing.avgCost * existing.shares + price * order.shares) / totalShares;
      positions[idx] = { ...existing, shares: totalShares, avgCost };
    } else {
      positions.push({ ticker: order.ticker, shares: order.shares, avgCost: price });
    }
  } else {
    // sell
    const idx = positions.findIndex((p) => p.ticker === order.ticker);
    if (idx < 0) return state;
    const existing = positions[idx];
    if (existing.shares < order.shares) return state;

    const proceeds = price * order.shares;
    const costBasis = existing.avgCost * order.shares;
    const realizedPnl = proceeds - costBasis;
    cash += proceeds;
    order = { ...order, realizedPnl };

    if (existing.shares === order.shares) {
      positions = positions.filter((_, i) => i !== idx);
    } else {
      positions[idx] = { ...existing, shares: existing.shares - order.shares };
    }
  }

  const filledOrder = { ...order, status: "filled" as const, filledAt: Date.now() };
  const openOrders = state.openOrders.filter((o) => o.id !== order.id);
  const tradeHistory = [filledOrder, ...state.tradeHistory];

  return { cash, positions, openOrders, tradeHistory };
}

export function checkOpenOrders(
  state: PortfolioState,
  ticker: string,
  currentPrice: number,
  simulatorPeak: number
): { newState: PortfolioState; triggered: Order[] } {
  const triggered: Order[] = [];
  let newState = { ...state };
  const ordersToCheck = state.openOrders.filter((o) => o.ticker === ticker);

  for (const order of ordersToCheck) {
    let shouldFill = false;
    let fillPrice = currentPrice;

    if (order.type === "limit") {
      if (order.side === "buy" && currentPrice <= (order.limitPrice ?? Infinity)) {
        shouldFill = true;
        fillPrice = order.limitPrice!;
      } else if (order.side === "sell" && currentPrice >= (order.limitPrice ?? 0)) {
        shouldFill = true;
        fillPrice = order.limitPrice!;
      }
    } else if (order.type === "stop_loss") {
      if (currentPrice <= (order.stopPrice ?? 0)) {
        shouldFill = true;
        fillPrice = currentPrice; // market execution at current price
      }
    } else if (order.type === "trailing_stop") {
      // Update trailing peak
      const peak = Math.max(order.trailingPeak ?? currentPrice, simulatorPeak);
      const trailPrice = peak * (1 - (order.trailingPercent ?? 5) / 100);
      if (currentPrice <= trailPrice) {
        shouldFill = true;
        fillPrice = currentPrice;
      } else {
        // Update peak on the order
        newState = {
          ...newState,
          openOrders: newState.openOrders.map((o) =>
            o.id === order.id ? { ...o, trailingPeak: peak } : o
          ),
        };
      }
    }

    if (shouldFill) {
      const filledOrder = { ...order, executionPrice: fillPrice };
      newState = applyFilledOrder(newState, filledOrder);
      triggered.push(filledOrder);
    }
  }

  return { newState, triggered };
}

export function cancelOrder(state: PortfolioState, orderId: string): PortfolioState {
  const order = state.openOrders.find((o) => o.id === orderId);
  if (!order) return state;
  const cancelled = { ...order, status: "cancelled" as const };
  return {
    ...state,
    openOrders: state.openOrders.filter((o) => o.id !== orderId),
    tradeHistory: [cancelled, ...state.tradeHistory],
  };
}

export function canAfford(state: PortfolioState, price: number, shares: number): boolean {
  return state.cash >= price * shares;
}

export function sharesOwned(state: PortfolioState, ticker: string): number {
  return state.positions.find((p) => p.ticker === ticker)?.shares ?? 0;
}
