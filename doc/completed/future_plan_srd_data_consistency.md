# SRD 데이터 단일 원천화 및 FE/BE/AI 정합성 보장 계획

작성일: 2026-06-26

## Summary

현재 프로젝트는 SRD 기반 룰 데이터를 여러 위치에서 중복 관리하고 있다. FE는 `fe/public/srd/*.json`과 일부 수동 매핑을 사용하고, BE는 `RuleCatalogService`와 여러 룰 정의 파일에 실행용 데이터를 하드코딩하며, AI 런타임은 `srd-data/generated/srd/`를 직접 참조한다. 이 구조 때문에 직업 특성, 주문, 종족, 장비, 몬스터, 설명 문구, 선택 규칙이 서로 어긋나는 문제가 반복적으로 발생한다.

이번 목표는 FE, BE, AI 서버가 모두 같은 `srd-data` 산출물을 원천으로 바라보게 하고, 불가피하게 각 레이어에서 가공하는 데이터는 자동 생성 또는 검증으로 정합성을 보장하는 것이다.

최종 목표:

- `srd-data`를 SRD 룰/표시 데이터의 단일 원천으로 고정한다.
- FE/BE/AI가 같은 id, 이름, 레벨, 설명, 선택 규칙을 사용한다.
- FE의 수동 alias/description fallback 의존을 제거하거나 생성물로 전환한다.
- BE의 실행 룰 카탈로그가 SRD 데이터와 어긋나지 않도록 검증한다.
- drift가 생기면 빌드 또는 검증 단계에서 즉시 실패하게 만든다.

## 배경과 문제

### 1. FE와 BE가 같은 개념을 다른 데이터로 표현한다

예시:

- FE 캐릭터 생성창은 `classes.json`의 `levelFeatureSummary` 텍스트를 쪼개서 타임라인을 만든다.
- BE는 `RuleCatalogService`의 `CLASS_FEATURE_DEFINITIONS`를 기준으로 실제 feature id와 실행 hook을 판단한다.
- FE는 `classFeatureIdAliasesByClassKey`, `featureInfoMap` 같은 수동 매핑으로 표시명을 보정한다.

이 때문에 BE에는 존재하는 feature가 FE 설명 사전에 없거나, FE에는 표시되지만 BE feature id와 연결되지 않는 문제가 생긴다.

### 2. `fe/public/srd`는 원천이 아니라 복사본이다

현재 루트 빌드에는 다음 흐름이 있다.

```bash
npm run build -w @trpg/srd-data
npm run sync:fe:srd
```

`scripts/sync-fe-static-srd.mjs`는 `srd-data/generated/srd/*.jsonl`을 FE public JSON으로 복사한다. 즉 `fe/public/srd/*.json`은 원천이 아니라 배포용 산출물이다. 하지만 FE 코드가 이것을 사실상 독립 원천처럼 사용하고 있고, 부족한 정보는 다시 FE 수동 매핑으로 보강한다.

### 3. BE 실행 데이터와 SRD 표시 데이터의 관계가 명시되지 않았다

BE의 룰 엔진은 단순 표시 데이터 이상의 정보를 필요로 한다.

- action cost
- resource id
- targeting
- hook id
- scaling tags
- runtime condition

이런 실행 데이터는 BE에 남아야 할 수 있다. 다만 feature id, 레벨, 이름, 설명, 선택 필요 여부는 `srd-data`와 반드시 정합해야 한다.

### 4. AI 서버는 이미 `srd-data`를 원천으로 사용한다

AI 문서와 코드에는 `srd-data/generated/srd/`를 런타임 catalog로 쓰는 방향이 이미 잡혀 있다. 따라서 FE/BE를 이 방향에 맞추는 것이 전체 구조상 가장 자연스럽다.

## 원칙

### 원칙 1. 사람이 수정하는 SRD 데이터는 한 곳만 둔다

SRD 원천은 다음 계층으로 고정한다.

```text
ai/translated/*
  ↓ build
srd-data/generated/srd/*
  ↓ package export / sync
FE / BE / AI runtime
```

FE나 BE에 같은 직업/주문/종족/장비 데이터를 다시 쓰지 않는다.

### 원칙 2. FE는 표시와 선택 UX를 담당하고, BE는 권위 검증과 실행을 담당한다

FE:

- 사용자가 고를 수 있는 옵션 표시
- 설명/프리뷰/타임라인 표시
- 잘못된 입력을 줄이는 사전 안내

BE:

- 캐릭터 생성/레벨업 최종 검증
- 주문/특성/장비/레벨 제한 검증
- 전투 및 룰 실행
- 저장 snapshot 생성

둘은 같은 data id와 shared helper를 사용해야 한다.

### 원칙 3. 불가피한 레이어별 보강은 “id 기반”으로만 한다

예를 들어 BE에 실행 hook이 필요한 경우:

```ts
class.bard.feature.bardic_inspiration
```

이 id에 action cost, resource id, targeting을 붙인다. 이름이나 레벨을 다시 정의하지 않는다.

FE에 아이콘/색상/카드 레이아웃이 필요한 경우도 id 기반 presentation override로만 둔다.

### 원칙 4. drift guard를 먼저 만든다

전면 리팩터링 전에도 불일치가 다시 생기지 않도록 검증 스크립트를 먼저 추가한다.

## 범위

### 포함

- `@trpg/srd-data` 패키지 export 강화
- SRD JSONL을 TypeScript에서 안전하게 읽는 loader/helper 추가
- FE 캐릭터 생성창의 class/race/spell/item 데이터 원천 정리
- BE RuleCatalog와 `srd-data` 정합성 검증
- AI 런타임 입력 catalog와 `srd-data` manifest 정합성 검증
- `verify:rule-data-sync` 추가
- 문서화

### 제외

- SRD 원문 번역 자체의 대규모 수정
- D&D 5e 전체 룰 완전 구현
- 홈브루 데이터 에디터
- 외부 CMS 도입
- 기존 룰 엔진의 전투 판정 로직 전면 재작성

## 구현 계획

## Phase 0. 현재 데이터 원천과 drift 지점 감사

목표: 중복 원천을 식별하고, 어떤 데이터가 어디에 있는지 목록화한다.

점검 대상:

- `srd-data/generated/srd/classes.jsonl`
- `srd-data/generated/srd/races.jsonl`
- `srd-data/generated/srd/spells.jsonl`
- `srd-data/generated/srd/equipment_items.jsonl`
- `srd-data/generated/srd/monsters.jsonl`
- `srd-data/generated/srd-engine/*.jsonl`
- `fe/public/srd/*.json`
- `fe/src/services/staticSrd.ts`
- `fe/src/pages/CharacterPage.tsx`
- `fe/src/features/characters/characterFeaturePresentation.ts`
- `be/src/modules/rules/rule-catalog.service.ts`
- `be/src/modules/rules/p*-spell-definitions.ts`
- `be/src/modules/rules/p*-monster-definitions.ts`
- `be/src/database/seed/classes.ts`
- `be/src/database/seed/races.ts`
- `be/src/database/seed/items.ts`

산출물:

- 중복 데이터 목록
- 제거 가능한 FE 수동 매핑 목록
- BE에 남겨야 하는 runtime-only metadata 목록
- `srd-data`에 추가해야 하는 누락 필드 목록

완료 기준:

- “원천”, “복사본”, “runtime override”, “legacy compatibility”가 구분된 감사 결과가 문서화된다.

## Phase 1. `@trpg/srd-data`를 실제 shared data package로 승격

현재 구현 기준:

- `@trpg/srd-data`는 `index.mjs`/`index.d.ts`를 package root export로 제공한다.
- `srd-data/generated/srd/*`와 `srd-data/generated/srd-engine/*`는 package subpath export로 노출된다.
- canonical 보조 산출물은 `srd-data/scripts/generate-canonical-artifacts.mjs`가 생성한다.
  - `class-features.json`
  - `fe-spell-pools.json`
  - `fe-usable-items.json`
  - `item-labels.json`
  - `catalog-fingerprint.json`
- package build는 `node scripts/generate-canonical-artifacts.mjs && node scripts/verify-generated.mjs`를 실행한다.

초기 계획에서는 `srd-data/src/*.ts` 구조를 예시로 두었지만, 현재는 별도 TS source tree 대신 ESM loader/export와 generated JSON artifact를 기준 구조로 삼는다.

제공 API 예시:

```ts
import {
  listSrdClasses,
  listCanonicalClassFeatures,
  listSrdSpells,
  listSrdRaces,
  getSrdCatalogFingerprint,
} from '@trpg/srd-data';
```

설계:

- Node 환경은 `@trpg/srd-data` loader API 또는 generated JSON subpath import를 사용한다.
- BE는 class feature canonical artifact처럼 런타임에 필요한 generated JSON을 import할 수 있다.
- FE는 bundle 크기를 고려해 `fe/public/srd` static sync를 유지하되, 같은 generated artifact를 복사해 사용한다.
- FE 전용 표시/선택 pool은 `srd-data/overrides`에서 관리하고 generated artifact로 고정한다.

완료 기준:

- `npm run build -w @trpg/srd-data`가 canonical artifact를 생성하고 generated asset을 검증한다.
- FE와 BE에서 최소 하나 이상의 catalog/generated artifact를 `@trpg/srd-data` 또는 FE public sync를 통해 사용한다.
- generated fingerprint와 FE public copy가 drift 없이 검증된다.

## Phase 2. canonical class feature manifest 생성

목표: 직업 특성 관련 FE/BE 불일치를 가장 먼저 제거한다.

생성할 manifest:

```ts
interface CanonicalClassFeature {
  id: string;
  classKey: string;
  subclassKey?: string | null;
  level: number;
  nameKo: string;
  nameEn?: string | null;
  category: 'class' | 'subclass' | 'asi' | 'choice';
  summaryKo: string;
  source: 'srd' | 'runtime' | 'derived';
  aliases: string[];
  runtime?: {
    hookId?: string;
    resourceId?: string;
    actionCost?: string;
    tags: string[];
  };
}
```

필요 작업:

- `classes.jsonl.featureReferences`와 `levelFeatures`를 id 기반으로 정규화한다.
- `levelFeatureSummary`의 콤마 문자열을 FE에서 직접 split하지 않도록 한다.
- `신성 변환 1/휴식`, `언데드 파괴 CR 1/2` 같은 라벨이 깨지지 않게 structured feature entry를 제공한다.
- BE `RuleCatalogService` feature id와 canonical id가 모두 매칭되는지 검증한다.

완료 기준:

- FE 캐릭터 생성창은 `classFeatureIdAliasesByClassKey` 없이 레벨별 특성 타임라인을 만들 수 있다.
- `characterFeaturePresentation.ts`의 수동 `featureInfoMap`은 canonical summary 또는 id 기반 override로 축소된다.
- 바드/몽크/클레릭 등 전 직업 fallback 설명이 구조적으로 재발하지 않는다.

## Phase 3. FE 캐릭터 빌더를 canonical SRD 데이터 기반으로 전환

대상:

- `fe/src/services/staticSrd.ts`
- `fe/src/pages/CharacterPage.tsx`
- `fe/src/features/characters/characterFeaturePresentation.ts`

작업:

- 직업 목록, 하위직업 목록, 레벨별 특성, 특성 설명을 canonical manifest에서 읽는다.
- 주문 선택 UI는 canonical spell manifest의 `classLists`, `level`, `school`, `components`, `ritual`, `concentration`을 사용한다.
- 종족/하위종족/종족 특성도 canonical race manifest에서 읽는다.
- FE-only presentation은 별도 id 기반 map으로 둔다.

유지 가능한 FE-only 데이터:

- 아이콘 이름
- 카드 색상/tone
- UX grouping
- 추천 프리셋

제거 대상:

- class feature label alias 수동 사전
- 레벨별 특성 문자열 split 기반 매칭
- BE와 중복되는 주문 개수 계산
- FE에만 존재하는 직업/종족 제한 상수

완료 기준:

- 캐릭터 생성창의 직업/레벨/특성/주문 프리뷰가 `srd-data` canonical manifest를 사용한다.
- FE 빌드 시 canonical 데이터 타입 불일치가 TypeScript로 드러난다.

## Phase 4. BE RuleCatalog를 canonical 데이터와 연결

BE의 실행 룰은 계속 필요하지만, id/name/level/source는 canonical data와 연결한다.

작업:

- `RuleCatalogService`의 class feature definitions를 canonical class feature manifest와 merge한다.
- BE runtime metadata는 `runtimeOverridesByFeatureId` 형태로 분리한다.
- feature id가 canonical manifest에 없으면 검증 실패하게 한다.
- canonical manifest에 있는데 BE runtime 지원이 없는 경우는 `runtimeStatus: 'presentation_only' | 'passive' | 'executable'`로 명시한다.

예시:

```ts
const runtimeOverridesByFeatureId = {
  'class.bard.feature.bardic_inspiration': {
    actionCost: 'bonus_action',
    resourceId: 'resource.bard.bardic_inspiration',
    targeting: { type: 'creature', rangeFt: 60 },
  },
};
```

완료 기준:

- BE `RuleCatalogService`가 canonical id와 runtime metadata를 합성해 현재 API 응답을 유지한다.
- `RuleCatalogService` 테스트는 canonical data와 runtime override 정합성을 검증한다.

## Phase 5. spell/race/item/monster data도 같은 방식으로 정리

우선순위:

1. 주문
2. 종족/하위종족
3. 장비/아이템
4. 몬스터

주문:

- FE 주문 선택 UI와 BE 주문 검증이 같은 spell id pool을 사용한다.
- known/prepared/cantrip progression은 shared helper로 이동한다.
- `shared-types/src/constants/spellcasting-progression.ts`와 `srd-data`의 관계를 명시한다.

종족:

- 종족/하위종족 key, ability bonus, trait id를 canonical race manifest로 통일한다.
- FE의 하위종족 선택 UI와 BE character validation이 같은 key를 사용한다.

장비:

- 시작 장비 선택지, 실제 아이템 id, inventory runtime item id를 연결한다.
- FE에서 보이는 시작 장비와 BE가 저장하는 아이템이 같은 canonical item id를 사용한다.

몬스터:

- scenario seed, combat runtime, FE 표시 카드가 같은 monster id와 stat block을 사용한다.

완료 기준:

- 각 도메인별로 FE/BE id drift 검증이 존재한다.
- 사용자가 고른 값이 BE에서 “알 수 없는 id”로 거절되는 케이스가 구조적으로 줄어든다.

## Phase 6. `verify:rule-data-sync` 추가

루트 script 추가:

```json
{
  "verify:rule-data-sync": "node scripts/verify-rule-data-sync.mjs"
}
```

검증 항목:

- FE public SRD 산출물이 `srd-data/generated/srd`와 동기화되어 있는가
- FE 캐릭터 빌더가 참조하는 class/race/spell/item id가 canonical manifest에 존재하는가
- BE RuleCatalog feature id가 canonical manifest에 존재하는가
- canonical class feature 중 display summary가 비어 있는 항목이 없는가
- canonical class feature 중 FE fallback으로 떨어지는 항목이 없는가
- 주문 진행표 helper와 canonical spell class list가 모순되지 않는가
- AI retrieval catalog가 같은 source manifest hash를 참조하는가

완료 기준:

- drift가 있으면 명확한 메시지와 함께 실패한다.
- 회귀 테스트 전 빠르게 실행 가능한 검증 명령으로 자리 잡는다.

## Phase 7. AI 서버 catalog 정합성 명시

AI 런타임은 이미 `srd-data/generated/srd/`를 읽는다. 여기서는 FE/BE와 같은 manifest version을 쓰는지 보장한다.

작업:

- `source_manifest.json` 또는 별도 `catalog_manifest.json`에 version/hash 추가
- AI retrieval이 읽는 catalog path와 FE/BE가 사용하는 package source hash 비교
- `eval:ai-quality` 또는 별도 lightweight check에서 catalog version 출력

완료 기준:

- AI 평가/런타임 로그에서 사용한 SRD catalog version을 확인할 수 있다.
- FE/BE/AI가 서로 다른 SRD 산출물을 쓰면 검증에서 드러난다.

## Phase 8. 문서화와 운영 규칙 고정

문서 업데이트:

- `ai/SRD_DATA_RULES_PIPELINE_PLAN.md`
- `doc/rules/ARCHITECTURE_RULES.md`
- `doc/future_plan.md`
- 필요 시 `AGENTS.md`

명시할 규칙:

- SRD 데이터 수정은 `srd-data` 원천 또는 generator를 통해서만 한다.
- FE/BE에서 SRD id/name/level/description을 수동 추가하지 않는다.
- 수동 override는 id 기반 presentation/runtime metadata만 허용한다.
- 새 직업/특성/주문 추가 시 `verify:rule-data-sync`를 통과해야 한다.

완료 기준:

- 새 개발자가 어떤 파일을 수정해야 하는지 명확히 알 수 있다.
- FE/BE 데이터 불일치가 “개인 기억”이 아니라 문서와 스크립트로 관리된다.

## 권장 구현 순서

1. `verify:rule-data-sync` 초안 작성
2. class feature canonical manifest 생성
3. FE 캐릭터 빌더 feature timeline을 canonical manifest로 전환
4. `characterFeaturePresentation.ts`를 canonical summary 기반으로 축소
5. BE RuleCatalog feature id drift 검증 추가
6. 주문 progression/shared helper 정리
7. race/item/monster drift 검증 추가
8. AI catalog manifest hash 검증 추가
9. 문서화

## 진행 기록

### 2026-06-26 1차 정합성 관문 추가

완료:

- 루트 명령 `npm run verify:rule-data-sync` 추가.
- `scripts/verify-rule-data-sync.mjs` 추가.
- `@trpg/srd-data`에 Node 환경용 typed catalog loader export 추가.
  - `srd-data/index.mjs`
  - `srd-data/index.d.ts`
  - `srd-data/package.json` exports

현재 `verify:rule-data-sync`가 검증하는 항목:

- `fe/public/srd/*.json`이 `srd-data/generated/srd/*.jsonl`에서 생성된 결과와 동일한지 확인한다.
- 캐릭터 빌더의 레벨별 class feature 라벨이 SRD `featureReferences` 또는 FE alias를 통해 canonical id로 해석되는지 확인한다.
- alias로 해석된 feature id가 FE presentation에 연결되어 fallback 설명으로 떨어지지 않는지 확인한다.
- BE `RuleCatalogService`의 class feature id가 canonical class feature set에 포함되는지 확인한다.
- AI/런타임이 참조하는 `srd-data/generated/srd/source_manifest.json`과 `srd-data/generated/srd-engine/manifest.json` 및 핵심 catalog 파일이 존재하는지 확인한다.

검증된 현재 상태:

```text
npm run verify:rule-data-sync
→ Verified SRD data sync. canonicalClassFeatures=339 beClassFeatures=235 fePresentationEntries=130

npm run build -w @trpg/srd-data
→ Verified generated SRD assets.

node import('@trpg/srd-data')
→ listSrdClasses() returns 12 classes.
```

주의:

- 현재 canonical class feature set은 검증 스크립트 내부에서 SRD `classes.jsonl`, FE alias, BE runtime id를 합성해 만든 임시 manifest다.
- 다음 단계에서는 이 임시 manifest를 `@trpg/srd-data`의 명시적 generated artifact 또는 exported helper로 승격해야 한다.
- FE 캐릭터 빌더는 아직 `classFeatureIdAliasesByClassKey`를 사용한다. 이번 단계는 drift를 막는 관문을 추가한 것이며, alias 제거는 다음 단계 작업이다.

### 2026-06-26 2차 canonical helper 승격 및 실행 콘텐츠 drift guard 확장

완료:

- `scripts/verify-rule-data-sync.mjs` 내부에 있던 canonical class feature 합성 로직을 `@trpg/srd-data` export로 승격했다.
- `@trpg/srd-data`에 다음 helper를 추가했다.
  - `buildCanonicalClassFeatureManifest`
  - `listCanonicalClassFeatures`
  - `normalizeSrdClassKey`
  - `normalizeSrdFeatureLookupLabel`
  - `normalizeSrdFeatureAliasKey`
  - `splitSrdClassFeatureSummary`
  - `findSrdClassFeatureReference`
  - `isIgnoredSrdClassFeatureLabel`
  - `resolveCanonicalSrdId`
- `verify:rule-data-sync`가 이제 `@trpg/srd-data` helper를 직접 사용한다.
- 실행 가능 콘텐츠 id 검증을 추가했다.
  - BE 실행 주문 id가 `srd-data/generated/srd/spells.jsonl`에 존재하는지 확인한다.
  - BE 실행 몬스터 id가 `srd-data/generated/srd/monsters.jsonl`에 존재하는지 확인한다.
  - BE 실행 아이템 id가 `equipment_items.jsonl` 또는 `magic_items.jsonl`에 존재하는지 확인한다.
- 레거시 id alias를 `@trpg/srd-data`에 명시했다.
  - `monster.dragon_whelp` → `monster.red_dragon_wyrmling`

검증된 현재 상태:

```text
npm run verify:rule-data-sync
→ Verified SRD data sync. canonicalClassFeatures=339 beClassFeatures=235 fePresentationEntries=130 executableSpells=50 executableMonsters=189 executableItems=50 legacyContentAliases=1

npm run build -w @trpg/srd-data
→ Verified generated SRD assets.

node import('@trpg/srd-data')
→ listCanonicalClassFeatures(...) and resolveCanonicalSrdId(...) work.
```

주의:

- `legacyContentAliases=1`은 아직 BE/시나리오에 `monster.dragon_whelp` 레거시 id가 남아 있음을 의미한다.
- 다음 단계에서는 이 alias를 유지하되, 실제 BE runtime/scenario seed/test fixture를 canonical monster id로 점진 마이그레이션할지 결정해야 한다.
- FE 캐릭터 빌더는 아직 canonical helper를 직접 사용하지 않는다. 다음 핵심 작업은 FE의 `classFeatureIdAliasesByClassKey`를 제거하거나 generated manifest 기반으로 축소하는 것이다.

### 2026-06-26 3차 FE class feature canonical manifest 연동

완료:

- `@trpg/srd-data`에 class feature alias source를 export했다.
  - `SRD_CLASS_FEATURE_ID_ALIASES`
- `scripts/sync-fe-static-srd.mjs`가 `fe/public/srd/class-features.json`을 생성하도록 확장했다.
- `fe/src/services/staticSrd.ts`에 canonical class feature manifest loader를 추가했다.
  - `CanonicalClassFeatureEntry`
  - `loadClassFeatureManifest`
- `fe/src/pages/CharacterPage.tsx`의 캐릭터 생성/레벨업 특성 프리뷰가 `class-features.json`을 먼저 참조하도록 전환했다.
  - canonical manifest id/name/summary/category를 우선 사용한다.
- FE 내부 수동 `classFeatureIdAliasesByClassKey`를 제거했다.
- `verify:rule-data-sync`가 FE 내부 alias 파싱 대신 `@trpg/srd-data` export를 기준으로 canonical manifest를 검증하게 바뀌었다.
- `verify:rule-data-sync`가 `fe/public/srd/class-features.json` 동기화 여부도 확인한다.

검증된 현재 상태:

```text
npm run sync:fe:srd
→ Synced generated SRD assets into fe/public.

npm run verify:rule-data-sync
→ Verified SRD data sync. canonicalClassFeatures=339 beClassFeatures=235 fePresentationEntries=130 executableSpells=50 executableMonsters=189 executableItems=50 legacyContentAliases=1

npm run build -w @trpg/srd-data
→ Verified generated SRD assets.

npm run build -w @trpg/fe
→ tsc -b && vite build 통과.
```

주의:

- `characterFeaturePresentation.ts`의 id 기반 표시 override도 아직 유지된다. 이것은 아이콘/UX tone 같은 FE-only override와 canonical summary 보강을 분리하는 단계에서 더 줄일 수 있다.

### 2026-06-27 4차 AI catalog fingerprint 및 seed/scenario drift guard 보강

완료:

- `@trpg/srd-data`에 catalog fingerprint helper를 추가했다.
  - `getSrdCatalogFingerprint`
  - `SrdCatalogFingerprint`
- `verify:rule-data-sync`가 AI/SRD manifest를 더 강하게 검증하게 했다.
  - `srd-data/generated/srd/source_manifest.json`의 expected count와 실제 JSONL 행 수를 비교한다.
  - `srd-data/generated/srd-engine/manifest.json`의 file count와 실제 engine JSONL 행 수를 비교한다.
  - FE/BE/AI가 참조해야 할 SRD catalog 묶음의 fingerprint prefix를 출력한다.
- `verify:rule-data-sync`가 BE seed와 scenario seed drift도 확인하게 했다.
  - BE class seed key가 SRD class catalog에 존재하는지 확인한다.
  - BE race/subrace seed key가 SRD race/subrace catalog에 존재하는지 확인한다.
  - BE item seed의 실제 장비 alias가 `srd-engine/equipment.jsonl`에 존재하는지 확인한다.
  - 기본 시나리오 seed의 monster/item id가 generated SRD catalog에 존재하는지 확인한다.
- SRD catalog에 없는 P5 시나리오 몬스터 id를 canonical SRD 몬스터로 치환했다.
  - `monster.mind_flayer` → `monster.rakshasa`
  - `monster.beholder` → `monster.medusa`
  - `monster.demilich` → `monster.lich`
- 레거시 시나리오 item shorthand를 명시 alias로 추가했다.
  - `equipment.rope` → `equipment.rope_hempen_50_feet`

검증된 현재 상태:

```text
npm run verify:rule-data-sync
→ Verified SRD data sync. canonicalClassFeatures=339 beClassFeatures=235 fePresentationEntries=130 executableSpells=50 executableMonsters=189 executableItems=50 scenarioMonsters=82 scenarioItems=11 seedRaces=13 seedItems=35 legacyContentAliases=3 catalogFingerprint=c8a72df59cf1

npm run build -w @trpg/srd-data
→ Verified generated SRD assets.

npm run build -w @trpg/be
→ nest build 통과.
```

주의:

- `legacyContentAliases=3`은 아직 canonical id로 완전히 치환되지 않은 호환 id가 있음을 의미한다.
  - `monster.dragon_whelp`
  - `equipment.rope`
  - 시나리오/manifest 양쪽에서 중복 집계되는 alias가 포함될 수 있다.
- 다음 단계에서는 남은 legacy alias를 실제 seed/runtime id에서 canonical id로 치환하거나, 명시적으로 장기 호환 계층으로 남길지 결정해야 한다.

### 2026-06-27 5차 legacy content id 사용처 canonical 치환

완료:

- 실제 seed/runtime에서 사용 중이던 레거시 몬스터 id를 canonical SRD id로 치환했다.
  - `monster.dragon_whelp` → `monster.red_dragon_wyrmling`
  - 대상:
    - P1 시나리오 seed monster token/meta
    - `P2_EXECUTABLE_MONSTER_IDS`
    - `RuleCatalogService` monster ability 정의
    - `MonsterAbilityService` action preference
    - `SrdEngineLoaderService` action preference
    - 관련 spec fixture
- 시나리오 seed의 rope item id를 FE/P3 item manifest가 사용하는 canonical 표시 catalog id로 정렬했다.
  - `equipment.rope` → `equipment.rope__hempen__50_feet`
- `equipment.rope` 호환 alias는 남겼지만, 현재 seed/runtime 검증 집계에서는 더 이상 사용되지 않는다.
- `verify:rule-data-sync`가 FE executable item id도 generated SRD item catalog와 대조하게 했다.
- `verify:rule-data-sync`가 class feature 프리뷰 fallback 재발도 감지하게 했다.
  - 레벨별 feature 라벨이 canonical feature id로 해석되어야 한다.
  - 해당 canonical feature에 summary가 없으면 FE id 기반 presentation override가 반드시 있어야 한다.
- `ai/scripts/evaluate_p0_ai_quality.py`의 report와 콘솔 출력에 SRD catalog fingerprint를 추가했다.
  - AI 품질 평가 결과에서 어떤 `srd-data/generated` 묶음으로 평가했는지 확인할 수 있다.
  - Python 계산값과 `@trpg/srd-data`의 `getSrdCatalogFingerprint()` 계산값이 같은 prefix를 반환하는 것을 확인했다.

검증된 현재 상태:

```text
npm run verify:rule-data-sync
→ Verified SRD data sync. canonicalClassFeatures=339 beClassFeatures=235 fePresentationEntries=130 executableSpells=50 executableMonsters=188 executableItems=50 feExecutableItems=36 scenarioMonsters=82 scenarioItems=11 seedRaces=13 seedItems=35 legacyContentAliases=0 catalogFingerprint=c8a72df59cf1

npm run build -w @trpg/srd-data
→ Verified generated SRD assets.

npm run build -w @trpg/be
→ nest build 통과.

python -m py_compile ai/scripts/evaluate_p0_ai_quality.py
→ 통과.

python load_srd_catalog_fingerprint / node getSrdCatalogFingerprint
→ 둘 다 c8a72df59cf1 prefix 반환.
```

주의:

- `SRD_LEGACY_ID_ALIASES`에는 과거 저장 데이터/명령 fixture 호환을 위한 alias가 남아 있지만, current seed/runtime/content manifest에서는 `legacyContentAliases=0`이다.
- 일부 단위 테스트 fixture에는 의도적으로 `/item pickup ... equipment.rope ...` 같은 과거 사용자 입력 형태가 남아 있다. 이것은 parser/action 호환성 검증용이며, canonical content source로 쓰이지 않는다.

### 2026-06-29 5차 당시 완료 감사 및 남은 작업 재정리

확인된 완료:

- `verify:rule-data-sync` 루트 명령과 `scripts/verify-rule-data-sync.mjs`가 존재한다.
- `@trpg/srd-data`는 `index.mjs`/`index.d.ts` export를 통해 Node 환경용 catalog loader와 canonical class feature helper를 제공한다.
- `scripts/sync-fe-static-srd.mjs`는 `fe/public/srd/class-features.json`을 생성한다.
- FE 캐릭터 빌더는 `loadClassFeatureManifest()`를 통해 canonical class feature manifest를 로드하고, 기존 class feature alias 사전 의존을 제거했다.
- 검증 스크립트는 FE public SRD sync, class feature fallback drift, BE class feature id, 실행 주문/몬스터/아이템 id, seed/scenario id, AI catalog manifest/fingerprint를 확인한다.
- legacy content alias 사용은 current seed/runtime/content manifest 기준으로 제거되었고, 호환 alias만 `@trpg/srd-data`에 남아 있다.
- 문서 지도와 아키텍처 규칙에 SRD 데이터 단일 원천, 허용되는 id 기반 override, `verify:rule-data-sync` 검증 기준을 명시했다.

5차 당시 최종 완료로 보지 않은 이유:

- BE `RuleCatalogService`는 아직 `@trpg/srd-data` canonical manifest를 import/merge하지 않고, 자체 `CLASS_FEATURE_DEFINITIONS`를 유지한다. 현재는 검증 스크립트가 drift를 감지하는 단계다.
- 주문/종족/장비/몬스터는 id drift guard가 생겼지만, FE/BE 런타임 사용처가 모두 canonical helper/shared helper 기반으로 전환된 상태는 아니다.
- `characterFeaturePresentation.ts`의 id 기반 `featureInfoMap`은 남아 있다. 현재는 FE-only presentation override와 canonical summary 보강이 섞인 상태이므로 더 축소할 여지가 있다.
- Phase 1의 예시 구조인 `srd-data/src/*.ts` 파일 구조는 구현되지 않았고, 현재는 package root의 `index.mjs`/`index.d.ts` 직접 export 방식이다. 기능상 일부 목표는 달성했지만 문서의 구조 예시와는 다르다.

5차 당시 다음 우선순위:

1. BE `RuleCatalogService`의 class feature runtime metadata를 canonical id 기반 override로 분리하고, snapshot/API 응답은 canonical manifest와 합성하도록 전환한다.
2. spell/race/item/monster의 FE/BE runtime 사용처를 domain별로 골라 canonical helper 또는 generated manifest 기반으로 전환한다.
3. `characterFeaturePresentation.ts`에서 canonical summary로 대체 가능한 설명 override를 제거하고, 남은 항목을 아이콘/tone/UX grouping 같은 FE-only override로 한정한다.
4. 문서의 구현 예시와 실제 `@trpg/srd-data` export 구조 중 하나를 기준으로 맞춘다. 현재 구조를 유지한다면 Phase 1 설명을 `index.mjs`/`index.d.ts` export 방식으로 갱신한다.

### 2026-06-29 6차 BE class feature runtime override 분리 시작

완료:

- BE `RuleCatalogService`의 class feature 정의 이름을 `CLASS_FEATURE_RUNTIME_OVERRIDES`로 바꿔, canonical class feature id에 붙는 runtime metadata라는 의도를 명시했다.
- `RuleCatalogEntry`에 선택 필드 `runtimeStatus`를 추가했다.
  - 현재 class feature entry는 `passive` 또는 `executable` 상태를 계산해 포함한다.
  - 기존 snapshot/API 필드는 유지한다.
- class feature runtime metadata는 여전히 `RuleCatalogService` 내부에 있지만, 이름/타입/entry 상태가 canonical merge를 위한 중간 구조에 가까워졌다.

6차 당시 주의:

- 6차 당시에는 `RuleCatalogService`가 `@trpg/srd-data` canonical manifest를 직접 import하거나 합성하지 않았다.
- BE가 CommonJS로 빌드되는 반면 `@trpg/srd-data`는 ESM export이므로, 서비스 생성자에서 동기 import로 직접 합성하는 방식은 런타임 위험이 있다.
- 다음 단계에서는 `@trpg/srd-data`의 canonical class feature manifest를 BE가 안전하게 사용할 수 있도록 CJS 호환 artifact 또는 generated JSON artifact를 마련한 뒤, `CLASS_FEATURE_RUNTIME_OVERRIDES`와 합성해야 한다.

### 2026-06-29 7차 canonical class feature JSON artifact 및 BE 대조 연결

완료:

- `srd-data/generated/srd/class-features.json`을 canonical class feature JSON artifact로 추가했다.
- `srd-data/scripts/generate-canonical-artifacts.mjs`를 추가했다.
  - `classes.jsonl`과 `SRD_CLASS_FEATURE_ID_ALIASES`를 기반으로 canonical class feature manifest를 생성한다.
  - BE `RuleCatalogService`의 class feature runtime override id도 포함해 현재 검증 기준과 같은 339개 canonical feature set을 만든다.
- `@trpg/srd-data` build가 canonical artifact 생성 후 generated asset 검증을 실행하도록 변경했다.
- `scripts/sync-fe-static-srd.mjs`는 더 이상 class feature manifest를 자체 생성하지 않고 `srd-data/generated/srd/class-features.json`을 FE public으로 복사한다.
- `verify:rule-data-sync`가 `srd-data/generated/srd/class-features.json` stale 여부를 직접 검증한다.
- BE `RuleCatalogService`가 `@trpg/srd-data/generated/srd/class-features.json`을 import하고, class feature runtime override id가 canonical manifest에 없으면 생성 단계에서 실패하게 했다.

검증된 현재 상태:

```text
node srd-data/scripts/generate-canonical-artifacts.mjs
→ Generated canonical SRD artifacts.

node require('./srd-data/generated/srd/class-features.json')
→ 339 entries, 대표 BE runtime ids 포함 확인
```

주의:

- BE class feature API 응답은 아직 canonical name/summary를 합성해 노출하지 않는다. 현재 단계는 BE runtime override id가 generated canonical artifact에 반드시 연결되도록 하는 대조 관문이다.
- `srd-data` build script가 monorepo의 BE source를 읽어 runtime id를 포함한다. 장기적으로는 runtime override manifest를 별도 파일로 분리해 이 의존 방향을 더 명확히 하는 것이 좋다.

### 2026-06-29 8차 runtime class feature alias summary 보강 및 BE 합성

완료:

- canonical class feature manifest 생성 로직이 SRD `featureReferences`의 한글 id와 BE/FE runtime id alias를 함께 등록하도록 보강됐다.
  - 예: `class.barbarian.feature.격노`의 이름/요약이 `class.barbarian.feature.rage`에도 연결된다.
  - 예: `class.bard.feature.바드의_고양감`의 이름/요약이 `class.bard.feature.bardic_inspiration`에도 연결된다.
- `srd-data/generated/srd/class-features.json`을 재생성해 runtime class feature 중 canonical summary를 가진 항목을 늘렸다.
  - 확인 표본: `rage`, `bardic_inspiration`, `channel_divinity` runtime id가 SRD 이름/요약/레벨 정보를 가진다.
  - 현재 산출물 기준 `runtimeWithSummary=116`, `runtimeTotal=235`다.
- BE `RuleCatalogEntry`에 선택 필드 `displayNameKo`, `descriptionKo`를 추가했다.
- BE `RuleCatalogService`의 class feature entry 생성이 canonical artifact에서 이름/요약을 합성하도록 연결됐다.
  - runtime override id가 canonical artifact에 없으면 기존처럼 생성 단계에서 실패한다.
  - 기존 runtime cost/targeting/effect API 구조는 유지된다.

주의:

- canonical summary가 없는 runtime class feature가 아직 남아 있다. 이는 SRD `featureReferences` 자체가 없는 항목, 레벨별 증분 항목, 또는 alias 이름이 원문 reference와 어긋나는 항목이다.
- `characterFeaturePresentation.ts`의 수동 설명 override는 아직 필요하다. 다만 canonical summary가 연결된 항목부터 점진적으로 FE-only tone/icon override와 설명 데이터를 분리할 수 있는 기반이 생겼다.

### 2026-06-29 9차 FE class feature 중복 설명 override 축소

완료:

- `characterFeaturePresentation.ts`에서 canonical class feature summary로 이미 대체 가능한 class feature 설명 override 43개를 제거했다.
  - 제거 후 `featureInfoMap` 전체 항목은 130개에서 87개로 줄었다.
  - class feature override는 125개에서 82개로 줄었다.
  - canonical summary가 있는데도 FE 설명 override가 남은 중복 항목은 0개다.
- 세션 플레이 화면에서 제거된 설명이 fallback으로 떨어지지 않도록 canonical manifest 로딩 경로를 보강했다.
  - `CharacterDetailModal`이 `loadClassFeatureManifest()`를 사용한다.
  - `PlayPage`의 캐릭터 carousel feature summary가 `loadClassFeatureManifest()` 결과를 사용한다.
- `verify:rule-data-sync`에 중복 설명 override 재발 방지 guard를 추가했다.
  - canonical summary가 있는 `class.*` feature id를 `characterFeaturePresentation.ts`의 설명 fallback map에 다시 추가하면 실패한다.

주의:

- 아직 남은 class feature 설명 override 82개는 canonical summary가 비어 있는 항목이다.
- 다음 단계는 SRD 원문 reference가 없는 항목을 `srd-data` 쪽 canonical artifact/override source로 보강한 뒤, FE map에서 추가로 제거하는 것이다.

### 2026-06-29 10차 FE class feature 설명 source를 srd-data로 이동

완료:

- 남아 있던 `class.*.feature.*` 설명 override 81개를 `srd-data/overrides/class-feature-summaries.json`으로 이동했다.
- canonical class feature manifest 생성기가 `displayOverridesById`를 받아 이름/요약이 비어 있는 runtime feature를 보강하도록 확장됐다.
  - `srd-data/scripts/generate-canonical-artifacts.mjs`가 override source를 읽어 `srd-data/generated/srd/class-features.json`에 반영한다.
  - `scripts/verify-rule-data-sync.mjs`도 같은 override source를 읽어 generated artifact stale 여부를 검증한다.
- `srd-data/generated/srd/class-features.json`을 재생성했다.
  - 현재 산출물 기준 `runtimeWithSummary=192`, `runtimeTotal=235`다.
- FE `characterFeaturePresentation.ts`의 설명 fallback map에서 이동 완료된 `class.*.feature.*` 항목을 제거했다.
  - 현재 `featureInfoMap`은 6개 항목만 남는다.
  - 남은 항목은 Feat, legacy `feature.*` id, 그리고 legacy subclass id `class.barbarian.subclass_feature.frenzy`다.

주의:

- runtime summary가 없는 class feature 43개는 대부분 레벨별 증분/스케일링 항목이다.
  - 예: `brutal_critical_2`, `song_of_rest_d10`, `destroy_undead_cr_1`, `sorcery_points_10`.
  - 이 항목들은 base feature summary와 scaling metadata로 병합할지, 별도 derived summary를 만들지 결정이 필요하다.
- `class.barbarian.subclass_feature.frenzy`는 legacy subclass id 형태라 이번 `class.*.feature.*` 이동 대상에서 제외했다.

### 2026-06-29 11차 FE 주문 fallback 표시명 중복 제거 및 id drift guard

완료:

- `CharacterPage.tsx`의 fallback spell option 목록에서 수동 label/번역 문자열을 제거했다.
  - fallback 목록은 spell id만 유지한다.
  - 표시명은 `loadSpellCatalog()`로 읽은 `fe/public/srd/spells.json`의 `nameKo/nameEn`에서 계산한다.
  - rule catalog label은 보조 fallback으로만 사용한다.
- generated SRD spell catalog에 없는 FE fallback spell id를 제거했다.
  - 제거: `spell.blade_ward`, `spell.friends`, `spell.armor_of_agathys`
- `verify:rule-data-sync`가 FE 주문 fallback id pool도 generated SRD spell catalog와 대조하도록 보강했다.
  - `CharacterPage.tsx`의 character builder fallback spell id를 검증한다.
  - `PlayPage.tsx`의 quick-create fallback spell id를 검증한다.
  - 검증 출력에 `characterBuilderFallbackSpells`, `quickCreateFallbackSpells`를 포함한다.

주의:

- FE spell option id pool 자체는 아직 `CharacterPage.tsx`/`PlayPage.tsx`에 남아 있다.
- 다음 단계에서는 이 id pool도 `srd-data` 또는 BE content manifest 기반 generated artifact로 이동할 수 있다.

### 2026-06-29 12차 FE 주문 fallback id pool을 srd-data 산출물로 이동

완료:

- FE 내부에 있던 주문 fallback id pool을 `srd-data/overrides/fe-spell-pools.json`으로 이동했다.
  - 캐릭터 빌더 fallback cantrip/slot spell pool.
  - quick-create fallback cantrip/slot spell pool.
- `srd-data/scripts/generate-canonical-artifacts.mjs`가 `srd-data/generated/srd/fe-spell-pools.json`을 생성하도록 확장했다.
- `scripts/sync-fe-static-srd.mjs`가 `fe/public/srd/fe-spell-pools.json`을 복사하도록 확장했다.
- FE static loader에 `loadFeSpellPools()`와 `StaticFeSpellPools` 타입을 추가했다.
- `CharacterPage.tsx`와 `PlayPage.tsx`는 더 이상 fallback spell id pool을 직접 선언하지 않고, static SRD asset에서 읽는다.
- `verify:rule-data-sync`는 generated spell pool artifact가 override source와 동기화되어 있는지, 그리고 모든 fallback spell id가 generated SRD spell catalog에 존재하는지 검증한다.

29차 당시 확인 상태:

- `srd-data/generated/srd/fe-spell-pools.json`과 `fe/public/srd/fe-spell-pools.json`이 동일하다.
- character builder fallback spell id는 97개이며 generated spell catalog 누락은 0개다.
- quick-create fallback spell id는 14개이며 generated spell catalog 누락은 0개다.

주의:

- 이 spell pool은 아직 BE runtime content manifest에서 자동 생성되는 것은 아니며, `srd-data/overrides` 아래의 FE 운영용 pool이다.
- 다음 단계에서는 BE executable spell manifest와 이 FE fallback pool의 관계를 더 강하게 만들 수 있다.

### 2026-06-29 13차 BE race runtime key drift guard 보강

완료:

- `verify:rule-data-sync`가 BE `RuleCatalogService`의 race runtime key를 generated SRD race/subrace catalog와 대조하도록 보강했다.
  - `raceTrait(...)`에 사용된 race/subrace key를 검증한다.
  - `RACE_PARENT_KEYS`의 child/parent key를 검증한다.
- 현재 확인된 BE race runtime 상태:
  - `beRaceTraitKeys=13`
  - `beRaceParentLinks=4`
  - generated SRD race/subrace catalog 누락 0개

주의:

- 이 단계는 race key drift guard다.
- race ability bonus/language/speed 같은 상세 수치가 BE seed/runtime과 generated SRD race data에서 완전히 같은지는 아직 별도 검증하지 않는다.

### 2026-06-29 14차 FE 직접 사용 가능 아이템 pool을 srd-data 산출물로 이동

완료:

- FE 세션 화면의 `directlyUsableP3ItemIds` 수동 목록을 `srd-data/overrides/fe-usable-items.json`으로 이동했다.
- `srd-data/scripts/generate-canonical-artifacts.mjs`가 `srd-data/generated/srd/fe-usable-items.json`을 생성하도록 확장했다.
- `scripts/sync-fe-static-srd.mjs`가 `fe/public/srd/fe-usable-items.json`을 복사하도록 확장했다.
- `fe/src/features/sessionPlay/utils/executableItems.ts`는 더 이상 아이템 id 목록을 직접 선언하지 않고 `@trpg/srd-data/generated/srd/fe-usable-items.json`을 import한다.
- `srd-data/generated/srd/item-labels.json`을 추가해 FE 아이템 표시명이 generated item catalog의 `nameKo/nameEn`을 따르도록 했다.
- `fe/src/features/sessionPlay/utils/displayNames.ts`의 직접 아이템 라벨 map을 제거하고 `@trpg/srd-data/generated/srd/item-labels.json`을 import하도록 바꿨다.
- `verify:rule-data-sync`가 generated FE usable item artifact의 stale 여부와 모든 id의 generated SRD item catalog 존재 여부를 검증하도록 보강했다.
- `verify:rule-data-sync`가 generated item label artifact의 stale 여부와 FE public sync 여부를 검증하도록 보강했다.
- `@trpg/srd-data` generated asset 검증 대상에 `fe-usable-items.json`과 `item-labels.json`을 추가했다.

주의:

- 이 목록은 BE 실행 아이템 정의 전체가 아니라 FE에서 “직접 사용 버튼을 보여줄 수 있는 아이템” pool이다.
- 실제 아이템 효과/runtime metadata는 아직 BE `P3_EXECUTABLE_ITEM_DEFINITIONS`가 권위 소스이며, FE pool은 generated SRD item catalog와의 id 정합성을 검증받는다.

### 2026-06-29 15차 BE race runtime tag 상세값 drift guard 보강

완료:

- `verify:rule-data-sync`가 BE `RuleCatalogService`의 race runtime tag를 generated SRD race/subrace raw field와 대조하도록 보강했다.
  - `abilityScoreIncreaseRaw` → `fixed:ability:*`
  - `sizeRaw` → `fixed:size:*`
  - `speedRaw` → `fixed:speed:*`
  - `languagesRaw` → `language:*` 또는 `language:choice:one`
  - subrace `abilityScoreIncreaseRaw` → 해당 subrace `subrace_traits` ability tag
- 이 guard를 추가하면서 실제 drift 1건을 수정했다.
  - SRD 인간 언어는 `Common, one extra language`인데 BE human race trait에 `language:choice:one`이 빠져 있었다.
  - `race.human.trait.ability_score_increase` runtime tag에 `language:choice:one`을 추가했다.
- 현재 별도 정적 확인 기준:
  - generated race row 9개
  - BE race trait entry 13개
  - SRD-derived race runtime tag 누락 0개

주의:

- DB seed `languagesJson`은 UI/API에 직접 노출될 수 있으므로 선택 슬롯 문자열을 무리하게 추가하지 않았다.
- 이번 단계는 BE runtime tag가 SRD 상세값과 어긋나지 않게 막는 guard이며, 캐릭터 생성 시 선택 언어를 실제로 선택/저장하는 UX는 별도 기능 범위다.

### 2026-06-29 16차 BE monster runtime id guard 및 비SRD 명시 allowlist 추가

완료:

- `verify:rule-data-sync`가 BE monster runtime 정의의 monster id를 generated SRD monster catalog와 대조하도록 보강했다.
  - `RuleCatalogService`의 `monsterAbility(... monsterId: ...)`
  - `p3-monster-definitions.ts`
  - `p4-monster-definitions.ts`
  - `p5-monster-definitions.ts`
  - `p6-monster-definitions.ts`
- P5 monster runtime에서 canonical SRD id와 어긋난 철자 drift 2건을 수정했다.
  - `monster.barbearded_devil` → `monster.bearded_devil`
  - `monster.sabre_toothed_tiger` → `monster.saber_toothed_tiger`
- generated SRD monster catalog에 없는 확장 runtime id 23개를 `srd-data/overrides/non-srd-monster-runtime-ids.json`으로 명시했다.
- verify guard는 다음을 실패로 처리한다.
  - generated SRD monster catalog에도 없고 non-SRD allowlist에도 없는 BE monster runtime id
  - 더 이상 BE runtime에서 쓰이지 않는 non-SRD allowlist id
  - `monsterAbility` id prefix와 `monsterId`가 서로 맞지 않는 경우
- 현재 별도 정적 확인 기준:
  - BE runtime monster id 340개
  - 명시된 non-SRD monster runtime id 23개
  - 미등록 non-SRD runtime id 0개
  - 미사용 non-SRD allowlist id 0개

주의:

- 이 단계는 비SRD 확장 몬스터를 SRD catalog로 편입한 것이 아니라, SRD catalog 밖 runtime id를 명시적으로 드러내고 새 drift를 막는 guard다.
- 최종적으로 비SRD 몬스터를 유지할지, SRD catalog에 존재하는 몬스터로 치환할지, 별도 homebrew/extension catalog로 승격할지는 후속 결정이 필요하다.

### 2026-06-29 17차 spell progression 및 FE spell pool level guard 보강

완료:

- `verify:rule-data-sync`가 shared spellcasting progression과 generated SRD class catalog의 class key를 대조하도록 보강했다.
  - `shared-types/src/constants/spellcasting-progression.ts`의 class key가 generated SRD classes에 존재해야 한다.
- `verify:rule-data-sync`가 FE 캐릭터 빌더의 `implementedSpellClasses`와 shared spellcasting progression class key도 대조하도록 보강했다.
  - FE 캐릭터 빌더가 주문 가능 직업 목록을 수동 Set으로 유지하더라도, shared progression과 어긋나면 실패한다.
- `verify:rule-data-sync`가 FE spell pool의 class key와 spell level bucket을 generated SRD spell catalog와 대조하도록 보강했다.
  - character builder cantrip pool은 level 0 주문만 허용한다.
  - character builder slot spell bucket은 bucket 번호와 실제 spell level이 같아야 한다.
  - quick-create cantrip pool은 level 0 주문만 허용한다.
  - quick-create level 1 pool은 level 1 주문만 허용한다.
  - quick-create level 5/7 class별 pool은 shared progression에 있는 class key만 허용하고, 해당 class/level에서 접근 가능한 slot level 이하의 주문만 허용한다.
- 현재 별도 정적 확인 기준:
  - spellcasting progression class 8개: bard, cleric, druid, paladin, ranger, sorcerer, warlock, wizard
  - character builder spell class 8개: bard, cleric, druid, paladin, ranger, sorcerer, warlock, wizard
  - quick-create spell pool class 6개: bard, cleric, druid, sorcerer, warlock, wizard
  - FE spell pool level/class mismatch 0개

주의:

- 이 guard는 FE 운영용 spell pool과 shared progression의 key/level drift를 막는 장치다.
- 17차 당시에는 주문별 class spell list 전체를 SRD 원천에서 파싱해 “이 주문이 이 직업 목록에 속하는가”까지 판정하는 full class-list 검증이 별도 작업으로 남아 있었다.
- 후속 상태: 27~30차에서 `srd-data/sources/spell-class-lists.json`, generated/public artifact, 필수 검증, BE executable spell membership guard를 추가해 이 갭을 정적 구현 기준으로 해소했다.

### 2026-06-29 18차 BE spell runtime id/level drift guard 보강

완료:

- `verify:rule-data-sync`가 BE 주문 runtime 정의 전체를 generated SRD spell catalog와 대조하도록 보강했다.
  - `RuleCatalogService`의 기본 `spell(...)` 정의
  - `p3-spell-definitions.ts`
  - `p4-spell-definitions.ts`
  - `p5-spell-definitions.ts`
  - `p6-spell-definitions.ts`
- BE runtime 주문 id가 generated SRD spell catalog에 없으면 실패하게 했다.
- generated SRD에 없는 확장 runtime 주문 10개는 `srd-data/overrides/non-srd-spell-runtime-ids.json`에 명시했다.
  - `spell.arcane_gate`
  - `spell.armor_of_agathys`
  - `spell.aura_of_life`
  - `spell.aura_of_purity`
  - `spell.beast_sense`
  - `spell.blade_ward`
  - `spell.feign_death`
  - `spell.friends`
  - `spell.telepathy`
  - `spell.tsunami`
- generated SRD에 존재하는 주문은 BE runtime 정의의 `level` 값이 SRD spell level과 일치해야 한다.
- allowlist에 남아 있지만 더 이상 BE runtime에서 쓰이지 않는 non-SRD spell id도 실패하게 했다.
- verify 출력에 `nonSrdSpellRuntimeIds`를 추가해 SRD 밖 runtime 주문 수가 드러나게 했다.

주의:

- 이 단계는 비SRD 주문을 SRD catalog로 편입한 것이 아니라, SRD catalog 밖 runtime 주문을 명시적으로 드러내고 새 drift를 막는 guard다.
- 18차 당시에는 주문별 class spell list 전체를 SRD 원천에서 파싱해 “이 주문이 이 직업 목록에 속하는가”까지 판정하는 full class-list 검증이 별도 작업으로 남아 있었다.
- 후속 상태: 27~30차에서 `srd-data/sources/spell-class-lists.json`, generated/public artifact, 필수 검증, BE executable spell membership guard를 추가해 이 갭을 정적 구현 기준으로 해소했다.
- 작업자 지침에 따라 `npm run verify:rule-data-sync`는 직접 실행하지 않았다. 사용자가 권장 검증 명령에서 실행해야 한다.

### 2026-06-29 19차 srd-engine MVP spell list guard 보강

완료:

- `verify:rule-data-sync`가 `srd-data/generated/srd-engine/classes.jsonl`의 `mvpSpellList`를 generated SRD spell catalog와 대조하도록 보강했다.
  - MVP cantrip list의 주문은 generated SRD spell level 0이어야 한다.
  - MVP level 1 list의 주문은 generated SRD spell level 1이어야 한다.
  - MVP `all` list는 cantrip list와 level 1 list의 합집합과 일치해야 한다.
  - MVP spell list가 있는 class key는 generated SRD class catalog에 존재해야 한다.
- FE fallback spell pool과도 대조한다.
  - MVP cantrip은 character builder/quick-create cantrip fallback pool에 있어야 한다.
  - MVP level 1 spell은 character builder/quick-create level 1 fallback pool에 있어야 한다.
- verify 출력에 `engineClassMvpSpellLists`를 추가해 현재 검증 가능한 class spell list 수를 드러나게 했다.
- 현재 별도 정적 확인 기준:
  - `engineClassMvpSpellLists=1`
  - MVP spell list mismatch 0개

주의:

- 현재 `srd-data/generated/srd-engine/classes.jsonl`에는 위저드 MVP slice만 `mvpSpellList`를 가진다.
- `srd-data/generated/srd/spells.jsonl`과 `srd-data/generated/srd-engine/spells.jsonl`에는 12개 직업 전체 spell class list 필드가 없다.
- 따라서 “이 주문이 이 직업 주문 목록에 속하는가”를 전 직업/전 주문 대상으로 검증하려면, 먼저 `srd-data` 생성 단계에서 spell class list artifact를 새로 만들어야 한다.
- 작업자 지침에 따라 `npm run verify:rule-data-sync`는 직접 실행하지 않았다. 사용자가 권장 검증 명령에서 실행해야 한다.

### 2026-06-29 20차 FE/BE/AI catalog fingerprint artifact 동기화

완료:

- `srd-data/generated/srd/catalog-fingerprint.json`을 generated artifact로 추가했다.
  - `@trpg/srd-data`의 `getSrdCatalogFingerprint()` 결과를 파일로 고정한다.
  - fingerprint는 핵심 `srd` catalog와 `srd-engine` catalog 파일들의 sha256 묶음으로 계산된다.
- `srd-data/scripts/generate-canonical-artifacts.mjs`가 `catalog-fingerprint.json`을 생성하도록 보강했다.
- `srd-data/scripts/verify-generated.mjs`의 필수 generated asset 목록에 `catalog-fingerprint.json`을 추가했다.
- `scripts/sync-fe-static-srd.mjs`가 `fe/public/srd/catalog-fingerprint.json`을 복사하도록 보강했다.
- `verify:rule-data-sync`가 다음 drift를 실패로 처리하도록 보강했다.
  - generated `catalog-fingerprint.json`이 현재 `getSrdCatalogFingerprint()` 결과와 다른 경우
  - FE public `catalog-fingerprint.json`이 generated artifact와 다른 경우

주의:

- 이 단계로 FE public 산출물도 같은 catalog fingerprint를 직접 노출할 수 있게 됐다.
- BE/AI는 이미 `@trpg/srd-data`와 `srd-data/generated/srd/source_manifest.json`/`srd-engine/manifest.json`을 기준으로 fingerprint를 계산한다.
- 작업자 지침에 따라 `npm run verify:rule-data-sync`는 직접 실행하지 않았다. 사용자가 권장 검증 명령에서 실행해야 한다.

### 2026-06-29 21차 AI 평가 catalog fingerprint artifact 사용 고정

완료:

- `ai/scripts/evaluate_p0_ai_quality.py`가 SRD catalog fingerprint를 Python에서 별도 계산하지 않고 `srd-data/generated/srd/catalog-fingerprint.json` artifact를 직접 읽도록 변경했다.
- AI 평가 리포트의 `srdCatalog` 필드와 콘솔 출력 `srdCatalogFingerprint=...`가 FE public/BE verify와 같은 generated artifact를 기준으로 나오게 됐다.
- `verify:rule-data-sync`가 AI 평가 스크립트에 다음 경로가 유지되는지 정적으로 확인하도록 보강했다.
  - `catalog-fingerprint.json` artifact를 읽는 경로
  - `srdCatalogFingerprint=` 출력

주의:

- 기존 `ai/runtime_logs/p0_ai_quality_report.json`는 과거 실행 결과라 현재 artifact 기반 `srdCatalog` 필드를 포함하지 않을 수 있다.
- 작업자 지침에 따라 `npm run eval:ai-quality`는 직접 실행하지 않았다. 사용자가 AI 서비스를 띄운 뒤 권장 검증 명령에서 실행해야 최신 리포트가 갱신된다.

### 2026-06-29 22차 class spell list 원천 갭 감사

확인:

- 22차 당시 저장소의 class spell list 관련 실제 산출물은 `srd-data/generated/srd-engine/classes.jsonl`의 위저드 `mvpSpellList`뿐이었다.
  - `srd-data/generated/srd-engine/SCHEMA.md`도 현재 MVP 범위를 위저드 1레벨 주문 목록으로 설명한다.
  - `srd-data/generated/srd-engine/classes.jsonl`에는 class rule 4개가 있고, `mvpSpellList`를 가진 것은 `class.wizard` 1개다.
- `srd-data/generated/srd/spells.jsonl`과 `srd-data/generated/srd-engine/spells.jsonl`의 주문 레코드에는 `classLists`/`classList`/`classes` 같은 직업별 주문 목록 필드가 없다.
- `ai/translated/classes/*.md`와 generated class catalog에는 “드루이드 주문 목록에서 준비한다” 같은 규칙 설명과 spellcasting progression은 있지만, 전 직업/전 주문 class spell list 자체가 구조화되어 있지 않다.

보강:

- `verify:rule-data-sync` 출력에 `spellClassListCoverage`를 추가했다.
  - `engineClasses`: 현재 srd-engine class rule 수
  - `engineClassMvpSpellLists`: 현재 검증 가능한 MVP spell list 수
  - `generatedSpellClassListFields`: generated spell catalog에서 class list 필드를 가진 주문 수
- 22차 당시 `verify:rule-data-sync`가 `srd-data/generated/srd/spell-class-lists.json`을 선택적으로 검증하도록 보강했다.
  - 22차 당시에는 파일이 없으면 실패하지 않고 `spellClassListCoverage.artifact=missing`으로 출력했다.
  - 파일이 있으면 `schemaVersion: "srd-spell-class-lists-v1"`와 `classes` 객체를 검증한다.
  - class key는 generated class catalog와 shared spellcasting progression에 있어야 한다.
  - cantrip bucket은 level 0 주문만, level bucket은 해당 level 주문만 허용한다.
  - FE quick-create class별 spell pool은 해당 class spell list에 포함되어야 한다.
  - class entry, `cantrips`, `spellsByLevel`, level bucket이 잘못된 구조이면 명확한 메시지로 실패한다.
- `srd-data/scripts/verify-generated.mjs`도 같은 artifact가 생기면 package build 단계에서 기본 schema/id/level bucket을 검증한다.
  - package 단독 검증에서는 generated SRD class/spell catalog와의 정합성을 확인한다.
  - 잘못된 class entry 또는 bucket 구조도 package build 단계에서 실패한다.
  - shared progression 및 FE quick-create 부분집합 검증은 repo-level `verify:rule-data-sync`가 담당한다.
- 이 값은 22차 당시 full class-list 검증 가능 범위를 드러내는 진단 정보였으며, 당시에는 실패 조건이 아니었다.

22차 당시 완료로 보지 않은 이유:

- “이 주문이 이 직업 주문 목록에 속하는가”를 전 직업/전 주문 대상으로 검증하려면 먼저 canonical source가 필요하다.
- 필요한 다음 산출물은 예를 들어 `srd-data/generated/srd/spell-class-lists.json` 형태의 artifact다.
  - 형식 예시:
    ```json
    {
      "schemaVersion": "srd-spell-class-lists-v1",
      "classes": {
        "wizard": {
          "cantrips": ["spell.fire_bolt"],
          "spellsByLevel": {
            "1": ["spell.magic_missile"]
          }
        }
      }
    }
    ```
  - 모든 spell id는 generated spell catalog에 존재해야 한다.
  - 모든 class key는 generated class catalog와 shared spellcasting progression에 존재해야 한다.
  - 22차 당시 validator는 FE quick-create class별 spell pool이 이 artifact의 부분집합인지 검증했다.
  - BE runtime spell definitions는 class ownership 정보가 없으므로, 향후 runtime spell과 class spell list의 관계를 검증하려면 BE 쪽에도 spell owner/class context가 추가로 필요하다.
- 22차 당시 저장소에 이 source artifact가 없었으므로, full class-list 검증을 완료로 표시하지 않았다.

작업자 지침:

- 원천이 없는 class spell list를 코드에 추정값으로 직접 작성하지 않는다.
- SRD 원문 또는 신뢰 가능한 내부 추출물에서 class spell list를 구조화하는 generator가 먼저 추가되어야 한다.
- 작업자 지침에 따라 `npm run verify:rule-data-sync`는 직접 실행하지 않았다. 사용자가 권장 검증 명령에서 실행해야 한다.

후속 상태:

- 27~30차에서 `srd-data/sources/spell-class-lists.json`, generated artifact, FE public copy, 필수 검증, fingerprint 포함까지 추가해 이 원천 갭은 정적 구현 기준으로 해소했다.

### 2026-06-29 23차 canonical class feature summary 누락 제거

완료:

- `srd-data/overrides/class-feature-summaries.json`에 남아 있던 레벨별 증분/스케일링 class feature summary를 보강했다.
  - 예: `brutal_critical_2`, `song_of_rest_d10`, `destroy_undead_cr_1`, `seventh_level_spells`, `sorcery_points_10`.
- `srd-data/scripts/generate-canonical-artifacts.mjs`를 실행해 `srd-data/generated/srd/class-features.json`을 재생성했다.
- `scripts/sync-fe-static-srd.mjs`를 실행해 `fe/public/srd/class-features.json`도 같은 내용으로 동기화했다.
- `verify:rule-data-sync`에 canonical class feature summary coverage guard를 추가했다.
  - `summaryKo`가 비어 있는 canonical class feature가 있으면 실패한다.
  - 성공 출력에 `canonicalClassFeatureSummaries`와 `missingCanonicalClassFeatureSummaries`를 포함한다.
- `srd-data/scripts/verify-generated.mjs`에도 같은 summary coverage guard를 추가했다.
  - 이제 `npm run build -w @trpg/srd-data` 단계에서도 빈 class feature summary가 있으면 실패한다.
- `srd-data/scripts/verify-generated.mjs`가 `catalog-fingerprint.json` stale 여부도 직접 검증하게 했다.
  - generated fingerprint가 현재 `getSrdCatalogFingerprint()` 결과와 다르면 `@trpg/srd-data` build 단계에서 실패한다.

확인된 현재 상태:

```text
canonical class features total=339
missingSummaries=0
```

주의:

- 이 단계는 class feature 표시 summary 누락을 없앤 것이다.
- 23차 당시 class spell list 전체 원천 갭은 22차 항목에 남아 있었으며, 이 작업으로 해결된 것으로 보지 않았다.
- 작업자 지침에 따라 `npm run verify:rule-data-sync`는 직접 실행하지 않았다. 사용자가 권장 검증 명령에서 실행해야 한다.

### 2026-06-29 23차 당시 완료 감사

완료 정의별 23차 당시 판정:

| 완료 정의 | 23차 당시 판정 | 근거 | 남은 증거/작업 |
|---|---|---|---|
| FE/BE/AI가 같은 `srd-data` catalog version을 사용한다 | 부분 충족 | `catalog-fingerprint.json` artifact를 생성하고 FE public copy, AI 평가 스크립트, `verify:rule-data-sync`, `verify-generated`가 같은 fingerprint를 참조/검증한다. | 사용자가 `npm run verify:rule-data-sync`와 `npm run eval:ai-quality`를 실행해 최신 런타임 출력까지 확인해야 한다. |
| 직업/특성/주문/종족/장비/몬스터의 핵심 id가 canonical manifest로 통일된다 | 정적 구현 기준 충족, 명령 미실행 | class feature, FE spell pool, FE usable item, item labels, spell class list source/generated/public artifact, BE spell/monster runtime id, race runtime key/tag, seed/scenario id drift guard가 존재한다. BE executable SRD spell id가 canonical class spell list에 최소 1회 포함되는지도 검증한다. | 사용자가 전체 검증 명령을 실행해야 한다. 런타임에서 캐릭터별 known/prepared spell 상태까지 검증하는 것은 별도 플레이 규칙 검증 범위다. |
| FE 캐릭터 빌더에서 class feature fallback이 구조적으로 발생하지 않는다 | 정적 기준 충족, 런타임 미확인 | canonical class feature 339개 모두 `summaryKo`가 있고, `verify:rule-data-sync`가 레벨별 feature mapping과 summary coverage를 검사한다. | 사용자가 FE 빌드와 화면 확인 시나리오를 실행해야 한다. |
| BE RuleCatalog와 canonical class feature manifest가 drift 없이 검증된다 | 정적 기준 충족, 명령 미실행 | BE class feature id가 generated canonical class feature artifact에 없으면 `verify:rule-data-sync`에서 실패한다. BE RuleCatalog class feature 응답은 canonical name/summary와 합성된다. | 사용자가 `npm run verify:rule-data-sync`와 BE build/test를 실행해야 한다. |
| `verify:rule-data-sync`가 루트 script로 제공되고 실패 메시지가 actionable하다 | 구현됨, 명령 미실행 | root script와 상세 failure message가 존재하고, class/race/spell/item/monster/seed/AI/fingerprint drift guard가 포함된다. | 사용자가 실제 명령을 실행해 현재 환경에서 성공 여부를 확인해야 한다. |
| 문서에 “SRD 데이터 수정 경로”와 “수동 override 허용 범위”가 명시된다 | 충족 | `doc/rules/ARCHITECTURE_RULES.md`, `doc/README.md`, `doc/rules/README.md`, 본 문서에 generated artifact, override, sync/verify 경로가 기록되어 있다. | 최종 완료 시 최신 검증 출력 값을 본 문서에 갱신하면 좋다. |

23차 당시 최종 완료로 표시하지 않은 이유:

- `srd-data/sources/spell-class-lists.json`과 `srd-data/generated/srd/spell-class-lists.json`은 추가됐지만, 사용자 환경에서 `npm run verify:rule-data-sync` 등 전체 검증 명령이 아직 실행되지 않았다.
- BE runtime executable spell id와 canonical class spell list 사이의 membership 정적 검증은 추가됐지만, 사용자 실행 결과가 아직 없다.
- 작업자 지침에 따라 `npm run verify:rule-data-sync`, FE/BE/shared build, AI 평가 명령을 직접 실행하지 않았으므로 명령 결과 기반 완료 증거가 없다.

### 2026-06-29 24차 Phase 1 실제 구현 구조 반영

완료:

- Phase 1의 `srd-data/src/*.ts` 중심 예시를 현재 구현 구조에 맞게 갱신했다.
- 현재 기준 구조를 다음과 같이 명시했다.
  - package root export: `srd-data/index.mjs`, `srd-data/index.d.ts`
  - generated subpath export: `@trpg/srd-data/generated/srd/*`, `@trpg/srd-data/generated/srd-engine/*`
  - canonical artifact generator: `srd-data/scripts/generate-canonical-artifacts.mjs`
  - generated verifier: `srd-data/scripts/verify-generated.mjs`
- 완료 기준도 “typed TS source 생성”이 아니라 “canonical artifact 생성 + generated asset 검증 + FE/BE 사용 경로” 기준으로 갱신했다.

주의:

- 과거 진행 기록의 `srd-data/src/*.ts` 언급은 당시 계획/감사 맥락으로 남아 있다.
- 현재 이후 작업 기준은 Phase 1의 갱신된 `index.mjs`/generated artifact 구조다.

### 2026-06-29 25차 당시 선택형 class spell list API 계약 보강

완료:

- `@trpg/srd-data` 루트 API에 `getSrdSpellClassLists()`를 추가했다.
- 25차 당시 이 함수는 `srd-data/generated/srd/spell-class-lists.json`이 있으면 해당 JSON을 반환하고, 아직 원천 artifact가 없으면 `null`을 반환했다.
- `srd-data/index.d.ts`에 `SrdSpellClassLists` 타입을 추가해 향후 FE/BE/AI가 같은 계약으로 class spell list artifact를 소비할 수 있게 했다.

주의:

- 이 단계 자체는 full class spell list 원천을 만든 것이 아니었다.
- 27~30차에서 `srd-data/sources/spell-class-lists.json`, generated artifact, FE public copy, 필수 검증이 추가됐다.
- 이 API는 원천 artifact가 추가되는 순간 소비 경로와 타입 계약을 고정하기 위한 준비 작업이었다.
- 후속 상태: 33차에서 `spell-class-lists.json` 필수 artifact 정책에 맞춰 non-null API 계약으로 전환했다.

### 2026-06-29 26차 class spell list source contract 및 generator 연결

완료:

- `srd-data/sources/README.md`를 추가해 `spell-class-lists.json` 입력 원천의 위치와 구조를 문서화했다.
- 26차 당시에는 `srd-data/scripts/generate-canonical-artifacts.mjs`가 `srd-data/sources/spell-class-lists.json`이 존재할 때만 `srd-data/generated/srd/spell-class-lists.json`을 생성하도록 연결했다.
- generator는 source를 복사하기 전에 다음을 검사한다.
  - `schemaVersion: "srd-spell-class-lists-v1"`
  - class key가 generated SRD class catalog에 존재하는지
  - spell id가 generated SRD spell catalog에 존재하는지
  - `cantrips`에는 0레벨 주문만 들어가는지
  - `spellsByLevel` bucket이 1~9레벨이고 실제 주문 레벨과 일치하는지
  - class별 중복 spell id가 없는지
- `srd-data/scripts/verify-generated.mjs`와 `verify:rule-data-sync`가 source/generated 동반성과 동일성을 확인하도록 보강했다.
  - source 없이 generated artifact만 남아 있으면 실패한다.
  - source가 있는데 generated artifact가 없으면 실패한다.
  - source와 generated artifact가 다르면 실패한다.

주의:

- 이 단계 자체는 실제 full class spell list 데이터를 작성한 것이 아니었다.
- 27차에서 D&D 5e API 2014 SRD spell endpoint 기반 source를 materialize했다.
- 30차에서 class spell list를 필수 canonical artifact로 승격했다.
- 34차에서 generator도 source를 필수로 읽도록 바뀌었다.

### 2026-06-29 27차 spell class list source materialize

완료:

- `srd-data/scripts/import-spell-class-lists-from-dnd5eapi.mjs`를 추가했다.
  - D&D 5e API 2014 SRD spell endpoint에서 319개 spell detail을 가져온다.
  - API spell index를 local `spell.*` id로 변환한다.
  - local `srd-data/generated/srd/spells.jsonl`의 319개 spell id와 level을 대조한다.
  - mismatched/missing spell이 있으면 source 파일을 쓰지 않고 실패한다.
  - source metadata에는 실행 시각 대신 API detail의 `externalUpdatedAtMax`를 기록해 같은 외부 데이터에 대해 재실행해도 파일 hash가 흔들리지 않게 했다.
- `npm run import:spell-class-lists -w @trpg/srd-data` script를 추가했다.
- importer를 실행해 `srd-data/sources/spell-class-lists.json`을 생성했다.
- `srd-data/scripts/generate-canonical-artifacts.mjs`를 실행해 `srd-data/generated/srd/spell-class-lists.json`을 생성했다.
- `scripts/sync-fe-static-srd.mjs`가 generated `spell-class-lists.json`을 `fe/public/srd/spell-class-lists.json`으로 복사하도록 보강했고, sync를 실행했다.
- `verify:rule-data-sync`의 FE public SRD sync 검증에 `spell-class-lists.json`을 포함했다.

확인된 현재 상태:

```text
D&D 5e API 2014 SRD spell endpoint count = 319
local generated SRD spell catalog count = 319
srd-data/sources/spell-class-lists.json exists
srd-data/generated/srd/spell-class-lists.json exists
fe/public/srd/spell-class-lists.json exists
spell-class-lists importer rerun hash stable = true
```

주의:

- 외부 원천은 `https://www.dnd5eapi.co/api/2014/spells`의 SRD-derived machine-readable data다.
- 작업자 지침에 따라 `npm run verify:rule-data-sync`, FE/BE/shared build, AI 평가 명령은 직접 실행하지 않았다.
- runtime executable spell id와 class spell list의 최소 membership 관계는 28차에서 검증하도록 보강했다.
- 캐릭터별 known/prepared spell, subclass expanded spell, magical secrets 같은 실제 사용 가능성 판정은 별도 런타임 규칙 검증 범위다.

### 2026-06-29 28차 BE executable spell class-list membership guard

완료:

- `verify:rule-data-sync`가 BE executable SRD spell id를 canonical class spell list와 대조하도록 보강했다.
- 검증 조건:
  - BE runtime spell id가 generated SRD spell catalog에 존재하는 SRD 주문이면, `srd-data/generated/srd/spell-class-lists.json`의 어떤 class list 안에는 반드시 포함되어야 한다.
  - explicit non-SRD allowlist에 있는 runtime spell id는 기존처럼 SRD class spell list membership 대상에서 제외된다.
- 성공 출력에 `executableSrdSpellClassListCoveredIds`를 추가했다.

확인된 현재 상태:

```text
BE runtime spell ids parsed for narrow membership check = 220
SRD runtime spell ids missing from class spell lists = 0
allowed non-SRD runtime spell ids = 10
```

주의:

- 이 검증은 “BE가 실행 가능한 SRD spell id를 canonical class spell list 밖에서 임의로 쓰지 않는다”를 보장한다.
- 캐릭터별 known/prepared spell 상태, subclass expanded spell, magical secrets 같은 플레이 중 주문 사용 가능성 판정은 별도 런타임 규칙 검증 범위다.
- 작업자 지침에 따라 전체 `npm run verify:rule-data-sync`는 직접 실행하지 않았다.

### 2026-06-29 29차 catalog fingerprint canonical supplement 포함

완료:

- `getSrdCatalogFingerprint()` 계산 대상에 canonical 보조 artifact를 추가했다.
  - `srd-data/generated/srd/class-features.json`
  - `srd-data/generated/srd/spell-class-lists.json`
- `srd-data/scripts/generate-canonical-artifacts.mjs`를 다시 실행해 `srd-data/generated/srd/catalog-fingerprint.json`을 갱신했다.
- `scripts/sync-fe-static-srd.mjs`를 다시 실행해 `fe/public/srd/catalog-fingerprint.json`도 같은 fingerprint로 동기화했다.

확인된 현재 상태:

```text
catalog fingerprint sha256 = aec5f4f17f06d220894ebe548db2d26021510308b5b5857f26441363769ee7de
catalog fingerprint files = 15
catalog fingerprint includes class-features.json = true
catalog fingerprint includes spell-class-lists.json = true
generated catalog-fingerprint.json equals FE public copy = true
```

효과:

- class feature canonical manifest나 spell class list가 바뀌면 catalog fingerprint도 바뀐다.
- FE/BE/AI가 참조하는 catalog version이 새 canonical artifact 변화까지 반영한다.

후속 상태:

- 38차에서 FE 운영용 보조 artifact인 `fe-spell-pools.json`, `fe-usable-items.json`, `item-labels.json`도 fingerprint 계산 대상에 포함했다.

### 2026-06-29 30차 spell class list 필수 artifact 승격

완료:

- `srd-data/scripts/verify-generated.mjs`의 required generated file 목록에 `spell-class-lists.json`을 추가했다.
- `scripts/sync-fe-static-srd.mjs`가 `spell-class-lists.json`을 선택 복사가 아니라 필수 복사로 처리하도록 변경했다.
- `verify:rule-data-sync`의 FE public sync 검증도 `spell-class-lists.json`을 항상 비교하도록 변경했다.
- `verify:rule-data-sync`의 spell progression/class-list 검증 경로가 generated/source `spell-class-lists.json`을 필수로 읽도록 변경했다.

효과:

- `spell-class-lists.json`이 사라지면 package generated verification, FE sync, repo-level sync verification이 실패한다.
- class spell list는 더 이상 “있으면 검증하는 선택 artifact”가 아니라 SRD canonical artifact set의 일부다.

### 2026-06-29 31차 최신 완료 감사

완료 정의별 최신 판정:

| 완료 정의 | 최신 판정 | 현재 근거 | 남은 완료 증거 |
|---|---|---|---|
| FE/BE/AI가 같은 `srd-data` catalog version을 사용한다 | 정적 구현 기준 충족, 실행 결과 미확인 | `srd-data/generated/srd/catalog-fingerprint.json`과 `fe/public/srd/catalog-fingerprint.json`이 존재하고, fingerprint 계산 대상에 `class-features.json`, `spell-class-lists.json`, `fe-spell-pools.json`, `fe-usable-items.json`, `item-labels.json`이 포함된다. `verify:rule-data-sync`와 AI 평가 스크립트가 catalog fingerprint를 참조한다. | 사용자 환경에서 `npm run verify:rule-data-sync`와 AI 평가 명령을 실행해 최신 로그의 catalog version을 확인해야 한다. |
| 직업/특성/주문/종족/장비/몬스터의 핵심 id가 canonical manifest로 통일된다 | 정적 구현 기준 충족, 실행 결과 미확인 | generated canonical artifact, FE public sync artifact, source/generated/public spell class list, BE spell/monster/item/race/seed drift guard가 존재한다. `spell-class-lists.json`은 필수 artifact로 승격됐다. | 사용자 환경에서 `npm run build -w @trpg/srd-data`, `npm run sync:fe:srd`, `npm run verify:rule-data-sync`를 실행해야 한다. |
| FE 캐릭터 빌더에서 class feature fallback이 구조적으로 발생하지 않는다 | 정적 구현 기준 충족, UI 미확인 | `class-features.json`에 canonical `summaryKo`가 있고, FE character feature display 경로가 canonical summary를 우선 사용한다. verifier가 빈 `summaryKo`와 FE fallback drift를 검사한다. | 사용자 환경에서 FE build와 캐릭터 생성 화면 확인 시나리오를 실행해야 한다. |
| BE RuleCatalog와 canonical class feature manifest가 drift 없이 검증된다 | 정적 구현 기준 충족, 실행 결과 미확인 | `RuleCatalogService`가 `@trpg/srd-data/generated/srd/class-features.json`을 import하고, runtime override id가 canonical manifest에 없으면 실패한다. `verify:rule-data-sync`도 BE class feature id를 검사한다. | 사용자 환경에서 `npm run verify:rule-data-sync`와 BE build/test를 실행해야 한다. |
| `verify:rule-data-sync`가 루트 script로 제공되고 실패 메시지가 actionable하다 | 구현됨, 실행 결과 미확인 | 루트 `package.json`에 `verify:rule-data-sync`가 있고, verifier는 FE sync, generated stale artifact, class/race/spell/item/monster/seed/AI/fingerprint drift를 구체적인 메시지로 실패시킨다. | 사용자 환경에서 실제 명령을 실행해 현재 checkout에서 성공하는지 확인해야 한다. |
| 문서에 “SRD 데이터 수정 경로”와 “수동 override 허용 범위”가 명시된다 | 충족 | `doc/rules/ARCHITECTURE_RULES.md`, `doc/README.md`, `doc/future_plan.md`, 본 문서가 `srd-data` source/generated artifact, importer, FE sync, verifier, override 경계를 설명한다. | 최종 검증 명령 결과를 이 문서에 추가하면 운영 기록이 완성된다. |

현재 goal 관점의 결론:

- 구현과 문서화는 최종 완료 정의를 검증할 수 있는 정적 구현 기준으로 정리된 상태다.
- 다만 프로젝트 지침상 작업자가 테스트/빌드 명령을 직접 실행하지 않으므로, 명령 결과 기반 완료 증거는 아직 없다.
- 따라서 이 계획을 최종 완료로 닫으려면 사용자가 아래 검증 계획의 명령을 실행하고, 성공 결과를 본 문서에 기록해야 한다.

### 2026-06-29 32차 spell class list 필수 검증 표현 정리

완료:

- `scripts/verify-rule-data-sync.mjs`의 spell class list artifact 검증 함수명을 `verifyOptionalSpellClassListArtifact`에서 `verifySpellClassListArtifact`로 변경했다.
- `srd-data/scripts/verify-generated.mjs`에서 generated `spell-class-lists.json`을 optional read가 아니라 required read로 정리했다.
- package verifier에서 source/generated 동반성 검증도 “generated는 required file, source는 required backing source”라는 현재 구조에 맞게 단순화했다.

확인:

```text
node --check scripts/verify-rule-data-sync.mjs
node --check srd-data/scripts/verify-generated.mjs
```

두 명령 모두 문법 오류 없이 통과했다.

효과:

- 30차에서 `spell-class-lists.json`을 필수 canonical artifact로 승격한 정책과 verifier 코드 표현이 일치한다.
- class spell list가 선택 artifact처럼 보이는 과거 흔적을 줄였다.

### 2026-06-29 33차 spell class list API 필수 계약 전환

완료:

- `@trpg/srd-data`의 `getSrdSpellClassLists()`가 더 이상 optional JSON read를 사용하지 않고, generated `spell-class-lists.json`을 필수 artifact로 읽도록 변경했다.
- `srd-data/index.d.ts`의 반환 타입을 `Promise<SrdSpellClassLists | null>`에서 `Promise<SrdSpellClassLists>`로 변경했다.

확인:

```text
node --check srd-data/index.mjs
```

문법 오류 없이 통과했다.

효과:

- `spell-class-lists.json`이 필수 canonical artifact라는 30차 이후 정책과 package public API 계약이 일치한다.
- FE/BE/AI가 이 helper를 사용할 때 “없을 수 있음”을 전제로 한 분기 없이 같은 artifact를 소비할 수 있다.

### 2026-06-29 34차 spell class list generator 필수 source 전환

완료:

- `srd-data/scripts/generate-canonical-artifacts.mjs`가 `srd-data/sources/spell-class-lists.json`을 optional source가 아니라 필수 source로 읽도록 변경했다.
- `readOptionalJson()` 보조 함수를 제거했다.
- `spell-class-lists.json` 생성도 source가 있을 때만 쓰는 분기에서, source를 검증한 뒤 항상 generated artifact로 쓰는 흐름으로 단순화했다.

확인:

```text
node --check srd-data/scripts/generate-canonical-artifacts.mjs
```

문법 오류 없이 통과했다.

효과:

- generator, package verifier, repo verifier, public API가 모두 `spell-class-lists.json`을 필수 canonical artifact로 다룬다.
- source가 없는 상태에서 generated artifact만 우연히 남는 흐름을 줄였다.

### 2026-06-29 35차 spell class list source 문서 필수 정책 반영

완료:

- `srd-data/sources/README.md`의 `spell-class-lists.json` 설명을 최신 필수 source 정책에 맞게 수정했다.
- “source가 있을 때만 generated artifact를 쓴다”는 과거 설명을 제거하고, source가 없거나 유효하지 않으면 `npm run build -w @trpg/srd-data`가 실패한다고 명시했다.
- 26차 진행 기록의 선택형 generator 설명도 “26차 당시” 표현으로 분리하고, 34차에서 필수 source 읽기로 바뀌었음을 덧붙였다.

확인:

```text
git diff --check -- srd-data/sources/README.md
```

공백 오류 없이 통과했다.

효과:

- source 문서, generator, verifier, package API가 모두 `spell-class-lists.json`을 필수 canonical source/artifact로 설명한다.

### 2026-06-29 36차 override 입력 허용 범위 문서화

완료:

- `srd-data/overrides/README.md`를 추가했다.
- 각 override source의 역할과 허용 범위를 문서화했다.
  - `class-feature-summaries.json`
  - `fe-spell-pools.json`
  - `fe-usable-items.json`
  - `non-srd-spell-runtime-ids.json`
  - `non-srd-monster-runtime-ids.json`
- FE-only override는 presentation/UX selection pool로 제한하고, BE runtime metadata는 canonical id 또는 explicit non-SRD allowlist와 검증으로 관리한다고 명시했다.
- `doc/rules/ARCHITECTURE_RULES.md`에서 id 기반 보강 입력은 `srd-data/overrides/README.md`의 허용 범위 안에서만 추가한다고 연결했다.

효과:

- 완료 정의의 “수동 override 허용 범위”가 상위 아키텍처 규칙뿐 아니라 실제 override source 디렉터리에도 파일 단위로 고정된다.
- 새 개발자가 generated SRD 데이터 대신 FE/BE에 id/name/level/description을 다시 쓰는 일을 줄일 수 있다.

### 2026-06-29 37차 repo verifier 필수 source 흐름 단순화

완료:

- `scripts/verify-rule-data-sync.mjs`의 spell class list source/generated 검증에서 도달 불가능한 missing 분기를 제거했다.
- `readJson('srd-data/generated/srd/spell-class-lists.json')`와 `readJson('srd-data/sources/spell-class-lists.json')`가 이미 필수 read이므로, repo verifier는 두 payload의 동기화 여부만 비교하도록 단순화했다.

확인:

```text
node --check scripts/verify-rule-data-sync.mjs
```

문법 오류 없이 통과했다.

효과:

- repo-level verifier도 `spell-class-lists.json` 필수 artifact/source 정책과 같은 흐름으로 읽힌다.
- missing 파일은 JSON read 단계에서 즉시 실패하고, 존재하지만 내용이 다르면 drift 메시지로 실패한다.

### 2026-06-29 38차 catalog fingerprint FE 보조 artifact 포함

완료:

- `getSrdCatalogFingerprint()`의 계산 대상에 FE 운영용 canonical 보조 artifact를 추가했다.
  - `srd-data/generated/srd/fe-spell-pools.json`
  - `srd-data/generated/srd/fe-usable-items.json`
  - `srd-data/generated/srd/item-labels.json`
- `srd-data/scripts/generate-canonical-artifacts.mjs`를 실행해 `srd-data/generated/srd/catalog-fingerprint.json`을 재생성했다.
- `scripts/sync-fe-static-srd.mjs`를 실행해 `fe/public/srd/catalog-fingerprint.json`을 다시 동기화했다.

확인된 현재 상태:

```text
catalog fingerprint sha256 = 73546faa72845a37a74aafb98b84f939e958eb991825db7f383b73851296268e
catalog fingerprint files = 18
catalog fingerprint includes fe-spell-pools.json = true
catalog fingerprint includes fe-usable-items.json = true
catalog fingerprint includes item-labels.json = true
generated catalog-fingerprint.json equals FE public copy = true
```

효과:

- FE가 실제로 사용하는 spell pool, direct-use item pool, item label artifact 변화도 catalog version 변화로 드러난다.
- FE/BE/AI가 같은 catalog version을 사용한다는 완료 정의의 정적 근거가 더 넓어졌다.

### 2026-06-29 39차 catalog fingerprint 필수 파일 guard 추가

완료:

- `scripts/verify-rule-data-sync.mjs`에 catalog fingerprint 필수 파일 목록 guard를 추가했다.
- `srd-data/scripts/verify-generated.mjs`에도 같은 필수 파일 목록 guard를 추가했다.
- 필수 목록에는 SRD core catalog, canonical 보조 artifact, FE 운영용 보조 artifact, srd-engine catalog가 포함된다.

확인:

```text
node --check scripts/verify-rule-data-sync.mjs
node --check srd-data/scripts/verify-generated.mjs
```

두 명령 모두 문법 오류 없이 통과했다.

효과:

- 누군가 `getSrdCatalogFingerprint()` 계산 대상에서 `fe-spell-pools.json`, `fe-usable-items.json`, `item-labels.json` 같은 필수 artifact를 실수로 빼면 verifier가 명확한 메시지로 실패한다.
- “FE/BE/AI가 같은 catalog version을 사용한다”는 완료 정의가 단순 hash stale 비교를 넘어, 의도한 파일 집합까지 검증한다.

### 2026-06-29 40차 catalog fingerprint 파일 목록 단일화

완료:

- `@trpg/srd-data`에 `SRD_CATALOG_FINGERPRINT_FILES` export를 추가했다.
- `getSrdCatalogFingerprint()`가 이 export를 기준으로 fingerprint를 계산하도록 변경했다.
- `scripts/verify-rule-data-sync.mjs`와 `srd-data/scripts/verify-generated.mjs`의 필수 파일 guard도 같은 export를 사용하도록 변경했다.

확인:

```text
node --check srd-data/index.mjs
node --check scripts/verify-rule-data-sync.mjs
node --check srd-data/scripts/verify-generated.mjs
current getSrdCatalogFingerprint() equals srd-data/generated/srd/catalog-fingerprint.json = true
fingerprint files = 18
```

효과:

- fingerprint 계산 대상과 verifier의 필수 파일 목록이 한 곳에서 관리된다.
- catalog version 파일 집합을 수정할 때 계산 함수와 guard가 서로 어긋날 가능성이 줄어든다.

### 2026-06-29 41차 srd-data package files 범위 보강

완료:

- `srd-data/package.json`의 `files` 목록에 build/source 입력 디렉터리를 추가했다.
  - `overrides`
  - `scripts`
  - `sources`
- 기존 `generated`, `index.mjs`, `index.d.ts`는 유지했다.

확인:

```text
node -e "JSON.parse(require('fs').readFileSync('srd-data/package.json','utf8')); console.log('ok')"
```

JSON 문법 오류 없이 통과했다.

효과:

- `@trpg/srd-data` package 경계가 generated 소비물뿐 아니라 canonical artifact 생성에 필요한 source/script 입력까지 포함한다고 명시한다.
- private workspace에서는 로컬 symlink로 전체 디렉터리를 보지만, package metadata도 shared data package 의도와 더 잘 맞는다.

### 2026-06-29 42차 optional helper 잔여 정리

완료:

- `scripts/verify-rule-data-sync.mjs`에서 더 이상 쓰지 않는 `tryReadJson` helper를 제거했다.
- `srd-data/index.mjs`에서 더 이상 쓰지 않는 `readOptionalJson` helper를 제거했다.
- `srd-data/scripts/verify-generated.mjs`에서 spell class list source를 필수 입력으로 읽도록 정리하고, 남은 `readOptionalJson` helper와 unreachable missing-source 분기를 제거했다.

확인:

```text
node --check srd-data/index.mjs
node --check scripts/verify-rule-data-sync.mjs
node --check srd-data/scripts/verify-generated.mjs
rg -n "tryReadJson|readOptionalJson" scripts/verify-rule-data-sync.mjs srd-data/index.mjs srd-data/scripts/verify-generated.mjs
```

세 `node --check`는 모두 통과했고, `rg`는 잔여 참조를 찾지 못했다.

효과:

- spell class list source/generated artifact가 선택 입력처럼 보이는 흔적을 제거했다.
- “없으면 조용히 건너뛰는” 코드 경로가 줄어들어 verifier와 loader의 실패 방식이 계획의 단일 원천 정책과 더 잘 맞는다.

### 2026-06-29 43차 최신 정적 동기화 증거 갱신

확인:

```text
source/generated/FE public spell-class-lists synced = true
generated/FE public catalog-fingerprint synced = true
computed catalog fingerprint matches generated artifact = true
catalog fingerprint files = 18
exported fingerprint file list = 18
root verify:rule-data-sync script = node scripts/verify-rule-data-sync.mjs
git diff --check = whitespace error 없음, CRLF 경고만 있음
```

현재 판정:

- `spell-class-lists.json`은 source, generated artifact, FE public copy가 같은 내용이다.
- `catalog-fingerprint.json`은 generated artifact와 FE public copy가 같은 내용이며, `@trpg/srd-data`의 현재 계산 결과와도 일치한다.
- fingerprint 대상 파일 목록은 `SRD_CATALOG_FINGERPRINT_FILES` export와 generated artifact가 모두 18개로 일치한다.
- 루트 `verify:rule-data-sync` script는 존재한다.

남은 완료 증거:

- 프로젝트 지침상 작업자가 테스트/빌드 명령을 직접 실행하지 않았으므로, 아래 검증 계획의 npm 명령 성공 결과는 아직 없다.
- 따라서 구현과 문서화는 완료 정의를 검증 가능한 상태까지 정리됐지만, goal을 최종 완료로 닫으려면 사용자 실행 결과가 필요하다.

### 2026-06-29 44차 검증 명령 script 정합성 확인

확인:

- 루트 `package.json`에 다음 검증/동기화 script가 존재한다.
  - `sync:fe:srd`: `node scripts/sync-fe-static-srd.mjs`
  - `verify:rule-data-sync`: `node scripts/verify-rule-data-sync.mjs`
  - `eval:ai-quality`: `npm run eval:ai-quality -w @trpg/be`
- `srd-data/package.json`의 `build` script는 canonical artifact 생성 후 package verifier를 실행한다.
  - `node scripts/generate-canonical-artifacts.mjs && node scripts/verify-generated.mjs`
- `scripts/sync-fe-static-srd.mjs`는 다음 canonical 보조 artifact를 FE public으로 복사한다.
  - `class-features.json`
  - `fe-spell-pools.json`
  - `fe-usable-items.json`
  - `item-labels.json`
  - `catalog-fingerprint.json`
  - `spell-class-lists.json`
- `scripts/verify-rule-data-sync.mjs`의 FE public sync 검증은 위 artifact들을 포함한다.

효과:

- 아래 검증 계획의 명령들이 실제 package script와 연결되어 있음을 확인했다.
- FE public 배포용 복사본이 source/generated artifact와 어긋나는 경우 `verify:rule-data-sync`에서 실패하는 경로가 존재한다.

### 2026-06-29 45차 srd-data 공개 API 선언 정합성 확인

확인:

```text
runtime exports = 28
index.d.ts declared exports = 28
missing declarations = []
extra declarations = []
```

현재 판정:

- `srd-data/index.mjs`의 런타임 export와 `srd-data/index.d.ts`의 공개 선언 export가 일치한다.
- `getSrdSpellClassLists()`와 `SRD_CATALOG_FINGERPRINT_FILES`도 타입 선언에 포함되어 있다.

효과:

- FE/BE/AI 또는 verifier가 `@trpg/srd-data` 공개 API를 사용할 때 런타임 export와 타입 선언이 어긋나는 문제가 없다.
- canonical artifact를 소비하는 package 경계가 구현과 타입 양쪽에서 같은 형태로 노출된다.

### 2026-06-29 46차 generated subpath package 경계 확인

확인:

- `srd-data/package.json`의 `exports`가 generated artifact subpath를 노출한다.
  - `./generated/srd/*`
  - `./generated/srd-engine/*`
- 현재 코드에서 `@trpg/srd-data/generated/srd/*`를 직접 import하는 경로는 세 곳이다.
  - `be/src/modules/rules/rule-catalog.service.ts`: `class-features.json`
  - `fe/src/features/sessionPlay/utils/executableItems.ts`: `fe-usable-items.json`
  - `fe/src/features/sessionPlay/utils/displayNames.ts`: `item-labels.json`
- TypeScript 설정은 JSON module import를 허용한다.
  - `tsconfig.base.json`: `resolveJsonModule: true`
  - `fe/tsconfig.json`: `resolveJsonModule: true`
- Node ESM subpath import smoke 확인:
  - `@trpg/srd-data/generated/srd/class-features.json` import 가능, 339개 class feature 확인
  - `@trpg/srd-data/generated/srd/catalog-fingerprint.json` import 가능, fingerprint 파일 18개 확인

효과:

- BE/FE가 generated SRD JSON을 package subpath로 소비하는 현재 구조가 package metadata와 맞는다.
- generated artifact를 workspace package 바깥에서 직접 상대 경로로 읽는 방식보다 package 경계가 명확하다.

### 2026-06-29 47차 FE public 보조 artifact 전체 동기화 확인

확인:

```text
class-features.json synced = true
fe-spell-pools.json synced = true
fe-usable-items.json synced = true
item-labels.json synced = true
catalog-fingerprint.json synced = true
spell-class-lists.json synced = true
canonical class features = 339
missing class feature summaryKo = 0
spell-class-lists schemaVersion = srd-spell-class-lists-v1
spell-class-lists classes = 8
spell-class-lists spell refs = 778
```

현재 판정:

- FE public의 canonical 보조 artifact 6개는 `srd-data/generated/srd`와 byte-level로 일치한다.
- canonical class feature manifest에는 `summaryKo` 누락이 없다.
- spell class list artifact는 필수 schema version을 가지고 있고, 8개 주문사용 직업의 주문 참조를 포함한다.

효과:

- FE가 사용하는 public SRD 보조 데이터가 generated canonical artifact와 어긋나지 않는다는 정적 증거가 보강됐다.
- class feature fallback 제거와 직업별 주문 목록 원천화의 현재 artifact 상태를 숫자로 확인할 수 있다.

### 2026-06-29 48차 완료 정의별 최신 정적 감사

완료 정의별 최신 판정:

| 완료 정의 | 현재 판정 | 현재 정적 증거 | 아직 필요한 사용자 실행 증거 |
|---|---|---|---|
| FE/BE/AI가 같은 `srd-data` catalog version을 사용한다 | 정적 구현 기준 충족, 실행 결과 미확인 | generated/FE public `catalog-fingerprint.json`이 일치하고, 현재 계산한 fingerprint도 generated artifact와 일치한다. fingerprint 대상은 `SRD_CATALOG_FINGERPRINT_FILES` 18개와 일치한다. AI 평가 스크립트는 generated `catalog-fingerprint.json`을 읽는다. | `npm run verify:rule-data-sync`, `npm run eval:ai-quality` 실행 결과 |
| 직업/특성/주문/종족/장비/몬스터의 핵심 id가 canonical manifest로 통일된다 | 정적 구현 기준 충족, 실행 결과 미확인 | canonical generated artifact와 FE public 보조 artifact 6개가 byte-level로 일치한다. `verify:rule-data-sync`는 class/race/spell/item/monster/seed/AI/fingerprint drift를 검사한다. | `npm run build -w @trpg/srd-data`, `npm run sync:fe:srd`, `npm run verify:rule-data-sync` 실행 결과 |
| FE 캐릭터 빌더에서 class feature fallback이 구조적으로 발생하지 않는다 | 정적 구현 기준 충족, UI 미확인 | canonical class feature 339개 모두 `summaryKo`가 있다. FE class feature 표시 경로는 canonical summary를 우선 사용하고, verifier는 빈 `summaryKo`와 중복/누락 presentation override를 검사한다. | `npm run build -w @trpg/fe` 및 사용자 화면 확인 시나리오 |
| BE RuleCatalog와 canonical class feature manifest가 drift 없이 검증된다 | 정적 구현 기준 충족, 실행 결과 미확인 | BE `RuleCatalogService`가 `@trpg/srd-data/generated/srd/class-features.json`을 import한다. package subpath export와 JSON module 설정이 존재한다. verifier는 BE class feature id와 canonical manifest drift를 검사한다. | `npm run verify:rule-data-sync`, `npm run build -w @trpg/be` 실행 결과 |
| `verify:rule-data-sync`가 루트 script로 제공되고, 실패 메시지가 actionable하다 | 구현됨, 실행 결과 미확인 | 루트 `package.json`의 `verify:rule-data-sync`는 `node scripts/verify-rule-data-sync.mjs`다. 스크립트 문법 확인은 통과했고, stale/generated/FE sync drift 실패 메시지가 구체적이다. | `npm run verify:rule-data-sync` 실행 결과 |
| 문서에 “SRD 데이터 수정 경로”와 “수동 override 허용 범위”가 명시된다 | 충족 | `doc/rules/ARCHITECTURE_RULES.md`, `srd-data/sources/README.md`, `srd-data/overrides/README.md`, 본 문서가 source/generated/importer/sync/verify/override 경계를 설명한다. | 최종 명령 성공 결과를 본 문서에 기록 |

현재 goal 관점의 결론:

- 현재 worktree는 완료 정의를 검증 가능한 상태까지 정리한 것으로 판단된다.
- 다만 프로젝트 지침상 작업자가 테스트/빌드/verify/eval 명령을 직접 실행하지 않았으므로, goal 최종 완료 처리는 아직 하지 않는다.
- 사용자가 아래 검증 계획의 명령을 실행해 성공 결과를 제공하면, 해당 결과를 본 문서에 기록한 뒤 goal 완료 여부를 다시 판단한다.

### 2026-06-29 49차 source/override 입력 경계 정합성 확인

확인:

```text
override json files match documented allowlist = true
source json files match documented source set = true
override/source json parse = ok
```

현재 override JSON 파일:

- `class-feature-summaries.json`
- `fe-spell-pools.json`
- `fe-usable-items.json`
- `non-srd-monster-runtime-ids.json`
- `non-srd-spell-runtime-ids.json`

현재 source JSON 파일:

- `spell-class-lists.json`

효과:

- `srd-data/overrides/README.md`에 적은 수동 override 허용 범위와 실제 override 파일 집합이 일치한다.
- `srd-data/sources/README.md`에 적은 structured source 입력 집합과 실제 source 파일 집합이 일치한다.
- 완료 정의의 “SRD 데이터 수정 경로”와 “수동 override 허용 범위”가 문서뿐 아니라 실제 디렉터리 구조와도 맞는다.

## 검증 계획

직접 테스트 명령은 작업자가 실행하지 않고 사용자에게 안내한다.

권장 검증 명령:

```bash
npm run build -w @trpg/srd-data
npm run sync:fe:srd
npm run verify:rule-data-sync
npm run build -w @trpg/shared-types
npm run build -w @trpg/be
npm run build -w @trpg/fe
npm run eval:ai-quality
```

사용자 확인 시나리오:

- 바드 3/5레벨 특성 설명이 fallback 없이 표시된다.
- 클레릭 `신성 변환 1/휴식`, `언데드 파괴 CR 1/2`가 깨지지 않는다.
- 12개 직업 전체의 레벨별 특성 타임라인에 “자동 획득했거나 선택한 캐릭터 특성입니다.” fallback이 보이지 않는다.
- FE에서 선택한 주문/종족/하위종족/장비가 BE에서 같은 id로 검증된다.
- AI 평가 로그에서 동일한 SRD catalog version이 출력된다.

주의:

- `npm run eval:ai-quality`는 AI 평가 환경과 필요한 서비스/환경변수가 준비된 상태에서 실행한다.

검증 결과 기록 양식:

```text
검증 일시:
실행 환경:

[ ] npm run build -w @trpg/srd-data
    결과:
    주요 출력:

[ ] npm run sync:fe:srd
    결과:
    주요 출력:

[ ] npm run verify:rule-data-sync
    결과:
    주요 출력:
    확인할 값:
      - catalogFingerprint=
      - missingCanonicalClassFeatureSummaries=0
      - spellClassListCoverage.artifact=present

[ ] npm run build -w @trpg/shared-types
    결과:
    주요 출력:

[ ] npm run build -w @trpg/be
    결과:
    주요 출력:

[ ] npm run build -w @trpg/fe
    결과:
    주요 출력:

[ ] npm run eval:ai-quality
    결과:
    주요 출력:
    확인할 값:
      - srdCatalogFingerprint=

수동 화면 확인:
[ ] 바드 3/5레벨 특성 설명 fallback 없음
[ ] 클레릭 신성 변환/언데드 파괴 설명 정상
[ ] 12개 직업 레벨별 특성 타임라인 fallback 문구 없음
[ ] FE에서 선택한 주문/종족/하위종족/장비가 BE에서 같은 id로 검증됨
[ ] AI 평가 로그에서 동일한 SRD catalog version 출력
```

위 결과가 모두 성공이면:

- 이 문서에 최종 검증 결과를 추가한다.
- 완료 정의 6개를 실행 증거 기준으로 재판정한다.
- 모든 항목이 충족되면 goal 완료 처리한다.

## 현재 변경 파일 범위

최종 검증 전 현재 worktree의 SRD 정합성 관련 변경 범위는 다음과 같다.

Core package:

- `srd-data/index.mjs`
- `srd-data/index.d.ts`
- `srd-data/package.json`
- `srd-data/scripts/verify-generated.mjs`
- `srd-data/scripts/generate-canonical-artifacts.mjs`
- `srd-data/scripts/import-spell-class-lists-from-dnd5eapi.mjs`

Canonical source/override 입력:

- `srd-data/sources/README.md`
- `srd-data/sources/spell-class-lists.json`
- `srd-data/overrides/README.md`
- `srd-data/overrides/class-feature-summaries.json`
- `srd-data/overrides/fe-spell-pools.json`
- `srd-data/overrides/fe-usable-items.json`
- `srd-data/overrides/non-srd-monster-runtime-ids.json`
- `srd-data/overrides/non-srd-spell-runtime-ids.json`

Generated canonical artifact:

- `srd-data/generated/srd/class-features.json`
- `srd-data/generated/srd/fe-spell-pools.json`
- `srd-data/generated/srd/fe-usable-items.json`
- `srd-data/generated/srd/item-labels.json`
- `srd-data/generated/srd/catalog-fingerprint.json`
- `srd-data/generated/srd/spell-class-lists.json`

FE public sync artifact:

- `fe/public/srd/class-features.json`
- `fe/public/srd/fe-spell-pools.json`
- `fe/public/srd/fe-usable-items.json`
- `fe/public/srd/item-labels.json`
- `fe/public/srd/catalog-fingerprint.json`
- `fe/public/srd/spell-class-lists.json`

Verifier/sync/AI:

- `scripts/sync-fe-static-srd.mjs`
- `scripts/verify-rule-data-sync.mjs`
- `ai/scripts/evaluate_p0_ai_quality.py`

FE/BE 소비 경로:

- `be/src/modules/rules/rule-catalog.service.ts`
- `be/src/modules/rules/rule-catalog.types.ts`
- `be/src/modules/rules/p5-monster-definitions.ts`
- `fe/src/services/staticSrd.ts`
- `fe/src/features/characters/characterFeaturePresentation.ts`
- `fe/src/features/sessionPlay/components/CharacterDetailModal.tsx`
- `fe/src/features/sessionPlay/utils/displayNames.ts`
- `fe/src/features/sessionPlay/utils/executableItems.ts`
- `fe/src/pages/CharacterPage.tsx`
- `fe/src/pages/PlayPage.tsx`
- `fe/package.json`

문서/워크스페이스 metadata:

- `doc/README.md`
- `doc/future_plan.md`
- `doc/completed/future_plan_srd_data_consistency.md`
- `doc/rules/ARCHITECTURE_RULES.md`
- `doc/rules/README.md`
- `package-lock.json`

추적 주의:

- 위 신규 SRD source/override/generated/FE public artifact는 현재 `.gitignore` 매칭 대상이 아니다.
- 최종 반영 시 `git status --short`의 untracked SRD 파일들을 함께 stage해야 한다.

## 검증 진행 기록

### 2026-06-29 BE build 1차 실패 및 수정

사용자 실행 결과:

```text
npm run build -w @trpg/be
src/modules/rules/rule-catalog.service.ts:2895:29 - error TS18048: 'seed.cost' is possibly 'undefined'.
```

원인:

- `toClassFeatureEntry()`는 `seed.cost ?? NO_COST`로 기본값을 적용하지만, `resolveRuntimeStatus()`는 `ClassFeatureRuntimeOverride.cost`의 optional 값을 직접 읽고 있었다.

수정:

- `resolveRuntimeStatus()` 내부에서 `const cost = seed.cost ?? NO_COST`를 먼저 계산한 뒤 `cost.type`을 읽도록 변경했다.

확인:

```text
rg -n "seed\.cost\.(type|[A-Za-z_])|seed\.cost\[" be/src/modules/rules/rule-catalog.service.ts
git diff --check -- be/src/modules/rules/rule-catalog.service.ts
```

- 같은 직접 접근 패턴은 더 이상 없다.
- 공백 오류는 없고 CRLF 경고만 있다.

### 2026-06-29 FE build 1차 실패 및 수정

사용자 실행 결과:

```text
npm run build -w @trpg/fe
src/services/storage.ts:27:7 - error TS2322: Type 'UserRole.MODERATOR | UserRole.ADMIN | "USER"' is not assignable to type 'UserRole'.
```

원인:

- `StoredUser.role`은 `UserRole` enum 타입인데, localStorage 복원 fallback이 문자열 리터럴 `"USER"`를 반환하고 있었다.

수정:

- 1차 수정에서는 `fe/src/services/storage.ts`에서 `UserRole`을 값 import하고, role 비교와 기본값을 `UserRole.ADMIN`, `UserRole.MODERATOR`, `UserRole.USER` 기준으로 변경했다.

확인:

```text
rg -n 'role: .*"USER"|parsed\.role === "ADMIN"|parsed\.role === "MODERATOR"' fe/src
git diff --check -- fe/src/services/storage.ts
```

- 기존 문자열 role fallback 패턴은 더 이상 없다.
- 공백 오류는 없고 CRLF 경고만 있다.

### 2026-06-29 FE build 2차 실패 및 수정

사용자 실행 결과:

```text
npm run build -w @trpg/fe
error during build:
src/services/storage.ts (1:9): "UserRole" is not exported by "../shared-types/dist/index.js", imported by "src/services/storage.ts".
```

원인:

- 1차 수정에서 `UserRole`을 런타임 값 import로 가져왔는데, FE 단독 Vite build가 `@trpg/shared-types`의 CommonJS dist named export를 Rollup 단계에서 안정적으로 해석하지 못했다.

수정:

- `UserRole`은 type-only import로 변경했다.
- FE storage 내부에 `STORED_USER_ROLE` 상수를 두고, 각 문자열을 `UserRole` 타입으로 좁혀 localStorage 복원에 사용하도록 변경했다.
- 이로써 `@trpg/shared-types` 런타임 값 import 없이 `StoredUser.role` 타입을 만족한다.

확인:

```text
rg -n "import \{ UserRole \}|UserRole\.|STORED_USER_ROLE|from \"@trpg/shared-types\"" fe/src/services/storage.ts fe/src
git diff --check -- fe/src/services/storage.ts
```

- `fe/src/services/storage.ts`에는 `UserRole` type-only import와 `STORED_USER_ROLE` 사용만 남았다.
- 공백 오류는 없고 CRLF 경고만 있다.

### 2026-06-29 AI eval 1차 실패

사용자 실행 결과:

```text
npm run eval:ai-quality
srdCatalogFingerprint=73546faa7284
passed=False
```

리포트:

- `ai/runtime_logs/p0_ai_quality_report.json`
- `srdCatalog.sha256`는 `73546faa72845a37a74aafb98b84f939e958eb991825db7f383b73851296268e`로 기록됐다.
- 모든 interpreter/narrator case가 `WinError 10061` 연결 거부 오류를 반환했다.

판정:

- SRD catalog fingerprint 출력과 리포트 기록은 정상이다.
- 실패 원인은 catalog 정합성 문제가 아니라 평가 대상 AI FastAPI 서버가 `http://localhost:8000`에서 떠 있지 않은 것이다.

재실행 절차:

```powershell
cd C:\WORK\online-TRPG\ai
python -m pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

다른 터미널에서:

```powershell
cd C:\WORK\online-TRPG
npm run eval:ai-quality
```

또는 다른 AI 서버 URL을 사용할 경우:

```powershell
$env:AI_SERVICE_URL='http://localhost:8000'
npm run eval:ai-quality
```

### 2026-06-29 AI eval 2차 성공

사용자 실행 결과:

```text
npm run eval:ai-quality
interpreter.schemaPassRate = 1.0
interpreter.intentAccuracy = 1.0
narrator.schemaPassRate = 1.0
narrator.noNewFactsViolationRate = 0.0
srdCatalogFingerprint=73546faa7284
passed=True
```

판정:

- AI FastAPI 서버 기동 후 `eval:ai-quality`가 성공했다.
- AI 평가 로그에서 SRD catalog fingerprint가 출력됐다.
- 이 항목은 검증 계획의 `npm run eval:ai-quality` 조건을 충족한다.

### 2026-06-29 서브클래스 특성 fallback 확인 및 수정

증상:

- `Evocation Savant`, `Sculpt Spells` 등 서브클래스 특성이 영어 fallback 이름/설명으로 표시될 수 있었다.

원인:

- `classes.jsonl`의 SRD reference에는 위저드 방출학파 특성이 `class.wizard.subclass_feature.방출학파_전문가` 같은 한글 기반 id로 존재했다.
- 반면 BE RuleCatalog의 runtime 서브클래스 특성은 `subclass.wizard.evocation.feature.evocation_savant`와 legacy `class.wizard.subclass_feature.evocation_savant` 같은 영어 key 기반 id를 사용한다.
- canonical class feature generator가 `classFeature(...)`만 runtime id로 수집하고 `subclassFeature(...)`를 수집하지 않아, 이 영어 key 기반 서브클래스 id들이 `class-features.json`에 들어가지 않았다.
- `/rule-catalog` DTO label도 `displayNameKo`를 우선하지 않고 id 끝부분을 title case로 만든 fallback label을 사용했다.

수정:

- `srd-data/index.mjs`의 canonical manifest builder가 `subclass.<class>.<subclass>.feature.<feature>`와 `class.<class>.subclass_feature.<feature>` id를 서브클래스 특성으로 생성할 수 있게 했다.
- `srd-data/scripts/generate-canonical-artifacts.mjs`가 BE `subclassFeature(...)` 정의를 수집하고, SRD class reference의 한글 이름/요약과 연결해 runtime/legacy 서브클래스 id 모두에 표시 정보를 붙인다.
- 레벨 확장형 id(`domain_spells_level_9`, `circle_spells_level_5`, `divine_strike_2d8` 등)는 원 SRD reference(`권역 주문`, `서클 주문`, `신성한 일격` 등)에 매핑했다.
- `be/src/modules/rules/rule-catalog.service.ts`의 `subclassFeature(...)`가 canonical manifest의 `displayNameKo`, `descriptionKo`를 RuleCatalogEntry에 채운다.
- `be/src/modules/catalog/catalog.service.ts`가 rule catalog label로 `entry.displayNameKo`를 우선 사용한다.

정적 확인:

- `node srd-data\scripts\generate-canonical-artifacts.mjs` 성공.
- `node scripts\sync-fe-static-srd.mjs` 성공.
- `subclass.wizard.evocation.feature.evocation_savant`, `subclass.wizard.evocation.feature.sculpt_spells`, legacy `class.wizard.subclass_feature.evocation_savant`, `class.wizard.subclass_feature.sculpt_spells`가 모두 한글 이름/요약을 가진 canonical entry로 생성됨을 확인했다.
- 영어 key 기반 subclass runtime 항목의 fallback 잔여 수가 `0`임을 확인했다.

### 2026-06-30 서브클래스 표시 fallback 2차 수정

추가 증상:

- canonical manifest에는 `evocation_savant`, `sculpt_spells` 항목이 생성됐지만, FE 화면에서는 여전히 `Evocation Savant 자동 획득했거나 선택한 캐릭터 특성입니다.`처럼 표시될 수 있었다.

추가 원인:

- `CharacterPage`의 preview 매칭은 `Evocation Savant`를 `Evocation_Savant`로 정규화했고, canonical alias는 `evocation_savant`라 대소문자/구분자 차이로 매칭되지 않았다.
- `characterFeaturePresentation.ts`의 표시 함수는 canonical class feature를 id exact match 중심으로만 찾았고, 저장/표시 feature 값이 `Evocation Savant` 같은 label 문자열이면 canonical alias를 조회하지 못했다.

추가 수정:

- `fe/src/pages/CharacterPage.tsx`의 feature alias 정규화를 lower snake 형태로 통일했다.
- `fe/src/features/characters/characterFeaturePresentation.ts`의 canonical 표시 조회가 exact id뿐 아니라 canonical alias와 `nameKo` loose match도 사용하게 했다.

정적 확인:

- `Evocation Savant` -> `class.wizard.subclass_feature.evocation_savant` -> `방출학파 전문가` / `방출 주문을 주문책에 복사하는 비용과 시간이 절반이 된다.`
- `Sculpt Spells` -> `class.wizard.subclass_feature.sculpt_spells` -> `주문 조형` / `방출 주문으로 보이는 크리처에게 영향을 줄 때 일부 크리처를 보호할 수 있다. 선택 수는 1 + 주문 레벨.`

## 리스크와 대응

### 리스크 1. 전면 전환 범위가 크다

대응:

- class feature부터 시작한다.
- 기존 public SRD sync는 당장 제거하지 않고 canonical generator 결과로 유지한다.
- FE/BE runtime 동작은 단계적으로 교체한다.

### 리스크 2. BE runtime metadata는 SRD 원문만으로 부족하다

대응:

- runtime metadata는 BE override로 유지한다.
- 단, override는 canonical id에 붙인다.
- canonical id가 없으면 실패하게 한다.

### 리스크 3. FE bundle 크기가 커질 수 있다

대응:

- FE는 필요한 subset만 import하거나 기존 static JSON fetch를 유지한다.
- 중요한 것은 원천과 generator를 하나로 만드는 것이지, 반드시 모든 데이터를 JS bundle에 넣는 것이 아니다.

### 리스크 4. 기존 저장 캐릭터의 legacy id가 남아 있을 수 있다

대응:

- legacy id migration map을 별도로 둔다.
- migration map도 검증 대상에 포함한다.
- UI에는 canonical id 기준으로 표시한다.

## 완료 정의

이 계획은 다음 조건을 만족하면 완료로 본다.

- FE/BE/AI가 같은 `srd-data` catalog version을 사용한다.
- 직업/특성/주문/종족/장비/몬스터의 핵심 id가 canonical manifest로 통일된다.
- FE 캐릭터 빌더에서 class feature fallback이 구조적으로 발생하지 않는다.
- BE RuleCatalog와 canonical class feature manifest가 drift 없이 검증된다.
- `verify:rule-data-sync`가 루트 script로 제공되고, 실패 메시지가 actionable하다.
- 문서에 “SRD 데이터 수정 경로”와 “수동 override 허용 범위”가 명시된다.

