# 2026-05-06 룰 훅 엔진 구현 정리

## 먼저 볼 내용

이 문서는 `2026-05-04-1121-session-turn-action-flow.md` 이후에 이어서 보면 된다.

이번 작업은 action 처리 흐름에 SRD 기반 deterministic rule hook을 붙인 작업이다. 쉽게 말하면, AI가 판단하지 않아도 서버가 직접 처리해야 하는 전투/클래스/아이템 규칙을 백엔드 룰 엔진으로 분리했다.

중요한 점:

- AI/인프라 코드는 수정하지 않았다.
- 룰 훅 결과는 `TurnLog.structuredAction.ruleResults`에 남긴다.
- 실제 HP/상태 변경은 기존 `StateDiffService` 흐름으로 반영한다.
- 로컬에서 `prisma db push`는 하지 않는다. develop merge 후 인프라가 EC2 DB에 자동 반영한다.

## 구현한 흐름

플레이어가 `/attack`, `/damage`, `/cast chill_touch`, `/feature rage` 같은 명령을 보내면 아래처럼 처리된다.

```text
action 입력
-> CommandParserService가 명령어 파싱
-> ActionRuleService가 필요한 룰 훅 호출
-> RuleEngineService가 판정/피해/클래스 기능 계산
-> TurnLog에 ruleResults 저장
-> HP/상태 변경이 있으면 StateDiff 저장
```

## Rule Hook 구현 상태

### 현재 action 흐름에 연결된 훅

| Hook | 사용 명령 | 현재 상태 |
| --- | --- | --- |
| `hook.combat.resolve_attack_roll` | `/attack`, `/cast chill_touch` | natural 1/20, AC 판정까지 동작 |
| `hook.damage.apply_resistance_vulnerability` | `/attack`, `/damage`, `/cast chill_touch` | resistance/immunity/vulnerability 태그 기반 피해량 계산 |
| `hook.condition.apply_prone_modifiers` | `/attack` | prone 대상 공격 시 advantage/disadvantage 반영 |
| `hook.spell.cast_chill_touch` | `/cast chill_touch <target> [distanceFt]` | 사거리, 명중, necrotic 피해 처리 |
| `hook.class.fighter.second_wind` | `/feature second_wind` | `1d10 + fighterLevel` 회복, max HP 초과 방지 |
| `hook.class.fighter.action_surge` | `/feature action_surge` | 사용 기록과 추가 행동 부여 결과를 로그에 남김 |
| `hook.class.barbarian.rage` | `/feature rage` | rage 상태와 물리 피해 저항 태그 적용 |
| `hook.class.fighter.champion_critical_threshold` | `/attack` | Champion이면 critical 기준을 19/18로 낮춤 |

주의할 점:

- `Second Wind`, `Action Surge`, `Rage`는 현재 임시로 `conditionsJson` 태그를 사용한다.
- 그래서 한 번 사용한 기능을 short rest/long rest에서 회복하는 처리는 아직 없다.
- `Action Surge`는 "추가 행동을 얻었다"는 결과는 남기지만, 실제로 action을 한 번 더 허용하는 action economy 검증은 아직 완성되지 않았다.

### pure hook만 구현했고 action 연결은 보류한 훅

| Hook | 보류 이유 |
| --- | --- |
| `hook.item.bag_of_holding_capacity` | 인벤토리 변경 API와 `InventoryEntry`, `ContainerState` 갱신 서비스가 아직 없다. |
| `hook.class.rogue.sneak_attack` | 장착 무기 property, 적 인접 여부, 턴당 1회 사용 여부를 action 흐름에서 아직 읽고 갱신하지 않는다. |
| `hook.class.rogue.cunning_action` | `bonusActionUsed`를 턴마다 생성/초기화/갱신하는 action economy 흐름이 아직 없다. |
| `hook.class.barbarian.frenzy` | rage 지속시간, frenzy 상태, rage 종료 시 exhaustion 증가 흐름이 아직 없다. |

## DB 변경 내용

이번 DB 변경은 지금 당장 모든 훅을 완성하려고 넣은 것이 아니라, 이후 룰 엔진을 확장하기 위한 최소 기반이다.

### `Character` 추가 필드

| 필드 | 의미 |
| --- | --- |
| `subclassName` | 캐릭터의 서브클래스 이름. 예: `champion`. Champion critical threshold 판정에 사용한다. |
| `featuresJson` | 캐릭터가 가진 클래스/서브클래스 기능 목록 JSON. 예: `["champion_improved_critical"]`. 나중에 특정 기능 보유 여부를 공통으로 판정하기 위한 필드다. |

### `SessionCharacter` 추가 relation

| relation | 의미 |
| --- | --- |
| `inventoryEntries` | 세션 안에서 이 캐릭터가 가진 아이템 목록. |
| `combatTurnStates` | 전투 중 이 캐릭터가 이번 턴에 action/bonus action/reaction 등을 썼는지 기록. |
| `resource` | Second Wind, Rage, Exhaustion 같은 세션 중 소모성 자원 상태. |

`SessionCharacter` 자체에 값이 바로 늘어난 것은 아니고, 아래 신규 테이블들과 연결되는 relation이 추가된 구조다.

### `ItemDefinition`

아이템의 "원본 정의" 테이블이다. 같은 Longsword를 여러 캐릭터가 들고 있어도 정의는 하나만 둔다.

| 필드 | 의미 |
| --- | --- |
| `id` | 아이템 정의 ID. 예: `item.longsword`, `item.bag_of_holding`. |
| `name` | 표시 이름. |
| `itemType` | 아이템 종류. 예: `weapon`, `armor`, `container`, `consumable`. |
| `weightLb` | 아이템 1개의 무게. Bag of Holding 무게 제한 계산에 필요하다. |
| `volumeCuFt` | 아이템 1개의 부피. Bag of Holding 부피 제한 계산에 필요하다. |
| `damageDice` | 무기 피해 주사위. 예: `1d8`. |
| `damageType` | 무기 기본 피해 타입. 예: `slashing`, `piercing`. |
| `propertiesJson` | 무기/아이템 속성 JSON. 예: `["finesse", "ranged"]`. Sneak Attack 판정에 필요하다. |

### `InventoryEntry`

캐릭터가 실제로 들고 있는 아이템 한 줄이다.

| 필드 | 의미 |
| --- | --- |
| `id` | 인벤토리 행 ID. |
| `sessionCharacterId` | 어떤 세션 캐릭터의 아이템인지 가리킨다. |
| `itemDefinitionId` | 어떤 아이템 정의를 사용하는지 가리킨다. |
| `quantity` | 같은 아이템 개수. |
| `containerEntryId` | 이 아이템이 다른 컨테이너 안에 들어있으면 그 컨테이너의 `InventoryEntry.id`. |

예를 들어 물약 3개가 Bag of Holding 안에 있으면, 물약 entry의 `containerEntryId`가 Bag of Holding entry를 가리킨다.

### `ContainerState`

컨테이너 아이템의 현재 상태다. Bag of Holding 같은 아이템에 붙는다.

| 필드 | 의미 |
| --- | --- |
| `inventoryEntryId` | 컨테이너 역할을 하는 `InventoryEntry` ID. 이 값이 PK다. |
| `currentWeightLb` | 현재 컨테이너 안에 들어있는 총 무게. |
| `currentVolumeCuFt` | 현재 컨테이너 안에 들어있는 총 부피. |
| `maxWeightLb` | 허용 최대 무게. |
| `maxVolumeCuFt` | 허용 최대 부피. |
| `integrity` | 컨테이너 상태. 예: `INTACT`, `BROKEN`, `DESTROYED`. |

Bag of Holding 훅은 여기 값으로 용량 초과 여부와 파괴 여부를 판단하게 된다.

### `CombatTurnState`

전투 중 "이번 턴에 무엇을 썼는지" 저장하는 테이블이다.

| 필드 | 의미 |
| --- | --- |
| `combatId` | 어떤 전투의 턴 상태인지. |
| `roundNo` | 전투 라운드 번호. |
| `turnNo` | 전투 턴 번호. |
| `sessionCharacterId` | 어떤 캐릭터의 턴 상태인지. |
| `actionUsed` | 일반 action 사용 여부. |
| `bonusActionUsed` | bonus action 사용 여부. Cunning Action, Rage, Second Wind에 필요하다. |
| `reactionUsed` | reaction 사용 여부. |
| `additionalActionGranted` | Action Surge 등으로 추가 action을 얻었는지. |
| `sneakAttackUsed` | Rogue Sneak Attack을 이번 턴에 이미 썼는지. |

같은 전투/라운드/턴/캐릭터 조합은 하나만 존재한다.

### `SessionCharacterResource`

세션 중 캐릭터의 소모성 자원 상태다.

| 필드 | 의미 |
| --- | --- |
| `sessionCharacterId` | 대상 세션 캐릭터 ID. 이 값이 PK다. |
| `secondWindAvailable` | Second Wind 사용 가능 여부. |
| `actionSurgeUses` | 남은 Action Surge 사용 횟수. |
| `rageUses` | 남은 Rage 사용 횟수. |
| `rageActive` | 현재 Rage 상태인지. |
| `rageEndsAtRound` | Rage가 끝날 라운드. |
| `rageEndsAtTurn` | Rage가 끝날 턴. |
| `frenzyActive` | Frenzy 상태인지. |
| `exhaustionLevel` | exhaustion 단계. Frenzy 종료 후 증가 처리에 필요하다. |

지금은 테이블 기반이 준비된 상태고, 실제 action 처리에서 이 테이블을 읽고 갱신하는 흐름은 후속 작업이다.

## 아직 남은 작업

다음 작업은 크게 네 가지다.

1. 인벤토리 변경 흐름
   - 아이템 추가/이동/삭제 API 또는 service가 있어야 Bag of Holding 훅을 실제로 연결할 수 있다.

2. 장비/무기 선택 흐름
   - 공격 시 어떤 무기를 썼는지 알아야 `damageDice`, `damageType`, `finesse/ranged` 속성을 룰에 반영할 수 있다.

3. Action economy 흐름
   - 턴 시작 때 `CombatTurnState`를 만들고, 행동할 때 `actionUsed`, `bonusActionUsed`, `sneakAttackUsed`를 갱신해야 한다.

4. Rest/recovery 흐름
   - short rest/long rest에서 Second Wind, Action Surge, Rage 같은 자원을 회복해야 한다.

## 테스트

확인한 테스트:

```bash
npm run test -w @trpg/be -- be/src/modules/rules/rule-engine.service.spec.ts be/src/modules/rules/action-rule.service.spec.ts be/src/modules/rules/command-parser.service.spec.ts be/src/modules/rules/dice.service.spec.ts --runInBand
```

결과:

```text
4 suites / 42 tests 통과
```

추가로 백엔드 빌드도 통과했다.
