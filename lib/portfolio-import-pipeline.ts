import type { ExtractedHolding } from "@/types";

export type PortfolioImportSource = "screenshot" | "manual";

export interface ParsedImageDataUrl {
  data: string;
  mimeType: string;
}

export interface PortfolioImportResult {
  source: PortfolioImportSource;
  holdings: ExtractedHolding[];
  rawText?: string;
  importedAt: string;
}

export const SCREENSHOT_EXTRACTION_PROMPT = `You are analyzing a screenshot of a brokerage or portfolio app.

Extract every stock/ETF holding visible. Return ONLY a valid JSON array with no explanation or markdown fences.

Format:
[
  { "ticker": "AAPL", "shares": 10, "avgCost": 150.25 },
  ...
]

Rules:
- ticker: uppercase symbol (e.g. AAPL, MSFT, SPY). Skip if unclear.
- shares: number of shares as a float
- avgCost: average cost per share if visible; omit the field if not shown
- If no holdings are visible, return []`;

export function parseImageDataUrl(imageDataUrl: string): ParsedImageDataUrl {
  const commaIdx = imageDataUrl.indexOf(",");
  if (commaIdx === -1) {
    throw new Error("Invalid data URL");
  }

  const header = imageDataUrl.slice(0, commaIdx);
  const data = imageDataUrl.slice(commaIdx + 1);
  const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";

  if (!data) {
    throw new Error("Image data URL is empty");
  }

  return { data, mimeType };
}

export function buildScreenshotExtractionRequest(image: ParsedImageDataUrl) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { data: image.data, mime_type: image.mimeType } },
          { text: SCREENSHOT_EXTRACTION_PROMPT },
        ],
      },
    ],
  };
}

export function extractGeminiText(body: string): string {
  const parsed = JSON.parse(body);
  const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part: { text?: string }) => part.text ?? "").join("");
}

export function parseGeminiError(body: string): string {
  try {
    return JSON.parse(body)?.error?.message ?? body;
  } catch {
    return body || "Gemini request failed";
  }
}

export function stripJsonFences(raw: string): string {
  return raw.trim().replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");
}

export function normalizeExtractedHoldings(value: unknown): ExtractedHolding[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((holding) => {
    if (!holding || typeof holding !== "object") return [];

    const candidate = holding as Record<string, unknown>;
    const ticker = typeof candidate.ticker === "string"
      ? candidate.ticker.trim().toUpperCase()
      : "";
    const shares = Number(candidate.shares);
    const avgCost = candidate.avgCost == null ? undefined : Number(candidate.avgCost);
    const hasAvgCost = avgCost !== undefined && Number.isFinite(avgCost) && avgCost > 0;

    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker) || !Number.isFinite(shares) || shares <= 0) {
      return [];
    }

    return [{
      ticker,
      shares,
      ...(hasAvgCost ? { avgCost } : {}),
    }];
  });
}

export function parseHoldingsJson(raw: string): ExtractedHolding[] {
  return normalizeExtractedHoldings(JSON.parse(stripJsonFences(raw)));
}

export function buildImportResult(
  source: PortfolioImportSource,
  holdings: ExtractedHolding[],
  rawText?: string
): PortfolioImportResult {
  return {
    source,
    holdings,
    rawText,
    importedAt: new Date().toISOString(),
  };
}

export function buildImportedHoldingsPrompt(holdings: ExtractedHolding[]): string {
  const lines = holdings.map((holding) => {
    const cost = holding.avgCost == null ? "" : ` at about $${holding.avgCost.toFixed(2)} average cost`;
    return `${holding.ticker}: ${holding.shares} shares${cost}`;
  });

  return `I just imported these positions into the game portfolio:\n${lines.join("\n")}\n\nGive me a quick take on each one and call out the biggest concentration or risk issue.`;
}
