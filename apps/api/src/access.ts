import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppPrismaClient } from "./db.js";
import { isDesktopMode } from "./db.js";

/**
 * Request chain is browser → Cloudflare edge → cloudflared tunnel → nginx (web
 * container, loopback) → this api container. Cloudflare sets `cf-connecting-ip`
 * to the single real visitor IP and leaves it untouched all the way through;
 * nginx's own `X-Forwarded-For` just appends its loopback hop, so `cf-connecting-ip`
 * is the reliable source. Falls back to the first (left-most / original client)
 * entry of `x-forwarded-for`, then the raw socket address, for direct/local access.
 */
export function getClientIp(req: FastifyRequest): string | null {
  const cf = req.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf) return cf;
  const xff = req.headers["x-forwarded-for"];
  const xffFirst = Array.isArray(xff) ? xff[0] : xff?.split(",")[0];
  if (xffFirst?.trim()) return xffFirst.trim();
  return req.ip || null;
}

export type Role = "admin" | "member";

/** 403s and returns null when the caller isn't an admin. Desktop mode always passes (single local user). */
export async function requireAdmin(
  prisma: AppPrismaClient,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  if (isDesktopMode) return "desktop";
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || user.role !== "admin") {
    reply.code(403).send({ error: "Réservé aux administrateurs." });
    return null;
  }
  return user.id;
}

/** null = unrestricted (admin or desktop). Otherwise the list of project ids a member can see. */
export async function getAccessScope(prisma: AppPrismaClient, userId: string | undefined): Promise<string[] | null> {
  if (isDesktopMode) return null;
  if (!userId) return [];
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return [];
  if (user.role === "admin") return null;
  const grants = await prisma.projectAccess.findMany({ where: { userId }, select: { projectId: true } });
  return grants.map((g) => g.projectId);
}
