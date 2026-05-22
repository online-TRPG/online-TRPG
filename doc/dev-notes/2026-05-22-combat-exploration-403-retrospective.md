# 전투 종료 후 탐색 이동 403 버그 회고

작성일: 2026-05-22

## 요약

멀티플레이 세션에서 전투 노드가 끝난 뒤 화면과 게임 상태는 탐색으로 전환됐지만, 플레이어가 맵 토큰을 이동하면 `POST /api/v1/sessions/:sessionId/map/tokens/move`가 403을 반환했다.

최종 원인은 프론트엔드의 command routing 문제가 아니라, DB에 같은 세션의 오래된 `ACTIVE` combat row가 남아 있는 런타임 상태 정합성 문제였다.

실제 확인된 상태는 다음과 같았다.

- `GameState.phase = EXPLORATION`
- `GameState.flagsJson.completedCombatNodeIds`에 현재 전투 노드가 포함됨
- 같은 `sessionId`에 `status = ACTIVE`인 `Combat` row가 남아 있음
- 동시에 정상 종료된 `ENDED` combat row도 별도로 존재함

즉 시스템은 한쪽에서는 "탐색 상태"라고 말하고, 다른 한쪽에서는 "아직 전투 중"이라고 말하고 있었다. `/map/tokens/move`는 `ACTIVE` combat을 보고 전투 이동 command를 쓰라고 403을 냈고, 사용자 입장에서는 전투가 끝났는데 탐색 이동이 막히는 현상으로 드러났다.

## 왜 오래 걸렸는가

이 버그는 증상이 프론트엔드에서 먼저 보였다. 브라우저 콘솔에는 `/map/tokens/move` 403만 보였고, 전투 종료 후 화면은 탐색 노드로 바뀌어 있었다. 그래서 처음에는 다음 계층들이 자연스럽게 의심됐다.

- 프론트엔드가 아직 전투 모드라고 착각해 잘못된 이동 endpoint를 호출하는가
- 전투 노드에서 탐색 노드로 넘어가는 PlayPage 상태 전환이 늦게 반영되는가
- 맵 command hook이나 BattleMap pointer input 분리 과정에서 이동 모드 판단이 깨졌는가
- host/player 권한 분기 때문에 플레이어의 탐색 이동이 잘못 403 처리되는가
- 전투 종료 이벤트와 탐색 이동 이벤트가 비동기로 엇갈려 순서 문제가 생기는가

이 가설들은 모두 그럴듯했다. 실제로 이 작업 전후에는 BattleMap pointer input hook 분리, map runtime command 정리, non-host map update 처리, 전투/탐색 노드 전환 흐름이 함께 얽혀 있었다. 그래서 UI state, API routing, 권한 체크, 이벤트 순서 모두가 후보처럼 보였다.

하지만 최종적으로는 그쪽이 핵심 원인이 아니었다. 프론트엔드가 `/map/tokens/move`를 호출했다는 사실 자체는 탐색 이동 command를 고른 것이므로 오히려 프론트 routing이 전투 이동으로 잘못 빠진 상황은 아니었다. 403은 "잘못된 endpoint를 프론트가 골랐다"가 아니라, 백엔드가 DB의 `ACTIVE` combat을 보고 "이 세션은 아직 전투 중"이라고 판단했기 때문에 발생했다.

## 헷갈렸던 지점과 배제된 이유

### 1. 프론트 command routing 문제

처음에는 전투 종료 직후 React state나 socket snapshot 반영이 늦어서 프론트가 전투/탐색 모드를 잘못 판단한다고 볼 수 있었다. 전투가 끝나는 순간에는 여러 이벤트가 한꺼번에 온다.

- combat ended
- session snapshot changed
- current node changed
- map state changed
- player action buttons changed

이 중 하나라도 늦게 반영되면 사용자가 클릭한 이동 command가 잘못 분기될 수 있다.

하지만 실제 실패 endpoint는 `/map/tokens/move`였다. 이 endpoint는 탐색 맵 이동용이다. 만약 프론트가 전투 상태라고 착각했다면 combat move endpoint를 호출했어야 한다. 따라서 "프론트가 전투 endpoint를 잘못 호출했다"는 가설은 증상과 맞지 않았다.

### 2. 권한 체크 문제

멀티플레이에서만 문제가 강하게 드러났기 때문에 host/player 권한 차이가 의심됐다. 실제로 map update 계열에는 host만 허용되는 경로와 player에게 허용되는 경로가 섞여 있고, legacy PATCH 요청을 어떻게 처리하느냐도 영향을 줄 수 있었다.

하지만 `/map/tokens/move`의 403은 권한 위반이라기보다 "전투 중에는 일반 맵 이동을 쓰지 말라"는 도메인 guard에서 발생했다. 사용자가 player라서 막힌 것이 아니라, 세션에 `ACTIVE` combat이 있다고 판단했기 때문에 막힌 것이다.

### 3. 비동기 command 순서 문제

전투 종료 직후 이동 command가 빠르게 들어오면, 전투 종료 DB update보다 이동 요청이 먼저 처리될 수 있다. 이 경우에는 command queue나 session-level serialization이 필요하다는 판단이 자연스럽다.

이 가설은 완전히 틀린 것은 아니었다. 실제 개선에도 session 단위 advisory transaction lock을 넣었다. 다만 확인된 실제 DB 상태는 단순한 순간적 race가 아니었다. 전투가 끝난 뒤에도 `GameState.phase = EXPLORATION`이고 `completedCombatNodeIds`에 노드가 기록되어 있었는데, `ACTIVE` combat row가 계속 남아 있었다. 즉 "잠깐 순서가 엇갈린 상태"가 아니라, DB가 서로 모순되는 상태를 지속적으로 보관하고 있었다.

### 4. 테스트와 현재 코드가 맞지 않는 문제

중간에 TypeScript build와 backend test가 여러 곳에서 깨졌다. 일부는 실제 코드 변경에 따라 fixture나 mock이 낡아진 문제였고, 일부는 runtime helper 분리 과정에서 타입 계약이 명확하지 않았던 문제였다.

이 작업들은 필요했지만, 403 버그의 직접 원인은 아니었다. 테스트 실패를 고치는 과정은 코드의 주변 정합성을 올렸지만, DB에 남아 있는 stale `ACTIVE` combat을 직접 설명하지는 못했다.

## 진짜 원인을 짐작할 수 있었던 단서

결정적인 단서는 사용자 재현 설명의 모순이었다.

- 화면은 이미 탐색 노드였다.
- 이동 요청은 탐색 이동 endpoint인 `/map/tokens/move`로 나갔다.
- 그런데 백엔드는 전투 중 이동처럼 403을 냈다.

이 세 가지가 동시에 참이면, 프론트만의 문제로 설명하기 어렵다. 프론트는 탐색 이동을 시도하고 있었고, 화면도 탐색이었다. 그런데 백엔드만 전투라고 판단했다. 따라서 서버가 보고 있는 authoritative state, 특히 DB 상태를 확인해야 했다.

DB를 직접 확인하자 다음 구조가 드러났다.

- `GameState`는 탐색 상태였다.
- 현재 노드는 완료된 전투 노드로 기록되어 있었다.
- 종료된 combat row도 있었다.
- 하지만 같은 세션에 별도의 `ACTIVE` combat row가 남아 있었다.

이 시점에 원인은 명확해졌다. 문제는 "어느 endpoint를 호출하느냐"가 아니라 "DB가 같은 세션에 서로 충돌하는 런타임 사실을 동시에 허용한다"는 것이었다.

## 근본 원인

근본 원인은 `Combat.status = ACTIVE`에 대한 DB 레벨 invariant가 없었다는 점이다.

전투는 세션 런타임에서 사실상 단일 활성 상태여야 한다. 한 세션은 동시에 하나의 active combat만 가져야 하고, `GameState.phase`와도 충돌하지 않아야 한다. 하지만 기존 DB 구조는 다음 상태를 막지 못했다.

- 같은 세션에 여러 개의 `ACTIVE` combat 생성
- 전투 종료 후 일부 `ACTIVE` combat 미종료
- `GameState.phase = EXPLORATION`인데 `Combat.status = ACTIVE` 유지

서비스 코드가 정상 경로에서는 잘 닫는다고 해도, 동시 요청, 중복 start/end, 예외 중단, 오래된 데이터, 다른 경로의 update가 섞이면 DB는 모순 상태를 허용했다. 결국 API guard는 그 모순 상태를 그대로 믿고 403을 냈다.

## 적용한 해결 방향

해결은 특정 화면이나 특정 요청 하나를 우회하는 방식이 아니라, 세션 런타임 상태의 invariant를 강화하는 쪽으로 잡았다.

### 1. 기존 stale active combat 정리

마이그레이션에서 이미 탐색 상태와 충돌하는 `ACTIVE` combat을 `ENDED`로 닫았다.

특히 다음 조건의 combat은 stale 상태로 보고 정리했다.

- combat은 `ACTIVE`
- 연결된 `GameState.phase`는 `COMBAT`이 아님
- 현재 노드가 `completedCombatNodeIds`에 들어 있음

또한 한 세션에 여러 `ACTIVE` combat이 있으면 최신 하나만 남기고 나머지를 닫도록 했다.

### 2. DB partial unique index 추가

Postgres partial unique index를 추가했다.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "combat_one_active_per_session"
ON "Combat" ("sessionId")
WHERE "status" = 'ACTIVE';
```

이제 같은 세션에 `ACTIVE` combat이 두 개 생기는 상태는 DB가 직접 거부한다. Prisma schema가 partial unique index를 표현하지 못하기 때문에 SQL migration으로 관리한다.

### 3. 전투 종료를 idempotent하게 변경

`SessionsService.completeActiveCombatState()`는 특정 combat id 하나만 닫는 것이 아니라, 같은 세션의 모든 `ACTIVE` combat을 닫도록 바꿨다.

이렇게 하면 전투 종료 요청이 여러 번 들어오거나, 이전에 남은 active row가 있어도 종료 처리는 세션 단위로 수렴한다.

### 4. 세션 단위 advisory transaction lock 추가

전투 시작/종료 계열 transaction에 PostgreSQL advisory transaction lock을 추가했다.

```sql
SELECT pg_advisory_xact_lock(hashtext(sessionId));
```

이 lock은 같은 세션의 런타임 mutation만 직렬화한다. 다른 세션은 서로 다른 key를 쓰므로 병렬 처리된다. 따라서 전체 서버 병목을 만들지 않으면서, 같은 세션 안에서 전투 시작/종료가 엇갈리는 위험을 줄인다.

### 5. 탐색 이동의 self-heal 처리

`MapRuntimeService.moveSessionToken()`에서 `ACTIVE` combat을 발견했을 때 무조건 403을 던지지 않도록 했다.

새 판단은 다음과 같다.

1. 최신 `GameState`를 읽는다.
2. `state.phase === COMBAT`이면 기존처럼 일반 맵 이동을 막는다.
3. `state.phase !== COMBAT`인데 `ACTIVE` combat이 있으면 stale 상태로 보고 active combat을 정리한 뒤 탐색 이동을 계속한다.

이 경우는 권한 위반이 아니라 서버 상태 불일치 복구다. 그래서 사용자에게 403으로 노출하지 않는 것이 맞다.

## 마이그레이션 적용 중 추가로 드러난 문제

`npx prisma migrate deploy --schema prisma/schema.prisma` 실행 시 `P3005`가 발생했다.

원인은 DB가 비어 있지 않아서가 아니라, 기존 DB가 Prisma Migrate history 없이 이미 만들어져 있었기 때문이다. 이 프로젝트는 기존에 `prisma db push` 흐름으로 DB가 만들어진 상태였고, repo에는 이번 runtime integrity migration만 존재했다. 따라서 Prisma는 기존 스키마를 어떤 migration이 만들었는지 알 수 없어 baseline을 요구했다.

이번 로컬 DB에는 다음 순서로 처리했다.

1. runtime integrity SQL 파일을 `prisma db execute`로 직접 실행
2. `prisma migrate resolve --applied 202605220001_session_runtime_state_integrity`로 migration 적용 기록 등록
3. `prisma migrate status`로 `Database schema is up to date!` 확인

적용 후 DB 검증 결과:

- 중복 `ACTIVE` combat 없음
- `combat_one_active_per_session` index 존재
- `GameState.phase != COMBAT` 상태에 남아 있는 `ACTIVE` combat 없음

## 왜 이 해결이 이전 접근보다 근본적인가

이전 접근들은 대체로 "어떤 코드 경로가 잘못 호출됐는가"를 찾는 방식이었다. 하지만 실제 문제는 어떤 코드 경로 하나가 아니라, 여러 코드 경로가 공유하는 DB 상태의 불변조건이 약한 것이었다.

이번 해결은 세 겹으로 방어한다.

- 기존 깨진 데이터는 migration으로 정리한다.
- 앞으로 같은 세션에 여러 active combat이 생기는 것은 DB index로 막는다.
- 그래도 `GameState.phase`와 `Combat.status`가 충돌하면 이동 command가 self-heal한다.

이 구조는 단일 버그 재현 케이스만 막는 것이 아니라, 전투 종료/탐색 전환 주변에서 같은 계열의 상태 불일치를 다시 만들기 어렵게 한다.

## 남은 개선점

장기적으로는 `Combat`에 `scenarioNodeId`를 추가하는 것이 좋다.

현재는 전투 완료 여부를 `GameState.flagsJson.completedCombatNodeIds`와 현재 노드 정보로 추론한다. 이 방식은 동작하지만, 어떤 combat이 어떤 scenario node에서 시작됐는지를 `Combat` row 자체가 모른다. `scenarioNodeId`가 있으면 다음이 쉬워진다.

- 현재 노드 전투와 과거 노드 stale combat 구분
- 운영 DB 디버깅
- 전투 재시작/재진입 정책 수립
- node 단위 전투 이력 조회

또한 현재 Prisma migration history는 중간에 SQL migration을 직접 적용하고 `resolve`한 상태다. 팀/배포 환경에서는 기존 DB를 어떻게 baseline할지 별도 정책을 정리해야 한다.

## 교훈

이번 버그에서 가장 중요한 교훈은, 화면 상태와 API endpoint가 이미 탐색을 가리키고 있는데도 서버가 전투라고 판단한다면, 다음 의심 대상은 프론트 state가 아니라 authoritative DB state라는 점이다.

멀티플레이 런타임에서는 UI snapshot, socket event, API response, DB row가 모두 같은 사실을 말해야 한다. 그중 DB가 모순을 허용하면, 다른 레이어를 아무리 정리해도 같은 문제가 다른 모양으로 다시 나타난다.

따라서 세션 런타임에서 중요한 상태는 서비스 코드의 관례만으로 지키면 안 된다. DB invariant, idempotent transition, session-scoped serialization, 복구 가능한 self-heal 경로가 함께 있어야 한다.
