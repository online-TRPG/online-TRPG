# AI 입출력 필드 기준

이 문서는 Google AI Studio 호출과 하네스 DTO 필드의 뜻을 고정한다.

새 필드를 추가할 때는 이 문서, Pydantic schema, prompt, test를 같은 변경에서 고친다.

## 호출 흐름

1. API route가 역할별 요청 DTO를 받는다.
2. service가 prompt와 JSON schema를 만든다.
3. `GoogleAiStudioClient.generate_json()`이 Google AI Studio를 호출한다.
4. 응답 JSON을 Pydantic schema로 검증한다.
5. 응답, trace, log를 저장한다.
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
| `thinking_config.thinking_level` | Gemma 4 모델이고 설정값이 있을 때만 사용                   |

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

### `InterpreterHarnessRequest`

| 필드                           | 뜻                         |
| ------------------------------ | -------------------------- |
| `rawText`                      | 플레이어 자연어 행동       |
| `actorCharacterId`             | 행동 주체                  |
| `sceneSummary`                 | 공개 장면 요약             |
| `availableTargets`             | 선택 가능한 target ID 목록 |
| `sessionId`, `turnId`, `model` | 공통 메타                  |

Prompt에는 검색 결과로 `relatedEntities`, `relatedRules`, `relatedEngineHooks`가 추가될 수 있다. 이 값들은 참고 자료이며 게임 결과가 아니다.

### `NarratorHarnessRequest`

| 필드                                               | 뜻                                               |
| -------------------------------------------------- | ------------------------------------------------ |
| `rawInput`                                         | 원래 플레이어 입력                               |
| `action`                                           | 백엔드가 수락한 구조화 행동                      |
| `checkRequest`                                     | 백엔드가 확정한 판정 요청                        |
| `diceResult`                                       | 백엔드가 확정한 주사위 결과                      |
| `stateDiffSummary`                                 | 백엔드 `StateDiff.operations`의 공개 서술용 요약 |
| `scene`                                            | 공개 장면 정보                                   |
| `constraints`                                      | 언어, 길이, 새 사실 금지 규칙                    |
| `actionSummary`, `diceSummary`, `sceneTone`        | legacy 보조 필드                                 |
| `sessionId`, `turnId`, `actorCharacterId`, `model` | 공통 메타                                        |

`stateDiffSummary`는 백엔드의 실제 `StateDiff`가 아니다. Narrator가 읽는 공개 요약이다.

### `DirectorHarnessRequest`

| 필드                           | 뜻                          |
| ------------------------------ | --------------------------- |
| `hintLevel`                    | `LIGHT`, `NORMAL`, `STRONG` |
| `question`                     | 선택 질문                   |
| `sceneSummary`                 | 공개 장면 요약              |
| `recentLogs`                   | 최근 공개 로그              |
| `publicClues`                  | 이미 공개된 단서            |
| `triedApproaches`              | 이미 시도한 접근            |
| `sessionId`, `turnId`, `model` | 공통 메타                   |

### `SummarizerHarnessRequest`

| 필드                           | 뜻                                  |
| ------------------------------ | ----------------------------------- |
| `summaryType`                  | `player_visible` 또는 `ai_context`  |
| `rangeType`                    | `RECENT`, `FULL`, `SINCE_NODE`      |
| `lastLogCount`                 | 최근 로그 수                        |
| `nodeId`                       | 특정 노드 이후 요약할 때 사용       |
| `logs`                         | 확정 로그 목록                      |
| `includeHiddenContext`         | 내부 AI 요약에 숨김 맥락을 포함할지 |
| `sessionId`, `turnId`, `model` | 공통 메타                           |

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

### `NpcDialogueHarnessRequest`

| 필드                           | 뜻                    |
| ------------------------------ | --------------------- |
| `npcEntityId`                  | 말하는 NPC            |
| `npcName`                      | 표시 가능한 이름      |
| `npcSummary`                   | 말해도 되는 NPC 정보  |
| `disposition`                  | 현재 태도             |
| `sceneSummary`                 | 공개 장면 요약        |
| `recentContext`                | 최근 공개 맥락        |
| `selectedActionId`             | 이미 선택된 허용 행동 |
| `dialogueIntent`               | 대사의 목적           |
| `audienceIds`                  | 듣는 대상             |
| `maxLength`                    | 대사 최대 길이        |
| `sessionId`, `turnId`, `model` | 공통 메타             |

NpcDialogue는 행동을 고르지 않는다.

## SRD Prompt Context

Interpreter는 `generated/srd/`에서 찾은 작은 문맥만 받는다.

| 필드                 | 뜻                                                  |
| -------------------- | --------------------------------------------------- |
| `relatedEntities`    | 주문, 아이템, 몬스터, 상태, 종족, 직업 등 검색 결과 |
| `relatedRules`       | 현재 행동에 필요한 작은 규칙 조각                   |
| `relatedEngineHooks` | 백엔드 엔진이 나중에 실행할 수 있는 hook fixture    |

AI는 이 값에서 ID를 참고할 수 있지만, 명중/피해/상태 같은 결과를 확정하면 안 된다.

## 응답 공통 trace

| 필드                | 뜻                    |
| ------------------- | --------------------- |
| `attempts`          | 실제 호출 시도 횟수   |
| `finishReason`      | provider 종료 사유    |
| `providerRequestId` | provider 요청 ID      |
| `logPaths.latest`   | 마지막 상세 JSON 로그 |
| `logPaths.history`  | 누적 JSONL 로그       |
| `fallback`          | fallback 응답 여부    |
| `fallbackReason`    | fallback 이유         |

Trace row 상태값은 `success`, `failure`, `fallback` 중 하나다.

## 역할별 출력

### Interpreter

| 필드                    | 뜻                          |
| ----------------------- | --------------------------- |
| `action`                | 구조화 행동 후보            |
| `needsClarification`    | 추가 질문 필요 여부         |
| `clarificationQuestion` | 플레이어에게 물을 짧은 질문 |
| `mentionedSpellId`      | 명확히 언급된 주문 ID       |
| `mentionedItemId`       | 명확히 언급된 아이템 ID     |
| `mentionedConditionIds` | 명확히 언급된 상태 ID       |
| `requiredRuleCheckIds`  | 필요한 rule fragment ID     |
| `rulesConfidence`       | 규칙 해석 신뢰도            |
| `safetyNotes`           | 검증 메모                   |

`action.type=cast_spell`이면 `spellId`와 `attackKind`를 명확히 둔다.

### Narrator

| 필드             | 뜻                       |
| ---------------- | ------------------------ |
| `narration`      | 플레이어에게 보여줄 서술 |
| `visibleSummary` | 짧은 공개 요약           |
| `tone`           | 서술 톤                  |
| `safetyNotes`    | 새 사실 금지 검수 메모   |

### Director

| 필드           | 뜻                                       |
| -------------- | ---------------------------------------- |
| `hintLevel`    | 실제 힌트 강도                           |
| `content`      | 힌트 본문                                |
| `sourceScope`  | `scene`, `recent_logs`, `rules`, `mixed` |
| `spoilerLevel` | `low`, `medium`, `high`                  |
| `suggestions`  | 다음 시도 후보                           |
| `safetyNotes`  | 공개 범위 검수 메모                      |

### Summarizer

| 필드               | 뜻                          |
| ------------------ | --------------------------- |
| `summaryType`      | 요약 종류                   |
| `coveredTurnRange` | 요약 범위                   |
| `content`          | 요약 본문                   |
| `keyFacts`         | 핵심 사실                   |
| `safetyNotes`      | 숨김 정보/새 사실 검수 메모 |

### Actor

| 필드               | 뜻                                    |
| ------------------ | ------------------------------------- |
| `selectedActionId` | `allowedActions`에서 복사한 ID        |
| `reason`           | 선택 이유                             |
| `safetyNotes`      | 허용 후보 안에서 선택했는지 검수 메모 |

### NpcDialogue

| 필드          | 뜻                                 |
| ------------- | ---------------------------------- |
| `dialogue`    | NPC 발화                           |
| `tone`        | 어조                               |
| `safetyNotes` | 숨김 정보/상태 변경 금지 검수 메모 |

## 실패 응답

| 필드          | 뜻                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| `failureType` | `timeout`, `rate_limit`, `quota`, `network`, `auth`, `invalid_response`, `schema_validation`, `upstream_error` |
| `retryable`   | 재시도 가능 여부                                                                                               |
| `attempts`    | 실패 전 시도 횟수                                                                                              |
| `logPaths`    | 실패 로그 위치                                                                                                 |

4xx 요청 위반은 에러로 둔다. provider/schema/timeout 계열 런타임 실패는 가능한 경우 fallback으로 응답한다.
