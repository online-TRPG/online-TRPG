# SRD 데이터 및 규칙 파이프라인 계획

## 1. 목적

`ai/translated/`에는 SRD 5.1을 한국어로 정리한 Markdown 자료가 들어 있다. 이 자료는 사람이 검수하고 읽기에는 좋지만, 백엔드 규칙 엔진이나 AI 하네스가 턴 처리 중 바로 쓰기에는 길고 불규칙하다.

이 문서의 목표는 그 Markdown 자료를 다음과 같은 런타임 자료로 바꾸는 것이다.

- 주문, 마법 아이템, 몬스터, 종족, 직업, 장비를 위한 구조화 카탈로그
- AI 프롬프트에 짧게 넣을 수 있는 규칙 카드
- 백엔드 엔진이 나중에 구현해야 할 deterministic 규칙 hook fixture
- 생성된 데이터가 번역 원천과 계속 맞는지 확인하는 검수 리포트와 테스트

기본 원칙:

> 번역 Markdown은 사람이 읽고 검수하는 원천 계층으로 둔다. 런타임은 검증된 생성 데이터만 소비한다.

현재 사용자는 백엔드 엔진 구현은 아직 진행하지 않고, `ai/` 폴더 안에서 할 수 있는 데이터 정제, fixture 작성, 테스트, 문서화에 집중한다.

<<<<<<< HEAD
Google AI Studio로 보내거나 받는 필드, prompt context, JSON schema, 역할별 DTO에 새 항목을 추가할 때는 반드시 `AI_STUDIO_IO_FIELD_REFERENCE.md`에 필드 의미와 책임 경계를 함께 추가한다. 이 기준서 갱신 없이 새 필드를 설계/구현하지 않는다.

=======

> > > > > > > develop

## 2. 현재 원천 자료 구조

원천 폴더는 `ai/translated/`이다.

- `spells/`: 주문 색인, 주문 상세 블록, 플레이 참조문, 검수 메모
- `items/`: 일반 장비 참조, 마법 아이템 색인, 아이템 상세 블록, 플레이 참조문
- `monsters/`: 몬스터 색인, 상세 스탯블록, 플레이 참조문
- `races/`: 종족 및 하위 종족 규칙
- `classes/`: 직업 및 하위 직업 규칙
- `rules/`: 전투, 능력 판정, 피해와 회복, 상태 이상, 휴식, 주문시전, GM 운영 규칙

자료는 영역별로 이미 나뉘어 있지만, 대부분 자연어 설명이다. 따라서 첫 단계는 똑똑한 자동화보다 “누락 없이 뽑고, 어디서 왔는지 추적할 수 있게 만드는 것”이 더 중요하다.

## 3. 생성 산출물

생성 산출물은 `ai/generated/srd/` 아래에 둔다.

현재 repo 결정:

- `ai/generated/srd/`의 compact runtime catalog는 런타임에 필요하므로 repo에 포함한다.
- debug/raw 계열 생성물은 추적하지 않는다.
- `ai/translated/`는 현재 `.gitignore`에 들어 있어 원천 번역 파일 변경은 Git status에 보이지 않는다.

현재/목표 산출물:

| 파일                | 형식  | 주 소비자 | 목적                                        |
| ------------------- | ----- | --------- | ------------------------------------------- |
| `spells.jsonl`      | JSONL | 엔진 + AI | 주문 검색, 시전 검증, 내레이션 사실         |
| `magic_items.jsonl` | JSONL | 엔진 + AI | 아이템 검색, 조율/효과 메타데이터           |
| `equipment.jsonl`   | JSONL | 엔진      | 일반 장비, 방어구/무기/장비 규칙 참조       |
| `monsters.jsonl`    | JSONL | 엔진 + AI | 몬스터 이름, AC/HP/속도/CR, 감각, 행동 참조 |
| `conditions.jsonl`  | JSONL | 엔진 + AI | 상태 이상 효과와 제거 조건                  |

<<<<<<< HEAD
| `equipment_items.jsonl` | JSONL | 캐릭터 생성 + AI | SRD 장비표 기반 방어구/무기/탄약/모험 장비/도구/탈것/차량/교역품 + 시작 장비 선택지 item ID |
| `rules_cards.jsonl` | JSONL | AI 하네스 | 검색 가능한 짧은 규칙 설명 |
| `rule_fragments.jsonl` | JSONL | AI 하네스 | 특정 행동에 필요한 더 작은 규칙 조각 |
| `rules_hooks.json` | JSON | 향후 백엔드 엔진 | deterministic 엔진 구현을 위한 hook fixture |
| `backend_engine_p0_contracts.json` | JSON | 향후 백엔드 엔진 | P0 hook 4개 pure function 테스트용 정상/경계/거절 요청/응답 계약 예제 |
| `interpreter_backend_handoff_cases.json` | JSON | 향후 백엔드 엔진 | Interpreter 출력에서 P0 hook 요청으로 이어지는 integration test seed |
| `narrator_input_fixtures.json` | JSON | 향후 백엔드 엔진 + AI | P0 hook 결과를 Narrator 요청으로 조립하는 서술 입력 fixture |
=======
| `equipment_items.jsonl` | JSONL | 캐릭터 생성 + AI | 시작 장비 선택지에서 추출한 일반 장비 item ID |
| `rules_cards.jsonl` | JSONL | AI 하네스 | 검색 가능한 짧은 규칙 설명 |
| `rule_fragments.jsonl` | JSONL | AI 하네스 | 특정 행동에 필요한 더 작은 규칙 조각 |
| `rules_hooks.json` | JSON | 향후 백엔드 엔진 | deterministic 엔진 구현을 위한 hook fixture |

> > > > > > > develop
> > > > > > > | `source_manifest.json` | JSON | 테스트 + 운영 | 원천 파일 hash, 크기, 영역, 기대 개수 |
> > > > > > > | `srd_qa_report.json` | JSON | 검수 | 필드 coverage와 누락 항목 리포트 |

턴 처리 중에는 긴 Markdown 파일을 읽지 않는다. 런타임은 생성된 작은 데이터만 읽고, AI 프롬프트에는 현재 행동과 관련된 작은 조각만 넣는다.

## 4. 두 계층 모델

### 4.1 카탈로그 데이터 계층

카탈로그 계층은 “하나의 항목”으로 표현할 수 있는 데이터다.

예:

- 주문: 이름, 레벨, 학파, 시전 시간, 사거리, 구성요소, 지속시간, 집중 여부, 의식 여부, 피해, 내성, 공격 방식, 성장, 출처 page
- 마법 아이템: 이름, 분류, 희귀도, 조율 여부, 사용 조건, 충전, 재충전, 보너스, 출처 page
- 몬스터: 이름, 크기, 유형, AC, HP, 속도, 능력치, 내성, 기술, 감각, 언어, CR, 특성, 행동
- 상태 이상: 이름, 기계적 효과, 굴림 보정, 이동 제한, 시야/전투 영향

이 계층은 반복되는 Markdown 섹션에서 파싱하고, 불규칙한 부분은 수동 보정한다.

### 4.2 규칙 지식 계층

규칙 지식 계층은 단일 row로 안전하게 확정하기 어려운 절차형 규칙이다.

예:

- 공격 굴림 처리
- 유리함/불리함
- 엄폐
- 집중
- 사망 내성 굴림
- 붙잡기와 밀치기
- 주문 대상 적법성
- 휴식 회복
- 기습과 우선권
- 상태 이상 상호작용

규칙 지식은 두 갈래로 나눈다.

- deterministic engine hook: 서버/백엔드가 반드시 확정해야 하는 규칙
- AI rule card/fragment: AI가 해석, 설명, 내레이션에 참고할 수 있는 짧은 규칙 설명

AI는 규칙을 인용하거나 설명할 수 있지만, HP, DC, 명중 여부, 피해량, 상태 적용, 상태 변경 같은 게임 사실을 확정하면 안 된다.

## 5. 대표 스키마

이 절은 개발자가 데이터 형태를 빠르게 이해하기 위한 예시다. 실제 생성 모델은 `app/srd/models.py`와 생성 파일을 기준으로 한다.

### 5.1 주문 예시

```json
{
  "id": "spell.acid_arrow",
  "nameEn": "Acid Arrow",
  "nameKo": "산성 화살",
  "level": 2,
  "schoolKo": "방출술",
  "castingTime": { "raw": "1 행동" },
  "range": { "raw": "90피트" },
  "components": {
    "verbal": true,
    "somatic": true,
    "material": "물질 구성요소 원문",
    "raw": "음성, 동작, 물질..."
  },
  "duration": { "raw": "즉시" },
  "concentration": false,
  "playReference": "거리 안의 목표 하나를 향해 산성 화살을 쏜다...",
  "source": {
    "file": "translated/spells/play-reference-a.md",
    "page": "p.114",
    "heading": "Acid Arrow / 산성 화살"
  }
}
```

### 5.2 마법 아이템 예시

```json
{
  "id": "magic_item.bag_of_holding",
  "nameEn": "Bag of Holding",
  "nameKo": "보유의 주머니",
  "categoryRaw": "경이로운 물건",
  "rarityRaw": "비범",
  "requiresAttunement": false,
  "playReference": "외형보다 훨씬 큰 내부 공간을 가진 주머니다...",
  "source": {
    "file": "translated/items/magic-item-play-reference-a-c.md",
    "page": "p.210",
    "heading": "Bag of Holding / 보유의 주머니"
  }
}
```

### 5.3 규칙 카드 예시

```json
{
  "id": "rule.combat.공격_굴림",
  "domain": "combat",
  "titleKo": "공격 굴림",
  "engineOwned": true,
  "aiAssistOnly": true,
  "summaryKo": "공격할 때는 공격 굴림을 한다...",
  "aiAllowedUse": ["interpret_intent", "explain_confirmed_result", "narrate_confirmed_result"],
  "aiForbiddenUse": ["decide_game_truth", "change_game_state", "decide_hit_or_miss"],
  "source": {
    "file": "translated/rules/전투_기본_규칙.md",
    "heading": "공격 굴림"
  }
}
```

### 5.4 규칙 hook fixture 예시

`rules_hooks.json`은 실제 엔진 구현이 아니다. 백엔드가 나중에 구현해야 할 deterministic 함수의 계약이다.

```json
{
  "id": "hook.combat.resolve_attack_roll",
  "domain": "combat",
  "titleKo": "공격 명중 판정",
  "engineFunction": "resolve_attack_roll",
  "trigger": "action.requiresRoll == true ...",
  "consumes": ["naturalD20", "attackBonus", "targetArmorClass", "advantageState"],
  "produces": ["attackRollTotal", "hit", "criticalHit", "criticalMiss"],
  "sourceRuleIds": ["rule.combat.공격_굴림", "rule.spellcasting.공격_굴림"],
  "sourceEntityIds": [],
  "acceptanceChecks": [
    "naturalD20 == 1 always produces hit=false",
    "naturalD20 == 20 always produces hit=true and criticalHit=true"
  ]
}
```

## 6. 처리 파이프라인

### Phase 0. 원천 고정과 manifest 생성

- `source_manifest.json`에 원천 파일 경로, byte 길이, hash, domain을 기록한다.
- 기존 색인 기준 기대 개수를 고정한다.
  - 주문: 319
  - 마법 아이템: 239
  - 몬스터/NPC: 317
- 기대 개수가 맞지 않으면 build 실패로 처리한다.

### Phase 1. Markdown 블록 추출

- 먼저 play-reference 파일의 제목과 bullet metadata를 파싱한다.
- play-reference에 없는 필드만 detail 파일에서 보강한다.
- 모든 추출 블록은 원천 파일과 섹션 제목을 유지한다.
- 원문 설명을 버리지 않는다. 런타임에는 compact `playReference`를 쓰고, 필요하면 debug/raw 산출물에 원문 블록을 둔다.

### Phase 2. 엔티티 정규화

- 이름, ID, page, 주사위 표현, 사거리, 지속시간, 행동 비용, 피해 유형, 능력치명, 상태명, 크기, 아이템 분류를 정규화한다.
- enum처럼 쓸 값은 controlled vocabulary로 관리한다.
  - 능력치: STR, DEX, CON, INT, WIS, CHA
  - 행동 비용: action, bonus_action, reaction, minute, hour, special
  - 굴림 유형: attack, save, check, contest
  - 피해 유형과 상태 이상
- 한국어 표시명과 영어 canonical name은 함께 보존한다.

### Phase 3. 규칙 카드 작성

- `ai/translated/rules/*.md`를 섹션 단위의 작은 card로 바꾼다.
- 각 card에는 역할을 명확히 붙인다.
  - `engineOwned: true`: 백엔드가 확정해야 함
  - `aiAssistOnly: true`: AI가 설명/제안/내레이션에만 사용
  - `gmPolicy: true`: 기계 규칙이 아니라 GM 운영 지침
- `aiForbiddenUse`를 명시해서 AI가 규칙 prose를 최종 권한처럼 쓰지 못하게 한다.

### Phase 4. 엔진 hook fixture 매핑

규칙 카드와 카탈로그 엔티티를 deterministic 엔진 영역에 연결하는 fixture를 만든다.

<<<<<<< HEAD
현재 `generated/srd/rules_hooks.json`에 고정된 fixture는 12개다.
=======
현재 `generated/srd/rules_hooks.json`에 고정된 fixture는 8개다.

> > > > > > > develop

- `hook.combat.resolve_attack_roll`: 공격 명중 판정
- `hook.damage.apply_resistance_vulnerability`: 피해 면역/저항/취약 적용
- `hook.condition.apply_prone_modifiers`: 넘어짐 상태 이동/공격 보정
- `hook.spell.cast_chill_touch`: `spell.chill_touch` 시전 처리
- `hook.item.bag_of_holding_capacity`: `magic_item.bag_of_holding` 용량 검증
- `hook.class.fighter.second_wind`: 파이터 `재기의 숨결` 회복량/자원 소비 검증
- `hook.class.fighter.action_surge`: 파이터 `행동 연쇄` 추가 행동/자원 소비 검증
- `hook.class.fighter.champion_critical_threshold`: 챔피언 치명타 기준 변경 검증
  <<<<<<< HEAD
- `hook.class.barbarian.rage`: 바바리안 `격노` 이점/저항/피해 보너스/집중 제한 검증
- `hook.class.rogue.sneak_attack`: 로그 `암습` 1턴 1회 추가 피해와 조건 검증
- `hook.class.rogue.cunning_action`: 로그 `교활한 행동` 추가 행동 사용 범위 검증
- # `hook.class.barbarian.frenzy`: 광전사 바바리안 `광분` 추가 공격과 탈진 예약 검증
  > > > > > > > develop

현재 검색 상태:

- `SrdRetriever.related_rule_hooks_for_text()`가 플레이어 입력, 관련 엔티티, 관련 rule fragment를 기준으로 필요한 hook fixture를 찾는다.
- `Interpreter` prompt에는 `relatedEngineHooks`가 읽기 전용 참고 정보로 들어간다.
- AI 출력 스키마는 아직 hook ID를 반환하지 않는다. hook은 백엔드가 나중에 참고할 계약이며, AI는 여전히 명중/피해/상태/인벤토리 변경을 확정할 수 없다.

중요:

- 이 fixture는 백엔드 엔진 구현이 아니다.
- 지금 단계에서는 `ai/` 안에서 계약 파일과 테스트만 관리한다.
- 백엔드 엔진 연결은 나중에 `rules_hooks.json`을 기준으로 별도 계획/작업에서 진행한다.

### Phase 5. 검색과 프롬프트 통합

검색기는 다음 입력을 받을 수 있어야 한다.

- 현재 장면 domain
- 행동 type
- target ID
- 언급된 주문/아이템/상태 이름
- 필요한 엔진 check type

검색 결과는 작아야 한다.

- 명시적으로 언급된 엔티티 row
- 현재 행동에 필요한 3-7개 정도의 규칙 카드/조각
- 출처 citation

AI 프롬프트에는 전체 SRD Markdown을 넣지 않는다. `Interpreter`, `Narrator`, 향후 `Actor`, `Director`에는 `relatedEntities`, `relatedRules` 같은 작은 context만 주입한다.

### Phase 6. 검증과 회귀 테스트

필수 검증:

- 원천 manifest와 기대 개수 검사
- 주문/아이템/몬스터 기대 개수 유지
- 모든 catalog row가 안정적인 ID, 이름, 출처, 표시 텍스트를 가짐
- 주사위 표현은 파싱하거나 `text_only`로 명시
- `engineOwned` 규칙은 AI 출력에서 최종 판정으로 쓰이지 않음
- 검색 결과가 전체 파일이 아니라 좁은 context만 반환
- prompt payload가 설정한 길이 예산을 넘지 않음
- 몬스터 `nameKo`에 영어 placeholder가 남지 않음
- rule hook fixture의 `sourceRuleIds`, `sourceEntityIds`가 실제 생성 catalog에 존재함
  <<<<<<< HEAD
- 실제 Google AI Studio 검증은 기본 테스트에서는 skip하고, `RUN_LIVE_GOOGLE_AI_STUDIO=1`과 `GOOGLE_API_KEY`가 있을 때만 실행함
  - 주문 공격: `Chill Touch` + 주문 공격/공격 굴림 hook
  - 마법 아이템: `Bag of Holding` + 용량 검증 hook
  - 상태 이상: `Prone` + 넘어짐/공격 굴림 hook
  - # 직업 기능: 파이터 `재기의 숨결`, `행동 연쇄`, 바바리안 `격노`, 로그 `암습`, 로그 `교활한 행동`, 바바리안 `광분` + class feature hook
    > > > > > > > develop

## 7. 백엔드와 AI의 책임 경계

### 백엔드 엔진 책임

- HP 변경
- AC/명중/빗나감 판정
- 피해와 회복 총량
- DC 선택
- 내성/판정/성공/실패 결과
- 상태 적용/제거
- 인벤토리 변경
- 주문 슬롯 소비
- 집중 상태
- 이동 적법성
- 턴 순서와 행동 경제

### AI 하네스 책임

- 자연어 행동 해석
- 언급된 규칙, 주문, 아이템, 대상, 애매한 의도 식별
- 백엔드가 결과를 확정한 뒤 내레이션 초안 작성
- 허용된 장면/규칙 context 안에서 힌트 생성
- 로그 요약
- NPC 행동 후보 제안

AI는 후보를 제안할 수 있지만, 게임 상태를 직접 확정하면 안 된다.

### 공유 경계

AI가 반환할 수 있는 후보:

- `mentionedSpellId`
- `mentionedItemId`
- `mentionedConditionIds`
- `requestedActionType`
- `requiredRuleCheckIds`
- `clarificationQuestion`
- `narrationDraft`

백엔드는 이 후보를 받아서 accepted/rejected game action으로 바꾼다.

## 8. 구현 진행 상태

### Milestone 1. 데이터 inventory와 build skeleton

상태: 완료.

- `ai/app/srd/` 패키지 추가
- `source_manifest.json` 생성
- build command 추가
- parser smoke test와 count test 추가
- compact generated catalog는 repo에 포함

생성 명령:

```powershell
python -m app.srd.build --output-dir generated\srd
```

### Milestone 2. 주문

상태: 완료.

- `spells/INDEX.md`와 `spells/play-reference-*.md` 파싱
- `spells.jsonl` 생성
- 319개 주문 생성
- 공통 필드 coverage 100%
- 한국어/영어 이름 검색 지원
- `Interpreter`에 주문 관련 SRD context 주입

### Milestone 3. 상태 이상과 핵심 규칙

상태: 완료.

- `conditions.jsonl` 15개 생성
- `rules_cards.jsonl` 80개 생성
- `rule_fragments.jsonl` 11개 생성
- spell/rule prompt context를 전체 prose가 아니라 작은 fragment로 축소
- AI가 engine-owned 결정을 확정하지 못하도록 validator와 prompt 경계 강화

### Milestone 4. 마법 아이템과 장비

상태: 완료.

- `magic_items.jsonl` 239개 생성
- 공통 필드 coverage 100%
- `equipment.jsonl` 8개 참조 섹션 생성
- 아이템 영어/한국어 이름 검색 지원
- 첫 deterministic item fixture로 `magic_item.bag_of_holding` 용량 검증 계약 추가

### Milestone 5. 몬스터

상태: 1차 완료.

- `monster-play-reference-*.md`에서 317개 몬스터/NPC row 생성
- `monsters.jsonl` 생성
- 이름, 출처, AC/HP/속도/CR, 감각, 언어, 특성, 행동, 전설 행동, compact playReference 포함
- `nameKo`에 영어 placeholder가 남지 않도록 검수 테스트 추가

주의:

- 현재 몬스터 데이터는 검색/표시/내레이션 참조용이다.
- 전투 자동화는 parser confidence가 높은 필드와 별도 엔진 테스트가 생긴 뒤에만 사용한다.

### Milestone 6. 직업과 종족

상태: 1차 완료.

직업/종족은 턴 루프보다 캐릭터 빌더에 더 가까우므로, 주문/규칙/아이템/몬스터보다 후순위다.

완료한 일:

- `races.jsonl` 9개 생성
- `classes.jsonl` 12개 생성
- 각 row에 한국어명, 영어명, 핵심 raw 필드, 요약, source citation 보존
- 종족은 크기, 속도, 능력치 증가, 언어, 하위 종족, trait 요약, 드래곤본 혈통 선택지를 1차 추출
- 직업은 hit die, 주요 능력치, 내성 굴림, 방어구/무기/도구 숙련, 기술 선택, 시작 장비, 주문시전 공식, SRD 하위 직업, 레벨별 핵심 기능, 전체 레벨 진행표를 1차 추출
- 시작 장비는 기존 raw bullet을 유지하면서 `startingEquipmentChoices`에 선택 그룹 단위로 추가 구조화
- 시작 장비 option 안에는 `itemRefs`와 분해된 `items`를 넣는다.
- `equipment_items.jsonl`은 SRD 방어구/무기/탄약/모험 장비/도구/탈것/차량/교역품 seed와 시작 장비 선택지 item을 병합해 145개 생성
  - 방어구는 `armorCategory`, `armorClassRaw`, `strengthRequirementRaw`, `stealthRaw`, `costRaw`, `weightRaw`를 가진다.
  - 무기는 `weaponCategory`, `weaponRange`, `damageRaw`, `damageType`, `rangeRaw`, `propertiesRaw`, `costRaw`, `weightRaw`를 가진다.
  - 탄약은 표준 묶음 가격/무게와 시작 장비 수량을 함께 보존한다.
  - 모험 장비/도구/탈것/차량/교역품은 SRD 영문 표 이름, 한국어 표시명, 가격, 무게, 분류, source table을 보존한다.
  - 한국어 시작 장비명이 SRD 영문 seed와 같은 항목을 가리키면 canonical seed ID로 병합한다. 예: `도둑 도구` -> `equipment.thieves__tools`, `주문책` -> `equipment.spellbook`.
- 직업 기능은 `featureReferences`에 class/subclass feature id, source heading, 획득 레벨, 요약을 추가 구조화
- 주문시전 진행표는 `spellcastingProgression`에 캔트립, 알고 있는 주문, pact magic 슬롯, 주문 슬롯 레벨별 값을 추가 구조화
- 파이터/챔피언 feature 중 엔진 책임이 명확한 3개를 deterministic hook fixture로 추가
- 바바리안 `격노`, 로그 `암습`, 로그 `교활한 행동`, 바바리안 `광분`을 deterministic hook fixture로 추가
- 한국어/영어 이름 검색 지원
- `srd_qa_report.json`에 `characterOptionValidation`을 추가해 캐릭터 생성 validator 입력 준비 상태를 검수

현재 검수 결과:

- 종족 validator 입력: 준비됨. 9개 종족 모두 이름, 크기, 속도, 능력치 증가, 언어, trait, source page를 가진다.
- 직업 core validator 입력: 준비됨. 12개 직업 모두 이름, hit die, 주요 능력치, 내성, 숙련, 기술 선택, 1-20레벨 진행표, feature reference, source page를 가진다.
- 시작 장비 validator 입력: 준비됨. `translated/classes/` 원천 누락에 대비해 SRD 시작 장비 fallback을 빌더에 고정했고, 12개 직업 모두 `startingEquipmentChoices`를 가진다.
- 장비 item validator 입력: 준비됨. SRD 방어구/무기/탄약 표, 모험 장비, 도구, 탈것/차량, 교역품과 class 시작 장비 item ref가 `equipment_items.jsonl`에서 같은 ID 체계로 병합된다.
- 주문시전 진행표 validator 입력: 1차 준비됨. `spellcastingProgression`은 class level, cantrip/spell known, pact magic slot, spell slot count를 정수 기반 typed row로 생성한다.

남은 일:

- 장비 한국어 alias/UI 표시명: 1차 완료. 현재 확장 seed는 SRD 영문 표 이름을 source-of-truth로 보존하고, `nameKo`와 `aliasesKo`에 한국어 표시명을 함께 둔다.
- 캐릭터 생성 validator와 연결할 때 필요한 필드명 확정. `ClassSpellcastingProgression`은 `AI_SHARED_TYPES_ALIGNMENT.md` 기준으로 유지한다.
- `CheckRequest`, `DiceResult`, `AiTrace`, `StructuredAction`의 shared-types adapter는 `AI_SHARED_TYPES_ALIGNMENT.md` 기준으로 구현한다.
- 실제 interpreter/narrator 프롬프트 고도화: 1차 완료. 플레이 로그 기반 후속 지시, outcome narration 차단, `stateDiffSummary.summary` 중심 visible summary 규칙을 추가했다.

## 9. AI 하네스 쪽 변경 지점

현재 또는 권장 파일:

- `AI_STUDIO_IO_FIELD_REFERENCE.md`: Google AI Studio 요청/응답 및 prompt context 필드 의미 기준서. 새 입출력 필드 추가 시 반드시 갱신
- `app/srd/models.py`: 생성 SRD 엔티티와 fixture 모델
- `app/srd/build.py`: Markdown에서 JSONL/JSON을 생성하는 entrypoint
- `app/srd/retrieval.py`: 이름/domain/action 기반 검색과 로딩
- `app/tests/test_srd_build.py`: build count와 schema 테스트
- `app/tests/test_srd_retrieval.py`: 좁은 검색 테스트
- `app/tests/test_srd_rule_hooks.py`: hook fixture 계약 테스트
- `app/tests/test_live_google_ai_studio.py`: 실제 Google AI Studio 호출 smoke test. 기본은 skip, live 검증 때만 실행

프롬프트 쪽 원칙:

- `interpreter.v1.md`는 `relatedEntities`, `relatedRules`를 받는다.
- 인식된 주문/아이템/상태는 ID로 반환하게 한다.
- `narrator.v1.md`는 백엔드가 확정한 결과에 대해서만 규칙 설명과 내레이션을 한다.
- `interpreter.v1.md`는 플레이 로그의 `rawText`를 플레이어 선언으로 보고, 결과 서술처럼 들리는 입력이나 불명확한 후속 지시는 확인 질문으로 돌린다.
- `narrator.v1.md`는 `CheckRequest`, `DiceResult`, `NarratorStateDiffSummary`의 확정 사실만 과거형 한국어로 표현하고, `stateDiffSummary.summary`를 `visibleSummary`의 앵커로 삼는다.
- 향후 `actor`/`director` prompt에서도 rule card는 advisory context일 뿐이다.

스키마/validator 원칙:

- AI 출력에는 후보 field를 둔다.
  - `mentionedSpellId`
  - `mentionedItemId`
  - `mentionedConditionIds`
  - `requiredRuleCheckIds`
  - `rulesConfidence`
- AI가 최종 상태 변경을 직접 확정하면 validation fail로 처리한다.

## 10. 품질 게이트

실제 플레이에 생성 데이터를 쓰기 전 지켜야 할 조건:

- 모든 생성 row가 source citation을 가져야 한다.
- parser warning이나 누락은 QA report에 보여야 한다.
- generated ID는 build마다 안정적이어야 한다.
- generated artifact는 repo의 원천 파일에서 재현 가능해야 한다.
- LLM prompt에 SRD Markdown 전체 파일을 넣으면 안 된다.
- AI 출력은 backend engine이 수락하기 전까지 후보로만 취급한다.
- `rules_hooks.json`은 실제 engine function 구현 전까지 fixture/계약으로만 본다.

## 11. 남은 결정 사항

아직 제품/구현 결정을 더 해야 하는 부분:

- class/race catalog를 지금 MVP에 포함할지 여부
- 정확한 이름 검색만 유지할지, 나중에 vector search를 추가할지 여부
- API 응답에서 한국어 표시명과 영어 canonical name 중 무엇을 primary로 둘지
- 불규칙한 주문/아이템/몬스터에 수동 patch를 어느 정도 허용할지
- 몬스터 데이터를 MVP 전투 자동화까지 쓸지, GM/AI 참조용으로만 둘지
- `rules_hooks.json`을 백엔드 엔진 테스트로 옮기는 시점과 범위. 1차 연결 계획은 `BACKEND_ENGINE_INTEGRATION_PLAN.md`에 분리했다.

권장 기본값:

- 현재는 `ai/` 안에서 generated catalog, fixture, 테스트를 안정화한다.
- 백엔드 연결은 `BACKEND_ENGINE_INTEGRATION_PLAN.md`의 P0/P1/P2 순서로 진행하되, 이번 단계에서는 구현하지 않는다.
- vector DB 없이 exact name/entity/rule-card 검색으로 MVP를 진행한다.
- compact JSONL/JSON catalog는 런타임에 필요하므로 repo에 포함한다.
- debug/raw 생성물은 커밋하지 않는다.

## 12. 다음 작업

현재 요청 기준 다음 작업은 백엔드 구현이 아니라 AI 폴더 내 작업으로 제한한다.

우선순위:

1. 백엔드 엔진 구현을 시작할 때는 `BACKEND_ENGINE_INTEGRATION_PLAN.md`의 P0 hook부터 옮긴다.
2. shared-types adapter 구현을 시작할 때는 `AI_SHARED_TYPES_ALIGNMENT.md`의 필드 매핑표를 따른다.
3. live Google AI Studio 회귀는 프롬프트/스키마 변경 뒤 다시 실행한다.

현재 생성 명령:

```powershell
python -m app.srd.build --output-dir generated\srd
```

실제 Google AI Studio 검증 명령:

```powershell
$env:RUN_LIVE_GOOGLE_AI_STUDIO='1'; python -m pytest app\tests\test_live_google_ai_studio.py -s
```

현재 live 검증은 9개 시나리오를 실행한다.

2026-04-28 실행 결과: 9개 모두 통과.

- `chill_touch_spell_attack`
- `bag_of_holding_item_capacity`
- `prone_condition_context`
- `fighter_second_wind_feature`
- `fighter_action_surge_feature`
- `barbarian_rage_feature`
- `rogue_sneak_attack_feature`
- `rogue_cunning_action_feature`
- `barbarian_frenzy_feature`

현재 생성 개수:

- 주문: 319
- 상태 이상: 15
- 규칙 카드: 80
- 규칙 fragment: 11
- 규칙 hook fixture: 12
- 백엔드 P0 contract case: 12
- Interpreter -> backend handoff case: 3
- Narrator input fixture: 3
- 마법 아이템: 239
- 몬스터/NPC: 317
- 종족 option: 9
- 직업 option: 12
- 장비 item: 145
- 장비 참조 섹션: 8
