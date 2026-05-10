import type { Position } from "@/types";

export interface RebalanceTrade {
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  estimatedCost: number; // positive = spend, negative = receive
  currentWeight: number; // percent
  targetWeight: number; // percent
}

export interface RebalanceResult {
  trades: RebalanceTrade[];
  totalBuyValue: number;
  totalSellValue: number;
  netCashNeeded: number; // positive means need more cash, negative means freed up
  cashAfter: number;
  canExecuteWithCash: boolean;
}

export function computeRebalance(
  positions: Position[],
  prices: Record<string, number>,
  cash: number,
  targetWeights: Record<string, number> // ticker → percent (0-100), must sum to ≤ 100
): RebalanceResult {
  // Current portfolio values
  const currentValues: Record<string, number> = {};
  let totalEquity = 0;
  for (const p of positions) {
    const val = p.shares * (prices[p.ticker] ?? 0);
    currentValues[p.ticker] = val;
    totalEquity += val;
  }

  // Include any new tickers in target that aren't currently held
  const allTickers = new Set([
    ...positions.map((p) => p.ticker),
    ...Object.keys(targetWeights),
  ]);

  // Total capital to work with = equity + cash
  const totalCapital = totalEquity + cash;

  // Normalize target weights (in case they don't sum to 100)
  const weightSum = Object.values(targetWeights).reduce((a, b) => a + b, 0);
  const normalizedWeights: Record<string, number> = {};
  for (const [ticker, w] of Object.entries(targetWeights)) {
    normalizedWeights[ticker] = weightSum > 0 ? (w / weightSum) * 100 : 0;
  }

  // Compute target values and required trades
  const trades: RebalanceTrade[] = [];

  for (const ticker of allTickers) {
    const price = prices[ticker] ?? 0;
    if (price === 0) continue;

    const targetWeight = normalizedWeights[ticker] ?? 0;
    const targetValue = (targetWeight / 100) * totalCapital;
    const currentValue = currentValues[ticker] ?? 0;
    const currentWeight =
      totalEquity > 0 ? (currentValue / totalEquity) * 100 : 0;

    const valueDiff = targetValue - currentValue;
    const sharesDiff = valueDiff / price;

    if (Math.abs(sharesDiff) < 0.5) continue; // ignore trivial adjustments

    const sharesToTrade = Math.abs(Math.floor(sharesDiff));
    if (sharesToTrade === 0) continue;

    trades.push({
      ticker,
      side: sharesDiff > 0 ? "buy" : "sell",
      shares: sharesToTrade,
      estimatedCost: parseFloat((sharesDiff > 0 ? sharesToTrade * price : -sharesToTrade * price).toFixed(2)),
      currentWeight: parseFloat(currentWeight.toFixed(2)),
      targetWeight: parseFloat(targetWeight.toFixed(2)),
    });
  }

  // Sort: sells first (they free up cash), then buys
  trades.sort((a, b) => {
    if (a.side === "sell" && b.side === "buy") return -1;
    if (a.side === "buy" && b.side === "sell") return 1;
    return 0;
  });

  const totalSellValue = trades
    .filter((t) => t.side === "sell")
    .reduce((s, t) => s + Math.abs(t.estimatedCost), 0);
  const totalBuyValue = trades
    .filter((t) => t.side === "buy")
    .reduce((s, t) => s + t.estimatedCost, 0);

  const netCashNeeded = totalBuyValue - totalSellValue;
  const cashAfter = cash - netCashNeeded;

  return {
    trades,
    totalBuyValue: parseFloat(totalBuyValue.toFixed(2)),
    totalSellValue: parseFloat(totalSellValue.toFixed(2)),
    netCashNeeded: parseFloat(netCashNeeded.toFixed(2)),
    cashAfter: parseFloat(cashAfter.toFixed(2)),
    canExecuteWithCash: cashAfter >= 0,
  };
}
