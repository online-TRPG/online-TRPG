import { ForbiddenException } from "@nestjs/common";
import { GmMode as PrismaGmMode } from "@prisma/client";
import { SessionAccessPolicyService } from "./session-access-policy.service";

describe("SessionAccessPolicyService", () => {
  const service = new SessionAccessPolicyService();

  it("allows only the host for host-only actions", () => {
    expect(() => service.ensureHost("host-user", "host-user")).not.toThrow();
    expect(() => service.ensureHost("other-user", "host-user")).toThrow(ForbiddenException);
  });

  it("allows the host to use runtime controls in AI GM sessions", () => {
    const session = {
      hostUserId: "host-user",
      gmMode: PrismaGmMode.AI,
      gmUserId: null,
    };

    expect(service.canUseGmRuntimeControls("host-user", session)).toBe(true);
    expect(service.canUseGmRuntimeControls("gm-user", session)).toBe(false);
  });

  it("allows only the assigned GM operator in HUMAN GM sessions", () => {
    const session = {
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
      gmUserId: "gm-user",
    };

    expect(service.canUseGmRuntimeControls("gm-user", session)).toBe(true);
    expect(service.canUseGmRuntimeControls("host-user", session)).toBe(false);
    expect(() => service.ensureGmRuntimeOperator("host-user", session)).toThrow(ForbiddenException);
  });

  it("falls back to host as HUMAN GM operator when gmUserId is empty", () => {
    const session = {
      hostUserId: "host-user",
      gmMode: PrismaGmMode.HUMAN,
      gmUserId: null,
    };

    expect(service.canUseGmRuntimeControls("host-user", session)).toBe(true);
    expect(service.canSeeGmOnlyRuntimeData("host-user", session)).toBe(true);
    expect(service.canSeeGmOnlyRuntimeData("other-user", session)).toBe(false);
  });
});
