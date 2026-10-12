import { apiUrl } from "./api-url";
import type { Role } from "./auth";

export interface WireUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lastSeenAt: string | null;
  lastSeenIp: string | null;
  lastSeenPath: string | null;
}

async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? fallback);
  }
  return (await res.json()) as T;
}

export async function fetchUsers(): Promise<WireUser[]> {
  return unwrap(await fetch(apiUrl("/api/users")), `GET /api/users a échoué`);
}

export async function createUser(input: { email: string; password: string; name?: string; role?: Role }): Promise<WireUser> {
  return unwrap(
    await fetch(apiUrl("/api/users"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Création impossible.",
  );
}

export async function updateUser(
  id: string,
  input: { name?: string; role?: Role; password?: string },
): Promise<WireUser> {
  return unwrap(
    await fetch(apiUrl(`/api/users/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Modification impossible.",
  );
}

export async function deleteUser(id: string): Promise<void> {
  await unwrap(await fetch(apiUrl(`/api/users/${id}`), { method: "DELETE" }), "Suppression impossible.");
}

export async function fetchProjectAccess(userId: string): Promise<string[]> {
  const data = await unwrap<{ projectIds: string[] }>(
    await fetch(apiUrl(`/api/users/${userId}/project-access`)),
    "Lecture des accès impossible.",
  );
  return data.projectIds;
}

export async function setProjectAccess(userId: string, projectIds: string[]): Promise<void> {
  await unwrap(
    await fetch(apiUrl(`/api/users/${userId}/project-access`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds }),
    }),
    "Mise à jour des accès impossible.",
  );
}
