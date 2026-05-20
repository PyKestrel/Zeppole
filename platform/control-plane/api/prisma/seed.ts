/**
 * Optional seed for development. Prefer `/api/v1/auth/bootstrap` in production.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("Seed skipped: users already exist.");
    return;
  }
  const password = process.env.ZEPPOLE_SEED_ADMIN_PASSWORD ?? "ChangeMeZeppole!";
  const hash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email: (process.env.ZEPPOLE_SEED_ADMIN_EMAIL ?? "admin@zeppole.local").toLowerCase(),
      passwordHash: hash,
      role: "ADMIN",
      name: "Zeppole Admin",
    },
  });
  console.log("Seed: created admin user (check ZEPPOLE_SEED_ADMIN_PASSWORD).");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
