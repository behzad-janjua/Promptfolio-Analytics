"use client";

import { useEffect, useRef, useState } from "react";
import { usePrices } from "@/contexts/PriceContext";
import { getAllStocks } from "@/lib/stocks";

const stocks = getAllStocks();

export function TickerTape() {
  const { prices } = usePrices();
  const prev = useRef(new Map<string, number>());
  const [flashing, setFlashing] = useState(new Map<string, "up" | "down">());

  useEffect(() => {
    const next = new Map<string, "up" | "down">();
    for (const s of stocks) {
      const p = prices.get(s.ticker) ?? 0;
      const old = prev.current.get(s.ticker);
      if (old !== undefined && Math.abs(p - old) > 0.004) {
        next.set(s.ticker, p > old ? "up" : "down");
      }
      prev.current.set(s.ticker, p);
    }
    if (next.size === 0) return;
    setFlashing(next);
    const t = setTimeout(() => setFlashing(new Map()), 850);
    return () => clearTimeout(t);
  }, [prices]);

  const items = [...stocks, ...stocks];

  return (
    <div className="ticker-wrap bg-[#080b11]/80 border-b border-white/[0.045]">
      <div className="ticker-inner py-2.5">
        {items.map((s, i) => {
          const price = prices.get(s.ticker) ?? 0;
          const last  = s.history[s.history.length - 1].close;
          const pct   = ((price - last) / last) * 100;
          const up    = pct >= 0;
          const flash = i < stocks.length ? flashing.get(s.ticker) : undefined;

          return (
            <span
              key={`${s.ticker}-${i}`}
              className={`inline-flex items-center gap-1.5 px-4 border-r border-white/[0.04] text-[11px] font-mono select-none ${
                flash === "up"   ? "price-flash-up"   :
                flash === "down" ? "price-flash-down" : ""
              }`}
            >
              <span className="font-bold tracking-widest text-slate-300">{s.ticker}</span>
              <span className="text-slate-500">${price.toFixed(2)}</span>
              <span className={up ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                {up ? "+" : ""}{pct.toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
