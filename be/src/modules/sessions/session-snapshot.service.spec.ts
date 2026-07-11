import { SessionSnapshotService } from "./session-snapshot.service";

describe("SessionSnapshotService query shape", () => {
  it.each(["buildSnapshot", "buildDetail"] as const)(
    "%s selects only participant assignment identifiers",
    async (method) => {
      const queryError = new Error("query captured");
      const findFirst = jest.fn().mockRejectedValue(queryError);
      const runtime = {
        prisma: {
          session: { findFirst },
          measureQueries: jest.fn(async (operation: () => Promise<unknown>) => ({
            result: await operation(),
            metrics: null,
          })),
        },
      };
      const service = new SessionSnapshotService();

      await expect(service[method](runtime as never, "session-1")).rejects.toBe(queryError);

      expect(findFirst).toHaveBeenCalledTimes(1);
      const query = findFirst.mock.calls[0][0];
      expect(query.where).toEqual({
        OR: [{ id: "session-1" }, { publicId: "session-1" }],
      });
      expect(query.include.participants.include.sessionCharacter).toEqual({
        select: {
          id: true,
          characterId: true,
        },
      });
    },
  );
});
