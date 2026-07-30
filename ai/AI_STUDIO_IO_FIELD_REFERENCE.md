# AI 입출력 필드 기준

이 문서는 Google AI Studio 호출과 하네스 DTO 필드의 뜻을 고정한다.

새 필드를 추가할 때는 이 문서, Pydantic schema, prompt, test를 같은 변경에서 고친다.

호환 입력의 제거 버전과 소비자 migration gate는 `doc/structure/AI_RUNTIME_CONTRACTS.md`의 “호환 필드 종료 정책”을 단일 기준으로 사용한다.

역할별 최소 출력의 기계 판독 기준은 `contracts/internal_ai_contract_v1.json`이다. 이 manifest는 내부 AI→BE 응답과 Google provider 출력의 필드 집합을 함께 기록하며 Python Pydantic/조건부 provider schema 및 BE decoder allowlist와 계약 테스트로 비교된다. 역할별 compact 입력 projection은 선택값과 의도에 따라 달라지므로 manifest에 DTO 전체를 복제하지 않고 아래 표와 `app/tests/test_ai_contract_projection.py`로 검증한다.

## 호출 흐름

1. API route가 역할별 요청 DTO를 받는다.
2. service가 prompt와 JSON schema를 만든다.
3. `GoogleAiStudioClient.generate_json()`이 Google AI Studio를 호출한다.
4. 응답 JSON을 Pydantic schema로 검증한다.
5. 최소 응답과 trace를 저장한다. payload 전문은 `AI_LOG_PAYLOADS=true`인 진단 환경에서만 파일에 남긴다.
6. 실패하면 역할별 fallback을 반환하고 trace에 `fallback`을 남긴다.

## Google AI Studio 공통 요청

| 필드                             | 뜻                                                         |
| -------------------------------- | ---------------------------------------------------------- |
| `model`                          | 호출 모델. 요청 override가 없으면 역할별 기본 모델 사용    |
| `contents`                       | service가 만든 사용자 prompt                               |
| `system_instruction`             | `app/prompts/*.md`의 역할 규칙                             |
| `temperature`                    | 출력 다양성. Interpreter는 낮게, Narrator는 약간 높게 사용 |
| `response_mime_type`             | 항상 `application/json`                                    |
| `response_json_schema`           | 역할별 Pydantic schema                                     |
| `http_options.timeout`           | 전체 deadline에서 남은 provider 호출 시간(ms)              |
| `thinking_config.thinking_level` | 지원이 확인된 Gemini 2.5 모델 계열에서만 사용              |

Google AI Studio에 전달하는 입력은 별도 typed request body가 아니라 `contents` 문자열이다. 따라서 역할 service는 하네스 DTO 전체를 직렬화하지 않고 역할별 provider projection만 compact JSON으로 넣는다. `sessionId`, `turnId`, `model`과 같은 추적·라우팅 필드는 provider prompt에서 제외한다.

백엔드 공개 Hint/Summary/NpcDialogue API의 client-provided context는 JOINED GM runtime만 제출할 수 있다. 플레이어 기능은 메인 명령 계층이 장면·로그·대상을 조회·검증한 `SERVER_VALIDATED` 호출만 사용하므로, 클라이언트가 해당 표식을 요청 body로 지정할 수 없다.

`AI_PROMPT_MAX_BYTES`는 `contents`, `system_instruction`, 정제된 `response_json_schema`의 UTF-8 byte 합계에 적용한다. 초과 요청은 provider 호출 전에 422로 거절한다.

내부 역할 요청 DTO는 top-level 미계약 필드를 무시하지 않고 `extra=forbid`로 422 처리한다. 따라서 제거된 필드를 오래된 호출자가 계속 보내는 transport drift가 조용히 남지 않으며 provider 호출 횟수는 0이다.

## 하네스 공통 메타 필드

| 필드               | 뜻                                                      |
| ------------------ | ------------------------------------------------------- |
| `sessionId`        | 세션 trace/filter용. AI가 사실 판단 근거로 쓰지 않는다. |
| `turnId`           | 턴/요청 상관관계 추적용                                 |
| `actorCharacterId` | 관련 캐릭터 ID. 행동 사실은 구조화 입력이 우선한다.     |
| `model`            | 선택 모델 override                                      |

## 요청 DTO

### `SmokeHarnessRequest`

| 필드     | 뜻                      |
| -------- | ----------------------- |
| `prompt` | 연결 확인용 자유 prompt |
| `model`  | 선택 모델 override      |

Smoke provider 출력은 연결과 structured output 지원만 확인하는 `{ "ok": true }` 한 필드 계약이다. Interpreter 전체 응답을 생성하지 않는다.

### `InterpreterHarnessRequest`

| 필드                           | 뜻                         |
| ------------------------------ | -------------------------- |
| `rawText`                      | 플레이어 자연어 행동       |
| `actorCharacterId`             | 행동 주체                  |
| `sceneSummary`                 | 공개 장면 요약             |
| `availableTargets`             | 선택 가능한 target ID 목록 |
| `sessionId`, `turnId`, `model` | 공통 메타                  |

Provider prompt에서는 `actorCharacterId`를 제외하고 `availableTargets`와 그 ID 집합에 포함된 `availableTargetDetails`만 `targets` 하나로 합친다. 허용 목록 밖의 상세 대상은 이름·요약을 포함해 전달하지 않는다. 상세 이름이 없는 대상은 ID를 name으로 복제하지 않는다. 명시 target은 해당 `targets[]` 원소, spell/item은 해당 `relatedEntities[]` 원소에 `selected:true`로 표시해 같은 ID를 별도 `selected` 객체에 반복하지 않는다. 자기 자신 선택은 actor ID 대신 `selected.selfTarget=true`, 좌표 선택은 `selected.mapPoint`로 전달한다. `requestIntent=GENERAL_GM_REQUEST`일 때만 전체 분류 prompt를 사용하며, `StructuredAction.type`에 속하는 확정 의도는 `interpreter.extract.v1.md`로 parameter만 추출한다. 두 집합 밖의 `requestIntent`는 provider 호출 전에 422로 거부한다. SRD 문맥은 해당 의도에 필요한 경우에만 추가한다. 장면 전환의 `transitionEvidence`는 백엔드가 조건을 판정할 때만 사용하고, flags·미공개 단서·현재 노드 ID를 Google prompt에 전달하지 않는다. 요청에서 이미 확정된 `targetId`, spell action의 `spellId`, `itemId`는 provider 출력 schema에서 대응 echo 필드를 제거하고 서버가 응답에 보강한다.

### `NarratorHarnessRequest`

| 필드                                               | 뜻                                               |
| -------------------------------------------------- | ------------------------------------------------ |
| `rawInput`                                         | legacy-only 선택 입력. 구조화 제품 호출과 provider prompt에서는 제외 |
| `action`                                           | 백엔드가 수락한 구조화 행동                      |
| `checkRequest`                                     | 백엔드가 확정한 판정 요청                        |
| `diceResult`                                       | 백엔드가 확정한 주사위 결과                      |
| `stateDiffSummary`                                 | 백엔드 `StateDiff.operations`의 공개 서술용 요약 |
| `scene`                                            | 공개 장면 정보                                   |
| `constraints`                                      | 언어, 길이, 새 사실 금지 규칙                    |
| `actionSummary`, `diceSummary`, `sceneTone`        | legacy 보조 필드                                 |
| `sessionId`, `turnId`, `actorCharacterId`, `model` | 공통 메타                                        |

`stateDiffSummary`는 백엔드의 실제 `StateDiff`가 아니다. Narrator가 읽는 공개 요약이다.

Provider prompt의 Narrator projection은 `rawInput`, `actorCharacterId`, target/spell/feature ID, confidence, dice roller ID, 내부 flag/node ID를 제외한다. 행동 종류·접근 방식, 확정 판정/주사위 값, 공개 상태 변경 문장, scene만 전달한다. 구조화 action이 있는 제품 호출은 BE→AI transport에도 `rawInput`을 싣지 않는다.

### `DirectorHarnessRequest`

| 필드                           | 뜻                          |
| ------------------------------ | --------------------------- |
| `hintLevel`                    | `LIGHT`, `NORMAL`, `STRONG` |
| `question`                     | 선택 질문                   |
| `sceneSummary`                 | 공개 장면 요약              |
| `recentLogs`                   | 최근 공개 로그              |
| `publicClues`                  | 이미 공개된 단서            |
| `triedApproaches`              | 이미 시도한 접근            |
| `responseMode`                 | `HINT` 또는 `HUMAN_GM_ASSIST` |
| `sessionId`, `turnId`, `model` | 공통 메타                   |

Human GM Assist의 `targetId`와 `suggestedActionId`는 저장·검증에만 사용한다. 공개 이름이나 행동 설명으로 해석되지 않은 opaque ID 상태에서는 Director provider 질문에 넣지 않는다.

공개 `AiHintRequestDto.publicClues`는 호환용 deprecated 필드이며 사실로 신뢰하지 않는다. 제품 호출은 백엔드가 조회한 공개 단서와 event hint만 내부 `trustedPublicClues`로 전달한다.

### `SummarizerHarnessRequest`

| 필드                           | 뜻                                  |
| ------------------------------ | ----------------------------------- |
| `summaryType`                  | `player_visible` 또는 `ai_context`  |
| `rangeType`                    | `RECENT`, `FULL`, `SINCE_NODE`      |
| `lastLogCount`                 | 최근 로그 수                        |
| `logs`                         | 확정 로그 목록                      |
| `sessionId`, `turnId`, `model` | 공통 메타                           |

제품 API의 레거시 `logs` 필드는 하위 호환을 위해 입력 DTO에만 남아 있으며 요약 사실의 출처로 신뢰하지 않는다. 외부 요청은 백엔드가 저장한 확정 narration을 다시 조회하고, 내부 메인 명령 경로는 서버가 직접 조회한 공개 로그를 `trustedLogs`로 넘긴다. `includeHiddenContext=true`와 `SINCE_NODE`는 turn log에 visibility/node metadata가 생기기 전까지 provider 호출 전에 400으로 거부한다. `FULL`은 확정 로그가 50개 이하일 때만 모든 로그를 보내며, 51개 이상이면 거짓 `FULL` 표기나 무제한 prompt 대신 chunked summarization 미구현 오류로 거부한다.

AI 서버 transport는 선택 완료된 `summaryType`, `rangeType`, `lastLogCount`, `logs`를 받지만 Google prompt에는 `summaryType`과 실제 선택된 `logs`만 넣는다. `rangeType`과 `lastLogCount`는 서버의 범위 선택·응답 보강용이며 모델이 다시 해석하지 않는다.

### `ActorHarnessRequest`

| 필드                           | 뜻                         |
| ------------------------------ | -------------------------- |
| `npcEntityId`                  | 행동 후보를 고를 NPC       |
| `npcSummary`                   | 허용된 NPC 요약            |
| `disposition`                  | 현재 태도                  |
| `hpStatus`                     | 정확한 HP가 아닌 공개 상태 |
| `conditions`                   | 적용 상태 이름 목록        |
| `sceneSummary`                 | 공개 장면 요약             |
| `allowedActions`               | 백엔드가 허용한 행동 후보  |
| `sessionId`, `turnId`, `model` | 공통 메타                  |

Actor는 대사를 쓰지 않는다.

Provider projection에는 `npcEntityId`, `sessionId`, `turnId`, `model`을 넣지 않는다. 빈 `conditions`와 기본 미확정값인 `hpStatus="unknown"`도 제외하고, 실제 상태가 알려진 경우에만 `hpStatus`를 전달한다.

### `NpcDialogueHarnessRequest`

| 필드                           | 뜻                    |
| ------------------------------ | --------------------- |
| `npcEntityId`                  | 말하는 NPC            |
| `npcName`                      | 표시 가능한 이름      |
| `npcSummary`                   | 말해도 되는 NPC 정보  |
| `disposition`                  | 현재 태도             |
| `sceneSummary`                 | 공개 장면 요약        |
| `recentContext`                | 최근 공개 맥락        |
| `dialogueIntent`               | 대사의 목적           |
| `maxLength`                    | 대사 최대 길이        |
| `sessionId`, `turnId`, `model` | 공통 메타             |

NpcDialogue는 행동을 고르지 않는다.

`npcEntityId`는 AI 서버의 안전 fallback 화자 식별에만 사용하고 provider prompt에서는 제외한다. 선택 행동이나 audience가 대사 의미에 필요하면 불투명 ID가 아니라 백엔드가 검증한 짧은 의미 요약을 별도 필드로 추가한다.

공개 DTO의 `selectedActionId`, `audienceIds`는 호환용 deprecated 필드이며 현재 내부 AI transport로 전달하지 않는다.

### `CheckResultHarnessRequest`

| 필드 | 뜻 |
| --- | --- |
| `outcome`, `intent` | 백엔드가 확정한 판정 결과와 의도 |
| `actionSummary`, `target*`, `sceneSummary` | 서술 문맥. 새 사실 허용 목록이 아님 |
| `allowedRewardFacts` | 성공 narration에서 공개할 수 있는 사실 allowlist |
| `outputMode` | GM narration, NPC reply, observation 표시 방식 |

`sessionId`, `turnId`, `model`, 전체 request dump는 CheckResult provider prompt에 넣지 않는다.

## SRD Prompt Context

Interpreter는 repo root의 `srd-data/generated/srd/`에서 찾은 작은 문맥만 받는다.

| 필드                 | 뜻                                                  |
| -------------------- | --------------------------------------------------- |
| `relatedEntities`    | 주문, 아이템, 몬스터, 상태, 종족, 직업 등 검색 결과 |
| `relatedRules`       | 현재 행동에 필요한 작은 규칙 조각                   |
| `classFeatureCandidates` | class feature 판단에 필요한 최소 이름·source entity ID |

AI는 이 값에서 ID를 참고할 수 있지만, 명중/피해/상태 같은 결과를 확정하면 안 된다.

## 응답 공통 trace

| 필드                | 뜻                    |
| ------------------- | --------------------- |
| `attempts`          | 애플리케이션 공통 실행기가 수행한 실제 호출 시도 횟수. SDK 내부 retry는 `HttpRetryOptions(attempts=1)`로 비활성화 |
| `latencyMs`         | role runner 진입부터 응답 반환 직전까지의 전체 시간. retry, backoff, best-effort 진단 로그 기록 포함 |
| `providerLatencyMs` | 마지막 성공 provider 시도 시간 |
| `attemptLatenciesMs` | provider 시도별 시간 목록 |
| `schemaValidationRetries` | provider 출력 schema 검증 실패로 재시도한 횟수. provider가 출력 검증 단계까지 도달하지 못한 local/config/auth/rate-limit/network/timeout 실패와 BE fallback에는 `null` |
| `promptTokenCount`, `outputTokenCount`, `cachedTokenCount`, `totalTokenCount` | provider usage metadata |
| `finishReason`      | provider 종료 사유    |
| `providerRequestId` | provider 요청 ID      |
| `fallback`          | fallback 응답 여부    |
| `fallbackReason`    | 민감한 provider 문구를 제외한 분류 코드 |

Token usage는 bool·음수·DB `Int` 범위 초과값을 `null`로 정규화한다. `finishReason`은 100자, `providerRequestId`는 500자로 제한해 진단 metadata 때문에 정상 provider 응답이나 DB 저장이 실패하지 않게 한다.

Trace row 상태값은 `success`, `failure`, `fallback` 중 하나다. 운영 품질 API는 `role(kind) + promptVersion + model` 조합별 input/output/total token p50·p95, provider latency p50·p95, schema 계측 표본 수와 retry율을 이 필드들에서 집계한다. 따라서 Interpreter 일반 분류 prompt와 known-intent extraction prompt를 별도로 비교할 수 있다. provider 출력이 반환되어 Pydantic·역할 의미 검증을 실제로 시작한 trace만 schema retry율 분모에 포함하며, 그 전에 끝난 provider 장애와 BE fallback은 제외한다.

내부 역할 응답은 `{parsed, fallback, fallbackReason, trace}`만 전송한다. `provider`, `model`, `latencyMs`, `promptVersion`, `finishReason`, `providerRequestId`의 단일 기준은 `trace`이며 top-level 복제 필드는 제거했다. `rawOutput`은 HTTP 응답에 포함하지 않고 `AI_LOG_PAYLOADS=true`인 진단 환경에서만 bounded 파일 로그에 기록한다. DB `AiTrace`는 metadata를 전용 컬럼에 저장하며 `responseJson`에는 parsed/fallback 결과만 저장한다.

Trace 목록은 현재 JSONL과 회전 백업을 합쳐 `AI_TRACE_SCAN_MAX_BYTES` 안에서 최신 tail만 읽는다. `scannedBytes`, `malformedRows`, `scanTruncated`로 실제 조회 범위와 손상 행을 노출하며, `total`과 `filtered`는 전체 영구 이력이 아니라 이 bounded scan 안의 행 수다. 파일 logger는 프로세스의 첫 기록에서 현재 max byte를 넘는 기존 history/latest와 현재 backup count를 넘는 회전본을 제거해 설정 축소 뒤에도 저장 상한을 복구한다. JSONL trace의 latency는 실제 append 전에 만든 진단 snapshot이며 제품 품질 지표는 반환 trace와 BE DB wall-clock을 사용한다.

Provider schema sanitizer는 Google 공식 `responseJsonSchema` 지원 목록에 있는 `enum`, 숫자 `minimum`/`maximum`, 배열 `minItems`/`maxItems`, `additionalProperties`를 유지한다. 역할별 strict provider model과 장면 전환 `requirements[]`를 포함한 모든 중첩 provider 객체에 `additionalProperties: false`를 전달해 미계약 필드 생성을 먼저 억제하고 서버에서도 다시 거절한다. 비전환 Interpreter schema에서는 전환 관련 `$defs`도 제거해 사용하지 않는 schema token을 보내지 않는다. 공식 지원 목록에 없는 문자열 길이와 허용 ID 제약은 Pydantic 및 역할별 의미 검증에서 강제한다. `title`은 지원되지만 추론에 불필요한 schema token이므로 제거한다.

확인 기준은 [Gemini API GenerateContent의 JSON Schema 지원 필드](https://ai.google.dev/api/generate-content)와 [Google Gen AI Python SDK API](https://googleapis.github.io/python-genai/)다. 다만 Gemma 4 모델별 structured output 동작은 일반 API 필드 지원과 별개이므로 고정 버전 `google-genai 1.73.1`과 실제 설정 모델 조합의 live contract test가 필요하다.

## 역할별 provider 출력과 서버 보강

Google AI Studio에는 아래 최소 필드만 생성시킨다. 기존 BE 응답 호환에 필요한 파생 필드는 AI 서버가 결정적으로 보강한다.

### Interpreter

| 필드                    | 뜻                          |
| ----------------------- | --------------------------- |
| `action`                | 구조화 행동 후보            |
| `needsClarification`    | 추가 질문 필요 여부         |
| `clarificationQuestion` | 플레이어에게 물을 짧은 질문 |
| `mentionedSpellId`      | 명확히 언급된 주문 ID       |
| `mentionedItemId`       | 명확히 언급된 아이템 ID     |
| `requiredRuleCheckIds`  | 필요한 rule fragment ID     |
| `sceneTransition`       | 전환 요청에서만 생성하는 판정 계약 |

`action.type=MAP_CAST_SPELL`이면 `spellId`와 `attackKind`를 명확히 둔다.

전환 요청에서 provider는 후보별 `transitionId`, `targetNodeId`, `logic`, `requirements`만 생성한다. `selectedTargetNodeId`, 자체 confidence, 미사용 rationale는 생성시키지 않으며, 실제 조건 판정과 이동 선택은 백엔드가 담당한다. 전환 후보가 없는 요청에서 `sceneTransition`을 반환하면 조건부 계약 위반으로 거부한다.

`GENERAL_GM_REQUEST`에서만 provider가 `action.type`과 분류 confidence를 생성한다. 이미 확정된 `requestIntent` 호출에서는 두 필드를 출력 schema에서 제거하고 서버가 `action.type=requestIntent`, `confidence=1.0`으로 보강한다. `needsClarification=true`이면 confidence는 서버가 `0.0`으로 낮춘다. `actorCharacterId`와 명시 선택 ID는 요청의 검증된 값으로 서버가 보강하며, provider가 제거된 echo 필드를 반환하면 재시도 가능한 schema 위반으로 처리한다.

### Narrator

| 필드             | 뜻                       |
| ---------------- | ------------------------ |
| `narration`      | 플레이어에게 보여줄 서술 |

공개 `/api/v1`의 `visibleSummary`는 확정 `stateDiffSummary`가 있으면 이를 사용하고, 없으면 실제 narration에서 백엔드가 파생한다. 시도한 action approach를 확정 결과 요약으로 승격하지 않으며 내부 AI transport에는 포함하지 않는다.

### Director

| 필드           | 뜻                                       |
| -------------- | ---------------------------------------- |
| `content`      | 힌트 본문                                |
| `suggestions`  | `HUMAN_GM_ASSIST`에서만 생성하는 다음 시도 후보 |

공개 `/api/v1`의 `hintLevel`, `sourceScope`, `spoilerLevel`, `safetyNotes`는 요청과 공개 문맥에서 백엔드가 보강하며 내부 AI transport에는 포함하지 않는다.
`HINT` mode에서는 `suggestions`를 provider schema에서 제거하며, 모델이 이를 반환해도 조용히 버리지 않고 조건부 schema 위반으로 거부한다.

### Summarizer

| 필드               | 뜻                          |
| ------------------ | --------------------------- |
| `content`          | 요약 본문                   |

공개 `/api/v1`의 `summaryType`, `coveredTurnRange`, 빈 `keyFacts`·`safetyNotes`는 백엔드가 요청에서 보강하며 내부 AI transport에는 포함하지 않는다.

### Actor

| 필드               | 뜻                                    |
| ------------------ | ------------------------------------- |
| `selectedActionId` | `allowedActions`에서 복사한 ID        |

선택 이유를 별도 응답 문자열로 복제하지 않으며 허용 여부 검증은 AI 서버가 담당한다.

현재 제품 소비자는 0건이고 내부 진단 하네스만 유지한다. `internal-ai-contract-v2` 배포 inventory에서도 소비자가 0이면 Actor route·설정·prompt·schema·benchmark를 한 변경에서 제거하며, NPC Dialogue에 암묵적으로 연결하지 않는다.

### NpcDialogue

| 필드          | 뜻                                 |
| ------------- | ---------------------------------- |
| `dialogue`    | NPC 발화                           |

공개 `/api/v1`의 `tone`과 빈 `safetyNotes`는 요청의 disposition에서 백엔드가 보강하며 내부 AI transport에는 포함하지 않는다.

### CheckResult

| 필드        | 뜻                         |
| ----------- | -------------------------- |
| `narration` | 확정된 판정 결과의 표시 문장 |

성공 narration에 포함할 수 있는 구체적 사실은 `allowedRewardFacts`로 제한하며, allowlist가 비어 있는 사회·감정 정보 판정은 백엔드 템플릿으로 처리해 provider를 호출하지 않는다. `READ_EMOTION`도 target summary·disposition에서 감정이나 숨은 걱정을 추론하지 않고 allowlist에 명시된 내용만 표현한다.

## 실패 응답

| 필드          | 뜻                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `failureType` | `timeout`, `rate_limit`, `quota`, `network`, `auth`, `config`, `provider_request`, `input_too_large`, `invalid_response`, `schema_validation`, `upstream_error` |
| `retryable`   | 재시도 가능 여부                                                                                               |
| `attempts`    | 실패 전 시도 횟수                                                                                              |

하네스 DTO와 역할별 선검증에서 발견한 호출자 4xx는 provider 호출 없이 에러로 둔다. provider 호출 뒤 받은 400/409는 `provider_request`, 404는 `config`, 401/403은 `auth`로 분류해 제품 호출자 4xx로 노출하지 않고 재시도 없이 fallback한다. 408, 명시적 timeout, network, provider 5xx만 총 deadline 안에서 재시도할 수 있다.
