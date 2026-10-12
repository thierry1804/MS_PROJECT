import type { PrismaClient as SqlitePrismaClient } from "./generated/sqlite-client/index.js";
import { prisma, isDesktopMode } from "./db.js";

const SYNC_ID = "default";

export interface SyncStateRow {
  enabled: boolean;
  cloudDatabaseUrl: string | null;
  cloudDirectUrl: string | null;
  lastSyncedAt: Date | null;
  lastLocalRevision: number;
  lastCloudRevision: number;
  pendingPush: boolean;
  lastConflictAt: Date | null;
  lastConflictWinner: string | null;
  conflictDismissed: boolean;
}

function sqlite(): SqlitePrismaClient {
  if (!isDesktopMode) throw new Error("SyncState is only available in desktop mode.");
  return prisma as unknown as SqlitePrismaClient;
}

export async function ensureSyncState(): Promise<SyncStateRow> {
  const db = sqlite();
  const row = await db.syncState.upsert({
    where: { id: SYNC_ID },
    create: { id: SYNC_ID },
    update: {},
  });
  return row;
}

export async function readSyncState(): Promise<SyncStateRow | null> {
  if (!isDesktopMode) return null;
  return sqlite().syncState.findUnique({ where: { id: SYNC_ID } });
}

export async function updateSyncState(patch: Partial<SyncStateRow>): Promise<SyncStateRow> {
  await ensureSyncState();
  return sqlite().syncState.update({
    where: { id: SYNC_ID },
    data: patch,
  });
}

export async function setCloudConfig(config: {
  enabled: boolean;
  cloudDatabaseUrl?: string | null;
  cloudDirectUrl?: string | null;
}): Promise<SyncStateRow> {
  return updateSyncState({
    enabled: config.enabled,
    cloudDatabaseUrl: config.cloudDatabaseUrl ?? null,
    cloudDirectUrl: config.cloudDirectUrl ?? null,
  });
}

export function maskCloudUrl(url: string): string {
  return url.replace(/:\/\/([^:@/]+):([^@/]+)@/u, "://$1:••••••@");
}
