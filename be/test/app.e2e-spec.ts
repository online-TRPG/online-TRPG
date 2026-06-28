import { ValidationPipe } from "@nestjs/common";
import { INestApplication } from "@nestjs/common/interfaces";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/database/prisma.service";
import {
  DEFAULT_SCENARIO_ID,
  P6_VALIDATION_SCENARIO_ID,
  RULE_RUNTIME_SMOKE_SCENARIO_ID,
  seedDefaultScenario,
} from "../src/database/seed/default-scenario";

const RULE_RUNTIME_SMOKE_NODE_SEQUENCE = [
  { id: "node_rule_smoke_rest", screenType: "STORY", phase: "dialogue" },
  { id: "node_rule_smoke_trap_save", screenType: "EXPLORATION", phase: "exploration" },
  { id: "node_rule_smoke_cover_combat", screenType: "COMBAT", phase: "combat" },
  { id: "node_rule_smoke_aoe", screenType: "COMBAT", phase: "combat" },
  { id: "node_rule_smoke_condition", screenType: "COMBAT", phase: "combat" },
  { id: "node_rule_smoke_human_gm", screenType: "STORY", phase: "dialogue" },
] as const;

describe("Session service e2e", () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let intentionalPublicSessionId: string | null = null;
  const createdGuestUserIds = new Set<string>();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix("api/v1");

    await app.init();
    await app.listen(0);

    prisma = app.get(PrismaService);
    await seedDefaultScenario(prisma);

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    try {
      if (prisma && createdGuestUserIds.size > 0) {
        const userIds = [...createdGuestUserIds];

        await prisma.$transaction(async (tx) => {
          await tx.session.deleteMany({
            where: { hostUserId: { in: userIds } },
          });
          await tx.user.deleteMany({
            where: { id: { in: userIds } },
          });
        });

        const [remainingUsers, remainingSessions] = await Promise.all([
          prisma.user.count({ where: { id: { in: userIds } } }),
          prisma.session.count({ where: { hostUserId: { in: userIds } } }),
        ]);

        if (remainingUsers !== 0 || remainingSessions !== 0) {
          throw new Error(
            `E2E cleanup failed: ${remainingUsers} users and ${remainingSessions} sessions remain`,
          );
        }
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it("creates a recruiting session with host, active session scenario, and lobby game state", async () => {
    const host = await createGuest("Host");

    const created = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.id)
      .send({
        title: "Goblin Cave",
        description: "ERD-aligned session",
        scenarioId: DEFAULT_SCENARIO_ID,
        ruleSetId: "dnd5e",
        maxParticipants: 4,
        gmMode: "AI",
        visibility: "PUBLIC",
      })
      .expect(201);

    expect(created.body.code).toBe("SESSION_201");
    expect(created.body.data.session.status).toBe("recruiting");
    expect(created.body.data.session.hostUserId).toBe(host.id);
    expect(created.body.data.session.visibility).toBe("PUBLIC");
    intentionalPublicSessionId = created.body.data.session.sessionId as string;
    expect(created.body.data.sessionScenarios).toHaveLength(1);
    expect(created.body.data.sessionScenarios[0].scenarioId).toBe(DEFAULT_SCENARIO_ID);
    expect(created.body.data.sessionScenarios[0].status).toBe("ACTIVE");
    expect(created.body.data.participants).toHaveLength(1);
    expect(created.body.data.participants[0].role).toBe("HOST");
    expect(created.body.data.state.phase).toBe("lobby");
    expect(created.body.data.state.currentNodeId).toBe("node_cave_entrance");

    const playerScenario = await request(baseUrl)
      .get(`/api/v1/sessions/${created.body.data.session.sessionId}/player-scenario`)
      .set("x-user-id", host.id)
      .expect(200);

    expect(playerScenario.body.data.currentNodeId).toBe("node_cave_entrance");
    expect(playerScenario.body.data.currentNode.id).toBe("node_cave_entrance");
    expect(playerScenario.body.data.visitedNodes.map((node: { id: string }) => node.id)).toEqual([
      "node_cave_entrance",
    ]);
    expect(playerScenario.body.data.currentNode.transitions).toBeUndefined();
    expect(playerScenario.body.data.currentNode.fallbackNodeId).toBeUndefined();
    expect(
      playerScenario.body.data.currentNode.publicClues.map((clue: { id: string }) => clue.id),
    ).toEqual(["clue_tracks"]);
  });

  it("supports join, character selection, ready flow, and session start", async () => {
    const host = await createGuest("Host");
    const guest = await createGuest("Guest");

    const hostCharacter = await createCharacter(host.id, {
      name: "Rhea",
      ancestry: "Human",
      className: "Fighter",
    });
    const guestCharacter = await createCharacter(guest.id, {
      name: "Lia",
      ancestry: "Elf",
      className: "Wizard",
      bio: "Prepared spellcaster",
      avatarType: "PRESET",
      avatarPresetId: "wizard-01",
    });

    const created = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.id)
      .send({
        title: "Party Up",
        scenarioId: DEFAULT_SCENARIO_ID,
        gmMode: "AI",
        maxParticipants: 2,
        visibility: "PRIVATE",
      })
      .expect(201);

    const sessionId = created.body.data.session.sessionId as string;
    const inviteCode = created.body.data.session.inviteCode as string;

    const publicSessions = await request(baseUrl)
      .get("/api/v1/sessions")
      .set("x-user-id", host.id)
      .expect(200);
    const listedSessionIds = publicSessions.body.data.content.map(
      (item: { session: { sessionId: string } }) => item.session.sessionId,
    );

    expect(intentionalPublicSessionId).not.toBeNull();
    expect(listedSessionIds).toContain(intentionalPublicSessionId as string);
    expect(listedSessionIds).not.toContain(sessionId);

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/character-selection`)
      .set("x-user-id", host.id)
      .send({ characterId: hostCharacter.id })
      .expect(200);

    await request(baseUrl)
      .post("/api/v1/sessions/join-by-invite")
      .set("x-user-id", guest.id)
      .send({ inviteCode })
      .expect(201);

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/character-selection`)
      .set("x-user-id", guest.id)
      .send({ characterId: guestCharacter.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.characterId).toBe(guestCharacter.id);
        expect(response.body.data.isReady).toBe(false);
      });

    await request(baseUrl)
      .get("/api/v1/users/me/characters")
      .set("x-user-id", guest.id)
      .expect(200)
      .expect((response) => {
        const selected = response.body.find((character: { id: string }) => character.id === guestCharacter.id);
        expect(selected.activeSessionId).toBe(sessionId);
        expect(selected.isSelectable).toBe(false);
        expect(selected.avatarType).toBe("PRESET");
      });

    await request(baseUrl)
      .patch(`/api/v1/sessions/${sessionId}/participants/me/ready`)
      .set("x-user-id", host.id)
      .send({ isReady: true })
      .expect(200);

    await request(baseUrl)
      .patch(`/api/v1/sessions/${sessionId}/participants/me/ready`)
      .set("x-user-id", guest.id)
      .send({ isReady: true })
      .expect(200);

    const started = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/start`)
      .set("x-user-id", host.id)
      .expect(201);

    expect(started.body.data.session.status).toBe("playing");
    expect(started.body.data.state.phase).toBe("exploration");
    expect(started.body.data.sessionCharacters).toHaveLength(2);

    await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}/characters`)
      .set("x-user-id", host.id)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(2);
        expect(response.body[0].userId).toBeDefined();
      });
  });

  it("releases assigned characters and transfers host when a recruiting participant leaves", async () => {
    const host = await createGuest("Host");
    const guest = await createGuest("Guest");
    const guestCharacter = await createCharacter(guest.id, {
      name: "Mira",
      ancestry: "Dwarf",
      className: "Cleric",
    });

    const created = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.id)
      .send({
        title: "Leave Flow",
        scenarioId: DEFAULT_SCENARIO_ID,
        gmMode: "AI",
        maxParticipants: 2,
        visibility: "PRIVATE",
      })
      .expect(201);

    const sessionId = created.body.data.session.sessionId as string;
    const inviteCode = created.body.data.session.inviteCode as string;

    await request(baseUrl)
      .post("/api/v1/sessions/join-by-invite")
      .set("x-user-id", guest.id)
      .send({ inviteCode })
      .expect(201);

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/character-selection`)
      .set("x-user-id", guest.id)
      .send({ characterId: guestCharacter.id })
      .expect(200);

    await request(baseUrl)
      .delete(`/api/v1/sessions/${sessionId}/leave`)
      .set("x-user-id", guest.id)
      .expect(204);

    await request(baseUrl)
      .get(`/api/v1/characters/${guestCharacter.id}`)
      .set("x-user-id", guest.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.activeSessionId).toBeNull();
        expect(response.body.isSelectable).toBe(true);
      });

    const detailAfterGuestLeave = await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("x-user-id", host.id)
      .expect(200);

    expect(detailAfterGuestLeave.body.data.participants).toHaveLength(1);
    expect(detailAfterGuestLeave.body.data.session.hostUserId).toBe(host.id);

    await request(baseUrl)
      .delete(`/api/v1/sessions/${sessionId}/leave`)
      .set("x-user-id", host.id)
      .expect(204);

    const disbanded = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { status: true },
    });

    expect(disbanded.status).toBe("DISBANDED");
  });

  it("allows a human-gm host to write GM messages, move nodes, and toggle combat", async () => {
    const host = await createGuest("Human GM");

    const created = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.id)
      .send({
        title: "Human GM Session",
        scenarioId: DEFAULT_SCENARIO_ID,
        gmMode: "HUMAN",
        maxParticipants: 4,
        visibility: "PRIVATE",
      })
      .expect(201);

    const sessionId = created.body.data.session.sessionId as string;

    const gmMessage = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/messages`)
      .set("x-user-id", host.id)
      .send({
        content: "The innkeeper lowers their voice.",
        speakerName: "Innkeeper",
        asNpc: true,
      })
      .expect(201);

    expect(gmMessage.body.data.state.state.gmMessages).toHaveLength(1);
    expect(gmMessage.body.data.state.state.gmMessages[0].type).toBe("npc");

    const moved = await request(baseUrl)
      .patch(`/api/v1/sessions/${sessionId}/gm/node`)
      .set("x-user-id", host.id)
      .send({ nodeId: "node_inner_tunnel" })
      .expect(200);

    expect(moved.body.data.session.currentNodeId).toBe("node_inner_tunnel");
    expect(moved.body.data.state.currentNodeId).toBe("node_inner_tunnel");
    expect(moved.body.data.state.phase).toBe("dialogue");

    const playerScenario = await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}/player-scenario`)
      .set("x-user-id", host.id)
      .expect(200);

    expect(playerScenario.body.data.currentNodeId).toBe("node_inner_tunnel");
    expect(playerScenario.body.data.currentNode.id).toBe("node_inner_tunnel");
    expect(playerScenario.body.data.visitedNodes.map((node: { id: string }) => node.id)).toEqual([
      "node_cave_entrance",
      "node_inner_tunnel",
    ]);
    expect(playerScenario.body.data.currentNode.transitions).toBeUndefined();
    expect(playerScenario.body.data.currentNode.fallbackNodeId).toBeUndefined();
    expect(playerScenario.body.data.currentNode.publicClues).toHaveLength(0);

    const revealed = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/reveals`)
      .set("x-user-id", host.id)
      .send({
        contentId: "clue_secret_cache",
        reason: "players_search_the_tunnel",
      })
      .expect(201);

    expect(revealed.body.data.contentId).toBe("clue_secret_cache");
    expect(revealed.body.data.revealedBy).toBe("human_gm");

    const playerScenarioAfterReveal = await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}/player-scenario`)
      .set("x-user-id", host.id)
      .expect(200);

    expect(
      playerScenarioAfterReveal.body.data.currentNode.publicClues.map(
        (clue: { id: string }) => clue.id,
      ),
    ).toEqual(["clue_secret_cache"]);

    const combatStarted = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/combat/start`)
      .set("x-user-id", host.id)
      .expect(201);

    expect(combatStarted.body.data.state.phase).toBe("combat");

    const combatEnded = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/combat/end`)
      .set("x-user-id", host.id)
      .expect(201);

    expect(combatEnded.body.data.state.phase).toBe("exploration");
  });

  it("lets an AI GM session complete the rule runtime smoke scenario graph", async () => {
    const { host, guest, sessionId, sessionCharacterId } = await createStartedSmokeSession("AI");

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/actions/rest/short`)
      .set("x-user-id", host.id)
      .send({ characterId: sessionCharacterId, hitDiceToSpend: 0 })
      .expect(201);

    const completedCombatNodeIds = new Set<string>();
    for (let index = 0; index < RULE_RUNTIME_SMOKE_NODE_SEQUENCE.length - 1; index += 1) {
      const current = RULE_RUNTIME_SMOKE_NODE_SEQUENCE[index];
      const next = RULE_RUNTIME_SMOKE_NODE_SEQUENCE[index + 1];
      const effectiveScreenType =
        current.screenType === "COMBAT" && completedCombatNodeIds.has(current.id)
          ? "EXPLORATION"
          : current.screenType;

      const response = await request(baseUrl)
        .post(`/api/v1/sessions/${sessionId}/actions/main-command`)
        .set("x-user-id", host.id)
        .send({
          commandId: "REQUEST_SCENE_TRANSITION",
          screenType: effectiveScreenType,
          category: "MOVEMENT",
          intent: "REQUEST_SCENE_TRANSITION",
          actorId: sessionCharacterId,
          playerText: `${next.id}로 이동한다`,
          nodeId: current.id,
        })
        .expect(201);

      expect(response.body.data.status).toBe("RESOLVED");
      expect(response.body.data.statePatch.currentNodeId).toBe(next.id);
      expect(response.body.data.statePatch.phase.toLowerCase()).toBe(next.phase);

      if (next.id === "node_rule_smoke_trap_save") {
        await request(baseUrl)
          .post(`/api/v1/sessions/${sessionId}/actions`)
          .set("x-user-id", host.id)
          .send({
            characterId: sessionCharacterId,
            rawText: "/check perception 10",
            clientCreatedAt: new Date().toISOString(),
            inputType: "COMMAND",
            actionScope: "PARTY_SHARED",
          })
          .expect(202);
      }

      if (next.screenType === "COMBAT") {
        await request(baseUrl)
          .post(`/api/v1/sessions/${sessionId}/combat/start`)
          .set("x-user-id", host.id)
          .send({
            nodeId: next.id,
            autoRollInitiative: false,
          })
          .expect(201);
        if (next.id === "node_rule_smoke_cover_combat") {
          await request(baseUrl)
            .post(`/api/v1/sessions/${sessionId}/actions`)
            .set("x-user-id", host.id)
            .send({
              characterId: sessionCharacterId,
              rawText: "/attack token_node_rule_smoke_cover_combat_goblin",
              clientCreatedAt: new Date().toISOString(),
              inputType: "COMMAND",
              actionScope: "INDIVIDUAL_TURN",
            })
            .expect(202);
        }
        await request(baseUrl)
          .post(`/api/v1/sessions/${sessionId}/combat/end`)
          .set("x-user-id", host.id)
          .expect(200);
        completedCombatNodeIds.add(next.id);
      }
    }

    const playerScenario = await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}/player-scenario`)
      .set("x-user-id", host.id)
      .expect(200);

    expect(playerScenario.body.data.currentNodeId).toBe("node_rule_smoke_human_gm");
    expect(playerScenario.body.data.visitedNodes.map((node: { id: string }) => node.id)).toEqual(
      RULE_RUNTIME_SMOKE_NODE_SEQUENCE.map((node) => node.id),
    );

    const reconnectedScenario = await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}/player-scenario`)
      .set("x-user-id", guest.id)
      .expect(200);
    expect(reconnectedScenario.body.data.currentNodeId).toBe("node_rule_smoke_human_gm");

    const logs = await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}/turn-logs?includeStateDiff=true`)
      .set("x-user-id", guest.id)
      .expect(200);
    expect(
      logs.body.data.turnLogs.some(
        (log: { structuredAction?: { type?: string; restType?: string } | null }) =>
          log.structuredAction?.type === "rest" &&
          log.structuredAction.restType === "short",
      ),
    ).toBe(true);
  });

  it("lets a HUMAN GM complete the rule runtime smoke scenario with auditable overrides", async () => {
    const { host, guest, sessionId, sessionCharacterId } =
      await createStartedSmokeSession("HUMAN");

    const restRequest = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/actions/rest/short`)
      .set("x-user-id", guest.id)
      .send({ characterId: sessionCharacterId, hitDiceToSpend: 0 })
      .expect(201);
    const restActionId = restRequest.body.data.playerActionId as string;

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/actions/rest/requests/${restActionId}/approve`)
      .set("x-user-id", host.id)
      .expect(201);

    for (let index = 0; index < RULE_RUNTIME_SMOKE_NODE_SEQUENCE.length - 1; index += 1) {
      const next = RULE_RUNTIME_SMOKE_NODE_SEQUENCE[index + 1];

      await request(baseUrl)
        .get(`/api/v1/sessions/${sessionId}/gm/node-options`)
        .set("x-user-id", host.id)
        .expect(200)
        .expect((response) => {
          expect(response.body.data.map((option: { nodeId: string }) => option.nodeId)).toContain(
            next.id,
          );
        });

      const moved = await request(baseUrl)
        .patch(`/api/v1/sessions/${sessionId}/gm/node`)
        .set("x-user-id", host.id)
        .send({ nodeId: next.id })
        .expect(200);

      expect(moved.body.data.state.currentNodeId).toBe(next.id);
      expect(moved.body.data.state.phase).toBe(next.phase);
    }

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/messages`)
      .set("x-user-id", host.id)
      .send({
        content: "The final chamber responds to the party's choices.",
        asNpc: false,
        privateNote: "Track this as the smoke override audit note.",
      })
      .expect(201);

    const revealed = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/reveals`)
      .set("x-user-id", host.id)
      .send({
        contentId: "clue_rule_smoke_gm_override",
        reason: "smoke_override_complete",
      })
      .expect(201);

    expect(revealed.body.data.contentId).toBe("clue_rule_smoke_gm_override");
    expect(revealed.body.data.revealedBy).toBe("human_gm");

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/combat/start`)
      .set("x-user-id", host.id)
      .expect(201);

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/combat/conditions`)
      .set("x-user-id", host.id)
      .send({
        targetId: "token_node_rule_smoke_human_gm_goblin",
        conditionId: "stunned",
        operation: "add",
      })
      .expect(201);

    const logs = await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}/turn-logs?includeStateDiff=true`)
      .set("x-user-id", host.id)
      .expect(200);

    const overrideLogs = logs.body.data.turnLogs.filter(
      (log: { structuredAction: { type?: string } | null }) =>
        log.structuredAction?.type === "gm_override",
    );
    const overrideKinds = overrideLogs.map(
      (log: { structuredAction: { kind: string } }) => log.structuredAction.kind,
    );

    expect(overrideKinds).toEqual(
      expect.arrayContaining(["node_move", "scene_text", "reveal_handout", "set_condition"]),
    );
    expect(
      overrideLogs.some(
        (log: { structuredAction: { kind: string; hasPrivateNote?: boolean; metadata?: object } }) =>
          log.structuredAction.kind === "scene_text" &&
          log.structuredAction.hasPrivateNote === true &&
          !Object.prototype.hasOwnProperty.call(log.structuredAction.metadata ?? {}, "privateNote"),
      ),
    ).toBe(true);
    expect(
      overrideLogs.some(
        (log: { structuredAction: { kind: string }; stateDiff: { reason?: string } | null }) =>
          log.structuredAction.kind === "node_move" &&
          log.stateDiff?.reason === "gm_override:node_move",
      ),
    ).toBe(true);
    expect(
      overrideLogs.some(
        (log: { structuredAction: { kind: string }; stateDiff: { reason?: string } | null }) =>
          log.structuredAction.kind === "reveal_handout" &&
          log.stateDiff?.reason === "gm_override:reveal_handout",
      ),
    ).toBe(true);
    expect(
      overrideLogs.some(
        (log: {
          structuredAction: { kind: string };
          stateDiff: {
            reason?: string;
            diff?: {
              combatParticipants?: Array<{
                tokenId?: string | null;
                conditions?: string[];
              }>;
            };
          } | null;
        }) =>
          log.structuredAction.kind === "set_condition" &&
          log.stateDiff?.reason === "gm_override:set_condition" &&
          log.stateDiff.diff?.combatParticipants?.some(
            (participant) =>
              participant.tokenId === "token_node_rule_smoke_human_gm_goblin" &&
              participant.conditions?.includes("stunned"),
          ),
      ),
    ).toBe(true);
  });

  it("completes second AI and HUMAN smoke sessions without restarting the server", async () => {
    const ai = await createStartedSmokeSession("AI");
    for (let index = 0; index < RULE_RUNTIME_SMOKE_NODE_SEQUENCE.length - 1; index += 1) {
      const current = RULE_RUNTIME_SMOKE_NODE_SEQUENCE[index];
      const next = RULE_RUNTIME_SMOKE_NODE_SEQUENCE[index + 1];
      await request(baseUrl)
        .post(`/api/v1/sessions/${ai.sessionId}/actions/main-command`)
        .set("x-user-id", ai.host.id)
        .send({
          commandId: "REQUEST_SCENE_TRANSITION",
          screenType: current.screenType,
          category: "MOVEMENT",
          intent: "REQUEST_SCENE_TRANSITION",
          actorId: ai.sessionCharacterId,
          playerText: `${next.id}로 이동한다`,
          nodeId: current.id,
        })
        .expect(201);
    }

    await request(baseUrl)
      .get(`/api/v1/sessions/${ai.sessionId}/player-scenario`)
      .set("x-user-id", ai.guest.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.currentNodeId).toBe("node_rule_smoke_human_gm");
      });

    const human = await createStartedSmokeSession("HUMAN");
    const restRequest = await request(baseUrl)
      .post(`/api/v1/sessions/${human.sessionId}/actions/rest/short`)
      .set("x-user-id", human.guest.id)
      .send({ characterId: human.sessionCharacterId, hitDiceToSpend: 0 })
      .expect(201);
    await request(baseUrl)
      .post(
        `/api/v1/sessions/${human.sessionId}/actions/rest/requests/${restRequest.body.data.playerActionId}/approve`,
      )
      .set("x-user-id", human.host.id)
      .expect(201);

    for (let index = 0; index < RULE_RUNTIME_SMOKE_NODE_SEQUENCE.length - 1; index += 1) {
      const next = RULE_RUNTIME_SMOKE_NODE_SEQUENCE[index + 1];
      await request(baseUrl)
        .patch(`/api/v1/sessions/${human.sessionId}/gm/node`)
        .set("x-user-id", human.host.id)
        .send({ nodeId: next.id })
        .expect(200);
    }

    await request(baseUrl)
      .get(`/api/v1/sessions/${human.sessionId}/player-scenario`)
      .set("x-user-id", human.guest.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.currentNodeId).toBe("node_rule_smoke_human_gm");
      });
  });

  it("archives a P6 long campaign and transfers a vault character into a new campaign", async () => {
    const sourcePlayer = await createGuest("P6 Vault Hero");
    const targetHost = await createGuest("P6 Transfer Host");
    const sourceCharacter = await createCharacter(sourcePlayer.id, {
      name: "Astra Level 20",
      ancestry: "Human",
      className: "Wizard",
      level: 20,
      abilities: {
        str: 8,
        dex: 14,
        con: 14,
        int: 20,
        wis: 12,
        cha: 10,
      },
      inventory: [
        {
          id: "p6-transferable-arcane-focus",
          name: "Transferable Arcane Focus",
          quantity: 1,
        },
      ],
    });

    const sourceSession = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", sourcePlayer.id)
      .send({
        title: "P6 Eternal Storm Source",
        scenarioId: P6_VALIDATION_SCENARIO_ID,
        ruleSetId: "dnd5e",
        gmMode: "AI",
        maxParticipants: 1,
        visibility: "PRIVATE",
      })
      .expect(201);

    const sourceSessionId = sourceSession.body.data.session.sessionId as string;

    await request(baseUrl)
      .post(`/api/v1/sessions/${sourceSessionId}/character-selection`)
      .set("x-user-id", sourcePlayer.id)
      .send({ characterId: sourceCharacter.id })
      .expect(200);
    await request(baseUrl)
      .patch(`/api/v1/sessions/${sourceSessionId}/participants/me/ready`)
      .set("x-user-id", sourcePlayer.id)
      .send({ isReady: true })
      .expect(200);
    const startedSource = await request(baseUrl)
      .post(`/api/v1/sessions/${sourceSessionId}/start`)
      .set("x-user-id", sourcePlayer.id)
      .expect(201);

    const sourceSessionCharacterId = startedSource.body.data.sessionCharacters[0].id as string;

    const archived = await request(baseUrl)
      .post(`/api/v1/sessions/${sourceSessionId}/complete-campaign`)
      .set("x-user-id", sourcePlayer.id)
      .send({
        epilogue: "영원폭풍 성채의 마지막 유산을 봉인하고 다음 캠페인으로 전설을 넘긴다.",
        finalNodeId: "node_p6_archive_epilogue",
        finalRewardIds: ["reward.p6.final_legacy"],
        shareScope: "public_summary",
        allowCharacterTransfer: true,
      })
      .expect(201);

    expect(archived.body.data).toEqual(
      expect.objectContaining({
        sessionId: sourceSessionId,
        scenarioId: P6_VALIDATION_SCENARIO_ID,
        allowCharacterTransfer: true,
        finalNodeId: "node_p6_archive_epilogue",
      }),
    );
    expect(archived.body.data.snapshot).toEqual(
      expect.objectContaining({
        currentNodeId: expect.any(String),
        inventory: expect.objectContaining({
          totalItemCount: expect.any(Number),
        }),
        combat: expect.objectContaining({
          turnLogCount: expect.any(Number),
        }),
      }),
    );

    await request(baseUrl)
      .get(`/api/v1/sessions/${sourceSessionId}/campaign-archive`)
      .set("x-user-id", sourcePlayer.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.archiveId).toBe(archived.body.data.archiveId);
      });

    const vault = await request(baseUrl)
      .get("/api/v1/sessions/characters/vault")
      .set("x-user-id", sourcePlayer.id)
      .expect(200);
    expect(vault.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceSessionId,
          sourceSessionCharacterId,
          level: 20,
          transferable: true,
        }),
      ]),
    );

    const targetSession = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", targetHost.id)
      .send({
        title: "P6 Eternal Storm Next Campaign",
        scenarioId: P6_VALIDATION_SCENARIO_ID,
        ruleSetId: "dnd5e",
        gmMode: "HUMAN",
        maxParticipants: 2,
        visibility: "PRIVATE",
      })
      .expect(201);

    const targetSessionId = targetSession.body.data.session.sessionId as string;
    const inviteCode = targetSession.body.data.session.inviteCode as string;

    await request(baseUrl)
      .post("/api/v1/sessions/join-by-invite")
      .set("x-user-id", sourcePlayer.id)
      .send({ inviteCode })
      .expect(201);

    const transferRequested = await request(baseUrl)
      .post(`/api/v1/sessions/${targetSessionId}/character-transfers`)
      .set("x-user-id", sourcePlayer.id)
      .send({
        sourceSessionId,
        sourceSessionCharacterId,
        mode: "transfer",
        note: "P6 archive vault transfer smoke.",
      })
      .expect(201);

    expect(transferRequested.body.data).toEqual(
      expect.objectContaining({
        targetSessionId,
        sourceSessionId,
        sourceSessionCharacterId,
        status: "requested",
        mode: "transfer",
      }),
    );

    const transferApproved = await request(baseUrl)
      .post(
        `/api/v1/sessions/${targetSessionId}/character-transfers/${encodeURIComponent(
          transferRequested.body.data.requestId,
        )}/approve`,
      )
      .set("x-user-id", targetHost.id)
      .expect(200);

    expect(transferApproved.body.data).toEqual(
      expect.objectContaining({
        status: "approved",
        sourceDisposition: "retired_after_transfer",
        targetSessionCharacterId: expect.any(String),
      }),
    );

    await expect(
      prisma.sessionCharacter.findUniqueOrThrow({
        where: { id: sourceSessionCharacterId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "RETIRED" });
  });

  it("runs the public scenario moderation queue, appeal, escalation, and restore flow", async () => {
    const creator = await createGuest("P6 Scenario Creator");
    const reviewer = await createGuest("P6 Scenario Reviewer");
    const reporter = await createGuest("P6 Scenario Reporter");
    const operator = await prisma.user.create({
      data: {
        displayName: "P6 Scenario Moderator",
        role: "MODERATOR",
      },
    });

    const draft = await request(baseUrl)
      .post("/api/v1/scenarios")
      .set("x-user-id", creator.id)
      .send({
        title: "P6 Moderation Flow Scenario",
        description: "Public revision moderation e2e scenario.",
        ruleSetId: "dnd5e",
        startLevel: 17,
        recommendedEndLevel: 20,
        nodes: [
          {
            nodeType: "story",
            title: "검토 가능한 시작",
            sceneText: "공개 발행과 운영자 moderation 흐름을 검증하는 장면.",
            transitions: [],
            checkOptions: [],
            clues: [],
          },
        ],
      })
      .expect(201);

    const draftScenarioId = draft.body.id as string;

    await request(baseUrl)
      .put(`/api/v1/scenarios/${draftScenarioId}/collaborators`)
      .set("x-user-id", creator.id)
      .send({ userId: reviewer.id, role: "reviewer" })
      .expect(200);
    await request(baseUrl)
      .post(`/api/v1/scenarios/${draftScenarioId}/reviews`)
      .set("x-user-id", creator.id)
      .send({
        status: "requested",
        reviewerUserId: reviewer.id,
        comment: "P6 공개 발행 전 검토 요청",
      })
      .expect(201);
    await request(baseUrl)
      .post(`/api/v1/scenarios/${draftScenarioId}/reviews`)
      .set("x-user-id", reviewer.id)
      .send({
        status: "approved",
        comment: "운영자 moderation e2e 발행 승인",
      })
      .expect(201);

    const published = await request(baseUrl)
      .post(`/api/v1/scenarios/${draftScenarioId}/publish`)
      .set("x-user-id", creator.id)
      .send({ visibility: "public", changelog: "P6 moderation e2e" })
      .expect(201);

    const publishedScenarioId = published.body.id as string;

    await request(baseUrl)
      .post(`/api/v1/scenarios/${publishedScenarioId}/report`)
      .set("x-user-id", reporter.id)
      .send({
        reason: "unsafe_content",
        comment: "운영자 큐 노출 검증용 신고",
      })
      .expect(201);

    await request(baseUrl)
      .get("/api/v1/scenarios/moderation/queue")
      .set("x-user-id", reporter.id)
      .expect(403);

    const queued = await request(baseUrl)
      .get("/api/v1/scenarios/moderation/queue")
      .set("x-user-id", operator.id)
      .expect(200);
    expect(queued.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scenarioId: publishedScenarioId,
          moderationStatus: "reported",
          processingStatus: "queued",
          reportCount: 1,
        }),
      ]),
    );

    const noteRequired = await request(baseUrl)
      .post(`/api/v1/scenarios/${publishedScenarioId}/moderation/actions`)
      .set("x-user-id", operator.id)
      .send({
        action: "creator_note_required",
        reason: "제작자 소명 필요",
      })
      .expect(201);
    expect(noteRequired.body).toEqual(
      expect.objectContaining({
        moderationStatus: "reported",
        processingStatus: "actioned",
        creatorNoticeStatus: "creator_action_required",
      }),
    );

    await request(baseUrl)
      .post(`/api/v1/scenarios/${publishedScenarioId}/moderation-appeals`)
      .set("x-user-id", creator.id)
      .send({ message: "문제가 되는 표현을 정리했고 복구 검토를 요청합니다." })
      .expect(201);

    const escalated = await request(baseUrl)
      .post(`/api/v1/scenarios/${publishedScenarioId}/moderation/actions`)
      .set("x-user-id", operator.id)
      .send({
        action: "escalated",
        reason: "상위 운영자 검토로 이관",
      })
      .expect(201);
    expect(escalated.body.processingStatus).toBe("escalated");

    const restored = await request(baseUrl)
      .post(`/api/v1/scenarios/${publishedScenarioId}/moderation/actions`)
      .set("x-user-id", operator.id)
      .send({
        action: "restored",
        reason: "소명 수용 및 공개 복구",
      })
      .expect(201);
    expect(restored.body).toEqual(
      expect.objectContaining({
        moderationStatus: "visible",
        processingStatus: "restored",
        creatorNoticeStatus: "creator_notified",
      }),
    );

    await request(baseUrl)
      .get("/api/v1/scenarios")
      .expect(200)
      .expect((response) => {
        expect(response.body.map((scenario: { id: string }) => scenario.id)).toContain(
          publishedScenarioId,
        );
      });
  });

  it("accepts actions, stores turn logs, starts combat, and advances turns", async () => {
    const host = await createGuest("Action Host");
    const hostCharacter = await createCharacter(host.id, {
      name: "Kara",
      ancestry: "Human",
      className: "Ranger",
      abilities: {
        str: 10,
        dex: 14,
        con: 12,
        int: 10,
        wis: 16,
        cha: 8,
      },
      proficientSkills: ["perception"],
    });

    const created = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.id)
      .send({
        title: "Action Flow",
        scenarioId: DEFAULT_SCENARIO_ID,
        gmMode: "AI",
        maxParticipants: 1,
        visibility: "PRIVATE",
      })
      .expect(201);

    const sessionId = created.body.data.session.sessionId as string;

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/character-selection`)
      .set("x-user-id", host.id)
      .send({ characterId: hostCharacter.id })
      .expect(200);

    await request(baseUrl)
      .patch(`/api/v1/sessions/${sessionId}/participants/me/ready`)
      .set("x-user-id", host.id)
      .send({ isReady: true })
      .expect(200);

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/start`)
      .set("x-user-id", host.id)
      .expect(201);

    const accepted = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/actions`)
      .set("x-user-id", host.id)
      .send({
        characterId: hostCharacter.id,
        rawText: "/check perception 5",
        clientCreatedAt: new Date().toISOString(),
        actionScope: "PARTY_SHARED",
      })
      .expect(202);

    expect(accepted.body.code).toBe("ACTION_202");
    expect(accepted.body.data.queueStatus).toBe("PENDING");

    const logs = await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}/turn-logs?includeDiceResult=true`)
      .set("x-user-id", host.id)
      .expect(200);

    expect(logs.body.data.turnLogs).toHaveLength(1);
    expect(logs.body.data.turnLogs[0].outcome).toBe("SUCCESS");
    expect(logs.body.data.turnLogs[0].diceResult.total).toEqual(expect.any(Number));

    const combat = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/combat/start`)
      .set("x-user-id", host.id)
      .send({})
      .expect(201);

    expect(combat.body.data.status).toBe("ACTIVE");
    expect(combat.body.data.roundNo).toBe(1);
    expect(combat.body.data.currentEntityId).toBeTruthy();
    expect(combat.body.data.participants).toHaveLength(1);

    await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}/combat/character`)
      .set("x-user-id", host.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.isCurrentTurn).toBe(true);
        expect(response.body.data.actions.some((action: { code: string }) => action.code === "ATTACK")).toBe(true);
      });

    const combatAction = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/actions`)
      .set("x-user-id", host.id)
      .send({
        characterId: hostCharacter.id,
        rawText: "/roll 1d20",
        clientCreatedAt: new Date().toISOString(),
        actionScope: "INDIVIDUAL_TURN",
      })
      .expect(202);

    expect(combatAction.body.data.playerActionId).toBeTruthy();

    const turn = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/combat/turn/end`)
      .set("x-user-id", host.id)
      .send({})
      .expect(200);

    expect(turn.body.data.roundNo).toBe(2);
    expect(turn.body.data.turnNo).toBe(2);
  });

  it("rejects startCombat when participantEntityIds contains another user's sessionCharacter (S14P31A201-71)", async () => {
    const host = await createGuest("Owner-Host");
    const guest = await createGuest("Owner-Guest");

    const hostCharacter = await createCharacter(host.id, {
      name: "OwnerHostChar",
      ancestry: "Human",
      className: "Fighter",
    });
    const guestCharacter = await createCharacter(guest.id, {
      name: "OwnerGuestChar",
      ancestry: "Elf",
      className: "Wizard",
    });

    const created = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.id)
      .send({
        title: "Ownership Combat",
        scenarioId: DEFAULT_SCENARIO_ID,
        gmMode: "AI",
        maxParticipants: 2,
        visibility: "PRIVATE",
      })
      .expect(201);

    const sessionId = created.body.data.session.sessionId as string;
    const inviteCode = created.body.data.session.inviteCode as string;

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/character-selection`)
      .set("x-user-id", host.id)
      .send({ characterId: hostCharacter.id })
      .expect(200);
    await request(baseUrl)
      .post("/api/v1/sessions/join-by-invite")
      .set("x-user-id", guest.id)
      .send({ inviteCode })
      .expect(201);
    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/character-selection`)
      .set("x-user-id", guest.id)
      .send({ characterId: guestCharacter.id })
      .expect(200);

    await request(baseUrl)
      .patch(`/api/v1/sessions/${sessionId}/participants/me/ready`)
      .set("x-user-id", host.id)
      .send({ isReady: true })
      .expect(200);
    await request(baseUrl)
      .patch(`/api/v1/sessions/${sessionId}/participants/me/ready`)
      .set("x-user-id", guest.id)
      .send({ isReady: true })
      .expect(200);
    const started = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/start`)
      .set("x-user-id", host.id)
      .expect(201);

    const sessionCharacters = started.body.data.sessionCharacters as Array<{
      id: string;
      userId: string;
    }>;
    const guestSessionCharacterId = sessionCharacters.find((sc) => sc.userId === guest.id)!.id;

    // host 가 자기 캐릭터를 끼우지 않고 guest 의 sessionCharacter 만 명시 → 403
    const blocked = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/combat/start`)
      .set("x-user-id", host.id)
      .send({ participantEntityIds: [guestSessionCharacterId] })
      .expect(403);
    expect(JSON.stringify(blocked.body)).toContain("FOREIGN_CHARACTER_IN_PARTICIPANTS");

    // dto 비워두면 자동 모드: 양쪽 모두 포함되어 정상 시작
    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/combat/start`)
      .set("x-user-id", host.id)
      .send({})
      .expect(201);
  });

  it("blocks character PATCH when the session is PLAYING or PAUSED, allows it otherwise (S14P31A201-70)", async () => {
    const host = await createGuest("Lock-Host");
    const character = await createCharacter(host.id, {
      name: "Locked-One",
      ancestry: "Human",
      className: "Fighter",
    });

    const created = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.id)
      .send({
        title: "Lock test",
        scenarioId: DEFAULT_SCENARIO_ID,
        gmMode: "AI",
        maxParticipants: 2,
        visibility: "PRIVATE",
      })
      .expect(201);

    const sessionId = created.body.data.session.sessionId as string;

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/character-selection`)
      .set("x-user-id", host.id)
      .send({ characterId: character.id })
      .expect(200);

    // RECRUITING 에서는 PATCH 허용
    await request(baseUrl)
      .patch(`/api/v1/characters/${character.id}`)
      .set("x-user-id", host.id)
      .send({ name: "Renamed In Lobby" })
      .expect(200);

    // PLAYING 으로 강제 전이 — start 흐름 의존성 회피용 직접 update
    await prisma.session.update({ where: { id: sessionId }, data: { status: "PLAYING" } });

    const blockedPlaying = await request(baseUrl)
      .patch(`/api/v1/characters/${character.id}`)
      .set("x-user-id", host.id)
      .send({ name: "Should Be Blocked" })
      .expect(409);
    expect(JSON.stringify(blockedPlaying.body)).toContain("CHARACTER_LOCKED_BY_SESSION");

    // /equipment 와 /clone 도 차단되는지 확인
    await request(baseUrl)
      .patch(`/api/v1/characters/${character.id}/equipment`)
      .set("x-user-id", host.id)
      .send({ equippedWeaponId: null })
      .expect(409);
    await request(baseUrl)
      .post(`/api/v1/characters/${character.id}/clone`)
      .set("x-user-id", host.id)
      .expect(409);

    // PAUSED 도 차단
    await prisma.session.update({ where: { id: sessionId }, data: { status: "PAUSED" } });
    await request(baseUrl)
      .patch(`/api/v1/characters/${character.id}`)
      .set("x-user-id", host.id)
      .send({ name: "Should Still Be Blocked" })
      .expect(409);

    // COMPLETED 는 허용 (끝난 세션의 캐릭터는 다른 세션에 다시 쓰일 수 있음)
    await prisma.session.update({ where: { id: sessionId }, data: { status: "COMPLETED" } });
    await request(baseUrl)
      .patch(`/api/v1/characters/${character.id}`)
      .set("x-user-id", host.id)
      .send({ name: "Allowed After Complete" })
      .expect(200);
  });

  it("rejects invalid ability score range and out-of-list skills on character PATCH (S14P31A201-69)", async () => {
    const host = await createGuest("Validation-Host");
    const character = await createCharacter(host.id, {
      name: "Validee",
      ancestry: "Human",
      className: "Fighter",
    });

    // 능력치 범위 초과 (50)
    await request(baseUrl)
      .patch(`/api/v1/characters/${character.id}`)
      .set("x-user-id", host.id)
      .send({ abilities: { str: 50, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } })
      .expect(400)
      .expect((response) => {
        expect(JSON.stringify(response.body)).toContain("능력치 범위");
      });

    // 능력치 0 (Min 위반: dto class-validator @Min(1) 가 먼저 잡지만 어떤 오류든 400 이면 OK)
    await request(baseUrl)
      .patch(`/api/v1/characters/${character.id}`)
      .set("x-user-id", host.id)
      .send({ abilities: { str: 0, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } })
      .expect(400);

    // 카탈로그에 없는 itemDefinitionId
    await request(baseUrl)
      .patch(`/api/v1/characters/${character.id}`)
      .set("x-user-id", host.id)
      .send({
        inventory: [
          { id: "inv-1", name: "Phantom Sword", quantity: 1, itemDefinitionId: "does-not-exist" },
        ],
      })
      .expect(400)
      .expect((response) => {
        expect(JSON.stringify(response.body)).toContain("카탈로그");
      });
  });

  async function createGuest(displayName: string) {
    const response = await request(baseUrl)
      .post("/api/v1/users/guest")
      .send({ displayName })
      .expect(201);

    const guest = response.body as { id: string; displayName: string };
    createdGuestUserIds.add(guest.id);
    return guest;
  }

  async function createCharacter(
    userId: string,
    payload: Record<string, unknown>,
  ) {
    const requestPayload = {
      ...payload,
      ancestry: `Legacy ${String(payload.ancestry ?? "Human")}`,
      className: `Legacy ${String(payload.className ?? "Fighter")}`,
    };

    const response = await request(baseUrl)
      .post("/api/v1/characters")
      .set("x-user-id", userId)
      .send(requestPayload)
      .expect(201);

    return response.body as { id: string };
  }

  async function createStartedSmokeSession(gmMode: "AI" | "HUMAN") {
    const host = await createGuest(`${gmMode} Smoke Host`);
    const guest = await createGuest(`${gmMode} Smoke Guest`);
    const playerUser = gmMode === "AI" ? host : guest;
    const playerCharacter = await createCharacter(playerUser.id, {
      name: `${gmMode} Smoke Hero 1`,
      ancestry: "Human",
      className: "Wizard",
      abilities: {
        str: 8,
        dex: 14,
        con: 14,
        int: 16,
        wis: 12,
        cha: 10,
      },
    });
    const guestCharacter =
      gmMode === "AI"
        ? await createCharacter(guest.id, {
            name: `${gmMode} Smoke Hero 2`,
            ancestry: "Dwarf",
            className: "Cleric",
          })
        : playerCharacter;
    const secondGuest =
      gmMode === "HUMAN" ? await createGuest(`${gmMode} Smoke Guest 2`) : null;
    const secondGuestCharacter = secondGuest
      ? await createCharacter(secondGuest.id, {
          name: `${gmMode} Smoke Hero 2`,
          ancestry: "Elf",
          className: "Rogue",
        })
      : null;

    const created = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.id)
      .send({
        title: `${gmMode} Rule Runtime Smoke`,
        scenarioId: RULE_RUNTIME_SMOKE_SCENARIO_ID,
        gmMode,
        maxParticipants: 4,
        visibility: "PRIVATE",
      })
      .expect(201);

    const sessionId = created.body.data.session.sessionId as string;
    const inviteCode = created.body.data.session.inviteCode as string;

    if (gmMode === "AI") {
      await request(baseUrl)
        .post(`/api/v1/sessions/${sessionId}/character-selection`)
        .set("x-user-id", host.id)
        .send({ characterId: playerCharacter.id })
        .expect(200);
    }

    await request(baseUrl)
      .post("/api/v1/sessions/join-by-invite")
      .set("x-user-id", guest.id)
      .send({ inviteCode })
      .expect(201);

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/character-selection`)
      .set("x-user-id", guest.id)
      .send({ characterId: guestCharacter.id })
      .expect(200);

    if (gmMode === "AI") {
      await request(baseUrl)
        .patch(`/api/v1/sessions/${sessionId}/participants/me/ready`)
        .set("x-user-id", host.id)
        .send({ isReady: true })
        .expect(200);
    }

    await request(baseUrl)
      .patch(`/api/v1/sessions/${sessionId}/participants/me/ready`)
      .set("x-user-id", guest.id)
      .send({ isReady: true })
      .expect(200);

    if (secondGuest && secondGuestCharacter) {
      await request(baseUrl)
        .post("/api/v1/sessions/join-by-invite")
        .set("x-user-id", secondGuest.id)
        .send({ inviteCode })
        .expect(201);
      await request(baseUrl)
        .post(`/api/v1/sessions/${sessionId}/character-selection`)
        .set("x-user-id", secondGuest.id)
        .send({ characterId: secondGuestCharacter.id })
        .expect(200);
      await request(baseUrl)
        .patch(`/api/v1/sessions/${sessionId}/participants/me/ready`)
        .set("x-user-id", secondGuest.id)
        .send({ isReady: true })
        .expect(200);
    }

    const started = await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/start`)
      .set("x-user-id", host.id)
      .expect(201);

    return {
      host,
      guest,
      secondGuest,
      sessionId,
      sessionCharacterId: (
        started.body.data.sessionCharacters.find(
          (character: { userId: string }) => character.userId === playerUser.id,
        ) ?? started.body.data.sessionCharacters[0]
      ).id as string,
    };
  }
});
