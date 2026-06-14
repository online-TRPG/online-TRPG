# MVP Ruleset - SRD 5e 기반 최소 룰

## 문서 목적

이 문서는 MVP에서 구현할 D&D 5e SRD 기반 최소 룰 범위를 정의한다.

목표는 SRD 전체를 한 번에 구현하는 것이 아니라, 데모 시나리오를 여러 플레이어가 끝까지 진행할 수 있을 만큼의 판정, 상태, 전투, 캐릭터 구조를 먼저 고정하는 것이다.

## 적용 범위

- SRD 5e 기반 MVP 룰 범위
- 캐릭터, 판정, 주사위, 전투, 상태이상 최소 구현
- 데모 시나리오 진행에 필요한 룰 연동

## 핵심 요약

- SRD에 공개된 규칙만 사용한다.
- MVP에서는 완전한 SRD 구현보다 일관된 플레이 루프를 우선한다.
- AI는 판정 종류를 제안할 수 있지만 최종 공식과 상태 변경은 엔진이 수행한다.
- 룰 원문은 대량 복제하지 않고 구조화 데이터와 짧은 참조 중심으로 관리한다.

## 상세 내용

### 룰 범위 원칙

- SRD에 공개된 규칙만 사용한다.
- MVP에서는 규칙의 완전 구현보다 "일관된 플레이 루프"를 우선한다.
- AI는 판정 종류를 제안할 수 있지만, 최종 판정 공식과 상태 변경은 엔진이 수행한다.
- 룰 원문 전체를 UI나 seed 데이터에 대량 복제하지 않는다.
- 룰 데이터는 구조화된 수치, 이름, 짧은 설명, 출처 참조 중심으로 관리한다.

### 캐릭터 범위

#### MVP 필수 필드

- 이름
- 종족
- 클래스
- 레벨
- 능력치: STR, DEX, CON, INT, WIS, CHA
- 능력 수정치
- 숙련 보너스
- 최대 HP / 현재 HP / 임시 HP
- AC
- 이동 속도
- 숙련 기술
- 인벤토리
- 장착 무기
- 상태이상

#### MVP 제한

- 레벨은 1레벨로 고정한다.
- 멀티클래스는 지원하지 않는다.
- 선택 가능한 클래스/종족은 SRD 범위 안에서 데모에 필요한 일부만 먼저 지원한다.
- 주문은 MVP에서 선택 사항으로 두고, 필요하면 제한된 cantrip/1레벨 주문만 지원한다.

### 판정 범위

#### 능력치 판정

기본 공식:

```text
d20 + ability modifier + proficiency bonus if proficient >= DC
```

지원 대상:

- Strength check
- Dexterity check
- Constitution check
- Intelligence check
- Wisdom check
- Charisma check

#### 기술 판정

MVP에서는 시나리오 진행에 필요한 기술만 먼저 지원한다.

- Perception
- Investigation
- Stealth
- Persuasion
- Insight
- Athletics
- Acrobatics

#### 내성 굴림

MVP에서는 함정, 독, 공포 등 데모에 필요한 경우에만 사용한다.

```text
d20 + saving throw modifier + proficiency bonus if proficient >= DC
```

### 난이도 DC

MVP에서는 다음 DC 테이블을 사용한다.

| 난이도 | DC |
| --- | ---: |
| 쉬움 | 10 |
| 보통 | 15 |
| 어려움 | 20 |

시나리오 노드는 각 판정의 기본 DC를 가진다.
AI는 DC를 임의로 확정하지 못하고, 최대한 `easy`, `medium`, `hard` 후보만 제안한다.

### 주사위 엔진

지원 주사위:

- d4
- d6
- d8
- d10
- d12
- d20
- d100

지원 기능:

- 단일 주사위 굴림
- 여러 개 주사위 굴림
- 보정치 적용
- advantage / disadvantage
- 결과 로그 저장

### 전투 MVP

#### 포함

- 전투 시작 / 종료
- initiative 굴림
- 턴 순서 관리
- 기본 공격
- 피해 적용
- 회복 적용
- 방어 또는 대기 액션
- HP 0 이하 상태 처리

#### 제외

- 복잡한 기회 공격
- 엄폐
- 지형 효과
- 세부 이동 거리 검증
- 모든 주문/특수 능력 자동화

### 액션 타입

MVP 엔진은 다음 구조화 액션만 처리한다.

| 타입 | 설명 |
| --- | --- |
| `ability_check` | 능력치 판정 |
| `skill_check` | 기술 판정 |
| `saving_throw` | 내성 굴림 |
| `attack` | 기본 공격 |
| `use_item` | 아이템 사용 |
| `move` | 장면 내 위치 이동 |
| `interact` | 사물/NPC 상호작용 |
| `talk` | NPC와 대화 |
| `request_hint` | 힌트 요청 |
| `freeform` | 엔진 처리 전 추가 확인이 필요한 자유 행동 |

### 상태이상 MVP

MVP에서는 다음 상태만 먼저 지원한다.

- prone
- poisoned
- unconscious
- frightened
- restrained

상태이상은 State Engine의 상태 목록으로 관리하며, Narrator가 임의로 추가할 수 없다.

### 시나리오 룰 연동

각 시나리오 노드는 다음 정보를 가진다.

- 요구 판정 후보
- 기본 DC
- 성공 시 StateDiff
- 실패 시 StateDiff
- 성공 시 다음 노드 후보
- 실패 시 대체 노드 후보
- 발견 가능한 단서 목록

### 구현 우선순위

1. 능력치/기술 판정
2. 주사위 엔진
3. HP/AC/피해
4. initiative와 턴 순서
5. 상태이상
6. 제한된 아이템/주문

## 관련 원칙

- [../rules/CONTENT_LICENSE_RULES.md](../rules/CONTENT_LICENSE_RULES.md): SRD 콘텐츠 사용 원칙
- [../rules/ARCHITECTURE_RULES.md](../rules/ARCHITECTURE_RULES.md): 상태 변경과 서버 권위성 원칙
- [../rules/AI_RUNTIME_RULES.md](../rules/AI_RUNTIME_RULES.md): AI가 룰 결과를 확정하지 않는 원칙

## 관련 문서

- [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md): 룰셋과 콘텐츠 범위
- [RUNTIME_SESSION_TURN_FLOW.md](RUNTIME_SESSION_TURN_FLOW.md): 판정과 상태 변경 흐름
- [QUALITY_MVP_ACCEPTANCE.md](QUALITY_MVP_ACCEPTANCE.md): 룰/엔진 완료 기준

## 변경 시 주의사항

- 룰 범위를 넓히면 라이선스 출처와 seed 데이터 포함 가능 여부를 먼저 확인한다.
- 새 액션 타입을 추가하면 메인 커맨드 구조와 AI 계약도 함께 확인한다.
