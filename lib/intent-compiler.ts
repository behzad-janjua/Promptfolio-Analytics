export interface ParsedIntent {
  action: string;
  subject: string;
  condition: string;
  implicit: string;
  compiled: string;
}

// ── Filler words stripped from speech ────────────────────────────────────────

const FILLER_RE = new RegExp(
  `\\b(${[
    "uh", "um", "erm", "like", "basically", "kinda", "kind of", "sort of",
    "you know", "just", "actually", "literally", "obviously", "yeah", "so",
    "well", "right", "okay", "ok", "i mean", "i guess", "i think",
    "pretty much", "gonna", "wanna", "gotta",
  ].join("|")})\\b`,
  "gi"
);

// ── Action verb → canonical label ────────────────────────────────────────────

const ACTIONS: [RegExp, string][] = [
  [/\b(fix(?:es)?|repair|patch|debug|resolve)\b/i, "Fix"],
  [/\b(refactor|clean(?:\s+up)?|restructure|reorganize)\b/i, "Refactor"],
  [/\b(remove|delete|drop|get\s+rid\s+of|erase)\b/i, "Remove"],
  [/\b(rename)\b/i, "Rename"],
  [/\b(move|migrate)\b/i, "Move"],
  [/\b(test|spec|cover)\b/i, "Add tests for"],
  [/\b(add|implement|create|build|introduce)\b/i, "Add"],
  [/\b(update|change|modify|tweak|adjust)\b/i, "Update"],
  [/\b(write)\b/i, "Write"],
];

// ── Implicit constraints per action ──────────────────────────────────────────

const IMPLICIT: Record<string, string> = {
  Fix: "Add tests and keep existing behavior unchanged.",
  Refactor: "No behavior changes — structure only.",
  Remove: "Verify no remaining callers before deletion.",
  Rename: "Update all references.",
  Move: "Update all import paths.",
  "Add tests for": "Cover happy path and edge cases.",
  Add: "Keep the existing API surface intact.",
  Update: "Preserve backward compatibility.",
  Write: "",
};

// ── Trailing qualifier stripper ───────────────────────────────────────────────
// Remove commentary appended to the subject: "it's getting messy", "it's not used", etc.

const TRAILING_QUALIFIERS = /[,.]?\s+(?:it'?s?|since|because|as)\s+.+$/i;

// ── Subject normalization ─────────────────────────────────────────────────────

const SUBJECT_RULES: [RegExp, string][] = [
  // "the thing where recipe crashes/fails" → "recipe handler crash"
  [/\bthe\s+thing\s+(?:where|when|that)\s+(.+?)\s+(?:crash(?:es|ing|ed)?|fail(?:s|ed|ing)?)\b/i, "$1 handler crash"],
  // "the bug/issue/problem where X" → "X"
  [/\bthe\s+(?:bug|issue|problem|error)\s+(?:where|when|with)\s+(.+)/i, "$1"],
  // "where X crashes/fails/breaks" → "X crash"
  [/\bthe\s+thing\s+where\s+(.+?)\s+(?:crash(?:es)?|fail(?:s)?|break(?:s)?|throw(?:s)?)\b/i, "$1 crash"],
  [/\bwhere\s+(.+?)\s+(?:crash(?:es)?|fail(?:s)?|break(?:s)?|throw(?:s)?)\b/i, "$1 crash"],
  // "X doesn't/isn't working" → "X broken behavior"
  [/(.+?)\s+(?:doesn't|does not|isn't|is not)\s+work(?:ing)?\b/i, "$1 broken behavior"],
  // "X crashes/fails" → "X crash/failure"
  [/(.+?)\s+crash(?:es|ing)?\b/i, "$1 crash"],
  [/(.+?)\s+fail(?:s|ing)?\b/i, "$1 failure"],
];

// ── Condition normalization ───────────────────────────────────────────────────

const CONDITION_RULES: [RegExp, string][] = [
  // "when there's/there is no X" → "when X is missing"
  [/\bwhen\s+there(?:'s|\s+is)\s+no\s+(.+)/i, "when $1 is missing"],
  [/\bif\s+there(?:'s|\s+is)\s+no\s+(.+)/i, "when $1 is missing"],
  // "when X isn't/is not there/present/set/found" → "when X is missing"
  [/\bwhen\s+(.+?)\s+(?:isn't|is not|aren't|are not)\s+(?:there|present|set|found|defined)\b/i, "when $1 is missing"],
  // "if X is null/undefined/empty" → "when X is null/undefined/empty"
  [/\bif\s+(.+?)\s+(is|are)\s+(null|undefined|empty|blank)\b/i, "when $1 is $3"],
  // "when X is null/undefined/empty"
  [/\bwhen\s+(.+?)\s+(is|are)\s+(null|undefined|empty|blank)\b/i, "when $1 is $3"],
  // preserve "when/if/after/before/without/with X" clauses as-is
  [/\b(when|if|after|before|without|with)\s+(.+)/i, "$1 $2"],
];

// ── Sentence capitalizer ──────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Core deterministic parser ─────────────────────────────────────────────────

export function compileIntent(raw: string): ParsedIntent {
  // 1. Strip fillers and normalize whitespace
  let text = raw.replace(FILLER_RE, " ").replace(/\s{2,}/g, " ").trim();

  // 2. Detect action
  let action = "Update";
  for (const [pattern, label] of ACTIONS) {
    if (pattern.test(text)) {
      action = label;
      // Remove the matched verb from the text so we parse the remainder
      text = text.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
      break;
    }
  }

  // 3. Split on condition boundary
  const conditionBoundary = /\b(when|if|after|before|without|with(?:out)?)\b/i;
  const boundaryMatch = conditionBoundary.exec(text);

  let subjectRaw = boundaryMatch ? text.slice(0, boundaryMatch.index).trim() : text;
  let conditionRaw = boundaryMatch ? text.slice(boundaryMatch.index).trim() : "";

  // 4. Normalize subject
  let subject = subjectRaw.replace(TRAILING_QUALIFIERS, "").trim();
  for (const [pattern, replacement] of SUBJECT_RULES) {
    const replaced = subject.replace(pattern, replacement);
    if (replaced !== subject) {
      subject = replaced;
      break;
    }
  }
  subject = subject.replace(/^(the\s+)+/i, "the ").trim();
  if (!subject) subject = "the affected code";

  // 5. Normalize condition
  let condition = conditionRaw;
  for (const [pattern, replacement] of CONDITION_RULES) {
    const replaced = condition.replace(pattern, replacement);
    if (replaced !== condition) {
      condition = replaced;
      break;
    }
  }

  // 6. Implicit constraint
  const implicit = IMPLICIT[action] ?? "";

  // 7. Assemble
  const body = condition ? `${subject} ${condition}` : subject;
  const sentence = `${action} ${body}.`;
  const compiled = implicit ? `${sentence} ${implicit}` : sentence;

  return {
    action,
    subject,
    condition,
    implicit,
    compiled: capitalize(compiled),
  };
}

// ── Ollama-powered refinement (optional, async) ───────────────────────────────

export async function compileIntentWithOllama(
  raw: string,
  model: string,
  ollamaBase = "http://localhost:11434"
): Promise<ParsedIntent> {
  const draft = compileIntent(raw);

  const prompt = `You are a developer intent compiler. Convert vague speech into a precise, one-sentence developer task.

Rules:
- Infer missing context (e.g. "no target" → "no saved target in the action")
- Use exact technical terms (handler, route, hook, context, etc.)
- Append one implicit constraint appropriate to the action type
- Output ONLY the final sentence — no explanation, no quotes

Draft (from template): ${draft.compiled}
Original speech: ${raw}

Refined task:`;

  const res = await fetch(`${ollamaBase}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!res.ok) return draft;

  const data = await res.json() as { response?: string };
  const refined = data.response?.trim();
  if (!refined) return draft;

  return { ...draft, compiled: refined };
}
