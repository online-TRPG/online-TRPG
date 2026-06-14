# TRPG Platform with AI and Human Game Master

## 문서 목적

이 프로젝트는 웹 기반 TRPG 플랫폼 위에 AI GM 세션과 사람 GM 세션을 함께 지원하는 하이브리드 게임 서비스다.

플랫폼의 기준은 AI 채팅이 아니라 캐릭터, 세션, 시나리오, 룰, 주사위, 전투, 로그, 화면 상태를 서버가 관리하는 구조다. AI는 게임의 진실값을 직접 결정하지 않고, 사용자의 자연어 입력 해석, NPC 대사, 내레이션, 힌트, 요약 같은 보조 계층으로 사용한다.

## 적용 범위

- 프로젝트 전체 구조의 입구 문서
- AI GM / 사람 GM 공통 플랫폼 방향
- 세부 구조 문서로 이동하기 전 읽는 요약

## 핵심 요약

- 플랫폼 코어가 먼저이고 AI는 보조 계층이다.
- AI GM 세션과 사람 GM 세션은 같은 세션/캐릭터/룰/로그 구조를 공유한다.
- 방장, 사람 GM, 플레이어 권한은 분리한다.
- 세부 기준은 이 문서가 아니라 각 구조 문서와 `../rules/` 문서를 따른다.

## 핵심 방향

- 같은 플랫폼 코어에서 `AI GM`과 `HUMAN GM` 세션을 모두 지원한다.
- 세션 방장과 사람 GM 권한은 분리해서 다룬다.
- 캐릭터와 세션 진행 상태는 서버가 authoritative state로 관리한다.
- 일반 채팅과 게임 행동 입력은 분리한다.
- AI 출력은 구조화, 검증, fallback 과정을 거친 뒤 사용한다.
- SRD 5e 기반 공개 가능 콘텐츠와 직접 작성한 오리지널 콘텐츠만 제품 데이터로 사용한다.

## 주요 구조 문서

- [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md): 제품 범위, 라이선스, MVP 제약
- [SCREEN.md](SCREEN.md): 화면 구조
- [RULESET_SRD5E_MVP.md](RULESET_SRD5E_MVP.md): SRD 5e 기반 MVP 룰 범위
- [ERD_MVP_SESSION_SERVICE_MODEL.md](ERD_MVP_SESSION_SERVICE_MODEL.md): 세션, 시나리오, 런타임 데이터 모델
- [RUNTIME_SESSION_TURN_FLOW.md](RUNTIME_SESSION_TURN_FLOW.md): 플레이어 입력 1회가 처리되는 흐름
- [AI_RUNTIME_CONTRACTS.md](AI_RUNTIME_CONTRACTS.md): AI 역할별 입출력 계약
- [trpg_main_command_mvp_flow_with_categories.md](trpg_main_command_mvp_flow_with_categories.md): 메인 커맨드 처리 구조
- [QUALITY_MVP_ACCEPTANCE.md](QUALITY_MVP_ACCEPTANCE.md): MVP 완료 판정 기준

## 참고 문서

- [../scenarios/DEMO_SCENARIO.md](../scenarios/DEMO_SCENARIO.md): 데모 시나리오 본문
- [../examples/trpg_main_command_usage_examples.md](../examples/trpg_main_command_usage_examples.md): 메인 커맨드 사용 예시
- [../examples/DEMO_SCENARIO_EXAMPLES.md](../examples/DEMO_SCENARIO_EXAMPLES.md): 데모 시나리오 운영/구현 예시

## 관련 원칙

- [../rules/ARCHITECTURE_RULES.md](../rules/ARCHITECTURE_RULES.md): 플랫폼 코어와 서버 권위성 원칙
- [../rules/PERMISSION_RULES.md](../rules/PERMISSION_RULES.md): AI GM / 사람 GM / 방장 권한 분리 원칙
- [../rules/AI_RUNTIME_RULES.md](../rules/AI_RUNTIME_RULES.md): AI 보조 계층 원칙

## 관련 문서

- [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md): 제품 범위와 MVP 제약
- [QUALITY_MVP_ACCEPTANCE.md](QUALITY_MVP_ACCEPTANCE.md): MVP 완료 기준
- [SCREEN.md](SCREEN.md): 화면 구조

## 변경 시 주의사항

- 이 문서는 세부 스펙을 길게 반복하지 않고, 관련 구조 문서로 연결하는 역할을 유지한다.
- 제품 범위나 완료 기준을 바꾸는 경우 `PRODUCT_SCOPE.md`와 `QUALITY_MVP_ACCEPTANCE.md`를 함께 확인한다.
