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

MVP에서는 로그인한 사용자만 세션 생성, 참가, 캐릭터 선택, GM 기능 사용을 수행한다.

### Session

```ts
type Session = {
  id: string;
  title: string;
  hostUserId: string;
  gmMode: "ai" | "human";
  mode: "single" | "multi";
  visibility: "public" | "private";
  inviteCode?: string;
  status: "waiting" | "playing" | "ended";
  maxPlayers: number;
  currentScenarioId: string;
  currentNodeId: string;
  captainUserId?: string;
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
  role: "host" | "gm" | "player" | "observer";
  connectionStatus: "online" | "offline";
  joinedAt: string;
};
```

### Character

```ts
type Character = {
  id: string;
  ownerUserId: string;
  name: string;
  race: string;
  className: string;
  level: number;
  abilities: AbilityScores;
  proficiencyBonus: number;
  maxHp: number;
  armorClass: number;
  speed: number;
  proficientSkills: SkillName[];
  inventory: InventoryItem[];
  equippedWeaponId?: string;
  bio?: string;
  imageUrl?: string;
};
```

`Character`는 계정 소유 영속 데이터다. 세션 중 변하는 HP, 임시 HP, 조건, 버프는 별도 세션 상태에서 관리한다.

### SessionCharacterState

```ts
type SessionCharacterState = {
  sessionId: string;
  characterId: string;
  currentHp: number;
  tempHp: number;
  conditions: ConditionName[];
  statusFlags: Record<string, boolean | number | string>;
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
  channel: "main";
  inputType: "natural" | "command" | "select";
  actionScope: "party_shared" | "individual_turn";
  rawText: string;
  clientActionId?: string;
  clientCreatedAt: string;
};
```

일반 채팅은 `PlayerAction`과 분리된 `ChatMessage`로 관리한다.

### ChatMessage

```ts
type ChatMessage = {
  id: string;
  sessionId: string;
  senderUserId: string;
  messageType: "chat" | "gm_text" | "narration" | "npc_dialogue" | "system";
  content: string;
  createdAt: string;
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
    | "use_item"
    | "move"
    | "interact"
    | "talk"
    | "request_hint"
    | "freeform";
  actorCharacterId: string;
  targetId?: string;
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
  role: "interpreter" | "actor" | "narrator" | "director" | "summarizer";
  provider: "google-ai-studio";
  model: string;
  promptVersion: string;
  inputSummary: string;
  rawOutput: string;
  parsedOutput?: unknown;
  validationStatus:
    | "passed"
    | "schema_failed"
    | "rule_failed"
    | "timeout"
    | "rate_limited"
    | "quota_exceeded"
    | "provider_error"
    | "fallback";
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  providerRequestId?: string;
  createdAt: string;
};
```

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
