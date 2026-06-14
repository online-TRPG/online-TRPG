# 개발일지 - 2026-04-22 16:30

## 1. 문서 정보
- 작성 시각: 2026-04-22 16:30 (Asia/Seoul)
- 작성 목적: 팀원이 현재 백엔드 진행 상황을 빠르게 이해하고, 같은 환경에서 바로 실행·확인할 수 있도록 공유하기 위함
- 기록 범위: 게스트 유저 생성 -> 세션 생성/참가 -> 캐릭터 생성/수정 -> 세션 상태 조회 -> WebSocket 스냅샷 구독까지의 백엔드 구현
- 파일명 규칙 제안: 앞으로도 `YYYY-MM-DD-HHMM-주제.md` 형식으로 계속 누적 기록하면 시간순으로 찾기 쉽다.

## 2. 이번 작업 한 줄 요약
AI나 인프라 연동 없이도, 여러 사용자가 같은 세션에 들어오고 캐릭터를 만들고 현재 상태를 조회하며 실시간 스냅샷을 받을 수 있는 백엔드 기본 흐름을 구현했다.

## 3. 왜 이 작업을 먼저 만들었는가
지금 필요한 것은 "전체 서비스가 어디까지 연결되는지"를 눈으로 확인할 수 있는 가장 작은 단위의 완성 흐름이다.

이 흐름이 있으면 다음이 가능해진다.

- 프론트엔드 팀은 실제로 호출 가능한 API와 실시간 이벤트를 기준으로 화면을 붙일 수 있다.
- 백엔드 팀은 이후 인증, 턴 처리, AI, 로그, 인프라를 붙일 때도 기본 세션 구조를 다시 흔들지 않아도 된다.
- 팀 전체가 "현재 서버가 어디까지 되는지"를 Swagger와 테스트로 바로 확인할 수 있다.

## 4. 이번에 실제로 구현한 내용

### 4.1 백엔드 기본 구조
- `be` 폴더에 NestJS 기반 서버를 구성했다.
- `shared-types` 패키지를 만들어 DTO와 응답 타입을 공통으로 관리하도록 잡았다.
- Prisma + SQLite 기반으로 초기 개발 환경을 구성했다.
- Swagger 문서를 `/docs` 경로에서 열 수 있게 했다.
- 전역 ValidationPipe와 공통 HTTP 예외 필터를 연결했다.

### 4.2 데이터 흐름
현재 서버는 아래 순서로 동작한다.

1. 게스트 유저를 만든다.
2. `x-user-id` 헤더로 사용자를 식별한다.
3. 세션을 만든다.
4. 다른 사용자가 초대 코드로 같은 세션에 참가한다.
5. 참가한 사용자가 캐릭터를 만든다.
6. 세션 참가자, 캐릭터, 현재 상태를 조회한다.
7. WebSocket으로 세션 방에 들어오면 현재 스냅샷을 한 번 받고, 이후 변경 이벤트를 받는다.

### 4.3 구현된 API

#### 사용자
- `POST /users/guest`
- 설명: 게스트 사용자를 만든다. 지금은 정식 로그인 대신 이 방식으로 테스트한다.

#### 세션
- `POST /sessions`
- 설명: 세션을 만들고, 세션 생성자도 자동으로 참가자로 등록한다.

- `POST /sessions/join`
- 설명: 초대 코드로 기존 세션에 참가한다.

- `GET /sessions/:id`
- 설명: 세션 기본 정보를 조회한다.

- `GET /sessions/:id/participants`
- 설명: 세션 참가자 목록을 조회한다.

- `GET /sessions/:id/state`
- 설명: 현재 세션 상태를 조회한다.

#### 캐릭터
- `POST /characters`
- 설명: 세션 안에서 캐릭터를 생성한다.

- `GET /sessions/:id/characters`
- 설명: 세션에 속한 캐릭터 목록을 조회한다.

- `PATCH /characters/:id`
- 설명: 캐릭터 주인만 자신의 캐릭터를 수정할 수 있다.

#### 시나리오
- `GET /scenarios`
- 설명: 현재 사용할 수 있는 시나리오 목록을 조회한다.

- `GET /scenarios/:id`
- 설명: 특정 시나리오 상세를 조회한다.

### 4.4 WebSocket 실시간 기능
- 네임스페이스: `/ws`
- 입장 이벤트: `session.join`
- 최초 스냅샷 이벤트: `session.snapshot`
- 참가자 변경 이벤트: `participant.updated`
- 캐릭터 변경 이벤트: `character.updated`
- 세션 상태 변경 이벤트 이름도 준비해두었지만, 실제 게임 상태 변경 로직은 아직 최소 범위만 구현했다.

쉽게 말하면 다음과 같다.

- REST API는 "요청하면 응답 1번 받는 방식"이다.
- WebSocket은 "한 번 연결해두고 서버가 바뀐 내용을 계속 밀어주는 방식"이다.

지금 구현에서는 사용자가 세션 방에 들어오면 현재 전체 상태를 한 번에 받고, 이후 참가자나 캐릭터가 바뀌면 변경 이벤트를 받는다.

### 4.5 시드 데이터
- 서버가 켜질 때 기본 시나리오를 자동으로 넣도록 구성했다.
- 기본 시나리오 ID: `scenario_goblin_cave`
- 시작 노드 ID: `node_cave_entrance`

즉, 처음 서버를 띄운 뒤 별도 데이터 준비 없이도 세션 생성 API를 바로 호출할 수 있다.

### 4.6 테스트
- e2e 테스트를 추가했다.
- e2e는 `end-to-end`의 줄임말이다.
- 뜻은 "처음부터 끝까지 실제 사용 흐름 전체가 되는지 확인하는 테스트"라고 이해하면 된다.

현재 e2e 테스트는 아래를 검증한다.

- 게스트 유저 생성
- 세션 생성
- 다른 유저의 세션 참가
- 중복 참가 방지
- 캐릭터 생성
- 세션 상태 조회
- WebSocket 스냅샷 수신
- WebSocket 참가자/캐릭터 변경 이벤트 수신
- 다른 유저가 남의 캐릭터를 수정하지 못하도록 차단

## 5. 주요 파일 위치

### 백엔드 서버
- `be/src/main.ts`
- 역할: 서버 시작, Swagger 설정, 전역 validation/예외 처리 연결

### 세션 로직
- `be/src/modules/sessions/sessions.controller.ts`
- `be/src/modules/sessions/sessions.service.ts`
- 역할: 세션 생성, 참가, 조회, 상태 조회, 스냅샷 조립

### 캐릭터 로직
- `be/src/modules/characters/characters.controller.ts`
- `be/src/modules/characters/characters.service.ts`
- 역할: 캐릭터 생성, 조회, 수정

### 사용자 로직
- `be/src/modules/users/users.controller.ts`
- `be/src/modules/users/users.service.ts`
- 역할: 게스트 사용자 생성

### 실시간 로직
- `be/src/modules/realtime/realtime.gateway.ts`
- `be/src/modules/realtime/realtime-events.service.ts`
- 역할: WebSocket 연결, 세션 room 입장, snapshot/event 발행

### DB 및 시드
- `be/prisma/schema.prisma`
- `be/prisma/seed.ts`
- `be/src/database/seed/default-scenario.ts`
- 역할: DB 스키마와 기본 시나리오 데이터 관리

### 공통 타입
- `shared-types/src`
- 역할: API 요청/응답 DTO와 공통 타입 관리

### 테스트
- `be/test/app.e2e-spec.ts`
- 역할: 실제 사용자 흐름을 처음부터 끝까지 검증

## 6. 설치 및 실행 방법

### 6.1 처음 받았을 때 1회만 하면 되는 것
프로젝트 루트에서 아래 순서대로 실행하면 된다.

```powershell
Set-Location C:\Users\SSAFY\Desktop\my_git\S14P31A201
```

```powershell
npm.cmd install
```

```powershell
npm.cmd run prisma:generate
```

```powershell
npm.cmd run prisma:push
```

설명:

- `npm.cmd install`: 필요한 패키지를 설치한다.
- `prisma:generate`: Prisma가 사용할 DB 클라이언트 코드를 만든다.
- `prisma:push`: 현재 Prisma 스키마를 SQLite DB에 반영한다.

### 6.2 개발 서버 실행

```powershell
Set-Location C:\Users\SSAFY\Desktop\my_git\S14P31A201
npm.cmd run dev
```

서버가 정상적으로 뜨면 Swagger 문서를 아래 주소에서 볼 수 있다.

```text
http://localhost:3000/docs
```

### 6.3 빌드 확인
코드가 타입 기준으로 정상인지 확인할 때는 아래 명령을 사용한다.

```powershell
Set-Location C:\Users\SSAFY\Desktop\my_git\S14P31A201
npm.cmd run build
```

이 명령은 다음 두 가지를 순서대로 확인한다.

- `shared-types` 빌드
- `be` 빌드

즉, 공통 타입과 백엔드 서버가 함께 빌드에 성공해야 한다.

## 7. 환경변수
예시는 `be/.env.example`에 정리되어 있다.

현재 주요 항목은 아래와 같다.

- `PORT=3000`
- `DATABASE_URL="file:./dev.db"`
- `AI_PROVIDER="google-ai-studio"`
- `AI_TIMEOUT_MS=30000`
- `GOOGLE_API_KEY=""`
- `AI_MODEL_INTERPRETER="gemma-4-31b-it"`
- `AI_MODEL_NARRATOR="gemma-4-31b-it"`
- `AI_MODEL_ACTOR="gemma-4-31b-it"`
- `AI_MODEL_DIRECTOR="gemma-4-31b-it"`
- `AI_MODEL_SUMMARIZER="gemma-4-31b-it"`
- `OLLAMA_BASE_URL="http://localhost:11434"`

중요:

- 현재 구현 범위에서는 AI 기능을 실제로 호출하지 않는다.
- 하지만 최신 설계 문서 기준에 맞춰 AI 관련 환경변수 예시는 미리 정리해두었다.
- 실제 API 키는 커밋하면 안 된다.

## 8. 가장 쉬운 확인 방법

### 8.1 자동 확인: e2e 테스트
가장 쉬운 방법은 아래 명령 하나를 실행하는 것이다.

```powershell
Set-Location C:\Users\SSAFY\Desktop\my_git\S14P31A201
npm.cmd run test:e2e
```

이 테스트가 통과하면 최소한 아래 흐름은 정상이라고 봐도 된다.

- 사용자 생성
- 세션 생성
- 세션 참가
- 캐릭터 생성
- 상태 조회
- WebSocket 이벤트 수신

### 8.2 수동 확인: Swagger
직접 API를 눌러보려면 Swagger를 사용하면 된다.

1. `npm.cmd run dev`로 서버를 실행한다.
2. `http://localhost:3000/docs`에 들어간다.
3. 먼저 `POST /users/guest`로 사용자를 만든다.
4. 응답으로 받은 `id`를 기억한다.
5. Swagger 우측 상단 `Authorize` 버튼을 누른다.
6. `x-user-id` 값으로 방금 받은 `id`를 넣는다.
7. 이후 세션/캐릭터 API를 호출한다.

### 8.3 추천 수동 확인 순서

#### 1) 게스트 사용자 생성
- API: `POST /users/guest`
- 예시 body:

```json
{
  "displayName": "Alice"
}
```

성공하면 사용자 `id`가 나온다. 이 값이 이후 `x-user-id` 헤더에 들어간다.

#### 2) 세션 생성
- API: `POST /sessions`
- 헤더: `x-user-id = 방금 만든 사용자 id`
- 예시 body:

```json
{
  "title": "Goblin Cave"
}
```

성공하면 응답 안에 아래 값이 들어 있다.

- `session.id`
- `session.inviteCode`
- `state.version`
- `state.currentNodeId`

#### 3) 두 번째 사용자 생성
- 다시 `POST /users/guest` 호출
- 예시 body:

```json
{
  "displayName": "Bob"
}
```

#### 4) 두 번째 사용자 세션 참가
- API: `POST /sessions/join`
- 헤더: 두 번째 사용자 `x-user-id`
- 예시 body:

```json
{
  "inviteCode": "ABC123"
}
```

설명:

- 여기서 `inviteCode`는 세션 생성 응답에 들어 있던 실제 초대 코드를 넣어야 한다.
- 성공하면 `participants` 길이가 2가 되어야 한다.

#### 5) 캐릭터 생성
- API: `POST /characters`
- 헤더: 세션에 참가한 사용자의 `x-user-id`
- 예시 body:

```json
{
  "sessionId": "세션ID",
  "name": "Lia",
  "ancestry": "Human",
  "className": "Rogue"
}
```

#### 6) 참가자, 캐릭터, 상태 조회
- `GET /sessions/{id}/participants`
- `GET /sessions/{id}/characters`
- `GET /sessions/{id}/state`

기대 결과:

- 참가자 목록에는 2명이 보여야 한다.
- 캐릭터 목록에는 방금 만든 캐릭터가 보여야 한다.
- 상태 조회에서는 `version = 1`이 보여야 한다.

## 9. WebSocket을 아주 쉽게 설명하면
WebSocket은 서버와 클라이언트가 연결을 계속 유지한 채로, 바뀐 내용을 바로 주고받는 방식이다.

이 프로젝트에서는 이렇게 사용한다.

1. 사용자가 `/ws`로 연결한다.
2. `session.join` 이벤트로 어느 세션 방에 들어갈지 알려준다.
3. 서버가 `session.snapshot`으로 현재 전체 상태를 한 번 내려준다.
4. 이후 누가 참가하거나 캐릭터를 만들면 관련 이벤트를 다시 내려준다.

즉, 처음에는 "전체 현재 상태"를 받고, 그 다음부터는 "변경된 부분"만 받는 구조다.

## 10. 자주 헷갈릴 수 있는 부분

### `x-user-id` 입력칸이 안 보이는 경우
Swagger에서는 매 API마다 헤더 입력칸이 따로 뜨지 않을 수 있다.

이때는 아래처럼 하면 된다.

1. 우측 상단 `Authorize` 클릭
2. `x-user-id` 입력
3. Authorize 적용

### `POST /sessions`가 400 에러가 나는 경우
주로 아래 둘 중 하나다.

- `x-user-id`를 넣지 않았다.
- JSON body 형식이 잘못됐다. 예를 들어 마지막 쉼표가 남아 있으면 실패한다.

정상 예시는 아래다.

```json
{
  "title": "Goblin Cave Run"
}
```

### join 했는데 참가자 수가 그대로 1명인 경우
가장 먼저 확인할 것은 `x-user-id`가 정말 다른 사용자인지다.

현재 로직은 같은 사용자가 다시 `join`을 눌러도 중복 participant를 만들지 않도록 되어 있다.
즉, 같은 사용자 ID로 다시 join 하면 참가자 수는 늘지 않는 것이 정상이다.

## 11. 이번 구현에서 아직 하지 않은 것
아래는 아직 의도적으로 제외한 범위다.

- 정식 로그인/인증
- AI 호출
- 턴 처리
- 주사위 판정
- StateDiff 적용 엔진
- 로그 저장
- 인프라 배포
- PostgreSQL 전환

즉, 지금은 "세션과 캐릭터 흐름이 실제로 연결되는가"를 먼저 확인하는 단계라고 보면 된다.

## 12. 현재 기준으로 바로 이어서 하기 좋은 다음 작업
- 정식 인증 전 도입 전까지 사용할 임시 사용자 정책 정리
- 세션 상태 변경 API 추가
- 턴 입력/행동 로그 저장 구조 추가
- 주사위/판정 엔진 연결
- AI 호출 계층과 Provider 추상화 연결
- 프론트엔드에서 Swagger 대신 실제 화면으로 호출 시작

## 13. 최종 확인 체크리스트
아래 4개가 되면 현재 백엔드 기본 흐름은 정상이라고 판단해도 된다.

1. `npm.cmd run build`가 성공한다.
2. `npm.cmd run test:e2e`가 성공한다.
3. Swagger에서 게스트 유저 생성 -> 세션 생성 -> 참가 -> 캐릭터 생성이 된다.
4. 세션 참가자/캐릭터/상태 조회 결과가 예상대로 나온다.

## 14. 비고
- 이 문서는 팀 공유용 개발일지다.
- 이후에도 같은 폴더에 같은 파일명 규칙으로 계속 쌓아가면, 어떤 시점에 무엇이 구현됐는지 추적하기 쉬워진다.
- 추후 큰 변경이 생기면 "무엇이 바뀌었는지", "실행 방법이 달라졌는지", "기존 확인 방법이 그대로 유효한지"를 함께 적는 것을 권장한다.
