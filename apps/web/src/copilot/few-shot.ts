import type { WireCopilotMemory, WireEpisode } from "./types";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

export function selectEpisodes(
  intent: string,
  message: string,
  episodes: WireEpisode[],
  limit = 3,
): WireEpisode[] {
  const msgTokens = tokenize(message);
  const scored = episodes
    .filter((e) => e.intent === intent && e.outcome === "executed")
    .map((e) => {
      const text = e.userMessages.join(" ");
      const score = overlapScore(msgTokens, tokenize(text));
      return { e, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.e);
}

export function episodesForPrompt(memory: WireCopilotMemory, intent: string, message: string): WireEpisode[] {
  return selectEpisodes(intent, message, memory.episodes, 3);
}
