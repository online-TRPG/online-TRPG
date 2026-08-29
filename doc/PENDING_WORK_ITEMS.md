# 미완료 작업 목록 (Pending Work Items)

상태: 진행 중 — 서로 독립적인 후속 작업을 우선순위별로 관리함

이 문서는 현재 진행 중인 계획과 완료 보관 문서에서 남은 후속 작업을 따로 모은다.

## 처음 보는 개발자를 위한 요약

이 파일은 한 기능의 구현 순서가 아니라 여러 완료 문서에서 남은 일을 모은
백로그다. 아래 표의 “완료 확인”까지 증거를 남겨야 항목을 지울 수 있다.

| 우선순위 | 남은 분야 | 쉽게 말하면 | 완료 확인 |
| --- | --- | --- | --- |
| 1 | 빈 DB migration | 새 데이터베이스에서도 수동 `db push` 없이 migration만으로 서버를 시작할 수 있어야 한다. | 빈 PostgreSQL에 migration, seed, Backend 기동이 순서대로 성공함 |
| 2 | 공개 배포 재검증 | 실제 공개 주소에서 내부 AI 경로가 닫히고 인증 경계가 동작하는지 확인해야 한다. | health 200, 내부 경로 404, 미인증 401, 비멤버 403을 기록함 |
| 3 | AI 평가·장애 검증 | AI 응답 품질과 timeout/fallback이 감이 아니라 수치로 비교되어야 한다. | 고정 테스트셋, scorer, 느린 provider 재현 결과가 있음 |
| 4 | 자산 관리 UX | 이미지를 썸네일로 찾고 이름 변경·검색·안전한 삭제를 할 수 있어야 한다. | 선택·검색·삭제 사용자 흐름과 참조 보호 테스트가 통과함 |
| 장기 | 확장 기능 | Director 힌트, 고급 NPC, 대규모 협동 등은 출시 차단이 아닌 후속 확장이다. | 별도 계획과 우선순위가 승인됨 |

처음 작업한다면 3절의 `fresh DB migration bootstrap`부터 시작한다. 이는 새
환경 배포 자체를 막을 수 있는 항목이다. 나머지는 서로 독립적이므로 각
소제목을 별도 작업과 검증 기록으로 관리한다.

원본 보관 위치:

- `completed/PLAN_IMPLEMENTATION_WORKFLOW.md`
- `completed/PLAN_SCENARIO_ASSET_LIBRARY.md`
- `completed/ai_server_reliability_remediation_plan.md`

## 1. 구현 워크플로 후속 작업

출처: `PLAN_IMPLEMENTATION_WORKFLOW.md`

### 평가 하네스 고도화

- Promptfoo 또는 동등한 평가 실행 구성을 만든다.
- interpreter, actor, narrator, end-to-end 테스트셋을 운영 가능한 형태로 정리한다.
- scorer 함수를 두어 해석 정확도, validator 실패율, fallback 비율을 수치화한다.
- 프롬프트, 모델, 구조 변경 전후의 성능 비교를 자동화한다.

### Director와 힌트 시스템

- 플레이어가 막혔을 때 Director가 개입할 조건을 정의한다.
- 공개 정보만 기반으로 힌트를 제안하는 제품 흐름을 연결한다.
- 힌트 요청, 자동 개입, 실패 fallback의 로그/검증 경로를 정리한다.

### 전투와 NPC 고도화

- NPC 행동 후보 생성 품질을 높인다.
- 난이도 조절 실험 기준을 만든다.
- 기본 전투 루프 이후의 더 복잡한 전투/NPC 의사결정 흐름을 확장한다.

### 배포와 시연 검증

- 시연용 URL 또는 실행 환경이 실제로 준비되었는지 점검한다.
- 최소 1개 시나리오를 처음부터 끝까지 시연 가능한지 확인한다.
- 장애 대응 fallback 시연 시나리오를 준비하거나 검증한다.

### P2/P3 후속 확장

- 장기 요약 메모리를 개선한다.
- 콘텐츠 관리 UI를 고도화한다.
- 대규모 다중 사용자 실시간 협동을 검토한다.
- 다양한 룰셋 지원을 검토한다.
- 운영 모니터링을 고도화한다.
- 대형 콘텐츠 확장을 계획한다.

## 2. 시나리오 자산 라이브러리 후속 작업

출처: `PLAN_SCENARIO_ASSET_LIBRARY.md`

### 자산 선택 UX 정리

- 외부 URL 직접 입력 UI를 숨기거나 보조 옵션으로 낮춘다.
- 맵/장면 이미지 선택 흐름이 기본적으로 업로드와 라이브러리 선택 중심인지 확인한다.
- 파일명만으로 고르는 흐름보다 썸네일 기반 선택을 우선한다.

### 삭제 정책 고도화

- 자산 삭제 시 현재 노드나 맵에서 사용 중인지 안내한다.
- 필요하면 "라이브러리에서 제거"와 실제 저장소 삭제 정책을 분리한다.
- 삭제 confirm 문구와 참조 해제 동작을 명확히 한다.

### 목록 관리 기능

- 자산 이름 변경을 지원한다.
- 정렬 옵션을 추가한다.
- 검색 또는 필터링을 추가한다.

### 이미지 처리 고도화

- 성능 문제가 생기면 썸네일 variant를 추가한다.
- 필요 시 이미지 변환 파이프라인을 검토한다.

### 참조 모델 확장

- 지금은 런타임에서 `imageUrl` projection을 유지한다.
- 후속으로 `ScenarioNode.imageAssetId` 또는 `ScenarioNodeMapAssetRef` 같은 asset id 기반 참조 정규화를 검토한다.

### 장기 보류 항목

- 전역 자산 라이브러리
- 자산 폴더/태그
- 이미지 크롭/버전 관리

## 3. AI 서버 안정성·계약 개선 후속 작업

출처: `ai_server_reliability_remediation_plan.md`

### 공개 배포 재검증

- 공개 배포 환경이 다시 준비되면 `/api/v1/health`가 정상 응답하는지 확인한다.
- 공개 `/ai/`와 `/internal/ai/`가 404로 차단되는지 확인한다.
- 공개 NestJS 경계에서 미인증 401, 비멤버 403과 거부 요청의 AI trace 미증가를 확인한다.

### 운영 장애 재현

- 실제 느린 provider 또는 네트워크 조건에서 total deadline과 fallback 횟수를 재확인한다.
- 운영 trace에서 provider latency, token usage, schema retry율의 장기 표본을 축적한다.

### fresh DB migration bootstrap

- 현재 첫 migration이 기존 테이블을 전제로 해 빈 PostgreSQL에서 `prisma migrate deploy`가 실패하는 migration chain을 정리한다.
- Jenkins의 `prisma db push` 배포 절차와 장기 migration 정책을 명시적으로 구분한다.
- 빈 DB에서 migration만으로 schema 생성 후 BE seed·기동까지 성공하는 검증을 추가한다.
