"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSimulator } from "@/lib/price-simulator";
import { getAllStocks } from "@/lib/stocks";

interface PriceContextValue {
  prices: Map<string, number>;
  getPrice: (ticker: string) => number;
  getPeak: (ticker: string) => number;
}

const PriceContext = createContext<PriceContextValue>({
  prices: new Map(),
  getPrice: () => 0,
  getPeak: () => 0,
});

export function PriceProvider({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<Map<string, number>>(() => {
    const stocks = getAllStocks();
    return new Map(stocks.map((s) => [s.ticker, s.history[s.history.length - 1].close]));
  });

  const sim = useRef(getSimulator());

  useEffect(() => {
    const simulator = sim.current;
    simulator.start(5000);

    const unsubscribe = simulator.subscribeAll((_ticker, _price) => {
      setPrices(new Map(simulator.getAllPrices()));
    });

    return () => {
      unsubscribe();
      simulator.stop();
    };
  }, []);

  function getPrice(ticker: string): number {
    return prices.get(ticker) ?? sim.current.getPrice(ticker);
  }

  function getPeak(ticker: string): number {
    return sim.current.getPeak(ticker);
  }

  return (
    <PriceContext.Provider value={{ prices, getPrice, getPeak }}>
      {children}
    </PriceContext.Provider>
  );
}

export function usePrices() {
  return useContext(PriceContext);
}
