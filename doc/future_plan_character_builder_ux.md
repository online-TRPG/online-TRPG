# 캐릭터 빌더 UX 및 특성 선택 시스템 개선 계획

작성일: 2026-06-25

## Summary

현재 캐릭터 생성창은 주문 선택 UX 개선으로 한 단계 나아졌지만, 캐릭터 빌드 전체 관점에서는 아직 큰 공백이 남아 있다. 사용자는 캐릭터를 만들면서 자신이 어떤 종족/직업/서브클래스 특성을 얻게 되는지 충분히 알 수 없고, 일부 선택형 특성만 하드코딩된 UI로 고를 수 있다. 또한 ASI 타이밍에서 `Alert / 경계` 같은 Feat를 선택하는 흐름이 없어서 실제 D&D 5e 테이블에서 익숙한 “능력치 상승 또는 특기 선택” 경험을 제공하지 못한다.

이 계획의 목표는 캐릭터 생성/레벨업 UI를 단순 입력 폼이 아니라 **캐릭터 빌더**로 정리하는 것이다.

핵심 방향:

- `기술과 특성` 탭을 `기술`과 `특성`으로 분리한다.
- 자동 획득 특성, 선택 필요 특성, ASI/Feat 선택을 명확히 구분한다.
- 종족/직업/서브클래스 특성을 생성 전부터 사용자에게 설명한다.
- 레벨이 높게 시작하는 시나리오에서도 해당 레벨까지 얻는 특성을 한눈에 확인한다.
- 레벨업 UI도 “이번 레벨업에서 얻는 것”과 “선택해야 하는 것”을 보여준다.
- 장기적으로 하드코딩된 선택 UI를 룰 카탈로그 기반 선택 정의로 전환한다.

## 현재 문제 진단

### 1. 캐릭터가 얻게 되는 정보를 전부 알려주지 않는다

현재 생성창은 선택한 종족/직업의 요약 설명은 일부 보여주지만, 실제 생성 후 저장될 `featuresJson` 전체를 사용자에게 “획득 특성”으로 보여주지 않는다.

사용자는 다음 정보를 생성 전에 충분히 확인할 수 없다.

- 종족 특성
- 직업 특성
- 서브클래스 특성
- 레벨에 따라 자동 획득하는 특성
- 전투/탐험에서 실제로 사용할 수 있는 기능
- 특성의 간단한 효과와 사용 조건

백엔드에서는 `RuleCatalogService`와 `CharactersService.resolveCharacterFeatureSnapshot`을 통해 레벨별 feature snapshot을 만들지만, 프론트 생성창은 이 snapshot을 사용자용 프리뷰로 충분히 활용하지 못한다.

### 2. 선택해야 하는 종족/직업/서브클래스 특성이 일반화되어 있지 않다

현재 생성창에는 일부 선택 UI만 존재한다.

현재 노출되는 선택:

- 드래곤본 `Draconic Ancestry`
- 파이터 `Fighting Style`
- 레인저 `Favored Enemy`
- 로그 `Expertise`
- 일정 레벨 이상에서 서브클래스 선택

문제:

- 선택형 특성이 하드코딩되어 있다.
- 전체 직업/서브클래스 선택지를 포괄하지 못한다.
- 고레벨 시작 시 추가로 필요한 선택이 UI에 드러나지 않는다.
- 선택이 필요한 특성과 자동 획득 특성이 같은 “features” 배열에 섞여 있어 사용자 경험상 구분되지 않는다.

### 3. 레벨이 오르며 추가로 받거나 선택해야 하는 것이 충분히 표현되지 않는다

현재 레벨업 UI는 다음을 일부 지원한다.

- 목표 레벨 선택
- HP 증가
- ASI 능력치 점수 배분
- 서브클래스 필요 시 선택
- 주문 일부 습득/교체

하지만 다음 공백이 있다.

- ASI 대신 Feat 선택 흐름이 없다.
- 새로 얻는 자동 특성의 상세 설명이 부족하다.
- 새로 선택해야 하는 직업/서브클래스 특성이 일반화되어 있지 않다.
- 이번 레벨업에서 추가되는 것과 이미 가진 것이 구분되지 않는다.
- 여러 레벨을 한 번에 올릴 때 각 레벨에서 무엇을 받는지 추적하기 어렵다.

### 4. 탭 구조가 사용자 멘탈 모델과 맞지 않는다

현재 또는 직전 개선 후 흐름은 다음에 가깝다.

- 기본 정보
- 코어 스탯
- 기술과 특성
- 장비
- 주문

문제는 `기술과 특성` 탭이 사실상 숙련 기술 선택과 일부 선택형 특성만 담당한다는 점이다. 사용자는 “특성” 탭이라고 기대했지만 실제로 자동 획득 특성 목록과 설명을 볼 수 없다.

### 5. 최종 확인 단계가 부족하다

캐릭터 생성 직전 “내가 만든 캐릭터가 최종적으로 무엇을 갖는지”를 요약하는 단계가 없다.

필요한 최종 요약:

- 이름/종족/직업/서브클래스/레벨
- 능력치, HP, AC, 이동속도, 숙련 보너스
- 숙련 기술
- 종족/직업/서브클래스 특성
- ASI/Feat 선택
- 장비
- 주문
- 생성 불가 상태의 남은 필수 선택

## 목표

### 사용자 경험 목표

1. 캐릭터가 생성 시점에 무엇을 갖는지 사용자가 알 수 있게 한다.
2. 자동 획득과 선택 필요 항목을 명확히 분리한다.
3. 선택하지 않은 필수 항목을 탭/섹션 단위로 즉시 알 수 있게 한다.
4. 고레벨 시작 캐릭터도 레벨별 성장 결과를 이해하며 만들 수 있게 한다.
5. 레벨업 시 새로 얻는 것과 선택해야 하는 것을 한 화면에서 확인하게 한다.
6. D&D 5e에서 흔히 사용하는 ASI/Feat 선택 경험을 제공한다.

### 기술 목표

1. 프론트의 하드코딩 선택 UI를 점진적으로 룰 카탈로그 기반으로 바꾼다.
2. 특성 표시용 presentation metadata를 공통화한다.
3. 생성/레벨업/상세 보기에서 같은 특성 설명 resolver를 사용한다.
4. 서버 feature snapshot과 프론트 프리뷰가 어긋나지 않게 검증한다.
5. 기존 character DTO와 저장 구조는 가능한 한 유지해 회귀 위험을 낮춘다.

## 비목표

이번 계획에서 당장 하지 않는 것:

- D&D 비SRD/유료 콘텐츠 추가.
- 모든 5e Feat 전체를 한 번에 구현.
- 멀티클래스 구현.
- 홈브루 특성 편집기 구현.
- 비공개 룰북 전문 텍스트 수록.

초기 Feat 범위는 SRD/허용 범위 내에서 현재 프로젝트가 제공 가능한 최소 실행 세트로 시작한다.

## 제안 탭 구조

캐릭터 생성창은 다음 단계로 재구성한다.

1. `기본 정보`
2. `코어 스탯`
3. `기술`
4. `특성`
5. `장비`
6. `주문`
7. `확인`

### 기술 탭

담당:

- 숙련 기술 선택
- Expertise처럼 기술 숙련과 직접 연결되는 선택
- Thieves' Tools 등 숙련 선택과 함께 비교해야 하는 도구 숙련

### 특성 탭

담당:

- 자동 획득 종족 특성
- 자동 획득 직업 특성
- 자동 획득 서브클래스 특성
- 선택 필요 종족/직업/서브클래스 특성
- ASI/Feat 선택
- 레벨별 획득 타임라인

### 확인 탭

담당:

- 최종 캐릭터 요약
- 완료/미완료 체크리스트
- 생성 시 서버로 보낼 핵심 payload 프리뷰
- 생성 불가 사유 표시

## 구현 순서

## 1단계. 특성 표시 모델 정리

### 목표

사용자에게 보여줄 특성 카드의 공통 표시 타입을 만든다.

### 후보 파일

- `fe/src/features/characters/featurePresentation.ts`
- `fe/src/features/characters/CharacterFeatureList.tsx`
- `fe/src/features/characters/CharacterFeatureList.css`

### 타입 제안

```ts
export type CharacterFeatureSource = 'race' | 'class' | 'subclass' | 'feat' | 'choice';

export type CharacterFeaturePresentation = {
  id: string;
  name: string;
  source: CharacterFeatureSource;
  level?: number | null;
  summary: string;
  tags: string[];
  isAutomatic: boolean;
  isChoiceRequired: boolean;
  isSelected: boolean;
};
```

### 표시 규칙

- 자동 획득: `자동 획득` 배지
- 선택 필요: `선택 필요` 배지
- 선택 완료: `선택 완료` 배지
- 아직 설명이 부족한 항목: id를 숨기지 말고 “상세 설명 준비 중” fallback 표시

### 완료 기준

- 특성 카드 컴포넌트가 생성/레벨업/상세 보기에서 재사용 가능하다.
- 알 수 없는 feature id도 사용자에게 빈 값으로 보이지 않는다.

## 2단계. 생성 시점 Feature Preview 생성

### 목표

선택한 종족/직업/서브클래스/레벨 기준으로 캐릭터가 받게 될 특성 목록을 프론트에서 미리 보여준다.

### 구현 방향

우선은 프론트가 보유한 데이터와 `ruleCatalog`를 조합해 preview를 만든다.

입력:

- `formState.ancestry`
- `formState.className`
- `formState.subclassName`
- `formState.level`
- `formState.features`
- `ruleCatalog`
- static SRD class/race data

출력:

- 자동 획득 종족 특성
- 자동 획득 직업 특성
- 자동 획득 서브클래스 특성
- 선택형 특성
- ASI/Feat 선택 지점

장기적으로는 백엔드에 preview endpoint를 추가할 수 있다.

후보 API:

```http
POST /api/v1/characters/preview
```

초기에는 API 없이 프론트 helper로 시작한다.

### 완료 기준

- 1레벨 캐릭터 생성 시 자동 획득 특성이 카드로 보인다.
- 5레벨/10레벨 등 고레벨 시작 시 해당 레벨까지의 특성이 보인다.
- 서브클래스 선택 전에는 서브클래스 특성이 “서브클래스 선택 필요” 상태로 보인다.

## 3단계. `기술과 특성` 탭 분리

### 목표

현재 `features` 단계를 `skills`와 `features` 단계로 나눈다.

### 변경 방향

현재:

```ts
type CharacterCreateStepKey =
  | 'profile'
  | 'stats'
  | 'features'
  | 'equipment'
  | 'spells';
```

변경:

```ts
type CharacterCreateStepKey =
  | 'profile'
  | 'stats'
  | 'skills'
  | 'features'
  | 'equipment'
  | 'spells'
  | 'review';
```

### 기술 탭

- 기존 숙련 기술 선택 UI 이동.
- 로그 Expertise처럼 기술 선택과 밀접한 항목은 우선 기술 탭에 유지한다.

### 특성 탭

- 자동 획득 특성 목록 표시.
- 선택 필요 특성 UI 표시.
- ASI/Feat 선택 UI 표시.
- 미완료 필수 선택 수 표시.

### 완료 기준

- 탭 라벨과 실제 내용이 일치한다.
- 특성 탭에서 현재 캐릭터가 받을 특성 목록을 확인할 수 있다.
- 기술 탭은 숙련 기술 선택에 집중한다.

## 4단계. 선택형 특성 정의를 하드코딩에서 데이터화

### 목표

파이터/레인저/로그/드래곤본만 따로 처리하는 현재 구조를 줄이고, 선택형 특성 metadata를 별도로 둔다.

### 후보 파일

- `fe/src/features/characters/featureChoiceDefinitions.ts`
- 장기적으로 `be/src/modules/rules/rule-catalog.service.ts` 또는 SRD 데이터 쪽으로 이동

### 타입 제안

```ts
export type CharacterFeatureChoiceDefinition = {
  id: string;
  ownerFeatureId: string;
  classKey?: string;
  raceKey?: string;
  subclassKey?: string;
  minLevel: number;
  maxSelections: number;
  required: boolean;
  optionType: 'single' | 'multi' | 'skill' | 'tool' | 'feat' | 'ability';
  options: Array<{
    value: string;
    label: string;
    summary?: string;
  }>;
  featurePrefix: string;
};
```

### 1차 데이터화 대상

- `draconic_ancestry:`
- `fighting_style:`
- `favored_enemy:`
- `favored_enemy_humanoid:`
- `expertise:`

### 후속 대상

- `metamagic:`
- `eldritch_invocation:`
- `magical_secrets:`
- 추가 Fighting Style
- 추가 Expertise
- 서브클래스 선택형 feature

### 완료 기준

- 기존 선택 UI가 definition 기반 렌더링으로 동작한다.
- 새 선택형 특성을 추가할 때 JSX를 직접 늘리지 않아도 된다.

## 5단계. ASI / Feat 선택 시스템 추가

### 목표

4, 8, 12, 16, 19레벨 등 ASI 타이밍에서 능력치 상승 또는 Feat 선택을 할 수 있게 한다.

### 규칙

기본 D&D 5e 2014 기준:

- 대부분 직업: 4, 8, 12, 16, 19레벨
- 파이터 추가: 6, 14레벨
- 로그 추가: 10레벨

현재 코드의 `ASI_LEVELS`와 `getCrossedAsiLevels`는 이 일부를 이미 반영한다.

### 데이터 모델 제안

초기에는 기존 `features` 배열에 Feat id를 넣는 방식으로 시작할 수 있다.

예:

```ts
feat.alert
feat.tough
feat.war_caster
```

단, 장기적으로는 다음처럼 별도 구조가 더 좋다.

```ts
type CharacterProgressionChoice = {
  level: number;
  type: 'asi' | 'feat';
  abilityScoreIncreases?: Partial<Record<AbilityKey, number>>;
  featId?: string;
};
```

초기 호환 전략:

- 서버 DTO는 당장 크게 바꾸지 않는다.
- Feat 선택은 `features` 또는 신규 optional 필드로 받는다.
- ASI 선택은 기존 `abilityScoreIncreases`를 유지한다.

### 1차 Feat 후보

SRD/허용 범위와 구현 난이도를 기준으로 최소 세트를 정한다.

- Alert / 경계
- Tough / 강인함
- Durable / 튼튼함
- Mobile / 기동성
- War Caster / 전투 시전자
- Elemental Adept / 원소 숙련

주의:

- 정확한 한국어 명칭은 프로젝트 용어집 기준으로 정리한다.
- 비SRD 또는 라이선스상 수록 불가한 내용은 직접 전문을 넣지 않는다.

### UX

ASI 타이밍마다 카드 선택:

- `능력치 상승`
- `Feat 선택`

능력치 상승을 고르면 기존 능력치 +2 배분 UI 표시.

Feat를 고르면 Feat 카드 그리드 표시.

각 Feat 카드:

- 이름
- 짧은 설명
- 적용되는 능력치/효과 태그
- 전제조건
- 선택 가능/불가 상태

### 완료 기준

- 4레벨 시작 캐릭터 생성 시 ASI 또는 Feat를 선택할 수 있다.
- 레벨업으로 ASI 레벨을 지날 때도 ASI 또는 Feat를 선택할 수 있다.
- Feat 선택 결과가 캐릭터 feature 목록에 반영된다.
- Alert 같은 Feat가 생성 후 특성 목록에 표시된다.

## 6단계. 레벨별 성장 타임라인 표시

### 목표

고레벨 시작 또는 여러 레벨업 시, 사용자가 각 레벨에서 무엇을 얻는지 이해하게 한다.

### UI 예시

```text
1레벨
- 자동: Second Wind
- 선택: Fighting Style

2레벨
- 자동: Action Surge

3레벨
- 선택: Martial Archetype
- 자동: Champion - Improved Critical

4레벨
- 선택: ASI 또는 Feat
```

### 완료 기준

- 생성창 특성 탭에서 1레벨부터 시작 레벨까지의 획득 내역을 볼 수 있다.
- 선택이 필요한 레벨은 강조된다.
- 선택 완료 시 타임라인 상태가 갱신된다.

## 7단계. 레벨업 UI 개선

### 목표

레벨업 모달/패널도 캐릭터 생성의 특성 시스템과 같은 방식으로 동작하게 한다.

### 변경 방향

현재 레벨업 UI:

- 목표 레벨
- ASI 점수 배분
- 서브클래스 선택
- 주문 선택

개선 후:

- 이번 레벨업 자동 획득 특성
- 이번 레벨업 선택 필요 항목
- ASI 또는 Feat 선택
- 새 주문/준비 주문
- 완료 체크리스트

### 완료 기준

- 3레벨 진입 시 서브클래스 선택과 새 서브클래스 특성이 함께 보인다.
- 4레벨 진입 시 ASI/Feat 선택이 보인다.
- 여러 레벨을 한 번에 올릴 때 지나간 선택 지점을 모두 처리한다.

## 8단계. 최종 확인 탭 추가

### 목표

생성 버튼을 누르기 전 사용자가 완성된 캐릭터를 검토할 수 있게 한다.

### 표시 항목

- 기본 정보
- 능력치/HP/AC/이동속도
- 숙련 기술
- 특성
- Feat/ASI 선택
- 장비
- 주문
- 미완료 선택

### 완료 기준

- 필수 선택이 남아 있으면 확인 탭에서 생성 버튼이 비활성화된다.
- 사용자는 어떤 탭으로 돌아가야 하는지 알 수 있다.
- 최종 캐릭터 구성이 생성 후 상세 보기와 크게 다르지 않다.

## 9단계. 서버 검증 및 프리뷰 정합성 보강

### 목표

프론트 프리뷰와 서버 저장 결과가 어긋나지 않게 한다.

### 후보 작업

1. 서버 preview endpoint 추가

```http
POST /api/v1/characters/preview
```

응답:

```ts
{
  featureIds: string[];
  requiredChoices: CharacterFeatureChoiceRequirement[];
  warnings: string[];
}
```

2. 기존 생성 API 검증 강화

- 필수 선택형 특성 누락
- 선택할 수 없는 Feat
- ASI와 Feat 중복 선택
- 전제조건 미충족 Feat

3. 테스트 보강

- 4레벨 Feat 선택 생성
- 4레벨 ASI 선택 생성
- 파이터 6레벨 추가 ASI/Feat
- 로그 10레벨 추가 ASI/Feat
- 서브클래스 선택 레벨 생성

### 완료 기준

- 프론트에서 보이는 특성 목록과 서버 저장 `featuresJson`이 일치한다.
- 잘못된 선택은 서버에서도 거부된다.

## 10단계. 캐릭터 상세 보기와 세션 선택창 연동

### 목표

캐릭터 생성에서 보여준 정보를 생성 후에도 같은 방식으로 확인할 수 있게 한다.

### 대상

- `CharacterDetailModal`
- 캐릭터 목록 카드
- 세션 캐릭터 선택창
- 플레이 중 캐릭터 상세/상태 패널

### 완료 기준

- 생성창의 특성 카드와 상세 보기의 특성 카드가 같은 resolver를 사용한다.
- 세션 참가 전 캐릭터가 가진 핵심 특성을 확인할 수 있다.
- 캐릭터 레벨 제한/시나리오 조건과 함께 특성/주문/장비 요약이 보인다.

## 검증 계획

프로젝트 지시에 따라 Codex가 테스트를 직접 실행하지 않고, 사용자가 실행할 검증 명령을 안내한다.

### 권장 빌드

```powershell
npm run build
```

### 권장 단위 테스트

```powershell
npm run test:quiet -w @trpg/be -- characters.service.spec.ts rule-catalog.service.spec.ts level-up.service.spec.ts --runInBand
```

### 권장 회귀 테스트

현재 가장 넓은 회귀 범위를 사용한다.

```powershell
npm run test:p6-regression
```

### 수동 검증 시나리오

1. 1레벨 파이터 생성
   - 기술 탭에서 숙련 기술 선택.
   - 특성 탭에서 Second Wind와 Fighting Style 확인.
   - Fighting Style 선택 필수 표시.

2. 4레벨 파이터 생성
   - ASI 또는 Feat 선택이 표시.
   - Alert / 경계 선택 가능.
   - 선택 결과가 최종 확인 탭에 표시.

3. 6레벨 파이터 생성
   - 파이터 추가 ASI/Feat 지점 표시.
   - 4레벨과 6레벨 선택이 모두 필요.

4. 3레벨 로그 생성
   - 서브클래스 선택.
   - Sneak Attack, Expertise, Thieves' Cant, Cunning Action, 서브클래스 특성 확인.

5. 드래곤본 생성
   - Draconic Ancestry 선택 필요.
   - 선택 후 브레스/저항 관련 특성 프리뷰 표시.

6. 레벨업
   - 3레벨 진입 시 서브클래스 선택 필요.
   - 4레벨 진입 시 ASI/Feat 선택 필요.
   - 자동 획득 특성이 “이번 레벨업 획득”으로 표시.

## 위험 요소와 대응

### 위험 1. Feat 라이선스/콘텐츠 범위

대응:

- SRD/프로젝트 허용 범위의 Feat만 우선 구현한다.
- 상세 설명은 자체 요약 문구를 사용한다.
- 비공개 룰북 전문은 수록하지 않는다.

### 위험 2. 기존 features 배열에 선택/자동/Feat가 뒤섞임

대응:

- 단기적으로는 호환을 유지한다.
- presentation layer에서 source/type을 추론한다.
- 장기적으로 progression choice 구조를 별도 저장하는 마이그레이션을 검토한다.

### 위험 3. 프론트 프리뷰와 서버 저장 결과 불일치

대응:

- 초기에는 동일 helper/동일 룰 카탈로그 기반으로 최대한 맞춘다.
- 중기에는 서버 preview endpoint로 단일 진실 공급원을 만든다.
- 테스트에서 preview와 create 결과를 비교한다.

### 위험 4. 생성창 단계가 너무 많아짐

대응:

- 탭을 늘리되 각 탭의 목적을 명확히 한다.
- 확인 탭에서 미완료 항목으로 바로 이동할 수 있게 한다.
- 특성 탭 안에는 자동/선택/ASI를 접이식 섹션으로 구성한다.

### 위험 5. 선택형 특성 전체 구현 범위 폭발

대응:

- 1차는 현재 하드코딩된 선택형 특성의 데이터화.
- 2차는 ASI/Feat.
- 3차는 P0~P6 범위에서 실제 필요한 선택형 특성.
- 4차는 전체 SRD 확장.

## 작업 단위 제안

### PR 1. 특성 표시 컴포넌트와 preview helper

- `featurePresentation.ts`
- `CharacterFeatureList`
- 생성창 특성 preview 표시
- 자동 획득 특성 fallback 표시

### PR 2. 탭 분리와 확인 탭 추가

- `기술과 특성` → `기술`, `특성`
- `확인` 탭 추가
- 기존 검증 흐름 재배치

### PR 3. 선택형 특성 definition화

- 현재 하드코딩 선택형 특성 데이터화
- 기존 UI를 definition 기반 렌더링으로 교체

### PR 4. ASI/Feat 선택 시스템

- Feat metadata 추가
- 4레벨 생성 Feat 선택
- 레벨업 Feat 선택
- 서버 검증

### PR 5. 레벨별 성장 타임라인

- 생성 특성 탭에 1~시작 레벨 성장 표시
- 레벨업 UI에 이번 성장 표시

### PR 6. 상세 보기/세션 선택창 연동

- 생성 후 캐릭터 상세 보기에서 동일 특성 카드 사용
- 세션 캐릭터 선택창에 핵심 특성/Feat 요약

## 완료 기준

이 계획은 다음 조건을 만족하면 완료로 본다.

- 캐릭터 생성창에서 `기술`과 `특성`이 분리되어 있다.
- 특성 탭에서 자동 획득 특성과 선택 필요 특성이 모두 보인다.
- 선택형 종족/직업/서브클래스 특성을 일반화된 UI로 선택할 수 있다.
- ASI 타이밍에서 능력치 상승 또는 Feat를 선택할 수 있다.
- Alert / 경계 같은 Feat가 캐릭터 생성/레벨업 플로우에 반영된다.
- 고레벨 시작 캐릭터가 해당 레벨까지 얻는 특성을 확인할 수 있다.
- 최종 확인 탭에서 생성될 캐릭터 구성을 검토할 수 있다.
- 서버 저장 결과와 프론트 특성 프리뷰가 일치한다.
- `npm run build`가 통과한다.
- 관련 character/rule/level-up 테스트가 통과한다.
