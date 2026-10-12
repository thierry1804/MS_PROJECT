import cors from "@fastify/cors";
import Fastify from "fastify";
import { prisma, reconnectPrisma, isDesktopMode, initDesktopDb } from "./db.js";
import { getPortfolio, replacePortfolio } from "./portfolio.js";
import {
  getDatabaseConfigStatus,
  writeRuntimeDatabaseConfig,
} from "./runtime-config.js";
import {
  afterLocalSave,
  configureCloud,
  dismissConflict,
  getSyncStatus,
  startPeriodicSync,
  syncNow,
} from "./sync-engine.js";
import type { WirePortfolio } from "./types.js";
import { getAiConfigStatus, readRuntimeAiConfig, writeRuntimeAiConfig, type AiPreset } from "./ai-config.js";
import { runRiskAssist, testAiConnection, type RiskAssistRequestBody } from "./risk-assist.js";
import {
  CopilotMemoryConflictError,
  getCopilotMemory,
  replaceCopilotMemory,
  resetCopilotMemory,
} from "./copilot-memory.js";
import { runCopilotChat, runCopilotChatHeuristic, type CopilotChatRequestBody } from "./copilot.js";

function isDatabaseUnreachable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  return (
    e.name === "PrismaClientInitializationError" ||
    Boolean(e.message?.includes("Can't reach database server")) ||
    Boolean(e.message?.includes("Connection timed out"))
  );
}

const DB_UNAVAILABLE_MSG =
  "Base de données inaccessible. Vérifiez que le projet Neon est actif (console.neon.tech) et que l'URL pooler est correcte dans Paramètres.";

interface AuditPayload {
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  detail?: unknown;
  actor?: string;
}

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
    if (/^https?:\/\/[a-z0-9-]+\.localhost$/i.test(origin)) return cb(null, true);
    if (origin === "tauri://localhost") return cb(null, true);
    cb(null, false);
  },
});

if (isDesktopMode) {
  await initDesktopDb();
  startPeriodicSync();
  void syncNow();
}

app.setErrorHandler((err, _req, reply) => {
  if (isDatabaseUnreachable(err)) {
    app.log.error(err);
    return reply.code(503).send({ error: DB_UNAVAILABLE_MSG });
  }
  app.log.error(err);
  return reply.code(500).send({ error: "Erreur serveur interne." });
});

app.get("/api/health", async () => ({
  ok: true,
  desktop: isDesktopMode,
}));

app.get("/api/portfolio", async (_req, reply) => {
  const portfolio = await getPortfolio(prisma);
  if (!portfolio) return reply.code(404).send({ error: "Aucun portefeuille en base." });
  return portfolio;
});

app.put("/api/portfolio", async (req, reply) => {
  const payload = req.body as WirePortfolio;
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.projects)) {
    return reply.code(400).send({ error: "Corps de requête invalide." });
  }
  await replacePortfolio(prisma, payload);
  void afterLocalSave();
  return { ok: true };
});

app.get("/api/audit", async (req) => {
  const { limit } = req.query as { limit?: string };
  const take = Math.min(Number(limit) || 300, 1000);
  return prisma.auditEntry.findMany({ orderBy: { at: "desc" }, take });
});

app.post("/api/audit", async (req, reply) => {
  const body = req.body as Partial<AuditPayload>;
  if (!body?.entityType || !body?.entityId || !body?.action || !body?.summary) {
    return reply.code(400).send({ error: "Corps de requête invalide." });
  }
  const entry = await prisma.auditEntry.create({
    data: {
      entityType: body.entityType,
      entityId: body.entityId,
      action: body.action,
      summary: body.summary,
      detail: body.detail === undefined ? undefined : (body.detail as object),
      actor: body.actor || undefined,
    },
  });
  return entry;
});

app.delete("/api/audit", async () => {
  const { count } = await prisma.auditEntry.deleteMany();
  return { ok: true, count };
});

app.get("/api/config/database", async () => {
  if (isDesktopMode) {
    const status = await getSyncStatus();
    return {
      source: "desktop" as const,
      configured: Boolean(status.localDbPath),
      databaseUrlMasked: status.localDbPath ?? "",
      directUrlMasked: status.localDbPath ?? "",
    };
  }
  return getDatabaseConfigStatus();
});

app.put("/api/config/database", async (req, reply) => {
  if (isDesktopMode) {
    return reply.code(400).send({ error: "En mode desktop, configurez la synchronisation cloud." });
  }
  const body = req.body as { databaseUrl?: string; directUrl?: string };
  const databaseUrl = body?.databaseUrl?.trim();
  if (!databaseUrl) {
    return reply.code(400).send({ error: "URL de connexion requise." });
  }
  const directUrl = body?.directUrl?.trim() || databaseUrl;
  writeRuntimeDatabaseConfig({ databaseUrl, directUrl });
  try {
    await reconnectPrisma(databaseUrl, directUrl);
  } catch (err) {
    const detail = isDatabaseUnreachable(err)
      ? "Connexion impossible. Utilisez l'URL pooler Neon (*-pooler.*.neon.tech) ou vérifiez que le projet n'est pas suspendu."
      : "Connexion impossible avec ces URLs. Vérifiez les identifiants.";
    return reply.code(400).send({ error: detail });
  }
  return { ok: true, reconnected: true };
});

app.put("/api/config/cloud", async (req, reply) => {
  if (!isDesktopMode) {
    return reply.code(400).send({ error: "La synchronisation cloud est réservée au mode desktop." });
  }
  const body = req.body as { enabled?: boolean; databaseUrl?: string; directUrl?: string };
  const result = await configureCloud({
    enabled: Boolean(body?.enabled),
    databaseUrl: body?.databaseUrl,
    directUrl: body?.directUrl,
  });
  if (!result.ok) {
    const messages: Record<string, string> = {
      url_required: "URL Neon requise pour activer la synchronisation.",
      connection_failed: "Connexion cloud impossible. Vérifiez les URLs Neon.",
    };
    return reply.code(400).send({ error: messages[result.error ?? ""] ?? "Configuration invalide." });
  }
  return { ok: true };
});

app.get("/api/sync/status", async () => getSyncStatus());

app.post("/api/sync/now", async () => syncNow());

app.post("/api/sync/dismiss-conflict", async () => {
  await dismissConflict();
  return { ok: true };
});

app.get("/api/config/ai", async () => getAiConfigStatus());

app.put("/api/config/ai", async (req, reply) => {
  const body = req.body as {
    preset?: AiPreset;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  const current = readRuntimeAiConfig() ?? {};
  const apiKey = body.apiKey?.trim();
  writeRuntimeAiConfig({
    preset: body.preset ?? current.preset ?? "openrouter",
    apiKey: apiKey && !apiKey.includes("••••") ? apiKey : current.apiKey,
    baseUrl: body.baseUrl?.trim() || current.baseUrl,
    model: body.model?.trim() || current.model,
  });
  return { ok: true, ...getAiConfigStatus() };
});

app.post("/api/config/ai/test", async () => testAiConnection());

app.post("/api/risk-assist", async (req, reply) => {
  const body = req.body as RiskAssistRequestBody;
  if (!body?.projectId || !body.context || !Array.isArray(body.heuristicSuggestions)) {
    return reply.code(400).send({ error: "Corps de requête invalide." });
  }
  return runRiskAssist(body);
});

app.get("/api/copilot/memory", async () => getCopilotMemory(prisma));

app.put("/api/copilot/memory", async (req, reply) => {
  const body = req.body as Parameters<typeof replaceCopilotMemory>[1];
  if (body == null || typeof body.revision !== "number") {
    return reply.code(400).send({ error: "Corps de requête invalide." });
  }
  try {
    return await replaceCopilotMemory(prisma, body);
  } catch (e) {
    if (e instanceof CopilotMemoryConflictError) {
      return reply.code(409).send({ error: e.message, currentRevision: e.currentRevision });
    }
    throw e;
  }
});

app.delete("/api/copilot/memory", async () => resetCopilotMemory(prisma));

app.post("/api/copilot/chat", async (req, reply) => {
  const body = req.body as CopilotChatRequestBody;
  if (!body?.message || !body.intentCatalog) {
    return reply.code(400).send({ error: "Corps de requête invalide." });
  }
  try {
    return await runCopilotChat(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur IA";
    if (msg.includes("non configurée")) {
      return reply.code(503).send({ error: msg });
    }
    return runCopilotChatHeuristic(body);
  }
});

// 8787 is inside Windows Hyper-V/WSL excluded range 8748–8847 (EACCES).
const port = Number(process.env.PORT ?? 8888);
// 127.0.0.1 keeps desktop/local dev loopback-only; Docker sets HOST=0.0.0.0 to accept the reverse proxy.
const host = process.env.HOST ?? "127.0.0.1";
app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
