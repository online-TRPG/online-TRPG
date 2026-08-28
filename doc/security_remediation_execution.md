# 보안 취약점 조치 실행 현황

기준일: 2026-08-12 / 로컬 후속 검증: 2026-08-29  
기준 문서: `security_remediation_plan.md`  
판정: 코드·로컬 자동 검증과 쓰기 가능한 Git refs 정리는 완료했으나 운영·GitHub Support 게이트는 아직 닫혀 있음

## 1. 요약

SEC-01, SEC-02, SEC-04~SEC-10은 코드와 로컬 자동 검증을 완료했다. SEC-06은 승인된 NestJS 11 전환과 안전한 전이 의존성 override를 적용해 Node·Python 운영 의존성의 알려진 취약점을 모두 0건으로 낮췄다. SEC-03은 원격 브랜치 3개와 쓰기 가능한 보조 refs, 현재 로컬 refs의 이력 재작성을 완료했다. 전체 이력 Gitleaks 검사에서 과거 `ai/.env.example`의 유효한 형식인 `GOOGLE_API_KEY`도 발견해 제거했으나, 실제 키의 폐기·교체 여부는 확인되지 않았다. GitHub 읽기 전용 `refs/pull/*` 11개는 저장소 소유자가 직접 갱신할 수 없으므로 GitHub Support의 dereference·garbage collection·cache purge가 필요하다. 실제 운영 자격 증명 교체와 세션 폐기도 아직 승인·실행되지 않았다.

따라서 현재 상태는 “로컬 구현 검증 완료, 외부 운영 게이트 대기”다. 외부 공개 배포 전에 이 문서의 4절과 5절 항목을 처리해야 한다.

## 2. 항목별 상태

| ID | 상태 | 구현·검증 결과 | 남은 작업 |
| --- | --- | --- | --- |
| SEC-01 | 코드 완료 | REST와 WebSocket 신원을 서명된 access token의 `sub`로 통일하고 기본 거부 guard, 서명된 guest token, 위조 ID 거부 테스트를 추가했다. 2026-08-29에는 전역 HTTP guard가 WebSocket handler에서 HTTP request를 조회하던 충돌을 수정하고 transport별 fail-close 회귀 테스트를 추가했다. | 스테이징에서 일반 사용자·게스트 재연결 smoke test |
| SEC-02 | 코드 완료 | 운영 CORS allowlist fail-close, refresh cookie 정책, double-submit CSRF, 전체 로그아웃과 proxy hop 검증을 적용했다. | 실제 배포 Origin과 proxy hop 확인 |
| SEC-03 | 부분 완료 | dump·AI 원문 로그 4개와 과거 `ai/.env.example`을 이력에서 제거하고 재유입을 차단했다. 운영 AI payload 로그와 외부 공급자 오류 원문 저장도 차단했다. 원격 브랜치 3개와 `refs/merge-requests/*` 10개를 재작성·강제 push했고, 로컬 브랜치·stash·연결 작업 트리도 정리했다. Gitleaks 전체 이력과 현재 변경 검사가 통과했다. | GitHub Support에 읽기 전용 PR refs 11개 purge 요청, 발견된 Google API key 즉시 폐기·교체 및 provider audit, dump/log 노출 범위에 따른 추가 secret·세션 교체 승인, 원격 CI 실행 |
| SEC-04 | 코드 완료 | 운영 JWT secret 최소 길이, `jsonwebtoken 9.0.3` 기반 HS256 allowlist·issuer·audience·만료 검증, access 10분/refresh 14일/재인증 5분, token version과 폐기 경로를 구현했다. 비밀번호 변경·복구·전체 로그아웃·탈퇴·게스트 전환 시 기존 refresh token을 폐기하고 인증 user room의 Socket을 즉시 종료한다. | migration 적용 및 강제 로그아웃 공지 |
| SEC-05 | 코드 완료 | 공개 사용자·세션 DTO에서 이메일, 내부 ID, role, auth provider를 제외하고 contract test를 추가했다. | 스테이징 공개 API 응답 재확인 |
| SEC-06 | 의존성 완료 | NestJS 11.1.29, Swagger 11.4.6, Config 4.0.4, CLI 11.0.24와 Vite 6.4.3으로 전환하고 안전한 `js-yaml`·`socket.io-adapter` override를 적용했다. 2026-08-29에 새로 공개된 `deepmerge-ts` High 권고도 8.0.1 override로 해소했다. 깨끗한 `npm ci`, 전체 회귀, build와 전체 Node·Python audit가 통과했다. | 원격 CI와 스테이징 WebSocket·Swagger 비공개 상태 재확인 |
| SEC-07 | 코드 완료 | 인증·복구·OAuth·업로드·AI·Socket 경로에 IP/계정/사용자 단위 제한, AI 동시성·일일 한도와 Nginx 제한을 추가했다. 프로세스 내 고정 창 limiter의 key map도 상한과 만료 정리, 포화 시 fail-close를 적용했다. | 운영 트래픽 기준 튜닝과 429 모니터링 |
| SEC-08 | 코드 완료 | 일회용·만료형 OAuth transaction, state hash, PKCE S256, provider/intent/user/redirect 결합 검증을 구현했다. | 실제 Kakao·Discord callback smoke test |
| SEC-09 | 코드 완료 | access token과 세션 snapshot을 메모리에만 보관하고 기존 localStorage 값을 제거한다. 운영 Swagger 기본 비활성화와 CSP/HSTS 등 Nginx 헤더를 추가했다. | 배포 응답 헤더와 브라우저 새로고침 흐름 확인 |
| SEC-10 | 코드 완료 | 실제 이미지 decode, MIME 일치, 단일 frame, byte/dimension/pixel/quota 검사 후 metadata 없는 안전 형식으로 재인코딩한다. R2 public URL과 앱 Origin 비교도 정규화해 trailing slash 우회를 막았다. | 실제 R2 별도 HTTPS origin·CORS·캐시 헤더 확인 |

## 3. 검증 증거

### 통과

| 범위 | 실행 명령 | 결과 |
| --- | --- | --- |
| Backend 전체 단위 테스트 | `npm test` | 148 suites, 1,274 tests 통과 |
| HTTP/WebSocket guard 경계 회귀 | `npm test -w @trpg/be -- --runInBand access-token-auth.guard.spec.ts token.utils.spec.ts realtime.gateway.spec.ts` | 3 suites, 19 tests 통과. WebSocket은 handshake·handler guard에 위임하고 HTTP는 public metadata 또는 인증 principal을 요구함 |
| JWT 라이브러리 전환 회귀 | `npm test -w @trpg/be -- --runInBand token.utils.spec.ts` | 위조·unsigned·용도·issuer·audience·`typ`·만료·설정 검증 8 tests 통과 |
| token 폐기·Socket 회귀 | `npm test -w @trpg/be -- --runInBand users.service.spec.ts realtime.gateway.spec.ts realtime-events.service.spec.ts` | 3 suites, 32 tests 통과 |
| 최신 보안 변경 표적 회귀 | JWT·rate limiter·이미지·사용자·Gateway·realtime 6개 spec 실행 | 6 suites, 47 tests 통과 |
| Frontend 전체 단위 테스트 | `npm run test -w @trpg/fe -- --run` | 18 files, 44 tests 통과 |
| AI 전체 테스트 | `uv run pytest -q` | 278 tests 통과, Starlette deprecation warning 1건 |
| Backend build | `npm run build -w @trpg/be` | 통과 |
| Frontend production build | `npm run build -w @trpg/fe` | 통과, 기존 대형 chunk 경고만 발생 |
| 통합 production build | `npm run build` | shared types, SRD, Backend, Frontend 전체 통과; 기존 대형 chunk 경고만 발생 |
| 깨끗한 Node 설치 | npm 11.6.2에서 `npm ci --ignore-scripts` 후 `npm run prisma:generate` | 통과. 실제 설치된 `deepmerge-ts` 8.0.1을 확인했고 CI에도 Prisma Client 생성 단계를 명시함 |
| Node 운영 의존성 | `npm run security:audit:node` (`npm audit --omit=dev --audit-level=high`) | 알려진 취약점 0건 |
| Node 전체 의존성 | `npm audit --audit-level=low` | Vite 6.4.3 전환 후 개발·운영 의존성 모두 알려진 취약점 0건 |
| Prisma schema | 임시 검증 URL로 `prisma validate` | 통과 |
| Python 운영 의존성 | 잠금 파일의 운영 의존성을 `pip-audit 2.10.1 --strict`로 검사 | 알려진 취약점 0건 |
| Git 현재 인덱스 | `npm run security:check:tracked` | 추적 금지 경로 검사 통과. 루트 `.env.example`만 허용하고 `ai/.env.example` 재유입은 차단함 |
| Git 로컬 전체 refs | `npm run security:check:history`와 `git rev-list --objects --all` | 5개 대상 경로·blob 0건, `git fsck --full` 통과 |
| Git 원격 쓰기 가능 refs | 새 mirror clone에서 branch와 `refs/merge-requests/*` 전체 검사 | 5개 대상 경로 0건. 원격 브랜치 SHA는 UX `561cea7bf99edcccf616ce433039b5a0aa32fe43`, develop `a6476b1d3014f7331e9dda8af32dfd1bd17fcec5`, master `0fcf7fff35860ebf884c6e5d8c02179d99d973c6` |
| GitHub 읽기 전용 PR refs | 새 mirror clone에서 ref별 대상 경로 검사 | `refs/pull/1/head`~`refs/pull/11/head` 11개 잔존. GitHub가 `deny updating a hidden ref`로 거부함 |
| 전문 secret scanner | checksum 검증된 Gitleaks 8.30.0으로 전체 이력 및 현재 변경 검사 | synthetic AWS canary 탐지 확인 후 411 commits·약 41.3 MB 전체 이력과 임시 인덱스의 현재 변경 모두 `no leaks found`. 13개 exact fingerprint 예외는 코드·테스트 fixture로 확인한 오탐만 포함함 |
| CI workflow 정적 검사 | checksum 검증된 `actionlint 1.7.12` | `.github/workflows/security.yml` 통과 |
| 임시 작업환경 정리 | 등록 worktree·진단 산출물 확인 후 제거 | `tmp/ai-token-baseline-20260729`, pytest 산출물 2개와 AI 진단 JSON·audit export를 제거하고 루트 `/tmp/`를 ignore 처리함 |

### 미완료 또는 실패가 아닌 환경 제약

| 검증 | 상태 | 사유/후속 조치 |
| --- | --- | --- |
| Backend E2E | 환경 차단 | 실행을 시도했으나 로컬 PostgreSQL과 Docker daemon이 없어 DB 기반 흐름을 시작할 수 없었다. 스테이징 DB에서 실행한다. |
| `nginx -t` | 환경 차단 | 로컬 Nginx binary와 Docker daemon이 없다. 배포 이미지 빌드 단계에서 두 template을 각각 검사한다. |
| 운영 smoke test | 미실행 | 실제 Origin, OAuth provider, R2, proxy, TLS 환경이 필요하다. |
| 원격 security workflow | 실행 대기 | 동일한 Gitleaks 8.30.0 canary·전체 이력 검사, Node audit, 회귀 테스트와 build를 원격 CI에서도 실행해 증거를 보존해야 한다. |

## 4. 해소 결과와 남은 출시 차단

### 4.1 Node High 취약점 해소

승인에 따라 NestJS 10에서 11.1.29로 전환했다. 함께 `@nestjs/swagger` 11.4.6, `@nestjs/config` 4.0.4, `@nestjs/cli` 11.0.24를 적용했다. 현재 상위 패키지가 안전하지 않은 정확 버전을 고정하는 세 경로는 root override로 `js-yaml` 5.2.3, `socket.io-adapter` 2.5.8, `deepmerge-ts` 8.0.1을 사용한다. 이 때문에 `npm ls`가 상위 패키지의 정확 버전 선언과 override의 차이를 `invalid`로 표시할 수 있으나, lockfile 기반 `npm ci`는 성공하며 실제 설치 버전과 운영 audit 결과를 별도 검증했다.

2026-08-29 재감사에서 `@prisma/config` 6.19.3이 정확 버전 7.1.5로 고정한 `deepmerge-ts`에 [스택 고갈 High 권고](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)가 새로 확인됐다. [Prisma upstream 추적 이슈](https://github.com/prisma/orm/issues/30052)의 소비자 완화안에 따라 8.0.1을 override했다. npm 11.6.2의 [workspace override 갱신 회귀](https://github.com/npm/cli/issues/9659) 때문에 lockfile 갱신에는 npm 10.9.8을 사용했으며, 완성된 lockfile은 npm 11.6.2의 실제 `npm ci`에서도 8.0.1로 재현됐다.

깨끗한 `npm ci`, Prisma Client 생성·schema 검증, Backend 148 suites·1,274 tests, Frontend 18 files·44 tests, AI 278 tests와 통합 production build가 통과했다. `npm audit --omit=dev`와 Python 운영 잠금 환경 audit는 모두 0건이다. 개발 전용 의존성은 운영 gate와 분리해 Dependabot과 정기 CI에서 계속 추적한다.

승인에 따라 Vite 5.4.21을 정확 버전 Vite 6.4.3으로 전환했다. `@vitejs/plugin-react` 4.7.0과 `vitest` 3.2.7은 설치 트리에서 같은 Vite 6.4.3 인스턴스를 사용한다. 깨끗한 `npm ci`, Frontend 18 files·44 tests, TypeScript·Vite production build가 통과했고 전체 개발·운영 의존성 감사 결과는 0건이다. build에는 기존 500 kB 초과 chunk 경고만 남으며 이는 별도의 성능 최적화 항목이다.

`.github/workflows/security.yml`의 `node-audit` job은 `npm audit --omit=dev --audit-level=high`를 독립 병합 gate로 유지한다. `node-regressions` job은 깨끗한 설치 후 Prisma Client를 생성하고 테스트·build 증거를 남긴다. `.github/dependabot.yml`은 npm, uv와 GitHub Actions를 정기 검사한다.

### 4.2 Git 공유 이력 정리 결과와 GitHub Support 요청

2026-08-12 승인된 작업 시간에 `git-filter-repo --sensitive-data-removal --invert-paths`를 사용해 다음 다섯 경로를 제거했다.

- `exec/dump/dump-a201-202605211138.sql`
- `runtime_logs/harness_history.jsonl`
- `runtime_logs/interpreter.latest.json`
- `runtime_logs/npc-dialogue.latest.json`
- `ai/.env.example`

`--force-with-lease`로 원격 브랜치 3개를 갱신한 뒤, 전체 mirror push로 쓰기 가능한 `refs/merge-requests/186`~`190`의 head·merge refs 10개도 갱신했다. 새 원격 mirror에서 branch와 merge-request refs의 5개 대상 경로는 0건이다. 최종 원격 branch SHA는 UX-remediation `561cea7bf99edcccf616ce433039b5a0aa32fe43`, develop `a6476b1d3014f7331e9dda8af32dfd1bd17fcec5`, master `0fcf7fff35860ebf884c6e5d8c02179d99d973c6`다. 현재 로컬의 모든 브랜치·stash·Codex checkpoint tree·연결 작업 트리도 같은 방식으로 정리했고, 로컬 전용 12개 커밋과 두 작업 트리의 미커밋 변경은 그대로 보존했다.

GitHub가 관리하는 `refs/pull/1/head`~`refs/pull/11/head`는 읽기 전용이라 push가 거부됐으며, 새 mirror에서도 이 11개 ref만 과거 객체를 계속 참조한다. [GitHub 공식 민감정보 제거 절차](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)에 따라 다음 정보로 GitHub Support 요청을 생성해야 한다.

- 저장소: `online-TRPG/online-TRPG`
- 영향받는 pull request refs: 11개, PR #1~#11
- First Changed Commit: `7257adf24c7ce0570949345c1422ed7128667e51`
- LFS: 사용하지 않음
- 요청 내용: affected PR refs dereference, server garbage collection, cached views 제거

Support 처리가 끝날 때까지 SEC-03의 “공유 이력에서 완전 제거” 조건은 미충족이다. 기존 clone·fork·CI artifact·backup도 별도로 정리하고, 과거 clone의 merge나 push로 오염된 이력을 재유입하지 않도록 공지해야 한다.

### 4.3 노출 분류와 자격 증명

로컬 비노출 분류 결과는 다음과 같다.

- dump는 225,018 bytes의 PostgreSQL custom archive이며 magic header가 `PGDMP`다. 로컬에 `pg_restore`가 없어 실제 table data 포함 여부를 확인하지 못했으므로, 격리 환경에서 확인할 때까지 인증 필드를 포함한 전체 DB dump로 취급한다.
- `harness_history.jsonl`은 약 220 KB이며 `rawInput`, `rawOutput`, `request`, `response`, `playerText`, `dialogue`, `sessionId`, `actorCharacterId` 등의 키를 포함한다.
- 두 `*.latest.json` 파일은 request/response, AI trace, session·turn·character 식별자와 provider request 식별자를 포함한다.
- Gitleaks 전체 이력 검사는 과거 `ai/.env.example`에서 유효한 형식의 `GOOGLE_API_KEY`를 발견했다. 값은 문서와 검사 로그에 남기지 않았고 쓰기 가능한 원격·로컬 refs에서 해당 파일을 제거했지만, 키가 아직 활성 상태인지 확인하지 못했으므로 노출된 것으로 간주해 즉시 폐기·교체하고 provider audit log를 확인해야 한다.
- Gitleaks 8.30.1은 [탐지가 동작하지 않을 수 있는 회귀](https://github.com/gitleaks/gitleaks/issues/2170)가 보고되어 8.30.0으로 고정했다. workflow는 checksum 검증 후 합성 AWS canary가 실제로 탐지되는지 먼저 확인하며, 그 뒤 전체 이력을 `--redact=100`으로 검사한다. 로컬에서는 전체 411 commits와 현재 변경이 통과했다.

이력 재작성·강제 push는 완료했다. 발견된 Google API key를 포함한 운영 credential rotation과 session invalidation은 별도 운영 상태를 바꾸며 아직 승인되지 않았으므로 실행하지 않았다. 저장소 소유자와 운영 담당자가 실제 노출 범위를 확인하고 교체 대상을 승인한 뒤 `security_operations_runbook.md` 4절을 따른다.

## 5. 완료를 위해 필요한 후속 조치

1. 위 정보로 GitHub Support에 PR refs와 cached view purge를 요청하고 완료 증거를 기록한다.
2. 과거 `GOOGLE_API_KEY`를 즉시 폐기·교체하고 provider audit log를 확인한다. 이어 dump/log의 실제 노출 범위를 확인해 JWT, OAuth, R2, DB, 기타 AI provider credential과 기존 사용자 세션 중 교체·폐기 대상을 승인한다.
3. PostgreSQL, Nginx, OAuth provider와 R2가 연결된 스테이징에서 E2E·smoke test를 실행한다.
4. 원격 security workflow에서 Gitleaks, Node audit, 회귀 테스트와 build를 실행해 결과를 보존한다.
이 네 항목의 결과가 기록되기 전에는 `security_remediation_plan.md`의 완료 조건을 충족한 것으로 판정하지 않는다.
