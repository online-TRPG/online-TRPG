# Demo Scenario Examples

이 문서는 [../scenarios/DEMO_SCENARIO.md](../scenarios/DEMO_SCENARIO.md)의 시연, 구현, 운영 예시를 분리한 참고 문서다.

## 플랫폼 기능 테스트 체크리스트

### Story 노드

```text
- NPC 이미지 표시
- 배경 이미지 표시
- GM 메모 / 플레이어 공개 텍스트 분리
- 보상 표시
- 다음 노드 이동
```

### Exploration 노드

```text
- 맵 표시
- 플레이어 토큰 배치
- Fog of War 수동 공개
- 조사 포인트 클릭/표시
- 판정 요청
```

### Combat 노드

```text
- Initiative
- 토큰 이동
- 적 HP 관리
- 공격/피해 굴림
- 엄폐/어려운 지형 메모
- 전투 종료 후 다음 노드 이동
```

## 구현용 JSON 예시

```json
{
  "id": "N06",
  "type": "combat",
  "title": "우물 아래 전투",
  "playerText": "마지막 방은 넓은 지하 저수조다...",
  "gmText": "고블린들은 절반 이상 쓰러지면 항복하거나 도주한다.",
  "mapAsset": "well_chamber_battlemap.png",
  "tokens": [
    {
      "type": "monster",
      "srdRef": "Goblin",
      "countFor3Players": 3,
      "countFor4Players": 4
    }
  ],
  "terrain": [
    {
      "name": "상자",
      "effect": "반엄폐, AC +2"
    },
    {
      "name": "검은 물웅덩이",
      "effect": "어려운 지형"
    }
  ],
  "nextNodes": ["N07"]
}
```

## 데모 운영 팁

```text
- 처음 테스트는 PC 3명 기준으로 진행
- N04 Giant Rat는 3~4마리만 사용
- N06 Goblin은 3마리만 사용
- 전투가 길어지면 고블린 항복 처리
- 플레이어가 길을 못 찾으면 페린의 증언이나 발자국 단서로 유도
- 실패 판정은 진행 차단 대신 피해/시간 지연으로 처리
```

## MVP 축약 버전

시간이 부족하면 5개 노드로 줄인다.

```text
N01 마을 의뢰 - story
N02 검은 우물 조사 - exploration
N03 지하 수로와 쥐떼 - combat
N04 우물 아래 고블린 전투 - combat
N05 귀환과 보상 - story
```

플랫폼 기능 시연에는 5개 노드 버전도 충분하다.

