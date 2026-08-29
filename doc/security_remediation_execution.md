# 보안 취약점 조치 실행 현황

상태: 완료 (2026-08-29)

기준일: 2026-08-12 / 로컬 후속 검증: 2026-08-29  
기준 문서: `completed/security_remediation_plan.md`
판정: 코드·로컬 자동 검증·PostgreSQL E2E·Nginx 검증 완료, 외부 OAuth·R2 smoke test는 사용자 결정으로 제외

## 1. 요약

SEC-01~SEC-10의 코드와 로컬 자동 검증을 완료했다. 2026-08-29에는 격리된 PostgreSQL 스키마에서 Backend E2E 14개를 통과했고 HTTP·HTTPS Nginx template 구문, 보안 헤더와 내부 AI 경로 차단을 확인했다. 이 과정에서 세션을 떠난 캐릭터가 계속 활성으로 보이는 문제와 시나리오의 축약 VTT map이 decoder에서 사라지는 문제를 수정했다.

GitHub PR 기록 삭제, Google API key 교체, 추가 credential·세션 판단과 원격 CI는 사용자 결정에 따라 이 계획의 완료 목표에서 제외했다. 실제 OAuth 공급자와 R2 외부 연결 smoke test도 2026-08-29 사용자 결정에 따라 수행하지 않고 완료 조건에서 제외했다. 운영용으로 보이는 로컬 자격 증명은 사용하지 않았다.

### 처음 보는 개발자를 위한 다음 행동

다음 한 단계가 끝나면 전체 보안 계획을 완료로 바꿀 수 있다.

1. 비운영 스테이징에서 테스트 계정과 전용 R2 버킷으로 Kakao·Discord callback,
   정상 이미지 업로드와 잘못된 요청 거부를 확인한다.

각 단계의 구체적인 순서와 주의사항은
[`security_operations_runbook.md`](security_operations_runbook.md)에 있다.
비밀값을 문서나 CI 로그에 복사하면 안 된다.

## 2. 항목별 상태

| ID | 상태 | 구현·검증 결과 | 추가 운영 확인 |
| --- | --- | --- | --- |
| SEC-01 | 검증 완료 | REST와 WebSocket 신원을 서명된 access token의 `sub`로 통일하고 기본 거부 guard, 서명된 guest token, 위조 ID 거부 테스트를 추가했다. 로컬 PostgreSQL E2E에서 일반 사용자·게스트 흐름을 확인했다. | 없음 |
| SEC-02 | 코드 완료 | 운영 CORS allowlist fail-close, refresh cookie 정책, double-submit CSRF, 전체 로그아웃과 proxy hop 검증을 적용했다. | 실제 배포 Origin과 proxy hop 확인 |
| SEC-03 | 검증 완료 | dump·AI 원문 로그와 과거 `ai/.env.example`을 현재 트리와 쓰기 가능한 refs에서 제거하고 재유입을 차단했다. Gitleaks 전체 이력과 현재 변경 검사가 통과했다. | 없음. provider 관리 PR 기록과 운영 자격 증명 작업은 이번 목표에서 제외 |
| SEC-04 | 코드 완료 | 운영 JWT secret 최소 길이, `jsonwebtoken 9.0.3` 기반 HS256 allowlist·issuer·audience·만료 검증, access 10분/refresh 14일/재인증 5분, token version과 폐기 경로를 구현했다. 비밀번호 변경·복구·전체 로그아웃·탈퇴·게스트 전환 시 기존 refresh token을 폐기하고 인증 user room의 Socket을 즉시 종료한다. | migration 적용 및 강제 로그아웃 공지 |
| SEC-05 | 검증 완료 | 공개 사용자·세션 DTO에서 이메일, 내부 ID, role, auth provider를 제외하고 contract test와 PostgreSQL E2E를 통과했다. | 없음 |
| SEC-06 | 검증 완료 | NestJS 11.1.29, Swagger 11.4.6, Config 4.0.4, CLI 11.0.24와 Vite 6.4.3으로 전환하고 안전한 `js-yaml`·`socket.io-adapter` override를 적용했다. 2026-08-29에 새로 공개된 `deepmerge-ts` High 권고도 8.0.1 override로 해소했다. 전체 회귀와 production build가 통과했다. | 없음. 원격 CI는 이번 목표에서 제외 |
| SEC-07 | 코드 완료 | 인증·복구·OAuth·업로드·AI·Socket 경로에 IP/계정/사용자 단위 제한, AI 동시성·일일 한도와 Nginx 제한을 추가했다. 프로세스 내 고정 창 limiter의 key map도 상한과 만료 정리, 포화 시 fail-close를 적용했다. | 운영 트래픽 기준 튜닝과 429 모니터링 |
| SEC-08 | 검증 완료 | 일회용·만료형 OAuth transaction, state hash, PKCE S256, provider/intent/user/redirect 결합 검증을 구현하고 보안 계약 테스트를 통과했다. | 없음. 실제 provider smoke test는 완료 조건에서 제외 |
| SEC-09 | 검증 완료 | access token과 세션 snapshot을 메모리에만 보관하고 기존 localStorage 값을 제거한다. 운영 Swagger 기본 비활성화와 CSP/HSTS 등 Nginx 헤더를 추가했다. HTTP 응답 헤더, HTTPS template 구문과 내부 AI 경로 404를 로컬 Nginx에서 확인했다. | 없음 |
| SEC-10 | 검증 완료 | 실제 이미지 decode, MIME 일치, 단일 frame, byte/dimension/pixel/quota 검사 후 metadata 없는 안전 형식으로 재인코딩한다. R2 public URL과 앱 Origin 비교도 정규화해 trailing slash 우회를 막았고 업로드 보안 계약 테스트를 통과했다. | 없음. 실제 R2 smoke test는 완료 조건에서 제외 |

## 3. 검증 증거

### 통과

| 범위 | 실행 명령 | 결과 |
| --- | --- | --- |
| Backend 전체 단위 테스트 | `npm test` | 148 suites, 1,276 tests 통과 |
| Backend PostgreSQL E2E | 격리 DB와 스키마에서 `npm run test:e2e -w @trpg/be -- --runInBand` | 1 suite, 14 tests 통과. 회원·게스트·AI/HUMAN GM·WebSocket 상태·공개 DTO 흐름 포함 |
| OAuth·업로드 보안 표적 회귀 | OAuth transaction, browser security, image upload, scenario service spec | 4 suites, 51 tests 통과 |
| Nginx template·응답 | `nginx:alpine`에서 HTTP·HTTPS 각각 `nginx -t`, 로컬 HTTP smoke | 두 template 구문 통과. CSP·nosniff·Referrer·Permissions·DENY 헤더 확인, `/ai/`와 `/internal/ai/` 404 |
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

### 수행하지 않기로 한 외부 환경 검증

| 검증 | 상태 | 사유/후속 조치 |
| --- | --- | --- |
| OAuth·R2 실제 연결 smoke test | 범위 제외 | 운영 값을 재사용하지 않았으며 2026-08-29 사용자 결정에 따라 실행하지 않고 완료 조건에서 제외했다. |

## 4. 해소 결과와 남은 출시 차단

### 4.1 Node High 취약점 해소

승인에 따라 NestJS 10에서 11.1.29로 전환했다. 함께 `@nestjs/swagger` 11.4.6, `@nestjs/config` 4.0.4, `@nestjs/cli` 11.0.24를 적용했다. 현재 상위 패키지가 안전하지 않은 정확 버전을 고정하는 세 경로는 root override로 `js-yaml` 5.2.3, `socket.io-adapter` 2.5.8, `deepmerge-ts` 8.0.1을 사용한다. 이 때문에 `npm ls`가 상위 패키지의 정확 버전 선언과 override의 차이를 `invalid`로 표시할 수 있으나, lockfile 기반 `npm ci`는 성공하며 실제 설치 버전과 운영 audit 결과를 별도 검증했다.

2026-08-29 재감사에서 `@prisma/config` 6.19.3이 정확 버전 7.1.5로 고정한 `deepmerge-ts`에 [스택 고갈 High 권고](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)가 새로 확인됐다. [Prisma upstream 추적 이슈](https://github.com/prisma/orm/issues/30052)의 소비자 완화안에 따라 8.0.1을 override했다. npm 11.6.2의 [workspace override 갱신 회귀](https://github.com/npm/cli/issues/9659) 때문에 lockfile 갱신에는 npm 10.9.8을 사용했으며, 완성된 lockfile은 npm 11.6.2의 실제 `npm ci`에서도 8.0.1로 재현됐다.

깨끗한 `npm ci`, Prisma Client 생성·schema 검증, Backend 148 suites·1,276 tests, Frontend 18 files·44 tests, AI 278 tests와 통합 production build가 통과했다. `npm audit --omit=dev`와 Python 운영 잠금 환경 audit는 모두 0건이다. 개발 전용 의존성은 운영 gate와 분리해 Dependabot과 정기 CI에서 계속 추적한다.

승인에 따라 Vite 5.4.21을 정확 버전 Vite 6.4.3으로 전환했다. `@vitejs/plugin-react` 4.7.0과 `vitest` 3.2.7은 설치 트리에서 같은 Vite 6.4.3 인스턴스를 사용한다. 깨끗한 `npm ci`, Frontend 18 files·44 tests, TypeScript·Vite production build가 통과했고 전체 개발·운영 의존성 감사 결과는 0건이다. build에는 기존 500 kB 초과 chunk 경고만 남으며 이는 별도의 성능 최적화 항목이다.

`.github/workflows/security.yml`의 `node-audit` job은 `npm audit --omit=dev --audit-level=high`를 독립 병합 gate로 유지한다. `node-regressions` job은 깨끗한 설치 후 Prisma Client를 생성하고 테스트·build 증거를 남긴다. `.github/dependabot.yml`은 npm, uv와 GitHub Actions를 정기 검사한다.

### 4.2 Git 공유 이력 정리 결과와 범위 제외 기록

2026-08-12 승인된 작업 시간에 `git-filter-repo --sensitive-data-removal --invert-paths`를 사용해 다음 다섯 경로를 제거했다.

- `exec/dump/dump-a201-202605211138.sql`
- `runtime_logs/harness_history.jsonl`
- `runtime_logs/interpreter.latest.json`
- `runtime_logs/npc-dialogue.latest.json`
- `ai/.env.example`

`--force-with-lease`로 원격 브랜치 3개를 갱신한 뒤, 전체 mirror push로 쓰기 가능한 `refs/merge-requests/186`~`190`의 head·merge refs 10개도 갱신했다. 새 원격 mirror에서 branch와 merge-request refs의 5개 대상 경로는 0건이다. 최종 원격 branch SHA는 UX-remediation `561cea7bf99edcccf616ce433039b5a0aa32fe43`, develop `a6476b1d3014f7331e9dda8af32dfd1bd17fcec5`, master `0fcf7fff35860ebf884c6e5d8c02179d99d973c6`다. 현재 로컬의 모든 브랜치·stash·Codex checkpoint tree·연결 작업 트리도 같은 방식으로 정리했고, 로컬 전용 12개 커밋과 두 작업 트리의 미커밋 변경은 그대로 보존했다.

GitHub가 관리하는 `refs/pull/1/head`~`refs/pull/11/head`는 읽기 전용이라 push가 거부됐으며, 새 mirror에서도 이 11개 ref만 과거 객체를 계속 참조한다. 이 기록은 과거 조사 증거로 보존한다.

- 저장소: `online-TRPG/online-TRPG`
- 영향받는 pull request refs: 11개, PR #1~#11
- First Changed Commit: `7257adf24c7ce0570949345c1422ed7128667e51`
- LFS: 사용하지 않음
- 요청 내용: affected PR refs dereference, server garbage collection, cached views 제거

GitHub Support 요청과 PR refs 제거는 2026-08-29 사용자 결정에 따라 이번 계획의 완료 조건에서 제외했다. 쓰기 가능한 refs와 현재 트리의 재유입 방지만 SEC-03 완료 범위로 본다.

### 4.3 노출 분류와 자격 증명

로컬 비노출 분류 결과는 다음과 같다.

- dump는 225,018 bytes의 PostgreSQL custom archive이며 magic header가 `PGDMP`다. 로컬에 `pg_restore`가 없어 실제 table data 포함 여부를 확인하지 못했으므로, 격리 환경에서 확인할 때까지 인증 필드를 포함한 전체 DB dump로 취급한다.
- `harness_history.jsonl`은 약 220 KB이며 `rawInput`, `rawOutput`, `request`, `response`, `playerText`, `dialogue`, `sessionId`, `actorCharacterId` 등의 키를 포함한다.
- 두 `*.latest.json` 파일은 request/response, AI trace, session·turn·character 식별자와 provider request 식별자를 포함한다.
- Gitleaks 전체 이력 검사는 과거 `ai/.env.example`에서 유효한 형식의 `GOOGLE_API_KEY`를 발견했다. 값은 문서와 검사 로그에 남기지 않았고 쓰기 가능한 원격·로컬 refs에서 해당 파일을 제거했다. 활성 여부 확인과 교체는 이번 계획의 목표에서 제외했다.
- Gitleaks 8.30.1은 [탐지가 동작하지 않을 수 있는 회귀](https://github.com/gitleaks/gitleaks/issues/2170)가 보고되어 8.30.0으로 고정했다. workflow는 checksum 검증 후 합성 AWS canary가 실제로 탐지되는지 먼저 확인하며, 그 뒤 전체 이력을 `--redact=100`으로 검사한다. 로컬에서는 전체 411 commits와 현재 변경이 통과했다.

이력 재작성·강제 push는 완료했다. Google API key 교체와 추가 credential·세션 판단은 2026-08-29 사용자 결정에 따라 이번 계획의 완료 조건에서 제외했다. 이 절은 당시 조사 사실만 보존한다.

## 5. 완료 판정

PostgreSQL E2E와 Nginx 검증은 로컬 격리 환경에서 완료했다. OAuth transaction과 이미지 업로드 보안 계약 테스트도 통과했다. 실제 OAuth·R2 외부 연결 smoke test는 사용자 결정에 따라 완료 조건에서 제외했으므로 `completed/security_remediation_plan.md`의 조정된 완료 조건을 충족한 것으로 판정한다.
