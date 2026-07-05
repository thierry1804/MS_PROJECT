import type { PrismaClient as PgPrismaClient } from "@prisma/client";
import {
  connectCloudPrisma,
  disconnectCloudPrisma,
  getCloudPrisma,
  isDesktopMode,
  prisma,
} from "./db.js";
import { getPortfolio, getPortfolioMeta, replacePortfolio } from "./portfolio.js";
import { ensureSyncState, readSyncState, setCloudConfig, updateSyncState } from "./sync-state.js";

export interface SyncResult {
  ok: boolean;
  action?: "push" | "pull" | "none" | "conflict";
  conflict?: boolean;
  conflictWinner?: "local" | "cloud";
  error?: string;
}

let syncInFlight: Promise<SyncResult> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

async function resolveCloudClient(): Promise<PgPrismaClient | null> {
  if (!isDesktopMode) return null;
  const state = await readSyncState();
  if (!state?.enabled || !state.cloudDatabaseUrl) return null;

  const existing = getCloudPrisma();
  if (existing) return existing;

  try {
    return await connectCloudPrisma(state.cloudDatabaseUrl, state.cloudDirectUrl ?? undefined);
  } catch {
    return null;
  }
}

async function mergeAudit(local: PgPrismaClient, cloud: PgPrismaClient): Promise<void> {
  const [localEntries, cloudEntries] = await Promise.all([
    local.auditEntry.findMany({ orderBy: { at: "desc" }, take: 1000 }),
    cloud.auditEntry.findMany({ orderBy: { at: "desc" }, take: 1000 }),
  ]);

  const localIds = new Set(localEntries.map((e) => e.id));
  const cloudIds = new Set(cloudEntries.map((e) => e.id));

  const toLocal = cloudEntries.filter((e) => !localIds.has(e.id));
  const toCloud = localEntries.filter((e) => !cloudIds.has(e.id));

  if (toLocal.length > 0) {
    await local.auditEntry.createMany({
      data: toLocal.map((e) => ({
        id: e.id,
        at: e.at,
        actor: e.actor,
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        summary: e.summary,
        detail: e.detail ?? undefined,
      })),
      skipDuplicates: true,
    });
  }

  if (toCloud.length > 0) {
    await cloud.auditEntry.createMany({
      data: toCloud.map((e) => ({
        id: e.id,
        at: e.at,
        actor: e.actor,
        entityType: e.entityType,
        entityId: e.entityId,
        action: e.action,
        summary: e.summary,
        detail: e.detail ?? undefined,
      })),
      skipDuplicates: true,
    });
  }
}

/** Core LWW sync between local SQLite and cloud Postgres. */
export async function runSync(): Promise<SyncResult> {
  if (!isDesktopMode) return { ok: true, action: "none" };

  const state = await ensureSyncState();
  if (!state.enabled || !state.cloudDatabaseUrl) {
    return { ok: true, action: "none" };
  }

  const cloud = await resolveCloudClient();
  if (!cloud) {
    await updateSyncState({ pendingPush: true });
    return { ok: false, action: "none", error: "cloud_unreachable" };
  }

  const localMeta = await getPortfolioMeta(prisma);
  const cloudMeta = await getPortfolioMeta(cloud);

  if (!localMeta && !cloudMeta) {
    await updateSyncState({ lastSyncedAt: new Date(), pendingPush: false });
    return { ok: true, action: "none" };
  }

  if (!localMeta && cloudMeta) {
    const remote = await getPortfolio(cloud);
    if (remote) {
      await replacePortfolio(prisma, remote, {
        revision: cloudMeta.revision,
        updatedAt: cloudMeta.updatedAt,
        preserveRevision: true,
      });
      await mergeAudit(prisma as unknown as PgPrismaClient, cloud);
      await updateSyncState({
        lastSyncedAt: new Date(),
        lastLocalRevision: cloudMeta.revision,
        lastCloudRevision: cloudMeta.revision,
        pendingPush: false,
      });
    }
    return { ok: true, action: "pull" };
  }

  if (localMeta && !cloudMeta) {
    const local = await getPortfolio(prisma);
    if (local) {
      await replacePortfolio(cloud, local, {
        revision: localMeta.revision,
        updatedAt: localMeta.updatedAt,
        preserveRevision: true,
      });
      await mergeAudit(prisma as unknown as PgPrismaClient, cloud);
      await updateSyncState({
        lastSyncedAt: new Date(),
        lastLocalRevision: localMeta.revision,
        lastCloudRevision: localMeta.revision,
        pendingPush: false,
      });
    }
    return { ok: true, action: "push" };
  }

  if (!localMeta || !cloudMeta) return { ok: true, action: "none" };

  const localChanged = localMeta.revision > state.lastLocalRevision;
  const cloudChanged = cloudMeta.revision > state.lastCloudRevision;
  const bothChanged = localChanged && cloudChanged;

  if (bothChanged) {
    const localWins = localMeta.updatedAt.getTime() >= cloudMeta.updatedAt.getTime();
    const winner = localWins ? "local" : "cloud";
    const source = localWins ? prisma : cloud;
    const target = localWins ? cloud : prisma;
    const meta = localWins ? localMeta : cloudMeta;
    const payload = await getPortfolio(source);
    if (payload) {
      await replacePortfolio(target, payload, {
        revision: meta.revision,
        updatedAt: meta.updatedAt,
        preserveRevision: true,
      });
    }
    await mergeAudit(prisma as unknown as PgPrismaClient, cloud);
    await updateSyncState({
      lastSyncedAt: new Date(),
      lastLocalRevision: meta.revision,
      lastCloudRevision: meta.revision,
      pendingPush: false,
      lastConflictAt: new Date(),
      lastConflictWinner: winner,
      conflictDismissed: false,
    });
    await cloud.auditEntry.create({
      data: {
        entityType: "sync",
        entityId: "portfolio",
        action: "conflict_resolved",
        summary: `Conflit résolu (${winner === "local" ? "version locale" : "version cloud"} conservée)`,
        detail: {
          localRevision: localMeta.revision,
          cloudRevision: cloudMeta.revision,
          winner,
        },
      },
    });
    return { ok: true, action: "conflict", conflict: true, conflictWinner: winner };
  }

  if (localChanged && (!cloudChanged || localMeta.updatedAt >= cloudMeta.updatedAt)) {
    const local = await getPortfolio(prisma);
    if (local) {
      await replacePortfolio(cloud, local, {
        revision: localMeta.revision,
        updatedAt: localMeta.updatedAt,
        preserveRevision: true,
      });
    }
    await mergeAudit(prisma as unknown as PgPrismaClient, cloud);
    await updateSyncState({
      lastSyncedAt: new Date(),
      lastLocalRevision: localMeta.revision,
      lastCloudRevision: localMeta.revision,
      pendingPush: false,
    });
    return { ok: true, action: "push" };
  }

  if (cloudChanged && cloudMeta.updatedAt > localMeta.updatedAt) {
    const remote = await getPortfolio(cloud);
    if (remote) {
      await replacePortfolio(prisma, remote, {
        revision: cloudMeta.revision,
        updatedAt: cloudMeta.updatedAt,
        preserveRevision: true,
      });
    }
    await mergeAudit(prisma as unknown as PgPrismaClient, cloud);
    await updateSyncState({
      lastSyncedAt: new Date(),
      lastLocalRevision: cloudMeta.revision,
      lastCloudRevision: cloudMeta.revision,
      pendingPush: false,
    });
    return { ok: true, action: "pull" };
  }

  await updateSyncState({ lastSyncedAt: new Date(), pendingPush: false });
  return { ok: true, action: "none" };
}

export async function syncNow(): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSync().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

/** Called after local portfolio save — queue cloud push when enabled. */
export async function afterLocalSave(): Promise<void> {
  if (!isDesktopMode) return;
  const state = await readSyncState();
  if (!state?.enabled) return;
  const meta = await getPortfolioMeta(prisma);
  if (meta) {
    await updateSyncState({ pendingPush: true, lastLocalRevision: meta.revision });
  }
  void syncNow();
}

export async function getSyncStatus() {
  if (!isDesktopMode) {
    return {
      desktop: false,
      enabled: false,
      online: false,
      pending: false,
      conflict: false,
    };
  }

  const state = await ensureSyncState();
  const localMeta = await getPortfolioMeta(prisma);
  let cloudMeta: { revision: number; updatedAt: Date } | null = null;
  let online = false;

  if (state.enabled && state.cloudDatabaseUrl) {
    const cloud = await resolveCloudClient();
    if (cloud) {
      online = true;
      cloudMeta = await getPortfolioMeta(cloud);
    }
  }

  const conflict =
    Boolean(state.lastConflictAt) && !state.conflictDismissed && Boolean(state.lastConflictWinner);

  return {
    desktop: true,
    enabled: state.enabled,
    online,
    pending: state.pendingPush,
    conflict,
    conflictWinner: state.lastConflictWinner,
    lastSyncedAt: state.lastSyncedAt?.toISOString() ?? null,
    localRevision: localMeta?.revision ?? 0,
    cloudRevision: cloudMeta?.revision ?? 0,
    localDbPath: process.env.DATABASE_URL?.replace(/^file:/u, "") ?? null,
    cloudUrlMasked: state.cloudDatabaseUrl ? maskUrl(state.cloudDatabaseUrl) : "",
  };
}

function maskUrl(url: string): string {
  return url.replace(/:\/\/([^:@/]+):([^@/]+)@/u, "://$1:••••••@");
}

export async function dismissConflict(): Promise<void> {
  if (!isDesktopMode) return;
  await updateSyncState({ conflictDismissed: true });
}

export function startPeriodicSync(): void {
  if (!isDesktopMode || periodicTimer) return;
  periodicTimer = setInterval(() => {
    void syncNow();
  }, 60_000);
}

export async function configureCloud(config: {
  enabled: boolean;
  databaseUrl?: string;
  directUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isDesktopMode) return { ok: false, error: "desktop_only" };

  if (!config.enabled) {
    await setCloudConfig({ enabled: false });
    await disconnectCloudPrisma();
    return { ok: true };
  }

  const state = await ensureSyncState();
  const databaseUrl = config.databaseUrl?.trim() || state.cloudDatabaseUrl || "";
  if (!databaseUrl) return { ok: false, error: "url_required" };

  const directUrl = config.directUrl?.trim() || state.cloudDirectUrl?.trim() || databaseUrl;

  try {
    await connectCloudPrisma(databaseUrl, directUrl);
    await setCloudConfig({
      enabled: true,
      cloudDatabaseUrl: databaseUrl,
      cloudDirectUrl: directUrl,
    });
    void syncNow();
    return { ok: true };
  } catch {
    await disconnectCloudPrisma();
    return { ok: false, error: "connection_failed" };
  }
}
