# 세션 런타임 상태 정합성 강화 계획

작성일: 2026-05-22

## 확인된 문제

전투 종료 후 플레이 화면은 탐색 상태로 전환됐지만, DB에는 같은 세션의 `ACTIVE` combat이 남아 있었다.

확인된 실제 상태:

- `GameState.phase = EXPLORATION`
- `flags.completedCombatNodeIds`에 현재 전투 노드가 포함됨
- 같은 `sessionId`에 `status = ACTIVE`인 `Combat` row가 남아 있음
- 동시에 정상 종료된 `ENDED` combat row도 별도로 존재함

이 상태에서 `POST /sessions/:id/map/tokens/move`는 `ACTIVE` combat을 보고 전투 이동 endpoint를 쓰라며 403을 반환한다. 즉 문제는 프론트 명령 선택만의 문제가 아니라, DB가 허용하는 런타임 상태와 상태 전이 방식의 정합성 문제다.

## 목표

- 같은 세션에 `ACTIVE` combat이 둘 이상 존재할 수 없게 한다.
- 전투 시작/종료와 맵 런타임 command가 서로 끼어들지 않게 한다.
- 전투 종료 후 탐색 상태에서는 오래된 `ACTIVE` combat 때문에 탐색 이동이 막히지 않게 한다.
- 상태 경쟁을 권한 오류 403으로 노출하지 않는다.
- 세션 단위 직렬화만 적용해 다른 세션 처리 성능에는 영향을 주지 않는다.

## 설계 원칙

1. DB invariant가 최종 방어선이어야 한다.
2. 전투 상태 전이는 idempotent 해야 한다.
3. 세션 런타임 mutation은 같은 `sessionId` 안에서만 직렬화한다.
4. `GameState.phase`와 `Combat.status`가 충돌하면 서버가 복구 가능한 쪽으로 정리한다.
5. 진짜 403은 권한 위반에만 사용한다.

## 구현 계획

### 1. 기존 깨진 ACTIVE combat 정리

마이그레이션에서 같은 세션에 여러 `ACTIVE` combat이 있으면 최신 row 하나만 남기거나, 이미 `GameState.phase = EXPLORATION`이고 현재 노드가 `completedCombatNodeIds`에 있으면 해당 세션의 모든 `ACTIVE` combat을 `ENDED`로 닫는다.

이 프로젝트의 실제 장애 상태는 후자다. 따라서 우선 `EXPLORATION + completedCombatNodeIds`와 충돌하는 `ACTIVE` combat은 `ENDED` 처리한다.

### 2. 부분 unique index 추가

Postgres partial unique index를 추가한다.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS combat_one_active_per_session
ON "Combat" ("sessionId")
WHERE "status" = 'ACTIVE';
```

Prisma schema는 partial unique index를 직접 표현하지 못하므로 SQL 마이그레이션 파일로 관리한다.

효과:

- 동시 `startCombat` 호출로 같은 세션에 `ACTIVE` combat이 두 개 생기는 것을 DB가 차단한다.
- `sessionId + ACTIVE` 조회에도 유리하다.
- 인덱스 대상은 active combat뿐이라 성능 부담이 작다.

### 3. 세션 단위 advisory transaction lock

Postgres advisory transaction lock을 공통 helper로 추가한다.

```sql
SELECT pg_advisory_xact_lock(hashtext(sessionId));
```

적용 대상:

- `CombatService.startCombat`
- `CombatService.endCombat`
- `SessionsService.completeActiveCombatState`
- `SessionsService.completeSessionAfterPartyDefeat`
- `MapRuntimeService.moveSessionToken`
- `MapRuntimeService.createVttMapPing`
- `MapRuntimeService.runVttMapInteraction`
- `MapRuntimeService.saveSystemVttMap`
- `MapRuntimeService.updateGmVttMap`

첫 단계에서는 전투 시작/종료와 탐색 이동에 우선 적용한다.

성능 평가:

- 같은 세션의 런타임 mutation만 직렬화된다.
- 다른 세션은 서로 다른 advisory key를 사용하므로 병렬 처리된다.
- TRPG 세션의 맵/전투 command 빈도에서는 병목보다 정합성 이득이 크다.

### 4. 전투 종료는 세션의 ACTIVE combat 전체 종료

`completeActiveCombatState(sessionId, combatId?)`가 `combatId`를 받더라도 DB 정합성은 세션 단위로 보장해야 한다.

변경 방향:

```ts
await tx.combat.updateMany({
  where: {
    sessionId,
    status: ACTIVE,
  },
  data: {
    status: ENDED,
    endedAt: now,
    currentParticipantId: null,
  },
});
```

반환 response를 만들 때만 원래 combat id를 사용한다. 세션에 남은 유령 ACTIVE combat은 모두 닫는다.

### 5. 탐색 이동 command의 stale active combat self-heal

`moveSessionToken`에서 `ACTIVE` combat을 발견했을 때 바로 403을 던지지 않는다.

판단 순서:

1. 최신 `GameState`를 읽는다.
2. `state.phase === COMBAT`이면 전투 이동 endpoint를 쓰도록 막는다.
3. `state.phase !== COMBAT`인데 `ACTIVE` combat이 있으면 stale combat으로 판단하고 세션의 active combat을 종료한 뒤 탐색 이동을 계속한다.

이 경우는 권한 문제가 아니라 상태 불일치 복구다.

### 6. 장기 개선: Combat에 node id 저장

`Combat`에 `scenarioNodeId`를 추가한다.

```prisma
scenarioNodeId String?
@@index([sessionId, scenarioNodeId, status])
```

효과:

- 현재 노드 전투와 과거 노드 유령 전투를 구분할 수 있다.
- `completedCombatNodeIds` JSON만으로 전투 완료 여부를 판단하는 의존을 줄인다.
- 운영 디버깅이 쉬워진다.

이 변경은 데이터 마이그레이션과 API 영향이 있어 2단계 작업으로 둔다.

## 검증 기준

- 같은 세션에 `ACTIVE` combat을 두 개 만들 수 없다.
- 전투 종료 후 `GameState.phase = EXPLORATION`이면 `POST /map/tokens/move`가 stale active combat 때문에 403을 내지 않는다.
- 전투 중 `POST /map/tokens/move`는 여전히 combat endpoint 사용을 요구한다.
- 전투 종료는 여러 번 호출해도 안전하다.
- 다른 세션의 command 처리에는 lock 대기가 생기지 않는다.

## 리스크와 대응

- 마이그레이션 전 기존 중복 ACTIVE 데이터가 있으면 unique index 생성 실패
  - 선행 cleanup SQL로 정리한다.
- advisory lock을 잘못 넓게 잡으면 병목
  - `sessionId` 단위로만 잡고, 외부 API 호출이나 긴 작업은 lock 안에 넣지 않는다.
- self-heal이 진짜 진행 중인 전투를 닫을 위험
  - `GameState.phase !== COMBAT`인 경우에만 수행한다.
  - `phase = COMBAT`이면 기존처럼 전투 이동 endpoint를 요구한다.

## 1차 구현 반영

- `be/prisma/migrations/202605220001_session_runtime_state_integrity/migration.sql`을 추가했다.
  - `EXPLORATION` 상태와 충돌하는 stale `ACTIVE` combat을 `ENDED`로 정리한다.
  - 한 세션에 여러 `ACTIVE` combat이 있으면 최신 하나만 남기고 나머지를 `ENDED`로 닫는다.
  - `combat_one_active_per_session` partial unique index를 추가한다.
- `SessionsService.completeActiveCombatState()`와 `completeSessionAfterPartyDefeat()`는 특정 combat id만 닫지 않고 같은 세션의 모든 `ACTIVE` combat을 닫도록 바꿨다.
- 전투 종료 계열 transaction과 전투 시작 transaction에 세션 단위 advisory transaction lock을 추가했다.
- `MapRuntimeService.moveSessionToken()`은 `GameState.phase !== COMBAT`인데 `ACTIVE` combat이 남아 있으면 stale 상태로 판단해 active combat을 정리하고 탐색 이동을 계속한다.
