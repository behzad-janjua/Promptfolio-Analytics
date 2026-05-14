# Promptfolio Analytics

A real-time portfolio analytics platform with live price simulation, order management, technical signals, and an AI advisor powered by Gemini free-tier models or local LLMs via Ollama.

---

## Features

### Live Dashboard (`/`)

**Real-time price simulation**
- 20 stocks across Technology, Finance, Healthcare, Consumer, Energy, Industrial, and ETF sectors
- Prices tick every 5 seconds using a Gaussian random walk model with per-sector correlation and beta-adjusted volatility
- Scrolling ticker tape across the top showing all 20 symbols with live price and day change

**Portfolio holdings table**
- 30-day sparkline chart per position
- Live price with green/red flash on each tick
- Shares, average cost, current value, unrealized P&L
- AI signal badge per row (Strong Buy → Strong Sell)

**Portfolio stats**
- Total portfolio value, day P&L, total unrealized P&L, cash balance — all updating live

**Order management**
- Four order types: Market, Limit, Stop Loss, Trailing Stop
- Buy and sell sides with estimated cost preview
- Open orders panel with cancel — limit and stop orders fill automatically when the simulated price crosses the trigger
- Full trade history with realized P&L per fill

**AI signals panel**
- RSI (14-period), SMA-20, SMA-50, SMA-200 computed on 365 days of historical closes plus the live price
- Signal strength (Strong Buy / Buy / Hold / Sell / Strong Sell) with plain-language rationale per position

---

### AI Portfolio Advisor (`/advisor`)

A chat interface backed by Gemini Developer API free-tier models or any locally running Ollama model. The system prompt is built fresh on every message and includes:

- Every position: live price, average cost, value, unrealized P&L, day change, RSI, SMA-50, SMA-200, 52-week range, beta, P/E
- Sector breakdown with dollar allocation and percentage weights
- Cash balance and open order count
- Recent trade history with realized P&L

**Usage**
- Select a Gemini or Ollama model from the header dropdown
- Type freely or click a quick-prompt chip in the sidebar
- Responses stream in token by token; stop generation at any time
- Attach screenshots/images when using a Gemini vision-capable model
- Import brokerage screenshots into portfolio holdings with Gemini vision
- Ask for a full portfolio review, concentration analysis, rebalancing suggestions, signal explanations, or bounce trade ideas

**Quick prompts built in:**
- Give me a complete portfolio review
- What's my biggest concentration risk?
- Which positions should I trim or exit?
- How am I positioned for a market downturn?
- Walk me through each signal and what it means
- Should I rebalance? What specifically?

---

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn
- Optional: [Ollama](https://ollama.com) for local AI advisor models
- Optional: a Gemini API key from Google AI Studio for free-tier Gemini testing

### Install and run

```bash
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

### AI Advisor setup

The advisor works with either the Gemini Developer API or a locally running Ollama instance.

For the free Gemini setup, add an API key to `.env.local`:

```bash
GEMINI_API_KEY=your_google_ai_studio_key

# Optional: override the default free-tier model list
GEMINI_MODELS=gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.0-flash-lite,gemini-2.0-flash

# Optional: choose the model used for screenshot imports
GEMINI_VISION_MODEL=gemini-2.5-flash-lite
```

By default, the model selector puts `gemini-2.5-flash-lite` first for local/free testing.

For local Ollama:

```bash
# Start the Ollama server
ollama serve

# Pull a model (choose one)
ollama pull llama3.2
ollama pull mistral
ollama pull gemma3
```

Once configured, the advisor page detects available Gemini and Ollama models automatically and populates the model selector. If neither Gemini nor Ollama is available, the dashboard still works fully — only the `/advisor` page is affected.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Components | Radix UI primitives |
| Icons | Lucide React |
| LLM | Gemini Developer API free tier + Ollama (local, any model) |
| Fonts | Geist Sans + Geist Mono |

---

## Project Structure

```
app/
  page.tsx              # Live dashboard
  advisor/
    page.tsx            # AI chat advisor
  api/
    llm/chat/           # Streaming Gemini/Ollama proxy
    llm/models/         # Model list endpoint
    portfolio/          # Benchmark, risk, Monte Carlo, rebalance, tax endpoints
    signals/            # Signals API
    stocks/             # Stock data endpoints

contexts/
  PriceContext.tsx      # Live price state, simulator lifecycle
  PortfolioContext.tsx  # Portfolio state, order execution, open-order checking

lib/
  price-simulator.ts    # Gaussian random walk with sector correlation
  order-engine.ts       # Market / limit / stop-loss / trailing-stop logic
  recommendations.ts    # RSI, SMA, signal computation
  stocks.ts             # Static stock metadata and starting portfolio
  ollama.ts             # Streaming chat and model list client

data/stocks/            # 365-day historical closes for all 20 symbols
types/                  # Shared TypeScript interfaces
```

---

## Starting Portfolio

The app initialises with a pre-built portfolio so there is something to analyse immediately:

| Ticker | Shares | Avg Cost |
|--------|--------|----------|
| AAPL   | 15     | $185.50  |
| MSFT   | 8      | $390.00  |
| NVDA   | 5      | $650.00  |
| JPM    | 20     | $195.00  |
| AMZN   | 3      | $182.00  |
| TSLA   | 10     | $260.00  |
| SPY    | 4      | $500.00  |

Plus $4,250 cash. All prices, P&L, and signals update in real time from the simulator.
