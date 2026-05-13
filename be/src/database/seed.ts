// Seed entrypoint.
// `prisma db seed` 가 호출 (package.json#prisma.seed). prod 이미지엔 tsx/src 가 없으므로
// 이 파일은 nest build 산출물(dist/database/seed.js)로 컴파일되어 node 로 직접 실행된다.
// 로컬에서 호스트 직접 호출 시에도 먼저 `npm run build -w @trpg/be` 필요.

import { PrismaClient } from "@prisma/client";
import { seedClasses } from "./seed/classes";
import { seedDefaultScenario } from "./seed/default-scenario";
import { seedItems } from "./seed/items";
import { seedRaces } from "./seed/races";

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
