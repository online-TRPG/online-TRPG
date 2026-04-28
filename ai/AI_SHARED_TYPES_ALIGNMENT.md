# AI Shared Types Alignment

## 1. 목적

이 문서는 `ai/app/schemas/`의 Pydantic DTO를 백엔드/shared-types 후보와 맞출 때의 기준이다.

현재 단계에서는 repo 루트의 shared-types 패키지를 수정하지 않는다. AI 폴더 안에서 타입 이름, 필드명, 매핑 차이, 금지 변경을 먼저 고정한다.

2026-04-28 기준 `app/adapters/shared_types.py`에 백엔드 후보 payload 변환 adapter를 추가했다. 이 adapter는 실제 백엔드 shared-types 구현이 아니라, 필드명과 책임 경계를 테스트로 고정하기 위한 AI 폴더 내부 준비물이다.

## 2. 원칙

- AI DTO는 게임 상태의 source-of-truth가 아니다.
- 백엔드가 확정하는 값은 `doc/DATA_MODEL.md`의 `GameState`, `StateDiff`, `TurnLog` 쪽이 기준이다.
- AI 하네스 DTO는 백엔드 타입과 이름이 다를 수 있지만, 차이가 있으면 이 문서의 매핑표에 반드시 남긴다.
- 새 필드를 추가할 때는 `AI_STUDIO_IO_FIELD_REFERENCE.md`, Pydantic schema, 테스트를 같은 변경 단위에서 갱신한다.
- shared-types로 승격할 타입은 engine-owned 값과 AI-owned 값을 섞지 않는다.

## 3. Shared-types 승격 후보

| 후보 타입 | 현재 AI 파일 | 백엔드 기준 | 상태 |
| --- | --- | --- | --- |
| `StructuredAction` | `app/schemas/interpreter.py` | `doc/DATA_MODEL.md` `StructuredAction` | 공유 후보. `structured_action_to_backend()` adapter 있음 |
| `CheckRequest` | `app/schemas/narrator.py` | `doc/DATA_MODEL.md` `CheckRequest` | `check_request_to_backend()`에서 `checkType -> kind`, `difficultyClass -> dc` 변환 |
| `DiceResult` | `app/schemas/narrator.py` | `doc/DATA_MODEL.md` `DiceResult` | `dice_result_to_backend()`에서 `formula -> expression` 변환 |
| `NarratorStateDiffSummary` | `app/schemas/narrator.py` | 백엔드 `StateDiff.operations`에서 만든 공개 요약 | 공유 금지. `narrator_state_diff_summary_to_backend()`으로 공개 요약 DTO만 생성 |
| `AiTraceSummary` | `app/schemas/harness.py` | `doc/DATA_MODEL.md` `AiTrace` | 공유 금지. `trace_summary_to_backend()`에서 저장 후보 payload 생성 |
| `TraceListItem` | `app/schemas/harness.py` | `doc/DATA_MODEL.md` `AiTrace` | `trace_list_item_to_backend()`에서 조회 row를 백엔드 후보 payload로 변환 |
| `ActorAllowedAction` | `app/schemas/actor.py` | `doc/AI_CONTRACTS.md` `ActorInput.allowedActions` | 공유 후보 |
| `ActorOutput` | `app/schemas/actor.py` | `doc/AI_CONTRACTS.md` `ActorOutput` | 공유 후보 |
| `NpcDialogueOutput` | `app/schemas/npc_dialogue.py` | `doc/AI_CONTRACTS.md` AI-002 NPC dialogue | AI-only 후보. Actor와 분리 |
| `DirectorOutput` | `app/schemas/director.py` | `doc/AI_CONTRACTS.md` Director 설명 | AI-only 후보. 백엔드 저장 전 검토 필요 |
| `SummarizerOutput` | `app/schemas/summarizer.py` | `doc/AI_CONTRACTS.md` Summarizer 설명 | AI-only 후보. 장기 메모리 모델 확정 전까지 공유 보류 |
| `ClassSpellcastingProgression` | `app/srd/models.py` | 캐릭터 생성 DTO 후보 | 공유 후보. 필드명 유지 |

## 4. 필드 매핑

### 4.1 `StructuredAction`

AI 하네스 필드는 백엔드 `StructuredAction`을 확장한 후보로 본다.

| AI 필드 | 백엔드 필드 | 결정 |
| --- | --- | --- |
| `type` | `type` | 동일 |
| `actorCharacterId` | `actorCharacterId` | 동일 |
| `targetId` | `targetId` | 동일 |
| `spellId` | 미정 | 백엔드 `StructuredAction`에 추가 필요 |
| `featureId` | 미정 | 백엔드 `StructuredAction`에 추가 필요 |
| `attackKind` | 미정 | 백엔드 `StructuredAction`에 추가 필요 |
| `ability` | `ability` | 값 enum 정렬 필요 |
| `skill` | `skill` | 값 enum 정렬 필요 |
| `approach` | `approach` | 동일 |
| `confidence` | `confidence` | 동일 |
| `requiresRoll` | `requiresRoll` | 동일 |
| `suggestedDifficulty` | `suggestedDifficulty` | 동일 |

### 4.2 `CheckRequest`

AI Narrator의 `CheckRequest`는 백엔드가 이미 확정한 판정 요청을 내레이션에 전달하는 축약 DTO다.

| AI 필드 | 백엔드 필드 | 결정 |
| --- | --- | --- |
| `checkType` | `kind` | shared-types 승격 시 `kind`로 통일하거나 adapter에서 변환 |
| `ability` | `ability` | enum 정렬 필요 |
| `skill` | `skill` | enum 정렬 필요 |
| `difficultyClass` | `dc` | shared-types 승격 시 `dc`로 통일하거나 adapter에서 변환 |
| `targetId` | `targetId` | 백엔드 타입에 추가 필요 |
| `reason` | `reason` | 동일 |

### 4.3 `DiceResult`

| AI 필드 | 백엔드 필드 | 결정 |
| --- | --- | --- |
| `rollerId` | 미정 | 백엔드에 추가하거나 TurnLog actor로 대체 |
| `formula` | `expression` | shared-types 승격 시 `expression` 권장 |
| `total` | `total` | 동일 |
| `naturalD20` | `naturalD20` | 백엔드 타입에 추가 필요 |
| `success` | Check resolution 결과 | trace `status=success`와 다른 판정 결과 필드. 공개 변화 요약에는 `NarratorStateDiffSummary.summary`로만 반영 |

### 4.4 `NarratorStateDiffSummary`

AI Narrator의 `NarratorStateDiffSummary`는 백엔드 `StateDiff.operations`가 아니다. 백엔드가 이미 확정한 operations를 공개 내레이션용으로 요약한 DTO다.

| AI 필드 | 백엔드 기준 | 결정 |
| --- | --- | --- |
| `summary` | `TurnLog.narration` 보조 | 공유 타입으로 승격하지 않음 |
| `changedFlags` | `StateOperation[]` 요약 | adapter 산출물 |
| `hpChanges` | `StateOperation[]` 요약 | adapter 산출물 |
| `inventoryChanges` | `StateOperation[]` 요약 | adapter 산출물 |
| `conditionChanges` | `StateOperation[]` 요약 | adapter 산출물 |
| `nodeChange` | `move_node` 요약 | adapter 산출물 |

`StateDiff`라는 이름은 백엔드 operations 모델과 충돌하므로 AI Narrator 입력에서는 사용하지 않는다.

### 4.5 `AiTrace`

하네스 로그의 `aiTrace` row가 백엔드 저장 후보 기준이다. `AiTraceSummary`는 API 응답 요약이므로 DB 모델과 동일시하지 않는다.

`AiTraceSummary` 응답 요약 필드:

| 필드 | 결정 |
| --- | --- |
| `role` | AI 역할 |
| `provider` | 제공자. fallback은 `template-fallback` |
| `model` | 모델 ID. fallback은 `local-template` |
| `promptVersion` | prompt 또는 fallback template 버전 |
| `latencyMs` | 호출 시간. fallback은 0 |
| `attempts` | 시도 횟수 |
| `failureType` | 실패 유형. 성공이면 `null` |
| `finishReason` | provider 종료 사유. fallback은 `FALLBACK` |
| `providerRequestId` | provider 요청 ID |

`TraceListItem` 조회 필드:

| 필드 | 결정 |
| --- | --- |
| `id` | trace row ID |
| `timestamp` | `createdAt` 표시용 |
| `endpoint` | 하네스 endpoint |
| `status` | 하네스 row 상태. `success`, `failure`, `fallback` 중 하나 |
| `sessionId` | 세션 연결 |
| `turnId` | 턴 연결 |
| `actorCharacterId` | actor 연결 |
| `role` | AI 역할 |
| `provider` | 제공자 |
| `model` | 모델 ID |
| `promptVersion` | prompt/template 버전 |
| `latencyMs` | 호출 시간 |
| `attempts` | 시도 횟수 |
| `failureType` | 실패 유형 |
| `finishReason` | 종료 사유 |
| `providerRequestId` | provider 요청 ID |
| `logPaths` | 운영 로그 참조 |

| 하네스 `aiTrace` | 백엔드 `AiTrace` | 결정 |
| --- | --- | --- |
| `id` | `id` | 동일 |
| `sessionId` | `sessionId` | 동일. smoke/local harness에서는 `null` 가능 |
| `turnId` | 미정 | 백엔드 `AiTrace`에 추가 권장 |
| `actorCharacterId` | 미정 | 백엔드 `AiTrace`에 추가 권장 |
| `role` | `role` | `smoke`와 `template-fallback` provider 허용 여부 결정 필요 |
| `provider` | `provider` | `template-fallback` 허용 필요 |
| `status` | `validationStatus` | 값 변환: `success -> passed`, `failure -> failed`, `fallback -> fallback` |
| `rawOutput` | `rawOutput` | history row `response.rawOutput`에서 보존 |
| `parsedOutput` | `parsedOutput` | history row `response.parsed`에서 보존 |
| `logPaths` | 미정 | 운영 로그 참조로 별도 JSON 보존 |

### 4.6 `ClassSpellcastingProgression`

이 타입은 캐릭터 생성 validator와 백엔드 DTO에 그대로 옮기는 것을 기본값으로 둔다.

| 필드 | 결정 |
| --- | --- |
| `classLevel` | 유지 |
| `cantripsKnown` | 유지 |
| `spellsKnown` | 유지 |
| `pactMagicSlots` | 유지 |
| `pactMagicSlotLevel` | 유지 |
| `spellSlotsByLevel` | `"1"`~`"9"` string key 유지. JSON object key 안정성을 우선한다 |

### 4.7 `ActorAllowedAction` / `ActorOutput`

`ActorAllowedAction`은 백엔드가 이미 허용한 행동 후보 목록이다. AI Actor는 이 목록 밖의 행동을 만들 수 없다.

| 필드 | 결정 |
| --- | --- |
| `id` | 허용 행동 ID. `ActorOutput.selectedActionId`가 참조 |
| `label` | 표시명 |
| `actionType` | 백엔드 행동 분류 |
| `selectedActionId` | 선택한 허용 행동 ID |
| `reason` | 선택 이유 |
| `safetyNotes` | 상태 변경 금지 등 주의사항 |

### 4.8 `NpcDialogueOutput`

`NpcDialogueOutput`은 NPC 대사 생성 전용 출력이다. `ActorOutput`처럼 행동을 고르지 않고, 이미 선택되었거나 허용된 상황 안에서 표시 가능한 대사만 만든다.

| 필드 | 결정 |
| --- | --- |
| `dialogue` | 플레이어에게 직접 표시 가능한 NPC 발화 |
| `tone` | 대사의 어조. 행동 선택 근거가 아님 |
| `safetyNotes` | 새 사실/상태 변경/행동 선택 금지 위반 방지 메모 |

### 4.9 `DirectorOutput`

| 필드 | 결정 |
| --- | --- |
| `hintLevel` | `LIGHT`, `NORMAL`, `STRONG` |
| `content` | 힌트 본문 |
| `sourceScope` | `scene`, `recent_logs`, `rules`, `mixed` |
| `spoilerLevel` | `low`, `medium`, `high` |
| `suggestions` | 다음 시도 후보 |
| `safetyNotes` | 새 사실 금지 등 주의사항 |

### 4.10 `SummarizerOutput`

| 필드 | 결정 |
| --- | --- |
| `summaryType` | `player_visible`, `ai_context` |
| `coveredTurnRange` | 요약 범위 |
| `content` | 요약 본문 |
| `keyFacts` | 핵심 사실 목록 |
| `safetyNotes` | 숨김 정보/새 사실 관련 주의사항 |

## 5. 금지 변경

- AI DTO에서 HP, AC, 명중 여부, 피해량, 상태 적용을 authoritative 필드로 추가하지 않는다.
- AI Narrator 입력에서는 `StateDiff` 이름을 쓰지 않는다. 공개 요약 DTO 이름은 `NarratorStateDiffSummary`로 고정한다.
- `AiTraceSummary`를 DB 저장 모델로 직접 사용하지 않는다.
- `StructuredAction.type` enum을 늘릴 때는 `doc/DATA_MODEL.md`, `interpreter.v1.md`, validator test를 함께 갱신한다.

## 6. 다음 구현 작업

1. 백엔드/shared-types 패키지를 만들거나 찾으면 이 문서의 승격 후보와 `app/adapters/shared_types.py`의 변환 함수를 기준으로 옮긴다.
2. `StructuredAction`에는 `spellId`, `featureId`, `attackKind`를 백엔드 문서에 반영한다.
3. `AiTrace`에는 `turnId`, `actorCharacterId`, `template-fallback` provider, `status -> validationStatus` 변환표를 반영한다.
4. `NarratorStateDiffSummary`는 백엔드 `StateDiff.operations`와 분리된 공개 내레이션 DTO로 유지한다.

현재 adapter 함수:

- `structured_action_to_backend(action)`
- `check_request_to_backend(check_request)`
- `dice_result_to_backend(dice_result)`
- `narrator_state_diff_summary_to_backend(summary)`
- `trace_summary_to_backend(trace, status=...)`
- `trace_list_item_to_backend(item)`
