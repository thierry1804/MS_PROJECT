import { PrismaClient as PgPrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient as SqlitePrismaClient } from "./generated/sqlite-client/index.js";
import { applyRuntimeDatabaseConfig } from "./runtime-config.js";

export const isDesktopMode = process.env.DESKTOP_MODE === "1";

/** Shared Prisma surface used by portfolio helpers (Postgres or SQLite). */
export type AppPrismaClient = PgPrismaClient;

if (!isDesktopMode) {
  applyRuntimeDatabaseConfig();
}

let localClient: AppPrismaClient | SqlitePrismaClient = isDesktopMode
  ? new SqlitePrismaClient()
  : new PgPrismaClient();

let cloudClient: PgPrismaClient | null = null;

/** Active database for all /api/* routes. SQLite in desktop mode, Postgres otherwise. */
export const prisma = new Proxy({} as AppPrismaClient, {
  get(_target, prop) {
    const value = localClient[prop as keyof AppPrismaClient];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(localClient) : value;
  },
});

/** Cloud Postgres client for desktop sync only. Null when not configured or not in desktop mode. */
export function getCloudPrisma(): PgPrismaClient | null {
  return cloudClient;
}

export async function connectCloudPrisma(databaseUrl: string, _directUrl?: string): Promise<PgPrismaClient> {
  const next = new PgPrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  await next.$connect();
  if (cloudClient) await cloudClient.$disconnect().catch(() => undefined);
  cloudClient = next;
  return next;
}

export async function disconnectCloudPrisma(): Promise<void> {
  if (cloudClient) {
    await cloudClient.$disconnect().catch(() => undefined);
    cloudClient = null;
  }
}

/** Web mode: swap the active Postgres connection (Neon config from UI). */
export async function reconnectPrisma(databaseUrl: string, directUrl?: string): Promise<void> {
  if (isDesktopMode) {
    throw new Error("reconnectPrisma is not used in desktop mode; configure cloud sync instead.");
  }
  const next = new PgPrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  try {
    await next.$connect();
    await localClient.$disconnect();
    localClient = next;
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = directUrl ?? databaseUrl;
  } catch (err) {
    await next.$disconnect().catch(() => undefined);
    throw err;
  }
}

export async function initDesktopDb(): Promise<void> {
  if (!isDesktopMode) return;
  const client = localClient as SqlitePrismaClient;
  await client.$connect();
  try {
    await client.syncState.findFirst();
  } catch {
    const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    execSync("pnpm exec prisma db push --schema=prisma/schema.sqlite.prisma --skip-generate", {
      cwd: apiRoot,
      env: process.env,
      stdio: "inherit",
    });
  }
}
