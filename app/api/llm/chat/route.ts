import { NextRequest } from "next/server";

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { model, messages } = body as {
    model: string;
    messages: { role: string; content: string }[];
  };

  if (!model || !Array.isArray(messages)) {
    return new Response("Missing model or messages", { status: 400 });
  }

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

  // Transform Ollama's NDJSON stream into plain text chunks for the client.
  // Each line from Ollama is: {"message":{"role":"assistant","content":"..."},"done":false}
  const stream = new ReadableStream({
    async start(controller) {
      const reader = ollamaRes.body!.getReader();
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
            if (chunk) {
              controller.enqueue(new TextEncoder().encode(chunk));
            }
          } catch {
            // Skip malformed JSON lines
          }
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
