# AI DTO와 shared-types 정렬

이 문서는 `ai/app/schemas/`의 Pydantic DTO를 백엔드/shared-types로 옮길 때의 기준이다.

현재 shared-types 구현은 이 폴더 밖에 있다. 이 문서는 AI 폴더 안에서 이름, 책임, 변환 규칙을 먼저 고정한다.

## 원칙

1. AI DTO는 게임 상태의 source of truth가 아니다.
2. 백엔드 확정값은 `GameState`, `StateDiff`, `TurnLog` 쪽이 기준이다.
3. AI-owned 값과 engine-owned 값을 한 타입에 섞지 않는다.
4. 새 필드를 추가하면 `AI_STUDIO_IO_FIELD_REFERENCE.md`, schema, test를 같이 고친다.
5. 현재 adapter 기준 파일은 `app/adapters/shared_types.py`다.

## 타입 지도

| 타입                           | 현재 위치                     | shared-types 판단               |
| ------------------------------ | ----------------------------- | ------------------------------- |
| `StructuredAction`             | `app/schemas/interpreter.py`  | 공유 후보                       |
| `CheckRequest`                 | `app/schemas/narrator.py`     | 공유 후보. 필드명 정리 필요     |
| `DiceResult`                   | `app/schemas/narrator.py`     | 공유 후보. 필드명 정리 필요     |
| `NarratorStateDiffSummary`     | `app/schemas/narrator.py`     | 공유 금지. 공개 서술용 요약 DTO |
| `AiTraceSummary`               | `app/schemas/harness.py`      | DB 모델로 직접 공유 금지        |
| `TraceListItem`                | `app/schemas/harness.py`      | 조회 DTO. 저장 모델과 분리      |
| `ActorAllowedAction`           | `app/schemas/actor.py`        | 공유 후보                       |
| `ActorOutput`                  | `app/schemas/actor.py`        | 공유 후보                       |
| `NpcDialogueOutput`            | `app/schemas/npc_dialogue.py` | AI-only 후보                    |
| `DirectorOutput`               | `app/schemas/director.py`     | AI-only 후보                    |
| `SummarizerOutput`             | `app/schemas/summarizer.py`   | AI-only 후보                    |
| `ClassSpellcastingProgression` | `app/srd/models.py`           | 캐릭터 생성 shared-types 후보   |

## 주요 매핑

### `StructuredAction`

| AI 필드               | 백엔드 판단                      |
| --------------------- | -------------------------------- |
| `type`                | 유지                             |
| `actorCharacterId`    | 유지                             |
| `targetId`            | 유지                             |
| `spellId`             | 백엔드에도 추가 필요             |
| `featureId`           | 백엔드에도 추가 필요             |
| `attackKind`          | 백엔드에도 추가 필요             |
| `ability`, `skill`    | enum 정렬 필요                   |
| `approach`            | 유지                             |
| `confidence`          | 유지                             |
| `requiresRoll`        | 유지                             |
| `suggestedDifficulty` | 유지하되 DC 확정값으로 쓰지 않음 |

### `CheckRequest`

| AI 필드                                  | 백엔드 후보 |
| ---------------------------------------- | ----------- |
| `checkType`                              | `kind`      |
| `difficultyClass`                        | `dc`        |
| `ability`, `skill`, `targetId`, `reason` | 유지 가능   |

### `DiceResult`

| AI 필드      | 백엔드 후보                              |
| ------------ | ---------------------------------------- |
| `formula`    | `expression`                             |
| `total`      | 유지                                     |
| `naturalD20` | 백엔드 타입에 추가 권장                  |
| `rollerId`   | 백엔드에 추가하거나 TurnLog actor로 대체 |
| `success`    | trace 성공이 아니라 판정 성공 여부       |

### `NarratorStateDiffSummary`

이 타입은 백엔드 `StateDiff`가 아니다. 백엔드가 이미 확정한 operations를 Narrator에게 안전하게 보여주기 위한 공개 요약이다.

| 필드               | 뜻                 |
| ------------------ | ------------------ |
| `summary`          | 공개 서술 anchor   |
| `changedFlags`     | flag 변화 요약     |
| `hpChanges`        | HP 변화 요약       |
| `inventoryChanges` | 인벤토리 변화 요약 |
| `conditionChanges` | 상태 변화 요약     |
| `nodeChange`       | 노드 이동 요약     |

AI Narrator 입력에서 `StateDiff`라는 이름은 쓰지 않는다.

### `AiTrace`

하네스 내부 상태값:

| 하네스     | 백엔드 validation 후보 |
| ---------- | ---------------------- |
| `success`  | `passed`               |
| `failure`  | `failed`               |
| `fallback` | `fallback`             |

`template-fallback` provider와 `local-template` model은 fallback 추적용 값이다.

### `ClassSpellcastingProgression`

| 필드                 | 판단                                           |
| -------------------- | ---------------------------------------------- |
| `classLevel`         | 유지                                           |
| `cantripsKnown`      | 유지                                           |
| `spellsKnown`        | 유지                                           |
| `pactMagicSlots`     | 유지                                           |
| `pactMagicSlotLevel` | 유지                                           |
| `spellSlotsByLevel`  | JSON 안정성을 위해 `"1"`~`"9"` string key 유지 |

## Adapter 함수

현재 준비된 변환 함수:

- `structured_action_to_backend(action)`
- `check_request_to_backend(check_request)`
- `dice_result_to_backend(dice_result)`
- `narrator_state_diff_summary_to_backend(summary)`
- `trace_summary_to_backend(trace, status=...)`
- `trace_list_item_to_backend(item)`

## 금지 변경

- AI DTO에 HP, AC, 피해량, 명중 여부, 상태 적용을 authoritative 필드로 추가하지 않는다.
- `NarratorStateDiffSummary`를 백엔드 `StateDiff`로 이름 바꾸지 않는다.
- `AiTraceSummary`를 DB 저장 모델로 직접 쓰지 않는다.
- `StructuredAction.type` enum을 늘리면 prompt, validator, root data model 문서를 함께 고친다.

## 다음 작업

1. 백엔드 shared-types 패키지를 확정하면 이 문서의 공유 후보만 옮긴다.
2. `StructuredAction`에는 `spellId`, `featureId`, `attackKind`를 반영한다.
3. `AiTrace`에는 `turnId`, `actorCharacterId`, fallback provider/status 변환을 반영한다.
4. `NarratorStateDiffSummary`는 계속 공개 요약 DTO로 유지한다.
