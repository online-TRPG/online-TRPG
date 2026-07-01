# 단일 책임 원칙 리팩터링 계획

작성일: 2026-07-02

## Summary

이 문서는 현재 코드베이스에서 단일 책임 원칙(SRP)을 크게 벗어난 함수, 클래스, 컴포넌트를 식별하고, 변경 이유가 여러 개인 코드를 우선적으로 분리하기 위한 실행 계획이다.

핵심 문제는 일부 서비스와 페이지 컴포넌트가 "유스케이스 조율자"를 넘어 도메인 규칙, 영속화, 실시간 이벤트, UI 상태, 표시 문구, fallback 정책까지 함께 소유한다는 점이다. 그 결과 작은 정책 변경도 넓은 파일을 수정하게 되고, 회귀 범위와 리뷰 비용이 커진다.

이 계획의 목표는 기능을 새로 추가하는 것이 아니라, 기존 동작을 유지하면서 변경 축을 분리하는 것이다. 서버는 계속 게임 상태의 최종 권위자이고, 클라이언트는 요청과 표시를 담당한다는 기존 아키텍처 규칙을 유지한다.

## 목표

- 수정 이유가 여러 개인 파일을 책임 단위로 나눈다.
- 대형 서비스와 페이지 컴포넌트를 얇은 facade 또는 조립 컴포넌트로 축소한다.
- 도메인 규칙, API 조율, 영속화, 실시간 이벤트, 프레젠테이션 포맷팅을 분리한다.
- 리팩터링 중 DTO, API 경로, DB 스키마, 사용자-visible 동작은 가능한 한 유지한다.
- 테스트는 직접 실행하지 않고, 각 단계별로 사용자가 돌릴 검증 명령을 문서화한다.

## 비목표

- 신규 전투 룰, 신규 SRD 콘텐츠, 신규 UI 기능을 추가하지 않는다.
- Prisma schema 또는 public DTO를 불필요하게 변경하지 않는다.
- 서비스 분리와 무관한 스타일 정리, 대규모 포맷팅, 파일명 일괄 변경은 하지 않는다.
- 기존 user/session/scenario 데이터 마이그레이션을 요구하는 변경은 별도 계획으로 분리한다.

## 우선순위 요약

| 우선순위 | 대상 | 현재 책임 | 주요 변경 이유 |
|---|---|---|---|
| P0 | `be/src/modules/sessions/sessions.service.ts` | 세션 생명주기, 참가자, Human GM, 경제, 캠페인 아카이브, 캐릭터 이전, VTT, 인벤토리, 스냅샷, 실시간 이벤트 | 세션 정책, 맵 규칙, 경제 규칙, 캠페인 종료/이전 정책, 실시간 동기화 |
| P0 | `fe/src/pages/PlayPage.tsx` | 플레이 화면, 캐릭터 빠른 생성, 메인 커맨드 UX, 전투 액션, VTT 저장 큐, Human GM AI assist, 로그 렌더링 | 화면 구조, 커맨드 UX, 전투 API, 맵 동기화, 로그 표시 |
| P1 | `be/src/modules/combat/combat.service.ts` | 전투 시작/종료, 이동, 강제 이동, 반응, 몬스터 자동 턴, 주문, 지형, 집중, 준비 행동, 피해, 매핑 | 전투 턴, 몬스터 AI, 주문/반응, 지형 효과, DTO 매핑 |
| P1 | `fe/src/pages/CharacterPage.tsx` | 캐릭터 목록, 생성 wizard, 포인트바이, 종족/직업 특성, 장비, 주문, 레벨업, 아바타 업로드 | 캐릭터 생성 UX, SRD 룰, 주문 규칙, 장비 규칙, 파일 저장소 |
| P2 | `be/src/modules/actions/main-commands.service.ts` | AI 해석 라우팅, 컨텍스트 로딩, 의도 검증, 판정 옵션, 장면 전환, VTT 효과, 로그 저장 | AI 라우팅, 명령 검증, 전환 조건, 판정 메시지 |
| P2 | `fe/src/services/api.ts` | 인증 재발급, 에러 처리, 모든 도메인 API endpoint wrapper | 인증 정책, 에러 처리, 도메인 API 변경 |
| P2 | `be/src/modules/characters/characters.service.ts` | 캐릭터 CRUD, 레벨업, 주문 검증, 장비/인벤토리, 시작 장비, R2 아바타 저장소 | 캐릭터 룰, 장비, 주문, 파일 저장소 |
| P3 | `ai/app/services/harness.py` | 역할별 AI 실행, 재시도, fallback 판정, fallback 문구 생성, 실패 로그, trace 조회 | 모델 호출, fallback 휴리스틱, 로깅/trace |

## 공통 리팩터링 원칙

1. 먼저 facade를 만든다.
   - 외부 controller/page가 호출하는 public API는 유지한다.
   - 내부 구현을 새 서비스나 훅으로 옮긴 뒤 facade에서 위임한다.

2. 데이터 계약은 마지막에 건드린다.
   - DTO, API path, DB schema 변경은 별도 이유가 있을 때만 한다.
   - 리팩터링 단계에서는 같은 입력이 같은 응답을 내도록 유지한다.

3. 순수 로직부터 분리한다.
   - DB, socket, file storage가 없는 계산/검증/포맷팅 함수를 먼저 떼어낸다.
   - 이후 영속화와 이벤트 발행을 별도 adapter나 runtime service로 분리한다.

4. 책임 이름은 변경 이유를 기준으로 정한다.
   - "helper"나 "utils"처럼 의미가 흐린 이름을 피한다.
   - `SessionVttMapService`, `CharacterSpellProgressionService`처럼 바뀌는 정책이 드러나게 한다.

5. 테스트 실행은 사용자에게 맡긴다.
   - 각 단계 완료 후 실행할 명령만 안내한다.
   - 리팩터링 PR 설명에는 실행하지 않은 테스트와 권장 검증을 명확히 남긴다.

## P0-1. SessionsService 분리

### 현재 문제

`SessionsService`는 세션 도메인의 중심 facade 역할을 하면서도 너무 많은 변경 축을 직접 소유한다.

대표 책임:

- 세션 생성, 참여, 이탈, 시작, 삭제.
- 참가자 상태와 ready 상태.
- Human GM runtime 조작.
- 세션 경제와 캠페인 달력.
- 캠페인 아카이브와 캐릭터 vault/transfer.
- VTT 맵 생성, 정규화, 이동, ping, 상호작용.
- 세션 인벤토리 지급/삭제/동기화.
- 스냅샷 생성과 실시간 이벤트 발행.

이 구조에서는 VTT 맵 이동 규칙을 바꿔도 세션 생명주기 서비스가 바뀌고, 캠페인 아카이브 정책을 바꿔도 세션 참여 로직과 같은 파일을 수정하게 된다.

### 목표 구조

- `SessionsService`
  - public facade.
  - controller가 호출하는 기존 메서드를 유지한다.
  - 내부 서비스로 위임한다.

- `SessionLifecycleService`
  - create/join/leave/start/delete/resume.
  - host/participant 권한 확인.
  - invite code/public id 생성.

- `SessionParticipantService`
  - 참가자 목록, ready 상태, connection status.
  - 캐릭터 선택과 세션 캐릭터 연결.

- `SessionVttMapService`
  - VTT map 조회, 업데이트, redaction.
  - token 이동, ping, map baseline, map normalization.
  - player map update 검증.

- `HumanGmSessionRuntimeService`
  - Human GM 메시지, 노드 이동, 난이도, private note.
  - Human GM AI assist suggestion 상태.

- `SessionEconomyService`
  - economy state 초기화, wallet 정규화, 경제 액션 적용.
  - campaign calendar action 적용.

- `CampaignArchiveService`
  - long campaign 완료.
  - archive snapshot 생성/파싱.
  - character vault 조회.

- `CharacterTransferService`
  - transfer request/approve/reject.
  - 레벨 범위와 campaign-bound inventory 정책.

- `SessionInventoryService`
  - 세션 인벤토리 지급/삭제.
  - session character inventory snapshot refresh.

### 실행 단계

1. `SessionsService`의 public method 목록을 고정한다.
   - controller와 다른 서비스가 호출하는 메서드를 먼저 표로 만든다.
   - public 메서드는 facade에 남기고 private helper만 이동 대상으로 잡는다.

2. 순수 파싱/정규화 로직을 먼저 이동한다.
   - campaign archive parse/build/count.
   - economy wallet normalization.
   - VTT map normalization과 clamp/grid helper.

3. VTT map 책임을 `SessionVttMapService`로 이동한다.
   - `getVttMapForUser`, `updateVttMap`, `updateGmVttMap`, `moveSessionToken`, `createVttMapPing`.
   - `normalizeVttMap`, `redactVttMapForPlayer`, `finalizeRuntimeVttMapChange`.

4. 캠페인 아카이브와 캐릭터 이전을 분리한다.
   - `completeLongCampaign`, `getCampaignArchive`, `listCharacterVault`.
   - `requestCharacterTransfer`, `approveCharacterTransfer`, `rejectCharacterTransfer`.

5. Human GM runtime을 분리한다.
   - `createHumanGmMessage`, `updateSessionNode`, `listHumanGmNodeMoveOptions`.
   - AI assist suggestion 관련 메서드.

6. facade의 위임만 남긴다.
   - 기존 controller 호출은 그대로 유지한다.
   - 새 서비스가 필요한 최소 dependency만 받도록 조정한다.

### 검증 안내

사용자가 단계 완료 후 실행할 명령:

```bash
npm --prefix be test -- sessions.service.spec.ts
npm --prefix be test -- map-runtime.service.spec.ts
npm --prefix be test -- server-scenario-db.spec.ts
```

## P0-2. PlayPage 분리

### 현재 문제

`PlayPage`는 실제 세션 플레이 화면이지만 화면 조립을 넘어 많은 도메인 상태와 API orchestration을 직접 소유한다.

대표 책임:

- 탭, 채팅 입력, 사이드바 크기, 모달 상태.
- 메인 커맨드 preset, slash parsing, 자동완성, helper 선택.
- 플레이어/GM 액션 제출.
- 전투 액션 호출과 combat response 처리.
- VTT map optimistic update, 저장 queue, socket map reconciliation.
- 캐릭터 빠른 생성 폼과 SRD 기반 기본값 계산.
- Human GM AI assist 생성/수락/실패 보고.
- 로그 grouping, NPC 대화 파싱, dice overlay 표시.

이 구조에서는 커맨드 입력 UI만 바꿔도 전투 액션과 VTT 저장 큐가 있는 파일을 수정하게 된다.

### 목표 구조

- `PlayPage`
  - layout과 주요 child component 조립만 담당한다.
  - 상태 훅과 command handler를 받아 화면에 연결한다.

- `usePlayMainCommand`
  - main command mode, preset, slash parsing, autocomplete.
  - submit payload 생성.
  - check resolve handler.

- `usePlayCombat`
  - combat 조회/시작/종료/턴 종료.
  - combat action API 호출.
  - reaction prompt 처리.

- `usePlayVttMap`
  - VTT map fetch.
  - optimistic token move.
  - pending save queue.
  - ping/interaction 요청.

- `useHumanGmAssist`
  - Human GM message.
  - AI assist suggestion create/generate/accept/failure.

- `useSessionLogPresentation`
  - log tab filtering.
  - NPC dialogue parsing.
  - dice overlay data.
  - sender/profile presentation.

- `QuickCharacterCreateModal`
  - 빠른 생성 form UI.
  - quick create default builder는 별도 pure module로 분리.

### 실행 단계

1. 순수 helper를 `features/sessionPlay/utils`로 이동한다.
   - log presentation helper.
   - combat response type guard.
   - VTT render signature/optimistic map helper.

2. 메인 커맨드 모델을 분리한다.
   - preset 정의와 parser를 `features/sessionPlay/mainCommand` 하위로 이동한다.
   - React state를 `usePlayMainCommand`로 감싼다.

3. VTT map orchestration을 훅으로 분리한다.
   - map fetch/save queue/optimistic move를 `usePlayVttMap`으로 이동한다.
   - `PlayPage`에는 `map`, `onMapChange`, `onTokenMoveRequest`만 남긴다.

4. 전투 handler를 `usePlayCombat`으로 분리한다.
   - API 호출과 result formatting을 훅에서 처리한다.
   - `CombatNodeSurface`에는 필요한 callbacks만 전달한다.

5. Human GM assist를 분리한다.
   - suggestion lifecycle을 한 훅으로 묶는다.

6. 빠른 캐릭터 생성 기능을 독립 컴포넌트로 이동한다.
   - PlayPage의 세션 모집 화면과 생성 모달 결합도를 낮춘다.

### 검증 안내

사용자가 단계 완료 후 실행할 명령:

```bash
npm --prefix fe run build
npm --prefix fe run lint
```

수동 확인:

- 세션 입장 후 로그 탭 전환.
- 메인 커맨드 자동완성.
- VTT 토큰 이동과 ping.
- 전투 시작, 공격, 턴 종료.
- Human GM AI assist 생성/수락.

## P1-1. CombatService 분리

### 현재 문제

`CombatService`는 이미 여러 하위 서비스가 있지만 여전히 핵심 규칙을 많이 직접 처리한다. 전투 상태 변경, 룰 판정, 이벤트 발행, DTO mapping, 자동 몬스터 턴 예약이 같은 클래스에 남아 있다.

대표 변경 축:

- 전투 lifecycle.
- 이동/강제 이동.
- 반응과 continuation.
- 몬스터 행동/자동 턴.
- 주문과 counterspell/shield.
- 지형 효과와 집중.
- 준비 행동.
- damage finalization.
- combat response mapping.

### 목표 구조

- `CombatService`
  - controller-facing facade.
  - transaction 경계와 high-level orchestration만 담당한다.

- `CombatLifecycleService`
  - start/end/complete/party defeat.

- `CombatMovementRuntimeService`
  - 일반 이동, 강제 이동, movement resource spend.
  - opportunity attack prompt 생성은 reaction service와 협력.

- `CombatReactionRuntimeService`
  - opportunity attack, shield, counterspell, ready action continuation.

- `CombatMonsterTurnService`
  - auto monster turn scheduling/execution.
  - monster multiattack continuation.

- `CombatDamageRuntimeService`
  - hit point delta, damage packet, concentration damage check.

- `CombatReadinessRuntimeService`
  - ready action trigger, consume, expire.

### 실행 단계

1. `CombatService` public API를 그대로 유지한다.
2. monster auto turn scheduling과 execution을 먼저 분리한다.
3. reaction continuation 계열 메서드를 `CombatReactionRuntimeService`로 이동한다.
4. movement와 forced movement를 `CombatMovementRuntimeService`로 이동한다.
5. damage finalization을 `CombatDamageRuntimeService`로 이동한다.
6. mapper 책임은 `CombatMapperService`로 더 밀어내고 `mapCombat` wrapper만 남긴다.

### 검증 안내

사용자가 단계 완료 후 실행할 명령:

```bash
npm --prefix be test -- combat.service.spec.ts
npm --prefix be test -- combat-movement.service.spec.ts combat-spell.service.spec.ts combat-targeting.service.spec.ts
```

## P1-2. CharacterPage 분리

### 현재 문제

`CharacterPage`는 캐릭터 관리 페이지이면서 캐릭터 빌더, 레벨업 wizard, 주문 관리, 장비 관리, 아바타 파일 업로드까지 담당한다.

특히 SRD 룰 계산과 UI 상태가 같은 파일에 있어, 룰 변경과 화면 변경이 서로 영향을 준다.

### 목표 구조

- `CharacterPage`
  - 목록, 선택 상태, modal orchestration.

- `CharacterCreateWizard`
  - 생성 wizard UI.

- `useCharacterCreateForm`
  - 생성 폼 상태와 단계 이동.

- `characterBuildRules.ts`
  - point buy, ability modifier, recommended stats.
  - SRD 룰 호출 wrapper.

- `CharacterSpellSelectionSection`
  - cantrip/slot/prepared spell 선택 UI.

- `CharacterLevelUpModal`
  - 레벨업 wizard.

- `useCharacterAvatarAssets`
  - avatar asset list/upload/delete.

- `CharacterEquipmentSection`
  - 시작 장비와 장비 변경 UI.

### 실행 단계

1. pure rule helper를 `features/characters`로 이동한다.
2. spell option builder와 spell display helper를 분리한다.
3. create wizard를 component로 분리한다.
4. level up modal을 component와 hook으로 분리한다.
5. avatar upload 관련 API state를 `useCharacterAvatarAssets`로 이동한다.
6. `CharacterPage`에는 selected character와 modal open state만 남긴다.

### 검증 안내

사용자가 단계 완료 후 실행할 명령:

```bash
npm --prefix fe run build
npm --prefix fe run lint
```

수동 확인:

- 캐릭터 생성 전체 단계.
- 주문 선택 직업 생성.
- 레벨업.
- 준비 주문 저장.
- 아바타 업로드/삭제.

## P2-1. MainCommandsService 분리

### 현재 문제

`MainCommandsService`는 플레이어 자연어 명령을 처리하는 핵심 서비스지만, 현재는 AI interpreter 라우팅, 명령 검증, 판정 옵션 생성, 장면 전환 조건 평가, VTT check effect, 로그 저장을 모두 직접 수행한다.

### 목표 구조

- `MainCommandsService`
  - submit/resolve facade.

- `MainCommandContextLoader`
  - session, actor, current node, inventory, flags 로딩.

- `MainCommandIntentRouter`
  - AI actionType과 local fallback action routing.

- `MainCommandValidator`
  - target/item/spell/mapPoint requirement 검증.

- `MainCommandCheckBuilder`
  - intent별 check option 생성.

- `SceneTransitionEvaluator`
  - transition candidate 로딩과 조건 평가.

- `MainCommandEffectResolver`
  - VTT door/object/hazard check effect parse/apply.

- `MainCommandPersistenceService`
  - TurnLog, StateDiff, raw input persistence.

### 실행 단계

1. context loading을 먼저 분리한다.
2. check option builder를 intent별 pure builder로 분리한다.
3. transition condition evaluator를 독립 서비스로 분리한다.
4. interpreter action route와 fallback text intent를 분리한다.
5. persistence를 마지막에 분리한다.

### 검증 안내

사용자가 단계 완료 후 실행할 명령:

```bash
npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts
```

## P2-2. FE API 클라이언트 분리

### 현재 문제

`fe/src/services/api.ts`는 인증 토큰 재발급과 공통 request 처리뿐 아니라 모든 도메인의 endpoint wrapper를 포함한다.

### 목표 구조

- `services/httpClient.ts`
  - base URL, auth header, retry/reissue, error body parsing.

- `services/authApi.ts`
  - guest/register/login/logout/reissue/me/oauth.

- `services/scenarioApi.ts`
  - scenario CRUD, moderation, assets.

- `services/sessionApi.ts`
  - session list/create/join/start/leave/state.

- `services/combatApi.ts`
  - combat action endpoints.

- `services/characterApi.ts`
  - character CRUD, avatar, equipment, spells.

- `services/humanGmApi.ts`
  - Human GM runtime and AI assist.

- `services/vttMapApi.ts`
  - VTT map endpoints.

### 실행 단계

1. `requestJson`, `requestAccessTokenReissue`, error formatter를 `httpClient.ts`로 이동한다.
2. 기존 export 이름을 유지하는 barrel을 잠시 둔다.
3. 도메인별 API 파일로 endpoint wrapper를 이동한다.
4. import 경로를 점진적으로 도메인별 API로 바꾼다.
5. 최종 단계에서 legacy barrel을 제거한다.

### 검증 안내

사용자가 단계 완료 후 실행할 명령:

```bash
npm --prefix fe run build
npm --prefix fe run lint
```

## P2-3. CharactersService 분리

### 현재 문제

`CharactersService`는 캐릭터 CRUD 외에도 레벨업, 주문 진행, 장비 검증, 시작 장비 해석, 아바타 R2 저장소 처리를 모두 담당한다.

### 목표 구조

- `CharactersService`
  - controller-facing facade.

- `CharacterCreationService`
  - 생성 요청 검증과 초기 snapshot 구성.

- `CharacterLevelUpService`
  - level up payload 검증과 적용.

- `CharacterSpellProgressionService`
  - starting spell, prepared spell, known spell progression.

- `CharacterEquipmentService`
  - inventory/equipment validation and loadout.

- `CharacterAvatarAssetService`
  - R2 put/delete, signature, safe extension.

- `CharacterFeatureSnapshotService`
  - race/class/subclass/feat selection 검증.

### 실행 단계

1. R2 avatar 저장소 책임을 먼저 분리한다.
2. spell progression 검증을 분리한다.
3. equipment validation과 armor/weapon helper를 분리한다.
4. feature selection 검증을 분리한다.
5. creation/level-up orchestration을 facade에서 위임한다.

### 검증 안내

사용자가 단계 완료 후 실행할 명령:

```bash
npm --prefix be test -- characters.service.spec.ts normalize-skill.spec.ts
npm --prefix be test -- classes.spec.ts
```

## P3. AiHarnessService 분리

### 현재 문제

`AiHarnessService`는 역할별 AI 실행과 fallback 생성을 모두 담당한다. 특히 interpreter fallback 휴리스틱과 role별 fallback response가 같은 클래스에 있어 모델 호출 정책 변경과 fallback 문구 변경이 충돌한다.

### 목표 구조

- `AiHarnessService`
  - role service 호출 facade.

- `AiRoleRunner`
  - prompt load, model call, schema validation, retry.

- `AiFallbackPolicy`
  - fallback 허용 failure type 판정.

- `InterpreterFallbackService`
  - interpreter local fallback action 추론.

- `RoleFallbackTemplates`
  - narrator/director/summarizer/actor/npc/check-result fallback response.

- `AiTraceService`
  - failure/fallback logging과 trace listing.

### 실행 단계

1. fallback 허용 정책을 분리한다.
2. interpreter fallback 휴리스틱을 분리한다.
3. role별 fallback template을 분리한다.
4. trace logging을 분리한다.
5. harness는 role runner와 fallback service를 조합한다.

### 검증 안내

사용자가 단계 완료 후 실행할 명령:

```bash
python -m pytest ai/app/tests/test_harness_service.py
python -m pytest ai/app/tests/test_interpreter_contract_validation.py
```

## 단계별 진행 순서

1. P0 inventory 작성
   - 각 대상의 public API, private helper, 외부 호출자를 표로 만든다.
   - 이 단계에서는 코드 이동을 하지 않는다.

2. FE/BE P0를 한꺼번에 하지 않는다.
   - 먼저 `SessionsService` 또는 `PlayPage` 중 하나만 선택한다.
   - 한 PR에서 backend god service와 frontend god component를 동시에 나누지 않는다.

3. pure helper 이동
   - 타입/함수 이동만 수행한다.
   - public behavior를 바꾸지 않는다.

4. orchestration service/hook 생성
   - 기존 facade는 유지한다.
   - 새 단위는 dependency를 최소화한다.

5. import 전환
   - 내부 호출부터 새 서비스/hook으로 바꾼다.
   - controller/page 외부 계약은 마지막까지 유지한다.

6. facade 축소
   - 기존 파일에 남은 책임을 확인한다.
   - 파일이 여전히 여러 변경 이유를 갖는다면 다음 분리 단위를 잡는다.

7. 완료 문서 이동
   - 계획이 실행 완료되면 이 문서를 `doc/completed/`로 옮기거나 완료 기록 문서를 따로 작성한다.

## 완료 기준

각 대상은 다음 조건을 만족하면 해당 단계 완료로 본다.

- public API는 유지되거나 변경 사유가 별도 문서화되어 있다.
- facade 파일은 orchestration과 delegation 중심으로 축소되어 있다.
- 새 서비스/훅 이름이 변경 이유를 드러낸다.
- 순수 로직은 DB/socket/UI state에 의존하지 않는다.
- 권장 테스트 명령과 수동 확인 항목이 PR 또는 작업 로그에 남아 있다.
- 사용자-visible 회귀가 의심되는 흐름은 수동 확인 항목으로 명시되어 있다.

## 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 서비스 순환 의존성 증가 | facade에서만 조합하고 하위 서비스끼리 직접 참조를 최소화한다. 공통 타입/순수 함수는 별도 module로 둔다. |
| 리팩터링 중 동작 변경 | public method signature와 DTO를 먼저 고정하고, 이동 전후 diff를 작게 유지한다. |
| 테스트 fixture 파손 | 기존 spec은 가능한 유지하고, mock wiring만 새 서비스 구조에 맞게 조정한다. |
| 프론트 훅 분리 후 prop drilling 증가 | page-level context를 만들기 전에 훅 return shape를 안정화한다. 필요할 때만 provider를 도입한다. |
| SRD 룰 중복 재발 | `@trpg/srd-data/rules` 호출을 유지하고, FE/BE에 새 룰 테이블을 복사하지 않는다. |
| AI fallback 동작 변화 | fallback 문구와 action inference를 별도 fixture로 고정한다. |

## 권장 작업 단위

첫 번째 PR:

- `SessionsService`의 campaign archive helper와 character transfer helper를 별도 service로 이동한다.
- 외부 API 변경 없음.
- 권장 검증: `sessions.service.spec.ts`.

두 번째 PR:

- `PlayPage`의 log presentation helper와 main command parser를 분리한다.
- 화면 동작 변경 없음.
- 권장 검증: FE build/lint, 세션 로그/메인 커맨드 수동 확인.

세 번째 PR:

- `CombatService`의 monster auto turn과 reaction continuation을 분리한다.
- 권장 검증: combat 관련 spec.

네 번째 PR:

- `CharacterPage`의 spell selection/rule helper와 avatar asset hook을 분리한다.
- 권장 검증: FE build/lint, 캐릭터 생성/레벨업 수동 확인.

## 참고한 코드 위치

- `be/src/modules/sessions/sessions.service.ts`
- `fe/src/pages/PlayPage.tsx`
- `be/src/modules/combat/combat.service.ts`
- `fe/src/pages/CharacterPage.tsx`
- `be/src/modules/actions/main-commands.service.ts`
- `fe/src/services/api.ts`
- `be/src/modules/characters/characters.service.ts`
- `ai/app/services/harness.py`
