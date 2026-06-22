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
- 9~12레벨 성장, 주문 150개, 몬스터 100종, 경제/협업 기능이 추가될 때마다 대응 spec.

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

P4 검증 캠페인을 AI GM과 HUMAN GM으로 각각 주요 경로 플레이한다.

확인 항목:

1. 12레벨 캐릭터 생성 또는 8레벨 캐릭터의 12레벨 성장.
2. 5~6레벨 주문 시전, 집중, 해제, 장기 지속 효과.
3. P4 추가 몬스터의 특수 행동, 반응, recharge, 상태 lifecycle.
4. 상점 구매·판매, 보상 지급, party stash, 제작·감정·수리.
5. 협업 draft 권한, review 승인/반려, revision diff, 발행 정책.
6. 중간 재접속 후 캐릭터 성장, inventory, reward, scenario revision snapshot 복원.
7. revision 2 발행 후 revision 1 세션 내용 불변.

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
