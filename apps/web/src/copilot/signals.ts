import type { CopilotSession, WireCopilotMemory, WireEpisode } from "./types";
import { uid } from "./uid";

const MAX_EPISODES = 100;

export function recordCorrection(
  memory: WireCopilotMemory,
  phrase: string,
  entityId: string,
  entityType: "project" | "demand" | "task",
): WireCopilotMemory {
  const disambiguations = [...memory.disambiguations];
  const idx = disambiguations.findIndex(
    (d) => d.phrase.toLowerCase() === phrase.toLowerCase() && d.entityType === entityType,
  );
  if (idx >= 0) {
    disambiguations[idx] = { ...disambiguations[idx]!, count: disambiguations[idx]!.count + 1, entityId };
  } else {
    disambiguations.push({ phrase, entityId, entityType, count: 1 });
  }
  return { ...memory, disambiguations };
}

export function recordQuestionSkipped(
  memory: WireCopilotMemory,
  questionKey: string,
): WireCopilotMemory {
  const questionStats = { ...memory.questionStats };
  const prev = questionStats[questionKey] ?? { asked: 0, answered: 0, skipped: 0 };
  questionStats[questionKey] = { ...prev, asked: prev.asked + 1, skipped: prev.skipped + 1 };
  return { ...memory, questionStats };
}

export function recordQuestionAnswered(
  memory: WireCopilotMemory,
  questionKey: string,
): WireCopilotMemory {
  const questionStats = { ...memory.questionStats };
  const prev = questionStats[questionKey] ?? { asked: 0, answered: 0, skipped: 0 };
  questionStats[questionKey] = { ...prev, asked: prev.asked + 1, answered: prev.answered + 1 };
  return { ...memory, questionStats };
}

export function recordEpisode(
  memory: WireCopilotMemory,
  session: CopilotSession,
  outcome: WireEpisode["outcome"],
  corrections?: WireEpisode["corrections"],
): WireCopilotMemory {
  if (!session.intent) return memory;
  const episode: WireEpisode = {
    id: uid("ep"),
    intent: session.intent,
    userMessages: session.messages.filter((m) => m.role === "user").map((m) => m.content),
    finalSlots: session.slots,
    outcome,
    at: new Date().toISOString(),
    corrections,
  };
  const episodes = [episode, ...memory.episodes].slice(0, MAX_EPISODES);
  return { ...memory, episodes };
}

export function recordCancellation(memory: WireCopilotMemory, session: CopilotSession): WireCopilotMemory {
  return recordEpisode(memory, session, "cancelled");
}

export function emptyMemory(): WireCopilotMemory {
  return {
    preferences: {},
    disambiguations: [],
    episodes: [],
    questionStats: {},
    revision: 0,
  };
}
