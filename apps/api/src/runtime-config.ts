import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const CONFIG_PATH = path.join(CONFIG_DIR, "runtime-config.json");

export interface RuntimeDatabaseConfig {
  databaseUrl?: string;
  directUrl?: string;
}

/** Apply file-based DB URLs before PrismaClient is constructed. UI config overrides .env when present. */
export function applyRuntimeDatabaseConfig(): void {
  const file = readRuntimeDatabaseConfig();
  if (file?.databaseUrl) {
    process.env.DATABASE_URL = file.databaseUrl;
    process.env.DIRECT_URL = file.directUrl ?? file.databaseUrl;
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
