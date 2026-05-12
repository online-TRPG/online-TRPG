# SRD 번역 원천 지도

이 폴더는 사람이 검수하는 SRD 5.1 한국어 원천 자료다.

런타임은 이 Markdown을 직접 읽지 않는다. 서버와 AI prompt는 `generated/srd/`의 JSON/JSONL catalog를 읽는다.

## 폴더 구조

| 폴더 | 내용 | 런타임 생성물 |
| --- | --- | --- |
| `spells/` | 주문 색인, 상세, 플레이 참조문 | `spells.jsonl` |
| `items/` | 일반 장비, 마법 아이템 | `magic_items.jsonl`, `equipment.jsonl`, `equipment_items.jsonl` |
| `monsters/` | 몬스터/NPC 색인, 상세, 플레이 참조문 | `monsters.jsonl` |
| `races/` | 종족/하위 종족 | `races.jsonl` |
| `classes/` | 직업/하위 직업/시작 장비 | `classes.jsonl`, `equipment_items.jsonl` |
| `rules/` | 판정, 전투, 피해, 상태, 휴식, 주문시전, GM 운영 | `rules_cards.jsonl`, `rule_fragments.jsonl`, `rules_hooks.json` |

## 현재 coverage

| 영역 | 현재 기준 |
| --- | ---: |
| 주문 | 319 |
| 마법 아이템 | 239 |
| 몬스터/NPC | 317 |
| 상태 이상 | 15 |
| 종족 | 9 |
| 직업 | 12 |
| 장비 item | 145 |
| 규칙 카드 | 80 |
| 규칙 조각 | 11 |
| deterministic hook fixture | 12 |

## 읽는 법

- 플레이 중 빠른 참조: `play-reference-*.md`
- 원문 대조/세부 검수: `*-details-*.md`
- 전체 목록 확인: `INDEX.md` 또는 `*-index.md`
- 누락 방지 기준: `*_검수_기준.md`

진행표 성격의 파일은 과거 작업 흔적에 가깝다. 현재 완료 여부는 `generated/srd/srd_qa_report.json`과 테스트 결과를 기준으로 본다.

## 수정 규칙

1. 원문명과 한국어명을 같이 남긴다.
2. 페이지, heading, source 정보를 지우지 않는다.
3. 수치, 주사위식, 행동 비용, 휴식 조건은 원문 대조가 가능하게 둔다.
4. 번역 Markdown을 고치면 `python -m app.srd.build --output-dir generated\srd`를 다시 실행한다.
5. 생성 개수나 QA가 흔들리면 원천 Markdown과 parser를 함께 확인한다.

## 검증 명령

```powershell
cd C:\Users\SSAFY\work\S14P31A201\ai
python -m app.srd.build --output-dir generated\srd
python -m pytest app\tests\test_srd_build.py app\tests\test_srd_retrieval.py app\tests\test_srd_rule_hooks.py app\tests\test_srd_character_options.py
```
