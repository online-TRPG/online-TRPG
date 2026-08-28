import { VTT_MAP_DELTA_V2_CAPABILITY } from "@trpg/shared-types";
import { createAccessToken } from "../../common/auth/token.utils";
import { RealtimeGateway } from "./realtime.gateway";

describe("RealtimeGateway VTT delta capability", () => {
  const createHarness = () => {
    const realtimeEvents = {
      getRoomName: jest.fn((sessionId: string) => `session:${sessionId}`),
      getAuthenticatedUserRoomName: jest.fn((userId: string) => `auth:user:${userId}`),
      getUserRoomName: jest.fn(
        (sessionId: string, userId: string) => `session:${sessionId}:user:${userId}`,
      ),
      getVttDeltaRoomName: jest.fn(
        (sessionId: string) => `session:${sessionId}:vtt-delta-v2`,
      ),
      getUserVttDeltaRoomName: jest.fn(
        (sessionId: string, userId: string) =>
          `session:${sessionId}:user:${userId}:vtt-delta-v2`,
      ),
    };
    const sessionsService = {
      ensureMembership: jest.fn().mockResolvedValue(undefined),
      ensureActivePlayAccess: jest.fn().mockResolvedValue(undefined),
      updateParticipantConnectionStatus: jest.fn().mockResolvedValue(undefined),
      buildSnapshot: jest.fn().mockResolvedValue({ session: { id: "session-1" } }),
    };
    const usersService = {
      getUserEntityOrThrow: jest.fn().mockResolvedValue({ id: "user-1", tokenVersion: 0 }),
    };
    const client = {
      id: "socket-1",
      handshake: {
        headers: {},
        auth: { accessToken: createAccessToken("user-1") },
      },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
    };
    const gateway = new RealtimeGateway(
      realtimeEvents as never,
      sessionsService as never,
      usersService as never,
    );
    return { gateway, client, sessionsService, usersService };
  };

  it("joins v2 capability rooms and sends the initial snapshot", async () => {
    const { gateway, client } = createHarness();

    await gateway.handleSessionJoin(client as never, {
      sessionId: "session-1",
      capabilities: [VTT_MAP_DELTA_V2_CAPABILITY],
    });

    expect(client.join).toHaveBeenCalledWith("session:session-1:vtt-delta-v2");
    expect(client.join).toHaveBeenCalledWith("auth:user:user-1");
    expect(client.join).toHaveBeenCalledWith(
      "session:session-1:user:user-1:vtt-delta-v2",
    );
    expect(client.emit).toHaveBeenCalledWith(
      "session.snapshot",
      expect.objectContaining({ sessionId: "session-1" }),
    );
  });

  it("allows a joined client to request a full snapshot resync", async () => {
    const { gateway, client, sessionsService } = createHarness();
    await gateway.handleSessionJoin(client as never, {
      sessionId: "session-1",
      capabilities: [VTT_MAP_DELTA_V2_CAPABILITY],
    });
    client.emit.mockClear();

    await gateway.handleSessionResync(client as never, { sessionId: "session-1" });

    expect(sessionsService.buildSnapshot).toHaveBeenCalledWith("session-1");
    expect(client.emit).toHaveBeenCalledWith(
      "session.snapshot",
      expect.objectContaining({ sessionId: "session-1" }),
    );
  });

  it("does not accept a client supplied userId as authentication", async () => {
    const { gateway, client } = createHarness();
    client.handshake.auth = { userId: "user-1" } as never;

    await expect(
      gateway.handleSessionJoin(client as never, {
        sessionId: "session-1",
        capabilities: [],
      }),
    ).rejects.toThrow("Authentication required.");

    expect(client.join).not.toHaveBeenCalled();
  });

  it("rejects a socket token issued for an older token version", async () => {
    const { gateway, client } = createHarness();
    client.handshake.auth = { accessToken: createAccessToken("user-1", null, 1) };

    await expect(
      gateway.handleSessionJoin(client as never, {
        sessionId: "session-1",
        capabilities: [],
      }),
    ).rejects.toThrow("Authentication required.");
  });

  it("stops authorizing an existing socket after its token version changes", async () => {
    const { gateway, client, usersService } = createHarness();
    await gateway.handleSessionJoin(client as never, {
      sessionId: "session-1",
      capabilities: [],
    });
    usersService.getUserEntityOrThrow.mockResolvedValue({ id: "user-1", tokenVersion: 1 });

    await expect(
      gateway.handleSessionResync(client as never, { sessionId: "session-1" }),
    ).rejects.toThrow("Authentication required.");
  });

  it("limits repeated session joins before unbounded work", async () => {
    const { gateway, client } = createHarness();
    for (let index = 0; index < 30; index += 1) {
      await gateway.handleSessionJoin(client as never, {
        sessionId: "session-1",
        capabilities: [],
      });
    }

    await expect(
      gateway.handleSessionJoin(client as never, {
        sessionId: "session-1",
        capabilities: [],
      }),
    ).rejects.toThrow("Rate limit exceeded");
  });
});
