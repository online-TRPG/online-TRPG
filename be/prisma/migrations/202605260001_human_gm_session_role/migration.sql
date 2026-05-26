ALTER TYPE "ParticipantRole" ADD VALUE IF NOT EXISTS 'GM';

ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "gmUserId" TEXT;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_gmUserId_fkey"
  FOREIGN KEY ("gmUserId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

UPDATE "Session"
SET "gmUserId" = "hostUserId"
WHERE "gmMode" = 'HUMAN' AND "gmUserId" IS NULL;

UPDATE "SessionParticipant" AS participant
SET
  "role" = 'GM',
  "isReady" = TRUE,
  "readyAt" = COALESCE(participant."readyAt", NOW())
FROM "Session" AS session
WHERE
  participant."sessionId" = session."id"
  AND session."gmMode" = 'HUMAN'
  AND session."gmUserId" = participant."userId"
  AND participant."status" = 'JOINED';
