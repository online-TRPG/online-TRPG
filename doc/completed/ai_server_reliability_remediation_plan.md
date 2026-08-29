# AI 서버 안정성·성능·데이터 계약 개선 계획

기준일: 2026-07-15
상태: 완료 (2026-07-31)
대상: `ai/app`, `be/src/modules/ai`, `be/src/modules/actions`, AI 서버 운영 설정·프롬프트·입출력 계약·진단 로그

## 1. 목적

현재 AI 서버는 역할별 JSON 검증, 로컬 fallback, SRD 검색 인덱스처럼 기본 안전장치를 갖추고 있다. 그러나 공급자 호출 타임아웃이 실제 종료 시간을 보장하지 않고, rate limit과 quota fallback이 조건상 실행되지 않으며, 로그와 역할별 실행 코드가 트래픽 증가에 불리한 형태로 남아 있다. 또한 Google AI Studio에 보내는 입력이 역할별로 최소화되지 않아 중복 ID, 추적 메타데이터, `null` 필드, 사용하지 않는 SRD 문맥이 프롬프트 토큰을 소비하고, 일부 역할에서는 잘못되거나 서로 충돌하는 데이터가 확정 사실처럼 전달된다. 출력도 제품이 소비하지 않는 필드를 모델에게 생성하도록 요구하고 있다.

이 계획의 목적은 다음 네 가지다.

1. AI 공급자가 느리거나 실패해도 30초 총 처리 예산 안에서 세션이 fallback으로 계속 진행되게 한다.
2. 중복 호출, 무제한 프롬프트와 로그 증가로 발생하는 비용·지연·디스크 위험을 제한한다.
3. 역할별 중복 실행 코드를 공통화하되 Interpreter의 의미 검증과 Actor의 허용 행동 검증은 그대로 보존한다.
4. Google AI Studio에는 역할 수행에 필요한 최소 데이터만 보내고, 제품이 실제로 사용하는 최소 출력만 생성하게 한다.

이 문서는 현재 AI 역할과 데이터 계약의 기준 문서가 아니라 개선 작업의 실행 계획이다. 구현 완료 후 역할별 계약의 기준 문서인 `structure/AI_RUNTIME_CONTRACTS.md`, AI 운영 원칙인 `rules/AI_RUNTIME_RULES.md`, 실제 Pydantic·TypeScript DTO가 서로 일치해야 한다.

## 2. 범위와 제외 범위

### 포함 범위

- Google AI Studio 호출의 실제 타임아웃과 취소
- AI 서버와 백엔드 사이의 재시도 책임
- rate limit, quota, 인증·설정 오류의 fallback 정책
- liveness/readiness 분리와 Docker healthcheck
- trace 기록, 보존, 조회 비용과 손상 복구
- 요청 컨텍스트와 최종 프롬프트 크기 제한
- 백엔드 DTO에서 Google AI Studio 프롬프트로 가는 역할별 provider projection
- 확정 사실과 사용자 원문의 신뢰 경계
- 요청 의도에 따른 Interpreter 프롬프트·SRD 문맥 선택
- 제품 소비처에 맞춘 역할별 최소 출력 schema
- Google AI Studio token usage와 역할별 비용 계측
- AI 서버 공통 응답·trace·raw output 중복 제거
- 역할별 실행·재시도·응답 조립 중복 제거
- 총 지연 시간과 시도별 지연 시간의 정확한 계측
- `check_result` 역할 설정 분리와 잔여 정리

### 제외 범위

- 모델 자체의 문체·창작 품질 개선
- 계약 축소와 무관한 프롬프트 표현의 전면 재작성
- SRD 데이터 생성 파이프라인 변경
- 백엔드 룰 엔진 또는 게임 상태 확정 로직 변경
- AI 공급자 추가 도입

SRD 검색은 카탈로그가 `lru_cache`로 캐시되고 n-gram 인덱스를 사용하므로 이번 개선 대상에서 제외한다. 다만 회귀 테스트로 결과 순서와 limit은 보존한다.

## 3. 공통 해결 원칙

- `AI_TIMEOUT_MS`는 개별 공급자 호출 시간이 아니라 AI 서버 요청 전체의 상한으로 사용한다.
- 공급자 재시도는 AI 서버 한 곳에서만 수행한다. 백엔드는 AI POST 요청을 자동 재시도하지 않고 실패 시 백엔드 fallback으로 전환한다.
- 429 rate limit과 quota는 재시도하지 않고 즉시 역할별 template fallback으로 전환한다.
- 네트워크와 공급자 5xx만 남은 총시간 안에서 최대 1회 재시도한다. 재시도에는 짧은 exponential backoff와 jitter를 둔다.
- JSON parse·schema·의미 검증 실패는 현재 규칙대로 최대 1회만 재시도한다.
- 클라이언트 입력 오류와 서버·공급자 오류를 분리한다. 잘못된 요청은 4xx, 공급자 장애는 fallback 또는 5xx 진단 응답으로 처리한다.
- 제품 trace의 source of truth는 백엔드 DB `AiTrace`로 둔다. AI 서버 파일 로그는 제한된 진단 자료로만 사용한다.
- Google AI Studio 입력은 typed payload가 아니라 프롬프트 문자열이므로, 전달되는 모든 필드와 공백을 비용이 발생하는 데이터로 취급한다.
- 라우팅·추적·저장용 메타데이터는 provider prompt에 넣지 않는다. provider에는 해당 역할의 판단에 필요한 의미 데이터만 projection한다.
- 플레이어가 보낸 원문과 백엔드가 확정한 게임 사실을 같은 신뢰 수준으로 취급하지 않는다.
- 서버가 이미 알고 있거나 결정적으로 계산할 수 있는 값을 모델에게 다시 생성시키지 않는다.
- 출력의 `safetyNotes`나 자체 `confidence`를 보안·정합성 검증으로 사용하지 않고 서버 검증으로 대체한다.
- 역할과 의도별로 입력·출력 token usage를 수집한 뒤 prompt budget과 개선율을 판정한다.
- 변경 전후의 완료 여부는 “코드가 존재하는가”가 아니라 관찰 가능한 시간, 호출 횟수, 응답, 로그 크기 기준으로 판정한다.

## 4. 문제 목록

| ID | 우선순위 | 문제 | 영향 | 핵심 원인 |
| --- | --- | --- | --- | --- |
| AIR-01 | P1 | 타임아웃 후에도 공급자 작업 종료를 기다림 | 응답 지연, 작업 스레드 고갈, 중복 과금 | 요청마다 만든 `ThreadPoolExecutor`가 종료 시 `wait=True`로 대기 |
| AIR-02 | P1 | API 키가 없어도 health가 성공함 | 사용 불가능한 컨테이너가 healthy로 배포됨 | liveness와 readiness 미분리, 시작 설정 검증 없음 |
| AIR-03 | P1 | 429·quota fallback이 실행되지 않음 | AI template fallback 대신 오류가 백엔드까지 전파됨 | fallback type 목록과 `status_code >= 500` 조건 충돌 |
| AIR-04 | P2 | AI 서버와 백엔드가 모두 재시도함 | 동일 요청 중복 실행, 지연·비용 증가 | 재시도 책임과 총시간 예산이 계층별로 분리됨 |
| AIR-05 | P2 | 파일 trace가 무제한 증가하고 조회 시 전체 파싱됨 | 디스크 증가, trace 조회 지연, 손상된 한 줄로 전체 실패 | 회전·페이지 인덱스·오류 허용 파싱 없음 |
| AIR-06 | P2 | 배열 원소와 중첩 dict의 크기 제한이 부족함 | 과대 프롬프트, 토큰 비용 급증, 로그 비대화 | 배열 개수만 제한하고 요소·전체 prompt budget을 검증하지 않음 |
| AIR-07 | P2 | retry가 발생하면 `latencyMs`가 마지막 시도만 나타냄 | SLA와 품질 지표 왜곡 | 역할 서비스가 최종 provider 결과의 지연만 복사 |
| AIR-08 | P2 | 역할별 호출 코드가 거의 동일하게 중복됨 | 정책 변경 누락, 불필요한 파일·schema 재처리 | 공통 runner가 logging/fallback만 담당하고 provider 실행은 분산됨 |
| AIR-09 | P3 | `check_result`가 narrator 모델 설정을 사용함 | 독립 조정 불가, 역할별 설정 의미 불명확 | 전용 모델·temperature 설정 누락 |
| AIR-10 | P3 | 중복 import와 중복 세션형 AI route가 남아 있음 | 코드 탐색 비용, 소유 경계 혼란 | 병합 잔재와 하네스/제품 API 경계 미정리 |
| AIR-11 | P1 | Narrator가 구조화된 확정 사실 대신 레거시 문자열을 받음 | 플레이어 원문을 사실로 오인, `scene.tone` 충돌, 환각 가능성 | 백엔드가 `action`, `diceResult`, `stateDiffSummary`, `scene` 계약을 채우지 않음 |
| AIR-12 | P1 | Main Command가 만든 VTT event hint가 Director 요청에서 유실됨 | 현재 장면에 필요한 힌트 누락, 부정확한 안내 | `runHint()`가 전달받은 `publicClues`를 버리고 공개 단서만 재조회 |
| AIR-13 | P1 | 명시적 `spellId`가 SRD 허용 ID 집합에 반영되지 않음 | 올바른 선택을 모델이 유지해도 사후 검증 실패 | spell 검색을 `rawText`에만 의존 |
| AIR-14 | P1 | Summarizer의 `lastLogCount`가 실제 로그를 제한하지 않음 | 불필요한 입력 토큰, 요청 범위를 넘는 요약 | 숫자만 프롬프트에 넣고 전체 `logs`를 그대로 전달 |
| AIR-15 | P1 | Check Result가 근거가 없어도 구체적 정보 보상을 생성하도록 요구함 | 존재하지 않는 단서·사실 생성 | 허용 사실 목록 없이 생성형 보상을 강제하는 prompt 계약 |
| AIR-16 | P1 | 요청별 `maxLength`가 실제 출력 검증에 적용되지 않음 | 길이 계약 위반, UI·대화 흐름 품질 저하 | 출력 schema가 전역 최대값만 검사 |
| AIR-17 | P2 | 확정된 요청 의도에도 Interpreter 전체 분류 계약을 사용함 | 매 호출 고정 토큰·추론 시간 증가, 불필요한 재분류 | 단일 6.3KB system prompt로 모든 의도를 처리 |
| AIR-18 | P2 | Interpreter에 중복 대상 ID와 무관한 SRD·engine hook·`null` 문맥을 전달함 | 입력 토큰 증가, 주의 분산, 잘못된 후보 선택 가능성 | 의도별 provider projection과 compact serialization 부재 |
| AIR-19 | P2 | 제품에서 사용하지 않는 출력 필드를 모델이 생성함 | 출력 토큰·검증 실패 면적 증가, 상충 정보 생성 | schema가 실제 소비처가 아닌 진단·예비 필드까지 요구 |
| AIR-20 | P2 | 추론과 무관한 ID·추적 메타데이터가 역할 prompt에 포함됨 | 토큰 낭비, 모델에 불투명·오해 가능한 데이터 제공 | 일부 역할이 전체 request dump 또는 DTO를 직접 직렬화 |
| AIR-21 | P2 | 공통 응답과 저장 데이터에 metadata와 raw/parsed가 중복됨 | 네트워크·DB·로그 용량 증가, source of truth 불명확 | top-level과 `trace`, DB 컬럼과 response JSON이 같은 값을 반복 |
| AIR-22 | P2 | provider token usage를 수집하지 않음 | 비용 최적화 효과와 역할별 병목 측정 불가 | Google 응답의 usage metadata를 trace 계약에 포함하지 않음 |
| AIR-23 | P2 | provider용 출력 schema에서 enum·길이·개수 제약을 제거함 | 잘못된 출력과 검증 재시도 증가 | Google 호환을 위해 제약을 일괄 삭제하고 역할별 최소 schema를 만들지 않음 |
| AIR-24 | P2 | 계약 문서와 실제 요청·출력 schema가 불일치함 | 변경 누락, 잘못된 소비자 구현, 회귀 탐지 실패 | 계약을 수동으로 중복 관리하고 일치 검증이 없음 |

## 5. 단계별 구현 계획

권장 실행 순서는 다음과 같다.

1. Phase 1로 timeout, fallback, readiness의 장애 경계를 먼저 안정화한다.
2. Phase 2의 token·prompt 계측 기반 작업과 Phase 3의 AIR-11~AIR-16 데이터 정합성 작업을 병행하되, AIR-11~AIR-16은 다른 P2 최적화보다 먼저 배포한다.
3. 기준 token usage와 품질 fixture를 확보한 뒤 AIR-17~AIR-23의 입력·출력 최소화를 적용한다.
4. 계약이 안정화되면 Phase 4의 공통 실행기와 route 정리로 중복을 제거한다.

Phase 번호는 주요 작업 묶음을 나타내며, P1 데이터 정합성 수정이 모든 Phase 2 작업의 완료를 기다린다는 의미는 아니다.

### Phase 1. 호출 안정성과 fallback 복구

대상: AIR-01, AIR-02, AIR-03, AIR-04

#### 5.1 실제로 끝나는 총시간 제한

변경 대상:

- `ai/app/clients/google_ai_studio.py`
- `ai/app/core/config.py`
- `ai/app/services/role_runner.py`
- `ai/app/services/provider_execution.py`
- 역할별 service와 smoke runner

해결 방식:

1. 요청마다 생성하는 `ThreadPoolExecutor`를 제거한다.
2. 현재 lockfile의 `google-genai`가 제공하는 transport/native timeout 또는 취소 가능한 async 호출을 사용한다.
3. `time.monotonic()` 기준의 요청 deadline을 공통 `provider_execution`이 소유하고 `AiRoleRunner`는 역할 fallback·진단 기록 경계를 담당한다.
4. 각 provider attempt에는 남은 시간만 전달한다. 남은 시간이 없으면 새 시도를 시작하지 않는다.
5. timeout을 `AiClientError(failure_type="timeout")`으로 일관되게 변환한다.
6. 공급자 작업이 제한 시간 뒤 background에서 계속 실행되는 구현은 허용하지 않는다.

해결 기준:

- 가짜 provider가 반환하지 않아도 role 요청은 설정된 총시간 상한과 허용 오차 안에 fallback을 반환한다.
- timeout 이후 실행 중인 provider future/thread가 남지 않는다.
- 정상 요청은 한 번만 provider를 호출한다.
- timeout과 retry를 합친 전체 시간이 `AI_TIMEOUT_MS`를 넘지 않는다.

#### 5.2 재시도 책임 단일화

변경 대상:

- `ai/app/services/role_runner.py`
- `ai/app/services/provider_execution.py`
- `be/src/modules/ai/ai.client.ts`

해결 방식:

1. provider retry는 AI 서버만 담당한다.
2. 백엔드의 `GatewayTimeoutException` 자동 1회 재시도를 제거한다.
3. 네트워크/5xx는 AI 서버에서 최대 1회 retry한다.
4. 429, quota, auth/config 오류는 retry하지 않는다.
5. retry 가능한 오류는 deadline 안에서 backoff와 jitter 후 다시 호출한다.
6. AI 서버 연결 실패 시 백엔드는 기존 BE default fallback을 즉시 사용한다.

해결 기준:

- 한 제품 요청이 provider를 호출하는 최대 횟수는 2회다.
- 429와 quota는 provider 1회 호출 뒤 즉시 template fallback이 된다.
- AI 서버 timeout 뒤 백엔드가 같은 AI POST를 다시 보내지 않는다.
- trace의 `attempts`가 실제 provider 호출 횟수와 일치한다.

#### 5.3 fallback 정책 정합성

변경 대상:

- `ai/app/services/fallback_policy.py`
- `ai/app/clients/google_ai_studio.py`
- `ai/app/core/errors.py`

해결 방식:

오류를 다음과 같이 분류한다.

| 분류 | retry | role endpoint 처리 | smoke 처리 |
| --- | --- | --- | --- |
| 잘못된 클라이언트 요청 | 없음 | 4xx | 4xx |
| provider가 생성된 요청을 400/409로 거부 | 없음 | template fallback | 구조화 502 |
| provider 모델·endpoint 404 | 없음 | template fallback | 구조화 503 |
| schema/의미 검증 실패 | 최대 1회 | template fallback | 구조화 5xx |
| timeout/network/provider 5xx | 최대 1회 | template fallback | 구조화 5xx |
| rate limit/quota | 없음 | template fallback | 구조화 429/503 |
| API 키 누락·인증 실패 | 없음 | template fallback | 구조화 503 |

호출자 4xx는 provider 호출 전 Pydantic·역할별 선검증에서만 확정한다. 공급자가 요청 형식을
거부한 400/409와 인증 401/403을 호출자 오류로 오해해 그대로 노출하지 않는다.

해결 기준:

- `FALLBACK_FAILURE_TYPES`에 선언된 타입마다 도달 가능한 테스트가 있다.
- role endpoint는 공급자 장애에서 raw 500 대신 검증된 역할별 fallback response를 반환한다.
- 잘못된 입력은 provider를 호출하지 않고 4xx로 종료한다.

#### 5.4 liveness와 readiness 분리

변경 대상:

- `ai/app/api/routes/health.py`
- `ai/app/main.py`
- `docker-compose.yml`
- `ai/README.md`

해결 방식:

- `/internal/ai/health/live`: 프로세스와 FastAPI event loop가 응답하면 200을 반환한다.
- `/internal/ai/health/ready`: provider 설정, API 키, 지원 provider/model 기본 설정이 유효할 때만 200을 반환한다.
- 기존 `/internal/ai/health`는 호환 기간 동안 readiness alias로 유지한다.
- Docker healthcheck는 readiness endpoint를 사용한다.
- 실제 provider 호출은 readiness에서 수행하지 않아 healthcheck 비용과 quota를 만들지 않는다.

해결 기준:

- API 키 누락 시 live는 200, ready와 기존 health는 503이다.
- 유효한 설정에서는 live와 ready 모두 200이다.
- readiness 응답에 API 키 원문이 포함되지 않는다.
- 설정 오류는 시작 로그에 원인을 남기되 secret은 기록하지 않는다.

### Phase 2. 관측 가능성과 비용 상한

대상: AIR-05, AIR-06, AIR-07

#### 5.5 trace 저장과 조회 제한

변경 대상:

- `ai/app/core/response_logger.py`
- `ai/app/services/trace_service.py`
- `ai/app/schemas/harness.py`
- `be/src/modules/ai/ai.service.ts`
- 운영 환경변수 예시와 runbook

해결 방식:

1. 제품용 trace 조회와 집계는 백엔드 DB `AiTrace`를 사용한다.
2. AI 서버 JSONL은 크기 기반 회전 로그로 바꾸고 보존 개수를 설정 가능하게 하며, max byte나 보존 개수를 낮춘 뒤 남은 과대·초과 파일도 다음 기록 전에 현재 상한으로 정리한다.
3. 로컬 trace 조회는 전체 `read_text().splitlines()` 대신 최신 항목부터 제한 개수만 읽는다.
4. 빈 줄과 손상된 마지막 줄은 건너뛰고 별도 진단 수치를 남긴다.
5. 요청 본문과 `rawOutput` 기록 여부를 환경별로 제어하며 운영 기본값은 최소 기록으로 둔다.
6. 컨테이너 밖에서 사용할 수 없는 절대 `logPaths` 대신 trace ID와 상대 diagnostic reference를 사용한다.
7. 로그 기록 실패가 정상 AI 응답을 실패로 바꾸지 않게 한다.

제안 기본값:

- 파일당 10MB
- history 5개 보관
- trace API 최대 100개 반환
- 운영 환경 payload 전문 기록 비활성화

해결 기준:

- 각 history 파일은 `AI_LOG_MAX_BYTES` 이하이고, 현재 JSONL과 회전본을 합친 history 총량은
  `AI_LOG_MAX_BYTES * (AI_LOG_BACKUP_COUNT + 1)` 이하이다. 고정 내부 endpoint별
  `*.latest.json`도 각각 `AI_LOG_MAX_BYTES` 이하이며 덮어쓰기만 한다.
- 손상된 JSONL 행이 있어도 trace 조회가 200으로 정상 행을 반환한다.
- 1개와 100,000개 trace에서 API가 읽고 반환하는 행 수가 요청 size에 비례하고 전체 행 수에 비례하지 않는다.
- 요청/응답 로그에 API key가 없고, payload 전문 비활성화 시 플레이어 입력과 hidden context가 남지 않는다.
- 회전 또는 로그 쓰기 실패 후에도 role 응답과 backend `AiTrace` 저장은 유지된다.

#### 5.6 입력과 프롬프트 budget

변경 대상:

- `ai/app/schemas/harness.py`
- `ai/app/schemas/narrator.py`
- `ai/app/schemas/interpreter.py`
- 역할별 prompt builder
- 필요 시 `shared-types`와 백엔드 DTO

해결 방식:

1. `list[str]` 원소에 공통 길이 제한 타입을 적용한다.
2. `transitionCandidates`, `transitionEvidence`, `mapPoint`의 자유 `dict`를 명시적 schema로 바꾼다.
3. 구조화 action, 판정, dice, 상태 변경, scene과 허용 행동의 중첩 객체도 미계약 필드를 무시하지 않고 거부한다.
4. 역할별 prompt builder가 만든 최종 문자열 길이를 provider 호출 전에 검사한다.
5. 전체 제한을 넘으면 무작정 자르지 않고 최근 로그, 선택적 설명, 부가 context 순으로 축약한다.
6. 필수 필드까지 제한을 넘으면 422를 반환하고 provider를 호출하지 않는다.
7. 최대값은 공통 constants에 두고 AI·BE 계약 테스트에서 동기화한다.

해결 기준:

- 모든 배열은 항목 개수와 항목별 크기를 함께 제한한다.
- 모든 구조화 중첩 요청 객체는 미계약 필드를 거부한다.
- 모든 role의 최종 prompt가 설정된 최대 크기 이하임을 provider 호출 직전에 보장한다.
- 한도를 1자 초과한 필수 입력은 422이며 provider 호출 횟수는 0이다.
- context 축약 후에도 actor ID, 선택 대상 ID, 확정된 판정 결과, 안전 제약은 유지된다.
- 최대 크기 정상 요청의 메모리와 prompt byte 수를 회귀 테스트에서 기록한다.

#### 5.7 지연 시간 의미 교정

변경 대상:

- `ai/app/schemas/harness.py`
- `ai/app/services/role_runner.py`
- `ai/app/services/provider_execution.py`
- `be/src/modules/ai/ai.client.ts`
- `be/src/modules/ai/ai.service.ts`
- shared-types trace 계약

해결 방식:

- 기존 `latencyMs`는 AI 서버가 요청을 받은 시점부터 최종 성공/fallback 응답을 반환하기 직전까지의 총시간으로 정의한다. retry/backoff와 동기 best-effort 진단 로그 기록을 포함한다.
- 선택적으로 `providerLatencyMs`와 `attemptLatenciesMs`를 trace에 추가한다.
- `attemptLatenciesMs`가 명시되면 항목 수는 실제 `attempts`와 같아야 하고, `schemaValidationRetries`는 실제 완료된 후속 attempt 수인 `max(0, attempts - 1)`을 넘지 못하게 AI 응답 모델과 BE decoder 양쪽에서 검증한다.
- backend 품질 지표는 총 `latencyMs`를 사용한다.
- fallback `latencyMs=0` 고정값을 제거하고 실제 fallback 결정까지 걸린 시간을 기록한다.
- 파일 JSONL trace는 append 전 진단 snapshot으로 취급하며 제품 품질 지표의 단일 기준으로 사용하지 않는다. 제품 지표는 반환 trace와 backend DB wall-clock을 사용한다.

해결 기준:

- retry 2회 응답의 `latencyMs`는 두 attempt와 backoff 시간을 포함한다.
- `attemptLatenciesMs` 길이는 `attempts`와 같다.
- 단일 attempt의 `schemaValidationRetries=1`처럼 재시도 수가 실제 후속 attempt보다 큰 trace는 거절된다.
- 외부에서 측정한 AI HTTP elapsed와 `latencyMs` 차이가 정한 허용 오차 안이다.
- 기존 decoder는 optional 신규 필드가 없어도 동작한다.

### Phase 3. Google AI Studio 데이터 계약 교정과 최소화

대상: AIR-11~AIR-24

#### 5.8 Narrator 확정 사실 계약 복구

변경 대상:

- `be/src/modules/ai/ai.service.ts`
- Narrator를 호출하는 `be/src/modules/actions/*` 서비스
- `ai/app/schemas/harness.py`
- `ai/app/services/narrator/service.py`
- `ai/app/prompts/narrator.v1.md`

해결 방식:

1. 백엔드가 판정·주사위·상태 변경 후 확정한 `action`, `checkRequest`, `diceResult`, `stateDiffSummary`, `scene`을 구조화해 전달한다.
2. `rawInput`, `actionSummary`, `diceSummary`, `sceneTone` 레거시 필드는 호환 기간 뒤 제거한다.
3. 호환 기간에는 레거시 `sceneTone`을 `scene.tone`으로 정규화하고 서로 다른 값이 동시에 존재하면 요청을 거부한다.
4. 플레이어 원문은 서술 어조 참고값으로만 취급하고 확정 사실보다 우선할 수 없게 한다.
5. 사용자 호출로 임의의 판정 결과나 상태 변경을 “확정 사실”로 게시할 수 없도록 제품 route의 권한과 데이터 생성 주체를 함께 검증한다.
6. 공개 Narrator DTO의 구조화 `action`과 `scene`은 런타임 필수값으로 검증해 누락 요청이 AI fallback으로 우회되지 않고 컨트롤러 경계에서 4xx로 종료되게 한다.

해결 기준:

- 제품 Narrator 요청에서 구조화된 확정 필드가 채워지고 레거시-only 요청이 발생하지 않는다.
- `action` 또는 `scene`이 없는 공개 요청은 AI 호출 전에 4xx로 거부된다.
- player text와 확정 결과가 충돌하는 fixture에서 확정 결과만 narration에 반영된다.
- `scene.tone`은 provider prompt에 한 번만 존재한다.
- 상태 변경이 없는 요청에는 `stateDiffSummary`가 생략되고 `null` 문자열이 전달되지 않는다.

#### 5.9 Director 힌트 문맥 보존

변경 대상:

- `be/src/modules/actions/main-command-ai-query.service.ts`
- `be/src/modules/actions/main-command-hint-context.service.ts`
- `be/src/modules/ai/ai.service.ts`
- `ai/app/schemas/harness.py`
- `ai/app/services/director/service.py`

해결 방식:

1. 공개 단서와 미발동 VTT event hint를 서버가 권한 검증한 `hintFacts`로 구성한다.
2. `AiService.runHint()`가 호출자가 이미 구성한 event hint를 버리지 않게 한다.
3. 임의 클라이언트 문자열을 trusted hint fact로 승격하지 않고, 서버가 조회한 단서와 이벤트만 사용한다.
4. 일반 힌트와 Human GM Assist의 출력 schema를 분리한다.

해결 기준:

- event hint만 존재하는 fixture에서도 Director provider prompt에 해당 hint가 포함된다.
- 공개되지 않은 GM 단서는 플레이어 힌트 prompt에 포함되지 않는다.
- 일반 힌트 출력은 `content`만, Human GM Assist는 `content`와 `suggestions`만 요구한다.

#### 5.10 명시적 선택 ID 우선 처리

변경 대상:

- `ai/app/services/interpreter/service.py`
- `ai/app/schemas/interpreter.py`
- SRD spell·entity retrieval adapter
- `be/src/modules/actions/main-command-interpreter-payload.service.ts`

해결 방식:

1. `spellId`, `itemId`, `targetId`처럼 UI와 서버가 확정한 ID를 먼저 canonical catalog에서 조회한다.
2. canonical ID는 자연어 검색 결과와 무관하게 허용 ID 집합에 포함한다.
3. `rawText` 검색은 명시적 선택이 없거나 추가 규칙 문맥이 필요할 때만 수행한다.
4. 존재하지 않거나 현재 actor가 사용할 수 없는 ID는 provider 호출 전에 4xx 또는 clarification으로 처리한다.
5. 명시 선택 ID는 provider 출력에서 다시 생성시키지 않고 서버가 응답에 보강하며, 제거된 echo 필드는 조건부 schema 위반으로 거부한다.

해결 기준:

- 주문명이 없는 문장과 유효한 `spellId` 조합이 provider 의미 검증을 통과한다.
- 존재하지 않는 ID는 provider 호출 횟수 0으로 거부된다.
- 명시적 선택과 모델 출력이 다르면 서버의 허용 ID·게임 규칙 검증이 최종 권한을 가진다.
- 명시 target/spell/item fixture의 provider output schema에는 대응 echo 필드가 없고 최종 parsed 응답에는 서버 확정 ID가 유지된다.

#### 5.11 Summarizer 입력 범위 확정

변경 대상:

- `be/src/modules/actions/main-command-ai-query.service.ts`
- `be/src/modules/ai/ai.service.ts`
- `ai/app/services/summarizer/service.py`
- `ai/app/prompts/summarizer.v1.md`
- Summarizer 요청 DTO

해결 방식:

1. provider 호출 전에 서버가 `lastLogCount`를 적용해 실제 로그 배열을 자른다.
2. 범위 적용 후에는 `lastLogCount`를 provider prompt에서 제거한다.
3. `nodeId`, `includeHiddenContext`, visibility가 필요하다면 문자열 로그 대신 node·turn·visibility가 붙은 typed log record로 필터링한다.
4. 현재 제품처럼 서버가 공개 로그만 선택한다면 provider에는 `summaryGoal`, `summaryType`, 선택된 `logs`만 전달한다.
5. “player-visible과 ai-context를 별도로 보존”한다는 prompt 문구는 한 요청당 하나의 summaryType을 생성하는 실제 계약과 맞게 수정한다.

해결 기준:

- provider가 받는 로그 개수는 요청 범위를 초과하지 않는다.
- `player_visible` fixture에 hidden log가 한 건도 포함되지 않는다.
- 동일한 선택 로그에 대해 `lastLogCount` 숫자 유무가 출력 범위를 바꾸지 않는다.

#### 5.12 Check Result 허용 사실 계약

변경 대상:

- `be/src/modules/actions/main-command-check-result-narration.service.ts`
- `ai/app/schemas/harness.py`
- `ai/app/schemas/check_result.py`
- `ai/app/services/check_result/service.py`
- `ai/app/prompts/check_result.v1.md`

해결 방식:

1. 성공 보상으로 공개할 수 있는 사실을 백엔드가 `allowedRewardFacts`로 확정한다.
2. 모델은 해당 사실 중 하나를 원문 그대로 선택할 수만 있다. AI 서버는 선택된 허용 사실 밖의 모델 문장을 버리고, 백엔드도 최종 narration이 허용 사실과 정확히 일치하는지 다시 검증한다.
3. 허용 사실이 없으면 일반 성공 narration만 생성한다.
4. 사용하지 않는 별도 `rewardInfo` 출력은 제거하고, 필요하면 어떤 fact ID를 사용했는지 서버 검증 가능한 ID만 선택적으로 반환한다.
5. `request.model_dump()` 전체 전달을 제거하고 narration에 필요한 필드만 projection한다. 사회·감정 읽기처럼 정보 보상이 민감한 요청은 `targetName`, `allowedRewardFacts`, `outcome`, `intent`, `outputMode`만 Google prompt에 보내며 플레이어 action 문장, target summary/disposition, scene, visible entity 문맥은 제외한다.

해결 기준:

- `allowedRewardFacts=[]`인 성공 fixture에서 새로운 사실이 생성되지 않는다.
- 출력 narration의 고유 사실은 입력의 확정 사실·허용 사실 집합으로 추적 가능하고, 민감한 성공 narration은 허용 사실 한 항목과 정확히 일치한다.
- `sessionId`, `turnId`, provider model 설정은 prompt에 포함되지 않는다.

#### 5.13 요청별 동적 출력 제한

변경 대상:

- `ai/app/services/narrator/service.py`
- `ai/app/services/npc_dialogue/service.py`
- 역할별 output post-validation
- `ai/app/schemas/narrator.py`
- `ai/app/schemas/npc_dialogue.py`

해결 방식:

1. 정적 Pydantic 최대값과 별도로 `len(output) <= request.maxLength`를 역할별 후처리에서 검증한다.
2. 초과 출력은 문장 중간 강제 절단보다 검증 실패 1회 교정 또는 역할별 안전 fallback을 사용한다.
3. provider schema에서 길이 제약이 제거되더라도 서버 검증이 항상 적용되게 한다.

해결 기준:

- 최소값, 최대값, 1자 초과 경계 fixture가 요청별 길이 계약대로 처리된다.
- 교정 재시도 후에도 초과하면 제한 안의 fallback을 반환한다.
- 모든 정상·fallback 출력이 요청별 최대 길이를 만족한다.

#### 5.14 의도별 Interpreter provider projection

변경 대상:

- `ai/app/prompts/interpreter.v1.md`
- `ai/app/services/interpreter/service.py`
- `ai/app/schemas/harness.py`
- `ai/app/schemas/interpreter.py`
- `be/src/modules/actions/main-command-interpreter-payload.service.ts`

해결 방식:

1. `GENERAL_GM_REQUEST`에서만 전체 action taxonomy와 분류 지침을 사용한다.
2. `requestIntent`가 확정된 요청은 action type을 서버가 고정하고 소형 parameter extraction prompt를 사용한다.
3. 고정 `requestIntent`는 지원되는 action type 집합과 대조하고 알 수 없는 값은 provider 호출 전에 422로 거부한다.
4. transition, spell, rule, class feature 문맥은 해당 의도에서만 조회·전달한다.
5. `availableTargets`와 `availableTargetDetails`를 `targets: [{id, name, kind, ...}]` 하나로 통합하고 서버가 ID 집합을 파생한다.
6. SRD의 `source` 메타데이터와 AI가 반환할 수 없는 전체 engine hook 필드를 provider prompt에서 제거한다.
7. class feature 판단에 필요한 경우 full hook 대신 `classFeatureCandidates`의 최소 ID·이름·설명만 전달한다.
8. transition이 아닌 요청에서는 transition schema, 지침, `null` transition 필드를 모두 제거한다.
9. `json.dumps(..., indent=2)` 대신 compact JSON을 사용하고 `None`과 의미 없는 기본값을 생략한다.
10. 명시 spell/item은 해당 `relatedEntities[]` 원소에 선택 표시를 합치고 별도 객체에서 같은 ID를 반복하지 않는다. self target은 actor ID 대신 의미 boolean으로 전달한다.
11. `availableTargetDetails`는 허용된 `availableTargets` ID 집합과 교차한 항목만 전달하고, 백엔드가 자체 조건 판정에 사용하는 `transitionEvidence`의 flags·미공개 단서·현재 노드 ID는 provider prompt에서 제외한다.

해결 기준:

- 고정 의도 prompt에는 전체 action taxonomy와 무관한 SRD·transition 문맥이 없다.
- 알 수 없는 고정 의도는 provider 호출 횟수 0으로 422 처리된다.
- target ID는 provider prompt에 단일 구조로 한 번만 나타난다.
- 허용 대상 ID 집합 밖의 상세 이름·요약과 백엔드 전용 transition evidence가 provider prompt에 없다.
- 명시 spell/item ID도 provider prompt에서 canonical entity 구조 한 곳에만 나타난다.
- 일반 분류, 주문, 규칙, 전환, class feature fixture의 기존 라우팅 결과가 유지된다.
- 대표 fixture 기준 known-intent Interpreter 입력 토큰이 변경 전 대비 최소 40%, GENERAL_GM_REQUEST는 최소 20% 감소한다.
- 축소 후 의미 검증 실패율과 clarification 비율이 기존 허용 범위를 악화시키지 않는다.

#### 5.15 역할별 최소 출력 계약

변경 대상:

- `ai/app/schemas/interpreter.py`
- `ai/app/schemas/narrator.py`
- `ai/app/schemas/director.py`
- `ai/app/schemas/summarizer.py`
- `ai/app/schemas/npc_dialogue.py`
- `ai/app/schemas/check_result.py`
- `ai/app/schemas/actor.py`
- `be/src/modules/ai/ai.client.ts`
- 각 parsed output 소비처

목표 출력:

| 역할 | provider가 생성할 최소 출력 | 서버가 계산·보관할 값 |
| --- | --- | --- |
| Interpreter | `action`, 필요 시 clarification, 실제 소비되는 spell/item/rule ID | confidence, safety 진단, 허용 ID 검증 |
| Narrator | `narration` | visible state summary, trace metadata |
| Director 일반 힌트 | `content` | hint level, source scope, spoiler 검증 |
| Director Human GM Assist | `content`, `suggestions` | trace metadata |
| Summarizer | `content` | summary type, covered range |
| NPC Dialogue | `dialogue` | 표시 tone, speaker/audience ID |
| Check Result | `narration` | reward fact 검증, 판정 결과 |
| Actor | `selectedActionId` | 선택 이유 진단, allowed action 검증 |

해결 방식:

1. 백엔드·프론트엔드·저장소에서 읽지 않는 출력 필드를 소비자 검색으로 확정한 뒤 제거한다.
2. `safetyNotes`, self-reported `rulesConfidence`, echo 성격의 type/range 필드는 deterministic server validation으로 대체한다.
3. 하위 호환이 필요하면 AI 서버 내부에서 deprecated 필드를 잠시 채우되 provider에게 생성시키지 않는다.
4. 사용되지 않는 Actor 역할은 실제 소비 흐름을 연결하거나 별도 제거 계획으로 분리한다.
5. 역할 mode나 요청 조건에 따라 schema에서 제거한 필드는 서버 parser에서도 반환을 거부하고 조용히 폐기하지 않는다.
6. 조건부 schema에서 echo 필드를 제거한 경우 prompt도 해당 필드 생성을 요구하지 않으며, active schema에 존재하는 필드만 생성하도록 명시한다.

해결 기준:

- 각 역할 provider schema에는 위 표의 필드와 역할상 필수인 조건부 필드만 존재한다.
- 역할 prompt가 조건부 schema에서 제거된 echo 필드 생성을 지시하지 않는다.
- 제거 필드의 BE·FE·DB 소비자가 0임을 정적 검색과 계약 테스트로 증명한다.
- 역할별 출력 토큰이 변경 전 대비 감소하고 parsed 소비 결과는 동일하다.

#### 5.16 provider prompt와 공통 응답 최소화

변경 대상:

- 역할별 prompt builder
- `ai/app/schemas/harness.py`
- `ai/app/clients/google_ai_studio.py`
- `ai/app/services/role_runner.py`
- `ai/app/services/provider_execution.py`
- `be/src/modules/ai/ai.client.ts`
- `be/src/modules/ai/ai.service.ts`

해결 방식:

1. 각 역할에 명시적 provider projection을 만들고 request DTO 전체 dump를 금지한다.
2. `sessionId`, `turnId`, model override, opaque entity ID, 상수 제약 반복은 prompt에서 제외한다.
3. NPC의 audience나 선택 행동이 의미상 필요하면 불투명 ID가 아니라 공개 가능한 역할·이름·행동 요약으로 전달한다.
4. AI 서버 공통 응답은 `{parsed, fallback, trace}`를 기준으로 하고 provider/model/latency/promptVersion의 중복 top-level 필드를 단계적으로 제거한다.
5. `rawOutput`은 진단 설정이 활성화된 경우에만 trace 저장소에 남기고 정상 BE transport와 중복 JSON 저장에서 제외한다.
6. 컨테이너 내부 절대 `logPaths`를 BE 응답 계약에서 제거한다.

해결 기준:

- provider prompt snapshot에 추적·라우팅용 필드가 없다.
- 정상 응답 metadata의 source of truth가 `trace` 한 곳이다.
- payload 전문 기록 비활성화 시 BE response JSON과 DB 중복 JSON에 `rawOutput`이 없다.
- API 호환 기간과 deprecated 필드 제거 버전이 문서화된다.

#### 5.17 token usage와 provider schema 계측

변경 대상:

- `ai/app/clients/google_ai_studio.py`
- `ai/app/schemas/harness.py`
- `ai/app/services/role_runner.py`
- `ai/app/services/provider_execution.py`
- `be/src/modules/ai/ai.client.ts`
- `be/src/modules/ai/ai.service.ts`
- `AiTrace` DB schema와 역할별 운영 metric

해결 방식:

1. Google 응답의 input, output, cached, total token usage를 SDK가 제공하는 범위에서 수집한다.
2. usage는 bool·음수·DB `Int` 범위 초과 값을 계측값으로 수용하지 않고 `null`로 정규화하며, provider request ID와 finish reason도 trace 상한으로 제한한다. 모델·SDK별 부분 metadata를 고려해 prompt/output/cached/total은 각 필드를 독립적으로 보존하고, 누락값을 다른 필드로 추정하거나 합계 관계식으로 덮어쓰지 않는다.
3. usage를 role, promptVersion, model, fallback, attempts와 함께 trace에 저장한다.
4. client/user API에는 필요하지 않은 token usage를 노출하지 않고 내부 관측 데이터로 유지한다.
5. 현재처럼 schema 제약을 일괄 삭제하지 않고 현재 고정 SDK와 모델이 지원하는 provider 전용 최소 response schema를 역할·의도별로 만든다.
6. provider schema가 표현하지 못하는 enum·길이·허용 ID는 Pydantic과 역할별 의미 검증에서 계속 강제한다. 내부 AI 응답을 받는 BE decoder도 모델 생성 문자열의 비어 있지 않음, Interpreter action/transition enum과 중첩 문자열 상한을 동일하게 검증해 AI 서버만 신뢰 경계로 두지 않는다.
7. 최상위뿐 아니라 중첩 provider object에도 `additionalProperties: false`를 적용하고, 조건부 역할 schema에서 사용하지 않는 `$defs`를 제거한다.
8. `schemaValidationRetries`는 provider 출력의 Pydantic·역할 의미 검증이 실제로 시작된 trace에만 0 또는 1로 기록한다. 첫 검증 실패 자체가 아니라 그 실패 때문에 후속 provider attempt가 실제로 시작될 때만 1을 더하며, 마지막 attempt의 검증 실패를 재시도로 잘못 세지 않는다. 출력 전 local/config/auth/rate-limit/network/timeout 실패와 BE fallback은 `null`로 두어 schema retry율을 희석하지 않는다.
9. prompt/output/total token percentile마다 실제 non-null 표본 수를 따로 반환한다. 기존 `tokenSampleCount`는 total token 표본 수 alias로 유지한다. Schema 계측 표본이 0개면 retry율은 0%가 아니라 `null`로 반환하고, 전체 또는 해당 역할 trace가 0개인 운영 목표는 달성으로 표시하지 않는다.
10. 완료 판정용 token 비교는 각 행의 fixture identity에서 set SHA-256을 재계산하고, 전후 모두 실제 `google-ai-studio`와 동일 model인지 확인한다. 변경 전·후 어느 쪽이든 fixture 의미 품질을 통과하지 못하거나 품질 assertion이 비어 있으면 감소율이 높아도 완료로 인정하지 않는다.

해결 기준:

- 정상 Google 응답의 role별 input/output/total token 수가 `AiTrace` 또는 내부 metric에 기록된다.
- usage metadata가 없거나 일부 필드만 있는 fallback·mock 응답도 decoder 호환성을 유지하고, 각 percentile 표본 수가 해당 필드의 실제 non-null 수와 일치한다.
- 비정상 usage/진단 metadata가 정상 provider 응답을 500 또는 DB overflow로 바꾸지 않는다.
- provider schema 정제 결과가 역할·의도별 snapshot으로 고정된다.
- 중첩 provider object의 미계약 필드가 조용히 무시되지 않고 검증 실패가 된다.
- 비어 있는 필수 생성 텍스트와 Interpreter 중첩 enum·길이 위반은 AI Pydantic과 BE decoder 양쪽에서 거절된다.
- provider 출력이 두 번 연속 검증 실패해도 `schemaValidationRetries=1`이며 역할 fallback 응답 계약을 깨지 않는다. 재시도를 시작하지 않은 단일 검증 실패는 `0`이다.
- 첫 schema 실패 뒤 재시도 경로에 진입했더라도 provider 호출 전 local/config 단계에서 끝나 `attempts`가 늘지 않으면 `schemaValidationRetries`도 늘지 않는다.
- schema 계측 표본 수를 함께 제시한 위반 재시도율과 역할별 token p50/p95를 각 token 필드의 실제 표본 수와 함께 변경 전후 비교할 수 있다.
- schema 표본 0개의 retry율은 `null`이고, trace 표본이 없는 timeout/fallback 목표는 `targetMet=false`여서 무표본을 정상 0%로 오해하지 않는다.
- 전체 대표 fixture에서 기능 결과를 유지하면서 입력 토큰 합계가 1차 목표 30% 이상 감소한다.
- 대표 fixture마다 비어 있지 않은 의미 assertion이 있고 baseline·after 전 반복이 모두 통과하며, 선언된 fixture-set fingerprint가 실제 행 정체성에서 재계산한 값과 일치한다.

#### 5.18 계약 문서와 코드 동기화

변경 대상:

- `doc/structure/AI_RUNTIME_CONTRACTS.md`
- `doc/rules/AI_RUNTIME_RULES.md`
- `ai/AI_STUDIO_IO_FIELD_REFERENCE.md`
- `ai/contracts/internal_ai_contract_v1.json`
- `ai/README.md`
- Pydantic schema, TypeScript DTO, shared-types

해결 방식:

1. 실제 역할별 provider projection과 최소 출력 schema를 계약 문서에 반영한다.
2. Narrator처럼 문서와 실제 출력이 다른 항목을 전수 대조한다.
3. `ai/contracts/internal_ai_contract_v1.json`을 내부 응답과 provider 출력 필드의 기계 판독 기준으로 두고 Pydantic 모델·조건부 provider schema·BE decoder runtime allowlist와 비교한다. Trace의 정수·attempt 상한과 필드 간 불변식, Interpreter의 중첩 action/transition enum과 문자열 상한도 manifest에 고정해 AI Pydantic과 BE decoder 상수의 드리프트를 탐지한다.
4. 역할·의도에 따라 달라지는 provider 입력 projection은 DTO 전체를 manifest에 복제하지 않고 실제 compact prompt key를 검증하는 projection 테스트로 고정한다.
5. 레거시 필드, deprecated 기간, 제거 버전과 소비자 마이그레이션을 명시한다.

해결 기준:

- 7개 역할의 입력·출력 필드가 문서, Pydantic, BE decoder에서 일치한다.
- Interpreter 중첩 enum·길이 상한이 manifest, Pydantic, BE decoder에서 일치한다.
- trace의 attempt 배열·schema 재시도 상호 불변식이 manifest, Pydantic, BE decoder에서 일치한다.
- 문서에만 있거나 코드에만 있는 공개 계약 필드가 없다.
- 계약 변경 PR에서 문서 또는 생성 artifact 변경이 누락되면 검증이 실패한다.

### Phase 4. 중복 제거와 route 정리

대상: AIR-08, AIR-09, AIR-10

#### 5.19 역할 공통 실행기

변경 대상:

- `ai/app/services/role_runner.py`
- `ai/app/services/provider_execution.py`
- `ai/app/services/harness.py`
- `ai/app/services/*/service.py`
- `ai/app/services/smoke_runner.py`

해결 방식:

`provider_execution`과 `AiRoleRunner`가 다음 공통 흐름을 분담한다.

1. 총 deadline 시작
2. 캐시된 system prompt와 정제 schema 조회
3. provider 호출과 retry/backoff
4. Pydantic parse와 역할별 후처리 callback
5. 성공/fallback trace와 공통 response metadata 조립
6. 진단 로그 기록
7. 내부 role route의 실패 trace 기록과 구조화 HTTP 오류 변환

역할별 service는 다음만 남긴다.

- request에서 user prompt 만들기
- 사용할 출력 model 지정
- Interpreter contract, Actor allowed action, Director normalize 같은 역할별 의미 검증
- 역할별 fallback template 지정

system prompt는 서비스 생성 시 한 번 읽고, Pydantic JSON schema와 provider용 정제 schema도 역할·조건별로 캐시한다. Interpreter의 transition candidate 유무에 따른 두 schema variant는 별도 cache key를 사용한다.

해결 기준:

- 개별 역할 service에 provider retry loop가 남지 않는다.
- prompt 파일은 프로세스 기동 또는 최초 사용 시 한 번만 읽힌다.
- 동일 역할·schema variant의 provider용 schema 정제는 한 번만 수행된다.
- 기존 역할별 parsed response와 의미 검증 결과가 유지된다.
- role 추가 시 공통 timeout/retry/logging 코드를 복사하지 않는다.
- role route 추가 시 `try/log/as_dict/HTTPException` 오류 경계를 복사하지 않는다.

#### 5.20 `check_result` 설정 분리

변경 대상:

- `ai/app/core/config.py`
- `.env.example`
- `ai/app/services/check_result/service.py`
- `ai/README.md`

해결 방식:

- `AI_MODEL_CHECK_RESULT`와 `AI_TEMPERATURE_CHECK_RESULT`를 추가한다.
- 값이 없으면 기존 동작과 호환되도록 narrator 설정, 그다음 default 모델 순으로 fallback한다.
- trace role과 prompt version은 계속 `check_result`로 기록한다.

해결 기준:

- 전용 설정이 있으면 check result 호출에만 적용된다.
- 전용 설정이 없으면 기존 narrator 기반 설정과 같은 결과를 낸다.
- 다른 역할의 모델 선택에는 영향이 없다.

#### 5.21 route와 잔여 코드 정리

변경 대상:

- `ai/app/api/routes/harness.py`
- `ai/app/api/routes/session_ai.py`
- `ai/app/main.py`
- `ai/README.md`
- Nginx와 백엔드 실제 호출 경로

해결 방식:

1. 중복 import를 제거한다.
2. 제품 API는 백엔드가 소유하고 AI 서버는 `/internal/ai/*`만 소유한다는 경계를 확정한다.
3. 소비자가 없는 것이 확인되면 AI 서버의 `/api/v1/sessions/*` 호환 route를 제거한다.
4. 즉시 제거하기 어렵다면 deprecated 표시와 제거 시점을 문서화한다.
5. Nginx `/ai/` proxy가 실제 FastAPI route와 일치하는지 확인하고, 필요 없다면 외부 proxy를 제거한다.

해결 기준:

- 동일 제품 기능을 제공하는 공개 route 소유자는 백엔드 하나다.
- 백엔드의 모든 AI 호출은 `/internal/ai/*` 계약으로 통과한다.
- 삭제 또는 deprecated route의 소비자 검색 결과와 마이그레이션 근거가 남는다.
- 문서의 API 목록이 실제 등록 route와 일치한다.

## 6. 변경 파일 지도

| 영역 | 주요 파일 | 역할 |
| --- | --- | --- |
| 공급자 client | `ai/app/clients/google_ai_studio.py` | native timeout, 오류 분류, provider 호출 |
| 설정 | `ai/app/core/config.py`, `.env.example` | 총시간, 로그 보존, check result 설정 |
| 공통 실행 | `ai/app/services/provider_execution.py`, `ai/app/services/role_runner.py` | deadline, retry, 검증, latency, fallback, response 조립·기록 |
| fallback | `ai/app/services/fallback_policy.py`, `fallback_response_factory.py` | 오류별 fallback 결정 |
| 역할 service | `ai/app/services/*/service.py` | provider projection, prompt, 역할별 의미 검증 |
| 역할 prompt | `ai/app/prompts/*.v1.md` | 의도별 최소 지침과 확정 사실 우선순위 |
| health | `ai/app/api/routes/health.py`, `docker-compose.yml` | live/ready와 배포 gate |
| trace | `response_logger.py`, `trace_service.py` | 회전, 최소 기록, bounded query |
| DTO | `ai/app/schemas/*`, `shared-types`, `be/src/modules/ai/ai.client.ts` | 크기 제한, 최소 출력, trace와 usage 필드 |
| 백엔드 AI 경계 | `be/src/modules/ai/ai.client.ts`, `ai.service.ts` | retry 제거, 구조화 입력, 총 latency·token usage 저장 |
| Main Command 문맥 | `be/src/modules/actions/main-command-*.service.ts` | hint fact, selected ID, summary 범위, reward fact 확정 |
| DB trace | `be/prisma/schema.prisma`와 관련 migration | token usage와 단일 metadata source 저장 |
| 문서 | `ai/README.md`, `ai/AI_STUDIO_IO_FIELD_REFERENCE.md`, `doc/rules/AI_RUNTIME_RULES.md`, `doc/structure/AI_RUNTIME_CONTRACTS.md` | 운영·provider projection·계약 최신화 |

## 7. 검증 계획

저장소 지침에 따라 구현 담당 에이전트는 테스트를 임의로 실행하지 않는다. 아래 테스트는 사용자가 실행하고 결과를 완료 증거에 기록한다.

### 7.1 필수 자동 테스트

| 검증 항목 | 추가할 테스트 | 통과 기준 |
| --- | --- | --- |
| 실제 timeout | 반환하지 않는 fake provider | 총시간 상한 안에 fallback, background 작업 0 |
| retry 횟수 | 1회 실패 후 성공, 계속 실패 | 호출 횟수 각각 2회, 2회 초과 없음 |
| 429/quota | provider 429·quota 오류 | retry 0회, template fallback |
| provider 요청·설정 4xx | provider 400·404·409와 인증 401·403 | retry 0회, 역할 template fallback, smoke 502/503, 제품 호출자 401/403 비노출 |
| config/auth | API 키 누락·인증 실패 | role fallback, smoke 구조화 오류, readiness 503 |
| health | live/ready 조합 | 설정 누락 live 200/ready 503, 정상 설정 모두 200 |
| trace 손상 | 마지막 JSONL 반쪽 쓰기 | 정상 행 반환, malformed count 증가 |
| trace scale | 1/1,000/100,000행 | 읽은 행 수와 메모리가 전체 파일 크기에 선형 증가하지 않음 |
| prompt limit | 경계값과 1자 초과 | 경계값 허용, 초과 422, provider 미호출 |
| latency | 실패 후 성공 fake clock | total과 attempt latency가 계산값과 일치 |
| role 공통화 | 7개 role 회귀 | parsed response, fallback, 의미 검증 유지 |
| SRD 회귀 | 기존 retrieval suite | 결과 ID, 순서, limit 변화 없음 |
| Narrator 신뢰 경계 | player text와 확정 결과가 충돌하는 fixture | 확정 결과만 반영, tone과 구조화 필드 중복 없음 |
| Director hint 보존 | 공개 단서 0개·event hint 1개 | event hint가 provider prompt에 포함되고 hidden fact는 제외 |
| 명시적 spell ID | 주문명 없는 text와 유효·무효 spell ID | 유효 ID 유지, 무효 ID provider 미호출 |
| Summary 범위 | 로그 50개와 `lastLogCount=12` | provider가 받는 로그가 정확히 12개 |
| Check Result 사실 제한 | 허용 사실 0개·1개 | 0개에서는 새 사실 없음, 1개에서는 허용 사실만 사용 |
| 동적 길이 | role별 최소·최대·1자 초과 | 정상과 fallback 모두 요청별 maxLength 이하 |
| prompt projection | 역할·의도별 prompt snapshot | metadata, 중복 ID, 무관한 SRD, `null` key 없음 |
| 최소 출력 | 7개 역할 provider schema snapshot | 실제 소비 필드와 조건부 필드만 존재 |
| token usage | usage가 있는 응답과 없는 mock/fallback | 있는 경우 정확히 저장, 없는 경우 호환 유지 |
| token budget | provider usage가 있는 대표 역할·의도 fixture 전후 비교 | 실제 Google·동일 model·동일 재계산 fixture set에서 전체 입력 30% 이상, known-intent Interpreter 40% 이상, GENERAL Interpreter 20% 이상 감소하고 baseline·after 모든 의미 assertion 통과 |
| 계약 동기화 | Pydantic·BE decoder·contract manifest 비교 | 문서/코드 단독 필드 0개 |

사용자 실행 명령:

```powershell
cd C:\WORK\online-TRPG\ai
python -m pytest app\tests\test_provider_execution.py app\tests\test_google_ai_studio_client.py app\tests\test_fallback_policy.py app\tests\test_response_logger.py app\tests\test_harness_service.py app\tests\test_internal_ai_routes.py app\tests\test_session_ai_routes.py -q
python -m pytest app\tests\test_srd_retrieval.py app\tests\test_srd_retrieval_index.py -q
```

계약 최소화 구현 후 추가할 테스트 모듈의 사용자 실행 예시:

```powershell
cd C:\WORK\online-TRPG\ai
python -m pytest app\tests\test_ai_contract_projection.py app\tests\test_role_output_contracts.py app\tests\test_prompt_token_budget.py app\tests\test_capture_ai_role_token_usage.py app\tests\test_compare_ai_token_usage.py -q
```

백엔드 retry와 trace 계약 변경 후 사용자 실행 명령:

```powershell
cd C:\WORK\online-TRPG\be
npm test -- --runInBand src/modules/ai/ai.client.spec.ts src/modules/ai/ai.service.spec.ts
npm test -- --runInBand src/modules/actions/main-command-ai-context-window.spec.ts src/modules/actions/main-command-progress-evidence.service.spec.ts src/modules/actions/main-commands.service.spec.ts
```

실제 Google AI Studio 통신 테스트는 사용량이 발생하므로 별도 승인 후 사용자만 실행한다.

```powershell
cd C:\WORK\online-TRPG\ai
python -m pytest app\tests\test_live_google_ai_studio.py -q
```

전체 역할 token budget은 동작을 바꾸지 않는 usage 계측이 적용된 변경 전 서버와 현재 서버를 각각 실행한 뒤 동일 fixture로 캡처한다. 캡처 명령 자체가 실제 Google 사용량을 발생시키므로 사용자만 실행한다.

```powershell
cd C:\WORK\online-TRPG\ai
python scripts\capture_ai_role_token_usage.py --base-url http://127.0.0.1:8001 --label before --model gemma-4-31b-it --repeat 3 --out runtime_logs\ai_token_before.jsonl
python scripts\capture_ai_role_token_usage.py --base-url http://127.0.0.1:8002 --label after --model gemma-4-31b-it --repeat 3 --out runtime_logs\ai_token_after.jsonl
python scripts\compare_ai_token_usage.py --before runtime_logs\ai_token_before.jsonl --after runtime_logs\ai_token_after.jsonl --before-mode before --after-mode after --out runtime_logs\ai_token_comparison.json
```

비교기는 canonical fixture·각 행 identity에서 재계산한 fixture set SHA-256, 선언된 사례 수와 반복 횟수, 반복별 완전성, 7개 운영 역할, request intent·모델·provider 불일치를 거부한다. 완료 모드는 실제 `google-ai-studio`만 허용하고 baseline·after 전 행의 비어 있지 않은 의미 품질 assertion 통과를 요구한다. 중단되거나 일부 역할만 담긴 캡처는 완료 증거가 아니다. 진단용 `--allow-partial-roles` 결과도 완료 판정에 사용하지 않는다. `measure_interpreter_harness.py --mode before`는 현재 prompt 연구 경로이므로 변경 전 완료 baseline으로 사용하지 않는다.

### 7.2 수동 운영 검증

1. API 키 없이 Docker Compose를 시작해 AI container가 `unhealthy`, live endpoint는 200인지 확인한다.
2. 유효한 API 키로 재기동해 readiness가 200인지 확인한다.
3. fake provider에 timeout, 429, 500을 주입해 플레이 흐름이 30초 안에 fallback으로 이어지는지 확인한다.
4. 동시에 여러 AI 요청을 보내 timeout 뒤 thread/future 수가 증가한 채 남지 않는지 확인한다.
5. 로그 회전 한도를 넘긴 뒤 파일 수와 총 byte가 설정 범위인지 확인한다.
6. backend `AiTrace`에 attempts, total latency, fallback type이 실제 호출과 맞는지 확인한다.
7. 대표 플레이 시나리오에서 Google 요청 캡처를 비교해 추적 metadata, 중복 target ID, 무관한 SRD 문맥이 제거됐는지 확인한다.
8. 역할별 input/output token p50/p95와 schema 계측 표본 수·retry율을 변경 전후 비교한다.
9. Narrator, Director, Summarizer, Check Result 결과가 백엔드 확정 사실과 허용 범위를 벗어나지 않는지 확인한다.

## 8. 전체 완료 기준

다음 조건을 모두 만족해야 계획을 완료로 판정한다.

- AIR-01~AIR-03의 안정성 P1 항목, 직접 의존 항목 AIR-04, 데이터 정합성 P1 항목 AIR-11~AIR-16이 구현되고 필수 자동·수동 검증 증거가 있다.
- 모든 role 요청이 설정된 총시간 안에 성공 또는 fallback으로 종료한다.
- 정상 1회, 최대 2회라는 provider 호출 상한이 테스트로 고정된다.
- rate limit, quota, timeout, network, provider 5xx, config/auth 오류의 처리 결과가 문서와 테스트에서 일치한다.
- readiness가 잘못된 설정을 healthy로 통과시키지 않는다.
- trace 저장 용량과 조회량에 명시적 상한이 있다.
- 역할별 최종 prompt 크기에 명시적 상한이 있다.
- Google AI Studio prompt에 추적 metadata, 중복 대상 ID, 무관한 SRD·engine hook, 의미 없는 `null` 필드가 없다.
- 플레이어 원문과 백엔드 확정 사실의 신뢰 경계가 역할 계약과 검증 코드에 반영된다.
- 명시적으로 선택된 유효 ID가 자연어 검색 결과 때문에 거부되지 않는다.
- Summarizer가 요청 범위보다 많은 로그를 provider에 전달하지 않는다.
- Check Result가 허용 사실 밖의 정보 보상을 생성하지 않는다.
- 모든 역할의 동적 출력 길이가 요청별 제한을 만족한다.
- provider output schema는 제품이 실제 소비하는 최소 필드만 요구한다.
- 역할별 input/output/total token usage와 schema 계측 표본 수·retry율을 측정할 수 있다. provider 출력 검증이 시작되지 않은 local/config/auth/rate-limit/network/timeout 실패와 BE fallback은 retry율 분모에서 제외한다.
- 대표 fixture 입력 토큰 합계가 변경 전보다 최소 30% 감소하며 기존 의미 검증 결과가 유지된다.
- backend 품질 지표가 전체 AI 처리 지연을 기록한다.
- 역할별 provider 실행 중복이 제거되고 기존 역할 의미 검증이 유지된다.
- AI·BE DTO와 `AI_RUNTIME_CONTRACTS.md`, `AI_RUNTIME_RULES.md`, `ai/README.md`가 실제 코드와 일치한다.
- 사용자 승인 아래 실행한 회귀 테스트 결과와 운영 검증 결과가 별도 evidence 문서에 기록된다.

정적 구현만 끝난 상태는 완료가 아니다. 동적 검증을 실행하지 않은 항목은 “구현 완료·검증 대기”로 표시한다.

## 9. 배포와 롤백

### 배포 순서

1. token usage와 신규 trace 필드, 구조화 Narrator·reward fact 입력을 optional로 추가한다.
2. AI 서버가 레거시와 신규 입력을 모두 수용하는 동안 백엔드 호출을 구조화 계약으로 전환한다.
3. AIR-11~AIR-16의 데이터 정합성 변경과 요청별 출력 검증을 배포하고 동적 검증 결과를 확인한다.
4. 의도별 Interpreter projection과 compact prompt를 feature flag 또는 prompt version 단위로 전환한다.
5. 백엔드 소비처가 최소 출력 decoder로 전환된 뒤 provider output schema에서 미사용 필드를 제거한다.
6. AI 서버 timeout/fallback/readiness를 배포하고 검증한 뒤 백엔드의 AI POST 자동 retry를 제거한다.
7. 공통 응답·로그 최소화·회전과 route 정리를 적용한다.
8. 안정화 후 레거시 입력·출력 필드와 deprecated session route를 제거한다.

### 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| provider native timeout이 현재 SDK에서 충분한 취소를 지원하지 않음 | SDK transport 계층을 확인하고, 불가능하면 취소 가능한 HTTP client adapter를 별도 구현 |
| 백엔드 retry 제거 후 일시적 AI 서버 연결 실패가 더 자주 보임 | 기존 BE default fallback 유지, 연결 실패율을 `AiTrace`로 관찰 |
| prompt 제한으로 정상 긴 입력이 거절됨 | 경계 fixture를 먼저 수집하고, 필수값 보존 축약을 적용한 뒤 상한 확정 |
| prompt 축소로 모델 분류·추출 품질이 낮아짐 | 역할·의도별 golden fixture, 의미 검증 실패율, clarification 비율을 비교하고 prompt version 단위로 롤백 |
| 최소 출력 제거 전에 숨은 소비자가 존재함 | BE·FE·DB 전역 소비자 검색과 optional decoder 호환 기간을 둔 뒤 제거 |
| 구조화 Narrator 전환 중 레거시 호출이 남음 | dual-read 기간에 레거시 사용 metric을 기록하고 0이 된 뒤 필드 제거 |
| token usage 필드가 모델·SDK별로 다름 | optional decoder와 provider adapter로 정규화하고 없는 응답은 null로 유지 |
| provider schema 제약 강화가 Google 400을 유발함 | 현재 고정 SDK·모델별 contract test를 먼저 수행하고 지원되는 최소 schema만 전송 |
| 로그 최소화로 장애 분석 정보가 부족함 | trace ID, 오류 분류, attempts, latency는 항상 보존하고 payload 전문만 환경별 제어 |
| 공통 runner 리팩터링이 역할별 검증을 누락함 | Interpreter/Actor/Director의 의미 검증을 callback으로 유지하고 역할별 회귀를 먼저 고정 |

롤백 시에는 backend retry를 먼저 되살리지 않는다. AI 서버 이전 버전으로 되돌려야 한다면 backend가 기존 BE fallback을 유지한 상태에서 AI 서버만 롤백해 중복 provider 호출을 피한다. 계약 축소는 prompt version과 optional decoder 단위로 되돌리고, 이미 제거한 레거시 필드를 급히 복구하는 대신 호환 adapter를 한시적으로 사용한다.

## 10. 문서 생명주기

- 구현 중에는 이 문서를 `doc` 루트의 현재 계획으로 유지한다.
- 검증 결과는 `doc/dev-notes/AI_SERVER_REMEDIATION_ACCEPTANCE_EVIDENCE.md`에 기록한다. 역할·의도별 prompt bytes/token p50/p95, schema 계측 표본 수·retry율, 의미 검증 실패율의 변경 전후 표를 포함한다.
- 전체 완료 기준을 충족하면 이 문서를 `doc/completed/ai_server_reliability_remediation_plan.md`로 이동한다.
- 완료 후 남은 항목은 `doc/PENDING_WORK_ITEMS.md`에 옮기고 현재 계획에서는 제거한다.
