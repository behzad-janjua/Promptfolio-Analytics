/**
 * Real Portfolio Tracker
 * Lets users input their actual holdings (not the paper trading simulation).
 * Computes performance metrics and generates an Ollama-ready context string.
 */

import { getStock } from "./stocks";
import { computeRiskMetrics } from "./risk";
import { computeSignal } from "./recommendations";
import type { Position } from "@/types";

export type AccountType = "TFSA" | "RRSP" | "Non-Registered" | "FHSA";

export interface RealHolding {
  ticker: string;
  shares: number;
  avgCost: number; // average cost per share in CAD
  accountType: AccountType;
  // Optional override for stocks outside our 20-stock universe
  customName?: string;
  customCurrentPrice?: number;
}

export interface RealHoldingAnalysis {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedGain: number;
  unrealizedGainPct: number;
  accountType: AccountType;
  sector: string;
  signal?: { strength: string; rationale: string };
  inUniverse: boolean; // false if user entered a custom ticker we don't have data for
}

export interface RealPortfolioAnalysis {
  holdings: RealHoldingAnalysis[];
  totalValue: number;
  totalCostBasis: number;
  totalUnrealizedGain: number;
  totalUnrealizedGainPct: number;
  sectorAllocation: { sector: string; value: number; pct: number }[];
  accountAllocation: { accountType: AccountType; value: number; pct: number }[];
  riskMetrics: ReturnType<typeof computeRiskMetrics> | null;
  ollamaContext: string;
}

export function analyzeRealPortfolio(
  holdings: RealHolding[],
  prices: Record<string, number>
): RealPortfolioAnalysis {
  const holdingAnalyses: RealHoldingAnalysis[] = [];

  for (const h of holdings) {
    const stock = getStock(h.ticker.toUpperCase());
    const currentPrice =
      h.customCurrentPrice ??
      prices[h.ticker.toUpperCase()] ??
      stock?.history[stock.history.length - 1].close ??
      0;

    const marketValue = h.shares * currentPrice;
    const costBasis = h.shares * h.avgCost;
    const unrealizedGain = marketValue - costBasis;
    const unrealizedGainPct = costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0;

    let signal: { strength: string; rationale: string } | undefined;
    if (stock && currentPrice > 0) {
      const s = computeSignal(stock, currentPrice);
      signal = { strength: s.strength, rationale: s.rationale };
    }

    holdingAnalyses.push({
      ticker: h.ticker.toUpperCase(),
      name: stock?.name ?? h.customName ?? h.ticker.toUpperCase(),
      shares: h.shares,
      avgCost: h.avgCost,
      currentPrice,
      marketValue,
      costBasis,
      unrealizedGain,
      unrealizedGainPct,
      accountType: h.accountType,
      sector: stock?.sector ?? "Unknown",
      signal,
      inUniverse: !!stock,
    });
  }

  const totalValue = holdingAnalyses.reduce((s, h) => s + h.marketValue, 0);
  const totalCostBasis = holdingAnalyses.reduce((s, h) => s + h.costBasis, 0);
  const totalUnrealizedGain = totalValue - totalCostBasis;
  const totalUnrealizedGainPct =
    totalCostBasis > 0 ? (totalUnrealizedGain / totalCostBasis) * 100 : 0;

  // Sector allocation
  const sectorMap = new Map<string, number>();
  for (const h of holdingAnalyses) {
    sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + h.marketValue);
  }
  const sectorAllocation = [...sectorMap.entries()]
    .map(([sector, value]) => ({
      sector,
      value,
      pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Account type allocation
  const accountMap = new Map<AccountType, number>();
  for (const h of holdingAnalyses) {
    accountMap.set(h.accountType, (accountMap.get(h.accountType) ?? 0) + h.marketValue);
  }
  const accountAllocation = [...accountMap.entries()].map(([accountType, value]) => ({
    accountType,
    value,
    pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
  }));

  // Risk metrics (only for stocks in our universe)
  const positionsInUniverse: Position[] = holdingAnalyses
    .filter((h) => h.inUniverse)
    .map((h) => ({ ticker: h.ticker, shares: h.shares, avgCost: h.avgCost }));
  const pricesRecord = Object.fromEntries(
    holdingAnalyses.map((h) => [h.ticker, h.currentPrice])
  );
  const riskMetrics =
    positionsInUniverse.length > 0
      ? computeRiskMetrics(positionsInUniverse, pricesRecord)
      : null;

  // Build rich context string for Ollama
  const ollamaContext = buildOllamaContext(
    holdingAnalyses,
    totalValue,
    totalUnrealizedGain,
    totalUnrealizedGainPct,
    sectorAllocation,
    accountAllocation,
    riskMetrics
  );

  return {
    holdings: holdingAnalyses,
    totalValue,
    totalCostBasis,
    totalUnrealizedGain,
    totalUnrealizedGainPct,
    sectorAllocation,
    accountAllocation,
    riskMetrics,
    ollamaContext,
  };
}

function buildOllamaContext(
  holdings: RealHoldingAnalysis[],
  totalValue: number,
  totalGain: number,
  totalGainPct: number,
  sectorAlloc: { sector: string; pct: number }[],
  accountAlloc: { accountType: AccountType; value: number; pct: number }[],
  risk: ReturnType<typeof computeRiskMetrics> | null
): string {
  const lines: string[] = [
    "=== PORTFOLIO SUMMARY ===",
    `Total Market Value: $${totalValue.toLocaleString("en-CA", { minimumFractionDigits: 2 })} CAD`,
    `Unrealized Gain/Loss: $${totalGain.toLocaleString("en-CA", { minimumFractionDigits: 2 })} (${totalGainPct >= 0 ? "+" : ""}${totalGainPct.toFixed(2)}%)`,
    "",
    "=== HOLDINGS ===",
  ];

  for (const h of holdings.sort((a, b) => b.marketValue - a.marketValue)) {
    const pct = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
    lines.push(
      `${h.ticker} (${h.name}, ${h.accountType}): ` +
        `${h.shares} shares @ $${h.avgCost.toFixed(2)} avg cost, ` +
        `current $${h.currentPrice.toFixed(2)}, ` +
        `value $${h.marketValue.toFixed(2)} (${pct.toFixed(1)}% of portfolio), ` +
        `P&L: ${h.unrealizedGain >= 0 ? "+" : ""}$${h.unrealizedGain.toFixed(2)} (${h.unrealizedGainPct.toFixed(1)}%)` +
        (h.signal ? ` — Signal: ${h.signal.strength}` : "")
    );
  }

  lines.push("", "=== SECTOR ALLOCATION ===");
  for (const s of sectorAlloc) {
    lines.push(`${s.sector}: ${s.pct.toFixed(1)}%`);
  }

  lines.push("", "=== ACCOUNT BREAKDOWN ===");
  for (const a of accountAlloc) {
    lines.push(`${a.accountType}: $${a.value.toFixed(2)} (${a.pct.toFixed(1)}%)`);
  }

  if (risk) {
    lines.push(
      "",
      "=== RISK METRICS ===",
      `Portfolio Beta: ${risk.portfolioBeta}`,
      `Sharpe Ratio: ${risk.sharpeRatio}`,
      `Sortino Ratio: ${risk.sortinoRatio}`,
      `Max Drawdown: ${risk.maxDrawdown}%`,
      `Annual Volatility: ${risk.volatilityAnnual}%`,
      `1-Day VaR (95%): $${risk.var95}`
    );
  }

  return lines.join("\n");
}
