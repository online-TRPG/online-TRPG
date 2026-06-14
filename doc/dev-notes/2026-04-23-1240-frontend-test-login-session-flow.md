
---

# 추가 개발일지 - 2026-04-23 프론트 게스트 테스트 화면

## 15. 이번 추가 작업 한 줄 요약
Postman이나 Swagger만 쓰지 않아도 브라우저에서 게스트 로그인, 세션 생성, 초대 코드 참가, 캐릭터 생성, WebSocket 이벤트 수신을 확인할 수 있는 프론트엔드 화면을 추가했다.

## 16. 왜 이 작업을 추가했는가
현재 백엔드는 정식 로그인/인프라 없이 `x-user-id` 기반 게스트 사용자로 동작한다.

그래서 프론트도 정식 ID/PW, 카카오, 디스코드 로그인을 바로 붙이기보다 아래 방식으로 먼저 확인할 수 있게 했다.

1. 닉네임을 입력한다.
2. `POST /users/guest`로 게스트 유저를 만든다.
3. 응답으로 받은 `user.id`를 브라우저 `localStorage`에 저장한다.
4. 이후 API 요청마다 `x-user-id` 헤더에 저장된 user id를 넣는다.
5. 로그아웃은 `localStorage`에 저장한 게스트 상태를 지운다.

즉, 지금의 로그인/로그아웃은 "정식 인증"이 아니라 "개발용 게스트 인증 상태"라고 보면 된다.

## 17. 추가된 주요 파일

### 루트 설정
- `package.json`
  - `fe` workspace 추가
  - `dev:be`, `dev:fe` 스크립트 추가
  - 전체 `build`가 `shared-types -> be -> fe` 순서로 확인되도록 변경
- `package-lock.json`
  - 프론트 workspace 의존성 반영

### 프론트엔드 패키지
- `fe/package.json`
- `fe/index.html`
- `fe/tsconfig.json`
- `fe/vite.config.ts`
- `fe/src/main.tsx`

### 프론트 앱 코드
- `fe/src/app/App.tsx`
  - 게스트 로그인 화면
  - 로비 화면
  - 세션 생성/참가 폼
  - 캐릭터 생성 폼
  - 플레이 화면 형태의 세션 상태/로그 화면
- `fe/src/services/api.ts`
  - REST API 호출
  - 기본 API 주소: `http://localhost:3000`
  - 배포/서버 테스트 시 `VITE_API_BASE_URL`로 교체 가능
- `fe/src/services/realtime.ts`
  - Socket.IO WebSocket 연결
  - `/ws` namespace 연결
  - `session.join`, `session.snapshot`, `participant.updated`, `character.updated` 처리
- `fe/src/services/storage.ts`
  - 게스트 유저와 현재 세션 snapshot을 `localStorage`에 저장/삭제
- `fe/src/types/session.ts`
  - 프론트에서 쓰는 세션 관련 타입 별칭
- `fe/src/styles/global.css`
  - 로그인, 로비, 세션 화면 스타일

## 18. 설치와 실행 방법

중요:

- `fe` 폴더 안에서 따로 `npm install` 하지 않는다.
- 이 레포는 npm workspace 구조이므로 프로젝트 루트에서만 설치한다.

프로젝트 루트에서 1회:

```powershell
npm.cmd install
```

백엔드 실행:

```powershell
npm.cmd run dev:be
```

프론트 실행:

```powershell
npm.cmd run dev:fe
```

브라우저 접속:

```text
http://localhost:5173
```

백엔드 Swagger:

```text
http://localhost:3000/docs
```

전체 빌드 확인:

```powershell
npm.cmd run build
```

이 명령은 현재 아래 순서로 실행된다.

1. `shared-types` 빌드
2. `be` 빌드
3. `fe` 빌드

## 19. 프론트 화면으로 현재 확인 가능한 것

### 19.1 게스트 로그인
- 화면에서 닉네임 입력
- `POST /users/guest` 호출
- 응답으로 받은 `user.id`를 `localStorage`에 저장
- 이후 요청에 `x-user-id` 헤더 자동 포함

### 19.2 세션 생성
- 로비 화면에서 세션 제목 입력 후 세션 만들기
- `POST /sessions` 호출
- 세션, 방장 participant, gameState 생성 확인
- 응답 snapshot을 화면에 저장/표시
- 초대 코드 표시

### 19.3 초대 코드로 세션 참가
- 다른 브라우저 또는 시크릿 창에서 새 닉네임으로 게스트 로그인
- 기존 세션의 초대 코드 입력
- `POST /sessions/join` 호출
- 같은 세션 participant가 2명 이상으로 늘어나는지 확인

### 19.4 WebSocket snapshot 수신
- 세션이 선택되면 `/ws` namespace에 연결
- 연결 후 `session.join` 이벤트 발행
- 서버에서 `session.snapshot` 이벤트 수신
- 참가자, 캐릭터, 상태 정보를 화면에 반영

### 19.5 참가자 변경 이벤트
- 두 번째 사용자가 초대 코드로 참가하면 기존 사용자 화면에 `participant.updated` 이벤트가 들어온다.
- 화면의 로그와 참가자 수로 확인할 수 있다.

### 19.6 캐릭터 생성과 변경 이벤트
- 세션 참가자는 캐릭터를 만들 수 있다.
- `POST /characters` 호출
- 같은 세션을 보고 있는 다른 브라우저에 `character.updated` 이벤트가 들어온다.
- 화면의 로그와 캐릭터 목록으로 확인할 수 있다.

## 20. 추천 수동 테스트 시나리오

가장 쉬운 확인 방법은 브라우저 2개를 쓰는 것이다.

1. 일반 브라우저에서 `http://localhost:5173` 접속
2. `Alice` 같은 닉네임으로 게스트 입장
3. 로비에서 세션 만들기
4. 화면에 표시된 초대 코드 복사
5. 시크릿 창에서 `http://localhost:5173` 접속
6. `Bob` 같은 다른 닉네임으로 게스트 입장
7. 초대 코드로 참가
8. 첫 번째 브라우저에서 참가자 변경 로그가 들어오는지 확인
9. 두 번째 브라우저에서 캐릭터 생성
10. 첫 번째 브라우저에서 캐릭터 변경 로그가 들어오는지 확인

이 흐름이 되면 아래 백엔드 기능은 브라우저 기준으로 확인된 것이다.

- 게스트 유저 생성
- `x-user-id` 임시 인증 흐름
- 세션 생성
- 초대 코드 참가
- 세션 participant 조회/반영
- 캐릭터 생성
- WebSocket room 입장
- snapshot 이벤트 수신
- participant/character 변경 이벤트 수신

## 21. 아직 안 되는 것

아래는 화면에 일부 모양이 있어도 아직 실제 백엔드 기능으로 연결되어 있지 않다.

- 정식 ID/PW 로그인
- 카카오 로그인
- 디스코드 로그인
- JWT, refresh token, 세션 쿠키
- DB 기반 "내가 참가한 세션 목록" 조회
- 전체 공개 세션 목록 조회
- 실제 게임 턴 진행
- 행동 버튼 클릭 시 gameState 변경
- 주사위 판정 저장
- 채팅/명령어 저장
- AI GM 응답
- 맵 토큰 위치 동기화
- 전투/이동/피해 처리
- 로그 영속화

즉, 지금 프론트는 "두 사람이 같은 세션에 들어와 참가자/캐릭터 상태와 WebSocket 이벤트를 공유하는 것"까지 확인할 수 있다.

하지만 "두 사람이 같은 전투 맵에서 토큰을 움직이고, 행동 결과가 서버 gameState에 반영되는 실제 게임 플레이"는 아직 구현되지 않았다.

## 22. 현재 확인 결과

2026-04-23 기준 확인한 내용:

- `npm.cmd run build` 성공
- `http://localhost:5173` 응답 확인
- `GET http://localhost:3000/scenarios` 응답 확인
- `npm.cmd run dev:be` 실행 시 백엔드 정상 기동 확인
- `npm.cmd run dev:fe` 실행 시 Vite 프론트 정상 기동 확인

주의:

- `npm.cmd run test:e2e`는 Prisma schema engine 단계에서 실패한 적이 있다.
- 처음에는 Prisma engine 다운로드 문제였고, 네트워크/실행 승인 후에도 `Schema engine error`만 출력되고 중단됐다.
- 프론트 추가 작업 자체의 빌드는 성공했지만, e2e 환경은 별도로 한 번 더 정리할 필요가 있다.

## 23. 이어서 하기 좋은 작업

우선순위가 높은 순서:

1. 프론트에서 세션 생성/참가/캐릭터 생성 수동 테스트를 실제 브라우저 2개로 확인
2. 공백 닉네임, 공백 세션 제목, 공백 캐릭터명 저장 방지
3. 중복 join 시 `participant.updated` 이벤트를 항상 보낼지, 새 참가자일 때만 보낼지 정책 정리
4. "내 세션 목록" API 추가
5. 세션 상태 변경 API 추가
6. 행동 입력/게임 로그 저장 API 추가
7. 주사위 판정 API 또는 룰 엔진 연결
8. AI 호출 계층 연결
9. 정식 인증 방식 결정

정식 인증을 붙이기 전까지는 현재 프론트의 게스트 로그인 방식을 유지하면 된다.
