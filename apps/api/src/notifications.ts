import type { AppPrismaClient } from "./db.js";
import type { WirePortfolio } from "./types.js";

export interface NotificationInput {
  userId: string;
  type: "project_access_granted" | "project_access_revoked" | "raid_assigned";
  projectId?: string | null;
  projectName?: string | null;
  raidKind?: "risks" | "actions" | "issues" | null;
  raidItemId?: string | null;
  raidItemLabel?: string | null;
}

export async function createNotification(prisma: AppPrismaClient, input: NotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      projectId: input.projectId ?? undefined,
      projectName: input.projectName ?? undefined,
      raidKind: input.raidKind ?? undefined,
      raidItemId: input.raidItemId ?? undefined,
      raidItemLabel: input.raidItemLabel ?? undefined,
    },
  });
}

export async function listNotifications(prisma: AppPrismaClient, userId: string, limit = 50) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
}

export async function markNotificationRead(prisma: AppPrismaClient, userId: string, id: string) {
  const { count } = await prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
  return count > 0;
}

export async function markAllNotificationsRead(prisma: AppPrismaClient, userId: string) {
  const { count } = await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  return count;
}

interface RaidOwnerRef {
  id: string;
  owner: string;
}

/**
 * Best-effort, never throws: called after replacePortfolio commits. Matches
 * Risk/Action/Issue.owner (free text) against User.name/email (case-insensitive)
 * to notify a user when a RAID item becomes newly assigned to them. Known
 * limitation: typos/homonyms/renames break the match; no retroactive
 * notification for assignments that existed before this feature shipped.
 */
export async function detectRaidAssignmentsAndNotify(
  prisma: AppPrismaClient,
  accessScope: string[] | null,
  previousOwners: Map<string, string>,
  payload: WirePortfolio,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
    if (users.length === 0) return;
    const byKey = new Map<string, string>();
    for (const u of users) {
      byKey.set(u.email.toLowerCase(), u.id);
      if (u.name) byKey.set(u.name.toLowerCase(), u.id);
    }

    const projects = accessScope ? payload.projects.filter((p) => accessScope.includes(p.id)) : payload.projects;

    const items: { kind: "risks" | "actions" | "issues"; projectId: string; projectName: string; ref: RaidOwnerRef }[] = [];
    for (const p of projects) {
      for (const r of p.risks) items.push({ kind: "risks", projectId: p.id, projectName: p.name, ref: { id: r.id, owner: r.owner } });
      for (const a of p.actions) items.push({ kind: "actions", projectId: p.id, projectName: p.name, ref: { id: a.id, owner: a.owner } });
      for (const i of p.issues) items.push({ kind: "issues", projectId: p.id, projectName: p.name, ref: { id: i.id, owner: i.owner } });
    }

    for (const item of items) {
      const newOwnerKey = item.ref.owner.trim().toLowerCase();
      const userId = newOwnerKey ? byKey.get(newOwnerKey) : undefined;
      if (!userId) continue;
      const prevOwner = previousOwners.get(item.ref.id);
      if (prevOwner !== undefined && prevOwner.trim().toLowerCase() === newOwnerKey) continue; // unchanged
      const label =
        item.kind === "risks" ? "risque" : item.kind === "actions" ? "action" : "issue";
      await createNotification(prisma, {
        userId,
        type: "raid_assigned",
        projectId: item.projectId,
        projectName: item.projectName,
        raidKind: item.kind,
        raidItemId: item.ref.id,
        raidItemLabel: `${label}: ${item.ref.owner}`,
      });
    }
  } catch {
    // best-effort — never block a portfolio save over notification bookkeeping
  }
}

/** Snapshot of current owner per RAID item id, read BEFORE replacePortfolio's delete+recreate. */
export async function snapshotRaidOwners(
  prisma: AppPrismaClient,
  accessScope: string[] | null,
): Promise<Map<string, string>> {
  const where = accessScope ? { projectId: { in: accessScope } } : {};
  const [risks, actions, issues] = await Promise.all([
    prisma.risk.findMany({ where, select: { id: true, owner: true } }),
    prisma.action.findMany({ where, select: { id: true, owner: true } }),
    prisma.issue.findMany({ where, select: { id: true, owner: true } }),
  ]);
  const map = new Map<string, string>();
  for (const r of [...risks, ...actions, ...issues]) map.set(r.id, r.owner);
  return map;
}
