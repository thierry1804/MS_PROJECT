import { getAiConfig, type ResolvedAiConfig } from "./ai-config.js";

export type RiskAssistMode = "suggest" | "refine" | "followup";

export interface RiskSuggestionWire {
  id: string;
  label: string;
  category: string;
  probability: number;
  impact: number;
  rationale: string;
  mitigation: string;
  actions: string[];
  triggers: string[];
  confidence: number;
  strategy: string;
  owner?: string;
  residualProbability?: number;
  residualImpact?: number;
  source: "heuristic" | "llm" | "manual";
}

export interface FollowUpQuestionWire {
  id: string;
  text: string;
  type: "boolean" | "scale" | "text";
  dimension: "probability" | "impact" | "general";
  categoryHint?: string;
  suggestionId?: string;
}

export interface ProjectContextWire {
  projectId: string;
  code: string;
  name: string;
  description: string;
  manager: string;
  status: string;
  health: string;
  budget: number;
  projectStart?: string;
  hasBaseline?: boolean;
  percentComplete?: number;
  cpi: number;
  spi: number;
  bac?: number;
  ac?: number;
  eac?: number;
  lateTasks: { name: string; delayDays: number }[];
  overdueActions?: { label: string; dueDate: string }[];
  openIssues: { label: string; severity: number }[];
  openRisks: { label: string; category?: string }[];
  overallocatedResources: string[];
  unassignedCriticalTasks?: { name: string }[];
}

export interface RiskAssistRequestBody {
  projectId: string;
  userHint?: string;
  context: ProjectContextWire;
  heuristicSuggestions: RiskSuggestionWire[];
  mode: RiskAssistMode;
  answers?: Record<string, unknown>;
}

export interface RiskAssistResult {
  suggestions: RiskSuggestionWire[];
  followUpQuestions: FollowUpQuestionWire[];
  source: "heuristic" | "llm" | "mixed";
}

const VALID_CATEGORIES = new Set([
  "Planning",
  "Budget",
  "Ressources",
  "Technique",
  "Fournisseur",
  "Conformité",
  "Sécurité",
  "Organisation",
  "Qualité",
  "Externe",
]);

const VALID_STRATEGIES = new Set(["éviter", "réduire", "transférer", "accepter"]);

function clampScore(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n)));
}

function buildSystemPrompt(hasUserHint: boolean): string {
  const base = `Tu es un assistant PMO expert en gestion des risques projet (méthode RAID).
Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaire.
Langue : français.
Échelle probabilité et impact : 1 (faible) à 5 (élevé).
Catégories autorisées : Planning, Budget, Ressources, Technique, Fournisseur, Conformité, Sécurité, Organisation, Qualité, Externe.
Stratégies : éviter, réduire, transférer, accepter.
Ne duplique pas les risques déjà ouverts listés dans le contexte.`;

  if (hasUserHint) {
    return `${base}

MODE DÉCOUVERTE APPROFONDIE — l'utilisateur a exprimé une INQUIÉTUDE précise.
Décompose cette inquiétude en risques RAID exploitables selon cette méthode :
1. Risque direct — reformule clairement ce que décrit l'utilisateur
2. Risques causes — facteurs amont qui déclenchent ou aggravent la situation
3. Risques conséquences — effets en cascade (planning, budget, qualité, ressources, conformité)
4. Risques corrélés — interactions avec le contexte projet (CPI, SPI, retards, issues, charge)

À partir d'une seule phrase d'inquiétude, propose 4 à 8 risques DISTINCTS (pas de reformulations).
Pour chaque risque :
- rationale : cite explicitement le lien avec l'inquiétude ET un élément du contexte projet
- mitigation : plan concret et actionnable
- actions : 2 à 4 actions datables
- triggers : 1 à 3 indicateurs de surveillance
- confidence : 0,45–0,65 pour risques inférés, 0,70+ si le contexte confirme

Enrichis les suggestions heuristiques fournies (ne les supprime pas) et ajoute des risques complémentaires pertinents.
Génère 3 à 5 followUpQuestions pour affiner probability/impact, chacune liée à une suggestion (suggestionId).`;
  }

  return `${base}
Enrichis les suggestions heuristiques fournies : complète rationale, mitigation, actions, triggers.
Propose 0 à 3 risques supplémentaires pertinents si le contexte le justifie.
Génère des followUpQuestions uniquement si confidence < 0.75 sur une suggestion.`;
}

function buildUserPrompt(body: RiskAssistRequestBody): string {
  const ctx = body.context;
  const hasUserHint = Boolean(body.userHint?.trim());
  return JSON.stringify(
    {
      mode: body.mode,
      discoveryMode: hasUserHint ? "deep" : "standard",
      userHint: body.userHint ?? null,
      analysisInstructions: hasUserHint
        ? {
            goal: "Explorer en profondeur l'inquiétude utilisateur et identifier tous les risques RAID corrélés",
            minSuggestions: 4,
            maxSuggestions: 8,
            minFollowUpQuestions: 3,
          }
        : null,
      project: {
        code: ctx.code,
        name: ctx.name,
        description: ctx.description,
        manager: ctx.manager,
        status: ctx.status,
        health: ctx.health,
        budget: ctx.budget,
        projectStart: ctx.projectStart,
        hasBaseline: ctx.hasBaseline,
        percentComplete: ctx.percentComplete,
        cpi: ctx.cpi,
        spi: ctx.spi,
        bac: ctx.bac,
        ac: ctx.ac,
        eac: ctx.eac,
        lateTasks: ctx.lateTasks,
        overdueActions: ctx.overdueActions ?? [],
        openIssues: ctx.openIssues,
        openRisks: ctx.openRisks,
        overallocatedResources: ctx.overallocatedResources,
        unassignedCriticalTasks: ctx.unassignedCriticalTasks ?? [],
      },
      heuristicSuggestions: body.heuristicSuggestions,
      answers: body.answers ?? null,
      expectedShape: {
        suggestions: [
          {
            id: "string",
            label: "string",
            category: "Planning|Budget|...",
            probability: 1,
            impact: 1,
            rationale: "string",
            mitigation: "string",
            actions: ["string"],
            triggers: ["string"],
            confidence: 0.8,
            strategy: "réduire",
            owner: "string optional",
            residualProbability: 2,
            residualImpact: 2,
            source: "llm",
          },
        ],
        followUpQuestions: [
          {
            id: "string",
            text: "string",
            type: "boolean|scale|text",
            dimension: "probability|impact|general",
            suggestionId: "string optional",
          },
        ],
      },
    },
    null,
    2,
  );
}

function parseSuggestion(raw: unknown, fallbackId: string): RiskSuggestionWire | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label.trim() : "";
  if (!label) return null;

  const category = typeof o.category === "string" && VALID_CATEGORIES.has(o.category) ? o.category : "Externe";
  const strategy =
    typeof o.strategy === "string" && VALID_STRATEGIES.has(o.strategy) ? o.strategy : "réduire";

  return {
    id: typeof o.id === "string" ? o.id : fallbackId,
    label,
    category,
    probability: clampScore(Number(o.probability) || 3),
    impact: clampScore(Number(o.impact) || 3),
    rationale: typeof o.rationale === "string" ? o.rationale : "",
    mitigation: typeof o.mitigation === "string" ? o.mitigation : "",
    actions: Array.isArray(o.actions) ? o.actions.filter((a): a is string => typeof a === "string") : [],
    triggers: Array.isArray(o.triggers) ? o.triggers.filter((t): t is string => typeof t === "string") : [],
    confidence: Math.min(1, Math.max(0, Number(o.confidence) || 0.7)),
    strategy,
    owner: typeof o.owner === "string" ? o.owner : undefined,
    residualProbability: o.residualProbability != null ? clampScore(Number(o.residualProbability)) : undefined,
    residualImpact: o.residualImpact != null ? clampScore(Number(o.residualImpact)) : undefined,
    source: "llm",
  };
}

function parseFollowUp(raw: unknown, idx: number): FollowUpQuestionWire | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text.trim() : "";
  if (!text) return null;
  const type = o.type === "boolean" || o.type === "scale" || o.type === "text" ? o.type : "text";
  const dimension =
    o.dimension === "probability" || o.dimension === "impact" || o.dimension === "general"
      ? o.dimension
      : "general";
  return {
    id: typeof o.id === "string" ? o.id : `llm-q-${idx}`,
    text,
    type,
    dimension,
    categoryHint: typeof o.categoryHint === "string" ? o.categoryHint : undefined,
    suggestionId: typeof o.suggestionId === "string" ? o.suggestionId : undefined,
  };
}

function parseLlmResponse(content: string): { suggestions: RiskSuggestionWire[]; followUpQuestions: FollowUpQuestionWire[] } {
  const trimmed = content.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    return { suggestions: [], followUpQuestions: [] };
  }
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
    const rawSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const rawQuestions = Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions : [];
    return {
      suggestions: rawSuggestions
        .map((s, i) => parseSuggestion(s, `llm-sug-${i}`))
        .filter((s): s is RiskSuggestionWire => s !== null),
      followUpQuestions: rawQuestions
        .map((q, i) => parseFollowUp(q, i))
        .filter((q): q is FollowUpQuestionWire => q !== null),
    };
  } catch {
    return { suggestions: [], followUpQuestions: [] };
  }
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

function mergeSuggestions(
  heuristics: RiskSuggestionWire[],
  llm: RiskSuggestionWire[],
): RiskSuggestionWire[] {
  const byLabel = new Map<string, RiskSuggestionWire>();
  for (const s of heuristics) {
    byLabel.set(normalizeLabel(s.label), { ...s, source: s.source ?? "heuristic" });
  }
  for (const s of llm) {
    const key = normalizeLabel(s.label);
    const existing = byLabel.get(key);
    if (existing) {
      byLabel.set(key, {
        ...existing,
        rationale: s.rationale || existing.rationale,
        mitigation: s.mitigation || existing.mitigation,
        actions: s.actions.length ? s.actions : existing.actions,
        triggers: s.triggers.length ? s.triggers : existing.triggers,
        confidence: Math.max(existing.confidence, s.confidence),
        source: "llm",
      });
    } else {
      byLabel.set(key, s);
    }
  }
  return [...byLabel.values()].sort((a, b) => b.probability * b.impact - a.probability * a.impact);
}

function heuristicFallback(body: RiskAssistRequestBody): RiskAssistResult {
  return {
    suggestions: body.heuristicSuggestions.map((s) => ({ ...s, source: s.source ?? "heuristic" })),
    followUpQuestions: [],
    source: "heuristic",
  };
}

function openRouterHeaders(cfg: ResolvedAiConfig): Record<string, string> {
  if (cfg.preset !== "openrouter") return {};
  return { "HTTP-Referer": "https://atelier-pmo.local", "X-Title": "Atelier PMO" };
}

function supportsReasoning(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m === "openrouter/free" ||
    m.endsWith(":free") ||
    m.includes("gpt-oss") ||
    m.includes("nemotron") ||
    m.includes("deepseek-r1") ||
    m.includes("hy3")
  );
}

function llmTimeoutMs(model: string, hasUserHint: boolean): number {
  const base = supportsReasoning(model) ? 90_000 : 30_000;
  return hasUserHint ? Math.max(base, 120_000) : base;
}

function buildChatPayload(cfg: ResolvedAiConfig, body: RiskAssistRequestBody): Record<string, unknown> {
  const hasUserHint = Boolean(body.userHint?.trim());
  const payload: Record<string, unknown> = {
    model: cfg.model,
    temperature: hasUserHint ? 0.4 : 0.3,
    max_tokens: hasUserHint ? 4096 : 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt(hasUserHint) },
      { role: "user", content: buildUserPrompt(body) },
    ],
  };
  if (supportsReasoning(cfg.model)) {
    payload.reasoning = { effort: hasUserHint ? "high" : "medium" };
  }
  return payload;
}

export async function runRiskAssist(body: RiskAssistRequestBody): Promise<RiskAssistResult> {
  const cfg = getAiConfig();
  if (!cfg.configured) return heuristicFallback(body);

  const hasUserHint = Boolean(body.userHint?.trim());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), llmTimeoutMs(cfg.model, hasUserHint));

  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        ...openRouterHeaders(cfg),
      },
      body: JSON.stringify(buildChatPayload(cfg, body)),
      signal: controller.signal,
    });

    if (!res.ok) {
      return heuristicFallback(body);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const { suggestions: llmSuggestions, followUpQuestions } = parseLlmResponse(content);
    const merged = mergeSuggestions(body.heuristicSuggestions, llmSuggestions);

    return {
      suggestions: merged,
      followUpQuestions,
      source: llmSuggestions.length > 0 ? "mixed" : "heuristic",
    };
  } catch {
    return heuristicFallback(body);
  } finally {
    clearTimeout(timeout);
  }
}

/** Test minimal de connectivité LLM. */
export async function testAiConnection(): Promise<{ ok: boolean; error?: string }> {
  const cfg = getAiConfig();
  if (!cfg.configured) return { ok: false, error: "Clé API non configurée." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), llmTimeoutMs(cfg.model, false));
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        ...openRouterHeaders(cfg),
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Réponds OK" }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur réseau" };
  } finally {
    clearTimeout(timeout);
  }
}
