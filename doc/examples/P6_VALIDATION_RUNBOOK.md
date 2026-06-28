# P6 validation runbook

P6는 `future_plan.md`의 장기 SRD 5e 확장 목표를 닫는 최종 검증 단계다. 17~20레벨 성장, 실행 가능 주문 319개, 몬스터 317종, 운영자 moderation, 장기 캠페인 완결·보관·이관, 20레벨 최종 검증 캠페인을 한 번의 사용자 흐름으로 확인한다.

프로젝트 지침상 Codex는 테스트를 직접 실행하지 않는다. 사용자가 아래 명령과 수동 절차를 실행하고, 결과 로그를 바탕으로 실패 항목을 수정한다.

## 1. 자동 검증

```powershell
npm run test:p6-regression
npm run test:e2e
npm run build
```

기대 결과:

- `test:p6-regression`: P5 기준선과 P6 신규 spec 통과
- `test:e2e`: 격리 E2E DB에서 세션 핵심 흐름 통과
- `build`: shared-types, srd-data, BE, FE 전체 빌드 통과

`test:p6-regression`은 최소 다음 범위를 포함해야 한다.

- P5 baseline 회귀
- 주문 319개, 몬스터 317종 최종 manifest
- 12개 직업 17~20레벨 성장, 19레벨 ASI, 20레벨 capstone, 9레벨 슬롯
- P6 주문·몬스터 runtime metadata
- 운영자 moderation queue/action/appeal/creator notice
- 장기 캠페인 complete/archive/vault/transfer와 중복 처리 idempotency
- P6 최종 검증 시나리오 seed 구조

## 2. P6 최종 검증 캠페인

대상 시나리오:

- 제목: `영원폭풍 성채의 마지막 유산`
- ID: `scenario_p6_eternal_storm_citadel`
- 권장 레벨: 17 → 20
- 예상 시간: 360~540분
- GM 모드: AI GM, HUMAN GM 모두

확인 순서:

1. `/sessions/new`에서 `영원폭풍 성채의 마지막 유산`을 선택할 수 있는지 확인한다.
2. AI GM 세션을 생성해 주요 경로를 진행한다.
3. HUMAN GM 세션을 생성해 동일 주요 경로를 진행한다.
4. 16 또는 17레벨 캐릭터를 20레벨까지 성장시킨다.
5. 19레벨 ASI와 20레벨 capstone이 character snapshot과 재접속 snapshot에 남는지 확인한다.
6. 9레벨 주문 슬롯과 Warlock Mystic Arcanum 9가 표시·검증되는지 확인한다.
7. P6 추가 주문 20개 이상, 9레벨 주문 8개 이상을 실제 노드·전투·탐색에서 사용한다.
8. P6 추가 몬스터 24종 이상을 확인한다.
9. legendary/lair/phase 보스 전투 3종 이상을 진행하고 TurnLog/StateDiff가 남는지 확인한다.
10. story, exploration, combat, travel, downtime, archive 노드가 각각 2개 이상 존재하고 주요 경로에서 연결되는지 확인한다.

권장 노드 흐름:

1. `영원폭풍 성채 회의`: P6 검증 목표와 campaign handout 확인
2. `20레벨 승천과 마지막 준비`: 19레벨 ASI, 20레벨 capstone, 9레벨 슬롯 확인
3. `차원 수렴 항로`: planar travel, teleportation, divination 계열 확인
4. `은하 투사와 문 열기`: Astral Projection, Gate 계열 확인
5. `소원 기록보관소`: Wish safe MVP option과 GM override 확인
6. `형상변환 미궁`: Shapechange, concentration, token override 확인
7. `에픽 downtime과 부활 비용`: True Resurrection, Mass Heal, Hallow, Forbiddance 비용·장기 효과 확인
8. `공개 성채 moderation 심리`: 신고, 큐, 처리, 이의 제기, 복구/유지 흐름 확인
9. `용 의회 전장`: 고CR dragon 계열, breath recharge, 집중 방해 확인
10. `나가와 미라 군주의 저주 회랑`: curse, fear, grapple, immunity 확인
11. `황금 용의 lair phase`: legendary/lair phase와 Time Stop/Gate/Foresight 확인
12. `은빛 폭풍 군단`: phase encounter와 다수 몬스터 행동 확인
13. `후일담과 campaign archive`: complete campaign API/UI 확인
14. `캐릭터 보관소와 다음 캠페인 이관`: vault, transfer request/approve/reject 확인
15. `영원폭풍 이후의 세계`: AI/HUMAN GM 주요 경로 완료 확인

## 3. 17~20레벨 성장 검증

12개 직업 각각에서 다음을 확인한다.

- 17~20레벨 HP/proficiency/resource progression
- 대표 서브클래스 17~20레벨 feature
- 19레벨 ASI 또는 feat 선택 hook
- 20레벨 capstone
- 9레벨 슬롯 또는 pact/mystic arcanum progression
- 성장 후 세션 재접속 snapshot 유지

완료 기록에는 최소 12개 직업의 `성장 가능 여부`, `capstone 표시`, `실제 상태 반영 경로`를 남긴다.

## 4. 주문 319개·몬스터 317종 manifest 검증

자동 검증에서 `p6-content-manifest.spec.ts`가 다음을 고정해야 한다.

- 실행 가능 주문 manifest: 319개
- 대표 몬스터 manifest: 317종
- P6 신규 generated SRD 주문 109개와 몬스터 163종이 최종 generated SRD manifest gap을 닫는지

수동 검증에서는 모든 319/317개를 직접 하나씩 플레이하지 않고, P6 캠페인이 요구하는 대표 집합을 확인한다.

- P6 추가 주문 20개 이상
- 9레벨 주문 8개 이상
- P6 추가 몬스터 24종 이상
- legendary/lair/phase 보스 3종 이상

## 5. 운영자 moderation 검증

운영자 계정 조건:

- 사용자 `role`이 `MODERATOR` 또는 `ADMIN`이어야 한다.

확인 절차:

1. `/scenarios`에서 공개 시나리오를 신고한다.
2. 운영자 계정으로 `P6 operator moderation` 패널을 연다.
3. 큐에서 신고 수, 이의 제기 수, action 수, `moderationProcessingStatus`, `creatorNoticeStatus`가 보이는지 확인한다.
4. `hidden` 처리 후 공개 탐색에서 제외되는지 확인한다.
5. 기존 세션 snapshot은 hidden 전환 후에도 유지되는지 확인한다.
6. creator 계정에서 moderation appeal을 제출한다.
7. 운영자가 `restored` 처리하면 appeal이 accepted 흐름으로 바뀌고 공개 탐색에 복구되는지 확인한다.
8. 운영자가 `escalated` 처리하면 appeal이 under_review 흐름으로 바뀌는지 확인한다.
9. 운영자가 `creator_note_required` 처리하면 creator notice가 `creator_action_required`로 보이는지 확인한다.
10. 운영자가 `removed` 처리하면 공개 탐색과 일반 링크 접근에서 제외되고, 기존 세션 snapshot은 유지되는지 확인한다.

## 6. 장기 캠페인 완결·archive·vault·transfer 검증

세션 상세 화면에서 host가 확인한다.

1. P6 캠페인을 완료 가능한 최종 상태까지 진행한다.
2. `P6 캠페인 완결·보관` 액션을 실행한다.
3. 후일담, 공유 범위, 이관 허용 여부를 입력한다.
4. 세션 상태가 완료로 바뀌고 archive가 표시되는지 확인한다.
5. archive에 다음 값이 표시되는지 확인한다.
   - epilogue
   - shareScope
   - allowCharacterTransfer
   - combatCount
   - turnLogCount
   - nodeVisitCount
   - sessionCharacterCount
   - characters
6. 같은 complete action을 다시 실행해도 archive가 중복 생성되지 않는지 확인한다.
7. 플레이어 프로필에서 `P6 Character Vault`에 완료 캐릭터가 표시되는지 확인한다.
8. 새 세션을 만들고 vault 캐릭터의 이관 요청을 보낸다.
9. 대상 세션 host가 이관 요청을 확인한다.
10. `clone` 모드 승인 시 대상 세션에 독립 clone character와 SessionCharacter가 생성되고, 원본 보관 캐릭터는 유지되는지 확인한다.
11. `transfer` 모드 승인 시 대상 세션에 독립 snapshot이 생성되고, 원본 완료 캠페인의 SessionCharacter가 retired 처리되는지 확인한다.
12. 거절 시 캐릭터가 clone되지 않고 요청만 rejected 상태가 되는지 확인한다.
13. 같은 이관 요청을 다시 보내도 pending request가 중복 생성되지 않는지 확인한다.
14. 원본 archive snapshot이 변경되지 않는지 확인한다.

## 7. 완료 판정 기록 양식

P6 완료 판정을 요청할 때 아래 결과를 함께 전달한다.

```text
test:p6-regression: PASS/FAIL
test:e2e: PASS/FAIL
build: PASS/FAIL

AI GM P6 final campaign: PASS/FAIL
HUMAN GM P6 final campaign: PASS/FAIL
17→20 level progression / ASI / capstones: PASS/FAIL
9th-level spell usage: PASS/FAIL
P6 spell representative set: PASS/FAIL
P6 monster representative set: PASS/FAIL
legendary/lair/phase bosses: PASS/FAIL
operator moderation / appeal / restore / creator notice: PASS/FAIL
campaign archive / epilogue / analytics: PASS/FAIL
character vault / transfer approve / reject: PASS/FAIL
snapshot isolation after moderation and transfer: PASS/FAIL

특이사항:
-
```

하나라도 FAIL이면 P6는 완료 처리하지 않고, 해당 로그나 화면 상태를 기준으로 수정한다.
