# 개발 노트 - 2026-04-23 15:10

## 1. 문서 정보
- 작성 시각: 2026-04-23 15:10 (Asia/Seoul)
- 작성 목적: 현재 백엔드 구현 상태를 영속 캐릭터 모델 기준으로 정리하고, Session API / Character API의 실제 동작을 빠르게 공유하기 위함
- 기록 범위: `be`, `shared-types`, Prisma schema, e2e 테스트 기준 최신 구현

## 2. 이번 변경의 핵심
기존에는 Character가 세션에 종속된 엔티티처럼 구현되어 있었다.  
지금은 이 구조를 바꿔서 Character를 사용자 소유의 영속 엔티티로 두고, 세션 안에서의 플레이 상태는 별도 런타임 엔티티로 분리했다.

현재 모델은 아래와 같다.

- `Character`: 사용자 소유의 영속 캐릭터
- `Session`: 플레이 룸
- `SessionParticipant`: 세션 참가 사용자
- `SessionCharacter`: 특정 세션에서 사용 중인 캐릭터의 런타임 스냅샷

즉, 세션은 캐릭터를 "소유"하지 않는다.  
세션은 어떤 영속 캐릭터를 지금 사용 중인지 `SessionCharacter`로 참조하고 운용한다.

## 3. 현재 데이터 모델 요약

### 3.1 User
- 게스트 유저 생성 가능
- 여러 세션에 참가 가능
- 여러 영속 캐릭터를 가질 수 있음

### 3.2 Session
- 세션 제목, 설명, 공개 여부, 최대 인원, 초대 코드 등을 가짐
- 방장(`ownerUserId`)과 반장(`captainUserId`)을 가짐
- 현재는 `LOBBY`, `PLAYING`, `PAUSED`, `COMPLETED` 상태를 가짐

### 3.3 Character
- 사용자 소유 엔티티
- 세션과 직접 ownership 관계를 가지지 않음
- 세션 밖에서 미리 생성 가능
- 세션이 삭제되거나 완료되어도 삭제되지 않음

영속 필드 예시:
- 이름
- 종족
- 직업
- 레벨
- 능력치
- 숙련 보너스
- 숙련 스킬
- 최대 HP
- AC
- 속도
- 영속 인벤토리
- 장착 무기 ID

### 3.4 SessionCharacter
- 세션 안에서만 존재하는 런타임 상태
- 특정 `SessionParticipant`와 1:1
- 특정 영속 `Character`를 기반으로 생성
- 전투/플레이 도중 변하는 상태를 보관

런타임 필드 예시:
- 현재 HP
- 임시 HP
- 상태 이상
- 이니셔티브
- 세션 중 인벤토리 상태

## 4. 현재 적용된 캐릭터 라이프사이클 규칙

### 4.1 세션 밖 캐릭터 생성 가능
유저는 세션에 참가하기 전에도 캐릭터를 만들 수 있다.

### 4.2 세션 참가 후 기존 캐릭터 선택 가능
유저는 세션에 참가한 뒤, 자기 소유의 기존 캐릭터를 선택할 수 있다.

### 4.3 같은 캐릭터는 동시에 하나의 active session에서만 사용 가능
현재 active session은 아래 상태를 의미한다.

- `LOBBY`
- `PLAYING`
- `PAUSED`

즉, 어떤 캐릭터가 이미 위 상태의 다른 세션에 배정돼 있으면 새 세션에서 선택할 수 없다.

### 4.4 세션 삭제/완료 시 캐릭터는 유지
- lobby 세션 삭제: 세션만 삭제되고 캐릭터는 유지
- playing 세션 삭제: 실제 삭제 대신 `COMPLETED`로 종료 처리
- 세션 완료 후 캐릭터는 다시 selectable 상태가 된다

### 4.5 영속 진행도 반영은 아직 미구현
지금 구현된 것은 구조 분리와 선택 제약까지다.  
세션 종료 시 runtime progression을 base Character에 commit하는 별도 로직은 아직 없다.

## 5. 현재 구현된 Session API
모든 REST API는 `/api/v1` prefix를 사용한다.

### SESSION-001 `POST /api/v1/sessions`
- 세션 생성
- 방장은 생성한 사용자
- 참가자 1명(host) 자동 생성
- 초기 `GameState` 자동 생성

### SESSION-002 `GET /api/v1/sessions`
- 공개 상태의 대기 세션 목록 조회

### SESSION-003 `GET /api/v1/sessions/{sessionId}`
- 세션 상세 조회
- 응답에 포함:
  - `session`
  - `participants`
  - `sessionCharacters`
  - `state`
  - `scenario`
  - `owner`
  - `captain`

### SESSION-004 `POST /api/v1/sessions/{sessionId}/join`
- 세션 ID 기반 참가

### SESSION-005 `PATCH /api/v1/sessions/{sessionId}`
- 세션 제목, 설명, 최대 인원, 공개 여부, 상태 수정

### SESSION-006 `DELETE /api/v1/sessions/{sessionId}`
- `LOBBY`면 실제 삭제
- 진행 중 세션이면 `COMPLETED`로 종료 처리

### SESSION-007 `GET /api/v1/users/me/sessions`
- 현재 사용자가 참가 중인 세션 목록 조회

### SESSION-008 `POST /api/v1/sessions/{sessionId}/character-selection`
- persistent Character를 선택해서 SessionCharacter 생성/갱신
- 선택 성공 시 참가자와 런타임 캐릭터 상태가 연결됨

### SESSION-009 `PATCH /api/v1/sessions/{sessionId}/captain`
- 반장 지정 또는 변경

### SESSION-010 `POST /api/v1/sessions/join-by-invite`
- 초대 코드 기반 참가

### SESSION-011 `POST /api/v1/sessions/{sessionId}/resume`
- 기존 참가자의 재입장
- 현재는 접속 상태를 `ONLINE`으로 바꾸고 snapshot 반환

### SESSION-012 `GET /api/v1/sessions/{sessionId}/participants/status`
- 참가자 온라인/오프라인 상태 조회

### SESSION-013 `GET /api/v1/sessions/{sessionId}/invite`
- 초대 코드 및 공유 링크 정보 조회

## 6. 현재 구현된 Character API

### CHARACTER-001 `POST /api/v1/characters`
- 세션 밖에서 영속 캐릭터 생성

### CHARACTER-002 `GET /api/v1/users/me/characters`
- 내 영속 캐릭터 목록 조회
- 각 캐릭터 응답에 포함:
  - `activeSessionId`
  - `isSelectable`

### CHARACTER-003 `GET /api/v1/characters/{characterId}`
- 내 캐릭터 상세 조회

### CHARACTER-004 `PATCH /api/v1/characters/{characterId}`
- 내 캐릭터 수정

### CHARACTER-005 `DELETE /api/v1/characters/{characterId}`
- 내 캐릭터 삭제
- 단, active session에 배정된 캐릭터는 삭제 불가

### CHARACTER-006 `POST /api/v1/characters/{characterId}/clone`
- 기존 캐릭터 복제

### CHARACTER-007 `GET /api/v1/characters/{characterId}/inventory`
- 내 캐릭터 인벤토리 조회

### CHARACTER-008 `PATCH /api/v1/characters/{characterId}/equipment`
- 장착 무기 변경

### 세션 런타임 캐릭터 조회 `GET /api/v1/sessions/{sessionId}/characters`
- 세션 안에서 사용 중인 `SessionCharacter` 목록 조회
- 영속 Character 목록이 아니라 런타임 캐릭터 목록임

## 7. 응답 구조에서 바뀐 중요한 점
이전 구조에서는 세션 스냅샷에 `characters`가 들어갔다.  
지금은 세션 스냅샷에 `sessionCharacters`가 들어간다.

즉 프론트나 Swagger 확인 시 아래처럼 이해해야 한다.

- `GET /users/me/characters`
  - 영속 캐릭터 목록
- `GET /sessions/{id}/characters`
  - 해당 세션 안에서 실제로 사용 중인 런타임 캐릭터 목록
- `GET /sessions/{id}`
  - `sessionCharacters` 포함

## 8. WebSocket 관련 현재 상태
네임스페이스:
- `/ws`

현재 이벤트:
- `session.join`
- `session.snapshot`
- `participant.updated`
- `character.updated`
- `session.status.updated`

의미:
- `session.snapshot`: 세션 전체 상태
- `character.updated`: 영속 Character가 아니라 `SessionCharacter` 변경 이벤트

## 9. 현재 제약 및 미구현 항목
- 정식 인증/JWT 없음
- 여전히 임시로 `x-user-id` 헤더 사용
- 세션 종료 시 runtime state를 base Character에 반영하는 commit 로직 없음
- 전투/주사위/행동 로그/AI 호출 로직 없음
- 오프라인 전환 트리거나 heartbeat 기반 상태 갱신 없음

## 10. 주요 파일 위치

### Prisma
- `be/prisma/schema.prisma`

### Session 로직
- `be/src/modules/sessions/sessions.controller.ts`
- `be/src/modules/sessions/sessions.service.ts`

### Character 로직
- `be/src/modules/characters/characters.controller.ts`
- `be/src/modules/characters/characters.service.ts`

### 공통 매퍼
- `be/src/common/mappers/domain.mapper.ts`

### 공통 DTO
- `shared-types/src/dto/api/sessions.dto.ts`
- `shared-types/src/dto/api/characters.dto.ts`
- `shared-types/src/dto/ws/session-events.dto.ts`

### e2e 테스트
- `be/test/app.e2e-spec.ts`

## 11. 실행 및 확인 방법

### 11.1 DB 반영
스키마가 바뀌었기 때문에 한 번은 DB를 갱신해야 한다.

```bash
npm run prisma:push
```

### 11.2 서버 실행
```bash
npm run dev
```

Swagger:

```text
http://localhost:3000/docs
```

### 11.3 테스트
```bash
npm run test:e2e
```

현재 e2e에서 검증하는 흐름:
- 세션 밖 캐릭터 생성
- 내 캐릭터 목록/상세 조회
- 인벤토리/장비 변경
- 캐릭터 복제
- 세션 생성/참가
- persistent Character 선택 후 SessionCharacter 생성
- 동일 캐릭터의 다른 active session 선택 차단
- active assignment 상태에서 캐릭터 삭제 차단
- 세션 완료 후 다시 selectable 상태 복구
- 세션 삭제 후에도 persistent Character 유지

## 12. 다음 작업으로 자연스럽게 이어지는 항목
- 세션 종료 시 `SessionCharacter -> Character` progression commit API
- SessionCharacter 런타임 수정 API
- 턴 로그 및 행동 입력 API
- AI/GM 연계 전에 runtime state diff 설계
- 프론트에서 `sessionCharacters` 기준 렌더링으로 정합성 맞추기
