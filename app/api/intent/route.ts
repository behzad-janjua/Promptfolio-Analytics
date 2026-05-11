import { NextRequest } from "next/server";
import { compileIntent, compileIntentWithOllama } from "@/lib/intent-compiler";

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, useOllama = false, model = "llama3.2" } = body as {
    text: string;
    useOllama?: boolean;
    model?: string;
  };

  if (!text || typeof text !== "string") {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  const result = useOllama
    ? await compileIntentWithOllama(text, model, OLLAMA_BASE)
    : compileIntent(text);

  return Response.json(result);
}
