import { getAiConfig } from "./ai-config.js";

export interface CopilotChatRequestBody {
  message: string;
  session: { intent?: string; slots: Record<string, unknown>; phase: string };
  portfolioContext: unknown;
  memory?: { episodes: unknown[] };
  intentCatalog: { id: string; label: string; description: string; requiredSlots: string[] }[];
}

export interface CopilotChatResult {
  intent?: string;
  extractedSlots: Record<string, unknown>;
  suggestedQuestions: {
    id: string;
    text: string;
    type: "boolean" | "scale" | "text" | "choice" | "checklist";
    slotKey: string;
    choices?: { id: string; label: string }[];
    checklistItems?: string[];
  }[];
  assistantMessage: string;
  confidence: number;
}

function buildSystemPrompt(): string {
  return `Tu es l'assistant Copilot PMO d'Atelier.
Tu aides le PMO à exécuter des actions sur le portefeuille projets via langage naturel.
Réponds UNIQUEMENT en JSON valide, sans markdown.
Langue : français.

Tu reçois un catalogue d'intents avec leurs slots requis.
Tu dois :
1. Détecter l'intent le plus pertinent
2. Extraire les slots déjà présents dans le message
3. Proposer des questions de clarification (max 3) si des slots requis manquent
4. Rédiger un message assistantMessage naturel et concis

Ne invente jamais d'identifiants de projets — utilise ceux du contexte portfolio.
Utilise les codes WBS (ex. 1.2, 1.3) du contexte tasks pour identifier les tâches.
Ne remplis pas sponsor/titre/budget avec des valeurs inventées : laisse les slots vides si absents du message.
Si le message est une simple consultation, choisis un intent query*.`;
}

function buildUserPrompt(body: CopilotChatRequestBody): string {
  return JSON.stringify(
    {
      message: body.message,
      session: body.session,
      portfolioContext: body.portfolioContext,
      fewShotEpisodes: body.memory?.episodes?.slice(0, 3) ?? [],
      intentCatalog: body.intentCatalog,
      expectedShape: {
        intent: "string optional — id from catalog",
        extractedSlots: { key: "value" },
        suggestedQuestions: [
          {
            id: "q1",
            text: "string",
            type: "boolean|scale|text|choice|checklist",
            slotKey: "string",
            choices: [{ id: "string", label: "string" }],
          },
        ],
        assistantMessage: "string",
        confidence: 0.85,
      },
    },
    null,
    2,
  );
}

async function callLlm(system: string, user: string): Promise<string> {
  const cfg = getAiConfig();
  if (!cfg.configured) throw new Error("Clé IA non configurée.");

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "{}";
}

function parseResult(raw: string): CopilotChatResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      extractedSlots: {},
      suggestedQuestions: [],
      assistantMessage: "Je n'ai pas pu analyser votre demande. Pouvez-vous préciser ?",
      confidence: 0,
    };
  }

  const questions = Array.isArray(parsed.suggestedQuestions)
    ? (parsed.suggestedQuestions as Record<string, unknown>[]).map((q, i) => ({
        id: typeof q.id === "string" ? q.id : `q-${i}`,
        text: typeof q.text === "string" ? q.text : "Précisez votre demande",
        type: (typeof q.type === "string" ? q.type : "text") as CopilotChatResult["suggestedQuestions"][0]["type"],
        slotKey: typeof q.slotKey === "string" ? q.slotKey : "unknown",
        choices: Array.isArray(q.choices)
          ? (q.choices as { id: string; label: string }[])
          : undefined,
        checklistItems: Array.isArray(q.checklistItems) ? (q.checklistItems as string[]) : undefined,
      }))
    : [];

  return {
    intent: typeof parsed.intent === "string" ? parsed.intent : undefined,
    extractedSlots:
      parsed.extractedSlots && typeof parsed.extractedSlots === "object"
        ? (parsed.extractedSlots as Record<string, unknown>)
        : {},
    suggestedQuestions: questions,
    assistantMessage:
      typeof parsed.assistantMessage === "string"
        ? parsed.assistantMessage
        : "Comment puis-je vous aider sur le portefeuille ?",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
  };
}

export async function runCopilotChat(body: CopilotChatRequestBody): Promise<CopilotChatResult> {
  if (!getAiConfig().configured) {
    throw new Error("Clé IA non configurée. Renseignez-la dans Paramètres.");
  }
  const raw = await callLlm(buildSystemPrompt(), buildUserPrompt(body));
  return parseResult(raw);
}

export async function runCopilotChatHeuristic(body: CopilotChatRequestBody): Promise<CopilotChatResult> {
  const t = body.message.toLowerCase();
  let intent: string | undefined;
  if (/rouge|dérive|santé/.test(t)) intent = "queryPortfolioHealth";
  else if (/risque/.test(t) && /liste|ouverts?/.test(t)) intent = "queryOpenRisks";
  else if (/crée|créer|nouveau projet/.test(t)) intent = "createProject";
  else if (/risque/.test(t)) intent = "addRisk";

  return {
    intent,
    extractedSlots: {},
    suggestedQuestions: [],
    assistantMessage: intent
      ? `Je comprends que vous souhaitez : ${intent}. Précisez les détails si besoin.`
      : "Bonjour. Je peux vous aider sur le portefeuille, le RAID, le pipeline et le planning.",
    confidence: intent ? 0.6 : 0.3,
  };
}
