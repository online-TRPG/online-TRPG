# 개발 노트 - 2026-05-04 11:21

## 1. 꼭 먼저 확인할 것

이번 작업은 세션 진행 중 플레이어 action을 받고, 판정/주사위/상태 변경/턴 로그까지 남기는 흐름입니다. 단순 API 추가가 아니라 DB 테이블과 enum도 추가되었습니다.

팀원이 이 브랜치를 받을 때 가장 먼저 보면 좋은 내용은 아래입니다.

- 공용 DB에는 `prisma db push`로 이번 Prisma schema 변경이 반영되었습니다.
- 코드를 받은 뒤에는 Prisma Client가 맞아야 하므로 `npm run prisma:generate -w @trpg/be`를 한 번 실행하는 것이 안전합니다.
- 추가 DB 변경이 생기면 바로 `db push`하지 말고, 팀에 먼저 공유한 뒤 반영 시간을 맞춰야 합니다.
- WebSocket 이벤트 코드는 추가되어 있지만, 이번 수동 테스트에서는 WebSocket 확인은 제외했습니다.
- REST API 수동 테스트와 e2e 테스트는 완료했습니다.

## 2. 이번에 추가된 큰 흐름

플레이어가 `/check perception 5`, `/roll 1d20`, `/damage ...` 같은 action을 보내면 아래 순서로 처리됩니다.

```text
action 접수
-> 현재 세션 상태와 현재 턴 검증
-> 명령어 파싱
-> 주사위가 필요하면 굴림
-> HP/상태 이상 변경이 필요하면 DB 상태 반영
-> TurnLog / DiceRollLog / StateDiff 저장
```

즉, 최종 결과는 action 응답만 보지 말고 `GET /api/v1/sessions/{sessionId}/turn-logs`에서 확인하는 방식입니다.

## 3. DB 변경 영향

새로 추가된 대표 테이블은 아래입니다.

- `PlayerAction`: 사용자가 입력한 action을 먼저 저장합니다.
- `TurnLog`: 한 턴에서 어떤 행동이 일어났는지 기록합니다.
- `DiceRollLog`: 주사위 식, 굴림값, 합계를 기록합니다.
- `StateDiff`: HP 감소, 회복, 상태 이상 추가/삭제처럼 실제로 바뀐 값을 기록합니다.
- `Combat`: 전투 진행 상태를 저장합니다.
- `CombatParticipant`: 전투 참가자와 현재 턴 순서를 저장합니다.

주의할 점:

- `npm run prisma:generate -w @trpg/be`는 로컬 Prisma Client 생성이라 DB를 바꾸지 않습니다.
- `npm run prisma:push -w @trpg/be`는 실제 DB 구조를 바꿉니다.
- 공용 EC2 DB를 같이 쓰고 있으므로, 다음부터 DB 구조 변경이 있으면 팀 공유 후 반영해야 합니다.

## 4. 수동 테스트할 때 자주 헷갈리는 부분

### 4.1 action 응답의 `PENDING`

`POST /api/v1/sessions/{sessionId}/actions` 응답에서 `queueStatus`가 `PENDING`으로 보여도 정상입니다.

현재 MVP 구현은 action을 접수한 뒤 바로 처리합니다. 그래서 최종 성공/실패, 주사위 결과, 상태 변경은 TurnLog에서 확인해야 합니다.

### 4.2 `CHARACTER_ID`와 `SESSION_CHARACTER_ID`

두 ID가 다릅니다.

- `CHARACTER_ID`: 사용자가 만든 원본 캐릭터 ID
- `SESSION_CHARACTER_ID`: 특정 세션 안에서 사용하는 캐릭터 상태 ID

action body의 `characterId`에는 `CHARACTER_ID`를 넣습니다.

하지만 `/damage`, `/heal`, `/condition` 명령어의 대상에는 `SESSION_CHARACTER_ID`를 넣는 것이 안전합니다.

예시:

```json
{
  "characterId": "CHARACTER_ID",
  "rawText": "/damage SESSION_CHARACTER_ID 3",
  "actionScope": "INDIVIDUAL_TURN"
}
```

### 4.3 TurnLog 조회 cursor

첫 조회에서는 `cursor`를 비워야 합니다.

Swagger 입력칸에 예시처럼 보이는 `cursor` 문자열을 그대로 넣으면 올바른 커서가 아닙니다. 다음 페이지가 필요할 때만 이전 응답의 `data.nextCursor` 값을 넣으면 됩니다.

### 4.4 `stateDiff`가 null인 경우

`/roll`, `/check`는 HP나 상태를 바꾸지 않으므로 `stateDiff: null`이 정상입니다.

`/damage`, `/heal`, `/condition`처럼 실제 상태를 바꾸는 action에서 `stateDiff`가 생기는지 확인하면 됩니다.

## 5. 주요 API

이번 작업에서 확인한 핵심 API입니다.

- `POST /api/v1/sessions/{sessionId}/actions`
- `GET /api/v1/sessions/{sessionId}/turn-logs`
- `POST /api/v1/sessions/{sessionId}/dice-rolls`
- `POST /api/v1/sessions/{sessionId}/combat/start`
- `GET /api/v1/sessions/{sessionId}/combat`
- `GET /api/v1/sessions/{sessionId}/combat/character`
- `POST /api/v1/sessions/{sessionId}/combat/turn/end`

Swagger 수동 테스트 순서는 `codex/week05_manual_api_test_guide.md`에 정리되어 있습니다.

## 6. 검증 결과

완료한 검증:

- shared-types build 통과
- backend build 통과
- rules 관련 unit test 통과
- backend e2e test 통과
- Swagger 기준 REST API 수동 테스트 완료

제외한 검증:

- WebSocket 이벤트 수동 확인은 제외했습니다.

## 7. 다음 사람이 이어서 볼 부분

WebSocket까지 확인하려면 Socket.IO 클라이언트로 `/ws` namespace에 연결한 뒤 `session.join` 이벤트를 보내야 합니다.

확인할 이벤트는 아래 정도면 충분합니다.

- `action.accepted`
- `turn.log.created`
- `dice.rolled`
- `state.diff.applied`
- `combat.updated`
- `turn.changed`

Postman에서 로컬 주소가 막히는 경우가 있어, 필요하면 Node 기반 `socket.io-client`로 확인하는 편이 더 안정적입니다.
