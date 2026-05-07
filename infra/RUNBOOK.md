# 운영 절차 RUNBOOK

이 문서는 **prod 환경 (k14a201.p.ssafy.io)** 의 사고 대응 / 정기 작업 절차를 모은다.
사고 발생 시 EC2 SSH 부터 시작해 이 절차를 그대로 따라가면 복구 가능해야 한다.

운영 진입 경로 두 가지 (DooD 환경):

1. **Jenkins 컨테이너 진입** — `docker exec -it jenkins bash` → `cd /var/jenkins_home/workspace/trpg_develop` → `docker compose ...` 실행
2. **호스트에서 docker 직접** — `docker ps`, `docker logs <name>`, `docker exec <name> ...` 등

EC2 호스트 자체엔 compose plugin 없음 (`docker compose ls` 정도만 동작).

---

## DB 복구 (`--accept-data-loss` 사고 대응)

### 배경

`Jenkinsfile` 의 `Deploy (develop only)` 스테이지는 매 develop 머지 시
`prisma db push --accept-data-loss` 를 실행한다. 이 옵션은 destructive 변경
(칼럼 drop, 타입 변경, NOT NULL 화 등) 을 확인 없이 강행해 **prod 데이터를 날릴 수 있다**.

가드레일로 push **직전**에 `pg_dump -Fc` 를 named volume `db_backups` 에 떨군다.
파일명: `pre-deploy-${BRANCH}-${BUILD_NUMBER}-${SHORT_SHA}.dump` (last 20 유지).

### 1. 백업 목록 확인

```bash
docker exec -it jenkins bash
cd /var/jenkins_home/workspace/trpg_develop
docker compose exec postgres ls -lt /backups/
```

가장 최근 또는 사고 직전 build 의 dump 를 식별. 빌드 번호 / SHA 로 어느 머지였는지 추적 가능.

### 2. 복구 절차

```bash
# 1) 쓰기 차단 — backend 정지 (nginx 는 502 반환)
docker compose stop backend

# 2) 복구 — --clean 으로 기존 객체 drop 후 restore
docker compose exec postgres sh -c \
  "pg_restore -U \$POSTGRES_USER -d \$POSTGRES_DB --clean --if-exists /backups/<DUMP_FILE>"

# 3) backend 재기동
docker compose up -d backend

# 4) 검증
docker compose logs --tail=50 backend
curl -s -o /dev/null -w "%{http_code}\n" https://k14a201.p.ssafy.io/api/v1/users/me
```

### 3. 백업 추출 (오프호스트 보관 / 감사)

named volume 이라 host 직접 접근 불가. alpine 컨테이너로 한 번 풀어서 복사:

```bash
# volume 이름 확인 (compose project prefix 가 붙음)
docker volume ls | grep db_backups

# 추출
docker run --rm \
  -v s14p31a201_db_backups:/data \
  -v "$PWD":/out \
  alpine cp /data/<DUMP_FILE> /out/
```

### 주의

- 복구 도중 누군가 `docker compose up -d backend` 를 실행하면 절반 복구 상태에서 쓰기가 들어와 정합성 깨짐. 복구 끝날 때까지 다른 작업자에게 알리고 진행할 것.
- `pg_restore --clean` 은 대상 DB 의 객체를 drop 한다. 잘못된 dump 를 복구하면 더 큰 데이터 손실 가능. **dump 파일명·생성 시각을 ls 로 한 번 더 확인**한 뒤 명령 입력.
- last 20 retention 이라 너무 오래된 사고는 dump 가 사라졌을 수 있음. Jenkins build 보존 갯수 (`numToKeepStr: '20'`) 와 정렬됨.

---

## Jenkins credential 회전 (env-root / env-backend / env-ai)

### 배경

`Jenkinsfile` 의 `Prepare env files` 스테이지가 매 빌드마다 Jenkins Credentials
3종 (Secret file) 을 workspace 의 `.env` / `.env.backend` / `.env.ai` 로 복사하고,
`docker compose up -d` 가 이를 컨테이너 `env_file` 로 주입한다.

**함정**: 평소 빌드는 `--force-recreate` 없는 `docker compose up -d` 라
**image hash 가 같으면 컨테이너를 재생성하지 않는다** → 새 credential 이 prod
에 반영되지 않는다. 회전 시엔 명시적인 recreate 가 필요.

(`--force-recreate` 자동화는 5-07 검토했으나 매 deploy 다운타임 + 컨테이너
IP 변화 trade-off 가 안 맞아 revert. 회전 빈도가 낮으니 수동 절차로 대신함.)

### 회전 절차

키별 발급/재발급은 외부 콘솔 (Google AI Studio / Kakao Developers /
Discord Portal / postgres password 등) 에서 진행 후:

```bash
# 1) Jenkins UI → Credentials → 해당 항목 (env-backend / env-ai / env-root)
#    → Update → "Replace" 체크하고 새 Secret file 업로드 → Save

# 2) Jenkins 컨테이너 진입 (또는 develop 에 빈 커밋 push 도 가능)
docker exec -it jenkins bash
cd /var/jenkins_home/workspace/trpg_develop

# 3) env 만 다시 복사하고 영향 받는 컨테이너만 강제 재생성
#    (postgres/redis 같은 stateful 은 건드리지 않음)
docker compose up -d --force-recreate backend ai-server

# 4) 새 env 가 들어갔는지 spot-check
docker compose exec backend printenv | grep -E "KAKAO|DISCORD|DATABASE_URL"
docker compose exec ai-server printenv | grep GOOGLE_API_KEY
```

### Kakao / Discord OAuth secret 회전

위 절차에서 `env-backend` 만 갱신.

- **Kakao**: https://developers.kakao.com → 내 애플리케이션 → 앱 키 → Client Secret 재발급
- **Discord**: https://discord.com/developers/applications → 해당 앱 → OAuth2 → Reset Secret

회전 후 콜백 URL (`https://k14a201.p.ssafy.io/auth/kakao/callback` 등) 변경
사항 없으면 추가 작업 없음. 카카오/디스코드 로그인 한 번씩 시도해 prod 검증.

### Google AI Studio API key 회전

위 절차에서 `env-ai` 만 갱신.

- https://aistudio.google.com/apikey → 옛 키 **revoke** → 새 키 **create** → 새 키를
  Jenkins Credentials `env-ai` 의 `.env.ai` 안 `GOOGLE_API_KEY` 값에 반영
- spot-check: `docker compose exec ai-server printenv | grep GOOGLE_API_KEY`
- 채팅이나 Slack 등에 새 키 paste 자제 (transcript 노출 위험 — 회전 사이클 또
  돌게 됨)

### postgres / redis 비밀번호 회전 (가장 위험)

`env-root` 의 `POSTGRES_PASSWORD` / `REDIS_PASSWORD` 변경은 **stateful 데이터
재초기화 위험**. 회전 시 절차:

1. **반드시 사전에 수동 dump 추출** (위 "DB 복구" 섹션 절차 참조).
2. postgres 의 경우, image entrypoint 는 PGDATA 가 이미 초기화된 상태면
   `POSTGRES_PASSWORD` env 를 무시한다 → 컨테이너 단순 재기동으론 비번
   안 바뀜. `ALTER USER` 로 SQL 수준에서 변경 필요:
   ```bash
   docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
     -c "ALTER USER \"$POSTGRES_USER\" WITH PASSWORD '<new>';"
   ```
3. 그 다음 Jenkins `env-root` Replace + `docker compose up -d --force-recreate
   backend` 로 새 비번 들고 재연결.
4. `docker compose logs backend` 로 connection error 없는지 확인.
5. redis 도 동일 패턴 — 단 redis 는 `--requirepass` 가 entrypoint flag 라
   재시작만으로 적용됨 (대신 ws 등 active 연결은 끊김).

---

## Orphan 컨테이너 / 볼륨 청소

### 배경

compose 정의에서 빠진 서비스의 컨테이너/볼륨이 그대로 남는 케이스가 있음.
실제 발생한 사례:

- **2026-04-28 ollama 제거** — compose 의 ollama 서비스/depends_on 제거 후에도
  `trpg_develop-ollama-1` 컨테이너가 13일째 살아있었음 (compose down 단독으론
  정의에서 빠진 컨테이너를 멈추지 않음)
- **2026-05-06 pg-recovery** — DB 복구 시 임시로 띄운 `pg-recovery` 컨테이너가
  복구 검증 후에도 21시간째 잔존

orphan 컨테이너는:
- 디스크 + RAM + (publish 된 경우) 포트 점유
- `docker ps` 결과 가독성 저하
- 옛 image 가 prune 되지 않아 `docker image prune` 효과 떨어짐

### 정기 점검

월 1회 또는 큰 deploy 후:

```bash
# 1) 현재 떠있는 컨테이너 + compose 정의 비교
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}"
docker exec -it jenkins bash -c \
  "cd /var/jenkins_home/workspace/trpg_develop && docker compose config --services"

# 2) compose services 에 없는 컨테이너가 trpg_develop-* 로 떠 있으면 orphan
#    또는 compose 와 무관하게 띄운 임시 컨테이너 (pg-recovery 등) 검토 후 제거

# 3) 제거 (data 손실 없는 stateless 컨테이너 한정)
docker rm -f <orphan-container-name>

# 4) 잔존 볼륨 (compose 정의에서 빠진 것)
docker volume ls
docker volume rm <orphan-volume-name>   # 데이터 보존 필요하면 미리 백업

# 5) 최종 정리
docker image prune -f
docker network prune -f
```

### 임시 복구 컨테이너 정리 체크리스트

`pg-recovery` 같이 사고 대응으로 임시 띄운 컨테이너는 상황 종료 시 즉시
정리해야 잊혀지지 않음:

- [ ] 데이터 무결성 확인 끝났나
- [ ] 임시 컨테이너에서 추가로 빼야 할 dump/log 가 있나
- [ ] `docker rm -f <임시이름>`
- [ ] 사용한 볼륨도 일회용이면 `docker volume rm <임시볼륨>`

---

## prisma schema 변경 시 client generate 빠뜨리지 않기

### 배경

`schema.prisma` 변경 후 `prisma db push` 만 하고 `prisma generate` 안 하면
**TypeScript 타입은 옛 client 그대로** → BE 빌드 실패 (`Property 'X' does not
exist on type ...`). Jenkinsfile 의 `db push` 에는 `--skip-generate` 가 박혀
있어 prod 빌드는 backend Dockerfile 의 `prisma generate` 단계가 따로 처리하지만,
**로컬 dev** 에서는 자주 빠뜨림.

### develop pull 후 schema.prisma 가 변경됐다면

```bash
git pull
git diff HEAD~1 -- be/prisma/schema.prisma   # 변경 있으면 아래 둘 다 실행
cd be && npx prisma db push --schema prisma/schema.prisma --skip-generate
cd be && npx prisma generate
```

또는 두 단계 한 번에:

```bash
npm run prisma:push -w @trpg/be   # push + generate 까지 한번에
```

증상이 보이면:
- `Property 'XYZ' does not exist on type ...` 가 schema 새 칼럼 이름이면 client
  미갱신 99%
- backend 컨테이너가 `onModuleInit` 의 seed 단계에서 `column does not exist`
  로 죽어 restart loop → `docker logs backend-1 --tail 50` 으로 확인 가능

---

## 향후 추가 예정 절차

- HTTPS 인증서 수동 갱신 / 만료 임박 대응
- 잔존 orphan 볼륨 자동 감지 (정기 cron)
