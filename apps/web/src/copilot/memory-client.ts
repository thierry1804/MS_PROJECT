import { learnFromExecution } from "./preferences";
import { recordEpisode } from "./signals";
import type { WireCopilotMemory } from "./types";
import { EMPTY_MEMORY } from "./types";
import { fetchCopilotMemory, saveCopilotMemory } from "../sync";

let cached: WireCopilotMemory = { ...EMPTY_MEMORY };
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadCopilotMemory(): Promise<WireCopilotMemory> {
  try {
    const m = await fetchCopilotMemory();
    cached = m;
    return m;
  } catch {
    return cached;
  }
}

export function getCachedMemory(): WireCopilotMemory {
  return cached;
}

export function applyMemoryMutator(mutator: (m: WireCopilotMemory) => WireCopilotMemory): void {
  cached = mutator(cached);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveCopilotMemory(cached).then((saved) => {
      cached = saved;
    });
  }, 1500);
}

export function recordSuccessfulExecution(
  memory: WireCopilotMemory,
  intent: string,
  slots: Record<string, unknown>,
  session: import("./types").CopilotSession,
): WireCopilotMemory {
  let m = recordEpisode(memory, session, "executed");
  m = learnFromExecution(m, intent, slots);
  return m;
}
