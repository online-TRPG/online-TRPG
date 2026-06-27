# 프론트엔드 사용자 표시 규칙

이 문서는 사용자 화면에 노출되는 텍스트의 기본 원칙을 정한다.

## 모든 내부 ID 노출 금지

프론트엔드는 사용자에게 내부 식별자를 그대로 표시하지 않는다. 이 규칙은 주문에 한정되지 않고, 플레이어가 보는 모든 도메인 데이터에 적용한다.

금지 대상 예:

- 주문: `spell.fire_bolt`, `spell.magic_missile`
- 아이템/장비: `equipment.potion_of_healing`, `item.longsword`, `itemDefinitionId`
- 직업/서브클래스/특성: `class.wizard.feature.spellcasting`, `subclass.fighter.champion.feature.improved_critical`
- 종족/하위종족/종족 특성: `race.high-elf.trait.subrace_traits`
- 몬스터/상태/지형/시나리오/노드/토큰/행동: `monster.goblin`, `condition.poisoned`, `terrain.wall_of_fire`, `scenario_p2_storm_vault`, `node_rule_smoke_1`

내부 ID는 API payload, 상태 저장, 룰 매칭, 디버깅, 테스트 fixture에서만 사용한다. 사용자 화면에는 반드시 다음 중 하나로 변환한 값을 표시한다.

- 한국어 표시명
- 공식/프로젝트 용어집에 따른 사용자용 이름
- 준비된 표시명이 없을 때의 사람이 읽을 수 있는 fallback 이름

준비된 표시명이 없더라도 raw ID를 그대로 fallback으로 쓰지 않는다. 최소한 namespace를 제거하고 `_`, `-`, `.` 같은 저장용 구분자를 사람이 읽을 수 있는 이름으로 변환한다.

금지 예:

- `치유 물약 / equipment.potion_of_healing`
- `Action Surge / class.fighter.feature.action_surge`
- `Race Elf Trait Base Traits`
- `scenario_p2_storm_vault was not found.`

허용 예:

- `치유 물약`
- `액션 서지`
- `엘프 기본 특성`
- `폭풍 금고의 마지막 비행을 찾을 수 없습니다.`

## 주문 표시명

주문은 `spellPresentation`, SRD 정적 데이터, rule catalog의 사용자용 label을 통해 표시한다.

금지 예:

- `Fire Bolt / spell.fire_bolt`
- `Light / spell.light`
- `spell.magic_missile`

허용 예:

- `화염 화살`
- `빛`
- `마법 화살`

영문명과 한글명이 함께 있는 원천 데이터가 들어오면, 기본 사용자 화면에서는 한글명을 우선 표시한다.

## 아이템/장비 표시명

아이템은 인벤토리의 `name`, SRD 아이템 카탈로그, 세션 경제 상태의 사용자용 표시명을 통해 표시한다.

금지 예:

- `equipment.potion_of_healing`
- `equipment.thieves__tools`
- `itemDefinitionId`

허용 예:

- `치유 물약`
- `도둑 도구`
- `아이템 선택`

## 특성/종족/직업 표시명

캐릭터 특성은 feature ID를 화면에 직접 보여주지 않고, canonical feature/race/class presentation 데이터를 통해 이름과 설명을 표시한다.

금지 예:

- `class.bard.feature.spellcasting`
- `race.elf.trait.base_traits`
- `subclass.wizard.evocation.feature.evocation_savant`

허용 예:

- `주문시전`
- `엘프 기본 특성`
- `방출술의 대가`

## 에러 메시지

사용자용 에러 메시지에서도 내부 ID를 그대로 넣지 않는다. 서버나 프론트가 내부 ID만 가지고 있는 경우, 사용자용 이름으로 매핑한 뒤 표시한다. 매핑이 불가능하면 `선택한 시나리오`, `선택한 아이템`, `선택한 특성`처럼 맥락형 이름을 쓴다.

## 예외

개발자 전용 로그, 테스트 로그, 관리자용 진단 화면처럼 내부 식별자 확인이 목적일 때만 ID를 노출할 수 있다. 이 경우에도 일반 플레이어 화면과 혼동되지 않게 “개발자/진단” 맥락을 명확히 분리한다.
