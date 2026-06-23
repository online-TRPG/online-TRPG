# SRD 5e P4 12레벨 캠페인 운영·콘텐츠 확장 계획

작성일: 2026-06-23
완료일: 2026-06-23

구현 상태: **완료**

검증 기록:

- `npm run test:p4-regression`: 통과 확인.
- `npm run test:e2e`: 통과 확인.
- `npm run build`: 통과 확인.
- AI GM/HUMAN GM P4 검증 캠페인: 완료 확인.
- 경제, 협업·리뷰·발행, 동시 편집 충돌, revision diff와 snapshot 격리: 완료 확인.

## 1. 문서 목적

P3는 8레벨 플레이, 주문 100개, 몬스터 50종, 아이템 50개, 시나리오 발행·revision MVP, 격리 E2E 검증을 완료했다. 완료된 P3 기록은 [`completed/future_plan_p3.md`](completed/future_plan_p3.md)에 보관한다.

P4는 [`../future_plan.md`](../future_plan.md)의 장기 목표를 유지하면서 단편·중편 플레이에서 장기 캠페인 운영으로 넘어가는 단계다. 목표는 “중반부 캐릭터 성장과 캠페인 운영 도구를 실제 플레이 가능한 수준으로 묶는 것”이다.

P4 범위는 다음 여섯 가지로 고정한다.

1. **P3 회귀·E2E 기준 안정화와 장기 캠페인 데이터 무결성**
2. **직업 12개와 대표 서브클래스의 9~12레벨 플레이 가능화**
3. **실행 가능 주문 누적 150개**
4. **대표 몬스터 누적 100종**
5. **상점·보상·제작·경제 시스템 MVP**
6. **시나리오 협업·리뷰·배포 정책과 P4 검증 캠페인 1개**

## 2. P4 원칙

- P3의 카탈로그 id, resolver, TurnLog/StateDiff, AI/HUMAN GM 공통 executor를 유지한다.
- “보이는 데이터”가 아니라 실제 캐릭터 성장, 전투, 탐색, 아이템, 시나리오 운영 경로에서 실행되는 항목만 수량에 포함한다.
- 장기 캠페인 데이터는 revision, 세션 snapshot, 캐릭터 성장 이력, 보상 이력을 분리해 추적한다.
- 경제·상점·제작은 서버 권위 상태로 처리하고, 프론트엔드는 비용·조건·결과를 표시한다.
- 협업·리뷰 기능은 공개 전 검증과 권한 분리를 우선한다.
- SRD 공개 범위와 프로젝트 오리지널 콘텐츠만 포함한다.

## 3. P4-0. P3 회귀 기준과 장기 데이터 무결성

작업:

1. P3 자동 검증 명령을 P4 baseline으로 고정한다.
2. `test:p4-regression` 스크립트를 추가하고 P3 기준선과 P4 신규 spec을 묶는다.
3. E2E DB schema 자동 파생과 정리 정책을 회귀 spec 또는 safety check로 고정한다.
4. 장기 세션에서 캐릭터 성장, inventory, reward, scenario revision snapshot이 서로 덮어쓰지 않는지 검증한다.
5. 공개 세션·테스트 세션·게스트 데이터 오염 방지 기준을 유지한다.

완료 기준:

- `npm run test:p4-regression`, `npm run test:e2e`, `npm run build`가 통과한다.
- P3 기능 회귀가 P4 신규 기능 추가 후에도 통과한다.
- 장기 세션 snapshot이 캐릭터·아이템·시나리오 revision 변경에도 일관성을 유지한다.

## 4. P4-1. 직업 12개와 서브클래스 9~12레벨

목표 사용자 경험:

- P3의 8레벨 캐릭터를 12레벨까지 성장시킨다.
- 9~12레벨 class feature, subclass feature, ASI, 주문 슬롯 진행을 선택·검증·적용한다.
- 장기 세션 중 레벨업 결과가 진행 중 전투와 재접속 snapshot에 유지된다.

구현 범위:

- 12개 직업의 9~12레벨 HP, proficiency bonus, 주문 슬롯, 자원 진행.
- 대표 서브클래스 12개의 9~12레벨 feature.
- 10레벨·12레벨 ASI 처리. feat 선택은 P4 범위에서는 “선택 가능 구조”만 준비하고 실제 feat catalog는 제외한다.
- 5레벨 이상 주문 슬롯과 pact magic scaling.
- Paladin aura 확장, Fighter extra ASI/extra attack 진행, Rogue Reliable Talent 준비, Monk mobility, Warlock invocation-like 확장 hooks.
- 레벨업 preview에서 세션 반영 영향, 주문 준비 한도, 자원 변화, 기존 조건/집중과의 충돌을 표시한다.

완료 기준:

- 12개 직업이 12레벨까지 성장 가능하다.
- 9~12레벨에서 각 직업마다 최소 1개 이상 실제 resolver 또는 상태 반영 경로가 있다.
- ASI, 주문 슬롯, 자원 회복, 재접속 snapshot이 회귀 테스트로 고정된다.

## 5. P4-2. 실행 가능 주문 누적 150개

P3의 100개를 유지하고 50개를 추가한다.

분배 기준:

| 분류 | P4 추가 목표 |
| --- | ---: |
| 5~6레벨 핵심 전투 주문 | 12 |
| 회복·부활·보호 | 8 |
| 장기 buff/debuff와 해제 | 10 |
| 이동·순간이동·차원 이동 | 6 |
| 탐색·정보·사회 상호작용 | 7 |
| 소환·벽·오브젝트·환경 제어 | 7 |

구현 범위:

- 5~6레벨 주문까지 우선 지원한다.
- 장기 지속, upcast scaling, concentration 전환, 해제/상쇄를 공통 처리한다.
- teleport, flight, water breathing, planar-like travel은 탐색/맵 상태와 연결한다.
- resurrection 계열은 세션 캐릭터 사망 상태와 자원 비용을 서버에서 검증한다.
- 소환·생성물은 token/object lifecycle과 owner/action economy를 기록한다.

완료 기준:

- 실행 가능 `spell_definitions`가 정확히 150개다.
- 신규 50개 주문은 캐릭터 선택 UI, 전투 UI, command/API에서 같은 `spellId`를 사용한다.
- 비용, 대상, 슬롯, 집중, 지속시간, 결과가 TurnLog/StateDiff에 기록된다.

## 6. P4-3. 대표 몬스터 누적 100종

P3의 50종을 유지하고 대표 몬스터 50종을 추가한다.

추가 분포:

| 역할 | 추가 목표 |
| --- | ---: |
| 중반부 브루트·솔저 | 10 |
| 고기동·비행·수중 | 8 |
| 주문사용자·지도자 | 8 |
| 언데드·악마·정령·구조물 | 10 |
| 군집·소환·하수인 | 6 |
| 보스급 복합 행동 | 8 |

구현 범위:

- legendary-like action, reaction, recharge, aura, terrain/lair-style trigger의 공통 표현.
- 주문사용 몬스터의 제한된 spell list와 자원 추적.
- charm, fear, possession, petrify, swallow, grapple/restrain 등 다단계 상태 lifecycle.
- AI 행동 평가에서 아군 피해, 지형 위험, 목표 우선순위, 후퇴/재배치를 고려한다.
- HUMAN GM UI는 특수 행동 사용 조건, recharge 상태, 대상 가능 여부를 표시한다.

완료 기준:

- 누적 100종이 executable action을 가진다.
- 신규 50종의 대표 행동이 AI/HUMAN GM 공통 action id와 executor를 사용한다.
- 몬스터 특수 행동이 TurnLog/StateDiff와 조건 lifecycle로 검증된다.

## 7. P4-4. 상점·보상·제작·경제 시스템 MVP

목표 사용자 경험:

- GM은 시나리오 노드, 몬스터, 오브젝트, 퀘스트에 보상 테이블을 연결한다.
- 플레이어는 세션 중 획득한 보상과 화폐를 캐릭터 inventory에 반영한다.
- 상점에서 구매·판매하고, 제작/수리/감정 같은 downtime 행동을 처리한다.

구현 범위:

- 화폐 단위와 캐릭터/세션별 잔액.
- shop inventory, 가격, 재고, 구매 제한, 판매가 정책.
- reward table: 전투 보상, 탐색 보상, 퀘스트 보상, GM 수동 보상.
- loot 분배와 party stash.
- 제작 recipe, 재료, 소요 시간, 도구 숙련 조건.
- magic item 감정, attunement, charge 회복과 경제 기록.
- 모든 경제 변화 TurnLog/StateDiff 기록.

완료 기준:

- 상점 구매·판매·재고 차감이 서버에서 검증된다.
- 보상 지급과 party stash 분배가 재접속 후 복원된다.
- 제작/감정/수리 결과가 캐릭터 inventory와 감사 로그에 남는다.

## 8. P4-5. 시나리오 협업·리뷰·배포 정책

목표 사용자 경험:

- 여러 제작자가 같은 draft를 협업 편집한다.
- 발행 전 리뷰 요청과 승인/반려 기록을 남긴다.
- 공개 범위, 링크 공개, 비공개, 워크스페이스 공개 정책을 명확히 구분한다.

구현 범위:

- draft collaborator 권한: owner, editor, reviewer, viewer.
- 변경 충돌 감지와 section-level dirty state.
- review request, approval, rejection, comment thread.
- publish policy: 미검증 발행 차단, private data 노출 검사, 라이선스/attribution 검사.
- revision diff: node, map, monster, item, private note, reward table 변경 요약.
- public listing moderation flags와 신고/비공개 전환 hooks.

완료 기준:

- owner가 collaborator를 추가·제거하고 권한별 편집 가능 범위가 분리된다.
- review 승인 전 발행을 막을 수 있다.
- revision diff와 validation report가 UI에서 확인된다.
- private GM 데이터가 공개 목록과 플레이어 view에 노출되지 않는다.

## 9. P4-6. P4 검증 캠페인

검증 시나리오:

- 12레벨 오리지널 캠페인 챕터 1개.
- 예상 플레이 시간 2~3회 세션 또는 180~240분.
- story, exploration, combat, downtime/shop 노드를 각각 2개 이상 포함한다.
- P4 추가 주문 10개 이상, P4 추가 몬스터 12종 이상, P4 경제/보상 기능 5개 이상을 사용한다.
- 공개 revision 1과 revision 2를 발행하고, 기존 세션 snapshot 격리를 검증한다.

완료 기준:

- 제작 UI만으로 핵심 노드, 보상, 상점, 몬스터, 주문 참조를 생성·수정·발행한다.
- AI GM과 HUMAN GM으로 주요 경로를 각각 완주한다.
- 중간 재접속 후 성장, 전투, 경제, 아이템, revision snapshot이 복원된다.
- revision 2 발행 후 revision 1 세션의 내용이 바뀌지 않는다.

## 10. 실행 순서

```text
P4-0 P3 회귀·E2E 기준 고정
↓
P4-1 직업·서브클래스 9~12레벨
↓
P4-2 주문 누적 150개
↓
P4-3 몬스터 누적 100종
↓
P4-4 상점·보상·제작·경제 시스템
↓
P4-5 협업·리뷰·배포 정책
↓
P4-6 12레벨 검증 캠페인
```

## 11. P4 완료 체크리스트

- [x] `test:p4-regression`이 P3 기준선과 P4 신규 spec을 포함한다.
- [x] E2E가 격리 DB에서 통과하고 테스트 데이터가 남지 않는다.
- [x] 12개 직업과 대표 서브클래스가 12레벨까지 성장 가능하다.
- [x] 10/12레벨 ASI, 5~6레벨 주문 슬롯, 직업 자원 진행이 동작한다.
- [x] 실행 가능 주문이 정확히 150개다.
- [x] 대표 몬스터가 누적 100종이다.
- [x] 상점·보상·제작·경제 변화가 서버 권위 상태와 TurnLog/StateDiff로 기록된다.
- [x] 시나리오 협업·리뷰·발행 정책이 권한별로 동작한다.
- [x] P4 검증 캠페인을 AI GM과 HUMAN GM에서 주요 경로로 완주했다.
- [x] 전체 빌드와 관련 회귀 spec을 사용자가 실행해 통과를 확인했다.

## 12. 사용자 실행 검증

프로젝트 지침에 따라 테스트는 사용자가 직접 실행한다. P4 종료 시 최소 아래 범주를 확인한다.
상세 절차는 [`../examples/P4_VALIDATION_RUNBOOK.md`](../examples/P4_VALIDATION_RUNBOOK.md)를 기준으로 한다.

```powershell
npm run test:p4-regression
npm run test:e2e
npm run build
```

세부 회귀 기준선은 다음을 포함한다.

- P3 baseline 전체.
- 9~12레벨 성장, ASI, 주문 슬롯, 자원 회복 spec.
- 주문 150개, 몬스터 100종, 경제/아이템 manifest spec.
- 상점·보상·제작·party stash service spec.
- 시나리오 collaborator/review/publish policy spec.
- P4 검증 캠페인 seed와 AI/HUMAN GM smoke spec.

## 13. P4 완료 기록

P4는 전체 빌드, P4 회귀 테스트, 격리 E2E, AI/HUMAN GM 검증 캠페인과 수동 사용자 흐름 검증을 거쳐 완료 처리했다.

완료된 핵심 범위:

- 12개 직업과 대표 서브클래스의 12레벨 성장 및 5~6레벨 주문 슬롯.
- 실행 가능 주문 150개와 대표 몬스터 100종.
- 서버 권위 상점·보상·party stash·제작·감정·수리·조율·charge 회복.
- owner/editor/reviewer/viewer 협업 권한과 review 승인 발행 정책.
- 동시 편집 충돌 감지, section dirty state, revision diff와 moderation 신고 hook.
- P4 검증 캠페인의 재접속 복원 및 revision snapshot 격리.

## 14. P4 이후

P5에서는 장기 목표를 향해 다음 범위를 다룬다.

- 고레벨 13~16레벨 플레이와 7~8레벨 주문.
- 주문 220개 이상, 몬스터 180종 이상.
- 대규모 캠페인 캘린더, 세션 일정, 장기 downtime.
- 공개 시나리오 탐색·추천·평점·fork 생태계.
- 장기 목표인 주문 319개와 몬스터 317개의 단계적 실행 가능화.
