// Seeds or resets a login (email + password). Run inside the api container:
//   docker exec ms_project-api-1 pnpm exec tsx scripts/create-user.mts email@example.com 'password'
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth.js";

const [, , emailArg, password] = process.argv;
if (!emailArg || !password) {
  console.error("Usage: tsx scripts/create-user.mts <email> <password>");
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const passwordHash = hashPassword(password);

const user = await prisma.user.upsert({
  where: { email },
  update: { passwordHash },
  create: { email, passwordHash },
});

console.log(`Utilisateur prêt : ${user.email}`);
process.exit(0);
