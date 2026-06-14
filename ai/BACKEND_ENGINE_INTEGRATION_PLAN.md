# 백엔드 엔진 연결 계획

이 문서는 `srd-data/generated/srd/rules_hooks.json`의 hook fixture를 실제 백엔드 룰 엔진으로 옮기는 순서를 고정한다.

현재 이 폴더 안의 파일들은 엔진 구현이 아니다. 백엔드가 구현할 계약과 테스트 seed다.

## 원칙

- AI는 행동 후보와 관련 규칙을 제안한다.
- 백엔드는 명중, 피해, 회복, 상태, 자원, 인벤토리, 장면 이동을 확정한다.
- `rules_hooks.json`은 구현 코드가 아니라 계약 fixture다.
- AI가 준 `relatedEngineHooks`는 참고값이다. 백엔드는 현재 상태와 `StructuredAction`으로 필요한 hook을 다시 판단해야 한다.

## 현재 준비된 산출물

| 파일                                                   | 뜻                                               |
| ------------------------------------------------------ | ------------------------------------------------ |
| `srd-data/generated/srd/rules_hooks.json`                       | 전체 hook fixture 12개                           |
| `srd-data/generated/srd/backend_engine_p0_contracts.json`       | P0 hook 4개의 정상/경계/거절 case 12개           |
| `srd-data/generated/srd/interpreter_backend_handoff_cases.json` | Interpreter 결과에서 hook 요청으로 넘기는 예 3개 |
| `srd-data/generated/srd/narrator_input_fixtures.json`           | hook 결과에서 Narrator 요청으로 넘기는 예 3개    |
| `app/tests/test_srd_rule_hooks.py`                     | fixture와 source ID 동기화 검증                  |

## 구현 순서

| 순서 | Hook                                                                                                       | 이유                                      |
| ---: | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
|    1 | `resolve_attack_roll`                                                                                      | 무기 공격, 주문 공격, 치명타, 암습이 의존 |
|    2 | `apply_damage_modifiers`                                                                                   | HP 변경 전 피해량 확정이 필요             |
|    3 | `apply_condition_modifiers`                                                                                | 공격/이동 보정이 다른 판정 입력에 영향    |
|    4 | `resolve_spell_cast` 중 `spell.chill_touch`                                                                | 주문 처리 MVP slice                       |
|    5 | `apply_second_wind`, `apply_action_surge`, `apply_rage`, `apply_sneak_attack`                              | 직업 기능 MVP                             |
|    6 | `validate_container_capacity`, `apply_critical_threshold_modifier`, `apply_cunning_action`, `apply_frenzy` | 두 번째 slice                             |

## Hook 목록

| 우선순위 | Hook ID                                          | Engine Function                     |
| -------- | ------------------------------------------------ | ----------------------------------- |
| P0       | `hook.combat.resolve_attack_roll`                | `resolve_attack_roll`               |
| P0       | `hook.damage.apply_resistance_vulnerability`     | `apply_damage_modifiers`            |
| P0       | `hook.condition.apply_prone_modifiers`           | `apply_condition_modifiers`         |
| P0       | `hook.spell.cast_chill_touch`                    | `resolve_spell_cast`                |
| P1       | `hook.item.bag_of_holding_capacity`              | `validate_container_capacity`       |
| P1       | `hook.class.fighter.second_wind`                 | `apply_second_wind`                 |
| P1       | `hook.class.fighter.action_surge`                | `apply_action_surge`                |
| P1       | `hook.class.barbarian.rage`                      | `apply_rage`                        |
| P1       | `hook.class.rogue.sneak_attack`                  | `apply_sneak_attack`                |
| P2       | `hook.class.fighter.champion_critical_threshold` | `apply_critical_threshold_modifier` |
| P2       | `hook.class.rogue.cunning_action`                | `apply_cunning_action`              |
| P2       | `hook.class.barbarian.frenzy`                    | `apply_frenzy`                      |

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
| `resolve_spell_cast`        | 싸늘한 손길 사거리, 구성요소, 슬롯 미사용, 명중 결과 의존 |

## 백엔드로 옮길 때

1. `backend_engine_p0_contracts.json`의 12개 case를 백엔드 pure unit test seed로 복사한다.
2. 백엔드에는 contract 외 edge case를 추가한다.
3. `ACTION-001` integration test는 `interpreter_backend_handoff_cases.json`를 seed로 쓴다.
4. Narrator integration test는 `narrator_input_fixtures.json`를 seed로 쓴다.
5. live AI test는 엔진 검증에 쓰지 않는다. provider/JSON smoke에만 쓴다.

## 완료 기준

- 12개 hook이 백엔드 구현 대상에 1:1 매핑된다.
- P0 hook 4개는 pure unit test를 가진다.
- AI 출력 없이도 백엔드가 `StructuredAction`과 현재 상태로 필요한 hook을 찾는다.
- engine-owned 결과는 모두 백엔드 `TurnLog`/`StateDiff`에서 나온다.
- AI trace는 원인 추적용일 뿐 게임 사실의 source of truth가 아니다.
