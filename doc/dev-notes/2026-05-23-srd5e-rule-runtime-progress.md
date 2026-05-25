# SRD 5e 룰 런타임 확장 작업 정리

작성일: 2026-05-23
최근 갱신: 2026-05-25

## 요약

`doc/future_plan.md`의 SRD 5e 룰/콘텐츠 확장 로드맵을 기준으로, 백엔드 룰 계층을 "표시 데이터"에서 "실행 가능한 룰 데이터"로 옮기기 위한 기반 작업을 진행했다.

핵심 방향은 다음 세 가지다.

- 룰 데이터를 `RuleCatalogService`에서 공통 카탈로그 형태로 관리한다.
- 룰 계산은 전용 resolver/service로 분리한다.
- 기존 전투/행동/세션 런타임은 카탈로그 id와 resolver 결과를 받아 상태 변경만 담당하도록 점진 이관한다.

현재 작업은 아직 전체 통합 완료가 아니다. 다만 최초의 "룰 엔진 부품을 세운 상태"에서 더 나아가, 일부 resolver를 실제 action/combat/session 경로에 연결하는 단계까지 진행했다. 2026-05-25 기준으로 item drop/pickup의 VTT map object 생성/삭제 runtime effect도 `ActionProcessorService`까지 연결했다. 프로젝트 규칙에 따라 테스트는 직접 실행하지 않았고, 실행해야 할 검증 명령은 아래에 별도로 적었다.

## 현재까지 진행한 작업 목록

현재 작업은 "룰 엔진 부품 + 일부 runtime 연결" 단계다.

완료에 가까운 부분:

- 카탈로그 타입과 기본 데이터 구조.
- 대표 SRD 범위의 feature/condition/terrain/spell/monster entry.
- class/race/subclass feature snapshot 조회.
- 레벨업 결과 계산과 캐릭터 feature snapshot 연결.
- short/long rest command 실행 경로.
- long rest spell slot override 회복 경로.
- condition/rest/turn/save lifecycle resolver.
- `/save` command 기반 save-end condition 제거 경로.
- concentration, cover, forced movement, AoE damage, terrain effect resolver.
- Fire Bolt, Magic Missile, Fireball의 실행 경로.
- 준비행동 command, pending 저장, movement trigger 감지, triggered state 저장, accept/decline 일부 처리, 만료 정리.
- 준비행동 move held action accept 실행.
- item drop/pickup/throw command와 inventory runtime effect.
- item drop/pickup의 VTT map object 생성/삭제 runtime effect.
- pickup의 VTT map object 존재/id/item/위치 검증.
- pickup의 VTT map object stack 수량 검증과 부분 pickup 수량 감소 effect.
- throw의 target grid map object 착지 effect.
- monster ability catalog -> auto monster action 후보 연결.
- HUMAN GM override 일부 세션 흐름 연결.
- rule runtime smoke scenario seed.
- 관련 단위 spec/회귀 spec 다수.

아직 남은 부분:

- Fire Bolt 외 준비행동 cast_spell 실행까지 연결.
- cover/concentration/condition lifecycle을 모든 combat attack/spell/damage 경로에 일관되게 반영. 현재 direct damage의 concentration failure 처리는 연결되었다.
- spell slot 실제 소모와 long rest 회복 플래그 경로 및 클래스별 슬롯 최대치. 남은 부분은 주문 준비/습득 모델이다.
- inventory/map 저장 원자성 보강.
- 100개 우선 주문 승격.
- 몬스터 multiattack/recharge/save-based attack/condition rider/limited-use ability.
- HUMAN GM override 전체 API/UI 표면과 권한/로그 검증.
- AI GM/HUMAN GM smoke scenario를 실제 완주하는 통합 테스트.
- 프론트엔드 action/UI 표면 갱신.

## 앞으로 할 작업 순서

### 1. 현재 백엔드 컴파일 상태 확인

사용자 검증 명령:

```bash
cd C:\WORK\S14P31A201\be
npm run build
```

직접 테스트/빌드는 아직 실행하지 않았다. 다음 작업 전에 사용자가 위 명령으로 현재 TypeScript 상태를 확인하는 것이 좋다.

### 2. 준비행동 trigger 실행 완성

현재 준비행동은 command -> pending 저장 -> turn advance 만료 정리까지 연결되어 있다.

남은 작업:

- movement, attack, spell cast 등 전투 이벤트에서 `pendingReadyActions`를 평가한다.
- triggered ready action을 player/GM prompt로 노출한다.
- accept 시 held action을 reaction으로 실행한다.
- decline/expire 시 pending state를 제거한다.
- reaction 소모와 turn log를 남긴다.

### 3. 아이템/VTT object runtime 보강

현재 item interaction은 inventory runtime effect와 VTT map object 생성/삭제 effect까지 연결되어 있다. pickup은 map object id, item id, 위치, stack 수량까지 검증하고 부분 pickup이면 map object 수량을 줄인다. throw는 target grid에 map object를 남긴다. 다만 inventory/map 저장 원자성은 남아 있다.

남은 작업:

- inventory 변경과 map 저장 실패가 엇갈리지 않도록 처리 경계를 정한다.

### 4. 룰 카탈로그를 캐릭터 snapshot에 더 깊게 연결

카탈로그가 만들어졌으므로 다음은 캐릭터 런타임 상태에 반영해야 한다.

작업 순서:

- 캐릭터 생성 시 종족 고정 보정과 runtime trait를 분리한다.
- 직업/서브클래스 feature id를 `featuresJson` 또는 feature snapshot에 안정적으로 기록한다.
- 레벨업 시 subclass 선택, 주문/캔트립 선택, ASI/feat 선택을 처리한다.
- 진행 중 세션의 `SessionCharacter` snapshot 갱신 정책을 정한다.

검증 포인트:

- 1레벨 캐릭터 생성 후 종족/직업 feature id가 기대대로 들어가는가.
- 레벨업 후 이전 feature가 중복되지 않는가.
- session snapshot이 원본 character와 의도치 않게 어긋나지 않는가.

### 5. 휴식 시스템을 API/GM 승인 흐름까지 연결

`RestResolutionService`는 action command까지 연결되었으나, 전용 endpoint/GM 승인 정책은 남아 있다.

작업 순서:

- short rest / long rest endpoint를 정한다.
- HUMAN GM 세션에서는 승인 옵션을 둔다.
- spell slot 회복 결과를 실제 저장 모델에 반영한다. 현재는 long rest 시 spent slot override를 제거해 기본 최대치로 복구한다.

검증 포인트:

- short rest가 short-rest resource만 회복하는가.
- long rest가 spell slot/resource/HP를 기대대로 회복하는가.
- 전투 중 요청이 거부되는가.

### 6. 전투 공통 룰을 CombatService에 더 깊게 연결

전투 룰 resolver를 실제 전투 흐름에 붙인다.

작업 순서:

- saving throw, cover, concentration resolver를 공격/주문/피해 경로에 연결한다.
- condition runtime을 피해, 명중, 이동, 턴 시작/종료 hook에 연결한다.
- forced movement를 전투 이동/피해/지형 처리와 연결한다.
- ready action trigger 처리와 held action 실행을 연결한다.
- AoE targeting을 spell/action 대상 선택에 연결한다.

검증 포인트:

- 상태이상이 runtime tag로 판정에 반영되는가.
- 집중 주문 피해 후 concentration save가 요청/처리되는가.
- 강제이동이 이동력을 소모하지 않고 위험 지형/충돌을 처리하는가.
- 준비행동 trigger가 reaction 소모와 함께 처리되는가.

### 7. 주문 실행 경로를 spell catalog 기반으로 통일

현재 목표는 319개 표시 주문 전체가 아니라, 우선 MVP 주문과 우선순위 주문을 실행 가능한 데이터로 승격하는 것이다.

작업 순서:

- spell catalog entry를 command parser와 전투 UI에서 같은 id로 사용한다.
- spell slot 소모와 `SpellScalingService` 결과를 연결한다. 현재 MVP는 slot spell 성공 시 클래스별 최대치 기준으로 spent slot override를 감소시키고, cantrip은 슬롯을 쓰지 않는다.
- save/damage/condition rider/concentration/duration을 공통 실행 흐름으로 처리한다.
- 주문 로그에 원래 spell level과 사용 slot level을 함께 기록한다.

검증 포인트:

- cantrip과 slot spell이 다른 비용 규칙을 따르는가.
- upcasting 결과가 피해/대상 수/지속시간에 반영되는가.
- concentration spell이 기존 집중 효과를 종료하는가.

### 8. 몬스터 ability와 AI/GM 행동 후보 연결

몬스터 행동도 카탈로그 기반으로 노출해야 한다.

작업 순서:

- monster ability catalog를 전투 actor 후보 행동으로 더 넓게 노출한다.
- multiattack, recharge, save-based attack, condition rider를 표현한다.
- AI GM은 후보 선택만 보조하고, 수치 판정은 엔진이 확정한다.
- HUMAN GM은 같은 후보를 수동 선택하거나 override할 수 있게 한다.

검증 포인트:

- 몬스터별 가능한 행동 후보가 카탈로그에서 조회되는가.
- recharge/limited-use가 중복 사용되지 않는가.
- AI/GM 선택 결과가 같은 실행 경로를 타는가.

### 9. 지형/VTT runtime 연결

아이템과 지형은 맵 상태와 함께 움직여야 한다.

작업 순서:

- terrain effect id를 VTT cell/object에 붙인다.
- 이동, 시야, 엄폐, 상태 적용에서 terrain resolver 결과를 참조한다.

검증 포인트:

- 아이템 수량이 inventory와 map object 사이에서 보존되는가.
- 던진 아이템이 명중/빗나감에 따라 올바른 위치로 이동하는가.
- difficult/hazardous/obscured/elevation 지형이 이동과 판정에 반영되는가.

### 10. HUMAN GM 세션 플레이 완성

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

### 11. 샘플 시나리오와 통합 smoke test 작성

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
npm test -- action-processor.service.spec.ts
npm test -- ready-action.service.spec.ts
npm test -- command-parser.service.spec.ts
npm test -- action-rule.service.spec.ts
npm test -- combat.service.spec.ts
npm test -- gm-override.service.spec.ts
npm test -- condition-runtime.service.spec.ts
npm test -- concentration-runtime.service.spec.ts
npm test -- cover-position.service.spec.ts
npm test -- forced-movement.service.spec.ts
npm test -- aoe-damage.service.spec.ts
npm test -- spell-scaling.service.spec.ts
npm test -- monster-ability.service.spec.ts
npm test -- provided-scenario.constants.spec.ts
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

## 2026-05-23 한 작업

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
- `spell-slot.service.ts`: class/level별 spell slot 최대치 계산
- `terrain-effect.service.ts`: 지형 효과 합성 계산
- `gm-override.service.ts`: HUMAN GM 수동 조작을 turn log/state diff/audit 형태로 정규화

이 서비스들은 대부분 DB mutation 없이 순수 계산 결과를 반환하는 형태로 두었다. 이후 `CombatService`, `ActionRuleService`, `InventoryRuntimeService`, 세션 command 계층에서 호출해 실제 상태 변경으로 연결하면 된다.

### 4. RulesModule 등록 진행

`be/src/modules/rules/rules.module.ts`에 새 룰 서비스들을 provider/export로 등록하는 작업을 진행했다.

현재 등록된 항목:

- action economy
- AoE damage / AoE targeting
- character resource
- concentration runtime
- condition runtime
- cover position
- forced movement
- GM override
- inventory runtime
- item interaction
- level up
- map position
- monster ability
- ready action
- rest resolution
- rule catalog / rule engine
- spell scaling
- spell slot
- state diff
- terrain effect

남은 확인 사항:

- 일부 resolver는 action/combat/session 경로까지 연결되었다.
- 아직 UI 표면, map object 저장, full ready-action prompt/execute 흐름처럼 남은 통합 지점이 있다.

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

## 2026-05-24 한 작업

### 1. 레벨업 TypeScript 오류 수정

백엔드 watch 실행 중 `level-up.service.ts`에서 `value`가 `undefined`일 수 있다는 TS18048/TS2322 오류가 발생했다.

원인:

- `assertRolledHp(value: number | undefined, level: number)`에서 `Number.isInteger(value)`만 검사하면 TypeScript가 이후 `value`를 `number`로 좁히지 못한다.

해결:

- `typeof value !== "number"` guard를 먼저 둬서 `undefined`를 명확히 제외했다.
- 이후 `Number.isInteger(value)`와 범위 검사를 수행하도록 정리했다.

### 2. 캐릭터 feature snapshot 연결 보강

`RuleCatalogService`의 feature snapshot을 캐릭터/레벨업 흐름에서 사용할 수 있도록 보강했다.

진행 내용:

- `RuleCatalogService.getCharacterFeatureSnapshot()`와 `getClassFeatureSnapshot()` 흐름을 정리했다.
- `LevelUpService.resolveCharacterLevelStats()`를 추가해 레벨업 결과에서 class feature, subclass feature, proficiency bonus, HP 증가를 계산할 수 있게 했다.
- `CharactersService`에서 캐릭터 생성/갱신 시 카탈로그 기반 feature snapshot을 사용할 수 있도록 연결했다.
- 바드, 클레릭, 드루이드, 몽크, 팔라딘, 소서러, 워락, 위저드의 1레벨 class feature snapshot 회귀 spec을 추가했다.

### 3. 휴식 런타임 연결

`RestResolutionService`를 `ActionRuleService`의 `/rest short`, `/rest long` command 흐름에 연결했다.

진행 내용:

- short rest / long rest 결과를 `ActionResolution`으로 반환한다.
- HP, class resource, rage/action surge 관련 runtime tag 회복을 반영한다.
- long rest에서 spell slot 회복 metadata를 포함한다.
- 구조화된 condition duration 중 rest 종료 조건을 `ConditionRuntimeService.resolveRestEnd()`로 제거한다.
- 전투 중 휴식은 `hasActiveCombat` 기준으로 거부한다.
- `ActionProcessorService`의 `RECOVER_LONG_REST` runtime effect가 `spellSlotsBySessionCharacterId`의 해당 캐릭터 슬롯 override를 제거해, 전투 주문 슬롯 조회가 기본 최대치로 회복되도록 연결했다.

### 4. 조건/집중/엄폐/강제이동 런타임 확장

전투 공통 룰 resolver를 추가하거나 보강했다.

진행 내용:

- `ConditionRuntimeService`
  - 문자열 condition과 구조화된 condition instance를 함께 다룬다.
  - turn end, save end, rest end lifecycle을 처리한다.
  - duration, saveEnds, stackPolicy, runtime tag 투영을 지원한다.
- `ConcentrationRuntimeService`
  - 집중 시작 시 기존 집중을 교체한다.
  - 피해 발생 시 `RuleEngineService.resolveConcentrationCheck()`로 DC와 성공/실패를 계산한다.
  - 실패 시 집중 상태와 연결된 effect condition을 제거한다.
- `CoverPositionService`
  - grid line과 blocker를 기준으로 `none`, `half`, `three_quarters`, `full` cover를 계산한다.
  - full cover는 targetable false로 처리할 수 있게 했다.
- `ForcedMovementService`
  - 강제 이동이 이동력을 소모하지 않고, opportunity attack을 기본 유발하지 않도록 결과에 명시한다.
  - 진입한 hazardous terrain과 terrain effect 합성 결과를 반환한다.

### 5. 주문 실행 경로 확장

일부 주문을 카탈로그 기반 실행 경로로 승격했다.

진행 내용:

- `spell.fire_bolt`
  - 카탈로그 range/damage/character-level scaling을 사용한다.
  - spell attack roll, damage modifier, out-of-range rejection을 처리한다.
- `spell.magic_missile`
  - auto-hit force damage로 실행한다.
  - slot level에 따른 missile count scaling을 적용한다.
  - 잘못된 slot level은 throw 대신 impossible result로 반환한다.
- `spell.fireball`
  - `AoeDamageService`를 추가해 한 번의 damage roll과 대상별 Dex save, half damage, resistance/vulnerability/immunity를 처리한다.
  - `/cast_area fireball <saveDc> <targetIdsCsv> [slotLevel]` 명령을 추가했다.
- slot spell 실행 결과가 `SPEND_SPELL_SLOT` runtime effect를 남기고, `ActionProcessorService`가 `spellSlotsBySessionCharacterId` 플래그를 감소시키도록 연결했다.
- spell slot 기본 최대치는 더 이상 1레벨 슬롯 2개로만 보지 않고, `SpellSlotService`의 full caster, half caster, warlock pact magic slot table을 기준으로 계산한다.
- `SpellScalingService`
  - 같은 주사위 면의 scaling dice를 병합한다. 예: `8d6 + 1d6` -> `9d6`.

### 6. 준비행동 런타임 연결

`ReadyActionService`를 실제 command/action/combat lifecycle에 일부 연결했다.

진행 내용:

- `/ready <trigger> <heldAction> ...` 명령을 parser에 추가했다.
- `ActionRuleService`에서 전투 중 자기 턴에만 준비행동을 설정하도록 guard를 추가했다.
- 준비행동 성공 시 `pendingReadyAction` structured action과 `SPEND_ACTION`, `STORE_READY_ACTION` runtime effect를 반환한다.
- `ActionProcessorService`에서 `STORE_READY_ACTION` effect를 받아 `GameState.flagsJson.pendingReadyActions`에 저장한다.
- `ReadyActionService.resolvePendingActions()`를 추가해 pending 목록을 `triggered`, `expired`, `remaining`으로 분류한다.
- `manual` trigger가 모든 이벤트에 반응하던 동작을 수정해, 명시적인 manual 이벤트에만 반응하도록 했다.
- `CombatService.advanceCurrentTurn()` 이후 만료된 pending ready action을 정리한다.
- 전투 가능 액션 목록에 `READY`를 노출했다.

아직 남은 부분:

- Fire Bolt 외 cast_spell held action의 실제 실행 경로.

### 7. 아이템 상호작용 명령 확장

`ItemInteractionService`에 있던 drop/pickup/throw 계산을 action command 표면에 연결했다.

진행 내용:

- `/item drop <itemId> <qty> <x> <y>`
  - inventory item 수량 검증.
  - map object 생성 metadata 반환.
  - `REMOVE_ITEM` runtime effect 반환.
- `/item pickup <objectId> <itemDefinitionId> <qty> <x> <y>`
  - 거리 검증.
  - `removeObject: true` metadata 반환.
  - `ADD_ITEM` runtime effect 반환.
- `/item throw <itemId> <qty> <x> <y>`
  - thrown/improvised attack metadata 계산.
  - finesse/proficiency 기반 attack bonus 계산.
  - `REMOVE_ITEM` + `SPEND_ACTION` runtime effect 반환.

아직 남은 부분:

- inventory 변경과 map 저장을 하나의 트랜잭션성 흐름으로 묶는 보강.

### 8. 몬스터 ability 실행 후보 승격

`MonsterAbilityService`를 추가하고 `CombatService`의 자동 몬스터 행동 선택 경로에 연결했다.

진행 내용:

- `RuleCatalogService`에 goblin scimitar/shortbow/nimble escape, giant rat bite ability entry를 추가했다.
- catalog entry의 tag를 executable monster action 형태로 투영한다.
- preferred action id가 있으면 우선 선택하고, 없으면 몬스터별 preference order를 따른다.
- `CombatService`의 auto monster action 선택에서 `MonsterAbilityService.chooseAction()`을 먼저 사용하고, 없으면 기존 SRD engine fallback을 사용한다.

### 9. HUMAN GM override 연결

`GmOverrideService`와 HUMAN GM 세션 흐름을 보강했다.

진행 내용:

- GM override resolution에서 public metadata와 private audit note를 분리했다.
- `privateNote`가 player-visible metadata에 섞이지 않도록 spec을 추가했다.
- `SessionsService`에서 HUMAN GM scene/npc/handout/node/combat start/end/state patch/AI assist accept 계열 조작을 `gm_override` TurnLog로 남기도록 연결했다.
- HP patch, combat start, handout reveal, AI assist accept, 빈 narration rejection 등을 spec으로 고정했다.

### 10. 룰 smoke 시나리오 추가

`default-scenario.ts`에 룰 런타임 검증용 제공 시나리오를 추가했다.

추가 내용:

- `scenario_rule_runtime_smoke`
- 휴식 tutorial 노드
- 함정과 내성 노드
- 엄폐 전투 노드
- 광역기 전투 노드
- 상태/집중/강제이동 노드
- HUMAN GM override 예시 노드

각 노드에는 `nodeMetaJson.smokeTest.verifies`와 `suggestedCommands`를 넣어, 어떤 룰 기능을 검증하는지 추적할 수 있게 했다.

`provided-scenario.constants.ts`도 갱신해 새 제공 시나리오 id가 list/visibility 흐름에 포함되도록 했다.

## 2026-05-25 한 작업

### 1. 빌드 오류 대응

- `ActionRuleService.resolveItemInteraction()`에서 `ItemInteractionService` 반환 union이 operation별로 좁혀지지 않아 발생한 `TS2339` 오류를 `result.type` guard로 수정했다.
- `ScenariosService.getDefaultScenarioEntity()`에서 누락된 `DEFAULT_PROVIDED_SCENARIO_ID` import를 복구했다.
- `SessionsService`의 HUMAN GM override turn log emit 구간에서 트랜잭션 콜백 내부 대입을 TypeScript가 추적하지 못해 `never`로 좁히던 문제를 명시적 `HumanGmOverrideLogResult | null` alias로 정리했다.

### 2. condition/save/concentration 전투 연결 보강

- `CombatService.advanceCurrentTurn()`에 turn end lifecycle을 연결해, 현재 턴을 끝낸 참여자의 구조화 condition duration을 감소/만료한다.
- 전투 저장 시 legacy string condition은 그대로 보존하고, 구조화 condition만 runtime instance 형태로 갱신한다.
- 전투 advantage/상태 판정용 condition 읽기는 구조화 condition의 `conditionId`와 `tags`도 runtime tag로 투영한다.
- dodge/hidden/sleep 같은 전투 condition 추가/제거는 mixed condition 배열을 보존하면서 해당 string/tag만 조작하도록 보강했다.
- `/save <target> <ability> <dc> [condition]` 명령을 추가해 공통 saving throw resolver를 액션 표면에 연결했다.
- condition 인자가 있고 내성에 성공하면 `ConditionRuntimeService.resolveSaveEnd()`로 해당 save-end condition을 제거한다.
- save-end condition 제거도 legacy string condition을 보존하고 구조화 condition만 정규화된 runtime instance로 갱신한다.
- direct `/damage` command 경로에 연결해, 집중 중인 대상이 피해를 받으면 concentration save를 굴리고 실패 시 연결 condition을 state change에서 제거한다.

### 3. 준비행동 trigger/accept 보강

- `TRIGGERED_READY_ACTIONS_FLAG`를 추가해 발동 조건을 만족한 준비행동을 pending 목록에서 분리해 보존한다.
- 전투 이동 후 `creature_enters_range` trigger를 평가해, 조건을 만족하면 `triggeredReadyActions`에 `pending_response` 상태로 저장하고 시스템 메시지를 emit한다.
- movement trigger 감지와 triggered state 저장을 `combat.service.spec.ts`로 고정했다.
- 기존 combat reaction accept/decline endpoint가 `triggered:*` reaction id를 받으면 ready action 응답으로 처리하도록 연결했다.
- ready attack accept는 기존 `resolveAttack(... actionCost: "reaction")` 경로를 사용하고, custom/interact 계열 accept는 reaction 소모와 TurnLog를 남기도록 했다.
- ready decline은 `triggeredReadyActions`에서 해당 항목을 제거하고 combat/session snapshot을 갱신한다.
- shared `CombatReactionPromptDto.type`에 `ready_action`을 추가하고, triggered ready action 발생 시 기존 `combat.reaction.prompt` 이벤트로 actor에게 실행/취소 confirm을 보내도록 연결했다.
- 프론트 `PlayPage`의 reaction prompt handler가 `ready_action`도 기존 accept/decline API로 처리하도록 보강했다.
- ready held action이 `cast_spell`이고 주문이 Fire Bolt이면, accept 시 기존 `resolveAttack(... actionCost: "reaction")` 경로로 주문 공격을 실행하도록 연결했다.
- ready held action이 `move`이면 `targetPoint`를 가진 준비 이동으로 파싱하고, accept 시 기존 combat movement resolver를 reaction 비용으로 실행하도록 연결했다. 따라서 이동력 검증, VTT map 저장, 기회공격 판정, 이동 turn log가 같은 경로를 탄다.

### 4. 아이템/VTT object runtime 보강

- drop 결과의 `CREATE_MAP_OBJECT` runtime effect를 `ActionProcessorService`에서 실제 VTT `objectCells` 생성으로 저장하도록 연결했다.
- pickup 결과의 `REMOVE_MAP_OBJECT` runtime effect를 `ActionProcessorService`에서 실제 VTT `objectCells` 삭제로 저장하도록 연결했다.
- map object 저장 시 `flags.vttMap`만 직접 읽지 않고, `SessionsService.getVttMapBaseline()`을 사용해 저장된 map, 시나리오 노드 기본 map, 기본 map fallback을 같은 경로로 처리하도록 보강했다.
- action runtime context도 `getVttMapBaseline()` 기반 VTT map에서 만들도록 바꿔, 시나리오 노드 기본 map의 object cell을 룰 판정에서 볼 수 있게 했다.
- pickup 명령은 VTT map object id, hidden item id, grid 위치가 명령과 맞는지 검증한 뒤 inventory 추가와 map object 삭제 effect를 반환하도록 보강했다.
- drop으로 생성한 object의 `description`에 담긴 `<itemDefinitionId> x<quantity>` 형식을 runtime map context에서 읽어, 부분 pickup은 `UPDATE_MAP_OBJECT_QUANTITY`로 남은 수량을 저장하고 전량 pickup은 object를 삭제하도록 보강했다.
- throw 명령은 인벤토리에서 아이템을 제거한 뒤 target grid에 `object:thrown:*` map object를 생성하도록 `CREATE_MAP_OBJECT` effect를 연결했다.
- `ActionProcessorService`의 map object 생성/수량 갱신/삭제 helper를 고정하는 회귀 spec을 추가했다.
