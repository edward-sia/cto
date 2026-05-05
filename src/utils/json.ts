export function parseJsonObject<T = unknown>(text: string): T {
  const candidates = extractJsonObjectCandidates(text);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next balanced object. Some models preface valid JSON with examples.
    }
  }

  throw new SyntaxError("No valid JSON object found in LLM response");
}

function extractJsonObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  const starts = [...text.matchAll(/\{/g)].map((match) => match.index ?? -1).filter((index) => index >= 0);

  for (const start of starts) {
    const end = findObjectEnd(text, start);
    if (end !== -1) candidates.push(text.slice(start, end + 1));
  }

  return candidates;
}

function findObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth++;
    if (char === "}") depth--;

    if (depth === 0) return index;
  }

  return -1;
}
