# 검은 우물의 쥐떼 데이터 구조 검토

## 1. 목적

이 문서는 `검은 우물의 쥐떼` 데모 시나리오를 현재 백엔드/세션 구조에 어떻게 담을지 정리한 운영 기준 문서다.

목표는 두 가지다.

```text
1. 데모 플레이에 필요한 장면/NPC/전투/맵/Fog of War/보상/엔딩을 구체화한다.
2. 현재 DB/DTO 구조로 바로 넣을 수 있는 것과, 구조 보강이 필요한 것을 분리해서 적는다.
```

---

## 2. 시나리오 개요

```text
룰: D&D 5e 2014
사용 범위: SRD 5.1
권장 레벨: 1레벨
권장 인원: 3~4명
예상 시간: 60~90분
목적: 온라인 TRPG 플랫폼 데모 플레이
```

작은 마을 그레이브룩의 우물물이 검게 오염된다.  
플레이어들은 우물 아래 오래된 지하 수로를 조사하고, 그곳을 은신처로 삼은 고블린 무리와 거대 쥐들을 처리하거나 쫓아내야 한다.

이 데모에서 보여주려는 플랫폼 기능:

```text
- story / exploration / combat 노드
- 노드 간 수동 이동
- 단서 공개
- NPC 이미지 및 장면 이미지
- VTT 맵 표시
- 토큰 초기 배치
- Fog of War 수동 공개
- 판정 요청
- 전투 시작/종료
- 보상 및 엔딩 분기 기록
```

---

## 3. 백엔드 저장 구조 기준 정리

## 3.1 현재 DB/세션 구조로 바로 담을 수 있는 것

### 시나리오/노드

```text
Scenario
- title
- description
- startNodeId

ScenarioNode
- nodeType
- title
- sceneText
- imageUrl
- checkOptionsJson
- transitionsJson
- cluesJson
- fallbackNodeId
```

### 세션 런타임

```text
SessionScenario
- 세션에 복사된 시나리오 스냅샷

SessionScenarioNode
- 세션 시작 시 ScenarioNode 스냅샷 보관

GameState.currentNodeId
- 현재 장면

SessionNodeVisit
- 방문 이력

SessionReveal
- 공개된 단서 기록

GameState.flagsJson.vttMap
- 세션 중 변경된 현재 맵 상태
```

### 현재 구조로 현실적으로 넣을 수 있는 데모 데이터

```text
- N01~N07 노드 본문
- 노드 이미지
- 노드 간 연결
- 단서와 handoutText / gmNotes
- 기본 VTT 맵
- 토큰 위치
- Fog Rect 초기값
- 전투용 적 메모를 checkOptionsJson 내부 combat 메타로 보관
```

## 3.2 현재 구조로 부족한 부분

### 1. 시나리오 CRUD 경로에서 판정(checks) 저장이 안 됨

현재 시나리오 입력 DTO는 `transitions`, `clues`, `vttMap`만 받고, `checkOptions` 입력을 받지 않는다.  
또한 시나리오 저장 서비스가 `checkOptionsJson`을 저장할 때 `checks: []`로 고정해 버린다.

즉 뜻:

```text
- DEMO_SCENARIO.md에 적는 DC/판정 정의는 현재 CRUD 저장만으로는 반영되지 않는다.
- 지금 상태로는 seed/직접 DB 입력/추가 코드 보강 중 하나가 필요하다.
```

### 2. fallbackNodeId가 입력 경로에서 보존되지 않음

DB 컬럼은 있지만 현재 저장 서비스가 `fallbackNodeId: null`로 고정한다.

즉 뜻:

```text
- "실패해도 이 노드로 진행" 같은 fallback 정의를 문서대로 넣어도 현재 CRUD로는 사라진다.
```

### 3. NPC 대사 생성에 필요한 저장형 NPC 데이터 구조가 부족함

기존 기획 기준에서 NPC의 실제 발화문은 저장해 두는 정적 대사 트리가 아니라, `NpcDialogue` 역할이 Google AI Studio / Gemini API를 통해 상황에 맞게 생성한다.  
반대로 저장이 필요한 것은 `npcEntityId`, `npcName`, `npcSummary`, `disposition`, 장면 내 역할, 공개 가능 사실, 비공개 사실, 말투 제약 같은 입력 데이터다.

즉 뜻:

```text
- 부족한 것은 "대사 본문 저장 필드"보다 "NpcDialogue 입력용 NPC 프로필/등장 정보 구조"다.
- 현재 노드에는 그 정보를 담을 전용 필드가 없다.
- 필요하면 nodeMetaJson, scenarioNpcJson, sceneNpcBindingsJson 같은 구조가 필요하다.
```

### 4. 보상/엔딩/후속 훅 구조가 없음

현재는 보상과 엔딩을 텍스트/클루/전이 메모로만 담을 수 있다.

즉 뜻:

```text
- gp, 포션, 평판 상승, 후속 시나리오 떡밥 같은 결과를 구조화해 저장할 곳이 없다.
- rewardsJson / outcomesJson / endingStateJson 같은 확장 포인트가 필요하다.
```

### 5. 조사 포인트 좌표와 맵 핫스팟 전용 구조가 없음

현재 VTT DTO는 `tokens`, `fogRects`만 있다.

즉 뜻:

```text
- well_square_map의 밧줄/검은 물/발자국 좌표를 런타임 클릭 포인트로 전달할 수 없다.
- 지금은 문서 기준 수동 운영만 가능하다.
- 장기적으로는 interactionPointsJson 또는 vttMap.interactionPoints 확장이 필요하다.
```

### 6. 전투 종료 후 자동 노드 이동 규칙이 없음

현재 `endCombat`는 `GameState.phase`만 바꾸고 다음 노드로 자동 이동하지 않는다.

즉 뜻:

```text
- N06 종료 후 N07 이동은 현재 구조상 GM/호스트가 별도 노드 전환을 해줘야 한다.
- transitionsJson에 condition을 적어도 자동 해석해 다음 노드로 넘기는 엔진은 아직 없다.
```

현재 1차 구현 방향:

```text
- 전투 노드의 가능한 nextNodeId가 사실상 하나로 수렴하면 endCombat 시 자동 이동
- 여러 분기로 갈리는 전투 결과는 여전히 수동 선택 또는 추가 조건 엔진이 필요
```

---

## 4. 권장 보강안

데모 시나리오를 문서가 아니라 시스템 데이터로 재현하려면 최소 아래 보강이 필요하다.

### 4.1 바로 필요한 최소 보강

```text
1. ScenarioNodeInputDto에 checkOptions 추가
2. ScenarioNodeInputDto에 fallbackNodeId 추가
3. scenarios.service normalizeNodeInputs에서 checks/fallbackNodeId 보존
4. 노드 이동 시 transitionsJson의 condition을 해석하는 최소 평가기 추가
5. combat 종료 후 nextNodeId를 결정하는 명시적 훅 추가
```

### 4.2 데모 품질을 위해 권장되는 보강

```text
1. playerText / gmText 분리
2. npcProfileJson 또는 nodeMetaJson 추가
3. rewardsJson / endingStateJson 추가
4. assetRefsJson 추가
5. interactionPointsJson 추가
6. SessionNodeVisit 또는 별도 TransitionLog에 enteredByTransitionId 기록
```

현재 1차 구현 방향:

```text
- 전용 세부 필드를 한 번에 다 만들기보다 ScenarioNode.nodeMetaJson으로 우선 수용
- npcProfiles, sceneNpcBindings, rewards, outcomes, assetRefs, interactionPoints를 nodeMetaJson 하위에 담는 방식
```

### 4.3 지금 당장 코드 보강 없이 운영하는 방법

```text
- sceneText, transitions, clues, vttMap만 에디터로 넣는다.
- 판정/보상은 문서 원본을 보며 운영한다.
- NPC 발화문은 AI GM 모드에서는 `NpcDialogue` 호출로 생성하고, human GM 모드에서는 운영자가 직접 입력한다.
- 전투 노드의 다음 노드가 하나로 수렴하면 endCombat 뒤 자동 이동을 기대할 수 있다.
- 분기 결과가 여러 갈래면 GM이 세션 노드를 수동으로 이동시킨다.
```

### 4.4 기존 기획 기준: 어디까지 저장하고 어디까지 AI가 생성하는가

```text
저장형 데이터
- NPC 정체성: npcEntityId, 이름, 요약, 기본 성향
- 장면 배치: 어느 노드에 등장하는지, 어떤 역할인지
- 공개 가능 사실 / 비공개 사실
- 말투 제약, 금지 정보, 첫 등장 seed line 같은 선택적 가이드
- 전투/탐색/보상/단서 같은 authoritative 게임 데이터

런타임 조립 데이터
- sceneSummary
- recentContext
- selectedActionId
- dialogueIntent
- audienceIds
- turnId

AI 생성 결과
- NPC 실제 발화문 dialogue
- tone
- safetyNotes
```

기획상 중요한 경계:

```text
- Actor는 행동을 고른다.
- NpcDialogue는 허용된 상황 안에서 말만 만든다.
- Narrator는 확정된 결과를 서술한다.
- 백엔드는 상태 변경과 규칙 판정을 확정한다.
- human GM의 직접 NPC 입력은 AI 계약과 별도 경로다.
```

---

## 5. 사용 SRD 요소

### 몬스터

```text
- Giant Rat
- Goblin
- Commoner
```

### 아이템

```text
- Potion of Healing
- 기본 장비
- 금화 보상
```

### 주요 규칙

```text
- Ability Check
- Saving Throw
- Initiative
- Attack Roll
- Damage Roll
- HP 관리
- 엄폐
- 어려운 지형
```

### 기본 DC

```text
쉬움 DC 10
보통 DC 12
어려움 DC 15
```

실패해도 진행을 막지 않는다.  
실패 결과는 피해, 정보 누락, 적 경계 증가, 불리한 배치 정도로 처리한다.

---

## 6. 에셋 참조 카탈로그

이 카탈로그는 현재 구조상 별도 테이블이 없으므로 문서 원본으로 관리한다.

## 6.1 스토리 이미지

```text
asset.story.village_square      = village_square.png
asset.npc.mila                  = mayor_mila.png
asset.story.black_well          = well_black_water.png
asset.story.sewer_tunnel        = sewer_tunnel.png
asset.story.goblin_camp         = goblin_camp.png
```

## 6.2 맵 이미지

```text
asset.map.well_square           = well_square_map.png
asset.map.sewer                 = sewer_map.png
asset.map.rat_lair              = rat_lair_battlemap.png
asset.map.well_chamber          = well_chamber_battlemap.png
```

## 6.3 토큰

```text
asset.token.player.default      = player_tokens/*
asset.token.giant_rat           = giant_rat_token.png
asset.token.goblin              = goblin_token.png
asset.token.commoner            = commoner_token.png
```

## 6.4 맵 공통 기준

좌표 기준은 현재 `VttMapStateDto`에 맞춰 아래처럼 둔다.

```text
width  = 1280
height = 832
grid   = 64
x, y   = 토큰 좌상단 좌표
```

맵 원본 크기가 다르면 좌표를 맞춰 다시 보정한다.

---

## 7. NPC 구조화 원본

현재 DB에는 전용 저장 필드가 없으므로 아래 내용을 문서 원본으로 유지한다.

중요:

```text
- 아래 값들은 "저장해야 할 NPC 입력 데이터" 기준이다.
- 실제 발화문은 AI GM 모드에서 NpcDialogue가 생성한다.
- 따옴표로 적은 문장은 저장형 확정 대사라기보다 첫 등장 seed 또는 tone 예시다.
```

## 7.1 밀라 보스턴

```text
npcId: npc_mila_boston
rulesRef: commoner
role: 마을 관리인 / 의뢰인
goal: 우물 오염 해결, 주민 불안 진정
tone: 실용적, 급하지만 공포를 퍼뜨리진 않으려 함
```

### 저장형 NPC 입력 데이터

```text
npcName: 밀라 보스턴
defaultDisposition: neutral
npcSummary: 그레이브룩의 관리인. 우물 오염 해결이 급선무이며, 주민 공포를 키우지 않으려 한다.
sceneRole.N01: 의뢰인
sceneRole.N07: 보상 지급자
publicFacts:
- 우물물이 썩었다
- 아래에서 수상한 소리가 났다
- 도움을 구하고 있다
privateFacts:
- 식량 자루 몇 개와 염소 한 마리가 사라졌다
- 주민이 동요할까 봐 처음에는 숨긴다
dialogueConstraints:
- 실용적이고 단정하게 말한다
- 과장하거나 허위 사실을 만들지 않는다
- 먼저 공포를 조장하지 않는다
optionalOpeningSeed:
- "어젯밤부터 우물물이 썩기 시작했습니다."
- "부탁입니다. 우물 아래를 확인해 주세요."
```

### NpcDialogue 입력 힌트

```text
dialogueIntent examples:
- quest_briefing
- reward_offer
- reluctant_disclosure
- closing_thanks

recentContext examples:
- 플레이어가 설득에 성공해 선지급 보상을 요구했다
- 플레이어가 통찰에 성공해 숨기는 것이 있음을 알아챘다
- 우물 주변 조사로 작은 발자국을 발견했다
```

## 7.2 페린

```text
npcId: npc_perrin
rulesRef: commoner
role: 우물지기 소년 / 목격자
goal: 자신이 본 것이 거짓말이 아님을 증명
tone: 겁먹었지만 들뜬 상태, 말을 빠르게 함
```

### 저장형 NPC 입력 데이터

```text
npcName: 페린
defaultDisposition: friendly
npcSummary: 우물지기 소년. 밤에 우물 아래에서 초록 눈을 봤고, 자신의 말을 믿어주길 바란다.
sceneRole.N01: 목격자
publicFacts:
- 우물 아래에서 초록 눈을 봤다
- 긁는 소리와 썩은 냄새를 맡았다
privateFacts:
- 창고 쪽 작은 진흙 발자국도 봤다
- 정확한 생김새는 못 봤다
dialogueConstraints:
- 겁먹은 말투지만 과장된 허풍은 아니다
- 친절하게 대하면 조금 더 자세히 말한다
optionalOpeningSeed:
- "진짜예요. 우물 안에서 초록 눈이 반짝였어요."
```

### NpcDialogue 입력 힌트

```text
dialogueIntent examples:
- witness_report
- nervous_recall
- clue_followup

recentContext examples:
- 플레이어가 안심시키며 본 것을 자세히 물었다
- 플레이어가 겁을 주며 다그쳤다
- 파티가 어디서부터 조사해야 할지 막혔다
```

---

## 8. 노드 그래프

```text
N01 마을 광장의 의뢰
  -> N02 검은 우물 조사
  -> N03 지하 수로 입구
  -> N04 쥐떼 소굴
  -> N05 고블린 임시 야영지
  -> N06 우물 아래 전투
  -> N07 귀환과 보상
```

권장 전이 ID:

```text
t_n01_to_n02
t_n02_to_n03
t_n03_to_n04
t_n04_to_n05
t_n05_to_n06
t_n06_victory_to_n07
t_n06_surrender_to_n07
t_n06_escape_to_n07
```

---

## 9. 맵별 운영 기준

## 9.1 well_square_map

```text
mapId: map_n02_well_square
asset: asset.map.well_square
size: 1280x832
grid: 64
```

### 추천 초기 토큰 배치

```text
party_a = (448, 576)
party_b = (512, 640)
party_c = (576, 576)
party_d = (640, 640)
npc_mila = (768, 448)
npc_perrin = (832, 512)
```

### 조사 포인트 좌표

현재 구조에는 저장 필드가 없으므로 문서 기준 운영.

```text
point.rope         = (640, 256)
point.black_water  = (640, 320)
point.footprints   = (896, 416)
```

## 9.2 sewer_map

```text
mapId: map_n03_sewer
asset: asset.map.sewer
size: 1280x832
grid: 64
```

### 추천 초기 토큰 배치

```text
party_a = (160, 640)
party_b = (224, 704)
party_c = (288, 640)
party_d = (352, 704)
```

### 초기 Fog Rect

초기에는 우물 아래 첫 방만 보이고 좌우 통로는 가린다.

```text
fog_west_corridor  = (0, 0, 448, 832)
fog_east_corridor  = (832, 0, 448, 832)
fog_north_room     = (384, 0, 512, 256)
```

### 수동 공개 규칙

```text
1. 파티가 서쪽으로 이동하면 fog_west_corridor 제거
2. 파티가 동쪽으로 이동하면 fog_east_corridor 제거
3. 철창을 넘거나 우회로를 확인하면 fog_north_room 제거
```

## 9.3 rat_lair_battlemap

```text
mapId: map_n04_rat_lair
asset: asset.map.rat_lair
size: 1280x832
grid: 64
```

### 추천 초기 토큰 배치

```text
party_a = (192, 576)
party_b = (256, 640)
party_c = (320, 576)
party_d = (384, 640)

rat_1 = (704, 320)
rat_2 = (832, 320)
rat_3 = (768, 448)
rat_4 = (896, 448)
rat_5 = (960, 320)
```

### 지형 메모

```text
bag_cover_1 = (640, 256)
bag_cover_2 = (896, 256)
narrow_choke = x 512~576 통로
```

## 9.4 well_chamber_battlemap

```text
mapId: map_n06_well_chamber
asset: asset.map.well_chamber
size: 1280x832
grid: 64
```

### 추천 초기 토큰 배치

```text
party_a = (160, 640)
party_b = (224, 704)
party_c = (288, 640)
party_d = (352, 704)

goblin_1 = (768, 320)
goblin_2 = (896, 320)
goblin_3 = (832, 448)
goblin_4 = (960, 448)
```

### 초기 Fog

```text
없음
```

### 지형 메모

```text
box_cover_left   = (704, 256)
box_cover_right  = (960, 256)
black_pool       = (768, 512)
pillar_1         = (576, 320)
pillar_2         = (1024, 320)
```

---

## 10. 노드 상세

## N01. 마을 광장의 의뢰

```text
nodeId: N01
type: story
image: asset.story.village_square, asset.npc.mila, asset.story.black_well
purpose: 의뢰 수락, 밀라 소개, 첫 단서 제공
```

### 플레이어 공개 본문

```text
작은 마을 그레이브룩의 광장.

중앙 우물은 굵은 밧줄로 막혀 있고, 주민들은 물통을 든 채 불안한 표정으로 웅성거린다. 우물 안에서는 비릿하고 썩은 냄새가 올라온다.

마을 관리인 밀라가 일행에게 다가와 말한다.

“어젯밤부터 우물물이 썩었습니다. 아래에서 무언가 움직이는 소리도 들렸어요. 우물 아래를 확인해 주십시오.”
```

### GM 메모

```text
- 실제 원인: 고블린 무리가 지하 수로를 은신처로 사용 중
- 음식물과 오물 때문에 우물이 오염됨
- 밀라는 실종된 식량과 염소 이야기를 처음엔 숨긴다
```

### 판정 원본

```text
check.n01_persuasion
- Charisma (Persuasion) DC 10
- 성공: Potion of Healing 1개 선지급

check.n01_insight
- Wisdom (Insight) DC 10
- 성공: 밀라가 실종 사건을 숨기고 있다는 점 파악

check.n01_investigate_well_edge
- Intelligence (Investigation) DC 12
- 성공: 우물 주변 작은 발자국 발견
```

### NpcDialogue 입력 힌트

```text
- AI GM 모드에서는 밀라의 실제 발화문을 저장해두지 않고 생성한다.
- 저장할 것은 npcEntityId, npcSummary, defaultDisposition, optionalOpeningSeed다.
- 설득 성공 시에는 recentContext에 선지급 보상 허용을 넣고 dialogueIntent를 reward_offer로 준다.
- 통찰 성공 시에는 recentContext에 "플레이어가 숨기는 사실을 눈치챔"을 넣고 dialogueIntent를 reluctant_disclosure로 준다.
```

### 보상 / 상태

```text
reward.n01_advance_potion
- potion_of_healing x1
- 조건: persuasion 성공

flag.n01_mila_trust
- 조건: persuasion 성공

flag.n01_missing_supplies_known
- 조건: insight 성공
```

### 전이

```text
t_n01_to_n02
- label: 우물 주변 조사 시작
- condition: default
- next: N02
- note: 현재 구조에서는 수동 이동
```

## N02. 검은 우물 조사

```text
nodeId: N02
type: exploration
map: asset.map.well_square
purpose: 우물 조사, 추적 단서, 조사 포인트 운영
```

### 플레이어 공개 본문

```text
우물 주변 흙은 축축하고 검게 물들어 있다.

나무 덮개에는 안쪽에서 긁은 듯한 자국이 남아 있고, 우물 밧줄은 최근 누군가 사용한 것처럼 축축하다.
```

### GM 메모

```text
- 밧줄과 발자국은 고블린 흔적
- 검은 물은 독이 아니라 부패와 하수 오염
- 단서에 실패해도 우물 아래로 내려가면 진행 가능
```

### 조사 포인트

#### point.rope

```text
좌표: (640, 256)

check.n02_secure_rope
- Strength (Athletics) DC 10
- 성공: 안전 하강, flag.n02_rope_secured

check.n02_rope_notice
- Wisdom (Perception) DC 10
- 성공: 진흙과 작은 손자국 발견

실패 처리
- 밧줄 고정 없이 하강 시 DC 10 Dexterity saving throw
- 실패: 1d6 bludgeoning damage
```

#### point.black_water

```text
좌표: (640, 320)

check.n02_water_nature
- Intelligence (Nature) DC 10
- 성공: 독살이 아니라 오염/부패라고 파악

check.n02_water_contact
- Constitution saving throw DC 10
- 조건: 마시거나 상처에 닿음
- 실패: 1 poison damage
```

#### point.footprints

```text
좌표: (896, 416)

check.n02_track_goblins
- Wisdom (Survival) DC 12
- 성공: 작은 인간형 발자국이 창고 쪽과 우물 가장자리를 오감
- 성공 효과: flag.n02_goblin_tracks_found
```

### 단서

```text
clue.n02_rope_marks
- title: 젖은 밧줄의 흔적
- source: environment
- handoutText: 밧줄에 작은 진흙 손자국이 묻어 있다.

clue.n02_black_water
- title: 오염된 우물물
- source: environment
- handoutText: 검은 물은 독보다는 음식물 부패와 하수 오염에 가깝다.

clue.n02_small_tracks
- title: 작은 발자국
- source: environment
- handoutText: 우물 주변에 작은 인간형 발자국이 남아 있다.
```

### 전이

```text
t_n02_to_n03
- label: 우물 아래로 내려간다
- condition: default
- next: N03

fallback
- 원하는 동작: 조사 실패여도 N03 진행 허용
- 현재 CRUD 구조: fallbackNodeId 저장 안 됨
```

## N03. 지하 수로 입구

```text
nodeId: N03
type: exploration
map: asset.map.sewer
purpose: Fog of War, 환경 판정, 우회/정면 진입 차이 만들기
```

### 플레이어 공개 본문

```text
우물 아래에는 오래된 벽돌 통로가 이어져 있다.

바닥에는 더러운 물이 발목 높이까지 차 있고, 어둠 너머에서 찍찍거리는 소리가 메아리친다.
```

### GM 메모

```text
- 첫 방만 공개한 뒤 이동에 따라 통로를 수동 공개
- 철창을 바로 열면 N04에서 기습 가능
- 우회로를 택하거나 실패하면 쥐들이 경계한 상태로 시작
```

### 환경 판정

```text
check.n03_slippery_floor
- Dexterity saving throw DC 10
- 조건: Dash 또는 급하게 이동
- 실패: prone

check.n03_lift_grate
- Strength (Athletics) DC 12
- 성공: 철창을 들어 올림

check.n03_unlock_grate
- Dexterity with thieves' tools DC 12
- 성공: 철창 해제

check.n03_old_sacks
- Intelligence (Investigation) DC 10
- 성공: 마을 창고 표식이 남은 식량 자루 발견
```

### 상태 / 결과

```text
flag.n03_quiet_entry
- 조건: 철창 해제 또는 조용한 접근 성공
- 효과: N04에서 기습 가능

flag.n03_noisy_entry
- 조건: 우회 또는 실패
- 효과: N04에서 적이 준비된 상태
```

### 전이

```text
t_n03_to_n04
- label: 소굴로 이동
- condition: default
- next: N04
```

## N04. 쥐떼 소굴

```text
nodeId: N04
type: combat
map: asset.map.rat_lair
purpose: 첫 전투, 약한 적, 엄폐/좁은 통로 테스트
```

### 플레이어 공개 본문

```text
썩은 식량 자루가 쌓인 방 안에서 거대한 쥐들이 고개를 든다.

빛이나 발소리에 반응한 쥐들이 낮게 울며 이빨을 드러낸다.
```

### 전투 구성

```text
PC 3명: Giant Rat 4마리
PC 4명: Giant Rat 5마리
초보자 많음: Giant Rat 3마리
```

### 전투 메모

```text
- flag.n03_quiet_entry가 있으면 파티가 먼저 좋은 위치 선점
- flag.n03_noisy_entry가 있으면 쥐가 이미 흩어져 배치
- 좁은 통로는 한 줄로만 접근 가능
- 썩은 자루 더미는 반엄폐 AC +2로 처리
```

### 전투 후 조사

```text
check.n04_goblin_marks
- Intelligence (Investigation) DC 10
- 성공: 고블린 낙서/표식 발견

check.n04_track_deeper
- Wisdom (Survival) DC 10
- 성공: 더 깊은 곳으로 이어지는 작은 발자국 발견
```

### 보상

```text
reward.n04_scrap_loot
- cp 소량
- 손상된 식량 자루
- 작은 단검 1개
```

### 전이

```text
t_n04_to_n05
- label: 깊은 통로로 이동
- condition: all_hostiles_defeated or default
- next: N05
- note: 현재 구조상 자동 평가 없음. 전투 종료 후 수동 이동 필요.
```

## N05. 고블린 임시 야영지

```text
nodeId: N05
type: story
image: asset.story.goblin_camp
purpose: 최종 전투 전 정보 제공, 은신/협상 포석
```

### 플레이어 공개 본문

```text
통로 끝에서 희미한 불빛이 새어 나온다.

낡은 저장실 안에는 훔친 식량 자루, 부서진 나무상자, 조잡한 침낭이 널려 있다. 벽에는 마을 우물 그림과 해골 표시가 거칠게 그려져 있다.
```

### GM 메모

```text
- 고블린은 마을을 점령하려는 게 아니라 숨어 지내는 중
- 우물 오염은 계획적 독살이 아니라 생활 폐기물과 음식물 때문
- 최종 방의 고블린들은 배고프고 예민하지만 무조건 결사항전하진 않음
```

### 선택지와 판정

```text
check.n05_stealth_scout
- Dexterity (Stealth) DC 12
- 성공: flag.n05_ambush_position
- 효과: N06에서 파티 선배치 유리

check.n05_count_goblins
- Intelligence (Investigation) DC 10
- 성공: 고블린 수 3~4 파악

check.n05_understand_pollution
- Intelligence (Investigation) DC 12
- 성공: 우물 독살이 아니라 오염임을 파악

check.n05_prepare_talk
- Charisma (Persuasion) 또는 Charisma (Intimidation) DC 12
- 성공: flag.n05_surrender_open
- 효과: N06에서 항복/도주 유도 쉬워짐
```

### 단서

```text
clue.n05_stolen_food
- title: 훔친 식량 자루
- source: object
- handoutText: 자루에는 마을 창고 인장이 남아 있다.

clue.n05_not_poison_plot
- title: 계획적 독살은 아님
- source: environment
- handoutText: 고블린들은 우물을 독살한 것이 아니라 쓰레기와 음식물을 버린 듯하다.
```

### 전이

```text
t_n05_to_n06
- label: 마지막 방으로 진입
- condition: default
- next: N06
```

## N06. 우물 아래 전투

```text
nodeId: N06
type: combat
map: asset.map.well_chamber
purpose: 최종 전투, 엄폐/어려운 지형/비살상 해결
```

### 플레이어 공개 본문

```text
마지막 방은 넓은 지하 저수조다.

중앙의 검은 물웅덩이 옆에서 고블린들이 식량 자루를 뒤지고 있다. 녹슨 단검을 든 고블린 하나가 이를 드러내며 소리친다.

“여긴 우리 굴이다!”
```

### 전투 구성

```text
PC 3명:
- Goblin 3마리

PC 4명:
- Goblin 4마리

초보자/약한 파티:
- Goblin 3마리
- 1마리는 HP 절반으로 시작
```

### 배치 규칙

```text
- 파티 기본 시작점: 입구 쪽
- flag.n05_ambush_position이 있으면 파티 토큰 x 좌표 +128 전진 배치 가능
- 고블린 2마리는 상자 뒤
- 고블린 1~2마리는 검은 물웅덩이 근처
```

### 지형 효과

```text
상자:
- 반엄폐 AC +2

검은 물웅덩이:
- 어려운 지형

낡은 기둥:
- 원거리 공격에 반엄폐
```

### 비살상 해결 조건

```text
check.n06_intimidate_surrender
- Charisma (Intimidation) DC 12
- 조건: 고블린 1마리 이상 쓰러짐
- flag.n05_surrender_open 있으면 유리하게 판정 가능
- 성공: 남은 고블린 항복

check.n06_persuade_retreat
- Charisma (Persuasion) DC 13
- 조건: 음식과 퇴로 제안
- 성공: 고블린이 식량 일부를 두고 떠남
```

### 종료 조건 원본

```text
outcome.n06_victory
- 모든 고블린 처치

outcome.n06_surrender
- 남은 고블린 항복

outcome.n06_escape
- 일부 고블린 도주
```

### 보상 원본

```text
reward.n06_recovered_food
- 훔친 식량 회수

reward.n06_coin_pouch
- 소형 동전 주머니

reward.n06_extra_potion
- Potion of Healing 1개
```

### 상태 플래그

```text
flag.n06_goblins_spared
- 조건: surrender / retreat

flag.n06_goblin_escaped
- 조건: escape

flag.n06_food_recovered
- 조건: 전투 또는 협상 종료
```

### 전이

```text
t_n06_victory_to_n07
- condition: all_hostiles_defeated
- next: N07

t_n06_surrender_to_n07
- condition: surrender_resolved
- next: N07

t_n06_escape_to_n07
- condition: hostiles_escaped
- next: N07
```

### 현재 구조 기준 운영 메모

```text
- transitionsJson에 위 전이를 적는 것은 가능
- 하지만 현재 서비스는 combat 종료 후 자동으로 N07로 넘기지 않음
- 데모 운영 시에는 GM/호스트가 전투 종료 후 수동으로 N07 이동
```

## N07. 귀환과 보상

```text
nodeId: N07
type: story
purpose: 결과 정리, 보상 지급, 엔딩 상태 기록
```

### 플레이어 공개 본문

```text
우물 아래의 오염원이 정리되자 검은 물은 조금씩 맑아지기 시작한다.

마을 사람들은 되찾은 식량 자루를 보며 안도의 한숨을 내쉰다. 밀라는 지친 표정으로 웃으며 일행에게 보상을 건넨다.

“작은 마을이지만, 오늘 여러분이 없었다면 큰일이 났을 겁니다.”
```

### 엔딩 분기 원본

#### ending.n07_clean_victory

```text
조건:
- flag.n06_food_recovered
- not flag.n06_goblins_spared
- not flag.n06_goblin_escaped

결과:
- 고블린 소탕
- 마을 완전 안정
```

#### ending.n07_peaceful_resolution

```text
조건:
- flag.n06_goblins_spared

결과:
- 피를 덜 흘리고 문제 해결
- 마을은 식량 일부를 잃지만 우물은 회복
```

#### ending.n07_loose_end

```text
조건:
- flag.n06_goblin_escaped

결과:
- 후속 시나리오 떡밥 생성
```

### 보상 원본

```text
reward.n07_party_gp
- 25 gp

reward.n07_party_potion
- Potion of Healing 1개

reward.n07_reputation
- 조건: flag.n06_goblins_spared
- 효과: 마을 평판 상승

reward.n07_future_hook
- 조건: flag.n06_goblin_escaped
- 효과: 후속 시나리오 훅
```

### NpcDialogue 입력 힌트

```text
- N07의 밀라 마무리 발화도 저장형 고정 대사보다 AI 생성 대사로 보는 편이 기획에 맞다.
- 저장할 것은 ending 결과 플래그와 보상 결과다.
- peaceful_resolution이면 dialogueIntent=closing_thanks, recentContext에 "피를 덜 흘리고 해결"을 넣는다.
- loose_end이면 recentContext에 "일부 고블린 도주"를 넣어 후속 불안감을 반영한다.
```

---

## 11. 항목별 결론

## 11.1 N01~N07 노드 본문, 분기, 보상, 엔딩 상태

```text
문서에는 모두 구체화 가능
DB에는 본문/전이/단서는 담을 수 있음
보상/엔딩 상태는 전용 구조가 없어 문서 원본 또는 신규 JSON 필드 필요
```

## 11.2 밀라, 페린 NPC 대사 / GM 메모 구조화 데이터

```text
실제 발화문은 AI 서버의 NpcDialogue가 생성하는 것이 기획에 맞다
저장해야 하는 것은 NPC 프로필, 장면 내 역할, 공개/비공개 사실, 말투 제약 같은 입력 데이터다
현재 DB에는 그 입력 데이터를 담는 전용 구조가 없으므로 npcProfileJson, sceneNpcBindingsJson, 또는 nodeMetaJson 계열 보강이 필요하다
```

## 11.3 에셋 참조 카탈로그

```text
문서 원본으로는 충분
현재 DB에는 전용 asset catalog 없음
assetRefsJson 또는 별도 Asset 테이블 권장
```

## 11.4 토큰 초기 배치, Fog of War 공개 규칙, 조사 포인트 좌표

```text
토큰/Fog Rect는 현재 VTT 구조로 저장 가능
조사 포인트 좌표는 저장 구조 없음
현재는 문서 수동 운영, 장기적으로 interactionPoints 확장 필요
```

## 11.5 전투 종료 후 N07 이동 같은 실제 세션 상태 전이

```text
현재는 자동화 부족
combat 종료는 phase 변경만 수행
노드 이동은 별도 수동 전환
transition evaluator 또는 onCombatEndNextNode 규칙 필요
```

---

## 12. 데모 운영 팁

```text
- 첫 데모는 PC 3명 기준으로 진행
- N04 Giant Rat는 3~4마리만 사용
- N06 Goblin은 3마리 우선
- 전투가 길어지면 고블린 항복 처리
- 플레이어가 막히면 페린의 창고 발자국 증언으로 유도
- 판정 실패는 진행 차단 대신 불리한 상황으로 처리
- N06 종료 후에는 반드시 N07로 수동 노드 이동
```

---

## 13. 플랫폼 기능 체크리스트

### Story 노드

```text
- sceneText 표시
- 이미지 표시
- 단서/GM 메모 분리 확인
- 결과 대사 확인
```

### Exploration 노드

```text
- 기본 맵 표시
- 토큰 이동
- Fog Rect 제거
- 조사 포인트 수동 운영
- 판정 요청
```

### Combat 노드

```text
- Initiative
- 토큰 이동
- 적 HP 관리
- 엄폐 / 어려운 지형 적용
- 전투 종료 후 수동 노드 이동
```

---

## 14. MVP 축약 버전

시간이 부족하면 아래 5개 노드로 줄여도 된다.

```text
N01 마을 의뢰 - story
N02 검은 우물 조사 - exploration
N03 지하 수로와 쥐떼 - combat
N04 우물 아래 고블린 전투 - combat
N05 귀환과 보상 - story
```

하지만 현재 문서 기준으로는 7노드 버전이 데모 설명력과 플랫폼 시연 범위가 더 좋다.
