# 보안 조치 배포·운영 런북

기준일: 2026-08-12  
적용 대상: `security_remediation_plan.md`의 SEC-01~SEC-10  
원칙: 비밀값, token, cookie, OAuth code, 원문 사용자 payload를 문서·명령 로그·티켓에 남기지 않는다.

## 1. 역할과 승인

| 역할 | 책임 |
| --- | --- |
| 저장소 소유자 | Git 이력 재작성·force push 승인, branch protection 임시 변경과 복구 |
| 운영 책임자 | 배포 시간, credential rotation, 세션 폐기, 사용자 공지 승인 |
| Backend 담당 | migration, JWT/OAuth/CORS/rate limit/업로드 검증 |
| Frontend 담당 | 로그인·refresh·OAuth·guest·WebSocket 브라우저 흐름 검증 |
| Infra 담당 | Nginx, TLS, proxy hop, R2 origin, 관찰 지표와 rollback |
| 보안 검토자 | audit·secret scan·노출 범위·예외 기한 확인과 최종 sign-off |

한 사람이 여러 역할을 맡을 수 있지만, Git 이력 재작성과 운영 credential 교체는 작업자 외 한 명의 검토 승인을 남긴다.

## 2. 배포 전 필수 확인

1. 외부 쓰기·배포와 force push 작업 시간을 공지하고 관련 push를 잠시 동결한다.
2. 현재 DB backup의 복구 가능성을 확인한다. backup 파일은 Git이나 공용 작업 폴더에 두지 않는다.
3. 다음 설정은 값이 아니라 존재·형식만 확인한다.

   - `JWT_SECRET`: 무작위 32 bytes 이상, 운영 전용
   - `JWT_ISSUER`, `JWT_AUDIENCE`: 배포 환경의 고정 식별자
   - `CORS_ALLOWED_ORIGINS`: HTTPS Origin의 쉼표 구분 exact allowlist, `*` 금지
   - `TRUST_PROXY_HOPS`: 실제 reverse proxy hop 수
   - `REFRESH_COOKIE_SAME_SITE`: same-site 배포는 `strict`; 예외는 보안 검토 필요
   - `OAUTH_REDIRECT_URIS`: provider에 등록된 exact callback URI만 포함
   - `R2_PUBLIC_BASE_URL`: 애플리케이션과 다른 HTTPS public asset origin
   - R2 byte/dimension/pixel/user/scenario quota와 AI concurrency/daily limit
   - `ENABLE_SWAGGER=0`, `AI_LOG_PAYLOADS=false`

4. 다음 로컬/CI gate가 모두 통과했는지 확인한다.

```text
npm test
npm run test -w @trpg/fe -- --run
npm run build -w @trpg/be
npm run build -w @trpg/fe
npm run security:check:tracked
npm run security:check:history
npm run security:audit:node
uv --directory ai run --extra dev pytest -q
uvx --from pip-audit==2.10.1 pip-audit --strict --requirement <ai locked production requirements>
```

5. `nginx -t`를 실제 배포 template별로 실행한다. HTTP와 HTTPS template은 동시에 로드하지 않는다.
6. `.github/workflows/security.yml`의 checksum 검증된 Gitleaks 8.30.0 전체 이력 검사를 실행하고 결과에는 secret 원문을 저장하지 않는다. 먼저 합성 canary 탐지가 성공해야 하며, workflow가 실행되지 않는 환경에서도 동일 버전·canary·`--redact=100` 설정으로 검사한다.

## 3. 배포 순서

### 3.1 준비

1. 현재 배포 artifact, DB migration 상태, 환경 변수 version을 기록한다.
2. OAuth callback, frontend Origin, R2 public origin과 TLS 인증서를 확인한다.
3. 401/403/429/5xx, OAuth 실패율, WebSocket 연결 거부, AI 동시 요청, 이미지 거부율 dashboard를 준비한다.

### 3.2 DB와 Backend

1. schema validation과 migration dry-run을 수행한다.
2. `202608120001_user_token_version`을 적용한다.
3. `202608120002_oauth_transactions`를 적용한다.
4. Backend를 배포하고 health endpoint를 확인한다.
5. 무인증 보호 API가 401, 허용된 public API가 정상, 임의 `x-user-id`가 무효인지 확인한다.
6. 기존 token의 version/claim 호환 정책에 따라 필요한 사용자 공지를 진행한다.

### 3.3 Infra와 Frontend

1. Nginx rate/connection zone과 보안 헤더 설정을 반영한다.
2. HTTPS 응답에서 CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`를 확인한다.
3. Frontend를 배포하고 access token·session snapshot이 localStorage에 생기지 않는지 확인한다.
4. 로그인, 새로고침 refresh, guest, logout/logout-all, WebSocket 재연결을 확인한다.

### 3.4 OAuth와 업로드

1. Kakao와 Discord 각각 정상 callback을 한 번 실행한다.
2. 누락·불일치·재사용 state와 allowlist 밖 redirect가 거부되는지 확인한다.
3. 정상 PNG/JPEG/WebP 업로드와 MIME 위장, SVG, 손상·과대·animated 이미지 거부를 확인한다.
4. 공개 asset URL이 별도 HTTPS origin이며 app cookie가 전송되지 않는지 확인한다.

## 4. 자격 증명 교체와 세션 폐기

이 절은 운영 책임자의 명시적 승인 후에만 실행한다. 노출 가능성이 확인된 항목만 교체하되, dump/log에 실제 값이 없었다는 사실도 검토 증거와 함께 기록한다.

권장 순서는 다음과 같다.

1. 노출 파일이 접근 가능했던 remote, fork, CI artifact, backup, 작업자와 기간을 확인한다.
2. 과거 `ai/.env.example`에서 발견된 유효한 형식의 `GOOGLE_API_KEY`는 활성 여부와 무관하게 먼저 폐기·교체하고 Google Cloud audit log에서 과거·이후 사용을 확인한다.
3. `PGDMP` 형식 dump는 네트워크가 차단되고 접근이 제한된 임시 PostgreSQL 환경에서 `pg_restore --list`로 table data 포함 여부를 먼저 확인한다. 복원이 필요하면 disposable DB만 사용하고 결과 행이나 secret 값을 작업 로그에 출력하지 않는다.
4. dump·로그의 실제 데이터와 배포 시점을 대조해 영향을 받은 사용자·세션·credential 종류를 확정한다. 불확실하면 전체 DB dump가 노출된 것으로 보수적으로 판정한다.
5. JWT secret을 교체하고 모든 기존 access/refresh token을 무효화한다.
6. OAuth client secret, R2 access key, DB password, Redis password, 기타 AI provider key를 각각 새 값으로 발급·배포한다.
7. 새 credential 동작을 확인한 뒤 이전 credential을 폐기한다. dual-key가 지원되지 않으면 짧은 점검 시간을 공지한다.
8. 사용자 token version 또는 전체 로그아웃 절차로 기존 세션을 폐기한다.
9. provider audit log에서 이전 credential 사용이 계속되는지 관찰한다.
10. 티켓에는 credential 식별자 일부와 교체 시각만 남기고 값은 절대 남기지 않는다.

## 5. Git 이력 정리

상태(2026-08-12): 저장소 소유자 승인에 따라 원격 브랜치와 쓰기 가능한 보조 refs의 재작성·force push를 완료했다. GitHub 읽기 전용 PR refs 11개는 Support purge 대기 중이다. 아래 절차는 이번 실행 기록이자 재발 시 표준 절차다.

이 절은 저장소 소유자의 승인, push 동결, remote/fork 목록 확보 후에만 실행한다. 원본 clone에서 직접 연습하지 말고 접근 제한된 새 mirror clone에서 dry-run한다.

대상 경로는 다음 다섯 개다.

```text
exec/dump/dump-a201-202605211138.sql
runtime_logs/harness_history.jsonl
runtime_logs/interpreter.latest.json
runtime_logs/npc-dialogue.latest.json
ai/.env.example
```

절차:

1. `git filter-repo`가 설치된 격리된 mirror clone에서 `--sensitive-data-removal --invert-paths`로 대상 경로를 제거한다.
2. 전체 commit·tag에서 대상 filename이 사라졌는지 확인한다.
3. 전문 secret scanner로 재작성된 전체 이력을 검사한다.
4. 검토자가 결과와 remote 목록을 확인한다.
5. 승인된 작업 시간에 branch/tag를 force push하고 branch protection을 즉시 복구한다.
6. `refs/pull/*`처럼 provider가 관리하는 읽기 전용 ref가 남으면 GitHub Support에 영향 PR 수, First Changed Commit, LFS 사용 여부를 제공하고 PR ref dereference, server garbage collection, cached view 제거를 요청한다.
7. 모든 참여자에게 기존 clone 폐기와 fresh clone을 안내한다. 이전 clone에서 push하지 못하게 한다.
8. 알려진 fork·mirror가 정리됐는지 추적한다.

이력 재작성은 이미 복제된 데이터의 회수를 보장하지 않는다. 그래서 4절의 credential·세션 폐기를 별도로 수행한다.

이번 GitHub Support 요청 정보:

```text
repository: online-TRPG/online-TRPG
affected pull requests: 11 (#1-#11)
first changed commit: 7257adf24c7ce0570949345c1422ed7128667e51
LFS orphaning: not applicable (LFS not in use)
request: dereference affected PRs, run server GC, remove cached views
```

참고: [GitHub 공식 민감정보 제거 절차](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

## 6. 운영 smoke test

| 시나리오 | 기대 결과 |
| --- | --- |
| token 없이 보호 API/Socket 연결 | 401 또는 연결 거부 |
| 임의 `x-user-id`, Socket `auth.userId` | 신원 변경 없음 |
| 허용되지 않은 Origin의 credentialed 요청 | CORS 거부, 응답 읽기 불가 |
| CSRF token 없는 refresh/logout | 거부 |
| 비밀번호 변경 또는 logout-all 뒤 기존 token | REST·Socket 모두 거부 |
| 공개 프로필·세션 응답 | 이메일·내부 ID·role·auth provider 없음 |
| 로그인·복구·AI·upload·chat 한도 초과 | 작업 시작 전 429/거부와 `Retry-After` |
| OAuth state 재사용·PKCE 오류 | callback 거부 |
| localStorage 검사 | access token·session snapshot 없음 |
| 위장·과대·animated 이미지 | 저장 전 거부 |

## 7. 관찰과 경보

배포 후 최소 24시간 동안 다음을 배포 전 기준선과 비교한다.

- 401/403/419/429/5xx 비율과 endpoint·Origin·IP 분포
- refresh 실패, token version 불일치, logout-all 실행 수
- OAuth state/PKCE/redirect 거부와 provider별 callback 실패율
- WebSocket 인증·연결·join/chat rate-limit 거부 수
- AI 동시성·일일 quota 거부, provider 호출 수와 비용
- 이미지 decode/MIME/quota 거부, R2 저장량 증가
- 이전 credential 사용 시도와 비정상 DB/Redis 로그인

경보에는 token, cookie, OAuth code, 요청 원문이나 이미지 data URL을 포함하지 않는다.

## 8. 롤백

- 인증 우회 header, 임의 Origin 반사, Swagger 상시 공개, payload 원문 로깅을 rollback 수단으로 다시 켜지 않는다.
- 애플리케이션 오류는 이전 안전 artifact로 되돌리되, 적용된 DB migration은 additive column/table이므로 먼저 호환성을 확인한다.
- 새 JWT secret이나 credential 배포 후 이전 값으로 되돌리면 폐기한 token·key가 다시 유효해질 수 있으므로 운영 책임자 승인 없이 복원하지 않는다.
- rate limit 오탐은 allowlist 우회 대신 관찰 근거를 갖고 한도·window를 조정한다.
- CSP 문제는 전체 해제 대신 차단된 정확한 origin/directive만 검토해 추가한다.

## 9. 위험 예외 기록 양식

```text
대상 취약점/CVE:
영향받는 package·환경:
악용 전제와 영향:
현재 임시 완화:
채택하지 않은 해소안과 이유:
책임 역할:
승인자·승인 시각:
만료일:
재검토·해소 ticket:
```

NestJS 10 전이 의존성의 High 항목은 NestJS 11.1.29 전환과 검증된 전이 의존성 override로 해소했다. 새 High/Critical 항목이 발생하면 운영 노출 여부와 관계없이 기본적으로 안전 버전 전환을 우선하고, 불가피한 예외에는 짧은 만료일과 재감사 조건을 둔다.

2026-08-29에는 `@prisma/config` 6.19.3이 고정한 `deepmerge-ts` 7.1.5의 [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)를 root override 8.0.1로 해소했다. 상위 exact pin 때문에 `npm ls`가 `invalid`를 표시할 수 있으나 실제 설치 버전, 깨끗한 `npm ci`, Prisma Client 생성·schema 검증, 테스트·build와 Node audit를 모두 확인했다. [Prisma upstream 이슈](https://github.com/prisma/orm/issues/30052)에서 `@prisma/config`가 8.0.0 이상을 직접 사용하면 이 override를 제거하고 lockfile을 다시 생성한다. 그 전까지 [npm 11 workspace override 갱신 회귀](https://github.com/npm/cli/issues/9659)를 피하기 위해 해당 lockfile 갱신은 npm 10.9.8로 수행하고, npm 11 기반 `npm ci` 재현까지 함께 확인한다.

2026-08-12 승인에 따라 Vite 5.4.21을 정확 버전 Vite 6.4.3으로 전환했다. 깨끗한 `npm ci`, Frontend 18 files·44 tests, TypeScript·Vite production build와 전체 `npm audit --audit-level=low`가 통과해 개발·운영 의존성의 알려진 취약점은 0건이다. 기존 500 kB 초과 chunk 경고는 보안 예외가 아니라 별도 성능 최적화 항목으로 관리한다.

## 10. 완료 기록

배포 artifact/commit, migration 결과, 자동 테스트, E2E·smoke test, audit, secret scan, Git 이력 정리, credential·세션 폐기, 관찰 결과와 승인자를 `security_remediation_execution.md` 또는 연결된 변경 기록에 남긴다. 모든 출시 게이트가 충족되기 전에는 계획 문서를 `doc/completed/`로 이동하지 않는다.
