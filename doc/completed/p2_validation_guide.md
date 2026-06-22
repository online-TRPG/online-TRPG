# P2 사용자 검증 완료 가이드

상태: 2026-06-22 사용자 검증 완료. 이 문서는 P2 완료 당시의 검증 절차를 보관한다.

## 1. 자동 회귀 확인

프로젝트 지침에 따라 아래 명령은 사용자가 직접 실행한다.

```powershell
npm run test:quiet -w @trpg/be -- rule-catalog.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- characters.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- action-rule.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- command-parser.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- terrain-effect.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- monster-ability.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- combat.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- default-scenario.spec.ts --runInBand
npm run build
```

## 2. 시나리오 준비

1. 시드를 반영한 뒤 `폭풍 금고의 마지막 비행`을 선택한다.
2. 시작 레벨 5 캐릭터를 준비한다.
3. Extra Attack 직업 한 명과 3레벨 주문 사용 직업 한 명을 포함하면 확인이 쉽다.
4. 첫 회차는 AI GM, 두 번째 회차는 HUMAN GM으로 생성한다.

## 3. 세션에서 수행할 작업

### 절벽 승강장의 노래

- 하피의 노래와 종족별 매혹 대응을 확인한다.
- 고지대의 적을 원거리 공격 또는 `Fly`로 공격한다.
- 미끄러운 지형을 통과한다.
- 철문을 열거나 부순다.
- 녹슨 윈치를 `부수기`로 파괴하고 판정 결과와 맵 상태를 확인한다.

### 삼켜지는 유물 회랑

- 독구름과 시야 방해 지형을 통과한다.
- 미믹의 grapple과 젤라틴 큐브의 engulf/지속 피해를 확인한다.
- 보관함을 조사해 단서와 아이템이 인벤토리로 이동하는지 확인한다.
- 아이템 하나를 내려놓고 다시 줍거나 던진다.
- `Moonbeam`, `Invisibility`, `Lesser Restoration` 중 가능한 주문을 사용한다.

### 금고 심장부의 붉은 날개

- Extra Attack으로 한 행동 안에서 두 번 공격한다.
- `Fly`, `Haste`, `Lightning Bolt`, `Moonbeam` 등 3레벨/지속 주문을 사용한다.
- 어린 레드 드래곤의 비행과 재충전 숨결을 확인한다.
- 거대 전갈의 multiattack, grapple, poison을 확인한다.
- 금이 간 기둥을 부수고 엄폐가 사라지는지 확인한다.
- 전투 중 브라우저를 새로고침해 전투·맵·오브젝트·인벤토리가 복원되는지 확인한다.

## 4. 제작 UI 확인

1. `내 시나리오`에서 새 시나리오를 만든다.
2. story, exploration, combat 노드를 각각 하나씩 만든다.
3. 시작 노드를 지정하고 노드를 연결한다.
4. 전투 노드 맵에 카탈로그 몬스터와 지형·오브젝트를 배치한다.
5. 룰 카탈로그에서 주문·상태·지형 효과를 선택한다.
6. 공개 장면 문구와 GM private notes에 서로 다른 내용을 입력한다.
7. 검증 패널의 경고를 모두 해소하고 저장한다.
8. 다시 열었을 때 내용이 유지되는지, 새 세션에서 선택 가능한지 확인한다.

## 5. 완료 판정

빌드와 회귀 spec이 모두 통과하고, AI/HUMAN GM 양쪽에서 시나리오를 완주하며 재접속·비공개 정보 분리까지 확인하면 P2를 완료 처리한다.
