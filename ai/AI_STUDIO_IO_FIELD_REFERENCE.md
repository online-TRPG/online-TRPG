# Google AI Studio 입출력 필드 기준서

## 1. 목적

이 문서는 `ai/` 하네스가 Google AI Studio에 보내는 모든 항목과, Google AI Studio 또는 하네스가 받는 모든 항목의 의미를 정리한다.

중요 규칙:

- Google AI Studio 요청/응답 필드, prompt context, JSON schema, 역할별 DTO에 새 항목을 추가하면 이 문서도 같은 작업에서 갱신해야 한다.
- 이 문서에 없는 필드는 프롬프트, schema, 테스트에 추가하지 않는다.
- AI가 반환하는 값은 후보 또는 표현 초안이다. 게임 상태 확정은 백엔드 엔진 책임이다.

## 2. 호출 계층

현재 호출 흐름은 아래와 같다.

1. 하네스 API가 역할별 요청 DTO를 받는다.
2. 역할 서비스가 `system_instruction`, `prompt`, `response_json_schema`를 만든다.
3. `GoogleAiStudioClient.generate_json()`이 Google AI Studio에 구조화 출력 요청을 보낸다.
4. Google 응답의 `parsed` 또는 raw JSON fallback을 Pydantic schema로 검증한다.
5. 하네스 응답과 trace/log 정보를 저장한다.

## 3. Google AI Studio 요청 공통 필드

아래 항목은 `GoogleAiStudioClient.generate_json()`이 Google AI Studio SDK에 넘기는 공통 필드다.

| 필드 | 위치 | 의미 | 현재 값/출처 |
| --- | --- | --- | --- |
| `model` | `client.models.generate_content(model=...)` | 호출할 Google AI Studio 모델 ID | 요청의 `model`, 없으면 `Settings.model_for_role(role)` |
| `contents` | `client.models.generate_content(contents=...)` | 사용자 prompt 본문 | 역할 서비스가 조립한 문자열 |
| `temperature` | `GenerateContentConfig.temperature` | 출력 다양성. 낮을수록 안정적 | Interpreter `0.1`, Narrator `0.4` |
| `response_mime_type` | `GenerateContentConfig.response_mime_type` | JSON 구조화 출력을 강제하는 MIME 타입 | 항상 `application/json` |
| `response_json_schema` | `GenerateContentConfig.response_json_schema` | 모델이 따라야 할 JSON schema | 역할별 Pydantic schema |
| `system_instruction` | `GenerateContentConfig.system_instruction` | 역할 규칙과 금지사항을 담은 system prompt | `app/prompts/*.md` |
| `thinking_config.thinking_level` | `GenerateContentConfig.thinking_config` | Gemma 4 thinking level 설정 | `AI_THINKING_LEVEL`이 있고 모델명이 `gemma-4-`로 시작할 때만 포함 |

## 4. 하네스 요청 DTO

### 4.1 SmokeHarnessRequest

| 필드 | 의미 |
| --- | --- |
| `prompt` | 임의 smoke prompt. Google AI Studio 연결과 JSON schema 응답을 빠르게 확인하기 위한 입력 |
| `model` | 선택 모델 override. 없으면 기본 모델 사용 |

### 4.2 InterpreterHarnessRequest

| 필드 | 의미 |
| --- | --- |
| `rawText` | 플레이어가 입력한 자연어 행동 |
| `actorCharacterId` | 행동 주체 캐릭터 ID |
| `sceneSummary` | 현재 장면 요약. AI가 대상/행동을 해석할 때 참고 |
| `availableTargets` | 현재 장면에서 선택 가능한 target ID 목록. AI의 `targetId`는 이 안에 있어야 함 |
| `model` | 선택 모델 override. 없으면 Interpreter 모델 사용 |

### 4.3 NarratorHarnessRequest

| 필드 | 의미 |
| --- | --- |
| `rawInput` | 플레이어 원문 또는 원 행동 입력 |
| `action` | 선택. Interpreter가 만든 `StructuredAction` 중 백엔드가 수락한 행동. AI는 이를 바꾸면 안 됨 |
| `checkRequest` | 선택. 백엔드/엔진이 확정한 판정 요청. 판정 종류, 능력치, 기술, DC, 대상, 이유를 담음 |
| `diceResult` | 선택. 엔진이 확정한 주사위 결과. 총합, 자연 d20, 성공 여부를 담음 |
| `stateDiffSummary` | 선택. 백엔드 `StateDiff.operations`에서 만든 공개 내레이션용 요약. HP, 인벤토리, 상태, 노드 변화 후보를 AI가 새로 만들면 안 됨 |
| `scene` | 현재 공개 장면 정보. `title`, `summary`, `tone` |
| `constraints` | Narrator 출력 제한. 현재 `language='ko'`, `maxLength`, `noNewFacts=true` |
| `actionSummary` | 선택 legacy 필드. 구조화 `action/stateDiffSummary`가 없을 때만 보조 요약으로 참고 |
| `diceSummary` | 선택 legacy 필드. 구조화 `diceResult`가 없을 때만 보조 요약으로 참고 |
| `sceneTone` | legacy 톤 힌트. 구조화 `scene.tone`이 우선 |
| `model` | 선택 모델 override. 없으면 Narrator 모델 사용 |

### 4.4 DirectorHarnessRequest

| 필드 | 의미 |
| --- | --- |
| `hintLevel` | 힌트 강도. `LIGHT`, `NORMAL`, `STRONG` |
| `question` | 선택. 플레이어 또는 내부 시스템이 묻는 힌트 질문. 500자 이하 |
| `sceneSummary` | 현재 공개 장면 요약. 숨김 GM 정보는 넣지 않음 |
| `recentLogs` | 최근 공개 로그 요약. 최대 5개 |
| `publicClues` | 이미 공개된 단서 후보. Director는 이 범위 안에서만 힌트를 낸다 |
| `triedApproaches` | 플레이어가 이미 시도한 접근 |
| `model` | 선택 모델 override. 없으면 Director 모델 사용 |

### 4.5 SummarizerHarnessRequest

| 필드 | 의미 |
| --- | --- |
| `summaryType` | 요약 종류. `player_visible` 또는 `ai_context` |
| `rangeType` | 요약 범위. `RECENT`, `FULL`, `SINCE_NODE` |
| `lastLogCount` | 최근 로그 개수. `rangeType=RECENT`일 때 사용 |
| `nodeId` | 특정 노드 이후 요약이 필요할 때의 노드 ID |
| `logs` | 확정된 로그 요약 목록. Summarizer는 이 목록 밖 사실을 만들면 안 됨 |
| `includeHiddenContext` | 내부 AI 문맥 요약에 숨김 정보를 포함할지 여부. player-visible에서는 사용하지 않음 |
| `model` | 선택 모델 override. 없으면 Summarizer 모델 사용 |

### 4.6 ActorHarnessRequest

| 필드 | 의미 |
| --- | --- |
| `npcEntityId` | 행동 후보를 고를 NPC ID |
| `npcSummary` | NPC의 공개/엔진 허용 요약 |
| `disposition` | 현재 태도. 예: neutral, friendly, hostile |
| `hpStatus` | 정확한 HP가 아니라 허용된 상태 요약. 예: healthy, wounded |
| `conditions` | 현재 적용된 상태 이름 목록 |
| `sceneSummary` | 현재 장면 요약 |
| `allowedActions` | 엔진이 미리 허용한 행동 후보 목록. Actor는 이 밖의 행동을 만들 수 없음 |
| `model` | 선택 모델 override. 없으면 Actor 모델 사용 |

Actor는 NPC 행동 후보 선택 전용이다. NPC 대사 생성은 `NpcDialogue` 역할로 분리하며, Actor 요청/응답에 대사 본문을 섞지 않는다.

### 4.7 NpcDialogueHarnessRequest

아직 하네스 구현 전인 AI-002 전용 후보 계약이다.

| 필드 | 의미 |
| --- | --- |
| `npcEntityId` | 대사를 말하는 NPC ID |
| `npcSummary` | NPC의 공개 설정과 현재 장면에서 말해도 되는 정보 |
| `playerInput` | 선택. NPC가 반응할 플레이어 발화 |
| `tone` | `NEUTRAL`, `FRIENDLY`, `HOSTILE`, `MYSTERIOUS` |
| `sceneSummary` | 공개 장면 요약 |
| `allowedKnowledge` | NPC가 알고 말해도 되는 사실 목록 |
| `forbiddenKnowledge` | NPC가 말하면 안 되는 숨김 사실 목록 |
| `model` | 선택 모델 override. 없으면 NpcDialogue 모델 사용 |

현재 구현된 하네스 필드는 `npcEntityId`, `npcName`, `npcSummary`, `disposition`, `sceneSummary`, `recentContext`, `selectedActionId`, `dialogueIntent`, `audienceIds`, `maxLength`, `model`이다. `NpcDialogue`는 Actor가 이미 고른 `selectedActionId`를 참고할 수 있지만 행동을 선택하거나 바꾸지 않는다.

## 5. Interpreter Prompt Context

Interpreter는 `rawText`를 바탕으로 SRD catalog/retrieval 결과를 prompt에 포함한다.

### 5.1 Prompt Header

| 항목 | 의미 |
| --- | --- |
| `actorCharacterId` | 이번 행동을 요청한 캐릭터 ID |
| `sceneSummary` | 현재 장면 요약 |
| `availableTargets` | target 후보 ID 목록 |
| `rawText` | 원문 플레이어 입력 |

### 5.2 relatedEntities

`relatedEntities`는 SRD catalog에서 검색된 엔티티 후보다. AI는 이 값을 참고해 ID를 복사할 수 있지만, 게임 사실을 확정하면 안 된다.

공통 필드:

| 필드 | 의미 |
| --- | --- |
| `id` | 생성 catalog의 안정 ID |
| `kind` | 엔티티 종류. `spell`, `magic_item`, `monster`, `condition`, `race`, `class` 등 |
| `nameEn` | 영어 canonical name |
| `nameKo` | 한국어 표시명 |
| `summaryKo` | 짧은 한국어 요약. spell 전용 상세 payload에는 없을 수 있음 |
| `source` | 원천 번역 파일과 heading/page |

Spell 전용 추가 필드:

| 필드 | 의미 |
| --- | --- |
| `level` | 주문 레벨. 캔트립은 `0` |
| `castingTime` | 시전 시간 원문 |
| `range` | 사거리 원문 |
| `components` | 구성요소 원문 |
| `duration` | 지속시간 원문 |
| `concentration` | 집중 주문 여부 |
| `mechanicHints` | `ranged_spell_attack`, `saving_throw`, `damage` 같은 해석 힌트 |
| `attackKindKo` | 주문 공격 종류 한국어 설명 |

### 5.3 relatedRules

`relatedRules`는 현재 행동 해석에 필요한 작은 규칙 조각이다.

| 필드 | 의미 |
| --- | --- |
| `id` | rule fragment ID |
| `domain` | 규칙 영역. 예: `spellcasting`, `combat` |
| `titleKo` | 한국어 제목 |
| `engineOwned` | 백엔드 엔진이 최종 확정해야 하는 규칙인지 여부 |
| `summaryKo` | AI가 참고할 짧은 규칙 설명 |
| `aiForbiddenUse` | AI가 하면 안 되는 사용 방식 |
| `source` | 원천 규칙 파일과 heading |

### 5.4 relatedEngineHooks

`relatedEngineHooks`는 향후 백엔드 deterministic engine이 구현해야 할 계약 fixture다. AI는 hook ID를 출력하지 않고, 이 값을 보고 상태 변경을 직접 확정하지 말아야 한다.

| 필드 | 의미 |
| --- | --- |
| `id` | hook fixture ID |
| `domain` | hook 영역. 예: `spellcasting`, `combat`, `item`, `class_feature` |
| `titleKo` | 한국어 제목 |
| `engineFunction` | 향후 백엔드 엔진 함수명 |
| `trigger` | hook이 적용될 조건 설명 |
| `sourceRuleIds` | 근거 rule/card/fragment ID 목록 |
| `sourceEntityIds` | 근거 spell/item/condition/class feature ID 목록 |

## 6. Google AI Studio 응답 공통 필드

`GoogleAiStudioClient`는 Google SDK 응답을 아래 내부 결과로 정리한다.

| 필드 | 의미 |
| --- | --- |
| `raw_text` | Google 응답 원문 텍스트 |
| `parsed_json` | Google SDK의 `parsed` 또는 raw JSON/fenced JSON fallback으로 파싱한 dict |
| `model` | 실제 호출한 모델 ID |
| `provider` | 제공자 이름. 현재 기본값 `google-ai-studio` |
| `latency_ms` | 호출 소요 시간(ms) |
| `finish_reason` | Google candidate 종료 사유 |
| `provider_request_id` | Google 응답에서 얻은 요청/응답 ID. 없을 수 있음 |

## 7. Interpreter 응답 필드

### 7.1 InterpreterOutput

| 필드 | 의미 |
| --- | --- |
| `action` | 구조화된 행동 후보 |
| `needsClarification` | 추가 질문이 필요한지 여부 |
| `clarificationQuestion` | 필요한 경우 플레이어에게 물을 짧은 질문 |
| `mentionedSpellId` | 입력에서 명확히 언급된 주문 ID |
| `mentionedItemId` | 입력에서 명확히 언급된 마법 아이템 ID |
| `mentionedConditionIds` | 입력에서 명확히 언급된 상태 이상 ID 목록 |
| `requiredRuleCheckIds` | 이 행동을 처리할 때 참고해야 하는 rule fragment ID 목록 |
| `rulesConfidence` | 규칙 해석 신뢰도. `0.0`~`1.0` |
| `safetyNotes` | 엔진 확정 필요, 상태 변경 금지 등 짧은 주의사항 |

### 7.2 StructuredAction

| 필드 | 의미 |
| --- | --- |
| `type` | 행동 종류. `ability_check`, `skill_check`, `saving_throw`, `attack`, `cast_spell`, `use_class_feature`, `use_item`, `move`, `interact`, `talk`, `request_hint`, `freeform` |
| `actorCharacterId` | 행동 주체 캐릭터 ID |
| `targetId` | 대상 ID. 있으면 `availableTargets` 안의 값이어야 함 |
| `spellId` | `cast_spell`일 때 주문 ID |
| `featureId` | `use_class_feature`일 때 class feature ID |
| `attackKind` | 공격 종류. `weapon_attack`, `melee_spell_attack`, `ranged_spell_attack` |
| `ability` | 관련 능력치 이름. 최종 판정 능력치는 엔진이 확정 |
| `skill` | 관련 기술 이름. 최종 판정 기술은 엔진이 확정 |
| `approach` | 플레이어 의도를 짧게 정리한 문장 |
| `confidence` | 자연어 해석 신뢰도. `0.0`~`1.0` |
| `requiresRoll` | 주사위/엔진 판정이 필요해 보이는지 여부 |
| `suggestedDifficulty` | 난이도 힌트. `easy`, `medium`, `hard`. 실제 DC는 엔진/GM 책임 |

## 8. Narrator 응답 필드

| 필드 | 의미 |
| --- | --- |
| `narration` | 플레이어에게 보여줄 한국어 GM 서술 |
| `visibleSummary` | 로그나 UI에 짧게 남길 공개 요약 |

Narrator 검증 규칙:

- `constraints.noNewFacts=false` 요청은 거부한다.
- `visibleSummary`는 `narration`보다 짧아야 한다.
- Narrator는 `diceResult`, `stateDiffSummary`, `checkRequest`에 없는 결과를 추가하면 안 된다.

## 8.1 Director 응답 필드

| 필드 | 의미 |
| --- | --- |
| `hintLevel` | 실제 응답 힌트 강도. 요청 강도와 맞아야 함 |
| `content` | 플레이어 또는 GM에게 보여줄 한국어 힌트 본문 |
| `sourceScope` | 힌트가 근거로 삼은 범위. `scene`, `recent_logs`, `rules`, `mixed` |
| `spoilerLevel` | 스포일러 강도. `low`, `medium`, `high` |
| `suggestions` | 선택 가능한 다음 시도 후보. 최대 3개 |
| `safetyNotes` | 숨김 정보 비노출, 상태 변경 금지 등 내부 검수 메모 |

Director 검증 규칙:

- 숨김 사실이나 미발견 단서를 확정 사실처럼 말하면 안 된다.
- HP, 인벤토리, 노드 이동, 보상, DC, 주사위 결과를 확정하면 안 된다.
- `hintLevel`은 정보 강도만 조절하고 사실 범위를 넓히는 근거가 아니다.

## 8.2 Summarizer 응답 필드

| 필드 | 의미 |
| --- | --- |
| `summaryType` | 생성된 요약 종류. `player_visible` 또는 `ai_context` |
| `coveredTurnRange` | 요약이 덮는 로그/턴 범위 |
| `content` | 한국어 요약 본문 |
| `keyFacts` | 이후 문맥에 유지할 핵심 사실 목록 |
| `safetyNotes` | 새 사실 추가 금지, 숨김 정보 제외 등 내부 검수 메모 |

Summarizer 검증 규칙:

- 입력 `logs`에 없는 사건, 결과, 보상, 단서, 상태 변화를 만들면 안 된다.
- `player_visible` 요약에는 숨김 GM 메모나 내부 추론을 넣으면 안 된다.
- `ai_context` 요약도 사실 압축만 허용하며 새 게임 상태를 확정하지 않는다.

## 8.3 Actor 응답 필드

| 필드 | 의미 |
| --- | --- |
| `selectedActionId` | `allowedActions`에서 복사한 행동 ID |
| `reason` | 선택 이유. 짧은 한국어 설명 |
| `safetyNotes` | 허용 후보 안에서만 선택했는지 등 내부 검수 메모 |

Actor 검증 규칙:

- `selectedActionId`는 반드시 요청의 `allowedActions[].id` 중 하나여야 한다.
- Actor는 새 행동, 새 대상, 피해량, DC, 주사위 결과, HP 변경, 상태 변경을 만들 수 없다.

## 8.4 NpcDialogue 응답 필드

| 필드 | 의미 |
| --- | --- |
| `dialogue` | 직접 표시 가능한 NPC 대사 |
| `tone` | 대사 어조 |
| `safetyNotes` | 새 사실/상태 변경/행동 선택 금지 위반 방지 메모 |

NpcDialogue 검증 규칙:

- NpcDialogue는 행동을 선택하지 않는다. 행동 선택은 Actor의 책임이다.
- 대사는 요청에 포함된 NPC, 장면, 최근 맥락, 선택된 행동, 대사 목적 안에서만 생성한다.
- 피해량, DC, 주사위 결과, HP 변경, 상태 변경을 만들 수 없다.

## 9. 하네스 응답 공통 필드

| 필드 | 의미 |
| --- | --- |
| `provider` | 사용한 AI 제공자 |
| `model` | 사용한 모델 ID |
| `latencyMs` | 호출 소요 시간(ms) |
| `promptVersion` | 사용한 prompt 파일 버전 |
| `rawOutput` | 모델 raw output |
| `finishReason` | 모델 응답 종료 사유 |
| `providerRequestId` | 제공자 요청/응답 ID |
| `trace` | 호출 추적 요약 |
| `logPaths` | 성공/실패 로그 파일 경로 |
| `parsed` | 역할별 schema 검증을 통과한 응답 |
| `fallback` | 템플릿 fallback 응답 여부 |
| `fallbackReason` | fallback 원인이 된 오류 메시지 |

### 9.2 Trace 조회 필드

`GET /api/harness/traces`는 Google AI Studio를 호출하지 않고 `harness_history.jsonl`을 조회한다.

`harness_history.jsonl`의 각 row에는 백엔드 `AiTrace` 저장 포맷으로 옮길 수 있는 `aiTrace` 객체가 포함된다. 기존 `response.trace`는 응답 요약이고, `aiTrace`는 세션/턴/로그 경로까지 포함하는 저장 기준이다.

요청 query:

| 필드 | 의미 |
| --- | --- |
| `role` | 선택. `interpreter`, `narrator`, `director`, `summarizer`, `actor`, `npc_dialogue`, `smoke` 등 trace role 필터 |
| `status` | 선택. `success`, `failure`, `fallback` 중 하나 |
| `size` | 반환 개수. 1~100 |

응답:

| 필드 | 의미 |
| --- | --- |
| `items` | 최신순 trace 요약 목록 |
| `total` | 전체 history row 수 |
| `filtered` | 필터 조건을 통과한 row 수 |

`items[]` 필드:

| 필드 | 의미 |
| --- | --- |
| `id` | trace row ID. 현재 하네스에서는 `trace-{uuid}` |
| `sessionId` | 요청 payload의 세션 ID. 없으면 `null` |
| `turnId` | 요청 payload의 턴 ID. 없으면 `null` |
| `actorCharacterId` | 요청 payload의 actor ID. 없으면 `null` |
| `endpoint` | 하네스 endpoint |
| `role` | AI 역할 |
| `status` | `success`, `failure`, `fallback` 중 하나 |
| `provider`, `model`, `promptVersion` | provider 호출 식별 정보 |
| `latencyMs`, `attempts` | 호출 시간과 시도 횟수 |
| `failureType`, `finishReason`, `providerRequestId` | 실패/종료/제공자 요청 추적 정보 |
| `logPaths` | `latest`, `history` 로그 파일 경로 |

### 9.3 AiTrace 저장 매핑

백엔드 `AiTrace` 모델로 옮길 때의 1차 매핑은 아래와 같다. 하네스 row 상태값은 `success`, `failure`, `fallback`으로 고정하고, 백엔드 validation 상태가 필요하면 adapter에서 `passed`, `failed`, `fallback`으로 변환한다.

| 하네스 `aiTrace` | 백엔드 저장 필드 |
| --- | --- |
| `id` | `AiTrace.id` |
| `sessionId` | `AiTrace.sessionId` |
| `turnId` | `AiTrace.turnId` |
| `actorCharacterId` | `AiTrace.actorCharacterId` |
| `endpoint` | `AiTrace.endpoint` |
| `role` | `AiTrace.role` |
| `status` | `AiTrace.status` 또는 `AiTrace.validationStatus`로 변환. `success -> passed`, `failure -> failed`, `fallback -> fallback` |
| `provider` | `AiTrace.provider` |
| `model` | `AiTrace.model` |
| `promptVersion` | `AiTrace.promptVersion` |
| `latencyMs` | `AiTrace.latencyMs` |
| `attempts` | `AiTrace.attempts` |
| `failureType` | `AiTrace.failureType` |
| `finishReason` | `AiTrace.finishReason` |
| `providerRequestId` | `AiTrace.providerRequestId` |
| `createdAt` | `AiTrace.createdAt` |
| `logPaths` | 운영 로그 참조. DB 저장 시 JSON 또는 별도 로그 참조로 보존 |

### 9.1 AiTraceSummary

| 필드 | 의미 |
| --- | --- |
| `role` | 호출 역할. `smoke`, `interpreter`, `narrator` |
| `provider` | 사용한 AI 제공자 |
| `model` | 사용한 모델 ID |
| `promptVersion` | prompt 버전 |
| `latencyMs` | 호출 소요 시간(ms) |
| `attempts` | 실제 호출 시도 횟수 |
| `failureType` | 실패 유형. 성공이면 `null` |
| `finishReason` | 모델 응답 종료 사유 |
| `providerRequestId` | 제공자 요청/응답 ID |

fallback 응답에서는 `provider=template-fallback`, `model=local-template`, `finishReason=FALLBACK`, `failureType`에 원래 실패 유형을 넣는다. 요청 자체가 잘못된 4xx 오류는 fallback으로 바꾸지 않는다.

## 10. 실패 응답 필드

`AiClientError`가 API 에러 응답으로 변환될 때 사용하는 주요 항목이다.

| 필드 | 의미 |
| --- | --- |
| `message` | 실패 설명 |
| `failure_type` | `timeout`, `rate_limit`, `quota`, `network`, `auth`, `invalid_response`, `schema_validation`, `upstream_error` 등 |
| `retryable` | 재시도 가능 여부 |
| `status_code` | API 응답에 사용할 HTTP 상태 코드 |
| `attempts` | 실패 전까지 시도한 횟수 |

## 11. 필드 추가 절차

새로운 Google AI Studio 입출력 항목을 추가할 때는 반드시 아래를 같은 변경 단위에서 처리한다.

1. 이 문서에 필드명, 위치, 의미, 책임 경계를 추가한다.
2. 관련 Pydantic schema 또는 prompt context builder를 수정한다.
3. system prompt에 모델이 어떻게 써야 하는지 명시한다.
4. validator가 허용/거부해야 할 조건을 추가한다.
5. fake provider 테스트와 필요한 경우 live Google AI Studio 테스트를 추가한다.
6. `SRD_DATA_RULES_PIPELINE_PLAN.md` 또는 `AI_REQUEST_INVENTORY.md`의 해당 설계 항목도 갱신한다.
