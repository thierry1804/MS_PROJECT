import type { AppPrismaClient } from "./db.js";
import { createNotification } from "./notifications.js";

export async function listAccessForUser(prisma: AppPrismaClient, userId: string): Promise<string[]> {
  const rows = await prisma.projectAccess.findMany({ where: { userId }, select: { projectId: true } });
  return rows.map((r) => r.projectId);
}

/**
 * Replaces a member's full set of project grants with `projectIds`, diffing
 * against the current set to fire access-changed notifications only for the
 * delta (not a notification storm on every save of an unrelated field).
 */
export async function setAccessForUser(
  prisma: AppPrismaClient,
  userId: string,
  projectIds: string[],
  grantedBy: string | undefined,
  projectNames: Map<string, string>,
): Promise<void> {
  const current = new Set(await listAccessForUser(prisma, userId));
  const next = new Set(projectIds);

  const granted = projectIds.filter((id) => !current.has(id));
  const revoked = [...current].filter((id) => !next.has(id));

  await prisma.$transaction(async (tx) => {
    await tx.projectAccess.deleteMany({ where: { userId } });
    if (projectIds.length > 0) {
      await tx.projectAccess.createMany({
        data: projectIds.map((projectId) => ({ userId, projectId, grantedBy })),
      });
    }
  });

  for (const projectId of granted) {
    await createNotification(prisma, {
      userId,
      type: "project_access_granted",
      projectId,
      projectName: projectNames.get(projectId) ?? projectId,
    });
  }
  for (const projectId of revoked) {
    await createNotification(prisma, {
      userId,
      type: "project_access_revoked",
      projectId,
      projectName: projectNames.get(projectId) ?? projectId,
    });
  }
}
