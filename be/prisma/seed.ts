import { PrismaClient } from "@prisma/client";
import { seedDefaultScenario } from "../src/database/seed/default-scenario";
import { seedRaces } from "../src/database/seed/races";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await seedDefaultScenario(prisma);
  await seedRaces(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
