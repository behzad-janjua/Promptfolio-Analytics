import { getStock } from "@/lib/stocks";
import { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const stock = getStock(ticker.toUpperCase());

  if (!stock) {
    return Response.json({ error: "Stock not found" }, { status: 404 });
  }

  return Response.json(stock);
}
