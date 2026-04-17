# AI Contracts - Ollama 기반 AI GM 입출력 계약

## 1. 목적

이 문서는 Ollama 로컬 LLM이 담당하는 역할과 JSON 입출력 계약을 정의한다.

MVP에서는 Interpreter와 Narrator를 필수로 구현한다.
Actor는 제한적으로 구현하고, Director는 후순위로 둔다.

## 2. 공통 운영 조건

- 모델: Ollama Gemma 4 계열 모델
- 기준 장비: VRAM 8GB, RAM 64GB
- 전체 응답 목표: 30초 이내
- 출력 형식: JSON Schema 기반 structured output
- 재시도: 역할별 최대 1회
- timeout: 역할별 제한 시간 초과 시 fallback
- 로깅: 모든 AI 호출은 `AiTrace`로 저장

## 3. 역할 구분

| 역할 | MVP 필수 | 상태 변경 가능 | 설명 |
| --- | --- | --- | --- |
| Interpreter | 예 | 아니오 | 자연어 입력을 구조화 액션으로 변환 |
| Narrator | 예 | 아니오 | 확정된 결과를 GM 서사로 표현 |
| Actor | 일부 | 아니오 | NPC 행동 후보 중 하나 선택 |
| Director | 아니오 | 아니오 | 정체 상황에서 힌트/전개 제안 |
| Summarizer | 후순위 | 아니오 | 장기 요약 메모리 생성 |

## 4. Interpreter

### 입력

```ts
type InterpreterInput = {
  session: {
    id: string;
    phase: "exploration" | "combat" | "dialogue" | "rest";
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
    availableTargets: { id: string; name: string; kind: "npc" | "object" | "location" | "enemy" }[];
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

| 실패 | 처리 |
| --- | --- |
| JSON parse 실패 | 같은 입력으로 1회 재시도 |
| schema 실패 | schema 오류를 포함해 1회 재시도 |
| confidence < 0.5 | 확인 질문 또는 선택지 fallback |
| timeout | 선택지 fallback |

## 5. Narrator

### 입력

```ts
type NarratorInput = {
  rawInput: string;
  action: StructuredAction;
  checkRequest?: CheckRequest;
  diceResult?: DiceResult;
  stateDiff?: StateDiff;
  scene: {
    title: string;
    summary: string;
    tone: "neutral" | "tense" | "mysterious" | "heroic";
  };
  constraints: {
    language: "ko";
    maxLength: number;
    noNewFacts: boolean;
  };
};
```

### 출력

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

| 실패 | 처리 |
| --- | --- |
| JSON parse 실패 | 1회 재시도 |
| timeout | 템플릿 서술 사용 |
| 새 사실 추가 | rule validator 실패 후 템플릿 서술 사용 |

## 6. Actor

MVP에서는 전투 또는 간단한 NPC 반응에서만 사용한다.

### 입력

```ts
type ActorInput = {
  npc: {
    id: string;
    name: string;
    disposition: "hostile" | "neutral" | "friendly";
    currentHp?: number;
    conditions: ConditionName[];
  };
  sceneSummary: string;
  allowedActions: {
    id: string;
    type: "attack" | "move" | "talk" | "flee" | "defend";
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
  director.v1.md
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

기본 목표는 `MVP_ACCEPTANCE_CRITERIA.md`를 따른다.
