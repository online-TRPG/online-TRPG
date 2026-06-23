# P3 검증 런북

작성일: 2026-06-22

이 문서는 P3 완료 판정을 위해 사용자가 직접 실행해야 하는 회귀 테스트와 AI/HUMAN GM 플레이 검증 절차를 정리한다. 프로젝트 지침상 Codex는 테스트를 직접 실행하지 않고, 사용자가 실행한 결과를 바탕으로 오류를 수정한다.

## 1. 사전 준비

1. 최신 seed가 반영되도록 백엔드 빌드 후 seed를 실행한다.

   ```powershell
   npm run build -w @trpg/shared-types
   npm run build -w @trpg/be
   npm run seed -w @trpg/be
   ```

2. E2E는 격리된 로컬 테스트 DB에서만 실행한다.

   - 기본적으로 `npm run test:e2e`는 로컬 `DATABASE_URL`을 읽고 `schema=e2e_test`를 자동으로 붙여 격리 실행한다.
   - `DATABASE_URL` 또는 명시한 `E2E_DATABASE_URL`이 `localhost`, `127.0.0.1`, `::1` 중 하나를 가리켜야 한다.
   - database name 또는 schema name에 `test`, `e2e`, `ci` 중 하나가 들어가야 한다.
   - 로컬 개발 DB의 `public` schema를 그대로 쓰지 않고, 같은 PostgreSQL DB 안의 `e2e_test` schema를 사용한다.
   - `e2e_test` schema는 `test:e2e` runner가 실행 전에 자동 생성한다.

   일반적인 경우에는 별도 설정 없이 실행한다.

   ```powershell
   npm run test:e2e
   ```

   별도의 테스트 DB나 schema를 강제로 쓰고 싶을 때만 현재 PowerShell 창에서 `E2E_DATABASE_URL`을 지정한다.

   ```powershell
   $env:E2E_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/a201?schema=my_e2e_test"
   npm run test:e2e
   Remove-Item Env:E2E_DATABASE_URL
   ```

## 2. 필수 자동 검증

아래 세 명령이 모두 통과해야 P3 완료 후보가 된다.

```powershell
npm run test:p3-regression
npm run test:e2e
npm run build
```

각 명령의 의미는 다음과 같다.

- `npm run test:p3-regression`
  - P2 기준선과 P3 신규 콘텐츠/아이템/시나리오 revision 회귀 spec을 묶어 실행한다.
  - 주문 100개, 몬스터 50종, 아이템 50개 manifest를 확인한다.
  - 직업 12개 8레벨 성장, 4레벨 슬롯, 자원 회복을 확인한다.
  - P3 마법 아이템, 몬스터 행동, 전투/광역/지형 resolver를 확인한다.
  - draft/publish/revision/공개취소와 세션 revision snapshot metadata를 확인한다.
- `npm run test:e2e`
  - E2E DB safety check를 먼저 통과해야 한다.
  - 공개 세션 목록 오염, 테스트 사용자/세션 정리를 확인한다.
- `npm run build`
  - shared-types, SRD data sync, backend, frontend 전체 빌드가 통과해야 한다.

## 3. P3 검증 모험 확인

seed 후 세션 생성 화면에서 아래 시나리오가 보여야 한다.

- 시나리오 ID: `scenario_p3_skybreaker_archive`
- 제목: `하늘파괴자의 기록고`
- 권장 레벨: 8
- 예상 검증 시간: 90~120분

시나리오 구성 확인:

- story 노드 2개 이상
- exploration 노드 2개 이상
- combat 노드 2개 이상
- P3 주문 10개 이상이 `nodeMeta.ruleRefs.spellIds`에 참조됨
- P3 몬스터 8종 이상이 맵 토큰 또는 `nodeMeta.ruleRefs.monsterIds`에 참조됨
- 소모품, 장착 아이템, 마법 아이템이 각각 2개 이상 참조됨

## 4. AI GM 플레이 검증

AI GM 세션으로 `하늘파괴자의 기록고`를 생성한 뒤 다음을 확인한다.

1. 8레벨 캐릭터로 세션에 입장한다.
2. 캐릭터 상세에서 다음을 확인한다.
   - 8레벨
   - proficiency bonus +3
   - 8레벨 ASI 반영
   - 주문시전 직업의 4레벨 슬롯
   - 직업/서브클래스 6~8레벨 feature
3. `살아 있는 색인 서가`에서 조사/아이템 획득을 확인한다.
   - `magic_item.wand_of_web`
   - `equipment.potion_of_healing`
4. `구름 새장의 사냥꾼들` 전투에서 비행/고도/원거리 몬스터를 확인한다.
   - `monster.wyvern`
   - `monster.manticore`
   - `monster.giant_eagle`
   - `spell.dimension_door`
   - `spell.ice_storm`
   - `magic_item.potion_of_flying`
5. `유리와 용광로의 심장`에서 지형·오브젝트·마법 아이템을 확인한다.
   - `terrain.wall_of_fire`
   - `terrain.burning`
   - `monster.troll`
   - `monster.basilisk`
   - `monster.water_elemental`
   - `magic_item.wand_of_fireballs`
6. `푸른 눈의 최종 revision` 보스전에서 다음을 확인한다.
   - `monster.young_blue_dragon`
   - `monster.stone_golem`
   - `magic_item.necklace_of_fireballs`
   - `spell.death_ward`
   - `spell.phantasmal_killer`
7. 중간에 브라우저를 새로고침하거나 재접속한 뒤 현재 노드, HP, 조건, 아이템 충전, 지형 상태가 복원되는지 확인한다.
8. 엔딩 노드 `고정된 발행본의 새벽`까지 완료한다.

## 5. HUMAN GM 플레이 검증

HUMAN GM 세션으로 같은 시나리오를 생성하고 다음을 확인한다.

1. GM 권한 사용자가 노드 이동, HP 조정, 상태 적용/해제를 할 수 있다.
2. 플레이어가 요청한 휴식/판정/노드 진행이 HUMAN GM 흐름에서 승인 또는 처리된다.
3. GM private note와 미공개 단서가 플레이어 화면에 노출되지 않는다.
4. 전투 중 HUMAN GM이 P3 몬스터 행동 후보와 사용 불가 사유를 확인할 수 있다.
5. AI assist를 쓰는 경우 제안 생성과 적용 후 snapshot이 유지되는지 확인한다.
6. AI GM과 동일하게 엔딩 노드까지 완료한다.

## 6. Draft / revision / snapshot 격리 검증

1. 시나리오 에디터에서 임의의 draft를 생성한다.
2. validation 오류가 없는 상태로 `public` revision 1을 발행한다.
3. revision 1로 새 세션을 생성한다.
4. 세션 snapshot의 state flags에서 다음 값이 보이는지 확인한다.

   ```json
   {
     "p3ScenarioRevisionSnapshot": {
       "scenarioId": "...",
       "baseScenarioId": "...",
       "revisionNumber": 1,
       "publishStatus": "public"
     }
   }
   ```

5. 원본 draft의 노드 제목 또는 장면 문구를 수정한다.
6. revision 2를 발행한다.
7. revision 1 세션에 재접속한다.
8. revision 1 세션의 `SessionScenarioNode` 내용이 revision 2나 draft 수정 내용으로 바뀌지 않았는지 확인한다.
9. revision 1을 공개 취소한다.
10. 신규 세션 생성 목록에서는 사라지지만, 이미 만든 revision 1 세션은 계속 열리는지 확인한다.
11. `link` revision은 ID 직접 접근이 가능하고 공개 목록에는 나오지 않는지 확인한다.
12. `private` revision은 소유자 외 사용자에게 노출되지 않는지 확인한다.

## 7. 완료 판정 기록 양식

P3 완료 판정을 요청할 때 아래 결과를 함께 전달한다.

```text
test:p3-regression: PASS/FAIL
test:e2e: PASS/FAIL
build: PASS/FAIL
AI GM 하늘파괴자의 기록고 완주: PASS/FAIL
HUMAN GM 하늘파괴자의 기록고 완주: PASS/FAIL
revision snapshot 격리: PASS/FAIL
재접속 복원: PASS/FAIL
공개/비공개 정보 분리: PASS/FAIL
남은 오류 로그:
```

하나라도 FAIL이면 P3는 완료 처리하지 않고, 해당 로그를 기준으로 수정한다.
