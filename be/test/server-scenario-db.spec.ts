import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../.env.backend") });

const shouldRunServerDbTests = process.env.RUN_SERVER_DB_TESTS === "1";
const serverDatabaseUrl = process.env.SERVER_DATABASE_URL?.trim();

describe("server PostgreSQL scenario read", () => {
  jest.setTimeout(30_000);

  if (!shouldRunServerDbTests) {
    it.skip("runs only through npm run test:server-db", () => undefined);
    return;
  }

  let prisma: PrismaClient;

  beforeAll(async () => {
    if (!serverDatabaseUrl) {
      throw new Error(
        "SERVER_DATABASE_URL is required. Example: SERVER_DATABASE_URL=postgresql://user:password@host:5432/db?schema=public",
      );
    }

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: serverDatabaseUrl,
        },
      },
    });

    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("fetches Scenario rows from the server PostgreSQL database", async () => {
    const scenarios = await prisma.scenario.findMany({
      select: {
        id: true,
        title: true,
        startNodeId: true,
        ruleSetId: true,
        sourceType: true,
        license: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      take: 10,
    });

    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios[0].id).toEqual(expect.any(String));
    expect(scenarios[0].title).toEqual(expect.any(String));

    console.info(
      "Server Scenario rows:",
      scenarios.map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        startNodeId: scenario.startNodeId,
      })),
    );
  });
});
