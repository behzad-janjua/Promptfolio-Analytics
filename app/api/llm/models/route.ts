const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

export async function GET() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) throw new Error("Ollama returned non-200");

    const data = await res.json();
    const models: string[] = (data.models ?? []).map(
      (m: { name: string }) => m.name
    );

    return Response.json({ models });
  } catch {
    return Response.json(
      { models: [], error: "Ollama not reachable" },
      { status: 503 }
    );
  }
}
