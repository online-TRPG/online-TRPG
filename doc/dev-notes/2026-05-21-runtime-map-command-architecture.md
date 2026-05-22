# 런타임 맵 명령 구조 재정리

작성일: 2026-05-21

## 문제 요약

전투 종료 후 같은 전투 노드가 탐색 화면으로 전환되면, 플레이어 토큰 이동은 `PATCH /sessions/:id/map` 전체 맵 저장 경로를 탄다. 이 경로는 클라이언트가 보낸 `VttMapStateDto` 전체를 서버 baseline과 비교한 뒤 저장한다. 여러 플레이어가 동시에 움직이는 세션에서는 각 클라이언트가 가진 전체 맵 스냅샷이 쉽게 낡는다. 한 명이 이동한 뒤 다른 사람이 이동하면 두 번째 요청 안에는 첫 번째 사람의 낡은 토큰 좌표가 포함될 수 있고, 서버는 이를 "남의 토큰 변경"으로 해석한다.

단기 패치는 조종권 없는 토큰을 baseline 값으로 보존하는 방식이다. 하지만 더 근본적인 문제는 세션 플레이의 플레이어 액션이 "전체 맵 덮어쓰기" 프로토콜 위에 얹혀 있다는 점이다.

## 현재 구조

### 프론트엔드

- `BattleMap`은 에디터와 세션 플레이가 함께 쓰는 컴포넌트다.
- 기본 토큰 이동은 `onChange(nextMap)`으로 전체 `VttMapStateDto`를 상위로 올린다.
- 전투 화면만 `onTokenMoveRequest`를 넘겨 `POST /sessions/:id/combat/move`를 사용한다.
- 탐색 화면의 `ExplorationNodeSurface.handleLocalMapAction('move')`는 현재 맵 전체를 복사해 내 토큰 좌표만 바꾼 뒤 `onMapChange(nextMap)`을 호출한다.
- `PlayPage.handleMapChange()`는 그 전체 맵을 로컬에 낙관 반영하고 `updateVttMap()` 저장 큐에 넣는다.

### 백엔드

- `SessionsService.updateVttMap()`은 GM이 아니거나 활성 전투가 있으면 `applyPlayerVttMapUpdate()`로 플레이어 변경을 검증한다.
- `applyPlayerVttMapUpdate()`는 baseline 맵과 요청 맵을 비교해 허용된 변경만 반영한다.
- 전투 중 이동은 별도 `CombatService.moveParticipant()`가 담당한다. 이 경로는 `participantId`, 목적지, 경로, 이동 모드만 받아서 서버가 현재 전투, 턴, 이동력, 기회공격을 검증한다.
- AI 또는 메인 커맨드 기반 특수 이동에는 `SessionsService.moveSessionCharacterTokenToMapPoint()`처럼 의도 기반 메서드가 이미 존재한다.

## 구조적 진단

`VttMapStateDto`는 두 가지 성격이 섞여 있다.

1. 맵 문서
   - 이미지, 크기, 그리드, 지형, 벽, 문, 오브젝트, 시작 위치, 토큰 정의
   - 주로 에디터와 GM 운영자가 수정한다.

2. 런타임 액터 상태
   - 토큰 위치, 숨김 여부, 핑, 감지된 함정, 공개된 오브젝트 상태
   - 플레이 중 여러 사용자가 동시에 바꾼다.

전체 맵 덮어쓰기는 1번에는 적합하지만 2번에는 부적합하다. 특히 플레이어 액션은 "내 토큰을 목적지로 이동한다", "이 위치에 핑을 찍는다", "이 문을 연다", "이 오브젝트를 조사한다"처럼 명령 형태가 자연스럽다. 전체 맵 payload는 이런 명령의 결과물이지 입력 프로토콜이 되어서는 안 된다.

## 권장 구조

### 핵심 원칙

- 클라이언트는 플레이 중 전체 맵을 저장하지 않는다.
- 플레이어 액션은 의도 기반 command API로 보낸다.
- 서버는 현재 canonical map을 읽고, 명령 하나를 검증하고, canonical map에 patch를 적용한다.
- 실시간 이벤트는 전체 맵 브로드캐스트를 유지해도 되지만, 요청 API는 patch 또는 command여야 한다.
- 에디터와 GM 전체 맵 수정 경로는 유지하되, 플레이어 세션 경로에서 분리한다.

### API 제안

1. 플레이어 토큰 이동

```http
POST /sessions/:id/map/tokens/move
```

```ts
type MoveSessionTokenDto = {
  tokenId?: string;
  sessionCharacterId?: string;
  to: { x: number; y: number };
  path?: Array<{ x: number; y: number }>;
  mode?: "exploration" | "combat";
  movementMode?: "normal" | "jump";
  clientMapVersion?: number;
};
```

- 탐색에서는 현재 사용자의 `sessionCharacterId` 소유권과 경로 차단만 검증한다.
- 전투에서는 기존 `CombatService.moveParticipant()`로 위임하거나 동일한 내부 `MapCommandService.moveToken()`을 쓰되 전투 턴, 이동력, 반응 처리를 추가한다.
- 결과는 `{ map, patch, combat?, message? }` 형태가 적절하다.

2. 핑 찍기

```http
POST /sessions/:id/map/pings
```

```ts
type CreateMapPingDto = {
  x: number;
  y: number;
  label?: string | null;
  rangeFt?: number;
};
```

- 핑은 누적 상태 충돌 위험이 작고 TTL이 짧다.
- 전체 맵 저장이 아니라 서버가 현재 pings에 append한다.

3. 오브젝트/문/함정 상호작용

```http
POST /sessions/:id/map/interactions
```

```ts
type MapInteractionDto = {
  kind: "open_door" | "close_door" | "investigate_object" | "trigger_object" | "detect_hazard";
  targetId: string;
  actorSessionCharacterId?: string;
  mapPoint?: { x: number; y: number };
};
```

- 현재 `applyVttObjectProximityEvents`, `applyVttHazardTriggers`, `applyVttHazardDetections`를 명령 처리 후크로 묶는다.

4. GM/시스템 전체 맵 저장

```http
PUT /sessions/:id/gm/map
```

- 기존 `PATCH /sessions/:id/map`의 전체 맵 저장 역할은 GM/시스템 전용으로 축소한다.
- 시나리오 에디터는 계속 노드의 authored map을 저장한다.

### 내부 서비스 제안

`MapRuntimeService`를 새로 두고 다음 책임을 모은다.

- canonical map 로드: `getVttMapBaseline()`
- 소유권 검증: `getControlledSessionCharacterIds()`
- 경로 검증: `hasReachableTokenPath()`, `isTokenPlacementBlocked()`
- patch 적용: `moveToken`, `appendPing`, `updateDoor`, `updateObject`
- 후처리: proximity, hazard trigger, hazard detection
- 저장과 이벤트 발행: `saveRuntimeMapAndEmit()`

현재 `SessionsService`에 흩어진 맵 런타임 메서드를 이 서비스로 점진 이전한다. `CombatService`와 `MainCommandsService`는 전체 맵을 직접 조립하지 않고 `MapRuntimeService` 명령 메서드를 호출한다.

## 프론트엔드 변경 방향

`BattleMap`을 두 층으로 분리한다.

1. `BattleMapCanvas`
   - 맵 렌더링, 선택, 드래그 경로 계산, 오버레이 표시만 담당한다.
   - `onTokenDragEnd({ token, to, path, movementMode })` 같은 이벤트를 낸다.
   - 전체 `onChange(map)`를 알지 않는다.

2. `BattleMapEditor`
   - 시나리오 에디터용 전체 맵 편집 wrapper.
   - `onChange(map)` 유지.

3. `SessionBattleMap`
   - 세션 플레이용 wrapper.
   - 토큰 이동, 핑, 문/오브젝트 상호작용을 command API로 보낸다.
   - 낙관 반영은 해당 토큰 또는 핑에만 제한하고, 실패 시 서버 map으로 되돌린다.

이렇게 하면 탐색 노드와 전투 노드는 같은 렌더러를 공유하되, 저장 프로토콜은 각자 명확해진다.

## 마이그레이션 순서

1. `MoveSessionTokenDto`, `CreateMapPingDto`, `MapInteractionDto`를 shared-types에 추가한다.
2. `SessionsController`에 플레이어용 command endpoint를 추가한다.
3. `SessionsService`의 `moveSessionCharacterTokenToMapPoint()`와 `applyPlayerVttMapUpdate()`의 공통 로직을 `MapRuntimeService.moveSessionToken()`으로 추출한다.
4. `ExplorationNodeSurface`의 직접 `onMapChange({...map, tokens: ...})` 이동을 `onTokenMoveRequest` 또는 `onMapCommand`로 교체한다.
5. `BattleMap`의 세션 모드에서 토큰 이동 기본값을 `onChange(map)`가 아니라 command callback 필수로 바꾼다.
6. 핑을 `onMapChange({...map, pings: ...})`에서 `POST /map/pings`로 바꾼다.
7. 전투 이동은 기존 `moveCombatParticipant()`를 유지하되 내부 저장은 `MapRuntimeService`를 사용하게 정리한다.
8. `PATCH /sessions/:id/map`은 GM 전체 맵 저장 또는 호환용 deprecated endpoint로 남기고, 플레이어 요청에서는 거절하거나 command endpoint로 유도한다.

## 영향 파일

- `shared-types/src/dto/api/sessions.dto.ts`
- `shared-types/src/dto/api/gameplay.dto.ts`
- `be/src/modules/sessions/sessions.controller.ts`
- `be/src/modules/sessions/sessions.service.ts`
- `be/src/modules/combat/combat.service.ts`
- `be/src/modules/actions/main-commands.service.ts`
- `be/src/modules/realtime/realtime-events.service.ts`
- `fe/src/services/api.ts`
- `fe/src/components/BattleMap.tsx`
- `fe/src/features/sessionPlay/components/ExplorationNodeSurface.tsx`
- `fe/src/features/sessionPlay/components/CombatNodeSurface.tsx`
- `fe/src/pages/PlayPage.tsx`

## 최종 판단

전체 맵을 보내는 구조는 에디터와 GM 운영자에게는 유효하지만, 플레이어 런타임 액션에는 최적 구조가 아니다. 전투 노드의 현재 기능 구조를 기준으로 보면 이미 전투 이동은 command API 쪽으로 진화해 있다. 탐색 이동, 핑, 오브젝트 상호작용도 같은 방향으로 옮기는 것이 맞다.

즉 최적 구조는 "맵은 서버 canonical state, 플레이어는 command만 전송, 서버가 patch 적용, 클라이언트는 렌더링과 선택만 담당"이다. 이 구조가 stale client, 동시 이동, 권한 검증, 전투 종료 후 탐색 전환 문제를 한 번에 줄인다.

## 2026-05-21 1차 구현 반영

1차 구현에서는 플레이어 런타임 액션 중 충돌 위험이 가장 큰 토큰 이동과 핑을 command API로 분리했다.

- 추가 API
  - `POST /sessions/:id/map/tokens/move`
  - `POST /sessions/:id/map/pings`
- 추가 DTO
  - `MoveSessionTokenDto`
  - `CreateVttMapPingDto`
- 프론트 변경
  - 탐색 노드의 이동/핑 버튼은 더 이상 전체 `VttMapStateDto`를 직접 저장하지 않고 새 command API를 호출한다.
  - session-mode `BattleMap`의 드래그 이동과 핑 도구도 command callback이 있으면 command API를 사용한다.
  - 전투 이동은 기존 `POST /sessions/:id/combat/move`를 유지한다.
- 남은 후속 작업
  - 문/오브젝트/함정 상호작용을 `POST /sessions/:id/map/interactions`로 분리한다.
  - `BattleMap`을 `BattleMapCanvas`, `BattleMapEditor`, `SessionBattleMap` 계층으로 분리한다.
  - `SessionsService`의 맵 런타임 로직을 별도 `MapRuntimeService`로 이전한다.
  - `PATCH /sessions/:id/map`을 GM/시스템 전체 맵 저장용으로 축소하고 플레이어 호환 경로를 deprecated 처리한다.

## 2026-05-21 2차 구현 반영

2차 구현에서는 문/오브젝트/함정 상호작용도 command API로 분리하고, 플레이어의 전체 맵 저장 경로를 차단했다.

- 추가 API
  - `POST /sessions/:id/map/interactions`
- 추가 DTO
  - `VttMapInteractionDto`
  - `VttMapInteractionResponseDto`
- 처리하는 상호작용
  - `open_door`
  - `close_door`
  - `break_door`
  - `investigate_object`
  - `disarm_hazard`
  - `detect_hazard`
  - `trigger_object`
- 백엔드 변경
  - 기존 `openVttDoorAtPoint`, `breakVttDoorAtPoint`, `describeVttObjectAtPoint`, `revealVttObjectContentsAtPoint`, `disarmVttHazardAtPoint`를 새 command endpoint에서 재사용한다.
  - `PATCH /sessions/:id/map`은 비호스트 플레이어 요청을 거절한다.
  - 활성 전투 중 전체 맵 변경은 전투 command endpoint를 사용하도록 거절한다.
- 프론트 변경
  - 탐색 노드의 문 열기/닫기/부수기, 오브젝트 조사, 함정 해제 버튼은 `POST /map/interactions`를 호출한다.

남은 후속 작업은 더 큰 구조 리팩터링이다.

- `SessionsService`의 맵 런타임 로직을 별도 `MapRuntimeService`로 이전한다.
- `CombatService.moveParticipant()` 내부 저장도 `MapRuntimeService`를 사용하게 정리한다.
- `BattleMap`을 `BattleMapCanvas`, `BattleMapEditor`, `SessionBattleMap` 계층으로 완전히 분리한다.
- 기존 `PATCH /sessions/:id/map`을 deprecated 처리한다.

## 2026-05-21 3차 구현 반영

3차 구현에서는 남은 command/endpoint 경계를 더 정리했다.

- GM 전체 맵 저장용 `PUT /sessions/:id/gm/map`을 추가했다.
- `trigger_object`는 `REVEAL_FOG_ON_PROXIMITY` 이벤트를 수동 실행해 fog 영역을 공개하도록 구현했다.
- `SessionBattleMap` wrapper를 추가하고 탐색/전투/기본 세션 화면의 `BattleMap` 직접 사용을 이 wrapper로 교체했다.

아직 남은 구조 작업은 다음이다.

- `BattleMap` 내부를 렌더러 전용 `BattleMapCanvas`와 에디터 전용 `BattleMapEditor`로 완전히 나눈다.
- `SessionsService`의 맵 런타임 로직을 별도 `MapRuntimeService`로 이전한다.

## 2026-05-21 4차 구현 반영

4차 구현에서는 `MapRuntimeService`를 세션 모듈의 공식 런타임 맵 경계로 추가했다.

- `MapRuntimeService`를 추가하고 `SessionsModule`에서 export한다.
- 세션 컨트롤러의 런타임 맵 command endpoint는 `MapRuntimeService`를 통해 호출한다.
- `CombatService`의 전투 맵 저장 지점은 `MapRuntimeService.saveSystemVttMap()`을 통과하게 바꿨다.

아직 남은 구조 작업은 다음이다.

- `MapRuntimeService`가 현재 위임하는 메서드 몸체를 `SessionsService`에서 실제로 이전한다.
- `BattleMap` 내부를 렌더러 전용 `BattleMapCanvas`와 에디터 전용 `BattleMapEditor`로 완전히 나눈다.

## 2026-05-21 5차 구현 반영

5차 구현에서는 전투/시스템 맵 저장의 실제 구현을 `MapRuntimeService.saveSystemVttMap()`으로 이전했다.

- `saveSystemVttMap()`의 `GameState.flagsJson.vttMap` 저장과 `vtt.map.updated` 발행은 `MapRuntimeService`가 직접 수행한다.
- `SessionsService`는 맵 정규화, proximity 이벤트 적용, 플레이어용 redaction helper를 제공하는 쪽으로 역할을 줄였다.
- 전투 이동과 전투 주문의 시스템 맵 저장은 모두 `MapRuntimeService.saveSystemVttMap()` 경계를 통과한다.

아직 남은 구조 작업은 다음이다.

- `moveSessionToken`, `createVttMapPing`, `runVttMapInteraction`, `updateGmVttMap`의 실제 구현도 `MapRuntimeService`로 이전한다.
- `BattleMap` 내부를 렌더러 전용 `BattleMapCanvas`와 에디터 전용 `BattleMapEditor`로 완전히 나눈다.

## 2026-05-21 6차 구현 반영

6차 구현에서는 GM 전체 맵 저장 구현도 `MapRuntimeService.updateGmVttMap()`으로 이전했다.

- `PUT /sessions/:id/gm/map`은 이제 `MapRuntimeService`가 호스트 검증, 활성 전투 차단, 맵 정규화, hazard/proximity 처리, 저장, realtime 발행을 직접 수행한다.
- 기존 `SessionsService.updateVttMap()`은 레거시 `PATCH /sessions/:id/map` 호환 경로로 남아 있다.

아직 남은 구조 작업은 다음이다.

- `moveSessionToken`, `createVttMapPing`, `runVttMapInteraction`의 실제 구현도 `MapRuntimeService`로 이전한다.
- `BattleMap` 내부를 렌더러 전용 `BattleMapCanvas`와 에디터 전용 `BattleMapEditor`로 완전히 나눈다.

## 2026-05-21 7차 구현 반영

7차 구현에서는 플레이어 토큰 이동과 맵 핑 생성 구현도 `MapRuntimeService`로 이전했다.

- `POST /sessions/:id/map/tokens/move`는 이제 `MapRuntimeService.moveSessionToken()`이 활성 전투 차단, 토큰 소유권 검증, 이동 경로 검증, 저장, realtime 발행을 직접 수행한다.
- `POST /sessions/:id/map/pings`는 이제 `MapRuntimeService.createVttMapPing()`이 핑 생성, TTL 정리, 저장, realtime 발행을 직접 수행한다.
- `MapRuntimeService` 내부에 런타임 맵 저장 마무리 루틴을 두어 이동/핑/GM 저장/전투 시스템 저장이 같은 저장 경계를 공유한다.

아직 남은 구조 작업은 다음이다.

- `runVttMapInteraction`의 실제 구현도 `MapRuntimeService`로 이전한다.
- `BattleMap` 내부를 렌더러 전용 `BattleMapCanvas`와 에디터 전용 `BattleMapEditor`로 완전히 나눈다.

## 2026-05-21 8차 구현 반영

8차 구현에서는 맵 상호작용 command 구현도 `MapRuntimeService.runVttMapInteraction()`으로 이전했다.

- 문 열기/닫기/부수기, 오브젝트 조사, 함정 해제/감지, 오브젝트 이벤트 실행의 orchestration을 `MapRuntimeService`가 수행한다.
- `SessionsService.runVttMapInteraction()` 중복 구현은 제거했다.
- 세션 컨트롤러의 런타임 맵 command endpoint들은 모두 `MapRuntimeService`에 실제 구현을 둔다.

아직 남은 구조 작업은 다음이다.

- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.
- `BattleMap` 내부를 렌더러 전용 `BattleMapCanvas`와 에디터 전용 `BattleMapEditor`로 완전히 나눈다.

## 2026-05-21 9차 구현 반영

9차 구현에서는 프론트 맵 컴포넌트의 외부 경계를 먼저 분리했다.

- `BattleMapCanvas`를 추가해 Konva `Stage` 경계를 감싼다.
- `BattleMapEditor`를 추가해 시나리오 에디터는 에디터 wrapper를 통해 맵을 렌더링한다.
- 세션 화면은 기존 `SessionBattleMap` wrapper를 계속 사용하므로, 플레이 화면과 에디터 화면이 더 이상 `BattleMap` 코어를 직접 공유 호출하지 않는다.

아직 남은 구조 작업은 다음이다.

- `BattleMap` 본문에 남은 에디터 패널/툴바를 `BattleMapEditor` 내부로 실제 이전한다.
- `BattleMap` 본문에 남은 Konva layer 렌더링과 포인터 입력 처리를 `BattleMapCanvas`로 더 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 10차 구현 반영

10차 구현에서는 `BattleMap` 코어를 물리적으로 `components/battleMap/BattleMapCore.tsx`로 이동했다.

- `components/BattleMap.tsx`는 기존 import 호환을 위한 facade로 축소했다.
- `BattleMapEditor`와 `SessionBattleMap`은 `BattleMapCore`를 명시적으로 사용한다.
- `BattleMapCanvas`, `BattleMapEditor`, `BattleMapCore`, `TokenFrame`이 같은 `battleMap/` 경계 안에 모였다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 에디터 패널/툴바를 `BattleMapEditor` 내부로 실제 이전한다.
- `BattleMapCore` 본문에 남은 Konva layer 렌더링과 포인터 입력 처리를 `BattleMapCanvas`로 더 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 11차 구현 반영

11차 구현에서는 `BattleMapCore`의 화면 골격을 더 작게 분리했다.

- `BattleMapStageFrame`을 추가해 stage wrapper와 세션 화면 이동 버튼을 `BattleMapCore` 밖으로 뺐다.
- `BattleMapToolbar`를 추가해 상단 제목/토큰 카운트/컨트롤 슬롯 골격을 분리했다.
- `BattleMapCore`는 아직 에디터 버튼 로직과 Konva layer를 들고 있지만, 캔버스 주변 chrome과 툴바 shell이 별도 파일로 이동했다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 에디터 버튼/설정 패널을 `BattleMapEditor` 하위 컴포넌트로 이전한다.
- `BattleMapCore` 본문에 남은 Konva layer 렌더링과 포인터 입력 처리를 `BattleMapCanvas`/layer 컴포넌트로 더 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 13차 구현 반영

13차 구현에서는 Konva layer 분해를 시작했다.

- `BattleMapBackgroundLayer`를 추가해 배경 이미지, fallback 배경, grid line 렌더링을 분리했다.
- `BattleMapSessionObstacleLayer`를 추가해 세션 모드에서 보이는 terrain/wall 장애물 표시 레이어를 분리했다.
- `BattleMapCore`는 아직 에디터 구조물 레이어와 토큰/안개/측정 레이어를 직접 들고 있지만, 가장 독립적인 레이어부터 별도 컴포넌트로 이동했다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 에디터 버튼/설정 패널을 `BattleMapEditor` 하위 컴포넌트로 이전한다.
- `BattleMapCore` 본문에 남은 에디터 구조물, 토큰, 안개, 측정/ping 레이어를 별도 layer 컴포넌트로 더 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 14차 구현 반영

14차 구현에서는 안개 레이어도 별도 컴포넌트로 분리했다.

- `BattleMapFogLayer`를 추가해 fog rect 렌더링, 선택 강조, fog draft 렌더링을 `BattleMapCore` 밖으로 뺐다.
- `BattleMapCore`는 fog 선택 상태와 callback만 소유하고, Konva fog layer JSX는 `BattleMapFogLayer`가 담당한다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 에디터 버튼/설정 패널을 `BattleMapEditor` 하위 컴포넌트로 이전한다.
- `BattleMapCore` 본문에 남은 에디터 구조물, 토큰, 측정/ping 레이어를 별도 layer 컴포넌트로 더 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 15차 구현 반영

15차 구현에서는 overlay layer 일부를 더 분리했다.

- `BattleMapPingMarkers`를 추가해 로컬/server ping marker 렌더링을 분리했다.
- `BattleMapMeasureOverlay`를 추가해 일반 거리 측정 선/라벨 렌더링을 분리했다.
- `BattleMapCore`의 overlay layer는 토큰 이동 preview와 새 overlay 컴포넌트들을 조립하는 형태로 정리됐다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 에디터 버튼/설정 패널을 `BattleMapEditor` 하위 컴포넌트로 이전한다.
- `BattleMapCore` 본문에 남은 에디터 구조물, 토큰, 토큰 이동 preview 레이어를 별도 layer 컴포넌트로 더 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 16차 구현 반영

16차 구현에서는 세션 overlay 렌더링을 더 분리했다.

- `BattleMapTokenMovePreview`를 추가해 토큰 드래그 중 이동 경로/비용 preview를 분리했다.
- `BattleMapVisionMaskLayer`를 추가해 세션 시야 마스크 렌더링을 분리했다.
- `BattleMapCore`의 overlay layer는 측정, 토큰 이동 preview, ping marker 컴포넌트를 조립하는 형태로 더 축소됐다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 에디터 버튼/설정 패널을 `BattleMapEditor` 하위 컴포넌트로 이전한다.
- `BattleMapCore` 본문에 남은 에디터 구조물 layer와 토큰 layer를 별도 컴포넌트로 더 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 17차 구현 반영

17차 구현에서는 토큰 레이어 안의 범위 표시를 분리했다.

- `BattleMapRangeOverlayLayer`를 추가해 이동 가능 범위와 공격 사거리 원형 overlay를 분리했다.
- `BattleMapCore`의 토큰 layer는 범위 overlay 컴포넌트와 실제 토큰 목록 렌더링을 조립하는 형태가 됐다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 에디터 버튼/설정 패널을 `BattleMapEditor` 하위 컴포넌트로 이전한다.
- `BattleMapCore` 본문에 남은 에디터 구조물 layer와 실제 토큰 layer를 별도 컴포넌트로 더 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 18차 구현 반영

18차 구현에서는 실제 토큰 렌더링을 분리했다.

- `useCanvasImage` hook을 별도 파일로 이동해 맵 배경과 토큰 이미지 로딩이 같은 hook을 공유한다.
- `BattleToken`을 분리해 단일 토큰의 이미지, 프레임, 드래그 이벤트 처리를 별도 컴포넌트로 이동했다.
- `BattleMapTokenLayer`를 추가해 visible token 목록 렌더링을 `BattleMapCore` 밖으로 뺐다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 에디터 버튼/설정 패널을 `BattleMapEditor` 하위 컴포넌트로 이전한다.
- `BattleMapCore` 본문에 남은 에디터 구조물 layer와 inspector form을 별도 컴포넌트로 더 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 19차 구현 반영

19차 구현에서는 에디터 구조물 layer를 분리했다.

- `BattleMapEditorStructureLayer`를 추가해 terrain, wall, door, object shape, structure draft 렌더링을 `BattleMapCore` 밖으로 뺐다.
- `BattleMapCore`는 구조물 선택, object 확장 드래그 시작, selection emission callback만 넘긴다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 토큰/fog/구조물 inspector form을 별도 컴포넌트로 이전한다.
- `BattleMapCore` 본문에 남은 detected hazard / observed object marker layer를 별도 컴포넌트로 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 20차 구현 반영

20차 구현에서는 플레이어 관찰/탐지 marker layer를 분리했다.

- `BattleMapObjectMarkerLayer`를 추가해 detected hazard marker와 observed object marker 렌더링을 `BattleMapCore` 밖으로 뺐다.
- `BattleMapCore`는 marker 대상 목록과 shape/bounds/label helper만 전달한다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 토큰/fog/구조물 inspector form을 별도 컴포넌트로 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 21차 구현 반영

21차 구현에서는 inspector form 일부를 분리했다.

- `BattleMapFogInspector`를 추가해 fog rectangle 선택/수정/삭제 form을 `BattleMapCore` 밖으로 뺐다.
- `BattleMapTokenInspector`를 추가해 토큰 기본 정보, 토큰 자산 라이브러리, 몬스터 요약, 레이어/삭제 액션 form을 `BattleMapCore` 밖으로 뺐다.
- `BattleMapCore`는 선택된 토큰/fog와 update handler만 inspector 컴포넌트에 전달한다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 구조물 inspector form을 별도 컴포넌트로 이전한다.
- `BattleMapCore` 본문에 남은 에디터 버튼/설정 패널을 `BattleMapEditor` 하위 컴포넌트로 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 22차 구현 반영

22차 구현에서는 구조물 inspector form을 분리했다.

- `BattleMapStructureInspector`를 추가해 terrain/wall/door/object 공통 속성 form을 `BattleMapCore` 밖으로 뺐다.
- door 상태, key item, 파괴 DC 편집 UI도 구조물 inspector 컴포넌트가 담당한다.
- object의 플레이어 공개 여부, 연결 단서/아이템, 단서 조사 판정, hazard, 근접 안개 해제 이벤트 form도 구조물 inspector 컴포넌트로 이동했다.
- `BattleMapCore`는 선택된 구조물 cell, option 목록, update handler만 전달한다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 에디터 버튼/설정 패널을 `BattleMapEditor` 하위 컴포넌트로 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.

## 2026-05-21 23차 구현 반영

23차 구현에서는 에디터 컨트롤 UI를 분리했다.

- `BattleMapEditorControls`를 추가해 상단 에디터 컨트롤과 보조 설정줄 UI를 `BattleMapCore` 밖으로 뺐다.
- 몬스터 선택, 파티 토큰 동기화, 전투 스케일링, pan/measure/ping/fog/structure tool 버튼, 전체화면 버튼을 `BattleMapEditorToolbarControls`로 이동했다.
- zoom, map size draft, measure clear, token snap, fog reveal/hide/snap/reveal all 컨트롤을 `buildBattleMapEditorSubtoolbarControls`로 이동했다.
- `BattleMapCore`는 각 컨트롤에 필요한 상태와 handler만 전달한다.

아직 남은 구조 작업은 다음이다.

- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper를 별도 map runtime helper로 모은다.
- `BattleMapCore`에 남은 starting position layer도 필요하면 별도 layer 컴포넌트로 더 이전한다.

## 2026-05-21 24차 구현 반영

24차 구현에서는 맵 상호작용 dispatcher를 런타임 전용 서비스로 분리했다.

- `VttMapInteractionRuntimeService`를 추가해 `runVttMapInteraction`의 door/object/hazard 분기 처리를 `MapRuntimeService` 밖으로 뺐다.
- `MapRuntimeService`는 이제 GM 전체맵 저장, 플레이어 토큰 이동, ping, 시스템 맵 저장과 runtime map finalize에 집중한다.
- object 조사 처리의 설명/판정 필요/reveal summary 조립은 `VttMapInteractionRuntimeService.runObjectInvestigation`으로 분리했다.
- `SessionsModule`에 `VttMapInteractionRuntimeService`를 provider/export로 등록했다.

아직 남은 구조 작업은 다음이다.

- `SessionsService` 안에 남은 door/object/hazard 세부 구현도 더 작게 나눌 수 있다.
- `BattleMapCore`에 남은 starting position layer도 필요하면 별도 layer 컴포넌트로 더 이전한다.

## 2026-05-21 25차 구현 반영

25차 구현에서는 starting position layer를 분리했다.

- `BattleMapStartingPositionLayer`를 추가해 플레이어 시작 위치 marker 렌더링과 drag update 처리를 `BattleMapCore` 밖으로 뺐다.
- `BattleMapCore`는 시작 위치 목록, grid size, tool disabled 상태, snap 여부, update handler만 전달한다.

아직 남은 구조 작업은 다음이다.

- `SessionsService` 안에 남은 door/object/hazard 세부 구현도 더 작게 나눌 수 있다.
- 프론트 `BattleMapCore`는 주요 UI/layer 분리가 끝났고, 추가 분리는 포인터 입력 hook 추출 정도가 남았다.

## 2026-05-22 26차 구현 반영

26차 구현에서는 남은 구조 작업 2개를 진행했다.

- `VttMapDoorRuntimeService`, `VttMapObjectRuntimeService`, `VttMapHazardRuntimeService`를 추가해 맵 상호작용 command의 문/오브젝트/함정별 runtime helper 경계를 만들었다.
- `VttMapInteractionRuntimeService`는 상호작용 요청의 세션/대상 해석과 domain helper 조립에 집중하고, 각 상호작용 세부 처리는 전용 helper로 위임한다.
- `useBattleMapPointerInput` hook을 추가해 `BattleMapCore`에 남아 있던 stage drag/click/fog/structure/measure/ping 포인터 입력 처리를 분리했다.
- `BattleMapCore`는 포인터 입력 handler를 hook에서 받아 canvas에 연결하고, object extension처럼 선택 상태와 강하게 묶인 일부 편집 동작만 유지한다.

남은 작업은 런타임 helper 내부에서 아직 `SessionsService`의 저장/정규화/공개 처리 유틸을 재사용하는 부분을 더 독립적인 map runtime support 계층으로 옮길지 여부를 판단하는 정도다.

## 2026-05-22 27차 안정화 반영

전투 종료 후 탐색 화면 전환 시 플레이어 클라이언트에서 레거시 전체 맵 저장 경로가 호출되면 `PATCH /sessions/:id/map`이 403을 반환해 화면 오류가 나는 문제가 남아 있었다.

- 프론트 `PlayPage.handleMapChange`는 비호스트 플레이어 상태에서는 전체 맵 저장 큐를 타지 않고 로컬 상태만 갱신한다.
- 백엔드 레거시 `PATCH /sessions/:id/map`은 비호스트 플레이어 요청을 오류로 터뜨리지 않고, 쓰기를 무시한 뒤 현재 canonical player map을 반환한다.
- 이 경로는 플레이어 command API가 누락된 UI fallback이 남아 있어도 맵 상태를 덮어쓰지 않으며, 전환 직후 사용자에게 403을 노출하지 않는 방어선이다.

## 2026-05-21 12차 구현 반영

12차 구현에서는 `BattleMapCore`의 나머지 레이아웃 shell을 더 분리했다.

- `BattleMapSubtoolbar`를 추가해 zoom/map-size/fog/token-snap 컨트롤 영역의 shell을 분리했다.
- `BattleMapWorkspace`를 추가해 stage와 inspector를 감싸는 workspace frame을 분리했다.
- `BattleMapCore`는 여전히 실제 에디터 버튼과 inspector form 로직을 들고 있지만, 상단 toolbar, subtoolbar, workspace, stage frame은 별도 컴포넌트로 나뉘었다.

아직 남은 구조 작업은 다음이다.

- `BattleMapCore` 본문에 남은 에디터 버튼/설정 패널을 `BattleMapEditor` 하위 컴포넌트로 이전한다.
- `BattleMapCore` 본문에 남은 Konva layer 렌더링과 포인터 입력 처리를 `BattleMapCanvas`/layer 컴포넌트로 더 이전한다.
- `MapRuntimeService`가 호출하는 도어/오브젝트/함정 세부 helper도 점진적으로 별도 map runtime helper로 모은다.
