import { NextRequest } from "next/server";
import { runMonteCarlo } from "@/lib/monte-carlo";
import type { Position } from "@/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { positions, prices, horizon = 252 } = body as {
    positions?: Position[];
    prices?: Record<string, number>;
    horizon?: number;
  };

  if (!Array.isArray(positions) || positions.length === 0) {
    return Response.json(
      { error: "positions must be a non-empty array" },
      { status: 400 }
    );
  }
  if (!prices || typeof prices !== "object") {
    return Response.json(
      { error: "prices must be an object mapping ticker → price" },
      { status: 400 }
    );
  }
  if (typeof horizon !== "number" || horizon < 1 || horizon > 1260) {
    return Response.json(
      { error: "horizon must be between 1 and 1260 trading days" },
      { status: 400 }
    );
  }

  const result = runMonteCarlo(positions, prices, horizon);
  if ("error" in result) {
    return Response.json(result, { status: 400 });
  }

  return Response.json(result);
}
