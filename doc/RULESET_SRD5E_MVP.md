# MVP Ruleset - SRD 5e 기반 최소 룰

## 1. 목적

이 문서는 MVP에서 구현할 D&D 5e SRD 기반 최소 룰 범위를 정의한다.

목표는 SRD 전체를 한 번에 구현하는 것이 아니라, 데모 시나리오를 여러 플레이어가 끝까지 진행할 수 있을 만큼의 판정, 상태, 전투, 캐릭터 구조를 먼저 고정하는 것이다.

실제 플레이 가능 여부와 남은 구현 게이트는 [MVP_PLAYABLE_COMPLETION_PLAN.md](MVP_PLAYABLE_COMPLETION_PLAN.md)를 기준으로 판정한다.

## 2. 룰 범위 원칙

- SRD에 공개된 규칙만 사용한다.
- MVP에서는 규칙의 완전 구현보다 "일관된 플레이 루프"를 우선한다.
- AI는 판정 종류를 제안할 수 있지만, 최종 판정 공식과 상태 변경은 엔진이 수행한다.
- 룰 원문 전체를 UI나 seed 데이터에 대량 복제하지 않는다.
- 룰 데이터는 구조화된 수치, 이름, 짧은 설명, 출처 참조 중심으로 관리한다.

## 3. 캐릭터 범위

### MVP 필수 필드

- 이름
- 종족
- 클래스
- 레벨
- 능력치: STR, DEX, CON, INT, WIS, CHA
- 능력 수정치
- 숙련 보너스
- 최대 HP / 현재 HP / 임시 HP
- AC
- 이동 속도
- 숙련 기술
- 인벤토리
- 장착 무기
- 상태이상

### MVP 제한

- 데모 기본 레벨은 2레벨로 고정한다. 파이터 Action Surge, 로그 Cunning Action, 레인저 1레벨 주문까지 한 세션에서 검증하기 위해서다.
- 멀티클래스는 지원하지 않는다.
- 선택 가능한 클래스는 파이터, 로그, 레인저, 위저드로 제한한다.
- 선택 가능한 종족은 인간으로 제한한다.
- 주문은 구현하기 쉬운 cantrip/1레벨 주문 중심으로 19개만 먼저 지원한다.
- 마법 아이템은 범용적으로 자주 쓰는 10~20개만 먼저 지원한다.

### MVP 선택지

| 영역 | MVP 포함 | MVP 제외 |
| --- | --- | --- |
| 종족 | 인간 | 인간 외 8개 SRD 종족과 하위 종족 |
| 클래스 | 파이터, 로그, 레인저, 위저드 | 바바리안, 바드, 클레릭, 드루이드, 몽크, 팔라딘, 소서러, 워락 |
| 레벨 | 2레벨 데모 캐릭터. 레벨업/성장은 제외하고 시작 템플릿으로 고정한다. | 장기 성장, 멀티클래스, 전체 레벨 자동화 |
| 주문 | 위저드 cantrip/1레벨 중심, 레인저 1레벨 회복/탐색 주문 일부 | 전체 319개 주문 자동화 |
| 마법 아이템 | 포션, 간단한 보너스 장비, 보유의 주머니 등 범용 아이템 | 지능형 아이템, 복잡한 충전/소환/차원 이동 아이템 |

## 4. 판정 범위

### 능력치 판정

기본 공식:

```text
d20 + ability modifier + proficiency bonus if proficient >= DC
```

지원 대상:

- Strength check
- Dexterity check
- Constitution check
- Intelligence check
- Wisdom check
- Charisma check

### 기술 판정

MVP에서는 시나리오 진행에 필요한 기술만 먼저 지원한다.

- Perception
- Investigation
- Stealth
- Persuasion
- Insight
- Athletics
- Acrobatics

### 내성 굴림

MVP에서는 함정, 독, 공포 등 데모에 필요한 경우에만 사용한다.

```text
d20 + saving throw modifier + proficiency bonus if proficient >= DC
```

## 5. 난이도 DC

MVP에서는 다음 DC 테이블을 사용한다.

| 난이도 | DC |
| --- | ---: |
| 쉬움 | 10 |
| 보통 | 15 |
| 어려움 | 20 |

시나리오 노드는 각 판정의 기본 DC를 가진다.
AI는 DC를 임의로 확정하지 못하고, 최대한 `easy`, `medium`, `hard` 후보만 제안한다.

## 6. 주사위 엔진

지원 주사위:

- d4
- d6
- d8
- d10
- d12
- d20
- d100

지원 기능:

- 단일 주사위 굴림
- 여러 개 주사위 굴림
- 보정치 적용
- advantage / disadvantage
- 결과 로그 저장

## 7. 전투 MVP

### 포함

- 전투 시작 / 종료
- initiative 굴림
- 턴 순서 관리
- 기본 공격
- 피해 적용
- 회복 적용
- 방어 또는 대기 액션
- HP 0 이하 상태 처리
- 파이터: 재기의 숨결, 행동 연쇄는 fixture와 테스트 계약을 먼저 만든다.
- 로그: 암습, 교활한 행동은 fixture와 테스트 계약을 먼저 만든다.
- 레인저: 1레벨 기준 기본 무기 공격과 탐험/기술 판정만 우선한다.
- 위저드: 제한된 cantrip/1레벨 주문 시전만 우선한다.

### 제외

- 복잡한 기회 공격
- 엄폐
- 지형 효과
- 세부 이동 거리 검증
- 모든 주문/특수 능력 자동화

## 8. 액션 타입

MVP 엔진은 다음 구조화 액션만 처리한다.

| 타입 | 설명 |
| --- | --- |
| `ability_check` | 능력치 판정 |
| `skill_check` | 기술 판정 |
| `saving_throw` | 내성 굴림 |
| `attack` | 기본 공격 |
| `use_item` | 아이템 사용 |
| `move` | 장면 내 위치 이동 |
| `interact` | 사물/NPC 상호작용 |
| `talk` | NPC와 대화 |
| `request_hint` | 힌트 요청 |
| `freeform` | 엔진 처리 전 추가 확인이 필요한 자유 행동 |

## 9. 상태이상 MVP

MVP에서는 다음 상태만 먼저 지원한다.

- prone
- poisoned
- unconscious
- frightened
- restrained

상태이상은 State Engine의 상태 목록으로 관리하며, Narrator가 임의로 추가할 수 없다.

## 10. 주문 MVP

`generated/srd/spells.jsonl`에는 SRD 주문 319개가 모두 있으나, MVP 엔진이 자동 처리할 주문은 별도 allowlist로 제한한다.

### P0 주문

전투와 판정 루프 검증에 바로 필요한 주문이다.

| 주문 | 이유 | 필요한 엔진 처리 |
| --- | --- | --- |
| `spell.chill_touch` | 현재 hook fixture가 이미 있다. | 원거리 주문 공격, 사령 피해, 치유 차단 |
| `spell.fire_bolt` | 가장 단순한 공격 cantrip. | 원거리 주문 공격, 화염 피해 |
| `spell.magic_missile` | 명중 굴림 없는 피해 예시. | 자동 명중, force 피해 |
| `spell.cure_wounds` | 회복 처리 예시. | 접촉, 회복 굴림, HP 상한 |

### P1 주문 후보

MVP에서 선택/안내는 허용하지만 자동화는 뒤로 미루는 주문이다. 반응, 집중, 소환, 환영, 장기 경보/은신, HP pool 제어 주문은 제외한다.

| 분류 | 후보 |
| --- | --- |
| 공격 cantrip | `acid_splash`, `ray_of_frost`, `shocking_grasp` |
| 기본 1레벨 피해 | `burning_hands`, `thunderwave`, `chromatic_orb` |
| 기본 1레벨 방어/생존 | `mage_armor` |
| 기본 1레벨 이동/탐험 | `jump`, `longstrider` |
| 기본 1레벨 탐지/정보 | `detect_magic`, `identify`, `comprehend_languages` |

### 주문 구현 기준

- allowlist에 없는 주문은 AI가 언급할 수는 있지만 엔진 자동 처리 대신 확인/수동 처리로 보낸다.
- 주문 하나를 자동화하려면 `spellId`, 시전 시간, 사거리, 구성요소, 지속시간, 공격/내성 여부, 피해/회복/상태 변경을 테스트한다.
- 복잡한 자유 효과 주문은 Narrator 설명으로 사실을 만들지 못하게 하고, 백엔드 `StateDiff`가 있는 경우에만 결과를 서술한다.

## 11. 마법 아이템 MVP

`generated/srd/magic_items.jsonl`에는 SRD 마법 아이템 239개가 모두 있으나, MVP 엔진이 자동 처리할 아이템은 범용 아이템만 제한한다.

### P0 아이템

| 아이템 | 이유 | 필요한 엔진 처리 |
| --- | --- | --- |
| `magic_item.bag_of_holding` | 현재 hook fixture가 있다. | 용량, 무게, 파손/초과 거절 |
| `magic_item.potion_of_healing` | 가장 기본적인 소비형 회복. | 사용 행동, 2d4+2 회복, 소모 |
| `magic_item.spell_scroll` | 주문 allowlist와 연동하기 쉽다. | 주문 ID 확인, 소모 |
| `magic_item.weapon_1_2_or_3` | 공격/피해 보너스 검증에 좋다. | MVP에서는 +1만 자동화 |
| `magic_item.armor_1_2_or_3` | AC 계산 검증에 좋다. | MVP에서는 +1만 자동화 |
| `magic_item.shield_1_2_or_3` | AC 계산 검증에 좋다. | MVP에서는 +1만 자동화 |

### P1 아이템 후보

| 분류 | 후보 |
| --- | --- |
| 소모품 | `magic_item.potion_of_climbing`, `magic_item.potion_of_resistance` |
| 기본 전투 보너스 | `magic_item.ammunition_1_2_or_3`, `magic_item.weapon_1_2_or_3`, `magic_item.armor_1_2_or_3` |
| 탐험/편의 | `magic_item.boots_of_elvenkind`, `magic_item.cloak_of_elvenkind`, `magic_item.goggles_of_night` |
| 단순 보호 | `magic_item.ring_of_protection`, `magic_item.cloak_of_protection` |

### 아이템 구현 기준

- 능력치/AC/명중/피해/회복처럼 엔진 결과가 명확한 아이템부터 구현한다.
- 소환, 변신, 지능형 아이템, 다중 충전 효과는 MVP 자동화에서 제외한다.
- 자동화되지 않은 마법 아이템은 compendium 조회와 수동 GM 처리만 지원한다.

## 12. 생성물별 MVP 보강 범위

`ai/generated/srd/`의 전체 catalog는 유지하되, MVP 구현은 아래 파일들만 좁게 보강한다. 여기서 보강은 "파일이 비어 있다"는 뜻이 아니라, MVP 엔진이 자동 처리할 범위를 명확히 고정한다는 뜻이다.

| 파일 | 현재 상태 | MVP에서 더 구현할 것 | MVP에서 하지 않을 것 |
| --- | --- | --- | --- |
| `rules_hooks.json` | 12개 fixture. 바바리안 hook도 섞여 있음. | 파이터/로그/위저드/P0 주문/기본 아이템 중심으로 재정렬하고, 레인저 기본 공격/기술 hook이 필요한지 결정한다. | SRD 전체 룰 hook 생성 |
| `backend_engine_p0_contracts.json` | P0 hook 4개, case 12개. | P0 주문 allowlist, 회복, +1 장비, 파이터/로그 기능 case를 추가한다. | 모든 클래스/주문/아이템 contract 작성 |
| `interpreter_backend_handoff_cases.json` | 3개 예시. | 위저드 주문, 파이터 공격/기능, 로그 암습, 아이템 사용 handoff를 추가한다. | 모든 자연어 행동 유형 예시화 |
| `narrator_input_fixtures.json` | 3개 예시. | 명중/빗나감, 주문 성공/거절, 회복, 아이템 사용, 기능 사용 결과 fixture를 추가한다. | 모든 전투/비전투 서술 fixture |
| `rule_fragments.jsonl` | 주문시전/전투 중심 11개 정적 조각. | MVP allowlist 주문과 상태 처리에 필요한 `healing`, `concentration`, `saving_throw`, `reaction`, `item_use` 조각을 추가한다. | SRD 전체 규칙 fragment화 |
| `rules_cards.jsonl` | 5개 핵심 규칙 파일의 80개 카드. | 인간/4직업/allowlist 주문/아이템 화면에서 필요한 카드만 태그/검색 품질을 보강한다. | 전체 룰북 수준의 UI/검색 DB |
| `equipment_items.jsonl` | 일반 장비 item catalog. 시작 장비 validator는 통과. | 인간 4직업의 시작 장비, 무기/방어구/탄약/도구 참조를 고정 테스트하고 MVP 자동화 대상만 allowlist로 표시한다. | 모든 장비 특수 사용 자동화 |
| `equipment.jsonl` | 8개 장비 규칙 참조 섹션. | 장비 표 표시와 시작 장비 선택 설명에 필요한 요약만 유지한다. | 일반 장비 전체 상세 compendium이나 엔진 hook 대체물로 사용 |

### MVP 우선 작업 순서

1. 클래스/종족 선택 allowlist를 인간, 파이터, 로그, 레인저, 위저드로 고정한다.
2. 주문 allowlist JSON 또는 코드 상수를 만들고, allowlist 밖 주문은 수동 처리로 보낸다.
3. 마법 아이템 allowlist JSON 또는 코드 상수를 만들고, 자동화 가능 여부를 `automated`, `manual`, `excluded`로 나눈다.
4. `rules_hooks.json`에서 MVP와 무관한 바바리안 hook은 P2/backlog로 내리고, 파이터/로그/위저드/기본 아이템 hook을 P0/P1로 올린다.
5. `backend_engine_p0_contracts.json`에 회복, +1 장비, Fire Bolt/Magic Missile, Sneak Attack, Second Wind case를 추가한다.
6. handoff/narrator fixture는 실제 플레이 로그에 가까운 성공/실패 예시만 추가한다.
7. SRD 전체 catalog 수는 유지하되, 런타임 검색기는 MVP allowlist를 우선 필터로 사용한다.

## 13. 시나리오 룰 연동

각 시나리오 노드는 다음 정보를 가진다.

- 요구 판정 후보
- 기본 DC
- 성공 시 StateDiff
- 실패 시 StateDiff
- 성공 시 다음 노드 후보
- 실패 시 대체 노드 후보
- 발견 가능한 단서 목록

## 14. 구현 우선순위

1. 능력치/기술 판정
2. 주사위 엔진
3. HP/AC/피해
4. initiative와 턴 순서
5. 상태이상
6. 제한된 아이템/주문
7. 파이터/로그 핵심 기능
8. 위저드 allowlist 주문
9. 마법 아이템 allowlist
