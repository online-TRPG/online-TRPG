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

## 향후 추가 예정 절차

- HTTPS 인증서 수동 갱신 / 만료 임박 대응
- OAuth secret 회전 (Kakao / Discord)
- Jenkins env-* credential 갱신 절차
- 잔존 orphan volume 정리
