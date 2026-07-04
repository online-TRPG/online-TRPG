import { ConflictException } from "@nestjs/common";
import { SessionStatus as PrismaSessionStatus } from "@prisma/client";
import { SessionDeletePolicyService } from "./session-delete-policy.service";

describe("SessionDeletePolicyService", () => {
  const service = new SessionDeletePolicyService();

  it("allows recruiting sessions to be deleted", () => {
    expect(() => service.ensureCanDelete(PrismaSessionStatus.RECRUITING)).not.toThrow();
  });

  it.each([
    PrismaSessionStatus.PLAYING,
    PrismaSessionStatus.PAUSED,
    PrismaSessionStatus.COMPLETED,
    PrismaSessionStatus.DISBANDED,
  ])("rejects %s sessions", (status) => {
    expect(() => service.ensureCanDelete(status)).toThrow(ConflictException);
  });
});
