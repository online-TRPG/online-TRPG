# 3. DB 덤프 가이드

DB 덤프 파일 최신본과 추출/복원 절차를 정리한 문서입니다.

---

## 3.1 DBMS 정보

| 항목 | 값 |
|---|---|
| DBMS | PostgreSQL 16 (`postgres:16-alpine`) |
| 데이터베이스 | `a201` |
| 스키마 | `public` |
| 덤프 형식 | PostgreSQL custom format (`pg_dump -Fc`) |

---

## 3.2 덤프 파일 최신본

- **위치**: `exec/dump/` 폴더에 최신 덤프 파일(`.dump`)을 업로드합니다.
- **파일명 규칙**: `a201-dump-YYYYMMDD.dump`
- 운영 환경은 배포 시마다 `db_backups` Docker named volume 에 자동 백업되며,
  파일명은 `pre-deploy-<branch>-<build#>-<short_sha>.dump` 형식입니다(최근 20개 유지).

> 📌 제출 시: 아래 3.3 절차로 최신 덤프를 추출해 `exec/dump/` 에 넣어 주세요.

---

## 3.3 덤프 추출 방법

### 방법 A. 실행 중인 컨테이너에서 직접 추출 (권장)

```bash
# EC2 호스트에서 실행 — 컨테이너 안에서 pg_dump 후 호스트로 복사
docker exec -t $(docker ps -q -f name=postgres) \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > a201-dump-$(date +%Y%m%d).dump
```

### 방법 B. 배포 시 자동 생성된 백업 파일 추출

```bash
# db_backups 볼륨에 쌓인 최신 자동 백업을 호스트로 복사
PG=$(docker ps -q -f name=postgres)
LATEST=$(docker exec "$PG" sh -c 'ls -t /backups/pre-deploy-*.dump | head -1')
docker cp "$PG:$LATEST" ./a201-dump-$(date +%Y%m%d).dump
```

---

## 3.4 덤프 복원 방법

```bash
# 1) 덤프 파일을 postgres 컨테이너로 복사
docker cp ./a201-dump-YYYYMMDD.dump $(docker ps -q -f name=postgres):/tmp/restore.dump

# 2) pg_restore 로 복원 (--clean: 기존 객체 삭제 후 복원)
docker exec -t $(docker ps -q -f name=postgres) \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists /tmp/restore.dump'
```

> 신규 환경에 복원하는 경우, 복원 전 `prisma db push` 로 스키마가 먼저 생성돼 있어야
> 충돌 없이 데이터가 들어갑니다. (또는 `pg_restore` 가 스키마까지 복원하도록 빈 DB 에 복원)

---

## 3.5 체크리스트

- [ ] `exec/dump/a201-dump-YYYYMMDD.dump` 최신본 업로드 완료
- [ ] 덤프 파일에 민감 개인정보가 포함되지 않았는지 확인(필요 시 마스킹)
