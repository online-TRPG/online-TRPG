# Data Model - MVP 초안

## 1. 목적

이 문서는 MVP 구현에 필요한 핵심 데이터 모델을 정의한다.

TypeScript 타입, Zod 스키마, DB 테이블은 이 문서를 기준으로 맞춘다.

## 2. 설계 원칙

- 서버가 authoritative state를 가진다.
- 클라이언트는 액션 요청만 보내고, 상태 확정은 서버가 한다.
- 모든 상태 변경은 `StateDiff`로 표현한다.
- 모든 턴은 `TurnLog`로 남긴다.
- AI 출력 원본과 검증 결과를 함께 저장해 개선에 활용한다.

## 3. 핵심 엔티티

### User

```ts
type User = {
  id: string;
  displayName: string;
  createdAt: string;
};
```

MVP에서는 게스트 사용자를 허용한다.

### Session

```ts
type Session = {
  id: string;
  title: string;
  ownerUserId: string;
  inviteCode: string;
  status: "lobby" | "playing" | "paused" | "completed";
  currentScenarioId: string;
  currentNodeId: string;
  createdAt: string;
  updatedAt: string;
};
```

### SessionParticipant

```ts
type SessionParticipant = {
  id: string;
  sessionId: string;
  userId: string;
  characterId?: string;
  role: "host" | "player" | "spectator";
  connectionStatus: "online" | "offline";
  joinedAt: string;
};
```

### Character

```ts
type Character = {
  id: string;
  sessionId: string;
  ownerUserId: string;
  name: string;
  ancestry: string;
  className: string;
  level: number;
  abilities: AbilityScores;
  proficiencyBonus: number;
  proficientSkills: SkillName[];
  maxHp: number;
  currentHp: number;
  tempHp: number;
  armorClass: number;
  speed: number;
  inventory: InventoryItem[];
  equippedWeaponId?: string;
  conditions: ConditionName[];
};
```

### GameState

```ts
type GameState = {
  sessionId: string;
  version: number;
  currentNodeId: string;
  phase: "exploration" | "combat" | "dialogue" | "rest";
  characters: CharacterSnapshot[];
  npcs: NpcSnapshot[];
  combat?: CombatState;
  flags: Record<string, boolean | number | string>;
  discoveredClues: string[];
  updatedAt: string;
};
```

`version`은 동시 액션 처리와 낙관적 갱신 검증에 사용한다.

### Scenario

```ts
type Scenario = {
  id: string;
  title: string;
  license: "original" | "cc-by-4.0" | "other-free";
  attribution: string;
  startNodeId: string;
  nodes: ScenarioNode[];
};
```

### ScenarioNode

```ts
type ScenarioNode = {
  id: string;
  title: string;
  sceneText: string;
  visibleToPlayers: boolean;
  checkOptions: CheckOption[];
  transitions: NodeTransition[];
  clues: Clue[];
  fallbackNodeId?: string;
};
```

### PlayerAction

```ts
type PlayerAction = {
  id: string;
  sessionId: string;
  actorCharacterId: string;
  userId: string;
  rawText: string;
  clientCreatedAt: string;
};
```

### StructuredAction

```ts
type StructuredAction = {
  type:
    | "ability_check"
    | "skill_check"
    | "saving_throw"
    | "attack"
    | "cast_spell"
    | "use_class_feature"
    | "use_item"
    | "move"
    | "interact"
    | "talk"
    | "request_hint"
    | "freeform";
  actorCharacterId: string;
  targetId?: string;
  spellId?: string;
  featureId?: string;
  attackKind?: "weapon_attack" | "melee_spell_attack" | "ranged_spell_attack";
  ability?: AbilityName;
  skill?: SkillName;
  approach: string;
  confidence: number;
  requiresRoll: boolean;
  suggestedDifficulty?: "easy" | "medium" | "hard";
};
```

### CheckRequest

```ts
type CheckRequest = {
  id: string;
  sessionId: string;
  actorCharacterId: string;
  kind: "ability" | "skill" | "saving_throw" | "attack";
  ability?: AbilityName;
  skill?: SkillName;
  dc?: number;
  targetArmorClass?: number;
  advantageState: "normal" | "advantage" | "disadvantage";
};
```

### DiceResult

```ts
type DiceResult = {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  success?: boolean;
};
```

### StateDiff

```ts
type StateDiff = {
  id: string;
  baseVersion: number;
  nextVersion: number;
  operations: StateOperation[];
  reason: string;
};
```

```ts
type StateOperation =
  | { op: "set_hp"; characterId: string; value: number }
  | { op: "add_condition"; entityId: string; condition: ConditionName }
  | { op: "remove_condition"; entityId: string; condition: ConditionName }
  | { op: "set_flag"; key: string; value: boolean | number | string }
  | { op: "add_clue"; clueId: string }
  | { op: "move_node"; nodeId: string }
  | { op: "set_phase"; phase: GameState["phase"] };
```

### TurnLog

```ts
type TurnLog = {
  id: string;
  sessionId: string;
  turnNumber: number;
  userId: string;
  actorCharacterId?: string;
  rawInput: string;
  structuredAction?: StructuredAction;
  checkRequest?: CheckRequest;
  diceResult?: DiceResult;
  stateDiff?: StateDiff;
  narration: string;
  aiTraceIds: string[];
  createdAt: string;
};
```

### AiTrace

```ts
type AiTrace = {
  id: string;
  sessionId: string;
  role: "interpreter" | "actor" | "npc_dialogue" | "narrator" | "director" | "summarizer" | "smoke";
  provider: "google-ai-studio" | "ollama" | "template-fallback";
  model: string;
  promptVersion: string;
  inputSummary: string;
  rawOutput: string;
  parsedOutput?: unknown;
  status: "success" | "failure" | "fallback";
  validationStatus: "passed" | "failed" | "fallback";
  failureType?:
    | "timeout"
    | "rate_limit"
    | "quota"
    | "network"
    | "auth"
    | "invalid_response"
    | "schema_validation"
    | "upstream_error";
  turnId?: string;
  actorCharacterId?: string;
  endpoint?: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  providerRequestId?: string;
  createdAt: string;
};
```

`AiTrace.status`는 하네스 row 상태값이며 `success`, `failure`, `fallback`으로 고정한다. 백엔드 검증 상태가 필요하면 adapter에서 `success -> passed`, `failure -> failed`, `fallback -> fallback`으로 변환해 `validationStatus`에 저장한다.

## 4. 공통 타입

```ts
type AbilityName = "str" | "dex" | "con" | "int" | "wis" | "cha";

type AbilityScores = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

type SkillName =
  | "perception"
  | "investigation"
  | "stealth"
  | "persuasion"
  | "insight"
  | "athletics"
  | "acrobatics";

type ConditionName =
  | "prone"
  | "poisoned"
  | "unconscious"
  | "frightened"
  | "restrained";
```

## 5. DB 구현 메모

SQLite MVP 기준 권장 테이블:

- `users`
- `sessions`
- `session_participants`
- `characters`
- `game_states`
- `scenarios`
- `scenario_nodes`
- `turn_logs`
- `ai_traces`
- `failure_logs`

`game_states`는 MVP에서는 JSON 컬럼으로 시작해도 된다.
단, `session_id`, `version`, `updated_at`은 별도 컬럼으로 둔다.
