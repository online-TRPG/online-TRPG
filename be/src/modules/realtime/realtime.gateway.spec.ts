import { VTT_MAP_DELTA_V2_CAPABILITY } from "@trpg/shared-types";
import { RealtimeGateway } from "./realtime.gateway";

describe("RealtimeGateway VTT delta capability", () => {
  const createHarness = () => {
    const realtimeEvents = {
      getRoomName: jest.fn((sessionId: string) => `session:${sessionId}`),
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
      getUserEntityOrThrow: jest.fn().mockResolvedValue({ id: "user-1" }),
    };
    const client = {
      id: "socket-1",
      handshake: {
        headers: {},
        auth: { userId: "user-1" },
      },
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
    };
    const gateway = new RealtimeGateway(
      realtimeEvents as never,
      sessionsService as never,
      usersService as never,
    );
    return { gateway, client, sessionsService };
  };

  it("joins v2 capability rooms and sends the initial snapshot", async () => {
    const { gateway, client } = createHarness();

    await gateway.handleSessionJoin(client as never, {
      sessionId: "session-1",
      capabilities: [VTT_MAP_DELTA_V2_CAPABILITY],
    });

    expect(client.join).toHaveBeenCalledWith("session:session-1:vtt-delta-v2");
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
});
