import { NextRequest } from "next/server";
import { computeRiskMetrics } from "@/lib/risk";
import type { Position } from "@/types";

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
    return Response.json(
      { error: "positions must be a non-empty array of {ticker, shares, avgCost}" },
      { status: 400 }
    );
  }
  if (!prices || typeof prices !== "object") {
    return Response.json(
      { error: "prices must be an object mapping ticker → current price" },
      { status: 400 }
    );
  }

  const metrics = computeRiskMetrics(positions, prices);
  return Response.json(metrics);
}
