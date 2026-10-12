export type ScoreZone = "low" | "mid" | "high";

/** Aligné sur RaidView.scoreZone : ≥15 high, ≥7 mid. */
export function scoreZone(score: number): ScoreZone {
  if (score >= 15) return "high";
  if (score >= 7) return "mid";
  return "low";
}

export function riskScore(probability: number, impact: number): number {
  return probability * impact;
}

export function clampScore(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n)));
}
