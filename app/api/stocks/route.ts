import { getAllStocks } from "@/lib/stocks";

export async function GET() {
  const stocks = getAllStocks().map(({ history: _history, ...meta }) => meta);
  return Response.json(stocks);
}
