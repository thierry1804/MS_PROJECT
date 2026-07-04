import cors from "@fastify/cors";
import Fastify from "fastify";
import { prisma } from "./db.js";
import { getPortfolio, replacePortfolio } from "./portfolio.js";
import type { WirePortfolio } from "./types.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: [/^http:\/\/localhost:\d+$/],
});

app.get("/api/health", async () => ({ ok: true }));

app.get("/api/portfolio", async (_req, reply) => {
  const portfolio = await getPortfolio(prisma);
  if (!portfolio) return reply.code(404).send({ error: "Aucun portefeuille en base. Lancez le seed." });
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

const port = Number(process.env.PORT ?? 8787);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
