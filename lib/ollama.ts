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

  const reader = res.body.getReader();
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
