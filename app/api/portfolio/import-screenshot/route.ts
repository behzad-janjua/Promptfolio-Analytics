import { NextRequest } from "next/server";
import {
  buildImportResult,
  buildScreenshotExtractionRequest,
  extractGeminiText,
  parseGeminiError,
  parseHoldingsJson,
  parseImageDataUrl,
} from "@/lib/portfolio-import-pipeline";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? "gemini-2.5-flash-lite";

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

  let image;
  try {
    image = parseImageDataUrl(imageDataUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid data URL";
    return Response.json({ error: msg }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(GEMINI_VISION_MODEL)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(buildScreenshotExtractionRequest(image)),
      }
    );

    const body = await res.text();
    if (!res.ok) {
      return Response.json({ error: parseGeminiError(body) }, { status: res.status });
    }

    const rawText = extractGeminiText(body);
    const holdings = parseHoldingsJson(rawText);
    return Response.json(buildImportResult("screenshot", holdings, rawText));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Extraction failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
