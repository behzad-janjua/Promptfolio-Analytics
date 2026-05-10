// Run with: npx ts-node scripts/generate-stock-data.ts
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface StockConfig {
  ticker: string;
  name: string;
  sector: string;
  description: string;
  marketCap: number;
  pe: number | null;
  dividendYield: number;
  beta: number;
  startPrice: number; // price ~1 year ago
  endPrice: number; // approximate current price
  volatility: number; // daily vol as fraction (0.01 = 1%)
  week52High: number;
  week52Low: number;
}

const stocks: StockConfig[] = [
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    sector: "Technology",
    description: "Designs and sells consumer electronics, software, and services including iPhone, Mac, and the App Store ecosystem.",
    marketCap: 3_200_000_000_000,
    pe: 33.2,
    dividendYield: 0.44,
    beta: 1.24,
    startPrice: 178,
    endPrice: 212,
    volatility: 0.012,
    week52High: 237.23,
    week52Low: 169.21,
  },
  {
    ticker: "MSFT",
    name: "Microsoft Corporation",
    sector: "Technology",
    description: "Develops and sells software, cloud services (Azure), and hardware. Owns GitHub, LinkedIn, and a significant stake in OpenAI.",
    marketCap: 3_000_000_000_000,
    pe: 38.5,
    dividendYield: 0.72,
    beta: 0.9,
    startPrice: 385,
    endPrice: 418,
    volatility: 0.011,
    week52High: 468.35,
    week52Low: 344.79,
  },
  {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    sector: "Technology",
    description: "Designs GPUs and system-on-chip units. Dominant supplier of AI training accelerators; key beneficiary of generative AI boom.",
    marketCap: 2_800_000_000_000,
    pe: 55.1,
    dividendYield: 0.03,
    beta: 1.95,
    startPrice: 620,
    endPrice: 875,
    volatility: 0.025,
    week52High: 974.00,
    week52Low: 462.15,
  },
  {
    ticker: "GOOGL",
    name: "Alphabet Inc.",
    sector: "Technology",
    description: "Parent of Google Search, YouTube, Google Cloud, and Waymo. Generates the majority of revenue from digital advertising.",
    marketCap: 2_100_000_000_000,
    pe: 24.8,
    dividendYield: 0.45,
    beta: 1.06,
    startPrice: 155,
    endPrice: 168,
    volatility: 0.013,
    week52High: 208.70,
    week52Low: 140.53,
  },
  {
    ticker: "META",
    name: "Meta Platforms Inc.",
    sector: "Technology",
    description: "Operates Facebook, Instagram, and WhatsApp. Investing heavily in the metaverse and AI-powered advertising.",
    marketCap: 1_500_000_000_000,
    pe: 28.4,
    dividendYield: 0.35,
    beta: 1.32,
    startPrice: 480,
    endPrice: 562,
    volatility: 0.018,
    week52High: 638.40,
    week52Low: 414.50,
  },
  {
    ticker: "JPM",
    name: "JPMorgan Chase & Co.",
    sector: "Finance",
    description: "Largest U.S. bank by assets. Offers consumer banking, investment banking, asset management, and commercial banking globally.",
    marketCap: 740_000_000_000,
    pe: 13.2,
    dividendYield: 2.1,
    beta: 1.12,
    startPrice: 185,
    endPrice: 224,
    volatility: 0.014,
    week52High: 280.25,
    week52Low: 185.00,
  },
  {
    ticker: "V",
    name: "Visa Inc.",
    sector: "Finance",
    description: "Global payments technology network. Facilitates electronic funds transfers across 200+ countries without taking on credit risk.",
    marketCap: 620_000_000_000,
    pe: 31.5,
    dividendYield: 0.79,
    beta: 0.93,
    startPrice: 270,
    endPrice: 340,
    volatility: 0.01,
    week52High: 365.00,
    week52Low: 254.79,
  },
  {
    ticker: "BAC",
    name: "Bank of America Corporation",
    sector: "Finance",
    description: "Second largest U.S. bank. Offers retail banking, wealth management (Merrill Lynch), and investment banking services.",
    marketCap: 330_000_000_000,
    pe: 14.8,
    dividendYield: 2.5,
    beta: 1.35,
    startPrice: 33,
    endPrice: 42,
    volatility: 0.016,
    week52High: 48.05,
    week52Low: 30.57,
  },
  {
    ticker: "JNJ",
    name: "Johnson & Johnson",
    sector: "Healthcare",
    description: "Global healthcare conglomerate spanning pharmaceuticals, medical devices, and consumer health products.",
    marketCap: 380_000_000_000,
    pe: 16.2,
    dividendYield: 3.15,
    beta: 0.55,
    startPrice: 155,
    endPrice: 158,
    volatility: 0.009,
    week52High: 175.88,
    week52Low: 143.13,
  },
  {
    ticker: "PFE",
    name: "Pfizer Inc.",
    sector: "Healthcare",
    description: "Leading pharmaceutical company known for COVID vaccines, oncology drugs, and a broad pipeline of therapies.",
    marketCap: 143_000_000_000,
    pe: 21.3,
    dividendYield: 6.8,
    beta: 0.6,
    startPrice: 28,
    endPrice: 26,
    volatility: 0.013,
    week52High: 31.54,
    week52Low: 21.20,
  },
  {
    ticker: "UNH",
    name: "UnitedHealth Group",
    sector: "Healthcare",
    description: "Largest U.S. health insurer by revenue. Operates UnitedHealthcare and Optum health services segments.",
    marketCap: 420_000_000_000,
    pe: 18.9,
    dividendYield: 1.65,
    beta: 0.72,
    startPrice: 490,
    endPrice: 380,
    volatility: 0.016,
    week52High: 630.73,
    week52Low: 356.00,
  },
  {
    ticker: "AMZN",
    name: "Amazon.com Inc.",
    sector: "Consumer",
    description: "World's largest e-commerce and cloud computing company. AWS is the leading cloud provider; also operates Prime Video and Alexa.",
    marketCap: 2_200_000_000_000,
    pe: 43.6,
    dividendYield: 0,
    beta: 1.15,
    startPrice: 178,
    endPrice: 205,
    volatility: 0.014,
    week52High: 242.52,
    week52Low: 151.61,
  },
  {
    ticker: "TSLA",
    name: "Tesla Inc.",
    sector: "Consumer",
    description: "Designs and manufactures electric vehicles, energy storage systems, and solar products. Also develops autonomous driving software.",
    marketCap: 1_000_000_000_000,
    pe: 140.2,
    dividendYield: 0,
    beta: 2.3,
    startPrice: 250,
    endPrice: 315,
    volatility: 0.032,
    week52High: 488.54,
    week52Low: 138.80,
  },
  {
    ticker: "COST",
    name: "Costco Wholesale Corporation",
    sector: "Consumer",
    description: "Membership-based warehouse retailer known for bulk goods and strong customer loyalty. Consistent revenue growth across all cycles.",
    marketCap: 420_000_000_000,
    pe: 55.4,
    dividendYield: 0.55,
    beta: 0.78,
    startPrice: 740,
    endPrice: 930,
    volatility: 0.01,
    week52High: 1044.36,
    week52Low: 682.45,
  },
  {
    ticker: "XOM",
    name: "Exxon Mobil Corporation",
    sector: "Energy",
    description: "Largest U.S. oil and gas company by market cap. Explores, produces, and refines petroleum products globally.",
    marketCap: 530_000_000_000,
    pe: 14.1,
    dividendYield: 3.45,
    beta: 0.88,
    startPrice: 108,
    endPrice: 115,
    volatility: 0.013,
    week52High: 126.34,
    week52Low: 95.77,
  },
  {
    ticker: "CVX",
    name: "Chevron Corporation",
    sector: "Energy",
    description: "Major integrated energy company with upstream oil and gas, downstream refining, and chemicals businesses worldwide.",
    marketCap: 280_000_000_000,
    pe: 15.3,
    dividendYield: 4.1,
    beta: 0.85,
    startPrice: 155,
    endPrice: 148,
    volatility: 0.012,
    week52High: 172.10,
    week52Low: 130.27,
  },
  {
    ticker: "CAT",
    name: "Caterpillar Inc.",
    sector: "Industrial",
    description: "World's largest manufacturer of construction and mining equipment, diesel engines, and industrial gas turbines.",
    marketCap: 185_000_000_000,
    pe: 17.8,
    dividendYield: 1.6,
    beta: 1.02,
    startPrice: 335,
    endPrice: 360,
    volatility: 0.014,
    week52High: 418.00,
    week52Low: 278.94,
  },
  {
    ticker: "HON",
    name: "Honeywell International Inc.",
    sector: "Industrial",
    description: "Diversified industrial conglomerate with segments in aerospace, building technologies, performance materials, and safety products.",
    marketCap: 130_000_000_000,
    pe: 22.1,
    dividendYield: 2.2,
    beta: 0.94,
    startPrice: 195,
    endPrice: 218,
    volatility: 0.01,
    week52High: 242.06,
    week52Low: 181.79,
  },
  {
    ticker: "SPY",
    name: "SPDR S&P 500 ETF",
    sector: "ETF",
    description: "Tracks the S&P 500 index — 500 largest U.S. companies. The most widely traded ETF in the world. Ideal for broad market exposure.",
    marketCap: 600_000_000_000,
    pe: null,
    dividendYield: 1.2,
    beta: 1.0,
    startPrice: 490,
    endPrice: 560,
    volatility: 0.008,
    week52High: 613.23,
    week52Low: 480.35,
  },
  {
    ticker: "QQQ",
    name: "Invesco QQQ Trust",
    sector: "ETF",
    description: "Tracks the Nasdaq-100 index — 100 largest non-financial Nasdaq companies. Heavy tech weighting (AAPL, MSFT, NVDA, AMZN).",
    marketCap: 300_000_000_000,
    pe: null,
    dividendYield: 0.6,
    beta: 1.2,
    startPrice: 420,
    endPrice: 475,
    volatility: 0.011,
    week52High: 540.81,
    week52Low: 400.52,
  },
];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateHistory(stock: StockConfig, days = 365): { date: string; close: number; volume: number }[] {
  const rng = seededRandom(stock.ticker.charCodeAt(0) * 31 + stock.ticker.charCodeAt(1) * 37);
  const history: { date: string; close: number; volume: number }[] = [];

  // Work backwards from today to generate dates
  const today = new Date();
  const dates: Date[] = [];
  let d = new Date(today);
  d.setDate(d.getDate() - days);
  while (d <= today) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }

  // Drift to match start → end price over the period
  const totalReturn = Math.log(stock.endPrice / stock.startPrice);
  const dailyDrift = totalReturn / dates.length;
  const vol = stock.volatility;

  let price = stock.startPrice;
  for (let i = 0; i < dates.length; i++) {
    const r = rng();
    // Box-Muller for approximate normal
    const r2 = rng();
    const z = Math.sqrt(-2 * Math.log(r + 1e-10)) * Math.cos(2 * Math.PI * r2);
    const dailyReturn = dailyDrift + vol * z;
    price = price * Math.exp(dailyReturn);
    // Clamp to within 52w range with some tolerance
    price = Math.max(stock.week52Low * 0.95, Math.min(stock.week52High * 1.05, price));

    const baseVolume = stock.marketCap / price / 252;
    const volume = Math.round(baseVolume * (0.7 + rng() * 0.6));

    history.push({
      date: dates[i].toISOString().split("T")[0],
      close: parseFloat(price.toFixed(2)),
      volume,
    });
  }

  return history;
}

const outputDir = path.join(__dirname, "../data/stocks");
fs.mkdirSync(outputDir, { recursive: true });

for (const stock of stocks) {
  const history = generateHistory(stock);
  const lastClose = history[history.length - 1].close;

  const data = {
    ticker: stock.ticker,
    name: stock.name,
    sector: stock.sector,
    description: stock.description,
    marketCap: stock.marketCap,
    pe: stock.pe,
    dividendYield: stock.dividendYield,
    beta: stock.beta,
    week52High: stock.week52High,
    week52Low: stock.week52Low,
    lastClose,
    history,
  };

  fs.writeFileSync(
    path.join(outputDir, `${stock.ticker}.json`),
    JSON.stringify(data, null, 2)
  );
  console.log(`Generated ${stock.ticker}: ${history.length} trading days, last close $${lastClose}`);
}

console.log(`\nDone. Generated ${stocks.length} stock files.`);
