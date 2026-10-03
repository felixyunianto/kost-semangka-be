import { PrismaClient } from "@prisma/client";

import { seedUsers } from "./seeds/user.seed";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Start seeding...");

  await seedUsers(prisma);

  console.log("✅ Seeding completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
