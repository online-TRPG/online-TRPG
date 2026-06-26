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

현재 `@trpg/srd-data`는 `verify-generated.mjs`만 실행하는 패키지에 가깝다. 이를 FE/BE가 import 가능한 패키지로 확장한다.

추가할 항목:

- `srd-data/src/index.ts`
- `srd-data/src/loaders.ts`
- `srd-data/src/classes.ts`
- `srd-data/src/spells.ts`
- `srd-data/src/races.ts`
- `srd-data/src/items.ts`
- `srd-data/src/monsters.ts`
- `srd-data/src/types.ts`

제공 API 예시:

```ts
import {
  listSrdClasses,
  listSrdClassFeatures,
  getSrdClassFeatureById,
  listSrdSpells,
  getSrdSpellById,
  listSrdRaces,
} from '@trpg/srd-data';
```

설계:

- JSONL 파일을 package build 시 TS/JSON 모듈로 변환한다.
- Node BE에서는 파일 접근 없이 package import로 사용한다.
- FE에서는 bundle 크기를 고려해 필요한 subset만 import하거나 기존 `public/srd` sync를 유지하되 같은 generator 결과를 사용한다.

완료 기준:

- `npm run build -w @trpg/srd-data`가 typed export를 생성한다.
- FE와 BE에서 최소 하나의 catalog를 `@trpg/srd-data`에서 import할 수 있다.

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
```

사용자 확인 시나리오:

- 바드 3/5레벨 특성 설명이 fallback 없이 표시된다.
- 클레릭 `신성 변환 1/휴식`, `언데드 파괴 CR 1/2`가 깨지지 않는다.
- 12개 직업 전체의 레벨별 특성 타임라인에 “자동 획득했거나 선택한 캐릭터 특성입니다.” fallback이 보이지 않는다.
- FE에서 선택한 주문/종족/하위종족/장비가 BE에서 같은 id로 검증된다.
- AI 평가 로그에서 동일한 SRD catalog version이 출력된다.

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

