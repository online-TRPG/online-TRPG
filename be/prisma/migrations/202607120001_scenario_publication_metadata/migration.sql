ALTER TABLE "ScenarioPublication"
  ADD COLUMN "estimatedMinutes" INTEGER,
  ADD COLUMN "recommendedPlayersMin" INTEGER,
  ADD COLUMN "recommendedPlayersMax" INTEGER;

ALTER TABLE "ScenarioPublication"
  ADD CONSTRAINT "ScenarioPublication_estimatedMinutes_check"
    CHECK ("estimatedMinutes" IS NULL OR "estimatedMinutes" BETWEEN 1 AND 1440),
  ADD CONSTRAINT "ScenarioPublication_recommendedPlayersMin_check"
    CHECK ("recommendedPlayersMin" IS NULL OR "recommendedPlayersMin" BETWEEN 1 AND 8),
  ADD CONSTRAINT "ScenarioPublication_recommendedPlayersMax_check"
    CHECK ("recommendedPlayersMax" IS NULL OR "recommendedPlayersMax" BETWEEN 1 AND 8),
  ADD CONSTRAINT "ScenarioPublication_recommendedPlayers_range_check"
    CHECK (
      "recommendedPlayersMin" IS NULL OR
      "recommendedPlayersMax" IS NULL OR
      "recommendedPlayersMin" <= "recommendedPlayersMax"
    );
