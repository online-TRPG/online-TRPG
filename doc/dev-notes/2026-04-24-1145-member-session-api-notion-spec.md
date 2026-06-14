# 개발 노트 - 2026-04-24 11:45

## 1. 문서 정보
- 작성 시각: 2026-04-24 11:45 (Asia/Seoul)
- 작성 목적: Notion API 목표 명세 기준으로 구현한 회원/세션 관리 변경 내용을 공유하고, 로컬 실행 및 테스트 방법을 남기기 위함
- 기록 범위: `be`, `shared-types`, `fe`, Prisma schema, e2e 테스트
- 기준 문서:
  - Notion `API 명세서`
  - Notion `API 명세서-RESTful`
  - 로컬 정리본 `codex/member-session-spec.md`

## 2. 이번 변경 한 줄 요약
기존 개발용 게스트/x-user-id 중심 흐름을 유지하면서, 회원/세션 API를 Notion 목표 명세의 JWT 인증, refresh token cookie, 공통 응답 envelope, 세션 생성/목록 필드 기준에 맞춰 확장했다.

## 3. 핵심 구현 내용

### 3.1 공통 응답 포맷
회원/세션 API는 아래 형태를 기준으로 응답한다.

```json
{
  "code": "DOMAIN_STATUS",
  "message": "응답 메시지",
  "data": {}
}
```

추가/변경 파일:
- `be/src/common/api-response.ts`
- `be/src/common/filters/http-exception.filter.ts`
- `be/src/modules/users/users.controller.ts`
- `be/src/modules/sessions/sessions.controller.ts`

예외 응답도 `AUTH_401`, `USER_400`, `SESSION_404` 같은 도메인 코드로 맞춘다.

### 3.2 인증 흐름
새 회원 인증 흐름은 Bearer access token과 HttpOnly refresh token cookie를 사용한다.

구현된 API:
- `POST /api/v1/users/register`
- `GET /api/v1/users/email-check`
- `POST /api/v1/users/login`
- `POST /api/v1/users/logout`
- `POST /api/v1/users/reissue`
- `GET /api/v1/users/me`
- `DELETE /api/v1/users/me`
- `GET /api/v1/users/oauth/kakao/url`
- `POST /api/v1/users/oauth/kakao/login`
- `GET /api/v1/users/oauth/discord/url`
- `POST /api/v1/users/oauth/discord/login`

구현 세부:
- 비밀번호는 `bcryptjs`로 hash 저장
- access token은 응답 body로 반환
- refresh token은 `refreshToken` HttpOnly cookie로 저장
- refresh token hash를 DB에 저장하고 logout 시 무효화
- `CurrentUserId` decorator는 `Authorization: Bearer ...`를 우선 사용
- 기존 개발 흐름 호환을 위해 `x-user-id` fallback은 유지

주의:
- OAuth provider token exchange는 아직 실제 외부 API 호출이 아니다. 현재는 code 기반 mock/local 흐름이다.

### 3.3 Prisma 데이터 모델 확장
회원/세션 목표 명세에 필요한 필드를 Prisma schema에 추가했다.

User 추가 필드:
- `email`
- `passwordHash`
- `authProvider`
- `deletedAt`
- `updatedAt`

신규 모델:
- `RefreshToken`
- `SocialAccount`

Session 추가 필드:
- `ruleSetId`
- `gmMode`
- `gmUserId`

신규 enum:
- `AuthProvider`: `LOCAL`, `KAKAO`, `DISCORD`, `GUEST`
- `GmMode`: `AI`, `HUMAN`

### 3.4 세션 API 목표 명세 정렬
세션 생성/목록/참가/상세/수정/삭제 응답을 Notion API 목표 명세 기준으로 조정했다.

구현된 주요 API:
- `POST /api/v1/sessions`
- `GET /api/v1/sessions`
- `GET /api/v1/sessions/{sessionId}`
- `POST /api/v1/sessions/{sessionId}/join`
- `POST /api/v1/sessions/join-by-invite`
- `PATCH /api/v1/sessions/{sessionId}`
- `DELETE /api/v1/sessions/{sessionId}`
- `GET /api/v1/users/me/sessions`
- `POST /api/v1/sessions/{sessionId}/character-selection`
- `PATCH /api/v1/sessions/{sessionId}/captain`
- `POST /api/v1/sessions/{sessionId}/resume`
- `GET /api/v1/sessions/{sessionId}/participants/status`
- `GET /api/v1/sessions/{sessionId}/invite`

주요 규칙:
- 세션 생성 시 `title`, `scenarioId`, `ruleSetId`, `maxPlayers`, `gmMode` 필수
- `gmMode = HUMAN`이면 `gmUserId` 필요
- 생성자는 자동 `HOST`
- 기본 상태는 `lobby`
- 목록 API는 `content`, `page`, `size`, `totalElements`, `totalPages` 반환
- 세션 수정/삭제는 `lobby` 상태에서만 허용
- 참가 가능 상태도 `lobby` 기준으로 제한

### 3.5 상태값과 enum 정리
세션 상태값은 Notion 운영 기준에 맞춰 아래 기준으로 통일했다.

API JSON:
- `lobby`
- `playing`
- `paused`
- `completed`

Prisma 내부 enum:
- `LOBBY`
- `PLAYING`
- `PAUSED`
- `COMPLETED`

참가자 role / connection status는 API 응답에서 아래 대문자 값을 쓴다.

- `HOST`
- `PLAYER`
- `SPECTATOR`
- `ONLINE`
- `OFFLINE`

### 3.6 shared-types 변경
프론트/백엔드 공통 DTO에 회원/세션 목표 명세 필드를 추가했다.

주요 변경:
- `RegisterUserDto`
- `LoginUserDto`
- `DeleteMeDto`
- `OAuthLoginDto`
- `AuthTokenResponseDto`
- `LoginResponseDto`
- `EmailCheckResponseDto`
- `OAuthUrlResponseDto`
- `CreateSessionDto`
- `UpdateSessionDto`
- `SessionResponseDto`
- `SessionListItemResponseDto`

### 3.7 프론트 호환 수정
백엔드 회원/세션 API가 envelope 응답을 쓰게 되면서 프론트 API client도 새 응답 구조를 unwrap하도록 수정했다.

변경 파일:
- `fe/src/services/api.ts`
- `fe/src/services/realtime.ts`
- `fe/src/services/storage.ts`
- `fe/src/types/session.ts`
- `fe/src/app/App.tsx`

변경 내용:
- `API_BASE_URL`가 `/api/v1` prefix를 포함하도록 정리
- Socket.IO 연결은 `/api/v1`을 제거한 base URL로 `/ws` namespace에 연결
- 세션 생성/참가 후 상세 조회를 다시 호출해 화면에서 필요한 snapshot 형태로 정규화
- 기존 `characters` UI 참조는 `sessionCharacters`와 호환되도록 정규화

## 4. 현재 의도적으로 남긴 제약
- OAuth는 실제 Kakao/Discord token exchange 미구현
- `ruleSetId`는 세션 필드로 저장하지만 별도 RuleSet 테이블/검증은 없음
- ID는 현재 repo의 `cuid` string 유지. Notion 문서의 Long ID는 추후 DB 전략 변경 시 재검토
- `x-user-id` fallback은 개발 호환성 때문에 유지
- Character/Scenario 등 전체 도메인 API envelope 전환은 이번 작업 범위 밖

## 5. 로컬 실행 방법

프로젝트 루트 기준.

### 5.1 의존성 설치
```powershell
npm install
```

### 5.2 Prisma client 생성
```powershell
npm run prisma:generate
```

### 5.3 개발 DB 스키마 반영
```powershell
npm run prisma:push
```

주의:
- 기존 `dev.db`에 데이터가 있어도 `User.updatedAt`은 `@default(now()) @updatedAt`으로 추가되어 리셋 없이 push 가능하도록 맞췄다.

### 5.4 기본 시나리오 seed
```powershell
npm run seed -w @trpg/be
```

### 5.5 백엔드 실행
```powershell
npm run dev:be
```

백엔드 주소:
```text
http://localhost:3000/api/v1
```

Swagger:
```text
http://localhost:3000/docs
```

### 5.6 프론트 실행
```powershell
npm run dev:fe
```

프론트 주소:
```text
http://localhost:5173
```

## 6. 테스트 방법

### 6.1 전체 빌드
```powershell
npm run build
```

검증 범위:
1. `shared-types` TypeScript build
2. `be` Nest build
3. `fe` TypeScript/Vite build

이번 작업 후 결과:
- 성공

### 6.2 백엔드 e2e 테스트
```powershell
npm run test:e2e -w @trpg/be
```

검증 범위:
- 회원가입
- 로그인
- refresh token cookie 발급
- Bearer access token으로 `/users/me` 조회
- Bearer access token으로 세션 생성
- access token 재발급
- 로그아웃 후 refresh token 재사용 거부
- 세션 생성/목록/초대 참가/캐릭터 선택/상세 조회
- lobby 세션 삭제 시 캐릭터 유지

이번 작업 후 결과:
- 3개 e2e 테스트 통과

### 6.3 일반 Jest 테스트
```powershell
npm test -w @trpg/be
```

현재 결과:
- 실패처럼 보이지만 원인은 테스트 파일 없음
- Jest 메시지: `No tests found`
- 실제 런타임 검증은 `test:e2e`로 수행

### 6.4 간단 수동 smoke test
프론트:
1. `http://localhost:5173` 접속
2. 게스트 이름 입력 후 입장
3. 세션 생성
4. 초대 코드 확인
5. 캐릭터 생성
6. 플레이 화면에서 참가자/캐릭터 상태 확인

백엔드:
```powershell
$guest = Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/api/v1/users/guest `
  -ContentType 'application/json' `
  -Body (@{ displayName = 'Tester' } | ConvertTo-Json)

$body = @{
  title = 'Smoke Session'
  scenarioId = 'scenario_goblin_cave'
  ruleSetId = 'dnd5e'
  maxPlayers = 4
  gmMode = 'AI'
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/api/v1/sessions `
  -Headers @{ 'x-user-id' = $guest.id } `
  -ContentType 'application/json' `
  -Body $body
```

기대 결과:
- `code = SESSION_201`
- `data.status = lobby`
- `data.sessionId` 존재

## 7. 이번 작업에서 확인한 서버 상태
개발 서버를 새 코드 기준으로 재기동했고 아래 URL 응답을 확인했다.

- `http://localhost:5173/` -> 200
- `http://localhost:3000/api/v1/scenarios` -> 200
- `http://localhost:3000/docs` -> 200

로그 파일:
- `codex/dev-backend.log`
- `codex/dev-frontend.log`

## 8. 추천 Git 커밋 메시지

```text
feat: align member and session APIs with Notion spec

- add local member registration, login, logout, reissue, and me APIs
- store refresh tokens and social account links in Prisma
- return member/session APIs with common code/message/data envelope
- extend session create/list/detail/join/update/delete flows for target spec fields
- normalize session status, participant role, and connection status response values
- update frontend API client to unwrap envelope responses
- cover auth and session flows with e2e tests
```

