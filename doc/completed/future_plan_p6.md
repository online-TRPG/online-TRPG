# SRD 5e P6 최종 레벨·전체 콘텐츠·장기 캠페인 완결 계획

작성일: 2026-06-24

## 1. 문서 목적

P5는 16레벨 고레벨 캠페인, 주문 220개, 몬스터 180종, 캠페인 캘린더·downtime MVP, 공개 시나리오 탐색·fork 생태계를 완료했다. 완료 기록은 [`future_plan_p5.md`](future_plan_p5.md)에 보관한다.

P6는 [`../future_plan.md`](../future_plan.md)의 장기 목표 중 아직 남은 최종 구간을 실제 사용자 흐름으로 닫는 단계다. 목표는 17~20레벨 플레이, 9레벨 주문, SRD 주문 319개 전체 실행화, 몬스터 317종 전체 실행화, 운영자급 공개 콘텐츠 관리, 장기 캠페인 완결·보관·이관을 하나의 완성된 캠페인 운영 루프로 연결하는 것이다.

P6 범위는 다음 일곱 가지로 고정한다.

1. **P5 회귀 기준과 최종 콘텐츠 무결성 안정화**
2. **직업 12개와 대표 서브클래스의 17~20레벨 플레이 가능화**
3. **실행 가능 주문 319개 전체**
4. **대표 몬스터 317종 전체**
5. **운영자 moderation·공개 콘텐츠 운영 도구**
6. **장기 캠페인 완결·후일담·캐릭터 보관소·새 캠페인 이관**
7. **20레벨 P6 최종 검증 캠페인 1개**

## 2. P6 원칙

- P5까지 확정한 카탈로그 id, 공통 resolver, TurnLog/StateDiff, 서버 권위 상태, revision snapshot 구조를 유지한다.
- 콘텐츠 수량에는 UI/API에서 선택 가능하고, 실행 결과가 기록되는 항목만 포함한다.
- 17~20레벨 기능은 표시용 feature가 아니라 최소한 자원, 슬롯, 조건, 행동 후보, snapshot 중 하나에 실제 영향을 남긴다.
- 9레벨 주문과 고CR 몬스터는 실패·부분 성공·면역·대체 효과까지 TurnLog/StateDiff에 남긴다.
- 운영자 moderation은 플레이어/creator 권한과 분리하고, 모든 조작은 감사 로그로 남긴다.
- 캠페인 완결은 세션 종료만이 아니라 후일담, 캐릭터 보관, 다음 캠페인 이관까지 포함한다.
- SRD 공개 범위와 프로젝트 오리지널 콘텐츠만 포함한다.

## 3. P6-0. P5 회귀·최종 콘텐츠 무결성 기준

작업:

1. `test:p6-regression`을 추가하고 P5 baseline과 P6 신규 spec을 묶는다.
2. 실행 가능 주문 319개, 몬스터 317종, 20레벨 성장 snapshot을 manifest로 고정한다.
3. 대량 공개 시나리오, 대량 rating/review/report, 대량 campaign archive 데이터를 대상으로 목록·검색·snapshot 성능 기준을 고정한다.
4. P5 E2E 격리 DB 자동 파생과 테스트 데이터 정리 기준을 유지한다.
5. 반복 moderation 처리, 중복 campaign completion, 중복 character transfer를 idempotency 기준으로 차단한다.

완료 기준:

- `npm run test:p6-regression`, `npm run test:e2e`, `npm run build`가 통과한다.
- P5 기능이 P6 추가 후에도 회귀 없이 동작한다.
- 최종 콘텐츠 manifest가 주문 319개, 몬스터 317종을 정확히 고정한다.
- 장기 캠페인 archive와 공개 콘텐츠 목록 API가 정한 성능 기준을 넘지 않는다.

## 4. P6-1. 직업·서브클래스 17~20레벨

목표 사용자 경험:

- 16레벨 캐릭터를 20레벨까지 성장시킨다.
- 17~20레벨 직업·서브클래스 기능, 19레벨 ASI, 20레벨 capstone, 9레벨 슬롯과 자원 진행을 선택·검증한다.
- 성장 결과가 진행 중 캠페인, 최종 전투, downtime, campaign archive와 재접속 snapshot에 유지된다.

구현 범위:

- 12개 직업의 17~20레벨 HP, proficiency bonus, 자원, 주문 슬롯 진행.
- 대표 서브클래스 12개의 17~20레벨 feature.
- 19레벨 ASI와 feat 선택 hook의 서버 검증 구조.
- 20레벨 capstone: Barbarian Primal Champion, Bard Superior Inspiration, Cleric Divine Intervention 개선, Druid Archdruid, Fighter Extra Attack(3), Monk Perfect Self, Paladin Sacred Oath capstone, Ranger Foe Slayer, Rogue Stroke of Luck, Sorcerer Sorcerous Restoration, Warlock Eldritch Master, Wizard Signature Spells.
- 9레벨 주문 슬롯, Warlock Mystic Arcanum 9, full/half caster 최종 progression.
- 레벨업 preview에서 campaign archive, active downtime, 준비 주문, 집중·조건, 장비, 이관 가능 여부를 표시한다.

완료 기준:

- 12개 직업과 대표 서브클래스가 20레벨까지 성장 가능하다.
- 각 직업의 17~20레벨 기능 중 최소 1개가 실제 resolver 또는 상태 반영 경로를 가진다.
- 19레벨 ASI, 20레벨 capstone, 9레벨 슬롯, 자원 회복과 재접속 snapshot이 회귀 spec으로 고정된다.

## 5. P6-2. 실행 가능 주문 319개 전체

P5의 220개 실행 가능 주문 흐름을 유지하되, 그중 10개는 최종 generated SRD id가 아닌 호환·오리지널 실행 id다. 따라서 최종 SRD 주문 319개를 정확히 닫기 위해 P6에서는 generated SRD 기준 남은 109개 주문 정의를 추가한다.

| 분류 | P6 추가 목표 |
| --- | ---: |
| 9레벨 핵심 주문 | 18 |
| 남은 7~8레벨 주문 보완 | 10 |
| 저·중레벨 미지원 utility/ritual | 32 |
| 장기 캠페인·정보·예지·이동 | 18 |
| 소환·변신·창조·영구 효과 | 16 |
| 복합 상태·면역·해제·역주문 | 15 |

구현 범위:

- 9레벨 주문을 전투, 탐색, 캠페인 상태, downtime, 공개 시나리오 효과와 연결한다.
- Wish 같은 광범위 주문은 안전한 MVP 실행 옵션과 GM 승인 override로 분리한다.
- True Resurrection, Gate, Astral Projection, Shapechange, Foresight, Meteor Swarm, Power Word Kill 같은 주문의 비용, 대상, 지속시간, 집중, 상태 변화와 audit를 기록한다.
- ritual, divination, teleportation, planar travel 주문은 campaign location/timeline state와 연결한다.
- 소환·변신·창조 주문은 token owner, stat replacement, inventory/object 생성, concentration 종료 lifecycle을 기록한다.
- 모든 주문은 캐릭터 선택 UI, 전투·탐색 UI, command/API에서 동일 `spellId`를 사용한다.

완료 기준:

- 실행 가능 `spell_definitions`가 정확히 319개다.
- 신규 generated SRD 주문 109개가 캐릭터 생성·레벨업·준비 주문·전투/탐색 UI·command/API에서 동일 `spellId`를 사용한다.
- 슬롯, 재료·비용, 집중, 대상, 지속시간, 면역, 실패/부분 성공과 결과가 TurnLog/StateDiff에 기록된다.

## 6. P6-3. 대표 몬스터 317종 전체

P5의 180종 실행 가능 몬스터 흐름을 유지하되, 그중 26종은 최종 generated SRD id가 아닌 호환·오리지널 실행 id다. 따라서 최종 SRD 몬스터 317종을 정확히 닫기 위해 P6에서는 generated SRD 기준 남은 163종 몬스터 정의를 추가한다.

| 역할 | 추가 목표 |
| --- | ---: |
| 저CR/중CR 누락 보완 | 54 |
| 고CR 브루트·솔저·스커미셔 | 20 |
| 주문사용자·지도자·NPC archetype | 24 |
| 언데드·악마·천상·정령·구조물 보완 | 24 |
| 야수·거대괴수·수중·비행·굴착 | 18 |
| 보스·legendary/lair/phase encounter | 23 |

구현 범위:

- 모든 몬스터가 최소 1개 이상의 executable action을 가진다.
- legendary action/resistance, lair action, recharge, limited use, spell list, aura, swallow, petrify, possession, regeneration, shapechange 등 복합 lifecycle을 공통 표현으로 정리한다.
- AI 행동 평가에서 목표 가치, 집중 방해, 도주, 회복, 부하 지휘, 지형 위험, lair 효과를 고려한다.
- HUMAN GM UI에서 phase, recharge, legendary/lair 자원, 사용 불가 이유와 수동 override를 표시한다.
- 몬스터별 action id는 AI/HUMAN GM 공통 executor에서 동일하게 사용한다.

완료 기준:

- 누적 317종이 executable action을 가진다.
- 신규 generated SRD 몬스터 163종이 AI/HUMAN GM 공통 action id와 executor를 사용한다.
- 대표 legendary/lair/phase 보스 전투가 TurnLog/StateDiff로 검증된다.

## 7. P6-4. 운영자 moderation·공개 콘텐츠 운영 도구

목표 사용자 경험:

- 운영자는 신고된 공개 시나리오와 리뷰를 큐에서 확인하고 처리한다.
- creator는 제재·비공개·복구 결정의 이유와 이의 제기 상태를 확인한다.
- 사용자는 숨김 처리된 콘텐츠가 신규 탐색에 노출되지 않으면서 기존 세션 snapshot은 유지되는 것을 신뢰할 수 있다.

구현 범위:

- 운영자 role/permission과 moderation API.
- 신고 큐: 시나리오, revision, 리뷰, 프로필성 텍스트.
- 처리 상태: queued, reviewing, actioned, rejected, restored, escalated.
- 처리 액션: hidden, restored, warning, creator_note_required, removed.
- 이의 제기 처리: submitted, under_review, accepted, rejected.
- 추천/검색에서 moderation 상태 반영.
- 모든 moderation 조작의 TurnLog와 별도 audit record.
- creator/운영자 알림 상태.

완료 기준:

- 신고 → 운영자 큐 → 처리 → creator 통지 → 이의 제기 → 복구/유지 흐름이 API와 UI에서 가능하다.
- hidden/restricted 콘텐츠는 신규 탐색에서 제외되고 기존 세션 snapshot은 유지된다.
- 운영자 조작은 감사 로그로 남고 권한 없는 사용자는 접근할 수 없다.

## 8. P6-5. 장기 캠페인 완결·후일담·캐릭터 보관소·이관

목표 사용자 경험:

- GM은 장기 캠페인을 완결 처리하고 후일담을 작성한다.
- 플레이어는 완료된 캐릭터를 보관소에서 확인하고, 허용된 경우 새 캠페인으로 이관한다.
- 완료 캠페인의 일정, downtime, 경제, inventory, 주요 전투, 공개 revision lineage가 archive snapshot으로 보존된다.

구현 범위:

- campaign completion workflow: final node, final rewards, epilogue, archive snapshot.
- character vault: 완료 캐릭터 목록, 최종 레벨, 장비, 주문, 업적, campaign lineage.
- transfer policy: 같은 rule set, 레벨 범위, 아이템 허용, GM 승인, 경제 상태 제한.
- 새 캠페인 이관: clone/transfer 구분, 원본 archive 불변, 새 SessionCharacter snapshot 생성.
- campaign analytics: 플레이 시간, 세션 수, 노드 진행, 전투 수, downtime 일수, 주요 보상, 사망/부활, rating/review 요약.
- 후일담 공유 범위: private, party, public summary.

완료 기준:

- 캠페인 완료 → archive snapshot 생성 → 캐릭터 보관소 표시 → 새 캠페인 이관 요청/승인 흐름이 동작한다.
- 완료 후 원본 campaign archive는 변경되지 않는다.
- 이관된 캐릭터는 새 캠페인에서 독립 snapshot을 가진다.
- analytics와 epilogue가 사용자에게 표시되고 감사 가능한 상태로 저장된다.

## 9. P6-6. 20레벨 최종 검증 캠페인

검증 시나리오:

- 20레벨 오리지널 캠페인 챕터 1개.
- 예상 플레이 시간 4~6회 세션 또는 360~540분.
- story, exploration, combat, travel, downtime, archive 노드를 각각 2개 이상 포함한다.
- P6 추가 주문 20개 이상, P6 추가 몬스터 24종 이상, 9레벨 주문 8개 이상, 다단계 legendary/lair 보스 3종 이상을 사용한다.
- 운영자 moderation, 공개 revision, fork, 신고, 복구, rating/review 제거 흐름을 검증한다.
- 캠페인 완결, 후일담, 캐릭터 보관소, 새 캠페인 이관을 검증한다.

완료 기준:

- AI GM과 HUMAN GM으로 주요 경로를 각각 완주한다.
- 16레벨 캐릭터의 20레벨 성장과 9레벨 주문 사용을 확인한다.
- 317종 몬스터 manifest 중 대표 고CR/legendary/lair 행동이 실제 전투에서 검증된다.
- campaign archive, epilogue, character vault, transfer snapshot이 서로 격리된다.
- 공개 탐색부터 운영자 moderation, 복구, fork까지 사용자 흐름이 이어진다.

## 10. 실행 순서

```text
P6-0 P5 회귀·최종 콘텐츠 무결성 기준
↓
P6-1 직업·서브클래스 17~20레벨
↓
P6-2 주문 319개 전체
↓
P6-3 몬스터 317종 전체
↓
P6-4 운영자 moderation·공개 콘텐츠 운영 도구
↓
P6-5 장기 캠페인 완결·보관·이관
↓
P6-6 20레벨 최종 검증 캠페인
```

## 11. P6 완료 체크리스트

- [ ] `test:p6-regression`이 P5 기준선과 P6 신규 spec을 포함한다.
- [ ] 격리 E2E와 최종 콘텐츠 무결성 검증이 통과한다.
- [ ] 12개 직업과 대표 서브클래스가 20레벨까지 성장 가능하다.
- [ ] 19레벨 ASI, 20레벨 capstone, 9레벨 슬롯과 직업 자원 진행이 동작한다.
- [ ] 실행 가능 주문이 정확히 319개다.
- [ ] 대표 몬스터가 정확히 317종이다.
- [ ] 운영자 moderation 큐, 처리, 복구, 이의 제기 흐름이 동작한다.
- [ ] 장기 캠페인 완료, 후일담, archive snapshot, 캐릭터 보관소, 새 캠페인 이관이 동작한다.
- [ ] P6 검증 캠페인을 AI GM과 HUMAN GM에서 완주했다.
- [ ] 전체 빌드, 회귀, E2E와 수동 사용자 흐름을 사용자가 확인했다.

## 12. 사용자 실행 검증

프로젝트 지침에 따라 테스트는 사용자가 직접 실행한다. P6 종료 시 최소 다음 명령을 확인한다.

상세한 자동·수동 검증 절차와 완료 기록 양식은 [`../examples/P6_VALIDATION_RUNBOOK.md`](../examples/P6_VALIDATION_RUNBOOK.md)를 기준으로 한다.

```powershell
npm run test:p6-regression
npm run test:e2e
npm run build
```

추가 수동 검증:

- AI GM/HUMAN GM 20레벨 캠페인.
- 16 → 20레벨 성장, 19레벨 ASI, 20레벨 capstone.
- 9레벨 주문 사용과 실패/부분 성공/비용 처리.
- legendary/lair/phase 보스 전투.
- 운영자 moderation 큐, 처리, 복구, 이의 제기.
- 캠페인 완결, 후일담, archive snapshot.
- 캐릭터 보관소와 새 캠페인 이관.
- 공개 검색·추천·fork·신고·복구 후 기존 세션 보존.

## 13. P6 이후

P6가 완료되면 [`../future_plan.md`](../future_plan.md)의 핵심 장기 범위는 모두 실행 가능한 제품 기능으로 닫힌다. 이후 계획은 신규 SRD 범위 확장이 아니라 운영 품질과 제품화 단계로 분리한다.

- 성능·관측성·운영 지표 고도화.
- 콘텐츠 제작자 도구와 마켓/커뮤니티 운영 정책.
- 접근성, 모바일/태블릿 UX, 대규모 캠페인 UX 개선.
- AI GM 품질 평가, 안전성, 비용 최적화.
- 장기 유지보수와 리팩터링 로드맵.
