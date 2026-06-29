# SRD 캐릭터 생성/레벨업/주문 진행 규칙 단일 원천화 계획

작성일: 2026-06-30

## Summary

`doc/completed/future_plan_srd_data_consistency.md`로 닫은 1차 SRD 정합성 작업은 `srd-data` catalog, canonical class feature, FE public sync, BE RuleCatalog drift guard, AI catalog fingerprint까지 정리했다. 하지만 캐릭터 생성/레벨업/주문 진행 규칙은 아직 완전히 단일 원천화되지 않았다.

현재 문제는 `srd-data`에 SRD class/spell data가 있고, `shared-types`에도 주문 진행표가 있으며, FE와 BE가 각각 “몇 개의 캔트립/주문/준비 주문을 요구하는지”를 계산한다는 점이다. BE 검증은 보안상 계속 필요하지만, 계산식과 기준 데이터는 `@trpg/srd-data` 하나에서 나와야 한다.

이 계획의 목표는 다음과 같다.

- 캐릭터 생성, 레벨업, 주문 선택, 준비 주문 한도 계산의 기준을 `@trpg/srd-data`로 통일한다.
- `shared-types/src/constants/spellcasting-progression.ts`의 룰 데이터 역할을 제거하거나 호환 wrapper로 축소한다.
- FE는 `@trpg/srd-data`의 browser-safe rules helper로 선택 요구량과 preview를 계산한다.
- BE는 같은 rules helper로 요청을 검증한다.
- `verify:rule-data-sync`가 FE/BE 계산 drift를 정적으로 잡는다.

## 현재 상태

### 이미 단일 원천화된 것

- `srd-data/generated/srd/classes.jsonl`에는 class별 `spellcasting`, `spellcastingProgression`, `levelProgression`, `featureReferences`가 있다.
- `srd-data/generated/srd/spell-class-lists.json`에는 직업별 주문 목록이 있다.
- `srd-data/generated/srd/fe-spell-pools.json`에는 FE 캐릭터 빌더/빠른 생성에 필요한 실행 가능 주문 pool이 있다.
- `srd-data/generated/srd/class-features.json`은 canonical class feature manifest로 생성된다.
- FE public sync는 generated artifact를 복사한다.
- BE RuleCatalog는 canonical class feature manifest와 drift 검증을 수행한다.

### 아직 분리된 것

- `shared-types/src/constants/spellcasting-progression.ts`
  - 주문사용 직업별 `cantripsKnown`, `spellsKnown` 테이블을 별도 보유한다.
  - BE `catalog.service.ts`, `characters.service.ts`, 일부 테스트가 이 테이블을 참조한다.
- `fe/src/pages/CharacterPage.tsx`
  - 시작 캔트립/주문 수, 준비 주문 수, 주문 레벨 상한, 위저드 주문책 수를 자체 계산한다.
- `fe/src/pages/PlayPage.tsx`
  - 빠른 생성/플레이 화면에서 위저드 주문책 수와 주문 요구량 계산을 일부 반복한다.
- `be/src/modules/characters/characters.service.ts`
  - FE와 유사한 시작 주문 요구량, 준비 주문 검증, 레벨업 주문 증가량 계산을 자체 구현한다.
- `be/src/database/seed/classes.ts`
  - 시작 주문 수와 스킬/장비 seed가 SRD generated class data를 직접 사용하지 않고 수동 정의를 유지한다.

## 원칙

### 원칙 1. `srd-data`가 데이터와 룰 해석 함수의 주인이다

`shared-types`는 DTO와 타입 공유에 집중한다. SRD 룰 데이터나 캐릭터 성장 계산식은 `shared-types`에 새로 추가하지 않는다.

목표 import 형태:

```ts
import {
  getSrdClassSpellcastingProgression,
  resolveCharacterSpellSelectionRequirements,
  resolvePreparedSpellLimit,
  resolveKnownSpellDelta,
  resolveMaximumCastableSpellLevel,
} from "@trpg/srd-data/rules";
```

### 원칙 2. FE와 BE는 같은 순수 함수를 호출한다

FE는 UX preview와 form 제한을 위해 계산한다. BE는 조작된 요청을 막기 위해 다시 검증한다. 단, 둘의 계산식은 별도로 구현하지 않는다.

### 원칙 3. browser-safe entrypoint를 분리한다

현재 `@trpg/srd-data` root export는 Node 파일 로더 성격이 강하다. FE 번들에서 안전하게 쓰기 위해 정적 JSON import와 순수 함수만 포함하는 subpath를 둔다.

예상 구조:

```text
srd-data/
  rules/
    character-spellcasting.mjs
    character-spellcasting.d.ts
  generated/srd/
    classes.json
    spell-class-lists.json
    fe-spell-pools.json
```

### 원칙 4. MVP/runtime 제한은 명시 입력으로 받는다

SRD 전체 주문 목록과 현재 실행 가능 주문 목록은 다르다. helper는 SRD 진행표만 보지 않고, “현재 선택 가능한 executable pool”을 입력받아 실제 요구 개수를 산출해야 한다.

예:

```ts
resolveCharacterSpellSelectionRequirements({
  classKey: "wizard",
  level: 5,
  abilities,
  executableSpellPools,
});
```

## 목표 아키텍처

### Data source

```text
ai/translated/classes/*.md
  -> srd-data/scripts/generate-canonical-artifacts.mjs
  -> srd-data/generated/srd/classes.jsonl
  -> srd-data/generated/srd/classes.json
  -> @trpg/srd-data/rules
  -> FE / BE
```

### Rule source

```text
srd-data/generated/srd/classes.json
  spellcasting.ability
  spellcasting.formulaList
  spellcastingProgression

srd-data/generated/srd/spell-class-lists.json
  class spell pool

srd-data/generated/srd/fe-spell-pools.json
  MVP/executable FE pool

@trpg/srd-data/rules
  pure resolver functions
```

## 구현 계획

## Phase 0. 현행 중복 계산 감사와 기준 확정

목표: 어떤 계산을 `srd-data/rules`로 옮길지 명확히 한다.

대상 파일:

- `fe/src/pages/CharacterPage.tsx`
- `fe/src/pages/PlayPage.tsx`
- `be/src/modules/characters/characters.service.ts`
- `be/src/modules/catalog/catalog.service.ts`
- `be/src/modules/rules/spell-slot.service.ts`
- `shared-types/src/constants/spellcasting-progression.ts`
- `srd-data/generated/srd/classes.jsonl`
- `srd-data/generated/srd/spell-class-lists.json`
- `srd-data/generated/srd/fe-spell-pools.json`

분류할 계산:

- class key normalize
- class level normalize
- spellcasting progression lookup
- cantrips known limit
- known slot spell limit
- prepared spell ability
- prepared spell limit
- starting cantrip requirement
- starting known/spellbook spell requirement
- level-up cantrip delta
- level-up known spell delta
- maximum castable spell level
- wizard spellbook total
- dynamic prepared pool 여부

완료 기준:

- 위 계산별 현재 구현 위치와 목표 owner가 표로 정리된다.
- `srd-data/rules`로 옮길 함수 목록이 확정된다.

## Phase 1. `srd-data`에 browser-safe class artifact 추가

목표: FE가 JSONL을 직접 처리하지 않고 정적 JSON artifact를 사용할 수 있게 한다.

작업:

- `srd-data/scripts/generate-canonical-artifacts.mjs`에서 `classes.json`을 추가 생성한다.
- 기존 `classes.jsonl`과 같은 class payload를 배열 JSON으로 저장한다.
- `scripts/sync-fe-static-srd.mjs`가 `classes.json`을 FE public으로 복사하도록 정리한다.
- `srd-data/package.json`에 browser-safe JSON subpath export를 추가한다.

예상 export:

```json
{
  "./generated/srd/classes.json": "./generated/srd/classes.json",
  "./generated/srd/spell-class-lists.json": "./generated/srd/spell-class-lists.json",
  "./generated/srd/fe-spell-pools.json": "./generated/srd/fe-spell-pools.json"
}
```

완료 기준:

- FE/BE가 같은 generated class JSON 구조를 참조할 수 있다.
- `verify:rule-data-sync`가 `classes.json`과 `classes.jsonl`의 내용 drift를 검사한다.

## Phase 2. `@trpg/srd-data/rules` entrypoint 추가

목표: 캐릭터 주문 진행 관련 순수 함수를 `srd-data`로 옮긴다.

추가 파일 후보:

- `srd-data/rules/character-spellcasting.mjs`
- `srd-data/rules/character-spellcasting.d.ts`
- 필요 시 `srd-data/rules/index.mjs`
- 필요 시 `srd-data/rules/index.d.ts`

핵심 타입:

```ts
export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type SrdSpellcastingProgressionEntry = {
  classLevel: number;
  cantripsKnown: number | null;
  spellsKnown: number | null;
  pactMagicSlots?: number | null;
  pactMagicSlotLevel?: number | null;
  spellSlotsByLevel?: Record<string, number>;
};

export type CharacterSpellSelectionRequirements = {
  classKey: string;
  level: number;
  cantripCount: number;
  knownOrSpellbookSpellCount: number;
  preparedSpellCount: number | null;
  usesDynamicPreparedPool: boolean;
  spellcastingAbility: AbilityKey | null;
  maximumCastableSpellLevel: number;
};
```

핵심 함수:

```ts
export function normalizeSrdCharacterClassKey(className: string): string;
export function normalizeSrdCharacterLevel(level: number | null | undefined): number;
export function getSrdClassSpellcastingProgression(classKey: string, level: number): SrdSpellcastingProgressionEntry | null;
export function getCantripsKnownLimit(classKey: string, level: number): number | null;
export function getKnownSpellsLimit(classKey: string, level: number): number | null;
export function resolvePreparedSpellAbility(classKey: string): AbilityKey | null;
export function resolveAbilityModifier(score: number | null | undefined): number;
export function resolvePreparedSpellLimit(input: PreparedSpellLimitInput): number | null;
export function resolveWizardSpellbookSpellCount(level: number): number;
export function resolveMaximumCastableSpellLevel(classKey: string, level: number): number;
export function resolveCharacterSpellSelectionRequirements(input: CharacterSpellSelectionRequirementInput): CharacterSpellSelectionRequirements;
export function resolveKnownSpellDelta(input: KnownSpellDeltaInput): KnownSpellDeltaResult;
```

주의:

- `resolveMaximumCastableSpellLevel`은 하드코딩된 full/half/pact 분기 대신 `spellcastingProgression.spellSlotsByLevel`과 `pactMagicSlotLevel`을 우선 사용한다.
- `knownOrSpellbookSpellCount`는 `spellsKnown`, wizard spellbook rule, legacy `startingSpellCount` fallback을 명시적으로 구분한다.
- dynamic prepared caster는 cleric/druid/paladin처럼 known spell selection 대신 prepared pool 검증이 필요한 직업으로 판정한다.

완료 기준:

- FE와 BE가 import 가능한 browser-safe ESM 함수가 제공된다.
- 함수는 `srd-data/generated/srd/classes.json`을 기본 source로 사용하거나, 테스트/검증용으로 class data를 주입받을 수 있다.

## Phase 3. `shared-types` spellcasting progression deprecate

목표: `shared-types`가 룰 데이터의 두 번째 원천이 되지 않게 한다.

작업:

- `shared-types/src/constants/spellcasting-progression.ts`를 직접 테이블 owner에서 호환 wrapper로 전환한다.
- 가능한 경우 import 방향을 `@trpg/srd-data/rules`로 바꾼다.
- 순환 의존 문제가 있으면 다음 중 하나를 택한다.
  - `shared-types` export를 유지하되 내부 테이블을 제거하고 deprecation 주석을 붙인다.
  - BE/FE 소비처를 모두 `@trpg/srd-data/rules`로 바꾼 뒤 `shared-types` export를 제거한다.

완료 기준:

- 신규 코드가 `shared-types/src/constants/spellcasting-progression.ts`를 참조하지 않는다.
- `rg "spellcasting-progression"` 결과가 테스트/호환 wrapper 수준으로 축소된다.

## Phase 4. BE 캐릭터 검증을 `srd-data/rules`로 전환

대상:

- `be/src/modules/characters/characters.service.ts`
- `be/src/modules/catalog/catalog.service.ts`
- `be/src/modules/rules/spell-slot.service.ts`
- 관련 spec fixture

작업:

- `catalog.service.ts`가 `SPELLCASTING_PROGRESSION` 대신 `srd-data` generated class progression을 사용한다.
- `characters.service.ts`의 시작 주문 요구량 계산을 `resolveCharacterSpellSelectionRequirements`로 대체한다.
- 준비 주문 수 계산을 `resolvePreparedSpellLimit`로 대체한다.
- 레벨업 cantrip/known spell delta 계산을 `resolveKnownSpellDelta`로 대체한다.
- 위저드 주문책 수 상수를 BE 내부에서 제거한다.

유지할 BE 책임:

- 요청 payload shape 검증
- 존재하지 않는 spell id 거절
- executable spell pool membership 검증
- prepared spell이 known/spellbook에 포함되는지 검증
- DB 저장 및 session snapshot 반영

완료 기준:

- BE에서 주문 진행 규칙의 독자 테이블/상수/분기 사용이 제거된다.
- BE 검증은 같은 `srd-data/rules` 산출값을 근거로 오류 메시지를 만든다.

## Phase 5. FE 캐릭터 빌더/플레이 화면을 `srd-data/rules`로 전환

대상:

- `fe/src/pages/CharacterPage.tsx`
- `fe/src/pages/PlayPage.tsx`
- `fe/src/services/staticSrd.ts`
- 필요 시 `fe/src/features/spells/*`

작업:

- `getMvpStartingCantripCount` 제거 또는 wrapper화.
- `getMvpStartingSlotSpellCount` 제거 또는 wrapper화.
- `getPreparedSpellLimit` 제거 또는 wrapper화.
- `getMaximumImplementedSpellLevel` 제거.
- `getWizardStartingSpellbookSpellCount` 제거.
- FE 화면의 선택 개수, disabled 상태, 안내 문구가 `resolveCharacterSpellSelectionRequirements` 결과를 사용하게 한다.
- level-up UI의 신규 cantrip/known spell 선택 개수도 `resolveKnownSpellDelta`를 사용하게 한다.

완료 기준:

- FE의 캐릭터 생성/레벨업 주문 요구량 계산이 `@trpg/srd-data/rules` 호출로 수렴한다.
- FE에는 presentation-specific formatting만 남는다.

## Phase 6. seed와 generated SRD class data 관계 정리

목표: `be/src/database/seed/classes.ts`가 또 다른 class data owner가 되지 않게 한다.

작업:

- 현재 수동 `spellCounts`를 제거하고 generated class data에서 산출한다.
- `skillSelections`와 `startingEquipment`도 SRD generated data로 대체 가능한지 감사한다.
- 당장 완전 대체가 어렵다면 seed file에 “legacy DB seed adapter” 역할을 명시하고, drift guard를 추가한다.

완료 기준:

- DB seed의 `startingCantripCount`, `startingSpellCount`가 `srd-data`와 어긋나면 `verify:rule-data-sync`가 실패한다.
- 수동 seed는 runtime/legacy adapter로만 남고 SRD 원천 역할을 하지 않는다.

## Phase 7. drift guard 확장

목표: 다시 FE/BE 계산식이 갈라지는 것을 막는다.

`scripts/verify-rule-data-sync.mjs` 추가 검증:

- `shared-types/src/constants/spellcasting-progression.ts`에 독립 테이블이 남아 있지 않은지 확인한다.
- FE/BE에서 금지된 함수명/상수명이 재등장하지 않는지 확인한다.
  - `getMaximumImplementedSpellLevel`
  - `getMvpStartingSlotSpellCount`
  - `getMvpStartingCantripCount`
  - `WIZARD_STARTING_SPELLBOOK_SPELL_COUNT`
  - local `SPELLCASTING_PROGRESSION`
- `srd-data/rules`가 산출한 요구량과 BE catalog response의 progression이 일치하는지 확인한다.
- generated `classes.json`과 `classes.jsonl`이 같은 class/progression 데이터를 담는지 확인한다.

완료 기준:

- 새 중복 계산이 생기면 `npm run verify:rule-data-sync`가 실패한다.
- 실패 메시지는 어느 파일에서 어떤 금지 패턴이 발견됐는지 알려준다.

## Phase 8. 문서화

업데이트 대상:

- `doc/future_plan.md`
- `doc/rules/ARCHITECTURE_RULES.md`
- `srd-data/sources/README.md`
- `srd-data/overrides/README.md`
- 필요 시 `doc/README.md`

명시할 규칙:

- 캐릭터 생성/레벨업/주문 진행 계산은 `@trpg/srd-data/rules`만 수정한다.
- `shared-types`에는 SRD 룰 테이블을 추가하지 않는다.
- FE와 BE에는 같은 계산식을 복사하지 않는다.
- FE-only 데이터는 표시/UX override만 허용한다.
- BE-only 데이터는 runtime execution metadata만 허용한다.

완료 기준:

- 새 개발자가 “주문 진행 규칙을 바꾸려면 어디를 수정해야 하는가”를 문서만 보고 알 수 있다.

## 권장 구현 순서

1. `srd-data/generated/srd/classes.json` 생성과 sync/verify 추가.
2. `@trpg/srd-data/rules` browser-safe entrypoint 추가.
3. `resolveCharacterSpellSelectionRequirements`와 관련 resolver 구현.
4. BE `characters.service.ts`의 시작 주문/준비 주문 검증부터 교체.
5. FE `CharacterPage.tsx`의 생성 폼 요구량 계산 교체.
6. FE/BE 레벨업 주문 delta 계산 교체.
7. `PlayPage.tsx` 빠른 생성 계산 교체.
8. `shared-types` progression table deprecate 또는 제거.
9. `verify:rule-data-sync`에 금지 패턴/drift guard 추가.
10. seed class spell count drift guard 추가.
11. 문서 업데이트.

## 리스크와 대응

### 리스크 1. `@trpg/srd-data`가 FE 번들에 큰 JSON을 끌고 들어올 수 있다

대응:

- root export와 browser rules export를 분리한다.
- rules helper는 필요한 class/spell pool subset만 import한다.
- FE public fetch 경로를 유지하되, 계산 함수에는 필요한 data만 주입할 수 있게 한다.

### 리스크 2. `shared-types`와 `srd-data` 의존 방향이 꼬일 수 있다

대응:

- `srd-data/rules`는 `shared-types`에 의존하지 않는다.
- FE/BE가 각각 `shared-types` DTO와 `srd-data/rules`를 병렬 import한다.
- 타입 중복이 불가피하면 `srd-data`의 public d.ts에 최소 타입을 둔다.

### 리스크 3. 현재 DB seed와 generated class data가 완전히 같은 구조가 아닐 수 있다

대응:

- seed adapter를 한 번에 제거하지 않는다.
- spell count부터 generated data 기반으로 바꾼다.
- skill/equipment는 별도 drift guard를 먼저 둔 뒤 단계적으로 이관한다.

### 리스크 4. 기존 캐릭터의 저장된 주문 목록과 새 계산식이 충돌할 수 있다

대응:

- 새 helper는 validation mode를 둔다.
  - `creation`
  - `level_up`
  - `legacy_read`
- 기존 캐릭터 조회는 표시 가능하게 유지하되, 수정/레벨업 시 canonical 요구량으로 보정한다.

## 검증 계획

프로젝트 지침에 따라 작업자가 테스트를 직접 실행하지 않는다. 구현 후 사용자가 아래 명령을 실행한다.

권장 명령:

```bash
npm run build -w @trpg/srd-data
npm run sync:fe:srd
npm run verify:rule-data-sync
npm run build -w @trpg/shared-types
npm run build -w @trpg/be
npm run build -w @trpg/fe
```

중점 확인:

- `verify:rule-data-sync`가 `classes.json`/`classes.jsonl` drift 없음으로 통과한다.
- `verify:rule-data-sync`가 FE/BE 금지 중복 계산 패턴 없음으로 통과한다.
- 위저드 1레벨 생성 시 주문책 주문 요구량 6개가 유지된다.
- 위저드 5레벨 생성/빠른 생성 시 주문책 요구량이 같은 helper에서 산출된다.
- 클레릭/드루이드/팔라딘은 known spell 선택 요구량이 0이고 준비 주문 수만 계산된다.
- 바드/소서러/워락/레인저는 known spell progression이 SRD class progression과 일치한다.
- FE에서 표시한 요구 개수와 BE validation 오류의 요구 개수가 같다.

## 완료 정의

이 계획은 다음 조건을 만족하면 완료로 본다.

- 캐릭터 주문 진행 관련 데이터 원천이 `@trpg/srd-data`로 통일된다.
- FE와 BE가 같은 `@trpg/srd-data/rules` 함수를 사용한다.
- `shared-types`에는 독립 주문 진행표가 남아 있지 않다.
- FE `CharacterPage.tsx`와 `PlayPage.tsx`에는 주문 요구량 독자 계산이 남아 있지 않다.
- BE `characters.service.ts`에는 주문 요구량 독자 계산이 남아 있지 않다.
- `verify:rule-data-sync`가 새 중복 계산과 srd-data drift를 잡는다.
- 사용자가 권장 검증 명령을 실행해 성공 결과를 제공했다.
