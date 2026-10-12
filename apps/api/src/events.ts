import type { FastifyReply } from "fastify";

/**
 * Minimal Server-Sent Events hub for "the portfolio changed, go refetch" pushes.
 * No new dependency (SSE is plain long-lived HTTP, unlike WebSocket which would
 * need @fastify/websocket — and this process has no package manager available
 * on the host to safely update the lockfile). Single api replica, so an
 * in-memory Set is enough; broadcasts carry no portfolio data, only a revision
 * marker — GET /api/portfolio remains the sole source of truth and re-applies
 * the caller's own access scope on every refetch, so this never leaks data
 * across users.
 */
const clients = new Set<FastifyReply>();

const PING_MS = 20_000; // keep the connection alive through nginx/cloudflared idle timeouts

setInterval(() => {
  for (const reply of clients) {
    try {
      reply.raw.write(": ping\n\n");
    } catch {
      clients.delete(reply);
    }
  }
}, PING_MS);

export function addPortfolioEventClient(reply: FastifyReply): void {
  clients.add(reply);
}

export function removePortfolioEventClient(reply: FastifyReply): void {
  clients.delete(reply);
}

export function broadcastPortfolioChanged(meta: { revision: number; updatedAt: Date }): void {
  const payload = `data: ${JSON.stringify({ revision: meta.revision, updatedAt: meta.updatedAt.toISOString() })}\n\n`;
  for (const reply of clients) {
    try {
      reply.raw.write(payload);
    } catch {
      clients.delete(reply);
    }
  }
}
