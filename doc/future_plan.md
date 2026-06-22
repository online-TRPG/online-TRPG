# SRD 5e 룰/콘텐츠 확장 로드맵

작성일: 2026-05-23

## Summary

현재 구조는 `RuleEngineService`, `ActionRuleService`, `CombatService`, `InventoryRuntimeService`, `Scenario`/`GameState` 중심의 engine-heavy 아키텍처를 유지한다. 앞으로 구현할 기능은 단발성 하드코딩으로 추가하지 않고, **룰 데이터 카탈로그 + 공통 런타임 resolver + UI 액션 표면**으로 나눈다.

기본 전제는 SRD 공개 범위만 사용하고, 현재 seed/static data에 이미 있는 12개 직업, 9개 종족, 319개 주문, 317개 몬스터 데이터를 점진적으로 "표시용 데이터"에서 "실행 가능한 룰 데이터"로 승격하는 것이다.

"직업 8종 추가"는 현재 기능 구현이 일부 들어간 파이터/바바리안/로그/레인저 외의 8개 직업을 우선 실행 가능하게 만드는 것으로 본다.

## 문서 역할

이 문서는 SRD 5e 룰/콘텐츠 확장의 **장기 플랜**이다. 여기의 목표 범위는 축소하지 않는다.

보존해야 할 장기 범위:

- 12개 직업.
- 9개 종족.
- 319개 주문.
- 317개 몬스터.
- SRD 공개 범위 안의 대표 서브클래스, 몬스터 특수 능력, 아이템/지형/시나리오 런타임.

[`completed/future_plan_mvp.md`](completed/future_plan_mvp.md), [`completed/future_plan_p1.md`](completed/future_plan_p1.md), [`completed/future_plan_p2.md`](completed/future_plan_p2.md), [`completed/future_plan_p3.md`](completed/future_plan_p3.md)는 이 장기 플랜을 대체하거나 줄이는 문서가 아니다. 완료 문서는 장기 범위로 가는 과정에서 닫은 실행 단계와 검증 기준을 기록한다. 따라서 이전 단계에서 제외된 항목도 이 문서의 장기 목표에서는 계속 유지된다. 다음 실행 계획은 [`future_plan_p4.md`](future_plan_p4.md)를 기준으로 한다.

## 1. 룰 데이터 기반 확장 레이어

### 목표

현재 `featuresJson`, `conditionsJson`, `spellsJson`, `flagsJson`에 흩어진 룰 상태를 정규화된 token 체계로 통일한다. 신규 기능은 서비스별 하드코딩으로 늘리지 않고, 공통 룰 카탈로그와 resolver를 통해 실행한다.

### 구현 방식

- 공통 카탈로그를 둔다.
  - `race_traits`
  - `class_features`
  - `subclass_features`
  - `spell_definitions`
  - `condition_definitions`
  - `monster_abilities`
  - `terrain_effects`
- 각 카탈로그 항목은 최소한 다음 필드를 가진다.
  - `id`
  - `source`
  - `levelRequirement`
  - `trigger`
  - `cost`
  - `targeting`
  - `save`
  - `damage`
  - `duration`
  - `concentration`
  - `scaling`
  - `runtimeEffect`
- 룰 적용 책임을 분리한다.
  - `RuleEngineService`: 순수 계산과 룰 판정.
  - `CombatService`: 전투 중 상태 변경, 행동 자원, 이동, 공격, 반응.
  - `ActionRuleService`: 자연어/명령 액션을 구조화하고 비전투/전투 액션으로 연결.
  - `InventoryRuntimeService`: 아이템 이동, 컨테이너, 장비, 소모품, 던지기/줍기.
- AI는 카탈로그 id를 선택하거나 설명을 보조할 수 있지만, 수치 계산과 상태 변경은 엔진이 확정한다.

### 우선순위

1. 룰 token naming convention 정리.
2. 카탈로그 JSON/seed 구조 추가.
3. 기존 fighter/barbarian/rogue/ranger 기능을 카탈로그 기반으로 점진 이관.
4. 신규 기능은 반드시 카탈로그 id와 resolver를 통해 추가.

## 2. 캐릭터 성장: 종족, 직업, 서브클래스, 레벨업, 휴식

### 종족 특성

종족 특성은 생성 시 고정 보정과 런타임 특성으로 분리한다.

- 고정 보정:
  - 능력치 증가
  - 크기
  - 이동속도
  - 언어
  - 기본 숙련
- 런타임 특성:
  - 암시야
  - 내성 이점
  - 피해 저항
  - 특수 행동
  - 조건부 판정 보너스

구현은 `Race` seed의 기본 수치와 `race_traits` 카탈로그를 분리하는 방향으로 진행한다. 캐릭터 생성 시에는 고정 보정을 `Character`에 반영하고, 런타임 특성은 `featuresJson` 또는 이후 정규화된 feature snapshot에 기록한다.

### 직업 8종 추가

우선 대상은 다음 8개 직업이다.

- 바드
- 클레릭
- 드루이드
- 몽크
- 팔라딘
- 소서러
- 워락
- 위저드

1단계 구현 범위:

- HP와 hit die.
- 숙련 보너스와 숙련 선택.
- 1-3레벨 핵심 직업 기능.
- 주문시전 직업의 기본 주문 슬롯, 캔트립, 준비/습득 주문.
- 전투 UI에서 사용할 핵심 행동/보너스 행동/반응 노출.

2단계 구현 범위:

- 고레벨 기능.
- 직업별 자원 회복.
- 장기 지속 효과.
- 복합 trigger 기능.

### 서브클래스

직업별 SRD 대표 서브클래스를 먼저 1개씩 구현한다.

예상 우선 후보:

- 파이터: 챔피언
- 바바리안: 버서커
- 로그: 씨프
- 레인저: 헌터
- 클레릭: 라이프 도메인
- 위저드: 에보케이션
- 바드: 로어
- 몽크: 오픈 핸드

서브클래스는 `subclass_features` 카탈로그로 관리하고, 레벨업 시점에 선택되며 이후 feature resolver가 자동으로 반영한다.

### 레벨업 시스템

레벨업은 `Character` 원본을 갱신하고, 진행 중 세션에는 `SessionCharacter` snapshot 갱신을 명시적으로 적용한다.

레벨업 wizard 단계:

1. 레벨 증가 대상 확인.
2. HP 증가 방식 선택 또는 평균값 적용.
3. proficiency bonus 재계산.
4. 새 class feature 확인.
5. subclass 선택이 필요한 레벨이면 선택.
6. 주문/캔트립 선택 또는 준비 주문 갱신.
7. ASI/feat 선택이 필요한 레벨이면 처리.
8. 진행 중 세션 snapshot 반영 여부 확인.

### 휴식 시스템

short rest / long rest endpoint를 분리한다.

Short rest:

- hit dice 사용.
- 일부 직업 자원 회복.
- 짧은 지속 효과 종료.
- 전투 중에는 기본적으로 불가.

Long rest:

- HP 회복.
- 주문 슬롯 회복.
- 클래스 자원 회복.
- exhaustion 일부 회복.
- 하루 단위 준비 주문 재설정.
- 장기 지속 상태의 만료 처리.

사람 GM 세션에서는 GM 승인 옵션을 제공하고, AI GM 세션에서는 노드/상황 조건으로 허용 여부를 판단한다.

## 3. 전투 룰 확장

### 상태이상 시스템

`conditionsJson`을 단순 문자열 배열에서 구조화된 condition instance로 발전시킨다.

Condition instance 필드:

- `conditionId`
- `sourceId`
- `duration`
- `saveEnds`
- `stackPolicy`
- `appliedAtRound`
- `expiresAtTurn`

우선 정의할 상태:

- 기절
- 화상
- 중독
- 넘어짐
- 무력화
- 구속
- 공포
- 마비

### 내성 시스템

공격, 주문, 함정, 상태에 공통 적용되는 saving throw resolver를 만든다.

Resolver 입력:

- 대상 능력치.
- DC.
- 숙련 여부.
- advantage/disadvantage.
- 상태/종족/직업 보너스.
- 저항/면역/취약.

Resolver 출력:

- 성공/실패.
- 굴림 결과.
- 적용된 modifier 목록.
- 후속 상태/피해 패킷.

### 엄폐 시스템

VTT 맵의 벽, 문, 지형, 오브젝트를 이용해 cover를 계산한다.

Cover 단계:

- 없음.
- half cover.
- three-quarters cover.
- full cover.

적용 위치:

- 원거리 무기 공격.
- 일부 주문 공격.
- 대상 지정 가능 여부.
- AC 또는 Dexterity save 보너스.

### 준비행동

준비행동은 reaction 기반 pending action으로 저장한다.

저장 정보:

- trigger 조건.
- 보류된 action.
- 만료 시점.
- reaction 소모 여부.
- 원래 행동 비용.

처리 방식은 `GameState.flagsJson.pendingCombatReaction` 계열과 유사하게 둔다. trigger가 발생하면 대상 플레이어 또는 GM에게 실행/취소 선택을 요청한다.

### 집중 시스템

집중 주문 발동 시 기존 집중은 종료한다.

피해를 받을 때:

- concentration save를 자동 요청한다.
- DC는 기본적으로 `max(10, damage / 2)` 기준으로 계산한다.
- 실패 시 집중 주문 효과와 관련 상태를 제거한다.

집중 상태는 caster, spell id, target/effect ids, 시작 라운드, 종료 조건을 함께 저장한다.

### 밀치기/당기기/강제이동

전투 이동 resolver를 재사용한다.

- 이동력은 소모하지 않는다.
- 충돌, 낙하, 위험 지형, 엄폐 변화는 처리한다.
- 기회공격 발생 여부는 규칙별로 명확히 분기한다.
- forced movement는 기본적으로 기회공격을 유발하지 않는 것으로 둔다.

### 광역기

targeting shape resolver를 추가한다.

지원 shape:

- sphere
- cone
- line
- cube

VTT grid 위에서 범위에 포함되는 토큰을 계산하고, 각 대상별 save, 피해, 상태 적용을 개별 기록한다.

## 4. 주문, 몬스터, 아이템, 지형, 시나리오 콘텐츠 확장

### 주문 백여 종 추가

319개 표시 데이터 전체를 한 번에 구현하지 않고, 우선 100개를 실행 가능한 주문으로 승격한다.

1차 분류:

- 공격 주문.
- 회복 주문.
- 버프 주문.
- 디버프 주문.
- 광역 피해 주문.
- 이동 주문.
- 탐색 주문.

2차 구현:

- 각 주문을 공통 spell resolver로 연결.
- 주문별 targeting, component, duration, concentration, save, damage, condition rider를 데이터로 표현.
- 전투 UI와 메인 command interpreter가 같은 spell id를 사용한다.

### 마법 업스케일링

spell slot level을 입력으로 받아 scaling rule을 적용한다.

Scaling 대상:

- 피해 dice.
- target count.
- duration.
- 회복량.
- 생성/소환 수량.

업스케일링 결과는 turn log에 원래 spell level과 사용 slot level을 함께 기록한다.

### 몬스터 특수 스킬

`SrdEngineExecutableMonsterAction`을 확장한다.

표현할 기능:

- multiattack.
- recharge.
- save-based attack.
- aura.
- condition rider.
- limited-use ability.
- legendary-like special은 SRD/프로젝트 허용 범위 안에서만 데이터화.

자동 몬스터 행동은 카탈로그에서 가능한 행동 후보를 가져오고, Actor/AI는 후보 중 선택만 보조한다.

### 아이템 던지기/줍기/상호작용

`InventoryRuntimeService`와 VTT object runtime을 연결한다.

아이템 drop:

- inventory entry에서 수량을 감소.
- map object 또는 token-attached object를 생성.

줍기:

- 거리 검증.
- 행동 비용 검증.
- 컨테이너 용량 검증.
- inventory entry 생성 또는 stack 병합.

던지기:

- improvised attack 또는 ranged attack으로 분기.
- 명중 시 피해/효과 적용.
- 빗나가면 착지 위치에 object 생성.

### 지형 특성

VTT cell에 `terrainEffectId`를 붙인다.

우선 구현:

- difficult terrain.
- hazardous terrain.
- obscurement.
- elevation.
- slippery terrain.
- burning terrain.
- poison cloud.

지형 효과는 이동 resolver, 시야/엄폐 resolver, 상태 적용 resolver에서 함께 참조한다.

### 시나리오 추가

기존 `ScenarioNode` 구조를 유지하되, 새 룰 기능을 검증하는 샘플 encounter를 포함한다.

포함할 노드:

- 휴식 tutorial 노드.
- 함정과 내성 노드.
- 엄폐 전투 노드.
- 광역기 전투 노드.
- 상태이상 전투 노드.
- 사람 GM 개입 예시 노드.

AI GM 모드와 HUMAN GM 모드에서 모두 완주 가능한 형태로 만든다.

## 5. 사람 GM 세션 플레이

### 기본 원칙

사람 GM 세션은 AI GM과 같은 상태 엔진을 쓴다. 차이는 GM만 수동 override 패널을 가진다는 점이다.

### GM 패널 기능

- 노드 이동.
- 장면 텍스트 전송.
- NPC 대사 전송.
- handout 공개.
- 전투 시작/종료.
- 몬스터 수동 조작.
- 판정 DC 설정.
- 상태/HP/아이템 조정.

### 상태 기록

모든 GM 조작은 `TurnLog`와 `StateDiff`에 남긴다.

기록 원칙:

- 누가 조작했는지.
- 어떤 상태가 바뀌었는지.
- 플레이어에게 공개되는 narration이 무엇인지.
- 비공개 GM 메모가 있는지.

### AI 보조

AI 기능은 선택형 보조로 둔다.

가능한 보조:

- NPC 대사 제안.
- 다음 장면 후보.
- 몬스터 행동 추천.
- 묘사 문장 초안.

최종 반영은 GM이 승인해야 한다.

## Test Plan

### 단위 테스트

- race/class/subclass feature resolver.
- level-up 결과 계산.
- short/long rest 자원 회복.
- condition duration/save end/stack policy.
- saving throw, cover, concentration, forced movement, AoE targeting.
- spell upcasting.
- monster special action selection.
- inventory drop/pick/throw.

### 통합 테스트

- 전투 중 준비행동 trigger -> reaction 소모 -> 효과 적용.
- 광역 주문이 여러 대상에게 개별 save와 피해를 적용.
- 엄폐/지형/상태이상이 공격 판정에 함께 반영.
- 사람 GM이 전투와 노드를 수동 조작해도 `GameState`, `TurnLog`, `StateDiff`가 일관됨.

### 시나리오 smoke test

- 신규 샘플 시나리오 1개를 AI GM 모드와 HUMAN GM 모드에서 각각 완주.
- 멀티플레이에서 플레이어별 UI와 GM UI 권한 분리 확인.

## Assumptions

- 구현 범위는 SRD 5e 공개 콘텐츠와 오리지널 시나리오로 제한한다.
- "직업 8종 추가"는 현재 일부 전투 기능이 구현된 파이터/바바리안/로그/레인저 외 나머지 8개 직업을 실행 가능하게 만드는 의미로 본다.
- 기존 `Character`, `SessionCharacter`, `Combat`, `GameState`, `TurnLog`, `StateDiff` 모델은 유지하되, 필요한 경우 룰 카탈로그 테이블 또는 JSON seed를 추가한다.
- 기능 우선순위는 의존성 기준으로 정한다.
  - 룰 카탈로그 정리.
  - 성장/휴식.
  - 전투 공통 시스템.
  - 주문/몬스터/아이템/지형.
  - 시나리오 확장.
