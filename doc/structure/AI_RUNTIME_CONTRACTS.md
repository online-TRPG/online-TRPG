# AI Contracts - Google AI Studio 기반 AI GM 입출력 계약

## 문서 목적

이 문서는 Google AI Studio / Gemini API로 호출하는 호스팅 Gemma 4 모델이 담당하는 역할과 JSON 입출력 계약을 정의한다.

MVP에서는 Interpreter와 Narrator를 필수로 구현한다.
Actor는 NPC 행동 후보 선택 전용으로 제한적으로 구현하고, NpcDialogue는 NPC 대사 생성 전용 역할로 Actor와 분리한다. Director와 Summarizer는 보조 역할로 둔다.

공개 `/api/v1/sessions/{sessionId}/ai/{hint,summary,npc-dialogue}`는 client-provided context가 세션 메시지로 발행되는 직접 API이므로 JOINED GM runtime 권한이 필요하다. 플레이어 기능은 메인 명령 계층이 공개 장면·로그·대상을 검증한 뒤 `SERVER_VALIDATED` 내부 호출로만 사용한다.

## 적용 범위

- AI GM 세션의 AI 호출
- 사람 GM 세션에서 선택적으로 사용하는 AI 보조 호출
- 역할별 JSON 입력/출력 계약
- 검증, 재시도, fallback, 로깅 기준

## 기계 판독 출력 계약

`ai/contracts/internal_ai_contract_v1.json`은 다음 출력 필드 목록의 단일 기계 판독 기준이다.

- AI 서버→BE 내부 응답 envelope와 trace
- 7개 역할의 내부 `parsed` 응답
- Interpreter 내부 중첩 응답
- Google AI Studio 역할별 provider 출력과 Interpreter provider 중첩 출력
- Director `HINT`/`HUMAN_GM_ASSIST` 조건부 출력

Python 계약 테스트는 이 manifest를 Pydantic 모델 및 실제 조건부 provider schema와 비교한다. BE 계약 테스트는 같은 manifest를 응답 decoder의 runtime allowlist와 비교한다. 따라서 한쪽 필드만 추가·삭제하면 계약 검증이 실패한다.

Provider 입력은 요청 DTO 전체가 아니라 역할·의도에 따라 달라지는 compact projection이므로 이 manifest의 범위가 아니다. 입력 계약은 이 문서와 `ai/AI_STUDIO_IO_FIELD_REFERENCE.md`의 표를 기준으로 하며 `ai/app/tests/test_ai_contract_projection.py`의 실제 prompt projection 검증으로 고정한다.

계약 변경은 Pydantic 모델, BE decoder/allowlist, manifest, 관련 문서와 계약 테스트를 같은 변경에서 갱신해야 한다. `internal-ai-contract-v1`에서 필드를 제거하거나 의미를 바꾸는 변경은 “호환 필드 종료 정책”의 소비자 inventory를 통과한 새 계약 버전에서만 수행한다.

## 핵심 요약

- AI는 상태를 확정하지 않는다.
- 모든 AI 출력은 JSON으로 받고 서버 하네스가 검증한다.
- 내부 역할 요청의 미계약 top-level 필드는 무시하지 않고 422로 거부한다.
- 역할별 재시도는 최대 1회다.
- timeout, rate limit, quota, provider 요청 거부와 provider 인증·설정 오류는 fallback으로 처리한다.
- 모든 AI 호출은 `AiTrace`로 저장한다.
- token/latency 운영 집계는 `kind`, `promptVersion`, `model` 조합별로 분리한다.

## 상세 내용

범위 메모:

- 이 문서는 `AI GM 세션` 또는 `사람 GM 세션에서의 AI 보조 호출`에만 적용한다.
- 사람 GM의 직접 메시지 입력, NPC 대사 입력, 노드 변경, 자료 공개는 이 문서의 계약 대상이 아니다.
- AI는 상태를 확정하지 않고, 사람 GM 세션에서도 보조 기능으로만 사용된다.

### 공통 운영 조건

- 제공자: Google AI Studio / Gemini API
- 기본 모델: `gemma-4-31b-it`
- 전체 응답 목표: 30초 이내
- 출력 형식: JSON 객체. 서버 하네스가 JSON 파싱, JSON Schema 또는 Zod 검증, 규칙 검증을 수행한다.
- 재시도: 역할별 최대 1회
- timeout: 역할별 제한 시간 초과, API 오류, rate limit, quota, provider 요청 거부와 인증·설정 오류 시 fallback
- 로깅: 모든 AI 호출은 `AiTrace`로 저장

### Provider 계약

LLM 제공자는 백엔드 내부 인터페이스 뒤에 둔다.

```ts
type AiProvider = 'google-ai-studio';

type AiCallRequest = {
  provider: AiProvider;
  model: string;
  role: 'interpreter' | 'actor' | 'npc_dialogue' | 'narrator' | 'director' | 'summarizer' | 'check_result';
  promptVersion: string;
  contents: string;
  timeoutMs: number;
  responseSchemaName: string;
};

type AiCallResult = {
  rawOutput?: string; // 진단 payload logging이 켜진 경우에만 보존
  parsedJson?: unknown;
  latencyMs: number; // retry/backoff 포함 전체 역할 시간
  providerLatencyMs?: number;
  attemptLatenciesMs?: number[];
  schemaValidationRetries?: number;
  providerRequestId?: string;
  finishReason?: string;
  promptTokenCount?: number;
  outputTokenCount?: number;
  cachedTokenCount?: number;
  totalTokenCount?: number;
};
```

환경변수 기준:

- `AI_PROVIDER=google-ai-studio`
- `GOOGLE_API_KEY`
- `AI_MODEL_INTERPRETER=gemma-4-31b-it`
- `AI_MODEL_NARRATOR=gemma-4-31b-it`
- `AI_MODEL_ACTOR=gemma-4-31b-it`
- `AI_MODEL_NPC_DIALOGUE=gemma-4-31b-it`
- `AI_MODEL_DIRECTOR=gemma-4-31b-it`
- `AI_MODEL_SUMMARIZER=gemma-4-31b-it`
- `AI_MODEL_CHECK_RESULT=gemma-4-31b-it`
- `AI_TIMEOUT_MS=30000`

API 키는 서버에서만 사용하고 클라이언트 번들, 세션 로그, `AiTrace`, raw output에 기록하지 않는다. raw output 전문은 기본 비활성화하며 별도 진단 설정에서만 제한적으로 보존한다.

### 역할 구분

| 역할        | MVP 필수 | 상태 변경 가능 | 설명                               |
| ----------- | -------- | -------------- | ---------------------------------- |
| Interpreter | 예       | 아니오         | 자연어 입력을 구조화 액션으로 변환 |
| Narrator    | 예       | 아니오         | 확정된 결과를 GM 서사로 표현       |
| Actor       | 진단 전용 | 아니오         | NPC 행동 후보 중 하나 선택         |
| NpcDialogue | 일부     | 아니오         | 허용된 상황 안에서 NPC 대사 생성   |
| Director    | 아니오   | 아니오         | 정체 상황에서 힌트/전개 제안       |
| Summarizer  | 후순위   | 아니오         | 장기 요약 메모리 생성              |
| CheckResult | 일부     | 아니오         | 확정된 판정 결과를 표시용으로 서술  |

NpcDialogue는 Actor와 별도 역할이다. Actor는 `allowedActions` 중 하나를 고르고, NpcDialogue는 이미 허용된 상황 안에서 표시 가능한 NPC 대사만 생성한다.

이하 역할별 입력 타입은 Google AI Studio에 실제 전달하는 provider projection 기준이고, 출력 타입은 AI 서버가 검증·보강한 내부 AI→BE 최소 응답 기준이다. 모델이 직접 생성하는 더 작은 출력과 조건부 필드 집합은 `ai/contracts/internal_ai_contract_v1.json`을 기준으로 한다. `sessionId`, `turnId`, model override와 같은 하네스 메타 필드는 provider prompt에 포함하지 않는다. BE 공개 응답 호환에 필요한 파생 필드는 백엔드가 결정적으로 보강한다.

### Interpreter

#### 입력

```ts
type InterpreterInput = {
  requestIntent?: string;
  screenType?: string;
  sceneSummary: string;
  recentLogs: string[];
  rawText: string;
  targets: { id: string; name?: string; kind?: string; summary?: string; disposition?: string }[];
  selected?: { selfTarget?: true; mapPoint?: { x: number; y: number } };
  relatedEntities?: unknown[];
  relatedRules?: unknown[];
  classFeatureCandidates?: { titleKo: string; sourceEntityIds: string[] }[];
  transitionCandidates?: unknown[];
};
```

#### 출력

```ts
type InterpreterOutput = {
  action: StructuredAction;
  needsClarification: boolean;
  clarificationQuestion?: string;
  mentionedSpellId?: string;
  mentionedItemId?: string;
  requiredRuleCheckIds: string[];
  sceneTransition?: SceneTransitionContract;
};
```

#### 규칙

- 존재하지 않는 대상을 만들지 않는다.
- 피해량, HP 변경, 단서 획득을 확정하지 않는다.
- 판정 DC를 확정하지 않는다.
- 모호하면 `needsClarification`을 true로 둔다.
- `actorCharacterId`는 provider에 보내지 않고 서버가 검증된 요청 값으로 보강한다.
- `GENERAL_GM_REQUEST`의 분류 confidence만 provider가 0부터 1 사이 숫자로 생성한다.
- `StructuredAction.type`에 속하는 확정된 `requestIntent`에서는 provider 출력에서 type과 confidence를 제거하고 서버가 각각 요청 intent와 `1.0`으로 보강한다. 확인 질문이 필요하면 confidence는 `0.0`이다. `GENERAL_GM_REQUEST`와 지원 action type 이외의 값은 provider 호출 전에 422로 거부한다.
- 요청에서 확정된 `targetId`, spell action의 `spellId`, `itemId`는 각 `targets[]`/`relatedEntities[]` 원소의 `selected:true` 한 곳에서만 표시하고 provider가 다시 생성하지 않으며 서버가 canonical 조회 결과에서 응답 필드를 보강한다. 제거된 echo 필드를 provider가 반환하면 조건부 schema 위반이다.
- `availableTargetDetails`는 `availableTargets` ID 집합과 교차한 항목만 provider의 `targets[]`로 투영한다. 허용 목록 밖의 이름·요약은 전달하지 않는다.
- 내부 호환 요청의 `transitionEvidence`는 백엔드 조건 판정용이며 provider 입력이 아니다. 전환 후보의 조건 문장만 구조화하도록 보내고 flags, 미공개 단서, 현재 노드 ID는 Google prompt에서 제외한다.
- 전환 provider 출력은 후보 ID, 결합 논리, 요구조건만 포함한다. 선택 target, confidence, rationale는 provider가 생성하지 않고 백엔드가 조건을 평가한다. 후보와 각 `requirements[]` 원소는 모두 미계약 필드를 거부하며, 비전환 schema에는 전환 `$defs` 자체가 없어야 하고 `sceneTransition` 반환도 거부한다.

#### 실패 처리

| 실패                                  | 처리                                               |
| ------------------------------------- | -------------------------------------------------- |
| JSON parse 실패                       | 같은 입력으로 1회 재시도                           |
| schema 실패                           | schema 오류를 포함해 1회 재시도                    |
| confidence < 0.5                      | 확인 질문 또는 선택지 fallback                     |
| timeout                               | 선택지 fallback                                    |
| Gemini API rate limit 또는 quota 오류 | 재시도하지 않고 선택지 fallback, `FailureLog` 기록 |
| Gemini API 400/409 요청 거부          | 호출자 4xx로 재분류하지 않고 재시도 없이 선택지 fallback |
| Gemini API 401/403 인증 오류          | 제품 호출자 인증 오류로 노출하지 않고 재시도 없이 선택지 fallback |
| Gemini API 404 모델/endpoint 오류     | 설정 오류로 분류하고 재시도 없이 선택지 fallback   |
| 네트워크 오류                         | 짧은 연결 오류 메시지와 선택지 fallback            |

AI 서버 자체에 연결할 수 없는 경우에도 BE는 같은 AI POST를 재시도하지 않는다. Interpreter는 `OUT_OF_SCOPE` 확인 질문, Actor는 허용된 첫 행동, 생성 역할은 각 역할별 안전 템플릿으로 즉시 fallback한다.

### Narrator

#### 입력

```ts
type NarratorInput = {
  action?: {
    type: string;
    approach: string;
    requiresRoll: boolean;
    attackKind?: string;
    ability?: string;
    skill?: string;
  };
  checkRequest?: {
    checkType: string;
    ability?: string;
    skill?: string;
    difficultyClass?: number;
    reason: string;
  };
  diceResult?: {
    formula: string;
    total: number;
    naturalD20?: number;
    success?: boolean;
  };
  stateDiffSummary?: {
    summary: string;
    hpChanges?: string[];
    inventoryChanges?: string[];
    conditionChanges?: string[];
  };
  scene: {
    title?: string;
    summary: string;
    tone: string;
  };
  maxLength: number;
  legacyActionSummary?: string;
  legacyDiceSummary?: string;
};
```

#### 출력

`stateDiffSummary`는 백엔드 `StateDiff.operations`가 아니라, 백엔드가 확정한 상태 변경을 공개 내레이션용으로 요약한 DTO다. 내부 flag와 node ID는 provider projection에서 제외한다. AI Narrator 입력에서는 `StateDiff`라는 이름을 쓰지 않는다.

```ts
type NarratorOutput = {
  narration: string;
};
```

`trace.attempts`와 `attemptLatenciesMs`는 실제 provider 호출만 센다. `attemptLatenciesMs`가 명시되면 길이는 `attempts`와 같아야 한다. `schemaValidationRetries`는 마지막 검증 실패 자체가 아니라 그 실패 때문에 실제 provider 호출까지 도달한 후속 attempt만 세므로 `max(0, attempts - 1)`을 넘지 않는다. 재시도 경로에 진입했더라도 local/config preflight에서 끝나면 세지 않는다. 이 불변식은 AI 응답 모델과 BE decoder가 모두 검증한다. 로컬 설정 실패와 BE 자체 fallback은 각각 `0`, `[]`로 기록하고 전체 경과 시간은 `latencyMs`에 남긴다.

내부 AI 응답은 신뢰된 네트워크에 있다는 이유만으로 무검증 수용하지 않는다. BE decoder는 모든 역할의 필수 생성 문자열이 비어 있지 않은지와 최대 길이를 다시 확인하고, Interpreter의 action type·attack kind·suggested difficulty, 장면 전환 logic·requirement type·polarity enum 및 모든 중첩 ID·설명 길이를 AI Pydantic과 같은 값으로 검증한다. 이 값은 `ai/contracts/internal_ai_contract_v1.json.internalResponse.interpreterConstraints`를 기계 판독 기준으로 삼는다.

DB `AiTrace.latencyMs`는 BE가 호출 직전부터 응답 decode 또는 fallback 결정까지 측정한 wall-clock이다. AI 서버 응답의 `trace.latencyMs`는 역할 runner 진입부터 응답 반환 직전까지의 총시간으로서 retry/backoff와 best-effort 진단 로그 기록을 포함한다. `providerLatencyMs`는 provider가 보고한 단일 성공 응답 지연이다. 파일 JSONL의 trace는 파일 쓰기 전에 만든 진단 snapshot이므로 제품 품질 지표의 단일 기준으로 사용하지 않는다.

AI와 BE decoder는 trace의 provider attempt를 최대 2회, schema validation retry를 최대 1회로 제한한다. latency와 token usage는 비음수 32-bit 정수만 허용하며, role 50자, provider 100자, model·prompt version 200자, finish reason·failure type 100자, provider request ID 500자 상한을 양쪽에서 동일하게 적용한다. 이 범위를 벗어난 응답은 DB에 저장하려 시도하지 않고 AI transport 계약 오류로 처리한다. Google usage metadata의 prompt/output/cached/total은 독립 optional 계측값이다. 누락값을 추정하거나 `total = prompt + output` 같은 관계식을 강제하지 않고, DB percentile도 필드별 non-null 표본만 사용한다.

AI template fallback은 HTTP 200이어도 provider 결과 상태를 성공으로 덮어쓰지 않는다. 원래 `failureType`을 보존하고 timeout은 `TIMEOUT`, 그 밖의 provider 실패는 `ERROR`로 저장하며 `fallbackUsed=true`를 별도로 기록한다.

컨테이너 내부 절대 `logPaths`는 저장하거나 전송하지 않는다. JSONL과 trace 목록은 trace ID 및 `harness_history.jsonl#trace-id` 형식의 상대 `diagnosticRef`만 사용한다.

제품 Narrator route는 JOINED 상태의 GM/HOST만 호출할 수 있다. 백엔드는 구조화된 `action`과 `scene`을 필수로 전달하며, 플레이어 원문은 어조 참고용일 뿐 확정 사실로 사용하지 않는다. 레거시 summary 필드는 dual-read 호환용이며 legacy-only 제품 요청은 허용하지 않는다.

### 호환 필드 종료 정책

현재 공개 제품 route는 `/api/v1`, 내부 역할 계약은 `internal-ai-contract-v1`로 부른다. 아래 필드는 v1에서 입력 호환만 유지하고 사실 입력이나 provider prompt로 승격하지 않는다. 제거 버전은 공개 API는 `/api/v2`, 내부 transport는 `internal-ai-contract-v2`다.

| 호환 항목 | v1 동작 | 저장소 내 현재 소비자 | 제거 버전·게이트 |
| --- | --- | --- | --- |
| Narrator `rawInput`, `actionSummary`, `diceSummary`, `sceneTone` | AI 서버 legacy-only dual-read만 유지. 구조화 BE 제품 호출은 전송하지 않음 | AI fallback/legacy adapter와 계약 테스트만 존재 | `internal-ai-contract-v2`; 구조화 호출 회귀 통과와 배포 consumer inventory 0 |
| Hint `publicClues` | 공개 DTO에서 받지만 무시하고 서버 확정 단서로 교체 | 제품 호출은 `trustedPublicClues` 사용 | `/api/v2`; v1 호출 telemetry 또는 API consumer inventory에서 사용 0 |
| Summary `logs`, `nodeId`, `includeHiddenContext` | client `logs` 무시, node/hidden 미지원 요청 거부 | 내부 호출은 server-owned `trustedLogs` 사용 | `/api/v2`; typed node/visibility log 계약 배포 또는 해당 기능 폐기 결정 |
| NpcDialogue `selectedActionId`, `audienceIds` | 공개 DTO에서 받지만 내부 AI transport로 전달하지 않음 | 저장소 제품 호출자 0 | `/api/v2`; 외부 소비자 inventory 0 |
| 공개 v1의 파생 parsed 필드 | `visibleSummary`, hint level/scope/spoiler/safety, summary type/range/keyFacts/safety, NPC tone/safety를 BE가 호환 보강하고 내부 AI transport·DB response JSON에서는 제외 | 저장소 FE 소비자 0, 공개 controller 응답 계약만 존재 | `/api/v2`; 외부 consumer inventory 후 실제 소비되는 필드만 승격하고 echo·빈 배열 제거 |
| `GET /internal/ai/health` | `/health/ready` 호환 alias | Compose는 `/health/ready` 사용, alias 소비자는 계약 테스트뿐 | `internal-ai-contract-v2`; 배포 probe·모니터 consumer inventory 0 |
| Actor 역할 전체 | 내부 진단 하네스만 유지하며 NPC Dialogue에 자동 연결하지 않음 | 저장소 제품 호출자 0 | `internal-ai-contract-v2`; NPC turn engine 소유 소비자가 없으면 route·설정·prompt·schema·benchmark 일괄 제거 |

삭제된 AI 서버 `/api/v1/sessions/*` route는 저장소 소비자 0을 확인해 2026-07 remediation 계약에서 제거했다. 새로운 소비자는 백엔드 `/api/v1/sessions/{sessionId}/ai/*`만 사용해야 한다.

공개 `/api/v1` 호환 응답의 `visibleSummary`는 `stateDiffSummary.summary`, narration 순서로 백엔드가 파생한다. 최대 300자로 제한하고 종결 문장부호만 제거하며, 문장부호가 없는 정상 문장의 마지막 글자를 임의로 버리지 않는다. 시도한 action approach를 확정 결과처럼 사용하지 않으며 내부 AI transport는 `narration`만 전달한다.

#### 규칙

- 확정되지 않은 단서, 피해, 보상, NPC 사망을 추가하지 않는다.
- 주사위 결과를 바꾸지 않는다.
- 플레이어 캐릭터의 의도를 임의로 바꾸지 않는다.
- 한국어로 출력한다.
- MVP 기본 출력은 2~5문장으로 제한한다.

#### 실패 처리

| 실패                                  | 처리                                    |
| ------------------------------------- | --------------------------------------- |
| JSON parse 실패                       | 1회 재시도                              |
| timeout                               | 템플릿 서술 사용                        |
| 새 사실 추가                          | rule validator 실패 후 템플릿 서술 사용 |
| Gemini API rate limit 또는 quota 오류 | 템플릿 서술 사용, `FailureLog` 기록     |
| 네트워크 오류                         | 템플릿 서술 사용                        |

### Actor

현재 제품 턴 루프의 소비자는 없으며 `/internal/ai/actor` 진단 하네스에서만 사용한다. NPC 턴 엔진의 명시적 소유 소비자가 생기기 전에는 NpcDialogue 경로에 자동 연결하지 않는다.

#### 입력

```ts
type ActorInput = {
  npcSummary: string;
  disposition: string;
  hpStatus?: string;
  conditions?: string[];
  sceneSummary: string;
  allowedActions: {
    id: string;
    label: string;
    actionType: string;
  }[];
};
```

#### 출력

```ts
type ActorOutput = {
  selectedActionId: string;
};
```

#### 규칙

- `allowedActions`에 없는 행동을 선택할 수 없다.
- Actor의 선택은 엔진이 다시 검증한다.
- 불투명 `npcEntityId`와 추적·모델 metadata는 provider에 보내지 않는다.
- 빈 `conditions`와 미확정 기본값 `hpStatus="unknown"`은 제외하고 실제 상태가 있을 때만 보낸다.

Actor는 NPC 대사를 생성하지 않는다. NPC 대사는 `NpcDialogue` 역할이 처리한다.

### NpcDialogue

NpcDialogue는 AI-002 NPC 대사 생성 전용 역할이다. 백엔드가 공개 가능한 NPC·장면 맥락만 전달하며, 행동을 선택하거나 상태를 변경하지 않는다.

#### 입력

```ts
type NpcDialogueInput = {
  npcName?: string;
  npcSummary: string;
  disposition: 'hostile' | 'neutral' | 'friendly' | string;
  sceneSummary: string;
  recentContext: string[];
  dialogueIntent: string;
  maxLength: number;
};
```

#### 출력

```ts
type NpcDialogueOutput = {
  dialogue: string;
};
```

공개 `/api/v1` 호환 응답의 `tone`은 요청 disposition에서 백엔드가 파생한다. 내부 AI transport는 `dialogue`만 전달하며 불투명한 NPC·audience ID는 provider에 전달하지 않는다.

#### 규칙

- 행동 선택은 Actor 책임이다.
- 대사는 요청에 포함된 NPC, 장면, 최근 맥락, 대사 목적 안에서만 생성한다.
- 피해량, DC, 주사위 결과, HP 변경, 상태 변경을 만들 수 없다.

### Director

Director는 MVP 필수 기능이 아니다.

#### 입력

```ts
type DirectorInput = {
  hintLevel: 'LIGHT' | 'NORMAL' | 'STRONG';
  question?: string;
  sceneSummary: string;
  recentLogs?: string[];
  publicClues?: string[];
  triedApproaches?: string[];
  responseMode: 'HINT' | 'HUMAN_GM_ASSIST';
};
```

#### 출력

```ts
type DirectorOutput = {
  content: string;
  suggestions: string[];
};
```

조건부 호출 후보:

- 같은 노드에서 일정 턴 이상 진전이 없음
- 플레이어가 힌트를 요청함
- 실패가 반복되어 대체 전개가 필요함

Director는 상태를 바꾸지 않고, 힌트 후보나 다음 전개 후보만 제안한다.
일반 `HINT` provider 출력은 `content`만 허용한다. `suggestions`는 `HUMAN_GM_ASSIST`에서만 허용하며 HINT 응답에 포함되면 조건부 schema 위반으로 거부한다.

### Summarizer

#### 입력

```ts
type SummarizerInput = {
  summaryType: 'player_visible' | 'ai_context';
  logs: string[];
};
```

#### 출력

```ts
type SummarizerOutput = {
  content: string;
};
```

내부 AI 계약은 `summaryType`, `rangeType`, `lastLogCount`, 백엔드가 선택한 `logs`만 받는다. 제품 API의 레거시 `logs`는 하위 호환을 위해 받을 수 있지만 사실 입력으로 신뢰하지 않으며, 백엔드 저장소의 확정 공개 narration으로 교체한다. Player main-command Summary도 Interpreter/NPC용 공용 recent context(`rawInput => narration`)를 `trustedLogs`로 승격하지 않고 `AiService`가 `listConfirmedPublicNarrations()`에서 다시 조회한다. 서버 내부 호출이 이미 확정 narration을 직접 조회한 경우에만 `trustedLogs`를 사용할 수 있다. 현재 turn log에는 node·visibility metadata가 없으므로 `includeHiddenContext=true`와 `SINCE_NODE`는 provider 호출 전에 400으로 거부한다. `FULL`은 확정 로그가 50개 이하일 때만 전체를 선택하고, 51개 이상이면 chunked summarization이 없으므로 400으로 거부한다. 이로써 일부 로그만 보내고 `coveredTurnRange=FULL`이라고 표기하는 의미 오류를 막는다. `RECENT`는 최신 `lastLogCount`를 적용하며 각 로그를 2,000자, 최대 50개로 제한한다. Google prompt에는 범위 선택이 끝난 `summaryType`과 `logs`만 전달하며 `rangeType`, `lastLogCount`, 추적 메타는 제외한다.

### CheckResult

#### 입력

```ts
type CheckResultInput = {
  outcome: 'SUCCESS' | 'FAILURE';
  intent: string;
  actionSummary?: string;
  targetName?: string;
  targetSummary?: string;
  targetDisposition?: string;
  sceneSummary?: string;
  allowedRewardFacts?: string[];
  visibleEntities?: string[];
  outputMode: 'GM_NARRATION' | 'NPC_REPLY' | 'OBSERVATION';
};
```

#### 출력

```ts
type CheckResultOutput = {
  narration: string;
};
```

내부 AI 계약은 확정된 `outcome`, `intent`, 선택적 표시 문맥, `allowedRewardFacts`, `outputMode`를 받는다. 플레이어 원문과 `publicClues` 중복본은 전달하지 않는다. 특히 사회 판정·감정 읽기 성공은 백엔드가 `targetName`, `allowedRewardFacts`, `outcome`, `intent`, `outputMode`만 AI 서버로 보내며, AI 서버도 action summary, target summary/disposition, scene, visible entity를 Google prompt에서 제외한다. 허용 사실이 없으면 제품 경로는 provider를 호출하지 않고 새 사실이 없는 서버 템플릿을 사용한다. 허용 사실이 있으면 모델은 한 항목을 원문 그대로 선택해야 하며 AI 서버는 그 밖의 생성 문장을 버리고, 백엔드는 결과가 허용 항목과 정확히 일치하는지 다시 검증한다. Provider와 제품 응답은 narration만 사용하며, 사용하지 않는 `rewardInfo` 복제 필드는 두 계약에서 제거했다.

### Prompt 관리

프롬프트는 역할별로 버전을 둔다.

권장 파일 구조:

```text
prompts/
  interpreter.v1.md
  interpreter.extract.v1.md
  narrator.v1.md
  actor.v1.md
  npc_dialogue.v1.md
  director.v1.md
  summarizer.v1.md
  check_result.v1.md
```

`AiTrace.promptVersion`에는 파일명 또는 semantic version을 저장한다.

### 평가 지표

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
- role별 input/output/total token p50/p95와 각 token 필드의 개별 표본 수, schema 계측 표본 수·retry율. 하위 호환 `tokenSampleCount`는 total token 표본 수 alias다. provider 출력이 반환되어 Pydantic·역할 의미 검증을 실제로 시작한 trace만 `schemaValidationRetries=0|1`로 기록한다. local/config/auth/rate-limit/network/timeout처럼 출력 검증 전에 끝난 실패와 BE fallback은 `null`로 두어 retry율 분모에서 제외한다. Schema 표본이 0개면 `schemaRetryRate=null`이며, 전체 또는 Interpreter/Narrator 역할 표본이 없으면 대응 timeout/fallback `targetMet`은 `false`다.

기본 목표는 `QUALITY_MVP_ACCEPTANCE.md`를 따른다.

### Google AI Studio 적용 메모

- Google AI Studio에서 API 키를 발급하고 Gemini API로 Gemma 4 모델을 호출한다.
- 공식 문서 기준 Gemma 4 호출 모델명은 `gemma-4-31b-it`이다.
- free tier는 개발과 시연에는 사용할 수 있지만, 실제 rate limit은 프로젝트별로 Google AI Studio에서 확인한다.
- Gemma 4 경로는 모델 출력이 JSON 텍스트라는 전제로 받고, 서버 하네스가 형식과 의미를 검증한다.
- Gemini API의 structured output 보장이 반드시 필요한 실험은 동일 Provider 인터페이스에서 structured output 지원 Gemini 모델로 교체해 A/B 테스트한다.

## 관련 원칙

- [../rules/AI_RUNTIME_RULES.md](../rules/AI_RUNTIME_RULES.md): AI 역할, 검증, fallback, 보안 원칙
- [../rules/ARCHITECTURE_RULES.md](../rules/ARCHITECTURE_RULES.md): AI 실패 시 세션 진행 원칙
- [../rules/PERMISSION_RULES.md](../rules/PERMISSION_RULES.md): 사람 GM 직접 조작과 AI 보조 호출 분리 원칙

## 관련 문서

- [RUNTIME_SESSION_TURN_FLOW.md](RUNTIME_SESSION_TURN_FLOW.md): AI 호출이 포함되는 턴 처리 흐름
- [trpg_main_command_mvp_flow_with_categories.md](trpg_main_command_mvp_flow_with_categories.md): 메인 커맨드별 AI 호출 여부
- [QUALITY_MVP_ACCEPTANCE.md](QUALITY_MVP_ACCEPTANCE.md): AI 품질 기준

## 변경 시 주의사항

- 역할별 출력 형식을 바꾸면 백엔드 schema, DTO, validator, 테스트를 함께 갱신한다.
- timeout이나 fallback 기준을 바꾸면 `RUNTIME_SESSION_TURN_FLOW.md`와 수용 기준을 함께 확인한다.
