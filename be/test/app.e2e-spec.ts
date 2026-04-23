import { ValidationPipe } from "@nestjs/common";
import { INestApplication } from "@nestjs/common/interfaces";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/database/prisma.service";
import { seedDefaultScenario } from "../src/database/seed/default-scenario";

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
        maxParticipants: 2,
      })
      .expect(201);

    const sessionId = session.body.session.id as string;
    const inviteCode = session.body.session.inviteCode as string;

    await request(baseUrl)
      .get("/api/v1/sessions")
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
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
      .expect(201)
      .expect((response) => {
        expect(response.body.characterId).toBe(persistentCharacter.body.id);
      });

    await request(baseUrl)
      .get(`/api/v1/sessions/${sessionId}`)
      .set("x-user-id", host.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.participants).toHaveLength(2);
        expect(response.body.sessionCharacters).toHaveLength(1);
        expect(response.body.sessionCharacters[0].characterId).toBe(persistentCharacter.body.id);
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
      .send({ title: "Second Session" })
      .expect(201);

    await request(baseUrl)
      .post(`/api/v1/sessions/${secondSession.body.session.id}/join`)
      .set("x-user-id", guest.body.id)
      .expect(201);

    await request(baseUrl)
      .post(`/api/v1/sessions/${secondSession.body.session.id}/character-selection`)
      .set("x-user-id", guest.body.id)
      .send({ characterId: persistentCharacter.body.id })
      .expect(409);

    await request(baseUrl)
      .delete(`/api/v1/characters/${persistentCharacter.body.id}`)
      .set("x-user-id", guest.body.id)
      .expect(409);

    await request(baseUrl)
      .patch(`/api/v1/sessions/${sessionId}`)
      .set("x-user-id", host.body.id)
      .send({ status: "playing" })
      .expect(200);

    await request(baseUrl)
      .delete(`/api/v1/sessions/${sessionId}`)
      .set("x-user-id", host.body.id)
      .expect(204);

    await request(baseUrl)
      .get(`/api/v1/characters/${persistentCharacter.body.id}`)
      .set("x-user-id", guest.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.activeSessionId).toBeNull();
        expect(response.body.isSelectable).toBe(true);
      });

    await request(baseUrl)
      .post(`/api/v1/sessions/${secondSession.body.session.id}/character-selection`)
      .set("x-user-id", guest.body.id)
      .send({ characterId: persistentCharacter.body.id })
      .expect(201);
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
      .send({ title: "Delete Me" })
      .expect(201);

    await request(baseUrl)
      .post(`/api/v1/sessions/${lobbySession.body.session.id}/character-selection`)
      .set("x-user-id", owner.body.id)
      .send({ characterId: persistentCharacter.body.id })
      .expect(201);

    await request(baseUrl)
      .delete(`/api/v1/sessions/${lobbySession.body.session.id}`)
      .set("x-user-id", owner.body.id)
      .expect(204);

    await request(baseUrl)
      .get(`/api/v1/characters/${persistentCharacter.body.id}`)
      .set("x-user-id", owner.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.id).toBe(persistentCharacter.body.id);
        expect(response.body.activeSessionId).toBeNull();
      });
  });
});
