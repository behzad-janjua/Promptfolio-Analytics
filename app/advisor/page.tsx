"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePrices } from "@/contexts/PriceContext";
import { usePortfolio } from "@/contexts/PortfolioContext";
import { getStock } from "@/lib/stocks";
import { computeSignal } from "@/lib/recommendations";
import { streamChat, listModels } from "@/lib/ollama";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { OllamaMessage, PortfolioState } from "@/types";

/* ── Types ───────────────────────────────────────────────── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

/* ── Quick prompt chips ──────────────────────────────────── */
const QUICK_PROMPTS = [
  "Give me a complete portfolio review",
  "What's my biggest concentration risk?",
  "Which positions should I trim or exit?",
  "How am I positioned for a market downturn?",
  "Walk me through each signal and what it means",
  "Should I rebalance? What specifically?",
  "Which position has the best risk/reward right now?",
  "Where is my sector exposure heaviest?",
];

/* ── System prompt builder ───────────────────────────────── */
function buildSystemPrompt(
  portfolio: PortfolioState,
  prices: Map<string, number>
): string {
  const positionLines = portfolio.positions.map((pos) => {
    const stock     = getStock(pos.ticker);
    const price     = prices.get(pos.ticker) ?? pos.avgCost;
    const value     = pos.shares * price;
    const pnl       = (price - pos.avgCost) * pos.shares;
    const pnlPct    = ((price - pos.avgCost) / pos.avgCost) * 100;
    const lastClose = stock?.history.at(-1)?.close ?? price;
    const dayPct    = ((price - lastClose) / lastClose) * 100;
    const signal    = stock ? computeSignal(stock, price) : null;

    return [
      `  ${pos.ticker} (${stock?.name ?? pos.ticker}) [${stock?.sector ?? "Unknown"}]`,
      `    ${pos.shares} shares @ $${price.toFixed(2)} live | avg cost $${pos.avgCost.toFixed(2)}`,
      `    Market value: ${formatCurrency(value)}`,
      `    Unrealized P&L: ${pnl >= 0 ? "+" : ""}${formatCurrency(pnl)} (${formatPercent(pnlPct)})`,
      `    Today: ${formatPercent(dayPct)}`,
      signal ? `    Signal: ${signal.strength} — ${signal.rationale}` : "",
      signal?.rsi !== undefined
        ? `    RSI: ${signal.rsi.toFixed(1)}${signal.sma50 ? ` | SMA-50: $${signal.sma50.toFixed(2)}` : ""}${signal.sma200 ? ` | SMA-200: $${signal.sma200.toFixed(2)}` : ""}`
        : "",
      stock ? `    52w range: $${stock.week52Low.toFixed(2)} – $${stock.week52High.toFixed(2)} | Beta: ${stock.beta} | P/E: ${stock.pe ?? "N/A"}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  const totalEquity = portfolio.positions.reduce(
    (s, p) => s + p.shares * (prices.get(p.ticker) ?? p.avgCost),
    0
  );
  const totalValue = totalEquity + portfolio.cash;
  const dayPnL = portfolio.positions.reduce((s, p) => {
    const price     = prices.get(p.ticker) ?? p.avgCost;
    const lastClose = getStock(p.ticker)?.history.at(-1)?.close ?? price;
    return s + p.shares * (price - lastClose);
  }, 0);
  const totalPnL = portfolio.positions.reduce(
    (s, p) => s + p.shares * ((prices.get(p.ticker) ?? p.avgCost) - p.avgCost),
    0
  );

  /* Sector breakdown */
  const sectorMap = new Map<string, number>();
  for (const pos of portfolio.positions) {
    const sector = getStock(pos.ticker)?.sector ?? "Unknown";
    const val    = pos.shares * (prices.get(pos.ticker) ?? pos.avgCost);
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + val);
  }
  const sectorLines = [...sectorMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(
      ([sec, val]) =>
        `  ${sec}: ${formatCurrency(val)} (${((val / totalEquity) * 100).toFixed(1)}%)`
    )
    .join("\n");

  const recentTrades = portfolio.tradeHistory
    .slice(0, 5)
    .map(
      (t) =>
        `  ${t.side.toUpperCase()} ${t.shares} ${t.ticker}` +
        (t.executionPrice ? ` @ $${t.executionPrice.toFixed(2)}` : "") +
        ` — ${t.status}` +
        (t.realizedPnl !== undefined
          ? ` (P&L: ${t.realizedPnl >= 0 ? "+" : ""}${formatCurrency(t.realizedPnl)})`
          : "")
    )
    .join("\n");

  return `You are a sharp, direct portfolio advisor. Today is ${new Date().toLocaleDateString("en-US", { dateStyle: "full" })}.

The user is viewing a simulated portfolio with live-streaming prices. You have access to the current state below. Be specific — always cite exact tickers, dollar amounts, and percentages. Give actionable advice, not generic commentary.

══ PORTFOLIO SUMMARY ══
Total Value:        ${formatCurrency(totalValue)}
Equity:             ${formatCurrency(totalEquity)}
Cash:               ${formatCurrency(portfolio.cash)} (${(((portfolio.cash) / totalValue) * 100).toFixed(1)}% of portfolio)
Day P&L:            ${dayPnL >= 0 ? "+" : ""}${formatCurrency(dayPnL)}
Total Unrealized:   ${totalPnL >= 0 ? "+" : ""}${formatCurrency(totalPnL)}
Open Orders:        ${portfolio.openOrders.length}

══ HOLDINGS ══
${positionLines.join("\n\n")}

══ SECTOR EXPOSURE ══
${sectorLines || "  No positions"}

${recentTrades ? `══ RECENT TRADES ══\n${recentTrades}` : ""}

Format your responses clearly. Use headers and bullets when giving a full review. Be direct and willing to say what should be sold, trimmed, or avoided.`;
}

/* ── Streaming cursor ────────────────────────────────────── */
function Cursor() {
  return (
    <span
      className="inline-block w-[2px] h-[1.1em] bg-violet-400 ml-0.5 align-middle rounded-sm"
      style={{ animation: "pulse-dot 1s ease-in-out infinite" }}
    />
  );
}

/* ── Typing dots (while waiting for first token) ─────────── */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-1.5 h-1.5 rounded-full bg-violet-400/60"
          style={{ animation: `pulse-dot 1.2s ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </span>
  );
}

/* ── Message bubble ──────────────────────────────────────── */
function MessageBubble({ msg, index }: { msg: Message; index: number }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={`animate-fade-up flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
      style={{ animationDelay: `${Math.min(index * 30, 120)}ms` }}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0 mt-0.5">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="2" fill="#a78bfa" />
            <path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11" stroke="#a78bfa" strokeWidth="1" strokeLinecap="round" />
          </svg>
        </div>
      )}

      <div
        className={`relative max-w-[78%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-indigo-500/[0.13] border border-indigo-500/20 text-slate-200 rounded-2xl rounded-tr-sm"
            : "bg-[#0d1219] border border-white/[0.06] text-slate-300 rounded-2xl rounded-tl-sm"
        }`}
      >
        {msg.content}
        {msg.streaming && msg.content === "" && <TypingDots />}
        {msg.streaming && msg.content !== "" && <Cursor />}
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────── */
export default function AdvisorPage() {
  const { prices } = usePrices();
  const { portfolio } = usePortfolio();

  const [messages,     setMessages]     = useState<Message[]>([]);
  const [input,        setInput]        = useState("");
  const [streaming,    setStreaming]     = useState(false);
  const [model,        setModel]        = useState("");
  const [models,       setModels]       = useState<string[]>([]);
  const [ollamaDown,   setOllamaDown]   = useState(false);

  /* Stable refs — avoids stale closures in callbacks */
  const pricesRef    = useRef(prices);
  const portfolioRef = useRef(portfolio);
  const messagesRef  = useRef(messages);
  const modelRef     = useRef(model);
  const streamingRef = useRef(streaming);
  pricesRef.current    = prices;
  portfolioRef.current = portfolio;
  messagesRef.current  = messages;
  modelRef.current     = model;
  streamingRef.current = streaming;

  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  /* Load available Ollama models once */
  useEffect(() => {
    listModels().then((m) => {
      if (m.length > 0) {
        setModels(m);
        setModel(m[0]);
      } else {
        setOllamaDown(true);
      }
    });
  }, []);

  /* Scroll to bottom whenever messages change */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* Auto-resize textarea */
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  /* Core send function — stable, reads from refs */
  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streamingRef.current || !modelRef.current) return;

    const userId      = crypto.randomUUID();
    const assistantId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      { id: userId,      role: "user",      content: trimmed },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    /* Build fresh context at send time */
    const systemPrompt = buildSystemPrompt(portfolioRef.current, pricesRef.current);

    const ollamaMessages: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
      ...messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: trimmed },
    ];

    try {
      await streamChat(
        modelRef.current,
        ollamaMessages,
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m
            )
          );
        },
        controller.signal
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        const errText =
          err instanceof Error ? err.message : "Connection failed";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `⚠ ${errText}`, streaming: false }
              : m
          )
        );
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m
        )
      );
      setStreaming(false);
    }
  }, []); // stable — all mutable state via refs

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  /* Sidebar quick stats */
  const totalEquity = portfolio.positions.reduce(
    (s, p) => s + p.shares * (prices.get(p.ticker) ?? p.avgCost),
    0
  );
  const totalValue = totalEquity + portfolio.cash;
  const dayPnL = portfolio.positions.reduce((s, p) => {
    const price     = prices.get(p.ticker) ?? p.avgCost;
    const lastClose = getStock(p.ticker)?.history.at(-1)?.close ?? price;
    return s + p.shares * (price - lastClose);
  }, 0);

  const canSend = input.trim().length > 0 && !!modelRef.current && !ollamaDown;

  return (
    <div className="min-h-screen flex flex-col bg-[#06090d]">

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-5 py-3 border-b border-white/[0.06] shrink-0"
        style={{ background: "rgba(6,9,13,0.92)", backdropFilter: "blur(16px)" }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="btn-press flex items-center gap-1.5 text-slate-600 hover:text-slate-300 transition-colors duration-150 text-sm"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </Link>
          <span className="text-slate-800">/</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <circle cx="5.5" cy="5.5" r="2" fill="#a78bfa" />
                <path d="M5.5 1v1.5M5.5 8.5V10M1 5.5h1.5M8.5 5.5H10" stroke="#a78bfa" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-semibold text-sm text-slate-200">AI Advisor</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {ollamaDown ? (
            <span className="text-[11px] text-rose-400/80 font-mono">
              Ollama offline
            </span>
          ) : models.length === 0 ? (
            <span className="text-[11px] text-slate-700 font-mono">
              Loading…
            </span>
          ) : (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="bg-black/30 border border-white/[0.07] rounded-lg px-3 py-1.5 text-xs font-mono text-slate-400 outline-none focus:border-indigo-500/40 transition-colors duration-150 cursor-pointer"
            >
              {models.map((m) => (
                <option key={m} value={m} className="bg-[#0d1219]">
                  {m}
                </option>
              ))}
            </select>
          )}

          {streaming && (
            <button
              onClick={() => abortRef.current?.abort()}
              className="btn-press flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/12 border border-rose-500/20 text-rose-400 text-xs font-medium"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <rect x="2" y="2" width="6" height="6" rx="1" />
              </svg>
              Stop
            </button>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden" style={{ height: "calc(100vh - 53px)" }}>

        {/* ── Sidebar ── */}
        <aside className="hidden lg:flex flex-col w-64 xl:w-72 border-r border-white/[0.05] bg-[#07090e] shrink-0 overflow-y-auto">

          {/* Portfolio snapshot */}
          <div className="p-4 border-b border-white/[0.05]">
            <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-widest mb-3">
              Portfolio
            </p>
            <div className="space-y-2.5">
              {[
                ["Total value",  formatCurrency(totalValue),      undefined],
                ["Equity",       formatCurrency(totalEquity),     undefined],
                ["Cash",         formatCurrency(portfolio.cash),  undefined],
                ["Day P&L",      (dayPnL >= 0 ? "+" : "") + formatCurrency(dayPnL), dayPnL >= 0],
              ].map(([label, value, positive]) => (
                <div key={label as string} className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-600">{label as string}</span>
                  <span className={`font-mono text-xs font-semibold ${
                    positive === undefined
                      ? "text-slate-300"
                      : (positive as boolean)
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}>
                    {value as string}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Holdings */}
          <div className="p-4 border-b border-white/[0.05]">
            <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-widest mb-3">
              Holdings
            </p>
            <div className="space-y-2">
              {portfolio.positions.map((pos) => {
                const price     = prices.get(pos.ticker) ?? pos.avgCost;
                const lastClose = getStock(pos.ticker)?.history.at(-1)?.close ?? price;
                const dayPct    = ((price - lastClose) / lastClose) * 100;
                return (
                  <div key={pos.ticker} className="flex items-center justify-between text-[11px]">
                    <span className="font-mono font-bold text-slate-500 w-12 shrink-0">
                      {pos.ticker}
                    </span>
                    <span className="font-mono text-slate-600">${price.toFixed(2)}</span>
                    <span className={`font-mono font-medium ${dayPct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      {dayPct >= 0 ? "+" : ""}{dayPct.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick prompts */}
          <div className="p-4 flex-1">
            <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-widest mb-3">
              Quick Prompts
            </p>
            <div className="space-y-1">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => send(prompt)}
                  disabled={streaming || ollamaDown || !model}
                  className="btn-press w-full text-left text-[11px] text-slate-600 hover:text-slate-300 px-2.5 py-2 rounded-lg hover:bg-white/[0.03] transition-colors duration-150 border border-transparent hover:border-white/[0.05] disabled:opacity-35 disabled:cursor-not-allowed leading-snug"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Chat ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Message list */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-5">

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-5 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path
                      d="M14 4C9.6 4 6 7.6 6 12c0 2.8 1.4 5.3 3.5 6.8V21l3-1.5 1.5 1.5 1.5-1.5 3 1.5v-2.2C20.6 17.3 22 14.8 22 12c0-4.4-3.6-8-8-8z"
                      stroke="#a78bfa"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    <path d="M10 12h8M10 15h5" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>

                <div className="text-center">
                  <p className="text-slate-200 font-semibold text-lg">AI Portfolio Advisor</p>
                  <p className="text-slate-600 text-sm mt-1.5 max-w-sm leading-relaxed">
                    Ask anything — a full review, concentration risks, which signals look interesting, or bounce a trade idea.
                  </p>
                </div>

                {ollamaDown && (
                  <div className="px-5 py-4 bg-rose-500/8 border border-rose-500/20 rounded-xl text-sm max-w-sm text-center">
                    <p className="text-rose-400 font-semibold mb-1.5">Ollama is not running</p>
                    <p className="text-rose-500/60 text-xs leading-relaxed">
                      Run <code className="font-mono bg-rose-500/10 px-1.5 py-0.5 rounded">ollama serve</code> in a terminal,
                      then pull a model with{" "}
                      <code className="font-mono bg-rose-500/10 px-1.5 py-0.5 rounded">ollama pull llama3.2</code>
                    </p>
                  </div>
                )}

                {/* Mobile quick prompts */}
                <div className="lg:hidden flex flex-wrap gap-2 justify-center max-w-md">
                  {QUICK_PROMPTS.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      disabled={streaming || ollamaDown || !model}
                      className="btn-press text-[11px] text-slate-500 hover:text-slate-300 border border-white/[0.07] hover:border-white/[0.12] px-3 py-1.5 rounded-full transition-colors duration-150 disabled:opacity-35"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <MessageBubble key={msg.id} msg={msg} index={i} />
            ))}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ── */}
          <div className="shrink-0 border-t border-white/[0.05] bg-[#07090e]/70 px-4 md:px-8 py-4">
            <div className="flex gap-3 items-end max-w-3xl mx-auto">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  ollamaDown
                    ? "Start Ollama to use the advisor…"
                    : !model
                    ? "Loading models…"
                    : "Ask about your portfolio…"
                }
                rows={1}
                disabled={streaming || ollamaDown || !model}
                className="flex-1 bg-[#0d1219] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-700 outline-none focus:border-indigo-500/40 transition-colors duration-150 resize-none leading-relaxed disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  fontFamily: "var(--font-geist-sans)",
                  minHeight: "46px",
                  maxHeight: "160px",
                }}
              />

              {streaming ? (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="btn-press shrink-0 w-[46px] h-[46px] rounded-xl bg-rose-500/12 border border-rose-500/20 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 transition-colors duration-150"
                  title="Stop generating"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <rect x="2" y="2" width="8" height="8" rx="1.5" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => send(input)}
                  disabled={!canSend}
                  className="btn-press shrink-0 w-[46px] h-[46px] rounded-xl bg-indigo-500/18 border border-indigo-500/28 flex items-center justify-center text-indigo-400 hover:bg-indigo-500/26 transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Send (Enter)"
                >
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <path d="M13 7.5L2 2.5l2.5 5L2 12.5l11-5z" fill="currentColor" />
                  </svg>
                </button>
              )}
            </div>

            <p className="text-center text-[11px] text-slate-800 mt-2 select-none">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
