# SRD Engine Combat Implementation Plan

## Outcome

MVP combat should let the backend run simple monster turns without asking the AI server to decide game truth. The initial supported monsters are:

- `monster.giant_rat`
- `monster.goblin`

The AI may narrate or suggest intent later, but the backend owns legal action selection, attack rolls, damage rolls, HP mutation, action spending, and turn advancement.

## Data Boundary

- `srd-data/generated/srd/`: display, search, rulebook, AI prompt context, legacy frontend catalog.
- `srd-data/generated/srd-engine/`: executable backend rule-engine catalog.

Do not replace the legacy `srd` catalog wholesale. Use `srd-engine` only where structured combat fields are needed.

## MVP Rules

1. Only high-confidence parsed monster attacks are executable.
2. `monster.giant_rat` uses `action.bite`.
3. `monster.goblin` uses `action.scimitar` for the first MVP pass. Ranged shortbow and distance-aware choice can come later.
4. Ignore `Multiattack`, recharge actions, limited-use actions, saving throw side effects, disease, stealth, Nimble Escape, and tactical movement in the first pass.
5. If an engine profile or executable action is missing, fall back to existing manual/GM-driven combat instead of guessing.

## Implementation Steps

### 1. Promote SRD Engine Files - Done

- Rename `generated/new` to `generated/srd-engine`.
- Rename v2 files to stable engine names:
  - `monsters.jsonl`
  - `spells.jsonl`
  - `equipment.jsonl`
  - `manifest.json`
  - `SCHEMA.md`
- Update `srd-data` verification so both legacy `srd` and engine files are present.

Success criteria: `npm run build -w @trpg/srd-data` verifies both catalogs.

### 2. Add Backend SRD Engine Loader - Done

Add a backend service that reads `srd-data/generated/srd-engine/monsters.jsonl` and exposes:

- `getMonsterProfile(monsterId)`
- `getMonsterCombatStats(monsterId)`
- `getExecutableMonsterActions(monsterId)`
- `chooseMvpMonsterAction(monsterId)`

Success criteria: backend code can resolve goblin and giant rat AC, HP, speed, and one executable high-confidence attack.

### 3. Use Engine Stats At Combat Start - Done

When creating monster combat participants:

1. Resolve the token's `monster.id`.
2. Load engine stats.
3. Use engine `hitPoints.average`, `armorClass.value`, and `speed.modes.walk.ft`.
4. Keep existing raw-string parsing as fallback.

Success criteria: goblin and giant rat participants start with engine-derived HP/AC/speed.

### 4. Add MVP Monster Auto Turn - Done

Add a backend method/API for the current monster participant:

1. Validate the current participant is a hostile monster.
2. Resolve the monster profile by token monster id.
3. Pick the MVP action:
   - giant rat: Bite
   - goblin: Scimitar
4. Pick the first alive non-hostile participant as target unless a target is explicitly provided.
5. Reuse the existing attack resolver with engine attack bonus and damage dice.
6. End the monster turn after the action if combat remains active.

Success criteria: a current goblin or giant rat can perform a backend-owned attack and pass the turn.

Frontend integration status:

- Added a frontend API wrapper for `POST /sessions/:sessionId/combat/monster/act`.
- The host client now calls the monster auto-turn API when the active combat participant is a hostile monster.
- Duplicate auto-turn calls are guarded by combat id, turn number, and current entity id.

### 5. Next After MVP - Not Started

After the first pass is stable:

- Add map distance and movement.
- Let goblins choose shortbow when not adjacent.
- Add damage type modifier application.
- Add condition side effects.
- Add Multiattack.
- Add recharge actions.
- Add saving throw actions.
- Add monster spellcasting.
- Add AI-assisted narration that consumes backend results only.

## Verification Commands

The implementation should not require running tests during coding. Use these commands manually when ready:

```powershell
npm run build -w @trpg/srd-data
npm run build -w @trpg/shared-types
npm run build -w @trpg/be
npm run test -w @trpg/be -- combat.service.spec.ts
```
