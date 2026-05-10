import { getAllStocks } from "./stocks";

export type PriceListener = (ticker: string, price: number) => void;

class PriceSimulator {
  private prices: Map<string, number> = new Map();
  private peaks: Map<string, number> = new Map();
  private listeners: Map<string, Set<PriceListener>> = new Map();
  private globalListeners: Set<PriceListener> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private rngState: Map<string, number> = new Map();

  constructor() {
    const stocks = getAllStocks();
    for (const s of stocks) {
      const lastClose = s.history[s.history.length - 1].close;
      this.prices.set(s.ticker, lastClose);
      this.peaks.set(s.ticker, lastClose);
      // Seed per ticker for reproducible-ish variation
      this.rngState.set(s.ticker, s.ticker.charCodeAt(0) * 999983 + Date.now());
    }
  }

  private nextRandom(ticker: string): number {
    const s = (this.rngState.get(ticker) ?? 1) * 1664525 + 1013904223;
    this.rngState.set(ticker, s & 0x7fffffff);
    return (s & 0x7fffffff) / 0x7fffffff;
  }

  private gaussian(ticker: string): number {
    const u1 = Math.max(this.nextRandom(ticker), 1e-10);
    const u2 = this.nextRandom(ticker);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  start(intervalMs = 2000): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    const stocks = getAllStocks();
    // Sector noise: shared component that correlates stocks in same sector
    const sectorNoise = new Map<string, number>();

    for (const s of stocks) {
      if (!sectorNoise.has(s.sector)) {
        sectorNoise.set(s.sector, this.gaussian(s.ticker) * 0.0008);
      }

      const vol = s.beta * 0.0012; // higher beta = more volatile per tick
      const idioNoise = this.gaussian(s.ticker) * vol;
      const sector = sectorNoise.get(s.sector) ?? 0;
      const dailyReturn = idioNoise + sector;

      const oldPrice = this.prices.get(s.ticker) ?? s.history[s.history.length - 1].close;
      const newPrice = parseFloat((oldPrice * (1 + dailyReturn)).toFixed(2));
      this.prices.set(s.ticker, newPrice);

      // Track peak for trailing stops
      const peak = this.peaks.get(s.ticker) ?? newPrice;
      if (newPrice > peak) this.peaks.set(s.ticker, newPrice);

      this.notify(s.ticker, newPrice);
    }
  }

  private notify(ticker: string, price: number): void {
    this.listeners.get(ticker)?.forEach((fn) => fn(ticker, price));
    this.globalListeners.forEach((fn) => fn(ticker, price));
  }

  getPrice(ticker: string): number {
    return this.prices.get(ticker) ?? 0;
  }

  getPeak(ticker: string): number {
    return this.peaks.get(ticker) ?? this.getPrice(ticker);
  }

  getAllPrices(): Map<string, number> {
    return new Map(this.prices);
  }

  subscribe(ticker: string, fn: PriceListener): () => void {
    if (!this.listeners.has(ticker)) this.listeners.set(ticker, new Set());
    this.listeners.get(ticker)!.add(fn);
    return () => this.listeners.get(ticker)?.delete(fn);
  }

  subscribeAll(fn: PriceListener): () => void {
    this.globalListeners.add(fn);
    return () => this.globalListeners.delete(fn);
  }
}

// Singleton — safe in Next.js because this runs client-side only
let _simulator: PriceSimulator | null = null;

export function getSimulator(): PriceSimulator {
  if (!_simulator) _simulator = new PriceSimulator();
  return _simulator;
}
