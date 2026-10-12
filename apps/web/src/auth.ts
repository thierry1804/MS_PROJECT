import { apiUrl } from "./api-url";

export type Role = "admin" | "member";

export interface AuthUser {
  email: string | null;
  role: Role;
}

/** Populated by fetchMe()/login() so Shell/UsersView can read the role without re-plumbing the store. */
let currentUser: AuthUser = { email: null, role: "admin" };

export function getCurrentUser(): AuthUser {
  return currentUser;
}

/** null = not logged in. Throws only on an unexpected server error. */
export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch(apiUrl("/api/auth/me"));
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/auth/me → ${res.status}`);
  const user = (await res.json()) as AuthUser;
  currentUser = user;
  return user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Connexion impossible.");
  }
  const user = (await res.json()) as AuthUser;
  currentUser = user;
  return user;
}

export async function logout(): Promise<void> {
  await fetch(apiUrl("/api/auth/logout"), { method: "POST" });
}

/** Best-effort presence ping — never throws, must not disrupt navigation. */
export async function sendHeartbeat(path: string): Promise<void> {
  try {
    await fetch(apiUrl("/api/auth/heartbeat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  } catch {
    // ignore — presence tracking is not allowed to break the app
  }
}
