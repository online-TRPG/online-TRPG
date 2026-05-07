# 백엔드 엔진 연결 계획

이 문서는 `generated/srd/rules_hooks.json`의 hook fixture를 실제 백엔드 룰 엔진으로 옮기는 순서를 고정한다.

현재 이 폴더 안의 파일들은 엔진 구현이 아니다. 백엔드가 구현할 계약과 테스트 seed다.

## 원칙

- AI는 행동 후보와 관련 규칙을 제안한다.
- 백엔드는 명중, 피해, 회복, 상태, 자원, 인벤토리, 장면 이동을 확정한다.
- `rules_hooks.json`은 구현 코드가 아니라 계약 fixture다.
- AI가 준 `relatedEngineHooks`는 참고값이다. 백엔드는 현재 상태와 `StructuredAction`으로 필요한 hook을 다시 판단해야 한다.

## 현재 준비된 산출물

| 파일                                                   | 뜻                                               |
| ------------------------------------------------------ | ------------------------------------------------ |
| `generated/srd/rules_hooks.json`                       | MVP hook fixture 17개                            |
| `generated/srd/backend_engine_p0_contracts.json`       | P0 hook 11개의 정상/경계/거절 case 19개          |
| `generated/srd/interpreter_backend_handoff_cases.json` | Interpreter 결과에서 hook 요청으로 넘기는 예 7개 |
| `generated/srd/narrator_input_fixtures.json`           | hook 결과에서 Narrator 요청으로 조립하는 예 7개  |
| `app/tests/test_srd_rule_hooks.py`                     | fixture와 source ID 동기화 검증                  |

## 구현 순서

| 순서 | Hook                                                                                                       | 이유                                      |
| ---: | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
|    1 | `resolve_attack_roll`                                                                                      | 무기 공격, 주문 공격, 치명타, 암습이 의존 |
|    2 | `apply_damage_modifiers`                                                                                   | HP 변경 전 피해량 확정이 필요             |
|    3 | `apply_condition_modifiers`                                                                                | 공격/이동 보정이 다른 판정 입력에 영향    |
|    4 | `resolve_spell_cast` 중 `spell.chill_touch`, `spell.fire_bolt`, `spell.magic_missile`                      | 위저드 MVP 주문                           |
|    5 | `resolve_healing_spell`, `apply_healing_item`                                                              | 회복 주문/아이템                          |
|    6 | `apply_second_wind`, `apply_sneak_attack`                                                                  | 파이터/로그 1레벨 핵심 기능               |
|    7 | `apply_magic_item_bonus`, `validate_container_capacity`                                                    | 범용 마법 아이템                          |
|    8 | `apply_action_surge`, `apply_cunning_action`, `apply_critical_threshold_modifier`                          | 낮은 레벨 이후 확장 slice                 |

## Hook 목록

| 우선순위 | Hook ID                                          | Engine Function                     |
| -------- | ------------------------------------------------ | ----------------------------------- |
| P0       | `hook.combat.resolve_attack_roll`                | `resolve_attack_roll`               |
| P0       | `hook.damage.apply_resistance_vulnerability`     | `apply_damage_modifiers`            |
| P0       | `hook.check.resolve_ability_or_skill_check`      | `resolve_ability_or_skill_check`    |
| P0       | `hook.condition.apply_prone_modifiers`           | `apply_condition_modifiers`         |
| P0       | `hook.spell.cast_chill_touch`                    | `resolve_spell_cast`                |
| P0       | `hook.spell.cast_fire_bolt`                      | `resolve_spell_cast`                |
| P0       | `hook.spell.cast_magic_missile`                  | `resolve_spell_cast`                |
| P0       | `hook.spell.cast_cure_wounds`                    | `resolve_healing_spell`             |
| P0       | `hook.item.use_potion_of_healing`                | `apply_healing_item`                |
| P0       | `hook.item.apply_flat_magic_bonus`               | `apply_magic_item_bonus`            |
| P0       | `hook.class.ranger.fighting_style_archery`       | `apply_ranger_archery_fighting_style` |
| P0       | `hook.class.ranger.natural_explorer_check`       | `apply_ranger_natural_explorer_check` |
| P0       | `hook.class.fighter.second_wind`                 | `apply_second_wind`                 |
| P0       | `hook.class.rogue.sneak_attack`                  | `apply_sneak_attack`                |
| P1       | `hook.item.bag_of_holding_capacity`              | `validate_container_capacity`       |
| P1       | `hook.class.fighter.action_surge`                | `apply_action_surge`                |
| P2       | `hook.class.fighter.champion_critical_threshold` | `apply_critical_threshold_modifier` |
| P2       | `hook.class.rogue.cunning_action`                | `apply_cunning_action`              |

## 공통 요청 envelope

```json
{
  "hookId": "hook.combat.resolve_attack_roll",
  "sessionId": "session-1",
  "turnId": "turn-7",
  "actorCharacterId": "character-1",
  "targetId": "monster-1",
  "input": {},
  "sourceAction": {},
  "sourceTraceId": "trace-optional"
}
```

## 공통 응답 envelope

```json
{
  "hookId": "hook.combat.resolve_attack_roll",
  "accepted": true,
  "produced": {},
  "statePatch": [],
  "turnLogEvents": [],
  "rejectedReason": null
}
```

규칙:

- `input`은 hook의 `consumes`와 맞춘다.
- `produced`는 hook의 `produces`와 맞춘다.
- `statePatch`는 백엔드 엔진만 만든다.
- `sourceTraceId`는 AI가 후보를 만든 경우에만 연결한다.
- `rejectedReason`은 플레이어에게 설명 가능한 거절 이유다.

## P0 최소 테스트

| Hook                        | 꼭 검증할 것                                              |
| --------------------------- | --------------------------------------------------------- |
| `resolve_attack_roll`       | 자연 1은 실패, 자연 20은 명중/치명타, 그 외는 total >= AC |
| `apply_damage_modifiers`    | 면역 0, 저항 절반, 취약 2배, 중복 보정 처리               |
| `apply_condition_modifiers` | 넘어짐에서 일어서기 비용, 근접/원거리 공격 보정           |
| `resolve_spell_cast`        | 싸늘한 손길, 화염 화살, 마법 화살의 사거리/구성요소/슬롯/명중 처리 |
| `resolve_healing_spell`     | 상처 치료의 접촉, 슬롯 소비, HP 상한                     |
| `apply_healing_item`        | 치유 물약의 행동 소비, 2d4+2 회복, 인벤토리 소모         |
| `apply_magic_item_bonus`    | +1 무기/갑옷/방패/탄약 보너스 적용                       |
| `apply_second_wind`         | 1d10 + fighterLevel 회복, 추가 행동 소비, 재사용 제한    |
| `apply_sneak_attack`        | 1턴 1회, 기교/원거리 무기, 유리함/근접 적 조건           |

## 백엔드로 옮길 때

1. `backend_engine_p0_contracts.json`의 19개 case를 백엔드 pure unit test seed로 복사한다.
2. 백엔드에는 contract 외 edge case를 추가한다.
3. `ACTION-001` integration test는 `interpreter_backend_handoff_cases.json`를 seed로 쓴다.
4. Narrator integration test는 `narrator_input_fixtures.json`를 seed로 쓴다.
5. live AI test는 엔진 검증에 쓰지 않는다. provider/JSON smoke에만 쓴다.

## 완료 기준

- MVP hook 17개가 백엔드 구현 대상 또는 backlog에 1:1 매핑된다.
- P0 hook 11개는 pure unit test를 가진다.
- AI 출력 없이도 백엔드가 `StructuredAction`과 현재 상태로 필요한 hook을 찾는다.
- engine-owned 결과는 모두 백엔드 `TurnLog`/`StateDiff`에서 나온다.
- AI trace는 원인 추적용일 뿐 게임 사실의 source of truth가 아니다.
