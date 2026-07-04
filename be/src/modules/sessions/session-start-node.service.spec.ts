import { SessionStartNodeService } from "./session-start-node.service";

describe("SessionStartNodeService", () => {
  const service = new SessionStartNodeService();

  it("returns null when the scenario has no nodes", () => {
    expect(service.resolveStartNodeId([], "node-a")).toBeNull();
  });

  it("uses the only root node even when a non-root start node is requested", () => {
    expect(
      service.resolveStartNodeId(
        [
          { id: "node-a", transitionsJson: JSON.stringify([{ nextNodeId: "node-b" }]) },
          { id: "node-b", transitionsJson: "[]" },
        ],
        "node-b",
      ),
    ).toBe("node-a");
  });

  it("uses a requested start node when multiple roots exist", () => {
    expect(
      service.resolveStartNodeId(
        [
          { id: "node-a", transitionsJson: "[]" },
          { id: "node-b", transitionsJson: "[]" },
        ],
        "node-b",
      ),
    ).toBe("node-b");
  });

  it("falls back to the first node when no single root or valid request exists", () => {
    expect(
      service.resolveStartNodeId(
        [
          { id: "node-a", transitionsJson: "[]" },
          { id: "node-b", transitionsJson: "[]" },
        ],
        "missing-node",
      ),
    ).toBe("node-a");
  });

  it("ignores invalid transition JSON while detecting roots", () => {
    expect(
      service.resolveStartNodeId(
        [
          { id: "node-a", transitionsJson: "{bad json" },
          { id: "node-b", transitionsJson: JSON.stringify([{ nextNodeId: "node-a" }]) },
        ],
        null,
      ),
    ).toBe("node-b");
  });
});
