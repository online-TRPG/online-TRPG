# SRD 5e P1 플레이 가능 룰 범위 확대 계획

작성일: 2026-06-21
완료일: 2026-06-22

## 1. 문서 목적

P0는 end-to-end playable MVP의 수직 경로를 닫는 단계였다. P1은 그 엔진을 유지한 채 실제 플레이에서 선택지와 재미를 넓히는 단계다.

이 문서는 [`../future_plan.md`](../future_plan.md)의 장기 목표 중 P1에서 완료한 범위를 기록한다. 완료된 P0 기록은 [`future_plan_mvp.md`](future_plan_mvp.md)에 보관한다.

P1 범위는 다음 네 가지로 고정한다.

1. **직업 12개 1~3레벨 플레이 가능화**
2. **실행 가능 주문 25개**
3. **대표 몬스터 10종**
4. **사용자용 짧은 오리지널 시나리오 1개**

P1의 핵심은 “더 많은 데이터”가 아니라, 사용자가 내부 id나 개발자용 smoke 명령을 몰라도 캐릭터를 만들고, 세션에 들어가고, 전투와 탐색을 자연스럽게 완주하는 것이다.

## 2. P1 원칙

- P0에서 만든 `RuleCatalogService`, resolver, `CombatService`, `ActionProcessorService`, `SessionsService`, TurnLog/StateDiff 경로를 우회하지 않는다.
- 새 기능은 가능한 한 카탈로그 id와 공통 runtime effect packet으로 표현한다.
- 프론트엔드는 결과를 확정하지 않고, 서버가 제공한 가능한 행동과 결과를 표시한다.
- AI GM과 HUMAN GM은 같은 action id와 executor를 사용한다.
- smoke 전용 내부 id 명령은 사용자용 시나리오 완료 기준으로 인정하지 않는다.
- P1은 SRD 공개 범위와 프로젝트 오리지널 시나리오만 대상으로 한다.

## 3. P1-0. P0 마감 정리

목표:

- P0 문서를 완료 기록으로 보관한다.
- P0 smoke에서 드러난 UX 어색함을 P1 backlog로 옮긴다.
- 개발 편의 이슈를 정리한다.

작업:

1. `future_plan_mvp.md`를 `doc/completed/`로 이동한다.
2. smoke 시나리오가 선택창에 표시되는지 확인한다.
3. Vite dev server가 5173에서 5174로 조용히 넘어가지 않도록 `--strictPort`를 적용한다.
4. smoke 진행에 내부 token id가 필요한 지점을 사용자용 UI 또는 GM 도구로 대체할 backlog를 만든다.

완료 기준:

- P0 완료 기록과 P1 실행 계획이 분리되어 있다.
- 사용자는 다음 작업 기준을 [`../future_plan_p2.md`](../future_plan_p2.md)에서 확인할 수 있다.

## 4. P1-1. 직업 12개 1~3레벨 플레이 가능화

대상 직업:

- 바바리안
- 바드
- 클레릭
- 드루이드
- 파이터
- 몽크
- 팔라딘
- 레인저
- 로그
- 소서러
- 워락
- 위저드

목표 사용자 경험:

- 모든 SRD 직업으로 1레벨 캐릭터를 만들 수 있다.
- 모든 SRD 직업이 3레벨까지 레벨업 가능하다.
- 3레벨 전후 필요한 서브클래스 선택이 UI와 서버에서 일관되게 처리된다.
- 직업별 대표 행동, 보너스 행동, 반응, 자원이 전투 UI에 표시된다.
- short/long rest 후 직업 자원이 올바르게 회복된다.

대표 서브클래스 1차 후보:

| 직업 | 대표 서브클래스 |
| --- | --- |
| 바바리안 | 버서커 |
| 바드 | 로어 |
| 클레릭 | 라이프 도메인 |
| 드루이드 | 랜드 |
| 파이터 | 챔피언 |
| 몽크 | 오픈 핸드 |
| 팔라딘 | 데보션 |
| 레인저 | 헌터 |
| 로그 | 씨프 |
| 소서러 | 드라코닉 혈통 |
| 워락 | 피엔드 |
| 위저드 | 에보케이션 |

1차 구현 범위:

- HP, hit die, proficiency bonus.
- 숙련 선택.
- 1~3레벨 class feature snapshot.
- 대표 subclass feature snapshot.
- class resource의 사용과 휴식 회복.
- 주문시전 직업의 cantrip, known spell, prepared spell, spell slot.
- 전투 UI에서 사용할 수 있는 대표 행동 노출.

완료 기준:

- 각 직업 1레벨 생성이 가능하다.
- 각 직업 3레벨까지 레벨업이 가능하다.
- subclass 선택이 필요한 직업은 올바른 레벨에서 선택을 요구한다.
- 활성 세션 캐릭터가 레벨업 후 snapshot을 받는다.
- class resource가 action, TurnLog, rest recovery에 반영된다.

사용자 실행 검증:

```powershell
npm run test -w @trpg/be -- characters.service.spec.ts --runInBand
npm run test -w @trpg/be -- level-up.service.spec.ts --runInBand
```

## 5. P1-2. 실행 가능 주문 25개

현재 P0 기준 실행 주문:

- Chill Touch
- Fire Bolt
- Ray of Frost
- Sacred Flame
- Light
- Bless
- Bane
- Magic Missile
- Burning Hands
- Thunderwave
- Entangle
- Detect Magic
- Cure Wounds
- Shield
- Sleep
- Fireball

P1에서 25개까지 확장한다. P1 주문 id는 다음 25개로 고정한다.

| 구분 | 주문 |
| --- | --- |
| 캔트립 | Chill Touch, Fire Bolt, Light, Ray of Frost, Sacred Flame |
| 1레벨 | Bane, Bless, Burning Hands, Command, Cure Wounds, Detect Magic, Entangle, Guiding Bolt, Healing Word, Inflict Wounds, Magic Missile, Shield, Sleep, Thunderwave |
| 2레벨 | Hold Person, Misty Step, Scorching Ray, Web |
| 3레벨 | Dispel Magic, Fireball |

추가 1차 후보:

| 주문 | 역할 |
| --- | --- |
| Guiding Bolt | 단일 공격 + 다음 공격 이점 |
| Inflict Wounds | 근접 주문 공격 |
| Healing Word | bonus action 회복 |
| Command | 단일 대상 제어 |
| Hold Person | 집중 + paralyzed |
| Web | 지형/구속 확장 |
| Misty Step | bonus action 순간이동 |
| Scorching Ray | 다중 attack roll |
| Dispel Magic | 지속 효과 해제 |

목표 사용자 경험:

- 주문 사용자 캐릭터가 매 전투 같은 주문만 반복하지 않는다.
- 회복, 공격, 버프, 디버프, 제어, 이동, 반응, 지형 주문이 모두 존재한다.
- 주문 UI가 slot level, 대상, 범위, 집중 여부를 명확히 보여준다.

구현 원칙:

- 주문별 전용 분기보다 공통 spell definition과 runtime effect packet을 우선한다.
- `spellId`는 command, API, UI, TurnLog에서 동일해야 한다.
- 집중 주문은 종료 시 연결된 condition, terrain, modifier를 정리한다.
- upcast 결과는 TurnLog에 spell level과 slot level을 함께 기록한다.

완료 기준:

- 실행 가능 주문 25개가 `RuleCatalogService`에 등록되어 있다.
- 25개 주문이 command/API/UI 중 최소 하나의 실제 실행 경로를 가진다.
- 전투 주문은 server authoritative 결과를 반환한다.
- 주문 결과가 TurnLog와 실시간 이벤트에 남는다.

사용자 실행 검증:

```powershell
npm run test -w @trpg/be -- rule-catalog.service.spec.ts --runInBand
npm run test -w @trpg/be -- combat-spell.service.spec.ts --runInBand
npm run test -w @trpg/be -- spell-slot.service.spec.ts --runInBand
npm run test -w @trpg/be -- spell-scaling.service.spec.ts --runInBand
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
```

## 6. P1-3. 대표 몬스터 10종

P1 몬스터 목표는 전체 317개 몬스터 실행 가능화가 아니다. 먼저 실제 시나리오와 테스트 encounter에서 반복 사용 가능한 대표 10종을 닫는다.

1차 후보:

| 몬스터 | 검증할 룰 |
| --- | --- |
| Goblin | 기본 공격, 은신/기동 |
| Orc | 강한 근접 공격 |
| Wolf | pack tactics, prone rider |
| Skeleton | 원거리/근거리 기본 |
| Zombie | 생존 특성 |
| Giant Spider | poison, web |
| Brown Bear | multiattack |
| Dragon Whelp (`monster.dragon_whelp`) | recharge breath |
| Cultist (`monster.cultist`) | 주문형/인간형 적 |
| Ogre | 대형 단일 위협 |

목표 사용자 경험:

- AI GM이 적마다 다른 행동 후보를 고른다.
- HUMAN GM이 몬스터 버튼의 의미를 이해하고 직접 실행할 수 있다.
- multiattack, recharge, save rider, limited use가 실제 전투에서 보인다.

구현 원칙:

- 모든 몬스터 행동은 `monster_abilities` 또는 SRD executable action catalog로 정규화한다.
- AI와 HUMAN GM은 같은 action id를 사용한다.
- action metadata는 TurnLog에 남긴다.
- 사용 불가능한 recharge/limited use 행동은 UI와 서버에서 모두 차단한다.

완료 기준:

- 대표 몬스터 10종의 executable action 후보가 정규화되어 있다.
- AI/HUMAN GM이 같은 executor로 실행한다.
- save rider, recharge, multiattack, limited use 대표 케이스가 회귀 spec에 있다.
- 전투 UI에서 target kind, range, save, recharge, usage를 이해할 수 있다.

사용자 실행 검증:

```powershell
npm run test -w @trpg/be -- monster-ability.service.spec.ts --runInBand
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
```

## 7. P1-4. 사용자용 짧은 오리지널 시나리오 1개

P0 smoke는 개발 검증용이다. P1에는 사용자가 내부 id나 smoke command를 몰라도 진행할 수 있는 짧은 오리지널 시나리오가 필요하다.

P1 사용자용 시나리오 id는 `scenario_p1_ember_ruins`로 고정한다. 제목은 **잿불 폐허의 종소리**이며, 3레벨 캐릭터로 30~45분 안에 진행하는 오리지널 단편이다.

목표:

- 30~45분 안에 완주 가능하다.
- AI GM과 HUMAN GM 양쪽에서 진행 가능하다.
- UI와 자연어 중심으로 진행되며, 내부 token id 입력이 필요 없다.

권장 구조:

1. 도입/의뢰.
2. 탐색.
3. 스킬 체크 또는 함정.
4. 단서 공개 또는 사회적 선택.
5. 소규모 전투.
6. 짧은 휴식 기회.
7. 보스 또는 클라이맥스.
8. 결말과 보상.

포함할 기능:

- 12개 직업 중 최소 4개 이상이 유의미한 선택지를 갖는 상황.
- P1 주문 중 최소 5개가 유용한 상황.
- 대표 몬스터 3종 이상.
- 엄폐 또는 지형.
- 아이템 줍기/사용/던지기 중 1개 이상.
- HUMAN GM override 선택지.
- AI GM fallback.

완료 기준:

- AI GM으로 2회 완주한다.
- HUMAN GM으로 2회 완주한다.
- 중간 재접속 후 current node, combat, map, character, inventory가 복원된다.
- 플레이어가 GM private 정보를 볼 수 없다.
- 주요 상태 변경의 TurnLog/StateDiff 또는 audit metadata가 남는다.

## 8. P1 실행 순서

```text
P1-0 P0 마감 정리
↓
P1-1 직업 12개 1~3레벨
↓
P1-2 주문 25개
↓
P1-3 몬스터 10종
↓
P1-4 사용자용 짧은 오리지널 시나리오
```

의존성:

- 직업 구현은 주문과 자원 회복에 영향을 준다.
- 주문 구현은 몬스터와 시나리오 전투 다양성에 영향을 준다.
- 몬스터 구현은 사용자용 시나리오 encounter 구성을 결정한다.
- 사용자용 시나리오는 앞의 세 범위를 검증하는 최종 표면이다.

## 9. P1 완료 체크리스트

- [x] SRD 12개 직업이 1~3레벨까지 생성/성장 가능하다.
- [x] 각 직업 대표 서브클래스 1개가 선택 가능하다.
- [x] class resource가 전투 UI, TurnLog, rest recovery에 반영된다.
- [x] 실행 가능 주문이 25개다.
- [x] 주문 25개가 command/API/UI에서 같은 id를 사용한다.
- [x] 대표 몬스터 10종이 AI/HUMAN GM 공통 executor를 사용한다.
- [x] multiattack, recharge, save rider, limited use, aura 감사 표면이 대표 몬스터에서 검증된다.
- [x] 사용자용 짧은 오리지널 시나리오 1개가 존재한다.
- [x] 사용자용 시나리오는 내부 id 입력 없이 진행 가능하다.
- [x] AI GM으로 사용자용 시나리오를 완주했다.
- [x] HUMAN GM으로 사용자용 시나리오를 완주했다.
- [x] 중간 재접속 후 상태 복원을 확인했다.
- [x] 플레이어에게 GM private 정보가 노출되지 않았다.
- [x] `npm run build`와 관련 회귀 spec을 사용자가 실행해 통과를 확인했다.

P1은 사용자 시나리오 플레이, 빌드, 관련 회귀 spec 통과 확인을 거쳐 완료 처리했다.

### 9.1 최종 실행 검증 기록

시나리오 선택창에서 `잿불 폐허의 종소리`를 선택하고 아래 네 번을 각각 새 세션으로 완주한다.

| 실행 | GM 모드 | 확인 항목 | 결과 |
| --- | --- | --- | --- |
| 1 | AI GM | 도입 → 탐색 → 매복 → 짧은 휴식 → 보스 → 결말 | 완료 |
| 2 | AI GM | 재충전 브레스, 상태 효과, 시나리오 자동 진행 | 완료 |
| 3 | HUMAN GM | 몬스터 행동 버튼, override, 노드 이동 | 완료 |
| 4 | HUMAN GM | 중간 재접속과 전투/맵/인벤토리 복원 | 완료 |

각 실행에서 다음을 기록한다.

1. 세션 id와 GM 모드.
2. 시작/종료 시각.
3. 사용한 직업과 핵심 직업 기능.
4. 사용한 P1 주문.
5. 전투에서 확인한 몬스터 특수 행동.
6. 재접속 전후 current node, combat, map, HP, inventory.
7. 플레이어 화면에서 GM 전용 메모가 보이지 않았는지.
8. 실패가 있으면 TurnLog id와 화면 오류 메시지.

최종 자동 검증 명령:

```powershell
npm run test:quiet -w @trpg/be -- command-parser.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- action-rule.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- action-processor.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- rule-catalog.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- monster-ability.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- combat.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- default-scenario.spec.ts --runInBand
npm run build
```

## 10. P1 이후

P1 완료 후 P2는 다음 범위로 넘어간다.

- 실행 가능 주문 50개, 이후 100개.
- 고레벨 class/subclass feature.
- 더 많은 몬스터 aura, 지속 능력, 복합 AoE.
- 더 많은 terrain/object interaction.
- 시나리오 제작 UI에서 rule catalog id 선택 지원.
