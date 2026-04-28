# AI Harness Request Inventory

## 1. 목적

이 문서는 현재 `ai/` 하네스를 실제 서비스 수준으로 완성하기 전에, 어떤 요청이 AI로 들어오고 각 요청에 어떤 제한을 걸어야 하는지 고정하기 위한 기준 문서다.

기준 소스:

- Notion `API 명세서`
- `doc/AI_CONTRACTS.md`
- `doc/TURN_LOOP.md`
- `doc/DATA_MODEL.md`
- `doc/PROJECT_CONSTRAINTS_AND_SCOPE.md`

핵심 전제:

- AI는 상태를 **확정하지 않는다**.
- 서버 엔진만 `GameState`, `StateDiff`, `TurnLog`를 확정한다.
- 같은 세션의 행동 요청은 큐에서 **직렬 처리**한다.
- 사람 GM 세션과 AI GM 세션은 **허용 요청 자체가 다르다**.
- 하네스는 역할별 JSON 입출력 검증기이며, 게임 진실의 원천이 아니다.
- Google AI Studio 요청/응답, prompt context, 역할별 JSON schema에 새 필드를 추가할 때는 반드시 `AI_STUDIO_IO_FIELD_REFERENCE.md`에 필드 의미와 책임 경계를 같은 변경에서 추가한다.

## 2. 요청 분류

AI로 들어오는 요청은 아래 3종으로 나뉜다.

### A. 외부 API가 직접 AI 기능을 요청하는 경우

Notion `AI-001` ~ `AI-005`에 해당한다.

- 힌트 생성
- NPC 대사 생성
- 장면 서술 생성
- 세션 요약 생성
- AI 추적 로그 조회

### B. 일반 게임 API가 내부적으로 AI를 호출하는 경우

대표적으로 `ACTION-001`이다.

- 플레이어가 자연어 행동을 제출하면 내부적으로 `Interpreter` 호출
- 엔진이 상태를 확정한 뒤 내부적으로 `Narrator` 호출

이 경로가 MVP의 핵심이다.

### C. 백그라운드/조건부 내부 요청

현재 Notion에 공개 API로 완전히 노출되진 않았지만 `doc` 기준으로 필요한 내부 요청이다.

- `Actor`: NPC 행동 후보 선택
- `Director`: 정체 상태 힌트/전개 제안
- `Summarizer`: 장기 문맥용 요약 생성

## 3. 전역 제한

모든 AI 요청에 공통으로 적용해야 할 제한은 아래와 같다.

### 3.1 상태 변경 금지

AI는 아래를 직접 확정하면 안 된다.

- HP 변경
- 피해량 확정
- 단서 획득 확정
- 노드 이동 확정
- 전투 시작/종료 확정
- 상태이상 부여/해제 확정
- DC 확정
- 보상 지급 확정

허용되는 것은 오직 아래다.

- 자연어 입력 해석
- 확정된 결과의 표현
- 후보 제안
- 요약

### 3.2 세션 모드 제한

세션 모드에 따라 허용 범위를 분리한다.

| 요청                 | AI GM 세션  | 사람 GM 세션                                                                 |
| -------------------- | ----------- | ---------------------------------------------------------------------------- |
| Interpreter          | 허용        | 허용 가능. 단, 사람 GM 진행 흐름을 침범하지 않도록 결과는 보조 정보로만 사용 |
| Narrator             | 허용        | 기본 비활성. 필요 시 GM 초안 생성으로만 허용                                 |
| AI-001 힌트          | 허용        | 기본 비활성 또는 GM 전용 보조 기능                                           |
| AI-002 NPC 대사      | 허용        | 플레이어 직접 호출 금지. GM 보조로만 허용                                    |
| AI-003 장면 서술     | 허용        | 플레이어 직접 호출 금지. GM 초안으로만 허용                                  |
| AI-004 요약          | 허용        | 허용                                                                         |
| AI-005 트레이스 조회 | 운영자/GM만 | 운영자/GM만                                                                  |
| Actor                | 허용        | 기본 비활성                                                                  |
| Director             | 허용        | 기본 비활성                                                                  |

사람 GM 세션의 1차 수단은 아래 GM API다.

- `GM-001` 현재 노드 변경
- `GM-002` 자료 공개
- `GM-003` GM 메시지/내레이션 전송
- `GM-004` NPC 대사 전송

### 3.3 입력 크기와 문맥 제한

`TURN_LOOP.md` 기준으로 AI에 넘기는 컨텍스트는 작게 제한해야 한다.

- 현재 `GameState` 요약
- 현재 `ScenarioNode`
- 행동한 캐릭터 요약
- 주변 NPC/대상 후보
- 최근 `TurnLog` 3~5개 요약
- 관련 룰 조각

넘기면 안 되는 것:

- 전체 세션 로그 전문
- 룰북 전문
- 전체 시나리오 전문
- 비공개 GM 메모 전체
- 다른 플레이어의 숨김 정보 전체

### 3.4 구조화 출력 강제

모든 역할 출력은 JSON Schema 검증을 통과해야 한다.

- parse 실패: 1회 재시도
- schema 실패: 1회 재시도
- rule validator 실패: fallback
- 재시도 후 실패: 역할별 fallback

### 3.5 실패 시 세션 지속

LLM 실패가 세션 정지를 의미하면 안 된다.

- timeout: fallback
- rate limit: fallback
- quota 초과: fallback
- 네트워크 오류: fallback
- provider 오류: fallback

모든 실패는 `AiTrace`와 필요 시 `FailureLog`에 남긴다.

### 3.6 프롬프트/로그 보안

- API 키는 서버에서만 사용
- 클라이언트로 프롬프트 전문 미노출
- 운영용 API가 아니면 `rawOutput` 미노출
- 플레이어용 응답에는 내부 validation 상태 미노출

## 4. AI 요청 전체 목록

## 4.1 플레이어 행동 해석 요청

- 내부 요청명: `INTERPRETER_FROM_ACTION`
- 트리거: `ACTION-001 POST /api/v1/sessions/{sessionId}/actions`
- 역할: `Interpreter`
- 중요도: MVP 필수

### 입력 원천

- `sessionId`
- `characterId`
- `rawText`
- `clientCreatedAt`
- 현재 세션 상태
- 현재 노드
- 행동 주체 캐릭터 요약
- 접근 가능한 대상 후보
- 최근 로그 요약

### AI 입력에 반드시 포함할 것

- `session.id`
- `session.phase`
- `session.currentNodeId`
- `actor.characterId`
- `actor.name`
- `actor.abilities`
- `actor.proficientSkills`
- `actor.conditions`
- `scene.title`
- `scene.summary`
- `scene.availableTargets`
- `scene.checkOptions`
- `recentLogs`
- `rawText`

### AI가 하면 안 되는 것

- 존재하지 않는 대상 생성
- 현재 장면에 없는 목표 지정
- 판정 결과 확정
- DC 확정
- 피해/회복/단서/노드 이동 확정

### 출력 제한

- `StructuredAction`
- `needsClarification`
- `clarificationQuestion`
- `safetyNotes`

추가로 강제해야 할 제한:

- `confidence`는 `0.0`~`1.0`
- `approach`는 짧고 검증 가능한 문장
- `targetId`는 `availableTargets` 내부 값만 허용
- `type`은 `DATA_MODEL.md`의 enum만 허용

### fallback

- ambiguity 또는 `confidence < 0.5`: 확인 질문 또는 선택지 fallback
- timeout/rate limit/network: "가장 가까운 행동을 선택해 달라"는 선택지 fallback

## 4.2 행동 결과 서술 요청

- 내부 요청명: `NARRATOR_FROM_ACTION_RESULT`
- 트리거: `ACTION-001` 후 엔진이 `CheckRequest`, `DiceResult`, 백엔드 `StateDiff.operations`를 확정한 뒤
- 역할: `Narrator`
- 중요도: MVP 필수

### 입력 원천

- 원본 입력
- 확정된 `StructuredAction`
- 확정된 `CheckRequest`
- 확정된 `DiceResult`
- 백엔드 `StateDiff.operations`에서 만든 공개 요약 `NarratorStateDiffSummary`
- 현재 장면 정보
- 출력 톤 가이드

### AI 입력에 반드시 포함할 것

- `rawInput`
- `action`
- `checkRequest` if exists
- `diceResult` if exists
- `stateDiffSummary` if exists
- `scene.title`
- `scene.summary`
- `scene.tone`
- `constraints.language='ko'`
- `constraints.maxLength`
- `constraints.noNewFacts=true`

### AI가 하면 안 되는 것

- 새 사실 추가
- 확정되지 않은 단서 추가
- 피해량/보상/사망 여부 창작
- 플레이어 의도 변경
- 주사위 결과 왜곡

### 출력 제한

- 한국어
- 기본 2~5문장
- `visibleSummary`는 `narration`보다 짧아야 함

### fallback

- timeout/provider 오류: 템플릿 서술
- rule validator 실패: 템플릿 서술

## 4.3 AI 힌트 요청

- 외부 API: `AI-001 POST /api/v1/sessions/{sessionId}/ai/hint`
- 역할 후보: `Director` 또는 `Summarizer + Director`
- 중요도: MVP 보조

### 목적

- 현재 장면/로그 기반 힌트 생성

### 요청 필드

- `hintLevel`: `LIGHT | NORMAL | STRONG`
- `question`: 선택, 500자 이하

### 추가 제한

- 플레이 해답을 직접 누설하지 않기
- 미발견 단서를 확정 사실처럼 말하지 않기
- 정답 하나만 강요하지 않기
- `hintLevel`에 따라 정보 강도만 달라지고 사실 범위는 넘지 않기

### 세션 정책

- AI GM 세션: 허용
- 사람 GM 세션: 기본 403 또는 GM 전용 보조

### 권장 내부 출력 형식

- `hintLevel`
- `content`
- `sourceScope`: `scene|recent_logs|rules`
- `spoilerLevel`: `low|medium|high`

### fallback

- LLM 실패 시 사전 정의된 일반형 힌트 템플릿

## 4.4 AI NPC 대사 생성 요청

- 외부 API: `AI-002 POST /api/v1/sessions/{sessionId}/ai/npc-dialogue`
- 역할: `NpcDialogue`
- 역할 후보: `Actor` 또는 별도 `NpcDialogue`
- 중요도: 후순위지만 공개 API 존재

### 목적

- 현재 상황과 NPC 설정 기반 대사 생성
- `Actor`와 분리한다. `Actor`는 NPC가 어떤 행동 후보를 고를지 선택하고, `NpcDialogue`는 이미 허용된 대사 생성 요청만 처리한다.

### 요청 필드

- `npcEntityId`
- `playerInput` optional, 1000자 이하
- `tone`: `NEUTRAL | FRIENDLY | HOSTILE | MYSTERIOUS`

### 추가 제한

- 존재하지 않는 NPC 설정 생성 금지
- NPC가 모르는 정보 발화 금지
- 세계관 사실 추가 금지
- 행동 결과를 확정하는 대사 금지
- 대사 길이 제한 필요

### 세션 정책

- AI GM 세션: 허용
- 사람 GM 세션: 플레이어 직접 호출 금지, GM 보조에서만 허용

### 권장 내부 출력 형식

- `npcEntityId`
- `content`
- `tone`
- `intentTag`: `warn|guide|refuse|threaten|smalltalk`

## 4.5 AI 장면 서술 요청

- 외부 API: `AI-003 POST /api/v1/sessions/{sessionId}/ai/narration`
- 역할: `Narrator`
- 중요도: 공개 API 존재

### 목적

- 특정 행동 결과 또는 현재 장면 기반 서술 생성

### 요청 필드

- `actionLogId` optional
- `sceneFocus` optional, 500자 이하
- `tone`: `TENSE | MYSTERIOUS | HEROIC | CALM`

### 추가 제한

- `actionLogId`가 있으면 확정된 로그 기반으로만 표현
- `sceneFocus`는 강조 포인트일 뿐 사실 생성 근거가 아님
- 현재 노드와 공개 정보 범위 밖 내용을 생성 금지

### 세션 정책

- AI GM 세션: 핵심 기능
- 사람 GM 세션: GM 초안으로만 허용

## 4.6 세션 요약 생성 요청

- 외부 API: `AI-004 POST /api/v1/sessions/{sessionId}/ai/summary`
- 역할: `Summarizer`
- 중요도: 중요

### 목적

- 최근 로그 또는 지정 범위 기반 요약 생성

### 요청 필드

- `rangeType`: `RECENT | FULL | SINCE_NODE`
- `lastLogCount` optional
- `nodeId` optional

### 추가 제한

- 플레이어용 요약과 AI 내부 문맥 요약을 분리 저장
- 내부 요약에는 공개되지 않은 메타 정보가 들어갈 수 있으나 플레이어용 응답에는 금지
- 요약은 사실 압축만 허용, 상태 확정 금지

### 권장 내부 출력 형식

- `summaryType`: `player_visible|ai_context`
- `coveredTurnRange`
- `content`
- `keyFacts`

## 4.7 AI 추적 로그 조회 요청

- 외부 API: `AI-005 GET /api/v1/sessions/{sessionId}/ai-traces`
- 역할: AI 자체 호출은 아님. 관측용
- 중요도: 운영 필수

### 목적

- `AiTrace`와 fallback 상태 조회

### 제한

- 일반 플레이어 비노출
- 운영자/GM 또는 내부 도구만 접근
- `rawOutput` 공개 여부는 별도 권한으로 제한

### 필터

- `role`
- `validationStatus`
- `size`

## 4.8 NPC 행동 선택 요청

- 내부 요청명: `ACTOR_FOR_NPC_TURN`
- 트리거: 전투/간단 반응 시 NPC 턴
- 역할: `Actor`
- 중요도: 부분 구현

### 입력

- NPC disposition, hp, condition
- 장면 요약
- `allowedActions`

### 제한

- `allowedActions` 밖 행동 선택 금지
- 상태 변경 직접 금지
- 이유 문자열은 짧게

### 출력

- `selectedActionId`
- `reason`

주의:

- `Actor`는 NPC 대사를 생성하지 않는다.
- NPC 대사는 `AI-002`의 `NpcDialogue` 역할로 분리한다.

## 4.9 진행 정체 해소 요청

- 내부 요청명: `DIRECTOR_FOR_STALL`
- 트리거: 같은 노드 장기 정체, 반복 실패, 플레이어 힌트 요청
- 역할: `Director`
- 중요도: 후순위지만 하네스 설계 대상

### 입력

- 현재 노드 요약
- 최근 실패 로그
- 플레이어가 이미 시도한 접근
- 공개 가능한 단서 후보

### 제한

- 진행 강제 금지
- 새 사실 확정 금지
- 정답 직접 공개 금지
- 다음 시도 후보만 제시

### 출력

- `suggestions[]`
- `hintText`
- `reason`

## 5. AI 미사용 요청

아래는 AI 하네스 범위에서 명시적으로 제외해야 한다.

- `/roll`, `/attack`, `/check` 같은 명령어 입력
- `TURN-001` 턴 종료
- 사람 GM의 `GM-001` ~ `GM-004` 직접 조작
- 주사위 계산
- DC 계산
- `StateDiff` 적용
- 권한 검증

즉, 하네스는 룰 엔진을 대체하면 안 된다.

## 6. 현재 하네스와의 차이

현재 `ai/` 구현은 아래만 있다.

- `POST /api/harness/smoke`
- `POST /api/harness/interpreter`
- `POST /api/harness/narrator`
- `POST /api/harness/director`
- `POST /api/harness/summarizer`
- `POST /api/harness/actor`
- `POST /api/harness/npc-dialogue`
- `GET /api/harness/traces`

현재 입출력 필드 기준 문서는 `AI_STUDIO_IO_FIELD_REFERENCE.md`다. 새 요청 DTO, 응답 DTO, prompt context 필드를 추가하는 설계는 이 기준서 갱신 없이는 완료로 보지 않는다.

현재 부족한 점:

- 세션 모드별 허용/차단 정책 없음
- 사람 GM 세션 예외 정책 없음
- `Director`, `Summarizer`, `Actor`, `NpcDialogue` 하네스는 1차 구현됨
- `AI-001` ~ `AI-005` 대응 요청 DTO 없음
- `ACTION-001` 입력을 실제 `InterpreterInput` 구조로 조립하는 컨텍스트 빌더 없음
- Narrator에 `NarratorStateDiffSummary`, `DiceResult`, `CheckRequest`를 전달하는 하네스/fixture는 1차 준비됨
- role별 rule validator 없음
- `NpcDialogue`는 `Actor`와 합치지 않고 별도 역할/스키마/프롬프트/서비스/엔드포인트로 구현되어 있다.
- 역할별 fallback 템플릿 체계는 하네스 기준으로 1차 준비됨. 5xx/provider/schema 런타임 실패는 세션 지속 fallback으로 응답하고, 4xx 요청 위반은 에러로 유지한다.
- `AiTrace` 저장 포맷 매핑은 `harness_history.jsonl`의 `aiTrace` 객체 기준으로 1차 준비됨
- 운영용 trace 조회/필터 DTO는 `/api/harness/traces` 기준으로 1차 준비됨
- 캐릭터 생성용 SRD catalog는 1차 준비됨. 12개 직업 시작 장비, typed 주문시전 진행표, 한국어 표시명/alias가 들어간 145개 장비 item은 `generated/srd/classes.jsonl`, `equipment_items.jsonl`, `srd_qa_report.json`에서 검증한다.
- deterministic rule hook의 백엔드 연결 순서는 `BACKEND_ENGINE_INTEGRATION_PLAN.md`에 분리됨
- fallback 응답은 `fallback=true`, `fallbackReason`, `trace.failureType`, `finishReason=FALLBACK`를 포함하고 `harness_history.jsonl`에 status=`fallback`으로 기록한다.
- `shared-types`와 AI 입출력 DTO 정렬 기준은 `AI_SHARED_TYPES_ALIGNMENT.md`에 분리됨
- `Interpreter`/`Narrator` 프롬프트는 플레이 로그 기반 규칙을 1차 반영함. Interpreter는 결과 서술처럼 들리는 입력과 불명확한 후속 지시를 상태 확정으로 바꾸지 않고, Narrator는 `NarratorStateDiffSummary`/`DiceResult`/`CheckRequest`의 확정 사실만 서술한다.
- 2026-04-28 live Google AI Studio 프롬프트 회귀 검증은 9개 시나리오 모두 통과함.
- 백엔드 엔진 P0 연결 준비는 `generated/srd/backend_engine_p0_contracts.json` 기준으로 1차 완료됨. P0 hook 4개의 정상/경계/거절 요청/응답 계약 예제 12개를 백엔드 pure unit test seed로 쓸 수 있다.
- shared-types adapter 준비는 `app/adapters/shared_types.py` 기준으로 1차 완료됨. AI DTO의 `CheckRequest`, `DiceResult`, `AiTrace` 필드명 차이를 백엔드 후보 payload로 변환한다.
- Interpreter -> backend hook handoff 샘플은 `generated/srd/interpreter_backend_handoff_cases.json` 기준으로 1차 완료됨. `Chill Touch`, 무기 공격, 넘어짐 후 공격 준비 3개 흐름을 백엔드 integration test seed로 쓸 수 있다.
- Narrator 입력 fixture는 `generated/srd/narrator_input_fixtures.json` 기준으로 1차 완료됨. P0 hook 결과를 `CheckRequest`, `DiceResult`, `NarratorStateDiffSummary`가 포함된 Narrator 요청으로 조립하는 3개 예제를 제공한다.
- AI Narrator의 공개 요약 DTO 이름은 `NarratorStateDiffSummary`/`stateDiffSummary`로 고정함. 백엔드 `StateDiff.operations`와 같은 이름을 쓰지 않는다.
- trace row 상태값은 하네스 내부에서 `success`, `failure`, `fallback`으로 고정하고, 백엔드 validation 상태가 필요하면 adapter에서 `passed`, `failed`, `fallback`으로 변환한다.

## 7. 구현 우선순위

하네스 완성 순서는 아래가 적절하다.

1. `Interpreter`를 `doc/AI_CONTRACTS.md`의 정식 입력 구조로 확장
2. `Narrator`를 `DiceResult`, `NarratorStateDiffSummary`, `CheckRequest`, `noNewFacts` 검증까지 확장
3. `AI-001` 힌트용 `Director` 하네스 추가
4. `AI-004` 요약용 `Summarizer` 하네스 추가
5. `Actor` 하네스 추가
6. `NpcDialogue` 하네스 추가
7. `AI-005` 대응 trace 조회 포맷 정리

현재 AI 폴더 기준 실행 작업 목록:

| 순서 | 작업                                                                         | 상태 |
| ---- | ---------------------------------------------------------------------------- | ---- |
| 1    | 직업 시작 장비 누락 보강 및 `startingEquipmentValidatorInputReady=true` 달성 | 완료 |
| 2    | 직업 주문시전 진행표를 정수 기반 typed row로 고정                            | 완료 |
| 3    | Narrator 요청/응답을 정식 결과 서술 입력 구조로 확장                         | 완료 |
| 4    | `Director` 힌트 하네스 추가                                                  | 완료 |
| 5    | `Summarizer` 요약 하네스 추가                                                | 완료 |
| 6    | `Actor` NPC 행동 후보 하네스 추가                                            | 완료 |
| 7    | trace 조회/필터 DTO 정리                                                     | 완료 |
| 8    | 실제 interpreter/narrator 프롬프트를 플레이 로그 기반으로 고도화             | 완료 |
| 9    | live Google AI Studio 프롬프트 회귀 검증                                     | 완료 |
| 10   | 백엔드 엔진 P0 연결 준비 contract fixture 생성                               | 완료 |
| 11   | shared-types adapter 준비                                                    | 완료 |
| 12   | P0 contract edge case 확장                                                   | 완료 |
| 13   | Interpreter -> backend hook handoff 샘플 고정                                | 완료 |
| 14   | Narrator 입력 fixture 보강                                                   | 완료 |
| 15   | AI Narrator 상태 요약 DTO 이름을 `NarratorStateDiffSummary`로 변경           | 완료 |
| 16   | `Actor`와 `NpcDialogue` 역할 분리                                            | 완료 |
| 17   | trace 상태값 vocabulary를 `success`/`failure`/`fallback`으로 일치            | 완료 |
| 18   | `NpcDialogue` 전용 스키마/프롬프트/서비스/하네스 엔드포인트 추가             | 완료 |

## 8. 완료 기준

AI 하네스가 "완성"이라고 부르려면 최소 아래를 만족해야 한다.

- 모든 MVP 역할에 대해 요청 DTO, 응답 DTO, 프롬프트 버전, schema validator가 존재
- 세션 모드별 허용/차단 정책이 코드로 존재
- 상태 변경 금지 검증기가 존재
- timeout/rate limit/network/provider/schema 실패 fallback이 역할별로 존재
- `AiTrace` 저장 포맷이 `doc/DATA_MODEL.md`와 일치
- `ACTION-001` 경로와 연결 가능한 내부 요청 예제가 존재
- 사람 GM 대체 경로(`GM-001`~`GM-004`)와 충돌하지 않는 정책이 문서화되어 있음
