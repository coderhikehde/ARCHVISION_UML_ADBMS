import { PrismaClient } from "./lib/generated/prisma/client/index.js";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@archvision.ai" },
    update: {},
    create: {
      id: "demo-user",
      name: "Demo Explorer",
      email: "demo@archvision.ai",
      emailVerified: new Date(),
    },
  });
  console.log("✅ Demo user created in Neon Database:", user);
}

main()
  .catch((e) => console.error("Error seeding:", e))
  .finally(() => prisma.$disconnect());
