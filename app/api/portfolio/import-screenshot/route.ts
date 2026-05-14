import { NextRequest } from "next/server";
import type { ExtractedHolding } from "@/types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? "gemini-2.5-flash-lite";

const EXTRACTION_PROMPT = `You are analyzing a screenshot of a brokerage or portfolio app.

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });
  }

  let imageDataUrl: string;
  try {
    const body = await req.json();
    imageDataUrl = body.image;
    if (!imageDataUrl) throw new Error("missing image");
  } catch {
    return Response.json({ error: "Provide { image: '<data-url>' }" }, { status: 400 });
  }

  const commaIdx = imageDataUrl.indexOf(",");
  if (commaIdx === -1) {
    return Response.json({ error: "Invalid data URL" }, { status: 400 });
  }
  const header   = imageDataUrl.slice(0, commaIdx);
  const data     = imageDataUrl.slice(commaIdx + 1);
  const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";

  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(GEMINI_VISION_MODEL)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inline_data: { data, mime_type: mimeType } },
                { text: EXTRACTION_PROMPT },
              ],
            },
          ],
        }),
      }
    );

    const body = await res.text();
    if (!res.ok) {
      return Response.json({ error: parseGeminiError(body) }, { status: res.status });
    }

    let raw = extractGeminiText(body).trim();
    // Strip markdown fences if model added them anyway
    raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");

    const holdings = normalizeHoldings(JSON.parse(raw));
    return Response.json({ holdings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Extraction failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

function extractGeminiText(body: string) {
  const parsed = JSON.parse(body);
  const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part: { text?: string }) => part.text ?? "").join("");
}

function normalizeHoldings(value: unknown): ExtractedHolding[] {
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

function parseGeminiError(body: string) {
  try {
    return JSON.parse(body)?.error?.message ?? body;
  } catch {
    return body || "Gemini request failed";
  }
}
