// Emergency/bootstrap tool only — ordinary role changes should go through the
// admin "Utilisateurs" UI once at least one admin account exists. Run inside
// the api container:
//   docker exec ms_project-api-1 pnpm exec tsx scripts/set-role.mts email@example.com admin
import { prisma } from "../src/db.js";

const [, , emailArg, roleArg] = process.argv;
if (!emailArg || (roleArg !== "admin" && roleArg !== "member")) {
  console.error("Usage: tsx scripts/set-role.mts <email> <admin|member>");
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const user = await prisma.user.update({ where: { email }, data: { role: roleArg } });
console.log(`${user.email} est maintenant "${user.role}".`);
process.exit(0);
