"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePrices } from "@/contexts/PriceContext";
import { usePortfolio } from "@/contexts/PortfolioContext";
import { getStock } from "@/lib/stocks";
import { computeSignal } from "@/lib/recommendations";
import { streamChat, listModels, importFromScreenshot } from "@/lib/ollama";
import { buildImportedHoldingsPrompt, type PortfolioImportResult } from "@/lib/portfolio-import-pipeline";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { OllamaMessage, PortfolioState, ExtractedHolding } from "@/types";

/* ── Types ───────────────────────────────────────────────────── */
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  streaming?: boolean;
}

interface AttachedImage {
  dataUrl: string;
  name: string;
}

/* ── Quick prompt chips ───────────────────────────────────────── */
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

/* ── System prompt builder ───────────────────────────────────── */
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

/* ── Helpers ─────────────────────────────────────────────────── */
function isGemini(model: string) {
  return model.startsWith("gemini/");
}

function modelLabel(model: string) {
  return model.startsWith("gemini/") ? model.slice(7) : model;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Streaming cursor ────────────────────────────────────────── */
function Cursor() {
  return (
    <span
      className="inline-block w-[2px] h-[1.1em] bg-violet-400 ml-0.5 align-middle rounded-sm"
      style={{ animation: "pulse-dot 1s ease-in-out infinite" }}
    />
  );
}

/* ── Typing dots ─────────────────────────────────────────────── */
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

/* ── Message bubble ──────────────────────────────────────────── */
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

      <div className={`relative max-w-[78%] flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
        {/* Attached images */}
        {msg.images && msg.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {msg.images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt="attached"
                className="max-h-40 max-w-[240px] rounded-xl border border-white/10 object-cover"
              />
            ))}
          </div>
        )}

        {(msg.content || msg.streaming) && (
          <div
            className={`px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
              isUser
                ? "bg-indigo-500/[0.13] border border-indigo-500/20 text-slate-200 rounded-2xl rounded-tr-sm"
                : "bg-[#0d1219] border border-white/[0.06] text-slate-300 rounded-2xl rounded-tl-sm"
            }`}
          >
            {msg.content}
            {msg.streaming && msg.content === "" && <TypingDots />}
            {msg.streaming && msg.content !== "" && <Cursor />}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Import screenshot modal ─────────────────────────────────── */
function ImportModal({
  holdings,
  onImport,
  onDismiss,
}: {
  holdings: ExtractedHolding[];
  onImport: (holdings: ExtractedHolding[]) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(holdings.map((_, i) => i))
  );

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm mx-4 bg-[#0d1219] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm text-slate-200">Import Holdings</p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {holdings.length} position{holdings.length !== 1 ? "s" : ""} found
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/[0.05] transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 max-h-64 overflow-y-auto space-y-1">
          {holdings.map((h, i) => (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                selected.has(i)
                  ? "bg-indigo-500/10 border border-indigo-500/20"
                  : "border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                  selected.has(i) ? "bg-indigo-500 border-indigo-500" : "border-white/20"
                }`}>
                  {selected.has(i) && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4l2 2L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="font-mono font-bold text-slate-300">{h.ticker}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 font-mono">{h.shares} shares</span>
                {h.avgCost != null && (
                  <span className="text-slate-600 font-mono ml-2">@ ${h.avgCost.toFixed(2)}</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-white/[0.06] flex gap-2">
          <button
            onClick={onDismiss}
            className="flex-1 py-2 rounded-lg border border-white/[0.08] text-slate-500 text-xs font-medium hover:text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onImport(holdings.filter((_, i) => selected.has(i)))}
            disabled={selected.size === 0}
            className="flex-1 py-2 rounded-lg bg-indigo-500/18 border border-indigo-500/28 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/26 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Import {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────── */
export default function AdvisorPage() {
  const { prices } = usePrices();
  const { portfolio, importHolding } = usePortfolio();

  const [messages,       setMessages]       = useState<Message[]>([]);
  const [input,          setInput]          = useState("");
  const [streaming,      setStreaming]       = useState(false);
  const [model,          setModel]          = useState("");
  const [models,         setModels]         = useState<string[]>([]);
  const [ollamaDown,     setOllamaDown]     = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [importLoading,  setImportLoading]  = useState(false);
  const [importDraft,    setImportDraft]    = useState<PortfolioImportResult | null>(null);

  const pricesRef    = useRef(prices);
  const portfolioRef = useRef(portfolio);
  const messagesRef  = useRef(messages);
  const modelRef     = useRef(model);
  const streamingRef = useRef(streaming);

  const abortRef     = useRef<AbortController | null>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pricesRef.current    = prices;
    portfolioRef.current = portfolio;
    messagesRef.current  = messages;
    modelRef.current     = model;
    streamingRef.current = streaming;
  }, [prices, portfolio, messages, model, streaming]);

  useEffect(() => {
    listModels().then((m) => {
      if (m.length > 0) {
        setModels(m);
        setModel(m[0]);
        setOllamaDown(false);
      } else {
        setOllamaDown(true);
      }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  /* ── Send message ─────────────────────────────────────────── */
  const send = useCallback(async (text: string, extraImages?: AttachedImage[]) => {
    const trimmed = text.trim();
    const imgs    = extraImages ?? [];
    if ((!trimmed && imgs.length === 0) || streamingRef.current || !modelRef.current) return;

    const userId      = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const imageUrls   = imgs.map((i) => i.dataUrl);

    setMessages((prev) => [
      ...prev,
      { id: userId,      role: "user",      content: trimmed, images: imageUrls.length ? imageUrls : undefined },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setAttachedImages([]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const systemPrompt = buildSystemPrompt(portfolioRef.current, pricesRef.current);

    const ollamaMessages: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
      ...messagesRef.current.map((m) => ({
        role: m.role,
        content: m.content,
        images: m.images,
      })),
      { role: "user", content: trimmed, images: imageUrls.length ? imageUrls : undefined },
    ];

    try {
      await streamChat(modelRef.current, ollamaMessages, (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        );
      }, controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) {
        const errText = err instanceof Error ? err.message : "Connection failed";
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
        prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m)
      );
      setStreaming(false);
    }
  }, []);

  /* ── Attach image to chat ─────────────────────────────────── */
  async function handleAttach(files: FileList | null) {
    if (!files) return;
    const newImages: AttachedImage[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await readFileAsDataUrl(file);
      newImages.push({ dataUrl, name: file.name });
    }
    setAttachedImages((prev) => [...prev, ...newImages]);
  }

  /* ── Import from screenshot ───────────────────────────────── */
  async function handleImportFile(files: FileList | null) {
    if (!files || !files[0]) return;
    setImportLoading(true);
    try {
      const dataUrl  = await readFileAsDataUrl(files[0]);
      const result = await importFromScreenshot(dataUrl);
      if (result.holdings.length === 0) {
        alert("No holdings found in screenshot. Try a clearer image.");
      } else {
        setImportDraft(result);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to process screenshot");
    } finally {
      setImportLoading(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  function confirmImport(holdings: ExtractedHolding[]) {
    for (const h of holdings) {
      importHolding(h.ticker, h.shares, h.avgCost ?? prices.get(h.ticker) ?? 0);
    }
    setImportDraft(null);

    send(buildImportedHoldingsPrompt(holdings));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input, attachedImages);
    }
  }

  /* ── Sidebar stats ─────────────────────────────────────────── */
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

  const useGemini = isGemini(model);
  const hasGemini = models.some(isGemini);
  const canSend   = (input.trim().length > 0 || attachedImages.length > 0) && !!model && !ollamaDown;

  return (
    <div className="min-h-screen flex flex-col bg-[#06090d]">

      {/* Import modal */}
      {importDraft && (
        <ImportModal
          holdings={importDraft.holdings}
          onImport={confirmImport}
          onDismiss={() => setImportDraft(null)}
        />
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleAttach(e.target.files)}
      />
      <input
        ref={importFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleImportFile(e.target.files)}
      />

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
            {useGemini && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                Gemini
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {ollamaDown && models.length === 0 ? (
            <span className="text-[11px] text-rose-400/80 font-mono">No AI available</span>
          ) : models.length === 0 ? (
            <span className="text-[11px] text-slate-700 font-mono">Loading…</span>
          ) : (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="bg-black/30 border border-white/[0.07] rounded-lg px-3 py-1.5 text-xs font-mono text-slate-400 outline-none focus:border-indigo-500/40 transition-colors duration-150 cursor-pointer"
            >
              {models.map((m) => (
                <option key={m} value={m} className="bg-[#0d1219]">
                  {modelLabel(m)}
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

          {/* Import from screenshot */}
          <div className="p-4 border-b border-white/[0.05]">
            <button
              onClick={() => importFileRef.current?.click()}
              disabled={importLoading || !hasGemini}
              title={!hasGemini ? "Add GEMINI_API_KEY to use screenshot import" : ""}
              className="btn-press w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold hover:bg-violet-500/18 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
            >
              {importLoading ? (
                <>
                  <span className="w-3 h-3 border border-violet-400/40 border-t-violet-400 rounded-full animate-spin" />
                  Scanning…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <rect x="1" y="3" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                    <circle cx="9" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4 3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  Import from Screenshot
                </>
              )}
            </button>
            {!hasGemini && (
              <p className="text-[10px] text-slate-700 text-center mt-1.5">
                Requires GEMINI_API_KEY
              </p>
            )}
          </div>

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
                      : (positive as boolean) ? "text-emerald-400" : "text-rose-400"
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
                  disabled={streaming || !model || (ollamaDown && !useGemini)}
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
                    Ask anything — or attach a screenshot of your brokerage to import &amp; discuss your real holdings.
                  </p>
                </div>

                {ollamaDown && !useGemini && models.length === 0 && (
                  <div className="px-5 py-4 bg-rose-500/8 border border-rose-500/20 rounded-xl text-sm max-w-sm text-center">
                    <p className="text-rose-400 font-semibold mb-1.5">No AI available</p>
                    <p className="text-rose-500/60 text-xs leading-relaxed">
                      Add <code className="font-mono bg-rose-500/10 px-1.5 py-0.5 rounded">GEMINI_API_KEY</code> to{" "}
                      <code className="font-mono bg-rose-500/10 px-1.5 py-0.5 rounded">.env.local</code>,
                      or run <code className="font-mono bg-rose-500/10 px-1.5 py-0.5 rounded">ollama serve</code>
                    </p>
                  </div>
                )}

                <div className="lg:hidden flex flex-wrap gap-2 justify-center max-w-md">
                  {QUICK_PROMPTS.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      disabled={streaming || !model}
                      className="btn-press text-[11px] text-slate-500 hover:text-slate-300 border border-white/[0.07] hover:border-white/[0.12] px-3 py-1.5 rounded-full transition-colors duration-150 disabled:opacity-35"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={msg.id} msg={msg} index={i} />
            ))}

            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ── */}
          <div className="shrink-0 border-t border-white/[0.05] bg-[#07090e]/70 px-4 md:px-8 py-4">

            {/* Image previews */}
            {attachedImages.length > 0 && (
              <div className="flex gap-2 mb-3 flex-wrap max-w-3xl mx-auto">
                {attachedImages.map((img, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      className="h-16 w-16 object-cover rounded-lg border border-white/10"
                    />
                    <button
                      onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                        <path d="M1 1l4 4M5 1L1 5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 items-end max-w-3xl mx-auto">
              {/* Image attach button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={streaming || !model || !useGemini}
                title={!useGemini ? "Select a Gemini model to attach images" : "Attach image"}
                className="btn-press shrink-0 w-[46px] h-[46px] rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/[0.07] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <rect x="1" y="3" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="10.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1 11l3.5-3.5a1 1 0 0 1 1.4 0L9 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8 10l1.5-1.5a1 1 0 0 1 1.4 0L13 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  !model
                    ? "Loading models…"
                    : useGemini
                    ? "Ask about your portfolio, or attach a screenshot…"
                    : "Ask about your portfolio…"
                }
                rows={1}
                disabled={streaming || !model}
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
                  onClick={() => send(input, attachedImages)}
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
              Enter to send · Shift+Enter for new line{useGemini ? " · Image attach enabled" : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
