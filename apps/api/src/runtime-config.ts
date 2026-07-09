import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const CONFIG_PATH = path.join(CONFIG_DIR, "runtime-config.json");

export interface RuntimeDatabaseConfig {
  databaseUrl?: string;
  directUrl?: string;
}

export interface ResolvedDatabaseUrls {
  pooledUrl: string;
  directUrl: string;
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
    if (parsed.searchParams.get("channel_binding") === "require") {
      parsed.searchParams.delete("channel_binding");
    }
    return parsed.toString();
  } catch {
    return url.includes("pgbouncer=") ? url : `${url}${url.includes("?") ? "&" : "?"}pgbouncer=true`;
  }
}

/** Convertit une URL Neon directe (port 5432) en URL pooler pour les requêtes runtime. */
export function toNeonPoolerUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes(".neon.tech")) return normalizePooledDatabaseUrl(url);
    if (parsed.hostname.includes("-pooler")) return normalizePooledDatabaseUrl(url);

    const dotIdx = parsed.hostname.indexOf(".");
    if (dotIdx < 0) return url;
    const first = parsed.hostname.slice(0, dotIdx);
    const rest = parsed.hostname.slice(dotIdx);
    parsed.hostname = `${first}-pooler${rest}`;

    if (parsed.searchParams.get("channel_binding") === "require") {
      parsed.searchParams.delete("channel_binding");
    }
    parsed.searchParams.set("pgbouncer", "true");
    if (!parsed.searchParams.has("sslmode")) parsed.searchParams.set("sslmode", "require");
    return parsed.toString();
  } catch {
    return url;
  }
}

/** URL directe Neon (sans suffixe pooler) pour migrations Prisma. */
export function toNeonDirectUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes(".neon.tech")) return url;
    parsed.hostname = parsed.hostname.replace(/-pooler(?=\.)/u, "");
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Résout les URLs runtime : requêtes via pooler, migrations via connexion directe.
 * Si l'utilisateur n'a fourni que l'URL directe Neon, le pooler est dérivé automatiquement.
 */
export function resolveDatabaseUrls(databaseUrl: string, directUrl?: string): ResolvedDatabaseUrls {
  const raw = databaseUrl.trim();
  const rawDirect = (directUrl?.trim() || raw).trim();

  const pooledUrl = raw.includes("-pooler") ? normalizePooledDatabaseUrl(raw) : toNeonPoolerUrl(raw);
  const direct = toNeonDirectUrl(rawDirect);

  return { pooledUrl, directUrl: direct };
}

/** Apply file-based DB URLs before PrismaClient is constructed. UI config overrides .env when present. */
export function applyRuntimeDatabaseConfig(): void {
  const file = readRuntimeDatabaseConfig();
  if (file?.databaseUrl) {
    const { pooledUrl, directUrl } = resolveDatabaseUrls(file.databaseUrl, file.directUrl);
    process.env.DATABASE_URL = pooledUrl;
    process.env.DIRECT_URL = directUrl;
    if (file.databaseUrl !== pooledUrl || (file.directUrl && file.directUrl !== directUrl)) {
      writeRuntimeDatabaseConfig({ databaseUrl: pooledUrl, directUrl });
    }
  } else if (process.env.DATABASE_URL) {
    const { pooledUrl, directUrl } = resolveDatabaseUrls(
      process.env.DATABASE_URL,
      process.env.DIRECT_URL,
    );
    process.env.DATABASE_URL = pooledUrl;
    process.env.DIRECT_URL = directUrl;
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
  const databaseUrl = config.databaseUrl?.trim();
  if (!databaseUrl) return;
  const { pooledUrl, directUrl } = resolveDatabaseUrls(databaseUrl, config.directUrl);
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      existing = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
    }
  } catch {
    existing = {};
  }
  fs.writeFileSync(
    CONFIG_PATH,
    `${JSON.stringify({ ...existing, databaseUrl: pooledUrl, directUrl }, null, 2)}\n`,
    "utf8",
  );
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
