# 로컬 Cloudflare Tunnel 공유 가이드

이 문서는 로컬 PC에서 실행 중인 프론트/백엔드를 Cloudflare 임시 터널로 팀원에게 공유하는 절차를 정리한다.

## 현재 방식

무료 `trycloudflare.com` 임시 터널은 새로 열 때마다 URL이 바뀐다. URL 변경에 따른 수정 범위를 줄이기 위해 **프론트 터널 하나만** 연다.

```text
외부 사용자
  -> https://<random>.trycloudflare.com
  -> cloudflared
  -> Vite dev server http://localhost:5173
      - React 화면 서빙
      - /api/* 프록시 -> http://localhost:8080
      - /socket.io/* 프록시 -> http://localhost:8080
  -> NestJS backend http://localhost:8080
```

백엔드용 Cloudflare 터널은 별도로 열지 않는다.

## 사전 준비

로컬 DB와 백엔드 env가 먼저 정상이어야 한다.

- `.env.backend`의 `DATABASE_URL`은 현재 로컬 PostgreSQL을 가리켜야 한다.
- 로컬 실행에서는 `SERVER_DATABASE_URL`이 있으면 `DATABASE_URL`을 덮어쓴다. SSH 터널 검증 중이 아니라면 주석 처리한다.
- `fe/.env.local`에는 `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`을 설정하지 않는다. 외부 터널에서는 같은 origin의 `/api/v1`, `/socket.io`를 사용한다.

## 실행 순서

터미널 1: 백엔드

```powershell
npm run start -w @trpg/be
```

개발 모드가 필요하면:

```powershell
npm run dev:be
```

터미널 2: 프론트

```powershell
npm run dev -w @trpg/fe
```

터미널 3: Cloudflare 임시 터널

```powershell
cloudflared tunnel --url http://localhost:5173
```

출력된 `https://<random>.trycloudflare.com` 주소 하나만 팀원에게 공유한다.

## 확인

프론트:

```powershell
curl https://<random>.trycloudflare.com
```

백엔드 health가 프론트 터널 아래에서 프록시되는지 확인:

```powershell
curl https://<random>.trycloudflare.com/api/v1/health
```

정상 응답:

```json
{"status":"ok"}
```

Socket.IO polling 경로 확인:

```powershell
curl "https://<random>.trycloudflare.com/socket.io/?EIO=4&transport=polling"
```

`sid`가 포함된 응답이 나오면 기본 실시간 경로가 살아 있다.

## OAuth 사용 시

게스트 로그인만 쓰면 추가 작업이 없다.

Kakao/Discord OAuth를 테스트하려면 터널 URL이 바뀔 때마다 각 콘솔의 redirect URI를 현재 프론트 터널로 갱신해야 한다.

```text
https://<random>.trycloudflare.com/oauth/callback
```

이 프로젝트의 프론트는 OAuth 요청 시 `window.location.origin + "/oauth/callback"`을 redirect URI로 사용한다. 따라서 백엔드 터널 주소나 `/api` 주소를 OAuth redirect URI로 등록하지 않는다.

## Vite 설정 기준

`fe/vite.config.ts`는 현재 아래 역할을 한다.

- `allowedHosts: [".trycloudflare.com"]`: 새 임시 터널 hostname을 매번 추가하지 않기 위한 설정
- `/api` proxy: REST API를 `http://localhost:8080`으로 전달
- `/socket.io` proxy: Socket.IO polling/websocket을 `http://localhost:8080`으로 전달

## 자주 나는 문제

### `Blocked request. This host (...) is not allowed.`

Vite dev server가 터널 hostname을 차단한 것이다. `fe/vite.config.ts`의 `allowedHosts`에 `.trycloudflare.com`이 있는지 확인하고 프론트를 재시작한다.

### 브라우저에서 API가 `localhost:8080`으로 호출됨

`fe/.env.local`에 `VITE_API_BASE_URL=http://localhost:8080` 같은 값이 남아 있는 것이다. 터널 공유 모드에서는 해당 값을 비워 둔다.

### `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:15432`

`.env.backend` 또는 현재 셸 환경에 `SERVER_DATABASE_URL`이 남아 있어 로컬 `DATABASE_URL`을 덮어쓴 것이다.

```powershell
Remove-Item Env:SERVER_DATABASE_URL -ErrorAction SilentlyContinue
```

그리고 `.env.backend`의 `SERVER_DATABASE_URL`을 주석 처리한다.

### Cloudflare 고정 도메인 관련

Cloudflare Named Tunnel에 고정 도메인을 붙이려면 Cloudflare가 관리할 수 있는 root domain zone이 필요하다. `online-trpg.kro.kr`처럼 다른 root domain의 하위 도메인만 가진 경우에는 Cloudflare Dashboard의 `Connect a domain` 대상이 되지 않을 수 있다.

유료 root domain을 사용할 수 없는 상황에서는 이 문서의 단일 임시 터널 방식이 현재 표준이다.
