# 데이터 증가 대비 성능·확장성 개선 계획

작성일: 2026-07-11

상태: 구현 및 정적 검증 완료, 동적 검증 대기

## 진행 현황

2026-07-11 기준:

- PERF-01 구현 후 검증 대기
  - 이전 토큰 lookup을 `Map`으로 바꿔 이동 비교의 O(T²) 경로를 제거했다.
  - 함정 후보용 chunk 공간 인덱스와 이동 캐릭터 batch 조회를 추가했다.
  - shared map delta build/apply 계약과 Socket capability room 기반 `vtt.map.delta.v2`를 추가했다.
  - FE는 delta version 불일치 시 `session.resync`로 전체 snapshot을 복구한다.
  - 근접 fog 이벤트도 공간 후보로 제한했다.
  - previous map을 보유한 VTT publisher를 v2 delta 경로에 연결했다.
  - 순서가 바뀌지 않은 delta에서는 전체 token/object ID order 배열도 생략한다.
  - `PERFORMANCE_DIAGNOSTICS=1`에서 전체/delta payload byte와 map 저장 byte·시간을 기록한다.
  - 같은 진단 모드에서 proximity·함정 감지·함정 발동별 원본 객체 수, 공간 query 수, 전체/고유 후보 수와 lookup 시간을 기록한다.
  - 넓고 희소한 영역은 빈 chunk를 모두 순회하지 않고 정확한 rectangle scan으로 전환하는 adaptive fallback을 추가했다.
  - 256개보다 많은 chunk를 덮는 map-sized object는 별도 exact-overlap 목록에 보관해 인덱스 생성 시 chunk 폭증도 제한한다.
  - 전체 `flagsJson` 저장 분리는 계측 임계값을 확인한 뒤 적용하는 2차 선택 사항으로 유지했다.
  - 집중 테스트와 1배·10배·100배 payload 계측 실행은 사용자 검증 단계로 남아 있다.
- PERF-02 구현 후 검증 대기
  - 공개·중재·정렬 필드를 `ScenarioPublication`, 협업 권한을 `ScenarioCollaboratorGrant`로 구조화했다.
  - 공개/내 목록과 중재 큐를 projection 기반 DB 필터·정렬·페이지 조회로 전환했다.
  - SQL이 만든 page를 attribution parser로 다시 필터·정렬하지 않으며, 공개 상태·중재 상태·태그·GM mode·fork 수는 projection 응답을 우선한다. parser는 호환 필드와 본문 없는 mismatch 진단에만 남겼다.
  - 최신·추천·중재·내 목록의 혼합 정렬 방향과 안정 ID tie-breaker에 맞춘 인덱스를 반영했다.
  - 기존 offset을 유지하면서 ID cursor를 추가하고 FE query serializer를 연결했다.
  - dry-run 기본 backfill, 제공 시나리오 seed projection, 핵심 변경 경로 dual write와 불일치 경고를 추가했다. revision/public marker 파싱 실패나 알 수 없는 상태는 `UNPUBLISHED/HIDDEN`으로 fail-closed 처리한다.
  - 일반 시나리오 수정 경로도 attribution과 publication projection을 함께 갱신한다.
  - Prisma client 생성은 완료했다. migration/backfill 적용과 집중 테스트·EXPLAIN은 사용자 검증 단계로 남아 있다.
- PERF-03 구현 후 검증 대기
  - snapshot과 participant DTO 조회에서 중복 Character/resource/inventory include를 제거했다.
  - 재입장·참가 경로에서 같은 snapshot을 두 번 생성하던 호출을 한 번으로 줄였다.
  - participant/character delta를 연결하고 레벨업·준비 주문 변경의 전체 snapshot 발행을 제거했다.
  - 캐릭터 `StateDiff`를 런타임에서 검증하는 shared parser와 FE version/entity 검증을 추가했다. 알 수 없는 diff, version gap, 없는 캐릭터 ID는 추측 적용하지 않고 `session.resync`를 요청한다.
  - 적용 가능한 diff는 세션 캐릭터와 전투 참가자 상태에 함께 반영한다. 일반 공격처럼 행동 경제만 함께 바뀌는 경로는 전체 snapshot을 생략하고, 주문 슬롯·인벤토리·휴식 자원·공개 단서 변경은 기존 snapshot 복구를 유지한다.
  - `PERFORMANCE_DIAGNOSTICS=1`에서 snapshot 생성 시간·JSON byte와 실제 Prisma SQL 수·DB 시간·모델별 반환 행 수를 기록한다.
  - Human GM의 HP·조건 변경 diff도 canonical character patch로 정규화하고 전체 snapshot broadcast를 제거했다.
  - `combat.updated` 수신 시 FE session character의 HP·조건·생존 상태도 병합한다. 일반 피해·공격·이동·방어·은신·몬스터 공격은 전체 snapshot을 생략하고, 전투 시작·종료, 준비행동 flags, 주문 슬롯·클래스 자원 변경에는 snapshot fallback을 유지한다.
  - `PERFORMANCE_DIAGNOSTICS=1`에서 participant/character/StateDiff/combat delta byte도 snapshot과 같은 `realtime_payload` 형식으로 기록한다.
- PERF-04 구현 후 검증 대기
  - `AiTrace.fallbackUsed` 구조화 필드와 기존 fallback trace backfill migration을 추가했다.
  - 품질 지표를 전체 trace/response JSON 로딩에서 DB aggregate/groupBy 방식으로 변경했다.
  - legacy JSON을 구조적으로 해석하는 dry-run 기본 backfill과 배포 중 writer 정지 후 최종 catch-up 절차를 추가했다.
  - Prisma client 생성은 완료했다. migration 적용과 집중 테스트 실행은 사용자 검증 단계로 남아 있다.
- PERF-05 구현 후 검증 대기
  - 현재 목록·관계 조회에 대응하는 Prisma index와 SQL migration을 추가했다.
  - 1배·10배·100배 데이터의 `EXPLAIN (ANALYZE, BUFFERS)` 확인은 남아 있다.
- PERF-06 구현 후 검증 대기
  - 로그 상태를 `orderedIds`와 `byId` 기반 reducer로 전환하고 과거 TurnLog 페이지를 단일 batch 액션으로 반영한다.
  - 메모리 보관 상한은 10,000개, Main/Chat별 렌더링 상한은 200행으로 설정했다.
  - 불러온 로그 범위의 앞뒤 탐색과 과거 로그 추가 시 scroll anchor 보존을 추가했다.
  - FE production build는 통과했다. 10,000개 로그 브라우저 프로파일링은 사용자 검증 단계로 남아 있다.
- PERF-07 구현 후 검증 대기
  - 구조화된 전환 조건에서 clue/node evidence key를 먼저 모아 `IN` 조건으로 정확 조회한다.
  - 자연어 전환 조건은 최근 공개 단서 50개와 최근 TurnLog 12개로 fallback 범위를 제한했다.
  - 자동 전환은 reveal/visit 조회를 생략하고, 현재 장면 힌트는 현재 노드의 clue ID만 정확 조회한다.
  - `transition_evidence_built`로 query/candidate/key/result 수, 처리 시간과 payload byte를 본문 없이 기록한다.
  - 집중 테스트 실행과 1배·10배·100배 쿼리·payload 계측은 사용자 검증 단계로 남아 있다.
- PERF-08 구현 후 검증 대기
  - entity alias와 rule card/hook text 후보를 초기화 시 exact alias 및 2/3-gram 역색인으로 만든다.
  - hook source entity/rule ID도 역색인하고 기존 점수식·정렬·limit은 유지한다.
  - 인덱스 생성 시간, alias/ngram/posting 수, 추정 메모리를 startup log와 `index_stats`로 노출한다.
  - FE sync가 직업별 class feature manifest를 만들고 플레이 화면은 세션에 등장한 직업만 로드한다.
  - 정적 자산 동기화로 12개 직업별 manifest를 생성했으며 각 파일은 약 14.7~19.4KB다. 202KB 전체 manifest는 누락 파일 호환 fallback으로만 남긴다.
  - FE runtime 값은 decorator DTO가 포함된 shared root 대신 `@trpg/shared-types/browser-runtime`에서 가져와 Nest/Swagger가 브라우저 bundle에 포함되지 않게 했다.
  - scale benchmark의 복제 항목은 원본 검색어와 source rule/entity 연결에 적중하지 않는 합성 값으로 만들고, 결과 ID 순서 불일치를 자동 실패시키는 consistency gate를 추가했다.
  - Python 집중 테스트와 1배·10배·100배 benchmark 실행은 사용자 검증 단계로 남아 있다.
- PERF-09 구현 후 검증 대기
  - 활성 연결 SessionScenario를 ID cursor로 500개씩 끝까지 순회한다.
  - 페이지마다 최신 turnNumber를 단일 `groupBy`로 읽고 moderation TurnLog를 `createMany`로 생성한다.
  - TurnLog `idempotencyKey`와 `skipDuplicates`를 적용하고 turnNumber 충돌 누락분만 최대 3회 재시도한다.
  - 반복 moderation 요청은 같은 action ID로 idempotent backfill을 다시 수행한다.
  - Prisma client 생성은 완료했다. migration 적용과 집중 테스트·응답 시간 측정은 사용자 검증 단계로 남아 있다.

## Summary

현재 구현은 소규모 세션과 제한된 SRD 콘텐츠에서는 단순하고 예측 가능하게 동작하지만, 다음 데이터가 10배 또는 100배 증가하면 처리 비용이 함께 커지거나 서로 곱해지는 경로가 있다.

- VTT 토큰, 오브젝트, 함정 수가 함께 늘 때 이동 1회의 비교량이 제곱에 가깝게 증가한다.
- 시나리오 목록과 AI 품질 지표가 필요한 페이지나 집계값보다 훨씬 많은 행을 애플리케이션 메모리로 가져온다.
- 세션 상태가 바뀔 때마다 참가자, 캐릭터, 인벤토리, 시나리오를 포함한 전체 스냅샷을 다시 만들고 방 전체에 전송한다.
- 장기 세션의 로그, 방문 노드, 공개 단서가 계속 누적되어 프론트 렌더링과 장면 전환 판정 비용이 증가한다.
- 주요 조회 조건을 뒷받침하는 복합 인덱스와 외래 키 인덱스가 일부 없다.
- AI SRD 검색이 카탈로그 전체를 선형 탐색한다.

이 계획의 목표는 단순히 제한값을 낮추는 것이 아니다. 조회·계산·전송 비용이 전체 데이터량이 아니라 현재 페이지, 현재 변경분, 현재 판정에 필요한 후보 수에 비례하도록 구조를 바꾸는 것이다.

TypeScript 정적 검사와 스크립트 구문 검사는 완료했다. 테스트, migration, backfill, seed apply, benchmark와 `EXPLAIN ANALYZE`는 실행하지 않았으며 사용자가 `Test Plan`에서 필요한 검증을 선택해 직접 실행한다.

## 데이터 증가 축

성능 검증은 모든 데이터를 하나의 숫자로 보지 않고 다음 축을 독립적으로 늘려야 한다.

| 축 | 1배 기준 | 10배·100배에서 확인할 항목 |
| --- | --- | --- |
| 전체 서비스 데이터 | 사용자, 세션, 시나리오, 캐릭터, AI trace | 목록 API와 집계 API가 전체 행 수에 따라 느려지는지 확인 |
| 세션 누적 이력 | TurnLog, PlayerAction, AiTrace, StateDiff | 장기 캠페인의 조회, 집계, 프론트 로그 처리 확인 |
| 시나리오 복잡도 | 노드, 단서, 전환, 에셋 | 편집, 공개 검색, 세션 snapshot 생성, 전환 판정 확인 |
| VTT 맵 복잡도 | 토큰, objectCells, hazard, fogRects | 이동 1회 CPU, DB write 크기, Socket payload 확인 |
| SRD 콘텐츠 크기 | 주문, 아이템, 몬스터, 규칙 카드, 훅 | AI 검색 전처리 시간과 브라우저 초기 다운로드 크기 확인 |
| 동시 접속 | 세션 방 수, 방별 참가자 수 | 전체 snapshot/map broadcast의 CPU·네트워크 증폭 확인 |

한 축만 10배 증가하면 선형 비용은 10배가 된다. 토큰과 함정처럼 두 축을 중첩 순회하는 코드는 각각 10배 증가할 때 비교량이 약 100배가 될 수 있으므로 별도로 다룬다.

## 목표

- 목록 API는 전체 데이터량과 무관하게 요청한 페이지 크기만 반환한다.
- 집계 API는 원본 JSON 행 전체를 애플리케이션으로 가져오지 않는다.
- VTT 이동 1회의 핵심 탐색은 토큰 수와 오브젝트 수의 곱이 아니라 후보 집합 크기에 비례한다.
- 일반적인 상태 변경은 전체 세션 snapshot이 아니라 변경된 도메인 데이터만 전송한다.
- 프론트 로그 상태 갱신과 DOM 노드 수에 명시적인 상한이 있다.
- 장면 전환 판정에 전달되는 진행 증거는 해당 전환 조건과 관련된 데이터로 제한한다.
- 신규 인덱스는 실제 조회 계획을 근거로 추가하고 쓰기 비용까지 확인한다.
- 기존 REST/Socket DTO와 플레이 동작은 단계적으로 호환성을 유지한다.

## 비목표

- 이번 작업에서 모든 JSON 컬럼을 한 번에 관계형 모델로 이전하지 않는다.
- 기능 범위, 룰 판정 결과, 시나리오 공개 정책을 변경하지 않는다.
- 근거 없이 Redis, 검색 클러스터, 메시지 브로커 같은 운영 의존성을 먼저 추가하지 않는다.
- 성능 개선을 이유로 세션 기록이나 AI trace 보존 정책을 임의로 변경하지 않는다.

## 공통 원칙

- 먼저 계측한 뒤 구조를 바꾸고 같은 데이터셋으로 다시 측정한다.
- 목록은 DB에서 필터·정렬·페이지 처리하고, 애플리케이션 후처리는 현재 페이지 안에서만 수행한다.
- 전체 snapshot은 최초 접속과 재동기화용으로 유지하고, 정상 이벤트는 delta를 기본으로 한다.
- 큰 JSON을 수정할 때는 읽기·파싱·직렬화·쓰기·브로드캐스트 비용을 하나의 비용으로 본다.
- 인덱스는 실제 `where`, `orderBy`, cardinality를 기준으로 설계한다.
- API/Socket 호환 전환은 구버전 경로를 먼저 유지한 상태에서 소비자를 이동한 뒤 제거한다.
- 권한이 없는 행은 애플리케이션 필터링 이전에 DB 조회에서 제외한다.

## 문제 목록과 우선순위

| ID | 우선순위 | 문제 | 주 증가 축 |
| --- | --- | --- | --- |
| PERF-01 | P1 | VTT 이동의 중첩 탐색과 전체 맵 저장·전송 | 맵 복잡도, 동시 접속 |
| PERF-02 | P1 | 시나리오 목록의 메모리 필터·정렬과 고정 scan limit | 전체 시나리오 수 |
| PERF-03 | P1 | 전체 세션 snapshot의 과조회와 잦은 브로드캐스트 | 세션 데이터, 동시 접속 |
| PERF-04 | P1 | AI 품질 지표의 전체 trace 로딩·JSON 파싱 | 세션 누적 이력 |
| PERF-05 | P1 | 주요 조회 조건의 인덱스 부족 | 전체 서비스 데이터 |
| PERF-06 | P2 | 프론트 로그 누적 갱신과 전체 DOM 렌더링 | 세션 누적 이력 |
| PERF-07 | P2 | 전환 판정 시 모든 단서·방문 노드 재구성 | 시나리오·캠페인 길이 |
| PERF-08 | P2 | AI SRD 카탈로그 선형 검색 | SRD 콘텐츠 크기 |
| PERF-09 | P2 | 시나리오 중재 로그 생성의 순차 N+1 | 연결 세션 수 |

## PERF-01. VTT 이동 처리 비용 제한

상태: 구현 후 검증 대기

구현 메모:

- 단일 entity 수정은 변경 entity만 보내고, token/object 순서가 같으면 order 배열도 생략한다.
- 기존 v2 delta가 order 배열을 보내는 경우에는 그대로 적용하고, 생략된 경우 현재 순서를 유지한다.
- `PERFORMANCE_DIAGNOSTICS=1`이면 `vtt_map_payload_comparison`에서 host/player 전체·delta byte와 변경 entity 수를 기록한다.
- 같은 진단 모드에서 `vtt_map_persisted`는 전체 flags JSON byte, DB update 시간, token/object/fog 수를 기록한다.
- DB 저장 분리는 계획에서 정한 2차 조건부 단계다. 측정 결과가 허용 범위를 넘기 전에는 트랜잭션·복구 복잡도를 늘리지 않고 전체 flags 저장을 유지한다.
- 공간 query가 희소 맵의 빈 chunk를 entry 수보다 훨씬 많이 순회하게 되는 경우에는 exact rect scan으로 전환한다. 진단에는 chunk query와 scan fallback 횟수를 함께 기록한다.

### 문제

`be/src/modules/sessions/session-vtt-object-runtime.service.ts`의 이동 후처리는 다음 비용을 만든다.

- 현재 토큰마다 `previousMap.tokens.find(...)`를 호출해 토큰 비교가 O(T²)가 된다.
- 함정 감지는 object cell과 이동 토큰을 중첩 순회한다.
- 근접 이벤트는 후보 이벤트마다 모든 파티 토큰을 검사하고 fog rect 전체를 다시 가공한다.
- 함정 발동마다 캐릭터를 개별 조회·갱신하고 TurnLog를 생성한다.
- 최종 결과는 `GameState.flagsJson` 전체를 직렬화해 다시 저장한다.
- Socket 이벤트는 변경된 토큰이 아니라 host/player 전체 맵을 방 전체에 전송한다.

대표 위치:

- `be/src/modules/sessions/session-vtt-object-runtime.service.ts`
- `be/src/modules/sessions/map-runtime.service.ts`
- `be/src/modules/sessions/session-vtt-map-persistence.service.ts`
- `be/src/modules/realtime/realtime-events.service.ts`
- `fe/src/features/sessionPlay/utils/vttMapState.ts`
- `fe/src/features/sessionPlay/hooks/useSessionVttMapRequests.ts`

### 해결 계획

1. 맵 연산 시작 시 한 번만 인덱스를 만든다.
   - `tokenById: Map<string, VttMapToken>`
   - `previousTokenById: Map<string, VttMapToken>`
   - `objectById: Map<string, VttMapObjectCell>`
   - 이동 토큰 ID 집합
2. `map(...find(...))`와 루프 내부 `find()`를 인덱스 조회로 교체한다.
3. object/hazard 후보를 셀 좌표 또는 chunk key로 묶는 경량 공간 인덱스를 추가한다.
   - 구현 위치: `be/src/modules/sessions/vtt-map-spatial-index.ts`
   - 토큰 이동 경로와 인접한 chunk의 오브젝트만 검사한다.
   - 작은 맵에서는 기존 배열 순회보다 느려지지 않도록 임계값 없는 단순 Map 구조를 우선한다.
4. 함정 발동 대상 캐릭터는 이동 토큰 ID를 모아 한 번의 `findMany`로 가져온다.
5. 여러 캐릭터 갱신과 TurnLog 생성은 기존 트랜잭션 경계를 유지하면서 batch 가능한 부분을 묶는다.
6. 맵 변경 결과에 delta를 추가한다.
   - `changedTokens`
   - `changedObjectCells`
   - `changedFogRects` 또는 fog revision
   - `removedIds`
   - `mapVersion`
7. `vtt.map.updated.v2` delta 이벤트를 추가하고 기존 `vtt.map.updated` 전체 payload를 호환 기간 동안 유지한다.
8. FE가 v2 delta를 적용할 수 있게 한 뒤 전체 이벤트를 재동기화 fallback으로 축소한다.
9. DB 저장은 두 단계로 진행한다.
   - 1차: 전체 `flagsJson` 저장은 유지하되 탐색과 Socket payload만 최적화한다.
   - 2차: 맵이 충분히 커질 경우 `GameState.flagsJson`에서 VTT 상태를 별도 테이블/JSONB 컬럼으로 분리한다.
10. 별도 저장이 필요한 시점은 측정값으로 결정한다.
    - 단일 map JSON 크기
    - 이동 1회 직렬화 시간
    - DB update WAL/row size

### 호환·실패 처리

- delta 적용 중 버전 불일치가 발생하면 FE는 전체 맵 재조회 또는 기존 전체 map 이벤트를 요청한다.
- v2 소비자가 준비되기 전에는 기존 이벤트를 제거하지 않는다.
- 공간 인덱스가 후보를 누락하지 않도록 인덱스 결과와 기존 전체 scan 결과를 개발 환경에서 비교할 수 있는 진단 함수를 둔다.

### Acceptance Criteria

- 이동 토큰 비교 루프 안에 `previousMap.tokens.find()`가 남지 않는다.
- 함정·근접 이벤트는 전체 object cell이 아니라 공간 인덱스 후보를 대상으로 한다.
- 캐릭터 조회가 발동 함정 수만큼 반복되지 않는다.
- 정상적인 단일 토큰 이동 Socket payload는 전체 맵 크기에 비례하지 않는다.
- delta 버전 불일치 시 전체 맵 재동기화가 가능하다.
- 1배/10배/100배 맵에서 후보 수, 처리 시간, payload byte를 기록할 수 있다.

## PERF-02. 시나리오 목록을 DB 중심으로 전환

상태: 구현 후 검증 대기

구현 메모:

- `ScenarioPublication`은 visibility, moderation status, published/revision 값, fork/report/appeal count, GM mode, tags를 보관한다.
- `ScenarioCollaboratorGrant`는 `(scenarioId, userId)`를 PK로 사용하고 `(userId, scenarioId)` 인덱스로 내 시나리오 권한 조회를 지원한다.
- 공개 목록은 projection의 공개·중재·tag·GM mode 조건과 Scenario 레벨 조건을 DB에 적용하고, 정렬별 최대 100행만 읽는다.
- 내 목록은 `createdByUserId = userId OR collaboratorGrants.some(userId)`를 DB 조건으로 사용하고 발행 revision을 제외한다.
- 중재 큐는 report/appeal count 또는 moderation status가 있는 projection만 최대 100행 조회한다.
- 기존 `offset`은 유지하며 `cursor`가 있으면 고유 scenario ID cursor와 `skip: 1`을 사용한다.
- 시나리오 생성·일반 수정·발행·공개 취소·fork·신고·이의·중재·협업 변경은 attribution과 projection/grant를 같은 Prisma mutation의 nested write로 갱신한다.
- 제공 시나리오 seed는 publication을 PUBLIC/VISIBLE로 upsert한다.
- 목록은 projection/grant SQL이 만든 page와 순서를 후처리로 다시 거르거나 정렬하지 않는다. 응답 호환 필드는 projection 값을 우선 사용하고 legacy parser는 attribution 전용 필드와 dual-read 비교에만 사용한다.
- projection과 parser의 visibility/moderation 값이 다르면 본문 없이 scenario ID와 상태만 경고한다. 상세 조회의 최종 공개 권한 검사는 projection의 visibility와 hidden/removed 상태를 우선 사용하고 projection이 없는 롤백 호환 행만 parser로 판정한다.
- `scripts/backfill-scenario-publication.mjs`는 200행 cursor로 기존 attribution을 변환하고, 페이지당 한 번 협업자 user 존재 여부를 확인한다. 기본 실행은 dry-run이며 `--apply`에서만 DB를 변경하고, 해석 불가능한 marker·협업자 항목은 권한을 넓히지 않은 채 count와 scenario ID 표본으로 보고한다.

### 문제

`be/src/modules/scenarios/scenarios.service.ts`의 목록 경로는 다음 문제가 있다.

- `listMyScenarios()`가 전체 시나리오를 제한 없이 조회한 뒤 사용자 권한을 메모리에서 판정한다.
- 공개 목록은 생성일 오름차순 500개를 먼저 조회한 뒤 공개 상태 필터, 정렬, offset/limit를 적용한다.
- 데이터가 500개를 넘으면 조건에 맞는 최신 데이터가 조회 후보에 들어오지 못한다.
- 공개 상태, 중재 상태, 협업 권한이 `attribution` JSON 문자열에 들어 있어 DB 조건으로 사용하기 어렵다.
- 불필요하게 다른 사용자의 시나리오 행을 애플리케이션으로 읽는 범위가 커진다.

대표 위치:

- `be/src/modules/scenarios/scenarios.service.ts`
- `be/prisma/schema.prisma`
- `shared-types/src/dto/api/scenarios.dto.ts`
- `fe/src/services/scenarioApi.ts`
- `fe/src/pages/ScenarioPage.tsx`

### 목표 데이터 모델

다음 값은 검색·정렬·권한 판정에 사용되므로 JSON 밖으로 승격한다.

- 공개 상태: `UNPUBLISHED`, `LINK`, `PUBLIC`
- 중재 상태: `VISIBLE`, `HIDDEN`, `REMOVED`
- 공개 시각, 최신 revision 번호
- 추천·인기 정렬에 필요한 집계값
- 협업자와 권한

신규 모델 후보:

- `ScenarioPublication`
  - `scenarioId`
  - `visibility`
  - `moderationStatus`
  - `publishedAt`
  - `revisionNumber`
- `ScenarioCollaborator`
  - `scenarioId`
  - `userId`
  - `role`
  - `createdAt`

기존 `attribution` metadata는 응답 호환과 과거 기록을 위해 당분간 유지한다.

### 해결 계획

1. 현재 metadata parser가 생성하는 값을 신규 모델에 매핑하는 backfill 스크립트를 작성한다.
   - 구현 위치: `scripts/backfill-scenario-publication.mjs`
2. 신규 테이블과 인덱스를 추가한다.
3. 시나리오 생성·공개·중재·협업 변경 시 JSON metadata와 신규 모델을 같은 트랜잭션에서 dual write한다.
4. `listMyScenarios()`의 DB 조건을 작성자 또는 collaborator 관계로 제한한다.
5. `listScenarios()`는 공개·중재 조건을 DB에서 적용하고 정렬 조건별 커서 페이지네이션을 제공한다.
6. 기존 `offset`은 호환하되 FE를 cursor 기반 API로 이동한다.
7. 공개 검색의 `PUBLIC_DISCOVERY_SCAN_LIMIT`를 제거한다.
8. 중재 큐도 같은 모델을 사용해 DB에서 신고/이의/상태 조건을 적용한다.
9. dual read 비교 기간 동안 JSON parser 결과와 신규 모델 결과 차이를 로그로 확인할 수 있게 한다.
10. backfill과 소비자 전환이 완료된 뒤 JSON metadata를 검색 조건으로 사용하는 코드를 제거한다.

### 인덱스 후보

- `ScenarioPublication(visibility, publishedAt DESC, scenarioId ASC)`
- `ScenarioPublication(visibility, forkCount DESC, publishedAt DESC, scenarioId ASC)`
- `ScenarioCollaboratorGrant(userId, scenarioId)`
- `Scenario(createdByUserId, updatedAt DESC, id ASC)`
- `Scenario(startLevel, recommendedEndLevel, id)`
- `Scenario(sourceType, createdAt, id)`
- `Scenario(baseScenarioId, createdAt)`

정확한 순서와 partial index 여부는 데이터 분포와 `EXPLAIN` 결과로 확정한다.

### 호환·보안 처리

- 신규 read 배포 전에 dry-run과 backfill apply를 완료해야 한다. projection이 없는 행은 공개 목록에서 fail-closed로 제외하며 배포 파이프라인은 backfill 실패 시 새 BE를 시작하지 않는다.
- 목록 권한 조건은 DB 조회에 포함하고, 상세 조회의 `ensureScenarioVisibleToViewer`는 projection 기반 공개·중재 상태를 최종 방어선으로 유지한다.
- backfill은 권한을 넓히지 않는다. 해석 불가능한 metadata는 비공개로 처리하고 별도 실패 목록에 기록한다.

### Acceptance Criteria

- `listMyScenarios()`가 전체 `Scenario` 행을 조회하지 않는다.
- 공개 목록의 필터·정렬·페이지 처리가 SQL에 반영된다.
- 시나리오 수가 500개를 넘어도 최신 공개 시나리오가 누락되지 않는다.
- 페이지 크기보다 많은 시나리오 본문/metadata를 애플리케이션으로 읽지 않는다.
- 작성자·협업자·공개 사용자 권한 회귀가 없다.

### 적용·검증·rollback

Prisma client codegen과 TypeScript 정적 검사는 완료했다. 저장소 지침에 따라 아래 데이터 변경과 테스트 명령은 이 구현 세션에서 실행하지 않았다.

```bash
npm run backfill:scenario-publication
# dry-run count와 실패가 없음을 확인한 뒤
npm run backfill:scenario-publication:apply
npm test -w @trpg/be -- scenarios.service.spec.ts
```

배포 순서는 additive migration, Prisma client/dual-write 배포, dry-run, backfill apply, projection read 활성화 순서다. 현재 코드는 projection 값을 응답과 권한의 우선 기준으로 사용하면서 `scenario_publication_projection_mismatch` 경고를 남기므로 legacy parser와 dual-read 비교가 가능하다.

rollback 시 read 코드를 attribution parser 경로로 되돌리되 신규 테이블은 즉시 삭제하지 않는다. dual-write를 중단한 뒤 불일치 로그가 없는 기간을 확인하고 별도 migration에서 relation table을 제거한다. offset은 계속 지원하며 FE가 cursor를 실제 페이지 이동에 사용하고 운영 지표가 안정된 뒤 제거 시점을 별도로 결정한다.

## PERF-03. 세션 snapshot 경량화와 delta 이벤트 전환

상태: 구현 후 검증 대기

구현 메모:

- participant와 character 전용 Socket 이벤트 및 FE merge 경로를 사용한다.
- 레벨업과 준비 주문 변경은 `character.updated` 뒤 전체 snapshot을 다시 만들지 않는다.
- `PERFORMANCE_DIAGNOSTICS=1`이면 `session_snapshot_built`에서 생성 시간, JSON byte, 실제 Prisma SQL 수·DB 시간, 서비스 operation 수와 participant/character/inventory/resource/scenario/pending approval 반환 row 수를 기록하고 `realtime_payload`에서 실제 snapshot event byte를 기록한다.
- `StateDiff.diff` 전체는 감사 로그 호환을 위해 자유형 object를 유지하되, 실시간 자동 적용은 `characters[]` 계약을 shared parser가 검증한 경우로 제한한다. version gap·알 수 없는 entity·다른 도메인의 diff는 `session.resync`로 복구한다.
- shared parser는 기존 Human GM 감사 계약의 `sessionCharacters[]`·`combatParticipants[]`도 동일한 안전 patch로 정규화한다. 식별자·HP·조건·생존 타입이 잘못되거나 서로 모순되면 적용하지 않고 재동기화한다.
- `ActionProcessorService`의 순수 캐릭터 상태 변경은 검증된 diff로 전환했다. 주문 슬롯·인벤토리·휴식 자원처럼 snapshot DTO에 별도 데이터가 있는 runtime effect는 전체 snapshot을 계속 발행한다.
- Human GM의 전투 HP·조건 변경은 HTTP 응답용 snapshot은 유지하지만 `state.diff.applied`와 `combat.updated` 뒤 전체 snapshot을 추가 broadcast하지 않는다.

### 문제

`be/src/modules/sessions/session-snapshot.service.ts`는 snapshot 생성 시 다음 데이터를 함께 조회한다.

- joined participant와 user
- participant의 sessionCharacter, Character, resource, inventoryEntries, ItemDefinition
- active sessionCharacters와 같은 Character/resource/inventoryEntries
- 모든 sessionScenario와 Scenario/GameState
- pending rest approval PlayerAction

`mapParticipant()`는 캐릭터 ID만 사용하므로 participant 아래의 Character, resource, inventory 전체 조회는 불필요하다. 또한 전투·인벤토리·캐릭터·세션 변경 경로에서 snapshot을 자주 재생성하고 방 전체에 브로드캐스트한다.

대표 위치:

- `be/src/modules/sessions/session-snapshot.service.ts`
- `be/src/common/mappers/domain.mapper.ts`
- `be/src/modules/realtime/realtime-events.service.ts`
- `be/src/modules/combat/combat.service.ts`
- `be/src/modules/combat/combat-action.service.ts`
- `be/src/modules/actions/action-processor.service.ts`
- `fe/src/hooks/useSession.ts`

### 해결 계획

1. snapshot query를 DTO별 select로 축소한다.
   - participant 아래 sessionCharacter는 `id`, `characterId`만 조회한다.
   - 캐릭터 상세와 인벤토리는 `sessionCharacters`에서 한 번만 조회한다.
   - sessionScenario는 클라이언트가 사용하는 필드만 선택한다.
2. 기존 `SessionSnapshotService`에 snapshot/detail query shape와 계측을 모은다.
3. `buildSnapshot()` 호출 위치를 분류한다.
   - 최초 접속/재접속/명시적 refresh: 전체 snapshot 유지
   - 참가자 상태: `participant.updated`
   - 캐릭터 HP·인벤토리·상태: `character.updated`
   - 검증 가능한 캐릭터 GameState 변경: `state.diff.applied`
   - 전투 변경: `combat.updated`와 FE character merge
   - VTT 변경: PERF-01의 map delta
4. mutation 결과를 반환하는 서비스는 변경된 DTO와 version을 함께 반환하도록 정리한다.
5. FE reducer가 각 delta를 동일 snapshot 상태에 적용한다.
6. 클라이언트가 이벤트 version gap을 감지하면 전체 snapshot을 다시 요청한다.
7. 동일 요청 흐름에서 `buildSnapshot()`을 두 번 호출하는 경로를 제거한다.
8. pending rest approval은 snapshot 전체와 분리된 작은 조회/이벤트로 이동할 수 있는지 측정 후 결정한다.

### 호환·실패 처리

- 전체 snapshot endpoint와 `session.snapshot` 이벤트는 재동기화 계약으로 유지한다.
- delta 적용 실패 또는 알 수 없는 entity ID가 오면 FE는 로컬 상태를 추측해서 복구하지 않고 snapshot refresh를 요청한다.
- version은 서버 권위 값을 사용하며 클라이언트가 임의로 증가시키지 않는다.

### Acceptance Criteria

- participant include에서 Character/resource/inventoryEntries를 조회하지 않는다.
- 단일 HP 변경이나 참가자 준비 상태 변경이 전체 snapshot broadcast를 요구하지 않는다.
- 최초 접속과 version gap 복구는 기존 snapshot으로 정상 동작한다.
- snapshot DB query 수, 반환 row 수, JSON byte를 계측할 수 있다.
- 같은 명령 처리 경로에서 중복 snapshot 생성이 없다.

## PERF-04. AI 품질 지표를 DB 집계로 변경

상태: 구현 후 검증 대기

구현 메모:

- 품질 지표는 AiTrace aggregate와 kind/status/fallbackUsed groupBy만 사용하고 responseJson을 조회하지 않는다.
- trace 목록은 kind/status 필터, 최대 100행, (createdAt, id) 안정 정렬, 검증된 ID cursor와 nextCursor를 제공한다.
- cursor가 현재 session/filter 범위의 trace가 아니면 빈 페이지로 오해하지 않도록 400으로 거절한다.
- `scripts/backfill-ai-trace-fallback.mjs`는 ID 범위 cursor로 기존 trace를 읽어 `failureType`, `responseJson.fallback`, `responseJson.trace.failureType`을 구조적으로 판정한다. 기본은 dry-run이고 `--apply`에서만 false→true를 멱등 갱신하며 JSON 파싱 실패 ID/count를 본문 없이 보고한다.

### 문제

`be/src/modules/ai/ai.service.ts#getQualityMetrics()`는 세션의 모든 `AiTrace`를 조회하고 `responseJson`을 애플리케이션에서 파싱해 fallback 여부와 timeout 비율을 계산한다.

세션이 길어질수록 다음 값이 함께 증가한다.

- DB에서 읽는 행 수와 JSON byte
- Node.js heap 사용량
- 여러 번의 `filter()` 순회
- `JSON.parse()` CPU

### 해결 계획

1. `AiTrace`에 집계에 필요한 구조화 필드를 추가한다.
   - `fallbackUsed Boolean @default(false)`
   - 필요하면 `roleOutcome` 또는 정규화된 `failureCategory`
2. AI trace 기록 시 response JSON을 다시 읽지 않고 호출 결과에서 `fallbackUsed`를 결정한다.
3. 기존 trace를 위한 backfill 스크립트를 작성한다.
   - 파싱 실패 행은 false로 확정하지 않고 실패 목록으로 기록한다.
4. 지표 API를 SQL aggregate 또는 Prisma `groupBy` 조합으로 변경한다.
   - kind/status별 count
   - fallbackUsed count
   - 평균·최대·percentile latency는 PostgreSQL 집계가 필요하면 raw query를 좁게 사용한다.
5. 시간 범위를 추가한다.
   - 기본: 전체 세션 호환
   - 운영 화면: 최근 24시간/7일/30일 선택
6. 전체 이력이 필요한 감사 API와 운영 지표 API를 분리한다.
7. trace 목록은 cursor pagination을 추가한다.

### 인덱스 후보

- `AiTrace(sessionId, createdAt)`은 유지한다.
- 필터 조합이 빈번하면 `AiTrace(sessionId, kind, status, createdAt)`를 추가한다.
- `fallbackUsed` 단독 인덱스는 cardinality가 낮으므로 실제 계획 없이 추가하지 않는다.

### Acceptance Criteria

- 품질 지표 경로가 `responseJson`을 select하거나 파싱하지 않는다.
- 애플리케이션으로 반환되는 row 수가 전체 trace 수에 비례하지 않는다.
- 기존 데이터와 신규 구조화 필드의 지표 결과를 비교할 수 있다.
- 목록 API는 cursor와 최대 page size를 가진다.

### 적용·검증·rollback

Prisma client codegen과 TypeScript 정적 검사는 완료했다. 저장소 지침에 따라 아래 backfill과 테스트 명령은 이 구현 세션에서 실행하지 않았다.

```bash
npm run backfill:ai-trace-fallback
# parseFailureCount와 wouldUpdate를 확인한 뒤
npm run backfill:ai-trace-fallback:apply
npm test -w @trpg/be -- ai.service.spec.ts
```

배포 파이프라인은 additive schema 반영 후 초기 dry-run/apply를 실행하고, 구 BE writer를 중지한 경계에서 최종 catch-up apply를 한 번 더 수행한 뒤 새 BE를 기동한다. catch-up 실패 시 기존 컨테이너를 다시 시작한다. rollback 시 구조화 컬럼은 유지하고 이전 BE image로 되돌릴 수 있으며, backfill은 false→true만 갱신하므로 재실행 가능하다.

## PERF-05. 조회 패턴 기반 인덱스 보완

### 문제

PostgreSQL은 외래 키 컬럼에 자동으로 인덱스를 만들지 않는다. 현재 Prisma schema에는 일부 관계·목록 조회를 위한 인덱스가 없어 데이터 증가 시 순차 scan, 큰 sort, cascade 처리 지연이 발생할 수 있다.

대표 위치:

- `be/prisma/schema.prisma`
- `be/src/modules/sessions/sessions.service.ts`
- `be/src/modules/characters/characters.service.ts`
- `be/src/modules/scenarios/scenarios.service.ts`
- `be/src/modules/turn-logs/turn-logs.service.ts`

### 우선 검토 인덱스

| 모델 | 후보 인덱스 | 근거 조회 |
| --- | --- | --- |
| Session | `(visibility, status, createdAt, id)` | 공개 세션 목록 |
| Session | `(hostUserId, updatedAt, id)` | 호스트 세션/내 세션 |
| Character | `(ownerUserId, createdAt, id)` | 내 캐릭터 목록 |
| ScenarioNode | `(scenarioId, createdAt, id)` | 시나리오 snapshot·에셋 참조 제거 |
| SessionScenario | `(scenarioId, id, sessionId)` | 시나리오 연결 세션의 ID cursor·covering 조회 |
| SessionScenario | `(sessionId, status)` | 활성 시나리오 조회 |
| TurnLog | `(playerActionId, createdAt)` | 최신 player action 로그 실패 처리 |
| AiTrace | `(sessionId, createdAt, id)` | 안정 cursor trace 목록 |
| AiTrace | `(sessionId, kind, status, createdAt, id)` | trace 필터·목록·집계 |

PERF-02의 신규 공개·협업 테이블 인덱스는 해당 단계에서 함께 추가한다.

### 해결 계획

1. 1배/10배/100배 시드 DB에서 대표 쿼리의 `EXPLAIN (ANALYZE, BUFFERS)`를 저장한다.
2. 각 후보 인덱스가 scan row와 sort를 실제로 줄이는지 확인한다.
3. 중복되거나 prefix가 겹치는 인덱스를 정리한다.
4. 읽기 개선과 쓰기·storage 비용을 함께 기록한다.
5. 운영 DB 적용 시 큰 테이블은 `CREATE INDEX CONCURRENTLY`가 필요한지 판단한다.
6. Prisma migration transaction과 concurrent index 생성의 제약을 고려해 migration runbook을 작성한다.
7. FK cascade 대상 child table의 조인 키 인덱스도 함께 확인한다.

### Acceptance Criteria

- 모든 신규 인덱스에 대응하는 실제 query와 실행계획 근거가 있다.
- 주요 목록 쿼리가 큰 sequential scan 후 애플리케이션 정렬을 하지 않는다.
- 중복 인덱스를 추가하지 않는다.
- migration의 lock, 예상 시간, rollback 절차가 기록된다.

구현 메모:

- Prisma schema와 additive SQL에 실제 목록·관계 조회의 복합 인덱스를 반영했다.
- trace 인덱스는 API의 `(createdAt DESC, id DESC)` 안정 정렬과 같은 tie-breaker를 포함한다.
- 대표 read-only SQL은 `scripts/performance/explain-performance-queries.sql`에 모았고 scale별 원본 plan을 결과 템플릿에 기록한다.
- 큰 운영 테이블은 staging의 행 수·index build 시간과 운영 write 허용치를 확인한 뒤 `CREATE INDEX CONCURRENTLY` 사전 생성 여부를 결정하도록 RUNBOOK에 절차를 남겼다.

## PERF-06. 프론트 로그 상태와 렌더링 상한 설정

상태: 구현 후 검증 대기

구현 메모:

- `useLogs`는 로그 ID 조회를 `Map`으로 처리하고, 최신/과거 batch를 reducer 액션 한 번으로 병합한다.
- API가 최신순으로 반환한 TurnLog의 결과와 raw input 순서를 유지한 채 한 페이지를 `appendOlderLogs`로 전달한다.
- 메모리에는 최신 10,000개까지만 유지하고, Main/Chat 프레젠테이션 변환과 DOM 렌더링은 각각 최대 200행으로 제한한다.
- 고정 높이를 가정하는 외부 virtualizer 대신 100행씩 겹치는 가변 높이 window를 사용하며, 불러온 범위 안에서 이전/최신 기록으로 이동할 수 있다.
- 과거 페이지가 현재 window 앞에 추가되면 `scrollHeight` 차이를 기존 `scrollTop`에 더해 읽던 위치를 보존한다.
- realtime 중복 제거와 pending 교체는 기존 TurnLog ID 계약을 유지한다.

### 문제

`fe/src/hooks/useLogs.ts`는 로그 하나를 추가할 때마다 전체 배열에서 ID를 찾고 전체 배열을 복사한다. 과거 페이지는 각 TurnLog를 개별 append하며 raw input과 결과 로그를 따로 추가한다. `PlayPage`는 누적된 로그 전체를 DOM에 렌더링한다.

대표 위치:

- `fe/src/hooks/useLogs.ts`
- `fe/src/hooks/useSession.ts`
- `fe/src/features/sessionPlay/hooks/useSessionRenderedLogs.ts`
- `fe/src/features/sessionPlay/hooks/useSessionLogThreadRows.ts`
- `fe/src/pages/PlayPage.tsx`

### 해결 계획

1. 로그 상태를 reducer로 이동한다.
   - `orderedIds: string[]`
   - `byId: Map` 또는 직렬화 가능한 Record
   - `seenTurnLogIds`
2. `appendMany` 액션을 추가해 API 한 페이지를 한 번의 상태 갱신으로 병합한다.
3. raw input과 결과 row 생성은 페이지 변환 단계에서 한 번에 수행한다.
4. 표시 가능한 로그 수와 메모리에 유지할 로그 수를 분리한다.
5. `react-window` 등 기존 의존성 검토 후 가상화를 적용한다.
   - 새 의존성 없이 구현할 경우 고정 window + 위/아래 spacer 방식을 사용한다.
6. 날짜 구분선과 가변 높이 메시지를 고려해 실제 UI에 맞는 virtualizer를 선택한다.
7. 세션 변경 시 ordered IDs, byId, seen IDs를 동일 reducer 액션으로 초기화한다.
8. pending log 교체와 realtime 중복 제거가 ID 기반 O(1)에 가깝게 동작하도록 한다.

### 호환·UX 처리

- 이전 로그를 불러온 뒤 현재 읽던 위치가 움직이지 않도록 scroll anchor를 보존한다.
- 가상화되어 DOM에서 사라진 로그도 검색·접근성 요구가 있으면 별도 탐색 UI를 제공한다.
- 현재 Main/Chat scope 분리와 날짜 구분선 표시를 유지한다.

### Acceptance Criteria

- 10개 과거 로그를 불러올 때 React state update가 로그 수만큼 발생하지 않는다.
- 로그 추가 시 전체 배열 `some()`과 `map()`을 연속 수행하지 않는다.
- 로그가 10,000개 메모리에 있어도 화면 DOM row 수는 정한 window 상한을 넘지 않는다.
- 이전 로그 로딩 전후 scroll anchor가 유지된다.
- pending 로그 교체와 realtime 중복 제거 동작이 유지된다.

## PERF-07. 장면 전환 증거를 관련 데이터로 제한

상태: 구현 후 검증 대기

구현 메모:

- `MainCommandTransitionCandidateService`가 파싱한 structured rule을 증거 조회 전에 전달한다.
- `CLUE_REVEALED`는 필요한 `contentId`, `NODE_VISITED`는 필요한 `nodeId`만 중복 제거해 조회한다.
- `COMBAT_RESOLVED`와 `FLAG_SET`은 이미 로드된 `GameState.flagsJson`을 사용하므로 추가 이력 조회를 만들지 않는다.
- `default`/`always` 전환은 `SessionReveal`과 `SessionNodeVisit`을 조회하지 않는다.
- 자유 텍스트 조건만 최근 공개 단서 50개를 사용한다. TurnLog는 기존과 동일하게 최근 12개 중 전환 로그를 제외한 최대 8개를 판정에 사용한다.
- 현재 노드 힌트의 단서 완료 판정은 현재 노드 clue ID를 추출해 정확 조회한다.
- 기존 `SessionReveal`의 session/content 복합 unique와 `SessionNodeVisit`의 session/node unique로 필요한 projection 역할을 충족하므로 별도 `SessionProgressProjection` 테이블은 도입하지 않았다.
- 자연어 fallback의 최근 clue 조회는 `(sessionScenarioId, contentKind, revealedAt)` 복합 인덱스로 지원한다.
- `PERFORMANCE_DIAGNOSTICS=1`에서 `transition_evidence_built`가 후보 수, 요청 clue/node ID 수, 최근 로그·결과 개수와 JSON byte를 본문 없이 기록한다.

### 문제

`be/src/modules/actions/main-command-progress-evidence.service.ts`는 장면 전환 판정 시 해당 SessionScenario의 모든 공개 단서와 방문 노드를 조회한다. 단서 snapshot JSON을 모두 파싱하고 문자열로 합쳐 전환 조건 판정과 AI 요청 컨텍스트에 사용한다.

대표 위치:

- `be/src/modules/actions/main-command-progress-evidence.service.ts`
- `be/src/modules/actions/main-commands.service.ts`
- `be/src/modules/actions/main-command-transition-evaluator.service.ts`
- `ai/app/services/interpreter/service.py`

### 해결 계획

1. transition candidate를 deterministic requirement로 먼저 파싱한다.
2. requirement에서 필요한 evidence key를 추출한다.
   - clue ID
   - node ID
   - combat resolved node ID
   - object state key
   - flag key
3. ID가 명시된 조건은 해당 ID만 DB에서 조회한다.
4. 자유 텍스트 조건의 AI 보조 판정은 최근 로그와 현재 노드 중심의 제한된 후보만 전달한다.
5. `GameState.flagsJson`에 이미 있는 완료 상태와 별도로 진행 증거 projection이 필요한지 측정한다.
6. 필요하면 `SessionProgressProjection` 테이블을 도입한다.
   - `sessionScenarioId`
   - `evidenceKey`
   - `evidenceType`
   - `valueJson`
   - `updatedAt`
7. reveal/visit/combat 완료 트랜잭션에서 projection을 갱신한다.
8. 전환 판정은 projection을 읽고 원본 로그/JSON은 감사와 fallback에만 사용한다.

### 호환·실패 처리

- structured requirement의 evidence ID가 없으면 해당 조건을 충족하지 않은 것으로 안전하게 판정한다. 자유 텍스트 조건만 제한된 최근 원본을 fallback으로 사용한다.
- AI에 전달하는 정보를 줄여도 deterministic requirement 판정 결과는 바뀌지 않아야 한다.
- 자유 텍스트 조건은 confidence가 낮으면 기존 GM review 흐름을 유지한다.
- 별도 `SessionProgressProjection`은 현재 query/payload 증가율이 운영 기준을 넘을 때만 도입하고, 그때 원본 기반 결과 비교와 누락 fallback을 함께 구현한다.

### Acceptance Criteria

- ID 기반 전환 판정이 모든 reveal/visit 행을 조회하지 않는다.
- AI transition context에 세션 전체 단서·방문 이력이 포함되지 않는다.
- structured requirement 결과가 기존 evaluator 계약과 동일하고 없는 evidence key는 안전하게 미충족 처리된다.
- 자유 텍스트 fallback의 단서·로그 상한이 유지된다.
- 후보 수, query 수, 결과 수, 처리 시간과 payload byte를 같은 형식으로 비교할 수 있다.

## PERF-08. AI SRD 검색 인덱스 도입

상태: 구현 후 검증 대기

구현 메모:

- 주문·아이템·몬스터·상태·종족·직업 용어는 기존 배열 순번을 보존한 `_SubstringIndex`에 등록한다.
- exact alias map과 2/3-gram posting으로 후보 term 순번을 좁힌 뒤 기존 `term in haystack` 검증과 entity ID 중복 제거를 적용하므로 결과 우선순위와 limit 계약을 유지한다.
- rule card는 title/domain/summary keyword를 초기화 시 정규화하고, 역색인 후보에 대해서만 기존 가중치 합산과 `(-score, id)` 정렬을 수행한다.
- rule hook은 source entity ID, source rule ID, 일반 text term, hook별 특수 term을 각각 precompute하고 후보 hook에 대해서만 기존 점수식을 수행한다.
- `SrdRetriever.index_stats`와 `srd_retriever_index_built` 로그는 build duration, entity/term/alias/ngram/posting 수, 추정 index byte를 제공한다.
- `ai/scripts/benchmark_srd_retrieval.py`는 원본 검색어·규칙 연결에 적중하지 않는 합성 항목으로 카탈로그를 1배·10배·100배로 확장해 construction time과 검색 p50/p95/max, 대표 결과 ID를 JSON으로 기록한다. scale별 결과 ID 순서가 다르면 `result_consistency.pass=false`와 종료 코드 2로 실패한다.
- FE 원본 SRD는 이미 도메인 파일로 나뉘어 있었다. 추가로 `class-features.json`을 sync 시 직업별 파일로 분할하고 플레이·캐릭터 상세 화면은 필요한 직업만 로드한다.
- 이전 배포처럼 직업별 파일이 없으면 전체 manifest를 한 번 읽어 요청한 직업만 필터링하는 호환 fallback을 유지한다.

### 문제

`ai/app/srd/retrieval.py`는 카탈로그를 메모리에 cache하지만 검색 시 주문·아이템·몬스터·상태·종족·직업 용어를 선형 탐색한다. 규칙 카드와 훅은 매 요청마다 전체 후보의 점수를 계산하고 정렬한다.

대표 위치:

- `ai/app/srd/retrieval.py`
- `ai/app/services/interpreter/service.py`
- `ai/app/srd/build.py`
- `fe/src/services/staticSrd.ts`

### 해결 계획

1. 초기화 시 정규화된 용어와 keyword를 한 번만 계산한다.
2. exact alias용 `dict[str, entityIds]`를 만든다.
3. 부분 문자열 검색은 2-gram/3-gram 역색인으로 후보를 좁힌 뒤 기존 검증 로직을 적용한다.
4. rule card/hook의 keyword set과 source ID set을 초기화 시 precompute한다.
5. 후보 점수 정렬은 전체 카탈로그가 아니라 역색인 후보에 대해서만 수행한다.
6. 인덱스 생성 시간과 메모리 크기를 startup metric으로 기록한다.
7. 카탈로그가 매우 커질 때만 SQLite FTS나 외부 검색 저장소를 검토한다.
8. FE 정적 SRD 파일은 실제 화면 단위로 분할한다.
   - 클래스 생성 화면은 클래스/종족에 필요한 데이터만 로드한다.
   - 플레이 화면은 현재 캐릭터와 현재 룰에 필요한 manifest만 로드한다.
   - 전체 카탈로그 관리 화면만 전체 파일을 로드한다.

### Acceptance Criteria

- 일반 검색이 모든 entity term을 순회하지 않는다.
- keyword 정규화가 요청마다 반복되지 않는다.
- 기존 SRD 검색 결과 순서와 최대 결과 수가 유지된다.
- 1배/10배/100배 카탈로그의 검색 시간과 메모리 사용량을 비교할 수 있다.
- 플레이 첫 화면에서 필요하지 않은 전체 spell/item/monster 파일을 다운로드하지 않는다.

### 검증 명령과 결과 기록

저장소 지침에 따라 아래 테스트와 benchmark 명령은 이 구현 세션에서 실행하지 않았다.

```bash
cd ai
python -m pytest app/tests/test_srd_retrieval.py app/tests/test_srd_rules.py app/tests/test_srd_rule_hooks.py app/tests/test_srd_retrieval_index.py
python scripts/benchmark_srd_retrieval.py --scales 1 10 100 --iterations 100 --output benchmarks/srd_retrieval_index_result.json
```

결과 파일에서 scale별 `construction_ms`, `index.estimated_bytes`, `search.p50_ms`, `search.p95_ms`, `search.max_ms`, `result_ids`를 비교한다. `result_consistency.pass`가 true여야 하며 실제 측정 결과는 `ai/benchmarks/srd_retrieval_index_result.json`에 보관한다.

## PERF-09. 시나리오 중재 로그 N+1 제거

상태: 구현 후 검증 대기

구현 메모:

- 활성 연결 `SessionScenario`는 ID 오름차순 cursor와 page size 500으로 끝까지 조회하므로 기존 100개 제한이 없다.
- 각 페이지는 고유 session ID를 모아 `TurnLog.groupBy(sessionId)._max(turnNumber)`를 한 번 호출한다.
- 같은 session에 동일 시나리오 snapshot이 여러 개 연결된 경우 페이지 내부 counter로 서로 다른 연속 turnNumber를 배정한다.
- 생성 payload는 `createMany(skipDuplicates: true)` 한 번으로 저장한다.
- `TurnLog.idempotencyKey`는 `moderationActionId:sessionScenarioId`이며 nullable unique라 기존 TurnLog 생성 계약에는 영향을 주지 않는다.
- `createMany.count`가 요청 수보다 작으면 idempotency key로 이미 생성된 로그를 한 번 조회하고, `(sessionId, turnNumber)` 경쟁으로 빠진 항목만 최신 번호를 다시 읽어 최대 3회 재시도한다.
- 동일 moderation 요청이 재전송되면 기존 action ID로 전체 cursor 작업을 다시 수행하므로 이전 응답 실패로 누락된 연결 session 로그를 보충할 수 있다.
- 중재 API는 현재 동기식이다. 모든 활성 연결 session의 로그 생성 또는 충돌 복구가 끝난 뒤 응답하며, 복구할 수 없는 DB 오류는 응답 실패로 드러낸다.
- 정상 경로의 페이지당 쿼리는 연결 수와 무관하게 연결 조회 1회, 최신 번호 group 1회, batch insert 1회다. 외부 queue/outbox는 실제 측정에서 동기 응답 시간이 운영 기준을 넘을 때 도입한다.
- `PERFORMANCE_DIAGNOSTICS=1`에서 `scenario_moderation_turn_logs_built`가 처리 시간, 연결 수, page/query/groupBy/createMany/recovery/retry 수와 생성·중복 제거 수를 기록한다. 실패 시 Prisma 오류 코드는 남기되 중재 사유나 로그 본문은 남기지 않는다.

### 문제

`ScenariosService.createScenarioModerationTurnLogsForLinkedSessions()`는 연결 SessionScenario마다 최신 TurnLog를 조회하고 새 TurnLog를 순차 생성한다. 현재 최대 100개로 제한되어 있어 연결 세션이 그보다 많으면 나머지는 처리되지 않는다.

대표 위치:

- `be/src/modules/scenarios/scenarios.service.ts`
- `be/src/modules/turn-logs/turn-logs.service.ts`
- `be/prisma/schema.prisma`

### 해결 계획

1. 연결 세션을 cursor로 페이지 처리해 고정 100개 누락을 제거한다.
2. 세션별 최신 turnNumber를 한 번의 group query 또는 별도 session counter로 조회한다.
3. TurnLog 생성 payload를 모아 `createMany` 가능 여부를 확인한다.
4. `(sessionId, turnNumber)` unique 충돌과 동시 명령 생성을 고려해 재시도 정책을 둔다.
5. 중재 이벤트가 즉시 모든 세션에 기록될 필요가 없다면 outbox/job 방식으로 분리한다.
6. 외부 queue 도입 전 DB outbox 테이블로 충분한지 먼저 검토한다.

### Acceptance Criteria

- 연결 세션마다 최신 로그 조회 쿼리를 개별 실행하지 않는다.
- 100개를 넘는 연결 세션이 누락되지 않는다.
- 동시 TurnLog 생성 시 unique 충돌을 복구하거나 명시적으로 재시도한다.
- 중재 API의 응답 시간과 실제 로그 반영 상태가 문서화된다.

### 검증 명령과 결과 기록

Prisma client codegen과 TypeScript 정적 검사는 완료했다. 저장소 지침에 따라 아래 테스트 명령은 이 구현 세션에서 실행하지 않았다.

```bash
npm test -w @trpg/be -- scenarios.service.spec.ts
```

1배·10배·100배 연결 session fixture는 각각 1개, 100개, 10,000개를 사용한다. moderation API의 전체 응답 시간, `SessionScenario` page 수, `TurnLog groupBy/createMany` 호출 수, retry 수, action ID별 최종 TurnLog 수를 기록한다. 최종 로그 수는 활성 연결 `SessionScenario` 수와 같아야 하고 idempotency key 중복은 0이어야 한다.

## 구현 순서

### Phase 0. 기준선과 계측 준비

1. dry-run 기본 성능 fixture 생성기를 사용한다.
   - `scripts/performance/seed-scale.mjs`
   - scale: `1`, `10`, `100`
   - prefix로 격리된 일반 사용자와 운영자, parser/projection 양쪽에서 유효한 공개 revision·노드, 공개 세션, 장기 세션 TurnLog/AiTrace를 생성한다.
   - 대표 snapshot 세션에는 4/40/400명 participant·character·resource와 20/200/2,000개 inventory entry를 생성한다.
   - 대표 진행 세션에는 100/1,000/10,000개 SessionReveal·SessionNodeVisit과 같은 수의 session-owned node를 생성한다.
   - PlayerAction·TurnLog·StateDiff·AiTrace는 각각 1,000/10,000/100,000개를 연결된 이력으로 생성한다.
   - 공통 중재 대상 시나리오에는 scale별 1/100/10,000개 활성 SessionScenario를 연결한다.
   - 같은 prefix가 이미 있으면 부분 fixture에 조용히 합치지 않고 실패하므로 cleanup 후 다시 생성한다.
   - 실제 생성과 삭제는 각각 `--apply`, `--cleanup --apply`를 명시해야 한다.
2. API benchmark runner를 사용한다.
   - `scripts/performance/run-api-benchmark.mjs`
   - 같은 route·요청 수·동시성으로 scale별 p50/p95/p99, 처리량, error rate, response byte를 기록한다.
   - 기본 실행은 요청을 보내지 않는 dry-run이며 URL·header 이름·부하 설정을 확인한 뒤 `--run`을 명시한다. localhost가 아닌 대상은 `--allow-remote`도 필요하다.
   - 각 요청은 `--timeout-ms` 제한을 가지며 결과 파일에는 인증 header 값이 기록되지 않는다.
3. 결정적 VTT fixture runner로 100/1,000/10,000 token·objectCell의 full/delta byte와 build/apply 시간을 기록한다.
   - `scripts/performance/benchmark-vtt-payload.mjs`
   - `scripts/performance/benchmark-vtt-spatial.ts`는 100/1,000/10,000 object에서 local/wide query의 후보 수, index/full-scan 시간, chunk/fallback 전략과 false negative 여부를 기록한다.
4. Socket payload byte와 snapshot 생성 시간을 `PERFORMANCE_DIAGNOSTICS=1` 개발 환경에서 기록한다.
5. 대표 SQL의 `EXPLAIN (ANALYZE, BUFFERS)` 결과를 `doc/dev-notes/`에 날짜별 기록한다.
6. 기준선 없이 latency SLO 숫자를 임의로 확정하지 않는다.

### Phase 1. 빠른 P1 개선

1. PERF-04 AI 품질 지표 구조화 필드와 aggregate 적용.
2. PERF-05 실행계획 기반 인덱스 추가.
3. PERF-03 participant snapshot overfetch 제거.
4. 같은 요청에서 중복 snapshot 생성하는 경로 제거.

이 단계는 API/Socket shape를 거의 바꾸지 않고 읽기 비용을 줄인다.

### Phase 2. 시나리오 검색·권한 모델 정규화

1. PERF-02 신규 공개/협업 모델 migration.
2. backfill과 dual write.
3. DB 기반 목록과 cursor API.
4. FE 목록 소비자 전환.
5. JSON metadata 목록 필터 제거.

### Phase 3. VTT 연산 최적화

1. PERF-01 토큰 Map과 batch character load.
2. 공간 인덱스 도입.
3. map delta 계산과 v2 이벤트.
4. FE delta 적용과 version gap 재동기화.
5. 전체 맵 이벤트 축소.
6. 측정 결과에 따라 VTT 상태 저장 분리 결정.

### Phase 4. snapshot delta 전환

1. PERF-03 mutation별 delta event 계약 정의.
2. BE publisher 전환.
3. FE reducer 적용.
4. version gap fallback 확인.
5. 일반 변경 경로의 전체 snapshot broadcast 제거.

### Phase 5. 장기 세션 UI와 진행 증거

1. PERF-06 로그 reducer와 appendMany.
2. 로그 가상화와 scroll anchor.
3. PERF-07 evidence key 기반 조회.
4. 필요할 경우 progress projection 도입.

### Phase 6. 콘텐츠 검색과 운영성 개선

1. PERF-08 AI SRD 역색인.
2. FE 정적 SRD 파일 분할.
3. PERF-09 중재 로그 batch/outbox.

## 마이그레이션 전략

### DB 변경 순서

1. nullable/default 기반 신규 컬럼·테이블 추가.
2. 신규 코드가 old/new 양쪽을 쓸 수 있게 배포 준비.
3. backfill 실행.
4. old/new 결과 비교.
5. 읽기 경로를 신규 모델로 전환.
6. 충분한 확인 후 제약 조건 강화.
7. 구형 metadata 의존 제거는 별도 후속 변경으로 수행.

### Socket 변경 순서

1. v2 delta DTO 추가.
2. 서버가 v1 전체 이벤트와 v2 delta를 함께 발행.
3. FE가 v2를 소비하고 version gap에서 v1/snapshot fallback.
4. 모든 소비자가 전환된 뒤 v1 발행 빈도 축소.
5. 제거 시점은 별도 호환성 결정으로 남긴다.

### 롤백 원칙

- 신규 인덱스는 코드 롤백과 독립적이어야 한다.
- dual write 단계에서는 신규 모델 write 실패가 기존 핵심 플레이 mutation을 부분 성공시키지 않도록 트랜잭션 경계를 명확히 한다.
- delta 이벤트 문제 발생 시 서버가 전체 snapshot/map 이벤트로 되돌아갈 수 있어야 한다.
- backfill은 재실행 가능하고 이미 처리된 행을 안전하게 건너뛴다.

## 관측 항목

구현 전후 다음 항목을 같은 데이터셋에서 비교한다.

- API p50, p95, p99와 error rate
- Prisma query 수와 총 DB 시간
- PostgreSQL scan rows, sort method, buffer hit/read
- Node.js heap 증가량과 event loop delay
- snapshot JSON byte와 생성 시간
- VTT update host/player payload byte
- Socket room fanout 총 byte
- FE state update 횟수, commit duration, DOM row 수
- AI SRD 검색 시간, 후보 수, startup index memory
- AI prompt 내 transition evidence byte/token 추정치

민감한 request/response 본문은 성능 로그에 그대로 남기지 않고 byte, count, duration 중심으로 기록한다.

## Test Plan

테스트와 벤치마크는 사용자가 직접 선택해 실행한다. 아래 명령은 구현 단계에서 권장하는 순서다.

### 1. 기존 회귀 테스트

- shared 타입/빌드
  - `npm run build -w @trpg/shared-types`
- 백엔드 빌드
  - `npm run build -w @trpg/be`
- 프론트 빌드
  - `npm run build -w @trpg/fe`
- 백엔드 단위 회귀
  - `npm run test:quiet -w @trpg/be`
- AI 단위 회귀
  - AI 프로젝트의 기존 `pytest` 명령으로 `ai/app/tests` 실행

### 2. 신규 집중 테스트

- VTT token index 결과와 기존 전체 scan 결과 비교
- hazard/proximity 후보 누락 여부
- map delta 순서·중복·version gap 재동기화
- snapshot slim query의 DTO 동일성
- 시나리오 작성자/협업자/공개/중재 권한 조합
- AI metric aggregate와 기존 in-memory 결과 비교
- 로그 appendMany 순서, 중복 제거, pending 교체
- progress projection과 기존 원본 계산 비교
- SRD indexed retrieval과 기존 linear retrieval 결과 비교

### 3. 성능 데이터 검증

구현된 benchmark script 기준 예시:

```bash
npm run benchmark:performance:seed -- --scale=1
npm run benchmark:performance:seed -- --scale=1 --apply
# 측정 완료 후 같은 prefix만 제거
npm run benchmark:performance:seed -- --scale=1 --cleanup --apply

psql "$DATABASE_URL" -v scale=1 -v prefix='perf_1x_' \
  -f scripts/performance/verify-scale-fixture.sql

npm run benchmark:performance:vtt -- --iterations=100 --output=doc/dev-notes/results/vtt-payload.json
npm run benchmark:performance:vtt-spatial -- --iterations=100 --output=doc/dev-notes/results/vtt-spatial.json

npm run benchmark:performance:api -- \
  --name=public-scenario-list \
  --scale=1 \
  --base-url=http://localhost:8080/api/v1 \
  --route=/scenarios?limit=20 \
  --requests=100 \
  --concurrency=10 \
  --timeout-ms=30000 \
  --header=x-user-id:perf_1x_user \
  --run \
  --output=doc/dev-notes/results/public-scenario-list-1x.json

npm run benchmark:performance:api -- \
  --name=session-detail \
  --scale=1 \
  --base-url=http://localhost:8080/api/v1 \
  --route=/sessions/perf_1x_session-0 \
  --requests=100 \
  --concurrency=10 \
  --timeout-ms=30000 \
  --header=x-user-id:perf_1x_user \
  --run \
  --output=doc/dev-notes/results/session-detail-1x.json

psql "$DATABASE_URL" \
  -v session_id='perf_1x_session-0' \
  -v user_id='perf_1x_user' \
  -v collaborator_user_id='perf_1x_moderator' \
  -v prefix='perf_1x_' \
  -f scripts/performance/explain-performance-queries.sql \
  > doc/dev-notes/results/explain-performance-1x.txt
```

PERF-09는 별도 검증 DB에서 전용 runner로 fixture 운영자의 `POST /api/v1/scenarios/{prefix}scenario-0/moderation/actions`를 정확히 한 번 호출한다. runner는 warmup·자동 재시도 없이 전체 응답 시간, HTTP 상태, response byte와 `actionId`를 JSON으로 남긴다. `warning`은 공개 상태를 바꾸지 않으면서 연결 세션 fan-out을 수행하며, 같은 prefix로 재실행하면 서버의 기존 action ID idempotency 경로를 검증한다.

```bash
npm run benchmark:performance:moderation -- \
  --scale=10 \
  --prefix=perf_10x_ \
  --base-url=http://localhost:8080/api/v1

# dry-run의 URL, scale, request byte를 확인한 뒤 실제 단일 POST
npm run benchmark:performance:moderation -- \
  --scale=10 \
  --prefix=perf_10x_ \
  --base-url=http://localhost:8080/api/v1 \
  --apply \
  --output=doc/dev-notes/results/moderation-fanout-10x.json

ACTION_ID=$(node -p \
  "JSON.parse(require('fs').readFileSync('doc/dev-notes/results/moderation-fanout-10x.json','utf8')).result.actionId")

psql "$DATABASE_URL" -v prefix='perf_10x_' -v action_id="$ACTION_ID" \
  -f scripts/performance/verify-moderation-fanout.sql
```

remote staging API를 사용할 때만 DB와 API 대상이 같은 격리 환경인지 다시 확인한 뒤 `--allow-remote`를 명시한다. `missingCount`는 0, duplicate query 결과는 0행이어야 하며 `turnLogCount`와 `distinctIdempotencyKeyCount`는 활성 연결 수와 같아야 한다.

fixture 생성은 운영 DB가 아닌 별도 DB/스키마에서만 실행한다. `verify-scale-fixture.sql`의 모든 count `pass`가 true이고 integrity/orphan 값이 0인지 확인한 뒤 측정한다. API runner 자체는 DB를 생성하거나 변경하지 않으며, 동일한 route·요청 수·동시성으로 각 scale을 측정한다. 결과는 `doc/dev-notes/PERFORMANCE_SCALE_RESULT_TEMPLATE.md`에 옮겨 적고 실행하지 않은 값은 `미실행`으로 남긴다. VTT runner는 토큰과 objectCell을 각각 100/1,000/10,000개로 생성해 단일 토큰 이동의 full/delta byte와 build/apply latency를 같은 JSON schema로 기록한다.

### 4. 수동 브라우저 확인

- 과거 로그를 여러 페이지 불러와도 스크롤 위치가 유지되는지 확인한다.
- 실시간 로그와 과거 로그가 중복되지 않는지 확인한다.
- VTT delta 적용 중 토큰, fog, object 상태가 누락되지 않는지 확인한다.
- 네트워크 패널에서 단일 토큰 이동 payload가 전체 맵 크기로 증가하지 않는지 확인한다.
- version gap을 의도적으로 만든 뒤 전체 snapshot 재동기화가 되는지 확인한다.

## 완료 기준

- PERF-01부터 PERF-09까지 각 항목의 Acceptance Criteria가 충족된다.
- 1배/10배/100배 결과가 동일한 지표 형식으로 기록된다.
- 페이지 API와 집계 API가 전체 행을 애플리케이션 메모리로 가져오지 않는다.
- VTT 이동 핵심 경로에서 토큰 전체 중첩 탐색이 제거된다.
- 일반 상태 변경의 전체 snapshot/map broadcast가 delta로 대체된다.
- 로그 DOM과 API page size에 명시적인 상한이 있다.
- DB migration, Socket 호환, fallback, rollback 절차가 구현 문서 또는 runbook에 남아 있다.
- 테스트를 실행한 담당자가 실행 명령과 결과를 기록한다.

## 구현 후 문서 정리

- 모든 단계가 끝나면 이 문서를 `doc/completed/`로 이동한다.
- 미완료 항목은 `doc/PENDING_WORK_ITEMS.md`로 옮긴다.
- 데이터 모델이 바뀌면 `doc/structure/ERD_MVP_SESSION_SERVICE_MODEL.md`를 갱신한다.
- Socket/session 흐름이 바뀌면 `doc/structure/RUNTIME_SESSION_TURN_FLOW.md`를 갱신한다.
- 운영 migration 절차가 생기면 `infra/RUNBOOK.md`에 반영한다.
