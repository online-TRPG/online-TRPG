# 전투 집중 상태 투영 구현 계획

> **에이전트 작업자용:** 필수 하위 스킬로 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용해 이 계획을 작업별로 구현한다. 진행 상태는 체크박스(`- [ ]`)로 추적한다.

**목표:** 기존 `conditions` 계약을 깨뜨리지 않으면서 이미 존재하는 구조화 집중 런타임 상태를 각 전투 참가자 응답에 노출하고, 전투 UI에 명시적인 집중 상태를 표시한다.

**아키텍처:** `ConcentrationRuntimeService`를 집중 condition 태그의 유일한 해석 지점으로 유지한다. `CombatService.mapCombat()`은 권위 있는 참가자 condition 원본을 파싱하고 런타임에 구조화 상태를 요청한 뒤, 중복되는 시전자 식별자를 제외한 DTO로 투영한다. 프런트엔드 관찰 helper는 이 DTO를 사용해 내부 정보를 노출하지 않는 공통 집중 문구를 앞에 표시한다.

**기술 스택:** TypeScript, NestJS, Prisma, Jest, React, Vite, 공유 Swagger DTO

**저장소 제약:** Codex는 사용자의 명시적 허락 없이 테스트나 빌드를 실행하지 않는다. 아래의 모든 검증 명령은 사용자 실행 게이트다. 해당 단계에서 멈추고 사용자에게 실행을 요청한 뒤, 전달받은 결과를 바탕으로 계속한다. 사용자가 별도로 승인하지 않으면 커밋하지 않는다.

---

## 파일 구성

- 수정 `be/src/modules/rules/concentration-runtime.service.ts`
  - 활성 집중 상태를 해석하는 공개 읽기 전용 경계를 추가한다.
- 수정 `be/src/modules/rules/concentration-runtime.service.spec.ts`
  - 정상·손상·부재 집중 상태의 투영 동작을 명세한다.
- 수정 `shared-types/src/dto/api/gameplay.dto.ts`
  - 공개 집중 응답 형식을 정의하고 전투 참가자 DTO에 연결한다.
- 수정 `be/src/modules/combat/combat.service.ts`
  - 동일한 권위 JSON 원본에서 기존 condition 태그와 구조화 집중 상태를 함께 만든다.
- 수정 `be/src/modules/combat/combat.service.spec.ts`
  - 세션 캐릭터 원본 우선순위, 구조화 투영, null 투영, 기존 태그 호환성을 검증한다.
- 수정 `fe/src/features/sessionPlay/utils/combatParticipantObservation.ts`
  - 기존 체력·상태 의미를 유지하면서 집중 문구를 추가한다.
- 수정 `fe/src/features/sessionPlay/components/CombatNodeSurface.tsx`
  - 모든 참가자에게 공통 집중 배지와 접근 가능한 tooltip 문구를 추가한다.
- 수정 `fe/src/features/sessionPlay/components/CombatNodeSurface.css`
  - 턴 카드 크기를 변경하지 않고 집중 배지를 배치하고 스타일링한다.
- 수정 `doc/future_plan.md`
  - 새로 연결된 API/UI 표면을 기록하되, 더 넓은 집중 규칙 완료 작업은 남겨 둔다.

새 데이터베이스 모델, migration, package, 테스트 runner, 프런트엔드 테스트 framework는 도입하지 않는다.

### 작업 1: 집중 런타임 읽기 경계 추가

**파일:**
- 수정: `be/src/modules/rules/concentration-runtime.service.spec.ts`
- 수정: `be/src/modules/rules/concentration-runtime.service.ts`

- [x] **1단계: 실패하는 런타임 투영 스펙 추가**

`describe("ConcentrationRuntimeService", ...)` 안에 다음 사례를 추가한다.

```ts
it("reads the active concentration state from structured condition tags", () => {
  const concentration = conditionRuntime.createCondition({
    conditionId: "condition.concentration",
    sourceId: "spell.hold_person",
    appliedAtRound: 2,
    expiresAtTurn: { round: 12, turn: 3 },
    tags: [
      "concentration",
      "concentration:spell:spell.hold_person",
      "concentration:target:target-1",
      "concentration:target:target-2",
      "concentration:effect:effect-hold-1",
    ],
  });

  expect(service.readActiveConcentration([concentration])).toEqual({
    casterId: "",
    spellId: "spell.hold_person",
    targetIds: ["target-1", "target-2"],
    effectIds: ["effect-hold-1"],
    startedAtRound: 2,
    endsAtRound: 12,
    endsAtTurn: 3,
  });
});

it("returns null when no valid active concentration can be decoded", () => {
  const malformed = conditionRuntime.createCondition({
    conditionId: "condition.concentration",
    sourceId: null,
    tags: ["concentration"],
  });
  const poisoned = conditionRuntime.createCondition({
    conditionId: "condition.poisoned",
  });

  expect(service.readActiveConcentration([poisoned])).toBeNull();
  expect(service.readActiveConcentration([malformed])).toBeNull();
});
```

- [ ] **2단계: 사용자에게 집중 런타임 스펙 실행을 요청하고 예상 실패 확인**

실행:

```powershell
npm run test -w @trpg/be -- concentration-runtime.service.spec.ts --runInBand
```

구현 전 예상 결과: `readActiveConcentration`이 존재하지 않는다는 TypeScript/Jest 실패.

- [x] **3단계: 공개 읽기 전용 메서드 추가**

`ConcentrationRuntimeService`의 `resolveDamageCheck()` 앞에 다음 메서드를 추가한다.

```ts
readActiveConcentration(conditions: ConditionInstance[]): ConcentrationState | null {
  const active =
    conditions.find((condition) => this.isConcentrationCondition(condition)) ?? null;
  return active ? this.toConcentrationState(active) : null;
}
```

`resolveDamageCheck()`은 연결 효과 제거에 원본 condition도 필요하므로 기존 `ConditionInstance` 탐색을 유지한다. `toConcentrationState()` 밖에서 태그 해석을 중복하지 않는다.

- [ ] **4단계: 사용자에게 집중 런타임 스펙 재실행 요청**

실행:

```powershell
npm run test -w @trpg/be -- concentration-runtime.service.spec.ts --runInBand
```

예상 결과: 모든 `ConcentrationRuntimeService` 스펙 통과.

- [x] **5단계: 커밋 없이 diff 검토**

확인:

- `readActiveConcentration()`은 입력을 변경하지 않는다.
- 손상된 집중 상태는 `null`을 반환한다.
- `resolveDamageCheck()` 동작은 바뀌지 않는다.

사용자가 명시적으로 요청하지 않으면 stage하거나 commit하지 않는다.

### 작업 2: 공유 전투 집중 DTO 정의

**파일:**
- 수정: `shared-types/src/dto/api/gameplay.dto.ts`

- [x] **1단계: `CombatParticipantResponseDto` 바로 앞에 응답 DTO 추가**

```ts
export class CombatConcentrationStateDto {
  @ApiProperty()
  spellId!: string;

  @ApiProperty({ type: [String] })
  targetIds!: string[];

  @ApiProperty({ type: [String] })
  effectIds!: string[];

  @ApiProperty()
  startedAtRound!: number;

  @ApiPropertyOptional({ nullable: true })
  endsAtRound!: number | null;

  @ApiPropertyOptional({ nullable: true })
  endsAtTurn!: number | null;
}
```

- [x] **2단계: `CombatParticipantResponseDto`에 nullable 필드 연결**

`conditions` 뒤에 추가한다.

```ts
@ApiPropertyOptional({ type: CombatConcentrationStateDto, nullable: true })
concentration!: CombatConcentrationStateDto | null;
```

포함하는 참가자 자체가 시전자이므로 `casterId`는 추가하지 않는다.

- [ ] **3단계: 사용자에게 공유 타입 빌드 요청**

실행:

```powershell
npm run build -w @trpg/shared-types
```

예상 결과: TypeScript 빌드가 성공하고 새 DTO 타입이 생성된다.

- [x] **4단계: 호환성 검토**

확인:

- `conditions: string[]`는 필수 필드로 그대로 유지된다.
- 매핑된 전투 응답에서 `concentration`을 생략하지 않고 nullable로 제공한다.
- 요청 입력이 아닌 출력 DTO이므로 validation decorator를 추가하지 않는다.

### 작업 3: `CombatService.mapCombat()`을 통한 집중 상태 투영

**파일:**
- 수정: `be/src/modules/combat/combat.service.spec.ts`
- 수정: `be/src/modules/combat/combat.service.ts`

- [x] **1단계: 실패하는 전투 응답 투영 스펙 추가**

기존 `"exposes combat spell slot resources by spell level for the active caster"` 테스트 뒤에 새 사례를 추가한다.

```ts
it("projects structured concentration from the authoritative session character conditions", async () => {
  const { service, prisma, sessionsService } = createService();
  const caster = createParticipant({
    id: "participant-1",
    sessionCharacterId: "session-character-1",
    nameSnapshot: "Wizard",
    conditionsJson: JSON.stringify(["condition.poisoned"]),
  });
  const combat = {
    id: "combat-1",
    sessionId: "session-1",
    status: PrismaCombatStatus.ACTIVE,
    roundNo: 2,
    turnNo: 3,
    currentParticipantId: caster.id,
    participants: [caster],
  };
  const concentration = {
    conditionId: "condition.concentration",
    sourceId: "spell.hold_person",
    duration: { type: "until_turn", round: 12, turn: 3 },
    stackPolicy: "replace",
    appliedAtRound: 2,
    expiresAtTurn: { round: 12, turn: 3 },
    tags: [
      "concentration",
      "concentration:spell:spell.hold_person",
      "concentration:target:target-1",
      "concentration:effect:effect-hold-1",
    ],
  };

  sessionsService.getSessionEntityOrThrow.mockResolvedValue({
    id: "session-1",
    status: PrismaSessionStatus.PLAYING,
    gmMode: PrismaGmMode.AI,
    hostUserId: "host-user",
  });
  prisma.combat.findFirst.mockResolvedValue(combat);
  prisma.sessionCharacter.findMany.mockResolvedValue([
    {
      id: "session-character-1",
      currentHp: 24,
      conditionsJson: JSON.stringify([concentration]),
      character: {
        className: "Wizard",
        level: 5,
        maxHp: 24,
        armorClass: 12,
        speed: 30,
      },
    },
  ]);

  const result = await service.getCombat("user-1", "session-1");

  expect(result.participants[0]).toMatchObject({
    sessionEntityId: "participant-1",
    conditions: expect.arrayContaining([
      "condition.concentration",
      "concentration",
      "concentration:spell:spell.hold_person",
    ]),
    concentration: {
      spellId: "spell.hold_person",
      targetIds: ["target-1"],
      effectIds: ["effect-hold-1"],
      startedAtRound: 2,
      endsAtRound: 12,
      endsAtTurn: 3,
    },
  });
});

it("projects null concentration for participants without valid concentration state", async () => {
  const { service, prisma, sessionsService } = createService();
  const participant = createParticipant({
    id: "participant-1",
    sessionCharacterId: null,
    conditionsJson: "not-json",
  });

  sessionsService.getSessionEntityOrThrow.mockResolvedValue({
    id: "session-1",
    status: PrismaSessionStatus.PLAYING,
    gmMode: PrismaGmMode.AI,
    hostUserId: "host-user",
  });
  prisma.combat.findFirst.mockResolvedValue({
    id: "combat-1",
    sessionId: "session-1",
    status: PrismaCombatStatus.ACTIVE,
    roundNo: 1,
    turnNo: 1,
    currentParticipantId: participant.id,
    participants: [participant],
  });

  const result = await service.getCombat("user-1", "session-1");

  expect(result.participants[0]).toMatchObject({
    conditions: [],
    concentration: null,
  });
});
```

- [ ] **2단계: 사용자에게 집중 전투 스펙 실행을 요청하고 예상 실패 확인**

실행:

```powershell
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
```

구현 전 예상 결과: 참가자 응답에 `concentration`이 없어 새 expectation이 실패한다.

- [x] **3단계: 매핑되는 참가자마다 권위 condition 원본을 한 번 파싱**

`mapCombat()`의 참가자 mapper 안에서 `armorClass`를 결정한 직후 다음 코드를 추가한다.

```ts
const conditionsJson =
  sessionCharacter?.conditionsJson ?? participant.conditionsJson ?? "[]";
const conditionEntries = this.parseConditionEntries(conditionsJson);
const conditionInstances = this.conditionRuntime.parseConditionsJson(
  JSON.stringify(conditionEntries),
);
const concentrationState =
  this.concentrationRuntime.readActiveConcentration(conditionInstances);
```

이동량 계산에도 `conditionsJson`을 사용한다.

```ts
const movementFtTotal = this.applyMovementSpeedPenalties(
  sessionCharacter?.character.speed ?? participant.speedFt ?? 30,
  conditionsJson,
);
```

- [x] **4단계: 두 응답 표현을 함께 추가**

현재 `conditions: this.parseConditions(...)` 항목을 다음 코드로 교체한다.

```ts
conditions: this.combatConditionTags(conditionEntries),
concentration: concentrationState
  ? {
      spellId: concentrationState.spellId,
      targetIds: concentrationState.targetIds,
      effectIds: concentrationState.effectIds,
      startedAtRound: concentrationState.startedAtRound,
      endsAtRound: concentrationState.endsAtRound ?? null,
      endsAtTurn: concentrationState.endsAtTurn ?? null,
    }
  : null,
```

이렇게 하면 기존 태그를 유지하면서도 `CombatService`가 집중 태그 접두사를 알 필요가 없다.

- [ ] **5단계: 사용자에게 집중 전투 스펙 재실행 요청**

실행:

```powershell
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
```

예상 결과: 기존 전투 스펙과 새 투영 사례 두 개가 모두 통과한다.

- [ ] **6단계: 사용자에게 백엔드 빌드 요청**

실행:

```powershell
npm run build -w @trpg/be
```

예상 결과: 새 공유 DTO 계약을 포함한 Nest/TypeScript 빌드가 성공한다.

### 작업 4: 참가자 관찰 문구에 집중 상태 표시

**파일:**
- 수정: `fe/src/features/sessionPlay/utils/combatParticipantObservation.ts`
- 수정: `fe/src/features/sessionPlay/components/CombatNodeSurface.tsx`
- 수정: `fe/src/features/sessionPlay/components/CombatNodeSurface.css`

- [x] **1단계: 관찰 입력 계약 확장**

helper signature를 다음과 같이 변경한다.

```ts
export function describeCombatParticipantObservation(
  participant: Pick<
    CombatParticipant,
    'currentHp' | 'maxHp' | 'isAlive' | 'conditions' | 'concentration'
  >
): CombatParticipantObservation {
```

- [x] **2단계: 집중 문구를 앞에 추가하고 최대 세 문구 제한 유지**

helper 본문의 첫 부분을 다음 코드로 교체한다.

```ts
const concentrationTexts = participant.concentration
  ? ['정신을 집중해 주문을 유지하고 있다']
  : [];
const conditionTexts = [
  ...concentrationTexts,
  ...describeConditions(participant.conditions ?? []),
].slice(0, 3);
```

기존 반환 객체는 변경하지 않는다. 다른 condition이 세 개 이상이어도 집중 문구가 항상 보이게 된다.

- [x] **3단계: 모든 참가자 tooltip에 집중 문구 추가**

완전한 참가자 DTO를 이미 전달하는 기존 적대 참가자 관찰 호출은 유지한다.

```ts
describeCombatParticipantObservation(selectedMapParticipant)
describeCombatParticipantObservation(participant)
```

`participantTitle` 끝의 비적대 참가자 분기를 다음 코드로 교체한다.

```ts
: [
    `${participant.name} / HP ${participant.currentHp ?? '-'}/${participant.maxHp ?? '-'}`,
    participant.concentration ? '집중 유지 중' : null,
  ]
    .filter(Boolean)
    .join(' / ');
```

`spellId`, `targetIds`, `effectIds`는 화면에 표시하지 않는다.

- [x] **4단계: 집중 중인 모든 턴 카드에 시각적 배지 추가**

`.combat-turn-card-content` 안에서 `.combat-turn-portrait` 바로 뒤에 다음 요소를 추가한다.

```tsx
{participant.concentration ? (
  <span
    className="combat-turn-concentration"
    title="정신을 집중해 주문을 유지하고 있다"
    aria-label="집중 유지 중"
  >
    집중
  </span>
) : null}
```

`.combat-turn-portrait img` 뒤에 다음 CSS를 추가한다.

```css
.combat-turn-concentration {
  position: absolute;
  right: -5px;
  bottom: 2px;
  z-index: 3;
  min-width: 30px;
  min-height: 17px;
  padding: 1px 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 238, 156, 0.92);
  border-radius: 999px;
  background: rgba(35, 24, 57, 0.94);
  color: #fff0a8;
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 2px 7px rgba(0, 0, 0, 0.52);
}
```

- [ ] **5단계: 사용자에게 프런트엔드 빌드 요청**

실행:

```powershell
npm run build -w @trpg/fe
```

예상 결과: TypeScript 및 Vite 빌드가 성공한다.

- [ ] **6단계: 사용자에게 집중 브라우저 확인 요청**

확인:

1. 집중 중인 적대 참가자의 관찰 popover에 `정신을 집중해 주문을 유지하고 있다`가 표시된다.
2. 적대·우호 여부와 관계없이 집중 중인 모든 참가자의 턴 카드에 `집중` 배지가 표시된다.
3. 적대 참가자의 턴 카드 tooltip에는 관찰 문구가, 우호 참가자 tooltip에는 `집중 유지 중`이 포함된다.
4. 다른 condition이 세 개 이상인 집중 참가자에게도 집중 문구가 표시된다.
5. 내부 spell, target, effect 식별자가 화면 문구에 나타나지 않는다.
6. 집중하지 않는 참가자는 기존 관찰 문구를 유지하고 배지가 표시되지 않는다.

### 작업 5: 로드맵 근거 갱신 및 정적 검토 완료

**파일:**
- 수정: `doc/future_plan.md`
- 검토: 작업 1~4에서 변경한 모든 파일

- [x] **1단계: 집중 상태표 행 갱신**

현재 실행 표면 문구를 다음 내용에서:

```md
여러 피해 경로의 concentration save와 해제
```

다음 내용으로 변경한다.

```md
여러 피해 경로의 concentration save와 해제, 구조화 concentration 전투 응답, 참가자 관찰 UI 표시
```

남은 작업 문구를 다음 내용에서:

```md
모든 피해 원천, 새 집중 시작 시 이전 효과 정리, UI 표시
```

다음 내용으로 변경한다.

```md
모든 피해 원천과 공통 damage finalizer 통일, 집중 주문·연결 효과 실행 범위 확대, 종료 이유 추적
```

- [x] **2단계: `#### 집중` 아래에 현재 구현 근거 추가**

기존 집중 요구사항 뒤에 다음 내용을 추가한다.

```md
- 현재 concentration condition은 `CombatParticipantResponseDto.concentration`으로 구조화되어 전투 참가자 응답에 투영된다.
- 기존 `conditions` 태그는 하위 호환성을 위해 유지하며, 프론트 관찰 UI는 내부 spell/target/effect id를 노출하지 않고 집중 유지 여부를 표시한다.
```

- [x] **3단계: 테스트가 아닌 정적 검사 수행**

다음 명령은 테스트나 빌드를 실행하지 않으므로 Codex가 수행할 수 있다.

```powershell
git diff --check
rg -n "concentration" shared-types/src/dto/api/gameplay.dto.ts be/src/modules/rules/concentration-runtime.service.ts be/src/modules/combat/combat.service.ts fe/src/features/sessionPlay/utils/combatParticipantObservation.ts doc/future_plan.md
```

예상 결과:

- `git diff --check`가 아무 출력도 내지 않는다.
- 각 계층에 예상한 집중 계약 또는 매핑이 존재한다.

- [ ] **4단계: 사용자에게 최종 집중 검증 명령 실행 요청**

실행:

```powershell
npm run test -w @trpg/be -- concentration-runtime.service.spec.ts --runInBand
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
npm run build -w @trpg/shared-types
npm run build -w @trpg/be
npm run build -w @trpg/fe
```

예상 결과: 모든 명령이 성공 종료한다.

- [ ] **5단계: 사용자에게 end-to-end 집중 smoke 실행 요청**

집중 주문 시전자가 포함된 AI GM 또는 HUMAN GM 전투를 사용한다.

1. 집중 주문을 시전하고 전투 응답을 확인한다.
2. `concentration.spellId`, target ID, effect ID, 시작·종료 시점을 확인한다.
3. UI가 공통 집중 상태를 표시하는지 확인한다.
4. 피해를 받은 뒤 집중 내성에 성공하면 상태가 유지되는지 확인한다.
5. 피해를 받은 뒤 집중 내성에 실패하면 상태와 연결 효과가 사라지는지 확인한다.
6. 두 번째 집중 주문을 시작하면 첫 상태가 교체되는지 확인한다.
7. 새로고침 또는 재접속 후 저장된 condition에서 같은 상태가 복원되는지 확인한다.

- [ ] **6단계: 전체 로드맵 완료로 주장하지 않고 이번 증분 결과 보고**

보고 항목:

- 변경한 파일,
- Codex가 실제 수행한 정적 검사,
- 사용자가 실행한 명령과 smoke 확인,
- 보고된 실패,
- 다음 로드맵 증분.

활성 SRD 5e 로드맵 goal을 완료 처리하지 않는다. 이 계획은 집중 응답/UI 투영 증분만 닫는다.
