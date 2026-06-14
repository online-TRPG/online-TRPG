# 개발 노트 - 2026-04-24 14:00

## 1. 문서 정보
- 작성 시각: 2026-04-24 14:00 (Asia/Seoul)
- 작성자: 김수명 (인프라)
- 작성 목적: 2026-04-24에 진행한 인프라 작업 내용을 팀에 공유. Jenkins 파이프라인 첫 배포 SUCCESS 달성까지의 변경점과, 현재 팀 다른 파트에 영향이 갈 수 있는 블록 이슈 정리
- 기록 범위: `Jenkinsfile`, `be/Dockerfile`, `infra/nginx/Dockerfile`, 루트 `.dockerignore`, `be/prisma/schema.prisma`, `ai/uv.lock`, EC2/Jenkins 컨테이너 환경 설정

## 2. 이번 작업 요약 (TL;DR)
- Jenkins 파이프라인 **첫 배포 SUCCESS**. 현재 `backend` / `ai-server` / `postgres` / `redis` / `ollama` 5개 컨테이너 기동 중.
- `nginx` / `certbot` 은 FE 타입 에러로 **임시 제외** 상태 (Jenkinsfile). → 외부 80/443 아직 닫혀 있음.
- Prisma provider 를 `sqlite` → `postgresql` 로 전환, Jenkins Deploy 단계에 `prisma db push` 통합.
- 각 파트에 요청사항은 §6 참고.

## 3. 오늘 커밋 (develop 기준, SuMyeong)

| 시각 (KST) | 해시 | 메시지 |
|---|---|---|
| 10:30 | `3fd217f` | chore: AI 서버 uv.lock 생성 |
| 10:42 | `0b55ec4` | fix(docker): npm workspaces 모노레포 대응 Dockerfile 개편 |
| 10:48 | `da845ab` | fix(docker): tsconfig.base.json 복사 추가 |
| 11:20 | `b8fefd6` | chore(ci): FE 타입 에러 동안 nginx/certbot 임시 제외 |
| 13:45 | `a217e65` | feat(db): Prisma provider sqlite → postgresql 전환 + CI 에 DB push 통합 |

## 4. 변경 상세

### 4.1 Docker 이미지 빌드 - 모노레포 대응 (`0b55ec4`, `da845ab`)
기존 Dockerfile 이 단일 워크스페이스 기준이라 npm workspaces + `shared-types` 의존 구조에서 전부 깨져 있었음. 다음과 같이 전면 재작성.

**be/Dockerfile (빌더 스테이지)**
- 루트 `package.json`, `package-lock.json`, 각 workspace `package.json` 복사 후 `npm ci`
- `tsconfig.base.json` 복사 (shared-types/be/fe 모두 `extends`)
- `shared-types` 먼저 빌드
- `prisma:generate -w @trpg/be` 실행 (nest build 전 필수)
- `nest build`

**be/Dockerfile (런타임 스테이지)**
- `npm ci --omit=dev` 로 production deps 재설치
- 빌더에서 생성된 `.prisma/client` 복사
- **Prisma CLI 포함** (`node_modules/prisma` + `.bin/prisma`) — `db push` 등 런타임 명령 지원
- `CMD ["node", "dist/main.js"]`

**infra/nginx/Dockerfile**
- 동일 workspaces 방식. shared-types 먼저 빌드 후 FE 빌드, `fe/dist/` 를 `nginx:alpine` 에 COPY
- 현재는 Jenkins 에서 호출 안 됨 (§4.3 참고)

**루트 `.dockerignore` 신규**
- `**/node_modules`, `.env*`, `.git` 등 빌드 컨텍스트 차단

**주의**: `tsconfig.base.json` 을 builder 스테이지에 복사하지 않으면 TS5083 + TS1240(decorator) 연쇄 실패 → `shared-types/be/fe` 전 파트 tsconfig 가 이 파일을 `extends` 하기 때문.

### 4.2 AI 서버 uv.lock (`3fd217f`)
- `ai/uv.lock` 최초 생성/커밋.
- 로컬 파이썬 환경 영향 없도록 `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` 이미지로 `uv lock` 실행 후 산출물만 커밋.

### 4.3 FE 타입 에러로 nginx/certbot 임시 제외 (`b8fefd6`)
- FE 에 타입 에러가 남아 있어 `infra/nginx/Dockerfile` 빌드가 실패 → 전체 파이프라인 블록됨.
- Jenkinsfile Build/Deploy 단계에서 **nginx/certbot 만 제외**하고 backend/ai-server 위주로 먼저 기동.
- 복구 조건 (§6 참고).

### 4.4 Prisma sqlite → postgresql 전환 (`a217e65`)
`be/prisma/schema.prisma` 의 provider 가 `sqlite` 로 박혀 있어, 컨테이너 자체는 뜨지만 실제 API 요청 시 DB 에러가 예상되는 상태였음. 다음을 교체:

- `datasource db.provider`: `"sqlite"` → `"postgresql"`
- 스키마 필드(String/Int/DateTime/Boolean/enum)가 둘 다 지원되는 타입이라 **모델 변경 없이 provider 만 교체**.
- `.env.backend` 에 `DATABASE_URL=postgresql://a201:a201ssafy%21@postgres:5432/a201?schema=public` 추가 (비밀번호 `!` 는 `%21` URL-encode).
- Jenkins Credentials `env-backend` 재업로드 완료.

**Jenkinsfile Deploy 3단계 분리**
1. `docker compose up -d --wait postgres redis ollama ai-server` — 데이터 계층 healthy 대기
2. `docker compose run --rm --entrypoint "" backend sh -c "cd /app/be && npx prisma db push --schema prisma/schema.prisma --skip-generate --accept-data-loss"` — DB 스키마 동기화 (임시 컨테이너)
3. `docker compose up -d backend` — 백엔드 기동

마이그레이션 폴더가 없어 `prisma migrate deploy` 대신 `db push` 사용. **초기 개발 단계에서만 허용**하는 방식이며, 나중에 모델 확정 시 `prisma migrate` 기반으로 바꿔야 함.

## 5. 현재 인프라 상태 요약

### 5.1 Jenkins
- Job 유형: **Multibranch Pipeline** (`trpg_develop` workspace 경로)
- 트리거: `develop` push → 자동 빌드 + 배포 / 그 외 브랜치 → 빌드만
- Credentials (Secret file):
  - `env-root` — POSTGRES/REDIS 등 공통 env
  - `env-backend` — BE 전용 env (DATABASE_URL, JWT_SECRET 반영됨)
  - `env-ai` — AI 서버 전용 env

### 5.2 Jenkins 컨테이너 함정 ⚠️
- Debian trixie 베이스 이미지에 Docker repo 미등록 → `apt` 로 compose plugin 설치 불가.
- 따라서 compose 바이너리를 수동 설치함: `/usr/libexec/docker/cli-plugins/docker-compose` (v2.29.7)
- **컨테이너 재생성 시 날아감**. 재생성할 일이 있으면 반드시 다시 설치할 것.

### 5.3 EC2 호스트
- 호스트 자체에 compose plugin 설치 필요 (예정 경로 `/usr/local/lib/docker/cli-plugins/docker-compose`).
- 현재 설치되어 있는지 확인 필요 — 없으면 호스트 셸에서 `docker compose exec/logs/ps` 전부 불가.

### 5.4 주요 env / 인증
- DB: `POSTGRES_USER=a201`, `POSTGRES_PASSWORD=a201ssafy!`, `POSTGRES_DB=a201`
- Redis: `REDIS_PASSWORD=a201ssafy!`
- JWT_SECRET: 실제 값으로 교체 완료 (`openssl rand -base64 32` 기반). 로컬 `.env.backend` + Jenkins Credentials 둘 다 반영.
- 컨테이너 내 DATABASE_URL: `postgresql://a201:a201ssafy%21@postgres:5432/a201?schema=public`

## 6. 팀 파트별 요청 사항

### 6.1 FE 담당 (우선순위 🔴 높음 — 외부 접근이 막혀 있음)
- `fe/src/app/App.tsx` 의 `snapshot.characters` 접근 코드가 타입 에러. `SessionSnapshotDto` 에는 `sessionCharacters` 필드만 있음.
- 해당 파일 외에도 네이밍 불일치 영향 **13군데** 정도 파급.
- 이 에러가 풀려야 `infra/nginx/Dockerfile` 빌드가 가능해지고, Jenkinsfile 에서 `nginx/certbot` 복구가 가능해짐.
- 복구 절차:
  1. FE 타입 에러 해결
  2. `docker compose build --pull backend ai-server`
  3. `docker compose build --pull` (전체)
  4. `docker compose up -d postgres redis ollama ai-server backend`
  5. `docker compose up -d` (nginx/certbot 포함 전체 기동)

### 6.2 BE 담당
- Prisma provider 전환(`a217e65`)은 인프라 측에서 완료. 이제 `DATABASE_URL` 기준 동작.
- **마이그레이션 전략 결정 필요** — 현재 CI 는 `prisma db push --accept-data-loss`. 스키마 바뀌면 DB 날아감. 모델이 안정화되면 `prisma migrate` 로 전환 협의 요청.
- 로컬 개발 시 `DATABASE_URL` 이 필요해졌음 (`.env.backend` 참고).

### 6.3 AI 담당
- `ai/uv.lock` 이 추가됐으니 로컬에서 `uv sync` 로 재현 가능.
- 현재 AI 서버는 컨테이너로 기동은 되지만 실제 LLM 게이트 로직은 파트 담당 영역. Ollama 컨테이너는 같은 compose 네트워크에 띄워져 있음.

## 7. 다음 세션 할 일 (인프라 관점, 우선순위 순)
1. EC2 호스트에 compose plugin 설치 확인/설치
2. FE 타입 에러 해결 대기 → nginx/certbot 복구
3. TLS 런북 재개 — Phase 1(HTTP) 검증 → Certbot staging → real 발급 → Phase 2(HTTPS) 전환
4. Prisma 를 `db push` → `migrate deploy` 로 전환 (BE 모델 안정화 후)

## 8. 참고
- 배포 도메인: `k14a201.p.ssafy.io`
- 문의: 양수명
