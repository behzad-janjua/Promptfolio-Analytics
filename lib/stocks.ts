import type { StockMeta, Sector } from "@/types";

// Import all stock JSON files statically
import AAPL from "@/data/stocks/AAPL.json";
import MSFT from "@/data/stocks/MSFT.json";
import NVDA from "@/data/stocks/NVDA.json";
import GOOGL from "@/data/stocks/GOOGL.json";
import META from "@/data/stocks/META.json";
import JPM from "@/data/stocks/JPM.json";
import V from "@/data/stocks/V.json";
import BAC from "@/data/stocks/BAC.json";
import JNJ from "@/data/stocks/JNJ.json";
import PFE from "@/data/stocks/PFE.json";
import UNH from "@/data/stocks/UNH.json";
import AMZN from "@/data/stocks/AMZN.json";
import TSLA from "@/data/stocks/TSLA.json";
import COST from "@/data/stocks/COST.json";
import XOM from "@/data/stocks/XOM.json";
import CVX from "@/data/stocks/CVX.json";
import CAT from "@/data/stocks/CAT.json";
import HON from "@/data/stocks/HON.json";
import SPY from "@/data/stocks/SPY.json";
import QQQ from "@/data/stocks/QQQ.json";

const rawStocks = [
  AAPL, MSFT, NVDA, GOOGL, META,
  JPM, V, BAC,
  JNJ, PFE, UNH,
  AMZN, TSLA, COST,
  XOM, CVX,
  CAT, HON,
  SPY, QQQ,
] as StockMeta[];

const stockMap = new Map<string, StockMeta>(
  rawStocks.map((s) => [s.ticker, s])
);

export function getAllStocks(): StockMeta[] {
  return rawStocks;
}

export function getStock(ticker: string): StockMeta | undefined {
  return stockMap.get(ticker);
}

export function getStocksBySector(sector: Sector): StockMeta[] {
  return rawStocks.filter((s) => s.sector === sector);
}

export function getAllSectors(): Sector[] {
  return [...new Set(rawStocks.map((s) => s.sector))] as Sector[];
}

export const STARTING_PORTFOLIO: { ticker: string; shares: number; avgCost: number }[] = [
  { ticker: "AAPL", shares: 15, avgCost: 185.5 },
  { ticker: "MSFT", shares: 8, avgCost: 390.0 },
  { ticker: "NVDA", shares: 5, avgCost: 650.0 },
  { ticker: "JPM", shares: 20, avgCost: 195.0 },
  { ticker: "AMZN", shares: 3, avgCost: 182.0 },
  { ticker: "TSLA", shares: 10, avgCost: 260.0 },
  { ticker: "SPY", shares: 4, avgCost: 500.0 },
];

export const STARTING_CASH = 4_250.0;
