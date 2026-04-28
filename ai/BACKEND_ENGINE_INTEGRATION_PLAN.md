# 백엔드 엔진 연결 계획

## 1. 목적

이 문서는 `ai/generated/srd/rules_hooks.json`에 고정된 deterministic rule hook fixture를 실제 백엔드 규칙 엔진과 연결할 때의 작업 순서와 계약을 분리해 둔다.

현재 단계에서는 백엔드 코드를 수정하지 않는다. `ai/` 폴더 안에서 연결 기준, 우선순위, DTO 경계, 테스트 기준만 확정한다.

2026-04-28 기준 백엔드 연결 준비 산출물:

- `generated/srd/rules_hooks.json`: 전체 deterministic hook fixture 12개
- `generated/srd/backend_engine_p0_contracts.json`: P0 hook 4개에 대한 백엔드 요청/응답 계약 예제 12개
- `generated/srd/interpreter_backend_handoff_cases.json`: Interpreter 출력에서 P0 hook 요청으로 이어지는 handoff 예제 3개
- `generated/srd/narrator_input_fixtures.json`: P0 hook 결과에서 Narrator 요청으로 이어지는 서술 입력 예제 3개
- `app/tests/test_srd_rule_hooks.py`: hook fixture, source ID, P0 contract 동기화 테스트

## 2. 연결 원칙

- AI는 행동 후보, 관련 규칙, 관련 엔진 hook 후보를 제공할 수 있다.
- 백엔드는 명중, 빗나감, 피해, 회복, 상태, 자원 소비, 인벤토리 변경을 확정한다.
- `rules_hooks.json`은 엔진 함수 구현이 아니라 백엔드가 구현해야 할 계약 fixture다.
- 백엔드 엔진은 hook의 `consumes`를 입력 스냅샷으로 받고, `produces`만 결과 패치로 반환한다.
- AI 출력은 engine-owned 결과를 직접 포함해도 authoritative 값으로 쓰지 않는다.

## 3. 현재 Hook 범위

| 우선순위 | Hook ID | Engine Function | 백엔드 책임 |
| --- | --- | --- | --- |
| P0 | `hook.combat.resolve_attack_roll` | `resolve_attack_roll` | d20, 공격 보너스, AC, advantage 상태로 명중/치명타/빗나감 확정 |
| P0 | `hook.damage.apply_resistance_vulnerability` | `apply_damage_modifiers` | 면역/저항/취약을 적용해 최종 피해 확정 |
| P0 | `hook.condition.apply_prone_modifiers` | `apply_condition_modifiers` | 넘어짐 상태의 이동 비용과 공격 advantage/disadvantage 확정 |
| P0 | `hook.spell.cast_chill_touch` | `resolve_spell_cast` | 싸늘한 손길 시전 조건, 공격 굴림 의존성, 명중 시 피해/치유 차단 확정 |
| P1 | `hook.item.bag_of_holding_capacity` | `validate_container_capacity` | 보유의 주머니 중량/부피/파손 조건 검증 |
| P1 | `hook.class.fighter.second_wind` | `apply_second_wind` | 파이터 재기의 숨결 회복량과 자원 소비 확정 |
| P1 | `hook.class.fighter.action_surge` | `apply_action_surge` | 행동 연쇄 추가 행동과 사용 횟수 소비 확정 |
| P1 | `hook.class.barbarian.rage` | `apply_rage` | 격노 자원, 보너스 행동, 저항, 피해 보너스, 집중 종료 확정 |
| P1 | `hook.class.rogue.sneak_attack` | `apply_sneak_attack` | 암습 조건과 추가 피해 확정 |
| P2 | `hook.class.fighter.champion_critical_threshold` | `apply_critical_threshold_modifier` | 챔피언 치명타 임계값 확정 |
| P2 | `hook.class.rogue.cunning_action` | `apply_cunning_action` | 교활한 행동의 보너스 행동 사용과 허용 행동 확정 |
| P2 | `hook.class.barbarian.frenzy` | `apply_frenzy` | 광분 활성화, 이후 추가 공격 권한, 탈진 예약 확정 |

## 4. 추천 연결 순서

1. `resolve_attack_roll`을 먼저 구현한다. 주문 공격, 무기 공격, 치명타, 로그 암습, 챔피언 치명타가 모두 이 결과에 의존한다.
2. `apply_damage_modifiers`를 연결한다. 피해 패킷이 HP 변경 전에 확정되는 구조를 만든다.
3. `apply_condition_modifiers`를 연결한다. 이동/공격 보정이 공격 굴림 입력에 영향을 주기 때문이다.
4. `resolve_spell_cast` 중 `spell.chill_touch`만 MVP slice로 연결한다.
5. `apply_second_wind`, `apply_action_surge`, `apply_rage`, `apply_sneak_attack`을 직업 기능 MVP로 연결한다.
6. `validate_container_capacity`, `apply_critical_threshold_modifier`, `apply_cunning_action`, `apply_frenzy`를 두 번째 slice로 연결한다.

## 5. 공통 DTO 경계

백엔드 연결 시 hook별 구현은 아래 공통 envelope를 사용한다.

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

응답은 아래 형태로 고정한다.

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

- `input`은 hook의 `consumes`에 대응한다.
- `produced`는 hook의 `produces`에 대응한다.
- `statePatch`는 백엔드 엔진만 만든다.
- `sourceTraceId`는 AI가 행동 후보를 만들었을 때만 연결한다.
- `rejectedReason`은 부족한 행동, 사거리 밖, 자원 없음, 대상 없음처럼 플레이어에게 설명 가능한 실패 사유를 담는다.

이 envelope의 P0 예제는 `generated/srd/backend_engine_p0_contracts.json`에 고정한다. 백엔드 구현 시 이 파일의 `request.input`은 hook의 `consumes`와 맞아야 하고, `expectedResponse.produced`는 hook의 `produces`와 맞아야 한다.

## 6. Hook별 최소 입력

### `hook.combat.resolve_attack_roll`

- 입력: `naturalD20`, `attackBonus`, `targetArmorClass`, `advantageState`
- 출력: `attackRollTotal`, `hit`, `criticalHit`, `criticalMiss`
- 테스트: 자연 1은 항상 실패, 자연 20은 항상 명중/치명타, 그 외는 total >= AC

### `hook.damage.apply_resistance_vulnerability`

- 입력: `baseDamage`, `damageType`, `targetImmunities`, `targetResistances`, `targetVulnerabilities`
- 출력: `finalDamage`, `appliedDamageModifiers`
- 테스트: 면역 0, 저항 절반, 취약 2배, 중복 저항/취약 1회만 적용

### `hook.condition.apply_prone_modifiers`

- 입력: `condition.prone`, `attackerDistanceFt`, `remainingMovementFt`, `baseSpeedFt`
- 출력: `movementCostFt`, `selfAttackDisadvantage`, `incomingAttackAdvantageState`
- 테스트: 일어서기 비용은 기본 속도의 절반, 5피트 이내 공격자는 유리함, 원거리 공격자는 불리함

### `hook.spell.cast_chill_touch`

- 입력: `spell.chill_touch`, `casterKnownCantrips`, `actionAvailable`, `targetDistanceFt`, `componentAvailability`, `spellAttackRollResult`
- 출력: `validatedSpellCast`, `damagePacket.necrotic`, `healingBlockedUntil`, `undeadAttackDisadvantage`
- 테스트: 캔트립이라 슬롯을 쓰지 않음, 120피트 사거리, 음성/동작 구성요소 필요, 명중 판정은 `resolve_attack_roll` 결과 사용

## 7. 테스트 이동 계획

백엔드 구현을 시작하면 아래 순서로 테스트를 옮긴다.

1. `ai/app/tests/test_srd_rule_hooks.py`의 fixture 존재/출처 검증은 AI 폴더에 유지한다.
2. `generated/srd/backend_engine_p0_contracts.json`의 12개 case를 백엔드 pure function unit test의 seed로 복사한다.
3. 백엔드에는 contract에 없는 추가 edge case unit test를 더한다. 예: advantage/disadvantage 실제 d20 선택, 중복 저항/취약, 여러 상태가 동시에 걸린 경우.
4. `ACTION-001` 경로에서는 `Interpreter` 결과가 hook 후보를 찾고, 백엔드가 해당 hook을 실행해 `TurnLog`와 `StateDiff`를 만드는 integration test를 추가한다.
5. AI live test는 엔진 결과 검증에 쓰지 않는다. AI live test는 provider/JSON schema smoke test로만 유지한다.

`ACTION-001` integration test seed는 `generated/srd/interpreter_backend_handoff_cases.json`를 우선 사용한다. 이 파일은 AI 출력이 authoritative 결과가 아니라 hook 실행 요청을 구성하기 위한 후보 입력임을 보여준다.

Narrator 호출 integration test seed는 `generated/srd/narrator_input_fixtures.json`를 우선 사용한다. 이 파일은 백엔드가 이미 확정한 `CheckRequest`, `DiceResult`, 공개 요약 `NarratorStateDiffSummary`만 Narrator에 전달해야 하며, 거절된 hook 결과에서는 새 판정/주사위 결과를 만들지 않는다는 기준을 고정한다.

## 8. 완료 기준

- 12개 hook이 백엔드 쪽 구현 대상 목록에 1:1로 매핑된다.
- P0 hook 4개는 백엔드 pure unit test를 가진다.
- P0 hook 4개는 `backend_engine_p0_contracts.json`의 정상/경계/거절 request/expectedResponse 예제를 기준으로 구현된다.
- Interpreter handoff 3개 예제가 백엔드 integration test seed로 존재한다.
- Narrator 입력 3개 예제가 백엔드 확정 결과 서술 test seed로 존재한다.
- AI가 반환한 `relatedEngineHooks` 없이도 백엔드가 `StructuredAction`과 현재 상태로 필요한 hook을 다시 찾을 수 있다.
- engine-owned 결과는 모두 백엔드 `TurnLog`/`StateDiff`에서 나온다.
- AI trace는 원인 추적용으로만 연결되고, 게임 사실의 source-of-truth가 되지 않는다.
