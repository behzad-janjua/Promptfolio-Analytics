import { NextRequest } from "next/server";
import { computeRebalance } from "@/lib/rebalance";
import type { Position } from "@/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { positions, prices, cash = 0, targetWeights } = body as {
    positions?: Position[];
    prices?: Record<string, number>;
    cash?: number;
    targetWeights?: Record<string, number>;
  };

  if (!Array.isArray(positions) || positions.length === 0) {
    return Response.json({ error: "positions is required" }, { status: 400 });
  }
  if (!prices) {
    return Response.json({ error: "prices is required" }, { status: 400 });
  }
  if (!targetWeights || typeof targetWeights !== "object") {
    return Response.json(
      {
        error:
          "targetWeights is required — object mapping ticker to target weight percent, e.g. {AAPL: 25, SPY: 50, MSFT: 25}",
      },
      { status: 400 }
    );
  }

  const result = computeRebalance(positions, prices, cash, targetWeights);
  return Response.json(result);
}
