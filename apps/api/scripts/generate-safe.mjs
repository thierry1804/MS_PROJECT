import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaArg = process.argv[2] ?? "prisma/schema.sqlite.prisma";

const isSqlite = schemaArg.includes("sqlite");
const clientMarker = isSqlite
  ? path.join(apiRoot, "src/generated/sqlite-client/index.js")
  : path.join(apiRoot, "node_modules/@prisma/client/index.js");

function clientExists() {
  return existsSync(clientMarker);
}

try {
  execSync(`pnpm exec prisma generate --schema=${schemaArg}`, {
    cwd: apiRoot,
    stdio: "inherit",
  });
} catch (err) {
  const stderr = String(err.stderr ?? "");
  const locked = stderr.includes("EPERM") || stderr.includes("operation not permitted");
  if (locked && clientExists()) {
    console.warn(
      `[db:generate] Client Prisma déjà généré — poursuite du build. Arrêtez l'API pour régénérer.`,
    );
    process.exit(0);
  }
  process.exit(typeof err.status === "number" ? err.status : 1);
}
