import { PrismaClient } from "@prisma/client";
import { seedClasses } from "../src/database/seed/classes";
import { seedDefaultScenario } from "../src/database/seed/default-scenario";
import { seedItems } from "../src/database/seed/items";
import { seedRaces } from "../src/database/seed/races";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await seedDefaultScenario(prisma);
  await seedRaces(prisma);
  await seedItems(prisma);
  await seedClasses(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
