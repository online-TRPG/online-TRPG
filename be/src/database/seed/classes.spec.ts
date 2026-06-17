import type { PrismaClient } from "@prisma/client";
import { seedClasses } from "./classes";

describe("class seed", () => {
  it("keeps starting spell requirements within the executable MVP spell picker pool", async () => {
    const classUpserts: Array<{
      where: { key: string };
      create: { startingCantripCount: number; startingSpellCount: number };
    }> = [];
    const prisma = {
      classDefinition: {
        upsert: jest.fn(async (args: {
          where: { key: string };
          create: { startingCantripCount: number; startingSpellCount: number };
        }) => {
          classUpserts.push(args);
        }),
      },
    } as unknown as PrismaClient;

    await seedClasses(prisma);

    const spellcastingClasses = new Set(["bard", "cleric", "druid", "sorcerer", "warlock", "wizard"]);
    const seededSpellcasters = classUpserts.filter((upsert) => spellcastingClasses.has(upsert.where.key));

    expect(seededSpellcasters.map((upsert) => upsert.where.key).sort()).toEqual(
      Array.from(spellcastingClasses).sort(),
    );
    expect(seededSpellcasters.every((upsert) => upsert.create.startingCantripCount <= 3)).toBe(true);
    expect(seededSpellcasters.every((upsert) => upsert.create.startingSpellCount <= 3)).toBe(true);
  });
});
