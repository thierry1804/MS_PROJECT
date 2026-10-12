export function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function deriveProjectCode(name: string): string {
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 8);
  }
  return trimmed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "PRJ";
}
