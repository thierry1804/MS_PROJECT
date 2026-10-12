import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Prefer AUTH_SECRET from the environment (apps/api/.env — persists across image
// rebuilds). The data/ dir is NOT a docker volume: a secret written only there is
// regenerated on every rebuild, silently invalidating every existing session cookie
// (signatures no longer verify) and forcing a full re-login — this bit a real user,
// so .env is now the primary source and the file is only a same-boot fallback.
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const SECRET_PATH = path.join(DATA_DIR, "auth-secret.txt");

function loadOrCreateSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  try {
    if (fs.existsSync(SECRET_PATH)) return fs.readFileSync(SECRET_PATH, "utf8").trim();
  } catch {
    // fall through to generating a fresh one
  }
  const secret = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SECRET_PATH, secret, "utf8");
  } catch {
    // worst case: a secret that doesn't survive restart, sessions just get invalidated
  }
  return secret;
}

const SECRET = loadOrCreateSecret();

export const SESSION_COOKIE_NAME = "atelier_session";
const SESSION_HOURS = 8;
export const SESSION_MAX_AGE_SECONDS = SESSION_HOURS * 60 * 60;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function createSessionToken(userId: string): string {
  const expires = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresStr, sig] = parts;
  const payload = `${userId}.${expiresStr}`;
  const expected = sign(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;
  return userId;
}

export function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = Array.isArray(header) ? header.join("; ") : header;
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(value);
      } catch {
        out[key] = value;
      }
    }
  }
  return out;
}

export function serializeSessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
