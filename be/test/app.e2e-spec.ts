import { ValidationPipe } from "@nestjs/common";
import { INestApplication } from "@nestjs/common/interfaces";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/database/prisma.service";
import {
  DEFAULT_SCENARIO_ID,
  seedDefaultScenario,
} from "../src/database/seed/default-scenario";

describe("Session and Character APIs (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

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
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    await prisma.gameState.deleteMany();
    await prisma.sessionCharacter.deleteMany();
    await prisma.sessionParticipant.deleteMany();
    await prisma.character.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await seedDefaultScenario(prisma);
  });

  afterAll(async () => {
    await prisma.gameState.deleteMany();
    await prisma.sessionCharacter.deleteMany();
    await prisma.sessionParticipant.deleteMany();
    await prisma.character.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  it("supports member auth token flow and bearer-authenticated session creation", async () => {
    const email = `member-${Date.now()}@example.com`;
    const password = "P@ssword123";

    await request(baseUrl)
      .get("/api/v1/users/email-check")
      .query({ email })
      .expect(200)
      .expect((response) => {
        expect(response.body.code).toBe("USER_200");
        expect(response.body.data.available).toBe(true);
      });

    const registered = await request(baseUrl)
      .post("/api/v1/users/register")
      .send({ email, password, name: "홍길동" })
      .expect(201);

    expect(registered.body.code).toBe("USER_201");
    expect(registered.body.data.email).toBe(email);

    const agent = request.agent(baseUrl);
    const loggedIn = await agent
      .post("/api/v1/users/login")
      .send({ email, password })
      .expect(200)
      .expect((response) => {
        const cookies = response.headers["set-cookie"];
        const cookieText = Array.isArray(cookies) ? cookies.join(";") : String(cookies ?? "");
        expect(response.body.code).toBe("USER_200");
        expect(cookieText).toContain("refreshToken=");
      });

    const accessToken = loggedIn.body.data.accessToken as string;

    await agent
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.email).toBe(email);
      });

    await agent
      .post("/api/v1/sessions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Bearer Session",
        scenarioId: DEFAULT_SCENARIO_ID,
        ruleSetId: "dnd5e",
        maxPlayers: 4,
        gmMode: "AI",
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.code).toBe("SESSION_201");
        expect(response.body.data.status).toBe("lobby");
      });

    await agent
      .post("/api/v1/users/reissue")
      .expect(200)
      .expect((response) => {
        expect(response.body.data.tokenType).toBe("Bearer");
        expect(response.body.data.accessToken).toEqual(expect.any(String));
      });

    await agent
      .post("/api/v1/users/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toBeNull();
      });

    await agent.post("/api/v1/users/reissue").expect(401);
  });

  it("supports persistent characters and session character assignment lifecycle", async () => {
    const host = await request(baseUrl)
      .post("/api/v1/users/guest")
      .send({ displayName: "Host" })
      .expect(201);
    const guest = await request(baseUrl)
      .post("/api/v1/users/guest")
      .send({ displayName: "Guest" })
      .expect(201);

    const persistentCharacter = await request(baseUrl)
      .post("/api/v1/characters")
      .set("x-user-id", guest.body.id)
      .send({
        name: "Lia",
        ancestry: "Human",
        className: "Rogue",
        inventory: [{ id: "dagger", name: "Dagger", quantity: 1 }],
      })
      .expect(201);

    expect(persistentCharacter.body.activeSessionId).toBeNull();
    expect(persistentCharacter.body.isSelectable).toBe(true);

    await request(baseUrl)
      .get("/api/v1/users/me/characters")
      .set("x-user-id", guest.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0].id).toBe(persistentCharacter.body.id);
      });

    await request(baseUrl)
      .get(`/api/v1/characters/${persistentCharacter.body.id}`)
      .set("x-user-id", guest.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.name).toBe("Lia");
      });

    await request(baseUrl)
      .get(`/api/v1/characters/${persistentCharacter.body.id}/inventory`)
      .set("x-user-id", guest.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.inventory).toHaveLength(1);
      });

    await request(baseUrl)
      .patch(`/api/v1/characters/${persistentCharacter.body.id}/equipment`)
      .set("x-user-id", guest.body.id)
      .send({ equippedWeaponId: "dagger" })
      .expect(200)
      .expect((response) => {
        expect(response.body.equippedWeaponId).toBe("dagger");
      });

    const clone = await request(baseUrl)
      .post(`/api/v1/characters/${persistentCharacter.body.id}/clone`)
      .set("x-user-id", guest.body.id)
      .expect(201);

    expect(clone.body.name).toContain("Copy");

    const session = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.body.id)
      .send({
        title: "Goblin Cave",
        description: "Persistent character test",
        scenarioId: DEFAULT_SCENARIO_ID,
        ruleSetId: "dnd5e",
        maxPlayers: 2,
        gmMode: "AI",
      })
      .expect(201);

    const sessionId = session.body.data.sessionId as string;
    const inviteCode = session.body.data.inviteCode as string;

    await request(baseUrl)
      .get("/api/v1/sessions")
      .set("x-user-id", host.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.code).toBe("SESSION_200");
        expect(response.body.data.content).toHaveLength(1);
      });

    await request(baseUrl)
      .post("/api/v1/sessions/join-by-invite")
      .set("x-user-id", guest.body.id)
      .send({ inviteCode })
      .expect(201);

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/character-selection`)
      .set("x-user-id", guest.body.id)
      .send({ characterId: persistentCharacter.body.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.characterId).toBe(persistentCharacter.body.id);
      });

    await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("x-user-id", host.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.participants).toHaveLength(2);
        expect(response.body.data.sessionCharacters).toHaveLength(1);
        expect(response.body.data.sessionCharacters[0].characterId).toBe(persistentCharacter.body.id);
      });

    await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}/characters`)
      .set("x-user-id", host.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
      });

    await request(baseUrl)
      .get("/api/v1/users/me/characters")
      .set("x-user-id", guest.body.id)
      .expect(200)
      .expect((response) => {
        const selected = response.body.find(
          (character: { id: string }) => character.id === persistentCharacter.body.id,
        );
        expect(selected.activeSessionId).toBe(sessionId);
        expect(selected.isSelectable).toBe(false);
      });

    const secondSession = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.body.id)
      .send({
        title: "Second Session",
        scenarioId: DEFAULT_SCENARIO_ID,
        ruleSetId: "dnd5e",
        maxPlayers: 2,
        gmMode: "AI",
      })
      .expect(201);

    const secondSessionId = secondSession.body.data.sessionId as string;

    await request(baseUrl)
      .post(`/api/v1/sessions/${secondSessionId}/join`)
      .set("x-user-id", guest.body.id)
      .expect(201);

    await request(baseUrl)
      .post(`/api/v1/sessions/${secondSessionId}/character-selection`)
      .set("x-user-id", guest.body.id)
      .send({ characterId: persistentCharacter.body.id })
      .expect(409);

    await request(baseUrl)
      .delete(`/api/v1/characters/${persistentCharacter.body.id}`)
      .set("x-user-id", guest.body.id)
      .expect(409);

    await request(baseUrl)
      .delete(`/api/v1/sessions/${sessionId}`)
      .set("x-user-id", host.body.id)
      .expect(200);

    await request(baseUrl)
      .get(`/api/v1/characters/${persistentCharacter.body.id}`)
      .set("x-user-id", guest.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.activeSessionId).toBeNull();
        expect(response.body.isSelectable).toBe(true);
      });

    await request(baseUrl)
      .post(`/api/v1/sessions/${secondSessionId}/character-selection`)
      .set("x-user-id", guest.body.id)
      .send({ characterId: persistentCharacter.body.id })
      .expect(200);
  });

  it("keeps persistent characters when a lobby session is deleted", async () => {
    const owner = await request(baseUrl)
      .post("/api/v1/users/guest")
      .send({ displayName: "Owner" })
      .expect(201);

    const persistentCharacter = await request(baseUrl)
      .post("/api/v1/characters")
      .set("x-user-id", owner.body.id)
      .send({
        name: "Doran",
        ancestry: "Dwarf",
        className: "Fighter",
      })
      .expect(201);

    const lobbySession = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", owner.body.id)
      .send({
        title: "Delete Me",
        scenarioId: DEFAULT_SCENARIO_ID,
        ruleSetId: "dnd5e",
        maxPlayers: 4,
        gmMode: "AI",
      })
      .expect(201);

    const lobbySessionId = lobbySession.body.data.sessionId as string;

    await request(baseUrl)
      .post(`/api/v1/sessions/${lobbySessionId}/character-selection`)
      .set("x-user-id", owner.body.id)
      .send({ characterId: persistentCharacter.body.id })
      .expect(200);

    await request(baseUrl)
      .delete(`/api/v1/sessions/${lobbySessionId}`)
      .set("x-user-id", owner.body.id)
      .expect(200);

    await request(baseUrl)
      .get(`/api/v1/characters/${persistentCharacter.body.id}`)
      .set("x-user-id", owner.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(persistentCharacter.body.id);
        expect(response.body.activeSessionId).toBeNull();
      });
  });

  it("stores gmMode on sessions and supports gmMode filtering", async () => {
    const host = await request(baseUrl)
      .post("/api/v1/users/guest")
      .send({ displayName: "GM Host" })
      .expect(201);

    await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.body.id)
      .send({
        title: "AI Session",
        gmMode: "ai",
      })
      .expect(201);

    await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.body.id)
      .send({
        title: "Human Session",
        gmMode: "human",
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.session.gmMode).toBe("human");
      });

    await request(baseUrl)
      .get("/api/v1/sessions?gmMode=human")
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(response.body[0].session.gmMode).toBe("human");
      });
  });

  it("releases a character when a participant leaves a session and transfers ownership if needed", async () => {
    const owner = await request(baseUrl)
      .post("/api/v1/users/guest")
      .send({ displayName: "Owner" })
      .expect(201);
    const guest = await request(baseUrl)
      .post("/api/v1/users/guest")
      .send({ displayName: "Guest" })
      .expect(201);

    const guestCharacter = await request(baseUrl)
      .post("/api/v1/characters")
      .set("x-user-id", guest.body.id)
      .send({
        name: "Mira",
        ancestry: "Elf",
        className: "Wizard",
      })
      .expect(201);

    const created = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", owner.body.id)
      .send({ title: "Leave Flow" })
      .expect(201);

    const sessionId = created.body.session.id as string;

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/join`)
      .set("x-user-id", guest.body.id)
      .expect(201);

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/character-selection`)
      .set("x-user-id", guest.body.id)
      .send({ characterId: guestCharacter.body.id })
      .expect(201);

    await request(baseUrl)
      .delete(`/api/v1/sessions/${sessionId}/leave`)
      .set("x-user-id", guest.body.id)
      .expect(204);

    await request(baseUrl)
      .get(`/api/v1/characters/${guestCharacter.body.id}`)
      .set("x-user-id", guest.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.activeSessionId).toBeNull();
        expect(response.body.isSelectable).toBe(true);
      });

    await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("x-user-id", owner.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.participants).toHaveLength(1);
        expect(response.body.sessionCharacters).toHaveLength(0);
      });

    await request(baseUrl)
      .delete(`/api/v1/sessions/${sessionId}/leave`)
      .set("x-user-id", owner.body.id)
      .expect(204);

    await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("x-user-id", owner.body.id)
      .expect(404);
  });

  it("allows a human GM session owner to control node, combat, and gm messages", async () => {
    const host = await request(baseUrl)
      .post("/api/v1/users/guest")
      .send({ displayName: "Human GM" })
      .expect(201);

    const created = await request(baseUrl)
      .post("/api/v1/sessions")
      .set("x-user-id", host.body.id)
      .send({
        title: "GM Session",
        gmMode: "human",
      })
      .expect(201);

    const sessionId = created.body.session.id as string;

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/messages`)
      .set("x-user-id", host.body.id)
      .send({
        content: "여관 주인이 손짓하며 안쪽 방을 가리킨다.",
        speakerName: "Innkeeper",
        asNpc: true,
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.state.state.gmMessages).toHaveLength(1);
        expect(response.body.state.state.gmMessages[0].type).toBe("npc");
      });

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/combat/start`)
      .set("x-user-id", host.body.id)
      .expect(201)
      .expect((response) => {
        expect(response.body.state.phase).toBe("combat");
      });

    await request(baseUrl)
      .patch(`/api/v1/sessions/${sessionId}/gm/node`)
      .set("x-user-id", host.body.id)
      .send({ nodeId: "node_inner_tunnel" })
      .expect(200)
      .expect((response) => {
        expect(response.body.session.currentNodeId).toBe("node_inner_tunnel");
        expect(response.body.state.currentNodeId).toBe("node_inner_tunnel");
      });

    await request(baseUrl)
      .post(`/api/v1/sessions/${sessionId}/gm/combat/end`)
      .set("x-user-id", host.body.id)
      .expect(201)
      .expect((response) => {
        expect(response.body.state.phase).toBe("exploration");
      });
  });
});
