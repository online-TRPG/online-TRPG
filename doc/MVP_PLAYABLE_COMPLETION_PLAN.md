# Playable MVP Completion Plan

이 문서는 MVP를 "SRD 데이터 일부 생성"이 아니라 "실제 사용자가 하나의 세션을 시작해서 끝까지 플레이할 수 있는 상태"로 정의한다. 아래 게이트를 통과하기 전까지 MVP 완료로 보지 않는다.

## MVP 완료 판정

MVP 완료는 다음 조건을 모두 만족해야 한다.

1. 두 명 이상의 유저가 같은 세션에 참가하고, 각자 캐릭터를 고른 뒤 같은 장면 상태를 본다.
2. Human, Fighter, Rogue, Ranger, Wizard 조합으로 기본 행동, 판정, 공격, 피해, 회복, 주문, 아이템 사용이 세션 로그와 HP/상태에 반영된다.
3. AI GM 모드에서 자연어 입력이 Interpreter 결과를 거쳐 백엔드의 권위 있는 룰 판정으로 연결된다.
4. Human GM 모드에서 GM이 장면 진행, NPC 대사, 단서 공개, 판정 요청, 전투 시작/종료를 수행할 수 있다.
5. 최소 데모 시나리오 하나가 시작, 탐색, 대화/단서, 판정, 전투 또는 위험, 결말까지 이어진다.
6. 위 흐름이 백엔드 테스트와 최소 1개의 e2e 또는 시나리오 리허설 스크립트로 재현된다.

## 현재 확인된 차단점

1. 자연어 액션은 현재 `free_text`로 기록만 되고, 룰 판정을 만들지 않는다. AI Interpreter 호출 결과도 액션 룰 처리에 사용되지 않는다.
2. `ai/generated/srd`에 있는 훅과 백엔드 TypeScript 룰 엔진이 동기화되어 있지 않았다. P0 주문/아이템 일부는 이번 패치로 연결했지만 전체 MVP 범위는 더 남아 있다.
3. 전투 참가자는 현재 세션 캐릭터 중심이라 몬스터/NPC 타깃 모델이 약하다. 데모 전투를 위해 적 참가자 또는 GM 제어 타깃 표현이 필요하다.
4. 캐릭터 생성/선택 화면과 서버 검증이 MVP 범위인 Human, Fighter, Rogue, Ranger, Wizard로 수렴되어야 한다.
5. 주문/아이템은 allowlist와 룰 훅, 액션 입력, UI 노출, 테스트가 같은 목록을 보게 해야 한다.
6. 세션 종료 조건, 장면 진행 조건, 단서 공개 상태, 플레이어별/공개 로그 노출이 실제 데모 시나리오 기준으로 다시 검증되어야 한다.

## 구현 단계

### P0: 명령 기반 플레이 루프 고정

목표: AI가 실패해도 백엔드 명령어/GM 조작만으로 세션 리허설이 끝까지 가능해야 한다.

- Fighter/Rogue/Ranger/Wizard, Human 캐릭터 템플릿과 서버 검증 정리
- `/check`, `/attack`, `/damage`, `/heal`, `/condition`, `/cast`, `/item`, 주요 class feature 명령 동작 보장
- Fire Bolt, Magic Missile, Cure Wounds, Potion of Healing, Second Wind, Action Surge, Sneak Attack, Cunning Action의 백엔드 룰 테스트
- 데모용 적 타깃과 HP/AC/조건 상태 반영
- 데모 시나리오의 시작, 단서, 판정, 전투, 결말 seed 또는 fixture 고정

### P1: 자연어에서 룰 판정까지 연결

목표: 플레이어가 명령어를 몰라도 "고블린에게 파이어 볼트를 쏜다" 같은 입력이 실제 룰 판정으로 이어져야 한다.

- `ActionsService`가 Interpreter structured action을 `ActionRuleService` 입력으로 넘기도록 연결
- Interpreter 실패 시 명령어 파서 또는 GM 확인 fallback 제공
- Interpreter handoff case와 backend action DTO 간 계약 테스트
- 성공/실패/불가능 판정의 로그와 narrator 입력 동기화

### P2: MVP 콘텐츠 완성

목표: 하나의 세션에서 네 직업이 역할을 잃지 않고 플레이할 수 있을 만큼만 구현한다.

- Human traits: ability score bonus, speed, language placeholder
- Fighter: weapon attack, Second Wind, Action Surge
- Rogue: finesse/ranged attack, Sneak Attack, Cunning Action
- Ranger: weapon attack, Survival/Perception 중심 체크, Cure Wounds 계열 지원
- Wizard: cantrip과 1레벨 공격/방어/유틸 주문 allowlist
- 주문 allowlist는 구현 부담이 낮은 19개로 고정하고, 각 주문은 `SUPPORTED` 또는 `GM_ASSIST` 상태를 가진다.
- 매직 아이템 allowlist는 약 15개로 고정하고, Potion/Scroll/flat +1류부터 실제 효과를 연결한다.

### P3: 실제 세션 리허설

목표: 코드와 데이터가 모두 맞는지 사람이 따라갈 수 있는 리허설로 검증한다.

- AI GM 리허설: 캐릭터 2명 이상, 자연어 액션, 단서 공개, 전투, 회복, 결말
- Human GM 리허설: GM 조작으로 같은 시나리오를 완료
- 실패 케이스: 빗나감, 사거리 밖, HP 0, 주문 슬롯/아이템 없음, 권한 없는 GM 조작
- 최종 체크 결과를 `doc/QUALITY_MVP_ACCEPTANCE.md`와 맞춰 갱신

## 이번 패치로 완료한 항목

- 백엔드 룰 엔진에 Fire Bolt, Magic Missile, Cure Wounds, Potion of Healing, flat +1 magic bonus 훅 추가
- 명령어 파서에 MVP 주문 alias와 `/item potion <target>` 추가
- 액션 룰 처리에 Fire Bolt, Magic Missile, Cure Wounds, Potion of Healing 연결
- 로그 Sneak Attack 자동 적용과 Cunning Action 명령 흐름 연결
- AI Interpreter 구조화 액션을 기존 명령 기반 룰 입력으로 변환하는 1차 연결 추가
- 캐릭터 생성/수정 범위를 Human, Fighter, Rogue, Ranger, Wizard, 레벨 2로 서버에서 검증
- 프론트 캐릭터 선택지를 MVP 범위로 축소하고 기본 캐릭터를 Fighter 레벨 2로 변경
- Interpreter 변환부 단위 테스트 추가
- CombatParticipant에 MVP 적 타깃용 HP/AC/조건 상태를 추가하고, StartCombat에서 hostile NPC/monster를 받을 수 있게 확장
- 활성 전투의 hostile participant를 액션 룰 타깃으로 넘겨 공격/피해/회복/상태 변경이 전투 참가자 상태 패치로 남게 연결
- `shared-types/src/constants/mvp-content.ts`에 MVP 주문 19개와 매직 아이템 15개 allowlist를 `SUPPORTED`/`GM_ASSIST` 상태로 고정
- 룰 모듈 테스트 추가 및 직렬 실행 기준 통과

## 다음 작업 순서

1. hostile combat participant가 실제 API 리허설에서 생성/피해 반영되는지 확인한다.
2. target id/name 매핑 실패 케이스를 통합 테스트에서 막는다.
3. 주문/아이템 allowlist를 UI에 노출하고, `GM_ASSIST` 항목은 명령 자동화가 아니라 GM 판정 안내로 표시한다.
4. 데모 시나리오 리허설 테스트를 추가하고, 통과 전에는 MVP 완료로 표시하지 않는다.
