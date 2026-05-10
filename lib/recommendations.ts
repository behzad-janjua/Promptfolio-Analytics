import type { StockMeta, Signal, SignalStrength, Position } from "@/types";

function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(prices.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function computeRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const slice = prices.slice(prices.length - period - 1);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const delta = slice[i] - slice[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function computeSignal(stock: StockMeta, currentPrice: number): Signal {
  const closes = stock.history.map((d) => d.close);
  closes.push(currentPrice);

  const rsi = computeRSI(closes);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);

  let strength: SignalStrength = "Hold";
  let rationale = "No strong signal — price is within normal range.";

  if (rsi !== null && rsi < 30) {
    strength = "Strong Buy";
    rationale = `RSI = ${rsi.toFixed(0)} — technically oversold. Potential reversal opportunity.`;
  } else if (rsi !== null && rsi > 70) {
    strength = "Sell";
    rationale = `RSI = ${rsi.toFixed(0)} — overbought territory. Consider taking profits.`;
  } else if (rsi !== null && rsi > 80) {
    strength = "Strong Sell";
    rationale = `RSI = ${rsi.toFixed(0)} — extremely overbought. High probability of near-term pullback.`;
  } else if (
    sma50 !== null &&
    sma200 !== null &&
    currentPrice > sma50 &&
    sma50 > sma200
  ) {
    strength = "Buy";
    rationale = `Price above SMA-50 with golden-cross structure (SMA-50 > SMA-200). Bullish momentum.`;
  } else if (
    sma50 !== null &&
    currentPrice < sma50 &&
    rsi !== null &&
    rsi > 50
  ) {
    strength = "Hold";
    rationale = `Price below SMA-50 but RSI still elevated. Weakening momentum — monitor closely.`;
  } else if (currentPrice <= stock.week52Low * 1.02) {
    strength = "Strong Buy";
    rationale = `Trading within 2% of 52-week low ($${stock.week52Low.toFixed(2)}). Historically attractive entry.`;
  } else if (currentPrice >= stock.week52High * 0.98) {
    strength = "Sell";
    rationale = `Near 52-week high ($${stock.week52High.toFixed(2)}). Resistance likely — consider trimming.`;
  } else if (sma20 !== null && currentPrice > sma20 * 1.05) {
    strength = "Hold";
    rationale = `Price stretched >5% above SMA-20. Wait for a pullback before adding.`;
  }

  return {
    strength,
    rationale,
    rsi: rsi ?? undefined,
    sma20: sma20 ?? undefined,
    sma50: sma50 ?? undefined,
    sma200: sma200 ?? undefined,
  };
}

export interface ConcentrationAlert {
  type: "position" | "sector";
  ticker?: string;
  sector?: string;
  pct: number;
  message: string;
}

export function computeConcentrationAlerts(
  positions: Position[],
  prices: Map<string, number>
): ConcentrationAlert[] {
  const positionValues = positions.map((p) => ({
    ...p,
    value: p.shares * (prices.get(p.ticker) ?? 0),
  }));
  const totalValue = positionValues.reduce((s, p) => s + p.value, 0);
  if (totalValue === 0) return [];

  const alerts: ConcentrationAlert[] = [];

  // Single position alerts
  for (const p of positionValues) {
    const pct = (p.value / totalValue) * 100;
    if (pct > 25) {
      alerts.push({
        type: "position",
        ticker: p.ticker,
        pct,
        message: `${p.ticker} is ${pct.toFixed(0)}% of your equity — consider trimming to reduce concentration risk.`,
      });
    }
  }

  return alerts;
}

export function signalColor(strength: SignalStrength): string {
  switch (strength) {
    case "Strong Buy": return "text-emerald-400 bg-emerald-400/10";
    case "Buy": return "text-green-400 bg-green-400/10";
    case "Hold": return "text-yellow-400 bg-yellow-400/10";
    case "Sell": return "text-orange-400 bg-orange-400/10";
    case "Strong Sell": return "text-red-400 bg-red-400/10";
  }
}
