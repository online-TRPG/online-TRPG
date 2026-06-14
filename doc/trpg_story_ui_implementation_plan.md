# TRPG 온라인 플랫폼 스토리 화면 UI 구현 순서 정리

## 0. 최종 추천 UI 구성

```text
┌──────────────────────────────────────────────┬────────────────────┐
│ 현재 장면 제목 / 노드명 / 장면 상태            │ 우측 채팅창          │
│ 예: 오래된 여관의 비밀 / STORY                 │ [메인] [일반]        │
├──────────────────────────────────────────────┤                    │
│                                              │                    │
│                 장면 연출 영역                 │                    │
│                                              │                    │
│  ┌────────────────────────────────────────┐  │                    │
│  │              배경 이미지                │  │                    │
│  │                                        │  │                    │
│  │   NPC 스탠딩 이미지     중요 아이템 카드 │  │                    │
│  │                                        │  │                    │
│  └────────────────────────────────────────┘  │                    │
│                                              │                    │
│  장면 설명 / GM 내레이션                      │                    │
│  - 현재 상황                                 │                    │
│  - 눈에 보이는 정보                           │                    │
│  - 대화 가능한 NPC                            │                    │
│                                              │                    │
│  현재 등장 요소                               │                    │
│  [NPC] [아이템] [단서] [오브젝트]              │                    │
├──────────────────────────────────────────────┴                     ┤
│ 파티 캐릭터 카드 4개                           |                    │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐|                  │
│ │ 캐릭터1 │ │ 캐릭터2 │ │ 캐릭터3 │ │ 캐릭터4 │  |                  │
│ │ HP/상태 │ │ HP/상태 │ │ HP/상태 │ │ HP/상태 │ |                   │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘|                   │
└────────────────────────────────────────────────────────────────────┘
```

### UI 책임 분리

```text
장면 연출: 중앙 장면 연출 영역
대화 / 요청: 우측 메인 채팅
잡담: 우측 일반 채팅
파티 상태 확인: 하단 캐릭터 카드
장면 정보 확인: 장면 설명 / 등장 요소 패널
노드 진행: GM 전용 진행 버튼 또는 서버 상태 변경
```

---

## 1. MVP 스토리 화면 최종 기준

### 화면 구성

```text
상단: 현재 장면 제목 / 노드명 / 타입 표시
중앙: 배경 이미지 / NPC 이미지 / 아이템 이미지 / 장면 설명
우측: 메인 채팅 / 일반 채팅
하단: 파티 캐릭터 카드
중앙 하단 또는 좌측: 현재 등장 요소 목록
GM 전용: 다음 노드 이동 / 탐색 전환 / 전투 전환 버튼
```

### MVP 포함 기능

- 현재 스토리 노드 정보 표시
- 배경 이미지 표시
- NPC 이미지 표시
- 아이템 / 단서 이미지 표시
- 장면 설명 표시
- 현재 등장 요소 목록
- 우측 채팅창
  - 메인 채팅
  - 일반 채팅
- 하단 파티 캐릭터 카드
- 캐릭터 카드 클릭 시 간단 상세 보기
- GM 전용 노드 진행 버튼
- 플레이어용 요청 입력
- 스토리 노드 새로고침 복구

### MVP 제외 기능

- 복잡한 컷신 애니메이션
- NPC 입장 / 퇴장 연출
- 음성 재생
- 배경 음악
- 호감도 실시간 UI
- 고급 대화 선택지 분기 UI
- 자동 시네마틱 카메라
- 다중 장면 레이어 편집 기능

---

## 2. 구현 우선순위 요약

```text
1. 스토리 화면 레이아웃 골격
2. 스토리 노드 데이터 구조 정의
3. 스토리 노드 조회 API 연결
4. 장면 연출 영역 구현
5. 배경 이미지 표시
6. NPC 이미지 표시
7. 아이템 / 단서 이미지 표시
8. 장면 설명 영역 구현
9. 현재 등장 요소 목록 구현
10. 하단 파티 캐릭터 카드 구현
11. 캐릭터 카드 상세 보기
12. 우측 채팅창 연결
13. 메인 채팅 / 일반 채팅 분리
14. GM 전용 진행 버튼
15. 플레이어 요청 입력 처리
16. 노드 전환 처리
17. 권한별 UI 분기
18. 로딩 / 빈 상태 / 에러 상태
19. 반응형 크기 조정
20. QA / 예외 케이스 정리
```

---

## 3. 1단계: 스토리 화면 레이아웃 골격

### 목표

스토리 화면의 큰 영역을 먼저 고정한다.

### 추천 컴포넌트 구조

```text
StoryPage
├─ StoryHeader
├─ StorySceneArea
├─ StoryElementPanel
├─ RightChatSidebar
├─ PartyCardBar
└─ StoryControlPanel
```

### 구현할 영역

- 전체 화면 wrapper
- 상단 장면 제목 영역
- 중앙 장면 연출 영역
- 우측 채팅창 영역
- 하단 파티 카드 영역
- GM 전용 진행 버튼 영역

### 이 단계에서 하지 말 것

- 노드 전환 로직
- 채팅 저장
- AI GM 응답 생성
- 이미지 업로드 / 편집
- 복잡한 분기 처리

### 완료 기준

- 스토리 화면의 영역 배치가 고정된다.
- 전투 화면과 다른 레이아웃을 명확히 가진다.
- 우측 채팅과 하단 파티 카드가 중앙 장면 영역을 침범하지 않는다.

---

## 4. 2단계: 스토리 노드 데이터 구조 정의

### 목표

스토리 화면을 그리는 데 필요한 데이터를 확정한다.

### StoryNodeState 예시

```ts
type StoryNodeState = {
  sessionId: string;
  scenarioId: string;
  nodeId: string;
  nodeType: 'STORY';
  title: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  scene: StoryScene;
  party: PartyCharacterSummary[];
  permissions: StoryPermissions;
};
```

### StoryScene 예시

```ts
type StoryScene = {
  background?: StoryAsset;
  npcs: StoryNpc[];
  items: StoryItem[];
  clues: StoryClue[];
  description: string;
  gmNoteVisibleToGM?: string;
};
```

### StoryAsset 예시

```ts
type StoryAsset = {
  id: string;
  name: string;
  assetType: 'BACKGROUND' | 'NPC' | 'ITEM' | 'CLUE' | 'OBJECT';
  imageUrl?: string;
  description?: string;
};
```

### StoryNpc 예시

```ts
type StoryNpc = {
  id: string;
  name: string;
  imageUrl?: string;
  shortDescription?: string;
  disposition?: 'FRIENDLY' | 'NEUTRAL' | 'HOSTILE' | 'UNKNOWN';
  isInteractable: boolean;
};
```

### PartyCharacterSummary 예시

```ts
type PartyCharacterSummary = {
  characterId: string;
  playerId: string;
  name: string;
  portraitUrl?: string;
  hp: number;
  maxHp: number;
  conditions: string[];
  isOnline: boolean;
};
```

### StoryPermissions 예시

```ts
type StoryPermissions = {
  canControlScene: boolean;
  canMoveNextNode: boolean;
  canRequestToGM: boolean;
  canSpeakAsNpc: boolean;
};
```

### 완료 기준

- 화면에 필요한 데이터가 StoryNodeState 하나로 정리된다.
- mock 데이터만으로 스토리 화면을 렌더링할 수 있다.

---

## 5. 3단계: 스토리 노드 조회 API 연결

### 목표

스토리 화면 진입 시 현재 노드 상태를 불러온다.

### 추천 API

```http
GET /api/v1/sessions/{sessionId}/nodes/current
```

### 응답에 포함할 것

```text
현재 노드 ID
노드 타입
장면 제목
장면 설명
배경 이미지
NPC 목록
아이템 목록
단서 목록
파티 상태 요약
현재 사용자 권한
```

### 프론트 처리 흐름

```text
StoryPage 진입
→ 현재 노드 조회
→ nodeType이 STORY인지 확인
→ StoryNodeState 저장
→ 화면 렌더링
```

### 완료 기준

- 새로고침해도 현재 스토리 노드가 복구된다.
- nodeType이 STORY가 아닐 경우 해당 화면으로 리다이렉트하거나 전환 처리한다.

---

## 6. 4단계: 장면 연출 영역 구현

### 목표

스토리 화면의 중심이 되는 시각 영역을 만든다.

### 구현 내용

- 배경 이미지 컨테이너
- NPC 스탠딩 이미지 레이어
- 아이템 / 단서 카드 레이어
- 장면 설명과 겹치지 않도록 영역 분리
- 이미지가 없을 때 기본 placeholder 표시

### 배치 원칙

```text
배경: 가장 뒤, 넓게 표시
NPC: 배경 위 좌/우 또는 중앙 배치
아이템/단서: 카드형으로 작게 표시
장면 설명: 이미지 아래 또는 반투명 패널
```

### 완료 기준

- 배경, NPC, 아이템 이미지가 동시에 보여도 복잡하지 않다.
- 이미지가 없는 노드도 화면이 깨지지 않는다.

---

## 7. 5단계: 배경 이미지 표시

### 목표

현재 장면의 배경 이미지를 안정적으로 보여준다.

### 구현 내용

- background.imageUrl 렌더링
- 이미지 비율 유지
- 어두운 오버레이 선택 적용
- 이미지 로딩 실패 시 fallback 표시

### fallback 예시

```text
배경 이미지 없음
현재 장면: 오래된 여관의 비밀
```

### 완료 기준

- 배경 이미지가 중앙 장면 영역을 채운다.
- 세로/가로 비율이 달라도 UI가 깨지지 않는다.

---

## 8. 6단계: NPC 이미지 표시

### 목표

현재 등장 NPC를 시각적으로 보여준다.

### 구현 내용

- scene.npcs 목록 렌더링
- NPC 이미지 표시
- NPC 이름 라벨 표시
- 대화 가능 여부 표시
- 클릭 시 NPC 정보 표시

### NPC 클릭 시 표시할 정보

```text
이름
간단 설명
태도
대화 가능 여부
현재 장면에서의 역할
```

### 완료 기준

- 현재 등장 NPC를 즉시 파악할 수 있다.
- NPC가 여러 명이어도 화면이 과하게 복잡하지 않다.

---

## 9. 7단계: 아이템 / 단서 이미지 표시

### 목표

스토리 장면에서 중요한 물건이나 단서를 보여준다.

### 구현 내용

- scene.items 렌더링
- scene.clues 렌더링
- 카드형 UI
- 클릭 시 상세 설명 표시
- 획득 가능 / 조사 가능 여부 표시

### 표시 예시

```text
[낡은 열쇠]
[피 묻은 편지]
[깨진 문장]
```

### 완료 기준

- 중요한 오브젝트가 장면 안에서 묻히지 않는다.
- 탐색 화면처럼 복잡한 맵 클릭 없이도 단서를 확인할 수 있다.

---

## 10. 8단계: 장면 설명 영역 구현

### 목표

GM 내레이션과 현재 상황 설명을 읽기 쉽게 보여준다.

### 표시할 것

```text
현재 상황
눈에 보이는 정보
들을 수 있는 정보
대화 가능한 대상
플레이어가 요청할 수 있는 행동의 예시
```

### 주의점

- 숨겨진 정보는 플레이어에게 표시하지 않는다.
- GM 전용 메모는 GM에게만 보인다.
- 너무 긴 설명은 접기/펼치기 처리한다.

### 완료 기준

- 플레이어가 현재 장면에서 뭘 할 수 있는지 이해할 수 있다.
- GM 전용 정보가 플레이어에게 노출되지 않는다.

---

## 11. 9단계: 현재 등장 요소 목록 구현

### 목표

현재 장면에서 상호작용 가능한 요소를 빠르게 보여준다.

### 요소 구분

```text
NPC
아이템
단서
오브젝트
위험 요소
```

### UI 예시

```text
현재 등장 요소
[NPC] 마을 촌장
[NPC] 수상한 상인
[아이템] 낡은 지도
[단서] 검은 물 자국
```

### 클릭 동작

```text
요소 선택
→ 상세 정보 패널 표시
→ 메인 채팅 입력 보조 가능
```

### 완료 기준

- 플레이어가 현재 장면의 상호작용 대상을 놓치지 않는다.
- GM이 세팅한 장면 요소가 화면에 반영된다.

---

## 12. 10단계: 하단 파티 캐릭터 카드 구현

### 목표

스토리 진행 중 파티 상태를 항상 확인할 수 있게 한다.

### 카드에 표시할 것

```text
초상화
캐릭터명
플레이어명
HP / Max HP
상태이상
온라인 여부
간단 메모
```

### 클릭 시

```text
캐릭터 간단 상세 보기
캐릭터 시트 열기
해당 캐릭터가 최근 한 말 보기
```

### 완료 기준

- 파티 상태가 하단에 안정적으로 표시된다.
- 스토리 화면에서는 전투처럼 공간 압박이 크지 않으므로 카드형 표시가 가능하다.

---

## 13. 11단계: 캐릭터 카드 상세 보기

### 목표

파티 카드 클릭 시 더 자세한 정보를 보여준다.

### 표시할 정보

```text
캐릭터명
플레이어명
HP
상태이상
주요 능력치 요약
현재 장면 관련 메모
```

### MVP 처리

- 모달 또는 작은 팝오버로 충분하다.
- 전체 캐릭터 시트는 별도 페이지로 연결해도 된다.

### 완료 기준

- 하단 카드가 단순 장식이 아니라 빠른 상태 확인 수단이 된다.

---

## 14. 12단계: 우측 채팅창 연결

### 목표

스토리 진행의 핵심 입력 수단인 채팅을 연결한다.

### 채팅 탭

```text
[메인] [일반]
```

### 메인 채팅 역할

```text
GM에게 요청
NPC에게 말하기
캐릭터 대사
장면 행동 선언
AI GM에게 자연어 요청
```

### 일반 채팅 역할

```text
플레이어 잡담
메타 대화
룰 상담
진행 외 대화
```

### 완료 기준

- 스토리 화면에서 메인 채팅과 일반 채팅이 분리된다.
- 채팅 입력이 중앙 장면 UI를 방해하지 않는다.

---

## 15. 13단계: 메인 채팅 / 일반 채팅 분리

### 목표

스토리 진행용 대화와 잡담을 분리한다.

### 메인 채팅 메시지 타입

```ts
type MainChatMessage = {
  id: string;
  senderType: 'PLAYER' | 'GM' | 'NPC' | 'AI_GM';
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  relatedNpcId?: string;
};
```

### 일반 채팅 메시지 타입

```ts
type GeneralChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
};
```

### 완료 기준

- 메인 진행 로그와 잡담이 섞이지 않는다.
- GM/NPC/AI GM 발화가 구분된다.

---

## 16. 14단계: GM 전용 진행 버튼

### 목표

GM이 현재 스토리 노드를 진행하거나 전환할 수 있게 한다.

### GM 전용 버튼 예시

```text
다음 노드로 이동
탐색 화면으로 전환
전투 화면으로 전환
현재 장면 일시정지
현재 노드 종료
```

### 추천 위치

```text
상단 우측 또는 장면 설명 하단의 GM 전용 패널
```

### 플레이어에게 보이는 대체 UI

```text
GM에게 진행 요청
다음 행동 제안
준비 완료 표시
```

### 완료 기준

- GM 권한이 있는 사용자에게만 노드 제어 버튼이 보인다.
- 플레이어가 임의로 노드를 전환할 수 없다.

---

## 17. 15단계: 플레이어 요청 입력 처리

### 목표

플레이어가 GM 또는 AI GM에게 자연어로 요청할 수 있게 한다.

### 요청 예시

```text
촌장에게 우물에 대해 묻는다.
낡은 편지를 자세히 살펴본다.
상인에게 거짓말을 하는지 통찰 판정을 요청한다.
문 뒤에서 소리가 나는지 듣는다.
```

### 처리 원칙

```text
대화/요청은 메인 채팅으로 입력
상태 변경은 서버 또는 GM 승인 후 처리
AI GM은 숨겨진 정보 확정 금지
판정이 필요하면 판정 요청 흐름으로 넘김
```

### 완료 기준

- 플레이어 요청이 메인 채팅에 기록된다.
- 요청이 곧바로 상태 변경으로 이어지지 않는다.

---

## 18. 16단계: 노드 전환 처리

### 목표

스토리 노드에서 다른 노드 또는 다른 화면 타입으로 전환한다.

### 전환 케이스

```text
STORY → STORY
STORY → EXPLORATION
STORY → COMBAT
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
→ 서버가 권한 확인
→ 현재 세션의 currentNodeId 변경
→ 클라이언트에 새 노드 상태 반영
→ nodeType에 맞는 화면으로 이동
```

### 완료 기준

- 노드 타입에 따라 알맞은 화면으로 이동한다.
- 플레이어 화면도 같은 노드로 동기화된다.

---

## 19. 17단계: 권한별 UI 분기

### 목표

GM / 플레이어 / 관전자의 화면 조작 권한을 분리한다.

### GM

```text
NPC 발화 가능
장면 전환 가능
노드 진행 가능
숨겨진 GM 메모 확인 가능
```

### 플레이어

```text
메인 채팅 요청 가능
일반 채팅 가능
파티 카드 확인 가능
공개 장면 요소 확인 가능
```

### 관전자

```text
공개 장면 확인 가능
채팅 제한 가능
노드 제어 불가
```

### 완료 기준

- 권한이 없는 사용자가 GM 전용 정보를 볼 수 없다.
- 플레이어가 노드를 직접 바꾸지 못한다.

---

## 20. 18단계: 로딩 / 빈 상태 / 에러 상태

### 목표

스토리 화면이 데이터 상태에 따라 안정적으로 보이게 한다.

### 로딩

```text
현재 장면을 불러오는 중입니다.
```

### 빈 상태

```text
현재 장면에 등록된 이미지가 없습니다.
현재 등장 NPC가 없습니다.
현재 표시할 아이템이 없습니다.
```

### 에러

```text
현재 노드 정보를 불러오지 못했습니다.
다시 시도
```

### 완료 기준

- 이미지나 NPC가 없어도 화면이 깨지지 않는다.
- API 실패 시 사용자가 상황을 이해할 수 있다.

---

## 21. 19단계: 반응형 크기 조정

### 목표

화면 크기에 따라 스토리 UI가 깨지지 않게 한다.

### 데스크톱 기본

```text
중앙 장면 영역 + 우측 채팅 + 하단 파티 카드
```

### 좁은 화면 대응

```text
우측 채팅 접기 가능
하단 파티 카드 가로 스크롤
장면 설명 접기/펼치기
```

### 완료 기준

- 노트북 화면에서도 중앙 장면 영역이 너무 작아지지 않는다.
- 우측 채팅창을 접으면 장면 영역이 넓어진다.

---

## 22. 20단계: QA / 예외 케이스 정리

### 확인해야 할 케이스

```text
배경 이미지가 없을 때 화면이 깨지지 않는가
NPC가 0명일 때 빈 상태가 표시되는가
NPC가 여러 명일 때 배치가 과밀하지 않은가
아이템/단서가 많을 때 스크롤 또는 접기가 되는가
GM 메모가 플레이어에게 보이지 않는가
플레이어가 노드 전환 버튼을 볼 수 없는가
스토리 화면에서 새로고침해도 현재 노드가 복구되는가
STORY → COMBAT 전환 시 전투 화면으로 이동하는가
STORY → EXPLORATION 전환 시 탐색 화면으로 이동하는가
메인 채팅과 일반 채팅이 섞이지 않는가
채팅 입력 중 화면 단축키가 오작동하지 않는가
```

---

## 23. 프론트 컴포넌트 추천 구조

```text
src/pages/StoryPage.tsx

src/features/story/
├─ components/
│  ├─ StoryLayout.tsx
│  ├─ StoryHeader.tsx
│  ├─ StorySceneArea.tsx
│  ├─ StoryBackground.tsx
│  ├─ StoryNpcLayer.tsx
│  ├─ StoryItemLayer.tsx
│  ├─ StoryDescriptionPanel.tsx
│  ├─ StoryElementPanel.tsx
│  ├─ PartyCardBar.tsx
│  ├─ PartyCharacterCard.tsx
│  ├─ CharacterQuickView.tsx
│  ├─ StoryControlPanel.tsx
│  └─ StoryEmptyState.tsx
│
├─ hooks/
│  ├─ useStoryNodeState.ts
│  ├─ useStorySelection.ts
│  └─ useStoryTransition.ts
│
├─ api/
│  └─ storyApi.ts
│
├─ types/
│  └─ storyTypes.ts
│
└─ utils/
   ├─ storyAssetLayout.ts
   └─ storyPermissions.ts
```

---

## 24. 백엔드 API 추천 목록

### 현재 노드 조회

```http
GET /api/v1/sessions/{sessionId}/nodes/current
```

### 스토리 노드 상세 조회

```http
GET /api/v1/sessions/{sessionId}/story/nodes/{nodeId}
```

MVP에서는 `nodes/current`에 필요한 정보가 충분하면 별도 상세 조회는 나중으로 미뤄도 된다.

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

### 파티 상태 요약 조회

```http
GET /api/v1/sessions/{sessionId}/party/summary
```

MVP에서는 현재 노드 조회 응답에 파티 요약을 포함해도 된다.

---

## 25. 상태 관리 추천

### 프론트에서 관리할 상태

```text
storyNodeState
selectedNpcId
selectedItemId
selectedClueId
selectedCharacterId
activeChatTab
isChatCollapsed
isSceneDescriptionExpanded
```

### 서버가 반드시 관리해야 하는 상태

```text
현재 세션 ID
현재 노드 ID
노드 타입
공개된 장면 요소
파티 상태
채팅 로그
GM 권한
노드 전환 기록
```

### 원칙

```text
프론트는 표시와 선택만 담당
서버는 현재 노드와 공개 정보 관리
GM은 노드 진행을 결정
AI는 대화/묘사 보조만 담당
```

---

## 26. 구현 순서 결론

### 가장 먼저 할 것

```text
1. StoryPage 레이아웃 생성
2. StoryNodeState mock 데이터 작성
3. 배경 이미지 / NPC / 아이템 표시
4. 장면 설명 영역 표시
5. 우측 채팅창 배치
```

### 그 다음 할 것

```text
6. 하단 파티 캐릭터 카드
7. 캐릭터 카드 상세 보기
8. 현재 등장 요소 목록
9. NPC / 아이템 / 단서 클릭 상세 보기
10. 메인 채팅 / 일반 채팅 분리
```

### 그 다음 할 것

```text
11. GM 전용 진행 버튼
12. 플레이어 요청 입력 처리
13. 노드 전환 API
14. 권한별 UI 분기
15. 새로고침 복구
```

### 마지막으로 할 것

```text
16. 로딩 / 빈 상태 / 에러 상태
17. 반응형 처리
18. STORY → EXPLORATION 전환 검증
19. STORY → COMBAT 전환 검증
20. QA / 예외 케이스 정리
```

---

## 27. 핵심 기준

스토리 화면은 전투 화면과 다르게 명령형 UI보다 대화와 장면 연출이 우선이다.

```text
장면 이해: 중앙 이미지와 설명
대화 진행: 메인 채팅
잡담: 일반 채팅
상태 확인: 하단 파티 카드
노드 진행: GM 전용 제어
상태 변경: 서버 검증 또는 GM 승인
```

스토리 화면에서는 하단 파티 카드 유지가 적절하다.  
전투 화면처럼 행동 버튼이 많이 필요하지 않고, 장면 몰입과 파티 상태 확인이 더 중요하기 때문이다.
