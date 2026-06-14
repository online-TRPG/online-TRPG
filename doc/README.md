# 문서 지도

이 폴더의 문서는 현재 기준 문서와 과거 개발 기록이 함께 있다. 새로 합류한 사람은 아래 순서로 읽는다.

## 현재 기준 문서

| 문서 | 역할 |
| --- | --- |
| `PRODUCT_SCOPE.md` | MVP 범위, 제약, 라이선스 기준 |
| `PRODUCT_OVERVIEW.md` | 제품/아키텍처 큰 그림 |
| `QUALITY_MVP_ACCEPTANCE.md` | MVP 완료 판정 기준 |
| `RULESET_SRD5E_MVP.md` | SRD 5e 기반 최소 룰 범위 |
| `DOMAIN_MODEL.md` | 도메인 모델과 상태 변경 개념 |
| `ERD_MVP_SESSION_SERVICE_MODEL.md` | Prisma/DB 관점의 상세 모델 |
| `RUNTIME_SESSION_TURN_FLOW.md` | 플레이어 행동 1회 처리 흐름 |
| `AI_RUNTIME_CONTRACTS.md` | AI 역할별 입출력 계약 |
| `SCREEN.md` | 주요 화면 구성 |
| `PLAN_SCENARIO_ASSET_LIBRARY.md` | 시나리오 이미지 업로드, R2 저장, 자산 라이브러리, 맵 재사용 구조 |

## 기록용 문서

`dev-notes/`는 특정 날짜의 구현 배경과 당시 확인 결과를 보관하는 기록이다. 현재 API, 실행법, 모델 구조의 기준으로 삼지 않는다. 현재 기준과 충돌하면 위의 현재 기준 문서와 실제 코드가 우선이다.

## 중복 관리 원칙

- 제품 범위는 `PRODUCT_SCOPE.md`에 둔다.
- 완료 기준은 `QUALITY_MVP_ACCEPTANCE.md`에 둔다.
- 런타임 흐름은 `RUNTIME_SESSION_TURN_FLOW.md`에 둔다.
- DB 상세는 `ERD_MVP_SESSION_SERVICE_MODEL.md`에 둔다.
- AI 필드 상세는 `ai/AI_STUDIO_IO_FIELD_REFERENCE.md`에 둔다.
- 날짜별 작업 내역은 `dev-notes/`에만 둔다.
