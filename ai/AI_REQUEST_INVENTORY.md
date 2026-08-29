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
| NPC 행동 선택      | `/internal/ai/actor` 진단 하네스                    | `Actor`       | 제품 소비자 없음 | `allowedActions` 중 선택 |
| 정체 해소          | 내부 조건부 호출                                    | `Director`    | 하네스 구현   | 다음 시도 후보만 제안    |

## 역할별 입출력

### Interpreter

내부 AI transport 입력:

- `sessionId`, `turnId`
- `rawText`
- `actorCharacterId`
- `sceneSummary`
- `recentLogs`
- `availableTargets`, `availableTargetDetails`
- `requestIntent`, `screenType`
- 서버가 확정한 `targetId`, `itemId`, `spellId`, `mapPoint`, `relatedIntent`
- 선택 `transitionCandidates`, 백엔드 판정용 `transitionEvidence`

Google prompt는 위 DTO를 그대로 직렬화하지 않는다. 추적 ID와 actor ID를 제외하고, 허용된
`availableTargets`와 교차한 상세 대상만 `targets`로 합친다. 의도에 필요한 경우에만
SRD 조회 결과를 `relatedEntities`, `relatedRules`, `classFeatureCandidates`로 투영한다.
`transitionEvidence`의 flags, 미공개 단서, 현재 노드 ID는 provider에 전달하지 않는다.

출력:

- `action`
- `needsClarification`
- `clarificationQuestion`
- `mentionedSpellId`
- `mentionedItemId`
- `requiredRuleCheckIds`
- 조건부 `sceneTransition`

금지:

- 존재하지 않는 target 생성
- 명중/실패/피해/DC/상태/슬롯/인벤토리 확정
- `relatedRules`와 `classFeatureCandidates`를 게임 결과처럼 사용

### Narrator

내부 AI transport 입력:

- 백엔드가 수락한 `action`
- 백엔드가 확정한 `checkRequest`
- 백엔드가 확정한 `diceResult`
- 백엔드 `StateDiff.operations`에서 만든 공개 요약 `stateDiffSummary`
- `scene`
- `constraints`

`rawInput`, `actionSummary`, `diceSummary`, `sceneTone`은 legacy-only 호환 필드다. 구조화된
제품 호출은 플레이어 원문을 내부 AI transport나 Google prompt에 전달하지 않는다.

출력:

- `narration`

공개 `/api/v1` 응답의 `visibleSummary`는 백엔드가 확정 입력에서 파생한다.

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

- `content`
- `HUMAN_GM_ASSIST`에서만 `suggestions`

일반 `HINT` provider schema는 `content`만 허용한다.

공개 `/api/v1` 응답의 `hintLevel`, `sourceScope`, `spoilerLevel`, `safetyNotes`는 백엔드가 요청과 공개 문맥에서 보강한다.

금지:

- 미공개 단서 공개
- 정답 강제
- 진행 결과 확정

### Summarizer

입력:

- `summaryType`: `player_visible` 또는 `ai_context`
- `rangeType`: `RECENT`, `FULL`, `SINCE_NODE`
- `logs`
- 선택 `lastLogCount`

제품 API가 보내는 레거시 `logs`는 신뢰하지 않고 백엔드 저장소의 확정 공개 narration으로 교체한다. `includeHiddenContext`와 `SINCE_NODE`는 visibility/node metadata가 없는 현재 turn log 구조에서는 provider 호출 전에 거부한다. `FULL`은 확정 로그 50개 이하만 지원하며 더 크면 chunked summarization 미구현 오류로 거부한다. Google prompt에는 범위 적용이 끝난 `logs`와 `summaryType`만 전달한다.

출력:

- `content`

공개 `/api/v1` 응답의 `summaryType`, `coveredTurnRange`, `keyFacts`, `safetyNotes`는 백엔드가 요청 범위에서 보강한다.

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

현재 저장소의 제품 호출자는 0건이며 `/internal/ai/actor` 진단 하네스만 남아 있다. NPC 대사 흐름에 연결하면 역할당 호출 수가 늘고 행동 선택과 발화 책임이 다시 섞이므로 자동 연결하지 않는다. `internal-ai-contract-v2` 준비 시 실제 NPC turn engine 소비자가 생기지 않았다면 route, 설정, prompt, schema, benchmark를 함께 제거한다.

내부 transport의 NPC ID는 fallback 식별용이며 Google prompt에는 전달하지 않는다. 빈 conditions와 미확정 기본값 `hpStatus="unknown"`도 provider projection에서 제외한다.

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
- `dialogueIntent`
- `maxLength`

공개 `/api/v1` DTO의 `selectedActionId`, `audienceIds`는 deprecated 호환 입력이며 내부 AI transport와 Google prompt로 전달하지 않는다.

출력:

- `dialogue`

공개 `/api/v1` 응답의 `tone`, `safetyNotes`는 백엔드가 요청 disposition에서 보강한다.

금지:

- 행동 선택
- 숨김 정보 발화
- 결과 확정
- GM 서술문 생성

### CheckResult

입력:

- 백엔드가 확정한 `outcome`, `intent`
- 선택적 표시용 action/target/scene 문맥
- 성공 시 공개 가능한 `allowedRewardFacts`
- 선택적 표시 가능한 `visibleEntities`
- `outputMode`

사회 판정·감정 읽기 성공의 제품 호출은 `targetName`, `allowedRewardFacts`, `outcome`, `intent`, `outputMode`만 AI 서버로 전달하고, Google prompt에도 이 최소 집합만 사용한다. 모델이 허용 사실과 함께 다른 주장을 생성하더라도 AI 서버가 허용 사실 한 항목만 남기며, 백엔드가 정확한 allowlist 일치를 다시 검증한다.

출력:

- `narration`

금지:

- 플레이어 원문을 확정 사실로 사용
- `allowedRewardFacts` 밖 단서·보상 생성
- 판정 결과나 상태 변경 수정

## 세션 모드 정책

| 기능          | AI GM 세션 | 사람 GM 세션             |
| ------------- | ---------- | ------------------------ |
| Interpreter   | 허용       | 보조 해석으로만 허용     |
| Narrator      | 허용       | GM 초안으로만 허용       |
| Director hint | 서버 검증 메인 명령으로 허용 | 직접 API는 GM/JOINED 전용 |
| NpcDialogue   | 서버 검증 메인 명령으로 허용 | 직접 API는 GM/JOINED 전용 |
| Summarizer    | 서버 검증 메인 명령으로 허용 | 직접 API는 GM/JOINED 전용 |
| Actor         | 허용       | 기본 비활성              |
| Trace 조회    | GM/운영자  | GM/운영자                |

AI 서버는 세션 정책을 최종 검증하지 않는다. 백엔드는 공개 Hint/Summary/NpcDialogue 요청에 JOINED GM runtime 권한을 요구하고, 플레이어 메인 명령은 서버가 장면·로그·대상을 검증한 `SERVER_VALIDATED` 경로로만 내부 AI 호출을 수행한다.

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

## 현재 남은 검증·확장 항목

| 항목 | 다음 조치 |
| --- | --- |
| token 절감 동적 증거 | 변경 전 동일 fixture/실제 Google provider/동일 model usage baseline과 현재 capture를 비교하고, 행 identity 기반 set SHA 및 baseline·after 전 의미 품질 통과를 요구 |
| Summary node/visibility | typed turn-log metadata 도입 후 `SINCE_NODE`와 hidden 정책 구현 |
| 50개 초과 FULL Summary | bounded chunk/map-reduce 계약을 별도 설계 |
| 실제 provider 호환 | 고정 SDK·설정 모델로 structured-output/live contract 검증 |
| role별 rule validator      | AI 출력이 engine-owned 값을 침범하는지 검증               |
| 백엔드 엔진 hook 실행      | `BACKEND_ENGINE_INTEGRATION_PLAN.md`의 P0부터 구현        |
| shared-types 승격          | `AI_SHARED_TYPES_ALIGNMENT.md` 기준으로 공통 타입화       |

## 완료로 보는 기준

- 모든 역할에 schema, prompt, service, test가 있다.
- 모든 실패가 세션 지속 fallback 또는 명확한 4xx로 끝난다.
- AI trace가 `success`, `failure`, `fallback`으로 남는다.
- AI 결과는 백엔드가 수락하기 전까지 후보로 취급된다.
- 사람 GM 경로와 AI GM 경로가 섞이지 않는다.
