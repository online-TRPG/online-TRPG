# 세션-시나리오 런타임 맵 정합성 복구 계획

작성일: 2026-07-31

## 1. 결론

이번 문제는 프론트 표시 오류 하나로 해결할 수 없다. 현재 구조는 시나리오 노드의 원본 맵과 세션 진행 중 변경되는 런타임 맵을 분리해 보관하지 않으며, AI GM과 Human GM의 노드 전환 구현도 서로 다르다.

수정의 중심은 다음 네 가지다.

1. 노드별 런타임 맵을 DB에 독립적으로 영속화한다.
2. AI GM과 Human GM이 같은 노드 전환 서비스를 사용하게 한다.
3. 콘텐츠 공개와 해당 맵 오브젝트의 가시성 변경을 하나의 원자적 상태 전이로 묶는다.
4. 세션-시나리오 링크가 원본 시나리오 삭제로 유실되지 않도록 삭제 정책과 데이터 무결성을 바꾼다.

`GameState.flagsJson.vttMap`은 즉시 제거하지 않고 호환용 현재 맵 미러로 한 차례 유지한다. 새 노드 런타임 테이블을 정본으로 사용하고, 마이그레이션 및 회귀 검증을 끝낸 뒤 별도 작업으로 미러 제거 여부를 결정한다.

## 2. 확인된 문제

### SSR-1. 현재 노드의 맵만 보관한다

- `GameState.flagsJson.vttMap`은 현재 활성 맵 하나만 담는다.
- `SessionScenarioNode.checkOptionsJson`에는 시나리오에서 복제된 원본 맵만 있다.
- A 노드에서 토큰 이동, 안개 제거, 문 개방, 오브젝트 공개를 수행한 뒤 B 노드로 이동하면 A의 런타임 변경을 보관할 장소가 없다.

영향:

- A → B → A 재진입 시 A의 토큰 위치와 공개 상태가 원본으로 돌아간다.
- 현재 맵과 원본 맵이 같은 JSON 구조로 취급되어 읽기와 초기화의 경계가 불분명하다.

### SSR-2. AI GM과 Human GM의 노드 전환 구현이 중복되고 결과가 다르다

- Human GM 경로는 `human-gm-runtime.service.ts`에서 원본 맵을 읽고 시작 위치를 적용한다.
- AI GM 경로는 `main-command-scene-transition-state.service.ts`에서 원본 맵을 `flagsJson.vttMap`에 바로 복사한다.
- 두 경로 모두 재방문 맵을 복원하지 못한다.
- AI GM 경로는 플레이어 토큰 초기화도 수행하지 않아 동일한 노드라도 진입 방식에 따라 결과가 달라진다.

### SSR-3. 플레이어 시작 위치가 런타임 배치로 기억되지 않는다

- `SessionVttMapBootstrapService`는 기존 맵에 같은 `sessionCharacterId`의 토큰이 있을 때만 좌표를 보존한다.
- 원본 맵에서 새로 초기화할 때는 활성 캐릭터의 `createdAt` 순서로 시작 슬롯을 다시 계산한다.
- 캐릭터 참가, 이탈, 재활성화에 따라 슬롯이 바뀔 수 있으며, 토큰에 어떤 시작 슬롯을 배정했는지 남지 않는다.

### SSR-4. 콘텐츠 공개와 오브젝트 공개가 서로 다른 상태 전이다

- `SessionReveal` 생성은 단서/아이템/이벤트 공개 기록과 아이템 지급을 담당한다.
- 플레이어 맵에 오브젝트가 나타나려면 별도로 `visibleToPlayers = true`가 저장되어야 한다.
- 수동 GM 공개는 단서만 지원하며 맵 오브젝트를 갱신하지 않는다.
- 자동 관찰 경로만 오브젝트 가시성을 바꾸므로, 공개 기록은 있는데 플레이어 맵에는 위치가 없는 상태가 가능하다.

### SSR-5. 맵 읽기가 상태를 변경한 것처럼 보이게 한다

- `SessionVttMapNormalizationService.normalize()`는 읽기 시에도 `updatedAt`을 현재 시각으로 덮어쓴다.
- 실제 변경이 없어도 맵 revision이 달라져 프론트 비교, WebSocket delta 기준, 중복 렌더링 판단을 흐릴 수 있다.

### SSR-6. 프론트의 맵 GET은 노드 변경을 직접 추적하지 않는다

- 플레이어 시나리오 조회는 `currentNodeId`와 `stateVersion`을 load key로 사용한다.
- 맵 GET effect는 `sessionId`와 `isRecruiting`만 의존한다.
- snapshot에 올바른 맵이 없거나 이벤트 순서가 뒤바뀌면 이전 노드 맵이 남을 수 있다.

### SSR-7. 원본 시나리오 삭제가 세션 런타임 링크를 제거한다

- `SessionScenario.scenario`가 `onDelete: Cascade`다.
- `ScenariosService.deleteScenario()`도 `SessionScenario`를 명시적으로 삭제한다.
- 그 결과 `Session`, `SessionParticipant`는 남아 있지만 `SessionScenario`, `GameState`, 노드 스냅샷, 공개 기록은 사라진 고아 세션이 생성된다.

### SSR-8. 핵심 재방문 시나리오의 회귀 테스트가 없다

현재 테스트는 개별 시작 위치 계산, 링크 조회, 이벤트 발행을 확인하지만 아래 사용자 흐름을 끝까지 검증하지 않는다.

- A 노드 상태 변경 → B 이동 → A 재진입
- 숨겨진 오브젝트 공개 → 플레이어용 redacted map 반영
- AI GM 전환과 Human GM 전환의 결과 동등성
- 원본 시나리오 삭제 후 세션 스냅샷 보존

### 현재 로컬 DB에서 확인된 무결성 상태

- 전체 세션 20개 중 `SessionScenario` 연결이 없는 세션이 18개다.
- 고아 세션 18개는 모두 `DISBANDED` 상태다.
- 링크가 남은 세션은 2개이며 각각 `COMPLETED`, `PLAYING` 상태다.
- 현재 `PLAYING` 세션은 활성 `SessionCharacter`가 0개이고 저장된 플레이어 토큰도 0개다.

따라서 코드를 고치는 것과 별개로 기존 데이터의 복구 가능 여부를 분류해야 한다. 특히 활성 캐릭터가 없는 세션에서는 맵 부트스트랩이 플레이어 토큰을 생성할 근거가 없으므로, 시작/진입 전 무결성 검사를 추가해야 한다.

## 3. 목표와 비목표

### 목표

- 세션은 각 방문 노드의 최신 맵 상태를 정확히 복원한다.
- 같은 노드로 돌아왔을 때 토큰 좌표, 안개, 문, 오브젝트, 위험 요소 상태가 그대로 유지된다.
- AI GM과 Human GM의 전환 결과가 동일하다.
- 처음 방문한 노드에만 원본 맵과 시작 위치를 사용한다.
- 콘텐츠 공개와 오브젝트 가시성 변경이 함께 성공하거나 함께 실패한다.
- 플레이어에게 발행되는 맵은 commit된 정본 상태에서 생성한다.
- 원본 시나리오의 수명 주기가 진행/완료 세션의 런타임 기록을 파괴하지 않는다.

### 비목표

- VTT 맵 JSON 전체를 즉시 정규화된 다수의 테이블로 분해하지 않는다.
- 과거에 이미 cascade 삭제된 데이터를 근거 없이 재생성하지 않는다.
- 이번 작업에서 WebSocket 프로토콜 전체나 프론트 맵 렌더러를 재설계하지 않는다.
- `GameState.flagsJson`의 모든 기능 플래그를 별도 컬럼으로 옮기지 않는다.

## 4. 목표 데이터 모델

### 4.1 `SessionScenarioNodeRuntimeState` 추가

`be/prisma/schema.prisma`에 노드별 런타임 상태를 추가한다.

예정 필드:

```prisma
model SessionScenarioNodeRuntimeState {
  sessionScenarioId String
  nodeId            String
  version           Int      @default(1)
  vttMapJson        String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  scenarioNode SessionScenarioNode @relation(
    fields: [sessionScenarioId, nodeId],
    references: [sessionScenarioId, nodeId],
    onDelete: Cascade
  )

  @@id([sessionScenarioId, nodeId])
  @@index([sessionScenarioId, updatedAt])
}
```

정본 규칙:

- 원본: `SessionScenarioNode.checkOptionsJson.vttMap`
- 런타임 정본: `SessionScenarioNodeRuntimeState.vttMapJson`
- 현재 노드 포인터: `GameState.currentNodeId`
- 호환용 현재 맵 미러: `GameState.flagsJson.vttMap`

런타임 row는 첫 진입 시 한 번 생성한다. 재진입에서는 원본을 다시 읽지 않고 기존 row를 사용한다.

### 4.2 시작 슬롯 배정 식별자 추가

`VttMapTokenDto`에 선택 필드 `startingPositionId?: string | null`을 추가한다.

규칙:

- 기존 플레이어 토큰은 좌표와 `startingPositionId`를 그대로 보존한다.
- 새 플레이어 토큰만 현재 노드에서 사용되지 않은 시작 슬롯을 배정한다.
- 토큰 이동은 `x`, `y`만 변경하고 최초 배정 식별자는 유지한다.
- 비활성 캐릭터의 플레이어 토큰은 런타임 맵에서 제거하되 다른 토큰 좌표는 재배치하지 않는다.
- 시작 슬롯이 부족하면 기존 deterministic fallback 좌표를 사용하고 `startingPositionId = null`로 저장한다.

### 4.3 시나리오 삭제 정책 변경

진행 기록 보존을 위해 물리 삭제와 세션 런타임을 분리한다.

1차 정책:

- 연결된 `SessionScenario`가 하나라도 있으면 Scenario를 물리 삭제하지 않는다.
- `Scenario.deletedAt DateTime?`을 추가하여 soft delete 상태를 명시한다.
- 삭제 요청은 Scenario를 비공개/삭제 상태로 전환하는 soft delete로 처리한다.
- 세션 런타임이 없는 초안만 물리 삭제할 수 있다.
- DB FK는 실수로 직접 삭제해도 링크가 사라지지 않도록 `Cascade`를 제거하고 `Restrict`로 바꾼다.
- `deleteScenario()`의 `sessionScenario.deleteMany()`를 제거한다.

이미 고아가 된 세션은 별도 진단 리포트로 분류한다. 백업에 원본 관계가 있을 때만 복구하고, 그렇지 않으면 UI에서 플레이 가능한 세션으로 노출하지 않는다.

## 5. 목표 상태 전이

### 5.1 공통 노드 전환

공통 서비스 `SessionNodeRuntimeTransitionService`를 `SessionsModule`에 추가하고 export한다. `ActionsModule`은 이미 `SessionsModule`을 import하므로 AI GM 경로에서도 같은 서비스를 주입받는다.

전환 순서:

1. 세션 단위 advisory transaction lock을 획득한다.
2. 최신 `GameState`와 대상 `SessionScenarioNode`를 transaction 안에서 다시 읽는다.
3. 대상 노드의 runtime row를 조회한다.
4. row가 있으면 해당 맵을 decode/validate한다.
5. row가 없으면 노드 원본 맵을 읽고 normalize한 뒤 활성 캐릭터 시작 토큰을 한 번만 배치하여 row를 생성한다.
6. `GameState.currentNodeId`, `phase`, `version`, 호환용 `flagsJson.vttMap` 미러를 같은 transaction에서 갱신한다.
7. `SessionNodeVisit`를 upsert한다.
8. commit 후 하나의 확정 snapshot/map 이벤트를 발행한다.

실패 동작:

- 원본/runtime JSON decode 실패: 전환을 중단하고 `SESSION_NODE_RUNTIME_MAP_INVALID` 오류를 반환한다.
- 대상 노드 없음: 기존 `TRANSITION_TARGET_NOT_FOUND`를 유지한다.
- 동시 수정 충돌: lock 획득 후 최신 상태로 재평가하며, 예상 version을 받는 API에서는 409를 반환한다.
- DB commit 실패: snapshot 및 map 이벤트를 발행하지 않는다.

### 5.2 맵 변경 저장

모든 맵 mutation은 `SessionNodeRuntimeMapService`의 한 저장 경로를 사용한다.

적용 대상:

- 토큰 이동
- 안개 공개
- 문 개방/파괴
- 오브젝트 상태 변경
- 위험 요소 발견/해제
- 맵 ping/light source 등 현재 저장 대상
- GM 전체 맵 저장

저장 순서:

1. 현재 `GameState.currentNodeId`와 요청 맵의 `scenarioNodeId` 일치를 검증한다.
2. 세션 lock 안에서 현재 node runtime row를 읽는다.
3. mutation과 normalize-for-write를 수행한다.
4. node runtime `version`을 증가시킨다.
5. `GameState.version`과 호환용 현재 맵 미러를 갱신한다.
6. commit 후 host map과 player redacted map을 발행한다.

`SessionVttMapNormalizationService`는 다음 두 동작으로 분리한다.

- `decodeAndSanitizeForRead`: 저장된 `updatedAt`을 보존하며 부작용 없이 검증
- `normalizeForWrite`: 실제 mutation 시에만 `updatedAt` 갱신

### 5.3 콘텐츠 공개와 오브젝트 가시성 동기화

공통 command `revealContentWithSourceObject`를 추가한다.

입력:

- `sessionScenarioId`
- `nodeId`
- `contentId`, `contentKind`
- `scope`, `recipientId`
- `sourceObjectId`
- `revealedBy`, `reason`, `turnLogId`

규칙:

- party scope이고 source object가 있으면 `SessionReveal` 생성과 `visibleToPlayers = true` 변경을 같은 transaction에서 처리한다.
- 오브젝트에 `observedBySessionCharacterIds`를 기록하고 플레이어 redaction 결과에 포함시킨다.
- private scope 공개는 대상 플레이어의 handout에는 반영하되 party map 전체 가시성을 바꾸지 않는다.
- 맵 지점 기반 조사 경로는 이미 찾은 object id를 직접 전달한다.
- 수동 GM 공개 DTO에는 `sourceObjectId?: string`을 추가한다.
- 기존 호출이 source id를 보내지 않으면 현재 노드에서 `hiddenClueIds/hiddenItemIds/hiddenEventIds`가 일치하는 오브젝트를 찾는다.
- 일치하는 오브젝트가 하나면 자동 연결하고, 둘 이상이면 맵 공개를 생략하지 말고 `SOURCE_OBJECT_AMBIGUOUS`로 거절하여 GM에게 선택을 요구한다.
- 이미 공개된 content/object에 대한 재시도는 성공한 no-op으로 처리한다.

이 command가 성공한 뒤에만 다음 이벤트를 발행한다.

- reveal 응답/turn log
- `vtt_map_updated`
- `session_snapshot`

## 6. 구현 단계

### Phase 0. 회귀 테스트를 먼저 고정

수정 전 현재 실패를 재현하는 테스트를 추가한다.

대상:

- `be/src/modules/sessions/session-node-runtime-transition.service.spec.ts` 신규
- `be/src/modules/sessions/session-vtt-object-runtime.service.spec.ts` 보강
- `be/src/modules/actions/main-commands.service.spec.ts` 보강
- `fe/src/features/sessionPlay/hooks/usePlayScenarioMapLoader.spec.ts` 보강

필수 실패 시나리오:

1. A에서 플레이어 토큰 이동 → B → A에서 이동 좌표 유지
2. A에서 hidden object 공개 → B → A에서 공개 상태 유지
3. AI GM 첫 진입 시에도 Human GM과 동일한 플레이어 토큰 생성
4. 실제 변경 없는 맵 read가 `updatedAt`을 바꾸지 않음
5. snapshot 누락/지연 상황에서 노드 변경 후 맵 GET이 새 노드를 조회

완료 기준:

- 테스트가 수정 전 원인을 정확히 재현하여 실패한다.
- 실패 원인이 mock 호출 횟수가 아니라 사용자에게 보이는 최종 상태 차이로 표현된다.

### Phase 1. 스키마와 마이그레이션

변경 파일:

- `be/prisma/schema.prisma`
- `be/prisma/migrations/<timestamp>_session_node_runtime_state/migration.sql`
- `scripts/backfill-session-node-runtime-maps.mjs` 신규
- 루트 `package.json`
- `be/test/session-node-runtime-state-db.integration.ts` 신규

작업:

- `SessionScenarioNodeRuntimeState`와 FK/index를 추가한다.
- `Scenario.deletedAt`과 조회 필터를 추가한다.
- Scenario 삭제 FK를 `Restrict`로 변경한다.
- 기존 `GameState.flagsJson.vttMap`을 현재 노드 runtime row로 옮기는 backfill 도구를 추가한다.
- backfill은 dry-run과 apply 모드를 제공하고 결과 건수와 제외 이유를 출력한다.

backfill 판정:

- `currentNodeId`가 없으면 제외한다.
- `flagsJson` 또는 `vttMap` decode 실패 시 제외하고 세션 ID와 사유만 기록한다.
- `vttMap.scenarioNodeId`가 없거나 `currentNodeId`와 같으면 현재 노드 row로 복사한다.
- 다른 노드 ID가 들어 있으면 임의 복구하지 않고 `NODE_ID_MISMATCH`로 보고한다.
- runtime row가 이미 있으면 덮어쓰지 않는다.

완료 기준:

- migration을 빈 DB와 기존 로컬 DB 모두에 적용할 수 있다.
- 같은 `(sessionScenarioId, nodeId)`의 runtime row가 둘 이상 생기지 않는다.
- dry-run 건수와 apply 건수가 일치하며 재실행 결과가 0건인 idempotent backfill이다.

### Phase 2. 노드 런타임 저장 서비스 구현

변경 파일:

- `be/src/modules/sessions/session-node-runtime-map.service.ts` 신규
- `be/src/modules/sessions/session-node-runtime-transition.service.ts` 신규
- `be/src/modules/sessions/sessions.module.ts`
- `be/src/modules/sessions/session-vtt-map-bootstrap.service.ts`
- `be/src/modules/sessions/session-vtt-map-normalization.service.ts`
- `be/src/modules/sessions/session-vtt-map-persistence.service.ts`
- `shared-types/src/dto/api/sessions.dto.ts`
- `shared-types/src/utils/api-decoders.ts`

작업:

- 원본 맵 초기화, runtime load, runtime save를 한 서비스로 모은다.
- 모든 decode는 shared decoder를 사용한다.
- 시작 슬롯 ID를 shared DTO와 decoder에 추가한다.
- 읽기 normalize와 쓰기 normalize를 분리한다.
- 기존 `flagsJson.vttMap`은 저장할 때만 함께 갱신한다.

완료 기준:

- 같은 노드 첫 load는 원본으로 runtime row를 만들고, 두 번째 load는 row를 재사용한다.
- read-only 호출은 DB write, version 증가, `updatedAt` 변경을 만들지 않는다.
- 새 캐릭터 추가가 기존 캐릭터 토큰 좌표를 바꾸지 않는다.

### Phase 3. AI/Human 전환 경로 통합

변경 파일:

- `be/src/modules/sessions/human-gm-runtime.service.ts`
- `be/src/modules/actions/main-command-scene-transition-state.service.ts`
- `be/src/modules/actions/main-command-scene-transition-resolution.service.ts`
- `be/src/modules/sessions/sessions.service.ts`
- `be/src/modules/sessions/sessions.module.ts`
- `be/src/modules/actions/actions.module.ts`

작업:

- 두 기존 서비스에서 원본 맵 직접 복사 코드를 제거한다.
- 공통 `SessionNodeRuntimeTransitionService.transition()`만 호출한다.
- Human GM의 도달 가능성 검사와 AI GM의 전환 판단은 각 상위 계층에 유지한다.
- 실제 state mutation, visit 기록, 맵 초기화/복원은 공통 서비스만 담당한다.
- 반환 DTO는 확정된 `snapshot + playerScenario` 계약을 유지하며 snapshot 안의 맵은 target runtime row와 동일해야 한다.

완료 기준:

- AI/Human 동일 입력에 대해 `currentNodeId`, `phase`, 플레이어 토큰, 오브젝트 상태가 동일하다.
- 전환 한 번당 `GameState.version`과 visit count가 정확히 한 번 증가한다.
- 같은 대상에 대한 중복 전환 요청이 맵을 원본으로 되돌리지 않는다.

### Phase 4. 모든 맵 mutation을 노드 정본 저장으로 전환

변경 파일:

- `be/src/modules/sessions/map-runtime.service.ts`
- `be/src/modules/sessions/session-vtt-object-runtime.service.ts`
- `be/src/modules/sessions/session-vtt-map-persistence.service.ts`
- `be/src/modules/sessions/vtt-map-door-runtime.service.ts`
- `be/src/modules/sessions/vtt-map-hazard-runtime.service.ts`
- `be/src/modules/sessions/vtt-map-interaction-runtime.service.ts`
- `be/src/modules/sessions/vtt-map-object-runtime.service.ts`

작업:

- `gameState.flagsJson.vttMap` 직접 read/modify/write를 제거한다.
- 모든 mutation이 현재 node runtime row를 읽고 저장하도록 바꾼다.
- 세션 advisory lock 또는 version CAS 없이 map JSON을 덮어쓰는 경로가 남지 않게 한다.
- publish는 commit 이후 한 경로에서만 실행한다.

완료 기준:

- 코드 검색 결과 `flagsJson`의 `vttMap` 직접 변경은 호환 미러 서비스 한 곳에만 남는다.
- 서로 다른 세션의 mutation은 병렬 처리되고 같은 세션의 mutation은 유실 없이 직렬화된다.
- host/player map 이벤트의 `scenarioNodeId`가 현재 `GameState.currentNodeId`와 항상 같다.

### Phase 5. 공개 계약과 맵 가시성 통합

변경 파일:

- `shared-types/src/dto/api/sessions.dto.ts`
- `shared-types/src/utils/api-decoders.ts`
- `be/src/modules/sessions/session-reveal.service.ts`
- `be/src/modules/sessions/session-vtt-object-runtime.service.ts`
- `be/src/modules/actions/main-command-check-reveal.service.ts`
- `be/src/modules/actions/main-command-check-reveal-sync.service.ts`
- 관련 GM 공개 UI 및 API 서비스

작업:

- 수동 공개 계약에 `sourceObjectId`를 추가한다.
- `SessionReveal.snapshotJson`에 `sourceNodeId`, `sourceObjectId`를 일관되게 저장한다.
- 공개 기록과 runtime object visibility 변경을 원자적으로 처리한다.
- 공개 후 player redaction 결과를 테스트한다.

완료 기준:

- 공개된 오브젝트는 같은 응답 직후 플레이어 맵에 위치가 나타난다.
- B를 방문했다 A로 돌아와도 공개 상태가 유지된다.
- private reveal은 party map을 노출하지 않는다.
- 같은 공개 요청 재시도 시 중복 `SessionReveal`, 중복 아이템, 중복 이벤트가 생기지 않는다.

### Phase 6. 프론트 동기화 강화

변경 파일:

- `fe/src/features/sessionPlay/hooks/usePlayScenarioMapLoader.ts`
- `fe/src/features/sessionPlay/hooks/useHumanGmSceneActions.ts`
- `fe/src/features/sessionPlay/utils/sessionNodeTransition.ts`
- `fe/src/services/vttMapApi.ts`
- 관련 테스트

작업:

- 맵 load key를 `(sessionId, currentNodeId, stateVersion)`으로 통일한다.
- 전환 응답의 snapshot 맵을 우선 적용한다.
- 응답에 맵이 없거나 node ID가 다르면 GET으로 복구한다.
- 이전 노드의 늦은 응답이 새 노드 맵을 덮지 않도록 request key를 검증한다.
- 정상 전환에서는 중복 GET을 피하고, 불일치/재연결 상황에서만 재조회한다.

완료 기준:

- 느린 A 맵 응답이 B 진입 이후 도착해도 B 맵을 덮지 않는다.
- 정상 Human GM 전환은 snapshot 한 번으로 렌더링되고 불필요한 추가 GET이 없다.
- AI GM 이벤트, 새로고침, WebSocket 재연결 모두 현재 node runtime map으로 수렴한다.

### Phase 7. 시나리오 삭제와 고아 세션 방지

변경 파일:

- `be/prisma/schema.prisma`
- `be/src/modules/scenarios/scenarios.service.ts`
- `be/src/modules/scenarios/scenarios.service.spec.ts`
- 세션 목록/상세 조회 정책과 관련 테스트

작업:

- 연결된 시나리오 삭제는 soft delete로 변경한다.
- `sessionScenario.deleteMany({ scenarioId })`를 제거한다.
- DB FK `Restrict`를 최종 방어선으로 둔다.
- 기존 고아 세션 진단 명령을 만든다.
- 복구 가능한 고아는 백업 기반으로만 복구한다.
- 복구 불가능한 고아는 플레이 진입을 차단하고 데이터 유실 상태를 명시적으로 표시하거나 운영 정리 대상으로 분류한다.

완료 기준:

- Scenario 삭제 이후에도 기존 완료/진행 세션의 `SessionScenario`, `GameState`, node runtime, reveal을 조회할 수 있다.
- 신규 `PLAYING` 세션에 `SessionScenario = 0`인 상태를 만들 수 없다.
- 세션 시작 시 활성 플레이어 participant와 `SessionCharacter`의 불일치를 검증하고 명확한 오류를 반환한다.

## 7. 검증 매트릭스

| 구분 | 검증 시나리오 | 성공 기준 |
|---|---|---|
| 노드 재방문 | A에서 토큰 이동 후 B → A | 모든 플레이어 토큰 좌표가 A 이탈 직전과 동일 |
| 오브젝트 재방문 | A에서 hidden object 공개 후 B → A | object가 player map에 계속 보임 |
| 맵 구성 요소 | 안개 제거, 문 개방, 위험 해제 후 재방문 | 각 상태가 정확히 유지 |
| 전환 동등성 | AI GM/Human GM으로 같은 노드 첫 진입 | runtime map의 의미상 결과가 동일 |
| 참가 변경 | A 상태 저장 후 새 캐릭터 참가 | 기존 토큰 불변, 새 토큰만 빈 슬롯에 추가 |
| 멱등성 | 동일 공개/전환 요청 재시도 | 중복 row/아이템/이벤트 없음 |
| 경쟁 상태 | 이동과 공개를 거의 동시에 실행 | 한 변경도 유실되지 않음 |
| 플레이어 보안 | GM 전용 hidden data 포함 맵 저장 | player map에 숨김 ID/check/event가 노출되지 않음 |
| 프론트 순서 역전 | A GET 지연 중 B 전환 | 최종 화면은 B 맵 |
| 삭제 무결성 | 연결된 Scenario 삭제 요청 | 세션 런타임 링크 보존 |
| 읽기 부작용 | 동일 맵 연속 GET | DB version/updatedAt 불변 |

## 8. 실행 명령과 품질 게이트

구현 시 아래 순서로 검증한다.

```powershell
npm run build -w @trpg/shared-types
npm run prisma:generate -w @trpg/be
npm run build -w @trpg/be
npm run test:quiet -w @trpg/be -- session-node-runtime-transition.service.spec.ts session-vtt-map-bootstrap.service.spec.ts session-vtt-object-runtime.service.spec.ts main-commands.service.spec.ts sessions.service.spec.ts scenarios.service.spec.ts --runInBand
npm run test -w @trpg/fe -- usePlayScenarioMapLoader.spec.ts sessionNodeTransition.spec.ts
npm run build -w @trpg/fe
```

DB 검증은 로컬 Docker DB에 migration을 적용한 뒤 별도로 수행한다.

```powershell
npx prisma migrate deploy --schema be/prisma/schema.prisma
npm run test:session-node-runtime-db -w @trpg/be
```

최종 품질 게이트:

- 관련 단위/통합 테스트 전부 통과
- shared types, backend, frontend build 통과
- 기존 로컬 DB migration 및 backfill 통과
- backfill 재실행 0건
- `PLAYING` 세션 대상 node runtime 누락 0건
- 현재 node ID와 runtime map `scenarioNodeId` 불일치 0건
- 맵 read-only 요청에 의한 version 증가 0건

## 9. 배포 및 롤백

### 배포 순서

1. DB 테이블과 FK 변경 배포
2. 구버전 호환을 유지한 runtime dual-write 배포
3. backfill dry-run 및 제외 건 검토
4. backfill apply
5. AI/Human 공통 전환과 맵 mutation 전환 배포
6. 프론트 load key 보강 배포
7. 지표 안정화 후 `flagsJson.vttMap` read fallback 제거 여부 결정

### 관찰 지표

- `session_node_runtime_initialized_total`
- `session_node_runtime_restored_total`
- `session_node_runtime_decode_failed_total`
- `session_node_runtime_node_mismatch_total`
- `session_node_runtime_write_conflict_total`
- `session_reveal_object_visibility_synced_total`
- `session_reveal_source_object_ambiguous_total`
- `orphan_session_without_scenario_total`

### 롤백

- 신규 테이블은 additive change이므로 애플리케이션 롤백 시 남겨 둔다.
- dual-write 기간에는 구버전이 `flagsJson.vttMap`을 계속 읽을 수 있다.
- backfill은 기존 flags를 삭제하지 않으므로 되돌릴 데이터가 없다.
- 신규 코드 안정화 전에는 기존 flags 미러를 제거하지 않는다.
- 데이터 정본 전환 후 runtime row를 삭제하는 롤백은 금지한다.

## 10. 완료 정의

아래 조건을 모두 충족해야 해결 완료로 판단한다.

- A → B → A 재방문에서 플레이어 토큰과 모든 맵 상호작용 상태가 보존된다.
- hidden object 공개가 같은 transaction과 같은 사용자 동작 안에서 player map 위치 표시로 이어진다.
- AI GM과 Human GM 전환이 동일한 공통 런타임 서비스를 사용한다.
- 새 캐릭터 추가가 기존 캐릭터의 좌표를 변경하지 않는다.
- 프론트는 응답 순서가 역전되어도 현재 노드 맵으로 수렴한다.
- 원본 Scenario 삭제가 세션 런타임을 cascade 삭제하지 않는다.
- 기존 DB 데이터의 backfill 결과와 제외 목록이 기록된다.
- 관련 테스트, 빌드, 로컬 DB 통합 검증이 모두 통과한다.

이 기준이 충족되기 전에는 단순히 현재 화면에 토큰이나 오브젝트가 보이는 것만으로 완료 처리하지 않는다.
