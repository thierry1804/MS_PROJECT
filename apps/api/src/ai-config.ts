import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRuntimeDatabaseConfig, writeRuntimeDatabaseConfig } from "./runtime-config.js";

const CONFIG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const CONFIG_PATH = path.join(CONFIG_DIR, "runtime-config.json");

export type AiPreset = "openrouter" | "openai" | "custom";

export interface RuntimeAiConfig {
  preset?: AiPreset;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface ResolvedAiConfig {
  configured: boolean;
  preset: AiPreset;
  apiKey: string;
  baseUrl: string;
  model: string;
  source: "file" | "env" | "none";
}

/** Modèles gratuits OpenRouter recommandés pour l'assistant RAID (JSON structuré + raisonnement). */
export const OPENROUTER_FREE_MODELS = [
  {
    id: "openai/gpt-oss-120b:free",
    label: "GPT-OSS 120B — raisonnement, JSON structuré (recommandé)",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super 120B — agentique, long contexte",
  },
  {
    id: "deepseek/deepseek-r1:free",
    label: "DeepSeek R1 — raisonnement profond",
  },
  {
    id: "openrouter/free",
    label: "Auto — sélection du meilleur modèle gratuit disponible",
  },
] as const;

const PRESET_DEFAULTS: Record<AiPreset, { baseUrl: string; model: string }> = {
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: OPENROUTER_FREE_MODELS[0].id,
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  custom: {
    baseUrl: "",
    model: "",
  },
};

function readFullRuntimeConfig(): Record<string, unknown> {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeFullRuntimeConfig(patch: Record<string, unknown>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const current = readFullRuntimeConfig();
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify({ ...current, ...patch }, null, 2)}\n`, "utf8");
}

export function readRuntimeAiConfig(): RuntimeAiConfig | null {
  const full = readFullRuntimeConfig();
  const ai = full.ai as RuntimeAiConfig | undefined;
  if (!ai) return null;
  return ai;
}

export function writeRuntimeAiConfig(config: RuntimeAiConfig): void {
  writeFullRuntimeConfig({ ai: config });
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function getAiConfig(): ResolvedAiConfig {
  const file = readRuntimeAiConfig();
  const preset = (file?.preset ?? (process.env.AI_PRESET as AiPreset | undefined) ?? "openrouter") as AiPreset;
  const defaults = PRESET_DEFAULTS[preset] ?? PRESET_DEFAULTS.openrouter;

  const apiKey = file?.apiKey ?? process.env.AI_API_KEY ?? "";
  const baseUrl = file?.baseUrl ?? process.env.AI_BASE_URL ?? defaults.baseUrl;
  const model = file?.model ?? process.env.AI_MODEL ?? defaults.model;

  const source: ResolvedAiConfig["source"] = file?.apiKey
    ? "file"
    : process.env.AI_API_KEY
      ? "env"
      : "none";

  return {
    configured: Boolean(apiKey.trim()),
    preset,
    apiKey: apiKey.trim(),
    baseUrl: baseUrl.trim(),
    model: model.trim(),
    source,
  };
}

export function getAiConfigStatus(): {
  configured: boolean;
  preset: AiPreset;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  source: "file" | "env" | "none";
} {
  const cfg = getAiConfig();
  return {
    configured: cfg.configured,
    preset: cfg.preset,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    apiKeyMasked: cfg.apiKey ? maskApiKey(cfg.apiKey) : "",
    source: cfg.source,
  };
}

/** Preserve DB config when writing AI config (shared runtime-config.json). */
export { readRuntimeDatabaseConfig, writeRuntimeDatabaseConfig };
