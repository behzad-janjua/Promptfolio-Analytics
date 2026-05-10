import { NextRequest } from "next/server";
import { getStock } from "@/lib/stocks";
import type { Position } from "@/types";

export interface BenchmarkResult {
  dates: string[];
  portfolioReturns: number[]; // cumulative % return indexed by date
  spyReturns: number[]; // cumulative % return indexed by date
  portfolioFinalReturn: number;
  spyFinalReturn: number;
  alpha: number; // portfolio return - spy return
  startDate: string;
  endDate: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { positions, prices } = body as {
    positions?: Position[];
    prices?: Record<string, number>;
  };

  if (!Array.isArray(positions) || positions.length === 0) {
    return Response.json({ error: "positions is required" }, { status: 400 });
  }
  if (!prices) {
    return Response.json({ error: "prices is required" }, { status: 400 });
  }

  const spy = getStock("SPY");
  if (!spy) {
    return Response.json({ error: "SPY data unavailable" }, { status: 500 });
  }

  // Load historical data for all held stocks
  const stockHistories = new Map<string, { date: string; close: number }[]>();
  for (const pos of positions) {
    const stock = getStock(pos.ticker);
    if (stock) stockHistories.set(pos.ticker, stock.history);
  }

  if (stockHistories.size === 0) {
    return Response.json(
      { error: "None of the provided tickers have historical data" },
      { status: 400 }
    );
  }

  // Use SPY dates as the common timeline
  const spyHistory = spy.history;
  const spyStartClose = spyHistory[0].close;

  // Compute portfolio weights based on current prices
  const positionValues = positions.map((p) => ({
    ticker: p.ticker,
    value: p.shares * (prices[p.ticker] ?? 0),
  }));
  const totalValue = positionValues.reduce((s, p) => s + p.value, 0);
  const weights = new Map(
    positionValues.map((p) => [p.ticker, totalValue > 0 ? p.value / totalValue : 0])
  );

  // Build portfolio return series aligned to SPY dates
  const dates: string[] = [];
  const portfolioReturns: number[] = [];
  const spyReturns: number[] = [];

  for (let i = 0; i < spyHistory.length; i++) {
    const { date, close: spyClose } = spyHistory[i];
    dates.push(date);
    spyReturns.push(parseFloat((((spyClose - spyStartClose) / spyStartClose) * 100).toFixed(2)));

    // Portfolio return on this date
    let portfolioReturn = 0;
    for (const pos of positions) {
      const history = stockHistories.get(pos.ticker);
      if (!history) continue;
      // Find closest date (assumes same trading calendar)
      const dayData = history[i] ?? history[history.length - 1];
      const startClose = history[0].close;
      const stockReturn = (dayData.close - startClose) / startClose;
      portfolioReturn += (weights.get(pos.ticker) ?? 0) * stockReturn;
    }
    portfolioReturns.push(parseFloat((portfolioReturn * 100).toFixed(2)));
  }

  const portfolioFinalReturn = portfolioReturns[portfolioReturns.length - 1];
  const spyFinalReturn = spyReturns[spyReturns.length - 1];
  const alpha = parseFloat((portfolioFinalReturn - spyFinalReturn).toFixed(2));

  const result: BenchmarkResult = {
    dates,
    portfolioReturns,
    spyReturns,
    portfolioFinalReturn,
    spyFinalReturn,
    alpha,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
  };

  return Response.json(result);
}
