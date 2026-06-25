# 캐릭터 생성 주문 선택 UX 개선 계획

작성일: 2026-06-25

## Summary

현재 캐릭터 생성창의 시작 주문 선택은 캔트립/슬롯 주문을 각각 여러 개의 `<select>`로 고르는 방식이다. 이 방식은 저레벨 캐릭터에서는 버틸 만하지만, 위저드처럼 시작 주문책 주문 수가 많거나 고레벨 시작 시 선택지가 늘어나는 경우 사용자에게 매우 불편하다.

이 계획의 목표는 캐릭터 생성창의 주문 선택을 **드롭다운 나열 방식**에서 **아이콘 기반 다중 선택 그리드**로 전환하는 것이다.

핵심 방향:

- 주문별 아이콘/색상/짧은 라벨/분류를 공통 presentation metadata로 관리한다.
- 전투 노드와 캐릭터 생성창이 같은 주문 표시 메타데이터를 사용한다.
- 캐릭터 생성창에서는 주문 아이콘 카드 목록에서 정해진 개수만큼 선택한다.
- 기존 서버 검증과 `startingSpells` payload 구조는 유지한다.
- UI는 “알고 있는 주문/주문책 선택”과 “준비 주문 선택”을 분리해 D&D 5e 규칙 차이를 명확히 보여준다.
- 초기 구현은 분류 기반 fallback 아이콘을 허용하지만, 최종 목표는 선택 가능한 모든 주문에 고유 아이콘 override를 부여하는 것이다.

## 문제 정의

### 현재 UX 문제

캐릭터 생성창의 장비와 주문 단계에서 시작 주문은 다음 방식으로 선택한다.

- 캔트립 개수만큼 `<select>`를 렌더링한다.
- 슬롯 주문 개수만큼 `<select>`를 렌더링한다.
- 각 select에서 같은 주문을 중복 선택하지 않도록 option disabled 처리한다.
- 준비 주문은 선택된 슬롯 주문 목록에서 checkbox로 별도 선택한다.

문제점:

- 주문 수가 많아질수록 select를 하나씩 열어야 해서 매우 느리다.
- 이미 어떤 주문을 골랐는지 한눈에 보기 어렵다.
- 주문의 성격, 피해 유형, 방어/회복/유틸 여부를 비교하기 어렵다.
- 위저드처럼 시작 주문 수가 많은 직업에서 체감 피로가 크다.
- 전투 노드에는 일부 주문 아이콘이 있는데, 캐릭터 생성창은 이를 활용하지 못한다.
- 주문 표시 정보가 `CharacterPage`, `CombatNodeSurface` 등에 흩어져 중복/불일치 위험이 있다.

### 현재 코드 위치

- 캐릭터 생성창 주문 목록/선택 UI:
  - `fe/src/pages/CharacterPage.tsx`
  - `implementedCantrips`
  - `implementedLevel1Spells`
  - `implementedLevel2Spells`
  - `implementedLevel3Spells`
  - `implementedLevel4Spells`
  - `getImplementedSpellOptions`
  - 장비와 주문 단계의 `<select>` 렌더링
- 전투 노드 주문/행동 아이콘:
  - `fe/src/features/sessionPlay/components/CombatNodeSurface.tsx`
  - `combatActionIconNames`
  - `CombatActionButtonContent`
- 공통 아이콘 컴포넌트:
  - `fe/src/components/GameIcon.tsx`
- 서버 검증:
  - `be/src/modules/characters/characters.service.ts`
  - `resolveStartingSpells`

## 목표

### 사용자 경험 목표

1. 주문 선택이 “입력 작업”이 아니라 “카드 고르기”처럼 느껴지게 한다.
2. 선택 가능 주문, 선택된 주문, 남은 선택 수를 한눈에 보여준다.
3. 주문별 성격을 아이콘/색/태그로 빠르게 구분하게 한다.
4. 고레벨 시작 캐릭터도 과도한 드롭다운 반복 없이 생성할 수 있게 한다.
5. 위저드의 “주문책 주문”과 “준비 주문” 차이를 UI에서 명확히 드러낸다.

### 기술 목표

1. 주문 presentation metadata를 공통화한다.
2. 주문 아이콘 매핑은 label이 아니라 `spell.id` 기준으로 관리한다.
3. 캐릭터 생성창과 전투 노드가 같은 주문 아이콘 resolver를 사용한다.
4. 기존 API payload와 서버 검증은 유지해 회귀 위험을 줄인다.
5. 향후 319개 SRD 주문 표시 확장에 대응 가능한 구조를 만든다.
6. 최종적으로 선택/전투 UI에 노출되는 모든 주문이 서로 구분 가능한 고유 아이콘을 갖게 한다.

## 비목표

이번 작업에서 하지 않는 것:

- 서버 `startingSpells` DTO 구조 변경.
- 주문 실행 룰 자체 확장.
- 새로운 주문 추가.
- 319개 주문 전체의 고유 아트 제작.
- 외부 이미지 에셋 대량 추가.
- D&D 비공개/비SRD 콘텐츠 추가.

아이콘은 우선 Iconify `game-icons:*` 기반으로 매핑한다.

## 구현 순서

## 1단계. 주문 표시 메타데이터 공통화

### 목표

`CharacterPage.tsx`와 `CombatNodeSurface.tsx`에 흩어진 주문 표시 정보를 공통 파일로 이동한다.

### 신규 파일 제안

- `fe/src/features/spells/spellPresentation.ts`

### 타입 제안

```ts
import type { GameIconName } from '../../components/GameIcon';

export type SpellPresentationTone =
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'thunder'
  | 'acid'
  | 'poison'
  | 'necrotic'
  | 'radiant'
  | 'healing'
  | 'defense'
  | 'control'
  | 'utility'
  | 'mobility'
  | 'illusion'
  | 'nature'
  | 'divine'
  | 'arcane';

export type SpellPresentation = {
  id: string;
  shortLabel: string;
  iconName: GameIconName;
  tone: SpellPresentationTone;
  tags: string[];
};
```

### API

```ts
export function getSpellPresentation(spellId: string): SpellPresentation;
export function getSpellIconName(spellId: string): GameIconName;
export function getSpellTone(spellId: string): SpellPresentationTone;
```

### 기본 fallback 규칙

주문별 개별 매핑이 없을 때는 id/label/runtime tag 기반으로 fallback을 제공한다.

예:

- `fire`, `burning`, `flame` 포함 → `game-icons:fireball`, `fire`
- `ice`, `frost`, `cold` 포함 → `game-icons:ice-bolt`, `cold`
- `heal`, `cure`, `restoration` 포함 → `game-icons:health-increase`, `healing`
- `shield`, `armor`, `ward`, `protection` 포함 → `game-icons:magic-shield`, `defense`
- `detect`, `locate`, `comprehend` 포함 → `game-icons:magic-eye`, `utility`
- `misty`, `fly`, `jump`, `longstrider` 포함 → `game-icons:teleport`, `mobility`
- fallback → `game-icons:spell-book`, `arcane`

### 1차 개별 매핑 대상

이미 전투 노드에서 아이콘이 있는 주문부터 이전한다.

- `spell.chill_touch`
- `spell.fire_bolt`
- `spell.ray_of_frost`
- `spell.sacred_flame`
- `spell.light`
- `spell.detect_magic`
- `spell.bless`
- `spell.bane`
- `spell.magic_missile`
- `spell.burning_hands`
- `spell.thunderwave`
- `spell.entangle`
- `spell.cure_wounds`
- `spell.shield`
- `spell.sleep`
- `spell.fireball`

이후 현재 `CharacterPage`에 노출되는 모든 주문에 fallback 또는 개별 아이콘을 부여한다.

### 완료 기준

- 주문 아이콘 resolver가 독립 파일에 존재한다.
- 알 수 없는 주문 id도 항상 fallback 아이콘을 반환한다.
- `GameIconName` 타입을 만족한다.

## 2단계. 전투 노드 주문 아이콘을 id 기반 공통 resolver로 교체

### 목표

전투 노드의 주문 아이콘 표시가 label 기반이 아니라 `spell.id` 기반으로 동작하게 한다.

### 현재 문제

`CombatNodeSurface.tsx`의 `combatActionIconNames`는 일반 전투 액션과 주문 label을 같은 객체에서 관리한다.

예:

```ts
Fireball: 'game-icons:fireball'
```

이 방식은 다음 문제가 있다.

- UI label이 한글화되면 매핑이 깨질 수 있다.
- `spell.id`가 있음에도 표시명을 key로 사용한다.
- 캐릭터 생성창과 재사용하기 어렵다.

### 변경 방향

- 일반 전투 액션 아이콘은 기존 `combatActionIconNames`에 남긴다.
- 주문 액션은 `spell.id`를 알고 있는 렌더링 지점에서 `getSpellIconName(spellId)`를 사용한다.
- spellId를 모르는 legacy label 액션은 기존 fallback을 유지한다.

### 완료 기준

- 전투 주문 버튼이 공통 `spellPresentation`을 사용한다.
- 기존 액션 버튼 아이콘은 유지된다.
- 주문 label 변경에도 아이콘이 유지된다.

## 3단계. 캐릭터 생성창에 SpellSelectionGrid 컴포넌트 추가

### 목표

캐릭터 생성창의 `<select>` 반복 UI를 아이콘 기반 다중 선택 UI로 교체한다.

### 신규 컴포넌트 제안

- `fe/src/features/spells/SpellSelectionGrid.tsx`
- `fe/src/features/spells/SpellSelectionGrid.css`

### Props 제안

```ts
type SpellSelectionGridOption = {
  id: string;
  label: string;
  level?: number | null;
};

type SpellSelectionGridProps = {
  title: string;
  helper?: string;
  options: SpellSelectionGridOption[];
  selectedIds: string[];
  maxSelected: number;
  disabled?: boolean;
  onChange: (selectedIds: string[]) => void;
};
```

### UI 구성

- 상단 요약:
  - `선택됨 8 / 14`
  - 남은 개수
  - 부족/초과 상태
- 검색:
  - 주문명/한글명/id 검색
- 필터:
  - 전체
  - 피해
  - 회복
  - 방어
  - 제어
  - 이동
  - 유틸
  - 주문 레벨
- 주문 카드:
  - 아이콘
  - 짧은 이름
  - 원문/한글 라벨
  - 레벨 badge
  - 선택 체크 표시
  - max 도달 시 미선택 카드 비활성화

### 선택 동작

- 선택되지 않은 주문 클릭:
  - `selectedIds.length < maxSelected`면 추가
  - max 도달 시 추가 불가
- 선택된 주문 클릭:
  - 선택 해제
- 선택 순서:
  - 배열 순서를 유지한다.
  - 서버 DTO에는 기존처럼 `string[]`로 보낸다.

### 접근성

- 카드 button은 `aria-pressed` 사용.
- 선택 개수는 `aria-live` 영역으로 알린다.
- 키보드 Tab/Enter/Space 선택 가능.
- 검색 input과 필터 button에 label 제공.

### 완료 기준

- select 없이 캔트립/슬롯 주문을 다중 선택할 수 있다.
- 선택 개수 제한이 UI에서 즉시 반영된다.
- 기존 `startingSpells.cantrips`, `startingSpells.spells` payload 구조와 호환된다.

## 4단계. 캐릭터 생성창의 시작 주문 UI 교체

### 목표

`CharacterPage.tsx`의 장비와 주문 단계에서 기존 select 렌더링을 `SpellSelectionGrid`로 교체한다.

### 변경 대상

현재 구조:

```tsx
{Array.from({ length: renderedCantripCount }).map((_, idx) => (
  <select ... />
))}

{Array.from({ length: renderedSpellCount }).map((_, idx) => (
  <select ... />
))}
```

변경 후:

```tsx
<SpellSelectionGrid
  title="캔트립"
  options={cantripOptions}
  selectedIds={formState.startingSpells?.cantrips ?? []}
  maxSelected={selectedStartingCantripCount}
  onChange={(cantrips) => updateStartingCantrips(cantrips)}
/>

<SpellSelectionGrid
  title="슬롯 주문"
  options={slotSpellOptions}
  selectedIds={formState.startingSpells?.spells ?? []}
  maxSelected={selectedStartingSlotSpellCount}
  onChange={(spells) => updateStartingSlotSpells(spells)}
/>
```

### 상태 업데이트 규칙

캔트립 변경:

- `startingSpells.cantrips`만 변경한다.
- 기존 `startingSpells.spells`, `preparedSpells`는 유지한다.

슬롯 주문 변경:

- `startingSpells.spells`를 변경한다.
- `preparedSpells`는 새 슬롯 주문 목록에 남아 있는 주문만 유지한다.

예:

```ts
preparedSpells: currentPrepared.filter((spellId) => spells.includes(spellId))
```

### 선택 부족 처리

기존 서버는 정확한 개수의 배열을 요구한다. 따라서 submit 전 validation은 유지한다.

UI에서는 다음처럼 표시한다.

- 부족: `주문 8개 중 5개 선택됨`
- 완료: `선택 완료`
- max 도달: 미선택 카드 disabled

### 완료 기준

- 캐릭터 생성창에서 주문 select가 제거된다.
- 캔트립/슬롯 주문이 카드 선택 UI로 동작한다.
- 준비 주문 checkbox 영역은 선택된 슬롯 주문을 기준으로 정상 갱신된다.
- 기존 서버 validation과 payload가 깨지지 않는다.

## 5단계. 준비 주문 선택 UX 개선

### 목표

준비 주문 선택도 같은 카드 UI 경험으로 맞춘다.

### 배경

D&D 5e에서 다음은 서로 다르다.

- 알고 있는 주문 / 주문책에 넣은 주문
- 오늘 준비한 주문

특히 위저드는 시작 시 주문책에 여러 주문을 넣고, 그중 일부만 준비한다. 현재 UI는 이 차이를 checkbox로 간단히 표현하지만, 처음 보는 사용자에게는 의미가 불명확하다.

### 변경 방향

준비 주문 영역을 별도 섹션으로 분리한다.

예:

```text
2단계: 준비 주문
주문책/습득 주문 중 오늘 바로 사용할 주문을 고릅니다.
선택됨 3 / 5
```

선택지는 `selectedStartingSlotSpells`만 사용한다.

### UI

- `SpellSelectionGrid`를 재사용한다.
- `options`는 선택된 슬롯 주문만 전달한다.
- `maxSelected`는 `startingPreparedSpellLimit`.
- 준비 주문이 없는 직업은 숨긴다.

### 완료 기준

- 준비 주문 선택도 카드 기반으로 가능하다.
- 준비 주문 제한 초과가 UI에서 방지된다.
- 슬롯 주문 해제 시 준비 주문에서도 자동 제거된다.

## 6단계. 주문 목록/메타데이터 중복 정리

### 목표

`CharacterPage.tsx`에 커진 fallback 주문 목록과 표시 로직을 줄인다.

### 변경 방향

- 주문 option 생성은 별도 helper로 이동한다.
- 가능한 경우 `ruleCatalog`의 spell definition을 우선 사용한다.
- static fallback은 `spellPresentation` 또는 `spellOptions` 전용 파일로 이동한다.

### 후보 파일

- `fe/src/features/spells/spellOptions.ts`
- `fe/src/features/spells/spellPresentation.ts`

### 완료 기준

- `CharacterPage.tsx`에서 주문 static 목록/아이콘/라벨 로직이 크게 줄어든다.
- 주문 표시 로직은 spell feature 모듈로 격리된다.

## 7단계. 시각 디자인/반응형 다듬기

### 목표

캐릭터 생성창의 스크롤 이미지 레이아웃 안에서 주문 카드 그리드가 과하게 길어지지 않도록 한다.

### 디자인 요구

- 카드 크기는 작고 정보 밀도는 높게 유지한다.
- 한 화면에 최대한 많은 주문이 보이게 한다.
- 검색/필터는 sticky 또는 섹션 상단 고정이 좋다.
- 선택된 주문은 테두리/체크/배경색이 분명해야 한다.
- max 도달 후 선택 불가 주문은 흐리게 처리한다.

### CSS 제안

- `.spell-selection-grid`
- `.spell-selection-toolbar`
- `.spell-selection-card-grid`
- `.spell-selection-card`
- `.spell-selection-card.is-selected`
- `.spell-selection-card.is-disabled`
- `.spell-selection-count`

### 반응형

- 넓은 화면: 4~6열
- 중간 화면: 3~4열
- 좁은 화면: 2열
- 매우 좁은 화면: 1열 또는 compact list

### 완료 기준

- 긴 주문 목록에서도 생성창 레이아웃이 무너지지 않는다.
- 키보드/마우스 모두 사용 가능하다.

## 8단계. 모든 선택 가능 주문의 고유 아이콘 override 완성

### 목표

초기 구현에서는 분류 기반 fallback 아이콘을 허용하지만, 최종 제품 UX에서는 주문마다 서로 다른 아이콘이 있어야 한다. 같은 불꽃 계열 주문이라도 `Fire Bolt`, `Burning Hands`, `Fireball`, `Wall of Fire`, `Flaming Sphere`가 모두 같은 아이콘이면 빠르게 구분하기 어렵다.

따라서 캐릭터 생성창과 전투 노드에 노출되는 모든 주문은 최종적으로 `spell.id`별 고유 아이콘 override를 가져야 한다.

### 범위

우선 대상:

- `CharacterPage`에서 선택 가능한 모든 캔트립.
- `CharacterPage`에서 선택 가능한 모든 슬롯 주문.
- 전투 노드 주문 버튼에 노출되는 모든 주문.
- P0~P6에서 실행 가능 주문으로 승격된 주문.

장기 대상:

- `future_plan.md`의 장기 범위에 포함된 SRD 주문 319개 전체.

### 구현 방식

`spellPresentation.ts`에 명시 override를 둔다.

```ts
const spellPresentationOverrides: Record<string, SpellPresentation> = {
  'spell.fire_bolt': {
    id: 'spell.fire_bolt',
    shortLabel: '화염 화살',
    iconName: 'game-icons:fire-ray',
    tone: 'fire',
    tags: ['피해', '원거리', '화염', '캔트립'],
  },
  'spell.fireball': {
    id: 'spell.fireball',
    shortLabel: '화염구',
    iconName: 'game-icons:fireball',
    tone: 'fire',
    tags: ['피해', '광역', '화염'],
  },
};
```

### 고유성 기준

최소 기준:

- 같은 주문 선택 화면에 동시에 나타날 수 있는 주문끼리는 같은 `iconName`을 공유하지 않는다.
- 같은 원소/분류 안에서도 형태가 다른 주문은 다른 아이콘을 사용한다.
- fallback 아이콘은 알 수 없는 주문 또는 아직 미노출 주문에만 허용한다.

권장 기준:

- 주문의 주된 플레이 경험을 아이콘에 반영한다.
  - 광역 폭발
  - 단일 투사체
  - 방어막
  - 정신 지배
  - 이동/순간이동
  - 치유
  - 탐지
  - 소환/자연 지형
- 같은 색상/tone을 쓰더라도 실루엣은 다르게 한다.

### 검증 스크립트

선택 가능 주문과 주문 presentation override의 동기화는 루트 스크립트로 검증한다.

```powershell
npm run verify:spell-presentation
```

검증 내용:

- 현재 RuleCatalog에 포함된 실행 주문 전체가 `spellPresentationOverrides`에 존재하는지 확인한다.
- 더 이상 RuleCatalog에 없는 stale override가 남아 있는지 확인한다.
- 전체 주문 override 안에서 `iconName` 중복이 있는지 확인한다.

### 완료 기준

- 현재 선택 가능 주문 전체가 `spellPresentationOverrides`에 존재한다.
- 캐릭터 생성창에서 fallback 아이콘으로 표시되는 선택 가능 주문이 없다.
- 같은 선택 pool 안에서 아이콘 중복이 없다.
- 전투 노드와 캐릭터 생성창이 같은 override를 사용한다.
- 새 주문이 추가될 때 override 누락을 잡는 `verify:spell-presentation` 검증이 존재한다.

## 9단계. 검증 계획

프로젝트 지시에 따라 Codex가 테스트를 직접 돌리지 않고, 사용자가 실행할 테스트를 안내한다.

### 수동 검증

1. 1레벨 위저드 생성:
   - 캔트립 선택 가능.
   - 주문책 주문 6개 선택 가능.
   - 6개 미만이면 생성 전 경고.
   - 6개 도달 시 추가 선택 불가.
2. 5레벨 위저드 생성:
   - 주문책 주문 14개 선택 가능.
   - 드롭다운 반복 없이 카드 선택으로 완료 가능.
3. 5레벨 소서러 생성:
   - known spell 제한만큼 선택 가능.
   - 준비 주문 섹션이 없어야 한다.
4. 5레벨 클레릭/드루이드 생성:
   - 시작 슬롯 주문 선택.
   - 준비 주문 선택 섹션 표시.
   - 준비 주문은 선택한 슬롯 주문 안에서만 고를 수 있음.
5. 슬롯 주문 해제:
   - 해제한 주문이 준비 주문에 있으면 자동 제거.
6. 검색/필터:
   - 한글/영문/id 검색 동작.
   - 필터 변경 후 선택 상태 유지.
7. 접근성:
   - Tab으로 카드 이동 가능.
   - Space/Enter로 선택 가능.

### 권장 빌드

```powershell
npm run build
```

### 권장 정적 검증

주문 추가/삭제 시 presentation override 누락과 아이콘 중복을 확인한다.

```powershell
npm run verify:spell-presentation
```

### 권장 테스트

캐릭터 생성 payload와 서버 검증 회귀:

```powershell
npm run test:quiet -w @trpg/be -- characters.service.spec.ts --runInBand
```

FE 쪽 타입 검증은 build에 포함된다.

전체 회귀가 필요하면 현재 기준 가장 넓은 회귀 스크립트를 사용한다.

```powershell
npm run test:p6-regression
```

## 위험 요소와 대응

### 위험 1. 주문 선택 UI가 너무 커져 생성창이 복잡해짐

대응:

- 검색/필터 제공.
- 카드 compact 디자인.
- 선택 완료/부족 상태를 상단에 고정.
- 준비 주문은 선택된 주문 기반으로만 표시.

### 위험 2. 아이콘 매핑이 부정확하거나 어색함

대응:

- 1차는 fallback 분류 아이콘으로 시작.
- 중요한/자주 쓰는 주문부터 개별 override.
- 최종 단계에서는 모든 선택 가능 주문에 개별 아이콘 override를 부여한다.
- 단, "고유 아이콘"은 새 아트 제작을 뜻하지 않는다. Iconify `game-icons:*` 안에서 주문별로 서로 다른 아이콘을 명시 매핑하는 것을 우선 목표로 한다.

### 위험 3. 전투 노드와 캐릭터 생성창 표시가 불일치

대응:

- 반드시 `spellPresentation` resolver를 공통 사용한다.
- label 기반 매핑을 spell id 기반으로 교체한다.

### 위험 4. 기존 서버 검증과 payload 불일치

대응:

- DTO 구조는 변경하지 않는다.
- 선택 결과는 기존처럼 `startingSpells.cantrips`, `startingSpells.spells`, `startingSpells.preparedSpells` 배열로 보낸다.
- 서버 `resolveStartingSpells` 검증은 유지한다.

### 위험 5. 고레벨 주문 목록이 길어져 성능/가독성이 떨어짐

대응:

- 검색/필터를 기본 제공.
- 필요 시 가상화는 후속 과제로 둔다.
- P6 범위의 주문 수에서는 일반 grid로도 충분할 가능성이 높다.

## 작업 단위 제안

### PR 1. 주문 presentation 공통화

- `spellPresentation.ts` 추가.
- 기존 전투 노드 주문 아이콘 일부를 id 기반으로 이전.
- fallback resolver 추가.
- 빌드 확인.

### PR 2. SpellSelectionGrid 추가

- `SpellSelectionGrid.tsx/css` 추가.
- Storybook이 없다면 CharacterPage 내에서만 우선 사용.
- 접근성 속성 포함.
- 빌드 확인.

### PR 3. 캐릭터 생성창 시작 주문 UI 교체

- 기존 select 렌더링 제거.
- 캔트립/슬롯 주문 카드 선택으로 교체.
- 기존 submit validation 유지.
- 수동 검증.

### PR 4. 준비 주문 카드 UI 전환

- 준비 주문 checkbox를 `SpellSelectionGrid` 재사용으로 교체.
- prepared spell limit UX 개선.
- 슬롯 주문 변경 시 준비 주문 정리 확인.

### PR 5. 정리와 polish

- CharacterPage의 주문 fallback 목록/label helper 정리.
- CSS 반응형 정리.
- 전투 노드와 캐릭터 생성창 표시 일관성 확인.

### PR 6. 모든 선택 가능 주문 고유 아이콘화

- 현재 선택 가능 주문 전체에 `spell.id`별 icon override 추가.
- 선택 pool 안의 중복 아이콘 검증 추가.
- fallback 아이콘 사용 여부 검증 추가.
- 전투 노드/캐릭터 생성창에서 동일 override 사용 확인.

## 완료 기준

이 계획은 다음 조건을 만족하면 완료로 본다.

- 캐릭터 생성창에서 시작 주문을 드롭다운이 아니라 아이콘 카드로 선택한다.
- 선택 개수 제한이 즉시 보이고, 초과 선택이 UI에서 방지된다.
- 캔트립/슬롯 주문/준비 주문의 차이가 화면에서 명확하다.
- 전투 노드와 캐릭터 생성창이 같은 주문 아이콘 resolver를 사용한다.
- 최종적으로 선택 가능 주문 전체가 고유 아이콘 override를 가진다.
- 기존 서버 검증과 API payload는 유지된다.
- `npm run build`가 통과한다.
- `characters.service.spec.ts`가 통과한다.
- 주요 직업 수동 생성 시나리오가 통과한다.
