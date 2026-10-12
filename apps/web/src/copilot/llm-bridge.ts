import { metricsOf, scheduleOf } from "../store";
import { fetchCopilotChat, type CopilotChatRequest, type CopilotChatResponseWire } from "../sync";
import { getIntentCatalog } from "./intents";
import { buildQuestionsForIntent } from "./question-policy";
import { applyPreferences } from "./preferences";
import { episodesForPrompt } from "./few-shot";
import type { CopilotChatResponse, CopilotSession, WireCopilotMemory } from "./types";
import type { Portfolio } from "../domain";

export function buildClientPortfolioContext(portfolio: Portfolio) {
  const projects = portfolio.projects.slice(0, 20).map((p) => {
    const m = metricsOf(p, portfolio);
    const schedule = scheduleOf(p, portfolio);
    let lateTaskCount = 0;
    for (const t of p.tasks) {
      const s = schedule.tasks.get(t.id);
      if (s && !s.isSummary && t.percentComplete < 100 && s.slack === 0) lateTaskCount++;
    }
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      health: p.health,
      status: p.status,
      manager: p.manager,
      spi: m.spi,
      cpi: m.cpi,
      lateTaskCount,
      tasks: p.tasks.slice(0, 40).map((t) => {
        const st = schedule.tasks.get(t.id);
        return {
          id: t.id,
          wbs: st?.wbs ?? "?",
          name: t.name,
          percentComplete: t.percentComplete,
        };
      }),
    };
  });

  const topRisks: { label: string; projectCode: string; score: number }[] = [];
  for (const p of portfolio.projects) {
    for (const r of p.risks) {
      if (r.status === "ouvert") {
        topRisks.push({ label: r.label, projectCode: p.code, score: r.probability * r.impact });
      }
    }
  }
  topRisks.sort((a, b) => b.score - a.score);

  const demands = portfolio.demands ?? [];
  const demandsByStage: Record<string, number> = {};
  for (const d of demands) demandsByStage[d.stage] = (demandsByStage[d.stage] ?? 0) + 1;

  return {
    projects,
    topRisks: topRisks.slice(0, 10),
    demandsByStage,
    demands: demands.slice(0, 15).map((d) => ({ id: d.id, title: d.title, stage: d.stage, sponsor: d.sponsor })),
    today: new Date().toISOString().slice(0, 10),
  };
}

export async function callCopilotChat(
  message: string,
  session: CopilotSession,
  portfolio: Portfolio,
  memory: WireCopilotMemory,
): Promise<CopilotChatResponse | null> {
  const intentHint = session.intent ?? "";
  const episodes = intentHint ? episodesForPrompt(memory, intentHint, message) : memory.episodes.slice(0, 3);

  const body: CopilotChatRequest = {
    message,
    session: { intent: session.intent, slots: session.slots, phase: session.phase },
    portfolioContext: buildClientPortfolioContext(portfolio),
    memory: { episodes },
    intentCatalog: getIntentCatalog(),
  };

  try {
    const raw = await fetchCopilotChat(body);
    return {
      intent: raw.intent as CopilotChatResponse["intent"],
      extractedSlots: raw.extractedSlots,
      suggestedQuestions: raw.suggestedQuestions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type as CopilotChatResponse["suggestedQuestions"][0]["type"],
        slotKey: q.slotKey,
        choices: q.choices,
      })),
      assistantMessage: raw.assistantMessage,
      confidence: raw.confidence,
    };
  } catch {
    return null;
  }
}

export function mergeLlmIntoSession(
  session: CopilotSession,
  response: CopilotChatResponse,
  portfolio: Portfolio,
  memory: WireCopilotMemory,
): CopilotSession {
  let next = session;
  if (response.intent && response.confidence >= 0.5) {
    next = { ...next, intent: response.intent };
  }
  const slots = applyPreferences(response.intent ?? next.intent ?? "", {
    ...next.slots,
    ...response.extractedSlots,
  }, memory);

  const intent = next.intent;
  const pendingFromPolicy = intent ? buildQuestionsForIntent(intent, slots, portfolio, memory) : [];
  const pendingQuestions =
    response.suggestedQuestions.length > 0 ? response.suggestedQuestions : pendingFromPolicy;

  return {
    ...next,
    slots,
    pendingQuestions,
  };
}
