# SRD 캐릭터 생성/레벨업/주문 진행 규칙 단일 원천화 계획

작성일: 2026-06-30

## Summary

`doc/completed/future_plan_srd_data_consistency.md`로 닫은 1차 SRD 정합성 작업은 `srd-data` catalog, canonical class feature, FE public sync, BE RuleCatalog drift guard, AI catalog fingerprint까지 정리했다. 하지만 캐릭터 생성/레벨업/주문 진행 규칙은 아직 완전히 단일 원천화되지 않았다.

현재 문제는 `srd-data`에 SRD class/spell data가 있고, `shared-types`에도 주문 진행표가 있으며, FE와 BE가 각각 “몇 개의 캔트립/주문/준비 주문을 요구하는지”를 계산한다는 점이다. BE 검증은 보안상 계속 필요하지만, 계산식과 기준 데이터는 `@trpg/srd-data` 하나에서 나와야 한다.

이 계획의 목표는 다음과 같다.

- 캐릭터 생성, 레벨업, 주문 선택, 준비 주문 한도 계산의 기준을 `@trpg/srd-data`로 통일한다.
- `shared-types/src/constants/spellcasting-progression.ts`의 룰 데이터 역할을 제거한다.
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
- known spell replacement eligibility
- subclass choice level
- ASI/Feat level eligibility
- spell slot limit
- maximum castable spell level
- wizard spellbook total
- dynamic prepared pool 여부

감사 결과:

| 계산 | 기존 위치 | 목표 owner | 반영 상태 |
| --- | --- | --- | --- |
| class key normalize | FE/BE helper, `shared-types` progression helper | `@trpg/srd-data/rules` `normalizeSrdCharacterClassKey` | FE/BE가 rules helper를 호출한다. |
| class level normalize | FE/BE local 계산 | `@trpg/srd-data/rules` `normalizeSrdCharacterLevel` | rules 내부 resolver가 공통 정규화를 사용한다. |
| spellcasting progression lookup | `shared-types/src/constants/spellcasting-progression.ts`, BE catalog/rules service | `srd-data/generated/srd/classes.json` + `getSrdClassSpellcastingProgression` | `shared-types` 테이블을 제거하고 BE catalog/rules service를 전환했다. |
| cantrips known limit | `shared-types` progression table, FE 시작 주문 helper | `getCantripsKnownLimit`, `resolveCharacterSpellSelectionRequirements` | FE/BE 시작/레벨업 요구량이 rules 결과를 사용한다. |
| known slot spell limit | `shared-types` progression table, FE/BE 시작/레벨업 helper | `getKnownSpellsLimit`, `resolveCharacterSpellSelectionRequirements`, `resolveKnownSpellDelta` | FE/BE 시작/레벨업 known spell 계산이 rules 결과를 사용한다. |
| prepared spell ability | FE/BE prepared caster 분기 | `resolveSpellcastingAbility`, `resolvePreparedSpellAbility` | 직업별 spellcasting ability를 generated class data에서 해석한다. |
| prepared spell limit | FE `getPreparedSpellLimit`, BE `resolvePreparedSpellLimit` | `resolvePreparedSpellLimit` | FE wrapper와 BE wrapper는 rules helper 위임만 남겼다. |
| starting cantrip requirement | FE `getMvpStartingCantripCount`, BE `resolveStartingSpells` | `resolveCharacterSpellSelectionRequirements().cantripCount` | FE/BE가 executable cantrip pool을 입력해 같은 결과를 사용한다. |
| starting known/spellbook spell requirement | FE `getMvpStartingSlotSpellCount`, BE `resolveStartingSpells` | `resolveCharacterSpellSelectionRequirements().knownOrSpellbookSpellCount` | 위저드 spellbook, known caster, prepared caster 요구량이 같은 helper로 수렴했다. |
| level-up cantrip delta | FE/BE local target/current progression diff | `resolveKnownSpellDelta().cantripDelta` | FE/BE 레벨업 흐름이 target level 기준 rules 결과를 사용한다. |
| level-up known spell delta | FE/BE local target/current progression diff, wizard 상수 | `resolveKnownSpellDelta().knownSpellDelta` | 위저드 레벨당 주문책 2개 규칙도 rules 내부로 이동했다. |
| known spell replacement eligibility | FE prepared caster 분기, BE wizard 예외 분기 | `resolveKnownSpellDelta().canReplaceKnownSpells` | known spell 교체 UI/검증이 rules 결과를 기준으로 수렴했다. |
| subclass choice level | FE `subclassChoiceLevelByClass`, quick-create `choiceLevel`, BE RuleCatalog 기반 생성/레벨업 검증 | `resolveSubclassChoiceLevel` | generated class `featureReferences`의 subclass 레벨에서 선택 레벨을 유도하고 FE/BE 생성/레벨업 판단이 같은 helper를 사용한다. |
| ASI/Feat level eligibility | FE `ASI_LEVELS`/quick-create ASI table, BE `ASI_OR_FEAT_LEVELS`/class-specific ASI 분기 | `resolveAbilityScoreImprovementLevels`, `resolveAvailableAbilityScoreImprovementLevels`, `resolveCrossedAbilityScoreImprovementLevels` | 캐릭터 생성/레벨업/빠른 생성의 ASI/Feat 선택 가능 레벨이 rules helper로 수렴했다. |
| spell slot limit | BE `spell-slot.service.ts`의 pact/normal slot 해석 | `resolveSpellSlotLimit` | 주문 슬롯 개수 해석도 rules helper로 옮기고 BE service는 위임만 남겼다. |
| maximum castable spell level | FE/BE full/half/pact local 분기 | `resolveMaximumCastableSpellLevel` | slot table과 pact magic level에서 산출한다. |
| wizard spellbook total | FE/BE wizard 상수 | `resolveWizardSpellbookSpellCount` | rules 내부 상수로만 남기고 FE/BE 상수는 제거했다. |
| dynamic prepared pool 여부 | FE/BE prepared caster 분기 | `usesDynamicPreparedSpellPool`, `resolveCharacterSpellSelectionRequirements().usesDynamicPreparedPool` | generated `spellcasting.formulaList`에서 준비 주문 공식을 가진 비-wizard prepared caster가 known spell 선택 대신 executable pool 기반 prepared 요구량을 사용한다. |

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
export function resolveSubclassChoiceLevel(classKey: string): number | null;
export function resolveAbilityScoreImprovementLevels(classKey: string): number[];
export function resolveAvailableAbilityScoreImprovementLevels(classKey: string, level: number): number[];
export function resolveCrossedAbilityScoreImprovementLevels(classKey: string, currentLevel: number, targetLevel: number): number[];
export function resolvePreparedSpellLimit(input: PreparedSpellLimitInput): number | null;
export function resolveWizardSpellbookSpellCount(level: number): number;
export function resolveMaximumCastableSpellLevel(classKey: string, level: number): number;
export function resolveSpellSlotLimit(classKey: string, level: number, slotLevel: number): number;
export function resolveCharacterSpellSelectionRequirements(input: CharacterSpellSelectionRequirementInput): CharacterSpellSelectionRequirements;
export function resolveKnownSpellDelta(input: KnownSpellDeltaInput): KnownSpellDeltaResult;
```

주의:

- `resolveMaximumCastableSpellLevel`은 하드코딩된 full/half/pact 분기 대신 `spellcastingProgression.spellSlotsByLevel`과 `pactMagicSlotLevel`을 우선 사용한다.
- `knownOrSpellbookSpellCount`는 `spellsKnown`, wizard spellbook rule, legacy `startingSpellCount` fallback을 명시적으로 구분한다.
- dynamic prepared caster는 class-key 목록이 아니라 generated `spellcasting.formulaList`의 준비 주문 공식과 spellbook 예외를 기준으로 판정한다.

완료 기준:

- FE와 BE가 import 가능한 browser-safe ESM 함수가 제공된다.
- 함수는 `srd-data/generated/srd/classes.json`을 기본 source로 사용하거나, 테스트/검증용으로 class data를 주입받을 수 있다.

## Phase 3. `shared-types` spellcasting progression 제거

목표: `shared-types`가 룰 데이터의 두 번째 원천이 되지 않게 한다.

작업:

- BE/FE 소비처를 모두 `@trpg/srd-data/rules`로 바꾼다.
- `shared-types/src/constants/spellcasting-progression.ts` export를 제거한다.
- DTO에서 필요한 `SpellcastingProgressionEntry` 모양은 DTO 계약 타입으로만 유지한다.

완료 기준:

- `shared-types/src/constants/spellcasting-progression.ts` 파일이 남아 있지 않다.
- 신규 코드가 `shared-types`에서 주문 진행 helper를 import하지 않는다.

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
- level-up UI의 신규 cantrip/known spell 선택 개수와 known spell 교체 가능 여부도 `resolveKnownSpellDelta`를 사용하게 한다.

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

선택적 집중 테스트:

```bash
npm run test:quiet -w @trpg/be -- spellcasting-progression.spec.ts spell-slot.service.spec.ts level-up.service.spec.ts characters.service.spec.ts classes.spec.ts
```

중점 확인:

- `verify:rule-data-sync`가 `classes.json`/`classes.jsonl` drift 없음으로 통과한다.
- `verify:rule-data-sync`가 FE/BE 금지 중복 계산 패턴 없음으로 통과한다.
- 위저드 1레벨 생성 시 주문책 주문 요구량 6개가 유지된다.
- 위저드 5레벨 생성/빠른 생성 시 주문책 요구량이 같은 helper에서 산출된다.
- 클레릭/드루이드/팔라딘은 known spell 선택 요구량이 0이고 준비 주문 수만 계산된다.
- 팔라딘 1레벨은 아직 준비 주문 한도가 없고, 2레벨부터 준비 주문 한도가 계산된다.
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

### 완료 감사 메모

현재 코드 기준으로 확인 가능한 증거:

- 이전 계획 문서는 `doc/completed/future_plan_srd_data_consistency.md`에 있고, 원래 위치의 `doc/future_plan_srd_data_consistency.md`는 남아 있지 않다.
- `@trpg/srd-data/rules`가 캐릭터 주문 진행 resolver의 public entrypoint이며, `srd-data/package.json`의 `./rules` export가 CJS, ESM, browser ESM, d.ts surface를 제공한다.
- 새 canonical artifact와 rules entrypoint 파일은 최종 변경 묶음에 포함되어야 한다: `srd-data/generated/srd/classes.json`, `srd-data/rules/index.cjs`, `srd-data/rules/index.mjs`, `srd-data/rules/index.browser.mjs`, `srd-data/rules/index.d.ts`, `srd-data/rules/README.md`.
- FE 핵심 소비 파일은 `CharacterPage.tsx`, `PlayPage.tsx`, `CombatNodeSurface.tsx`이며, 모두 `@trpg/srd-data/rules` helper를 사용한다.
- FE `CharacterPage.tsx`와 `PlayPage.tsx`의 캐릭터 생성/레벨업/빠른 생성 class key 판정도 `normalizeSrdCharacterClassKey`를 사용한다.
- BE 핵심 소비 파일은 `characters.service.ts`, `catalog.service.ts`, `rule-catalog.service.ts`, `spell-slot.service.ts`, `combat-spell.service.ts`, `action-spell-rule.service.ts`이며, 모두 `@trpg/srd-data/rules` helper를 사용한다.
- BE `characters.service.ts`의 생성/레벨업/주문 시작값/시작 장비 class catalog 조회와 성장 특성 계산은 `normalizeSrdCharacterClassKey`를 거친 canonical key를 사용한다.
- `shared-types/src/constants/spellcasting-progression.ts`는 제거됐고, `shared-types`에는 DTO 계약 타입만 남았다.
- `scripts/verify-rule-data-sync.mjs`는 generated `classes.json`/`classes.jsonl` drift, FE public SRD sync, rules entrypoint export/behavior parity, FE/BE 금지 패턴, 핵심 소비 파일의 canonical helper 사용 여부, BE 캐릭터 서비스의 raw class key 회귀, seed spell count drift를 검사한다.
- 검증 계획의 `npm run sync:fe:srd`, `npm run verify:rule-data-sync`, workspace build 명령은 현재 `package.json`, `fe/package.json`, `be/package.json`, `srd-data/package.json` script와 맞는다.

아직 외부 증거가 필요한 항목:

- 사용자가 검증 계획의 build/verify 명령을 실행해 성공 결과를 확인해야 한다. 이 결과가 오기 전까지 이 goal은 완료로 처리하지 않는다.

## 구현 반영 현황

2026-06-30 기준으로 코드 반영된 항목:

- `doc/completed/future_plan_srd_data_consistency.md`로 이전 정합성 계획을 이동했다.
- `srd-data/generated/srd/classes.json` 생성과 `catalog-fingerprint.json` 포함을 추가했다.
- `scripts/sync-fe-static-srd.mjs`가 generated `classes.json`을 FE public으로 복사하도록 정리했다.
- `@trpg/srd-data/rules` subpath export를 추가하고 캐릭터 주문 진행 resolver를 이 위치로 모았다. FE 번들용 `browser` 조건 export도 제공한다.
- FE `CharacterPage.tsx`, `PlayPage.tsx`의 시작 주문/캔트립, 준비 주문, 주문 레벨 상한, 레벨업 spell delta 계산을 `@trpg/srd-data/rules` 호출로 전환했다.
- FE `CharacterPage.tsx`의 ASI/feature choice/주문책 표시 class key와 `PlayPage.tsx`의 quick-create class key도 `normalizeSrdCharacterClassKey`를 사용하도록 맞췄다.
- FE `CharacterPage.tsx`의 class definition 조회도 raw `toLowerCase()` 대신 `normalizeSrdCharacterClassKey`를 사용하도록 맞춰 생성/레벨 변경 경로의 class key 해석을 통일했다.
- FE `CharacterPage.tsx`의 주문 사용 직업 목록도 로컬 `implementedSpellClasses` set 대신 `getSrdClassDefinition().spellcastingProgression`에서 유도하도록 전환했다.
- FE `CombatNodeSurface.tsx`의 전투 중 prepared spell 시전 가능 여부도 로컬 class-key set/normalize 대신 `@trpg/srd-data/rules` class normalize와 prepared caster 판정을 사용하도록 전환했다.
- BE `characters.service.ts`, `catalog.service.ts`, `spell-slot.service.ts`의 주문 진행 계산을 `@trpg/srd-data/rules` 호출로 전환했다.
- BE `rule-catalog.service.ts`의 서브클래스 선택 레벨 계산도 `resolveSubclassChoiceLevel` 위임으로 전환했다.
- BE `spell-slot.service.ts`의 pact magic/일반 슬롯 개수 해석도 `resolveSpellSlotLimit` 위임으로 전환했다.
- BE `characters.service.ts`의 레벨업 class lookup, 생성 시 proficient skill/level stats/starting spell/starting equipment class lookup도 `normalizeSrdCharacterClassKey`를 통해 canonical SRD class key로 조회하도록 보강했다.
- BE `characters.service.ts`의 ASI 선택 레벨, P6 capstone ability, class-specific HP bonus, class feature selection 검증도 raw lowercase 대신 `normalizeSrdCharacterClassKey`를 사용하도록 맞췄다.
- FE/BE/quick-create의 ASI/Feat 선택 가능 레벨 계산도 `@trpg/srd-data/rules` helper로 전환했다.
- FE/BE/quick-create의 서브클래스 선택 레벨 계산도 `resolveSubclassChoiceLevel` helper로 전환했다.
- BE `action-spell-rule.service.ts`의 실제 주문 시전 시 prepared spell 요구 여부도 `@trpg/srd-data/rules`의 `resolvePreparedSpellAbility` 판정을 사용하도록 전환했다.
- BE `action-spell-rule.service.ts`의 주문 공격/내성 계산용 spellcasting ability 매핑도 로컬 class-key 분기 대신 `@trpg/srd-data/rules`의 `resolveSpellcastingAbility`, `resolveAbilityModifier`를 사용하도록 전환했다.
- BE `action-spell-rule.service.ts`의 spell save DC 계산도 로컬 className 분기 없이 같은 spellcasting ability modifier helper를 재사용하도록 정리했다.
- BE `combat-spell.service.ts`의 MVP 주문 준비 여부와 주문 공격/DC 계산용 spellcasting ability도 같은 rules helper로 전환했다.
- 시작 주문의 준비 주문 요구량은 실행 가능한 주문 풀과 known/spellbook 선택 수를 반영한 `resolveCharacterSpellSelectionRequirements().preparedSpellCount`를 기준으로 FE/BE가 함께 사용한다.
- BE 레벨업 cantrip/known spell delta, known spell 교체 가능 여부, prepared spell 가능 여부도 목표 레벨 기준 `@trpg/srd-data/rules` 결과를 사용하도록 맞췄다.
- `shared-types/src/constants/spellcasting-progression.ts`를 제거하고 DTO 타입만 남겼다.
- `scripts/verify-rule-data-sync.mjs`에 generated `classes.json` 동기화 검사와 FE/BE/shared-types source tree 금지 패턴 guard를 추가했다.
- `verify:rule-data-sync`가 prepared caster/spellcaster class-key set뿐 아니라 주문 능력치 class-key 매핑이 FE/BE에 재등장하는지도 잡도록 확장했다.
- `verify:rule-data-sync`가 FE/BE 핵심 소비 파일이 필요한 `@trpg/srd-data/rules` helper를 계속 import/use하는지도 명시적으로 검사한다.
- `verify:rule-data-sync`가 BE `characters.service.ts`에서 canonical `classKey`가 아닌 class catalog 조회, raw `params.className` 기반 spell delta/progression 호출, raw `className` 기반 시작 주문 요구치 호출이 재등장하는지도 검사한다.
- `verify:rule-data-sync`가 FE `CharacterPage.tsx`와 `PlayPage.tsx`에서 class definition key 비교가 raw `toLowerCase()`로 되돌아가는지도 검사한다.
- `verify:rule-data-sync`가 root 검증/sync scripts, FE/BE `package.json`, `package-lock.json` dependency와 `@trpg/srd-data` workspace link entry가 남아 있는지도 검사한다.
- `verify:rule-data-sync`가 `srd-data/package.json`의 `./rules`, generated artifact subpath export, 배포 포함 파일 목록이 유지되는지도 검사한다.
- FE `dev`와 `build`가 `prepare:srd`를 통해 `srd-data` build와 FE public sync를 먼저 수행하도록 바꾸고, `verify:rule-data-sync`가 이 실행 경로도 검사한다.
- BE `build`, `start:dev`, 테스트 스크립트, test log runner가 `build:test-deps`를 통해 `shared-types`와 `srd-data`를 먼저 준비하도록 바꾸고, `verify:rule-data-sync`가 이 실행 경로도 검사한다.
- `verify:rule-data-sync`가 `@trpg/srd-data/rules`의 기본 class data source, 필수 helper 존재 여부, CJS/ESM/browser ESM export surface, class lookup/progression lookup, class data 주입, executable spell pool 입력 변형, 주문사용 직업의 spellcasting ability 해석을 포함한 대표 resolver 결과 parity도 검사하도록 추가했다.
- prepared caster 판정과 half-level prepared formula도 class-key 목록/분기 대신 generated `spellcasting.formulaList`에서 유도하도록 바꾸고, 한국어/영어 formula 및 ability label 회귀를 `verify:rule-data-sync`가 잡도록 추가했다.
- `be/src/database/seed/classes.ts`의 1레벨 spell count를 SRD rules 결과와 맞추고, `verify:rule-data-sync`가 seed spell count drift를 검사하도록 추가했다.
- `be/src/database/seed/classes.spec.ts`도 하드코딩된 주문 수 기대값 대신 `@trpg/srd-data/rules` 결과를 기준으로 seed adapter를 검증하도록 바꿨다.
- BE package dependency에 `@trpg/srd-data`를 명시해 BE import 경로와 workspace 의존성을 맞췄다.
- `srd-data/rules/README.md`를 추가해 rules entrypoint의 책임, 데이터 원천, FE/BE 사용 원칙, CJS/browser/type surface 동기화 규칙을 가까운 위치에 문서화했다.
- `srd-data/rules/README.md`에 rules 동작 변경 시 CJS/browser 구현을 함께 갱신하고 `verify-rule-data-sync` parity case를 확장해야 한다는 운영 규칙을 명시했다.
- `doc/rules/ARCHITECTURE_RULES.md`에 캐릭터 생성/레벨업/주문 진행 계산의 단일 원천 규칙을 추가했다.
- `srd-data/sources/README.md`, `srd-data/overrides/README.md`에 캐릭터 성장/주문 진행 계산을 source/override 입력으로 복사하지 말고 `@trpg/srd-data/rules`에서만 관리한다는 규칙을 명시했다.

남은 완료 조건:

- 사용자가 검증 계획의 명령을 실행하고 성공 결과를 확인해야 한다.
