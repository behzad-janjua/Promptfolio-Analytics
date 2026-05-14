const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

const DEFAULT_GEMINI_MODELS = [
  "gemini/gemini-2.5-flash-lite",
  "gemini/gemini-2.5-flash",
  "gemini/gemini-2.0-flash-lite",
  "gemini/gemini-2.0-flash",
];

export async function GET() {
  const models: string[] = [];

  // Gemini Developer API models available on the free tier.
  if (process.env.GEMINI_API_KEY) {
    const configuredModels = process.env.GEMINI_MODELS
      ?.split(",")
      .map((model) => model.trim())
      .filter(Boolean)
      .map((model) => model.startsWith("gemini/") ? model : `gemini/${model}`);
    models.push(...(configuredModels?.length ? configuredModels : DEFAULT_GEMINI_MODELS));
  }

  // Ollama models — best-effort
  try {
    const res  = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      const ollamaModels: string[] = (data.models ?? []).map((m: { name: string }) => m.name);
      models.push(...ollamaModels);
    }
  } catch { /* Ollama not running — silently skip */ }

  return Response.json({ models });
}
