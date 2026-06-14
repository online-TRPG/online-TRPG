# AI 요청 지도

이 문서는 AI가 받는 요청을 한 장으로 고정한다.

핵심: AI는 후보를 만든다. 백엔드 엔진이 게임 사실을 확정한다.

## 절대 규칙

| 규칙             | 뜻                                                                             |
| ---------------- | ------------------------------------------------------------------------------ |
| 상태 확정 금지   | AI는 HP, 피해, DC, 명중, 상태 이상, 보상, 장면 이동을 확정하지 않는다.         |
| 작은 문맥만 전달 | 현재 장면, 행동 주체, 최근 로그, 관련 대상, 관련 SRD 조각만 보낸다.            |
| 구조화 출력      | 모든 역할 출력은 JSON Schema와 Pydantic 검증을 통과해야 한다.                  |
| 실패해도 진행    | timeout, quota, network, provider, schema 실패는 fallback으로 세션을 계속한다. |
| 사람 GM 보호     | 사람 GM 세션에서 AI는 GM 보조 초안일 뿐 진행 권한을 갖지 않는다.               |
| 로그 남김        | 모든 성공, 실패, fallback은 `AiTrace` 후보 row와 `runtime_logs/`에 남긴다.     |

## 요청 전체 지도

| 요청               | 경로/트리거                                         | 역할          | 현재 상태     | 핵심 제한                |
| ------------------ | --------------------------------------------------- | ------------- | ------------- | ------------------------ |
| 플레이어 행동 해석 | `ACTION-001` 내부                                   | `Interpreter` | 하네스 구현   | 행동 후보만 출력         |
| 행동 결과 서술     | `ACTION-001` 후 내부                                | `Narrator`    | 하네스 구현   | 백엔드 확정 결과만 서술  |
| 힌트               | `POST /api/v1/sessions/{sessionId}/ai/hint`         | `Director`    | 세션 API 구현 | 공개 단서 안에서만 제안  |
| NPC 대사           | `POST /api/v1/sessions/{sessionId}/ai/npc-dialogue` | `NpcDialogue` | 세션 API 구현 | 행동 선택 금지           |
| 장면/결과 서술     | `POST /api/v1/sessions/{sessionId}/ai/narration`    | `Narrator`    | 세션 API 구현 | 새 사실 금지             |
| 세션 요약          | `POST /api/v1/sessions/{sessionId}/ai/summary`      | `Summarizer`  | 세션 API 구현 | 로그 압축만 허용         |
| AI trace 조회      | `GET /api/v1/sessions/{sessionId}/ai-traces`        | 없음          | 세션 API 구현 | GM/운영자용              |
| NPC 행동 선택      | 내부 NPC 턴                                         | `Actor`       | 하네스 구현   | `allowedActions` 중 선택 |
| 정체 해소          | 내부 조건부 호출                                    | `Director`    | 하네스 구현   | 다음 시도 후보만 제안    |

## 역할별 입출력

### Interpreter

입력:

- `sessionId`, `turnId`
- `rawText`
- `actorCharacterId`
- `sceneSummary`
- `availableTargets`
- 최근 공개 로그
- `relatedEntities`, `relatedRules`, `relatedEngineHooks`

출력:

- `action`
- `needsClarification`
- `clarificationQuestion`
- `mentionedSpellId`
- `mentionedItemId`
- `mentionedConditionIds`
- `requiredRuleCheckIds`
- `rulesConfidence`
- `safetyNotes`

금지:

- 존재하지 않는 target 생성
- 명중/실패/피해/DC/상태/슬롯/인벤토리 확정
- `relatedEngineHooks`를 게임 결과처럼 사용

### Narrator

입력:

- `rawInput`
- 백엔드가 수락한 `action`
- 백엔드가 확정한 `checkRequest`
- 백엔드가 확정한 `diceResult`
- 백엔드 `StateDiff.operations`에서 만든 공개 요약 `stateDiffSummary`
- `scene`
- `constraints`

출력:

- `narration`
- `visibleSummary`
- `tone`
- `safetyNotes`

금지:

- 주사위 결과 변경
- 성공/실패 창작
- 숨김 단서, 보상, 피해, 상태, 이동 창작

### Director

입력:

- `hintLevel`
- 선택 질문
- 공개 장면 요약
- 최근 공개 로그
- 공개된 단서
- 이미 시도한 접근

출력:

- `hintLevel`
- `content`
- `sourceScope`
- `spoilerLevel`
- `suggestions`
- `safetyNotes`

금지:

- 미공개 단서 공개
- 정답 강제
- 진행 결과 확정

### Summarizer

입력:

- `summaryType`: `player_visible` 또는 `ai_context`
- `rangeType`: `RECENT`, `FULL`, `SINCE_NODE`
- `logs`
- 선택 `includeHiddenContext`

출력:

- `summaryType`
- `coveredTurnRange`
- `content`
- `keyFacts`
- `safetyNotes`

금지:

- 로그 밖 사실 추가
- 플레이어용 요약에 숨김 정보 포함

### Actor

입력:

- NPC ID와 공개 요약
- disposition, HP 상태, conditions
- 장면 요약
- `allowedActions`

출력:

- `selectedActionId`
- `reason`
- `safetyNotes`

금지:

- `allowedActions` 밖 행동 생성
- NPC 대사 작성
- 피해/상태/자원 소비 확정

### NpcDialogue

입력:

- NPC ID/이름/요약
- disposition
- 공개 장면 요약
- 최근 공개 맥락
- 선택 `selectedActionId`
- `dialogueIntent`
- 청중 목록
- `maxLength`

출력:

- `dialogue`
- `tone`
- `safetyNotes`

금지:

- 행동 선택
- 숨김 정보 발화
- 결과 확정
- GM 서술문 생성

## 세션 모드 정책

| 기능          | AI GM 세션 | 사람 GM 세션             |
| ------------- | ---------- | ------------------------ |
| Interpreter   | 허용       | 보조 해석으로만 허용     |
| Narrator      | 허용       | GM 초안으로만 허용       |
| Director hint | 허용       | 기본 비활성 또는 GM 전용 |
| NpcDialogue   | 허용       | 플레이어 직접 호출 금지  |
| Summarizer    | 허용       | 허용                     |
| Actor         | 허용       | 기본 비활성              |
| Trace 조회    | GM/운영자  | GM/운영자                |

현재 AI 서버는 이 정책을 최종 검증하지 않는다. 백엔드가 세션 모드와 권한을 검증한 뒤 AI 서버를 호출해야 한다.

## AI가 쓰지 않는 영역

아래는 백엔드/엔진 책임이다.

- 주사위 계산
- DC 계산
- 명중/빗나감 판정
- 피해/회복 적용
- 상태 이상 적용/해제
- 주문 슬롯/자원 소비
- 인벤토리 변경
- `GameState`, `StateDiff`, `TurnLog` 확정
- 사람 GM의 `GM-001`~`GM-004` 조작
- 권한 검증

## 현재 남은 빈칸

| 빈칸                       | 다음 조치                                                 |
| -------------------------- | --------------------------------------------------------- |
| 세션 모드별 차단 정책      | 백엔드 세션 계층에서 구현                                 |
| `ACTION-001` 컨텍스트 빌더 | 실제 `GameState`/`ScenarioNode`에서 Interpreter 입력 조립 |
| role별 rule validator      | AI 출력이 engine-owned 값을 침범하는지 검증               |
| 백엔드 엔진 hook 실행      | `BACKEND_ENGINE_INTEGRATION_PLAN.md`의 P0부터 구현        |
| shared-types 승격          | `AI_SHARED_TYPES_ALIGNMENT.md` 기준으로 공통 타입화       |

## 완료로 보는 기준

- 모든 역할에 schema, prompt, service, test가 있다.
- 모든 실패가 세션 지속 fallback 또는 명확한 4xx로 끝난다.
- AI trace가 `success`, `failure`, `fallback`으로 남는다.
- AI 결과는 백엔드가 수락하기 전까지 후보로 취급된다.
- 사람 GM 경로와 AI GM 경로가 섞이지 않는다.
