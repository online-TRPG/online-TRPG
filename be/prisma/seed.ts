import { PrismaClient } from "@prisma/client";
import { seedBlackWellDemoScenario } from "../src/database/seed/black-well-demo";
import { seedDefaultScenario } from "../src/database/seed/default-scenario";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await seedDefaultScenario(prisma);
  await seedBlackWellDemoScenario(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
