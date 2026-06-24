# 문서 지도

`doc` 바로 아래에는 문서 지도, 현재 진행 중인 작업, 향후 계획만 둔다. 프로젝트 구조 설명, 개발 원칙, 시나리오, 예시, 완료된 작업 기록은 아래 폴더로 분류한다.

## 루트 문서

| 문서 | 역할 |
| --- | --- |
| `README.md` | 문서 지도 |
| `PENDING_WORK_ITEMS.md` | 완료 보관 문서에서 남긴 후속 작업 목록 |
| `future_plan.md` | SRD 5e 룰/콘텐츠 확장 로드맵 |
| `future_plan_p6.md` | 현재 P6 최종 레벨·전체 콘텐츠·장기 캠페인 완결 계획 |
| `completed/future_plan_mvp.md` | 완료된 End-to-End Playable MVP 로드맵 기록 |
| `completed/future_plan_p1.md` | 완료된 P1 플레이 가능 룰 범위 확대 기록 |
| `completed/future_plan_p2.md` | 완료된 P2 5레벨 플레이 확장 기록 |
| `completed/future_plan_p3.md` | 완료된 P3 8레벨 캠페인·콘텐츠 배포 확장 기록 |
| `completed/future_plan_p4.md` | 완료된 P4 12레벨 캠페인 운영·콘텐츠 확장 기록 |
| `completed/future_plan_p5.md` | 완료된 P5 16레벨 고레벨 캠페인·공개 생태계 확장 기록 |
| `completed/p2_validation_guide.md` | P2 사용자 검증 절차와 완료 기록 |

## 구조 문서

`structure/`는 프로젝트의 현재 구조를 설명하는 기준 문서를 모아둔다.

| 문서 | 역할 |
| --- | --- |
| `structure/README.md` | 구조 문서 작성/정리 기준 |
| `structure/PRODUCT_OVERVIEW.md` | 제품/아키텍처 큰 그림 |
| `structure/PRODUCT_SCOPE.md` | MVP 범위, 제약, 라이선스 기준 |
| `structure/QUALITY_MVP_ACCEPTANCE.md` | MVP 완료 판정 기준 |
| `structure/RULESET_SRD5E_MVP.md` | SRD 5e 기반 최소 룰 범위 |
| `structure/ERD_MVP_SESSION_SERVICE_MODEL.md` | 세션, 시나리오, 런타임 데이터 모델 |
| `structure/RUNTIME_SESSION_TURN_FLOW.md` | 플레이어 행동 1회 처리 흐름 |
| `structure/AI_RUNTIME_CONTRACTS.md` | AI 역할별 입출력 계약 |
| `structure/SCREEN.md` | 주요 화면 구성 |
| `structure/trpg_main_command_mvp_flow_with_categories.md` | 메인 커맨드 처리 구조 |

## 시나리오 문서

`scenarios/`는 프로젝트에서 사용하는 시나리오 문서를 모아둔다.

| 문서 | 역할 |
| --- | --- |
| `scenarios/DEMO_SCENARIO.md` | 데모 시나리오 본문 |

## 개발 원칙 문서

`rules/`는 개발과 설계 과정에서 지켜야 하는 원칙과 그 이유를 모아둔다.

| 문서 | 역할 |
| --- | --- |
| `rules/README.md` | rules 폴더의 목적과 문서 목록 |
| `rules/ARCHITECTURE_RULES.md` | 상태, 턴 처리, 서버 권위성, 동시성 원칙 |
| `rules/PERMISSION_RULES.md` | 방장, 사람 GM, AI GM, 플레이어 권한 분리 원칙 |
| `rules/AI_RUNTIME_RULES.md` | AI 호출, 검증, fallback, 로깅 원칙 |
| `rules/CONTENT_LICENSE_RULES.md` | SRD, 시나리오, 이미지, 룰 데이터 사용 원칙 |
| `rules/DOCUMENTATION_RULES.md` | 문서 분류, 중복 관리, 완료 문서 보관 원칙 |

## 예시 문서

`examples/`는 구조 이해를 돕는 예시, 샘플, 운영 팁을 모아둔다.

| 문서 | 역할 |
| --- | --- |
| `examples/trpg_main_command_usage_examples.md` | 메인 커맨드 사용 예시 |
| `examples/DEMO_SCENARIO_EXAMPLES.md` | 데모 시나리오 테스트/구현/운영 예시 |
| `examples/P5_VALIDATION_RUNBOOK.md` | P5 자동·수동 검증 절차 |

## 기록용 문서

`dev-notes/`는 특정 날짜의 구현 배경과 당시 확인 결과를 보관하는 기록이다. 현재 API, 실행법, 모델 구조의 기준으로 삼지 않는다. 현재 기준과 충돌하면 `structure/` 문서와 실제 코드가 우선이다.

`completed/`는 구현 계획, UI 설계, 점검표 중 대응 작업이 끝나 현재 작업 체크리스트로 보지 않아도 되는 문서를 보관한다.

## 중복 관리 원칙

- 제품 범위는 `structure/PRODUCT_SCOPE.md`에 둔다.
- 완료 기준은 `structure/QUALITY_MVP_ACCEPTANCE.md`에 둔다.
- 런타임 흐름은 `structure/RUNTIME_SESSION_TURN_FLOW.md`에 둔다.
- DB 상세는 `structure/ERD_MVP_SESSION_SERVICE_MODEL.md`에 둔다.
- AI 역할별 입출력 계약은 `structure/AI_RUNTIME_CONTRACTS.md`에 둔다.
- 화면 구조는 `structure/SCREEN.md`에 둔다.
- 개발과 설계 원칙은 `rules/`에 둔다.
- 날짜별 작업 내역은 `dev-notes/`에만 둔다.
- 완료된 구현 계획과 점검표는 `completed/`에 둔다.
