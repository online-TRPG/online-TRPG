CREATE TABLE "UserProductProgress" (
    "userId" TEXT NOT NULL,
    "onboardingVersion" INTEGER NOT NULL DEFAULT 1,
    "tutorialStartedAt" TIMESTAMP(3),
    "firstActionAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "dismissedCoachmarks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProductProgress_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserProductProgress"
ADD CONSTRAINT "UserProductProgress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 계정에는 신규 사용자용 안내를 갑자기 강제하지 않는다.
INSERT INTO "UserProductProgress" (
    "userId",
    "dismissedAt",
    "createdAt",
    "updatedAt"
)
SELECT "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User";
