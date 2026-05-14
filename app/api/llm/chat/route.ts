import { NextRequest } from "next/server";

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface MsgPayload {
  role: string;
  content: string;
  images?: string[]; // base64 data-URLs — Gemini vision only
}

interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { model, messages } = body as { model: string; messages: MsgPayload[] };

  if (!model || !Array.isArray(messages)) {
    return new Response("Missing model or messages", { status: 400 });
  }

  if (model.startsWith("gemini/")) {
    return handleGemini(model.slice(7), messages);
  }

  return handleOllama(model, messages);
}

/* ── Gemini ─────────────────────────────────────────────────── */
async function handleGemini(geminiModel: string, messages: MsgPayload[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY is not configured." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs  = messages.filter((m) => m.role !== "system");

  if (chatMsgs.length === 0) {
    return new Response("No user message", { status: 400 });
  }

  const contents: GeminiContent[] = chatMsgs.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: buildGeminiParts(message),
  }));

  const payload = {
    ...(systemMsg?.content
      ? { system_instruction: { parts: [{ text: systemMsg.content }] } }
      : {}),
    contents,
  };

  let geminiRes: Response;
  try {
    geminiRes = await fetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(geminiModel)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Cannot reach Gemini. Check your internet connection." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!geminiRes.ok || !geminiRes.body) {
    const text = await geminiRes.text();
    return new Response(JSON.stringify({ error: parseGeminiError(text) }), {
      status: geminiRes.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader  = geminiRes.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      let eventLines: string[] = [];

      function flushEvent() {
        if (eventLines.length === 0) return;
        const data = eventLines.join("\n").trim();
        eventLines = [];
        if (!data || data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
          const text = parts.map((part: { text?: string }) => part.text ?? "").join("");
          if (text) controller.enqueue(encoder.encode(text));
        } catch {
          // Ignore malformed SSE events and keep the stream alive.
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line === "") {
            flushEvent();
          } else if (line.startsWith("data:")) {
            eventLines.push(line.slice(5).trimStart());
          }
        }
      }

      if (buffer.startsWith("data:")) {
        eventLines.push(buffer.slice(5).trimStart());
      }
      flushEvent();
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}

function buildGeminiParts(message: MsgPayload): GeminiPart[] {
  const parts: GeminiPart[] = [];
  for (const dataUrl of message.images ?? []) {
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) continue;
    const header   = dataUrl.slice(0, commaIdx);
    const data     = dataUrl.slice(commaIdx + 1);
    const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
    parts.push({ inline_data: { data, mime_type: mimeType } });
  }

  const text = message.content.trim();
  parts.push({
    text: text || "Please analyze the attached image in the context of my portfolio.",
  });

  return parts;
}

function parseGeminiError(body: string) {
  try {
    return JSON.parse(body)?.error?.message ?? body;
  } catch {
    return body || "Gemini request failed";
  }
}

/* ── Ollama ─────────────────────────────────────────────────── */
async function handleOllama(model: string, messages: MsgPayload[]) {
  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Cannot reach Ollama. Make sure `ollama serve` is running." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!ollamaRes.ok || !ollamaRes.body) {
    const text = await ollamaRes.text();
    return new Response(text, { status: ollamaRes.status });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader  = ollamaRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            const chunk: string = parsed?.message?.content ?? "";
            if (chunk) controller.enqueue(new TextEncoder().encode(chunk));
          } catch { /* skip malformed */ }
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
