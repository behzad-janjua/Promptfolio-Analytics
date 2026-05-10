import { getStock } from "./stocks";
import type { Position } from "@/types";

const RISK_FREE_RATE = 0.045; // ~4.5% annual T-bill rate
const TRADING_DAYS = 252;

function dailyReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return returns;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], ddof = 1): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - ddof);
  return Math.sqrt(variance);
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa ** 2;
    db += xb ** 2;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

export interface RiskMetrics {
  portfolioBeta: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  var95: number; // 1-day VaR at 95% confidence, as a dollar amount
  volatilityAnnual: number; // annualized portfolio volatility %
  correlationMatrix: {
    tickers: string[];
    matrix: number[][];
  };
  totalValue: number;
  positionWeights: { ticker: string; weight: number; value: number }[];
}

export function computeRiskMetrics(
  positions: Position[],
  prices: Record<string, number>
): RiskMetrics {
  const tickers = positions.map((p) => p.ticker);
  const positionValues = positions.map((p) => ({
    ticker: p.ticker,
    value: p.shares * (prices[p.ticker] ?? 0),
    shares: p.shares,
  }));
  const totalValue = positionValues.reduce((s, p) => s + p.value, 0);

  if (totalValue === 0 || tickers.length === 0) {
    return {
      portfolioBeta: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      var95: 0,
      volatilityAnnual: 0,
      correlationMatrix: { tickers: [], matrix: [] },
      totalValue: 0,
      positionWeights: [],
    };
  }

  const weights = positionValues.map((p) => p.value / totalValue);

  // Portfolio beta (weighted average)
  let portfolioBeta = 0;
  for (let i = 0; i < tickers.length; i++) {
    const stock = getStock(tickers[i]);
    portfolioBeta += weights[i] * (stock?.beta ?? 1);
  }

  // Daily returns per stock
  const returnsByTicker = new Map<string, number[]>();
  for (const ticker of tickers) {
    const stock = getStock(ticker);
    if (!stock) continue;
    returnsByTicker.set(ticker, dailyReturns(stock.history.map((d) => d.close)));
  }

  // Portfolio daily return series (weighted sum of individual returns)
  const minLen = Math.min(
    ...Array.from(returnsByTicker.values()).map((r) => r.length)
  );
  const portfolioReturns: number[] = [];
  for (let day = 0; day < minLen; day++) {
    let dayReturn = 0;
    for (let i = 0; i < tickers.length; i++) {
      const r = returnsByTicker.get(tickers[i]);
      if (r) dayReturn += weights[i] * r[day];
    }
    portfolioReturns.push(dayReturn);
  }

  // Sharpe Ratio (annualized)
  const dailyRF = RISK_FREE_RATE / TRADING_DAYS;
  const excessReturns = portfolioReturns.map((r) => r - dailyRF);
  const annualizedReturn = mean(portfolioReturns) * TRADING_DAYS;
  const annualizedStd = stdDev(portfolioReturns) * Math.sqrt(TRADING_DAYS);
  const sharpeRatio =
    annualizedStd > 0 ? (annualizedReturn - RISK_FREE_RATE) / annualizedStd : 0;

  // Sortino Ratio (downside deviation only)
  const downsideReturns = excessReturns.filter((r) => r < 0);
  const downsideStd =
    downsideReturns.length > 0
      ? Math.sqrt(
          downsideReturns.reduce((s, r) => s + r ** 2, 0) / downsideReturns.length
        ) * Math.sqrt(TRADING_DAYS)
      : 0;
  const sortinoRatio =
    downsideStd > 0 ? (annualizedReturn - RISK_FREE_RATE) / downsideStd : 0;

  // Max Drawdown — on cumulative portfolio value
  let peak = 1;
  let maxDrawdown = 0;
  let cumulative = 1;
  for (const r of portfolioReturns) {
    cumulative *= 1 + r;
    if (cumulative > peak) peak = cumulative;
    const drawdown = (peak - cumulative) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // 1-day Historical VaR at 95% confidence
  const sorted = [...portfolioReturns].sort((a, b) => a - b);
  const varIndex = Math.floor(sorted.length * 0.05);
  const var95 = Math.abs(sorted[varIndex] ?? 0) * totalValue;

  // Correlation matrix
  const matrix: number[][] = [];
  for (let i = 0; i < tickers.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < tickers.length; j++) {
      if (i === j) {
        row.push(1);
      } else {
        const ri = returnsByTicker.get(tickers[i]) ?? [];
        const rj = returnsByTicker.get(tickers[j]) ?? [];
        row.push(parseFloat(pearsonCorrelation(ri, rj).toFixed(3)));
      }
    }
    matrix.push(row);
  }

  return {
    portfolioBeta: parseFloat(portfolioBeta.toFixed(3)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(3)),
    sortinoRatio: parseFloat(sortinoRatio.toFixed(3)),
    maxDrawdown: parseFloat((maxDrawdown * 100).toFixed(2)),
    var95: parseFloat(var95.toFixed(2)),
    volatilityAnnual: parseFloat((annualizedStd * 100).toFixed(2)),
    correlationMatrix: { tickers, matrix },
    totalValue: parseFloat(totalValue.toFixed(2)),
    positionWeights: positionValues.map((p, i) => ({
      ticker: p.ticker,
      weight: parseFloat((weights[i] * 100).toFixed(2)),
      value: parseFloat(p.value.toFixed(2)),
    })),
  };
}
