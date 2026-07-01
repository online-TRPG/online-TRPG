import type { PrismaClient } from "@prisma/client";
import { resolveCharacterSpellSelectionRequirements } from "@trpg/srd-data/rules";
import { seedClasses } from "./classes";

describe("class seed", () => {
  it("seeds SRD-compatible starting spell requirements", async () => {
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

    const seededSpellCounts = Object.fromEntries(
      classUpserts.map((upsert) => [
        upsert.where.key,
        {
          cantrips: upsert.create.startingCantripCount,
          spells: upsert.create.startingSpellCount,
        },
      ]),
    );
    const expectedSpellCounts = Object.fromEntries(
      classUpserts.map((upsert) => {
        const expected = resolveCharacterSpellSelectionRequirements({
          classKey: upsert.where.key,
          level: 1,
        });
        return [
          upsert.where.key,
          {
            cantrips: expected.cantripCount,
            spells: expected.knownOrSpellbookSpellCount,
          },
        ];
      }),
    );

    expect(
      seededSpellCounts,
    ).toEqual(expectedSpellCounts);
  });
});
