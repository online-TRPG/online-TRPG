# SRD 5e End-to-End Playable MVP 로드맵

작성일: 2026-05-23
현재 구현 반영일: 2026-06-18

## 1. 문서 목적

이 문서는 SRD 5e 룰과 콘텐츠를 많이 추가하는 장기 목록이 아니라, 이미 구축된 **룰 카탈로그 + resolver + 세션/전투 런타임 + 플레이 UI**를 하나의 실제 플레이 경로로 연결해 end-to-end playable MVP를 완성하기 위한 현재 작업 로드맵이다.

현재 우선순위는 다음과 같다.

1. 이미 구현된 룰이 API, `CombatService`, 액션 처리, VTT, UI에서 서로 다른 규칙을 사용하지 않게 한다.
2. AI GM과 HUMAN GM이 같은 authoritative state와 실행 경로를 사용하게 한다.
3. 룰 계산 결과를 `GameState`, 전투 상태, `TurnLog`, `StateDiff`, 실시간 이벤트에 일관되게 반영한다.
4. 룰 smoke 시나리오를 두 GM 모드에서 실제로 처음부터 끝까지 완주한다.
5. 위 경로가 안정화된 뒤 실행 가능한 주문·직업·몬스터·콘텐츠 범위를 넓힌다.

MVP의 상위 완료 기준은 [`structure/QUALITY_MVP_ACCEPTANCE.md`](structure/QUALITY_MVP_ACCEPTANCE.md)를 따른다. 이 문서는 그중 SRD 5e 룰 런타임과 플레이 표면을 구체화한다.

## 2. 상태 표기와 판정 원칙

| 상태 | 의미 |
| --- | --- |
| 완료 | 구현과 실제 플레이 검증이 모두 끝났고 남은 필수 작업이 없음 |
| 구현됨·검증 대기 | 코드와 회귀 spec은 존재하지만 현재 worktree 기준 빌드·테스트·브라우저 완주 증거가 없음 |
| 부분 연결 | resolver 또는 일부 API/UI는 있으나 모든 진입 경로가 같은 규칙을 사용하지 않음 |
| 미구현 | MVP에 필요한 실행 경로 또는 검증 수단이 없음 |

2026-06-18 현재 worktree에는 대규모 미커밋 변경이 있다. 따라서 이 문서에서 테스트 실행 결과를 근거로 “완료”라고 판정하지 않는다. 저장소 지침에 따라 Codex는 테스트를 직접 실행하지 않으며, 사용자가 실행할 검증 명령과 수동 시나리오를 마지막 절에 제공한다.

## 3. 유지할 아키텍처 계약

### 3.1 룰 데이터와 실행 책임

- `RuleCatalogService`
  - race/class/subclass feature, spell, condition, monster ability, terrain effect의 안정된 id와 실행 메타데이터를 제공한다.
- 순수 resolver
  - 레벨업, 휴식, 내성, 상태, 집중, 엄폐, 광역 대상, 강제이동, 준비행동, 주문 scaling, 아이템 상호작용을 계산한다.
- `ActionRuleService`
  - 자연어/명령 입력을 구조화된 룰 액션과 runtime effect로 변환한다.
- `ActionProcessorService`
  - runtime effect의 사전 검증, 저장, 로그, 맵/인벤토리 반영을 담당한다.
- `CombatService`
  - 전투의 현재 액터, 행동 자원, 공격/주문/이동/반응, 상태와 피해를 authoritative하게 처리한다.
- `SessionsService`
  - 세션, HUMAN GM override, VTT map, 노드 전환, 공개 정보와 권한 projection을 관리한다.
- 프론트엔드
  - 엔진이 제공한 카탈로그 id와 가능 행동을 표시하고 요청한다. 수치 결과나 최종 상태를 클라이언트에서 확정하지 않는다.

### 3.2 공통 불변식

- AI와 UI가 수치 결과를 결정하지 않는다.
- 같은 spell/action/condition/monster ability id는 command, API, 전투 UI, 로그에서 같은 의미를 가진다.
- 중요한 상태 변경은 서버에서 확정하고 재접속 후 복원할 수 있어야 한다.
- 플레이 결과는 필요한 범위에서 `TurnLog`와 `StateDiff`로 추적 가능해야 한다.
- HUMAN GM은 규칙을 우회하는 별도 상태 저장소가 아니라, 권한이 있는 override 요청자로 취급한다.
- 공개 narration과 GM 전용 note는 플레이어 projection에서 섞이지 않는다.
- 인벤토리와 VTT object처럼 둘 이상의 상태를 바꾸는 행동은 한쪽만 성공하지 않아야 한다.

## 4. 현재 구현 상태 요약

### 4.1 기반 룰 계층

상태: **구현됨·검증 대기**

현재 확인된 기반:

- `rule-catalog.service.ts`
  - race traits, class/subclass features, spell definitions, conditions, monster abilities, terrain effects.
- `level-up.service.ts`
- `rest-resolution.service.ts`
- `condition-runtime.service.ts`
- `concentration-runtime.service.ts`
- `cover-position.service.ts`
- `forced-movement.service.ts`
- `aoe-targeting.service.ts`
- `aoe-damage.service.ts`
- `ready-action.service.ts`
- `spell-scaling.service.ts`
- `spell-slot.service.ts`
- `monster-ability.service.ts`
- `item-interaction.service.ts`
- `inventory-runtime.service.ts`
- `terrain-effect.service.ts`
- `gm-override.service.ts`

남은 핵심은 resolver 추가가 아니라, 모든 실제 플레이 진입점이 이 resolver를 일관되게 사용한다는 것을 증명하는 것이다.

### 4.2 기능별 상태표

| 영역 | 현재 상태 | 현재 확인된 실행 표면 | MVP까지 남은 핵심 |
| --- | --- | --- | --- |
| 레벨업 | 구현됨·검증 대기 | `POST /characters/:id/level-up`, 캐릭터 UI, feature snapshot, HP/PB/ASI 반영 | 서브클래스 선택 레벨과 주문 갱신 경계, 세션 snapshot 동기화, 실제 UI 완주 |
| 주문 준비 | 구현됨·검증 대기 | `PATCH /characters/:id/prepared-spells`, 클래스/능력치 기반 준비 수 제한, prepared/known caster 분리, 전투 UI 필터, long rest 후 준비 주문 변경 안내 | 전체 직업 회귀 검증, 브라우저에서 long rest→준비 주문 변경 완주 |
| short/long rest | 구현됨·검증 대기 | 전용 REST API, HUMAN GM 승인 API/UI, 구조화 `restApproval` 요청/승인 응답과 FE 즉시 반영, snapshot `pendingRestApprovals` 재접속 projection, 전투 중 차단, 자원/슬롯/상태 회복 | 승인 거절/취소/만료, 브라우저 재접속 복원 검증, 전체 로그와 권한 검증 |
| 상태/내성 | 부분 연결 | command, 지형, 주문/몬스터 rider, 턴/휴식 lifecycle 일부 | 모든 피해·공격·턴 hook과 구조화 condition instance 일치 |
| 엄폐 | 부분 연결 | VTT object/wall/door 기반 공격 보정, 직접 대상 주문 full cover 차단, Sleep/Fireball AoE full cover 처리, Dex-save AoE 엄폐 보너스, smoke cover map, 전투 주문 targeting hint | 모든 ranged weapon/monster action과 정밀 UI target preview 경로 통일 |
| 집중 | 부분 연결 | 여러 피해 경로의 concentration save와 해제, 구조화 concentration 전투 응답, 참가자 관찰 UI 표시 | 모든 피해 원천과 공통 damage finalizer 통일, 집중 주문·연결 효과 실행 범위 확대, 종료 이유 추적 |
| 강제이동 | 구현됨·검증 대기 | `POST /combat/force-move`, 지형 진입 효과, GM UI, ready trigger 반환 | 주문/몬스터 rider가 같은 경로 사용, 충돌·낙하·기회공격 예외 검증 |
| AoE | 부분 연결 | sphere 중심 Fireball/Sleep, 대상별 save/피해, Sleep full cover 제외, Fireball 원점 기준 엄폐 보정, command 경로, 전투 UI 원점 선택 안내 | cone/line/cube 실제 주문 연결, 시각적 AoE preview와 서버 결과 일치 |
| 준비행동 | 구현됨·검증 대기 | pending 저장, 이동 trigger, reaction prompt UI, accept/decline, 일부 held action 실행 | 공격/주문/턴 이벤트 trigger 확대, 모든 held action 비용과 만료 규칙 |
| MVP 주문 | 구현됨·검증 대기 | 9개 전투 주문과 slot 선택/upcast UI | 공통 executor 비율 확대, concentration/buff/debuff/utility 대표 주문 추가 |
| 몬스터 능력 | 부분 연결 | catalog/SRD 후보, HUMAN/AI 공통 선택, recharge, multiattack, save/condition rider, limited use 기반 | aura, 지속 효과, 복합 target, 모든 사용량 UI/로그/회복 검증 |
| 아이템/VTT object | 구현됨·검증 대기 | drop/pickup/throw, map object UI, inventory+map transaction, `GameState.version` 기반 동시 변경 차단 | 동시 pickup 실제 회귀 검증, 던지기 명중/빗나감 착지, container/capacity 원자성 |
| 지형 | 부분 연결 | terrainEffectId, 이동 비용, 진입/턴 시작 피해·상태, obscurement, UI 시각화 | 종료 turn hook, elevation/미끄러짐, 시야·엄폐와 복합 효과 검증 |
| HUMAN GM override | 부분 연결 | 메시지, 공개, 지급, 상태, 노드, 전투 시작/종료와 TurnLog/StateDiff, HUMAN 모드·지정 GM·JOINED GM/HOST 참가자 권한 helper | HP/DC/아이템 회수 등 남은 조작, private note projection, 전 권한 회귀 |
| smoke scenario | 구현됨·검증 대기 | 휴식→함정/내성→엄폐→AoE→상태/아이템→HUMAN GM 노드 seed | 실제 DB/API/브라우저에서 AI/HUMAN 각각 완주한 증거 |

## 5. P0: End-to-End Playable MVP 완성

P0는 새로운 카탈로그 종류를 늘리는 단계가 아니다. 현재 구현을 플레이 가능한 하나의 수직 경로로 닫는 단계다.

### P0-1. 현재 통합 변경 안정화

대상:

- `shared-types/src/dto/api/characters.dto.ts`
- `shared-types/src/dto/api/gameplay.dto.ts`
- `be/src/modules/characters/characters.service.ts`
- `be/src/modules/actions/action-processor.service.ts`
- `be/src/modules/actions/actions.service.ts`
- `be/src/modules/combat/combat.service.ts`
- `be/src/modules/sessions/sessions.service.ts`
- `fe/src/pages/CharacterPage.tsx`
- `fe/src/pages/PlayPage.tsx`
- `fe/src/features/sessionPlay/components/CombatNodeSurface.tsx`
- `fe/src/features/sessionPlay/components/StoryNodeSurface.tsx`

해야 할 일:

- 현재 미커밋 변경의 DTO, API client, service return type, UI 소비 타입을 맞춘다.
- 세션별 action processor는 한 프로세스에서 한 번만 queue를 drain하고, DB의 PENDING 조건부 claim으로 같은 action의 중복 실행을 차단한다.
- mutation 단계에서 실패하면 이미 만든 성공 `TurnLog`를 FAILURE로 정정하고 별도 실패 로그를 중복 생성하지 않는다.
- 임시/legacy helper가 새 transaction 또는 공통 executor를 우회하지 않는지 확인한다.
- 서버 응답의 `pendingReaction`, `map`, spell slot, monster action availability가 모든 호출자에서 처리되는지 확인한다.
- 실패 시 이미 소모된 행동 자원, 슬롯, 아이템, 맵 상태가 남지 않도록 mutation 순서를 점검한다.

완료 기준:

- 사용자가 shared-types, backend, frontend build를 모두 통과시킨다.
- 관련 회귀 spec이 통과한다.
- 브라우저에서 캐릭터 성장, 휴식, 전투 진입까지 API/렌더 오류가 없다.

### P0-2. 레벨업·서브클래스·주문 준비 모델 닫기

현재 구현:

- 레벨업 endpoint와 UI가 있다.
- 카탈로그 기반 class/subclass feature snapshot이 있다.
- HP, proficiency bonus, ASI, AC 재계산 경로가 있다.
- 주문 준비 변경 endpoint와 UI가 있다.
- 준비 주문 수를 클래스, 레벨, 주문시전 능력치로 제한하는 경로가 있다.
- 진행 중 세션 캐릭터에 HP와 snapshot 이벤트를 반영하는 경로가 있다.
- AI/GM 즉시 long rest와 HUMAN GM 승인 long rest 후 FE가 준비 주문 변경 안내를 표시한다.

남은 작업:

1. 클래스별 subclass 선택 레벨은 현재 `subclass_features` 카탈로그의 최초 feature 레벨에서 계산하며, 전체 직업 회귀 검증을 남긴다.
2. subclass 선택이 필요한 레벨에서 누락/잘못된 선택을 거부한다.
3. known spell caster와 prepared spell caster를 구분한다.
   - prepared: cleric, druid, paladin, wizard 등 프로젝트가 지원하는 정책.
   - known: bard, sorcerer, warlock 등.
   - known caster는 `preparedSpells` 필드를 생성하지 않고 준비 주문 변경 API를 거부한다.
4. cantrip, learned spell, prepared spell을 서로 다른 컬렉션 의미로 유지한다.
5. 레벨업으로 주문을 추가/교체할 때 현재 레벨에서 시전 불가능한 주문을 거부한다.
6. ASI로 Constitution이 변하면 현재/최대 HP와 진행 중 session snapshot을 일관되게 조정한다.
7. 레벨업 중인 캐릭터가 활성 세션에 배정되어 있을 때 허용 정책을 명시한다.
   - 기본안: 원본 캐릭터 갱신 후 활성 `SessionCharacter`의 파생 snapshot을 즉시 갱신하고 실시간 이벤트를 보낸다.
8. UI wizard가 필요한 선택을 모두 받기 전에는 요청을 보내지 않는다.

완료 기준:

- 1→3레벨 상승에서 필요한 subclass가 선택되고 feature id가 중복되지 않는다.
- 3→4레벨 상승에서 ASI 2점, HP, AC, 준비 주문 제한이 함께 반영된다.
- 레벨업 또는 준비 주문 변경 후 활성 세션의 다른 클라이언트가 새 snapshot을 받는다.
- 전투 UI에는 알고 있으면서 준비된 슬롯 주문만 노출된다.

### P0-3. short/long rest와 HUMAN GM 승인 흐름 닫기

현재 API:

- `POST /sessions/:sessionId/actions/rest`
- `POST /sessions/:sessionId/actions/rest/short`
- `POST /sessions/:sessionId/actions/rest/long`
- `POST /sessions/:sessionId/actions/rest/requests/:actionId/approve`

현재 구현:

- AI GM/일반 허용 경로와 HUMAN GM 승인 대기 경로가 있다.
- HUMAN GM 화면에 승인 배너가 있다.
- 전투 중 휴식 요청과 승인 시도를 차단한다.
- 승인 전환은 `REJECTED + REST_REQUIRES_GM_APPROVAL` 조건부 update를 사용해 중복 GM 승인을 차단한다.
- 휴식 요청/승인 API 응답은 `restApproval` 구조화 metadata를 반환하고, FE는 해당 응답을 즉시 로그 metadata로 반영해 HUMAN GM 승인 배너/버튼을 갱신한다.
- snapshot은 미처리 HUMAN GM 휴식 요청을 `pendingRestApprovals` projection으로 제공하고, FE는 로그 metadata와 snapshot projection을 합쳐 승인 배너를 복원한다.
- TurnLog 기반 복원도 유지되어 과거 로그와 즉시 응답 로그가 같은 `actionId`를 가리키면 FE에서 중복 배너를 제거한다.
- hit dice, HP, class resource, spell slot override, rest-bound condition, 일부 monster limited use 회복 경로가 있다.

남은 작업:

1. 승인뿐 아니라 거절/취소/만료 정책을 정한다.
2. 같은 요청의 중복 승인은 현재 조건부 claim으로 차단하며, 다른 GM/플레이어 권한 회귀와 브라우저 피드백을 검증한다.
3. long rest 후 prepared spell 변경 가능 안내가 실제 플레이 화면에서 보이는지 브라우저로 검증한다.
4. 휴식 결과의 HP, hit dice, slot, class resource, condition diff를 한 결과로 기록한다.
5. 재접속한 HUMAN GM이 `pendingRestApprovals` 기반 배너를 보는지 브라우저에서 확인한다.

완료 기준:

- AI GM 세션에서 허용된 short/long rest가 즉시 처리된다.
- HUMAN GM 세션에서 요청 전에는 상태가 바뀌지 않고 승인 후 한 번만 바뀐다.
- 전투 중 요청과 승인 모두 거부된다.
- 재접속 후에도 승인 대기와 처리 결과가 일관된다.

### P0-4. 전투 공통 룰을 하나의 실행 파이프라인으로 통일

목표 파이프라인:

```text
action/spell/monster ability 선택
→ 권한·현재 턴·행동 비용 검증
→ target/range/line of sight/cover 검증
→ attack 또는 saving throw
→ damage/healing/condition/movement packet
→ concentration·condition lifecycle·terrain hook
→ reaction/ready trigger
→ 상태 저장
→ TurnLog/StateDiff/실시간 snapshot
```

#### 상태와 내성

- 구조화 condition instance를 authoritative source로 사용한다.
- 단순 tag는 UI와 기존 판정 호환을 위한 projection으로만 취급한다.
- attack, save, speed, action restriction, 턴 시작/종료, rest 종료 hook을 명시한다.
- 주문, 몬스터 ability, 지형, GM override가 같은 condition apply/remove helper를 사용한다.
- save 결과에는 DC, ability, proficiency, advantage/disadvantage, modifier 목록을 남긴다.

#### 엄폐와 시야

- VTT wall, closed door, object cell을 cover blocker로 사용한다.
- half/three-quarters cover는 AC 또는 Dexterity save에 적용한다.
- full cover는 대상 지정 자체를 차단한다.
- 원거리 무기, spell attack, Dexterity-save AoE가 같은 cover 계산을 사용한다.
- 현재 Magic Missile, 준비행동 Magic Missile, Cure Wounds는 슬롯/행동/반응 소모 전에 caster→target full cover를 검사한다.
- 현재 Sleep은 효과 원점에서 full cover인 대상을 HP pool 배정 전에 제외한다.
- 현재 Fireball 실행 경로는 폭발 원점에서 대상까지의 VTT blocker를 계산해 full cover 대상을 제외하고, half/three-quarters cover를 Dexterity save 보너스로 전달한다.
- 프론트 전투 주문 targeting hint는 직접 대상 full cover 차단, Sleep full cover 제외, Fireball Dex-save 엄폐 보너스를 안내한다.
- 프론트의 target 가능 표시가 서버 판정과 불일치해도 서버 판정을 최종 권위로 둔다.

#### 집중

- 새 concentration spell 성공 시 기존 집중 효과를 종료한다.
- 모든 피해 원천이 공통 damage finalizer를 통해 concentration save를 요청한다.
- DC는 `max(10, floor(damage / 2))`로 계산한다.
- 실패하면 caster concentration state와 연결된 condition/effect를 함께 제거한다.
- caster, spell id, source/target/effect ids, 시작 turn과 종료 이유를 추적한다.
- 현재 concentration condition은 `CombatParticipantResponseDto.concentration`으로 구조화되어 전투 참가자 응답에 투영된다.
- 기존 `conditions` 태그는 하위 호환성을 위해 유지하며, 프론트 관찰 UI는 내부 spell/target/effect id를 노출하지 않고 집중 유지 여부를 표시한다.

#### 강제이동

- `CombatService.forceMoveParticipant()`를 공통 진입점으로 둔다.
- forced movement는 이동력을 소모하지 않는다.
- 기본적으로 기회공격을 유발하지 않는다.
- 충돌, 맵 경계, blocked cell, 위험 지형, 준비행동 trigger를 처리한다.
- 주문/몬스터 rider는 좌표를 직접 변경하지 않고 이 경로를 호출한다.

#### AoE

- targeting shape resolver는 sphere, cone, line, cube를 지원한다.
- CombatService는 resolver가 계산한 대상마다 save, cover, damage, condition을 개별 처리한다.
- UI preview와 안내는 보조이며 서버가 최종 대상 목록을 반환한다.
- 로그에는 shape, origin, size, 포함 대상, 대상별 save/피해를 남긴다.

#### 준비행동과 반응

- pending ready action은 actor, trigger, held action, 원래 비용, reaction 필요 여부, 만료 turn을 포함한다.
- 이동뿐 아니라 공격 시작, 주문 시전, 사거리 진입, 턴 시작/종료 trigger를 단계적으로 지원한다.
- trigger 시 해당 사용자에게 구조화된 reaction prompt를 보낸다.
- accept 시 reaction을 먼저 예약/소모한 뒤 held action을 실행한다.
- decline/expire/actor incapacitated 시 pending 상태를 제거한다.
- Shield, opportunity attack, ready action prompt가 같은 UI queue에서 중복 처리되지 않아야 한다.

완료 기준:

- 플레이어 전용 endpoint, `combat/actor/action`, AI monster turn, HUMAN GM monster action이 최종적으로 같은 공통 resolver/helper를 사용한다.
- 같은 피해가 경로에 따라 concentration을 건너뛰지 않는다.
- 엄폐, 상태, 지형, 반응이 동시에 존재해도 action cost와 결과가 한 번만 반영된다.
- reaction prompt를 websocket과 HTTP response에서 동시에 받아도 한 번만 처리한다.

### P0-5. MVP 주문 실행 범위 확장

현재 전투 실행 주문:

- cantrip: Chill Touch, Fire Bolt, Ray of Frost, Light
- 1레벨: Magic Missile, Cure Wounds, Shield, Sleep
- 3레벨: Fireball

현재 9개 주문은 공격, 회복, 반응, 광역, 상태 rider, utility, upcast의 최소 대표군이다. 다음 단계는 주문 수를 즉시 100개로 늘리는 것이 아니라, 공통 executor가 주문별 분기를 얼마나 대체하는지 높이는 것이다.

MVP 추가 대표군:

1. concentration buff 1개
2. concentration debuff 1개
3. saving throw 단일 대상 피해 1개
4. 강제이동 주문 1개
5. difficult/hazard terrain 생성 주문 1개
6. cone 또는 line AoE 1개
7. 비전투 탐색/상호작용 주문 1개

각 spell definition이 표현해야 할 항목:

- base spell level
- action cost와 reaction trigger
- range와 target kind
- attack/save
- damage/healing
- duration/concentration
- condition 또는 forced movement rider
- AoE shape
- scaling
- component/usage 제한 중 실제 엔진이 검사하는 항목

완료 기준:

- command와 전투 UI가 같은 spell id를 사용한다.
- cantrip은 슬롯을 쓰지 않고 슬롯 주문은 성공적으로 실행되는 시점에 정확히 한 번 소모한다.
- upcast 결과와 원래/사용 slot level이 응답과 로그에 남는다.
- 주문별 하드코딩은 데이터로 표현할 수 없는 최소 orchestration에만 남는다.

P1 이후 목표:

- 우선순위 주문 25개 실행 가능.
- 이후 50개.
- 공통 executor와 smoke coverage가 안정된 뒤 100개.
- 319개 표시 데이터 전체 실행 가능화는 MVP 밖의 장기 목표다.

### P0-6. 몬스터 특수 능력 실행 모델 닫기

현재 구현 기반:

- catalog/SRD engine/fallback 행동 후보 병합.
- AI GM 자동 선택과 HUMAN GM 수동 선택.
- cost type, range, long range, effect tag.
- recharge 상태.
- multiattack child action.
- save-based damage와 condition rider.
- limited-use 사용량과 rest/combat 회복.
- UI의 available/unavailable 표시.

남은 작업:

1. 모든 후보를 다음 공통 형태로 정규화한다.
   - action id
   - cost
   - target/range/AoE
   - attack 또는 save
   - damage
   - condition/forced movement rider
   - recharge/usage
   - child actions
2. multiattack의 각 하위 공격이 반응 대기 상태를 만들면 안전하게 일시 중단하고 재개한다.
3. recharge와 limited use를 후보 표시와 실행 직전에 모두 검증한다.
4. aura와 turn-start/turn-end 지속 능력을 추가할 hook을 정의한다.
5. AI GM은 실행 가능한 후보 중 선택만 하고, HUMAN GM과 같은 executor를 호출한다.
6. 행동 사용, recharge roll, rider 적용을 로그에 남긴다.

완료 기준:

- 일반 공격, multiattack, recharge, save-based condition, limited-use의 대표 몬스터를 각각 실행한다.
- AI와 HUMAN이 같은 action id를 선택했을 때 같은 엔진 결과를 낸다.
- 사용할 수 없는 행동은 UI와 서버 양쪽에서 차단된다.

### P0-7. 아이템과 VTT object 원자성 닫기

현재 구현:

- `/item drop`, `/item pickup`, `/item throw`.
- 전투/탐색 UI의 object pickup과 inventory throw/drop.
- map object에 `hiddenItemIds`와 수량 표현.
- inventory entry, inventory snapshot, `GameState.flagsJson.vttMap`을 Prisma transaction 안에서 함께 갱신하는 경로.
- 적용 전 inventory/map 사전 검증.

남은 작업:

1. 새 atomic 경로를 우회하는 legacy map helper 호출을 제거하거나 비활성화한다.
2. 같은 object를 두 사용자가 동시에 줍는 경우 `GameState.version` compare-and-swap으로 한 명만 성공시키는 현재 구현을 실제 transaction 회귀 테스트로 검증한다.
3. 부분 pickup 후 map object 수량과 inventory 수량 합이 보존되는지 검증한다.
4. throw의 명중/빗나감과 착지 위치를 전투 결과와 연결한다.
5. 컨테이너 용량, 내용물 보존, stack merge를 같은 transaction에서 처리한다.
6. 실패 시 inventory, snapshot, map, action cost 중 어느 것도 부분 적용되지 않게 한다.
   - 현재 inventory, snapshot, map, 전투 중 `SPEND_ACTION`은 한 Prisma transaction에 묶이고 `GameState.version` 충돌도 차단한다.
   - action queue는 프로세스 내 세션 단위 직렬화와 DB 조건부 claim을 사용한다.
   - transaction 이후 실패가 발생하면 기존 action `TurnLog`를 실패로 정정해 성공/실패 로그가 동시에 남지 않게 한다.
   - 다중 backend instance에서 서로 다른 action이 같은 세션에 병렬 실행되지 않도록 분산 세션 lock 또는 단일 queue consumer 정책을 운영 단계에서 추가해야 한다.

완료 기준:

- drop/pickup/throw 전후 총수량이 보존된다.
- 중복 pickup에서 아이템이 복제되지 않는다.
- transaction 중간 실패를 유도해도 inventory와 map이 원상태다.
- 다른 참가자가 실시간으로 object 생성/수량 변경/삭제를 본다.

### P0-8. 지형 효과를 이동·시야·전투에 일관 연결

현재 지원 id:

- `terrain.difficult`
- `terrain.hazardous`
- `terrain.obscurement`
- `terrain.elevation`
- `terrain.slippery`
- `terrain.burning`
- `terrain.poison_cloud`

남은 작업:

1. normal movement와 forced movement가 같은 cell-enter hook을 사용한다.
2. 턴 시작/턴 종료/지형 이탈 hook을 분리한다.
3. difficult terrain의 이동 비용이 UI 표시와 서버 차감에서 일치하게 한다.
4. obscurement를 attack advantage/disadvantage, line of sight, target visibility에 연결한다.
5. elevation을 거리, 엄폐, 낙하와 연결할 최소 MVP 규칙을 정한다.
6. slippery terrain은 save와 prone/forced stop 같은 명시적 결과를 가진다.
7. 여러 terrain cell이 겹칠 때 합성 순서와 중복 피해 정책을 고정한다.

완료 기준:

- 진입 피해, 턴 시작 피해, 이동 비용, obscurement를 각각 실제 전투에서 확인한다.
- normal/forced movement가 동일한 지형 결과를 만든다.
- 서버 응답과 UI 로그가 적용된 terrain effect id를 표시한다.

### P0-9. HUMAN GM override 로그와 권한 완성

현재 연결된 GM 표면:

- 장면/NPC 메시지.
- handout/reveal.
- 인벤토리 지급.
- 전투 condition 조정.
- 노드 이동.
- 전투 시작/종료.
- 현재 몬스터 이동과 행동.

현재 로그 기반:

- `GmOverrideService`
- `SessionsService.createHumanGmOverrideTurnLog()`
- `TurnLog`
- 선택적 `StateDiff`
- GM user id, public narration, private note 존재 여부, target, metadata.
- HUMAN GM runtime endpoint는 공통 `getHumanGmSessionForOperator()` 경로로 HUMAN mode, 지정 GM/host operator, JOINED GM/HOST participant 상태를 확인한다.
- private note 원문은 현재 공통 `GameState.flags`, 공개 `TurnLog`, `StateDiff`, realtime turn log에 저장하지 않는 회귀로 보호한다. GM 전용 복원은 별도 저장소 또는 사용자별 snapshot projection이 필요하다.

남은 작업:

1. 모든 GM endpoint에서 HUMAN GM mode인지 확인한다.
2. session participant가 `JOINED`이며 역할이 GM/HOST인지 확인한다.
3. host user id만으로 GM 권한을 추론하는 우회 경로를 제거한다.
4. HP, 판정 DC, 상태, 아이템 추가/회수, 맵/노드, 전투 조작을 공통 override audit 형태로 기록한다.
5. private note 원문은 공통 snapshot/공개 로그에 넣지 않고, 별도 저장소 또는 사용자별 snapshot으로 GM projection에서만 조회 가능하게 한다.
6. 플레이어에게는 public narration과 공개 state diff만 전달한다.
7. AI assist는 suggestion 생성과 GM 승인/적용을 분리한다.
8. 승인되지 않은 AI suggestion은 상태를 변경하지 않는다.
9. override 실패도 필요하면 감사 로그 또는 실패 로그로 추적한다.

완료 기준:

- 비GM, 미참가자, 탈퇴 GM, AI GM 세션의 수동 override가 모두 거부된다.
- 허용된 모든 override에서 actor, kind, target, before/after 또는 diff, 공개 narration을 추적할 수 있다.
- private note가 player API, websocket, 로그 화면에 노출되지 않는다.
- GM override 후 `GameState`, `TurnLog`, `StateDiff`, UI snapshot이 같은 사실을 말한다.

### P0-10. AI GM/HUMAN GM smoke scenario 완주

현재 seed:

- `scenario_rule_runtime_smoke`
- 시작 노드: `node_rule_smoke_rest`
- 흐름:
  1. 휴식과 회복
  2. 함정과 내성
  3. 엄폐 전투
  4. AoE와 집중
  5. 상태, 강제이동, 준비행동, 아이템
  6. HUMAN GM override 종착 노드

현재 seed metadata에는 suggested command, API action, verifies, GM mode 정보가 있다. 이는 테스트 fixture이며 실제 완주 증거는 아니다.

#### AI GM smoke

- 플레이어 2명이 참가하고 캐릭터를 선택한다.
- 세션 시작 후 각 노드를 순서대로 진행한다.
- 휴식은 AI/상황 정책으로 처리한다.
- 자연어/command와 전투 UI를 섞어 사용한다.
- 몬스터 턴은 AI GM이 후보 중 선택한다.
- LLM 실패 시 fallback으로 계속 진행한다.
- 마지막 노드와 세션 종료 상태에 도달한다.

#### HUMAN GM smoke

- GM과 플레이어 2명이 참가한다.
- 휴식 요청을 GM이 승인한다.
- GM이 노드 이동, 공개, condition, 전투 시작/종료, 몬스터 행동을 수행한다.
- AI assist suggestion은 GM 승인 후에만 적용한다.
- 마지막 노드와 세션 종료 상태에 도달한다.

#### 완주 후 감사

- 각 중요 행동에 대응하는 `TurnLog`를 확인한다.
- HP/condition/item/map/node 변경의 `StateDiff` 또는 동등한 감사 기록을 확인한다.
- 재접속 후 current node, combat, character, inventory, map object, pending request가 복원되는지 확인한다.
- GM 전용 정보가 플레이어에게 보이지 않는지 확인한다.

P0 최종 완료 기준:

- AI GM smoke를 처음부터 끝까지 2회 연속 완주한다.
- HUMAN GM smoke를 처음부터 끝까지 2회 연속 완주한다.
- 최소 한 번은 중간 재접속을 포함한다.
- 서버 재시작 없이 두 번째 세션을 진행할 수 있다.
- 필수 상태 변경의 로그/감사 추적이 끊기지 않는다.
- 발견된 blocker가 모두 해결되거나 명시적으로 MVP 제외 범위로 승인된다.

## 6. P1: 플레이 가능한 룰 범위 확대

P0 이후에 진행한다.

### 캐릭터

- SRD 12개 직업의 1~3레벨 핵심 기능을 실행 가능하게 한다.
- 각 직업의 대표 SRD 서브클래스 1개를 지원한다.
- class resource의 short/long rest 회복을 카탈로그화한다.
- race runtime trait의 save advantage, resistance, vision을 공통 resolver에 연결한다.

### 주문

- 실행 가능 주문 25개.
- attack/save/heal/buff/debuff/control/movement/terrain/exploration 대표군을 포함한다.
- 주문별 전용 분기보다 공통 effect packet을 우선한다.

### 몬스터

- smoke에 사용할 대표 몬스터 세트를 정한다.
- multiattack, recharge, save rider, limited use, aura 대표를 각각 포함한다.
- encounter마다 AI와 HUMAN이 같은 행동 후보를 본다.

### 시나리오

- 룰 smoke와 별도로 사용자 경험을 위한 짧은 오리지널 시나리오 1개를 완주 가능하게 만든다.
- smoke 전용 command를 몰라도 UI와 자연어 입력만으로 진행 가능해야 한다.

## 7. P2: 콘텐츠 확장

- 실행 가능 주문 50개, 이후 100개.
- 고레벨 class/subclass feature.
- 복합 trigger와 장기 지속 효과.
- 더 많은 terrain interaction과 object interaction.
- 몬스터 aura, 지속 능력, 복합 AoE.
- 시나리오 제작 UI에서 rule catalog id 선택 지원.

## 8. 명시적 비목표

다음은 P0 완료를 막지 않는다.

- 319개 주문 전체 실행 가능화.
- 모든 SRD 몬스터 특수 능력 실행.
- 모든 직업의 20레벨 progression.
- feat 전체 구현.
- 완전한 3차원 고도/비행 전투.
- 소환수와 다중 소유 actor의 완전한 모델.
- 규칙서 전문을 UI에서 재현하는 기능.

단, P0 smoke에서 사용하는 룰과 콘텐츠는 예외 없이 실행 가능하고 감사 가능해야 한다.

## 9. 구현 순서와 의존성

```text
현재 통합 변경 안정화
├─ 캐릭터 성장/주문 준비
├─ 휴식/승인
└─ 공통 전투 파이프라인
   ├─ 상태/내성/엄폐/집중
   ├─ 강제이동/AoE/준비행동
   ├─ 주문 executor
   └─ 몬스터 ability executor

공통 상태 저장 안정화
├─ 아이템/VTT 원자성
├─ 지형 hook
└─ HUMAN GM audit/권한

모든 P0 경로 연결
└─ AI GM/HUMAN GM smoke 완주
```

권장 작업 순서:

1. P0-1 현재 통합 변경 안정화.
2. P0-2 성장과 준비 주문.
3. P0-3 휴식 승인.
4. P0-4 전투 공통 파이프라인.
5. P0-5 주문과 P0-6 몬스터 실행 모델.
6. P0-7 아이템 원자성과 P0-8 지형.
7. P0-9 HUMAN GM audit/권한.
8. P0-10 실제 smoke 완주와 blocker 수정.
9. P1 콘텐츠 확대.

## 10. 사용자 실행 검증 계획

Codex는 저장소 지침에 따라 아래 테스트를 직접 실행하지 않는다. 구현 단계별로 사용자가 실행하고 결과를 공유하면 그 결과를 근거로 다음 수정 또는 완료 판정을 한다.

### 10.1 정적 빌드

저장소 루트 `C:\WORK\online-TRPG`에서:

```powershell
npm run build -w @trpg/shared-types
npm run build -w @trpg/be
npm run build -w @trpg/fe
```

전체 SRD 생성/동기화까지 포함하려면:

```powershell
npm run build
```

### 10.2 캐릭터 성장

```powershell
npm run test -w @trpg/be -- level-up.service.spec.ts --runInBand
npm run test -w @trpg/be -- characters.service.spec.ts --runInBand
```

수동 확인:

- 서브클래스 선택이 필요한 레벨업.
- ASI가 포함된 레벨업.
- 준비 주문 수 초과 거부.
- 레벨업 후 활성 세션 클라이언트 snapshot 갱신.

### 10.3 휴식

```powershell
npm run test -w @trpg/be -- rest-resolution.service.spec.ts --runInBand
npm run test -w @trpg/be -- action-processor.service.spec.ts --runInBand
npm run test -w @trpg/be -- actions.service.spec.ts --runInBand
```

수동 확인:

- AI GM short/long rest.
- HUMAN GM 요청→승인.
- 전투 중 요청/승인 거부.
- 중복 승인 거부.
- HP, hit dice, slot, condition, class resource 회복.

### 10.4 전투 공통 룰

```powershell
npm run test -w @trpg/be -- condition-runtime.service.spec.ts --runInBand
npm run test -w @trpg/be -- concentration-runtime.service.spec.ts --runInBand
npm run test -w @trpg/be -- cover-position.service.spec.ts --runInBand
npm run test -w @trpg/be -- forced-movement.service.spec.ts --runInBand
npm run test -w @trpg/be -- aoe-targeting.service.spec.ts --runInBand
npm run test -w @trpg/be -- aoe-damage.service.spec.ts --runInBand
npm run test -w @trpg/be -- ready-action.service.spec.ts --runInBand
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
```

수동 확인:

- 엄폐 뒤 원거리 공격.
- Magic Missile/Cure Wounds 대상이 완전 엄폐 뒤에 있을 때 서버가 소모 전에 거부하고 UI hint가 이를 안내.
- 피해 후 concentration save.
- 새 집중 주문으로 기존 집중 종료.
- forced movement의 지형 진입 효과.
- Fireball 대상별 save/피해.
- Sleep/Fireball 원점 기준 full cover 제외와 Fireball Dex-save cover bonus.
- ready action prompt accept/decline.
- websocket과 HTTP response의 반응 prompt 중복 방지.

### 10.5 주문과 몬스터

```powershell
npm run test -w @trpg/be -- rule-catalog.service.spec.ts --runInBand
npm run test -w @trpg/be -- spell-slot.service.spec.ts --runInBand
npm run test -w @trpg/be -- spell-scaling.service.spec.ts --runInBand
npm run test -w @trpg/be -- monster-ability.service.spec.ts --runInBand
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
```

수동 확인:

- 9개 현재 MVP 주문.
- slot 선택과 upcast.
- monster multiattack.
- recharge 성공/실패.
- save-based condition rider.
- limited-use 소진과 rest/combat 회복.
- AI/HUMAN의 동일 action id 실행.

### 10.6 아이템과 지형

```powershell
npm run test -w @trpg/be -- item-interaction.service.spec.ts --runInBand
npm run test -w @trpg/be -- inventory-runtime.service.spec.ts --runInBand
npm run test -w @trpg/be -- terrain-effect.service.spec.ts --runInBand
npm run test -w @trpg/be -- action-processor.service.spec.ts --runInBand
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
```

수동 확인:

- drop→다른 플레이어 pickup.
- 부분 pickup.
- 동시 pickup.
- throw 명중/빗나감 착지.
- difficult/burning/poison cloud/obscurement 진입과 턴 hook.

### 10.7 HUMAN GM

```powershell
npm run test -w @trpg/be -- gm-override.service.spec.ts --runInBand
npm run test -w @trpg/be -- sessions.service.spec.ts --runInBand
npm run test -w @trpg/be -- combat.service.spec.ts --runInBand
```

수동 확인:

- 비GM/미참가자/탈퇴 GM 요청 거부.
- 메시지, 공개, 아이템, 상태, 노드, 전투 조작.
- TurnLog/StateDiff 일치.
- private note 비노출.
- AI suggestion 승인 전 상태 불변.

### 10.8 smoke scenario

```powershell
npm run test -w @trpg/be -- default-scenario.spec.ts --runInBand
npm run test:e2e -w @trpg/be
```

주의:

- e2e는 DB schema push와 테스트 DB 안전 검사를 포함한다.
- 실행 전 `.env`와 대상 DB가 테스트용인지 반드시 확인한다.
- 실제 브라우저 완주는 자동 spec 통과와 별도로 수행한다.

기록할 결과:

- GM mode.
- 참가자 수와 역할.
- 시작/종료 시각.
- 완주 여부와 마지막 node/status.
- 재접속 여부.
- 발견된 blocker.
- 관련 TurnLog/StateDiff id.
- private 정보 노출 여부.

## 11. 완료 판정 체크리스트

다음 항목이 모두 확인되기 전에는 이 로드맵의 P0를 완료로 표시하지 않는다.

- [ ] 레벨업, 서브클래스, ASI, 주문 준비가 실제 UI와 활성 세션 snapshot까지 연결됨.
- [ ] short/long rest가 AI GM 즉시 처리와 HUMAN GM 승인 처리에서 모두 동작함.
- [ ] 상태, 내성, 엄폐, 집중, 강제이동, AoE, 준비행동이 공통 전투 경로에 적용됨.
- [ ] 현재 MVP 주문과 추가 대표 주문이 command/API/UI에서 같은 id와 executor를 사용함.
- [ ] 몬스터 일반 공격, multiattack, recharge, save rider, limited use가 AI/HUMAN 공통 경로에서 동작함.
- [ ] inventory와 VTT object 변경이 원자적이며 동시 pickup에서 복제가 없음.
- [ ] 지형 효과가 normal/forced movement와 시야/전투 판정에 일관 적용됨.
- [ ] HUMAN GM override의 권한, 공개/비공개 경계, TurnLog/StateDiff가 검증됨.
- [ ] AI GM smoke 2회 연속 완주.
- [ ] HUMAN GM smoke 2회 연속 완주.
- [ ] 중간 재접속 후 상태 복원 확인.
- [ ] 사용자 실행 build/test 결과가 모두 통과.
- [ ] 필수 상태 변경의 감사 로그가 누락되지 않음.

## 12. 관련 문서

- [`structure/QUALITY_MVP_ACCEPTANCE.md`](structure/QUALITY_MVP_ACCEPTANCE.md)
- [`structure/RULESET_SRD5E_MVP.md`](structure/RULESET_SRD5E_MVP.md)
- [`structure/RUNTIME_SESSION_TURN_FLOW.md`](structure/RUNTIME_SESSION_TURN_FLOW.md)
- [`rules/ARCHITECTURE_RULES.md`](rules/ARCHITECTURE_RULES.md)
- [`rules/AI_RUNTIME_RULES.md`](rules/AI_RUNTIME_RULES.md)
- [`rules/CONTENT_LICENSE_RULES.md`](rules/CONTENT_LICENSE_RULES.md)
- [`dev-notes/2026-05-23-srd5e-rule-runtime-progress.md`](dev-notes/2026-05-23-srd5e-rule-runtime-progress.md)
- [`dev-notes/2026-05-31-human-gm-session-play-progress.md`](dev-notes/2026-05-31-human-gm-session-play-progress.md)
