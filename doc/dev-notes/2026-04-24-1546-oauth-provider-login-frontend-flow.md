# 개발 노트 - 2026-04-24 15:46

## 1. 문서 정보
- 작성 시각: 2026-04-24 15:46 (Asia/Seoul)
- 작성 목적: 카카오/디스코드 OAuth 실제 로그인 연동, 프론트 로그인 화면 분리, 로비 목록 렌더링 오류 수정 내용을 공유하기 위함
- 기준 문서:
  - Notion `기능정의서` 회원가입/로그인
  - Notion `API 명세서` USER-008 ~ USER-011
  - `codex/member-session-spec.md`

## 2. 변경 요약
기존 OAuth 로그인은 provider code를 로컬 mock 값처럼 처리했다. 이번 변경에서는 카카오와 디스코드 모두 authorization code를 백엔드에서 access token으로 교환하고, provider 사용자 정보를 조회한 뒤 우리 서비스 회원 및 소셜 계정으로 저장하도록 확장했다.

프론트는 로그인/로비/플레이 화면과 인증/세션 상태 로직을 분리했다. 이 과정에서 새 세션 목록 API 응답 형태와 로비 화면의 기대 타입이 달라 새로고침 후 검은 화면이 발생했는데, 프론트 타입과 렌더링 코드를 현재 백엔드 응답에 맞춰 수정했다.

## 3. 백엔드 변경

### 3.1 카카오 OAuth 실제 연동
- `GET /api/v1/users/oauth/kakao/url`
  - `KAKAO_REST_API_KEY`를 사용해 카카오 인가 URL을 생성한다.
- `POST /api/v1/users/oauth/kakao/login`
  - `https://kauth.kakao.com/oauth/token`으로 authorization code를 access token으로 교환한다.
  - `https://kapi.kakao.com/v2/user/me`로 카카오 사용자 정보를 조회한다.
  - `kakaoUser.id`를 `SocialAccount.providerUserId`로 저장한다.

저장 규칙:
- `User.authProvider = KAKAO`
- `SocialAccount.provider = KAKAO`
- `SocialAccount.providerUserId = 카카오 사용자 id`
- 이메일은 카카오 계정에서 이메일 동의, 유효, 인증 조건을 만족할 때만 저장한다.
- 표시 이름은 카카오 profile nickname을 우선 사용한다.

### 3.2 디스코드 OAuth 실제 연동
- `GET /api/v1/users/oauth/discord/url`
  - `DISCORD_CLIENT_ID`를 사용한다.
  - scope는 `identify email`을 요청하며, URL query에서는 `scope=identify+email` 형태가 된다.
- `POST /api/v1/users/oauth/discord/login`
  - `https://discord.com/api/v10/oauth2/token`으로 authorization code를 access token으로 교환한다.
  - `https://discord.com/api/v10/users/@me`로 디스코드 사용자 정보를 조회한다.
  - `discordUser.id`를 `SocialAccount.providerUserId`로 저장한다.

저장 규칙:
- `User.authProvider = DISCORD`
- `SocialAccount.provider = DISCORD`
- `SocialAccount.providerUserId = 디스코드 사용자 id`
- 이메일은 Discord email scope 응답이 있고 `verified !== false`일 때만 저장한다.
- 표시 이름은 `global_name`, `username`, fallback 순서로 사용한다.

### 3.3 환경변수
백엔드 `.env` 기준으로 아래 값이 필요하다.

```env
KAKAO_REST_API_KEY=카카오_REST_API_KEY
KAKAO_CLIENT_SECRET=카카오_CLIENT_SECRET

DISCORD_CLIENT_ID=Discord_앱의_CLIENT_ID
DISCORD_CLIENT_SECRET=Discord_CLIENT_SECRET
```

`.env.example`과 `be/.env.example`도 위 변수명 기준으로 정리했다.

### 3.4 CORS
OAuth 로그인 후 refresh token cookie를 주고받기 위해 백엔드 CORS 설정에서 credentials를 허용했다.

```ts
app.enableCors({
  origin: true,
  credentials: true,
});
```

## 4. 프론트 변경

### 4.1 화면/로직 분리
기존 `App.tsx`에 모여 있던 화면과 상태 로직을 아래 파일로 분리했다.

- `fe/src/hooks/useAuth.ts`
- `fe/src/hooks/useSession.ts`
- `fe/src/hooks/useLogs.ts`
- `fe/src/pages/LoginPage.tsx`
- `fe/src/pages/LobbyPage.tsx`
- `fe/src/pages/PlayPage.tsx`
- `fe/src/components/Sidebar.tsx`
- `fe/src/components/LogPanel.tsx`
- `fe/src/components/BattleMap.tsx`
- `fe/src/components/Icon.tsx`

프론트 원칙에 맞춰 JSX는 화면 표시와 사용자 인터랙션에 집중하고, API 호출과 상태 변경은 hook/service 계층으로 옮겼다.

### 4.2 OAuth 콜백 처리
- 프론트는 로그인 버튼 클릭 시 현재 origin 기준으로 `redirectUri = {origin}/oauth/callback`을 만든다.
- provider 정보는 콜백 전후 식별을 위해 `localStorage`에 임시 저장한다.
- `/oauth/callback?code=...`로 돌아오면 백엔드 OAuth login API를 호출해 우리 서비스 access token과 user 정보를 저장한다.

### 4.3 로비 검은 화면 수정
증상:
- 새로고침 후 로비가 잠깐 보였다가 검은 배경만 남았다.

원인:
- 백엔드 세션 목록 API는 현재 `sessionId`, `title`, `scenarioTitle`, `currentPlayers`, `maxPlayers`, `status`처럼 평평한 구조를 반환한다.
- 프론트 로비는 예전 DTO 구조인 `item.session.id`, `item.scenario.title`, `item.session.maxPlayers`를 읽고 있었다.
- 세션 목록 응답이 도착한 직후 `item.session`이 `undefined`가 되어 React 런타임 에러가 발생했다.

조치:
- `AvailableSessionListItem` 타입을 추가했다.
- `listSessions` 반환 타입을 현재 백엔드 page 응답에 맞췄다.
- `LobbyPage` 렌더링을 `item.sessionId`, `item.scenarioTitle`, `item.currentPlayers`, `item.maxPlayers`, `item.status` 기준으로 변경했다.
- 오래된 저장 스냅샷에 `state`가 없을 때도 죽지 않도록 `snapshot?.state?.phase`로 방어했다.

## 5. 검증

실행한 검증:

```bash
npm run build -w @trpg/shared-types
npm run build -w @trpg/be
npm run test:e2e -w @trpg/be
npm run build -w @trpg/fe
```

확인 결과:
- 백엔드 빌드 성공
- 프론트 빌드 성공
- e2e 5개 통과
  - 회원 auth token 플로우
  - 카카오 authorization code 교환 및 provider user 저장
  - 디스코드 authorization code 교환 및 provider user 저장
  - 영속 캐릭터/세션 캐릭터 선택 플로우
  - 로비 세션 삭제 후 영속 캐릭터 유지
- 사용자 수동 확인으로 카카오, 디스코드 정상 로그인 완료

참고:
- Windows 환경에서 Prisma generate 중 `query_engine-windows.dll.node` rename 경고가 한 번 출력됐지만 테스트 자체는 정상 통과했다.

## 6. 주의점
- 실제 OAuth provider access token과 refresh token은 현재 DB에 저장하지 않는다. 우리 서비스 로그인 처리 후 자체 JWT와 refresh token cookie만 사용한다.
- `providerUserId`는 API 응답 DTO에는 노출하지 않고 `SocialAccount` 테이블에만 저장한다.
- `.claude/settings.local.json`은 로컬 도구 권한 설정이므로 일반 기능 커밋에서는 제외하는 편이 안전하다.
