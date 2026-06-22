# 전투 집중 상태 투영 설계

## 목적

서버에 이미 저장되는 구조화된 집중(concentration) 상태를 전투 응답과 플레이 UI까지 일관되게 전달한다. 피해 후 집중 내성, 새 집중 시작 시 기존 집중 교체, 연결 효과 제거라는 기존 런타임 동작은 유지하면서 플레이어와 GM이 현재 집중 유지 여부를 전투 화면에서 확인할 수 있게 한다.

이 증분의 완료 기준은 다음과 같다.

- 집중 중인 전투 참가자는 `CombatResponseDto`에서 구조화된 집중 상태를 제공한다.
- 집중하지 않는 참가자는 `concentration: null`을 제공한다.
- 기존 `conditions: string[]` 응답은 하위 호환성을 위해 유지한다.
- 전투 UI는 집중 중인 참가자에게 명시적인 상태 문구를 표시한다.
- 손상되거나 오래된 condition JSON은 전투 조회를 실패시키지 않는다.

## 범위

포함:

- shared DTO의 집중 상태 타입
- `ConcentrationRuntimeService`의 읽기 전용 집중 상태 해석 API
- `CombatService.mapCombat()`의 참가자별 집중 상태 투영
- 참가자 상태 관찰 문구와 전투 UI 표시
- 서버 단위 스펙과 프런트 타입 빌드·수동 확인
- `doc/future_plan_mvp.md` 구현 상태 갱신

제외:

- 새 주문 추가
- 집중 주문의 실제 효과 모델 신규 도입
- 데이터베이스 스키마 또는 별도 concentration 엔티티
- 사용자별로 다른 집중 정보 마스킹
- 기존 집중 내성 및 효과 제거 규칙의 재설계

## API 설계

`shared-types/src/dto/api/gameplay.dto.ts`에 다음 응답 모델을 추가한다.

```ts
export class CombatConcentrationStateDto {
  spellId!: string;
  targetIds!: string[];
  effectIds!: string[];
  startedAtRound!: number;
  endsAtRound!: number | null;
  endsAtTurn!: number | null;
}
```

`CombatParticipantResponseDto`에는 다음 필드를 추가한다.

```ts
concentration!: CombatConcentrationStateDto | null;
```

집중 주체는 해당 DTO를 포함하는 참가자 자체이므로 별도 `casterId`를 응답에 중복하지 않는다. 기존 `conditions` 배열은 제거하거나 의미를 변경하지 않는다.

## 서버 구조

### 집중 상태 해석

`ConcentrationRuntimeService`가 condition 내부 태그 형식을 해석하는 유일한 위치가 된다. 현재 private인 집중 상태 변환 로직을 기반으로, condition 배열에서 활성 집중 상태를 읽는 public 메서드를 제공한다.

이 메서드는 다음 규칙을 따른다.

- `condition.concentration` 또는 `concentration` 태그가 있는 첫 활성 condition을 사용한다.
- `concentration:spell:*`, `concentration:target:*`, `concentration:effect:*` 태그를 기존 방식으로 해석한다.
- 주문 ID가 없으면 불완전한 집중 상태로 간주하고 `null`을 반환한다.
- 시작 및 종료 시점은 condition의 `appliedAtRound`와 `expiresAtTurn`에서 읽는다.
- 저장 형식을 새로 만들지 않으며 기존 condition JSON과 호환된다.

### 전투 응답 매핑

`CombatService.mapCombat()`은 참가자마다 실제 적용 중인 condition JSON을 한 번 구조화해 읽는다. 세션 캐릭터 condition이 있으면 이를 우선하고, 없으면 combat participant snapshot을 사용한다.

동일한 원본에서 다음 두 표현을 만든다.

- 기존 UI와 룰 소비자를 위한 평탄화된 `conditions`
- 새 UI와 후속 액션 표면을 위한 구조화된 `concentration`

`CombatService`가 집중 태그 접두사를 직접 파싱하지 않고 `ConcentrationRuntimeService`의 public 읽기 API를 호출한다. 이 경계로 집중 저장 표현이 바뀌어도 전투 응답 소비자는 DTO 계약만 유지하면 된다.

## 프런트엔드 표시

`describeCombatParticipantObservation()`은 `concentration`을 선택적으로 받아 집중 중이면 `정신을 집중해 주문을 유지하고 있다` 문구를 상태 관찰 결과에 포함한다.

표시 규칙:

- 모든 참가자에게 집중 유지 여부는 보인다. SRD 전투에서 집중 여부는 관찰 가능한 공통 상태로 취급한다.
- 기본 상태 문구에는 내부 `spellId`, target/effect ID를 노출하지 않는다.
- 기존 상태이상 문구와 합쳐 최대 표시 개수를 적용하되, 집중 문구는 다른 상태에 밀려 사라지지 않도록 우선 표시한다.
- 집중하지 않으면 기존 관찰 문구와 화면 동작이 바뀌지 않는다.

구조화된 상세 필드는 후속 주문/효과 UI에서 사용할 수 있도록 응답에 남기지만, 이번 증분에서는 별도 상세 패널을 추가하지 않는다.

## 데이터 흐름

1. 주문 실행 경로가 집중 condition과 연결 태그를 저장한다.
2. 전투 조회 또는 실시간 combat update가 `CombatService.mapCombat()`을 호출한다.
3. `ConditionRuntimeService`가 condition JSON을 안전하게 정규화한다.
4. `ConcentrationRuntimeService`가 활성 집중 상태를 구조화한다.
5. `CombatParticipantResponseDto.concentration`에 상태가 투영된다.
6. 전투 UI가 참가자 관찰 모델을 통해 집중 유지 문구를 표시한다.
7. 피해로 집중이 종료되면 기존 런타임이 condition을 제거하고, 다음 전투 응답에서 `concentration`은 `null`이 된다.

## 오류 및 호환성

- condition JSON 파싱 실패는 기존처럼 빈 condition 목록으로 처리하며 전투 조회를 실패시키지 않는다.
- 집중 condition은 있으나 주문 ID가 없으면 `concentration: null`로 투영한다.
- 중복 집중 condition이 발견되면 기존 런타임 의미와 맞춰 첫 활성 항목만 투영한다. 새 집중 시작 경로가 기존 집중을 교체하므로 정상 저장 상태에서는 하나만 존재한다.
- 클라이언트가 새 필드를 사용하지 않아도 기존 필드는 그대로 유지된다.
- 데이터베이스 마이그레이션은 필요하지 않다.

## 검증 설계

Codex는 저장소 지침에 따라 테스트를 직접 실행하지 않는다. 구현 시 테스트 코드는 추가하거나 갱신하고, 사용자가 다음을 실행한다.

서버:

```powershell
npm run test -w @trpg/be -- concentration-runtime.service.spec.ts --runInBand
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
```

타입/빌드:

```powershell
npm run build -w @trpg/shared-types
npm run build -w @trpg/be
npm run build -w @trpg/fe
```

수동 smoke:

1. 집중 주문을 시전하고 시전자에게 집중 문구가 표시되는지 확인한다.
2. 대상 및 effect ID가 전투 응답의 `concentration`에 포함되는지 확인한다.
3. 피해를 받고 집중 내성에 성공하면 문구가 유지되는지 확인한다.
4. 집중 내성에 실패하면 연결 condition/effect와 문구가 함께 사라지는지 확인한다.
5. 새 집중 주문을 시전하면 이전 집중 상태가 새 상태로 교체되는지 확인한다.
6. 집중하지 않는 참가자의 기존 상태 문구가 달라지지 않는지 확인한다.

## 구현 대상

- `shared-types/src/dto/api/gameplay.dto.ts`
- `be/src/modules/rules/concentration-runtime.service.ts`
- `be/src/modules/rules/concentration-runtime.service.spec.ts`
- `be/src/modules/combat/combat.service.ts`
- `be/src/modules/combat/combat.service.spec.ts`
- `fe/src/features/sessionPlay/utils/combatParticipantObservation.ts`
- `fe/src/features/sessionPlay/components/CombatNodeSurface.tsx`
- `doc/future_plan_mvp.md`
