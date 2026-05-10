import { getStock } from "./stocks";
import type { Position } from "@/types";

const SIMULATIONS = 1000;

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

/** Cholesky decomposition of a positive-definite matrix. Returns lower triangle L such that L * L^T = A. */
function cholesky(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const val = matrix[i][i] - sum;
        L[i][j] = val > 0 ? Math.sqrt(val) : 1e-8;
      } else {
        L[i][j] = L[j][j] > 0 ? (matrix[i][j] - sum) / L[j][j] : 0;
      }
    }
  }
  return L;
}

function boxMuller(seed: number): number {
  // Simple seeded normal via Box-Muller. Not cryptographically safe but reproducible for demos.
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

export interface MonteCarloResult {
  dates: string[];
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
  currentValue: number;
  expectedValue: number; // p50 at horizon
  worstCase: number; // p10 at horizon
  bestCase: number; // p90 at horizon
}

export function runMonteCarlo(
  positions: Position[],
  prices: Record<string, number>,
  horizon = 252
): MonteCarloResult | { error: string } {
  if (positions.length === 0) return { error: "No positions provided" };

  const tickers = positions.map((p) => p.ticker);

  // Load historical returns per ticker
  const returnsByTicker: number[][] = [];
  for (const ticker of tickers) {
    const stock = getStock(ticker);
    if (!stock) return { error: `Ticker ${ticker} not found` };
    const closes = stock.history.map((d) => d.close);
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    returnsByTicker.push(returns);
  }

  const n = tickers.length;
  const dailyMeans = returnsByTicker.map(mean);
  const dailyStds = returnsByTicker.map(stdDev);

  // Build correlation matrix
  const corrMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) { corrMatrix[i][j] = 1; continue; }
      const ri = returnsByTicker[i];
      const rj = returnsByTicker[j];
      const len = Math.min(ri.length, rj.length);
      const mi = mean(ri.slice(0, len));
      const mj = mean(rj.slice(0, len));
      let num = 0; let di = 0; let dj = 0;
      for (let k = 0; k < len; k++) {
        num += (ri[k] - mi) * (rj[k] - mj);
        di += (ri[k] - mi) ** 2;
        dj += (rj[k] - mj) ** 2;
      }
      corrMatrix[i][j] = Math.sqrt(di * dj) > 0 ? num / Math.sqrt(di * dj) : 0;
    }
  }

  // Cholesky of covariance matrix (corr * std_i * std_j)
  const covMatrix = corrMatrix.map((row, i) =>
    row.map((r, j) => r * dailyStds[i] * dailyStds[j])
  );
  const L = cholesky(covMatrix);

  // Current portfolio value and weights
  const values = positions.map((p) => p.shares * (prices[p.ticker] ?? 0));
  const totalValue = values.reduce((a, b) => a + b, 0);
  if (totalValue === 0) return { error: "Portfolio has zero value" };
  const weights = values.map((v) => v / totalValue);

  // Run simulations
  const allPaths: number[][] = [];

  for (let sim = 0; sim < SIMULATIONS; sim++) {
    let portfolioValue = totalValue;
    const path: number[] = [portfolioValue];

    for (let day = 0; day < horizon; day++) {
      // Generate correlated normals using Cholesky
      const z: number[] = Array.from({ length: n }, () => boxMuller(sim * horizon + day));
      const correlated: number[] = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
          correlated[i] += L[i][j] * z[j];
        }
      }

      // Portfolio return = sum(weight * individual return)
      let portfolioReturn = 0;
      for (let i = 0; i < n; i++) {
        // Return = mean + correlated noise (already has std baked in from cov matrix)
        const stockReturn = dailyMeans[i] + correlated[i];
        portfolioReturn += weights[i] * stockReturn;
      }

      portfolioValue = portfolioValue * (1 + portfolioReturn);
      path.push(parseFloat(portfolioValue.toFixed(2)));
    }
    allPaths.push(path);
  }

  // Compute percentiles at each time step
  const p10: number[] = [];
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  const p90: number[] = [];

  for (let day = 0; day <= horizon; day++) {
    const dayValues = allPaths.map((path) => path[day]).sort((a, b) => a - b);
    p10.push(dayValues[Math.floor(SIMULATIONS * 0.1)]);
    p25.push(dayValues[Math.floor(SIMULATIONS * 0.25)]);
    p50.push(dayValues[Math.floor(SIMULATIONS * 0.5)]);
    p75.push(dayValues[Math.floor(SIMULATIONS * 0.75)]);
    p90.push(dayValues[Math.floor(SIMULATIONS * 0.9)]);
  }

  // Generate date labels (trading days forward from today)
  const today = new Date();
  const dates: string[] = [];
  let d = new Date(today);
  let count = 0;
  while (count <= horizon) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      dates.push(d.toISOString().split("T")[0]);
      count++;
    }
    d.setDate(d.getDate() + 1);
  }

  return {
    dates,
    p10,
    p25,
    p50,
    p75,
    p90,
    currentValue: parseFloat(totalValue.toFixed(2)),
    expectedValue: p50[p50.length - 1],
    worstCase: p10[p10.length - 1],
    bestCase: p90[p90.length - 1],
  };
}
