import { NextRequest } from "next/server";
import { analyzeRealPortfolio, type RealHolding } from "@/lib/real-portfolio";

/**
 * POST /api/portfolio/real
 * Body: { holdings: RealHolding[], prices?: Record<string, number> }
 *
 * Analyzes a user's real (manually entered) portfolio.
 * Returns full analysis including P&L, sector allocation, risk metrics,
 * and an ollamaContext string ready to be injected into an LLM prompt.
 *
 * Example body:
 * {
 *   "holdings": [
 *     { "ticker": "AAPL", "shares": 10, "avgCost": 150, "accountType": "TFSA" },
 *     { "ticker": "MSFT", "shares": 5, "avgCost": 350, "accountType": "RRSP" }
 *   ],
 *   "prices": { "AAPL": 195, "MSFT": 420 }
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { holdings, prices = {} } = body as {
    holdings?: RealHolding[];
    prices?: Record<string, number>;
  };

  if (!Array.isArray(holdings) || holdings.length === 0) {
    return Response.json(
      {
        error:
          "holdings is required — array of {ticker, shares, avgCost, accountType}",
        validAccountTypes: ["TFSA", "RRSP", "Non-Registered", "FHSA"],
      },
      { status: 400 }
    );
  }

  // Validate each holding
  for (const h of holdings) {
    if (!h.ticker || typeof h.ticker !== "string") {
      return Response.json(
        { error: "Each holding must have a ticker string" },
        { status: 400 }
      );
    }
    if (typeof h.shares !== "number" || h.shares <= 0) {
      return Response.json(
        { error: `${h.ticker}: shares must be a positive number` },
        { status: 400 }
      );
    }
    if (typeof h.avgCost !== "number" || h.avgCost < 0) {
      return Response.json(
        { error: `${h.ticker}: avgCost must be a non-negative number` },
        { status: 400 }
      );
    }
  }

  const analysis = analyzeRealPortfolio(holdings, prices);
  return Response.json(analysis);
}
