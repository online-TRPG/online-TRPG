import { ConflictException } from "@nestjs/common";
import { SessionPublicIdService } from "./session-public-id.service";

describe("SessionPublicIdService", () => {
  const prisma = {
    session: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const service = new SessionPublicIdService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an existing public id without writing", async () => {
    await expect(service.ensure({ id: "session-1", publicId: "12345678" })).resolves.toEqual({
      id: "session-1",
      publicId: "12345678",
    });
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it("allocates a missing public id on the session", async () => {
    prisma.session.update.mockResolvedValue({ publicId: "87654321" });

    await expect(service.ensure({ id: "session-1", publicId: null })).resolves.toEqual({
      id: "session-1",
      publicId: "87654321",
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { publicId: expect.stringMatching(/^\d{8}$/) },
      select: { publicId: true },
    });
  });

  it("retries public id allocation after an update collision", async () => {
    prisma.session.update
      .mockRejectedValueOnce(new Error("unique collision"))
      .mockResolvedValueOnce({ publicId: "22222222" });

    await expect(service.ensure({ id: "session-1", publicId: null })).resolves.toMatchObject({
      publicId: "22222222",
    });
    expect(prisma.session.update).toHaveBeenCalledTimes(2);
  });

  it("generates an unused public id", async () => {
    prisma.session.findUnique.mockResolvedValue(null);

    await expect(service.generate()).resolves.toMatch(/^\d{8}$/);
    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { publicId: expect.stringMatching(/^\d{8}$/) },
      select: { id: true },
    });
  });

  it("fails after repeated public id collisions", async () => {
    prisma.session.findUnique.mockResolvedValue({ id: "existing-session" });

    await expect(service.generate()).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.session.findUnique).toHaveBeenCalledTimes(10);
  });
});
