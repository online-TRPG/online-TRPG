# P5 validation runbook

P5는 16레벨 고레벨 캠페인, 캠페인 캘린더·downtime, 공개 시나리오 생태계를 함께 검증한다. 테스트 실행은 프로젝트 지침에 따라 사용자가 직접 수행한다.

## 자동 검증

```powershell
npm run test:p5-regression
npm run test:e2e
npm run build
```

기대 결과:

- `test:p5-regression`: P4 기준선과 P5 신규 spec 통과
- `test:e2e`: 격리 E2E DB에서 세션 핵심 흐름 통과
- `build`: shared-types, srd-data, BE, FE 전체 빌드 통과

## P5 캠페인 수동 검증

대상 시나리오:

- 제목: `성좌 봉인의 마지막 원정`
- ID: `scenario_p5_astral_seal_campaign`
- 권장 레벨: 16

확인 순서:

1. `/sessions/new`에서 `성좌 봉인의 마지막 원정`을 선택할 수 있는지 확인한다.
2. AI GM 세션을 생성해 주요 경로를 진행한다.
3. HUMAN GM 세션을 생성해 동일 주요 경로를 진행한다.
4. 시작 전 12레벨 캐릭터를 16레벨까지 성장시키고 14/16레벨 ASI, 7~8레벨 슬롯, 대표 class resource가 반영되는지 확인한다.
5. 세션 플레이 화면의 `캘린더` 패널에서 참가자가 일정 제안 → 참석 응답을 수행할 수 있는지 확인한다.
6. GM/host 계정의 `캘린더` 패널에서 일정 확정과 게임 시간 경과를 수행하고, 게임 내 날짜와 현실 일정이 분리되어 표시·저장되는지 확인한다.
7. GM/host 계정의 `캘린더` 패널에서 downtime 작업을 5종 이상 시작·중단·재개·완료한다.
   - crafting
   - training
   - research
   - recovery
   - repair
8. downtime 완료 후 inventory, economy, character resource, TurnLog/StateDiff가 갱신되는지 확인한다.
9. P5 주문 15개 이상과 P5 몬스터 16종 이상을 실제 노드/전투에서 확인한다.
10. 2단계 보스 흐름을 완료한다.

## 공개 시나리오 생태계 수동 검증

1. `/scenarios`로 이동한다.
2. `공개 탐색` 탭을 연다.
3. 태그 `p5` 또는 레벨 `16` 필터로 `성좌 봉인의 마지막 원정`을 찾는다.
4. 추천순, 최신순, 레벨순 정렬이 동작하는지 확인한다.
5. 상세 패널에서 다음 값이 보이는지 확인한다.
   - fork 수
   - 예상 시간
   - 태그
   - 추천 근거
   - moderation 상태
6. `세션 생성` 버튼으로 `/sessions/new`에 진입했을 때 해당 시나리오가 자동 선택되는지 확인한다.
7. 공개 revision을 fork하고, `내 시나리오` 탭에 독립 draft가 생성되는지 확인한다.
8. 원본 revision을 수정하거나 새 revision을 발행해도 fork draft가 바뀌지 않는지 확인한다.
9. 신고가 누적된 revision이 공개 탐색에서 제외되는지 확인한다.
10. 기존 세션 snapshot은 신고·비공개 전환 후에도 유지되는지 확인한다.

## 완료 기록 양식

```text
test:p5-regression: PASS/FAIL
test:e2e: PASS/FAIL
build: PASS/FAIL
AI GM P5 campaign: PASS/FAIL
HUMAN GM P5 campaign: PASS/FAIL
calendar schedule flow: PASS/FAIL
downtime lifecycle: PASS/FAIL
public discovery/fork/moderation: PASS/FAIL
notes:
```
