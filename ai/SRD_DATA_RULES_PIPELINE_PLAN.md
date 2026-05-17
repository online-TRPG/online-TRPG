# SRD 데이터 파이프라인

이 문서는 `translated/`의 긴 SRD Markdown을 repo root의 `srd-data/generated/srd/`에 있는 작은 런타임 JSON으로 바꾸는 현재 기준이다.

한 줄 요약:

> 사람은 `translated/`를 읽고, 서버와 AI는 `srd-data/generated/srd/`를 읽는다.

## 왜 나누는가

`translated/`는 사람이 검수하기 좋은 자료다. 길고, 설명형이고, Markdown 구조가 균일하지 않다.

`srd-data/generated/srd/`는 런타임 자료다. 작고, 구조화되어 있고, 테스트로 개수와 필드를 검증한다.

AI prompt에는 원문 Markdown 전체를 넣지 않는다. 현재 행동에 필요한 entity, rule fragment, hook fixture만 넣는다.

## 현재 원천

| 폴더                   | 내용                                            |
| ---------------------- | ----------------------------------------------- |
| `translated/spells/`   | 주문 색인, 상세, 플레이 참조문                  |
| `translated/items/`    | 일반 장비, 마법 아이템 상세/참조문              |
| `translated/monsters/` | 몬스터/NPC 색인, 스탯블록, 참조문               |
| `translated/races/`    | 종족/하위 종족                                  |
| `translated/classes/`  | 직업/하위 직업                                  |
| `translated/rules/`    | 판정, 전투, 피해, 상태, 휴식, 주문시전, GM 운영 |

## 현재 생성물

| 파일                                     | 개수 | 소비자           | 용도                                       |
| ---------------------------------------- | ---: | ---------------- | ------------------------------------------ |
| `spells.jsonl`                           |  319 | AI + 엔진        | 주문 검색, 시전 검증 후보                  |
| `conditions.jsonl`                       |   15 | AI + 엔진        | 상태 이상 참조                             |
| `rules_cards.jsonl`                      |   80 | AI               | 짧은 규칙 설명                             |
| `rule_fragments.jsonl`                   |   11 | AI               | 행동 해석용 작은 규칙 조각                 |
| `rules_hooks.json`                       |   12 | 백엔드 예정      | deterministic 엔진 hook fixture            |
| `magic_items.jsonl`                      |  239 | AI + 엔진        | 마법 아이템 검색/참조                      |
| `equipment.jsonl`                        |    8 | 엔진             | 장비 표 참조 섹션                          |
| `equipment_items.jsonl`                  |  145 | 캐릭터 생성 + AI | 장비 item ID와 시작 장비 연결              |
| `monsters.jsonl`                         |  317 | AI + 엔진        | 몬스터 표시/참조                           |
| `races.jsonl`                            |    9 | 캐릭터 생성      | 종족 선택지                                |
| `classes.jsonl`                          |   12 | 캐릭터 생성      | 직업, 시작 장비, 주문 진행표               |
| `backend_engine_p0_contracts.json`       |   12 | 백엔드 예정      | P0 hook 테스트 계약                        |
| `interpreter_backend_handoff_cases.json` |    3 | 백엔드 예정      | Interpreter 결과를 hook 요청으로 넘기는 예 |
| `narrator_input_fixtures.json`           |    3 | 백엔드 + AI      | 확정 결과를 Narrator 입력으로 조립하는 예  |
| `source_manifest.json`                   |    1 | 테스트           | 원천 파일 hash/크기/영역                   |
| `srd_qa_report.json`                     |    1 | 검수             | 개수와 필드 coverage                       |

`srd-data/generated/srd/`의 compact catalog는 런타임 자산이다. debug/raw 중간 산출물만 커밋하지 않는다.

## 빌드 명령

```powershell
cd C:\Users\SSAFY\work\S14P31A201\ai
python -m app.srd.build --output-dir generated\srd
```

## 처리 흐름

1. `source_manifest.json`에 원천 파일 hash와 기대 개수를 기록한다.
2. Markdown 제목과 블록을 읽어 entity 후보를 만든다.
3. 이름, ID, page, 수치, 주사위식, action cost, 피해 유형 등을 정규화한다.
4. 규칙 prose는 `rules_cards.jsonl`과 `rule_fragments.jsonl`로 줄인다.
5. 백엔드가 확정해야 할 규칙은 `rules_hooks.json` fixture로 분리한다.
6. 검색기는 현재 행동에 필요한 작은 context만 prompt에 넣는다.
7. QA report와 pytest가 개수, 필드, source citation, hook 연결을 검증한다.

## 백엔드와 AI 경계

| 백엔드 엔진 책임                         | AI 하네스 책임                     |
| ---------------------------------------- | ---------------------------------- |
| HP, 피해, 회복 확정                      | 자연어 행동 해석                   |
| 명중/빗나감/DC 확정                      | 관련 주문/아이템/상태/규칙 ID 식별 |
| 상태 이상 적용/해제                      | 애매한 행동에 확인 질문 생성       |
| 인벤토리/자원/슬롯 변경                  | 확정 결과를 한국어로 서술          |
| 턴 순서와 행동 경제                      | 공개 정보 기반 힌트/요약/NPC 대사  |
| `GameState`, `StateDiff`, `TurnLog` 확정 | 후보와 초안 제공                   |

## 현재 hook fixture

| 우선순위 | Hook ID                                          | 뜻                      |
| -------- | ------------------------------------------------ | ----------------------- |
| P0       | `hook.combat.resolve_attack_roll`                | 공격 명중 판정          |
| P0       | `hook.damage.apply_resistance_vulnerability`     | 면역/저항/취약 적용     |
| P0       | `hook.condition.apply_prone_modifiers`           | 넘어짐 이동/공격 보정   |
| P0       | `hook.spell.cast_chill_touch`                    | 싸늘한 손길 시전 처리   |
| P1       | `hook.item.bag_of_holding_capacity`              | 보유의 주머니 용량 검증 |
| P1       | `hook.class.fighter.second_wind`                 | 파이터 재기의 숨결      |
| P1       | `hook.class.fighter.action_surge`                | 파이터 행동 연쇄        |
| P1       | `hook.class.barbarian.rage`                      | 바바리안 격노           |
| P1       | `hook.class.rogue.sneak_attack`                  | 로그 암습               |
| P2       | `hook.class.fighter.champion_critical_threshold` | 챔피언 치명타 기준      |
| P2       | `hook.class.rogue.cunning_action`                | 로그 교활한 행동        |
| P2       | `hook.class.barbarian.frenzy`                    | 광전사 광분             |

이 fixture는 엔진 구현이 아니다. 백엔드가 나중에 구현할 계약 목록이다.

## 현재 QA 상태

`srd_qa_report.json` 기준:

- 주문 319개, 공통 필드 coverage 100%
- 상태 이상 15개, 누락 효과 없음
- 규칙 fragment 11개, source 누락 없음
- hook fixture 12개, 계약 필드 누락 없음
- 마법 아이템 239개, 공통 필드 coverage 100%
- 몬스터/NPC 317개, 주요 필드 coverage 100%
- 종족 9개, core field 누락 없음
- 직업 12개, core field 누락 없음
- 장비 item 145개, core field 누락 없음
- 캐릭터 생성 validator 입력 준비 상태:
  - `raceValidatorInputReady=true`
  - `classCoreValidatorInputReady=true`
  - `startingEquipmentValidatorInputReady=true`

## 테스트

주요 테스트:

- `app/tests/test_srd_build.py`
- `app/tests/test_srd_retrieval.py`
- `app/tests/test_srd_rules.py`
- `app/tests/test_srd_rule_hooks.py`
- `app/tests/test_srd_items.py`
- `app/tests/test_srd_monsters.py`
- `app/tests/test_srd_character_options.py`

일반 검증:

```powershell
python -m pytest
```

실제 Google AI Studio 검증:

```powershell
$env:RUN_LIVE_GOOGLE_AI_STUDIO='1'; python -m pytest app\tests\test_live_google_ai_studio.py -s
```

## 다음 작업

1. 백엔드 엔진 구현을 시작하면 `BACKEND_ENGINE_INTEGRATION_PLAN.md`의 P0 hook부터 옮긴다.
2. `ACTION-001` 실제 연결 시 `interpreter_backend_handoff_cases.json`를 integration test seed로 쓴다.
3. Narrator 실제 연결 시 `narrator_input_fixtures.json`를 확정 결과 서술 test seed로 쓴다.
4. prompt/schema를 바꾸면 SRD 검색 test와 live smoke를 다시 돌린다.
