import type { AppPrismaClient } from "./db.js";
import { hashPassword } from "./auth.js";

export interface WireUser {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "member";
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lastSeenAt: string | null;
  lastSeenIp: string | null;
  lastSeenPath: string | null;
}

function toWire(u: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  lastSeenAt: Date | null;
  lastSeenIp: string | null;
  lastSeenPath: string | null;
}): WireUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role === "admin" ? "admin" : "member",
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lastLoginIp: u.lastLoginIp,
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
    lastSeenIp: u.lastSeenIp,
    lastSeenPath: u.lastSeenPath,
  };
}

export async function listUsers(prisma: AppPrismaClient): Promise<WireUser[]> {
  const rows = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toWire);
}

export class UserError extends Error {}

export async function createUser(
  prisma: AppPrismaClient,
  input: { email: string; password: string; name?: string; role?: "admin" | "member" },
): Promise<WireUser> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) throw new UserError("Email et mot de passe requis.");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new UserError("Un utilisateur avec cet email existe déjà.");
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hashPassword(input.password),
      name: input.name?.trim() || null,
      role: input.role === "admin" ? "admin" : "member",
    },
  });
  return toWire(user);
}

export async function updateUser(
  prisma: AppPrismaClient,
  id: string,
  input: { name?: string; role?: "admin" | "member"; password?: string },
): Promise<WireUser> {
  if (input.role && input.role !== "admin" && input.role !== "member") {
    throw new UserError("Rôle invalide.");
  }
  if (input.role === "member") {
    const target = await prisma.user.findUnique({ where: { id } });
    if (target?.role === "admin") {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) throw new UserError("Impossible de retirer le dernier administrateur.");
    }
  }
  const user = await prisma.user.update({
    where: { id },
    data: {
      name: input.name === undefined ? undefined : input.name.trim() || null,
      role: input.role,
      passwordHash: input.password ? hashPassword(input.password) : undefined,
    },
  });
  return toWire(user);
}

export async function deleteUser(prisma: AppPrismaClient, id: string, actingUserId: string): Promise<void> {
  if (id === actingUserId) throw new UserError("Impossible de supprimer son propre compte.");
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new UserError("Utilisateur introuvable.");
  if (target.role === "admin") {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount <= 1) throw new UserError("Impossible de supprimer le dernier administrateur.");
  }
  await prisma.user.delete({ where: { id } });
}
