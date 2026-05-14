import type { OllamaMessage } from "@/types";

export async function streamChat(
  model: string,
  messages: OllamaMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
    signal,
  });

  if (!res.ok || !res.body) {
    const err = await res.text();
    throw new Error(err || "Failed to connect to AI advisor");
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}

export async function listModels(): Promise<string[]> {
  const res = await fetch("/api/llm/models");
  if (!res.ok) return [];
  const data = await res.json();
  return data.models ?? [];
}

/** Extract holdings from a screenshot data-URL using Gemini vision. */
export async function importFromScreenshot(
  imageDataUrl: string
): Promise<{ ticker: string; shares: number; avgCost?: number }[]> {
  const res = await fetch("/api/portfolio/import-screenshot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Screenshot import failed");
  }
  const { holdings } = await res.json();
  return holdings;
}
