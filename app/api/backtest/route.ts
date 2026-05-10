import { NextRequest } from "next/server";
import { backtest, type StrategyName } from "@/lib/backtest";

const VALID_STRATEGIES: StrategyName[] = [
  "rsi_mean_reversion",
  "golden_cross",
  "buy_and_hold",
  "momentum",
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ticker, strategy, initialCapital = 10_000 } = body as {
    ticker?: string;
    strategy?: string;
    initialCapital?: number;
  };

  if (!ticker) {
    return Response.json({ error: "ticker is required" }, { status: 400 });
  }
  if (!strategy || !VALID_STRATEGIES.includes(strategy as StrategyName)) {
    return Response.json(
      {
        error: `strategy must be one of: ${VALID_STRATEGIES.join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (typeof initialCapital !== "number" || initialCapital <= 0) {
    return Response.json(
      { error: "initialCapital must be a positive number" },
      { status: 400 }
    );
  }

  const result = backtest(ticker.toUpperCase(), strategy as StrategyName, initialCapital);

  if ("error" in result) {
    return Response.json(result, { status: 404 });
  }

  return Response.json(result);
}

// GET for quick testing: /api/backtest?ticker=AAPL&strategy=rsi_mean_reversion
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const strategy = searchParams.get("strategy") as StrategyName | null;
  const initialCapital = parseFloat(searchParams.get("initialCapital") ?? "10000");

  if (!ticker || !strategy) {
    return Response.json(
      {
        error: "ticker and strategy query params are required",
        validStrategies: VALID_STRATEGIES,
      },
      { status: 400 }
    );
  }

  const result = backtest(ticker.toUpperCase(), strategy, initialCapital);
  if ("error" in result) return Response.json(result, { status: 404 });
  return Response.json(result);
}
