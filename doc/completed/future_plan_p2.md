# SRD 5e P2 5레벨 플레이 확장 계획

작성일: 2026-06-22
완료일: 2026-06-22

구현 상태: **완료**

수동 검증 절차는 [`p2_validation_guide.md`](p2_validation_guide.md)를 따른다.

## 1. 문서 목적

P1은 12개 직업의 1~3레벨, 실행 가능 주문 25개, 대표 몬스터 10종, 사용자용 단편 시나리오를 통해 기본 플레이 선택지를 닫았다.

P2는 [`../future_plan.md`](../future_plan.md)의 장기 범위를 축소하지 않고, 5레벨 플레이에서 필요한 성장·전투·콘텐츠·제작 흐름을 하나의 실행 단계로 묶는다. 완료된 P1 기록은 [`future_plan_p1.md`](future_plan_p1.md)에 보관한다.

P2 범위는 다음 여섯 가지로 고정한다.

1. **SRD 종족 9개 런타임 특성 실행 가능화**
2. **직업 12개 4~5레벨 플레이 가능화**
3. **실행 가능 주문 누적 50개**
4. **대표 몬스터 누적 25종**
5. **지형·오브젝트 상호작용 확장**
6. **룰 카탈로그 기반 시나리오 제작 UI MVP와 검증 시나리오 1개**

## 2. P2 원칙

- P1의 카탈로그 id, resolver, TurnLog/StateDiff, AI/HUMAN GM 공통 executor를 그대로 확장한다.
- UI는 서버가 제공한 실행 가능 행동과 비용, 대상, 결과를 표시한다.
- 새 룰은 직업명·주문명·몬스터명에 의존한 UI 전용 분기로 만들지 않는다.
- 4~5레벨 성장에서 ASI, 주문 선택, 자원 증가, Extra Attack을 서버 권위적으로 처리한다.
- 콘텐츠 수량보다 실제 command/API/UI 실행 경로와 감사 가능성을 완료 기준으로 삼는다.
- SRD 공개 범위와 프로젝트 오리지널 콘텐츠만 사용한다.

## 3. P2-0. P1 마감과 회귀 기준 고정

작업:

1. `future_plan_p1.md`를 `doc/completed/`로 이동한다.
2. P1에서 통과한 빌드와 핵심 회귀 spec을 P2 기준선으로 유지한다.
3. P1의 25개 주문, 10종 몬스터, 1~3레벨 직업 기능이 P2 변경으로 퇴행하지 않게 한다.

완료 기준:

- P2 진행 당시 현재 작업 문서는 `future_plan_p2.md` 하나로 식별되었다.
- P1 완료 범위가 P2 자동 검증에 포함된다.

## 4. P2-1. SRD 종족 9개 런타임 특성

대상:

- 드워프
- 엘프
- 하플링
- 인간
- 드래곤본
- 노움
- 하프엘프
- 하프오크
- 티플링

구현 범위:

- 능력치 보정, 크기, 이동속도, 언어, 기본 숙련을 생성 snapshot에 반영한다.
- 암시야, 피해 저항, 내성 이점, 조건 저항을 공통 modifier resolver에 연결한다.
- 종족 특수 행동과 제한 사용 능력을 카탈로그 action으로 노출한다.
- subrace 또는 선택 항목이 존재하면 생성 UI와 서버 검증에서 같은 id를 사용한다.
- 종족 특성이 공격, 내성, 피해, 휴식, TurnLog에 적용된 근거를 남긴다.

대표 검증:

| 종족 | 대표 검증 |
| --- | --- |
| 드워프 | 독 내성/저항 |
| 엘프 | 암시야, 매혹 내성 |
| 하플링 | 행운 재굴림 |
| 인간 | 능력치 보정 |
| 드래곤본 | 브레스, 피해 저항 |
| 노움 | 정신계 내성 이점 |
| 하프엘프 | 숙련/능력치 선택 |
| 하프오크 | 끈질긴 인내 |
| 티플링 | 화염 저항, 종족 주문 |

완료 기준:

- 9개 종족으로 캐릭터 생성이 가능하다.
- 각 종족의 대표 런타임 특성이 최소 1개 이상 실제 resolver를 통과한다.
- 종족 특성이 UI 설명과 TurnLog 감사 정보에 나타난다.

## 5. P2-2. 직업 12개 4~5레벨

목표 사용자 경험:

- P1 캐릭터를 5레벨까지 성장시킬 수 있다.
- 4레벨 ASI를 적용하고 세션 snapshot에 반영할 수 있다.
- 5레벨 proficiency bonus, HP, 자원, 주문 슬롯이 자동 갱신된다.
- Extra Attack 보유 직업은 한 행동 안에서 복수 공격을 수행한다.
- 주문시전 직업은 2~3레벨 주문을 정상적으로 선택·준비·사용한다.

구현 범위:

- 4레벨 ASI. P2에서는 feat 선택을 범위에서 제외하고 능력치 증가만 지원한다.
- 5레벨 proficiency bonus `+3`.
- 직업별 hit die 기반 HP 증가.
- class/subclass feature snapshot 4~5레벨 확장.
- Fighter, Barbarian, Paladin, Ranger, Monk의 Extra Attack 공통 resolver.
- Rogue Sneak Attack, Bardic Inspiration, Martial Arts 등 레벨 기반 dice/resource scaling.
- full caster, half caster, pact magic의 5레벨 슬롯 진행.
- 레벨업 전후 command/API/UI/세션 snapshot 일관성.

완료 기준:

- 12개 직업이 5레벨까지 성장 가능하다.
- ASI, Extra Attack, 자원·주문 슬롯 증가가 서버에서 검증된다.
- 5레벨 캐릭터로 전투, 휴식, 재접속 후 상태가 유지된다.

## 6. P2-3. 실행 가능 주문 누적 50개

P1의 25개를 유지하고 아래 25개를 추가해 누적 50개로 고정한다.

| 레벨 | P2 추가 주문 |
| --- | --- |
| 캔트립 | Acid Splash, Guidance, Mage Hand, Minor Illusion, Shocking Grasp |
| 1레벨 | Charm Person, Faerie Fire, Feather Fall, Fog Cloud, Grease, Heroism, Hunter's Mark, Longstrider |
| 2레벨 | Aid, Blindness/Deafness, Darkness, Invisibility, Lesser Restoration, Moonbeam, Spiritual Weapon |
| 3레벨 | Counterspell, Fly, Haste, Lightning Bolt, Revivify |

필수 공통 기능:

- reaction spell interrupt와 pending reaction.
- 지속시간과 집중 상태 연결.
- 시야 차단과 obscurement.
- 지속 지역 효과와 turn start/end trigger.
- 상태·질병·마법 효과 제거.
- 이동속도와 비행속도 modifier.
- 사망 상태에서의 회복 처리.
- slot level scaling과 다중 대상 처리.

완료 기준:

- `RuleCatalogService`의 실행 가능 주문이 정확히 50개다.
- 50개 주문이 command/API/UI에서 같은 `spellId`를 사용한다.
- 주문별 전용 하드코딩은 공통 resolver로 표현할 수 없는 최소 범위로 제한한다.
- 비용, 대상, 집중, 지속시간, scaling, 결과가 TurnLog에 남는다.

## 7. P2-4. 대표 몬스터 누적 25종

P1의 10종을 유지하고 아래 15종을 추가한다.

| 추가 몬스터 | 대표 검증 |
| --- | --- |
| Kobold | pack tactics |
| Bandit | 인간형 근거리/원거리 |
| Bugbear | reach, surprise damage |
| Hobgoblin | 조건부 추가 피해 |
| Dire Wolf | pack tactics, prone |
| Ghoul | paralysis rider |
| Wight | multiattack, life drain |
| Mimic | false appearance, grapple |
| Gelatinous Cube | engulf, 지속 피해 |
| Swarm of Rats | swarm 규칙 |
| Animated Armor | construct 방어 특성 |
| Gargoyle | 피해 저항 |
| Harpy | charm aura/노래 |
| Giant Scorpion | multiattack, grapple, poison |
| Young Dragon | 비행, recharge cone breath |

구현 범위:

- aura와 turn lifecycle.
- grapple/restrain과 탈출 판정.
- 지속 피해와 turn start/end save.
- swarm, construct, resistance/immunity.
- 비행 이동과 고도.
- 복합 multiattack 및 recharge AoE.
- AI 행동 후보 평가와 HUMAN GM용 행동 설명.

완료 기준:

- 누적 25종이 정규화된 executable action을 가진다.
- AI/HUMAN GM이 동일한 action id와 executor를 사용한다.
- 사용할 수 없는 행동은 UI와 서버 양쪽에서 차단된다.
- 특수 행동의 선택·굴림·상태 변경 근거가 TurnLog에 남는다.

## 8. P2-5. 지형·오브젝트 상호작용

대상 지형:

- difficult terrain
- hazardous terrain
- obscurement
- elevation
- slippery terrain
- burning terrain
- poison cloud

대상 오브젝트 행동:

- 줍기
- 내려놓기
- 던지기
- 문 열기/닫기
- 컨테이너 조사와 아이템 이동
- 간단한 파괴 가능 오브젝트

구현 원칙:

- 이동, 시야, 엄폐, 피해, 상태 resolver가 같은 terrain/object id를 참조한다.
- 거리, 행동 비용, 소유권, 수량, 용량을 서버에서 검증한다.
- 실패한 상호작용은 상태를 변경하지 않고 사용자에게 이유를 반환한다.
- 모든 변경은 map state와 inventory, TurnLog/StateDiff에 함께 반영한다.

완료 기준:

- 7개 지형 효과가 전투 또는 탐색 resolver에서 실행된다.
- 오브젝트 6개 행동이 내부 token id 직접 입력 없이 UI에서 가능하다.
- 재접속 후 지형, 오브젝트 위치, 컨테이너, 인벤토리가 복원된다.

## 9. P2-6. 시나리오 제작 UI MVP와 검증 시나리오

목표:

- 제작자가 JSON이나 내부 id를 직접 편집하지 않고 룰 카탈로그 항목을 선택해 노드를 구성한다.
- 저장 전에 잘못된 참조, 누락된 전이, 실행 불가능한 encounter를 확인한다.

제작 UI 범위:

- story, exploration, combat 노드 생성/편집.
- 노드 연결과 시작 노드 지정.
- 몬스터, 주문, 상태, 지형, 오브젝트를 카탈로그 검색으로 선택.
- 공개 텍스트와 GM private 메모 분리.
- 기본 encounter 배치와 맵 미리보기.
- validation 결과와 누락 항목 표시.
- draft 저장, 다시 열기, 제공 시나리오로 실행할 수 있는 export/seed 형식.

검증 시나리오:

- P2 기능을 사용자 흐름에서 검증하는 5레벨 오리지널 단편 1개.
- 45~60분 분량.
- 3종 이상의 지형, 3종 이상의 오브젝트 행동, P2 추가 몬스터 5종 이상을 사용한다.
- 종족 특성, Extra Attack, 3레벨 주문, 비행/고도, 지속 지역 효과가 유용한 장면을 포함한다.
- AI GM과 HUMAN GM에서 같은 시나리오 데이터를 사용한다.

완료 기준:

- 제작 UI만으로 검증 시나리오의 핵심 노드를 생성·수정할 수 있다.
- 저장한 시나리오를 새 세션에서 시작하고 완주할 수 있다.
- 플레이어와 GM의 공개 범위가 분리된다.
- 중간 재접속 후 노드, 전투, 맵, 오브젝트, 인벤토리가 복원된다.

## 10. 실행 순서

```text
P2-0 P1 마감과 회귀 기준
↓
P2-1 종족 9개 런타임 특성
↓
P2-2 직업 12개 4~5레벨
↓
P2-3 주문 누적 50개
↓
P2-4 몬스터 누적 25종
↓
P2-5 지형·오브젝트 상호작용
↓
P2-6 제작 UI와 검증 시나리오
```

## 11. P2 완료 체크리스트

- [x] SRD 종족 9개 생성·런타임 경로를 구현했다.
- [x] 12개 직업의 4~5레벨, ASI, Extra Attack, 자원·주문 슬롯 진행을 구현했다.
- [x] 실행 가능 주문 카탈로그를 정확히 50개로 확장했다.
- [x] 대표 몬스터 카탈로그를 누적 25종 이상으로 확장했다.
- [x] 7개 지형 효과와 6개 오브젝트 행동 경로를 구현했다.
- [x] 시나리오 제작 UI의 룰 카탈로그 선택, GM 메모, 검증 패널을 구현했다.
- [x] 5레벨 P2 검증 시나리오 `폭풍 금고의 마지막 비행`을 추가했다.
- [x] 9개 종족 대표 특성의 resolver와 TurnLog 결과를 사용자가 확인했다.
- [x] 12개 직업의 5레벨 성장과 재접속 상태를 사용자가 확인했다.
- [x] aura, grapple, 지속 피해, swarm, 비행, 복합 AoE 대표 케이스를 사용자가 확인했다.
- [x] P2 검증 시나리오를 AI GM과 HUMAN GM에서 완주했다.
- [x] 재접속 상태 복원과 GM private 정보 분리를 확인했다.
- [x] `npm run build`와 관련 회귀 spec을 사용자가 실행해 통과를 확인했다.

P2는 전체 빌드, 관련 회귀 spec, `폭풍 금고의 마지막 비행` 시나리오 검증을 사용자가 완료한 뒤 종료 처리했다.

### 11.1 최종 검증 기록

| 검증 항목 | 결과 |
| --- | --- |
| 전체 빌드 | 통과 |
| P2 관련 백엔드 회귀 spec | 전체 통과 |
| 5레벨 성장·종족·직업 런타임 | 확인 완료 |
| 주문 50개·몬스터 25종 대표 실행 경로 | 확인 완료 |
| 지형·오브젝트 상호작용 | 확인 완료 |
| 시나리오 제작 UI 저장·검증 흐름 | 확인 완료 |
| P2 검증 시나리오 플레이 | 완료 |
| 재접속과 GM private 정보 분리 | 확인 완료 |

## 12. 사용자 실행 검증

프로젝트 지침에 따라 자동 검증은 사용자가 직접 실행한다. 구현 단계별로 관련 spec을 안내하고, P2 종료 시 아래 범주를 최종 확인한다.

```powershell
npm run test:quiet -w @trpg/be -- rule-catalog.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- characters.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- action-rule.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- action-processor.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- combat.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- monster-ability.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- default-scenario.spec.ts --runInBand
npm run build
```

## 13. P2 이후

P3에서는 [`../future_plan_p3.md`](../future_plan_p3.md)를 기준으로 다음 범위를 진행한다.

- 직업과 서브클래스의 6레벨 이상 기능.
- 실행 가능 주문 100개.
- 몬스터 범위를 50종 이상으로 확대.
- 아이템, 장비, 소모품, 제작 콘텐츠 확장.
- 시나리오 제작 UI의 배포·버전·검증 워크플로.
- 장기 목표인 319개 주문과 317개 몬스터의 단계적 실행 가능화.
