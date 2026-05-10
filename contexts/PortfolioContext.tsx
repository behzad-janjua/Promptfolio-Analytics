"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePrices } from "./PriceContext";
import {
  createOrder,
  applyFilledOrder,
  checkOpenOrders,
  cancelOrder as doCancel,
  canAfford as checkCanAfford,
  sharesOwned as getSharesOwned,
} from "@/lib/order-engine";
import { STARTING_CASH, STARTING_PORTFOLIO } from "@/lib/stocks";
import type { OrderSide, OrderType, PortfolioState } from "@/types";

const initial: PortfolioState = {
  cash: STARTING_CASH,
  positions: STARTING_PORTFOLIO.map(({ ticker, shares, avgCost }) => ({
    ticker,
    shares,
    avgCost,
  })),
  openOrders: [],
  tradeHistory: [],
};

interface PlaceParams {
  ticker: string;
  side: OrderSide;
  type: OrderType;
  shares: number;
  limitPrice?: number;
  stopPrice?: number;
  trailingPercent?: number;
  currentPrice: number;
}

interface Ctx {
  portfolio: PortfolioState;
  placeOrder: (p: PlaceParams) => { ok: boolean; msg: string };
  cancelOrder: (id: string) => void;
}

const Context = createContext<Ctx | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolio, setPortfolio] = useState<PortfolioState>(initial);
  const { prices, getPeak } = usePrices();
  const ref = useRef(portfolio);
  ref.current = portfolio;

  useEffect(() => {
    if (ref.current.openOrders.length === 0) return;
    let state = ref.current;
    let dirty = false;
    for (const [ticker, price] of prices.entries()) {
      const { newState, triggered } = checkOpenOrders(state, ticker, price, getPeak(ticker));
      if (triggered.length > 0) { state = newState; dirty = true; }
    }
    if (dirty) setPortfolio(state);
  }, [prices, getPeak]);

  const placeOrder = useCallback((p: PlaceParams): { ok: boolean; msg: string } => {
    const state = ref.current;
    if (p.shares <= 0) return { ok: false, msg: "Shares must be greater than 0" };
    if (p.side === "buy") {
      const checkPrice = p.type === "limit" && p.limitPrice ? p.limitPrice : p.currentPrice;
      if (!checkCanAfford(state, checkPrice, p.shares))
        return { ok: false, msg: "Insufficient cash balance" };
    } else {
      const owned = getSharesOwned(state, p.ticker);
      if (owned < p.shares) return { ok: false, msg: `You only own ${owned} shares` };
    }
    const order = createOrder(p);
    if (order.status === "filled") {
      setPortfolio(applyFilledOrder(state, order));
    } else {
      setPortfolio({ ...state, openOrders: [...state.openOrders, order] });
    }
    return { ok: true, msg: order.status === "filled" ? "Order filled" : "Order placed" };
  }, []);

  const cancelOrder = useCallback((id: string) => {
    setPortfolio((s) => doCancel(s, id));
  }, []);

  return (
    <Context.Provider value={{ portfolio, placeOrder, cancelOrder }}>
      {children}
    </Context.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
