# 보안 취약점 개선 및 운영 조치 계획

기준일: 2026-08-12  
상태: 구현 진행 중 — 상세 현황은 `security_remediation_execution.md` 참조  
대상: `be`, `fe`, `ai`, `infra`, Git 저장소와 배포 운영 절차  
근거: 2026-08-11 정적 코드 점검, Git 추적 파일 확인, Node/Python 의존성 감사, 인증 미들웨어 테스트

> 이 문서는 목표 상태와 완료 기준을 정의한다. 실제 구현·검증 결과, 승인 대기 항목과 운영 절차는 각각 `security_remediation_execution.md`, `security_operations_runbook.md`에 기록한다.

## 1. 결론

현재 가장 중요한 목표는 사용자 신원을 요청 헤더가 아니라 검증된 토큰으로 확정하고, 브라우저의 refresh token이 신뢰하지 않는 출처로 전달되지 않게 하며, 저장소에 들어간 데이터 덤프와 AI 실행 기록의 노출 범위를 확정하는 것이다.

다음 세 가지 출시 차단 조건을 충족하기 전에는 새 외부 공개 배포를 진행하지 않는다.

1. 임의의 `x-user-id` 또는 WebSocket `auth.userId`만으로 다른 사용자가 될 수 없다.
2. 허용 목록에 없는 Origin은 credentialed REST 및 WebSocket 요청을 사용할 수 없다.
3. DB 덤프와 원문 AI 로그가 Git의 현재 트리와 공유된 이력에서 제거되고, 실제 비밀정보나 사용자 데이터가 포함되었다면 관련 자격 증명과 세션이 폐기된다.

이미 외부에 배포된 환경이라면 SEC-01~SEC-03을 일반 개선 작업이 아니라 사고 억제 작업으로 먼저 수행한다.

## 2. 목표와 범위

### 목표

- REST와 WebSocket에서 하나의 검증된 인증 체계를 사용한다.
- 게스트 플레이는 유지하되 게스트도 서버가 서명한 제한된 토큰을 사용한다.
- refresh token, OAuth 콜백, CORS 정책 사이의 신뢰 경계를 명확히 한다.
- Git, 로그, API 응답에 필요한 최소 데이터만 남긴다.
- 알려진 High 등급 런타임 의존성 취약점을 제거한다.
- 인증·복구·AI·실시간 요청에 남용 방지 한도를 적용한다.
- 보안 회귀를 자동 테스트와 CI 정책으로 차단한다.

### 제외 범위

- 이 문서만으로 운영 자격 증명을 실제 교체하거나 기존 세션을 폐기하지 않는다.
- Git 이력 재작성, 강제 push, 운영 데이터 삭제는 별도 승인과 팀 조율 후 실행한다.
- 운영 환경 침투 테스트와 개인정보 영향 평가는 이 계획의 구현 후 별도 승인된 절차로 수행한다.
- 게임 규칙, 시나리오 콘텐츠, UI 디자인의 기능 개선은 보안 변경에 필요한 범위만 다룬다.

## 3. 기준 취약점 목록

| ID | 우선순위 | 문제 | 주요 영향 | 1차 담당 |
| --- | --- | --- | --- | --- |
| SEC-01 | P0 | `x-user-id`와 WebSocket `auth.userId` 신뢰 | 계정 사칭, 세션·캐릭터·시나리오 조작, 권한 상승 | Backend, Frontend |
| SEC-02 | P0 | 임의 Origin을 허용하는 credentialed CORS와 `SameSite=None` refresh cookie | cross-site access token 탈취 | Backend, Infra |
| SEC-03 | P0 | Git에 추적된 DB 덤프와 AI 요청·응답 로그 | 개인정보·토큰·게임 대화 노출, Git 이력 장기 잔존 | Security/Infra, Backend, AI |
| SEC-04 | P1 | JWT 기본 비밀키와 48시간 access token | 설정 누락 시 토큰 위조, 계정 변경 후 장기 세션 유지 | Backend, Infra |
| SEC-05 | P1 | 공개 사용자 응답의 내부 ID·이메일·역할 노출 | 개인정보 노출, 사칭 공격의 식별자 제공 | Backend, Shared Types |
| SEC-06 | P1 | 런타임 npm 의존성 취약점 22건 | Socket.IO DoS·메모리 문제, 업로드·파싱 계층 위험 | Backend, Frontend |
| SEC-07 | P1 | 인증·복구·AI·WebSocket 요청 제한 부재 | brute force, 계정/메일/AI 비용 남용, 서비스 고갈 | Backend, Infra |
| SEC-08 | P2 | OAuth `state` 미생성·미검증 및 PKCE 부재 | 로그인 CSRF, 계정 혼동 | Backend, Frontend |
| SEC-09 | P2 | access token·세션 snapshot의 `localStorage` 저장과 보안 헤더 부재 | XSS 발생 시 토큰·세션 데이터 탈취 범위 확대 | Frontend, Infra |
| SEC-10 | P2 | 업로드 파일의 선언 MIME 신뢰 | 위장 파일·과대 이미지·공개 스토리지 악용 | Backend, Infra |

2026-08-11 기준 `npm audit --omit=dev` 결과는 High 7건, Moderate 15건이다. Python 잠금 환경은 같은 시점의 `pip-audit`에서 알려진 취약점이 확인되지 않았다. 의존성 결과는 시간이 지나면 달라지므로 구현을 시작할 때 다시 측정한다.

## 4. 실행 순서와 출시 게이트

| 단계 | 권장 시점 | 포함 작업 | 단계 완료 조건 |
| --- | --- | --- | --- |
| Phase 0. 억제와 사실 확인 | 즉시, 0~24시간 | SEC-03 노출 범위 확인, 외부 공개 변경 동결, 위험 자격 증명 목록 작성 | 노출 저장소·배포 환경·데이터 종류가 기록되고 승인권자가 지정됨 |
| Phase 1. 신원·토큰 경계 복구 | 1~3일 | SEC-01, SEC-02, SEC-04 핵심 변경 | 위조 ID 및 비허용 Origin 테스트가 모두 거부되고 정상 로그인·게스트·WS 흐름이 통과함 |
| Phase 2. 데이터 최소화와 남용 방지 | 3~7일 | SEC-03 정리 실행, SEC-05, SEC-07 | 민감 파일 비추적, 공개 DTO 최소화, 주요 경로의 429 정책 동작 |
| Phase 3. 공급망·브라우저·입력 강화 | 1~2주 | SEC-06, SEC-08, SEC-09, SEC-10 | High 런타임 취약점 제거 또는 승인된 예외 기록, OAuth·헤더·업로드 회귀 테스트 통과 |
| Phase 4. 지속 검증 | 지속 | CI 보안 게이트, 로그·알림·정기 감사 | 보안 테스트와 감사가 기본 브랜치 병합 조건으로 동작 |

Phase 0의 Git 이력 재작성과 자격 증명 교체는 외부에 영향을 주는 작업이다. 실행 전에 저장소 소유자, 배포 담당자, 개발 참여자의 승인과 작업 시간 조율이 필요하다.

## 5. 상세 조치 계획

### SEC-01. REST·WebSocket 인증 우회 제거

#### 목표 상태

- 사용자 ID는 검증된 access token의 `sub`에서만 얻는다.
- 게스트도 서버가 발급한 서명 토큰을 사용한다.
- REST와 WebSocket이 동일한 토큰 검증·계정 상태·권한 규칙을 적용한다.
- `x-user-id`는 테스트를 포함한 모든 제품 경로에서 인증 수단으로 사용하지 않는다.

#### 변경 대상

- `be/src/common/decorators/current-user-id.decorator.ts`
- `be/src/common/auth/access-token-auth.middleware.ts`
- `be/src/app.module.ts`
- `be/src/modules/realtime/realtime.gateway.ts`
- `be/src/modules/users/users.controller.ts`
- `be/src/modules/users/users.service.ts`
- `fe/src/services/httpClient.ts`
- `fe/src/services/realtime.ts`
- 관련 인증·권한·WebSocket 테스트

#### 구현 작업

1. `CurrentUserId`는 검증이 끝난 request principal만 읽게 하고 헤더 fallback을 삭제한다.
2. 인증 경계를 기본 거부 방식의 Nest Guard로 통일한다. 로그인, 회원가입, 게스트 발급, OAuth 시작·콜백처럼 공개할 route만 명시적인 `@Public()` 메타데이터로 연다.
3. 게스트 생성 응답에도 일반 회원과 같은 형태의 access token과 refresh 정책을 적용한다. 게스트 권한 범위가 필요하면 토큰 claim과 DB 상태로 구분한다.
4. 프론트엔드의 `x-user-id` 전송을 제거하고 모든 인증 요청에 `Authorization: Bearer`를 사용한다.
5. Socket.IO client는 `auth.accessToken`만 전송한다. Gateway connection 또는 `session.join` 전에 토큰 서명, 만료, 용도, 사용자 삭제 여부를 검증하고 `sub`를 membership의 사용자 ID로 사용한다.
6. Swagger의 `x-user-id` API key 정의와 문서를 제거한다.
7. 컨트롤러의 소유권 검사뿐 아니라 서비스의 변경 작업에서도 리소스 소유자·세션 참여자·관리자 권한을 재확인한다.

#### 완료 조건

- 인증 없이 보호 API를 호출하면 `401`이다.
- 임의의 `x-user-id`를 보내도 인증 결과가 바뀌지 않는다.
- 사용자 A의 토큰으로 사용자 B의 프로필, 캐릭터, 시나리오, 세션, 전투 상태를 변경할 수 없다.
- WebSocket token 누락·위조·만료 연결은 room join과 snapshot 전송 전에 거부된다.
- 정상 회원, OAuth 회원, 게스트의 REST 로그인·재발급·세션 참여·WebSocket 재연결이 통과한다.
- 기존 테스트 중 `x-user-id` 통과를 정상 동작으로 간주하는 테스트는 삭제하거나 거부 기대값으로 변경된다.

#### 실패 처리

게스트 회귀가 발생해도 `x-user-id` fallback을 다시 켜지 않는다. 게스트 토큰 발급·저장·재발급 경로를 수정하고 인증 우회는 닫힌 상태를 유지한다.

### SEC-02. CORS·refresh cookie·CSRF 경계 강화

#### 목표 상태

- 서버가 관리하는 정확한 Origin 허용 목록만 credentialed 요청을 사용할 수 있다.
- 요청의 `Origin` 값을 보고 cookie 보안 속성을 동적으로 완화하지 않는다.
- refresh token을 사용하는 상태 변경 또는 토큰 발급 요청은 CSRF 방어를 통과해야 한다.

#### 변경 대상

- `be/src/main.ts`
- `be/src/modules/users/users.controller.ts`
- Backend 환경 설정 검증 모듈
- `be/src/modules/realtime/realtime.gateway.ts`
- `infra/nginx/default.conf`
- `infra/nginx/default-ssl.conf`
- CORS·cookie·재발급 통합 테스트

#### 구현 작업

1. `CORS_ALLOWED_ORIGINS`를 쉼표로 구분된 정확한 Origin 목록으로 관리하고 시작 시 URL 형식과 중복을 검증한다.
2. 개발 Origin은 개발 환경 설정에만 두고 운영 기본값은 빈 목록 또는 명시된 제품 Origin으로 둔다. 설정 누락 시 운영 서버는 시작에 실패한다.
3. REST와 Socket.IO에 같은 허용 목록을 적용한다. 비허용 Origin에는 `Access-Control-Allow-Origin`과 credential 허용 헤더를 반환하지 않는다.
4. `resolveRefreshCookieSameSite()`처럼 요청 Origin에 따라 `SameSite=None`을 선택하는 로직을 제거한다.
5. 가능하면 프론트와 API를 same-site로 운영하고 `SameSite=Strict` 또는 검증된 `Lax` 정책을 사용한다. cross-site 배포가 필수라면 `SameSite=None; Secure`와 함께 Origin 검증 및 CSRF token을 적용한다.
6. refresh cookie는 `__Host-refreshToken`, `Secure`, `HttpOnly`, `Path=/`, `Domain` 미설정 규칙을 사용한다. 이름 변경 기간에는 기존 cookie를 명시적으로 만료시킨다.
7. `/reissue`, `/logout` 등 cookie 기반 인증 endpoint에서 Origin/Referer와 CSRF token을 검증한다.

#### 완료 조건

- 허용되지 않은 Origin의 preflight와 credentialed 요청은 브라우저에서 사용할 수 없다.
- 악성 Origin에서 `/api/v1/users/reissue` 응답을 읽을 수 없다.
- 허용 Origin의 로그인, OAuth 로그인, 재발급, 로그아웃은 정상 동작한다.
- REST와 WebSocket의 허용 Origin 목록이 동일한 설정 원천을 사용한다.
- 운영 환경에서 HTTP 또는 `Secure` 없는 refresh cookie가 발급되지 않는다.

### SEC-03. Git·로그 데이터 노출 대응

#### 목표 상태

- DB dump, 원문 AI payload, token, 비밀 설정은 Git에서 추적되지 않는다.
- 이미 공유된 이력의 데이터 종류와 영향 사용자를 식별한다.
- 노출 가능성이 있는 자격 증명과 refresh token은 더 이상 사용할 수 없다.
- 운영·진단 로그는 최소 데이터, 짧은 보존 기간, 제한된 접근 권한을 갖는다.

#### 조사 대상

- `exec/dump/dump-a201-202605211138.sql`
- `runtime_logs/harness_history.jsonl`
- `runtime_logs/*.latest.json`
- `tmp/*.dump`
- `.gitignore`
- 모든 remote와 fork, CI artifact, 배포 서버, 팀원이 보유한 clone

#### 구현 및 운영 작업

1. 파일 내용의 실제 데이터 여부를 비밀값을 출력하지 않는 방식으로 분류한다. 사용자, 이메일, password hash, refresh token hash, OAuth 식별자, AI 대화, 세션 데이터, API 키 포함 여부를 항목별로 기록한다.
2. 현재 트리에서 dump와 runtime payload 로그의 추적을 중단한다. `.gitignore`에는 특정 dump 디렉터리, `tmp/*.dump`, runtime JSON/JSONL을 명시하고 합성 fixture만 예외 처리한다.
3. AI payload 원문 기록은 기본 비활성화한다. 필요한 진단 로그에는 trace ID, endpoint, 상태, latency, bounded error만 남기고 사용자 원문·provider raw output·token은 제거한다.
4. 실제 민감 데이터가 remote에 올라간 적이 있다면 작업 시간 동안 push를 동결하고 검증된 도구로 모든 branch와 tag의 이력을 재작성한다. 이후 보호 브랜치와 팀 clone을 새 이력에 맞춰 재동기화한다.
5. 노출 범위에 따라 JWT secret, OAuth client secret, AI API key, R2 credential, DB credential을 교체하고 모든 refresh token을 폐기한다. password hash가 포함되었다면 사용자 통지·비밀번호 초기화 필요성을 별도로 판단한다.
6. CI에 secret scanner와 민감 파일 경로 검사를 추가하고 artifact 보존 기간과 접근 권한을 설정한다.

#### 완료 조건

- `git ls-files` 결과에 dump와 runtime payload 로그가 없다.
- 이력 재작성이 필요한 경우 `git log --all -- <대상 경로>`에서 대상 데이터가 발견되지 않는다.
- secret scanner가 현재 트리와 전체 이력에서 통과한다.
- 노출로 분류된 기존 refresh token과 자격 증명으로 인증할 수 없다.
- 테스트 데이터는 실제 이메일·토큰·대화가 아닌 합성 fixture다.
- 사고 판단, 회전 항목, 실행자, 실행 시각, 검증 결과가 비밀값 없이 기록된다.

### SEC-04. JWT 설정·수명·폐기 모델 개선

#### 구현 작업

1. `JWT_SECRET` fallback을 삭제하고 운영 설정 검증에서 충분히 긴 무작위 secret을 필수로 요구한다.
2. access token 기본 수명을 5~15분 범위로 줄이고 refresh token 회전 정책을 유지한다. 초기 권장값은 10분이며 실제 사용자 흐름과 재발급 부하로 확정한다.
3. token에 `iss`, `aud`, `iat`, `jti`, 용도 claim을 넣고 모든 검증에서 예상값을 확인한다.
4. `User`에 `tokenVersion` 또는 동등한 세션 버전을 두어 비밀번호 변경, 계정 복구, 권한 변경, 전체 로그아웃 시 기존 access token도 즉시 무효화한다.
5. 직접 구현한 JWT 서명 비교를 검증된 JWT 라이브러리와 timing-safe 검증으로 대체한다.
6. secret 교체 절차와 강제 로그아웃 사용자 안내를 운영 runbook에 기록한다.

#### 완료 조건

- 운영 환경에서 `JWT_SECRET` 누락·기본값·부적절한 형식이면 애플리케이션이 시작되지 않는다.
- 비밀번호 변경 또는 전체 로그아웃 직후 기존 access/refresh token이 모두 거부된다.
- access token은 설정된 짧은 수명 뒤 만료되고 자동 재발급 흐름이 정상 동작한다.
- access·refresh·reauth token은 서로 다른 용도로 검증되어 교차 사용할 수 없다.

### SEC-05. 공개 응답 데이터 최소화

#### 구현 작업

1. `shared-types`에 `PublicUserResponseDto`를 추가하고 `publicId`, 표시 이름, 공개 avatar처럼 제품에 필요한 필드만 둔다.
2. `mapUser`를 private/account 응답과 public 응답 mapper로 분리한다.
3. 공개 프로필과 공개 세션 목록에서 내부 `id`, `userId`, `email`, `authProvider`, `role`, refresh 관련 필드를 제거한다.
4. 세션 `inviteCode`와 내부 참여자 ID는 호스트 또는 명시적으로 승인된 참여 흐름에만 반환한다.
5. DTO 직렬화 snapshot 테스트로 금지 필드가 다시 추가되면 실패하게 한다.

#### 완료 조건

- 비로그인·일반 사용자 공개 API 응답에 이메일, 내부 사용자 ID, 인증 공급자, 역할이 없다.
- 본인 계정 API는 필요한 private 필드를 계속 반환한다.
- 관리자 기능은 공개 DTO가 아니라 별도의 권한 검사를 거친 관리 DTO를 사용한다.

### SEC-06. 런타임 의존성 취약점 제거

#### 구현 작업

1. 변경 직전에 `npm audit --omit=dev`와 Python `pip-audit` 결과를 다시 저장한다.
2. `engine.io`, `socket.io-parser`, `ws`의 안전 버전을 우선 반영하고 polling·upgrade·재연결·room join을 회귀 테스트한다.
3. `multer`, `js-yaml`, `lodash`, `body-parser`, React Router 관련 안전 업데이트를 적용한다.
4. Nest 11이 필요한 수정은 `npm audit fix --force`로 일괄 적용하지 않고 별도 호환성 작업으로 진행한다. Nest 10에서 가능한 patch를 먼저 적용하고 남은 항목은 근거와 만료일이 있는 예외로 기록한다.
5. lockfile을 갱신한 뒤 backend build/test, frontend build/test, Swagger, 업로드, Socket.IO smoke test를 실행한다.
6. CI에서 `npm audit --omit=dev --audit-level=high`를 기본 병합 게이트로 사용하고 정기 업데이트 봇을 설정한다.

#### 완료 조건

- 운영 의존성의 High/Critical 취약점이 0건이다. 불가피한 예외는 영향 경로, 임시 완화, 담당자, 제거 기한이 문서화된다.
- 정상 WebSocket polling과 upgrade가 모두 동작하며 비정상 연결 폭주가 rate limit을 받는다.
- Python 의존성도 lockfile 기준 감사 결과가 남는다.

### SEC-07. 요청 제한과 비용 보호

#### 구현 작업

1. Nginx의 연결·요청 제한과 Nest의 사용자·경로 단위 제한을 함께 적용한다. 프록시 IP 신뢰 설정이 정확한지 먼저 검증한다.
2. 로그인은 IP와 계정 식별자를 함께 사용해 실패 횟수와 지연을 누적하되 계정 존재 여부를 응답으로 노출하지 않는다.
3. 회원가입, 게스트 생성, 이메일 중복 확인, 비밀번호 초기화 요청·확인, refresh 재발급에 각각 다른 버킷을 둔다.
4. AI endpoint에는 사용자별 분당 한도, 동시 요청 한도, 일일 비용 한도를 적용한다.
5. WebSocket에는 IP당 연결 수, 사용자당 socket 수, session join 빈도, chat/message 빈도와 최대 크기를 제한한다.
6. 제한 응답은 `429`와 `Retry-After`를 사용하고 정상 사용자에게 재시도 가능한 UI 메시지를 제공한다.
7. 실제 숫자는 추측으로 고정하지 않고 정상 트래픽 측정값과 부하 테스트를 기준으로 정한다. 운영 중 차단율과 상위 남용 주체를 관찰해 조정한다.

#### 완료 조건

- 반복 로그인, 비밀번호 초기화, 게스트 생성, AI 요청, WebSocket 연결·메시지 테스트가 설정된 한도에서 `429` 또는 연결 거부가 된다.
- 제한된 요청이 DB write, webhook, bcrypt, AI provider 호출 전에 차단된다.
- 일반 로그인·게임 진행 부하 테스트에서는 의도하지 않은 제한 비율이 허용 기준 안에 있다.

### SEC-08. OAuth state·PKCE·redirect 검증

#### 구현 작업

1. OAuth 시작 시 서버가 고엔트로피 `state`를 생성하고 짧은 TTL의 HttpOnly cookie 또는 서버 저장소에 provider, intent, redirect URI와 함께 보관한다.
2. callback/login 교환에서 `state`를 일회성으로 검증하고 성공·실패 후 즉시 폐기한다.
3. Kakao와 Discord 설정에 등록된 정확한 redirect URI 허용 목록만 받는다. prefix, substring, 요청 Host 기반 동적 URI는 허용하지 않는다.
4. 공급자가 지원하는 흐름에는 PKCE `S256`을 적용하고 verifier를 state transaction에 묶는다.
5. 프론트엔드의 `localStorage` provider/intent 값은 UI 복원 힌트로만 사용하고 인증 검증 근거로 사용하지 않는다.

#### 완료 조건

- state 누락·불일치·재사용·만료·provider 불일치 callback은 token 교환 전에 거부된다.
- 허용 목록 밖 redirect URI로 OAuth URL을 만들 수 없다.
- 정상 로그인과 계정 재인증 흐름이 각각 독립된 state/intent로 통과한다.

### SEC-09. 브라우저 저장소·보안 헤더·운영 문서 노출 축소

#### 구현 작업

1. 짧은 access token은 메모리에만 보관하고 페이지 복원 시 HttpOnly refresh cookie를 이용해 다시 발급한다.
2. 세션 snapshot은 영속 저장이 꼭 필요한 공개·최소 필드만 남기고 민감 데이터는 `localStorage`에 저장하지 않는다. 브라우저 안의 같은 Origin 키로 암호화하는 방식은 XSS 방어로 간주하지 않는다.
3. Nginx에 환경에 맞는 CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors` 또는 `X-Frame-Options`를 적용한다.
4. HTTPS 운영이 안정된 뒤 적절한 `Strict-Transport-Security`를 적용하고 includeSubDomains 여부는 모든 하위 도메인의 HTTPS 준비 상태를 확인한 뒤 결정한다.
5. Swagger는 운영에서 비활성화하거나 관리자/VPN 인증 뒤에 둔다.
6. CSP는 report-only로 위반을 수집한 다음 차단 모드로 전환하며 필요한 연결 대상과 정적 asset 출처만 허용한다.

#### 완료 조건

- 새로고침 전후 브라우저 저장소에 access token이 남지 않는다.
- 주요 HTML/API 응답에 합의된 보안 헤더가 있다.
- inline script, 외부 provider, Socket.IO, R2 asset 등 정상 경로가 CSP 아래 동작한다.
- 운영 `/docs`가 공개 인터넷에서 접근되지 않는다.

### SEC-10. 이미지 업로드 검증과 공개 스토리지 격리

#### 구현 작업

1. 시나리오와 avatar 모두 허용 MIME을 PNG, JPEG, WebP 등 필요한 raster 형식의 정확한 목록으로 제한한다.
2. base64 decode 후 magic byte와 실제 이미지 decode를 수행하고 선언 MIME과 일치하는지 확인한다.
3. 0 byte, 최대 byte, 가로·세로, 총 pixel, animation frame 수에 상한을 둔다.
4. 가능하면 안전한 라이브러리로 이미지를 재인코딩하고 EXIF와 불필요한 metadata를 제거한다.
5. 공개 asset은 애플리케이션 cookie가 전달되지 않는 별도 Origin에서 제공하고 `nosniff`와 제한적인 CORS를 사용한다.
6. 사용자·세션별 저장 용량과 업로드 빈도를 제한하고 R2 오류 본문은 클라이언트에 그대로 노출하지 않는다.

#### 완료 조건

- 확장자/MIME만 이미지인 텍스트·SVG·polyglot·손상 파일이 거부된다.
- 압축 해제 후 과대 pixel 또는 animation bomb fixture가 제한 안에서 거부된다.
- 정상 PNG/JPEG/WebP 업로드와 조회는 유지된다.
- 업로드 실패 응답에 R2 endpoint, bucket, credential, 원문 provider 오류가 포함되지 않는다.

## 6. 공통 검증 계획

### 자동 테스트

| 구분 | 필수 검증 |
| --- | --- |
| REST 인증 | 무인증 401, 임의 `x-user-id` 무효, 위조·만료·용도 불일치 token 거부 |
| 권한/IDOR | 사용자 A가 사용자 B의 계정·캐릭터·시나리오·세션·전투를 읽거나 변경하지 못함 |
| WebSocket | token 없는 연결 거부, 위조 사용자 room join 거부, 정상 재연결 성공 |
| CORS/CSRF | 허용/비허용 Origin preflight, credentialed reissue, CSRF 누락·불일치 |
| token 폐기 | 비밀번호 변경, 복구, 권한 변경, 전체 로그아웃 후 기존 token 거부 |
| 공개 DTO | 이메일·내부 ID·role·authProvider 금지 snapshot |
| OAuth | state 누락·불일치·재사용·만료, redirect allowlist, PKCE verifier 오류 |
| Rate limit | 로그인·복구·게스트·AI·socket 경로의 한도와 `Retry-After` |
| 업로드 | 정상 이미지, MIME 위장, 손상 이미지, 과대 byte/pixel/frame |
| 브라우저 | 로그인·새로고침·로그아웃·OAuth·게스트·WS 흐름과 localStorage token 부재 |

### 빌드·감사

- Backend: build, unit test, 인증·권한·WebSocket integration test
- Frontend: typecheck/build, 인증 저장·OAuth·재연결 test
- Shared types: DTO build와 공개/private mapper contract test
- AI: 기존 test와 `pip-audit` 잠금 환경 검사
- 전체 저장소: `npm audit --omit=dev`, secret scan, 민감 경로 추적 검사
- Infra: Nginx 설정 검사, 실제 응답 헤더와 CORS preflight smoke test

### 수동 보안 확인

스테이징에서 두 일반 사용자, 게스트, 관리자 계정을 분리해 다음을 확인한다.

1. 사용자 ID를 URL, header, JSON body, Socket.IO auth payload에서 바꿔도 권한이 이동하지 않는다.
2. 신뢰하지 않는 별도 Origin에서 로그인 cookie를 포함한 요청과 응답 읽기가 차단된다.
3. 비밀번호 변경과 전체 로그아웃 직후 열려 있던 REST·WebSocket 세션이 더 이상 권한을 행사하지 못한다.
4. 공개 프로필과 세션 목록에서 PII와 내부 식별자가 노출되지 않는다.
5. rate limit과 업로드 거부가 provider 호출 또는 영속화 전에 일어난다.

## 7. 운영 전환과 롤백 원칙

- 인증 우회 fallback은 롤백 수단으로 사용하지 않는다. 문제가 생기면 안전한 토큰 흐름을 수정하거나 배포를 이전 안전 버전으로 되돌린다.
- CORS 허용 목록은 스테이징에서 실제 Origin을 확인한 뒤 운영에 반영한다. 장애 대응을 위해 `*` 또는 요청 Origin 반사를 사용하지 않는다.
- JWT secret 교체와 token version 도입은 강제 로그아웃을 동반할 수 있으므로 사용자 공지와 모니터링을 준비한다.
- Git 이력 재작성 전에는 별도의 접근 제한 백업, push 동결, 참여자 공지, remote/fork 목록을 확보한다. 재작성 후 이전 clone에서 push하지 못하게 안내한다.
- 의존성 major upgrade는 한 번에 묶지 않고 Socket.IO 보안 패치와 Nest 호환성 변경을 나눠 배포한다.
- 보안 로그에는 사용자 원문, token, cookie, password, OAuth code, secret을 남기지 않는다.

## 8. 완료 판정

다음 조건이 모두 충족되면 이 계획을 완료로 판정하고 문서를 `doc/completed/`로 이동한다.

- SEC-01~SEC-03 출시 차단 조건이 모두 해제되었다.
- SEC-04~SEC-10의 완료 조건과 공통 자동 테스트가 통과했다.
- 운영 런타임 의존성에 승인되지 않은 High/Critical 취약점이 없다.
- Git 현재 트리와 필요한 경우 전체 공유 이력에 민감 dump·payload 로그·secret이 없다.
- 노출 가능성이 있었던 token과 credential의 교체·폐기 결과가 기록되었다.
- 스테이징 수동 검증과 운영 smoke test 결과가 남아 있다.
- 남은 예외에는 위험, 임시 완화, 책임 역할, 해소 기한이 있다.
- 실제 코드와 운영 정책에 맞춰 인증·권한·AI 로그 관련 기준 문서가 갱신되었다.

## 9. 실행 증거 기록 형식

각 작업은 PR 또는 별도 검증 문서에 다음 정보를 남긴다.

| 항목 | 기록 내용 |
| --- | --- |
| 작업 ID | 예: `SEC-01` |
| 변경 범위 | 변경 파일, migration, 환경 변수, 인프라 설정 |
| 위험과 호환성 | 게스트/OAuth/강제 로그아웃/WS/배포 영향 |
| 자동 검증 | 실행 명령과 통과한 test 수 |
| 수동 검증 | 계정 유형, 시나리오, 기대값, 실제 결과 |
| 보안 감사 | npm/Python audit, secret scan, Git 추적 검사 결과 |
| 배포·롤백 | 배포 순서, 관찰 지표, 롤백 조건 |
| 승인 | 리뷰어 역할과 승인 시각. 비밀값은 기록하지 않음 |
