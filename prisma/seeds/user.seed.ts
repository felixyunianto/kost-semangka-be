import { PrismaClient, Role } from "@prisma/client";
import * as argon2 from "argon2";

export async function seedUsers(prisma: PrismaClient) {
  const password = await argon2.hash("Admin123!");

  await prisma.user.upsert({
    where: {
      email: "admin@gmail.com",
    },
    update: {},
    create: {
      email: "admin@gmail.com",
      password,
      fullName: "System Owner",
      role: Role.OWNER,
      phone: "081234567890",
    },
  });

  console.log("✅ Owner seeded");
}
