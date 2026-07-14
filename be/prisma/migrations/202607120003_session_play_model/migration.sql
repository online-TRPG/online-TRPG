CREATE TYPE "SessionActivityStatus" AS ENUM ('DORMANT', 'LOBBY_OPEN', 'PLAYING', 'COMPLETED', 'DISBANDED');
CREATE TYPE "RecruitmentStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "SessionJoinPolicy" AS ENUM ('INVITE_ONLY', 'APPROVAL_REQUIRED', 'OPEN_JOIN');
CREATE TYPE "SessionPlayStatus" AS ENUM ('SCHEDULED', 'LOBBY_OPEN', 'PLAYING', 'FINISHED', 'CANCELLED');
CREATE TYPE "SessionAttendanceStatus" AS ENUM ('ATTENDING', 'ABSENT', 'TENTATIVE');
CREATE TYPE "SessionApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "SessionJoinTiming" AS ENUM ('CURRENT_PLAY', 'NEXT_PLAY');

ALTER TABLE "Session"
ADD COLUMN "activityStatus" "SessionActivityStatus" NOT NULL DEFAULT 'DORMANT',
ADD COLUMN "recruitmentStatus" "RecruitmentStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "joinPolicy" "SessionJoinPolicy" NOT NULL DEFAULT 'OPEN_JOIN',
ADD COLUMN "currentPlayId" TEXT;

UPDATE "Session"
SET
  "activityStatus" = CASE
    WHEN "status" = 'PLAYING' THEN 'PLAYING'::"SessionActivityStatus"
    WHEN "status" = 'PAUSED' THEN 'DORMANT'::"SessionActivityStatus"
    WHEN "status" = 'COMPLETED' THEN 'COMPLETED'::"SessionActivityStatus"
    WHEN "status" = 'DISBANDED' THEN 'DISBANDED'::"SessionActivityStatus"
    ELSE 'DORMANT'::"SessionActivityStatus"
  END,
  "recruitmentStatus" = CASE
    WHEN "status" = 'RECRUITING' THEN 'OPEN'::"RecruitmentStatus"
    ELSE 'CLOSED'::"RecruitmentStatus"
  END,
  "joinPolicy" = CASE
    WHEN "visibility" = 'PRIVATE' THEN 'INVITE_ONLY'::"SessionJoinPolicy"
    ELSE 'OPEN_JOIN'::"SessionJoinPolicy"
  END;

UPDATE "SessionParticipant" participant
SET "isReady" = false, "readyAt" = NULL
FROM "Session" session
WHERE participant."sessionId" = session."id"
  AND participant."status" = 'JOINED'
  AND session."activityStatus" IN ('DORMANT', 'LOBBY_OPEN', 'PLAYING');

CREATE TABLE "SessionPlay" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "SessionPlayStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduledStartAt" TIMESTAMP(3),
  "lobbyOpensAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "timeZone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
  "scheduleVersion" INTEGER NOT NULL DEFAULT 1,
  "stateVersion" INTEGER NOT NULL DEFAULT 1,
  "summary" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionPlay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionPlayAttendance" (
  "playId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "attendance" "SessionAttendanceStatus" NOT NULL DEFAULT 'TENTATIVE',
  "isReady" BOOLEAN NOT NULL DEFAULT false,
  "readyAt" TIMESTAMP(3),
  "enteredLobbyAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionPlayAttendance_pkey" PRIMARY KEY ("playId", "participantId")
);

CREATE TABLE "SessionApplication" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "applicantUserId" TEXT NOT NULL,
  "status" "SessionApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "joinTiming" "SessionJoinTiming",
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserActivePlay" (
  "userId" TEXT NOT NULL,
  "playId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserActivePlay_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "SessionScheduleProximityAcknowledgement" (
  "userId" TEXT NOT NULL,
  "playId" TEXT NOT NULL,
  "comparedPlayId" TEXT NOT NULL,
  "playScheduleVersion" INTEGER NOT NULL,
  "comparedScheduleVersion" INTEGER NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionScheduleProximityAcknowledgement_pkey" PRIMARY KEY ("userId", "playId", "comparedPlayId")
);

CREATE UNIQUE INDEX "Session_currentPlayId_key" ON "Session"("currentPlayId");
CREATE INDEX "Session_visibility_recruitmentStatus_activityStatus_nextSessionAt_idx" ON "Session"("visibility", "recruitmentStatus", "activityStatus", "nextSessionAt");
CREATE UNIQUE INDEX "SessionPlay_sessionId_sequence_key" ON "SessionPlay"("sessionId", "sequence");
CREATE INDEX "SessionPlay_sessionId_status_scheduledStartAt_idx" ON "SessionPlay"("sessionId", "status", "scheduledStartAt");
CREATE INDEX "SessionPlayAttendance_participantId_attendance_idx" ON "SessionPlayAttendance"("participantId", "attendance");
CREATE UNIQUE INDEX "SessionApplication_sessionId_applicantUserId_key" ON "SessionApplication"("sessionId", "applicantUserId");
CREATE INDEX "SessionApplication_sessionId_status_createdAt_idx" ON "SessionApplication"("sessionId", "status", "createdAt");
CREATE INDEX "SessionApplication_applicantUserId_status_idx" ON "SessionApplication"("applicantUserId", "status");
CREATE INDEX "UserActivePlay_playId_idx" ON "UserActivePlay"("playId");
CREATE INDEX "UserActivePlay_sessionId_idx" ON "UserActivePlay"("sessionId");

ALTER TABLE "SessionPlay" ADD CONSTRAINT "SessionPlay_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionPlay" ADD CONSTRAINT "SessionPlay_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionPlayAttendance" ADD CONSTRAINT "SessionPlayAttendance_playId_fkey" FOREIGN KEY ("playId") REFERENCES "SessionPlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionPlayAttendance" ADD CONSTRAINT "SessionPlayAttendance_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionApplication" ADD CONSTRAINT "SessionApplication_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionApplication" ADD CONSTRAINT "SessionApplication_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionApplication" ADD CONSTRAINT "SessionApplication_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserActivePlay" ADD CONSTRAINT "UserActivePlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserActivePlay" ADD CONSTRAINT "UserActivePlay_playId_fkey" FOREIGN KEY ("playId") REFERENCES "SessionPlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserActivePlay" ADD CONSTRAINT "UserActivePlay_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionScheduleProximityAcknowledgement" ADD CONSTRAINT "SessionScheduleProximityAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionScheduleProximityAcknowledgement" ADD CONSTRAINT "SessionScheduleProximityAcknowledgement_playId_fkey" FOREIGN KEY ("playId") REFERENCES "SessionPlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionScheduleProximityAcknowledgement" ADD CONSTRAINT "SessionScheduleProximityAcknowledgement_comparedPlayId_fkey" FOREIGN KEY ("comparedPlayId") REFERENCES "SessionPlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SessionPlay" (
  "id", "sessionId", "sequence", "status", "scheduledStartAt", "lobbyOpensAt",
  "startedAt", "endedAt", "createdByUserId", "updatedAt"
)
SELECT
  'legacy-play-' || "id",
  "id",
  1,
  CASE
    WHEN "status" = 'PLAYING' THEN 'PLAYING'::"SessionPlayStatus"
    ELSE 'SCHEDULED'::"SessionPlayStatus"
  END,
  "nextSessionAt",
  "nextSessionAt",
  NULL,
  NULL,
  "hostUserId",
  CURRENT_TIMESTAMP
FROM "Session"
WHERE "status" = 'PLAYING'
   OR ("status" = 'RECRUITING' AND "nextSessionAt" IS NOT NULL AND "nextSessionAt" > CURRENT_TIMESTAMP);

UPDATE "Session"
SET "currentPlayId" = 'legacy-play-' || "id"
WHERE "status" = 'PLAYING';

INSERT INTO "SessionPlayAttendance" (
  "playId", "participantId", "attendance", "isReady", "readyAt", "enteredLobbyAt", "updatedAt"
)
SELECT
  'legacy-play-' || participant."sessionId",
  participant."id",
  CASE
    WHEN session."status" = 'PLAYING' THEN 'ATTENDING'::"SessionAttendanceStatus"
    ELSE 'TENTATIVE'::"SessionAttendanceStatus"
  END,
  false,
  NULL,
  NULL,
  CURRENT_TIMESTAMP
FROM "SessionParticipant" participant
JOIN "Session" session ON session."id" = participant."sessionId"
WHERE participant."status" = 'JOINED'
  AND (
    session."status" = 'PLAYING'
    OR (session."status" = 'RECRUITING' AND session."nextSessionAt" IS NOT NULL AND session."nextSessionAt" > CURRENT_TIMESTAMP)
  );

ALTER TABLE "Session" ADD CONSTRAINT "Session_currentPlayId_fkey" FOREIGN KEY ("currentPlayId") REFERENCES "SessionPlay"("id") ON DELETE SET NULL ON UPDATE CASCADE;
