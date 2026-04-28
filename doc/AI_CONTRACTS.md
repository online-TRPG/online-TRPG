# AI Contracts - Google AI Studio 기반 AI GM 입출력 계약

## 1. 목적

이 문서는 Google AI Studio / Gemini API로 호출하는 호스팅 Gemma 4 모델이 담당하는 역할과 JSON 입출력 계약을 정의한다.

MVP에서는 Interpreter와 Narrator를 필수로 구현한다.
Actor는 NPC 행동 후보 선택 전용으로 제한적으로 구현하고, NpcDialogue는 NPC 대사 생성 전용 역할로 Actor와 분리한다. Director와 Summarizer는 보조 역할로 둔다.

## 2. 공통 운영 조건

- 기본 제공자: Google AI Studio / Gemini API
- 기본 모델: `gemma-4-31b-it`
- 선택 제공자: Ollama 로컬 Gemma 4 계열 모델
- 전체 응답 목표: 30초 이내
- 출력 형식: JSON 객체. 서버 하네스가 JSON 파싱, JSON Schema 또는 Zod 검증, 규칙 검증을 수행한다.
- 재시도: 역할별 최대 1회
- timeout: 역할별 제한 시간 초과, API 오류, rate limit, quota 오류 시 fallback
- 로깅: 모든 AI 호출은 `AiTrace`로 저장

## 2.1 Provider 계약

LLM 제공자는 백엔드 내부 인터페이스 뒤에 둔다.

```ts
type AiProvider = 'google-ai-studio' | 'ollama';

type AiCallRequest = {
  provider: AiProvider;
  model: string;
  role: 'interpreter' | 'actor' | 'npc_dialogue' | 'narrator' | 'director' | 'summarizer';
  promptVersion: string;
  contents: string;
  timeoutMs: number;
  responseSchemaName: string;
};

type AiCallResult = {
  rawOutput: string;
  parsedJson?: unknown;
  latencyMs: number;
  providerRequestId?: string;
  finishReason?: string;
};
```

환경변수 기준:

- `AI_PROVIDER=google-ai-studio`
- `GOOGLE_API_KEY`
- `AI_MODEL_INTERPRETER=gemma-4-26b-a4b-it`
- `AI_MODEL_NARRATOR=gemma-4-26b-a4b-it`
- `AI_MODEL_ACTOR=gemma-4-26b-a4b-it`
- `AI_MODEL_NPC_DIALOGUE=gemma-4-26b-a4b-it`
- `AI_TIMEOUT_MS=30000`

API 키는 서버에서만 사용하고 클라이언트 번들, 세션 로그, `AiTrace.rawOutput` 외 메타데이터에 기록하지 않는다.

## 3. 역할 구분

| 역할        | MVP 필수 | 상태 변경 가능 | 설명                               |
| ----------- | -------- | -------------- | ---------------------------------- |
| Interpreter | 예       | 아니오         | 자연어 입력을 구조화 액션으로 변환 |
| Narrator    | 예       | 아니오         | 확정된 결과를 GM 서사로 표현       |
| Actor       | 일부     | 아니오         | NPC 행동 후보 중 하나 선택         |
| Director    | 아니오   | 아니오         | 정체 상황에서 힌트/전개 제안       |
| Summarizer  | 후순위   | 아니오         | 장기 요약 메모리 생성              |

NpcDialogue는 Actor와 별도 역할이다. Actor는 `allowedActions` 중 하나를 고르고, NpcDialogue는 이미 허용된 상황 안에서 표시 가능한 NPC 대사만 생성한다.

## 4. Interpreter

### 입력

```ts
type InterpreterInput = {
  session: {
    id: string;
    phase: 'exploration' | 'combat' | 'dialogue' | 'rest';
    currentNodeId: string;
  };
  actor: {
    characterId: string;
    name: string;
    abilities: AbilityScores;
    proficientSkills: SkillName[];
    conditions: ConditionName[];
  };
  scene: {
    title: string;
    summary: string;
    availableTargets: { id: string; name: string; kind: 'npc' | 'object' | 'location' | 'enemy' }[];
    checkOptions: CheckOption[];
  };
  recentLogs: string[];
  rawText: string;
};
```

### 출력

```ts
type InterpreterOutput = {
  action: StructuredAction;
  needsClarification: boolean;
  clarificationQuestion?: string;
  safetyNotes: string[];
};
```

### 규칙

- 존재하지 않는 대상을 만들지 않는다.
- 피해량, HP 변경, 단서 획득을 확정하지 않는다.
- 판정 DC를 확정하지 않는다.
- 모호하면 `needsClarification`을 true로 둔다.
- confidence는 0부터 1 사이 숫자다.

### 실패 처리

| 실패                                  | 처리                                               |
| ------------------------------------- | -------------------------------------------------- |
| JSON parse 실패                       | 같은 입력으로 1회 재시도                           |
| schema 실패                           | schema 오류를 포함해 1회 재시도                    |
| confidence < 0.5                      | 확인 질문 또는 선택지 fallback                     |
| timeout                               | 선택지 fallback                                    |
| Gemini API rate limit 또는 quota 오류 | 재시도하지 않고 선택지 fallback, `FailureLog` 기록 |
| 네트워크 오류                         | 짧은 연결 오류 메시지와 선택지 fallback            |

## 5. Narrator

### 입력

```ts
type NarratorInput = {
  rawInput: string;
  action: StructuredAction;
  checkRequest?: CheckRequest;
  diceResult?: DiceResult;
  stateDiffSummary?: NarratorStateDiffSummary;
  scene: {
    title: string;
    summary: string;
    tone: 'neutral' | 'tense' | 'mysterious' | 'heroic';
  };
  constraints: {
    language: 'ko';
    maxLength: number;
    noNewFacts: boolean;
  };
};
```

### 출력

`stateDiffSummary`는 백엔드 `StateDiff.operations`가 아니라, 백엔드가 확정한 상태 변경을 공개 내레이션용으로 요약한 DTO다. AI Narrator 입력에서는 `StateDiff`라는 이름을 쓰지 않는다.

```ts
type NarratorStateDiffSummary = {
  summary: string;
  changedFlags: string[];
  hpChanges: string[];
  inventoryChanges: string[];
  conditionChanges: string[];
  nodeChange?: string;
};
```

```ts
type NarratorOutput = {
  narration: string;
  visibleSummary: string;
};
```

### 규칙

- 확정되지 않은 단서, 피해, 보상, NPC 사망을 추가하지 않는다.
- 주사위 결과를 바꾸지 않는다.
- 플레이어 캐릭터의 의도를 임의로 바꾸지 않는다.
- 한국어로 출력한다.
- MVP 기본 출력은 2~5문장으로 제한한다.

### 실패 처리

| 실패                                  | 처리                                    |
| ------------------------------------- | --------------------------------------- |
| JSON parse 실패                       | 1회 재시도                              |
| timeout                               | 템플릿 서술 사용                        |
| 새 사실 추가                          | rule validator 실패 후 템플릿 서술 사용 |
| Gemini API rate limit 또는 quota 오류 | 템플릿 서술 사용, `FailureLog` 기록     |
| 네트워크 오류                         | 템플릿 서술 사용                        |

## 6. Actor

MVP에서는 전투 또는 간단한 NPC 반응에서만 사용한다.

### 입력

```ts
type ActorInput = {
  npc: {
    id: string;
    name: string;
    disposition: 'hostile' | 'neutral' | 'friendly';
    currentHp?: number;
    conditions: ConditionName[];
  };
  sceneSummary: string;
  allowedActions: {
    id: string;
    type: 'attack' | 'move' | 'talk' | 'flee' | 'defend';
    description: string;
  }[];
};
```

### 출력

```ts
type ActorOutput = {
  selectedActionId: string;
  reason: string;
};
```

### 규칙

- `allowedActions`에 없는 행동을 선택할 수 없다.
- Actor의 선택은 엔진이 다시 검증한다.

Actor는 NPC 대사를 생성하지 않는다. NPC 대사는 `NpcDialogue` 역할이 처리한다.

## 6.1 NpcDialogue

NpcDialogue는 AI-002 NPC 대사 생성 전용 역할이다. Actor가 이미 고른 행동 후보나 현재 장면 맥락을 참고할 수 있지만, 행동을 선택하거나 상태를 변경하지 않는다.

### 입력

```ts
type NpcDialogueInput = {
  npcEntityId: string;
  npcName?: string;
  npcSummary: string;
  disposition: 'hostile' | 'neutral' | 'friendly' | string;
  sceneSummary: string;
  recentContext: string[];
  selectedActionId?: string;
  dialogueIntent: string;
  audienceIds: string[];
  maxLength: number;
};
```

### 출력

```ts
type NpcDialogueOutput = {
  dialogue: string;
  tone: string;
  safetyNotes: string[];
};
```

### 규칙

- 행동 선택은 Actor 책임이다.
- 대사는 요청에 포함된 NPC, 장면, 최근 맥락, 선택된 행동, 대사 목적 안에서만 생성한다.
- 피해량, DC, 주사위 결과, HP 변경, 상태 변경을 만들 수 없다.

## 7. Director

Director는 MVP 필수 기능이 아니다.

조건부 호출 후보:

- 같은 노드에서 일정 턴 이상 진전이 없음
- 플레이어가 힌트를 요청함
- 실패가 반복되어 대체 전개가 필요함

Director는 상태를 바꾸지 않고, 힌트 후보나 다음 전개 후보만 제안한다.

## 8. Prompt 관리

프롬프트는 역할별로 버전을 둔다.

권장 파일 구조:

```text
prompts/
  interpreter.v1.md
  narrator.v1.md
  actor.v1.md
  npc_dialogue.v1.md
  director.v1.md
  summarizer.v1.md
```

`AiTrace.promptVersion`에는 파일명 또는 semantic version을 저장한다.

## 9. 평가 지표

MVP에서 추적할 지표:

- Interpreter schema pass rate
- Interpreter intent accuracy
- Narrator schema pass rate
- Narrator no-new-facts violation rate
- timeout rate
- fallback rate
- average latency
- p95 latency
- provider error rate
- rate limit fallback rate
- token usage per role if API metadata is available

기본 목표는 `MVP_ACCEPTANCE_CRITERIA.md`를 따른다.

## 10. Google AI Studio 적용 메모

- Google AI Studio에서 API 키를 발급하고 Gemini API로 Gemma 4 모델을 호출한다.
- 공식 문서 기준 Gemma 4 호출 모델명은 `gemma-4-31b-it`이다.
- free tier는 개발과 시연에는 사용할 수 있지만, 실제 rate limit은 프로젝트별로 Google AI Studio에서 확인한다.
- Gemma 4 경로는 모델 출력이 JSON 텍스트라는 전제로 받고, 서버 하네스가 형식과 의미를 검증한다.
- Gemini API의 structured output 보장이 반드시 필요한 실험은 동일 Provider 인터페이스에서 structured output 지원 Gemini 모델로 교체해 A/B 테스트한다.
