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
import {
  clearSessionCookie,
  createSessionToken,
  parseCookies,
  serializeSessionCookie,
  SESSION_COOKIE_NAME,
  verifyPassword,
  verifySessionToken,
} from "./auth.js";
import { getAccessScope, getClientIp, requireAdmin } from "./access.js";
import { createUser, deleteUser, listUsers, updateUser, UserError } from "./users.js";
import { listAccessForUser, setAccessForUser } from "./project-access.js";
import {
  detectRaidAssignmentsAndNotify,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  snapshotRaidOwners,
} from "./notifications.js";
import { addPortfolioEventClient, broadcastPortfolioChanged, removePortfolioEventClient } from "./events.js";

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

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

const isProd = process.env.NODE_ENV === "production";
const PUBLIC_API_PATHS = new Set(["/api/health", "/api/auth/login", "/api/auth/logout"]);

const app = Fastify({ logger: true });
app.decorateRequest("userId", undefined);

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

// Desktop mode is a local single-user app (no network exposure) — no session gate needed.
// Web mode is reachable over the internet, so every /api/* route requires a valid session
// except health and the login/logout endpoints themselves.
if (!isDesktopMode) {
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    const pathname = req.url.split("?")[0];
    if (PUBLIC_API_PATHS.has(pathname)) return;
    const cookies = parseCookies(req.headers.cookie);
    const userId = verifySessionToken(cookies[SESSION_COOKIE_NAME]);
    if (!userId) {
      reply.code(401).send({ error: "Authentification requise." });
      return;
    }
    req.userId = userId;
  });
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

app.post("/api/auth/login", async (req, reply) => {
  const body = req.body as { email?: string; password?: string };
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) {
    return reply.code(400).send({ error: "Email et mot de passe requis." });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return reply.code(401).send({ error: "Identifiants invalides." });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIp: getClientIp(req) },
  });
  reply.header("set-cookie", serializeSessionCookie(createSessionToken(user.id), isProd));
  return { ok: true, email: user.email, role: user.role };
});

app.post("/api/auth/heartbeat", async (req) => {
  if (isDesktopMode || !req.userId) return { ok: true };
  const body = req.body as { path?: string };
  await prisma.user.update({
    where: { id: req.userId },
    data: {
      lastSeenAt: new Date(),
      lastSeenIp: getClientIp(req),
      lastSeenPath: body?.path?.slice(0, 200) || null,
    },
  });
  return { ok: true };
});

app.post("/api/auth/logout", async (_req, reply) => {
  reply.header("set-cookie", clearSessionCookie(isProd));
  return { ok: true };
});

app.get("/api/auth/me", async (req, reply) => {
  if (isDesktopMode) return { email: null, desktop: true, role: "admin" };
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return reply.code(401).send({ error: "Non authentifié." });
  return { email: user.email, role: user.role };
});

app.get("/api/portfolio/events", async (req, reply) => {
  if (isDesktopMode) return reply.code(404).send();
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  reply.raw.write(": connected\n\n");
  addPortfolioEventClient(reply);
  req.raw.on("close", () => removePortfolioEventClient(reply));
});

app.get("/api/portfolio", async (req, reply) => {
  const accessScope = isDesktopMode ? null : await getAccessScope(prisma, req.userId);
  const portfolio = await getPortfolio(prisma, accessScope);
  if (!portfolio) return reply.code(404).send({ error: "Aucun portefeuille en base." });
  return portfolio;
});

app.put("/api/portfolio", async (req, reply) => {
  const payload = req.body as WirePortfolio;
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.projects)) {
    return reply.code(400).send({ error: "Corps de requête invalide." });
  }
  const accessScope = isDesktopMode ? null : await getAccessScope(prisma, req.userId);
  const previousOwners = await snapshotRaidOwners(prisma, accessScope);
  const result = await replacePortfolio(prisma, payload, {}, accessScope);
  if ("error" in result) {
    return reply.code(403).send({ error: "Ce portefeuille contient un projet auquel vous n'avez pas accès." });
  }
  void afterLocalSave();
  void detectRaidAssignmentsAndNotify(prisma, accessScope, previousOwners, payload);
  if (!isDesktopMode) broadcastPortfolioChanged(result);
  return { ok: true };
});

app.get("/api/audit", async (req, reply) => {
  if (!(await requireAdmin(prisma, req, reply))) return;
  const { limit } = req.query as { limit?: string };
  const take = Math.min(Number(limit) || 300, 1000);
  return prisma.auditEntry.findMany({ orderBy: { at: "desc" }, take });
});

app.post("/api/audit", async (req, reply) => {
  // Intentionally not admin-gated: any authenticated user's actions (including members)
  // still get logged, so an admin can audit them later — only reading/clearing the log is restricted.
  const body = req.body as Partial<AuditPayload>;
  if (!body?.entityType || !body?.entityId || !body?.action || !body?.summary) {
    return reply.code(400).send({ error: "Corps de requête invalide." });
  }
  // The client-supplied `actor` is only ever "copilot" today (set by the AI copilot
  // flow) or omitted — never trustworthy as the real human identity on its own. In
  // web mode, resolve the actual logged-in user from the session and use that,
  // keeping the "copilot" tag as a suffix so AI-assisted edits stay distinguishable.
  let actor = body.actor || undefined;
  if (!isDesktopMode && req.userId) {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { name: true, email: true } });
    const who = user?.name || user?.email;
    if (who) actor = body.actor === "copilot" ? `${who} (copilot)` : who;
  }
  const entry = await prisma.auditEntry.create({
    data: {
      entityType: body.entityType,
      entityId: body.entityId,
      action: body.action,
      summary: body.summary,
      detail: body.detail === undefined ? undefined : (body.detail as object),
      actor,
    },
  });
  return entry;
});

app.delete("/api/audit", async (req, reply) => {
  if (!(await requireAdmin(prisma, req, reply))) return;
  const { count } = await prisma.auditEntry.deleteMany();
  return { ok: true, count };
});

// User/role/project-access tables only exist in the Postgres schema (schema.prisma) —
// desktop mode runs on SQLite (schema.sqlite.prisma) and has no concept of multiple
// accounts, so these routes 404 there instead of crashing on an unknown-field Prisma error.
const DESKTOP_404 = { error: "Non disponible en mode desktop." };

app.get("/api/users", async (req, reply) => {
  if (isDesktopMode) return reply.code(404).send(DESKTOP_404);
  if (!(await requireAdmin(prisma, req, reply))) return;
  return listUsers(prisma);
});

app.post("/api/users", async (req, reply) => {
  if (isDesktopMode) return reply.code(404).send(DESKTOP_404);
  if (!(await requireAdmin(prisma, req, reply))) return;
  const body = req.body as { email?: string; password?: string; name?: string; role?: "admin" | "member" };
  if (!body?.email || !body?.password) return reply.code(400).send({ error: "Email et mot de passe requis." });
  try {
    return await createUser(prisma, body as { email: string; password: string; name?: string; role?: "admin" | "member" });
  } catch (e) {
    return reply.code(400).send({ error: e instanceof UserError ? e.message : "Création impossible." });
  }
});

app.patch("/api/users/:id", async (req, reply) => {
  if (isDesktopMode) return reply.code(404).send(DESKTOP_404);
  if (!(await requireAdmin(prisma, req, reply))) return;
  const { id } = req.params as { id: string };
  const body = req.body as { name?: string; role?: "admin" | "member"; password?: string };
  try {
    return await updateUser(prisma, id, body);
  } catch (e) {
    return reply.code(400).send({ error: e instanceof UserError ? e.message : "Modification impossible." });
  }
});

app.delete("/api/users/:id", async (req, reply) => {
  if (isDesktopMode) return reply.code(404).send(DESKTOP_404);
  const actingUserId = await requireAdmin(prisma, req, reply);
  if (!actingUserId) return;
  const { id } = req.params as { id: string };
  try {
    await deleteUser(prisma, id, actingUserId);
    return { ok: true };
  } catch (e) {
    return reply.code(400).send({ error: e instanceof UserError ? e.message : "Suppression impossible." });
  }
});

app.get("/api/users/:id/project-access", async (req, reply) => {
  if (isDesktopMode) return reply.code(404).send(DESKTOP_404);
  if (!(await requireAdmin(prisma, req, reply))) return;
  const { id } = req.params as { id: string };
  return { projectIds: await listAccessForUser(prisma, id) };
});

app.put("/api/users/:id/project-access", async (req, reply) => {
  if (isDesktopMode) return reply.code(404).send(DESKTOP_404);
  const actingUserId = await requireAdmin(prisma, req, reply);
  if (!actingUserId) return;
  const { id } = req.params as { id: string };
  const body = req.body as { projectIds?: string[] };
  if (!Array.isArray(body?.projectIds)) return reply.code(400).send({ error: "Corps de requête invalide." });
  const projects = await prisma.project.findMany({ where: { id: { in: body.projectIds } }, select: { id: true, name: true } });
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  await setAccessForUser(prisma, id, body.projectIds, actingUserId === "desktop" ? undefined : actingUserId, projectNames);
  return { ok: true };
});

app.get("/api/notifications", async (req) => {
  if (isDesktopMode || !req.userId) return [];
  return listNotifications(prisma, req.userId);
});

app.post("/api/notifications/:id/read", async (req, reply) => {
  if (isDesktopMode || !req.userId) return { ok: true };
  const { id } = req.params as { id: string };
  await markNotificationRead(prisma, req.userId, id);
  return { ok: true };
});

app.post("/api/notifications/read-all", async (req) => {
  if (isDesktopMode || !req.userId) return { ok: true, count: 0 };
  const count = await markAllNotificationsRead(prisma, req.userId);
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
