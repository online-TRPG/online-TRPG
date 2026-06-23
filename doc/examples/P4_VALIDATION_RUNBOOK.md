# P4 검증 런북

작성일: 2026-06-23

이 문서는 P4 완료 판정을 위해 사용자가 직접 실행해야 하는 자동 검증과 AI/HUMAN GM 플레이 검증 절차를 정리한다. 프로젝트 지침상 Codex는 테스트를 직접 실행하지 않고, 사용자가 실행한 결과를 바탕으로 오류를 수정한다.

## 1. P4-0 자동 검증

P4의 기본 자동 검증은 P3 baseline을 유지하면서 P4 신규 spec을 추가하는 방식으로 확장한다.

```powershell
npm run test:p4-regression
npm run test:e2e
npm run build
```

`test:p4-regression`은 다음을 포함해야 한다.

- P3 회귀 기준 전체.
- E2E runner safety guard.
- P4 콘텐츠 목표 선언.
- 9~12레벨 성장, 주문 150개, 몬스터 100종.
- 경제 MVP resolver spec: 상점 구매·판매, 보상 지급, party stash, 제작 진행, 감정, 수리, 조율, charge 회복, GameState/TurnLog/StateDiff persistence.
- 협업·리뷰·발행 policy spec: owner/editor/reviewer/viewer 권한, review 승인 차단, private GM 데이터 노출 차단, attribution, revision diff.

## 2. E2E DB 격리 기준

일반적인 경우 별도 환경변수 설정 없이 실행한다.

```powershell
npm run test:e2e
```

E2E runner는 로컬 `DATABASE_URL`에서 `schema=e2e_test`를 자동 파생하고, schema가 없으면 자동 생성한다. `E2E_DATABASE_URL`을 직접 지정하는 경우에도 database name 또는 schema name에는 `test`, `e2e`, `ci` 중 하나가 포함되어야 한다.

## 3. P4 콘텐츠 검증 기준

P4 종료 시점에는 다음 수량이 고정되어야 한다.

| 항목 | P3 완료 | P4 목표 |
| --- | ---: | ---: |
| 실행 가능 주문 | 100 | 150 |
| 대표 몬스터 | 50 | 100 |
| 실행 가능 아이템 | 50 | 50 이상 |

P4 경제 기능이 새 item id를 추가하는 경우 `실행 가능 아이템 50 이상`으로 유지하되, 장착·사용·상점·보상 경로에서 실제 실행 가능한 항목만 계산한다.

## 4. P4 수동 플레이 검증

P4 검증 캠페인 `scenario_p4_storm_crown_campaign` — “폭풍왕관의 계승자”를 AI GM과 HUMAN GM으로 각각 주요 경로 플레이한다.

확인 항목:

1. 12레벨 캐릭터 생성 또는 8레벨 캐릭터의 12레벨 성장.
2. 5~6레벨 주문 시전, 집중, 해제, 장기 지속 효과.
3. P4 추가 몬스터의 특수 행동, 반응, recharge, 상태 lifecycle.
4. 상점 구매·판매, 보상 지급, party stash, 제작·감정·수리·조율·charge 회복.
5. 협업 draft 권한, review 승인/반려, revision diff, 발행 정책.
6. 중간 재접속 후 캐릭터 성장, inventory, reward, scenario revision snapshot 복원.
7. revision 2 발행 후 revision 1 세션 내용 불변.

### 경제 UI 검증

세션을 시작한 뒤 우측 상단 `경제` 버튼을 연다. AI GM 세션은 host, HUMAN GM 세션은 배정된 GM이 사용할 수 있다.

1. 지갑, 공동 보관함, 상점 재고, 제작 진행 상태가 현재 snapshot과 일치하는지 확인한다.
2. 구매·판매·보상 지급·공동 보관함 분배를 실행하고 화면 상태와 TurnLog가 함께 갱신되는지 확인한다.
3. 제작 시작/진행, 감정, 수리, 조율, charge 회복을 실행한다.
4. 권한이 없는 플레이어에게 경제 패널이 표시되지 않는지 확인한다.

### 협업·리뷰 UI 검증

`내 시나리오`의 draft 상세에서 확인한다.

1. owner가 editor/reviewer/viewer를 추가하고 제거한다.
2. editor가 draft를 수정하되 collaborator 관리와 발행은 할 수 없는지 확인한다.
3. owner 또는 editor가 reviewer를 지정해 review를 요청한다.
4. reviewer 계정에서 승인·반려·수정 요청을 기록한다. owner가 직접 승인할 수 없어야 한다.
5. review 이력이 시간순 thread로 남는지 확인한다.
6. 두 브라우저에서 같은 draft를 연 뒤 한쪽이 먼저 저장했을 때 다른 쪽 저장이 409 충돌 안내로 차단되는지 확인한다.
7. revision을 발행한 뒤 검증 리포트에서 추가·삭제·변경 node와 section diff가 표시되는지 확인한다.
8. 발행 revision의 `revision 신고`를 실행해 moderation report 접수를 확인한다.

권장 진행 순서:

1. `폭풍왕관 계승 의뢰`: 8레벨 캐릭터를 12레벨까지 성장시키거나 12레벨 캐릭터를 생성한다.
2. `왕관시장과 공동 보관함`: 구매, 판매, party stash, 감정, 조율, charge 회복, 수리를 확인한다.
3. `차원 관측소`: P4 탐색 주문과 petrified/차원 이동 계열 몬스터 행동을 확인한다.
4. `폭풍문 공성전`: 5~6레벨 전투 주문, terrain lifecycle, P4 몬스터 recharge/특수행동을 확인한다.
5. `폭풍 열쇠 제작과 재정비`: 제작 시작/진행/완료, 보상 지급, stash 분배를 확인한다.
6. `리치의 계승문`: 리치/드래곤/퍼플 웜/뱀파이어 복합 전투, 상태 lifecycle, HUMAN GM override를 확인한다.
7. `계승식 이후의 두 번째 발행`: review 승인, revision 2 발행, revision 1 세션 snapshot 불변을 확인한다.

## 5. 완료 판정 기록 양식

P4 완료 판정을 요청할 때 아래 결과를 함께 전달한다.

```text
test:p4-regression: PASS/FAIL
test:e2e: PASS/FAIL
build: PASS/FAIL

AI GM P4 campaign: PASS/FAIL
HUMAN GM P4 campaign: PASS/FAIL
Economy/shop/reward/crafting: PASS/FAIL
Collaboration/review/publish policy: PASS/FAIL
Revision snapshot isolation: PASS/FAIL

특이사항:
-
```

하나라도 FAIL이면 P4는 완료 처리하지 않고, 해당 로그를 기준으로 수정한다.

## 6. P4 경제 MVP 자동 검증 범위

`economy-runtime.service.spec.ts`와 `economy-state-runtime.service.spec.ts`는 P4 경제 기능의 서버 권위 resolver와 세션 상태 persistence가 다음 불변식을 지키는지 고정한다. 실제 세션에서는 GM 권한으로 `POST /sessions/:id/gm/economy`를 호출해 같은 resolver를 실행한다.

- 구매 시 지갑 잔액, 상점 재고, 구매 제한을 서버에서 검증한다.
- 판매 시 party stash 수량을 차감하고 상점 재고와 판매자 지갑을 갱신한다.
- 보상 지급은 화폐 분배와 party stash 지급을 감사 가능한 stateDiff로 남긴다.
- 제작은 재료, 도구 숙련, 비용, 작업 시간을 검증하고 완료 시 결과물을 party stash에 추가한다.
- 감정·수리는 비용과 아이템 상태를 검증하고 감사 이벤트를 남긴다.
- 조율은 이미 다른 캐릭터가 조율한 아이템을 차단하고 감사 이벤트를 남긴다.
- charge 회복은 최대 charge를 넘지 않게 서버에서 보정하고 감사 이벤트를 남긴다.
- 승인된 경제 결과는 `GameState.flagsJson.economy`에 저장되고 `TurnLog.stateDiffJson`과 `StateDiff`에 같은 변경 이력을 남긴다.

## 7. P4 협업·리뷰·발행 정책 자동 검증 범위

`scenario-collaboration-policy.service.spec.ts`는 발행 전에 서버가 반드시 적용해야 하는 정책 판단을 고정한다. 실제 draft 협업 상태는 `GET /scenarios/:id/collaboration`, `PUT /scenarios/:id/collaborators`, `DELETE /scenarios/:id/collaborators/:userId`, `POST /scenarios/:id/reviews`로 관리하며, public/link 발행은 저장된 승인 review 없이는 차단된다.

- owner만 collaborator 관리와 revision 발행을 할 수 있다.
- editor는 draft 편집만, reviewer는 review 판단만, viewer는 조회만 가능하다.
- public/link 발행은 승인된 review가 필요하며, rejected/changes_requested 상태에서는 차단된다.
- private GM note, gm-only scope, secret note 같은 데이터가 공개 payload에 남아 있으면 발행을 차단한다.
- 외부 라이선스/OTHER 시나리오는 attribution 없이 발행할 수 없다.
- revision diff는 추가/삭제/변경 node와 변경 section을 요약한다.
