ALTER TABLE "Scenario"
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Scenario_deletedAt_updatedAt_id_idx"
ON "Scenario"("deletedAt", "updatedAt" DESC, "id");

ALTER TABLE "SessionScenario"
DROP CONSTRAINT "SessionScenario_scenarioId_fkey";

ALTER TABLE "SessionScenario"
ADD CONSTRAINT "SessionScenario_scenarioId_fkey"
FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SessionScenarioNodeRuntimeState" (
  "sessionScenarioId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "vttMapJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SessionScenarioNodeRuntimeState_pkey"
  PRIMARY KEY ("sessionScenarioId", "nodeId")
);

CREATE INDEX "SessionScenarioNodeRuntimeState_sessionScenarioId_updatedAt_idx"
ON "SessionScenarioNodeRuntimeState"("sessionScenarioId", "updatedAt");

ALTER TABLE "SessionScenarioNodeRuntimeState"
ADD CONSTRAINT "SessionScenarioNodeRuntimeState_sessionScenarioId_nodeId_fkey"
FOREIGN KEY ("sessionScenarioId", "nodeId")
REFERENCES "SessionScenarioNode"("sessionScenarioId", "nodeId")
ON DELETE CASCADE ON UPDATE CASCADE;
