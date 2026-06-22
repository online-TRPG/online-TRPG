# SRD 5e P3 8레벨 캠페인·콘텐츠 배포 확장 계획

작성일: 2026-06-22

## 1. 문서 목적

P2는 5레벨 플레이, 주문 50개, 몬스터 25종, 지형·오브젝트 상호작용과 시나리오 제작 UI MVP를 완료했다.

P3는 [`future_plan.md`](future_plan.md)의 장기 목표를 유지하면서 단편 제작 도구를 실제 공유 가능한 캠페인 제작 흐름으로 확장한다. 완료된 P2 기록은 [`completed/future_plan_p2.md`](completed/future_plan_p2.md)에 보관한다.

P3 범위는 다음 여섯 가지로 고정한다.

1. **테스트 DB 격리와 P2 회귀 기준 고정**
2. **직업 12개와 대표 서브클래스의 6~8레벨 플레이 가능화**
3. **실행 가능 주문 누적 100개**
4. **대표 몬스터 누적 50종**
5. **실행 가능 장비·소모품·마법 아이템 누적 50개**
6. **시나리오 배포·버전 관리 MVP와 P3 검증 모험 1개**

## 2. P3 원칙

- P2의 카탈로그 id, resolver, TurnLog/StateDiff, AI/HUMAN GM 공통 executor를 확장한다.
- 레벨·주문·몬스터·아이템 수량은 표시 데이터가 아니라 실제 API/UI 실행 가능 항목으로 계산한다.
- 프론트엔드는 서버의 행동 가능 여부, 비용, 대상, 결과를 표시하고 상태를 독자적으로 확정하지 않는다.
- E2E와 smoke 테스트는 격리된 테스트 DB만 사용하며 개발·운영 DB에 테스트 사용자나 세션을 남기지 않는다.
- 시나리오 공개본은 편집 draft와 분리하고, 실행 중 세션은 시작 당시 버전 snapshot을 유지한다.
- SRD 공개 범위와 프로젝트 오리지널 콘텐츠만 포함한다.

## 3. P3-0. 테스트 격리와 회귀 기준

작업:

1. E2E 실행 전 DB 이름 또는 schema가 `test`, `e2e`, `ci`인지 강제 검증한다.
2. 테스트에서 생성한 사용자·세션·캐릭터를 `afterAll` 정리 또는 transaction rollback으로 제거한다.
3. 세션 생성 fixture의 기본 visibility를 명시하고 공개 목록 오염 회귀 spec을 추가한다.
4. P2의 빌드와 핵심 회귀 spec을 P3 기준선으로 고정한다.
5. 주문·몬스터·아이템 카탈로그 수량 검사를 단일 manifest 검증으로 묶는다.

완료 기준:

- E2E가 개발·운영 DB를 가리키면 실행 전에 실패한다.
- E2E 종료 후 테스트 사용자와 테스트 세션이 0개다.
- P2 기능 회귀 명령이 P3 CI 기준에 포함된다.

## 4. P3-1. 직업 12개와 서브클래스 6~8레벨

목표 사용자 경험:

- P2의 5레벨 캐릭터를 8레벨까지 성장시킨다.
- 6~7레벨 직업·서브클래스 기능과 8레벨 ASI를 선택한다.
- 주문시전 직업은 4레벨 주문 슬롯과 준비·습득 주문을 관리한다.
- 레벨업 결과가 진행 중 세션과 재접속 snapshot에 유지된다.

구현 범위:

- 12개 직업의 HP, proficiency bonus, 자원, 주문 슬롯 진행.
- 직업별 6~8레벨 class feature.
- P1에서 선택한 대표 서브클래스 12개의 해당 레벨 feature.
- 8레벨 ASI. feat 선택은 P3 범위에서 제외한다.
- Extra Attack, Sneak Attack, Martial Arts, Bardic Inspiration 등 기존 scaling 연장.
- Paladin aura, Rogue Evasion, Monk ki 기능처럼 공통 save/damage resolver와 연결되는 대표 기능.
- 레벨업 미리보기, 서버 검증, 적용 후 세션 snapshot 갱신.

완료 기준:

- 12개 직업과 대표 서브클래스가 8레벨까지 성장 가능하다.
- 6~8레벨 신규 기능이 각 직업마다 최소 1개 실제 resolver를 통과한다.
- 8레벨 ASI, 4레벨 슬롯, 자원 증가와 휴식 회복이 유지된다.

## 5. P3-2. 실행 가능 주문 누적 100개

P2의 50개를 유지하고 50개를 추가한다.

분배 기준:

| 분류 | P3 추가 목표 |
| --- | ---: |
| 공격·광역 피해 | 12 |
| 회복·보호 | 8 |
| 버프·디버프 | 10 |
| 이동·강제이동 | 6 |
| 탐색·정보 | 7 |
| 소환·지형·오브젝트 | 7 |

레벨 범위:

- 캔트립부터 4레벨 주문까지.
- 8레벨 캐릭터가 사용할 수 있는 슬롯 범위를 우선한다.

필수 공통 기능:

- 다중 라운드 save end와 반복 피해.
- 이동형 지속 지역과 벽 형태 효과.
- 순간이동, 비행, 수영 등 이동 모드.
- 다중 대상 buff/debuff와 slot scaling.
- 소환체 또는 생성 오브젝트의 lifecycle.
- 해제·상쇄·면역·저항과 집중 종료.

완료 기준:

- 실행 가능 `spell_definitions`가 정확히 100개다.
- 100개 주문이 캐릭터 선택 UI, 전투 UI, command/API에서 같은 `spellId`를 사용한다.
- 비용, 대상, 슬롯, 집중, 지속시간, 결과가 TurnLog에 기록된다.

## 6. P3-3. 대표 몬스터 누적 50종

P2의 25종 이상을 정리해 기준 25종을 고정하고, 대표 몬스터 25종을 추가한다.

추가 분포:

| 역할 | 추가 목표 |
| --- | ---: |
| 전열·브루트 | 5 |
| 원거리·기동 | 4 |
| 주문사용자 | 4 |
| 언데드·구조물 | 4 |
| 비행·수중 | 3 |
| 군집·소환 | 2 |
| 보스급 복합 행동 | 3 |

구현 범위:

- aura, legendary-like phase, reaction, lair-style terrain trigger의 공통 표현.
- 주문사용 몬스터의 제한된 spell list와 slot/limited-use 자원.
- 비행·수영·등반 이동 모드와 고도.
- swallow, possession, petrify 등 다단계 상태 lifecycle.
- AI 행동 후보의 범위·대상 수·위험도·아군 피해 평가.
- HUMAN GM 행동 설명과 사용 불가 이유 표시.

완료 기준:

- 누적 50종이 정규화된 executable action을 가진다.
- 모든 몬스터가 AI/HUMAN GM 공통 action id와 executor를 사용한다.
- 25종 추가 몬스터의 대표 특수 행동이 TurnLog와 상태 변경으로 검증된다.

## 7. P3-4. 실행 가능 아이템 누적 50개

대상:

- 일반 무기·방어구·도구 20개.
- 소모품·탄약·투척물 15개.
- SRD 범위의 대표 마법 아이템 15개.

구현 범위:

- 장착 슬롯, 양손/한손, 방패, armor strength와 stealth 제약.
- 공격·피해·AC·내성·이동 modifier.
- potion, scroll, charge, ammunition과 limited use.
- attunement 필요 여부와 최대 슬롯.
- 아이템 사용 대상·거리·행동 비용.
- stack, container capacity, 무게 기반 서버 검증.
- 줍기·내려놓기·던지기·양도·소모 후 map/inventory 동기화.

완료 기준:

- 50개 아이템이 카탈로그 id로 장착 또는 사용 가능하다.
- 유효하지 않은 장착, 수량, 거리, 용량, attunement는 서버에서 차단된다.
- 아이템 변화가 재접속 후 복원되고 TurnLog/StateDiff에 남는다.

## 8. P3-5. 시나리오 배포·버전 관리 MVP

목표 사용자 경험:

- 제작자는 draft를 저장하고 검증 후 공개 버전을 발행한다.
- 공개 버전을 수정할 때 기존 플레이 세션은 영향을 받지 않는다.
- 다른 사용자는 공개 시나리오를 검색하고 세션을 생성할 수 있다.

데이터·API 범위:

- scenario draft와 published revision 분리.
- revision number, changelog, publishedAt, publishedBy.
- 공개/비공개/링크 공개 상태.
- 발행 전 서버 validation report 저장.
- 실행 중 `SessionScenarioNode` snapshot에 revision id 기록.
- 공개 취소는 신규 세션 생성만 막고 기존 세션 snapshot은 유지.

제작 UI 범위:

- draft, 검증 완료, 발행 상태 표시.
- 변경 내역과 revision 비교 요약.
- validation 오류에서 문제 노드로 이동.
- 공개 목록 미리보기와 플레이 테스트 세션 생성.
- 복제 후 독립 draft로 편집.

완료 기준:

- draft 저장 → 검증 → 발행 → 검색 → 새 세션 생성 흐름이 UI에서 가능하다.
- 발행 후 원본 draft를 수정해도 기존 세션 데이터가 변하지 않는다.
- GM private 데이터와 미공개 revision은 플레이어·다른 제작자에게 노출되지 않는다.

## 9. P3-6. 검증 모험

검증 시나리오:

- 8레벨 오리지널 중편 1개.
- 예상 플레이 시간 90~120분.
- story, exploration, combat 노드를 각각 2개 이상 포함한다.
- P3 추가 주문 10개 이상이 유용한 장면을 포함한다.
- P3 추가 몬스터 8종 이상과 보스급 복합 행동 1개를 포함한다.
- 소모품, 장착 아이템, 마법 아이템을 각각 2개 이상 사용한다.
- 시나리오를 revision 1로 발행한 뒤 revision 2를 만들어 snapshot 격리를 검증한다.

완료 기준:

- 제작 UI만으로 핵심 노드와 카탈로그 참조를 생성·수정·발행한다.
- AI GM과 HUMAN GM으로 각각 완주한다.
- 중간 재접속 후 성장, 전투, 지형, 아이템, revision snapshot이 복원된다.
- revision 2 발행 후 revision 1 세션의 내용이 바뀌지 않는다.

## 10. 실행 순서

```text
P3-0 테스트 DB 격리와 P2 회귀 기준
↓
P3-1 직업·서브클래스 6~8레벨
↓
P3-2 주문 누적 100개
↓
P3-3 몬스터 누적 50종
↓
P3-4 실행 가능 아이템 50개
↓
P3-5 시나리오 배포·버전 관리
↓
P3-6 8레벨 검증 모험
```

## 11. P3 완료 체크리스트

- [ ] E2E가 격리된 테스트 DB에서만 실행되고 종료 후 테스트 데이터가 남지 않는다.
- [ ] 12개 직업과 대표 서브클래스가 8레벨까지 성장 가능하다.
- [ ] 8레벨 ASI, 4레벨 주문 슬롯, 직업 자원 진행이 동작한다.
- [ ] 실행 가능 주문이 정확히 100개다.
- [ ] 대표 몬스터가 누적 50종이다.
- [ ] 실행 가능 아이템이 누적 50개다.
- [ ] 시나리오 draft·validation·publish·revision 흐름이 동작한다.
- [ ] 발행 revision과 실행 중 세션 snapshot이 격리된다.
- [ ] P3 검증 모험을 AI GM과 HUMAN GM에서 완주했다.
- [ ] 재접속과 공개/비공개 정보 분리를 확인했다.
- [ ] 전체 빌드와 관련 회귀 spec을 사용자가 실행해 통과를 확인했다.

## 12. 사용자 실행 검증

프로젝트 지침에 따라 테스트는 사용자가 직접 실행한다. 구현 단계별 관련 spec을 안내하고, P3 종료 시 최소 아래 범주를 확인한다.

```powershell
npm run test:quiet -w @trpg/be -- rule-catalog.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- characters.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- level-up.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- action-rule.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- action-economy.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- monster-ability.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- combat.service.spec.ts --runInBand
npm run test:quiet -w @trpg/be -- default-scenario.spec.ts --runInBand
npm run build
```

## 13. P3 이후

P4에서는 장기 목표를 향해 다음 범위를 다룬다.

- 직업과 서브클래스의 9레벨 이상 기능.
- 실행 가능 주문 150개 이상.
- 몬스터 100종 이상.
- 아이템 제작, 상점, 보상 테이블과 경제 시스템.
- 시나리오 협업 편집, 리뷰, 배포 정책.
- 장기 목표인 주문 319개와 몬스터 317개의 단계적 실행 가능화.
