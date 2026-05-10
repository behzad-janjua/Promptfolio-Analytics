import { getStock } from "./stocks";
import type { StockMeta } from "@/types";

export type StrategyName =
  | "rsi_mean_reversion"
  | "golden_cross"
  | "buy_and_hold"
  | "momentum";

interface BacktestTrade {
  date: string;
  action: "buy" | "sell";
  price: number;
  shares: number;
  portfolioValue: number;
  reason: string;
}

export interface BacktestResult {
  ticker: string;
  strategy: StrategyName;
  initialCapital: number;
  finalValue: number;
  totalReturn: number; // percent
  alpha: number; // vs SPY buy-and-hold, percent
  sharpeRatio: number;
  maxDrawdown: number; // percent
  winRate: number; // percent of profitable trades
  totalTrades: number;
  pnlCurve: { date: string; value: number }[];
  trades: BacktestTrade[];
}

function sma(prices: number[], period: number, idx: number): number | null {
  if (idx < period - 1) return null;
  const slice = prices.slice(idx - period + 1, idx + 1);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(prices: number[], idx: number, period = 14): number | null {
  if (idx < period) return null;
  const slice = prices.slice(idx - period, idx + 1);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function runStrategy(
  stock: StockMeta,
  strategy: StrategyName,
  initialCapital: number
): Omit<BacktestResult, "alpha"> {
  const closes = stock.history.map((d) => d.close);
  const dates = stock.history.map((d) => d.date);
  const n = closes.length;

  let cash = initialCapital;
  let shares = 0;
  const trades: BacktestTrade[] = [];
  const pnlCurve: { date: string; value: number }[] = [];
  let inPosition = false;
  let entryPrice = 0;
  let wins = 0;
  let losses = 0;

  let peak = initialCapital;
  let maxDrawdown = 0;
  const dailyReturns: number[] = [];

  for (let i = 0; i < n; i++) {
    const price = closes[i];
    let signal: "buy" | "sell" | "hold" = "hold";
    let reason = "";

    if (strategy === "buy_and_hold") {
      if (i === 0) { signal = "buy"; reason = "Buy and hold entry"; }
      if (i === n - 1 && inPosition) { signal = "sell"; reason = "Buy and hold exit"; }
    } else if (strategy === "rsi_mean_reversion") {
      const r = rsi(closes, i);
      if (r !== null) {
        if (!inPosition && r < 30) {
          signal = "buy";
          reason = `RSI oversold (${r.toFixed(1)})`;
        } else if (inPosition && r > 70) {
          signal = "sell";
          reason = `RSI overbought (${r.toFixed(1)})`;
        }
      }
      if (i === n - 1 && inPosition) { signal = "sell"; reason = "End of backtest — close position"; }
    } else if (strategy === "golden_cross") {
      const s50 = sma(closes, 50, i);
      const s200 = sma(closes, 200, i);
      const s50prev = i > 0 ? sma(closes, 50, i - 1) : null;
      const s200prev = i > 0 ? sma(closes, 200, i - 1) : null;
      if (s50 && s200 && s50prev && s200prev) {
        if (!inPosition && s50prev <= s200prev && s50 > s200) {
          signal = "buy";
          reason = "Golden cross (SMA-50 crossed above SMA-200)";
        } else if (inPosition && s50prev >= s200prev && s50 < s200) {
          signal = "sell";
          reason = "Death cross (SMA-50 crossed below SMA-200)";
        }
      }
      if (i === n - 1 && inPosition) { signal = "sell"; reason = "End of backtest — close position"; }
    } else if (strategy === "momentum") {
      const s20 = sma(closes, 20, i);
      const s20prev = i > 0 ? sma(closes, 20, i - 1) : null;
      const s20prev2 = i > 1 ? sma(closes, 20, i - 2) : null;
      if (s20 && s20prev && s20prev2) {
        const aboveFor3Days =
          closes[i] > s20 && closes[i - 1] > s20prev && closes[i - 2] > s20prev2;
        if (!inPosition && aboveFor3Days) {
          signal = "buy";
          reason = "Price above SMA-20 for 3 consecutive days";
        } else if (inPosition && price < s20) {
          signal = "sell";
          reason = "Price dropped below SMA-20";
        }
      }
      if (i === n - 1 && inPosition) { signal = "sell"; reason = "End of backtest — close position"; }
    }

    if (signal === "buy" && !inPosition && cash > price) {
      shares = Math.floor(cash / price);
      const cost = shares * price;
      cash -= cost;
      inPosition = true;
      entryPrice = price;
      trades.push({ date: dates[i], action: "buy", price, shares, portfolioValue: cash + shares * price, reason });
    } else if (signal === "sell" && inPosition && shares > 0) {
      const proceeds = shares * price;
      cash += proceeds;
      if (price >= entryPrice) wins++; else losses++;
      trades.push({ date: dates[i], action: "sell", price, shares, portfolioValue: cash, reason });
      shares = 0;
      inPosition = false;
    }

    const totalValue = cash + shares * price;
    pnlCurve.push({ date: dates[i], value: parseFloat(totalValue.toFixed(2)) });

    if (i > 0) {
      dailyReturns.push((totalValue - pnlCurve[i - 1].value) / pnlCurve[i - 1].value);
    }

    if (totalValue > peak) peak = totalValue;
    const dd = (peak - totalValue) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const finalValue = pnlCurve[pnlCurve.length - 1]?.value ?? initialCapital;
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;

  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / (dailyReturns.length || 1);
  const stdReturn = Math.sqrt(
    dailyReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (dailyReturns.length || 1)
  );
  const dailyRF = 0.045 / 252;
  const sharpeRatio =
    stdReturn > 0 ? ((avgReturn - dailyRF) / stdReturn) * Math.sqrt(252) : 0;

  const totalTrades = Math.floor(trades.length / 2);
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  return {
    ticker: stock.ticker,
    strategy,
    initialCapital,
    finalValue: parseFloat(finalValue.toFixed(2)),
    totalReturn: parseFloat(totalReturn.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(3)),
    maxDrawdown: parseFloat((maxDrawdown * 100).toFixed(2)),
    winRate: parseFloat(winRate.toFixed(1)),
    totalTrades,
    pnlCurve,
    trades,
  };
}

export function backtest(
  ticker: string,
  strategy: StrategyName,
  initialCapital = 10_000
): BacktestResult | { error: string } {
  const stock = getStock(ticker);
  if (!stock) return { error: `Ticker ${ticker} not found` };

  const result = runStrategy(stock, strategy, initialCapital);

  // Alpha: compare against SPY buy-and-hold
  const spy = getStock("SPY");
  let alpha = 0;
  if (spy && spy.history.length > 0) {
    const spyStart = spy.history[0].close;
    const spyEnd = spy.history[spy.history.length - 1].close;
    const spyReturn = ((spyEnd - spyStart) / spyStart) * 100;
    alpha = parseFloat((result.totalReturn - spyReturn).toFixed(2));
  }

  return { ...result, alpha };
}
