# Development Rules

이 폴더는 개발과 설계 과정에서 반복해서 지켜야 하는 원칙을 정리한다.

`structure/`가 현재 시스템이 어떻게 생겼는지 설명한다면, `rules/`는 왜 그렇게 설계해야 하며 무엇을 어기면 안 되는지 설명한다. 기능을 추가하거나 리팩터링할 때는 관련 `structure/` 문서와 함께 이 폴더의 원칙 문서를 확인한다.

## 문서 목록

| 문서 | 역할 |
| --- | --- |
| [ARCHITECTURE_RULES.md](ARCHITECTURE_RULES.md) | 상태, 턴 처리, 서버 권위성, 동시성 원칙 |
| [PERMISSION_RULES.md](PERMISSION_RULES.md) | 방장, 사람 GM, AI GM, 플레이어 권한 분리 원칙 |
| [AI_RUNTIME_RULES.md](AI_RUNTIME_RULES.md) | AI 호출, 검증, fallback, 로깅 원칙 |
| [CONTENT_LICENSE_RULES.md](CONTENT_LICENSE_RULES.md) | SRD, 시나리오, 이미지, 룰 데이터 사용 원칙 |
| [DOCUMENTATION_RULES.md](DOCUMENTATION_RULES.md) | 문서 분류, 중복 관리, 완료 문서 보관 원칙 |

## 적용 기준

- 구현 상세는 `structure/` 문서를 따른다.
- 개발 중 판단 기준은 `rules/` 문서를 따른다.
- 실제 코드와 문서가 충돌하면 먼저 코드를 확인하고, 문서가 낡았으면 갱신한다.
- 특정 기능의 예시는 `examples/`에 둔다.
- 완료된 작업 계획과 과거 초안은 `completed/`에 둔다.

