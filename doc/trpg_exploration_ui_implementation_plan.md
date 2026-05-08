# TRPG 온라인 플랫폼 탐색 화면 UI 구현 순서 정리

## 0. 최종 추천 UI 구성

```text
┌──────────────────────────────────────────────┬────────────────────┐
│ 현재 지역명 / 노드명 / 탐색 상태              │ 우측 채팅창          │
│ 예: 폐쇄된 마을 우물 / EXPLORATION            │ [메인] [일반] [설정] │
├──────────────────────────────────────────────┤                    │
│                                              │                    │
│  좌측 파티 초상화                             │                    │
│  ┌─────────┐                                  │                    │
│  │ 캐릭터1 │                                  │                    │
│  ├─────────┤                                  │                    │
│  │ 캐릭터2 │          탐색맵                   │                    │
│  ├─────────┤     캐릭터 토큰 / 오브젝트        │                    │
│  │ 캐릭터3 │     단서 / 문 / 함정 / NPC         │                    │
│  ├─────────┤                                  │                    │
│  │ 캐릭터4 │                                  │                    │
│  └─────────┘                                  │                    │
│                                              │                    │
│  선택 대상 정보 패널                          │                    │
│  - 이름 / 종류 / 조사 가능 여부 / 거리         │                    │
├──────────────────────────────────────────────┴────────────────────┤
│ 현재 선택 캐릭터 / 탐색 상태                                       │
│ 조작 가능 | 이동 가능 | 조사 대상 선택 중 | GM 응답 대기             │
├────────────────────────────────────────────────────────────────────┤
│ [탐색] [상호작용] [아이템]                                          │
├────────────────────────────────────────────────────────────────────┤
│ 이동 | 조사 | 관찰 | 듣기 | 문 열기 | 잠금 해제 | 함정 확인 | 요청    │
├────────────────────────────────────────────────────────────────────┤
│ 행동 상세 설명 / 대상 선택 안내 / 행동 불가 사유 / [취소] [요청]     │
└────────────────────────────────────────────────────────────────────┘
```

### UI 책임 분리

```text
공간 탐색: 중앙 탐색맵
파티 상태 확인: 좌측 파티 초상화
대상 확인: 선택 대상 정보 패널
탐색 행동 선택: 하단 행동 탭
대화 / GM 요청: 우측 메인 채팅
잡담: 우측 일반 채팅
상태 변경: 서버 검증 또는 GM 승인
결과 묘사: GM 또는 AI
```

---

## 1. MVP 탐색 화면 최종 기준

### 화면 구성

```text
상단: 현재 지역명 / 노드명 / 탐색 상태
좌측: 파티 초상화
중앙: 탐색맵 / 캐릭터 토큰 / 오브젝트 / 단서 / NPC
우측: 메인 채팅 / 일반 채팅
하단: [탐색] [상호작용] [아이템] 행동 탭
하단 근처: 현재 선택 캐릭터 / 탐색 상태
토큰 또는 오브젝트 클릭 시: 선택 대상 정보 패널
우측 또는 하단 구석: 설정 톱니바퀴
```

### MVP 포함 기능

- 현재 탐색 노드 정보 표시
- 탐색맵 표시
- 캐릭터 토큰 표시
- 오브젝트 / 단서 / 문 / 함정 / NPC 표시
- 좌측 파티 초상화
- 선택 대상 정보 패널
- 하단 탐색 행동 탭
- 행동 상세 설명
- 행동 불가 사유 표시
- 대상 선택 안내
- 이동 요청
- 조사 요청
- 상호작용 요청
- 아이템 사용 요청
- 우측 채팅창
  - 메인 채팅
  - 일반 채팅
- 기본 맵 조작
  - 드래그 이동
  - 휠 줌
  - 토큰 클릭
  - 오브젝트 클릭
  - 빈 칸 클릭
  - 선택 해제
- 새로고침 시 현재 탐색 상태 복구

### MVP 제외 기능

- 실시간 시야 / 안개
- 복잡한 조명 시스템
- 고급 함정 해제 미니게임
- 정교한 충돌 판정
- 자동 경로 탐색
- 파티 분할 탐색
- 오브젝트 드래그 배치
- 고급 애니메이션
- 탐색 로그 전용 탭
- 소리 방향 시각화

---

## 2. 구현 우선순위 요약

```text
1. 탐색 화면 레이아웃 골격
2. 탐색 노드 데이터 구조 정의
3. 탐색 노드 조회 API 연결
4. 탐색맵 렌더링
5. 캐릭터 토큰 렌더링
6. 오브젝트 / 단서 / NPC 렌더링
7. 대상 선택 / 정보 패널
8. 좌측 파티 초상화
9. 현재 조작 가능 캐릭터 표시
10. 하단 탐색 행동 탭
11. 행동 버튼 목록
12. 행동 상세 설명
13. 행동 불가 사유 표시
14. 대상 선택 모드
15. 이동 요청 처리
16. 조사 요청 처리
17. 상호작용 요청 처리
18. 아이템 사용 요청 처리
19. 우측 채팅창 연결
20. 권한별 UI 분기
21. 맵 기본 조작 보완
22. 로딩 / 빈 상태 / 에러 상태
23. 노드 전환 처리
24. QA / 예외 케이스 정리
```

---

## 3. 1단계: 탐색 화면 레이아웃 골격

### 목표

탐색 화면의 큰 영역을 먼저 고정한다.

### 추천 컴포넌트 구조

```text
ExplorationPage
├─ ExplorationHeader
├─ PartyPortraitBar
├─ ExplorationMapArea
├─ ExplorationObjectLayer
├─ SelectedTargetPanel
├─ RightChatSidebar
├─ BottomExplorationPanel
└─ ExplorationSettingsButton
```

### 구현할 영역

- 전체 화면 wrapper
- 상단 지역명 / 노드명 영역
- 좌측 파티 초상화 영역
- 중앙 탐색맵 영역
- 우측 채팅창 영역
- 하단 탐색 행동 UI 영역
- 선택 대상 정보 패널 영역
- 설정 톱니바퀴 버튼

### 이 단계에서 하지 말 것

- 실제 이동 처리
- 조사 판정 처리
- 함정 해제 처리
- AI GM 응답 생성
- 복잡한 시야 처리

### 완료 기준

- 탐색 화면의 영역 배치가 고정된다.
- 전투 화면과 유사하지만, 전투보다 가벼운 조작 구조를 가진다.
- 하단이 파티 카드가 아니라 탐색 행동 UI로 사용된다.

---

## 4. 2단계: 탐색 노드 데이터 구조 정의

### 목표

탐색 화면을 그리는 데 필요한 데이터를 확정한다.

### ExplorationNodeState 예시

```ts
type ExplorationNodeState = {
  sessionId: string;
  scenarioId: string;
  nodeId: string;
  nodeType: 'EXPLORATION';
  title: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  map: ExplorationMap;
  party: ExplorationActor[];
  objects: ExplorationObject[];
  npcs: ExplorationNpc[];
  permissions: ExplorationPermissions;
};
```

### ExplorationMap 예시

```ts
type ExplorationMap = {
  id: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  gridSize?: number;
};
```

### ExplorationActor 예시

```ts
type ExplorationActor = {
  id: string;
  characterId: string;
  playerId: string;
  name: string;
  portraitUrl?: string;
  tokenUrl?: string;
  hp: number;
  maxHp: number;
  conditions: string[];
  position: {
    x: number;
    y: number;
  };
  isOnline: boolean;
  isControllableByMe: boolean;
};
```

### ExplorationObject 예시

```ts
type ExplorationObject = {
  id: string;
  name: string;
  objectType: 'OBJECT' | 'CLUE' | 'DOOR' | 'TRAP' | 'ITEM' | 'AREA';
  imageUrl?: string;
  position: {
    x: number;
    y: number;
  };
  isVisible: boolean;
  isInteractable: boolean;
  isInvestigable: boolean;
  shortDescription?: string;
};
```

### ExplorationNpc 예시

```ts
type ExplorationNpc = {
  id: string;
  name: string;
  portraitUrl?: string;
  tokenUrl?: string;
  position: {
    x: number;
    y: number;
  };
  disposition?: 'FRIENDLY' | 'NEUTRAL' | 'HOSTILE' | 'UNKNOWN';
  isInteractable: boolean;
};
```

### ExplorationPermissions 예시

```ts
type ExplorationPermissions = {
  canMoveToken: boolean;
  canInvestigate: boolean;
  canInteract: boolean;
  canUseItem: boolean;
  canControlScene: boolean;
};
```

### 완료 기준

- 화면에 필요한 데이터가 ExplorationNodeState 하나로 정리된다.
- mock 데이터만으로 탐색 화면을 렌더링할 수 있다.

---

## 5. 3단계: 탐색 노드 조회 API 연결

### 목표

탐색 화면 진입 시 현재 탐색 노드 상태를 불러온다.

### 추천 API

```http
GET /api/v1/sessions/{sessionId}/nodes/current
```

### 응답에 포함할 것

```text
현재 노드 ID
노드 타입
지역명 / 노드명
탐색맵 정보
파티 토큰 위치
오브젝트 목록
NPC 목록
공개된 단서 목록
현재 사용자 권한
```

### 프론트 처리 흐름

```text
ExplorationPage 진입
→ 현재 노드 조회
→ nodeType이 EXPLORATION인지 확인
→ ExplorationNodeState 저장
→ 화면 렌더링
```

### 완료 기준

- 새로고침해도 현재 탐색 노드가 복구된다.
- nodeType이 EXPLORATION이 아닐 경우 해당 타입 화면으로 전환한다.

---

## 6. 4단계: 탐색맵 렌더링

### 목표

중앙에 탐색맵을 표시한다.

### 구현 내용

- map.imageUrl 렌더링
- 맵 영역 크기 계산
- 기본 배율 적용
- 맵 좌표계 정의
- 그리드 표시 여부 옵션화
- 지도 확대 / 축소 기준점 설정

### 좌표 기준

```text
맵 원본 좌표: x, y
화면 표시 좌표: scale, offset 적용
토큰 / 오브젝트 위치: map coordinate 기준
```

### 완료 기준

- 탐색맵이 중앙 영역에 안정적으로 표시된다.
- 화면 크기가 바뀌어도 맵이 깨지지 않는다.
- 토큰과 오브젝트를 올릴 수 있는 좌표 기준이 정해진다.

---

## 7. 5단계: 캐릭터 토큰 렌더링

### 목표

탐색맵 위에 파티 캐릭터 토큰을 표시한다.

### 구현 내용

- actor.position 기준으로 토큰 표시
- 현재 조작 가능한 캐릭터 강조
- 선택된 캐릭터 강조
- 상태이상 아이콘 표시
- 온라인 / 오프라인 상태 표시

### 토큰 표시 정보

```text
토큰 이미지
이름 또는 약칭
HP 간이 바
상태이상 아이콘
조작 가능 표시
```

### 완료 기준

- 파티 캐릭터가 맵 위에 위치대로 표시된다.
- 내가 조작할 수 있는 캐릭터가 명확하게 보인다.

---

## 8. 6단계: 오브젝트 / 단서 / NPC 렌더링

### 목표

탐색맵 위에 상호작용 가능한 요소를 표시한다.

### 표시 대상

```text
문
상자
단서
함정
획득 가능 아이템
대화 가능 NPC
이동 가능한 구역
위험 지역
```

### 구현 내용

- object.position 기준으로 표시
- objectType별 아이콘 또는 이미지 구분
- 조사 가능 여부 표시
- 상호작용 가능 여부 표시
- 숨겨진 요소는 서버에서 공개된 것만 전달

### 완료 기준

- 플레이어가 조사 가능한 대상을 시각적으로 파악할 수 있다.
- 숨겨진 단서나 함정이 클라이언트에 노출되지 않는다.

---

## 9. 7단계: 대상 선택 / 정보 패널

### 목표

토큰, NPC, 오브젝트를 클릭하면 간단한 정보를 보여준다.

### 선택 상태 예시

```ts
type SelectedExplorationTarget = {
  targetType: 'ACTOR' | 'NPC' | 'OBJECT';
  targetId: string;
};
```

### 정보 패널에 표시할 것

```text
이름
종류
간단 설명
조사 가능 여부
상호작용 가능 여부
거리
관련 행동
```

### 오브젝트 클릭 시 예시

```text
낡은 문
종류: 문
상태: 닫힘
가능 행동: 조사, 열기, 잠금 해제
```

### NPC 클릭 시 예시

```text
겁먹은 마을 소년
상태: 대화 가능
가능 행동: 대화 요청, 관찰
```

### 완료 기준

- 클릭한 대상의 정보가 즉시 보인다.
- 빈 맵 클릭 시 선택이 해제된다.
- 선택 대상에 따라 하단 행동 버튼 상태가 바뀐다.

---

## 10. 8단계: 좌측 파티 초상화

### 목표

탐색 중 파티 상태를 항상 확인할 수 있게 한다.

### 표시할 것

```text
초상화
이름
HP 바
상태이상 아이콘
온라인 여부
현재 선택 표시
조작 가능 여부
```

### 클릭 동작

```text
파티원 클릭
→ 해당 캐릭터 선택
→ 맵에서 해당 토큰 강조
→ 정보 패널 표시
```

### 완료 기준

- 파티 상태가 탐색 중 항상 보인다.
- 초상화를 눌러 해당 캐릭터를 빠르게 선택할 수 있다.

---

## 11. 9단계: 현재 조작 가능 캐릭터 표시

### 목표

사용자가 지금 어떤 캐릭터를 움직이거나 조작할 수 있는지 명확하게 보여준다.

### 표시 기준

```text
내 캐릭터: 조작 가능
다른 플레이어 캐릭터: 조작 불가
GM 권한: 전체 또는 NPC 조작 가능
관전자: 조작 불가
```

### UI 표현

```text
조작 가능: 밝은 강조
조작 불가: 어둡게 처리
선택 중: 테두리 강조
GM 조작 가능 대상: 별도 표시
```

### 완료 기준

- 사용자가 조작 불가 캐릭터를 움직이려 하지 않는다.
- 선택된 캐릭터가 하단 행동 UI와 연결된다.

---

## 12. 10단계: 하단 탐색 행동 탭

### 목표

탐색 행동을 카테고리별로 정리한다.

### 추천 탭 구성

```text
[탐색] [상호작용] [아이템]
```

### 탐색 탭

```text
이동
조사
관찰
듣기
흔적 찾기
주변 살피기
```

### 상호작용 탭

```text
문 열기
잠금 해제
상자 열기
함정 확인
함정 해제
NPC에게 말 걸기
GM에게 요청
```

### 아이템 탭

```text
횃불 사용
열쇠 사용
도구 사용
소비 아이템 사용
퀘스트 아이템 사용
```

### 완료 기준

- 탭 전환 시 행동 목록이 바뀐다.
- 탐색 중 자주 쓰는 행동은 기본 탭에서 바로 보인다.

---

## 13. 11단계: 행동 버튼 목록

### 목표

현재 캐릭터와 선택 대상 기준으로 사용할 수 있는 행동을 버튼으로 표시한다.

### ExplorationAction 예시

```ts
type ExplorationAction = {
  id: string;
  name: string;
  category: 'EXPLORE' | 'INTERACT' | 'ITEM';
  requiresTarget: boolean;
  targetType?: 'ACTOR' | 'NPC' | 'OBJECT' | 'POINT' | 'SELF';
  enabled: boolean;
  disabledReason?: string;
  description: string;
  requestMode: 'IMMEDIATE' | 'GM_APPROVAL' | 'CHECK_REQUIRED';
};
```

### 추천 API

```http
GET /api/v1/sessions/{sessionId}/exploration/my-actions
```

### 완료 기준

- 현재 선택 캐릭터와 대상에 따라 행동 버튼이 활성화/비활성화된다.
- 사용할 수 없는 행동은 이유를 확인할 수 있다.

---

## 14. 12단계: 행동 상세 설명

### 목표

행동을 누르거나 hover했을 때 상세 정보를 보여준다.

### 표시할 것

```text
행동 이름
대상 조건
필요 도구
예상 처리 방식
판정 필요 여부
GM 승인 필요 여부
사용 불가 이유
```

### 예시

```text
잠금 해제
대상: 잠긴 문 또는 상자
필요: 도둑 도구
처리: 민첩 판정 또는 GM 승인
```

### 완료 기준

- 사용자가 행동 전에 어떤 처리가 필요한지 이해할 수 있다.
- 판정 필요 행동과 즉시 처리 행동이 구분된다.

---

## 15. 13단계: 행동 불가 사유 표시

### 목표

왜 행동이 안 되는지 명확하게 보여준다.

### 불가 사유 예시

```text
조작 권한이 없습니다.
대상이 필요합니다.
선택한 대상에는 사용할 수 없습니다.
거리가 너무 멉니다.
필요한 도구가 없습니다.
이미 조사한 대상입니다.
GM 승인이 필요한 행동입니다.
현재 탐색 상태에서는 사용할 수 없습니다.
```

### UI 처리

```text
버튼 비활성화
hover/click 시 disabledReason 표시
선택 대상 정보 패널에도 관련 사유 표시
```

### 완료 기준

- 비활성화 버튼만 보고 끝나지 않는다.
- 사용자는 다음에 뭘 해야 하는지 알 수 있다.

---

## 16. 14단계: 대상 선택 모드

### 목표

행동 선택 후 대상이나 위치를 고르게 한다.

### 상태 예시

```ts
type ExplorationTargetingState = {
  actionId: string;
  targetType: 'ACTOR' | 'NPC' | 'OBJECT' | 'POINT' | 'SELF';
  selectedTargetId?: string;
  selectedPoint?: {
    x: number;
    y: number;
  };
};
```

### 안내 문구 예시

```text
이동할 위치를 선택하세요.
조사할 대상을 선택하세요.
상호작용할 오브젝트를 선택하세요.
아이템을 사용할 대상을 선택하세요.
```

### 완료 기준

- 행동 선택 후 화면이 대상 선택 모드로 전환된다.
- 선택 가능한 대상과 불가능한 대상이 구분된다.
- 취소 버튼으로 대상 선택 모드를 빠져나올 수 있다.

---

## 17. 15단계: 이동 요청 처리

### 목표

플레이어가 맵에서 이동 위치를 선택하고 이동 요청을 보낼 수 있게 한다.

### 추천 흐름

```text
이동 버튼 클릭
→ 이동할 위치 선택
→ 이동 요청 요약 표시
→ [취소] [요청]
→ 서버 검증 또는 GM 승인
```

### 추천 API

```http
POST /api/v1/sessions/{sessionId}/exploration/move
```

### 요청 예시

```ts
type ExplorationMoveRequest = {
  actorId: string;
  targetPoint: {
    x: number;
    y: number;
  };
};
```

### 처리 원칙

```text
MVP에서는 즉시 이동 또는 GM 승인 방식 중 하나로 단순화
벽 충돌 / 경로 탐색은 후순위
서버가 최종 위치를 확정
```

### 완료 기준

- 플레이어가 토큰을 직접 끌어다 놓는 방식이 아니라, 이동 요청 흐름으로 처리된다.
- 서버 반영 전에는 확정 이동으로 취급하지 않는다.

---

## 18. 16단계: 조사 요청 처리

### 목표

플레이어가 오브젝트나 구역을 조사할 수 있게 한다.

### 추천 흐름

```text
조사 버튼 클릭
→ 조사 대상 선택
→ 조사 요청 요약 표시
→ [취소] [요청]
→ GM 또는 AI GM 응답
→ 필요 시 단서 공개
```

### 추천 API

```http
POST /api/v1/sessions/{sessionId}/exploration/investigate
```

### 요청 예시

```ts
type ExplorationInvestigateRequest = {
  actorId: string;
  targetId: string;
  targetType: 'OBJECT' | 'NPC' | 'AREA';
  message?: string;
};
```

### 처리 원칙

```text
숨겨진 정보는 클라이언트에 미리 내려주지 않는다.
조사 결과는 서버 또는 GM이 공개 상태로 변경한다.
AI GM은 미공개 단서를 임의로 확정하지 않는다.
```

### 완료 기준

- 조사 요청이 메인 채팅 또는 장면 응답으로 기록된다.
- 공개된 단서만 화면에 추가된다.

---

## 19. 17단계: 상호작용 요청 처리

### 목표

문 열기, 상자 열기, NPC 대화 등 직접 상호작용을 처리한다.

### 추천 흐름

```text
상호작용 행동 선택
→ 대상 선택
→ 필요 조건 확인
→ [취소] [요청]
→ 서버 검증 / GM 승인 / 판정 요청
```

### 추천 API

```http
POST /api/v1/sessions/{sessionId}/exploration/interact
```

### 요청 예시

```ts
type ExplorationInteractRequest = {
  actorId: string;
  targetId: string;
  actionId: string;
  message?: string;
};
```

### 상호작용 예시

```text
문 열기
상자 열기
잠금 해제
함정 확인
함정 해제
NPC에게 말 걸기
장치 작동
```

### 완료 기준

- 상호작용 요청이 선택 대상과 연결된다.
- 결과에 따라 오브젝트 상태가 변경될 수 있다.

---

## 20. 18단계: 아이템 사용 요청 처리

### 목표

탐색 중 아이템을 사용할 수 있게 한다.

### 추천 흐름

```text
아이템 탭 클릭
→ 사용할 아이템 선택
→ 대상 또는 위치 선택
→ [취소] [요청]
→ 서버 검증 / GM 승인
```

### 추천 API

```http
POST /api/v1/sessions/{sessionId}/exploration/use-item
```

### 요청 예시

```ts
type ExplorationUseItemRequest = {
  actorId: string;
  itemId: string;
  targetId?: string;
  targetPoint?: {
    x: number;
    y: number;
  };
};
```

### 아이템 예시

```text
횃불
열쇠
밧줄
도둑 도구
포션
퀘스트 아이템
```

### 완료 기준

- 아이템 사용이 채팅 선언만으로 끝나지 않고 UI 요청으로 처리된다.
- 사용 가능 여부를 서버가 검증한다.

---

## 21. 19단계: 우측 채팅창 연결

### 목표

탐색 중 대화와 요청 로그를 처리한다.

### 채팅 탭

```text
[메인] [일반]
```

### 메인 채팅 역할

```text
GM에게 요청
NPC에게 말하기
조사 결과 출력
상호작용 결과 출력
AI GM 응답
```

### 일반 채팅 역할

```text
플레이어 잡담
메타 대화
룰 상담
진행 외 대화
```

### 주의점

- 이동, 조사, 상호작용은 하단 UI로 요청하는 것이 기본이다.
- 메인 채팅은 자연어 보조 입력으로 사용한다.
- 상태 변경은 채팅만으로 즉시 확정하지 않는다.

### 완료 기준

- 탐색 요청 결과가 메인 채팅 또는 장면 응답으로 확인된다.
- 일반 채팅과 진행 로그가 섞이지 않는다.

---

## 22. 20단계: 권한별 UI 분기

### 목표

GM / 플레이어 / 관전자의 탐색 조작 권한을 분리한다.

### GM

```text
모든 토큰 위치 조정 가능
오브젝트 공개 / 숨김 가능
단서 공개 가능
노드 전환 가능
NPC 조작 가능
```

### 플레이어

```text
자기 캐릭터 조작 가능
이동 요청 가능
조사 요청 가능
상호작용 요청 가능
아이템 사용 요청 가능
공개된 요소만 확인 가능
```

### 관전자

```text
공개 탐색 화면 확인 가능
조작 불가
채팅 제한 가능
```

### 완료 기준

- 권한이 없는 사용자가 숨겨진 오브젝트를 볼 수 없다.
- 플레이어가 다른 캐릭터를 임의로 이동시키지 못한다.

---

## 23. 21단계: 맵 기본 조작 보완

### 목표

탐색맵을 불편하지 않게 조작할 수 있게 한다.

### 필수 조작

```text
마우스 드래그: 맵 이동
휠: 줌 인/아웃
토큰 클릭: 캐릭터 선택
오브젝트 클릭: 대상 선택
빈 칸 클릭: 선택 해제 또는 위치 선택
ESC: 현재 선택/대상 선택 취소
```

### 추가하면 좋은 조작

```text
내 캐릭터로 화면 이동
파티 전체 보기
줌 초기화
조사 가능 오브젝트 강조 토글
```

### 완료 기준

- 큰 맵에서도 원하는 위치를 볼 수 있다.
- 대상 선택과 맵 이동이 충돌하지 않는다.

---

## 24. 22단계: 로딩 / 빈 상태 / 에러 상태

### 목표

탐색 화면이 데이터 상태에 따라 안정적으로 보이게 한다.

### 로딩

```text
탐색 지역을 불러오는 중입니다.
```

### 빈 상태

```text
현재 탐색맵이 없습니다.
현재 공개된 오브젝트가 없습니다.
현재 조작 가능한 캐릭터가 없습니다.
```

### 에러

```text
현재 탐색 정보를 불러오지 못했습니다.
다시 시도
```

### 완료 기준

- 맵이나 오브젝트가 없어도 화면이 깨지지 않는다.
- API 실패 시 사용자가 상황을 이해할 수 있다.

---

## 25. 23단계: 노드 전환 처리

### 목표

탐색 노드에서 다른 노드 또는 다른 화면 타입으로 전환한다.

### 전환 케이스

```text
EXPLORATION → STORY
EXPLORATION → EXPLORATION
EXPLORATION → COMBAT
```

### 추천 API

```http
POST /api/v1/sessions/{sessionId}/nodes/transition
```

### 요청 예시

```ts
type NodeTransitionRequest = {
  fromNodeId: string;
  toNodeId: string;
  reason?: string;
};
```

### 처리 흐름

```text
GM이 전환 버튼 클릭
또는 특정 조건 충족
→ 서버가 권한 / 조건 확인
→ 현재 세션의 currentNodeId 변경
→ 클라이언트에 새 노드 상태 반영
→ nodeType에 맞는 화면으로 이동
```

### 완료 기준

- 노드 타입에 따라 알맞은 화면으로 이동한다.
- 플레이어 화면도 같은 노드로 동기화된다.

---

## 26. 24단계: QA / 예외 케이스 정리

### 확인해야 할 케이스

```text
탐색맵이 없을 때 화면이 깨지지 않는가
공개된 오브젝트가 0개일 때 빈 상태가 표시되는가
숨겨진 단서가 클라이언트에 내려오지 않는가
내 캐릭터만 조작 가능한가
다른 플레이어 캐릭터를 움직일 수 없는가
오브젝트 클릭 시 정보 패널이 뜨는가
빈 칸 클릭 시 선택이 해제되는가
이동 요청 전에는 토큰 위치가 확정 변경되지 않는가
조사 요청 후 공개된 단서만 화면에 추가되는가
GM 전용 버튼이 플레이어에게 보이지 않는가
EXPLORATION → STORY 전환 시 스토리 화면으로 이동하는가
EXPLORATION → COMBAT 전환 시 전투 화면으로 이동하는가
맵 드래그와 대상 클릭이 충돌하지 않는가
채팅 입력 중 ESC 또는 단축키가 오작동하지 않는가
새로고침 시 현재 탐색 상태가 복구되는가
```

---

## 27. 프론트 컴포넌트 추천 구조

```text
src/pages/ExplorationPage.tsx

src/features/exploration/
├─ components/
│  ├─ ExplorationLayout.tsx
│  ├─ ExplorationHeader.tsx
│  ├─ ExplorationMap.tsx
│  ├─ ExplorationActorToken.tsx
│  ├─ ExplorationObjectToken.tsx
│  ├─ ExplorationNpcToken.tsx
│  ├─ PartyPortraitBar.tsx
│  ├─ SelectedTargetPanel.tsx
│  ├─ BottomExplorationPanel.tsx
│  ├─ ExplorationActionTabs.tsx
│  ├─ ExplorationActionButtonGrid.tsx
│  ├─ ExplorationActionDetailPanel.tsx
│  ├─ ExplorationTargetingGuide.tsx
│  ├─ ExplorationControlPanel.tsx
│  └─ ExplorationEmptyState.tsx
│
├─ hooks/
│  ├─ useExplorationNodeState.ts
│  ├─ useExplorationSelection.ts
│  ├─ useExplorationActions.ts
│  ├─ useExplorationTargeting.ts
│  └─ useExplorationMapView.ts
│
├─ api/
│  └─ explorationApi.ts
│
├─ types/
│  └─ explorationTypes.ts
│
└─ utils/
   ├─ explorationPosition.ts
   ├─ explorationActionAvailability.ts
   ├─ explorationTargeting.ts
   └─ explorationPermissions.ts
```

---

## 28. 백엔드 API 추천 목록

### 현재 노드 조회

```http
GET /api/v1/sessions/{sessionId}/nodes/current
```

### 탐색 노드 상세 조회

```http
GET /api/v1/sessions/{sessionId}/exploration/nodes/{nodeId}
```

MVP에서는 `nodes/current`에 필요한 정보가 충분하면 별도 상세 조회는 나중으로 미뤄도 된다.

### 내 캐릭터의 탐색 행동 목록 조회

```http
GET /api/v1/sessions/{sessionId}/exploration/my-actions
```

### 이동 요청

```http
POST /api/v1/sessions/{sessionId}/exploration/move
```

### 조사 요청

```http
POST /api/v1/sessions/{sessionId}/exploration/investigate
```

### 상호작용 요청

```http
POST /api/v1/sessions/{sessionId}/exploration/interact
```

### 아이템 사용 요청

```http
POST /api/v1/sessions/{sessionId}/exploration/use-item
```

### 노드 전환

```http
POST /api/v1/sessions/{sessionId}/nodes/transition
```

### 메인 채팅 전송

```http
POST /api/v1/sessions/{sessionId}/chats/main
```

### 일반 채팅 전송

```http
POST /api/v1/sessions/{sessionId}/chats/general
```

---

## 29. 상태 관리 추천

### 프론트에서 관리할 상태

```text
explorationNodeState
selectedActorId
selectedTarget
selectedActionId
targetingState
activeActionTab
mapViewState
actionRequestState
activeChatTab
isChatCollapsed
```

### 서버가 반드시 관리해야 하는 상태

```text
현재 세션 ID
현재 노드 ID
노드 타입
캐릭터 위치
공개된 오브젝트
공개된 단서
오브젝트 상태
NPC 위치
파티 상태
채팅 로그
GM 권한
노드 전환 기록
```

### 원칙

```text
프론트는 표시와 선택만 담당
서버는 현재 노드와 공개 정보 관리
GM은 탐색 결과와 노드 진행을 결정
AI는 대화/묘사/힌트 보조만 담당
숨겨진 정보는 클라이언트에 미리 내려주지 않음
```

---

## 30. 구현 순서 결론

### 가장 먼저 할 것

```text
1. ExplorationPage 레이아웃 생성
2. ExplorationNodeState mock 데이터 작성
3. 탐색맵 렌더링
4. 캐릭터 토큰 렌더링
5. 오브젝트 / NPC 렌더링
```

### 그 다음 할 것

```text
6. 토큰 / 오브젝트 클릭 선택
7. 선택 대상 정보 패널
8. 좌측 파티 초상화
9. 현재 조작 가능 캐릭터 표시
10. 하단 탐색 행동 탭
```

### 그 다음 할 것

```text
11. 행동 버튼 목록
12. 행동 상세 설명
13. 행동 불가 사유
14. 대상 선택 모드
15. 이동 요청
16. 조사 요청
17. 상호작용 요청
18. 아이템 사용 요청
```

### 마지막으로 할 것

```text
19. 우측 채팅창 연결
20. 권한별 UI 분기
21. 맵 기본 조작 보완
22. 노드 전환 처리
23. 로딩 / 빈 상태 / 에러 상태
24. QA / 예외 케이스 정리
```

---

## 31. 핵심 기준

탐색 화면은 스토리 화면보다 전투 화면에 가깝다.

```text
스토리: 중앙 장면 연출 + 하단 파티 카드
탐색: 중앙 맵 조작 + 좌측 파티 초상화 + 하단 탐색 행동 UI
전투: 중앙 전투맵 + 좌측 파티 초상화 + 하단 전투 행동 UI
```

탐색 화면의 핵심은 맵에서 대상을 선택하고, 하단 UI로 이동/조사/상호작용을 요청하는 것이다.

```text
이동: 맵 위치 선택
조사: 오브젝트 / 구역 선택
상호작용: 문 / 상자 / NPC / 장치 선택
아이템 사용: 아이템 선택 후 대상 선택
결과 확정: 서버 검증 또는 GM 승인
결과 묘사: GM 또는 AI
```

하단을 파티 카드로 쓰지 않고 행동 UI로 쓰는 것이 좋다.
탐색에서는 파티 상태보다 맵 조작과 조사 행동이 더 중요하기 때문이다.
