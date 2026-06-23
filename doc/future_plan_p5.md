# SRD 5e P5 고레벨 캠페인 운영·공개 생태계 확장 계획

작성일: 2026-06-23

## 1. 문서 목적

P4는 12레벨 성장, 주문 150개, 몬스터 100종, 경제 시스템과 시나리오 협업·리뷰·발행 정책을 완료했다. 완료 기록은 [`completed/future_plan_p4.md`](completed/future_plan_p4.md)에 보관한다.

P5는 [`future_plan.md`](future_plan.md)의 장기 목표를 유지하면서 13~16레벨 고레벨 플레이와 여러 회차에 걸친 캠페인 운영, 공개 시나리오 탐색·평가·fork 생태계를 실제 사용자 흐름으로 연결하는 단계다.

P5 범위는 다음 일곱 가지로 고정한다.

1. **P4 회귀 기준과 장기 캠페인 성능·무결성 안정화**
2. **직업 12개와 대표 서브클래스의 13~16레벨 플레이 가능화**
3. **실행 가능 주문 누적 220개**
4. **대표 몬스터 누적 180종**
5. **캠페인 캘린더·세션 일정·장기 downtime MVP**
6. **공개 시나리오 탐색·추천·평점·fork 생태계 MVP**
7. **16레벨 P5 검증 캠페인 1개**

## 2. P5 원칙

- P4의 카탈로그 id, 공통 resolver, TurnLog/StateDiff, 서버 권위 경제 상태와 revision snapshot 구조를 유지한다.
- 콘텐츠 수량에는 UI/API에서 실제 선택·실행되고 결과가 기록되는 항목만 포함한다.
- 장기 캠페인 일정과 downtime 결과는 시간 경과를 임의로 클라이언트가 확정하지 않고 서버가 검증한다.
- 공개 시나리오 추천과 평점은 조작 방지, 권한, 신고·비공개 정책을 함께 구현한다.
- fork는 원본 attribution과 revision 계보를 보존하지만 이후 편집 상태는 독립시킨다.
- SRD 공개 범위와 프로젝트 오리지널 콘텐츠만 포함한다.

## 3. P5-0. P4 회귀·성능·장기 데이터 무결성

작업:

1. `test:p5-regression`을 추가하고 P4 baseline과 P5 신규 spec을 묶는다.
2. 장기 세션의 다량 TurnLog/StateDiff, inventory, economy, schedule 데이터를 대상으로 조회·snapshot 성능 기준을 고정한다.
3. revision, fork, 공개 취소, 신고 비공개 전환 후 기존 세션 snapshot이 변하지 않는지 검증한다.
4. E2E 격리 DB 자동 파생과 테스트 데이터 정리 기준을 유지한다.
5. 반복 요청, 중복 일정 등록, 중복 평점, 중복 downtime 완료를 idempotency 기준으로 차단한다.

완료 기준:

- `npm run test:p5-regression`, `npm run test:e2e`, `npm run build`가 통과한다.
- P4 기능이 P5 추가 후에도 회귀 없이 동작한다.
- 장기 캠페인 snapshot과 목록 API가 정한 성능 기준을 넘지 않는다.
- 테스트·게스트·공개 세션 데이터가 개발 목록을 오염시키지 않는다.

## 4. P5-1. 직업·서브클래스 13~16레벨

목표 사용자 경험:

- 12레벨 캐릭터를 16레벨까지 성장시킨다.
- 13~16레벨 직업·서브클래스 기능, 14/16레벨 ASI, 주문 슬롯과 자원 진행을 선택·검증한다.
- 성장 결과가 진행 중 캠페인, downtime, 전투와 재접속 snapshot에 유지된다.

구현 범위:

- 12개 직업의 13~16레벨 HP, proficiency bonus, 자원, 주문 슬롯 진행.
- 대표 서브클래스 12개의 해당 레벨 feature.
- 14/16레벨 ASI와 P4에서 준비한 feat 선택 hook의 서버 검증 구조.
- 7~8레벨 주문 슬롯과 pact magic/arcanum 계열 진행.
- Fighter 추가 공격, Rogue 고레벨 방어·기술 기능, Paladin aura, Monk 자원, full/half caster progression의 대표 실행 경로.
- 레벨업 preview에서 기존 집중·조건·장비·준비 주문·downtime 작업 영향 표시.

완료 기준:

- 12개 직업과 대표 서브클래스가 16레벨까지 성장 가능하다.
- 각 직업의 13~16레벨 기능 중 최소 1개가 실제 resolver 또는 상태 반영 경로를 가진다.
- ASI, 슬롯, 자원 회복과 재접속 snapshot이 회귀 spec으로 고정된다.

## 5. P5-2. 실행 가능 주문 누적 220개

P4의 150개를 유지하고 70개를 추가한다.

| 분류 | P5 추가 목표 |
| --- | ---: |
| 7~8레벨 핵심 전투 주문 | 16 |
| 회복·보호·부활·해제 | 10 |
| 장기 buff/debuff와 정신 효과 | 12 |
| 순간이동·차원·장거리 이동 | 8 |
| 탐색·정보·사회·예지 | 10 |
| 소환·변신·벽·환경 제어 | 14 |

구현 범위:

- 7~8레벨 주문과 기존 저레벨 미지원 핵심 주문을 함께 채운다.
- 장거리 이동, 텔레포트 실패/편차, 차원 이동과 캠페인 위치 상태를 연결한다.
- 고레벨 소환·변신은 token owner, stat replacement, concentration과 종료 lifecycle을 기록한다.
- 정신 지배·추방·석화·부활 같은 다단계 상태를 공통 condition lifecycle로 처리한다.
- 광역 지속 효과, 반복 save, dispel/counter, immunity와 upcast를 공통 resolver로 처리한다.

완료 기준:

- 실행 가능 `spell_definitions`가 정확히 220개다.
- 신규 70개가 캐릭터 선택 UI, 전투·탐색 UI, command/API에서 동일 `spellId`를 사용한다.
- 슬롯, 재료·비용, 집중, 대상, 지속시간과 결과가 TurnLog/StateDiff에 기록된다.

## 6. P5-3. 대표 몬스터 누적 180종

P4의 100종을 유지하고 대표 몬스터 80종을 추가한다.

| 역할 | 추가 목표 |
| --- | ---: |
| 고레벨 브루트·솔저 | 14 |
| 비행·수중·굴착·순간이동 | 12 |
| 주문사용자·지도자 | 14 |
| 언데드·악마·천상·정령·구조물 | 16 |
| 군집·소환·변신 | 8 |
| 보스·다단계 전투 | 16 |

구현 범위:

- legendary action/resistance, phase transition, mythic-like second phase의 공통 표현.
- lair/terrain trigger와 캠페인 지역 효과.
- 고레벨 spell list, recharge, limited use와 자원 추적.
- dominate, banish, petrify, swallow, possession, regeneration 등 복합 lifecycle.
- AI 행동 평가에서 목표 가치, 집중 방해, 퇴각, 부하 지휘와 지형 위험을 고려한다.
- HUMAN GM UI에서 phase, recharge, legendary 자원과 사용 불가 이유를 표시한다.

완료 기준:

- 누적 180종이 executable action을 가진다.
- 신규 80종이 AI/HUMAN GM 공통 action id와 executor를 사용한다.
- 대표 특수 행동과 다단계 보스 전투가 TurnLog/StateDiff로 검증된다.

## 7. P5-4. 캠페인 캘린더·일정·장기 downtime MVP

목표 사용자 경험:

- 캠페인 구성원이 다음 세션 후보 시간을 제안하고 참석 여부를 표시한다.
- GM은 게임 내 날짜와 현실 세션 일정을 분리해 관리한다.
- 캐릭터는 세션 사이에 제작, 훈련, 연구, 회복, 상점 운영 같은 장기 downtime을 수행한다.

구현 범위:

- campaign calendar와 real-world session schedule.
- 시간대가 포함된 일정 후보, 참가 가능/불가/미정 응답과 확정 알림 상태.
- in-game date, 경과 일수와 캠페인 timeline event.
- downtime task: 제작, 훈련, 연구, 회복, 감정, 수리, 상점 재입고.
- 비용, 작업 시간, 도구·시설·숙련 조건과 중단/재개.
- downtime 완료 시 inventory, economy, character resource와 감사 로그 반영.
- GM 승인 정책과 AI GM 자동 승인 조건.

완료 기준:

- 일정 제안 → 참가 응답 → 일정 확정 흐름이 UI에서 가능하다.
- 게임 시간 경과와 현실 일정이 섞이지 않는다.
- downtime 작업이 중단·재개·완료되고 재접속 후 복원된다.
- 모든 시간·경제·아이템 변화가 서버 권위 상태와 감사 로그에 남는다.

## 8. P5-5. 공개 시나리오 탐색·추천·평점·fork 생태계 MVP

목표 사용자 경험:

- 사용자는 공개 시나리오를 레벨, 예상 시간, 태그, 평점, 최신순으로 탐색한다.
- 플레이 완료 후 평점과 리뷰를 남긴다.
- 공개 revision을 fork해 독립 draft로 수정하되 원본 출처와 계보를 확인할 수 있다.

구현 범위:

- 공개 검색 필터, 정렬, 페이지네이션과 상세 미리보기.
- 태그, 권장 레벨, 예상 시간, GM 모드, 콘텐츠 경고 metadata.
- 추천 MVP: 필터 적합도, 완료 수, 평점, 최근 활동을 이용한 설명 가능한 정렬.
- 세션 참여·완료 사용자만 평점/리뷰 작성 가능.
- 사용자별 revision 1개 평점, 수정·삭제와 집계 재계산.
- fork lineage: source scenario/revision, attribution, fork count.
- 신고 누적, moderation 상태, 검색 제외와 owner 이의 제기 hook.
- private/link/unpublished 및 GM private data 검색 노출 차단.

완료 기준:

- 공개 시나리오를 검색·필터·정렬하고 상세에서 세션 생성 또는 fork할 수 있다.
- 권한 없는 평점과 중복 평점이 서버에서 차단된다.
- fork 후 원본 수정이 fork draft를 변경하지 않으며 attribution 계보가 유지된다.
- 신고·비공개 전환된 revision이 신규 탐색에서 제외되고 기존 세션은 유지된다.

## 9. P5-6. 16레벨 검증 캠페인

검증 시나리오:

- 16레벨 오리지널 캠페인 챕터 1개.
- 예상 플레이 시간 3~4회 세션 또는 240~360분.
- story, exploration, combat, travel, downtime 노드를 각각 2개 이상 포함한다.
- P5 추가 주문 15개 이상, P5 추가 몬스터 16종 이상, 다단계 보스 2종 이상을 사용한다.
- 일정 제안·확정, 게임 내 시간 경과, downtime 작업 5종 이상을 포함한다.
- 공개 revision 발행, 검색·평점·리뷰·fork·신고 흐름을 검증한다.

완료 기준:

- AI GM과 HUMAN GM으로 주요 경로를 각각 완주한다.
- 12레벨 캐릭터의 16레벨 성장과 7~8레벨 주문 사용을 확인한다.
- 세션 사이 일정·downtime·경제·inventory와 재접속 복원을 확인한다.
- revision 2, fork draft와 기존 revision 1 세션 snapshot이 서로 격리된다.
- 공개 탐색부터 세션 생성, 완료 후 평점까지 사용자 흐름이 이어진다.

## 10. 실행 순서

```text
P5-0 P4 회귀·성능·무결성 기준
↓
P5-1 직업·서브클래스 13~16레벨
↓
P5-2 주문 누적 220개
↓
P5-3 몬스터 누적 180종
↓
P5-4 캠페인 캘린더·일정·downtime
↓
P5-5 공개 탐색·추천·평점·fork
↓
P5-6 16레벨 검증 캠페인
```

## 11. P5 완료 체크리스트

- [ ] `test:p5-regression`이 P4 기준선과 P5 신규 spec을 포함한다.
- [ ] 격리 E2E와 장기 캠페인 데이터 무결성 검증이 통과한다.
- [ ] 12개 직업과 대표 서브클래스가 16레벨까지 성장 가능하다.
- [ ] 14/16레벨 ASI, 7~8레벨 주문 슬롯과 직업 자원 진행이 동작한다.
- [ ] 실행 가능 주문이 정확히 220개다.
- [ ] 대표 몬스터가 누적 180종이다.
- [ ] 일정 제안·응답·확정과 게임 내 timeline이 동작한다.
- [ ] 장기 downtime 작업이 서버 권위 상태와 감사 로그로 처리된다.
- [ ] 공개 검색·추천·평점·리뷰·fork·moderation 정책이 동작한다.
- [ ] P5 검증 캠페인을 AI GM과 HUMAN GM에서 완주했다.
- [ ] 전체 빌드, 회귀, E2E와 수동 사용자 흐름을 사용자가 확인했다.

## 12. 사용자 실행 검증

프로젝트 지침에 따라 테스트는 사용자가 직접 실행한다. P5 종료 시 최소 다음 명령을 확인한다.

```powershell
npm run test:p5-regression
npm run test:e2e
npm run build
```

추가 수동 검증:

- AI GM/HUMAN GM 16레벨 캠페인.
- 일정 제안·참석 응답·확정과 시간대 표시.
- downtime 중단·재개·완료 및 재접속 복원.
- 공개 검색·필터·추천 근거·평점·리뷰.
- revision fork, attribution 계보와 snapshot 격리.
- 신고·검색 제외 후 기존 세션 보존.

## 13. P5 이후

P6에서는 장기 목표의 최종 구간을 향해 다음 범위를 다룬다.

- 17~20레벨 플레이와 9레벨 주문.
- 실행 가능 주문 319개 전체.
- 대표 몬스터 250종 이상을 거쳐 최종 317종으로 확장.
- 캠페인 분석, 운영자 moderation 도구와 대규모 공개 콘텐츠 운영.
- 장기 캠페인 완결·후일담·캐릭터 보관소와 새 캠페인 이관.
