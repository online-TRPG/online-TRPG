# 2026-05-06 룰 훅 런타임 후속 구현 및 수동 테스트 정리

## 먼저 볼 내용

이 문서는 `2026-05-06-1010-rule-hooks-runtime.md` 이후 추가 구현한 내용을 정리한다.

핵심만 먼저 보면:

- `CombatTurnState`, `SessionCharacterResource`를 실제 action 처리 흐름에 연결했다.
- 전투 시작/턴 종료 시 턴 상태가 생성되고, action/bonus action/Sneak Attack 사용 여부가 갱신된다.
- short rest/long rest 명령을 추가해 전투 밖에서 자원을 회복할 수 있게 했다.
- Rage 지속/종료, Frenzy exhaustion 증가 흐름을 전투 턴 라이프사이클에 연결했다.
- Sneak Attack은 장착 무기와 advantage/위치 조건을 읽어 적용한다.
- Bag of Holding 용량 검증은 `InventoryRuntimeService`에서 서비스 단위로 동작한다.
- Swagger로 attack, prone, Chill Touch, resistance/vulnerability 흐름을 수동 확인했다.

주의:

- AI/인프라 코드는 수정하지 않았다.
- 로컬에서 `prisma db push`는 하지 않는다. develop merge 후 인프라가 EC2 DB에 자동 반영한다.
- `className`은 임의 역할명이 아니라 SRD 직업명 기준으로 쓰는 것이 안전하다. 예: `Fighter`, `Barbarian`, `Rogue`, `Wizard`, `Ranger`.

## 추가 구현 내용

### 1. Action economy 실제 연결

이전 문서에서는 `Action Surge`가 추가 행동 결과만 남기고 실제 추가 action 허용은 미완성이었다.

현재는 action 처리 시 `CombatTurnState`를 읽고 갱신한다.

처리 내용:

- 전투 시작 시 첫 턴 캐릭터의 `CombatTurnState` 생성
- 턴 종료 시 다음 턴 캐릭터의 `CombatTurnState` 생성
- `/attack`, `/cast chill_touch`, `/check` 등 action 사용 시 `actionUsed` 갱신
- `Second Wind`, `Rage`, `Cunning Action` 등 bonus action 사용 시 `bonusActionUsed` 갱신
- `Action Surge` 성공 시 `additionalActionGranted` 갱신
- Sneak Attack 성공 시 `sneakAttackUsed` 갱신

수동 테스트에서도 같은 턴에 `/attack`을 두 번 보냈을 때 두 번째 요청이 `사용 가능한 action이 없습니다.`로 차단되는 것을 확인했다.

### 2. 캐릭터 자원 테이블 연결

`SessionCharacterResource`를 action runtime에서 읽고 갱신한다.

처리 내용:

- 캐릭터가 처음 action을 처리할 때 직업/레벨 기준 기본 자원 생성
- Fighter
  - `secondWindAvailable`
  - `actionSurgeUses`
- Barbarian
  - `rageUses`
  - `rageActive`
  - `rageEndsAtRound`, `rageEndsAtTurn`
  - `frenzyActive`
  - `exhaustionLevel`

이제 `conditionsJson` 태그만 보던 단계에서 벗어나, 실제 자원 테이블이 기준 상태가 된다.

### 3. 전투 턴 라이프사이클 연결

`CombatService`에서 전투 시작과 턴 종료 시 룰 런타임 상태를 함께 관리한다.

처리 내용:

- 전투 시작 시 첫 턴 상태 생성
- 턴 종료 시 다음 턴 상태 생성
- Rage 만료 시 `CharacterResourceService.endRage` 호출
- Rage 종료 시 `rage`, `resistance:bludgeoning`, `resistance:piercing`, `resistance:slashing` 태그 제거
- Frenzy가 켜져 있었다면 Rage 종료 시 exhaustion 증가

### 4. Rest/recovery 명령 추가

`/rest short`, `/rest long` 명령을 추가했다.

처리 내용:

- 전투 중 휴식은 거절한다.
- short rest
  - Second Wind 회복
  - Action Surge 사용 횟수 회복
  - 예전 fallback condition 태그 정리
- long rest
  - HP를 max HP로 회복
  - temp HP 제거
  - Second Wind, Action Surge, Rage 회복
  - Rage/resistance 태그 제거
  - exhaustion 1 감소

### 5. Sneak Attack action 연결

Rogue Sneak Attack을 `/attack` 흐름에 연결했다.

적용 조건:

- 공격자가 `Rogue`여야 한다.
- 공격이 명중해야 한다.
- 장착 무기가 `finesse` 또는 `ranged` 속성을 가져야 한다.
- disadvantage가 없어야 한다.
- advantage가 있거나, VTT map 기준 타겟 5ft 이내에 공격자의 아군이 있어야 한다.
- 같은 턴에 Sneak Attack을 이미 쓰지 않았어야 한다.

장착 무기 조회 순서:

1. 신규 `InventoryEntry` + `ItemDefinition`
2. 기존 `Character.inventoryJson`
3. 기존 `SessionCharacter.inventorySnapshotJson`

위치 조건:

- `GameState.flagsJson.vttMap`의 token 좌표를 읽는다.
- 맵/토큰 정보가 없으면 위치 조건은 만족하지 않은 것으로 처리한다.
- advantage 조건이 있으면 위치 조건 없이도 Sneak Attack이 가능하다.

### 6. 인벤토리 런타임 서비스 추가

`InventoryRuntimeService`를 추가했다.

현재 제공 기능:

- `InventoryEntry` 추가
- `InventoryEntry` 이동
- `InventoryEntry` 삭제
- 컨테이너 내부 무게/부피 재계산
- Bag of Holding 용량 검증

Bag of Holding 처리:

- `ContainerState.currentWeightLb`
- `ContainerState.currentVolumeCuFt`
- `ContainerState.maxWeightLb`
- `ContainerState.maxVolumeCuFt`
- `ContainerState.integrity`

위 값을 기준으로 용량 초과를 판단한다.

용량 초과 시:

- mutation은 거절한다.
- 컨테이너 상태는 `OVERLOADED`로 표시한다.

주의:

- 아직 Swagger로 직접 호출하는 인벤토리 REST API는 없다.
- 현재는 service/unit test 기준으로 검증한다.

## 최신 Rule Hook 상태

| Hook | 현재 연결 상태 | 비고 |
| --- | --- | --- |
| `hook.combat.resolve_attack_roll` | action 연결 완료 | `/attack`, `/cast chill_touch` |
| `hook.damage.apply_resistance_vulnerability` | action 연결 완료 | `/attack`, `/damage`, `/cast chill_touch` |
| `hook.condition.apply_prone_modifiers` | action 연결 완료 | `/attack` 시 prone 조건 반영 |
| `hook.spell.cast_chill_touch` | action 연결 완료 | 사거리/명중/necrotic 피해 |
| `hook.item.bag_of_holding_capacity` | service 연결 완료 | Swagger API는 아직 없음 |
| `hook.class.fighter.second_wind` | action 연결 완료 | 자원 테이블, bonus action 반영 |
| `hook.class.fighter.action_surge` | action 연결 완료 | 추가 action 허용까지 연결 |
| `hook.class.barbarian.rage` | action 연결 완료 | 자원 테이블, 저항 태그, 만료 처리 |
| `hook.class.rogue.sneak_attack` | action 연결 완료 | 장비/advantage/위치/턴당 1회 |
| `hook.class.fighter.champion_critical_threshold` | action 연결 완료 | natural 19/18 확인은 unit test가 더 안정적 |
| `hook.class.rogue.cunning_action` | action 연결 완료 | bonus action 사용 처리 |
| `hook.class.barbarian.frenzy` | action 연결 완료 | Rage 중 사용, 종료 시 exhaustion 증가 |

## 수동 테스트 결과

Swagger 기준으로 아래 흐름을 확인했다.

테스트 중 주의했던 점:

- `/attack`, `/cast chill_touch`는 `INDIVIDUAL_TURN` action이라 전투가 시작되어 있어야 한다.
- 현재 턴 캐릭터가 아니면 `NOT_YOUR_TURN`으로 거절된다.
- `combat/start`의 `participantEntityIds`에는 원본 `Character.id`가 아니라 `SessionCharacter.id`를 넣어야 한다.
- combat 중에는 `PARTY_SHARED` action이 막히므로 테스트용 `/condition`, `/damage`도 `INDIVIDUAL_TURN`으로 보냈다.

### A. 일반 attack hook 확인 완료

- `resolve_attack_roll` 훅 실행 확인
- 명중 성공 시 `damageRoll` 생성 확인
- resistance/vulnerability 훅 실행 확인
- `stateDiff`에 타겟 HP 감소 반영 확인
- 같은 턴 재공격 시 action economy로 차단되는 것도 확인

확인한 흐름:

```text
/attack {targetSessionCharacterId}
-> hook.combat.resolve_attack_roll
-> 명중 시 damageRoll
-> hook.damage.apply_resistance_vulnerability
-> stateDiff.characters에 HP 감소
```

### B. prone hook 확인 완료

- target prone 상태에서 attack 시 `hook.condition.apply_prone_modifiers` 실행 확인
- `incomingAttackAdvantageState = advantage` 확인
- attack `diceResult`가 `ADVANTAGE`로 굴려지는 것 확인
- 공격은 빗나가 `stateDiff`는 null이었으나 prone hook 동작 자체는 정상

확인한 흐름:

```text
/condition add {targetSessionCharacterId} prone
/attack {targetSessionCharacterId}
```

결과:

```text
structuredAction.advantageState = ADVANTAGE
diceResult.advantageState = ADVANTAGE
ruleResults에 hook.condition.apply_prone_modifiers 포함
```

### C-1. Chill Touch 사거리 초과 확인 완료

- 125ft 입력 시 `hook.spell.cast_chill_touch` 실행 확인
- `rejectedReason = target_out_of_range` 확인
- 공격 굴림 없이 `diceResult = null` 확인
- 상태 변경 없이 `stateDiff = null` 확인

확인한 명령:

```text
/cast chill_touch {targetSessionCharacterId} 125
```

### C-2. Chill Touch 정상 거리 시전 확인 완료

- 90ft 입력 시 `hook.combat.resolve_attack_roll` 실행 확인
- `hook.spell.cast_chill_touch accepted = true` 확인
- 공격이 빗나가 `damageRoll/stateDiff`는 null
- `outcome = FAILURE`, `narration = Chill Touch가 빗나갔습니다` 확인

확인한 명령:

```text
/cast chill_touch {targetSessionCharacterId} 90
```

### C-3. Chill Touch 명중 확인 완료

- 정상 거리 90ft에서 spell hook accepted 확인
- 명중 시 necrotic `damagePacket` 생성 확인
- `damageRoll = 1d8` 생성 확인
- `hook.damage.apply_resistance_vulnerability` 실행 확인
- `stateDiff`에 타겟 HP 감소 반영 확인

확인한 결과:

```text
damageType = necrotic
damageRoll.expression = 1d8
healingBlockedUntil = caster_next_turn_start
stateDiff.reason = cast_spell
```

### D. slashing resistance 확인 완료

- `resistance:slashing` condition 추가 확인
- `/damage 8 slashing` 적용 시 `hook.damage.apply_resistance_vulnerability` 실행 확인
- `appliedDamageModifiers`에 `resistance:slashing` 기록 확인
- `finalDamage`가 8에서 4로 감소 확인

확인한 명령:

```text
/condition add {targetSessionCharacterId} resistance:slashing
/damage {targetSessionCharacterId} 8 slashing
```

### D. slashing vulnerability 확인 완료

- `vulnerability:slashing` condition 추가 후 `/damage 8 slashing` 실행
- `hook.damage.apply_resistance_vulnerability` 실행 확인
- `appliedDamageModifiers`에 `vulnerability:slashing` 기록 확인
- `finalDamage`가 8에서 16으로 증가 확인

확인한 명령:

```text
/condition add {targetSessionCharacterId} vulnerability:slashing
/damage {targetSessionCharacterId} 8 slashing
```

## 직업명 사용 기준

AI SRD 산출물 기준으로 class는 12개 정식 SRD 직업을 따른다.

예:

- `Fighter`
- `Barbarian`
- `Rogue`
- `Wizard`
- `Ranger`
- `Cleric`
- `Druid`
- `Bard`
- `Monk`
- `Paladin`
- `Sorcerer`
- `Warlock`

따라서 `className = Archer`는 정식 클래스가 아니라 역할/빌드명에 가깝다.

추천:

```json
{
  "className": "Fighter",
  "subclassName": "Champion"
}
```

또는 궁수형 캐릭터라면:

```json
{
  "className": "Ranger",
  "subclassName": "Hunter"
}
```

법사는:

```json
{
  "className": "Wizard"
}
```

현재 룰 훅이 class feature로 직접 지원하는 직업은 Fighter, Barbarian, Rogue 중심이다.

즉, Wizard나 Ranger에 특성이 없다는 뜻이 아니라, 아직 백엔드 deterministic hook으로 구현한 직업 기능이 적다는 뜻이다.

## 아직 남은 확인 작업

Swagger로 추가 확인하면 좋은 것:

1. Fighter
   - `/feature second_wind`
   - `/feature action_surge`

2. Barbarian
   - `/feature rage`
   - `/feature frenzy`
   - Rage 종료 시 exhaustion 증가

3. Rogue
   - `/feature cunning_action hide`
   - advantage 조건에서 Sneak Attack 적용

4. Rest
   - combat 종료 후 `/rest short`
   - combat 종료 후 `/rest long`

5. Bag of Holding
   - 현재는 REST API가 없어서 Swagger 확인은 어렵다.
   - `InventoryRuntimeService` unit test로 확인한다.

## 테스트

후속 구현 중 확인한 테스트:

```bash
npm run test -w @trpg/be -- be/src/modules/rules/rule-engine.service.spec.ts be/src/modules/rules/action-rule.service.spec.ts be/src/modules/rules/command-parser.service.spec.ts be/src/modules/rules/dice.service.spec.ts be/src/modules/rules/action-economy.service.spec.ts be/src/modules/rules/character-resource.service.spec.ts be/src/modules/rules/map-position.service.spec.ts be/src/modules/rules/inventory-runtime.service.spec.ts be/src/modules/combat/combat.service.spec.ts --runInBand
```

결과:

```text
9 suites / 80 tests 통과
```

백엔드 빌드도 통과했다.

