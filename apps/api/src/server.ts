import cors from "@fastify/cors";
import Fastify from "fastify";
import { prisma, reconnectPrisma } from "./db.js";
import { getPortfolio, replacePortfolio } from "./portfolio.js";
import {
  getDatabaseConfigStatus,
  writeRuntimeDatabaseConfig,
} from "./runtime-config.js";
import type { WirePortfolio } from "./types.js";

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
  origin: [/^http:\/\/localhost:\d+$/],
});

app.get("/api/health", async () => ({ ok: true }));

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

app.get("/api/config/database", async () => getDatabaseConfigStatus());

app.put("/api/config/database", async (req, reply) => {
  const body = req.body as { databaseUrl?: string; directUrl?: string };
  const databaseUrl = body?.databaseUrl?.trim();
  if (!databaseUrl) {
    return reply.code(400).send({ error: "URL de connexion requise." });
  }
  const directUrl = body?.directUrl?.trim() || databaseUrl;
  writeRuntimeDatabaseConfig({ databaseUrl, directUrl });
  try {
    await reconnectPrisma(databaseUrl, directUrl);
  } catch {
    return reply.code(400).send({ error: "Connexion impossible avec ces URLs. Vérifiez les identifiants." });
  }
  return { ok: true, reconnected: true };
});

const port = Number(process.env.PORT ?? 8787);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
