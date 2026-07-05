import { PrismaClient } from "@prisma/client";
import { applyRuntimeDatabaseConfig } from "./runtime-config.js";

applyRuntimeDatabaseConfig();

let client = new PrismaClient();

/** Mutable Prisma handle — replaced after a live database reconnect. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const value = client[prop as keyof PrismaClient];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});

/** Test and swap the active database connection without restarting the API process. */
export async function reconnectPrisma(databaseUrl: string, directUrl?: string): Promise<void> {
  const next = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  try {
    await next.$connect();
    await client.$disconnect();
    client = next;
    process.env.DATABASE_URL = databaseUrl;
    process.env.DIRECT_URL = directUrl ?? databaseUrl;
  } catch (err) {
    await next.$disconnect().catch(() => undefined);
    throw err;
  }
}
