import { ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common/interfaces";
import { io, Socket } from "socket.io-client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { PrismaService } from "../src/database/prisma.service";
import { seedDefaultScenario } from "../src/database/seed/default-scenario";

function waitForSocketEvent<T>(socket: Socket, eventName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for socket event: ${eventName}`));
    }, 5000);

    socket.once(eventName, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

describe("Vertical Slice (e2e)", () => {
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

    await app.init();
    await app.listen(0);

    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    await prisma.gameState.deleteMany();
    await prisma.sessionParticipant.deleteMany();
    await prisma.character.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await seedDefaultScenario(prisma);
  });

  afterAll(async () => {
    await prisma.gameState.deleteMany();
    await prisma.sessionParticipant.deleteMany();
    await prisma.character.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  it("completes guest, session, join, character, state, and websocket flow", async () => {
    const scenarioResponse = await request(baseUrl).get("/scenarios").expect(200);
    expect(scenarioResponse.body).toHaveLength(1);

    const host = await request(baseUrl)
      .post("/users/guest")
      .send({ displayName: "Host" })
      .expect(201);
    const guest = await request(baseUrl)
      .post("/users/guest")
      .send({ displayName: "Guest" })
      .expect(201);

    const createSessionResponse = await request(baseUrl)
      .post("/sessions")
      .set("x-user-id", host.body.id)
      .send({ title: "Goblin Cave" })
      .expect(201);

    expect(createSessionResponse.body.session.ownerUserId).toBe(host.body.id);
    expect(createSessionResponse.body.state.version).toBe(1);
    expect(createSessionResponse.body.state.currentNodeId).toBe(
      createSessionResponse.body.session.currentNodeId,
    );

    const sessionId = createSessionResponse.body.session.id as string;
    const inviteCode = createSessionResponse.body.session.inviteCode as string;

    const hostSocket = io(`${baseUrl}/ws`, {
      transports: ["websocket"],
      extraHeaders: {
        "x-user-id": host.body.id as string,
      },
    });

    await new Promise<void>((resolve, reject) => {
      hostSocket.once("connect", () => resolve());
      hostSocket.once("connect_error", reject);
    });

    const snapshotPromise = waitForSocketEvent<{
      sessionId: string;
      snapshot: { participants: unknown[]; characters: unknown[] };
    }>(hostSocket, "session.snapshot");
    hostSocket.emit("session.join", { sessionId });
    const snapshotPayload = await snapshotPromise;

    expect(snapshotPayload.sessionId).toBe(sessionId);
    expect(snapshotPayload.snapshot.participants).toHaveLength(1);
    expect(snapshotPayload.snapshot.characters).toHaveLength(0);

    const participantUpdatedPromise = waitForSocketEvent<{
      sessionId: string;
      participant: { userId: string };
    }>(hostSocket, "participant.updated");

    const joinResponse = await request(baseUrl)
      .post("/sessions/join")
      .set("x-user-id", guest.body.id)
      .send({ inviteCode })
      .expect(201);

    expect(joinResponse.body.participants).toHaveLength(2);
    const participantUpdated = await participantUpdatedPromise;
    expect(participantUpdated.sessionId).toBe(sessionId);
    expect(participantUpdated.participant.userId).toBe(guest.body.id);

    const duplicateJoinResponse = await request(baseUrl)
      .post("/sessions/join")
      .set("x-user-id", guest.body.id)
      .send({ inviteCode })
      .expect(201);
    expect(duplicateJoinResponse.body.participants).toHaveLength(2);

    const characterUpdatedPromise = waitForSocketEvent<{
      sessionId: string;
      character: { ownerUserId: string; name: string };
    }>(hostSocket, "character.updated");

    const createCharacterResponse = await request(baseUrl)
      .post("/characters")
      .set("x-user-id", guest.body.id)
      .send({
        sessionId,
        name: "Lia",
        ancestry: "Human",
        className: "Rogue",
      })
      .expect(201);

    expect(createCharacterResponse.body.ownerUserId).toBe(guest.body.id);
    const characterUpdated = await characterUpdatedPromise;
    expect(characterUpdated.sessionId).toBe(sessionId);
    expect(characterUpdated.character.name).toBe("Lia");

    await request(baseUrl)
      .get(`/sessions/${sessionId}/participants`)
      .set("x-user-id", host.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(2);
      });

    await request(baseUrl)
      .get(`/sessions/${sessionId}/characters`)
      .set("x-user-id", host.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
      });

    await request(baseUrl)
      .get(`/sessions/${sessionId}/state`)
      .set("x-user-id", host.body.id)
      .expect(200)
      .expect((response) => {
        expect(response.body.version).toBe(1);
      });

    hostSocket.disconnect();
  });

  it("prevents non-owners from updating a character", async () => {
    const owner = await request(baseUrl)
      .post("/users/guest")
      .send({ displayName: "Owner" })
      .expect(201);
    const intruder = await request(baseUrl)
      .post("/users/guest")
      .send({ displayName: "Intruder" })
      .expect(201);

    const sessionResponse = await request(baseUrl)
      .post("/sessions")
      .set("x-user-id", owner.body.id)
      .send({ title: "Owner Session" })
      .expect(201);

    await request(baseUrl)
      .post("/sessions/join")
      .set("x-user-id", intruder.body.id)
      .send({ inviteCode: sessionResponse.body.session.inviteCode })
      .expect(201);

    const character = await request(baseUrl)
      .post("/characters")
      .set("x-user-id", owner.body.id)
      .send({
        sessionId: sessionResponse.body.session.id,
        name: "Doran",
        ancestry: "Dwarf",
        className: "Fighter",
      })
      .expect(201);

    await request(baseUrl)
      .patch(`/characters/${character.body.id}`)
      .set("x-user-id", intruder.body.id)
      .send({ name: "Stolen Name" })
      .expect(403);
  });
});
