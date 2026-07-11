# 성능 확장성 변경 후속 보완 계획

작성일: 2026-07-11

상태: 구현·회귀 테스트·로컬 backfill·두 클라이언트 수동 검증 완료

연관 문서: [`performance_scalability_remediation_plan.md`](performance_scalability_remediation_plan.md)

## 목적

데이터 10배·100배 증가에 대비한 성능 변경을 정적 검토한 결과, projection 전환과 실시간 delta 축소 과정에서 데이터 누락 또는 클라이언트 상태 불일치가 발생할 수 있는 경로가 확인됐다. 이 문서는 성능 개선 방향을 유지하면서 다음 네 문제를 먼저 해결하기 위한 실행 계획이다.

1. 처리 완료된 이의제기가 moderation queue의 100개 조회 창을 점유하는 문제.
2. `ScenarioPublication`과 `ScenarioCollaboratorGrant` backfill 전 기존 시나리오가 목록에서 누락되는 문제.
3. 전체 snapshot을 생략한 전투 경로에서 캐릭터 `status`와 `tempHp`가 동기화되지 않는 문제.
4. 기존 `AiTrace`의 fallback 여부가 구조화 컬럼에 반영되지 않아 품질 통계가 과소 집계되는 문제.

현재 배포는 중단된 상태다. 이 계획은 코드와 로컬 데이터 정합성 확보까지만 다루며 Jenkins, 컨테이너 배포, 운영 DB 변경은 범위에서 제외한다.

## 진행 현황

2026-07-11 기준:

- FOLLOWUP-01 구현 완료
  - 활성 appeal을 `submitted`, `under_review`로 통일했다.
  - moderation queue의 상태와 count는 projection을 사용하고 attribution은 상세 이력과 mismatch 진단에만 사용한다.
  - SQL page 뒤의 애플리케이션 filter/slice를 제거했다.
  - fail-closed revision은 queue와 운영자 action 경로 모두 projection으로 판정한다.
- FOLLOWUP-02 구현 완료
  - scenario backfill dry-run에 publication/grant coverage와 create/update/delete 예상량을 추가했다.
  - 동일 projection에는 update를 실행하지 않고 grant 차이만 반영해 재실행 시 불필요한 `updatedAt` 변경을 제거했다.
  - 전체 appeal 수와 활성 appeal 수를 별도 집계한다.
  - `check:scenario-projection`은 publication/grant 차이 또는 metadata/user 실패가 남으면 비정상 종료한다.
  - 공개·내 목록과 moderation queue는 publication 누락이 있으면 503으로 중단해 silent omission을 막는다.
  - readiness 실패는 캐시하지 않고 성공만 캐시하므로, backfill 이후 다음 요청에서 자동 회복한다.
- FOLLOWUP-03 구현 완료
  - combat participant DTO와 mapper에 `tempHp`를 추가했다.
  - FE는 combat/state diff에서 HP, 임시 HP, 조건, `DEAD` 및 제한된 `ACTIVE` 복구를 병합한다.
  - `RETIRED`, `LEFT` 상태는 전투 이벤트로 덮어쓰지 않는다.
- FOLLOWUP-04 구현 완료
  - 신규 trace의 일반 성공, AI template fallback, BE default fallback 저장 경로에 대한 회귀 spec을 추가했다.
  - AI fallback backfill에 response 부재, 정상 non-fallback, 비정상 JSON shape 진단 count를 추가했다.
  - `check:ai-trace-fallback`은 보정 대상 또는 parse 실패가 남으면 비정상 종료한다.
- 두 backfill 스크립트의 Node 구문 검사와 변경 파일 whitespace 검사는 통과했다.
- 로컬 scenario 첫 dry-run은 19건 중 publication 누락 10건, 갱신 필요 2건, metadata/grant 실패 0건을 보고했다.
- 로컬 AI trace 첫 dry-run은 4건 중 fallback 보정 대상 2건, parse 실패 0건을 보고했다.
- Scenario/AI/combat/StateDiff 집중 회귀 테스트는 4 suites, 130 tests가 통과했다.
- 전투 상태 영속화 보완 후 combat/StateDiff 집중 회귀 3 suites, 91 tests와 Human GM HP override 집중 회귀 1 test가 추가로 통과했다.
- Scenario apply는 publication 10건 생성·2건 갱신, AI apply는 fallback 2건 갱신으로 완료됐다.
- apply 후 두 readiness gate는 통과했으며 두 번째 apply의 모든 mutation count는 0이었다.
- shared-types, BE, FE production build는 통과했다. FE에는 기존 500KB 초과 chunk 경고가 남아 있다.
- 두 클라이언트에서 일반 피해 시 HP `13 → 11`과 GAME OVER가 동시에 반영되는 것을 확인했다.
- 임시 HP 5 상태에서 총 10 피해를 받았을 때 두 클라이언트 모두 `tempHp 5 → 0`, HP `13 → 8`을 표시했고 DB도 `currentHp=8`, `tempHp=0`, `status=ACTIVE`로 일치했다.
- 수동 검증 중 0 HP인데 `SessionCharacter.status=ACTIVE`가 남는 경로를 발견해 combat, Human GM override, StateDiff의 HP 변경 시 `ACTIVE/DEAD`를 함께 영속화하도록 보완했다.

## 우선순위와 완료 조건

| ID | 우선순위 | 문제 | 완료 조건 |
| --- | --- | --- | --- |
| FOLLOWUP-01 | P1 | moderation queue 조회와 응답의 appeal 기준 불일치 | DB에서 선택한 최대 100개가 후처리로 탈락하지 않고 실제 검토 대상 100개와 일치한다. |
| FOLLOWUP-02 | P1 | scenario projection 미적용 데이터 누락 | projection 적용 전후 공개 목록, 내 시나리오, 협업 권한 결과가 동일하며 누락 projection이 0건이다. |
| FOLLOWUP-03 | P1 | 전투 delta의 캐릭터 상태 필드 누락 | 두 클라이언트에서 HP, 임시 HP, 생존 상태, 조건이 재조회 없이 동일하게 갱신된다. |
| FOLLOWUP-04 | P2 | 기존 AI fallback 통계 과소 집계 | backfill 재실행 시 갱신 건수가 0이고 구조화 집계가 legacy 판정 결과와 일치한다. |

## 공통 구현 원칙

- 목록과 moderation 정렬·필터의 원천은 `ScenarioPublication`으로 통일한다.
- attribution parser는 상세 기록과 전환기 진단에만 사용하고, DB가 만든 페이지를 다시 탈락시키는 용도로 사용하지 않는다.
- projection read를 활성화하기 전에 기존 행의 projection coverage를 확인한다.
- 전체 snapshot을 제거할 때는 대체 이벤트가 변경된 서버 권위 상태를 모두 전달해야 한다.
- fallback 판정처럼 기존 JSON에만 남은 값은 구조화 컬럼 전환 전에 dry-run과 backfill로 복구한다.
- 데이터 변경 스크립트는 기본 dry-run을 유지하고 `--apply`에서만 쓰기를 허용한다.

## FOLLOWUP-01. Moderation queue 계약 통일

### 원인

`ScenarioPublication.appealCount`는 현재 전체 appeal 수를 저장하지만 moderation queue DTO는 `submitted`, `under_review` 상태만 활성 appeal로 계산한다. 조회는 projection의 전체 count로 100개를 먼저 제한한 뒤 attribution에서 다시 계산한 값으로 필터링하므로, 완료된 appeal 행이 조회 창을 점유할 수 있다.

또한 backfill이 파싱 실패 행을 `UNPUBLISHED/HIDDEN`으로 격리해도 queue DTO가 attribution을 다시 파싱하면 `visible`로 해석되어 운영자 화면에서 사라질 수 있다.

### 구현 작업

1. `be/src/modules/scenarios/scenarios.service.ts`
   - `buildScenarioPublicationProjection()`의 `appealCount`를 활성 appeal 수로 변경한다.
   - 활성 상태는 `submitted`, `under_review`로 한 곳에 상수화한다.
   - `listScenarioModerationQueue()`에서 `publication`을 select/include한다.
   - `mapScenarioModerationQueueItem()`의 `moderationStatus`, `reportCount`, `appealCount`는 projection 값을 사용한다.
   - attribution은 reports, appeals, actions 상세 배열을 만드는 데만 사용한다.
   - SQL 조회 후 `.filter().slice()`를 제거한다.
   - projection과 attribution count가 다르면 ID와 count만 구조화 경고로 남기고 본문은 기록하지 않는다.
2. `scripts/backfill-scenario-publication.mjs`
   - `appealCount` 계산을 서비스와 동일한 활성 상태 기준으로 맞춘다.
   - dry-run 결과에 전체 appeal 수와 활성 appeal 수를 구분해 집계한다.
3. `be/src/modules/scenarios/scenarios.service.spec.ts`
   - 완료 appeal 100개보다 오래된 활성 appeal이 누락되지 않는 회귀 사례를 추가한다.
   - malformed attribution이 `HIDDEN` projection으로 격리됐을 때 queue에 남는 사례를 추가한다.
   - queue 결과가 추가 애플리케이션 필터 없이 `take` 범위와 일치하는지 확인한다.

### 완료 기준

- 완료 appeal만 있는 `VISIBLE` 행은 moderation queue 후보가 아니다.
- 활성 appeal, report, `HIDDEN`/`REMOVED` 행은 projection 기준으로 조회된다.
- malformed attribution 행도 projection이 검토 대상으로 분류했다면 queue에서 사라지지 않는다.
- 100개 경계 앞뒤에 데이터를 배치한 회귀 테스트가 통과한다.

## FOLLOWUP-02. Scenario projection 전환 게이트

### 원인

공개 시나리오 목록은 `ScenarioPublication`, 협업 목록은 `ScenarioCollaboratorGrant`가 존재한다고 가정한다. 스키마만 적용하고 backfill을 실행하지 않으면 기존 공개 revision과 협업 draft가 조회에서 누락된다.

### 구현 작업

1. `scripts/backfill-scenario-publication.mjs`
   - 현재 200행 cursor 처리와 fail-closed 정책을 유지한다.
   - dry-run 출력에 다음 coverage를 추가한다.
     - 전체 Scenario 수.
     - 기존 Scenario 중 publication 누락 수.
     - 예상 collaborator grant 수와 현재 grant 수.
     - 파싱 실패 수와 최대 100개 ID 표본.
   - apply 후 재실행 시 projection과 grant가 변하지 않는 멱등성을 확인할 수 있게 `wouldCreate`, `wouldUpdate`, `wouldDeleteGrant`, `wouldCreateGrant`를 분리한다.
2. `be/src/modules/scenarios/scenarios.service.ts`
   - projection 조회 결과가 attribution과 불일치할 때 기존 경고를 유지한다.
   - 목록 요청마다 전체 coverage를 세는 쿼리는 추가하지 않는다.
   - 첫 projection read에서 publication 누락을 확인하고, 누락이 있으면 목록을 일부 반환하지 않고 503으로 중단한다.
   - readiness 성공만 프로세스에 캐시하고 실패는 다음 요청에서 재확인한다.
   - collaborator grant의 상세 coverage는 backfill dry-run 결과를 전환 gate로 사용한다.
3. `be/src/database/seed/default-scenario.ts`
   - 제공 시나리오 seed가 모든 제공 Scenario에 publication을 upsert하는지 유지한다.
   - seed 재실행 시 사용자 Scenario나 collaborator grant를 삭제하지 않는지 확인한다.
4. 문서
   - `doc/performance_scalability_remediation_plan.md`의 PERF-02 상태를 backfill 적용 전에는 projection read 준비 완료로 표현하고, 데이터 전환 완료로 표현하지 않는다.

### 로컬 적용 순서

사용자가 dry-run 결과를 검토한 뒤에만 apply한다.

```powershell
npm run backfill:scenario-publication
npm run backfill:scenario-publication:apply
npm run backfill:scenario-publication
npm run check:scenario-projection
```

### 완료 기준

- `Scenario` 수와 `ScenarioPublication` 수가 같다.
- projection orphan은 0건이다.
- 유효한 legacy collaborator와 grant 결과가 일치한다.
- 두 번째 apply에서 create/update/delete 대상이 0건이다.
- backfill 전후 공개 목록과 내 시나리오의 ID 집합이 동일하다.
- 파싱 실패 행은 `UNPUBLISHED/HIDDEN`으로 남고 운영자 검토 대상에서 누락되지 않는다.

## FOLLOWUP-03. 전투 delta 계약 완성

### 원인

활성 전투의 여러 작업에서 전체 session snapshot 전송을 제거하고 `combat.updated`로 대체했다. 하지만 `CombatParticipantResponseDto`에는 `tempHp`가 없고, FE의 세션 캐릭터 병합은 `currentHp`와 `conditions`만 반영한다. 서버에서 임시 HP가 소모되거나 참가자가 쓰러지고 회복돼도 캐릭터 상세 상태가 오래된 값으로 남을 수 있다.

### 구현 작업

1. `shared-types/src/dto/api/gameplay.dto.ts`
   - `CombatParticipantResponseDto`에 player participant용 `tempHp: number | null`을 추가한다.
   - `isAlive`를 session character 상태 동기화에 사용하는 권위 필드로 명시한다.
2. `be/src/modules/combat/combat-mapper.service.ts`
   - session character가 연결된 participant에는 최신 `tempHp`를 매핑한다.
   - 몬스터처럼 session character가 없는 participant는 `null`을 반환한다.
3. `fe/src/hooks/useSession.ts`
   - `onCombatUpdated`에서 `currentHp`, `tempHp`, `conditions`, `status`를 한 번에 병합한다.
   - `isAlive === false`면 `DEAD`로 갱신한다.
   - 기존 상태가 `DEAD`이고 `isAlive === true`로 회복된 경우에만 `ACTIVE`로 복구한다. `RETIRED`와 `LEFT`는 전투 이벤트로 변경하지 않는다.
4. `fe/src/pages/PlayPage.tsx`
   - combat participant 상태와 session character 상태가 같은 이벤트에서 갱신되는지 확인한다.
   - `state.diff.applied`와 `combat.updated`가 연속 도착해도 최종 상태가 동일하도록 병합 함수를 공용화한다.
5. snapshot fallback
   - 주문 슬롯, 클래스 자원, 인벤토리, 전투 종료처럼 combat DTO가 표현하지 못하는 변경은 기존 snapshot fallback을 유지한다.
   - 대체 이벤트가 없는 필드를 변경하는 경로에서는 snapshot 제거를 금지한다.
6. 회귀 테스트 대상
   - 임시 HP만 소모되고 실제 HP가 유지되는 피해.
   - 실제 HP가 0이 되어 `DEAD`가 되는 피해.
   - 0 HP에서 회복해 다시 `ACTIVE`가 되는 경우.
   - 조건 추가·제거와 HP 변경이 동시에 발생하는 경우.
   - 두 클라이언트가 같은 전투 결과를 받는 경우.

### 완료 기준

- snapshot 재조회 없이 session character와 combat participant의 HP와 생존 상태가 일치한다.
- 임시 HP 소모가 캐릭터 상세 화면에 즉시 반영된다.
- `DEAD`에서 회복할 때만 `ACTIVE`로 돌아가며 `RETIRED`, `LEFT`는 보존된다.
- 이벤트 순서가 `state.diff.applied` 후 `combat.updated` 또는 반대여도 결과가 같다.
- delta가 표현하지 못하는 변경에는 snapshot fallback이 남아 있다.

## FOLLOWUP-04. AI fallback 통계 데이터 보정

### 원인

품질 지표는 `AiTrace.fallbackUsed`를 groupBy하지만 기존 행은 기본값 `false`로 생성된다. `failureType` 또는 response JSON에 fallback 정보가 있는 과거 trace를 보정하지 않으면 fallback rate가 실제보다 낮게 계산된다.

### 구현 작업

1. `scripts/backfill-ai-trace-fallback.mjs`
   - 기존 `fallbackUsed`, `failureType`, response JSON, response trace 순서의 판정 우선순위를 유지한다.
   - parse 실패 ID 표본과 판정 출처별 count를 출력한다.
   - `false`로 되돌리는 업데이트는 하지 않고 신뢰할 수 있는 `true`만 보정한다.
2. `be/src/modules/ai/ai.service.ts`
   - 신규 trace 생성 시 모든 성공, AI fallback, BE fallback 경로가 `fallbackUsed`를 명시하는지 확인한다.
   - 품질 지표는 JSON 재파싱 없이 구조화 필드 groupBy를 유지한다.
3. `be/src/modules/ai/ai.service.spec.ts`
   - AI 응답 fallback과 BE 예외 fallback이 모두 `fallbackUsed: true`를 저장하는지 확인한다.
   - 일반 성공 응답은 `false`를 저장하는지 확인한다.

### 로컬 적용 순서

```powershell
npm run backfill:ai-trace-fallback
npm run backfill:ai-trace-fallback:apply
npm run backfill:ai-trace-fallback
npm run check:ai-trace-fallback
```

### 완료 기준

- 재실행 dry-run의 `wouldUpdate`가 0이다.
- `parseFailureCount`가 0이거나 모든 실패 표본이 수동 분류됐다.
- 동일한 표본 기간에서 legacy 판정 fallback 수와 구조화 컬럼 집계가 일치한다.
- 신규 trace는 response JSON 형태와 무관하게 `fallbackUsed`가 정확하다.

## 구현 순서

1. FOLLOWUP-01의 appeal count 정의와 queue mapping을 먼저 통일한다.
2. scenario backfill 스크립트를 같은 정의로 수정한다.
3. scenario projection dry-run 결과를 검토하고 로컬 DB에 적용한다.
4. FOLLOWUP-03의 combat DTO와 FE 병합을 구현한다.
5. FOLLOWUP-04의 신규 trace 저장 경로와 backfill을 검증한다.
6. 네 작업의 회귀 테스트를 사용자가 실행하고 결과를 기록한다.
7. 모든 동적 검증이 끝난 뒤 `performance_scalability_remediation_plan.md`의 상태를 갱신한다.

FOLLOWUP-01과 FOLLOWUP-02는 같은 projection count 정의를 공유하므로 분리 배포하지 않는다. FOLLOWUP-03은 shared DTO, BE mapper, FE 병합이 하나의 계약이므로 세 부분을 함께 변경한다.

## 사용자 검증 계획

프로젝트 규칙에 따라 이 문서 작성 과정에서는 테스트를 실행하지 않는다. 구현 후 사용자가 다음 검증을 직접 실행한다.

```powershell
# 시나리오 및 moderation 집중 테스트
npm test -w @trpg/be -- --runInBand scenarios.service.spec.ts

# AI trace 집중 테스트
npm test -w @trpg/be -- --runInBand ai.service.spec.ts

# 전투 및 상태 diff 집중 테스트
npm test -w @trpg/be -- --runInBand combat.service.spec.ts state-diff-contract.spec.ts

# 정적 빌드 검증
npm run build -w @trpg/shared-types
npm run build -w @trpg/be
npm run build -w @trpg/fe
```

수동 검증은 브라우저 두 개 또는 일반 창과 시크릿 창으로 같은 세션에 접속해 진행한다.

1. 한 클라이언트에서 임시 HP가 있는 캐릭터에게 피해를 적용한다.
2. 양쪽 클라이언트에서 임시 HP와 실제 HP가 같은지 확인한다.
3. 캐릭터를 0 HP로 만든 뒤 양쪽에서 `DEAD` 상태를 확인한다.
4. HP를 회복시킨 뒤 양쪽에서 `ACTIVE` 상태를 확인한다.
5. 새로고침 후 상태가 실시간 표시와 같은지 확인한다.

## 배포 관련 변경 처리

현재 배포 작업은 범위 밖이다. `be/Dockerfile`과 `infra/RUNBOOK.md`에 남은 backfill 배포 절차는 이번 보완 구현에 필요하지 않다.

- 로컬 실행에 필요한 root `package.json` script와 backfill 파일은 유지한다.
- Docker image 복사와 자동 배포 절차 변경은 별도 배포 재개 작업에서 검토한다.
- 기능 변경 커밋에 배포 파일이 섞이지 않도록 변경 범위를 분리한다.

## 종료 조건

다음 조건을 모두 만족하면 이 문서를 `doc/completed/`로 이동한다.

- FOLLOWUP-01부터 FOLLOWUP-04까지 구현 완료.
- scenario와 AI backfill dry-run 및 멱등성 결과 기록 완료.
- 집중 테스트와 shared-types, BE, FE build 결과 기록 완료.
- 두 클라이언트 전투 동기화 수동 검증 완료.
- 기존 공개 시나리오와 협업 draft 누락이 없음을 확인.
- 배포 관련 변경이 기능 변경과 분리됨.
