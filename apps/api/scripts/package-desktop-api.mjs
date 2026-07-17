import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.join(apiRoot, "../..");
const out = path.join(apiRoot, "dist/desktop-api");

if (existsSync(out)) rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });

execSync("pnpm db:generate:desktop", { cwd: apiRoot, stdio: "inherit" });
execSync(`pnpm --filter @atelier/api deploy "${out}" --legacy --config.ignore-scripts=true`, {
  cwd: monorepoRoot,
  stdio: "inherit",
});
execSync("pnpm exec prisma generate && pnpm exec prisma generate --schema=prisma/schema.sqlite.prisma", {
  cwd: out,
  stdio: "inherit",
  shell: true,
});

console.log(`Desktop API bundle ready in ${out}`);
