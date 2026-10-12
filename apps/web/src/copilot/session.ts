import { buildPreview } from "./preview";
import { buildQuestionsForIntent } from "./question-policy";
import { getMissingSlots } from "./registry";
import type {
  ActionPreview,
  CopilotIntentId,
  CopilotMessage,
  CopilotSession,
  CopilotSessionPhase,
  WireCopilotMemory,
} from "./types";
import type { Portfolio } from "../domain";
import { uid } from "./uid";

export function createSession(): CopilotSession {
  return {
    id: uid("session"),
    phase: "gathering",
    slots: {},
    pendingQuestions: [],
    messages: [],
  };
}

export function appendMessage(
  session: CopilotSession,
  role: CopilotMessage["role"],
  content: string,
): CopilotSession {
  return {
    ...session,
    messages: [...session.messages, { role, content, at: new Date().toISOString() }],
  };
}

export function setIntent(
  session: CopilotSession,
  intent: CopilotIntentId,
  slotsPartial: Record<string, unknown> = {},
): CopilotSession {
  return {
    ...session,
    intent,
    slots: { ...session.slots, ...slotsPartial },
  };
}

export function applySlotValues(
  session: CopilotSession,
  values: Record<string, unknown>,
  portfolio: Portfolio,
  memory?: WireCopilotMemory,
): CopilotSession {
  const slots = { ...session.slots, ...values };
  const intent = session.intent;
  if (!intent) {
    return { ...session, slots, pendingQuestions: [] };
  }
  const pendingQuestions = buildQuestionsForIntent(intent, slots, portfolio, memory);
  const missing = getMissingSlots(intent, slots);
  const phase: CopilotSessionPhase =
    missing.length === 0 && pendingQuestions.length === 0 ? "preview" : "gathering";
  let preview: ActionPreview | undefined;
  if (phase === "preview") {
    preview = buildPreview(intent, slots, portfolio);
  }
  return { ...session, slots, pendingQuestions, phase, preview };
}

export function transitionToPreview(
  session: CopilotSession,
  portfolio: Portfolio,
): CopilotSession {
  if (!session.intent) return session;
  const missing = getMissingSlots(session.intent, session.slots);
  if (missing.length > 0) return session;
  return {
    ...session,
    phase: "preview",
    preview: buildPreview(session.intent, session.slots, portfolio),
    pendingQuestions: [],
  };
}

export function markExecuted(session: CopilotSession): CopilotSession {
  return { ...session, phase: "executed", pendingQuestions: [] };
}

export function markCancelled(session: CopilotSession): CopilotSession {
  return {
    ...createSession(),
    id: session.id,
    messages: appendMessage(session, "assistant", "Action annulée.").messages,
    phase: "cancelled",
  };
}

export function resetForNewTurn(session: CopilotSession): CopilotSession {
  return {
    ...session,
    phase: "gathering",
    intent: undefined,
    slots: {},
    pendingQuestions: [],
    preview: undefined,
  };
}
