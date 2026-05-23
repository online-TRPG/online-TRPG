# SRD 5e 룰 런타임 확장 작업 정리

작성일: 2026-05-23

## 요약

`doc/future_plan.md`의 SRD 5e 룰/콘텐츠 확장 로드맵을 기준으로, 백엔드 룰 계층을 "표시 데이터"에서 "실행 가능한 룰 데이터"로 옮기기 위한 기반 작업을 진행했다.

핵심 방향은 다음 세 가지다.

- 룰 데이터를 `RuleCatalogService`에서 공통 카탈로그 형태로 관리한다.
- 룰 계산은 전용 resolver/service로 분리한다.
- 기존 전투/행동/세션 런타임은 카탈로그 id와 resolver 결과를 받아 상태 변경만 담당하도록 점진 이관한다.

오늘 작업은 아직 전체 통합 완료가 아니라, 룰 확장에 필요한 엔진 부품을 먼저 세운 단계다. 프로젝트 규칙에 따라 테스트는 직접 실행하지 않았고, 실행해야 할 검증 명령은 아래에 별도로 적었다.

## 오늘 한 작업

### 1. 룰 카탈로그 확장

`be/src/modules/rules/rule-catalog.types.ts`와 `be/src/modules/rules/rule-catalog.service.ts`를 확장했다.

추가/정리한 카탈로그 범위:

- `race_traits`
- `class_features`
- `subclass_features`
- `spell_definitions`
- `condition_definitions`
- `monster_abilities`
- `terrain_effects`

카탈로그 entry는 공통적으로 다음 구조를 갖도록 맞췄다.

- `id`
- `source`
- `levelRequirement`
- `trigger`
- `cost`
- `targeting`
- `save`
- `damage`
- `duration`
- `concentration`
- `scaling`
- `runtimeEffect`

현재 카탈로그에는 SRD 5e MVP 범위의 종족 특성, 1-3레벨 직업 기능, 대표 서브클래스, 조건, 지형 효과, 일부 주문, 일부 몬스터 능력이 들어갔다.

### 2. 룰 카탈로그 조회 API 보강

`RuleCatalogService`에 실행 계층에서 바로 쓸 수 있는 조회 메서드를 추가했다.

- 전체/종류별 entry 조회
- 단일 entry 조회
- 종족 특성 조회
- 직업 레벨별 feature 조회
- 직업 feature snapshot 생성
- 서브클래스 feature 조회
- 몬스터 ability 조회

이 작업의 목표는 캐릭터 생성, 레벨업, 전투 액션 노출, 몬스터 행동 선택이 모두 같은 카탈로그 id를 바라보게 만드는 것이다.

### 3. 전투/룰 resolver 서비스 추가

`be/src/modules/rules` 아래에 룰 전용 service와 spec 파일을 추가했다.

추가된 resolver/service:

- `aoe-targeting.service.ts`: sphere/cone/line/cube 광역 대상 계산
- `condition-runtime.service.ts`: 구조화된 condition instance와 runtime tag 투영
- `forced-movement.service.ts`: 밀치기/당기기/강제이동 계산
- `item-interaction.service.ts`: drop/pickup/throw 아이템 상호작용 계산
- `level-up.service.ts`: 레벨업 결과 계산
- `ready-action.service.ts`: 준비행동 pending reaction 계산
- `rest-resolution.service.ts`: short rest / long rest 회복 계산
- `spell-scaling.service.ts`: spell slot upcasting 계산
- `terrain-effect.service.ts`: 지형 효과 합성 계산
- `gm-override.service.ts`: HUMAN GM 수동 조작을 turn log/state diff/audit 형태로 정규화

이 서비스들은 대부분 DB mutation 없이 순수 계산 결과를 반환하는 형태로 두었다. 이후 `CombatService`, `ActionRuleService`, `InventoryRuntimeService`, 세션 command 계층에서 호출해 실제 상태 변경으로 연결하면 된다.

### 4. RulesModule 등록 진행

`be/src/modules/rules/rules.module.ts`에 새 룰 서비스들을 provider/export로 등록하는 작업을 진행했다.

현재 등록된 항목:

- AoE targeting
- condition runtime
- forced movement
- item interaction
- level up
- ready action
- rest resolution
- spell scaling
- terrain effect

남은 확인 사항:

- `GmOverrideService`는 파일과 spec이 추가되어 있으나, module 등록 여부를 한 번 더 확인해야 한다.
- 새 resolver들이 실제 runtime service에서 호출되는 통합 경로는 아직 대부분 남아 있다.

### 5. 지형 효과 타입 오류 방향 정리

백엔드 실행 중 보고된 TypeScript 오류는 `TerrainEffectId`에 `"terrain.combined"`가 포함되어 있는데, 실제 정의 테이블인 `TERRAIN_EFFECTS`를 `Record<TerrainEffectId, TerrainEffectResolution>`로 선언해서 발생한 문제였다.

원인:

- `"terrain.combined"`는 런타임 합성 결과 id다.
- 하지만 `TERRAIN_EFFECTS`는 실제 셀에 붙는 개별 지형 effect 정의만 담아야 한다.
- 따라서 합성 id까지 definition table에 요구되면서 누락 오류가 발생했다.

해결 방향:

- 개별 정의 id와 합성 결과 id를 분리한다.
- `TerrainEffectDefinitionId`는 실제 지형 정의만 포함한다.
- `TerrainEffectId`는 `TerrainEffectDefinitionId | "terrain.combined"` 형태로 둔다.
- `TERRAIN_EFFECTS`는 `Record<TerrainEffectDefinitionId, TerrainEffectResolution>`로 제한한다.

이 분리는 지형 효과를 "정의 데이터"와 "런타임 계산 결과"로 나누는 의미가 있어, 앞으로 지형 효과가 늘어나도 타입이 더 명확해진다.

## 현재 상태

현재 작업은 "룰 엔진 부품을 세운 상태"에 가깝다.

완료에 가까운 부분:

- 카탈로그 타입과 기본 데이터 구조
- 대표 SRD 범위의 feature/condition/terrain/spell/monster entry
- 주요 resolver/service의 순수 계산 로직
- 일부 service의 `RulesModule` 등록
- 각 resolver별 단위 spec 파일 초안

아직 남은 부분:

- 새 resolver들을 실제 `CombatService`, `ActionRuleService`, `InventoryRuntimeService`, session command flow에 연결
- GM override resolver의 module 등록 및 HUMAN GM API/UI 연동
- 카탈로그 feature를 캐릭터 생성/레벨업/session snapshot에 일관되게 반영
- spell/monster/action 실행 경로를 카탈로그 id 기반으로 통일
- 통합 테스트와 시나리오 smoke test 작성

## 앞으로 할 작업 순서

### 1. 현재 백엔드 컴파일 상태 정리

가장 먼저 새로 추가한 파일들이 Nest module과 TypeScript 타입 계약에 모두 맞는지 확인한다.

우선 작업:

- `GmOverrideService`를 `RulesModule` provider/export에 등록한다.
- `terrain-effect.service.ts`의 `TerrainEffectDefinitionId` 분리가 실제 파일에 반영되어 있는지 확인한다.
- 새 service/spec 파일 import 경로를 점검한다.
- 사용하지 않는 type/import가 남아 있는지 정리한다.

사용자 검증 명령:

```bash
cd C:\WORK\S14P31A201\be
npm run build
```

### 2. 룰 카탈로그를 캐릭터 snapshot에 연결

카탈로그가 만들어졌으므로 다음은 캐릭터 런타임 상태에 반영해야 한다.

작업 순서:

- 캐릭터 생성 시 종족 고정 보정과 runtime trait를 분리한다.
- 직업/서브클래스 feature id를 `featuresJson` 또는 feature snapshot에 기록한다.
- 레벨업 시 class feature, subclass feature, proficiency bonus, HP 증가를 갱신한다.
- 진행 중 세션의 `SessionCharacter` snapshot 갱신 정책을 정한다.

검증 포인트:

- 1레벨 캐릭터 생성 후 종족/직업 feature id가 기대대로 들어가는가.
- 레벨업 후 이전 feature가 중복되지 않는가.
- session snapshot이 원본 character와 의도치 않게 어긋나지 않는가.

### 3. 휴식 시스템을 command/API 경로에 연결

`RestResolutionService`는 계산만 담당하므로, 실제 세션 액션으로 연결해야 한다.

작업 순서:

- short rest / long rest command 또는 endpoint를 정한다.
- 전투 중 휴식 불가 guard를 적용한다.
- HP, temp HP, resource, spell slot, exhaustion, condition 만료 처리를 상태 변경으로 반영한다.
- HUMAN GM 세션에서는 승인 옵션을 둔다.

검증 포인트:

- short rest가 short-rest resource만 회복하는가.
- long rest가 spell slot/resource/HP를 기대대로 회복하는가.
- 전투 중 요청이 거부되는가.

### 4. 전투 공통 룰을 CombatService에 연결

전투 룰 resolver를 실제 전투 흐름에 붙인다.

작업 순서:

- saving throw, cover, concentration resolver를 공격/주문/피해 경로에 연결한다.
- condition runtime을 피해, 명중, 이동, 턴 시작/종료 hook에 연결한다.
- forced movement를 전투 이동/피해/지형 처리와 연결한다.
- ready action을 reaction pending state와 trigger 처리에 연결한다.
- AoE targeting을 spell/action 대상 선택에 연결한다.

검증 포인트:

- 상태이상이 runtime tag로 판정에 반영되는가.
- 집중 주문 피해 후 concentration save가 요청/처리되는가.
- 강제이동이 이동력을 소모하지 않고 위험 지형/충돌을 처리하는가.
- 준비행동 trigger가 reaction 소모와 함께 처리되는가.

### 5. 주문 실행 경로를 spell catalog 기반으로 통일

현재 목표는 319개 표시 주문 전체가 아니라, 우선 MVP 주문과 우선순위 주문을 실행 가능한 데이터로 승격하는 것이다.

작업 순서:

- spell catalog entry를 command parser와 전투 UI에서 같은 id로 사용한다.
- spell slot 소모와 `SpellScalingService` 결과를 연결한다.
- save/damage/condition rider/concentration/duration을 공통 실행 흐름으로 처리한다.
- 주문 로그에 원래 spell level과 사용 slot level을 함께 기록한다.

검증 포인트:

- cantrip과 slot spell이 다른 비용 규칙을 따르는가.
- upcasting 결과가 피해/대상 수/지속시간에 반영되는가.
- concentration spell이 기존 집중 효과를 종료하는가.

### 6. 몬스터 ability와 AI/GM 행동 후보 연결

몬스터 행동도 카탈로그 기반으로 노출해야 한다.

작업 순서:

- monster ability catalog를 전투 actor 후보 행동으로 노출한다.
- multiattack, recharge, save-based attack, condition rider를 표현한다.
- AI GM은 후보 선택만 보조하고, 수치 판정은 엔진이 확정한다.
- HUMAN GM은 같은 후보를 수동 선택하거나 override할 수 있게 한다.

검증 포인트:

- 몬스터별 가능한 행동 후보가 카탈로그에서 조회되는가.
- recharge/limited-use가 중복 사용되지 않는가.
- AI/GM 선택 결과가 같은 실행 경로를 타는가.

### 7. 아이템/지형/VTT object runtime 연결

아이템과 지형은 맵 상태와 함께 움직여야 한다.

작업 순서:

- item drop 결과를 map object 생성으로 연결한다.
- pickup 결과를 inventory merge/quantity update로 연결한다.
- thrown/improvised attack 결과를 전투 공격 또는 object 착지 처리로 연결한다.
- terrain effect id를 VTT cell/object에 붙인다.
- 이동, 시야, 엄폐, 상태 적용에서 terrain resolver 결과를 참조한다.

검증 포인트:

- 아이템 수량이 inventory와 map object 사이에서 보존되는가.
- 던진 아이템이 명중/빗나감에 따라 올바른 위치로 이동하는가.
- difficult/hazardous/obscured/elevation 지형이 이동과 판정에 반영되는가.

### 8. HUMAN GM 세션 플레이 완성

`GmOverrideService`를 실제 HUMAN GM 흐름에 연결한다.

작업 순서:

- GM override API를 만든다.
- 노드 이동, 장면 텍스트, NPC 대사, handout 공개, 전투 시작/종료, 몬스터 수동 조작, DC/HP/상태/아이템 조정을 연결한다.
- 모든 조작을 `TurnLog`와 `StateDiff`에 기록한다.
- 공개 narration과 비공개 GM note 저장 경계를 정한다.
- AI 보조 제안은 GM 승인 후에만 상태에 반영한다.

검증 포인트:

- GM 조작 후 `GameState`, `TurnLog`, `StateDiff`가 같은 사실을 말하는가.
- 플레이어에게 공개되는 내용과 GM 비공개 메모가 섞이지 않는가.
- AI 보조가 자동 확정되지 않고 GM 승인 단계를 거치는가.

### 9. 샘플 시나리오와 통합 smoke test 작성

룰 부품만으로는 완성 여부를 확인하기 어렵다. 새 기능을 실제 플레이로 검증할 샘플 시나리오가 필요하다.

작업 순서:

- 휴식 tutorial 노드
- 함정과 내성 노드
- 엄폐 전투 노드
- 광역기 전투 노드
- 상태이상 전투 노드
- 사람 GM 개입 예시 노드

검증 포인트:

- AI GM 모드와 HUMAN GM 모드에서 모두 완주 가능한가.
- 멀티플레이에서 GM/player 권한이 분리되는가.
- 전투/탐색/휴식/GM override 전환 중 런타임 상태가 모순되지 않는가.

## 다음에 바로 실행할 검증 명령

프로젝트 지침상 이번 작업에서는 테스트를 직접 실행하지 않았다. 다음 검증은 사용자가 백엔드 디렉터리에서 실행하면 된다.

```bash
cd C:\WORK\S14P31A201\be
npm run build
npm test -- rule-catalog.service.spec.ts
npm test -- terrain-effect.service.spec.ts
npm test -- rest-resolution.service.spec.ts
npm test -- level-up.service.spec.ts
npm test -- item-interaction.service.spec.ts
npm test -- ready-action.service.spec.ts
npm test -- gm-override.service.spec.ts
```

## 작업 메모

이번 단계에서 중요한 기준은 "룰을 한 서비스에 계속 하드코딩하지 않는다"는 점이다.

앞으로 새 기능을 붙일 때는 다음 순서를 지키는 편이 좋다.

1. 카탈로그 entry로 룰 id와 데이터 구조를 먼저 만든다.
2. 순수 resolver에서 계산 결과를 만든다.
3. 기존 runtime service는 resolver 결과를 상태 변경으로 반영한다.
4. turn log/state diff에 엔진이 확정한 결과를 남긴다.
5. UI와 AI는 같은 카탈로그 id를 선택하거나 보여주는 역할만 한다.

이 순서를 유지하면 주문, 몬스터, 지형, 상태이상, GM override가 늘어나도 계산 책임과 상태 변경 책임이 섞이지 않는다.
