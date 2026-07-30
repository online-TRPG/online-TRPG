# 세션 노드 런타임 migration 및 backfill 결과

실행일: 2026-07-31

기준 계획:
`doc/dev-notes/2026-07-31-session-scenario-runtime-map-integrity-plan.md`

## Migration

- 로컬 `online_trpg` DB에
  `202607310001_session_node_runtime_state`를 적용했다.
- 적용 후 Prisma migration 상태는 최신 상태다.
- 데이터가 없는 최소 선행 스키마에서도 동일한 `migration.sql`을
  적용해 다음 결과를 확인했다.
  - `Scenario.deletedAt` 컬럼 1개
  - `SessionScenarioNodeRuntimeState` 테이블 1개
  - `SessionScenario_scenarioId_fkey` 삭제 규칙 `RESTRICT`
- 검증용 임시 DB는 확인 직후 제거했다.

저장소의 기존 migration 체인에는 초기 스키마 baseline이 없으므로,
완전히 비어 있는 DB에 전체 migration 체인을 처음부터 적용하는 작업은
이번 신규 migration 검증 범위와 분리한다. 이번 migration은 실제 기존
로컬 DB와 데이터가 없는 선행 스키마 양쪽에서 검증했다.

## Backfill

최초 dry-run과 apply 결과:

- 스캔: 2건
- 적용 가능: 2건
- 적용: 2건
- decode 실패: 0건
- 노드 ID 불일치: 0건
- 노드 스냅샷 누락: 0건
- 차단 제외: 0건

재실행 결과:

- 적용 가능: 0건
- 적용: 0건
- 기존 runtime row: 2건

따라서 backfill은 멱등성을 충족한다.

## 고아 세션 및 런타임 무결성

- 시나리오 연결이 없는 세션: 18건
- 상태: 모두 `DISBANDED`
- `PLAYING` 고아 세션: 0건
- `PLAYING` 세션의 현재 노드 runtime 누락: 0건
- runtime map의 `scenarioNodeId` 불일치: 0건

고아 세션 18건은 기존 데이터 진단 대상으로 유지하며, 현재 플레이
런타임을 차단하는 항목은 없다.

## 검증 결과

- BE 핵심 회귀: 17 suites, 297 tests 통과
- FE 동기화 회귀: 2 files, 8 tests 통과
- shared-types, BE, FE build 통과
- Prisma Client 생성 통과
- DB 통합 무결성 검사 통과
- `backfill:session-node-runtime:apply` 재실행 0건
