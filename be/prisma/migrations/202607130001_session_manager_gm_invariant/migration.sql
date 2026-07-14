-- 사람 GM 세션에서는 세션 관리자만 GM이 될 수 있다.
UPDATE "Session"
SET "gmUserId" = CASE
  WHEN "gmMode" = 'HUMAN' THEN "hostUserId"
  ELSE NULL
END;

-- 기존에 별도로 지정된 GM/방장 역할은 일반 참가자로 되돌린다.
UPDATE "SessionParticipant" participant
SET
  "role" = 'PLAYER',
  "isReady" = false,
  "readyAt" = NULL
FROM "Session" session
WHERE participant."sessionId" = session."id"
  AND participant."userId" <> session."hostUserId"
  AND participant."role" IN ('HOST', 'GM');

-- 관리자의 참가자 역할은 GM 모드에서 파생한다.
UPDATE "SessionParticipant" participant
SET
  "role" = CASE
    WHEN session."gmMode" = 'HUMAN' THEN 'GM'::"ParticipantRole"
    ELSE 'HOST'::"ParticipantRole"
  END,
  "isReady" = false,
  "readyAt" = NULL
FROM "Session" session
WHERE participant."sessionId" = session."id"
  AND participant."userId" = session."hostUserId";

-- 사람 GM으로 전환된 관리자는 플레이어 캐릭터를 함께 사용하지 않는다.
DELETE FROM "SessionCharacter" session_character
USING "Session" session
WHERE session_character."sessionId" = session."id"
  AND session_character."userId" = session."hostUserId"
  AND session."gmMode" = 'HUMAN';

UPDATE "SessionPlayAttendance" attendance
SET
  "isReady" = false,
  "readyAt" = NULL
FROM "SessionParticipant" participant
WHERE attendance."participantId" = participant."id"
  AND participant."role" IN ('HOST', 'GM');
