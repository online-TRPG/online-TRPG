# SRD Engine 구조

## 원칙

- 모든 레코드는 `id`, `type`, `schemaVersion`, `name`, `source`를 가진다.
- 표시용 텍스트는 `text` 또는 `raw`에 둔다.
- 엔진/필터/전투에 쓰는 값은 별도 parsed 객체에 둔다.
- 기존 `models.py` 호환을 포기하고, 필요한 경우 adapter로 legacy jsonl을 생성한다.
- 기존 `generated/srd`를 대체하지 않고, 백엔드 룰 엔진 실행 데이터로만 사용한다.

## 파일

- `equipment.jsonl`: 장비, 무기, 방어구, 도구, 탈것, 교역품
- `classes.jsonl`: 클래스별 실행 규칙. 현재 MVP는 `class.wizard` 1레벨 주문시전 규칙/Wizard 주문 목록, `class.fighter` 1레벨 전투 규칙, `class.ranger` 1레벨 전투/주적 규칙, `class.rogue` 1레벨 전투/기술 규칙을 포함한다.
- `monsters.jsonl`: 몬스터 스탯블록, 액션, 피해 주사위, 내성, 감각
- `spells.jsonl`: 주문 시전 정보, 공격/내성/피해 요약
- `spellcasting_rules.json`: 주문 명중, 주문 내성 DC, 슬롯, 캔트립, 집중 공통 규칙
- `manifest.json`: 파일 목록과 카운트
- `COMBAT_ENGINE_IMPLEMENTATION_PLAN.md`: MVP 전투 엔진 구현 계획

## 주문 실행 필드

`spells.jsonl`의 주문 레코드는 기존 표시용 필드와 별도로 MVP 실행에 필요한 구조화 값을 둔다.

- `casting.actionKind`: `action`, `bonus_action`, `reaction` 중 하나.
- `casting.resourceCost`: 캔트립은 `{ "kind": "none", "ruleId": "rule.cantrip_no_spell_slot" }`, 1레벨 주문은 `{ "kind": "spell_slot", "slotLevel": 1, "slotKey": "1st_level_spell_slot", "quantity": 1, "ruleId": "rule.first_level_spell_slot_cost" }`.
- `targeting`: 대상 유형, 대상 수, 시야/청각/접촉 조건, 범위형 주문의 반경/정렬 규칙.
- `resolution`: `spell_attack`, `saving_throw`, `automatic_hit`, `healing`, `buff`, `utility`, `reaction_defense`, `hp_pool_condition` 등 백엔드 처리 분기.
- `effects.damage`: 피해 주사위, 피해 유형, 적용 조건, 캔트립 스케일링.
- `effects.healing`: 회복 주사위, 주문시전 능력 수정치 추가 여부, 고레벨 슬롯 스케일링.
- `effects.buffs`: AC, 공격 굴림, 내성 굴림, 능력 판정, 불리점 같은 지속/소모형 보너스.
- `effects.conditions`: `unconscious`처럼 상태가 직접 적용되는 효과.
- `effects.special`: 엄폐 무시, Magic Missile 무효, 빛 반경, Sleep HP 풀 정렬 같은 주문별 특수 처리.

공통 계산식은 개별 주문에 중복 저장하지 않고 `spellcasting_rules.json`의 rule id를 참조한다.

## 클래스 주문시전 실행 필드

`classes.jsonl`의 `class_rule` 레코드는 클래스/레벨별 주문 런타임 상태를 초기화하기 위한 구조화 값을 둔다.

- `levelRules[].proficiencyBonus`: 해당 클래스 레벨의 숙련 보너스.
- `levelRules[].spellcasting.ability`: 주문시전 능력치. Wizard 1레벨은 `intelligence`.
- `levelRules[].spellcasting.cantripsKnown`: 시작 캔트립 습득 수.
- `levelRules[].spellcasting.spellbook`: 주문책 보유 주문 수와 선택 출처. Wizard 1레벨은 1레벨 위저드 주문 6개.
- `levelRules[].spellcasting.preparedSpells`: 준비 주문 계산식. Wizard는 `max(1, wizardLevel + intelligenceModifier)`.
- `levelRules[].spellcasting.spellSlots`: 슬롯 최대치와 리소스 키. Wizard 1레벨은 `1st_level_spell_slot` 2개.
- `levelRules[].spellcasting.ritualCasting`: 의식 태그, 주문책 보유, 미준비 시전, 슬롯 미소모, 시전 시간 +10분 조건.
- `levelRules[].spellcasting.arcaneRecovery`: 1레벨부터 하루 한 번 짧은 휴식 후 슬롯 레벨 총합 `ceil(wizardLevel / 2)`만큼 회복.
- `mvpSpellList`: 현재 구현 대상 주문 allowlist. Wizard MVP는 `Fire Bolt`, `Light`, `Magic Missile`, `Shield`, `Sleep` 5개다.

## 클래스 전투 실행 필드

Fighter처럼 주문시전이 없는 클래스도 `classes.jsonl`에 1레벨 전투 초기화와 기능 데이터를 둔다.

- `hitDie`, `levelRules[].hitPoints`: 1레벨 HP와 히트 다이스 계산식.
- `levelRules[].proficiencies`: 방어구, 무기, 도구, 내성, 기술 선택지.
- `equipmentChoiceGroups`: 캐릭터 생성에서 선택해야 하는 시작 장비 묶음. 특정 아이템은 `itemId`, 범주 선택은 `selectionKind`로 표현한다.
- `levelRules[].classFeatures`: Fighting Style, Second Wind 같은 클래스 기능 실행 데이터.
- `levelRules[].actionResources`: Action, Bonus Action, Reaction, Movement, Feature Use 초기 자원.
- `levelRules[].attackRules`: 근접/원거리/Finesse 무기 공격 명중과 피해 계산식.
- `levelRules[].excludedFeaturesBeforeLevel`: 1레벨에 없어야 하는 Action Surge, Martial Archetype, Extra Attack 같은 후속 기능의 시작 레벨.
- `fixedEquipment`: 선택 없이 항상 받는 시작 장비. Ranger의 장궁, 화살통, 화살 20개처럼 선택 그룹 밖의 장비를 표현한다.
- `classFeatures[].effects`: Favored Enemy처럼 공격/피해가 아니라 특정 판정에 유리함을 주는 기능 효과를 구조화한다.
- `classFeatures[].doesNotAffect`: Favored Enemy가 명중, 피해, AC에 직접 영향을 주지 않는다는 부정 규칙을 명시한다.
- `classFeatures[].choice`: Expertise처럼 플레이어가 기능 적용 대상을 선택해야 하는 규칙을 표현한다.
- `classFeatures[].validIfAny`: Sneak Attack처럼 여러 발동 조건 중 하나를 만족하면 되는 규칙을 표현한다.
- `twoWeaponFighting`: 쌍수 보조 공격 조건, 보조 공격 피해 수정치, Sneak Attack 재시도 가능성을 표현한다.

## 배포 방식

`srd-data/generated/srd-engine`를 원본 산출물로 두고, BE 전투 엔진에는 빌드 시 필요한 파일만 복사한다.

## 추천 추가 파일

- `conditions.v2.jsonl`
- `rules.v2.jsonl`
- `classes.v2.jsonl`
- `races.v2.jsonl`
- `indexes/search-index.v2.json`
- `legacy/*.jsonl` old models.py adapter output
