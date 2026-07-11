# 성능 확장성 Acceptance 증거표

기준일: 2026-07-11
전체 상태: 구현 및 정적 검증 완료, 데이터 기반 동적 검증 대기

이 문서는 `doc/performance_scalability_remediation_plan.md`의 PERF-01~09 완료 여부를 증거 단위로 추적한다. 테스트와 benchmark를 실행하지 않은 항목은 완료로 간주하지 않으며 측정값을 추정하지 않는다.

## 공통 정적 증거

- shared-types, BE, FE TypeScript typecheck 통과
- shared-types build 통과
- FE production build 통과. 브라우저 전용 shared runtime subpath 적용 후 main JS 약 1.39MB
- BE production build 통과
- Prisma schema validate와 client generate 통과
- 성능 스크립트 Node 구문 검사 통과
- API benchmark는 dry-run 기본값, 명시적 `--run`, remote guard, 요청 timeout과 header 값 비기록 계약을 제공
- Acceptance Criteria 재감사 후 Scenario projection page 후처리 제거·혼합 방향 인덱스·SRD 비충돌 scale fixture를 반영했으며, 이후 BE typecheck/build와 Prisma validate를 다시 통과
- VTT benchmark 모듈 import 검사 통과
- `git diff --check` 통과. 기존 파일의 줄바꿈 경고 외 whitespace 오류 없음
- migration, seed apply, benchmark, `EXPLAIN ANALYZE`는 미실행했다. 사용자가 승인한 집중 회귀 테스트와 로컬 backfill apply만 실행했다.

## 후속 보완 정적 증거

`doc/performance_scalability_followup_remediation_plan.md`의 FOLLOWUP-01~04 구현 후 다음 소스 증거를 확인했다.

- moderation queue는 projection 기준으로 DB에서 선택한 page를 재필터링하지 않으며 활성 appeal count만 사용한다.
- fail-closed 공개 revision은 projection 기준으로 queue에 남고 운영자 action 대상이 된다.
- scenario backfill은 publication/grant의 현재값과 예상값을 비교해 차이가 있는 행만 쓰며 coverage와 예상 mutation 수를 출력한다.
- scenario projection read는 publication 누락 시 503으로 중단하고 성공 readiness만 캐시해 silent omission을 막는다.
- `check:scenario-projection`과 `check:ai-trace-fallback`은 남은 mutation 또는 파싱 실패를 종료 코드로 차단하는 비변경 전환 gate를 제공한다.
- combat DTO와 mapper는 `tempHp`를 전달하고 FE는 HP, 임시 HP, 조건, 생존 상태를 session character와 combat participant에 병합한다.
- 신규 AI trace는 일반 성공과 AI/BE fallback을 구조화하고, legacy backfill은 판정 출처와 파싱 실패를 분리해 보고한다.
- 두 backfill 스크립트의 `node --check`와 관련 파일의 `git diff --check`는 통과했다.
- scenario publication 로컬 dry-run은 `scanned=19`, `missingPublicationCount=10`, `wouldUpdatePublication=2`, metadata/grant 실패 0을 보고했다.
- AI fallback 로컬 dry-run은 `scanned=4`, `wouldUpdate=2`, `parseFailureCount=0`을 보고했다.
- 승인 후 Scenario apply는 publication 10건 생성·2건 갱신, AI apply는 fallback 2건 갱신을 완료했다.
- apply 후 scenario는 `existingPublicationCount=19`, 모든 `would*`가 0이었고 AI는 `alreadyTrue=2`, `wouldUpdate=0`, `parseFailureCount=0`이었다.
- `check:scenario-projection`, `check:ai-trace-fallback`은 모두 종료 코드 0으로 통과했다.
- 두 번째 apply는 Scenario와 AI 모두 mutation count 0으로 멱등성을 확인했다.
- Scenario/AI/combat/StateDiff 집중 회귀 테스트는 4 suites, 130 tests가 통과했다.
- 전투 상태 영속화 보완 후 combat/StateDiff 집중 회귀는 3 suites, 91 tests가 통과했고 Human GM HP override 집중 회귀는 1 test가 통과했다.
- 후속 변경 이후 shared-types, BE, FE production build는 통과했다. FE에는 기존 500KB 초과 chunk 경고가 남아 있다.
- 테스트 중 수정한 scenario publish/fork 응답 경로를 포함해 BE production build를 다시 통과했다.
- 두 클라이언트 브라우저에서 일반 피해의 HP `13 → 11`과 GAME OVER가 동시에 반영됐다.
- 임시 HP 5 상태에서 총 10 피해 후 두 클라이언트 모두 `tempHp=0`, `HP=8/13`, `status=ACTIVE`를 표시했다. 로컬 DB의 동일 assignment도 `currentHp=8`, `tempHp=0`, `status=ACTIVE`였다.
- 첫 수동 검증에서 0 HP assignment가 `status=ACTIVE`로 남는 결함을 발견했다. combat, Human GM override, StateDiff가 HP와 `ACTIVE/DEAD`를 함께 영속화하도록 수정하고 집중 회귀를 통과했다.

## 항목별 증거

| 항목 | 구현 증거 | 정적 판정 | 완료에 필요한 동적 증거 |
| --- | --- | --- | --- |
| PERF-01 | VTT v2 delta, token map, adaptive spatial index, batched character query, payload/persistence 진단과 spatial benchmark | 충족 | 100/1,000/10,000 객체에서 결과 동일성, p95, 후보 수, full/delta byte |
| PERF-02 | publication/collaborator projection, projection-authoritative 응답·상세 권한, 후처리 없는 DB filter/sort/page, 혼합 방향 정렬 인덱스, 모든 attribution 변경 경로 dual write, fail-closed backfill 진단 및 배포 순서 | 충족 | migration/backfill dry-run·apply 결과와 실패 표본 검토, 권한 회귀, 500개 초과 목록 및 SQL plan |
| PERF-03 | slim snapshot, 실제 Prisma SQL/row 계측, participant/character/StateDiff delta, Human GM patch 정규화, FE merge/resync, 4/40/400명 snapshot fixture | 충족 | HP/tempHp/status 두 클라이언트 동기화 확인 완료. delta 누락·버전 불일치 복구와 snapshot query/payload 측정은 별도 scale 검증으로 남음 |
| PERF-04 | `fallbackUsed`, 구조화 legacy backfill, aggregate/groupBy 지표, 안정 cursor page | 충족 | backfill dry-run·apply 및 파싱 실패 검토, API 계약 테스트, 1x/10x/100x AiTrace 응답 시간 및 plan |
| PERF-05 | 목록·세션·로그·trace·reveal 복합 인덱스, 안정 cursor tie-breaker, concurrent/rollback 절차와 신규 인덱스별 대표 plan SQL | 충족 | 각 scale `EXPLAIN (ANALYZE, BUFFERS)`에서 scan/sort/buffer 및 index build 시간 비교 |
| PERF-06 | Map 기반 reducer, batch append, 10,000개 메모리 상한, 200행 render window, scroll anchor | 충족 | reducer/화면 테스트, 10,000개 로그 DOM 상한과 스크롤 유지 확인 |
| PERF-07 | evidence key 정확 조회, 자연어 fallback 상한, `transition_evidence_built` 진단, 100/1,000/10,000 reveal·visit fixture | 충족 | structured/free-text 결과 회귀와 candidate/key/payload 증가율 측정 |
| PERF-08 | exact alias+n-gram index, rule card/hook precompute, browser-safe shared runtime, 12개 직업별 FE manifest(각 14.7~19.4KB, 전체 fallback 202KB), 비충돌 합성 catalog와 결과 ID 자동 동일성 gate를 포함한 benchmark | 충족 | Python 테스트, 1x/10x/100x `result_consistency.pass=true`와 검색 p95/메모리 측정, 플레이 network에서 전체 catalog 요청 없음 |
| PERF-09 | 500행 cursor, groupBy/createMany, idempotency/retry, 공개 revision·전용 운영자를 포함한 1/100/10,000 연결 fixture, 단일 호출 runner, fan-out 검증 SQL과 진단 | 충족 | 1/100/10,000 연결 세션의 누락 0, 중복 0, page/query/retry/API 응답 시간 |

## Acceptance Criteria 감사

`정적 충족`은 현재 소스 구조로 직접 확인된 항목이다. `정적 구현·동적 대기`는 구현과 측정 수단은 있으나 결과값 또는 동작 증거가 필요한 항목이고, `동적 대기`는 테스트나 실제 DB·브라우저 실행 없이는 판정하지 않는 항목이다.

| PERF | Acceptance Criterion | 판정 | 현재 증거 또는 완료 gate |
| --- | --- | --- | --- |
| 01 | 이동 비교 루프의 `previousMap.tokens.find()` 제거 | 정적 충족 | `session-vtt-movement-frame-publisher.service.ts`의 ID `Map` lookup |
| 01 | 함정·근접 이벤트를 공간 후보로 제한 | 정적 구현·동적 대기 | `vtt-map-spatial-index.ts`; full scan 대비 false negative 0 측정 필요 |
| 01 | 발동 함정별 캐릭터 조회 반복 제거 | 정적 충족 | movement publisher의 이동 캐릭터 batch 조회 |
| 01 | 단일 토큰 delta payload가 전체 맵 크기에 비례하지 않음 | 정적 구현·동적 대기 | shared delta 계약과 `benchmark-vtt-payload.mjs`; scale별 byte 필요 |
| 01 | delta version gap 전체 맵 재동기화 | 정적 구현·동적 대기 | FE `session.resync` 경로; Socket 회귀 실행 필요 |
| 01 | 1x/10x/100x 후보·시간·payload 기록 | 정적 충족 | VTT payload/spatial runner와 결과 템플릿 |
| 02 | `listMyScenarios()` 전체 Scenario 조회 제거 | 정적 충족 | `scenarios.service.ts` projection 기반 DB page query |
| 02 | 공개 필터·정렬·페이지를 SQL에 반영 | 정적 충족 | `ScenarioPublication` where/order/cursor query, projection page를 재필터·재정렬하지 않는 응답 경로 |
| 02 | 500개 초과 최신 공개 시나리오 누락 없음 | 동적 대기 | 10x/100x fixture API paging 결과 필요 |
| 02 | page보다 많은 본문/metadata를 읽지 않음 | 정적 구현·동적 대기 | DB take/select 구현; Prisma query/row 증거 필요 |
| 02 | 작성자·협업자·공개 권한 회귀 없음 | 동적 충족 | Scenario 집중 회귀를 포함한 4 suites, 130 tests 통과 |
| 03 | participant include의 Character/resource/inventory 제거 | 정적 충족 | `session-snapshot.service.ts` slim participant query |
| 03 | HP·준비 상태 변경의 전체 snapshot 제거 | 동적 충족 | 두 클라이언트에서 HP/tempHp/status 실시간 일치 및 DB 영속 값 확인 |
| 03 | 최초 접속·version gap은 snapshot으로 복구 | 정적 구현·동적 대기 | snapshot endpoint와 FE resync 유지; 계약 실행 필요 |
| 03 | snapshot query·row·JSON byte 계측 | 정적 충족 | `PERFORMANCE_DIAGNOSTICS=1`의 `session_snapshot_built` |
| 03 | 같은 명령 경로의 중복 snapshot 제거 | 정적 구현·동적 대기 | join/re-entry 호출 정리; 호출 횟수 진단 필요 |
| 04 | 품질 지표가 `responseJson`을 select/parse하지 않음 | 정적 충족 | `ai.service.ts` aggregate/groupBy 경로 |
| 04 | 반환 row 수가 전체 trace 수에 비례하지 않음 | 정적 구현·동적 대기 | DB aggregate 구현; scale별 query 결과 필요 |
| 04 | legacy와 구조화 fallback 지표 비교 가능 | 정적 충족 | dry-run 기본 `backfill-ai-trace-fallback.mjs` 진단 |
| 04 | 목록 API cursor와 최대 page size | 정적 충족 | 검증된 cursor와 최대 100행 DTO/service guard |
| 05 | 신규 인덱스별 query·plan 근거 | 정적 구현·동적 대기 | `explain-performance-queries.sql`; 실제 plan 원본 필요 |
| 05 | 큰 sequential scan 후 앱 정렬 제거 | 정적 구현·동적 대기 | DB order/filter 구현; 1x/10x/100x plan 필요 |
| 05 | 중복 인덱스 미추가 | 정적 충족 | Prisma schema와 additive migration의 prefix/순서 대조 |
| 05 | lock·예상 시간·rollback 절차 | 정적 충족 | `infra/RUNBOOK.md` index 적용 절차 |
| 06 | 과거 로그 10개당 state update 1회 | 정적 구현·동적 대기 | `appendMany` reducer action; React 실행 증거 필요 |
| 06 | 추가 시 전체 배열 `some()`+`map()` 제거 | 정적 충족 | `orderedIds`와 `byId` 기반 reducer |
| 06 | 10,000개 상태에서 DOM window 상한 | 정적 구현·동적 대기 | Main/Chat 200행 cap; 브라우저 DOM count 필요 |
| 06 | 과거 로그 로딩 전후 scroll anchor 유지 | 정적 구현·동적 대기 | `useSessionLogAutoScroll.ts`; 화면 회귀 필요 |
| 06 | pending 교체·realtime 중복 제거 유지 | 동적 대기 | `useLogs` 집중 테스트 실행 필요 |
| 07 | ID 전환이 전체 reveal/visit을 조회하지 않음 | 정적 충족 | evidence ID 수집 후 `IN` exact query |
| 07 | AI context에서 전체 단서·방문 이력 제외 | 정적 충족 | clue 50·TurnLog 12 fallback cap과 visit 제외 |
| 07 | structured 결과 동일·없는 key 미충족 | 정적 구현·동적 대기 | evaluator fail-closed 구현; 결과 회귀 필요 |
| 07 | 자유 텍스트 fallback 상한 유지 | 정적 충족 | service 상수와 bounded query |
| 07 | 후보·query·결과·시간·byte 비교 | 정적 충족 | `transition_evidence_built` 구조화 진단 |
| 08 | 일반 검색의 전체 entity term 순회 제거 | 정적 충족 | exact alias와 2/3-gram posting 후보 집합 |
| 08 | 요청별 keyword 정규화 제거 | 정적 충족 | 생성자에서 score term과 hook term precompute |
| 08 | 기존 결과 순서와 limit 유지 | 정적 구현·동적 대기 | 비충돌 합성 scale fixture와 자동 consistency gate; 테스트 실행 필요 |
| 08 | 1x/10x/100x 시간·메모리 비교 | 정적 충족 | SRD benchmark의 construction/search/index stats |
| 08 | 플레이 첫 화면의 전체 catalog 다운로드 제거 | 정적 구현·동적 대기 | 직업별 manifest loader; browser network 증거 필요 |
| 09 | 연결 세션별 최신 로그 개별 조회 제거 | 정적 충족 | 페이지별 단일 `groupBy` |
| 09 | 100개 초과 연결 세션 누락 없음 | 정적 구현·동적 대기 | ID cursor 500행; 10,000개 verifier 결과 필요 |
| 09 | unique 충돌 복구·명시적 재시도 | 정적 구현·동적 대기 | idempotency key, `skipDuplicates`, 최대 3회 retry; 동시성 회귀 필요 |
| 09 | API 응답 시간·실제 로그 반영 문서화 | 정적 충족 | 단일 호출 runner, 진단 이벤트, fan-out SQL, 결과 템플릿 |

## 동적 검증 산출물

- 측정 기록: `doc/dev-notes/PERFORMANCE_SCALE_RESULT_TEMPLATE.md`의 복사본
- SQL plan 원본: `scripts/performance/explain-performance-queries.sql` 출력
- API/VTT 결과: benchmark runner의 JSON 출력
- SRD 결과: `ai/benchmarks/srd_retrieval_index_result.json`
- 진단 로그: 본문을 제외한 `PERFORMANCE_DIAGNOSTICS=1` 구조화 이벤트

PERF-01~09는 위 동적 증거가 채워지고 기능 결과 동일성이 확인된 뒤에만 최종 완료로 전환한다.
