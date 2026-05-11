# TRPG 메인 채팅 MVP 명령어 처리 구조

## 0. 기준

이 문서는 **메인 채팅창에서 실행할 MVP 명령어 버튼**만 정리한다.

```text
메인 채팅 명령어 = playerText가 필요한 자유 요청
프론트 버튼 = intent와 1:1 대응
프론트 UI = 1차 카테고리 → 세부 명령어 선택
백엔드 = 권한/상태/대상 검증 후 AI 호출 여부 판단
AI 서버 = 정해진 6개 역할만 수행
```

AI 서버 역할은 아래 6개로 고정한다.

| 역할 | 하는 일 | 하지 않는 일 |
|---|---|---|
| `Interpreter` | 플레이어 자연어를 구조화 행동 후보로 바꿈 | 성공/실패, 피해, 상태 변경 확정 |
| `Narrator` | 백엔드가 확정한 결과를 한국어로 서술 | 새 사실 추가 |
| `Director` | 공개 정보 안에서 힌트 제안 | 정답 강제, 숨김 단서 공개 |
| `Summarizer` | 로그를 플레이어용/AI 문맥용으로 요약 | 새 사실 생성 |
| `Actor` | 허용된 NPC 행동 후보 중 하나 선택 | NPC 대사 작성, 새 행동 생성 |
| `NpcDialogue` | 이미 허용된 상황 안에서 NPC 대사 작성 | 행동 선택, 결과 확정 |

---

## 1. MVP 프론트 명령어 버튼 목록

프론트에서는 세부 명령어를 한 번에 전부 보여주지 않고, **큰 카테고리로 1차 분류**한 뒤 세부 버튼을 보여준다.

---

## 1.1 스토리 화면

### 1차 카테고리

```text
[대화] [사회 행동] [질문] [조사] [RP 행동] [진행 보조]
```

### 카테고리별 세부 명령어

| 카테고리 | 버튼 | intent | 용도 |
|---|---|---|---|
| 대화 | NPC에게 말하기 | `TALK_TO_NPC` | NPC에게 직접 말을 걸거나 질문 |
| 사회 행동 | 설득하기 | `SOCIAL_PERSUADE` | NPC를 말로 설득 |
| 사회 행동 | 협박하기 | `SOCIAL_INTIMIDATE` | 위협으로 NPC 반응 유도 |
| 사회 행동 | 속이기 | `SOCIAL_DECEIVE` | 거짓말/위장으로 NPC 속이기 |
| 사회 행동 | 태도 살피기 | `READ_EMOTION` | NPC의 감정, 거짓말, 경계심 파악 |
| 질문 | 장면 질문 | `ASK_SCENE_INFO` | 현재 장면의 공개 정보 질문 |
| 조사 | 물건 살펴보기 | `INSPECT_STORY_OBJECT` | 장면에 놓인 물건/문서/단서 확인 |
| RP 행동 | RP 행동 | `DECLARE_RP_ACTION` | 상태 변경이 크지 않은 서사 행동 선언 |
| 진행 보조 | 힌트 요청 | `ASK_HINT` | 공개 정보 안에서 진행 힌트 요청 |
| 진행 보조 | 요약 요청 | `ASK_SUMMARY` | 현재까지의 상황/단서 요약 |
| 진행 보조 | 장면 진행 요청 | `REQUEST_SCENE_TRANSITION` | 다음 장소/노드 이동 요청 |

---

## 1.2 탐색 화면

### 1차 카테고리

```text
[관찰] [조사] [감각] [이동] [상호작용] [도구/아이템] [대화] [진행 보조]
```

### 카테고리별 세부 명령어

| 카테고리 | 버튼 | intent | 용도 |
|---|---|---|---|
| 관찰 | 주변 살피기 | `OBSERVE_AREA` | 넓은 구역을 둘러보고 공개 정보 확인 |
| 조사 | 조사하기 | `INVESTIGATE_OBJECT` | 특정 오브젝트/장소 자세히 조사 |
| 감각 | 듣기 | `LISTEN` | 소리, 기척, 움직임 확인 |
| 감각 | 위험 감지 | `DETECT_DANGER` | 함정, 매복, 붕괴 위험 등 확인 |
| 이동 | 특수 이동 | `SPECIAL_MOVE` | 일반 이동 버튼으로 처리하기 어려운 이동 |
| 상호작용 | 조작하기 | `INTERACT_OBJECT` | 문, 상자, 레버, 장치 등 조작 |
| 도구/아이템 | 도구 사용 | `USE_TOOL` | 밧줄, 횃불, 도둑 도구 등 활용 |
| 도구/아이템 | 아이템 창의 사용 | `USE_ITEM_EXPLORE` | 아이템을 정해진 효과 외 방식으로 활용 |
| 대화 | NPC에게 말하기 | `TALK_TO_NPC` | 탐색 중 NPC에게 말 걸기 |
| 진행 보조 | 파티 분담 | `SPLIT_PARTY_TASK` | 여러 파티원의 역할 분담 요청 |
| 진행 보조 | 힌트 요청 | `ASK_HINT` | 공개 정보 안에서 탐색 힌트 요청 |
| 진행 보조 | 요약 요청 | `ASK_SUMMARY` | 현재 탐색 상황/단서 요약 |
| 진행 보조 | 장면 진행 요청 | `REQUEST_SCENE_TRANSITION` | 다른 노드/장소로 이동 요청 |

---

## 1.3 전투 화면

### 1차 카테고리

```text
[창의 행동] [환경] [특수 공격] [전술] [반응/준비] [대화] [아이템/주문] [질문] [진행 보조]
```

### 카테고리별 세부 명령어

| 카테고리 | 버튼 | intent | 용도 |
|---|---|---|---|
| 창의 행동 | 창의적 기동 | `COMBAT_MANEUVER` | 일반 이동/공격으로 표현하기 어려운 움직임 |
| 환경 | 환경 이용 | `ENVIRONMENT_USE` | 지형지물, 오브젝트, 전장 환경 활용 |
| 특수 공격 | 임기응변 공격 | `IMPROVISED_ATTACK` | 주변 물건/상황을 이용한 비정형 공격 |
| 특수 공격 | 특정 부위/장비 노리기 | `CALLED_SHOT` | 적의 손, 다리, 장비 등 특정 목표 공격 |
| 반응/준비 | 준비 행동 | `READY_ACTION` | 조건부 행동 선언 |
| 반응/준비 | 반응 행동 문의 | `REACTION_REQUEST` | 반응/기회공격/차단 가능 여부 문의 |
| 대화 | 전투 중 대화 | `COMBAT_TALK` | 적에게 협박, 설득, 항복 권유 |
| 아이템/주문 | 아이템 창의 사용 | `USE_ITEM_COMBAT` | 전투 중 아이템을 비정형 방식으로 활용 |
| 아이템/주문 | 주문 창의 사용 | `USE_SPELL_CREATIVELY` | 주문을 환경/상황에 맞게 응용 |
| 전술 | 전술 질문 | `TACTIC_QUERY` | 현재 전투 상황에서 가능한 전술 질문 |
| 질문 | 룰 질문 | `ASK_RULE` | 현재 행동의 룰 처리 질문 |
| 진행 보조 | 힌트 요청 | `ASK_HINT` | 공개 정보 안에서 전투 힌트 요청 |
| 진행 보조 | 요약 요청 | `ASK_SUMMARY` | 현재 전투 상황 요약 |

---

## 2. 프론트에서 각 버튼마다 보내는 데이터

### 2.1 공통 Payload

모든 MVP 메인 채팅 명령어는 `playerText`를 필수로 보낸다.

현재 구현 엔드포인트는 아래와 같다.

```http
POST /api/v1/sessions/{sessionId}/actions/main-command
```

```ts
type MainCommandRequest = {
  sessionId: string;
  nodeId: string;
  screenType: "STORY" | "EXPLORATION" | "COMBAT";

  commandId: string;
  category: MainCommandCategory;
  intent: MainCommandIntent;

  actorId: string;
  playerText: string;

  targetId?: string;
  targetType?: "NPC" | "OBJECT" | "ACTOR" | "AREA" | "POINT" | "SELF";

  itemId?: string;
  spellId?: string;
  mapPoint?: { x: number; y: number };

  relatedIntent?: MainCommandIntent;
};
```

### 2.2 카테고리 타입

```ts
type MainCommandCategory =
  // story
  | "TALK"
  | "SOCIAL"
  | "QUESTION"
  | "INSPECTION"
  | "RP_ACTION"
  | "SUPPORT"

  // exploration
  | "OBSERVATION"
  | "SENSE"
  | "MOVEMENT"
  | "INTERACTION"
  | "TOOL_ITEM"

  // combat
  | "CREATIVE_ACTION"
  | "ENVIRONMENT"
  | "SPECIAL_ATTACK"
  | "TACTIC"
  | "REACTION_READY"
  | "ITEM_SPELL";
```

---

## 2.3 스토리 버튼별 데이터

| 카테고리 | intent | 필수 데이터 | 선택 데이터 |
|---|---|---|---|
| 대화 | `TALK_TO_NPC` | `actorId`, `targetId`, `targetType: NPC`, `playerText` | 없음 |
| 사회 행동 | `SOCIAL_PERSUADE` | `actorId`, `targetId`, `playerText` | 요구 조건 |
| 사회 행동 | `SOCIAL_INTIMIDATE` | `actorId`, `targetId`, `playerText` | 위협 근거 |
| 사회 행동 | `SOCIAL_DECEIVE` | `actorId`, `targetId`, `playerText` | 거짓 신분/증거 |
| 사회 행동 | `READ_EMOTION` | `actorId`, `targetId`, `playerText` | 의심 내용 |
| 질문 | `ASK_SCENE_INFO` | `actorId`, `playerText` | `targetId` |
| 조사 | `INSPECT_STORY_OBJECT` | `actorId`, `targetId`, `targetType: OBJECT`, `playerText` | 없음 |
| RP 행동 | `DECLARE_RP_ACTION` | `actorId`, `playerText` | `targetId` |
| 진행 보조 | `ASK_HINT` | `actorId`, `playerText` | hintLevel |
| 진행 보조 | `ASK_SUMMARY` | `actorId`, `playerText` | 요약 범위 |
| 진행 보조 | `REQUEST_SCENE_TRANSITION` | `actorId`, `playerText` | 목적지 노드 후보 |

---

## 2.4 탐색 버튼별 데이터

| 카테고리 | intent | 필수 데이터 | 선택 데이터 |
|---|---|---|---|
| 관찰 | `OBSERVE_AREA` | `actorId`, `playerText` | `mapPoint` |
| 조사 | `INVESTIGATE_OBJECT` | `actorId`, `targetId` 또는 `mapPoint`, `playerText` | `targetType` |
| 감각 | `LISTEN` | `actorId`, `playerText` | `targetId`, 방향 |
| 감각 | `DETECT_DANGER` | `actorId`, `playerText` | `targetId`, `mapPoint` |
| 이동 | `SPECIAL_MOVE` | `actorId`, `mapPoint`, `playerText` | `itemId`, `targetId` |
| 상호작용 | `INTERACT_OBJECT` | `actorId`, `targetId`, `playerText` | 조작 방식 |
| 도구/아이템 | `USE_TOOL` | `actorId`, `itemId`, `playerText` | `targetId`, `mapPoint` |
| 도구/아이템 | `USE_ITEM_EXPLORE` | `actorId`, `itemId`, `playerText` | `targetId`, `mapPoint` |
| 대화 | `TALK_TO_NPC` | `actorId`, `targetId`, `targetType: NPC`, `playerText` | 없음 |
| 진행 보조 | `SPLIT_PARTY_TASK` | `actorId`, `playerText` | 캐릭터별 target |
| 진행 보조 | `ASK_HINT` | `actorId`, `playerText` | hintLevel |
| 진행 보조 | `ASK_SUMMARY` | `actorId`, `playerText` | 요약 범위 |
| 진행 보조 | `REQUEST_SCENE_TRANSITION` | `actorId`, `playerText` | 목적지 노드 후보 |

---

## 2.5 전투 버튼별 데이터

| 카테고리 | intent | 필수 데이터 | 선택 데이터 |
|---|---|---|---|
| 창의 행동 | `COMBAT_MANEUVER` | `actorId`, `playerText` | `targetId`, `mapPoint` |
| 환경 | `ENVIRONMENT_USE` | `actorId`, `targetId` 또는 `mapPoint`, `playerText` | 없음 |
| 특수 공격 | `IMPROVISED_ATTACK` | `actorId`, `targetId`, `playerText` | 사용 오브젝트 |
| 특수 공격 | `CALLED_SHOT` | `actorId`, `targetId`, `playerText` | 노리는 부위 |
| 반응/준비 | `READY_ACTION` | `actorId`, `playerText` | trigger 조건 |
| 반응/준비 | `REACTION_REQUEST` | `actorId`, `playerText` | triggerEventId |
| 대화 | `COMBAT_TALK` | `actorId`, `targetId`, `playerText` | 없음 |
| 아이템/주문 | `USE_ITEM_COMBAT` | `actorId`, `itemId`, `playerText` | `targetId`, `mapPoint` |
| 아이템/주문 | `USE_SPELL_CREATIVELY` | `actorId`, `spellId`, `playerText` | `targetId`, `mapPoint` |
| 전술 | `TACTIC_QUERY` | `actorId`, `playerText` | `targetId` |
| 질문 | `ASK_RULE` | `actorId`, `playerText` | `relatedIntent` |
| 진행 보조 | `ASK_HINT` | `actorId`, `playerText` | hintLevel |
| 진행 보조 | `ASK_SUMMARY` | `actorId`, `playerText` | 요약 범위 |

---

## 3. 요청을 받은 백엔드 처리 방식

### 3.1 공통 선처리

```text
1. 세션/노드 확인
2. screenType과 nodeType 일치 확인
3. actorId 조작 권한 확인
4. playerText 비어 있는지 확인
5. targetId 공개 여부 확인
6. itemId/spellId 보유 여부 확인
7. 현재 공개 정보만 추출
8. 요청별 AI 호출 여부 결정
```

---

## 3.2 스토리 요청 처리

| intent | 백엔드 처리 | AI 호출 | AI에 덧붙일 데이터 | 프론트 반환 |
|---|---|---|---|---|
| `TALK_TO_NPC` | NPC 공개 상태 확인 | `NpcDialogue` | NPC 정보, 공개 장면, 최근 대화, playerText | NPC 대사 메시지 |
| `SOCIAL_PERSUADE` | 대상/권한 확인 | `Interpreter` | NPC 태도, 공개 상황, playerText | 판정 필요/GM 승인/불가 |
| `SOCIAL_INTIMIDATE` | 대상/권한 확인 | `Interpreter` | NPC 태도, 위험도, playerText | 판정 필요/GM 승인/불가 |
| `SOCIAL_DECEIVE` | 대상/권한 확인 | `Interpreter` | NPC 정보, 공개 상황, playerText | 판정 필요/GM 승인/불가 |
| `READ_EMOTION` | 대상 공개 여부 확인 | `Interpreter` | NPC 공개 행동, 최근 대화, playerText | 통찰 판정 후보 |
| `ASK_SCENE_INFO` | 공개 장면 정보 확인 | 없음 또는 `Interpreter` | 필요 시 공개 장면, playerText | 답변 메시지 |
| `INSPECT_STORY_OBJECT` | 오브젝트 공개 여부 확인 | `Interpreter` | 오브젝트 공개 정보, playerText | 조사 판정/공개 설명 |
| `DECLARE_RP_ACTION` | 상태 변경 여부 확인 | `Interpreter` 필요 시 | 장면, playerText | 묘사/GM 승인 필요 |
| `ASK_HINT` | 공개 정보 정리 | `Director` | 공개 단서, 목표, 시도한 행동, playerText | 힌트 메시지 |
| `ASK_SUMMARY` | 로그 조회 | `Summarizer` | 공개 로그, 공개 단서, playerText | 요약 메시지 |
| `REQUEST_SCENE_TRANSITION` | 이동 가능 노드/권한 확인 | 없음 또는 `Interpreter` | 현재 노드, 가능한 목적지, playerText | GM 승인 요청/전환 불가/전환 가능 |

---

## 3.3 탐색 요청 처리

| intent | 백엔드 처리 | AI 호출 | AI에 덧붙일 데이터 | 프론트 반환 |
|---|---|---|---|---|
| `OBSERVE_AREA` | 공개 맵/위치 확인 | `Interpreter` 필요 시 | 공개 맵 정보, actor 위치, playerText | 정보 답변/지각 판정 후보 |
| `INVESTIGATE_OBJECT` | 대상 공개 여부 확인 | `Interpreter` | 오브젝트 공개 정보, 위치, playerText | 조사 판정/GM 승인 |
| `LISTEN` | 위치/대상 확인 | `Interpreter` | 공개 위치, 소리 관련 공개 정보, playerText | 지각 판정/답변 |
| `DETECT_DANGER` | 위험 요소는 미전달, 감지 가능성 확인 | `Interpreter` | 공개 지형, 위치, playerText | 지각/조사 판정 |
| `SPECIAL_MOVE` | 위치/도구/거리 검증 | `Interpreter` | 맵 위치, 도구, playerText | 운동/곡예 판정 |
| `INTERACT_OBJECT` | 오브젝트 상태 확인 | 없음 또는 `Interpreter` | 오브젝트 공개 정보, playerText | 즉시 처리/판정/GM 승인 |
| `USE_TOOL` | 도구 보유/대상 검증 | `Interpreter` | 도구 정보, 대상, playerText | 검증 결과/판정 |
| `USE_ITEM_EXPLORE` | 아이템 보유/사용 가능성 검증 | 없음 또는 `Interpreter` | 아이템 정보, 대상, playerText | 사용 처리/GM 승인 |
| `TALK_TO_NPC` | NPC 공개 상태 확인 | `NpcDialogue` | NPC 정보, 장소, 최근 대화, playerText | NPC 대사 |
| `SPLIT_PARTY_TASK` | 캐릭터별 권한 확인 | `Interpreter` | party 상태, 공개 맵, playerText | 각 행동 후보 목록 |
| `ASK_HINT` | 공개 탐색 상태 정리 | `Director` | 공개 단서, 목표, 시도한 행동, playerText | 힌트 |
| `ASK_SUMMARY` | 탐색 로그 조회 | `Summarizer` | 공개 로그/단서, playerText | 요약 |
| `REQUEST_SCENE_TRANSITION` | 이동 가능 노드 확인 | 없음 또는 `Interpreter` | 현재 위치, 가능한 목적지, playerText | 전환 가능/GM 승인 필요 |

---

## 3.4 전투 요청 처리

| intent | 백엔드 처리 | AI 호출 | AI에 덧붙일 데이터 | 프론트 반환 |
|---|---|---|---|---|
| `COMBAT_MANEUVER` | 턴/행동권/거리/지형 확인 | `Interpreter` | 전투 상태, 위치, target, playerText | 판정 필요/불가/GM 승인 |
| `ENVIRONMENT_USE` | 오브젝트 존재/거리 확인 | `Interpreter` | 지형지물 정보, actor 위치, playerText | 판정/GM 승인 |
| `IMPROVISED_ATTACK` | 행동권/대상/거리 확인 | `Interpreter` | 대상, 주변 오브젝트, playerText | 공격 후보/판정 |
| `CALLED_SHOT` | 대상/장비/허용 여부 확인 | `Interpreter` | 대상 공개 상태, playerText | 불리한 공격/GM 승인 |
| `READY_ACTION` | 조건/행동 분리 필요 | `Interpreter` | 전투 상태, playerText | 준비 행동 후보 |
| `REACTION_REQUEST` | 반응권/트리거 확인 | 없음 또는 `Interpreter` | 전투 상태, trigger, playerText | 가능/불가/GM 승인 |
| `COMBAT_TALK` | 대상/NPC 상태 확인 | `NpcDialogue` 또는 `Interpreter` | NPC 상태, 전투 상황, playerText | 대사/협상 판정 |
| `USE_ITEM_COMBAT` | 아이템/행동권/대상 확인 | `Interpreter` 필요 시 | 아이템, 대상, playerText | 사용 가능/판정 |
| `USE_SPELL_CREATIVELY` | 주문 보유/슬롯/효과 확인 | `Interpreter` | 주문 설명, 지형, playerText | GM 승인/판정 |
| `TACTIC_QUERY` | 공개 전투 상태 확인 | 없음 또는 `Director` | 공개 전투 상태, 가능한 행동, playerText | 전술 조언 |
| `ASK_RULE` | 룰 데이터/상태엔진에서 답변 | 없음 또는 `Interpreter` | 관련 룰, 현재 상태, playerText | 룰 설명 |
| `ASK_HINT` | 공개 전투 상태 정리 | `Director` | 공개 전투 상태, 목표, playerText | 힌트 |
| `ASK_SUMMARY` | 전투 로그 조회 | `Summarizer` | 공개 전투 로그, playerText | 요약 |

---

## 4. AI 서버가 백엔드로 반환해야 하는 값

### 4.1 Interpreter 응답

```ts
type InterpreterResponse = {
  role: "Interpreter";

  intent: MainCommandIntent;

  structuredAction: {
    actorId: string;
    targetId?: string;
    targetType?: string;
    mapPoint?: { x: number; y: number };
    itemId?: string;
    spellId?: string;

    actionSummary: string;
    declaredMethod: string;
  };

  resolution:
    | "ANSWER_ONLY"
    | "CHECK_REQUIRED"
    | "GM_APPROVAL_REQUIRED"
    | "SERVER_VALIDATION_REQUIRED"
    | "IMPOSSIBLE";

  suggestedChecks?: Array<{
    ability?: string;
    skill?: string;
    reason: string;
  }>;

  risk?: string;
  impossibleReason?: string;
  gmOnlyNote?: string;
  playerMessage: string;
};
```

### 4.2 Narrator 응답

```ts
type NarratorResponse = {
  role: "Narrator";
  narration: string;
};
```

### 4.3 Director 응답

```ts
type DirectorResponse = {
  role: "Director";
  hint: string;
  usedPublicFacts: string[];
};
```

### 4.4 Summarizer 응답

```ts
type SummarizerResponse = {
  role: "Summarizer";
  playerSummary: string;
  aiContextSummary: string;
};
```

### 4.5 Actor 응답

```ts
type ActorResponse = {
  role: "Actor";
  selectedActionId: string;
  reason: string;
};
```

### 4.6 NpcDialogue 응답

```ts
type NpcDialogueResponse = {
  role: "NpcDialogue";
  npcId: string;
  dialogue: string;
  tone?: string;
};
```

---

## 5. AI 서버로부터 반환받은 뒤 백엔드 처리

### 5.1 Interpreter 반환 후

| resolution | 백엔드 처리 | 프론트 반환 |
|---|---|---|
| `ANSWER_ONLY` | 상태 변경 없음. 메시지 저장 | 채팅 메시지 |
| `CHECK_REQUIRED` | 판정 후보 생성. 성공/실패는 아직 확정하지 않음 | 판정 요청 카드 |
| `GM_APPROVAL_REQUIRED` | GM 승인 대기 상태 생성 | 승인 대기 카드 |
| `SERVER_VALIDATION_REQUIRED` | 거리/아이템/권한/자원 검증 | 가능/불가/판정 필요 |
| `IMPOSSIBLE` | 실패 사유 저장 | 불가 메시지 |

### 5.2 Narrator 반환 후

```text
백엔드에서 결과 확정
→ Narrator 호출
→ narration 저장
→ 프론트에 statePatch + narration 반환
```

### 5.3 Director 반환 후

```text
공개 정보만 사용했는지 검증
→ hint 메시지 저장
→ 프론트에 힌트 반환
```

### 5.4 Summarizer 반환 후

```text
playerSummary는 프론트에 반환
aiContextSummary는 서버에 저장
```

### 5.5 Actor 반환 후

```text
백엔드가 허용된 NPC 행동 후보 생성
→ Actor가 selectedActionId 선택
→ 백엔드가 해당 행동 검증/실행
→ 필요하면 Narrator 또는 NpcDialogue 호출
→ 프론트에 상태 변경 반환
```

### 5.6 NpcDialogue 반환 후

```text
대사 내용 검증
→ NPC 채팅 메시지로 저장
→ 상태 변경 없이 프론트 반환
```

---

## 6. 프론트 반환 형식

```ts
type CommandFrontendResponse = {
  requestId: string;

  status:
    | "MESSAGE"
    | "CHECK_REQUIRED"
    | "GM_APPROVAL_REQUIRED"
    | "ACTION_READY"
    | "IMPOSSIBLE"
    | "RESOLVED";

  message: string;

  checkOptions?: Array<{
    ability?: string;
    skill?: string;
    reason: string;
  }>;

  actionCandidate?: {
    actorId: string;
    targetId?: string;
    actionSummary: string;
    declaredMethod?: string;
  };

  statePatch?: unknown;
};
```

---

## 7. 최종 기준

```text
1. MVP 메인 채팅 명령어만 남긴다.
2. 모든 메인 채팅 명령어는 playerText를 필수로 받는다.
3. 프론트는 큰 카테고리로 1차 분류하고, 그 안에서 세부 명령어를 고르게 한다.
4. 프론트 버튼과 intent는 1:1 대응시킨다.
5. 백엔드는 AI 호출 전에 권한/대상/자원/공개 여부를 먼저 검증한다.
6. AI가 필요한 요청만 AI 서버로 보낸다.
7. AI 역할 6개는 그대로 유지한다.
8. AI는 성공/실패/피해/상태 변경을 확정하지 않는다.
9. 상태 변경은 백엔드 또는 GM 승인 후 확정한다.
10. 확정 결과의 서술만 Narrator가 담당한다.
```
