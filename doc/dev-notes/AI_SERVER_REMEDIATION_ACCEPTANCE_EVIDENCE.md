# AI 서버 개선 검증 증거

기준 계획: `doc/completed/ai_server_reliability_remediation_plan.md`

상태: 완료. 2026-07-29 현재 AI 전체 276건, 백엔드 전체 1,182건, 직접 영향 범위 96건과 빌드·계약 정적 검증은 통과했다. 실제 Google 동일 fixture 24회 재측정, 느린 provider wall-clock/fallback과 오류 주입, `AiService` 경유 격리 DB usage 집계도 통과했다. 2026-07-30에는 Docker container health와 로컬 `online_trpg/public` migration·usage 집계를 검증했다. 2026-07-31에는 실제 Compose 배포와 사용자가 지정한 `localhost:5173` 개발 배포에서 NestJS→FastAPI→Google→PostgreSQL 전체 traffic, 인증·멤버십 경계, FastAPI 내부 route 차단까지 통과했다.

이 문서는 AIR-01~AIR-24 구현 결과, 로컬 자동 검증, 과거 Google 실측과 아직 확보하지 않은 외부·운영 증거를 분리한다. 2026-07-29 재감사에서 provider 4xx/auth/config 분류, 설정 축소 뒤 로그 상한 복구, 진단 I/O latency, 중첩 DTO와 AI/BE trace metadata 상한, Check Result exact allowlist, 내부 parsed 최소 계약과 공유 출력 manifest를 교정했다. 이어 연속 provider 출력 검증 실패를 `2`회 재시도로 잘못 기록해 fallback trace 계약을 깨뜨릴 수 있던 계수를 실제 후속 attempt 기준 `0..1`로 교정했다. 교정 후 AI·백엔드 전체 로컬 회귀와 빌드를 다시 실행했으며 결과는 2절에 기록한다.

## 1. 구현 증거

| 범위 | 반영 내용 | 주요 위치 |
| --- | --- | --- |
| AIR-01, 04, 07, 08 | role runner 진입부터 시작하는 단일 monotonic deadline, prompt/SRD 전처리 포함 latency, 남은 시간의 동기 SDK native timeout 전달, SDK 내부 retry 명시적 비활성화, AI 서버 단일 retry 책임, backoff/jitter, 전체·시도별 지연, 명시된 attempt latency 배열 길이와 attempts 일치·schema 재시도 상한의 AI/BE 이중 검증, 공통 응답 조립, 내부 role route의 공통 실패 trace·HTTP 오류 변환, prompt/Pydantic schema/Google 호환 schema variant 캐시 | `ai/app/services/role_runner.py`, `ai/app/services/provider_execution.py`, `ai/app/api/routes/harness.py`, `ai/app/clients/google_ai_studio.py`, `be/src/modules/ai/ai.client.ts` |
| AIR-02, 03 | live/ready 분리, 설정 불량 503, secret 없는 시작 진단 로그, SDK timeout/retry/structured-output 필드 capability 검사, 429/quota/auth/config/provider-request fallback, provider 401/403 비노출, 400/404/409 비재시도 분류 | `ai/app/main.py`, `ai/app/api/routes/health.py`, `ai/app/clients/google_ai_studio.py`, `ai/app/services/fallback_policy.py`, `docker-compose.yml` |
| AIR-05, 06 | 파일당 byte 상한과 `maxBytes * (backupCount + 1)` history 총량 상한, 설정 축소 뒤 남은 과대 history/latest·초과 backup의 첫 기록 시 정리, 단일 oversized event 축약, 회전 파일 포함 역방향 chunk 조회와 요청 size 충족 시 중단, 손상 행 계수, 로깅 I/O·직렬화 실패 격리, payload 기본 비활성, AI·BE 오류문 1,000자 제한과 BE 단일행화, 모든 문자열 배열의 개수·원소 길이 상한, 구조화 중첩 요청의 extra 거부, 전체 prompt byte 상한, BE→AI 역할별 수량·요소 길이 선축약 | `ai/app/core/response_logger.py`, `ai/app/services/trace_service.py`, `be/src/modules/ai/ai.service.ts`, `be/src/modules/actions/main-command-interpreter-payload.service.ts`, `ai/app/schemas/*`, `shared-types/src/dto/api/ai.dto.ts` |
| AIR-09, 10 | Check Result 전용 모델/temperature, 중복 AI 세션 route와 외부 Nginx `/ai/` proxy 제거 | `ai/app/core/config.py`, `ai/app/main.py`, `ai/app/api/routes/`, `infra/nginx/default*.conf` |
| AIR-11~16 | 구조화 Narrator 입력과 GM/HOST 권한, 구조화 제품 호출의 player `rawInput`·legacy summary/tone transport 제거와 legacy-only optional dual-read, 직접 Hint/Summary/NPC API의 GM/JOINED 권한과 player `SERVER_VALIDATED` main-command 경계, event hint 보존, 명시 주문/아이템 조회, 서버 저장 확정 narration 기반 summary와 레거시 client log 무시, 미지원 hidden/node 범위 선거부, 실제 로그 slice, reward allowlist, 사회·감정 읽기 성공의 허용 사실 0개 시 provider 미호출, 미사용 `rewardInfo` 응답 제거, 동적 출력 길이 검증 | `be/src/modules/ai/ai.service.ts`, `be/src/modules/turn-logs/turn-logs.service.ts`, `be/src/modules/actions/main-command-*.ts`, `ai/app/schemas/harness.py`, `ai/app/services/*` |
| AIR-17, 18, 20 | known-intent extraction prompt, 미지원 고정 intent provider 전 422, 의도별 SRD 조회, compact JSON, null/추적 metadata 제거, target/spell/item ID를 각 canonical 구조 한 곳에만 두는 선택 projection, 선택 target을 보존하는 50/12개 대상 projection, player 원문·중복 clue·불필요한 summary/NPC transport 필드 제거 | `ai/app/prompts/interpreter.extract.v1.md`, `ai/app/services/interpreter/service.py`, `be/src/modules/actions/main-command-interpreter-payload.service.ts`, 역할별 service |
| AIR-19, 23 | 역할별 최소 provider output model과 동일하게 축소한 내부 AI→BE parsed transport, 공개 `/api/v1` 호환 필드의 BE 결정적 보강, 제거 필드·빈 필수 생성 문자열·과대 중첩 문자열·미계약 Interpreter enum을 거부하는 BE decoder, known-intent type/confidence 서버 보강, 지원되는 enum·숫자·배열 제약 유지, 장면 전환 `requirements[]`까지 중첩 `extra=forbid`, 비전환 schema의 전환 `$defs` 제거, 서버 의미 검증 유지 | `ai/app/schemas/*`, `ai/app/services/*`, `be/src/modules/ai/ai.client.ts`, `be/src/modules/ai/ai.service.ts` |
| AIR-21, 22 | 역할 transport를 `{parsed, fallback, fallbackReason, trace}`로 축소하고 제거된 top-level/trace/parsed 필드를 거부하는 BE decoder, top-level metadata·`rawOutput`·컨테이너 `logPaths` 제거, raw output은 명시적 진단 파일 로그에만 보존, DB request/response 중복 축소, usage의 bool·음수·DB Int 초과값 null 정규화와 provider 진단 문자열 상한, 실제로 시작된 후속 schema attempt만 세는 `schemaValidationRetries=0..1`, 전용 복합 index를 둔 `kind+promptVersion+model`별 token/latency p50·p95와 schema 계측 표본 수·retry율, 7개 역할 공통 token capture와 fixture fingerprint 비교 | `ai/app/clients/google_ai_studio.py`, `ai/app/services/provider_execution.py`, `ai/app/schemas/harness.py`, `ai/app/services/role_runner.py`, `ai/scripts/capture_ai_role_token_usage.py`, `ai/scripts/compare_ai_token_usage.py`, `be/prisma/schema.prisma`, 신규 migration, `be/src/modules/ai/ai.client.ts`, `be/src/modules/ai/ai.service.ts` |
| AIR-24 | 내부·provider 출력의 공유 machine-readable manifest에 필드와 Interpreter 중첩 enum·길이 상한 추가, Pydantic·조건부 provider schema·BE decoder runtime allowlist/상수 비교 명세, provider 입력 projection 문서·테스트 갱신 | `ai/contracts/internal_ai_contract_v1.json`, `ai/AI_STUDIO_IO_FIELD_REFERENCE.md`, `doc/structure/AI_RUNTIME_CONTRACTS.md`, `ai/app/tests/test_role_output_contracts.py`, `be/src/modules/ai/ai.client.spec.ts` |

### 1.1 AIR별 완료 감사

`정적 구현`은 현재 소스에서 구현 경로를 확인했다는 뜻이다. 아래 표의 남은 완료 증거 중 로컬 자동화 가능한 범위는 2절의 테스트로 검증했으며, 실호출·배포·변경 전후 수치가 필요한 항목은 계속 미완료다.

| ID | 현재 판정 | 정적 근거 | 검증 범위 |
| --- | --- | --- | --- |
| AIR-01 | 동적 통과 | monotonic 총 deadline, 남은 SDK timeout, 늦은 결과 폐기 | 실제 1초 wall-clock에서 fallback 1회·신규 worker 0 확인 |
| AIR-02 | 로컬 container 동적 통과 | live/ready 분리, key·SDK capability 검사, Compose ready healthcheck | 유효 key compose container `healthy`, 공백 key 격리 container live 200/ready 503 확인 |
| AIR-03 | 오류 주입 통과 | 429/quota/auth/config/provider-request 분류, provider 401/403의 503 정규화, 400/404/409 비재시도 fallback | 400/404/409/401/403/408/429/quota/network/500 통합 fixture에서 분류·상태·호출 횟수·fallback 확인 |
| AIR-04 | 로컬 동적 통과 | BE AI POST retry 제거, AI 최대 retry 1 제한 | 통합 오류 주입에서 비재시도 1회, timeout/network/5xx 최대 2회 확인 |
| AIR-05 | 로컬 동적 통과 | 파일당 상한, 설정 축소 시 과대·초과 기존 파일 정리, 현재+회전본 history 총량 공식, 전체 byte 상한 tail scan, JSON·schema 손상 행 skip와 계수 | 실제 임시 파일 300행 회전, oversized event, 설정 축소 복구, 100,000행 tail scan 통과 |
| AIR-06 | 회귀 통과 | 모든 schema 문자열 배열의 개수·원소 길이 상한, trace 배열 상한, 구조화 action/판정/dice/state/scene/allowed-action의 extra 거부, 역할별 projection·최신 window·`lastLogCount` 선축약, prompt+system+schema byte 상한 | 교정 후 경계값 422·provider 미호출·중첩 extra 거부 |
| AIR-07 | 로컬 wall-clock·격리 DB 통과 | 전체·provider·시도별 latency 분리, 명시된 attempt latency 배열과 attempts 길이 일치 및 schema retry≤후속 attempt 불변식, 정상/fallback/오류 반환에 진단 로그 I/O까지 반영, BE elapsed DB 기록, 파일 trace는 pre-write 진단 snapshot으로 비제품화 | 실제 1초 wall-clock fallback과 `AiService` 경유 67ms 전체/37ms provider latency DB 대조 통과 |
| AIR-08 | 회귀 통과 | 공통 provider execution, role runner, 내부 route 실패 경계, prompt/Pydantic/Google schema cache | 교정 후 7개 역할·route 회귀 |
| AIR-09 | 정적 구현 | Check Result 모델·temperature 분리와 fallback 순서 | 설정 조합별 선택 결과 |
| AIR-10 | 로컬 배포 동적 통과 | 중복 session AI route 및 외부 `/ai/` proxy 제거, internal route 단일화, FastAPI router와 `ai/README.md` 내부 route 목록 자동 비교, Nginx와 Vite의 `/ai/`·`/internal/ai/` 명시적 404 | Compose와 `localhost:5173`에서 외부 두 경로 404, backend/AI Compose host port 미공개, BE container의 internal health 200 확인 |
| AIR-11 | 회귀·실 traffic 통과 | 구조화 Narrator 확정 입력, 공개 DTO의 필수 `action`·`scene` 런타임 검증, 제품 BE→AI transport와 provider prompt에서 player `rawInput` 제거, legacy-only 선택 입력 유지 | 교정 후 누락 필드 4xx·AI 미호출, 충돌 fixture에서 확정 사실 우선과 structured payload 캡처 |
| AIR-12 | 정적 구현 | event hint와 공개 단서 합성 전달 | 공개/비공개 단서 fixture |
| AIR-13 | 회귀 통과 | 명시 spell·SRD magic item ID 직접 조회, 미조회 canonical ID와 비가시 target ID는 provider 0회 422, 일반 inventory entry ID는 prompt에서 제외, 명시 target/spell/item output echo 제거와 서버 보강, self target 허용 | 교정 후 유효·무효 ID 호출 횟수, parsed ID 보존과 backend inventory 소유권 검증 |
| AIR-14 | 회귀 통과 | 외부 client `logs` 무시 후 서버 저장 narration 조회, 현재 모든 `TurnLog.narration`이 player-facing이라는 쓰기 계약만 사용하고 별도 visibility를 추정하지 않음, player main-command의 혼합 `rawInput => narration`을 `trustedLogs`로 승격하지 않고 동일 DB 조회 경로 사용, 내부 server-owned `trustedLogs`, RECENT 최신 `lastLogCount` slice, FULL 50개 이하 전체 선택·51개 이상 선거부, 로그 요소 2,000자 상한, Google prompt에서 range/count 제거, metadata 없는 hidden/SINCE_NODE 선거부 | 교정 후 50개 로그→정확한 N개 캡처, client/main-command raw input 주입 차단, visibility/FULL fixture |
| AIR-15 | 회귀 통과 | reward allowlist, player 원문·중복 `publicClues` 제거, 사회·감정 읽기 성공의 allowlist 0개면 provider 미호출, 민감한 성공은 action/target summary/disposition/scene/visible entity를 BE→AI 및 Google prompt에서 제외, 모델 narration에서 정확히 복사된 허용 사실 한 항목만 AI 서버가 남기고 BE가 exact allowlist 일치를 재검증, 미일치 시 BE 결정적 fallback, provider/제품 응답의 미사용 `rewardInfo` 제거 | 교정 후 허용 사실 0/1개·추가 주장 주입 생성 결과와 AI/BE 계약 회귀 |
| AIR-16 | 정적 구현 | Narrator/NPC 요청별 길이 사후 검증과 fallback 절단 | 최소·최대·초과 fixture |
| AIR-17 | 로컬·Google 실측 통과 | known-intent extraction prompt/schema, 서버 type/confidence 보강, 미지원 고정 intent provider 전 422 | provider 미호출 fixture와 known-intent prompt token 86.70% 절감 확인 |
| AIR-18 | 회귀·Google 실측 통과 | 의도별 SRD 조회, null 제거, target/spell/item 선택 ID를 canonical 구조 한 곳에만 유지, 허용 target ID 밖의 상세정보와 백엔드 전용 transition evidence 제외, 모든 recent context 최신 N개 선택 | 교정 후 역할·의도별 prompt 캡처와 token 재측정 |
| AIR-19 | 회귀·Google 실측 통과 | 최소 provider model, 내부 parsed도 실제 BE 소비 필드로 축소, 공개 v1 파생 필드는 BE가 요청에서 보강하고 `visibleSummary`는 300자·종결 문장부호 규칙으로 결정적 파생해 마지막 글자 손실 방지, 제거된 내부 필드는 decoder가 거절, Interpreter prompt도 active schema에서 제거된 선택 ID echo 생성을 요구하지 않음, HINT/비전환 조건부 필드와 미계약 extra 출력 거절, 제품 소비자 0인 Actor는 진단 전용으로 격리하고 internal v2 제거 게이트 명시 | 교정 후 역할·mode별 schema/transport snapshot, 공개 v1 호환 응답, 출력·network/DB byte 감소 회귀, 배포 Actor consumer inventory |
| AIR-20 | 회귀·Google 실측 통과 | 7개 역할 projection 검증 명세, Narrator player 원문, 추적·actor·audience·불투명 action/item ID와 Check Result 원문/중복 clue 제외, Interpreter 허용 목록 밖 상세 대상과 flags·미공개 단서·현재 노드 transition evidence 제외, Actor의 빈 condition·미확정 `hpStatus="unknown"` 제외 | 교정 후 7개 역할 projection 테스트 실행 |
| AIR-21 | 실제 BE traffic·DB 통과 | 역할 transport 단일 `trace`, raw/top-level metadata 제거, 상대 `diagnosticRef`, DB 최소 JSON | Compose 실호출 DB에서 request는 `sessionId`만, response는 parsed/fallback/fallbackReason만 저장됨을 확인 |
| AIR-22 | 로컬·Google·실제 BE traffic·DB 통과 | Google usage의 비음수 32-bit 정규화와 부분 metadata의 필드별 독립 보존, 진단 metadata 길이 상한, DB 컬럼, `kind+promptVersion+model`별 p50/p95와 prompt/output/total별 실제 표본 수, 하위 호환 total 표본 alias, schema 무표본 retry율 null 및 역할/전체 무표본 운영 목표 미달성 처리, provider 출력 검증이 시작된 trace만 schema retry 분모에 포함하고 실제 provider 호출까지 도달한 후속 attempt만 `0..1`로 계수하며 local/config preflight 실패는 제외하고 `schemaValidationRetries≤max(0, attempts-1)`을 양쪽 계약에서 강제하고 출력 전 장애·BE fallback은 null 처리, token 완료 비교에서 행 identity 기반 set SHA 재계산·Google provider·동일 model·baseline/after 전 품질 통과 강제 | 실제 모델 24행 usage, 전체·known·general 절감 gate, 역할별 DB p50/p95와 null 표본 제외 확인. 로컬 `public` migration 적용·집계와 격리 DB write/read/rollback에 더해 Compose BE→Google 실호출의 342/39/381 token 및 provider 2,092ms 적재 확인 |
| AIR-23 | 회귀·Google 실측 통과 | enum/수치/배열 제약 보존, Google 비지원 키만 제거, 중첩 provider object strict validation과 조건부 미사용 `$defs` 제거, 모든 역할 필수 생성 문자열의 비어 있지 않음·최대 길이와 Interpreter 중첩 enum·문자열 상한을 BE decoder에서도 재검증 | 교정 후 role output contract test와 고정 SDK·모델 structured output |
| AIR-24 | 회귀·배포 통과 | 공유 `internal_ai_contract_v1.json`에 내부 envelope/trace 필드와 상호 불변식/7개 역할 parsed/Interpreter 중첩과 enum·길이 제약/provider 최소 출력/Director 조건부 출력을 고정하고 Pydantic·실제 provider schema·BE decoder allowlist·runtime 상수·출력 타입·provider 필드 표·README 내부 route 목록 비교 명세 추가, `AI_REQUEST_INVENTORY.md`도 내부 transport와 Google projection을 분리해 실제 필드·Actor 무소비 상태·조건부 출력을 반영, provider 입력 projection은 실제 compact prompt 테스트로 분리, BE/AI 문맥 요소 1,000자 상한 정렬, 내부 역할 요청과 구조화 중첩 객체 `extra=forbid`, AI/BE trace의 attempt·문자열·32-bit usage 상한 정렬, `/api/v2`·`internal-ai-contract-v2` 제거 버전과 소비자 gate 명시 | 교정 후 Python·BE 계약 테스트, consumer inventory, BE/FE build와 실제 local traffic 통과 |

위 표의 fixture·계약·빌드 항목은 2.1의 AI 276건, 백엔드 1,182건, 직접 영향 96건과 빌드에서 통과했다. 실제 Google, 로컬 DB, container health, BE traffic, 로컬 배포 경계, 변경 전후 token 수치는 4절에서 확보된 증거와 잔여 외부 배포 증거를 분리한다.

### 1.2 필수 경계 테스트 명세

아래 테스트는 계획서 7.1의 경계 사례를 코드로 고정했고 2026-07-29 AI·백엔드 전체 로컬 회귀에서 통과했다.

| 계획 기준 | 작성된 테스트 근거 |
| --- | --- |
| 선언된 모든 fallback failure type이 정책상 도달 가능 | `test_fallback_policy.py::test_every_declared_failure_type_has_a_reachable_fallback_policy_case`, Google 429 분류 fixture |
| 느린 provider가 실제 총시간 안에 fallback되고 worker가 남지 않음 | `test_role_runner.py::test_slow_provider_wall_clock_falls_back_within_total_deadline_without_workers` |
| provider 오류 분류·외부 상태·호출 상한·fallback이 한 경로에서 일치 | `test_role_runner.py::test_provider_error_injection_keeps_classification_call_limit_and_fallback`의 10개 오류 fixture |
| FastAPI 내부 route와 README API 목록이 정확히 일치 | `test_role_output_contracts.py::test_ai_readme_internal_route_inventory_matches_fastapi_routers` |
| Narrator 공개 요청의 필수 구조화 action·scene 누락을 서비스 진입 전 거부 | `ai.service.spec.ts`의 `AiNarrationRequestDto structured trust boundary` |
| 공개 `visibleSummary`가 문장부호 없는 narration의 마지막 글자를 잃지 않음 | `ai.service.spec.ts`의 `AiService Narrator product projection` |
| trace 1·1,000·100,000행 조회량 비선형 | `test_response_logger.py::test_trace_reader_stops_after_requested_latest_size_at_scale` |
| 최종 prompt 정확한 byte 상한 허용·1 byte 초과 선거부 | `test_google_ai_studio_client.py::test_generate_json_accepts_exact_combined_prompt_budget_and_rejects_one_byte_over` |
| 자연어 검색과 무관하게 명시적 유효 spell/item ID 보존 | `test_ai_contract_projection.py::test_explicit_valid_canonical_id_survives_unrelated_natural_language_search` |
| 50개 확정 로그 중 RECENT 최신 12개만 전달 | `ai.service.spec.ts`의 `sends exactly the latest 12 logs from a 50-log RECENT range` |
| Narrator·NPC 정확한 요청 길이 허용, 1자 초과 거절, fallback 상한 | `test_harness_service.py::test_narrator_and_npc_dialogue_enforce_request_specific_output_boundaries`, `test_narrator_fallback_respects_request_max_length`, `test_npc_dialogue_fallback_respects_request_max_length` |
| 7개 역할 provider projection에서 추적 metadata·불투명 ID·`null`·빈/미확정 Actor 상태 제외 | `test_ai_contract_projection.py`의 Interpreter, Narrator, Director, Summarizer, Actor, NpcDialogue, CheckResult projection 테스트 |
| Interpreter가 허용 대상 밖 상세정보와 백엔드 전용 transition evidence를 provider에 노출하지 않음 | `test_ai_contract_projection.py::test_interpreter_projection_excludes_unavailable_target_details_and_backend_transition_evidence` |
| Interpreter 조건부 schema가 제거한 선택 ID echo를 prompt가 다시 요구하지 않음 | `test_role_output_contracts.py::test_interpreter_prompt_does_not_require_echo_fields_removed_by_active_schema` |
| Interpreter 중첩 enum·길이 manifest가 Pydantic·BE decoder와 일치하고 과대/미계약 응답을 BE에서 거절 | `test_role_output_contracts.py::test_contract_manifest_matches_internal_interpreter_constraints`, `ai.client.spec.ts`의 manifest 비교와 `rejects Interpreter ...` 사례 |
| 비어 있는 필수 모델 생성 문자열을 BE decoder가 수용하지 않음 | `ai.client.spec.ts::rejects empty model-generated text that Pydantic marks non-empty` |
| Google usage metadata 일부 누락·타입 오류 시 유효 필드만 독립 보존 | `test_google_ai_studio_client.py::test_google_ai_studio_client_preserves_valid_partial_usage_independently` |
| 연속 schema 검증 실패를 마지막 실패까지 합산하지 않고 실제 후속 attempt 1회로 기록하며 역할 fallback 계약 유지 | `test_provider_execution.py::test_two_invalid_outputs_report_one_schema_retry`, `test_invalid_output_without_follow_up_attempt_reports_zero_schema_retries`, `test_harness_service.py::test_interpreter_repeated_invalid_outputs_keep_fallback_trace_within_contract` |
| schema 실패 후 후속 local/config preflight 실패를 provider/schema retry로 과계수하지 않음 | `test_provider_execution.py::test_schema_retry_that_fails_before_provider_call_is_not_counted` |
| trace attempts·시도 latency 배열·schema retry의 상호 불변식과 manifest 동기화 | `test_role_output_contracts.py::test_contract_manifest_matches_trace_constraints`, `test_trace_contract_rejects_inconsistent_attempt_metrics`, `ai.client.spec.ts`의 trace manifest 비교와 불일치 fixture |
| 부분 usage의 prompt/output/total percentile 표본 수와 total alias를 서로 섞지 않음 | `ai.service.spec.ts`의 `AiService quality metrics`가 서로 다른 표본 수를 보존하고 실제 raw SQL의 필드별 `COUNT`와 schema null 제외식을 고정 |
| schema/역할/전체 무표본을 정상 0%·목표 달성으로 오인하지 않음 | `ai.service.spec.ts`의 SQL `COALESCE` 부재와 `does not claim operational targets are met without trace samples` |
| 7개 역할과 known/general Interpreter가 포함된 동일·완전 fixture token 비교 | `benchmarks/role_token_cases.json`, `test_capture_ai_role_token_usage.py`, `test_compare_ai_token_usage.py`의 vacuous 품질 계약·changed fixture·위조 set SHA·incomplete repeat·missing role·비Google provider·baseline/after 품질 실패 거부 테스트 |

## 2. 수행한 자동 테스트

### 2.1 현재 worktree 최종 로컬 회귀

실행일: 2026-07-29

| 범위 | 실행 결과 |
| --- | --- |
| AI 전체 테스트 | 276/276 통과, 9.63초 |
| 느린 provider·오류 주입 통합 범위 | 53/53 통과, 1.44초. 실제 1초 wall-clock 및 10개 오류 유형 포함 |
| `AiService` 격리 DB 통합 | 통과. 67ms 전체 latency, 37ms provider latency, 410/23/433 token 저장·집계 후 transaction rollback |
| 백엔드 직접 영향 범위 | 96/96 통과, 6 suites. AI decoder/service, Main Command, Summary context, TurnLog 포함 |
| 백엔드 전체 단위 테스트 | 1,182/1,182 통과, 133 suites, 86.7초 |
| 공유 타입 빌드 | 통과 |
| 백엔드 Nest 빌드 | 통과 |
| 계약·benchmark JSON | 통과 |
| Compose 구성 | `docker compose config --quiet` 통과 |
| diff 공백 검사 | `git diff --check` 통과 |

첫 AI 실행은 263/265였고, 새 Check Result 회귀 명세의 `pytest` import 누락과 provider 필드 문서 표 파서가 마지막 역할 뒤의 `## 실패 응답` 표까지 읽는 문제를 확인했다. import를 추가하고 문서 section 파서를 다음 1~3단계 heading에서 중단하도록 교정한 뒤 전체 265건을 통과했다. 이후 실제 wall-clock 1건과 오류 주입 10건을 추가해 최종 276건을 다시 통과했다.

2026-07-30 후속 검증에서 Prisma schema validate와 migration status를 다시 통과했고, 격리 DB 통합 테스트는 전체 72ms/provider 37ms와 410/23/433 token을 저장·집계한 뒤 transaction rollback했다. Docker image build와 key 유무별 실제 container endpoint 검사도 통과했다.

실행 명령:

```powershell
cd C:\WORK\online-TRPG\ai
.\.venv\Scripts\python.exe -m pytest -q

cd C:\WORK\online-TRPG\be
npm run --silent build:test-deps
npm exec jest -- --config jest.quiet.config.ts --silent ai.client.spec.ts ai.service.spec.ts main-commands.service.spec.ts main-command-progress-evidence.service.spec.ts main-command-ai-context-window.spec.ts turn-logs.service.spec.ts --runInBand
npm test -- --runInBand
npm run build
$env:AI_TRACE_DB_TEST_DATABASE_URL = "<isolated PostgreSQL URL with schema=ai_usage_audit_*>"
npm run test:ai-trace-db

cd C:\WORK\online-TRPG\shared-types
npm run build

cd C:\WORK\online-TRPG
docker compose config --quiet
git diff --check
```

### 2.2 2026-07-15 Google 실측·과거 기준선

아래 결과는 2026-07-15 당시의 실제 Google·격리 DB 증거다. 이후 benchmark의 품질 assertion과 fixture set 검증을 강화했고 Check Result prompt도 추가 축소했으므로, 당시 token 비교는 현재 완료 증거로 재사용하지 않는다.

| 범위 | 실행 결과 |
| --- | --- |
| AI 핵심 계약·복원력 테스트 9개 파일 | 최초 49/50 통과. HTTP 400 입력 schema 오류까지 fallback하던 정책을 수정한 뒤 50/50 통과 |
| AI 전체 비실시간 테스트 (`test_live_google_ai_studio.py` 명시적 제외) | 182/182 통과, 8.30초 |
| 공유 타입 빌드 | 통과 |
| 백엔드 빌드 | 통과 |
| AI service·turn log 대상 테스트 | 20/20 통과, 2 suites |
| AI context window·progress evidence·main command 대상 테스트 | 51/51 통과, 3 suites |
| 백엔드 전체 단위 테스트 | 1,157/1,157 통과, 132 suites |
| Google AI Studio 단일 실연결 | 1/1 통과, 2.76초. 현재 설정 모델에서 JSON structured output 생성·파싱 성공 |
| 현재 구현 역할별 usage 캡처 | 8 fixture×3회=24/24 usage 확보, 의미 품질 24/24 통과 |
| 변경 전후 token 비교 | 비교 가능한 7 fixture에서 전체 52.13%, known-intent Interpreter 89.47%, GENERAL Interpreter 23.91% 절감. 세 기준 모두 통과, 품질 회귀 0건 |
| 격리 PostgreSQL migration·usage 집계 | 변경 전 schema 위에 `202607150001_ai_trace_usage_metrics` 실제 적용 성공. 실호출 trace 24건의 역할별 token/provider latency p50·p95 집계와 null 표본 분모 제외 확인 |

실패 기반으로 확인·수정한 사항:

- `schema_validation`이면서 HTTP 400인 caller 계약 오류는 fallback하지 않는다. 같은 잘못된 입력을 재처리해 비용·지연을 늘리고 오류를 가리는 동작을 차단했다.
- 기존 테스트 fixture에서 provider가 더 이상 생성하지 않는 Narrator `visibleSummary`를 제거했다. 이 값은 확정된 서버 입력에서 파생한다.
- hook ID 제거, provider 전용 scene-transition schema, HINT 모드 `suggestions` 제거, 총 역할 처리시간 `latencyMs` 정의에 맞춰 오래된 테스트 기대값을 갱신했다.

실행 명령:

```powershell
cd C:\WORK\online-TRPG\ai
uv sync --extra dev --locked
uv run --locked --extra dev python -m pytest app\tests -q --ignore=app\tests\test_live_google_ai_studio.py

cd C:\WORK\online-TRPG
npm run build -w @trpg/shared-types
npm run build -w @trpg/be
npm run test:quiet -w @trpg/be -- ai.service.spec.ts turn-logs.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- main-command-ai-context-window.spec.ts main-command-progress-evidence.service.spec.ts main-commands.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- --runInBand

cd C:\WORK\online-TRPG\ai
uv run --locked --extra dev python -m pytest app\tests\test_live_google_ai_studio.py -q
```

### 2.3 2026-07-31 BE traffic·배포 경계 재검증

현재 worktree의 공유 타입과 BE build를 다시 통과했고, AI 내부 route·provider execution·Google client·출력 계약 83건과 BE AI client/service 39건도 통과했다. 이어 Compose image를 새로 빌드하고 실제 배포 경로를 기동했다.

배포 검증 중 다음 image/runtime 결함을 발견해 교정했다.

- BE builder가 `srd-data`의 package manifest만 복사해 `build:test-deps`의 canonical generator를 찾지 못하던 문제
- Nginx의 FE builder가 canonical generator가 참조하는 BE rule catalog 파일을 포함하지 않던 문제
- host 실행용 `.env.backend`의 `localhost` DB URL이 container 안에서도 사용되던 문제
- Windows CRLF인 Nginx selector script의 shebang이 Linux image에서 실행되지 않던 문제
- FastAPI route가 proxy에서 제거됐어도 SPA fallback으로 200 HTML을 반환할 수 있던 문제

교정 후 `postgres`, `redis`, `ai-server`, `backend`, `nginx`가 모두 기동됐고 healthcheck 대상 서비스는 `healthy`였다. 새 Compose volume은 과거 테이블을 전제로 시작하는 첫 migration 때문에 `prisma migrate deploy`로 bootstrap할 수 없었다. 실제 Jenkins 배포가 사용하는 `prisma db push`와 동일한 절차로 schema를 동기화한 뒤 BE seed와 기동이 성공했다. fresh DB migration chain의 독립 bootstrap 문제는 별도 배포 부채이며, 현재 Jenkins 경로가 migration deploy를 사용한다는 의미는 아니다.

실행 결과:

| 범위 | 결과 |
| --- | --- |
| 공유 타입 build | 통과 |
| BE build | 통과 |
| AI 직접 영향 테스트 | 83/83 통과 |
| BE AI client/service 테스트 | 39/39 통과 |
| Compose image build·기동 | 통과 |
| Nginx root | `GET /` 200 |
| Nginx→BE health | `GET /api/v1/health` 200 |
| FastAPI 외부 경계 | `GET /ai/` 404, `GET /internal/ai/health/ready` 404 |
| BE→FastAPI 내부 경계 | container 내부 live 200, ready 200 |
| host publish | backend `8080/tcp`, AI `8000/tcp` 모두 미공개; Nginx 80/443만 공개 |
| NestJS 인증 경계 | 유효 DTO 기준 미인증 401, 세션 비멤버 403 |
| 경계 거부 시 AI/DB side effect | 두 거부 전후 `AiTrace` 2→2, AI 호출 없음 |
| `localhost:5173` UI | 브라우저 렌더링·세션 목록 표시 정상 |
| `localhost:5173` API proxy | `GET /api/v1/health` 200 JSON |
| `localhost:5173` FastAPI 경계 | 최초 SPA fallback 200 문제 교정 후 `/ai/`·`/internal/ai/health/ready` 404 |
| `localhost:5173` 실제 narration | fallback 없음, `gemma-4-31b-it`, wall-clock 2,189ms, trace `SUCCESS` |
| `localhost:5173` usage metrics | prompt/output/total 334/38/372, provider latency 2,068ms, schema retry rate 0 |
| `localhost:5173` 인증 경계 | 미인증 401, 비멤버 403, 거부 전후 trace 1→1 |
| FE production build | 통과, 572 modules |

호스트의 `localhost:8080`과 `localhost:8000`에는 Compose와 무관한 기존 Node/Python 프로세스가 이미 떠 있었다. Compose inspect 결과 backend와 AI service에는 host binding이 없으므로 해당 포트 응답을 Compose 외부 노출 근거로 사용하지 않았다.

## 3. 수행한 비테스트 정적 검사

| 검사 | 결과 |
| --- | --- |
| `ai/app`, `ai/scripts` 전체 Python `ast.parse` | 통과, 86개 파일 |
| `benchmarks/role_token_cases.json` JSON 정적 검사 | 통과, 8개 사례·7개 역할. Interpreter known/general 각 포함 |
| `contracts/internal_ai_contract_v1.json` JSON 정적 검사 | 통과, 내부 응답·provider 출력 계약 파싱 가능 |
| 변경 TypeScript 18개 파일 구문 변환 검사 | 통과 |
| `git diff --check` | 통과 |
| `tsc -p shared-types/tsconfig.json --noEmit` | 통과 |
| `docker compose config --quiet` | 통과, 외부 `/ai/` proxy 제거 후 Compose 구성 유효 |
| schema retry 집계 정적 검사 | provider 출력 검증을 시작한 trace만 `schemaValidationRetries=0|1`, 출력 전 실패는 `null`; SQL은 null을 분모에서 제외하고 `schemaSampleCount`를 함께 반환 |
| Google 공식 계약 대조 (2026-07-15) | `HttpOptions.timeout`은 ms 단위이며 `responseJsonSchema`는 `enum`, 수치·배열 경계, `additionalProperties`를 지원함을 공식 API/SDK 문서에서 확인. 현재 Gemma 4 설정 모델의 실호출도 통과 |
| `npm run build -w @trpg/shared-types` | 통과, 변경된 공용 DTO 산출물 갱신 |
| `npm run prisma:generate` | 통과, 변경된 `AiTrace`와 `CHECK_RESULT` Prisma Client 갱신. 이후 격리 PostgreSQL에서 usage migration 실제 적용까지 확인 |
| `npx tsc -p be/tsconfig.json --noEmit --pretty false` | 통과, 공용 DTO·Prisma 생성물 갱신 후 백엔드 전체 타입 오류 0개 |

## 4. 실제 Google·격리 DB 검증

### 4.1 토큰 절감 완료 기준 비교

2026-07-29에 변경 전 기준 `HEAD=263675d38c501fe3d7b4ddef08f13d75417a3c7c`와 현재 서버를 동시에 실행하고, `gemma-4-31b-it`, 동일 fixture set SHA-256 `fc4138c2671de93e31c06f9016cfb007c66480391605ba11354aeff012951f1b`, 8 fixture×3회 조건으로 실제 Google usage를 다시 측정했다. 양쪽 24/24행 모두 `provider=google-ai-studio`, 동일 model, usage 존재, 의미 품질 통과였고 비교기의 완전성·품질 gate도 모두 통과했다.

기준선에는 usage 노출과 현재 fixture 입력 호환을 위한 측정 전용 shim만 적용했다. 특히 구형 Check Result의 full output schema가 반복 timeout을 일으켜 narration-only schema로 축소한 보수적 기준선 469 token을 사용했다. 이는 기준선 token을 낮춰 절감률을 과대평가하지 않는 방향이다. 최종 현재 캡처는 중간 NPC timeout 행을 대체·병합하지 않고 24행 전체를 새로 실행해 모두 성공했다.

| fixture | 기준선 prompt token | 현재 | 절감률 |
| --- | ---: | ---: | ---: |
| Interpreter known | 2,677 | 356 | 86.70% |
| Interpreter general | 2,250 | 1,756 | 21.96% |
| Narrator | 728 | 386 | 46.98% |
| Director | 412 | 294 | 28.64% |
| Summarizer | 259 | 177 | 31.66% |
| Actor | 331 | 198 | 40.18% |
| NPC Dialogue | 446 | 336 | 24.66% |
| Check Result | 469 | 330 | 29.64% |

3회 합산 결과는 기준선 22,716 prompt token, 현재 11,499 token으로 **49.38% 절감**했다. known-intent Interpreter는 8,031→1,068로 **86.70%**, GENERAL Interpreter는 6,750→5,268로 **21.96%** 절감해 계획의 30%/40%/20% 기준을 모두 통과했다. baseline·after 품질 실패와 품질 회귀는 각각 0건이다.

원시/파생 파일:

- `ai/runtime_logs/ai_token_before_20260729.jsonl`
- `ai/runtime_logs/ai_token_after_20260729.jsonl`
- `ai/runtime_logs/ai_token_comparison_20260729.json`
- `ai/runtime_logs/ai_token_after_20260729_transient_failures.jsonl` — 최종 전체 재실행 전 관찰된 NPC timeout 진단 행

### 4.2 격리 DB usage 집계

2026-07-29 당시 로컬 애플리케이션 DB `online_trpg/public`에는 Prisma migration 이력이 없고 `202607150001_ai_trace_usage_metrics`의 컬럼도 없어 읽기 집계가 실패했다. 당시에는 기존 DB를 변경하지 않고 격리 schema `ai_usage_audit_20260729`를 현재 Prisma schema로 생성한 뒤, 위 현재 Google 캡처 24행을 `AiTrace` 형태로 적재해 서비스와 같은 SQL을 실행했다.

전체 합계는 prompt 11,499, output 800, total 12,299 token이며 세 필드 모두 24/24개 표본을 가졌다.

| 역할·prompt | prompt p50/p95 | output p50/p95 | total p50/p95 | 표본 |
| --- | ---: | ---: | ---: | ---: |
| Interpreter known (`interpreter.extract.v1.md`) | 356/356 | 31/31 | 387/387 | 3 |
| Interpreter general (`interpreter.v1.md`) | 1,756/1,756 | 69/71 | 1,825/1,827 | 3 |
| Narrator | 386/386 | 22/25 | 408/411 | 3 |
| Director | 294/294 | 49/49 | 343/343 | 3 |
| Summarizer | 177/177 | 28/34 | 205/211 | 3 |
| Actor | 198/198 | 11/11 | 209/209 | 3 |
| NPC Dialogue | 336/336 | 36/37 | 372/373 | 3 |
| Check Result | 330/330 | 29/29 | 359/359 | 3 |

같은 Actor 집계 그룹에 usage가 없는 timeout trace 1건을 추가했을 때 `traceCount=4`이지만 prompt/output/total 표본 수는 각각 3, prompt p50/p95는 198/198을 유지했다. null 계측 행이 percentile 분모에서 제외되는 기준도 통과했다. 직접 AI 캡처 JSONL은 `providerLatencyMs`를 보존하지 않으므로 이번 격리 적재에서는 해당 필드를 null로 두었고, 실제 BE 경유 provider latency 적재는 기존 단위 테스트와 2026-07-15 격리 DB 근거로 검증한다.

추가로 `be/test/ai-trace-usage-db.integration.ts`를 `AiService` 자체에 연결해 정상 Narrator 호출을 60ms 지연시켰다. 2026-07-29 실행에서는 backend 전체 wall-clock 67ms, 2026-07-30 재실행에서는 72ms였으며 두 실행 모두 provider latency 37ms, prompt/output/total 410/23/433을 저장·집계했다. `getQualityMetrics()`는 같은 값의 p50과 표본 수 1을 반환했다. request JSON은 `sessionId`만, response JSON은 `parsed`, `fallback`, `fallbackReason`만 포함했다. 검증기는 `ai_usage_audit_*` schema가 아니면 실행을 거부하고 전체 작업을 transaction rollback하므로 애플리케이션 데이터는 변경하지 않는다.

### 4.2.1 로컬 DB migration 및 집계

2026-07-30 사용자 승인 후 적용 전 `pg_dump` custom-format 백업을 `tmp/online_trpg_before_migrations_20260730.dump`에 생성했다. 파일 크기는 680,964 bytes, SHA-256은 `5E1FA4C6FA98A47831CE9F2A5CF573D81BBCCFEBAF2F54C753052306F799DB63`이며 `pg_restore --list`에서 822개 TOC 항목을 정상 인식했다.

DB에는 기존 테이블이 있지만 `_prisma_migrations` 이력이 없어 최초 `prisma migrate deploy`가 P3005로 중단됐다. 현재 DB에서 `be/prisma/schema.prisma`까지 read-only diff를 수행한 결과 처음 9개 migration의 구조는 이미 일치했고, 차이는 마지막 usage migration의 `CHECK_RESULT` enum 값, usage/latency 컬럼과 복합 index뿐이었다. 따라서 기존 구조에 해당하는 9개 migration만 `prisma migrate resolve --applied`로 baseline 처리한 뒤 `202607150001_ai_trace_usage_metrics`를 `prisma migrate deploy`로 실제 적용했다.

적용 후 `prisma migrate status`는 10개 migration 모두 최신 상태, schema diff는 `No difference detected`, `prisma validate`는 통과했다. 기존 `AiTrace` 4건은 보존됐으며 그룹은 NPC Dialogue fallback 1건, Interpreter local fallback 1건, Google Interpreter 2건이다. 모두 migration 이전 trace라 token/provider-latency 표본은 0건이며 합계도 0이다. 이는 새 집계 SQL이 로컬 `public`에서 정상 실행되지만 과거 행을 소급 추정하지 않는다는 뜻이다.

### 4.3 로컬 복원력·health 재검증

provider deadline/retry, 400/404/409·401/403·408·429·quota·network·5xx 분류, fallback 정책, 실제 임시 파일 로그 회전·축약·조회 상한, route와 readiness를 묶은 기존 80개 테스트가 2.06초에 통과했다. 이어 분류→provider execution→role fallback을 한 경로로 연결한 오류 주입 10건과 실제 1초 wall-clock 테스트를 추가했다. 비재시도 오류는 provider 1회, 408/network/5xx는 최대 2회, fallback은 정확히 1회였고, 느린 호출은 약 1초 안에 종료되며 신규 worker thread 수는 0이었다. 관련 provider 복원력 범위 53건은 1.44초, AI 전체 276건은 9.63초에 통과했다.

실제 로컬 HTTP 프로세스에서도 다음 결과를 확인했다.

| 설정 | 실행 형태 | live | ready | 판정 |
| --- | --- | ---: | ---: | --- |
| 현재 유효 key·SDK | Compose `ai-server` | 200 | 200 | Docker health `healthy`, 정상 준비 |
| 공백 key 강제 주입 | 동일 image 임시 격리 container | 200 | 503 | `GOOGLE_API_KEY is not configured`, 준비 거부 |

2026-07-30 Docker Desktop Linux engine 27.2.0에서 `online-trpg-ai-server:latest`를 다시 빌드했다. 유효 key compose container는 시작 후 약 6초 안에 `healthy`가 됐고, 공백 key container는 애플리케이션 프로세스와 liveness를 유지하면서 readiness만 503으로 거부했다. 공백 key 임시 container는 검증 후 제거했고 compose `ai-server`는 `healthy` 상태로 유지했다. 기존 `open-webui` container는 변경하지 않았다.

### 4.4 실제 BE traffic·로컬 배포 경계

2026-07-31 새 Compose 배포에서 Nginx 공개 경계의 NestJS narration API를 호출해 `Nginx → BE → AI server → Google AI Studio → BE → PostgreSQL` 전체 경로를 확인했다.

- session: `cms7rdx7v001ppd01l3i5x95s`
- trace: `cms7rdyyu0022pd01zsu9ztmv`
- HTTP wall-clock: 2,210ms
- 결과: `fallback=false`, model `gemma-4-31b-it`, 응답 latency 2,183ms
- DB trace: `SUCCESS`, provider `google-ai-studio`, 전체 latency 2,188ms, provider latency 2,092ms
- usage: prompt 342, output 39, total 381 token
- quality metrics: 각 token 표본 1, provider latency 표본 1, schema 표본 1, schema retry rate 0
- DB 최소 저장: request key는 `sessionId`, response key는 `parsed`, `fallback`, `fallbackReason`뿐

같은 공개 NestJS 경계에서 올바른 narration DTO로 미인증 요청은 401, 세션 비멤버 요청은 403이었다. 두 요청 전후 `AiTrace`는 2건으로 유지돼 FastAPI/Google 호출 전 차단됨을 확인했다.

Nginx는 `/ai/`와 `/internal/ai/`를 명시적으로 404 처리했고, backend container에서만 `http://ai-server:8000/internal/ai/health/live`와 `/ready`가 200을 반환했다. Compose inspect에서도 backend와 AI service의 host port binding은 없고 Nginx 80/443만 공개됐다.

### 4.5 완료 조건에서 분리한 운영 후속

- 실제 느린 provider/네트워크에서 total deadline wall-clock과 fallback 횟수 재확인
- 공개 배포가 다시 준비되면 `/ai/`·`/internal/ai/` 차단과 NestJS 인증·멤버십 경계 재확인
- fresh DB에서 `prisma migrate deploy`만으로 bootstrap할 수 있도록 migration chain 정리

Runbook의 `k14a201.p.ssafy.io`는 DNS가 `13.124.188.48`로 해석됐지만 2026-07-31 재검증에서도 HTTP와 HTTPS의 `/`, `/api/v1/health`, `/ai/`, `/internal/ai/health/ready`가 각각 약 5초 안에 연결되지 않았다(`curl` code 000). 사용자는 공개 배포 대신 이미 실행 중인 `localhost:5173`을 완료 검증 환경으로 지정했다.

`localhost:5173`에서는 최초에 `/ai/`와 `/internal/ai/`가 Vite SPA fallback 때문에 200 HTML을 반환했다. Vite middleware에서 두 route prefix를 명시적으로 404 처리한 뒤 UI 렌더링, `/api/v1/health`, 실제 narration, token/provider latency 집계, 미인증 401, 비멤버 403과 거부 요청의 trace 미증가를 재검증했다. 위 세 항목은 운영 고도화 후속이며 현재 계획의 완료를 차단하지 않는다.

## 5. 계획 8절 완료 기준 감사

| 완료 기준 | 현재 판정 | 직접 증거 |
| --- | --- | --- |
| AIR-01~04 및 AIR-11~16 구현·필수 검증 | 통과 | AI/BE 전체 회귀, 실제 Google 24행, 오류 주입·wall-clock, Docker health, Compose와 `localhost:5173` 실제 BE traffic 통과 |
| 모든 role이 총시간 안에 성공/fallback | 통과 | 공통 runner의 실제 1초 wall-clock·fallback·worker 0과 7개 역할 회귀 |
| 정상 1회·최대 2회 provider 호출 | 통과 | 10개 오류 통합 fixture에서 비재시도 1회, 408/network/5xx 2회 |
| rate limit/quota/timeout/network/5xx/config/auth 처리 일치 | 통과 | 분류→execution→fallback 통합 fixture와 계약 문서 |
| 잘못된 readiness가 healthy로 통과하지 않음 | 통과 | 유효 key compose container `healthy`; 공백 key container live 200/ready 503 |
| trace 저장·조회 상한 | 통과 | 64 KiB 회전/backup 총량, 설정 축소 복구, 100,000행 bounded tail test |
| 역할별 prompt 상한 | 통과 | combined prompt exact byte 상한 및 1 byte 초과 provider 미호출 |
| Google prompt 불필요 metadata/중복 ID/SRD/null 제거 | 통과 | 7개 역할 projection test와 실제 동일 fixture Google capture |
| 플레이어 원문/확정 사실 신뢰 경계 | 통과 | Narrator 구조화 입력, Summary 서버 로그, Check Result exact allowlist의 AI/BE 이중 검증 |
| 명시적 유효 ID 보존 | 통과 | spell/item/target 직접 조회·허용 집합·서버 보강 회귀 |
| Summarizer 요청 범위 준수 | 통과 | 50개 로그에서 최신 12개만 provider 전달 |
| Check Result 허용 사실 밖 보상 금지 | 통과 | 0개 provider 미호출, 1개 exact fact만 허용, 추가 주장 제거·BE fallback |
| 동적 출력 길이 | 통과 | Narrator/NPC 최소·최대·1자 초과와 fallback 절단 |
| 최소 provider output schema | 통과 | 역할·mode별 manifest/Pydantic/Google schema/BE decoder 일치와 실제 Google 24행 품질 통과 |
| usage·schema 표본/retry율 측정 | 통과 | 실제 Google usage, 역할별 p50/p95, null 분모 제외, `AiService` 격리 DB 통합 |
| 대표 fixture prompt token 30% 이상 절감 | 통과 | 전체 49.38%, known 86.70%, general 21.96%, 품질 회귀 0 |
| backend 전체 AI 처리 latency 기록 | 통과 | `AiService` 경유 전체 67ms/provider 37ms 분리 저장·집계 |
| provider 실행 중복 제거·역할 의미 보존 | 통과 | 공통 execution/runner와 AI 276건·Google 24행 |
| DTO·계약·rules·README 코드 일치 | 통과 | machine-readable manifest 비교, route inventory, AI/BE build |
| 회귀·운영 evidence 기록 | 통과 | 본 문서에 로컬·Google·격리/로컬 DB·container·Compose 및 `localhost:5173` 실제 BE traffic·배포 경계 결과 기록 |

따라서 구현·동적 검증·실제 Google token gate·DB migration/usage·container health·실제 BE traffic·배포 경계가 모두 완료 기준을 충족한다. 4.5의 운영 후속은 별도 pending 항목으로 관리하며 이 계획은 완료로 판정한다.
