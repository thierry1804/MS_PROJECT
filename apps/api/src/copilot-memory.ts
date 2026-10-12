import type { PrismaClient } from "@prisma/client";

export interface WireCopilotMemory {
  preferences: Record<string, unknown>;
  disambiguations: { phrase: string; entityId: string; entityType: string; count: number }[];
  episodes: unknown[];
  questionStats: Record<string, { asked: number; answered: number; skipped: number }>;
  revision: number;
  updatedAt?: string;
}

const EMPTY: WireCopilotMemory = {
  preferences: {},
  disambiguations: [],
  episodes: [],
  questionStats: {},
  revision: 0,
};

function toWire(row: {
  preferences: unknown;
  disambiguations: unknown;
  episodes: unknown;
  questionStats: unknown;
  revision: number;
  updatedAt: Date;
}): WireCopilotMemory {
  return {
    preferences: (row.preferences as Record<string, unknown>) ?? {},
    disambiguations: (row.disambiguations as WireCopilotMemory["disambiguations"]) ?? [],
    episodes: (row.episodes as unknown[]) ?? [],
    questionStats: (row.questionStats as WireCopilotMemory["questionStats"]) ?? {},
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getCopilotMemory(prisma: PrismaClient): Promise<WireCopilotMemory> {
  let row = await prisma.copilotMemory.findUnique({ where: { portfolioId: "default" } });
  if (!row) {
    row = await prisma.copilotMemory.create({
      data: { portfolioId: "default" },
    });
  }
  return toWire(row);
}

export class CopilotMemoryConflictError extends Error {
  currentRevision: number;
  constructor(currentRevision: number) {
    super("Révision obsolète");
    this.currentRevision = currentRevision;
  }
}

export async function replaceCopilotMemory(
  prisma: PrismaClient,
  body: Partial<WireCopilotMemory> & { revision: number },
): Promise<WireCopilotMemory> {
  const current = await getCopilotMemory(prisma);
  if (body.revision !== current.revision) {
    throw new CopilotMemoryConflictError(current.revision);
  }

  const row = await prisma.copilotMemory.update({
    where: { portfolioId: "default" },
    data: {
      preferences: (body.preferences ?? current.preferences) as object,
      disambiguations: (body.disambiguations ?? current.disambiguations) as object,
      episodes: (body.episodes ?? current.episodes) as object,
      questionStats: (body.questionStats ?? current.questionStats) as object,
      revision: current.revision + 1,
    },
  });
  return toWire(row);
}

export async function mergeCopilotMemory(local: PrismaClient, cloud: PrismaClient): Promise<void> {
  const [localMem, cloudMem] = await Promise.all([getCopilotMemory(local), getCopilotMemory(cloud)]);

  const episodeMap = new Map<string, unknown>();
  for (const e of [...(cloudMem.episodes as { id?: string }[]), ...(localMem.episodes as { id?: string }[])]) {
    const id = (e as { id?: string }).id ?? JSON.stringify(e);
    episodeMap.set(id, e);
  }
  const episodes = [...episodeMap.values()].slice(0, 100);

  const disMap = new Map<string, WireCopilotMemory["disambiguations"][0]>();
  for (const d of [...localMem.disambiguations, ...cloudMem.disambiguations]) {
    const key = `${d.phrase}:${d.entityType}`;
    const prev = disMap.get(key);
    if (prev) disMap.set(key, { ...d, count: Math.max(prev.count, d.count) });
    else disMap.set(key, d);
  }

  const merged: WireCopilotMemory = {
    preferences: { ...cloudMem.preferences, ...localMem.preferences },
    disambiguations: [...disMap.values()],
    episodes,
    questionStats: { ...cloudMem.questionStats, ...localMem.questionStats },
    revision: Math.max(localMem.revision, cloudMem.revision) + 1,
  };

  await local.copilotMemory.upsert({
    where: { portfolioId: "default" },
    create: {
      portfolioId: "default",
      preferences: merged.preferences as object,
      disambiguations: merged.disambiguations as object,
      episodes: merged.episodes as object,
      questionStats: merged.questionStats as object,
      revision: merged.revision,
    },
    update: {
      preferences: merged.preferences as object,
      disambiguations: merged.disambiguations as object,
      episodes: merged.episodes as object,
      questionStats: merged.questionStats as object,
      revision: merged.revision,
    },
  });

  await cloud.copilotMemory.upsert({
    where: { portfolioId: "default" },
    create: {
      portfolioId: "default",
      preferences: merged.preferences as object,
      disambiguations: merged.disambiguations as object,
      episodes: merged.episodes as object,
      questionStats: merged.questionStats as object,
      revision: merged.revision,
    },
    update: {
      preferences: merged.preferences as object,
      disambiguations: merged.disambiguations as object,
      episodes: merged.episodes as object,
      questionStats: merged.questionStats as object,
      revision: merged.revision,
    },
  });
}

export async function resetCopilotMemory(prisma: PrismaClient): Promise<WireCopilotMemory> {
  const row = await prisma.copilotMemory.upsert({
    where: { portfolioId: "default" },
    create: { portfolioId: "default" },
    update: {
      preferences: {},
      disambiguations: [],
      episodes: [],
      questionStats: {},
      revision: { increment: 1 },
    },
  });
  return toWire(row);
}
