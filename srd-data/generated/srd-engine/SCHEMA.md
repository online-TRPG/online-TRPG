# SRD Engine 구조

## 원칙

- 모든 레코드는 `id`, `type`, `schemaVersion`, `name`, `source`를 가진다.
- 표시용 텍스트는 `text` 또는 `raw`에 둔다.
- 엔진/필터/전투에 쓰는 값은 별도 parsed 객체에 둔다.
- 기존 `models.py` 호환을 포기하고, 필요한 경우 adapter로 legacy jsonl을 생성한다.
- 기존 `generated/srd`를 대체하지 않고, 백엔드 룰 엔진 실행 데이터로만 사용한다.

## 파일

- `equipment.jsonl`: 장비, 무기, 방어구, 도구, 탈것, 교역품
- `monsters.jsonl`: 몬스터 스탯블록, 액션, 피해 주사위, 내성, 감각
- `spells.jsonl`: 주문 시전 정보, 공격/내성/피해 요약
- `manifest.json`: 파일 목록과 카운트
- `COMBAT_ENGINE_IMPLEMENTATION_PLAN.md`: MVP 전투 엔진 구현 계획

## 배포 방식

`srd-data/generated/srd-engine`를 원본 산출물로 두고, BE 전투 엔진에는 빌드 시 필요한 파일만 복사한다.

## 추천 추가 파일

- `conditions.v2.jsonl`
- `rules.v2.jsonl`
- `classes.v2.jsonl`
- `races.v2.jsonl`
- `indexes/search-index.v2.json`
- `legacy/*.jsonl` old models.py adapter output
