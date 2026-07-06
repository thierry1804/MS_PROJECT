import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const CONFIG_PATH = path.join(CONFIG_DIR, "runtime-config.json");

export interface RuntimeDatabaseConfig {
  databaseUrl?: string;
  directUrl?: string;
}

/**
 * Neon/PgBouncer pooler URLs need `pgbouncer=true` so Prisma skips prepared
 * statements. Without it, DDL changes (e.g. Int → Float) trigger
 * "cached plan must not change result type" on long-lived connections.
 */
export function normalizePooledDatabaseUrl(url: string): string {
  if (!url.includes("-pooler")) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("pgbouncer")) parsed.searchParams.set("pgbouncer", "true");
    return parsed.toString();
  } catch {
    return url.includes("pgbouncer=") ? url : `${url}${url.includes("?") ? "&" : "?"}pgbouncer=true`;
  }
}

/** Apply file-based DB URLs before PrismaClient is constructed. UI config overrides .env when present. */
export function applyRuntimeDatabaseConfig(): void {
  const file = readRuntimeDatabaseConfig();
  if (file?.databaseUrl) {
    process.env.DATABASE_URL = normalizePooledDatabaseUrl(file.databaseUrl);
    process.env.DIRECT_URL = file.directUrl ?? file.databaseUrl;
  } else if (process.env.DATABASE_URL) {
    process.env.DATABASE_URL = normalizePooledDatabaseUrl(process.env.DATABASE_URL);
  }
}

export function readRuntimeDatabaseConfig(): RuntimeDatabaseConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as RuntimeDatabaseConfig;
  } catch {
    return null;
  }
}

export function writeRuntimeDatabaseConfig(config: RuntimeDatabaseConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function clearRuntimeDatabaseConfig(): void {
  if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
}

export function databaseConfigSource(): "env" | "file" | "none" {
  if (readRuntimeDatabaseConfig()?.databaseUrl) return "file";
  if (process.env.DATABASE_URL) return "env";
  return "none";
}

export function maskDatabaseUrl(url: string): string {
  return url.replace(/:\/\/([^:@/]+):([^@/]+)@/u, "://$1:••••••@");
}

export function getDatabaseConfigStatus(): {
  source: "env" | "file" | "none";
  configured: boolean;
  databaseUrlMasked: string;
  directUrlMasked: string;
} {
  const file = readRuntimeDatabaseConfig();
  const databaseUrl = file?.databaseUrl ?? process.env.DATABASE_URL ?? "";
  const directUrl = file?.directUrl ?? process.env.DIRECT_URL ?? databaseUrl;
  return {
    source: databaseConfigSource(),
    configured: Boolean(databaseUrl),
    databaseUrlMasked: databaseUrl ? maskDatabaseUrl(databaseUrl) : "",
    directUrlMasked: directUrl ? maskDatabaseUrl(directUrl) : "",
  };
}
