import { ScenarioNodeType } from "@trpg/shared-types";
import { SessionsService } from "./sessions.service";

describe("SessionsService player scenario mapping", () => {
  const service = Object.create(SessionsService.prototype) as {
    mapPlayerScenarioNode: (
      node: {
        id: string;
        nodeType: string;
        title: string;
        sceneText: string;
        imageUrl: string | null;
        checkOptionsJson: string;
        cluesJson: string;
      },
      revealedClueSnapshots: Map<string, Record<string, unknown>>,
    ) => {
      checkOptions: Array<Record<string, unknown>>;
      nodeType: ScenarioNodeType;
    };
  };

  it("projects check options to player-safe fields", () => {
    const node = service.mapPlayerScenarioNode(
      {
        id: "node-1",
        nodeType: ScenarioNodeType.EXPLORATION,
        title: "Locked Door",
        sceneText: "A locked door bars the way.",
        imageUrl: null,
        checkOptionsJson: JSON.stringify([
          {
            id: "pick_lock",
            type: "skill_check",
            skill: "sleight_of_hand",
            label: "Pick the lock",
            dc: 17,
            note: "Only reveal the trap after a failed roll.",
            hiddenTarget: "trap_trigger",
            revealTrigger: "failure",
          },
          {
            dc: 20,
            note: "GM-only option without a player label",
          },
        ]),
        cluesJson: JSON.stringify([]),
      },
      new Map(),
    );

    expect(node.checkOptions).toEqual([
      {
        id: "pick_lock",
        type: "skill_check",
        skill: "sleight_of_hand",
        label: "Pick the lock",
      },
    ]);
  });

  it("prefers explicit player labels over GM labels", () => {
    const node = service.mapPlayerScenarioNode(
      {
        id: "node-1",
        nodeType: ScenarioNodeType.EXPLORATION,
        title: "Library",
        sceneText: "Dusty shelves surround you.",
        imageUrl: null,
        checkOptionsJson: JSON.stringify([
          {
            id: "inspect_shelf",
            skill: "investigation",
            label: "GM label",
            playerLabel: "Search the shelves",
          },
        ]),
        cluesJson: JSON.stringify([]),
      },
      new Map(),
    );

    expect(node.checkOptions[0]).toMatchObject({ label: "Search the shelves" });
  });
});
