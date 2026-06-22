# 전투 공통 피해 finalizer 설계

## 목적

현재 `CombatService`의 모든 전투 피해 경로가 HP 감소와 집중 내성 판정을 각각 직접 호출한다. 이 구조에서는 새 피해 경로가 HP만 감소시키고 집중 내성을 빠뜨리거나, 기존 경로에서 집중 내성을 두 번 호출할 위험이 있다.

이 증분은 한 피해 packet을 적용하는 공통 private helper를 추가해 다음 불변식을 코드 구조로 강제한다.

> 전투에서 1 이상의 피해가 확정되면 HP 변경, 수면 해제, 생존 상태 및 VTT token 처리, 집중 내성 판정이 하나의 공통 경로에서 정확히 한 번 수행된다.

## 범위

포함:

- `CombatService` 내부 공통 피해 finalizer
- 현재 직접 HP 감소와 집중 판정을 연결하는 모든 피해 경로 전환
- 기존 피해 packet 단위 보존
- 집중 내성 결과를 기존 로그 및 realtime event 경로에 반환
- 회귀 스펙과 `doc/future_plan_mvp.md` 상태 갱신

제외:

- 회복 경로 변경
- 피해 저항·면역·취약성 계산 재설계
- 공격·주문·AoE damage dice 계산 변경
- TurnLog 또는 realtime event 형식 변경
- 별도 `DamageRuntimeService` 도입
- HP·condition·VTT map을 하나의 데이터베이스 transaction으로 묶는 확장

## 현재 문제

다음 피해 경로가 같은 작업을 개별적으로 수행한다.

- GM/host 직접 피해 API `applyDamage()`
- 전투 주문 Magic Missile
- 전투 주문 Fireball 대상별 피해
- 일반 무기 및 monster attack
- 지형 진입·턴 시작 피해
- Shield 반응 처리 후 확정된 공격 피해
- 준비행동 Magic Missile

각 경로는 대체로 다음 코드를 반복한다.

```ts
await this.applyHitPointDelta(combat, target, -damage);
const concentrationCheck =
  await this.resolveCombatConcentrationDamageCheck(target, damage);
```

`applyHitPointDelta()`는 HP 동기화, 생존 상태, token 숨김, 수면 해제를 담당한다. 집중 판정은 호출자 책임이므로 두 동작의 결합이 관례에만 의존한다.

## 승인된 구조

### 공통 helper

`CombatService`에 다음 의미의 private helper를 추가한다.

```ts
private async finalizeCombatDamage(
  combat: NonNullable<CombatWithParticipants>,
  target: CombatParticipantEntity,
  damage: number,
): Promise<{
  damageApplied: number;
  concentrationCheck: CombatConcentrationCheckResult | null;
}>
```

동작:

1. `damage`를 0 이상의 정수로 정규화한다.
2. 0이면 상태를 변경하지 않고 `{ damageApplied: 0, concentrationCheck: null }`을 반환한다.
3. `applyHitPointDelta(combat, target, -damageApplied)`를 호출한다.
4. 같은 `damageApplied`로 `resolveCombatConcentrationDamageCheck()`를 정확히 한 번 호출한다.
5. 적용 피해량과 집중 판정 결과를 호출자에게 반환한다.

이 helper는 dice를 굴리거나, TurnLog를 만들거나, realtime event를 방출하거나, 전투 종료를 판정하지 않는다. 해당 책임은 기존 호출자에 남긴다.

### 회복 경계

`applyHitPointDelta()`는 회복과 피해 양쪽에서 사용되므로 유지한다.

- 회복: 기존처럼 `applyHitPointDelta(..., positiveAmount)` 직접 호출
- 피해: 반드시 `finalizeCombatDamage(..., damage)` 호출

`applyHitPointDelta()`를 피해 전용으로 바꾸거나 집중 처리를 내부에 숨기지 않는다.

## 피해 packet 의미 보존

공통화 과정에서 집중 내성 횟수가 달라지면 안 된다.

- 일반 공격: sneak attack 등을 합산한 최종 피해 packet당 1회
- Magic Missile: 현재 구현의 각 missile damage roll당 1회
- Fireball: 각 대상의 `finalDamage`당 1회
- 지형: 결합된 지형 피해 roll당 1회
- Shield 후 공격: Shield 적용 후 실제 명중 피해당 1회
- 준비행동 Magic Missile: 준비 주문의 최종 damage roll당 1회
- 직접 피해 API: 요청 1건당 1회

0 피해, 회복, 빗나감에는 집중 내성이 발생하지 않는다.

## 호출자 책임

공통 finalizer가 반환한 `concentrationCheck`는 기존 호출자가 계속 사용한다.

- 집중 내성 dice realtime event 방출
- TurnLog `structuredAction.concentrationCheck` 기록
- AoE와 다중 missile의 대상별 결과 수집
- 전투 종료 확인
- session snapshot 및 combat update 방출

따라서 이벤트 순서와 응답 DTO는 이번 증분에서 바뀌지 않는다.

## 오류와 일관성

- HP 저장이 실패하면 집중 판정을 진행하지 않는다.
- 집중 판정 또는 condition 저장이 실패하면 호출자는 실패를 전파한다.
- 이번 증분은 기존보다 더 강한 database transaction을 도입하지 않는다. HP 쓰기와 집중 condition 쓰기의 원자성 확대는 별도 작업으로 남긴다.
- 피해 적용 후 대상이 0 HP가 되어도 기존과 동일하게 집중 판정을 시도한다. 0 HP 자체가 즉시 집중을 종료하는 별도 규칙은 이번 증분에서 추가하지 않는다.
- finalizer는 `CombatService`의 private 경계이며 public API를 변경하지 않는다.

## 스펙 전략

Codex는 저장소 지침에 따라 테스트를 직접 실행하지 않는다. 구현 전에 기존 스펙을 보강하고, 사용자가 테스트와 빌드를 실행한다.

검증할 동작:

- 직접 피해 API가 finalizer 경유 후 집중 판정을 한 번 수행한다.
- 일반 공격, 주문, AoE, 지형, Shield 후 공격, 준비 주문의 기존 집중 판정 결과가 유지된다.
- 0 피해와 회복은 집중 판정을 호출하지 않는다.
- Magic Missile과 AoE의 기존 packet별 판정 횟수가 유지된다.
- `applyHitPointDelta(..., negativeDamage)`와 직접 `resolveCombatConcentrationDamageCheck()`를 연속 호출하는 production 경로가 남지 않는다.

사용자 실행:

```powershell
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
npm run test -w @trpg/be -- concentration-runtime.service.spec.ts --runInBand
npm run build -w @trpg/be
```

## 구현 대상

- `be/src/modules/combat/combat.service.ts`
- `be/src/modules/combat/combat.service.spec.ts`
- `doc/future_plan_mvp.md`
