import { NextRequest } from "next/server";
import { getAllStocks, getStock } from "@/lib/stocks";
import { computeSignal } from "@/lib/recommendations";

// GET /api/signals?ticker=AAPL&price=195.5
// GET /api/signals  → all stocks using last close as current price
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const priceParam = searchParams.get("price");

  if (ticker) {
    const stock = getStock(ticker.toUpperCase());
    if (!stock) {
      return Response.json({ error: "Stock not found" }, { status: 404 });
    }
    const currentPrice = priceParam
      ? parseFloat(priceParam)
      : stock.history[stock.history.length - 1].close;
    const signal = computeSignal(stock, currentPrice);
    return Response.json({ ticker: stock.ticker, signal });
  }

  // Bulk: return signals for all stocks at last close
  const stocks = getAllStocks();
  const signals = stocks.map((stock) => {
    const currentPrice = stock.history[stock.history.length - 1].close;
    return { ticker: stock.ticker, signal: computeSignal(stock, currentPrice) };
  });

  return Response.json(signals);
}
