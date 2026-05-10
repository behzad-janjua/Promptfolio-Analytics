"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { usePrices } from "@/contexts/PriceContext";
import { usePortfolio } from "@/contexts/PortfolioContext";
import { getAllStocks, getStock } from "@/lib/stocks";
import { computeSignal } from "@/lib/recommendations";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { TickerTape } from "./components/TickerTape";
import { Sparkline } from "./components/Sparkline";
import type { OrderSide, OrderType, Position } from "@/types";

const allStocks = getAllStocks();

/* ── Live clock ──────────────────────────────────────────── */
function LiveClock() {
  const [time, setTime] = useState("--:--:--");
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString("en-US", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-sm text-slate-500 tabular-nums">{time}</span>
  );
}

/* ── Price flash hook ────────────────────────────────────── */
function usePriceFlash(price: number) {
  const prev = useRef(price);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (price !== prev.current) {
      setDir(price > prev.current ? "up" : "down");
      prev.current = price;
      const t = setTimeout(() => setDir(null), 900);
      return () => clearTimeout(t);
    }
  }, [price]);
  return dir;
}

/* ── Signal badge ────────────────────────────────────────── */
const SIGNAL_STYLES: Record<string, string> = {
  "Strong Buy": "bg-emerald-500/12 text-emerald-400 border-emerald-500/20",
  "Buy":         "bg-green-500/12   text-green-400   border-green-500/20",
  "Hold":        "bg-amber-500/12   text-amber-400   border-amber-500/20",
  "Sell":        "bg-orange-500/12  text-orange-400  border-orange-500/20",
  "Strong Sell": "bg-rose-500/12    text-rose-400    border-rose-500/20",
};

function SignalBadge({ strength }: { strength: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
      SIGNAL_STYLES[strength] ?? "bg-slate-500/12 text-slate-400 border-slate-500/20"
    }`}>
      {strength}
    </span>
  );
}

/* ── Stat card ───────────────────────────────────────────── */
function StatCard({
  label, value, sub, positive, delay = 0,
}: {
  label: string; value: string; sub?: string; positive?: boolean; delay?: number;
}) {
  return (
    <div className="animate-fade-up glass-card p-4" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-xl font-bold font-mono tabular-nums leading-none ${
        positive === undefined ? "text-slate-100" : positive ? "text-emerald-400" : "text-rose-400"
      }`}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs mt-1.5 font-mono ${
          positive === undefined ? "text-slate-600" : positive ? "text-emerald-600" : "text-rose-600"
        }`}>
          {sub}
        </p>
      )}
    </div>
  );
}

/* ── Position row ────────────────────────────────────────── */
/*
 * BUG FIX: price-flash-up/down classes are applied only to the inner price
 * wrapper <div>, never to the <tr> itself. The <tr> carries animate-fade-up
 * which uses the CSS `animation` property. If a flash class (which also sets
 * `animation`) were added to the same <tr>, removing it 900ms later would
 * cause the browser to restart fade-up from opacity:0 — producing the blank.
 */
function PositionRow({
  position, rank, selected, onSelect,
}: {
  position: Position; rank: number; selected: boolean; onSelect: (t: string) => void;
}) {
  const { prices } = usePrices();
  const stock = getStock(position.ticker);
  if (!stock) return null;

  const price     = prices.get(position.ticker) ?? position.avgCost;
  const flash     = usePriceFlash(price);
  const lastClose = stock.history[stock.history.length - 1].close;
  const dayPct    = ((price - lastClose) / lastClose) * 100;
  const value     = position.shares * price;
  const pnl       = (price - position.avgCost) * position.shares;
  const pnlPct    = ((price - position.avgCost) / position.avgCost) * 100;
  const signal    = computeSignal(stock, price);

  return (
    /* Only animate-fade-up here — no flash class ever on this <tr> */
    <tr
      onClick={() => onSelect(position.ticker)}
      className={`animate-fade-up border-b border-white/[0.04] cursor-pointer transition-colors duration-100 ${
        selected ? "bg-indigo-500/[0.04]" : "hover:bg-white/[0.025]"
      }`}
      style={{ animationDelay: `${rank * 55}ms` }}
    >
      {/* Asset */}
      <td className="py-3 pl-4 pr-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-[11px] font-bold text-slate-400 shrink-0">
            {position.ticker.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-slate-100 leading-tight">{position.ticker}</div>
            <div className="text-[11px] text-slate-600 truncate leading-tight">
              {stock.name.replace(/,.*/, "").split(" ").slice(0, 2).join(" ")}
            </div>
          </div>
        </div>
      </td>

      {/* Sparkline */}
      <td className="py-3 px-2 w-[88px]">
        <Sparkline history={stock.history} current={price} width={76} height={28} />
      </td>

      {/* Price — flash wrapper is a child <div>, completely separate from <tr> */}
      <td className="py-3 px-3 text-right">
        <div
          className={`inline-block rounded px-1 -mx-1 ${
            flash === "up" ? "price-flash-up" : flash === "down" ? "price-flash-down" : ""
          }`}
        >
          <span className={`font-mono text-sm font-medium transition-colors duration-300 ${
            flash === "up" ? "text-emerald-400" : flash === "down" ? "text-rose-400" : "text-slate-100"
          }`}>
            ${price.toFixed(2)}
          </span>
        </div>
        <div className={`font-mono text-[11px] mt-0.5 ${dayPct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
          {formatPercent(dayPct)}
        </div>
      </td>

      {/* Shares */}
      <td className="py-3 px-3 text-right font-mono text-sm text-slate-500">{position.shares}</td>

      {/* Avg cost */}
      <td className="py-3 px-3 text-right font-mono text-sm text-slate-500">
        ${position.avgCost.toFixed(2)}
      </td>

      {/* Value */}
      <td className="py-3 px-3 text-right font-mono text-sm text-slate-200">
        {formatCurrency(value)}
      </td>

      {/* P&L */}
      <td className="py-3 pl-3 pr-2 text-right">
        <div className={`font-mono text-sm font-medium ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {pnl >= 0 ? "+" : ""}{formatCurrency(pnl)}
        </div>
        <div className={`font-mono text-[11px] ${pnlPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
          {formatPercent(pnlPct)}
        </div>
      </td>

      {/* Signal */}
      <td className="py-3 pl-2 pr-4">
        <SignalBadge strength={signal.strength} />
      </td>
    </tr>
  );
}

/* ── Toast ───────────────────────────────────────────────── */
function Toast({ msg, ok, visible }: { msg: string; ok: boolean; visible: boolean }) {
  return (
    <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium border shadow-2xl transition-[opacity,transform] duration-200 ease-out ${
      visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
    } ${ok
      ? "bg-emerald-950/90 border-emerald-500/25 text-emerald-300"
      : "bg-rose-950/90 border-rose-500/25 text-rose-300"
    }`} style={{ backdropFilter: "blur(12px)" }}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
        ok ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
      }`}>
        {ok ? "✓" : "✕"}
      </span>
      {msg}
    </div>
  );
}

/* ── Chart tooltip ───────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d1219] border border-white/[0.08] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-500 mb-0.5">{label}</p>
      <p className="font-mono font-bold text-slate-100">${payload[0].value.toFixed(2)}</p>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────── */
export default function Home() {
  const { prices } = usePrices();
  const { portfolio, placeOrder, cancelOrder } = usePortfolio();

  const [selectedTicker, setSelectedTicker] = useState("AAPL");
  const [orderSide,     setOrderSide]     = useState<OrderSide>("buy");
  const [orderType,     setOrderType]     = useState<OrderType>("market");
  const [sharesInput,   setSharesInput]   = useState("");
  const [limitInput,    setLimitInput]    = useState("");
  const [stopInput,     setStopInput]     = useState("");
  const [trailInput,    setTrailInput]    = useState("");
  const [toast,         setToast]         = useState({ msg: "", ok: true });
  const [toastVisible,  setToastVisible]  = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, ok: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, ok });
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2800);
  }, []);

  const metrics = useMemo(() => {
    let equity = 0, dayPnL = 0, totalPnL = 0;
    for (const pos of portfolio.positions) {
      const price     = prices.get(pos.ticker) ?? pos.avgCost;
      const lastClose = getStock(pos.ticker)?.history.at(-1)?.close ?? price;
      equity   += pos.shares * price;
      dayPnL   += pos.shares * (price - lastClose);
      totalPnL += pos.shares * (price - pos.avgCost);
    }
    return { equity, dayPnL, totalPnL, total: equity + portfolio.cash };
  }, [portfolio, prices]);

  const selectedStock = getStock(selectedTicker);
  const selectedPrice = prices.get(selectedTicker) ?? 0;

  const chartData = useMemo(() => {
    if (!selectedStock) return [];
    return [
      ...selectedStock.history.slice(-60).map((d) => ({ date: d.date.slice(5), price: d.close })),
      { date: "Live", price: selectedPrice },
    ];
  }, [selectedStock, selectedPrice]);

  const chartUp    = selectedStock ? selectedPrice >= selectedStock.history.at(-1)!.close : true;
  const chartColor = chartUp ? "#10b981" : "#f43f5e";

  function handlePlaceOrder() {
    const shares = parseFloat(sharesInput);
    if (!shares || shares <= 0) { showToast("Enter a valid number of shares", false); return; }
    const result = placeOrder({
      ticker: selectedTicker, side: orderSide, type: orderType, shares,
      limitPrice:      orderType === "limit"         ? parseFloat(limitInput) : undefined,
      stopPrice:       orderType === "stop_loss"     ? parseFloat(stopInput)  : undefined,
      trailingPercent: orderType === "trailing_stop" ? parseFloat(trailInput) : undefined,
      currentPrice: selectedPrice,
    });
    showToast(result.msg, result.ok);
    if (result.ok) { setSharesInput(""); setLimitInput(""); setStopInput(""); setTrailInput(""); }
  }

  const estimatedCost = sharesInput && parseFloat(sharesInput) > 0
    ? parseFloat(sharesInput) * selectedPrice : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#06090d]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-5 py-3 border-b border-white/[0.06]"
        style={{ background: "rgba(6,9,13,0.92)", backdropFilter: "blur(16px)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 10 L3.5 5.5 L6 7.5 L9 2.5 L12 5" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-bold text-sm text-slate-200">Promptfolio</span>
          <span className="hidden sm:inline text-xs text-slate-700 font-medium">Analytics</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
            <span className="text-[11px] font-semibold text-emerald-500/80 tracking-wider">LIVE</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono">
            <span className="text-slate-700">Portfolio</span>
            <span className={`font-bold tabular-nums ${metrics.dayPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatCurrency(metrics.total)}
            </span>
          </div>
          <Link
            href="/advisor"
            className="btn-press hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium hover:bg-violet-500/16 transition-colors duration-150"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <circle cx="5.5" cy="5.5" r="2" fill="currentColor" />
              <path d="M5.5 1v1.5M5.5 8.5V10M1 5.5h1.5M8.5 5.5H10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
            </svg>
            AI Advisor
          </Link>
          <LiveClock />
        </div>
      </header>

      {/* ── Ticker tape ── */}
      <TickerTape />

      {/* ── Stats row ── */}
      <div className="px-4 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Value" value={formatCurrency(metrics.total)} sub={`Equity ${formatCurrency(metrics.equity)}`} delay={0} />
        <StatCard label="Day P&L"     value={formatCurrency(metrics.dayPnL)}   sub={formatPercent((metrics.dayPnL   / Math.max(metrics.total   - metrics.dayPnL,   1)) * 100)} positive={metrics.dayPnL   >= 0} delay={65}  />
        <StatCard label="Total P&L"   value={formatCurrency(metrics.totalPnL)} sub={formatPercent((metrics.totalPnL / Math.max(metrics.equity  - metrics.totalPnL, 1)) * 100)} positive={metrics.totalPnL >= 0} delay={130} />
        <StatCard label="Cash"        value={formatCurrency(portfolio.cash)}   sub={`${portfolio.openOrders.length} open order${portfolio.openOrders.length !== 1 ? "s" : ""}`} delay={195} />
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 p-4 grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">

        {/* LEFT */}
        <div className="space-y-4 min-w-0">

          {/* Holdings table */}
          <div className="glass-card overflow-hidden animate-fade-up" style={{ animationDelay: "260ms" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
              <h2 className="text-sm font-semibold text-slate-200">Holdings</h2>
              <span className="text-xs text-slate-600">{portfolio.positions.length} positions</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {["Asset","30d","Price","Shares","Avg Cost","Value","P&L","Signal"].map((h,i) => (
                      <th key={h} className={`py-2 text-[11px] font-semibold text-slate-700 uppercase tracking-wider ${
                        i===0 ? "text-left pl-4 pr-2" : i===7 ? "text-right pl-2 pr-4" : "text-right px-3"
                      }`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((pos, i) => (
                    <PositionRow key={pos.ticker} position={pos} rank={i}
                      selected={selectedTicker === pos.ticker} onSelect={setSelectedTicker} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Signals */}
          <div className="glass-card overflow-hidden animate-fade-up" style={{ animationDelay: "320ms" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
              <h2 className="text-sm font-semibold text-slate-200">AI Signals</h2>
              <span className="text-xs text-slate-600">RSI · SMA · Momentum</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {portfolio.positions.map((pos, i) => {
                const stock  = getStock(pos.ticker);
                if (!stock) return null;
                const price  = prices.get(pos.ticker) ?? pos.avgCost;
                const signal = computeSignal(stock, price);
                return (
                  <div key={pos.ticker}
                    className="animate-fade-up flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.015] transition-colors"
                    style={{ animationDelay: `${340 + i * 50}ms` }}>
                    <span className="font-mono text-[11px] font-bold text-slate-500 w-12 shrink-0">{pos.ticker}</span>
                    <SignalBadge strength={signal.strength} />
                    <span className="text-xs text-slate-600 flex-1 truncate">{signal.rationale}</span>
                    {signal.rsi !== undefined && (
                      <span className="font-mono text-[11px] text-slate-700 shrink-0">RSI {signal.rsi.toFixed(0)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">

          {/* Chart + Order form */}
          <div className="glass-card overflow-hidden animate-fade-up" style={{ animationDelay: "280ms" }}>

            {/* Stock selector */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-2">
              <select value={selectedTicker} onChange={(e) => setSelectedTicker(e.target.value)}
                className="flex-1 bg-black/30 border border-white/[0.07] rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-200 outline-none focus:border-indigo-500/40 transition-colors cursor-pointer">
                {allStocks.map((s) => (
                  <option key={s.ticker} value={s.ticker} className="bg-[#0d1219]">
                    {s.ticker} — {s.name}
                  </option>
                ))}
              </select>
              <span className={`font-mono font-bold text-base tabular-nums shrink-0 ${chartUp ? "text-emerald-400" : "text-rose-400"}`}>
                ${selectedPrice.toFixed(2)}
              </span>
            </div>

            {/* Area chart */}
            <div style={{ height: 110 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={chartData} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={chartColor} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={chartColor} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={["auto","auto"]} hide width={0} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="price" stroke={chartColor} strokeWidth={1.5}
                    fill="url(#cg)" dot={false}
                    activeDot={{ r: 3, fill: chartColor, strokeWidth: 0 }}
                    isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Order form */}
            <div className="px-4 pb-4 pt-3 space-y-3 border-t border-white/[0.05]">

              {/* Buy / Sell */}
              <div className="flex gap-1 p-0.5 bg-black/30 rounded-lg border border-white/[0.06]">
                {(["buy","sell"] as const).map((side) => (
                  <button key={side} onClick={() => setOrderSide(side)}
                    className={`btn-press flex-1 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ease-out ${
                      orderSide === side
                        ? side==="buy" ? "bg-emerald-500/18 text-emerald-300" : "bg-rose-500/18 text-rose-300"
                        : "text-slate-600 hover:text-slate-400"
                    }`}>
                    {side === "buy" ? "Buy" : "Sell"}
                  </button>
                ))}
              </div>

              {/* Order type */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Order Type</label>
                <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)} className="field-input">
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                  <option value="stop_loss">Stop Loss</option>
                  <option value="trailing_stop">Trailing Stop</option>
                </select>
              </div>

              {/* Shares */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Shares</label>
                <input type="number" value={sharesInput} onChange={(e) => setSharesInput(e.target.value)}
                  placeholder="0" min={0} className="field-input" />
              </div>

              {orderType === "limit" && (
                <div className="animate-slide-in-top">
                  <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Limit Price</label>
                  <input type="number" value={limitInput} onChange={(e) => setLimitInput(e.target.value)}
                    placeholder={`$${selectedPrice.toFixed(2)}`} className="field-input" />
                </div>
              )}
              {orderType === "stop_loss" && (
                <div className="animate-slide-in-top">
                  <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Stop Price</label>
                  <input type="number" value={stopInput} onChange={(e) => setStopInput(e.target.value)}
                    placeholder={`$${(selectedPrice * 0.95).toFixed(2)}`} className="field-input" />
                </div>
              )}
              {orderType === "trailing_stop" && (
                <div className="animate-slide-in-top">
                  <label className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Trail %</label>
                  <input type="number" value={trailInput} onChange={(e) => setTrailInput(e.target.value)}
                    placeholder="3" className="field-input" />
                </div>
              )}

              {estimatedCost !== null && (
                <div className="animate-fade-in flex justify-between text-[11px] font-mono">
                  <span className="text-slate-600">Est. {orderSide==="buy" ? "cost" : "proceeds"}</span>
                  <span className="text-slate-300 font-semibold">{formatCurrency(estimatedCost)}</span>
                </div>
              )}

              <button onClick={handlePlaceOrder}
                className={`btn-press w-full py-2.5 rounded-lg text-sm font-semibold border transition-colors duration-200 ease-out ${
                  orderSide==="buy"
                    ? "bg-emerald-500/15 hover:bg-emerald-500/22 text-emerald-300 border-emerald-500/25"
                    : "bg-rose-500/15 hover:bg-rose-500/22 text-rose-300 border-rose-500/25"
                }`}>
                Place {orderSide==="buy" ? "Buy" : "Sell"} Order
              </button>

              <p className="text-[11px] text-slate-700 text-center font-mono">
                Cash available: <span className="text-slate-600 font-semibold">{formatCurrency(portfolio.cash)}</span>
              </p>
            </div>
          </div>

          {/* Open orders */}
          {portfolio.openOrders.length > 0 && (
            <div className="glass-card overflow-hidden animate-fade-up" style={{ animationDelay: "360ms" }}>
              <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200">Open Orders</h2>
                <span className="text-xs text-slate-600">{portfolio.openOrders.length}</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {portfolio.openOrders.map((order) => (
                  <div key={order.id} className="flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-white/[0.015] transition-colors group animate-slide-in-top">
                    <span className={`font-bold shrink-0 ${order.side==="buy" ? "text-emerald-400" : "text-rose-400"}`}>
                      {order.side.toUpperCase()}
                    </span>
                    <span className="font-mono text-slate-300">{order.shares}×{order.ticker}</span>
                    <span className="text-slate-600 capitalize">{order.type.replace("_"," ")}</span>
                    {order.limitPrice      && <span className="font-mono text-slate-500">@${order.limitPrice.toFixed(2)}</span>}
                    {order.stopPrice       && <span className="font-mono text-slate-500">stop ${order.stopPrice.toFixed(2)}</span>}
                    {order.trailingPercent && <span className="font-mono text-slate-500">trail {order.trailingPercent}%</span>}
                    <button onClick={() => cancelOrder(order.id)}
                      className="btn-press ml-auto text-slate-700 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trade history */}
          <div className="glass-card overflow-hidden animate-fade-up" style={{ animationDelay: "420ms" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
              <h2 className="text-sm font-semibold text-slate-200">Trade History</h2>
              <span className="text-xs text-slate-600">{portfolio.tradeHistory.length} trades</span>
            </div>
            <div className="divide-y divide-white/[0.04] max-h-72 overflow-y-auto">
              {portfolio.tradeHistory.length === 0 ? (
                <div className="px-4 py-8 text-xs text-slate-700 text-center">
                  No trades yet — place your first order above.
                </div>
              ) : (
                portfolio.tradeHistory.slice(0, 25).map((order) => (
                  <div key={order.id} className="flex items-center gap-2 px-4 py-2.5 text-xs hover:bg-white/[0.015] transition-colors animate-slide-in-top">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      order.status==="filled" ? "bg-emerald-400" : order.status==="cancelled" ? "bg-slate-700" : "bg-amber-400"
                    }`} />
                    <span className={`font-bold shrink-0 ${order.side==="buy" ? "text-emerald-400" : "text-rose-400"}`}>
                      {order.side.toUpperCase()}
                    </span>
                    <span className="font-mono text-slate-300">{order.shares} {order.ticker}</span>
                    {order.executionPrice !== undefined && (
                      <span className="font-mono text-slate-600">@${order.executionPrice.toFixed(2)}</span>
                    )}
                    {order.realizedPnl !== undefined && (
                      <span className={`ml-auto font-mono font-semibold ${order.realizedPnl>=0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {order.realizedPnl>=0 ? "+" : ""}{formatCurrency(order.realizedPnl)}
                      </span>
                    )}
                    <span className={`${order.realizedPnl!==undefined ? "" : "ml-auto"} capitalize text-slate-700 shrink-0`}>
                      {order.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      <Toast msg={toast.msg} ok={toast.ok} visible={toastVisible} />
    </div>
  );
}
