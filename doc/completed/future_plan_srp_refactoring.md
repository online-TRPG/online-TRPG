# 단일 책임 원칙 리팩터링 계획

작성일: 2026-07-02
최근 점검: 2026-07-04

## Summary

이 문서는 현재 코드베이스에서 단일 책임 원칙(SRP)을 크게 벗어난 함수, 클래스, 컴포넌트를 식별하고, 변경 이유가 여러 개인 코드를 우선적으로 분리하기 위한 실행 계획이다. 2026-07-04 점검 이후의 기본 방향은 "추가 분해"가 아니라 "이미 진행한 분리의 안정화와 가치 높은 축의 선별적 마무리"다.

핵심 문제는 일부 서비스와 페이지 컴포넌트가 "유스케이스 조율자"를 넘어 도메인 규칙, 영속화, 실시간 이벤트, UI 상태, 표시 문구, fallback 정책까지 함께 소유한다는 점이다. 그 결과 작은 정책 변경도 넓은 파일을 수정하게 되고, 회귀 범위와 리뷰 비용이 커진다.

이 계획의 목표는 기능을 새로 추가하는 것이 아니라, 기존 동작을 유지하면서 변경 축을 분리하는 것이다. 서버는 계속 게임 상태의 최종 권위자이고, 클라이언트는 요청과 표시를 담당한다는 기존 아키텍처 규칙을 유지한다. 다만 파일을 작게 만드는 것 자체는 목표가 아니다. facade 생성자, Nest provider 목록, React page import 목록, 테스트 mock wiring이 과도하게 커지면 복잡도가 이동한 것으로 보고 추가 분해를 멈춘다.

## 현재 점검 결론

미커밋 변경분은 SRP 개선과 관련된 작업이 맞고, 큰 파일을 줄이는 효과도 확인된다. 예를 들어 `ActionsService`, `MainCommandsService`, `CharactersService`, `PlayPage`, FE API client 분리는 변경 이유를 더 잘 드러내는 방향이다.

하지만 현재 변경 표면적은 매우 크다. 새 파일과 미추적 파일이 수백 개 수준으로 늘었고, 일부 facade는 수십 개 협력 객체를 생성자에 받거나 기본값으로 직접 `new SomeService(...)`를 조립한다. 이 상태에서 같은 방식으로 계속 분해하면 god service의 복잡도가 DI 조립, provider 등록, import 관리, 테스트 fixture로 옮겨갈 위험이 크다.

따라서 다음 단계의 원칙은 다음과 같다.

- 새 SRP 대상 발굴보다 현재 변경분 안정화를 우선한다.
- 변경 이유가 실제로 다른 축만 남기고, "작아 보이게 만들기 위한 분리"는 중단한다.
- facade는 얇아져야 하지만, 수동 dependency composition root가 되어서는 안 된다.
- pure helper는 함수/module로 둘 수 있으면 Nest service나 React hook으로 승격하지 않는다.
- 커밋/PR 단위는 기능 축별로 나누고, 각 단위마다 권장 검증 명령과 수동 확인 항목을 남긴다.

2026-07-04 안정화 점검 결과:

- FE API client split은 `fe/src/services/api.ts` 삭제 이후 `services/api` import가 남지 않았고, 호출부는 `authApi`, `sessionApi`, `scenarioApi`, `characterApi`, `combatApi`, `humanGmApi`, `catalogApi`, `vttMapApi`로 전환되어 있다.
- `MainCommandsService`, `SessionsService`, `ActionProcessorService`, `CombatService`, `CombatMovementService`와 각 하위 provider의 production 생성자에서 이번 SRP 변경으로 생긴 provider 기본 `new ...Service(...)` 조립은 제거했다.
- 테스트 편의를 위한 수동 조립은 application facade가 아니라 각 spec fixture helper나 spec-local setup에만 남긴다.
- 남아 있는 production `new ...Service(...)` 패턴은 주로 `rules/*`의 rule runtime 내부 조립, `sessions.service.ts`의 pure/runtime helper, `session-economy.service.ts`의 `EconomyRuntimeService`, 기존 `ScenariosService`의 collaboration policy 기본값이다. 이들은 현재 커밋 분할안의 핵심 안정화 범위 밖이므로 새 분해를 열지 않고 후속 검토 후보로 둔다.

완료 감사 메모:

- 미커밋 변경분은 `ai`, `be`, `fe`, `doc` 축으로 나뉘며, 아래 "현재 커밋 분할안"의 9개 커밋 단위에 대응한다.
- 각 커밋 단위에는 포함 범위, 안정화 체크, 권장 테스트 명령, 수동 확인 항목이 있다.
- 테스트는 저장소 지시에 따라 직접 실행하지 않았고, 사용자가 실행할 검증 명령만 문서화했다.
- patch 위생 확인은 `git diff --check`로 수행한다. 줄바꿈 정책 경고는 있을 수 있으나, 공백 오류가 없어야 한다.

## 목표

- 수정 이유가 여러 개인 파일을 책임 단위로 나눈다.
- 대형 서비스와 페이지 컴포넌트를 얇은 facade 또는 조립 컴포넌트로 축소한다.
- 도메인 규칙, API 조율, 영속화, 실시간 이벤트, 프레젠테이션 포맷팅을 분리한다.
- 이미 분리한 코드의 DI wiring, import surface, 테스트 fixture 비용을 낮춘다.
- 의미가 분명한 변경 축만 유지하고 과분해된 단위는 pure module 또는 더 큰 runtime 단위로 합친다.
- 리팩터링 중 DTO, API 경로, DB 스키마, 사용자-visible 동작은 가능한 한 유지한다.
- 테스트는 직접 실행하지 않고, 각 단계별로 사용자가 돌릴 검증 명령을 문서화한다.

## 비목표

- 신규 전투 룰, 신규 SRD 콘텐츠, 신규 UI 기능을 추가하지 않는다.
- Prisma schema 또는 public DTO를 불필요하게 변경하지 않는다.
- 서비스 분리와 무관한 스타일 정리, 대규모 포맷팅, 파일명 일괄 변경은 하지 않는다.
- 기존 user/session/scenario 데이터 마이그레이션을 요구하는 변경은 별도 계획으로 분리한다.
- 단순히 파일 줄 수를 줄이기 위해 service/hook/provider를 계속 늘리지 않는다.
- facade 생성자에 수동 `new Service(...)` 기본값을 추가해 테스트 편의를 확보하는 방식을 장기 구조로 삼지 않는다.

## 우선순위 요약

| 우선순위 | 대상 | 현재 판단 | 다음 액션 |
|---|---|---|---|
| P0 | `be/src/modules/sessions/sessions.service.ts` | 분리 가치는 높지만 facade 생성자와 수동 조립 비용이 커졌다. | 추가 분해 중단. DI wiring 정리, commit 단위 분리, VTT/session policy 회귀 검증 항목 고정. |
| P0 | `fe/src/pages/PlayPage.tsx` | page body는 줄었지만 import와 hook 조립 surface가 여전히 크다. | 새 hook 추출 중단. 관련 훅을 기능 축별로 묶고 props/return shape를 안정화. |
| P1 | `be/src/modules/combat/combat.service.ts` | 전투 규칙 변경 축은 여전히 분리 가치가 있다. | 이미 건드린 최소 범위만 마무리. 새 분리는 명확한 전투 정책 단위가 있을 때만 진행. |
| P1 | `fe/src/pages/CharacterPage.tsx` | 생성/레벨업/표시 규칙 분리는 가치가 있다. | 생성 wizard와 SRD pure rule 분리까지만 유지. 작은 wrapper hook 추가는 보류. |
| P2 | `be/src/modules/actions/main-commands.service.ts` | 큰 축소 효과가 있으나 협력 객체가 과도하게 늘었다. | 추가 service 추출 중단. `new Service(...)` 기본값 제거/DI 정리 우선. |
| P2 | `fe/src/services/api.ts` | 가장 명확하게 성공한 분리 축이다. | 도메인 API split 유지. import 전환 누락과 auth/http 공통 동작만 점검. |
| P2 | `be/src/modules/characters/characters.service.ts` | 캐릭터 룰/장비/주문/아바타 분리는 가치가 있다. | 현재 분리 안정화. public API와 mapper 계약 유지 여부 점검. |
| P3 | `ai/app/services/harness.py` | fallback/trace/role runner 분리는 가치가 있으나 runner/factory 경계가 과분해될 수 있다. | 추가 분해보다 fallback 응답 계약과 trace logging 검증 항목 고정. |

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

6. 분리 중단 기준을 둔다.
   - 새 단위가 "다른 변경 이유"가 아니라 "긴 파일의 일부"만 대표한다면 만들지 않는다.
   - facade 생성자 인자가 15개를 넘거나 같은 prefix의 service가 과도하게 늘면 먼저 묶음 단위 재검토를 한다.
   - page import가 크게 늘어 읽기 순서가 흐려지면 새 hook 추출 대신 feature-level orchestrator를 고려한다.

7. DI와 pure module을 구분한다.
   - DB/socket/외부 service가 필요한 runtime은 Nest provider로 둔다.
   - 순수 계산, DTO projection, 문자열/표시 규칙은 provider가 아니라 함수 module로 둔다.
   - Nest provider를 등록했다면 facade 생성자에서 기본값으로 직접 `new` 하지 않는다. 테스트 편의는 spec의 provider mock으로 해결한다.

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

- `SessionPublicIdService`
  - 8자리 public id 생성.
  - 기존 세션의 public id 보정과 충돌 재시도.

- `SessionInviteService`
  - invite code 생성과 충돌 재시도.
  - invite code normalize/lookup.
  - invite info/share URL DTO 조립.

- `SessionSettingsService`
  - 생성/수정 DTO의 visibility 해석.
  - API GM mode -> Prisma GM mode 변환.

- `SessionStartPolicyService`
  - 세션 시작 가능 상태 검증.
  - HUMAN GM 참가자, 플레이어 캐릭터 선택, ready 상태, 시나리오 레벨 정책 검증.

- `SessionCompletionFlagStoreService`
  - post-combat/ending node/party defeat 완료 flags marker 조립.
  - 기존 flags 보존과 완료/패배/전투 완료 저장 key 계약 관리.

- `SessionUpdatePolicyService`
  - 세션 수정 가능 상태 검증.
  - max participant 축소 제한과 captain 참가자 검증.

- `SessionHumanGmAssignmentPolicyService`
  - HUMAN GM 지정 가능 상태 검증.
  - 대상 GM 사용자의 JOINED 참가자 여부 확인.

- `SessionDeletePolicyService`
  - 세션 삭제 가능 상태 검증.

- `SessionJoinPolicyService`
  - 세션 참여 가능 상태와 정원 검증.
  - 기존 LEFT 참가자의 재참여 가능 row 확인.

- `SessionLeaveResolutionService`
  - 세션 이탈 후 해산/snapshot 발행 여부 결정.
  - GM 해제와 host 승계 대상/role 결정.

- `SessionStartNodeService`
  - 시나리오 graph의 시작 노드 결정.
  - transition JSON 기반 root node fallback 정책.

- `SessionScenarioRevisionSnapshotService`
  - P3 scenario revision metadata 파싱.
  - game state에 저장할 초기 revision snapshot flags 조립.

- `SessionScenarioNodeSnapshotService`
  - scenario node를 session scenario node snapshot으로 복사.
  - session scenario node 조회/누락 처리.

- `SessionScenarioLinkService`
  - active/fallback session scenario 선택.
  - 세션 삭제/재구성 시 session scenario link 정리.

- `SessionAccessPolicyService`
  - host-only action 권한 검증.
  - AI/HUMAN GM runtime operator와 GM-only data visibility 판단.

- `SessionGmRuntimeParticipantAccessService`
  - GM runtime 실행 전 session participant row 조회.
  - JOINED 상태의 GM/HOST participant 검증.

- `SessionParticipantService`
  - 참가자 목록, ready 상태, connection status.
  - 캐릭터 선택과 세션 캐릭터 연결.

- `SessionVttMapService`
  - VTT map 조회, 업데이트, redaction.
  - token 이동, ping, map baseline, map normalization.
  - player map update 검증.

- `SessionVttMapNormalizationService`
  - VTT map 크기, token, fog, ping, light source, 구조물 cell 정규화.
  - persisted flags/check option의 부분 map 복원과 invalid value fallback.

- `SessionVttMapBootstrapService`
  - 기본 VTT map 생성.
  - active session character를 player token으로 배치하고 scenario map의 NPC/object token을 보존.

- `SessionVttMapPersistenceService`
  - game state flags의 VTT map 저장과 version 증가.
  - VTT map flags payload 조립.
  - host/player map update 이벤트와 필요 시 session snapshot 이벤트 발행.

- `SessionVttInteractionPointService`
  - VTT interaction DTO의 direct map point와 target id 정규화.
  - door/object target 중심 좌표 계산.

- `SessionVttCombatMovementSpendService`
  - 전투 중 player VTT token 이동 거리 합산.
  - combat turn state upsert/update와 남은 이동력 검증.

- `SessionVttPlayerMapUpdateService`
  - player가 제출한 VTT map diff를 server baseline에 적용.
  - uncontrolled token 보존, token add/remove 거절, combat movement spend 산출.

- `SessionVttMovementFramePublisherService`
  - 자동/몬스터 token 이동 path를 frame별 VTT map update 이벤트로 발행.
  - host map/player redacted map 생성 타이밍과 frame delay 관리.

- `SessionVttDefaultMapReaderService`
  - session scenario node의 checkOptions JSON에서 default VTT map과 check list 추출.
  - malformed JSON과 legacy array/object wrapper fallback 처리.

- `SessionVttMovementPolicyService`
  - token path reachability, diagonal corner-cut 방지, blocker collision 판정.
  - player map shell 변조 검증, token-only move 검증, grid 이동 거리 계산.

- `HumanGmSessionRuntimeService`
  - Human GM 메시지, 노드 이동, 난이도, private note.
  - Human GM AI assist suggestion 상태.

- `SessionHumanGmMessageStoreService`
  - Human GM message flags record 생성과 append.
  - legacy message entry 보존과 최근 50개 유지.

- `SessionHumanGmPrivateNoteStoreService`
  - Human GM private note flags 배열 검증, append, 최신순 projection.
  - invalid persisted private note fallback과 최근 100개 유지.

- `SessionHumanGmAiAssistSuggestionStoreService`
  - Human GM AI assist suggestion flags 배열 검증, append, accept 상태 변경.
  - invalid persisted suggestion fallback과 최근 100개 유지.

- `SessionHumanGmAiAssistFailureAuditService`
  - 승인된 AI assist 적용 실패 turn log 생성.
  - 실패 사유/작업명 trimming fallback과 audit metadata 조립.

- `SessionEconomyService`
  - economy state 초기화, wallet 정규화, 경제 액션 적용.
  - campaign calendar action 적용.

- `SessionCampaignCalendarActionPolicyService`
  - campaign calendar action type별 player 직접 제출 가능 여부 판정.
  - GM 권한이 필요한 calendar action 변경 축 분리.

- `CampaignArchiveService`
  - long campaign 완료.
  - archive snapshot 생성/파싱.
  - character vault 조회.

- `SessionCampaignArchiveBuilderService`
  - long campaign 완료 archive response DTO 조립.
  - final reward dedupe/limit, 완료 시각, 캐릭터/analytics/snapshot 조합.

- `SessionCampaignArchiveFlagStoreService`
  - long campaign 완료 시 game state flags 완료 marker 조립.
  - 기존 flags 보존과 `p6CampaignArchive` 저장 계약 관리.

- `SessionCampaignArchiveAuditService`
  - long campaign 완료 turn log와 state diff row 생성.
  - `p6_campaign_archive` audit payload와 version diff 계약 관리.

- `CharacterTransferService`
  - transfer request/approve/reject.
  - 레벨 범위와 campaign-bound inventory 정책.

- `SessionCharacterTransferClonePayloadService`
  - transfer 승인 시 cloned character create payload 조립.
  - target session character 초기 상태 payload 조립.

- `SessionCharacterVaultItemService`
  - completed campaign archive 기반 character vault item DTO 조립.
  - active/fallback session scenario 선택과 transferable 표시.

- `SessionCharacterTransferRequestStoreService`
  - character transfer request flags 배열 append/replace.
  - pending duplicate request 탐색과 기존 flags 보존.

- `SessionInventoryService`
  - 세션 인벤토리 지급/삭제.
  - session character inventory snapshot refresh.

- `SessionListItemService`
  - 공개/내 세션 목록 카드 DTO 조립.
  - active scenario fallback, 참가자 수, 빈 슬롯, 요청자 role 표시.

- `SessionListFilterService`
  - 공개/내 세션 목록 Prisma where 조립.
  - status/role/active scenario/ruleset 필터 매핑.

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

진행 기록:

- 2026-07-03: `PlayPage`에 남아 있던 참가자 badge, 캐릭터 token color, 참가자-linked character, 로그 profile color/image 계산의 page context 바인딩을 `usePlayProfilePresentation` 훅으로 분리했다. 순수 표시 규칙은 기존 `playPageProfilePresentation.ts`에 유지하고, `PlayPage`는 세션/참가자/맵/current node 정보를 훅에 전달해 반환된 표시 함수만 사용하므로, 프로필·로그 avatar 표시 정책 변경 이유가 페이지 본문에서 더 빠졌다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 플레이 화면 참가자 badge, 로그 avatar 색상/이미지, NPC 대화 로그 이미지, 맵/스토리 참가자 색상 수동 확인이다.
- 2026-07-03: 메인 커맨드의 target/item/spell/related intent/map point/map selection 상태와 공통 초기화·draft 적용·탐색 맵 선택 적용 규칙을 `useMainCommandSelectionFields` 훅으로 분리했다. `PlayPage`는 필드 값을 읽고 submit payload에 연결하는 역할을 유지하고, 장면 변경·명령 context 변경·탐색 요청 draft 반영 시 어떤 선택 필드를 비우거나 채울지의 변경 이유는 새 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 메인 커맨드 helper 전환, 장면 이동 후 선택 초기화, 탐색 맵 토큰/좌표 선택, 인벤토리 아이템 선택, slash command autocomplete 적용 수동 확인이다.
- 2026-07-03: GM VTT map 편집 저장 queue의 ref 상태, session 전환, pending map claim/complete, 저장 실패 fallback, active combat refresh 재시도 흐름을 `useGmVttMapSaveQueue` 훅으로 분리했다. `PlayPage.handleMapChange`는 현재 session id와 next map을 훅에 넘기는 연결만 담당하므로, Human GM map edit 저장 정책과 queue flush 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Human GM으로 VTT 맵 편집 연속 저장, 저장 실패 시 마지막 confirmed map fallback, 전투 중 맵 편집 후 combat refresh, 일반 player view map change 수동 확인이다.
- 2026-07-03: Human GM AI assist 목록 조회, 수동 제안 등록, AI 제안 생성, 승인 상태 반영, 승인 후 scene text/NPC dialogue/node move 적용, 적용 실패 감사 보고를 `useHumanGmAssist` 훅으로 분리했다. `PlayPage`는 GM 메시지 실행과 노드 이동 실행 함수를 훅에 주입하고 panel props를 연결하므로, assist lifecycle/API orchestration 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Human GM AI assist 목록 로딩, 수동 제안 등록, AI 생성, scene text 승인, NPC dialogue 승인, node move 승인, 승인 기록 후 적용 실패 감사 수동 확인이다.
- 2026-07-03: 전투 API 호출 공통 실행 흐름의 busy/error 처리, combat 응답 정규화, 409 충돌 시 combat 재조회 fallback, action result map/log 반영, pending reaction 자동 처리 흐름을 `useCombatRequestRunner` 훅으로 분리했다. `PlayPage`의 개별 전투 버튼 handler는 어떤 API를 호출할지만 남기고, 전투 요청 실행 정책 변경 이유는 새 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 전투 시작, 공격/주문/대시/회피/숨기, 턴 종료, ACTIVE_COMBAT_EXISTS 복구, opportunity/ready/shield/counterspell reaction 처리 수동 확인이다.
- 2026-07-03: 전투 클래스 feature action을 slash command로 변환하는 규칙을 `combatClassFeatureCommand.ts`로 분리했다. `PlayPage.handleCombatClassFeature`는 `second_wind`의 전용 API 호출 예외와 변환된 command 전송만 담당하고, `action_surge`, `rage`, `cunning_action`, `ki`, `bardic_inspiration`, `breath_weapon` 등 command 문자열 변경 이유는 새 순수 util에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 second wind, action surge, rage/frenzy, cunning action, ki, bardic inspiration target 지정, dragonborn breath target 지정 수동 확인이다.
- 2026-07-03: 빠른 캐릭터 생성 submit payload 조립을 `quickCharacterCreatePayload.ts`로 분리했다. `PlayPage.handleCreateCharacter`는 submit 이벤트 처리, 선택 class 존재 확인, 생성 성공 시 모달 닫기만 담당하고, ancestry/class/subclass/avatar/default equipment/default spell/assignToSession payload 계약 변경 이유는 새 builder에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 화면 빠른 캐릭터 생성에서 기본 장비 선택, 기본 주문, subclass preset, session 자동 배정 수동 확인이다.
- 2026-07-03: 세션 경제 action과 캠페인 캘린더 action의 pending/feedback 상태, API 호출, 성공 메시지, player calendar action 예외 권한 정책을 `useSessionSideActions` 훅으로 분리했다. `PlayPage`는 `SessionEconomyPanel`/`SessionCampaignCalendarPanel`에 훅 반환값을 연결만 하므로, 경제·캘린더 side action 실행 정책 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 경제 구매/판매/보상, 캘린더 일정 제안/응답, GM 전용 캘린더 action 권한, 성공/실패 feedback 수동 확인이다.
- 2026-07-03: Human GM 인벤토리 지급의 pending 상태, API 호출, 성공/실패 toast feedback, action log 기록을 `useGmInventoryGrant` 훅으로 분리했다. 기존 인벤토리 사용/장비 변경 toast state는 공유하되, `PlayPage`는 지급 handler와 pending 값을 `ExplorationNodeSurface`에 전달만 하므로 GM 지급 정책 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Human GM 탐색 화면에서 캐릭터 대상 아이템 지급, 중복 클릭 pending disable, 성공/실패 toast 수동 확인이다.
- 2026-07-03: 탐색/전투 인벤토리 아이템 사용과 장비 착용·해제의 pending/toast 상태, `useInventoryItem` API 호출, shield/offhand/equipped 판정, equipment update payload 조립을 `useInventoryItemActions` 훅으로 분리했다. `PlayPage`는 인벤토리 toast 렌더링과 `ExplorationNodeSurface`/`CombatNodeSurface` callback 연결만 유지하므로, 아이템 사용·장비 변경 실행 정책의 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 탐색 아이템 사용, 전투 아이템 사용, 무기 착용/해제, 방패 착용/해제, offhand 무기 해제, 성공/실패 toast 수동 확인이다.
- 2026-07-03: 인벤토리 drop/pickup/throw slash command 문자열 조립을 `inventoryItemCommand.ts`로 분리했다. `PlayPage`의 drop/pickup/throw handler는 busy/session 조건과 `onSendAction` 연결만 담당하고, `/item drop`, `/item pickup`, `/item throw` syntax 변경 이유는 새 util에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 탐색 아이템 드롭, 맵 오브젝트 줍기, 전투 아이템 던지기 command 수동 확인이다.
- 2026-07-03: Human GM 전투 상태 조정과 HP 조정의 API 호출, busy/error 처리, snapshot map 반영, combat 재조회, player fallback `/condition` command 전송을 `useHumanGmCombatAdminActions` 훅으로 분리했다. `PlayPage`는 `CombatNodeSurface`에 condition/HP callback을 연결만 하므로, GM 전투 관리 action 실행 정책 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Human GM 상태 add/remove, HP 조정, 일반 player condition command fallback, map 갱신, combat 재조회, 성공/실패 로그 수동 확인이다.
- 2026-07-03: Human GM 장면 메시지 전송과 노드 이동의 pending/error 처리, `createHumanGmMessage`/`updateHumanGmSessionNode` API 호출, snapshot map 반영, 노드 이동 후 scenario/combat/selection 초기화를 `useHumanGmSceneActions` 훅으로 분리했다. `PlayPage`는 story/exploration surface와 AI assist 훅에 scene action callback을 전달만 하므로, GM 장면 진행 API orchestration 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Human GM 장면 묘사, NPC 대사, private note, 노드 이동, 노드 이동 후 map/scenario 갱신과 combat 초기화 수동 확인이다.
- 2026-07-04: `StoryNodeSurface`의 노드 제목 fallback, phase/view mode 라벨, scene image/text fallback, 휴식 action 라벨, Human GM message placeholder/submit 라벨, 장면 이동 빈 상태 문구, party strip aria/빈 슬롯/RP 말풍선 라벨을 `useStoryNodeSurfacePresentation` 훅으로 분리했다. Story surface 컴포넌트는 상태와 이벤트 연결, 캐릭터/노드 반복 렌더링을 유지하고, story 화면 고정 문구와 paragraph fallback 변경 이유는 새 presentation 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 story node 제목/장면 설명 fallback, 휴식 버튼, Human GM 장면/NPC 전송 placeholder, 장면 이동 빈 상태, party strip 빈 슬롯/RP 말풍선 수동 확인이다.
- 2026-07-04: `StoryNodeSurface`에 남아 있던 미사용 능력치/스킬/인벤토리 표시 helper를 제거하고, party card HP bar 퍼센트 계산을 `useStoryNodeSurfacePresentation.ts`의 `getStoryCharacterHpPercent`로 이동했다. Story surface 컴포넌트는 party card 렌더링과 선택 이벤트만 유지하고, HP bar 표시 계산 변경 이유는 story presentation hook 파일에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 story party card HP bar 비율과 캐릭터 상세 모달 열림 수동 확인이다.
- 2026-07-04: `ExplorationNodeSurface`의 node badge/title fallback, phase/view mode, map panel/selection strip/action dock aria-label, actor/token stat label, map placeholder 문구를 `useExplorationNodeSurfacePresentation` 훅으로 분리했다. Exploration surface 컴포넌트는 map/selection/action 렌더링과 이벤트 연결을 유지하고, 탐색 화면 고정 문구와 phase 표시 정책 변경 이유는 새 presentation 훅에 모인다. GM panel inspector/message/control 문구는 아직 컴포넌트에 남아 있어 다음 presentation 분리 후보로 유지한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 탐색 노드 제목/phase 표시, map placeholder, selection strip, 캐릭터/토큰 stat label 수동 확인이다.
- 2026-07-04: `ExplorationNodeSurface`의 GM panel aria/toggle label, map status metric label, selection inspector/message/control/node move eyebrow, message placeholder/submit label, GM/local map action feedback 문구를 `useExplorationNodeSurfacePresentation` 훅으로 추가 이동했다. Exploration surface는 map mutation, message submit, token move, node move callback 연결을 유지하고, Human GM 탐색 패널과 action dock 피드백 copy 변경 이유는 presentation 훅으로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Human GM 탐색 패널 접기/열기 라벨, 지도 상태 metric, 장면/NPC 전송 placeholder, GM 조작 버튼과 map action feedback, ping/문/오브젝트/토큰 이동 feedback, 장면 이동 빈 상태 수동 확인이다.
- 2026-07-04: `ExplorationNodeSurface`의 action dock 안내문, 휴식 버튼/히트다이스 aria label, 맵 오브젝트 줍기 title/label, 인벤토리 header/toggle/빈 상태, 장비 착용·해제/내려놓기/사용 버튼 title과 label, Human GM 아이템 지급 picker 문구를 `useExplorationNodeSurfacePresentation` 훅으로 추가 이동했다. Exploration surface는 inventory row 분기, 장비/사용/드롭 callback, 지급 picker state만 유지하고, 탐색 action dock과 인벤토리 copy 변경 이유는 presentation 훅으로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 짧은/긴 휴식 버튼, 줍기 버튼 title, 인벤토리 접기/펼치기, 장비 착용/해제/내려놓기/사용 title, 아이템 지급 picker 검색/수량/지급 버튼 수동 확인이다.
- 2026-07-04: `ExplorationNodeSurface`의 탐색 행동 후보 생성 책임을 `explorationActionModel.ts`로 분리했다. action label/icon, local action id, main command intent/playerText, NPC/문/오브젝트/함정 조건별 action 목록 조립이 새 util로 이동했고, surface 컴포넌트는 `getContextActions(mapSelection, isGmView)` 결과를 렌더링하며 클릭 시 local action 또는 main command callback만 연결한다. 이로써 탐색 명령 문구와 action 노출 정책 변경 이유가 JSX/handler 본문에서 빠지고 action model 파일로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 선택 없음/타일/NPC 토큰/문/오브젝트/함정 선택 시 행동 버튼 목록, GM 화면의 조사·잠금 해제 local action, player 화면의 main command 요청 payload 수동 확인이다.
- 2026-07-04: `ExplorationNodeSurface`의 selection strip 표시 모델, GM map summary, GM selection inspector title/tag/detail line projection을 `explorationSelectionPresentation.ts`로 분리했다. Surface 컴포넌트는 `mapSelection`, `node`, `map`을 넘겨 표시 모델만 받아 렌더링하고, 맵 선택 fallback 문구, token/NPC/monster summary, door/object 상태 tag, GM inspector detail 문구 변경 이유는 새 selection presentation util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 선택 없음/타일/문/오브젝트/캐릭터 토큰/NPC/몬스터 선택 시 selection strip target/status/summary, GM 지도 상태 숫자, GM inspector tag/detail 표시 수동 확인이다.
- 2026-07-04: `ExplorationNodeSurface`의 fog rectangle subtraction, movement blocker 조립, token placement collision, tile 목적지 reachability 탐색을 `explorationMapGeometry.ts`로 분리했다. Surface 컴포넌트는 GM fog 공개와 local token move handler에서 계산 결과만 사용하고, 안개 잘라내기와 탐색 이동 경로/충돌 정책 변경 이유는 geometry util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 GM 주변 안개 공개, 전체 안개 공개, 플레이어 토큰 이동 가능/불가 타일 선택, 벽/문/지형 blocker 충돌 수동 확인이다.
- 2026-07-04: `ExplorationNodeSurface`의 인벤토리 item key, quick usable 판정, weapon/armor/shield/equipped 판정, 인벤토리 아이콘 선택, Human GM item catalog 검색 key를 `inventoryItemModel.ts`로 이동하고, 맵 오브젝트 hidden item pickup payload와 선택 grid 좌표 계산을 `explorationMapObjectModel.ts`로 분리했다. Surface 컴포넌트는 inventory row 렌더링과 callback 연결만 유지하고, 아이템 타입/아이콘/검색/pickup payload 변경 이유는 각 모델 util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 탐색 인벤토리 아이콘, quick usable 아이템 사용 버튼, 장비 착용/해제 버튼, 맵 오브젝트 줍기 payload, Human GM 아이템 검색 수동 확인이다.
- 2026-07-04: `ExplorationNodeSurface`의 현재 사용자/선택 토큰 기준 표시 캐릭터 결정, 표시 인벤토리 선택, GM 비캐릭터 토큰 모델, HP/이동 resource meter style, 토큰 grid/type/상태 라벨, 휴식 대상/히트다이스 clamp, 플레이어 조작 토큰 탐색을 `explorationActorStatusModel.ts`로 분리하고, map selection toggle 동등성 판정을 `explorationMapObjectModel.ts`로 이동했다. Surface 컴포넌트는 actor status 모델을 받아 렌더링하고 selection 변경 시 toggle 여부만 적용하므로, 탐색 actor 표시 정책과 selection identity 정책 변경 이유가 JSX 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 플레이어 화면의 내 캐릭터 표시/HP bar/이동 bar, GM 화면의 캐릭터 토큰 선택/비캐릭터 토큰 선택, 같은 맵 요소 재선택 시 선택 해제, 짧은/긴 휴식 대상과 히트다이스 clamp, 플레이어 토큰 이동, 인벤토리 표시/사용 가능 여부 수동 확인이다.
- 2026-07-04: `ExplorationNodeSurface`의 ping 추가, 문 상태 변경, 오브젝트 함정 해제/파괴, 안개 전체/주변 공개, 토큰 숨김 전환, 오브젝트 공개 전환, 로컬 토큰 이동 map patch 조립을 `explorationMapMutation.ts`로 분리했다. Surface 컴포넌트는 local/GM action 분기, API callback 호출, feedback 표시만 유지하고, VTT map 자료구조 변경 규칙은 새 mutation util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 로컬 ping fallback, GM 문 열기/닫기/파괴/잠금 해제, 함정 해제, 오브젝트 파괴/공개 전환, 토큰 숨김 전환, 주변/전체 안개 공개, callback 없는 플레이어 토큰 이동 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`에 중복으로 남아 있던 전투 인벤토리 item key, quick usable 판정, weapon/armor/shield/equipped 판정, 아이콘 선택을 `inventoryItemModel.ts` 공통 util 재사용으로 전환했다. Combat surface에는 전투 전용 weapon range/property, throw 가능 여부, action resource 연결만 남기고, 인벤토리 타입/아이콘/장비 판정 변경 이유는 탐색 화면과 같은 모델 util로 모인다. `inventoryItemModel.ts`에는 공통 이름 `getInventoryItemKey` alias도 추가해 전투/탐색 양쪽에서 재사용 의도를 드러냈다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 전투 인벤토리 아이콘, quick usable 아이템 사용 버튼, 무기/방패 착용·해제, 방어구 disabled 처리, 장착 중 아이템 던지기 차단, 투척 가능 아이템 range 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`에 중복으로 남아 있던 맵 오브젝트 hidden item pickup payload와 선택 grid 좌표 계산을 `explorationMapObjectModel.ts` 공통 util 재사용으로 전환했다. Combat surface는 전투 중 오브젝트 줍기 버튼 노출과 callback 연결만 유지하고, object cell description에서 item 수량을 추출하는 계약과 좌표 clamp 정책 변경 이유는 탐색 화면과 같은 map object 모델 util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 전투 맵 오브젝트 줍기 버튼 노출, hidden item 수량 payload, 선택 좌표 clamp, 줍기 callback 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`의 공격/보조공격/투척/주문/스니크 어택 인접 아군 판정에 쓰이던 grid distance 계산을 `explorationMapGeometry.ts`의 공통 `getGridDistanceFt`로 이동했다. Combat surface는 어떤 상황에서 사거리를 검사할지만 유지하고, VTT map 좌표 clamp와 Chebyshev grid 거리 산출 정책 변경 이유는 탐색 이동 geometry util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 전투 기본 공격 사거리, 보조무기 사거리, 아이템 투척 사거리, 주문 token/point target 사거리, 스니크 어택 인접 아군 판정 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`의 phase label, HP/이동 resource meter fill style, turn card participant color CSS 변수 조립을 `useCombatNodeSurfacePresentation.ts`로 분리했다. Combat surface는 전투 상태와 참가자 데이터를 렌더링에 연결하고, 전투 화면 표시 문구와 CSS 변수 projection 변경 이유는 presentation 훅으로 모인다. 사용되지 않던 scene paragraph 계산도 함께 제거했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 전투 phase 표시, HP/이동 meter fill, 플레이어/NPC/몬스터 turn card 색상 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`의 무기 fallback range, 투척 long range, weapon property set, light melee/offhand 가능성, sneak attack 가능 무기 판정을 `combatInventoryRules.ts`로 분리했다. Combat surface는 전투 상태와 선택 대상에 따른 버튼 활성화만 유지하고, 무기 이름/property 기반 전투 아이템 규칙 변경 이유는 새 combat inventory rules util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 장궁/단궁/재블린/단검 기본 공격 사거리, 보조무기 light melee 판정, finesse/ranged 무기 sneak attack 활성화, 투척 long range 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`의 전투 행동 버튼 아이콘 map, spell action 아이콘 fallback, 몬스터 액션 range/unavailable/summary label projection을 `CombatActionPresentation.tsx`로 분리했다. Combat surface는 행동 가능 여부와 callback 연결을 유지하고, 버튼 아이콘과 몬스터 action badge 문구 변경 이유는 새 presentation 컴포넌트로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 기본/능력/주문 행동 버튼 아이콘, spell 아이콘 fallback, 몬스터 액션 range badge, 재충전/사용 완료 label, save/effect summary badge 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`의 캐릭터 feature/condition 기반 class ability button 목록 생성과 action/bonus action 요구 표시 모델을 `combatClassAbilityButtons.ts`로 분리했다. Combat surface는 능력 버튼 목록을 렌더링하고 `onUseClassFeature` callback에 연결하는 역할만 유지하며, class key 정규화, feature id 매칭, 자원 소모 condition에 따른 disabled 정책 변경 이유는 새 combat class ability 모델 util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 dragonborn breath, rage/frenzy, bardic inspiration, channel divinity, wild shape, second wind/action surge, ki/cunning action, sneak attack 자원 소모 disabled 상태 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`의 주문 필터 option, 주문 targeting 안내 문구, 주문 슬롯 pip 표시 문자열 생성을 `combatSpellPresentation.ts`로 분리했다. Combat surface는 spell filter state와 주문 선택/시전 흐름을 유지하고, 주문 UI copy와 슬롯 표시 포맷 변경 이유는 새 spell presentation util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 주문 필터 전체/소마법/레벨별 전환, 공격/아군/지점 주문 targeting 안내, 1레벨 및 다중 레벨 주문 슬롯 pip 표시 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`의 P3 주문 메타데이터, MVP 주문 id/range/level fallback, rule catalog 주문 메타데이터 map 조립, 캐릭터 보유/준비 주문 기반 전투 주문 action 목록 생성을 `combatSpellModel.ts`로 분리했다. Combat surface는 현재 캐릭터와 rule catalog를 모델 util에 넘겨 주문 버튼을 렌더링하고, 주문 목록 노출 정책과 catalog fallback 계약 변경 이유는 spell model util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 준비 주문 직업의 prepared spell 노출, 소마법/습득 주문 노출, rule catalog executable 주문 추가 노출, 주문 사거리/레벨 fallback, P3 주문 targeting 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`의 주문 action 필터링과 주문 슬롯 표시/선택 후보 계산을 `combatSpellModel.ts`로 추가 이동했다. Combat surface는 spell filter state, 선택된 slot level state, 버튼 클릭 연결만 유지하고, 레벨별 주문 필터 매칭, 표시 가능한 spell slot 정렬, upcast 가능한 슬롯 후보와 기본 선택 슬롯 결정, 남은 슬롯 clamp 정책 변경 이유는 spell model util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 주문 필터별 목록, spell slot rail 정렬, upcast select 기본값/변경값, 슬롯 0개일 때 주문 버튼 disabled, 1레벨 fallback 슬롯 표시 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`의 주문 버튼 action/bonus/reaction 비용 판정과 주문 버튼 disabled 정책을 `combatSpellModel.ts`로, 주문 버튼 title 문구 생성을 `combatSpellPresentation.ts`로 분리했다. Combat surface는 주문 버튼에 필요한 현재 resource 상태와 targeting 상태를 넘겨 결과만 렌더링하고, bonus action 주문 목록, reaction 주문 차단 정책, 슬롯 부족/targeting 안내 문구 변경 이유는 model/presentation 유틸로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Healing Word/Misty Step bonus action 소모 조건, Shield/Feather Fall/Counterspell 버튼 disabled와 반응 안내 문구, 슬롯 부족 title, targeting 중 title 수동 확인이다.
- 2026-07-04: `CombatNodeSurface`의 legacy 주문 target kind(token/point/self) 분류, legacy token 주문의 아군/적/양쪽/쓰러진 대상 허용 판정을 `combatSpellModel.ts`로 분리했다. Combat surface는 map selection에서 token/point를 읽고 range check와 `onCastSpell` 호출만 수행하며, 주문 id별 대상 성향 변경 이유는 spell model util로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 공격 주문의 적 대상 제한, 회복/buff 주문의 아군 대상 제한, Dispel Magic 양쪽 대상 허용, Revivify 쓰러진 아군 허용, Light/Fireball/Sleep 같은 point 주문 수동 확인이다.
- 2026-07-03: 세션 VTT token 이동, ping 생성, map interaction 실행의 API 호출, client map version 주입, actor session character fallback, optimistic token move rollback, map error 표시를 `useSessionVttMapRequests` 훅으로 분리했다. `PlayPage`는 `SessionBattleMap`/탐색·전투 surface에 반환된 callback을 연결만 하므로, 세션 맵 요청 실행 정책 변경 이유가 페이지 본문에서 빠진다. 전투 token 이동은 reaction prompt 처리와 더 강하게 결합되어 있어 다음 단계에서 별도 전투 이동 hook 후보로 남겼다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 플레이어 VTT token 이동 optimistic 반영/실패 rollback, ping 생성, 문/오브젝트 map interaction, client map version 충돌 메시지 수동 확인이다.
- 2026-07-03: 전투 VTT token 이동의 combat participant 매칭, `moveCombatParticipant` API 호출, optimistic token move 반영/rollback, ready action pending 예외 처리, reaction prompt 자동 처리, combat/map/log 반영을 `useCombatTokenMoveRequest` 훅으로 분리했다. `PlayPage`는 전투 map surface에 callback을 전달만 하므로, 전투 토큰 drag/drop 이동 실행 정책 변경 이유가 페이지 본문에서 빠진다. 전역 reaction event 처리와 강제 이동 흐름은 아직 `PlayPage`에 남아 있어 후속 분리 후보로 기록한다. 공통 optimistic move pending 타입은 `vttMapState.ts`로 이동했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 전투 토큰 이동, 참여자 매칭 실패 메시지, 이동 실패 rollback, opportunity/ready reaction prompt, ready action pending 상태의 map/log 반영 수동 확인이다.
- 2026-07-03: `trpg:combat-reaction-prompt` window event 구독과 현재 combat snapshot의 pending reaction 자동 감지/claim/submit/apply 흐름을 `useCombatReactionAutoHandler` 훅으로 분리했다. `PlayPage`는 reaction decision submitter와 결과 적용 callback만 주입하므로, reaction prompt lifecycle 변경 이유가 페이지 effect 본문에서 빠진다. 강제 이동 action 자체는 아직 `PlayPage`에 남아 있어 후속 분리 후보로 유지한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 opportunity attack/shield/ready action/counterspell event prompt, combat snapshot pending reaction 자동 표시, 중복 claim 방지, 수락/거절 후 combat/map/log 반영 수동 확인이다.
- 2026-07-03: 전투 강제 이동의 `forceMoveCombatParticipant` API 호출, busy/error 처리, combat/map/log 반영, 후속 reaction prompt 처리와 reaction 결과 적용을 `useCombatForceMoveRequest` 훅으로 분리했다. `PlayPage`는 `CombatNodeSurface`에 강제 이동 callback을 전달만 하므로, 강제 이동 실행 정책 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 push/pull/slide 강제 이동, 강제 이동 실패 메시지, 강제 이동 후 opportunity/ready reaction prompt, reaction 수락/거절 후 combat/map/log 반영 수동 확인이다.
- 2026-07-03: 기본 전투 액션 handler 묶음의 무기 공격, offhand 공격, sneak attack, 몬스터 액션, dash/dodge/hide, ready command, class feature command/second wind, 주문 시전, 턴 종료, 전투 종료 실행을 `useCombatActionHandlers` 훅으로 분리했다. `PlayPage`는 `CombatNodeSurface`에 callback을 전달하고 `useCombatRequestRunner`를 주입하는 조립 역할만 유지하므로, 전투 액션 API endpoint 변경과 map 결과 반영 예외 처리의 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 주무기/보조무기/sneak attack, 몬스터 공격·dash·dodge·hide, 플레이어 dash/dodge/hide, ready action command, second wind/class feature command, 전투 주문 시전, 턴 종료, 전투 종료 수동 확인이다.
- 2026-07-03: `PlayPage` 초기 렌더 시 class feature manifest와 FE spell pool을 병렬 로딩하고 실패 시 빈 manifest/null spell pool로 fallback하는 정적 SRD 데이터 로딩 effect를 `useStaticSrdPlayData` 훅으로 분리했다. `PlayPage`는 빠른 캐릭터 생성과 feature 요약에 필요한 값만 읽고, 정적 SRD asset 로딩 방식과 실패 fallback 변경 이유는 새 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 화면 빠른 캐릭터 생성의 spell 기본값, wanted card feature 요약, 정적 SRD 로딩 실패 시 화면 유지 수동 확인이다.
- 2026-07-03: rule catalog, Human GM node move option, Human GM item catalog 로딩과 실패 fallback/pending/error 상태를 `usePlaySupportCatalogs` 훅으로 분리했다. `PlayPage`는 story/exploration/combat surface에 반환된 catalog 값을 전달만 하므로, 보조 catalog API endpoint 변경과 GM 전용 catalog 로딩 조건 변경 이유가 페이지 effect 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 전투 주문 목록의 rule catalog 반영, Human GM 노드 이동 옵션 갱신, Human GM 아이템 지급 catalog 로딩/실패 메시지 수동 확인이다.
- 2026-07-03: 세션 전환/없음 상태에서 player scenario와 VTT map 상태를 reset하고, `getPlayerScenario`/`getVttMap` 로딩, snapshot VTT map 반영, map save queue session 전환, scenario/map load error fallback을 `usePlayScenarioMapLoader` 훅으로 분리했다. `PlayPage`는 `playerScenario`, `vttMap`, error setter와 map 적용 callback을 주입하는 조립 역할만 유지하므로, 플레이 화면 시나리오·맵 로딩 정책 변경 이유가 페이지 effect 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 세션 입장/이탈, 노드 이동 후 scenario 재조회, snapshot map 반영, VTT map 초기 로드, 맵 로딩 실패 메시지, 세션 전환 시 map save queue 초기화 수동 확인이다.
- 2026-07-03: 공개 단서 추가 감지, Info 탭 unread 상태, Main/Chat 로그 unread count, 단서 toast 자동 닫기 timer를 `usePlayUnreadNotifications` 훅으로 분리했다. `PlayPage`는 탭 badge와 toast 렌더링에 필요한 값만 읽고, public clue/log id 추적 ref와 unread 증가/초기화 정책 변경 이유는 새 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 새 공개 단서 추가 시 Info unread/toast 표시, Info 탭 진입 시 unread 해제, Main/Chat 새 로그 badge 증가와 탭 진입 시 초기화 수동 확인이다.
- 2026-07-04: 공개 단서 toast 제목 문구를 `usePlayUnreadNotifications` 훅 반환 모델로 이동했다. `PlayPage`는 toast 영역 표시와 clue title/text 렌더링만 유지하고, 새 단서 알림 문구 변경 이유는 unread notification 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 새 공개 단서 추가 시 toast 제목/본문 표시와 자동 닫힘 수동 확인이다.
- 2026-07-03: 모집 화면의 joinable character 모델 생성, wanted carousel 후보/현재 캐릭터 계산, 준비 상태 해제 시 상태 패널 펼침, carousel index 보정, 선택 캐릭터 index 동기화, carousel step 이동을 `useRecruitingCarouselState` 훅으로 분리했다. `PlayPage`는 캐릭터 선택/해제 submit과 렌더링만 유지하므로, 모집 캐러셀 UX 정책 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 화면 캐릭터 캐러셀 이동, 캐릭터 선택/해제 후 현재 카드 동기화, 준비 상태 해제 시 상태 패널 재표시, 레벨 제한 캐릭터 비활성화 수동 확인이다.
- 2026-07-03: 빠른 캐릭터 생성 form state, race/class 선택 fallback, catalog 준비 여부, catalog 변경 시 ancestry/class key 보정, form reset을 `useQuickCreateFormState` 훅으로 분리했다. `PlayPage`는 파생 전투 수치와 submit payload 조립만 유지하므로, quick create form 기본값과 catalog fallback 정책 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 빠른 생성 모달 열기/닫기 시 기본값 reset, race/class catalog 로딩 후 기본 선택 보정, race/class select 변경, 생성 payload 유지 수동 확인이다.
- 2026-07-03: 모집 화면의 서버 선택 캐릭터 동기화, 로컬 optimistic 선택 상태, 선택/해제 submit guard를 `useRecruitingCarouselState` 훅으로 통합했다. `PlayPage`는 서버 선택 id와 선택 callback을 훅에 주입하고 렌더 callback만 연결하므로, 모집 캐릭터 선택 UX의 변경 이유가 페이지 state/effect/handler에 흩어지지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 화면에서 캐릭터 선택, 선택 해제, 서버 스냅샷 선택값 재동기화, 준비 잠금/요청 중 선택 방지 수동 확인이다.
- 2026-07-03: 휴식 승인 요청의 pending 표시 모델, GM 승인/거절, 플레이어 취소, 처리 완료 id 숨김 정책을 `useRestApprovalActions` 훅으로 분리했다. `PlayPage`는 휴식 승인 배너와 로그 inline action 렌더링만 담당하므로, 휴식 승인 UX와 요청 처리 후 표시 정책 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 GM의 휴식 승인/거절, 플레이어 휴식 요청 취소, 처리된 요청 배너/로그 버튼 숨김, 만료된 요청 미표시 수동 확인이다.
- 2026-07-03: 모집 화면에서 세션 시작 클릭 후 로딩 오버레이 표시, recruiting 상태 변화 감지, 시작 전환 완료 후 오버레이 해제 타이밍을 `useSessionStartTransition` 훅으로 분리했다. `PlayPage`는 시작 버튼에서 훅의 handler를 호출하고 overlay 표시값만 읽으므로, 세션 시작 전환 UX 변경 이유가 페이지 effect/state에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 호스트/GM 게임 시작 클릭 시 로딩 오버레이 표시, 세션 상태가 recruiting에서 벗어난 뒤 오버레이 해제, recruiting 상태로 되돌아올 때 오버레이 초기화 수동 확인이다.
- 2026-07-03: Info 탭 시나리오 설명 textarea의 임시 편집 텍스트, 기본 설명 fallback, 내용 높이 자동 보정 effect를 `useScenarioDescriptionEditor` 훅으로 분리했다. `PlayPage`는 textarea ref/value/onChange만 연결하므로, 정보 탭 설명 편집 표시 정책 변경 이유가 페이지 UI state/effect에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Info 탭 시나리오 설명 기본 표시, 설명 편집 입력, 탭 전환 후 textarea 높이 자동 보정 수동 확인이다.
- 2026-07-04: 세션 사이드바의 폭 상태, 접힘 상태, pointer resize 시작 handler, 접힘 toggle을 `useSessionSidebarLayout` 훅으로 분리했다. 기존 resize pointer 계산은 `sidebarResize.ts` 유틸에 유지하고, `PlayPage`는 CSS 변수와 button/resizer 이벤트만 연결하므로 사이드바 레이아웃 조작 정책 변경 이유가 페이지 state/handler에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 플레이 화면 우측 사이드바 드래그 resize, 접기/펼치기 버튼, 좁은/넓은 viewport에서 최대 폭 제한 수동 확인이다.
- 2026-07-04: 세션 영구 퇴장 확인창의 열림 상태, 요청/취소/확정 handler를 `useSessionLeaveConfirmation` 훅으로 분리했다. `PlayPage`는 Settings와 모집 overlay의 퇴장 버튼 및 확인창 렌더링만 연결하므로, 브라우저 confirm 대체 UI와 실제 퇴장 callback 실행 정책 변경 이유가 페이지 상단 state/handler에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Settings와 모집 overlay에서 세션 영구 퇴장 확인창 열기, 취소, 확정 시 `onLeaveSession` 실행 수동 확인이다.
- 2026-07-04: Chat 탭 입력값, 빈 메시지 무시, `CHAT:` action dispatch, 전송 후 입력 초기화를 `useSessionChatInput` 훅으로 분리했다. `PlayPage`는 공용 하단 입력창에서 Main/Chat 탭에 따라 value/onChange/onSubmit을 연결만 하므로, 채팅 입력 제출 정책 변경 이유가 페이지 본문 handler에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Chat 탭 메시지 입력/전송, 공백 메시지 무시, 전송 후 입력 초기화, Main 탭 입력과의 분리 수동 확인이다.
- 2026-07-04: 인벤토리 사용/장비 변경/GM 지급 toast feedback의 자동 닫힘 timer를 `useInventoryItemActions` 훅으로 이동했다. `PlayPage`는 toast 메시지 렌더링과 GM 지급 훅에 feedback setter를 전달하는 조립만 유지하므로, 인벤토리 feedback lifecycle 변경 이유가 페이지 effect에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 아이템 사용, 장비 착용/해제, Human GM 아이템 지급 후 toast 표시와 2.6초 뒤 자동 닫힘 수동 확인이다.
- 2026-07-04: 세션 사이드바 탭 목록, 현재 탭 상태, 세션 상태별 available tab 선택, 현재 탭이 available tab에서 빠졌을 때 첫 탭으로 보정하는 effect를 `useSessionTabs` 훅으로 분리했다. `PlayPage`는 탭 label, badge, panel 렌더링과 탭 전환 호출만 유지하므로, 모집/시작 상태별 탭 정책 변경 이유가 페이지 state/effect에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집/플레이 상태 전환 시 Main/Chat/Info/Settings 탭 표시, 탭 클릭 전환, 현재 탭 보정, unread badge 유지 수동 확인이다.
- 2026-07-04: 세션 로그 렌더 목록의 마지막 로그 id 추적, 로그 끝 sentinel ref, active tab/log 변경 시 자동 스크롤 effect를 `useSessionLogAutoScroll` 훅으로 분리했다. `PlayPage`는 렌더된 로그 rows를 훅에 넘기고 sentinel div에 ref만 연결하므로, 로그 스크롤 표시 정책 변경 이유가 페이지 effect/ref에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Main/Chat 탭에서 새 로그 추가 시 하단 자동 스크롤, 탭 전환 후 로그 위치 보정 수동 확인이다.
- 2026-07-04: 메인 커맨드 자동완성의 목록 길이/슬래시 토큰 변경 시 active index 보정, 목록 DOM ref, active option 변경 시 `scrollIntoView({ block: 'nearest' })` 표시 effect를 `useMainCommandAutocompleteState` 훅으로 분리했다. `PlayPage`는 autocomplete model 계산과 렌더링을 유지하되 index setter와 ref를 훅에 연결하므로, 자동완성 index lifecycle과 active item 스크롤 정책 변경 이유가 페이지 effect/ref에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Main 탭 slash command 자동완성에서 키보드 이동/마우스 hover, 후보 수 변경, 새 slash token 입력 시 active option 보정과 스크롤 수동 확인이다.
- 2026-07-04: 빠른 캐릭터 생성 form submit 이벤트 처리, 선택 class 누락 guard, quick create payload 조립 호출, `onCreateCharacter` 실행, 성공 시 모달 닫기 callback 호출을 `useQuickCreateCharacterSubmit` 훅으로 분리했다. `PlayPage`는 빠른 생성 파생값과 catalog를 훅에 전달하고 modal form의 `onSubmit`만 연결하므로, 빠른 생성 submit orchestration 변경 이유가 페이지 handler에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 빠른 생성 모달에서 Save submit, class catalog 미준비 시 submit 방지, 생성 성공 후 모달 닫힘, 생성 실패 시 모달 유지 수동 확인이다.
- 2026-07-04: 메인 커맨드 target 선택값이 현재 visible target option에 없을 때 선택을 비우는 보정 effect를 `useMainCommandTargetReconciliation`으로 분리하고 `useMainCommandSelectionFields.ts`에 배치했다. `PlayPage`는 visible target option을 계산해 훅에 전달만 하므로, 선택 필드 유효성 보정 정책 변경 이유가 페이지 effect에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 장면/명령 context 변경으로 대상 목록이 바뀔 때 이전 target 선택이 자동 해제되는지 수동 확인이다.
- 2026-07-04: Main/Chat 탭별 로그 scope 필터링과 `buildRenderedSessionLogRows` 호출을 `useSessionRenderedLogs` 훅으로 분리했다. `PlayPage`는 로그 렌더링에 사용할 rows만 받아 map으로 출력하므로, 로그 scope 정책과 row presentation model 조립 변경 이유가 페이지 `useMemo`에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Main 탭에는 MAIN/action 로그만, Chat 탭에는 CHAT/action 로그만 표시되고 날짜 구분/발신자/톤 표시가 유지되는지 수동 확인이다.
- 2026-07-04: 메인 커맨드 form submit과 탐험 surface의 main command 요청 조율을 `useMainCommandSubmitHandlers` 훅으로 분리했다. `PlayPage`는 현재 입력/선택 상태와 callback을 훅에 전달하고, slash command 해석, AI GM submit payload 조립, RP action fallback, 즉시 실행 탐험 명령과 draft 전환 정책은 새 훅이 담당하므로, 메인 커맨드 제출 정책 변경 이유가 페이지 handler 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 AI GM `/대화`/`/조사` submit, 알 수 없는 slash 오류, RP action 전송, 탐험 surface 즉시 명령 전송, 아이템 활용처럼 draft로 전환되는 명령 수동 확인이다.
- 2026-07-04: 메인 커맨드 판정 요청의 resolve handler를 `useMainCommandCheckResolver` 훅으로 분리했다. `PlayPage`는 pending check 상태와 actor 후보, API callback만 전달하고, `ResolveMainCommandCheckDto` payload 조립, actor id fallback, `IMPOSSIBLE` 응답 오류 표시, 성공 시 pending check 해제 정책은 새 훅이 담당하므로, check resolve API 계약 변경 이유가 페이지 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 메인 커맨드 판정 요청에서 성공/실패 outcome 선택, `IMPOSSIBLE` 오류 표시, 성공 후 pending check 카드 해제 수동 확인이다.
- 2026-07-04: 탐험/전투 맵에서 인벤토리 drop, map object pickup, throw command를 전송하는 guard와 `onSendAction` orchestration을 `useInventoryMapCommandHandlers` 훅으로 분리했다. command 문자열 조립은 기존 `inventoryItemCommand.ts`가 계속 담당하고, `PlayPage`는 surface callback 연결만 유지하므로, 맵 인벤토리 command 실행 가능 조건과 전송 정책 변경 이유가 페이지 handler 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 탐험 아이템 드롭, 맵 오브젝트 줍기, 전투 아이템 던지기, busy/pending 상태에서 중복 전송 방지 수동 확인이다.
- 2026-07-04: 메인 커맨드 autocomplete 적용과 사이드바 입력 키보드 처리 흐름을 `useMainCommandAutocompleteActions` 훅으로 분리했다. 기존 index 보정/스크롤 훅과 함께 autocomplete UX 변경 이유가 hooks 영역에 모이고, `PlayPage`는 autocomplete model을 계산해 훅에 전달한 뒤 반환된 apply/keyDown handler를 버튼과 input에 연결만 한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 `/` 입력 후 방향키/Home/End 이동, Tab/Enter 적용, guide 닫힘, helper group 유지/변경 수동 확인이다.
- 2026-07-04: 장면 변경/탐험 컨텍스트 변경 시 메인 커맨드 선택 필드를 초기화하고 pending exploration draft를 입력 폼으로 복원하는 effect 묶음을 `useMainCommandDraftLifecycle` 훅으로 분리했다. `PlayPage`는 현재 node id, 선택 intent, pending draft와 selection field 조작 함수를 전달하고, draft message/target/item/map point 복원 및 오류 초기화 정책은 새 훅이 담당하므로, 메인 커맨드 입력 lifecycle 변경 이유가 페이지 effect 본문에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 장면 이동 후 선택 필드 초기화, 탐험/비탐험 컨텍스트 전환 시 field reset, 아이템 활용 등 draft 전환 후 slash 입력/대상/아이템/좌표 복원 수동 확인이다.
- 2026-07-04: 빠른 캐릭터 생성 모달의 open/close 상태와 form reset 정책을 `useQuickCreateModalLifecycle` 훅으로 분리했다. `PlayPage`는 모달 표시 여부와 open/close callback만 받아 렌더링과 submit 성공 callback에 연결하고, 모달을 열 때/닫을 때 빠른 생성 form을 초기화하는 lifecycle 변경 이유는 characters feature 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 빠른 생성 모달 열기/닫기 시 form reset, 캐릭터 생성 성공 후 모달 닫힘과 form reset, 모집 화면의 캐릭터 생성 버튼 이동 동작 수동 확인이다.
- 2026-07-04: 모집 화면과 시작 가능 여부에서 쓰는 시나리오 권장 레벨 범위, 레벨 라벨, 캐릭터 레벨 허용 판정을 `useScenarioLevelPolicy` 훅으로 분리했다. `PlayPage`는 active scenario의 시작/권장 종료 레벨만 전달하고, 레벨 범위 clamp와 표시 라벨/허용 함수 생성 정책은 새 훅이 담당하므로, 모집 레벨 제한 정책 변경 이유가 페이지 계산식에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 화면 권장 레벨 라벨, 레벨 제한 캐릭터 비활성화, 선택 캐릭터 레벨 불일치 안내, 세션 시작 가능 여부 수동 확인이다.
- 2026-07-04: 빠른 캐릭터 생성의 능력치 base/race bonus/ASI, 기본 proficiency skill, feature token, proficiency bonus, HP/AC/speed, avatar preset 조립을 `useQuickCreateDerivedStats` 훅으로 분리했다. 기존 순수 유틸 호출 순서는 유지하고, `PlayPage`는 active scenario level과 선택된 race/class/form class key만 넘겨 submit payload와 모달 status chip에 필요한 파생값을 받아 쓰므로, 빠른 생성 파생 스탯 정책 변경 이유가 페이지 계산 블록에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 빠른 생성 모달의 LV/HP/AC/이동 표시, race/class 변경 시 능력치·feature·avatar preset 반영, 생성 payload의 능력치/숙련/feature 유지 수동 확인이다.
- 2026-07-04: 모집 wanted card의 능력치 요약과 주요 feature chip 요약을 `useRecruitingCharacterSummary` 훅으로 분리했다. `PlayPage`는 현재 carousel character와 class feature manifest만 전달하고, ability label/value projection과 feature display info summarization은 새 훅이 담당하므로, 모집 카드 표시 요약 정책 변경 이유가 페이지 `useMemo`에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 화면 carousel 캐릭터 전환 시 능력치 요약과 feature chip/tooltip, 캐릭터 없음 fallback 문구 수동 확인이다.
- 2026-07-04: 모집 화면 participant slot padding과 player participant id projection을 `useRecruitingParticipantPresentation` 훅으로 분리했다. `PlayPage`는 participants만 넘겨 displayed slots와 player id 목록을 받고, 빈 슬롯 보정과 GM 제외 player id 추출 정책은 새 훅이 담당하므로, 모집 slot 표시와 프로필 색상 fallback에 쓰이는 participant projection 변경 이유가 페이지 `useMemo`에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 화면 참가자 슬롯 4칸 보정, GM 제외 player 색상 순서, 참가자 입장/퇴장 시 slot/profile 표시 수동 확인이다.
- 2026-07-04: story 화면 RP 말풍선에 전달할 최근 MAIN 발화 projection을 `useStoryRpUtterances` 훅으로 분리했다. 기존 `storyRpPresentation.ts`의 freshness/window, system log 제외, participant-character 매핑, scope prefix 제거 규칙은 유지하고, `PlayPage`는 logs/participants/sessionCharacters만 넘겨 말풍선 모델을 받으므로 story RP 표시 정책 변경 이유가 페이지 `useMemo`에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 story 노드에서 MAIN RP 발화 직후 말풍선 표시, 5초 이후 사라짐, system/turn/main-command 로그 제외 수동 확인이다.
- 2026-07-04: 모집 선택 캐릭터와 세션 캐릭터 매칭, 선택 캐릭터 레벨 허용 여부, 인벤토리 fallback projection을 `useSelectedPlayCharacter` 훅으로 분리했다. `PlayPage`는 selected character id와 캐릭터 목록, 레벨 허용 함수를 전달하고, persistent character lookup, session character lookup, inventory source fallback은 새 훅이 담당하므로, 선택 캐릭터 기반 표시/액션 입력 변경 이유가 페이지 lookup 계산에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 캐릭터 선택/해제, 레벨 제한 ready 비활성화, 탐험/전투 inventory 표시와 아이템 선택 fallback 수동 확인이다.
- 2026-07-04: 세션 GM mode/host/status 기반 권한 projection을 `useSessionPermissionProjection` 훅으로 분리했다. `PlayPage`는 session과 user id만 전달하고, Human GM session 여부, GM user id, host/GM 사용자 판정, recruiting/completed 상태, Human GM view 가능 여부, started session 관리 권한, campaign calendar 표시 가능 여부, 공통 control 권한은 새 훅이 담당하므로, 세션 권한 계산 변경 이유가 페이지 boolean 선언과 반복 ternary에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 AI GM/Human GM 세션에서 host/GM 권한별 시작 버튼, Human GM view, 경제/캘린더 패널, 참가자 GM 표시 수동 확인이다.
- 2026-07-04: 모집 화면 ready 상태 projection을 `useRecruitingReadinessProjection` 훅으로 분리했다. `PlayPage`는 participants, 내 participant, session 존재 여부, recruiting/GM/control 권한, session characters, 레벨 허용 함수를 전달하고, player participant 필터링, ready lock, ready count, all-ready 판정, 캐릭터 선택 영역 표시 여부, 세션 시작 가능 여부는 새 훅이 담당하므로, 모집 readiness 정책 변경 이유가 페이지 count/boolean 계산에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 화면 ready 배지 count, 모든 플레이어 ready 시 시작 overlay, 레벨 불일치 캐릭터가 있을 때 시작 비활성화, GM/player별 캐릭터 선택 영역 표시 수동 확인이다.
- 2026-07-04: 현재 scenario node의 화면 모드 projection을 `usePlayNodeModeProjection` 훅으로 분리했다. `PlayPage`는 current node, combat, session id, 모집 상태, state flags만 전달하고, 완료된 combat node를 exploration 화면/명령 context로 취급하는 예외, story/exploration/combat node 판정, node 전용 party strip 표시 여부, main command screen type 판정은 새 훅이 담당하므로, 노드 모드 정책 변경 이유가 페이지 boolean 계산 블록에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 story/exploration/combat 노드 렌더링, 완료된 combat node의 exploration fallback, 전투 노드 진입 시 combat 로딩/자동 시작, node별 party strip 표시 수동 확인이다.
- 2026-07-04: 현재 scenario node에서 파생되는 scene 설명 fallback, Human GM assist 최근 로그 snippet, 공개 단서 id signature를 `useCurrentNodeContextProjection` 훅으로 분리했다. `PlayPage`는 current node와 logs만 전달하고, Info 탭 설명 fallback 문구, AI assist context snippet 생성, 공개 단서 변경 감지 signature 조립은 새 훅이 담당하므로, current node 보조 표시/context 정책 변경 이유가 페이지 `useMemo`와 문자열 fallback에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Info 탭 장면 설명 fallback, Human GM AI assist 최근 로그 context, 공개 단서 추가 시 unread/toast 갱신 수동 확인이다.
- 2026-07-04: Main 탭 커맨드 UI의 preset/category/slash parsing/helper option/field visibility/visible target/선택 item/related intent 표시 모델 조립을 `useMainCommandPresentationModel` 훅으로 분리했다. `PlayPage`는 현재 screen type, 입력값, 선택된 helper/category/target/item id, visible targets, 인벤토리만 전달하고, 명령어 가이드/자동완성/필드 노출/선택 객체 projection은 새 훅이 담당하므로, main command 표시 정책 변경 이유가 페이지 계산 블록에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Main 탭 GM 요청/RP 행동 전환, 명령어 가이드, slash 자동완성, helper 버튼, target/item/spell/related intent/map point 필드 노출 수동 확인이다.
- 2026-07-04: 탐험 Main command 선택 row의 맵 선택 라벨과 아이템 선택 라벨 projection을 `useExplorationSelectionLabels` 훅으로 분리했다. 기존 `playPagePresentation.ts`의 순수 라벨 규칙은 유지하고, `PlayPage`는 선택된 map selection, visible targets, 선택 item만 전달해 표시 문자열을 받으므로, 탐험 선택 chip 문구와 NPC token fallback 정책 변경 이유가 페이지 `useMemo`에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 탐험 Main 탭의 맵 선택 chip, 아이템 선택 chip, NPC token/object/door/wall/terrain 선택 라벨 수동 확인이다.
- 2026-07-04: Main/Chat 로그 thread row의 avatar style, profile image, dragon profile class 여부, fallback avatar label, 휴식 승인 inline action 가능 여부를 `useSessionLogThreadRows` 훅으로 분리했다. `PlayPage`는 `useSessionRenderedLogs` 결과와 profile lookup 함수, GM 여부, 휴식 요청 해결 판정 함수만 전달하고, 로그 row별 표시 보조값과 rest approval action id projection은 새 훅이 담당하므로, 로그 렌더링 중 profile/rest action 정책 변경 이유가 JSX map 내부 계산에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Main/Chat 로그 avatar 색상/이미지, NPC/GM 프로필 표시, 휴식 승인/거절 inline 버튼 노출과 처리 후 숨김 수동 확인이다.
- 2026-07-04: 모집/플레이 participant 카드의 badge, linked character, GM 여부, GM 지정 가능 여부, ready/status 라벨, 캐릭터 이미지, fallback initial, 캐릭터 설명, profile style projection을 `useParticipantCardPresentation` 훅으로 분리했다. `PlayPage`는 participant와 profile lookup 함수, Human GM/host/recruiting 상태만 전달하고, participant 카드 표시 모델은 새 훅이 담당하므로, 참가자 카드 UI 정책과 Human GM 지정 권한 변경 이유가 JSX map 내부 계산에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 참가자 슬롯의 GM 진행자/준비 상태/GM 지정 버튼, 플레이 중 participant strip의 캐릭터 이미지/이름/상태 표시 수동 확인이다.
- 2026-07-04: 현재 사용자 participant lookup, 서버 선택 캐릭터 id, VTT actor session character fallback, Main command/check resolve actor source projection을 `useCurrentUserParticipantProjection` 훅으로 분리했다. `PlayPage`는 participants와 user id만 전달하고, 현재 사용자 participant 탐색과 sessionCharacterId/characterId fallback 정책은 새 훅이 담당하므로, 세션 참가자 식별 정책 변경 이유가 페이지 상단 lookup과 command/VTT payload 조립 지점에 흩어지지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 ready 토글, 캐릭터 선택 동기화, 탐험/전투 VTT token 이동 actor 식별, Main command submit/check resolve actor fallback 수동 확인이다.
- 2026-07-04: active session scenario 선택, scenario title/description, 권장 레벨 입력값, 빠른 캐릭터 생성 level/scenario id projection을 `useActiveSessionScenarioProjection` 훅으로 분리했다. `PlayPage`는 sessionScenarios만 전달하고, ACTIVE scenario 우선 선택과 첫 scenario fallback, 빠른 생성 기본 level/id fallback은 새 훅이 담당하므로, 시나리오 선택/표시/빠른 생성 정책 변경 이유가 페이지 상단 find와 quick create 계산에 흩어지지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 active scenario title/Info 설명, 권장 레벨 라벨, 빠른 캐릭터 생성 LV/scenario id, active scenario가 없을 때 첫 scenario fallback 수동 확인이다.
- 2026-07-04: session state flags에서 economy, campaignCalendar, snapshot VTT map, party defeat 여부를 꺼내는 raw flags 해석을 `useSessionStateFlagsProjection` 훅으로 분리했다. `PlayPage`는 `snapshot.state.flags`만 전달하고, object flag 방어와 partyDefeated boolean 판정은 새 훅이 담당하므로, 경제/캘린더 패널과 VTT map loader, game over 메시지에 쓰이는 flags shape 변경 이유가 페이지 본문 조건식에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 경제 패널/캠페인 캘린더 패널 표시, snapshot VTT map 초기 반영, party defeat 완료 메시지 수동 확인이다.
- 2026-07-04: 세션 화면 root/stage/canvas className과 CSS variable layout style 조립을 `useSessionLayoutPresentation` 훅으로 분리했다. `PlayPage`는 sidebar width/collapsed 상태, recruiting 여부, node surface 활성 여부, 배경 asset URL만 전달하고, sidebar width CSS 변수와 모집 배경/슬롯/종이 asset 변수, recruiting/started/sidebar class 조합은 새 훅이 담당하므로, 레이아웃 표시 정책 변경 이유가 JSX 직전 style/class 조립에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집/플레이 화면 전환, 사이드바 접힘/펼침, node surface 활성 시 stage class, 모집 배경/슬롯 이미지 표시 수동 확인이다.
- 2026-07-04: 세션 완료 화면의 eyebrow/title/description projection을 `useSessionCompletionPresentation` 훅으로 분리하고, sidebar resize aria-label을 `useSessionLayoutPresentation` 훅으로 이동했다. `PlayPage`는 완료 여부에 따라 placeholder를 렌더링하고 resizer handler만 연결하며, party defeat 여부에 따른 완료 문구와 layout 보조 라벨 변경 이유는 presentation hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 일반 완료/party defeat 완료 화면 문구, sidebar resize separator aria-label 수동 확인이다.
- 2026-07-04: started session surface에서 node surface와 VTT map이 모두 없을 때 표시하는 fallback title을 `useSessionLayoutPresentation` 훅으로 이동했다. `PlayPage`는 어떤 surface를 렌더링할지만 결정하고, 빈 surface placeholder 문구 변경 이유는 layout presentation 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 node surface/VTT map이 없는 started session에서 fallback title 표시 수동 확인이다.
- 2026-07-04: 모집 wanted 카드의 header title, portrait image/alt/class, 캐릭터 이름 fallback, ancestry/class label, LV/HP/AC/SPD stat fallback, 레벨 제한/권장 레벨 안내 문구를 `useRecruitingWantedCardPresentation` 훅으로 분리했다. `PlayPage`는 carousel character, empty slot image, active scenario 여부, 권장 레벨 라벨만 전달하고, wanted 카드 표시 모델은 새 훅이 담당하므로, 모집 카드 표시 정책 변경 이유가 JSX 내부 조건식과 character visual helper 호출에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 wanted 카드의 빈 슬롯 표시, 캐릭터 이미지/직업 라벨, stat fallback, 레벨 제한 경고, 권장 레벨 안내 수동 확인이다.
- 2026-07-04: 모집 wanted 카드 action 영역의 carousel 이동 가능 여부, 캐릭터 생성/선택 버튼 disabled 상태와 라벨, ready 버튼 class/disabled/라벨/다음 ready 값, minimized start 버튼 표시/disabled 상태를 `useRecruitingWantedActionsPresentation` 훅으로 분리했다. `PlayPage`는 busy/ready/선택 상태와 시작 가능 여부만 전달하고, 모집 wanted action의 상호작용 정책은 새 훅이 담당하므로, 버튼 상태 변경 이유가 JSX의 긴 boolean 조건에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 carousel 이동 잠금, 캐릭터 선택/해제 버튼, ready 토글, 모든 플레이어 ready 후 minimized start 진입 버튼 수동 확인이다.
- 2026-07-04: 모집 wanted 카드의 carousel 이전/다음 aria-label, 캐릭터 생성 버튼 라벨, stat label/value pair, 능력치/핵심 특성 빈 상태 문구, 핵심 특성 aria-label/section label을 `useRecruitingWantedActionsPresentation`과 `useRecruitingWantedCardPresentation` 훅으로 추가 이동했다. `PlayPage`는 carousel 이동 handler와 카드 데이터 반복 렌더링만 유지하고, wanted 카드의 고정 표시 문구와 접근성 라벨 변경 이유가 카드/action presentation 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 wanted carousel 버튼 aria-label, 캐릭터 생성 버튼 문구, stat label, 빈 캐릭터 상태의 능력치/핵심 특성 빈 문구 수동 확인이다.
- 2026-07-04: 빠른 캐릭터 생성 모달의 ancestry/class select disabled 상태, submit disabled 상태, LV/HP/AC/이동 status chip, 숙련 기술 안내 문구를 `useQuickCreateModalPresentation` 훅으로 분리했다. `PlayPage`는 config ready 여부, busy 상태, 파생 전투 수치, 선택 class만 전달하고, 모달 표시/입력 가능 상태 모델은 새 훅이 담당하므로, 빠른 생성 UI 표시 정책 변경 이유가 모달 JSX 내부 조건식과 문자열 조립에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 빠른 생성 모달 select 비활성화, Save 버튼 비활성화, LV/HP/AC/이동 chip, 숙련 기술 안내 문구 수동 확인이다.
- 2026-07-04: Info 탭의 시나리오 제목 fallback과 판정 가이드 라벨 fallback projection을 `useCurrentNodeInfoPresentation` 훅으로 분리했다. `PlayPage`는 제목 문자열과 라벨링된 판정 옵션 배열만 받아 렌더링하고, current node 표시 fallback 정책 변경 이유는 새 훅에 모이므로 Info 탭 JSX가 데이터 누락 처리와 라벨 생성 규칙을 직접 소유하지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Info 탭 시나리오 제목 fallback, 판정 가이드 label/id/skill fallback, 판정 옵션이 없을 때 빈 상태 문구 수동 확인이다.
- 2026-07-04: Info 탭의 section eyebrow와 공개 단서/판정 가이드 빈 상태 문구 projection을 `useCurrentNodeInfoPresentation` 훅으로 추가 이동했다. `PlayPage`는 Info 탭 구조와 데이터 목록 렌더링만 유지하고, 현재 시나리오/장면/단서/판정/설명 section 명칭과 빈 상태 문구 변경 이유는 current node info presentation 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Info 탭 section label, 공개 단서가 없을 때 빈 상태, 판정 옵션이 없을 때 빈 상태 수동 확인이다.
- 2026-07-04: 모집 overlay와 Settings 탭에서 반복되던 세션 제목, 초대 코드, 상태, phase, 공개 범위 fallback projection을 `useSessionSettingsPresentation` 훅으로 분리했다. `PlayPage`는 세션 설정 UI에 표시 모델과 초대 코드 복사 handler만 연결하고, 누락된 session/invite/status/visibility를 어떤 문구로 보여줄지의 변경 이유는 새 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 overlay 세션 제목/초대 코드, 초대 코드 복사 버튼 활성화, Settings 탭 상태/phase/공개 범위 fallback 수동 확인이다.
- 2026-07-04: 모집 overlay와 Settings 탭의 로비 이동/세션 퇴장/초대 코드 복사/현재 세션/상태/공개 범위 라벨, Human GM 안내 문구를 `useSessionSettingsPresentation` 훅으로 추가 이동했다. `PlayPage`는 버튼 클릭과 값 표시만 유지하고, 세션 설정 영역의 고정 UI 문구 변경 이유가 JSX와 모집 overlay에 중복으로 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 overlay 초대 코드 복사 aria-label/로비 이동/세션 퇴장, Human GM 안내 문구, Settings 탭 라벨/복사 버튼 문구 수동 확인이다.
- 2026-07-04: 모집 중 Settings meta의 Status/Phase/Visibility 라벨을 `useSessionSettingsPresentation` 훅으로, minimized start 진입 버튼 라벨을 `useRecruitingWantedActionsPresentation` 훅으로 이동했다. `PlayPage`는 모집 meta 값과 버튼 handler만 연결하고, 모집 상태 라벨과 start 진입 문구 변경 이유가 Settings JSX와 wanted card JSX에 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 Settings meta 라벨/값 표시와 minimized start 버튼 문구/클릭 시 시작 overlay 재표시 수동 확인이다.
- 2026-07-04: Main/Chat sidebar 입력창의 placeholder, combobox role, autocomplete aria 속성, submit label projection을 `useSessionMessageInputPresentation` 훅으로 분리했다. `PlayPage`는 active tab에 맞는 입력 state와 handler를 연결하고, RP action/GM request/Chat 모드별 UX 문구와 autocomplete 노출 속성 변경 이유는 새 훅에 모이므로 입력 JSX의 중첩 ternary가 줄어든다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Main 탭 GM request placeholder, RP action placeholder, slash autocomplete aria-expanded/activedescendant, Chat 탭 placeholder 수동 확인이다.
- 2026-07-04: Main command picker의 모드 버튼 active class/aria-pressed, helper option active class, guide option slash/description, autocomplete option class/aria/index projection을 `useMainCommandPresentationModel` 반환 모델로 이동했다. `PlayPage`는 버튼 클릭 시 command state를 갱신하는 orchestration만 유지하고, 명령어 picker의 표시 상태와 slash/description 추출 규칙 변경 이유는 main command presentation hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 GM 요청/RP 행동/명령어 버튼 active 표시, helper option active 표시, 명령어 guide 목록, slash autocomplete hover/선택/aria-selected 수동 확인이다.
- 2026-07-04: Main command picker의 모드 버튼 라벨, 명령어 guide 안내 문구, exploration 선택 row aria/라벨, autocomplete aria-label, 대상/아이템/주문/관련 명령/좌표 필드 라벨과 placeholder를 `useMainCommandPresentationModel`의 `mainCommandText` 모델로 추가 이동했다. `PlayPage`는 입력 필드 value/onChange와 option 렌더링만 유지하고, Main command UX 문구 변경 이유가 JSX 내부 하드코딩으로 남지 않는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Main command 모드 버튼 문구, 명령어 guide 안내, slash autocomplete aria-label, target/item/spell/related intent/좌표 입력 필드 라벨과 placeholder 수동 확인이다.
- 2026-07-04: sidebar 탭의 label, active/unread class, unread aria-label, unread badge/count text, active tab description projection을 `useSessionTabPresentation` 훅으로 분리했다. `PlayPage`는 탭 배열을 순회해 버튼을 렌더링하고 탭 변경 handler만 연결하므로, unread badge 표시와 탭 설명 문구 변경 이유가 페이지 JSX에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Main/Chat unread count badge, Info unread dot, 탭 aria-label, 이전 로그 버튼이 없을 때 탭 설명 표시 수동 확인이다.
- 2026-07-04: 휴식 승인/취소 배너의 aria label, eyebrow, 휴식 종류 제목, 메시지, 버튼 라벨 projection을 `restApprovalPresentation.ts`와 `useRestApprovalActions` 반환 모델로 분리했다. `PlayPage`는 배너 모델을 렌더링하고 action id로 승인/거절/취소 handler만 호출하므로, rest type별 문구와 requester/message 조합 변경 이유가 페이지 JSX에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 GM 화면의 휴식 승인/거절 배너, 플레이어 화면의 휴식 요청 취소 배너, 긴 휴식/짧은 휴식 제목과 메시지 수동 확인이다.
- 2026-07-04: sidebar collapse class/aria/title label projection을 `useSessionLayoutPresentation`에, 이전 로그 버튼 disabled/text projection을 `useSessionTabPresentation`에 추가했다. `PlayPage`는 sidebar collapse 토글과 이전 로그 로드 handler만 연결하고, 접힘 상태와 로그 로딩 상태별 UI 문구 변경 이유는 각 presentation hook에 모이므로 sidebar JSX의 상태 기반 문자열 분기가 줄어든다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 sidebar 접기/열기 버튼 aria-label/title, 이전 로그 로딩 중 disabled 상태와 버튼 문구 수동 확인이다.
- 2026-07-04: session log thread row의 row/avatar/sender/bubble class, avatar alt, 빈 로그 문구, 휴식 inline 승인/거절 버튼 라벨 projection을 `useSessionLogThreadRows` 훅으로 이동했다. `PlayPage`는 row 방향과 이미지 유무에 따른 렌더링 구조와 action handler 연결만 유지하고, 로그 tone/pending/GM profile/휴식 요청별 표시 class와 문구 변경 이유는 로그 row presentation hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Main/Chat 빈 로그 문구, incoming/outgoing avatar class, pending action bubble, 휴식 승인/거절 inline 버튼 수동 확인이다.
- 2026-07-04: 빠른 캐릭터 생성 모달의 eyebrow/title/description, 필드 라벨, close/cancel/save 버튼 라벨, 숙련 기술 안내 문장을 `useQuickCreateModalPresentation` 훅으로 이동했다. `PlayPage`는 form state와 submit/close handler만 연결하고, 빠른 생성 모달의 표시 문구와 class 선택 기반 숙련 기술 문장 변경 이유는 characters presentation hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 빠른 생성 모달 제목/설명/필드 라벨, 숙련 기술 안내, Cancel/Save 버튼 표시 수동 확인이다.
- 2026-07-04: participant strip wrapper class, empty slot class/alt/title/description/state/index label, occupied participant card class, recruiting status class, started participant state class, Human GM 지정 버튼 라벨 projection을 `useSessionLayoutPresentation`과 `useParticipantCardPresentation`으로 이동했다. `PlayPage`는 empty/occupied slot 렌더링 구조와 Human GM 지정 handler만 연결하므로, 모집/플레이 상태별 party strip 표시 class와 빈 슬롯 문구 변경 이유가 페이지 JSX에서 빠진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집/플레이 party strip class, 빈 슬롯 문구/alt, ready/GM 상태 class, Human GM 지정 버튼 표시 수동 확인이다.
- 2026-07-04: 전투 반응 배너의 aria label, reaction type eyebrow, reactor title, message, accept/decline 버튼 라벨 projection을 `combatResultPresentation.ts`의 `buildCombatReactionBannerPresentation`으로 분리했다. `PlayPage`는 pending reaction을 배너 모델로 변환해 렌더링하고 수락/거절 handler만 연결하므로, reaction type별 표시 문구와 배너 버튼 문구 변경 이유가 전투 결과 presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 opportunity attack/shield/ready action/counterspell 반응 배너의 제목/eyebrow/포기/사용 버튼 수동 확인이다.
- 2026-07-04: 세션 시작 overlay의 close aria label, eyebrow/title, ready badge, subtitle/description, cancel/start 버튼 라벨, game starting modal 문구를 `useSessionStartTransition` 반환 모델로 이동하고, 세션 영구 퇴장 확인창의 close aria label, title/description, cancel/confirm 라벨을 `useSessionLeaveConfirmation` 반환 모델로 이동했다. `PlayPage`는 overlay 표시 여부와 start/leave handler 연결만 유지하므로, host/Human GM 권한별 시작 안내 문구와 퇴장 확인 문구 변경 이유가 lifecycle hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모든 플레이어 ready 시 시작 overlay 문구, host/Human GM/player별 안내 문구, game starting modal, 세션 영구 퇴장 확인창 수동 확인이다.

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

진행 기록:

- 2026-07-02: `CharacterPage`의 point-buy 상수/범위 보정, 능력치 modifier 표시, 레벨 정규화, 숙련 보너스 계산, 직업별 추천 HP/AC/속도/능력치 성장 계산, 레벨 변경 시 stats/abilities delta 적용을 `characterBuildRules.ts`로 분리했다. 페이지는 캐릭터 생성/레벨업 UI 상태와 submit orchestration을 유지하고, 캐릭터 빌드 수치 규칙 변경 이유는 characters feature rule 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 point-buy 증감, 시나리오 시작 레벨 변경 시 HP/AC/숙련도/능력치 갱신, 레벨업 preview 수동 확인이다.
- 2026-07-02: `CharacterPage`의 클래스 feature label 정규화/alias 매칭, canonical/reference feature 표시 모델 조립, spellcasting 설명 fallback, feature timeline level grouping, feature status count/label/sort 규칙을 `characterFeaturePreview.ts`로 분리했다. 페이지는 현재 캐릭터/생성 폼 상태에서 preview item 목록을 구성하는 orchestration만 유지하고, feature preview 표시 규칙 변경 이유는 characters feature preview 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 특성 단계와 레벨업 모달의 feature timeline/source/status 표시 수동 확인이다.
- 2026-07-02: `CharacterPage`의 시작 장비 구체 선택지, item selection key 생성, 선택 슬롯 변경 시 구체 장비 선택 초기화, 필수 구체 장비 선택 검증, fighter 시작 장비 슬롯 필터, 생성 장비 요약 projection을 `characterStartingEquipment.ts`로 분리했다. 페이지는 장비 step UI 이벤트와 form state 연결만 유지하고, 시작 장비 선택 규칙 변경 이유는 characters starting equipment 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 장비 단계에서 fighter 시작 장비 선택지, 단순/군용 무기 구체 선택, 미선택 항목 검증, 우측 장비 요약 갱신 수동 확인이다.
- 2026-07-03: `CharacterPage`의 avatar preset 목록, className 기반 기본 이미지 fallback, 업로드/프리셋/직업 이미지 우선순위, 직업별 기본 preset id 매핑을 `characterAvatarPresentation.ts`로 분리했다. 페이지는 avatar 선택/업로드 이벤트와 form state 연결만 유지하고, 캐릭터 초상화 표시 규칙 변경 이유는 characters avatar presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 목록/상세/생성 모달에서 기본 프리셋, 직업 fallback 이미지, 업로드 이미지 우선 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 ancestry label fallback, race/static catalog lookup, legacy race feature 기반 종족 역추적, race ability bonus 표시 문구, RaceResponseDto와 static RaceData 병합, subrace trait summary 선택을 `characterRacePresentation.ts`로 분리했다. 페이지는 현재 선택 ancestry와 form state를 전달해 종족 표시 모델만 받아 사용하고, 종족 표시/룩업 규칙 변경 이유는 characters race presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 종족/하위종족 선택, 능력치 보너스 표시, 기존 캐릭터 상세의 종족 특성/하위종족 특성 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 point-buy base/cost/remaining/isValid 산출과 능력치 증감 버튼의 canDec/canInc/증감 비용 계산, point-buy 증감 적용 규칙을 `characterBuildRules.ts`로 분리했다. 페이지는 현재 form abilities와 선택 race ability increase를 전달해 표시/갱신 결과만 받아 사용하고, point-buy 수치 규칙 변경 이유는 characters build rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 능력치 단계에서 종족 선택 전 수동 입력, 종족 선택 후 포인트 증감/남은 포인트/초과·미달 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 ASI/Feat choice id, ASI level 산출, ability score increase/feat selection 파생값, 선택형 종족/직업 feature definition, feature tag 교체, 필수 feature 선택 검증, submit용 class feature 병합 규칙을 `characterFeatureChoices.ts`로 분리했다. 페이지는 생성/레벨업 UI에서 선택 상태를 전달하고 표시·검증 결과만 받아 사용하므로, 특성 선택 규칙 변경 이유는 characters feature choices 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 특성 단계의 ASI/Feat·용 혈통·전투 유파·주적·전문화 선택, 레벨업 ASI/Feat 선택 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 wizard 단계 메타데이터, 기본 캐릭터 payload, D&D 5e skill 한국어 정규화/표시 라벨, 기본 class label fallback을 `characterCreateDefaults.ts`로 분리했다. 페이지는 생성 폼 state 초기화와 UI 렌더링에서 기본값/라벨 helper를 호출만 하며, 생성 기본값과 스킬 표시 규칙 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 모달 첫 진입 기본값, 단계 이동 표시, 스킬 선택/제거 라벨, 캐릭터 카드 class label 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 draft 초기화, 목표 레벨 변경 시 주문/ASI 선택 초기화, 준비 주문 toggle/limit, 레벨업 주문·캔트립 습득 제한, 주문·캔트립 교체 제한과 교체 시 준비 주문 정리 규칙을 `characterLevelUpDraft.ts`로 분리했다. 페이지는 레벨업 모달 이벤트에서 현재 draft와 제한값을 전달하고 다음 draft만 받아 적용하므로, 레벨업 주문 선택 상태 전이 변경 이유는 characters level-up draft 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 목표 레벨 변경, 주문/캔트립 습득, 기존 주문/캔트립 교체, 준비 주문 제한/해제 수동 확인이다.
- 2026-07-03: `CharacterPage`의 숙련 기술 추가 시 한국어 정규화, 중복 방지, class skill choice count 제한, 숙련 기술 제거 시 expertise feature tag 정리 규칙을 `characterSkillSelection.ts`로 분리했다. 페이지는 skill input 이벤트와 form state setter만 유지하고, 스킬 선택/전문화 정리 규칙 변경 이유는 characters skill selection 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 기술 단계에서 영문/한국어 스킬 추가, 중복 추가 방지, 제한 개수 초과 방지, rogue expertise 선택 후 스킬 제거 시 전문화 선택 정리 수동 확인이다.
- 2026-07-03: `CharacterPage`의 시작 장비 option 표시 문자열 조립, 장비 slot 선택 변경 시 구체 장비 선택 초기화, 구체 장비 item 선택 반영 규칙을 기존 `characterStartingEquipment.ts`로 추가 분리했다. 페이지는 시작 장비 UI 이벤트에서 slot/item 식별자와 선택값만 전달하고, 시작 장비 선택 상태 변경 이유는 characters starting equipment 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 장비 단계에서 slot 변경 시 구체 장비 선택 초기화, 단순/군용 무기 구체 선택 저장, 우측 장비 요약 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 폼 기본 payload projection, 기본 시나리오/레벨 반영, 기본 직업 시작 장비 slot 초기화, 시작 주문 placeholder 조립, 수정 모드에서 PersistentCharacter를 CharacterPayload로 복사하는 규칙을 `characterCreateDefaults.ts`로 분리했다. 페이지는 create/edit 모달 열기 흐름과 UI 상태 초기화만 유지하고, 생성/수정 form projection 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 새 캐릭터 생성 모달 기본 시나리오/레벨/시작 주문 placeholder, 기존 캐릭터 수정 모달의 능력치·스킬·특성·인벤토리 복사 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 모달 시나리오 변경 시 레벨 delta 적용, HP/AC/숙련도/능력치 갱신, 서브클래스 유지/초기화, ASI/Feat 선택 수 정리, 시작 주문 placeholder 재조립과 직업 변경 시 추천 수치/point-buy 범위/시작 장비/시작 주문/스킬/특성 초기화 규칙을 `characterCreateDefaults.ts`로 분리했다. 페이지는 select 이벤트에서 선택 id와 현재 form state만 전달하고, 시나리오·직업 변경에 따른 생성 폼 projection 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 모달에서 시나리오 변경 시 레벨/ASI/주문 placeholder 갱신, 직업 변경 시 HP/AC/숙련도/시작 장비/스킬/특성 초기화 수동 확인이다.
- 2026-07-03: `CharacterPage`의 종족/하위종족 변경 시 기존 종족 능력치 보너스 제거, 새 종족 능력치 보너스 적용, point-buy 범위 보정, 드래곤본이 아닌 종족 선택 시 `draconic_ancestry` feature tag 제거 규칙을 `characterRacePresentation.ts`의 `applyRaceToCharacterFormState`로 분리했다. 페이지는 ancestry select 이벤트에서 선택 key만 전달하고, 종족 변경에 따른 능력치/feature projection 변경 이유는 characters race presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 모달에서 종족/하위종족 변경 시 능력치 보너스 반영, point-buy 범위 유지, 드래곤본 혈통 선택 후 다른 종족 전환 시 혈통 선택 초기화 수동 확인이다.
- 2026-07-03: `CharacterPage`의 hit die max/average 테이블, 레벨별 숙련 보너스, 건강 수정치 기반 HP 계산, hill dwarf와 draconic bloodline HP 보너스 계산을 `characterBuildRules.ts`의 `deriveLevelStats`/`getHitDieAverage`로 분리했다. 페이지는 선택 class/race/subclass/level/con 값을 전달하고 자동 수치 결과만 동기화하므로, 레벨 기반 수치 공식 변경 이유는 characters build rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 모달에서 레벨·건강·hill dwarf·draconic bloodline 선택 시 HP/숙련도와 HP 설명 문구 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 preview row 조립 중 진행 중 세션, 조건/집중, 장비, 준비 주문, downtime, archive/이관 표시 문구와 장착 무기 lookup을 `characterLevelUpPreview.ts`로 분리했다. 페이지는 선택 캐릭터와 주문 개수/준비 제한, item name formatter를 전달해 row 목록만 렌더링하므로, 레벨업 preview 표시 모델 변경 이유는 characters level-up preview 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 진행 중 세션 정보, 조건/집중, 주/보조 무기, 준비 주문 수, downtime/archive 행 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 feature timeline preview 조립 중 신규 직업 특성 추출, ASI label 제외, 서브클래스 선택 필요 항목 생성, ASI/Feat 선택 상태 표시 규칙을 `characterLevelUpPreview.ts`의 `buildLevelUpFeaturePreviewItems`로 분리했다. 페이지는 선택 캐릭터, 직업 정보, 목표 레벨, subclass/ASI draft 상태를 전달하고 timeline grouping만 수행하므로, 레벨업 특성 preview 변경 이유는 characters level-up preview 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 신규 class feature, subclass required/selected, ASI/Feat required/selected 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 wizard feature preview 조립 중 종족 trait, 레벨별 직업 특성, 선택형 feature, ASI/Feat 표시 항목 생성을 `characterFeaturePreview.ts`의 `buildCreateFeaturePreviewItems`로 분리했다. 페이지는 생성 폼 상태와 선택된 race/class 정보만 전달하고 required count와 timeline grouping만 수행하므로, 생성 feature preview 표시 모델 변경 이유는 characters feature preview 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 특성/확인 단계에서 종족 trait, class feature, subclass/전투 유파/전문화 같은 선택형 feature, ASI/Feat required/selected 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 캐릭터 생성 제출 처리 중 클래스 정의 로딩, 필수 feature, subclass/subrace, 시작 장비 구체 선택, 시작 주문/준비 주문 검증과 submit payload 정규화를 `characterCreateDefaults.ts`의 `prepareCharacterCreateSubmit`으로 분리했다. 페이지는 제출 버튼 이벤트, validation error 표시, create/update API 호출과 모달 닫기만 맡으므로, 생성 제출 규칙 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 제출 시 필수 feature 누락, subclass/subrace 누락, 시작 장비 구체 선택 누락, 시작 주문 중복/누락, 준비 주문 개수/범위 오류, 정상 생성/수정 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 제출 처리 중 target level 보정, 평균 HP 모드, active session 적용 여부, subclass/ASI/Feat/주문 습득·교체/준비 주문 optional payload 조립과 준비 주문 저장 payload 조립을 `characterLevelUpDraft.ts`의 `buildLevelUpCharacterPayload`/`buildPreparedSpellsUpdatePayload`로 분리했다. 페이지는 선택 캐릭터 확인, level-up/update-prepared API 호출, 성공 시 모달 닫기만 맡으므로, 레벨업 제출 DTO 계약 변경 이유는 characters level-up draft 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 목표 레벨 보정, subclass 선택, ASI/Feat 선택, 주문/캔트립 습득·교체, 준비 주문 저장 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 wizard 다음 단계 이동 처리 중 profile 필수값, subrace/subclass, point-buy 유효성, 필수 feature 선택 검증을 `characterCreateDefaults.ts`의 `validateCharacterCreateStepTransition`으로 분리했다. 페이지는 이전/다음 버튼 이벤트와 validation error 표시, step index 이동만 맡으므로, 생성 단계 이동 정책 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 wizard에서 profile 필수값 누락, 하위종족/서브클래스 누락, point-buy 27포인트 미달/초과, 필수 feature 미선택 시 다음 단계 이동 차단 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 주문 단계에서 선택된 슬롯 주문 id dedupe, prepared spell 후보 상세 조립, 동적 준비 주문 풀 처리, 준비 주문 limit clamp 규칙을 `characterSpellSelectionRules.ts`의 `getSelectedStartingSlotSpellIds`/`buildStartingPreparedSpellOptions`/`resolveStartingPreparedSpellLimit`로 분리했다. 페이지는 주문 선택 UI에 필요한 현재 form state와 option 목록만 전달하므로, 시작 주문/준비 주문 후보 산출 변경 이유는 characters spell selection rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 주문 단계에서 슬롯 주문 선택 후 준비 주문 후보 갱신, prepared caster의 동적 주문 후보 표시, 준비 주문 제한 수 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 선택 캐릭터 상세 주문 표시 중 캔트립/알고 있는 주문/준비 주문 id 정리, 주문 상세 option 조립, 주문 보유 여부 산출을 `characterSpellSelectionRules.ts`의 `buildCharacterSpellDisplayModel`로 분리했다. 페이지는 선택 캐릭터의 spell state와 catalog만 전달하고 렌더링용 display model을 사용하므로, 캐릭터 상세 주문 표시 규칙 변경 이유는 characters spell selection rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 상세에서 캔트립/알고 있는 주문/준비 주문 그룹 표시, 빈 주문 숨김, 주문 상세 tooltip/spec 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 주문 선택 중 이미 알고 있는 주문/캔트립 제외, 신규 습득 후보 상세 option 조립, 교체 대상 option 조립, prepared caster의 준비 주문 후보 병합 규칙을 `characterSpellSelectionRules.ts`의 `buildCharacterLevelUpSpellSelectionModel`로 분리했다. 페이지는 선택 캐릭터 주문 상태, 레벨업 draft, catalog만 전달하고 렌더링용 selection model을 사용하므로, 레벨업 주문 후보 산출 변경 이유는 characters spell selection rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 신규 슬롯 주문/캔트립 후보, 기존 주문/캔트립 교체 대상, 준비 주문 후보 병합 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성/레벨업 subclass 파생 상태 계산 중 class key 정규화, 구현된 subclass option 조회, subclass 선택 레벨, 선택 필수 여부/미선택 여부 판정을 `characterFeatureChoices.ts`의 `buildSubclassChoiceState`로 분리했다. 페이지는 생성 폼 또는 선택 캐릭터의 class/level/subclass 상태만 전달해 렌더링과 검증에 필요한 값만 사용하므로, subclass 선택 규칙 변경 이유는 characters feature choices 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 wizard/레벨업 모달에서 subclass 선택 가능 레벨, 필수 표시, 기존 subclass 보유 캐릭터의 레벨업 시 필수 선택 미표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 선택 캐릭터 lookup과 세션에서 사용 중인 캐릭터 id 집합 산출을 `characterSelection.ts`의 `findSelectedCharacter`/`buildUsedCharacterIdSet`으로 분리했다. 페이지는 selected id, characters, snapshot을 전달하고 선택 상태/사용 중 표시만 렌더링하므로, 캐릭터 선택·사용 중 판정 변경 이유는 characters selection 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 목록에서 선택 유지/첫 캐릭터 fallback, 세션 참여자 또는 activeSessionId가 있는 캐릭터의 사용 중 표시와 삭제 차단 수동 확인이다.
- 2026-07-03: `CharacterPage`의 수정 모달 열기 처리 중 PersistentCharacter를 edit form state와 inventory draft로 복사하는 projection을 `characterCreateDefaults.ts`의 `createEditCharacterDraft`로 분리했다. 페이지는 선택 캐릭터 확인, modal state setter, toast/error 초기화만 맡으므로, 수정 모드 draft 구성 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 기존 캐릭터 수정 모달에서 능력치, 스킬, 특성, 인벤토리, 장착 무기, 초상화 값 복사 수동 확인이다.
- 2026-07-03: `CharacterPage`의 정적 SRD catalog 로딩 중 class catalog, class feature manifest, race catalog, spell catalog, spell pools 상태와 로딩 실패 메시지 처리를 `useCharacterCatalogs` 훅으로 분리했다. 페이지는 catalog 결과와 error만 받아 표시/계산에 사용하므로, 정적 SRD 데이터 로딩 변경 이유는 characters catalog hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성/레벨업 화면에서 직업/종족/주문/feature preview가 정상 표시되고 catalog 로딩 실패 시 panel error가 표시되는지 수동 확인이다.
- 2026-07-03: `CharacterPage`의 item catalog와 rule catalog API 로딩 상태를 기존 `useCharacterCatalogs` 훅으로 통합했다. 페이지는 item/rule catalog 결과만 받아 장비명 매핑과 주문/룰 계산에 사용하므로, 캐릭터 화면 catalog 데이터 로딩 변경 이유는 characters catalog hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 장비명 표시, 주문 후보/상세 표시, rule catalog 기반 주문/feature 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성/수정 모달 toast lifecycle 중 toast state, 자동 dismiss timer, modal 닫힘 시 clear, validation/API error 반응, avatar asset notify 표시를 `useCharacterCreateToast` 훅으로 분리했다. 페이지는 toast 렌더링과 hook callback 연결만 맡으므로, 생성 모달 알림 동작 변경 이유는 characters create toast hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성/수정 모달에서 validation error toast, API error toast, avatar upload/delete toast, 모달 닫힘 시 toast clear 수동 확인이다.
- 2026-07-03: `CharacterPage`의 item catalog를 시작 장비 표시용 한글명 Map으로 변환하는 projection을 `characterStartingEquipment.ts`의 `buildItemKoNameByKey`로 분리했다. 페이지는 item catalog를 전달해 장비 표시 helper에 필요한 label map만 받아 쓰므로, 시작 장비/장비 요약 표시용 item label projection 변경 이유는 characters starting equipment 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 장비 단계에서 시작 장비 option/요약의 한글 장비명 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 spell catalog를 주문 표시/선택용 id Map으로 변환하는 projection을 `characterSpellSelectionRules.ts`의 `buildSpellCatalogById`로 분리했다. 페이지는 spell catalog를 전달해 주문 후보/상세 helper에 필요한 lookup map만 받아 쓰므로, 주문 catalog index 계약 변경 이유는 characters spell selection rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 주문 단계와 레벨업 모달에서 주문 후보/상세 tooltip/spec 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 ancestry option 목록, ancestry label map, 생성 wizard의 부모 종족/하위종족 후보와 하위종족 필수 여부 계산을 `characterRacePresentation.ts`의 `buildAncestryOptions`/`buildAncestryLabelMap`/`buildCreateRaceChoiceState`로 분리했다. 페이지는 race catalog와 선택 race를 전달해 UI 선택 상태만 받아 쓰므로, 종족 선택 표시 모델 변경 이유는 characters race presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 종족/하위종족 select, 기존 캐릭터 카드/상세의 ancestry label 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 폼 선택 종족 표시 모델 조립 중 static race fallback 선택, 부모 종족 fallback, API RaceResponseDto와 RaceData 병합 호출을 `characterRacePresentation.ts`의 `buildSelectedCreateRaceInfo`로 분리했다. 페이지는 현재 ancestry, 선택 race, 선택 부모 race만 전달하고 표시 모델만 받아 쓰므로, 생성 종족 정보 표시 변경 이유는 characters race presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 종족/하위종족 선택 시 능력치 보너스, 속도, 크기, trait preview 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 class catalog value lookup helper와 생성 feature preview용 ancestry key 정규화식을 각각 `characterCreateDefaults.ts`의 `getClassOptionByValue`, `characterRacePresentation.ts`의 `getCreateRaceFeatureAncestryKey`로 분리했다. 페이지는 catalog와 form value를 넘겨 표시/preview 입력값만 받아 쓰므로, class lookup과 race feature key 계약 변경 이유는 characters 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 상세/생성 모달의 class 정보 표시와 종족 feature preview 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 wizard 현재 단계 조회, 단계별 boolean, 오른쪽 컬럼 표시 여부, 마지막 단계 여부 계산을 `characterCreateDefaults.ts`의 `buildCharacterCreateStepViewState`로 분리했다. 페이지는 create step index만 전달하고 렌더링에 필요한 view state를 받아 쓰므로, 생성 wizard 단계/레이아웃 정책 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 wizard의 각 단계 전환, 오른쪽 요약 컬럼 표시, 마지막 단계 제출 버튼 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 wizard 스탯 단계 종족/직업 선택 요약 문구와 fallback 문구를 `characterCreateDefaults.ts`의 `getCreateStatSelectionLabel`로 분리했다. 페이지는 선택 race/class 표시 모델만 전달하고 렌더링 문구를 받아 쓰므로, 생성 스탯 단계 표시 문구 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 스탯 단계에서 종족/직업 미선택 및 선택 후 요약 문구 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 ASI/Feat 파생 상태 중 crossed ASI level, normalized choice list, feat 선택 id, ability score increase, 미선택 개수, 레벨업 후 ability projection을 `characterFeatureChoices.ts`의 `buildLevelUpAsiFeatChoiceState`로 분리했다. 페이지는 레벨업 draft와 선택 캐릭터 정보를 전달하고 submit/preview/rendering에 필요한 상태만 받아 쓰므로, 레벨업 ASI/Feat 선택 규칙 변경 이유는 characters feature choices 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 ASI/Feat 선택 필요 레벨, 미선택 개수, ability 증가 preview, feat 중복 선택 차단 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 ASI/Feat select 변경 처리 중 choice 배열 갱신, feat selection 재계산, ability score increase 재계산을 `characterLevelUpDraft.ts`의 `setAsiFeatChoiceInDraft`로 분리했다. 페이지는 select 이벤트의 index/value만 draft helper에 전달하므로, 레벨업 ASI/Feat draft 전이 변경 이유는 characters level-up draft 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 ASI/Feat 선택 변경 시 preview와 제출 payload가 갱신되는지 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 주문 단계에서 캔트립/슬롯 주문/준비 주문 선택 변경 시 `startingSpells` 기본 구조 생성, 선택 id 정리, 슬롯 주문 변경 시 준비 주문 후보 정리를 `characterSpellSelectionRules.ts`의 `getSelectedStartingCantripIds`/`updateStartingCantrips`/`updateStartingSlotSpells`/`updateStartingPreparedSpells`로 분리했다. 페이지는 주문 선택 이벤트의 선택 id 배열만 전달하므로, 시작 주문 form state 전이 변경 이유는 characters spell selection rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 주문 단계에서 캔트립/슬롯 주문/준비 주문 선택과 슬롯 주문 변경 시 준비 주문 정리 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 review 주문 요약에서 시작 캔트립/슬롯 주문/준비 주문 배열을 trim/filter해 개수를 세는 projection을 `characterSpellSelectionRules.ts`의 `getSelectedStartingPreparedSpellIds`/`buildStartingSpellReviewCounts`로 분리했다. 페이지는 review summary count만 받아 렌더링하므로, 시작 주문 요약 표시 변경 이유는 characters spell selection rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 review 단계에서 캔트립/슬롯 주문 또는 준비 주문 개수 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 주문 섹션 heading 조립, 캔트립/슬롯/준비 주문 표시 개수, 시작 주문 존재 여부 판정을 `characterSpellSelectionRules.ts`의 `buildStartingSpellSectionState`로 분리했다. 페이지는 섹션 상태를 받아 조건부 렌더링과 grid 연결만 수행하므로, 시작 주문 섹션 표시 정책 변경 이유는 characters spell selection rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 주문 단계에서 주문 없음/캔트립/습득 주문/주문책 주문/준비 주문 heading 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 ASI/Feat select 변경 처리 중 기존 feature tag에서 ASI/Feat choice 목록 추출, index 위치 갱신, 빈 선택 제거, features 배열 재조립을 `characterFeatureChoices.ts`의 `updateSelectedAsiFeatChoiceId`로 분리했다. 페이지는 select 이벤트의 index/value만 전달하므로, 생성 ASI/Feat feature tag 전이 변경 이유는 characters feature choices 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 특성 단계에서 ASI/Feat 선택, 선택 해제, 중복 선택 차단 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 ASI/Feat 카드 표시 중 ASI 가능 레벨 목록, 선택 choice id, 선택 ASI ability/feat summary, 같은 choice의 다른 카드 중복 선택 판정을 `characterFeatureChoices.ts`의 `buildCreationAsiFeatChoiceState`/`isAsiFeatChoiceSelectedElsewhere`로 분리했다. 페이지는 카드 view state와 중복 판정 helper를 받아 select option만 렌더링하므로, 생성 ASI/Feat 표시 모델 변경 이유는 characters feature choices 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 특성 단계에서 ASI/Feat 카드 표시, summary, 중복 선택 비활성화 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 ASI/Feat 카드 표시 중 선택 ASI ability/feat summary 조립, Feat 중복 선택 비활성화, ability 20 cap 비활성화 판정을 `characterFeatureChoices.ts`의 `buildLevelUpAsiFeatChoiceState`/`isAsiFeatChoiceSelectedElsewhere`/`isLevelUpAsiAbilityChoiceCapped`로 분리했다. 페이지는 레벨업 ASI 카드 view state와 disabled helper를 받아 option만 렌더링하므로, 레벨업 ASI/Feat 표시 모델 변경 이유는 characters feature choices 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 ASI/Feat summary, Feat 중복 선택 비활성화, 20 이상 능력치 ASI 비활성화 수동 확인이다.
- 2026-07-03: `CharacterPage`의 선택형 종족/직업 feature choice 렌더링 중 context 기반 option/selectedValues/isComplete/statusLabel/summary view model 조립과 single/multi 선택 시 feature tag 재조립을 `characterFeatureChoices.ts`의 `buildFeatureChoiceViewModels`/`setSingleFeatureChoiceValue`/`toggleMultiFeatureChoiceValue`로 분리했다. 페이지는 feature choice view model을 렌더링하고 이벤트 값만 전달하므로, 선택형 feature 표시와 상태 전이 변경 이유는 characters feature choices 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 특성 단계에서 단일 선택/다중 선택 feature의 선택 완료 표시, helper 문구, 선택 토글 수동 확인이다.
- 2026-07-03: `CharacterPage`의 시작 장비 단계에서 class별 slot 목록, 선택 option index, 선택 option의 구체 장비 입력 key/label/selected value/options view model 조립을 `characterStartingEquipment.ts`의 `buildStartingEquipmentSlotViewModels`로 분리했다. 페이지는 slot view model을 렌더링하고 slot/item 선택 이벤트만 전달하므로, 시작 장비 slot 표시와 구체 장비 선택 입력 모델 변경 이유는 characters starting equipment 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 장비 단계에서 fighter slot 필터, 고정/선택 slot 표시, 단순/군용 무기 구체 선택 input 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 시작 장비 slot/item select 변경 처리 중 form state에서 시작 장비 selection payload를 꺼내고 결과를 다시 병합하는 반복을 `characterStartingEquipment.ts`의 `applyStartingEquipmentSlotSelection`/`applyStartingEquipmentItemSelection`으로 분리했다. 페이지는 slot index, option index, item selection key/value만 전달하므로, 시작 장비 form state 전이 변경 이유는 characters starting equipment 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 장비 단계에서 slot 변경 시 구체 선택 초기화, 구체 장비 선택 저장, 장비 요약 갱신 수동 확인이다.
- 2026-07-03: `CharacterPage`와 `characterFeatureChoices.ts`에 흩어진 `(Object.keys(abilityDisplayLabels) as AbilityKey[])` 순회와 ability key 유효성 판정을 `characterBuildRules.ts`의 `abilityKeys` 상수로 통합했다. 능력치 표시 순서와 ability key 계약 변경 이유는 characters build rules 유틸에 모이고, 페이지와 feature choice 유틸은 공유 순서만 사용한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 상세/생성 스탯/생성 ASI/레벨업 ASI 화면의 능력치 순서 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 선택 캐릭터 상세 종족 표시 중 ancestry 기반 static race 조회와 feature tag 기반 legacy race 역추적 조합을 `characterRacePresentation.ts`의 `buildSelectedCharacterRaceInfo`로 분리했다. 페이지는 선택 캐릭터의 ancestry/features와 race catalog만 전달하고 상세 표시용 race info를 받아 렌더링하므로, 기존 캐릭터 종족 복원 규칙 변경 이유는 characters race presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 기존 캐릭터 상세에서 종족 label, 종족 특성, 하위종족 feature 기반 trait summary 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 주문 단계에서 캔트립/슬롯 주문 후보, 상세 option, 선택 id, 동적 준비 주문 여부, 준비 주문 후보/제한, review count, 섹션 heading을 조립하던 여러 파생 계산을 `characterSpellSelectionRules.ts`의 `buildCharacterCreateSpellSelectionModel`로 분리했다. 페이지는 생성 폼과 catalog를 전달해 시작 주문 선택 view model만 받아 렌더링하고, 시작 주문 후보/제한/요약 정책 변경 이유는 characters spell selection rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성 주문 단계에서 캔트립/습득 주문/주문책 주문/준비 주문 heading, 후보 목록, 선택 제한, review 주문 개수 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 캐릭터 카드 목록 렌더링 중 선택 여부, 세션 사용 중 여부, 캐릭터 이미지 fallback, class label을 조립하던 표시 모델을 `characterSelection.ts`의 `buildCharacterCardViewModels`로 분리했다. 페이지는 카드 view model을 순회해 렌더링하고 선택 id만 갱신하므로, 캐릭터 목록 카드 표시 정책 변경 이유는 characters selection 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 목록에서 선택 카드 강조, 사용 중 overlay, avatar preset/upload/default 이미지, 직업 label 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 선택 캐릭터 상세 패널에서 종족/직업/레벨/HP/AC/속도/숙련도 summary row, 능력치 값/수정치/tooltip row, 기술 숙련 label, 레벨업 버튼 표시 상태를 조립하던 표시 모델을 `characterDetailPresentation.ts`의 `buildCharacterDetailViewModel`로 분리했다. 페이지는 선택 캐릭터 상세 view model을 받아 렌더링하고 이벤트만 연결하므로, 상세 패널의 기본 시트 표시 정책 변경 이유는 characters detail presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 선택 캐릭터 상세에서 summary row, 능력치 tooltip, 기술 숙련 라벨, 20레벨 레벨업 버튼 비활성화 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 선택 캐릭터 상세 주문 영역에서 캔트립/알고 있는 주문/주문책/준비 주문 그룹 label, count, prepared 스타일 여부, `SpellSelectionGrid` option을 개별 JSX 분기로 조립하던 표시 모델을 `characterSpellSelectionRules.ts`의 `CharacterSpellSummaryGroup`/`summaryGroups`로 분리했다. 페이지는 주문 summary group을 순회해 렌더링하므로, 상세 주문 그룹 표시 정책 변경 이유는 characters spell selection rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 선택 캐릭터 상세에서 캔트립, 알고 있는 주문/주문책, 준비 주문 그룹 label/count/options와 빈 주문 메시지 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성/수정 모달 초상화 선택 영역에서 현재 preview 이미지/문구, preset 선택 상태, 업로드 asset 선택/삭제 중 상태, 파일 크기 label을 조립하던 표시 모델을 `characterAvatarPresentation.ts`의 `buildCharacterAvatarPickerViewModel`로 분리했다. 페이지는 avatar picker view model을 렌더링하고 preset 선택, 업로드 적용, 삭제 요청 이벤트만 연결하므로, 초상화 선택 UI 표시 정책 변경 이유는 characters avatar presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성/수정 모달에서 preset 선택 강조, 업로드 preview 문구, 업로드 asset 개수/크기, 삭제 중 버튼 상태 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 review 단계에서 최종 확인 title, 종족/직업/서브클래스/레벨/HP·AC/숙련 기술/특성/장비/주문 summary row, 특성 확인 목록의 source/status label, 필수 특성 완료/경고 문구를 조립하던 표시 모델을 `characterCreateDefaults.ts`의 `buildCharacterCreateReviewViewModel`로 분리했다. 페이지는 review view model을 렌더링하고 생성 제출 이벤트만 유지하므로, 생성 최종 확인 표시 정책 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 review 단계에서 summary row, 특성 확인 목록, 필수 특성 경고/완료 문구, 주문/장비 개수 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 스탯 단계 요약 카드에서 HP/AC/속도/숙련도 값, HP 산식 설명, 레벨 기준 숙련도 설명을 JSX 내부 즉석 계산으로 조립하던 표시 모델을 `characterBuildRules.ts`의 `buildCreateStatSummaryCards`로 분리했다. 페이지는 stat summary card 배열을 렌더링만 하므로, 레벨/히트다이스/건강 수정치 기반 스탯 설명 변경 이유는 characters build rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 스탯 단계에서 HP 산식 설명, AC/속도/숙련도 카드 값, 레벨/건강 변경 시 카드 갱신 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 스탯 단계 종족/직업 reference popover에서 종족 title, 능력치 보너스/속도/크기, 직업 title/설명/주 능력치/히트다이스/주문시전 능력치 문구를 직접 조립하던 표시 모델을 `characterCreateDefaults.ts`의 `buildCreateStatReferenceViewModel`로 분리했다. 페이지는 reference section title/line 배열을 렌더링만 하므로, 종족·직업 참고 정보 표시 정책 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 스탯 단계의 `?` popover에서 종족 보너스/속도/크기와 직업 설명/주 능력치/히트다이스/주문시전 능력치 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 프로필 단계에서 이름 입력과 서브클래스 선택 시 `CharacterPayload`를 직접 spread로 갱신하던 기본 필드 전이를 `characterCreateDefaults.ts`의 `setCharacterCreateName`/`setCharacterCreateSubclass`로 분리했다. 페이지는 입력 이벤트 값을 helper에 전달하고 form state 적용만 담당하므로, 생성 폼 payload 필드 전이 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성/수정 모달에서 이름 입력, 서브클래스 선택/미선택 저장, review 단계 이름/서브클래스 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성/수정 모달 초상화 전이에서 업로드 이미지 적용, preset 선택, 삭제된 업로드 이미지 사용 중 기본 초상화 복구 시 `avatarType`/`avatarPresetId`/`avatarUrl`을 직접 spread로 갱신하던 로직을 `characterAvatarPresentation.ts`의 `applyUploadedAvatarToCharacterForm`/`applyAvatarPresetToCharacterForm`/`clearDeletedAvatarFromCharacterForm`으로 분리했다. 페이지는 avatar 이벤트와 form state setter만 연결하므로, 초상화 payload 전이 변경 이유는 characters avatar presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성/수정 모달에서 업로드 이미지 적용, preset 전환 시 업로드 URL 초기화, 사용 중인 업로드 이미지 삭제 후 기본 초상화 복구 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 스탯 단계 일반 능력치 입력에서 `abilities` 객체를 직접 spread로 갱신하던 전이를 `characterBuildRules.ts`의 `setAbilityScore`로 분리했다. 페이지는 ability key와 입력값만 전달하고, ability score map 갱신 규칙 변경 이유는 characters build rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 종족 선택 전 일반 능력치 입력과 종족 선택 후 point-buy 증감이 서로 기존처럼 동작하는지 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 특성 단계에서 ASI/Feat 선택, 단일 feature choice 선택, 다중 feature choice 토글 시 `features` 배열을 직접 spread로 갱신하던 전이를 `characterFeatureChoices.ts`의 `setCharacterCreateAsiFeatChoice`/`setCharacterCreateSingleFeatureChoice`/`toggleCharacterCreateMultiFeatureChoice`로 분리했다. 페이지는 선택 index/value와 definition만 전달하므로, 생성 특성 form payload 전이 변경 이유는 characters feature choices 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 특성 단계에서 ASI/Feat 선택, 단일 선택 feature, 다중 선택 feature 토글과 중복/최대 선택 제한 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 주문 단계에서 캔트립/슬롯 주문/준비 주문 선택 변경 시 `startingSpells` 필드를 직접 spread로 갱신하던 전이를 `characterSpellSelectionRules.ts`의 `setCharacterCreateStartingCantrips`/`setCharacterCreateStartingSlotSpells`/`setCharacterCreateStartingPreparedSpells`로 분리했다. 페이지는 선택된 주문 id 목록과 제한값만 전달하므로, 시작 주문 form payload 전이 변경 이유는 characters spell selection rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 주문 단계에서 캔트립 선택, 슬롯 주문 변경 시 준비 주문 후보 정리, 준비 주문 선택 제한 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 스탯 단계에서 레벨 기반 `proficiencyBonus`/`maxHp` 동기화와 point-buy 증감 결과를 form state에 직접 spread로 반영하던 전이를 `characterBuildRules.ts`의 `syncDerivedLevelStats`/`applyPointBuyAbilityAdjustment`로 분리했다. 페이지는 derived stats 또는 ability/delta 입력만 넘기므로, 레벨 수치 동기화와 point-buy form payload 전이 변경 이유는 characters build rules 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 스탯 단계에서 시나리오 레벨 변경 후 HP/숙련도 동기화, point-buy +/- 버튼 제한과 값 갱신 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 모달 기본 시나리오 지연 로딩 보정에서 `scenarioId`와 `level`을 직접 spread로 반영하던 전이를 `characterCreateDefaults.ts`의 `applyDefaultScenarioToCharacterFormState`로 분리했다. 페이지는 기본 시나리오 조회와 form state setter만 담당하므로, 기본 시나리오/시작 레벨 보정 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 시나리오 목록이 늦게 로드된 상태에서 새 캐릭터 모달을 열었을 때 기본 시나리오/시작 레벨이 자동 반영되는지 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 모달 서브클래스 select 변경 시 `CharacterLevelUpDraft`를 직접 spread로 갱신하던 전이를 `characterLevelUpDraft.ts`의 `setSubclassInLevelUpDraft`로 분리했다. 페이지는 select 이벤트 값만 draft helper에 전달하므로, 레벨업 draft 필드 전이 변경 이유는 characters level-up draft 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 서브클래스가 필요한 레벨 도달 시 선택값이 payload에 반영되는지 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 스탯 능력치 입력에서 `CharacterPayload.abilities`를 직접 spread로 갱신하던 전이를 `characterCreateDefaults.ts`의 `setCharacterCreateAbilityScore`로 옮기고, 시나리오/직업 select 변경 시 JSX 내부에서 lookup과 form projection을 함께 수행하던 흐름을 `applyScenarioSelectionToCharacterFormState`/`applyClassSelectionToCharacterFormState`로 감쌌다. 페이지는 입력 이벤트 값과 catalog만 전달하므로, 생성 폼 기본 필드/시나리오/직업 전이 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 모달에서 능력치 직접 입력, 시나리오 변경 시 시작 레벨/HP/숙련도/주문 placeholder 갱신, 직업 변경 시 추천 수치/초상화/장비/주문 초기화 수동 확인이다.
- 2026-07-03: `CharacterPage`가 직접 소유하던 `CharacterLevelUpDraft` state 초기화 effect와 주문/캔트립/교체/준비 주문/ASI/서브클래스 draft setter orchestration을 `useCharacterLevelUpDraft.ts` 훅으로 분리했다. 페이지는 레벨업 모달의 표시 계산과 API 제출 흐름을 유지하고, draft lifecycle과 field transition 변경 이유는 characters level-up draft hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달을 열 때 목표 레벨/기존 서브클래스/준비 주문 초기값, 목표 레벨 변경 시 draft 초기화, 주문·캔트립 습득/교체, 준비 주문 저장 수동 확인이다.
- 2026-07-03: `CharacterPage`가 직접 소유하던 생성/수정 모달 draft state(`editingCharacterId`, `formState`, `inventoryDraft`, `skillInput`, 단계 index, stats reference open, validation error)와 기본 생성/수정 draft 초기화 흐름을 `useCharacterCreateDraft.ts` 훅으로 분리했다. 페이지는 토스트 정리, 모달 표시 이벤트, submit orchestration을 유지하고, 생성 draft lifecycle 변경 이유는 characters create draft hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 새 캐릭터 생성 모달 열기/닫기, 수정 모달 열기, 생성 단계 index 초기화, 인벤토리 draft 복사, validation error 초기화 수동 확인이다.
- 2026-07-03: `CharacterPage`가 직접 소유하던 선택 캐릭터 id 유지 effect, 선택 캐릭터 lookup, 세션 사용 중 캐릭터 id set, 캐릭터 카드 view model 조립을 `useCharacterSelection.ts` 훅으로 분리했다. 페이지는 카드 클릭 이벤트와 선택된 캐릭터 기반 화면 렌더링만 유지하므로, 목록 선택 정책과 카드 표시 모델 변경 이유는 characters selection hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 목록 첫 진입 기본 선택, 선택된 캐릭터 삭제/목록 변경 시 선택 유지 또는 첫 항목 fallback, 사용 중 캐릭터 overlay 표시 수동 확인이다.
- 2026-07-03: `CharacterPage`가 직접 소유하던 삭제 확인 모달 state, 사용 중 캐릭터 삭제 차단 warning, warning 자동 dismiss effect, 삭제 확정 호출 흐름을 `useCharacterDeleteFlow.ts` 훅으로 분리했다. 페이지는 삭제 버튼/모달 버튼 이벤트 연결과 선택 캐릭터 표시만 유지하므로, 삭제 가능 정책과 삭제 UI lifecycle 변경 이유는 characters delete flow hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 사용 중 캐릭터 삭제 시 warning 표시/자동 사라짐, 미사용 캐릭터 삭제 확인 모달 열기/닫기, 삭제 확정 후 모달 닫힘 수동 확인이다.
- 2026-07-03: `CharacterPage`가 직접 소유하던 생성/수정 모달 open 중 body scroll lock effect와 `autoOpenCreate` 1회 실행 ref/effect를 `useCharacterCreateModalLifecycle.ts` 훅으로 분리했다. 페이지는 생성 모달을 여는 이벤트와 close/dismiss orchestration만 유지하므로, 모달 브라우저 side effect와 자동 오픈 lifecycle 변경 이유는 characters create modal lifecycle hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 세션에서 캐릭터 생성으로 진입할 때 모달 자동 오픈 1회 동작, 모달 open 중 배경 스크롤 잠금, close 후 스크롤 복원 수동 확인이다.
- 2026-07-03: `CharacterPage`가 직접 소유하던 생성 wizard 이전/다음 단계 이동 state 전이와 단계 이동 validation error 반영을 `useCharacterCreateDraft.ts`의 `goToPreviousCreateStep`/`goToNextCreateStep`으로 분리했다. 페이지는 현재 step validation에 필요한 화면 파생값만 전달하므로, 생성 wizard step lifecycle 변경 이유는 characters create draft hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 wizard에서 이전 버튼, profile 필수값 누락, 하위종족/서브클래스 누락, point-buy 오류, 필수 feature 미선택 시 다음 단계 차단 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 submit 처리에서 시작 장비 필수 선택 판정, 준비 주문 option count, 슬롯 주문 id 배열, 세션 배정 여부를 직접 조립하던 흐름을 `characterCreateDefaults.ts`의 `prepareCharacterCreateSubmitFromViewState`로 분리했다. 페이지는 화면 파생값과 API callback만 연결하고, submit 준비 파라미터 조립 변경 이유는 characters create defaults 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 제출 시 시작 장비 구체 선택 누락, 시작 주문/준비 주문 누락·중복, 세션 복귀 생성 시 assignToSession 반영 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 제출 처리에서 현재 레벨, active session 적용 여부, ASI/Feat 파생값, 준비 주문 제한을 DTO builder 파라미터로 직접 맞추던 흐름을 `characterLevelUpDraft.ts`의 `buildLevelUpCharacterPayloadFromViewState`로 분리했다. 페이지는 선택 캐릭터와 draft/view-state를 전달하고 API 호출 결과만 처리하므로, 레벨업 submit payload 조립 변경 이유는 characters level-up draft 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 사용 중 캐릭터 레벨업 시 active session 적용 여부, ASI/Feat 선택, 준비 주문 포함 payload 수동 확인이다.
- 2026-07-03: `CharacterPage`가 직접 소유하던 레벨업 모달 open/close state, 레벨업 API 제출 후 모달 닫기, 준비 주문 저장 API 호출 흐름을 `useCharacterLevelUpFlow.ts` 훅으로 분리했다. 페이지는 레벨업 모달 렌더링과 버튼 이벤트 연결만 유지하므로, 레벨업 모달 lifecycle과 submit/save orchestration 변경 이유는 characters level-up flow hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달 열기/닫기, 성공 레벨업 후 모달 닫힘, 준비 주문 저장 버튼 동작 수동 확인이다.
- 2026-07-03: `CharacterPage`가 직접 소유하던 초상화 업로드 asset hook 연결, 업로드 이미지 form 반영, 삭제된 업로드 이미지 사용 시 기본 초상화 복구, avatar picker view model 조립, 업로드 초상화 삭제 confirm 흐름을 `useCharacterAvatarPicker.ts` 훅으로 분리했다. 페이지는 초상화 picker 렌더링과 preset/upload/delete 이벤트 연결만 유지하므로, 초상화 라이브러리 lifecycle과 form projection 변경 이유는 characters avatar picker hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성/수정 모달에서 preset 선택, 이미지 업로드 후 자동 선택, 업로드 이미지 재선택, 삭제 confirm/삭제 후 기본 초상화 복구 수동 확인이다.
- 2026-07-03: `CharacterPage`가 직접 수행하던 생성 form의 derived stats 동기화, point-buy 증감, 일반 능력치 입력, 숙련 기술 추가/삭제 form 전이를 `useCharacterCreateDraft.ts`의 draft action으로 이동했다. 페이지는 현재 선택 종족/직업에서 나온 제한값과 이벤트 값만 전달하므로, 생성 draft field transition 변경 이유는 characters create draft hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 스탯 단계에서 레벨/건강 변경 시 HP·숙련도 동기화, point-buy +/- 증감, 일반 능력치 입력, 스킬 추가/삭제와 입력값 초기화 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 프로필 단계에서 이름, 기본 시나리오 지연 보정, 시나리오 선택, 종족/하위종족 선택, 직업 선택, 서브클래스 선택 시 form state를 직접 갱신하던 전이를 `useCharacterCreateDraft.ts`의 draft action으로 이동했다. 페이지는 select/input 이벤트 값과 현재 종족 능력치 보너스만 전달하므로, 생성 프로필 field transition 변경 이유는 characters create draft hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성/수정 모달에서 이름 입력, 기본 시나리오 자동 반영, 시나리오 변경, 종족/하위종족 변경, 직업 변경, 서브클래스 선택 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 특성/시작 장비/시작 주문 단계에서 ASI·Feat 선택, 단일/다중 feature choice, 시작 장비 slot/item, 캔트립/슬롯 주문/준비 주문 선택 시 form state와 validation error를 직접 갱신하던 전이를 `useCharacterCreateDraft.ts`의 draft action으로 이동했다. 페이지는 feature definition, 선택 index/value, 주문 id 목록 같은 이벤트 입력만 전달하므로, 생성 draft 선택 전이 변경 이유는 characters create draft hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 특성/장비/주문 단계에서 ASI·Feat 중복 제한, feature 필수 선택, 시작 장비 구체 item 선택, 주문 선택 제한과 준비 주문 후보 정리를 수동 확인이다.
- 2026-07-03: `CharacterPage`의 레벨업 주문 선택 UI에서 교체 주문/신규 주문/교체 캔트립/신규 캔트립/준비 주문 변경 시 레벨업 제한값을 끼워 넣던 wrapper 함수들을 `useCharacterLevelUpDraft.ts`의 `bindSpellSelectionActions`로 이동했다. 페이지는 현재 계산된 제한값을 한 번 전달하고 `SpellSelectionGrid`에는 바인딩된 action만 연결하므로, 레벨업 주문 draft 전이 변경 이유는 characters level-up draft hook에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 주문 교체 가능 여부, 신규 주문/캔트립 선택 개수 제한, 준비 주문 저장 제한 수동 확인이다.
- 2026-07-03: `useCharacterLevelUpDraft.ts`에서 `CharacterPage`가 더 이상 사용하지 않는 개별 주문 toggle/set 공개 action을 제거하고, 레벨업 주문 선택 UI가 사용하는 공개 표면을 `bindSpellSelectionActions` 중심으로 축소했다. 훅 외부는 제한값이 적용된 action 묶음만 사용하므로, 레벨업 draft 변경 경로가 줄고 주문 선택 정책 변경 이유가 hook 내부에 더 선명하게 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 레벨업 모달에서 주문/캔트립 교체와 신규 선택, 준비 주문 선택이 기존처럼 동작하는지 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성/수정 제출 처리에서 submit view-state 검증, validation error 반영, create/update API 분기, 성공 시 생성 draft 닫기를 `useCharacterCreateDraft.ts`의 `submitDraft`로 이동했다. 페이지는 현재 화면에서 계산한 검증 입력과 API callback을 전달하고, 성공 후 toast 정리와 세션 복귀 navigation만 처리하므로, 생성 draft 제출 lifecycle 변경 이유는 characters create draft hook에 모인다. 이 이동 후 페이지가 쓰지 않는 `inventoryDraft`, `setInventoryDraft`, `setFormValidationError` 같은 draft 내부 setter 공개도 줄였다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성/수정 제출 시 필수값 오류 표시, 정상 생성/수정 후 모달 닫힘, 세션 복귀 생성 후 자동 복귀 수동 확인이다.
- 2026-07-03: `CharacterPage`의 생성 모달 open 후 시나리오 목록이 늦게 로드될 때 기본 시나리오/시작 레벨을 보정하던 effect를 `useCharacterCreateDraft.ts`로 이동했다. 페이지는 시나리오 그룹 렌더링만 담당하고, 생성 draft의 지연 데이터 보정 lifecycle은 hook 내부에서 처리하므로, 생성 모달 초기화/보정 변경 이유가 characters create draft hook에 모인다. 이 이동 후 페이지의 `getPreferredScenario` import와 `applyDefaultScenario` 공개 action 의존도 제거했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 시나리오 목록 로딩이 늦은 상태에서 생성 모달을 열었을 때 기본 시나리오와 시작 레벨이 자동 반영되는지 수동 확인이다.
- 2026-07-03: `CharacterPage`에 남아 있던 `applyCreateAncestryChange`, `adjustAbilityBase`, `updateAbility`, `addSkill`, `removeSkill` 같은 단순 wrapper 함수를 제거하고 JSX 이벤트에서 `useCharacterCreateDraft.ts`의 draft action을 직접 호출하도록 정리했다. 페이지 함수 목록은 모달 열기/닫기, 단계 이동, 제출, 복제처럼 페이지 orchestration에 가까운 흐름만 남고, 생성 form field transition 변경 이유는 draft hook action에 더 명확히 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 생성 모달에서 종족/하위종족 선택, point-buy +/- 버튼, 일반 능력치 입력, 기술 추가/삭제 수동 확인이다.

## P2-1. MainCommandsService 분리

### 현재 문제

`MainCommandsService`는 플레이어 자연어 명령을 처리하는 핵심 서비스지만, 현재는 AI interpreter 라우팅, 명령 검증, 판정 옵션 생성, 장면 전환 조건 평가, VTT check effect, 로그 저장을 모두 직접 수행한다.

2026-07-04 점검 기준으로는 이미 많은 책임이 `MainCommand*` 서비스로 이동했다. 추가 분리보다 우선할 문제는 `MainCommandsService` 생성자와 module provider 목록이 커졌고, 일부 협력 객체가 기본값으로 직접 생성된다는 점이다. 이 상태에서 service를 더 늘리면 SRP 개선보다 DI/test wiring 비용이 커진다.

### 목표 구조

- `MainCommandsService`
  - submit/resolve facade.
  - 협력 객체를 직접 생성하지 않고 Nest DI 또는 명시적인 pure module 호출만 사용한다.

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

1. 이미 분리된 service 목록을 기능 축별로 묶어 검토한다.
2. DB/socket/AI 의존이 없는 단순 projection은 pure module로 둘 수 있는지 확인한다.
3. `MainCommandsService` 생성자에서 `new MainCommand...Service(...)` 기본값을 제거하고, 실제 provider 주입 또는 pure function 호출로 통일한다.
4. `ActionsModule` provider 목록이 지나치게 커진 경우 하위 module 또는 feature-level provider 묶음 도입 여부를 검토한다.
5. 추가 service 추출은 새 변경 이유가 명확할 때만 진행한다.

### 검증 안내

사용자가 단계 완료 후 실행할 명령:

```bash
npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts
```

진행 기록:

- 2026-07-02: main command intent별 판정 옵션 생성과 suggested difficulty -> DC 변환을 `MainCommandCheckBuilderService`로 분리했다. `MainCommandsService`는 interpreter route와 intent handler runtime에 새 서비스의 builder를 주입하고, 직접 check option 정책을 소유하지 않도록 축소했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 설득/위협/속임/통찰/조사/위험 감지/특수 이동/도구 사용 명령의 check option 수동 확인이다.
- 2026-07-02: main command intent별 target/item/spell/mapPoint requirement, target type 허용 목록, 화면 노출 대상 검증, interpreter route 누락 필드 안내를 `MainCommandValidatorService`로 분리했다. `MainCommandsService`는 submit/interpreter route 흐름에서 검증 서비스를 호출하고, 자유 입력 대상 후보 해석에 필요한 허용 target type 정책만 조회한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 대상 필수/아이템 필수/주문 필수/지도 좌표 필수 명령의 수동 확인이다.
- 2026-07-02: 장면 전환 후보 매칭, default/auto 조건 판정, 자연어 조건 term 매칭, 구조화된 transition condition rule 평가, interpreter transition condition contract 평가, transition condition parser를 `MainCommandTransitionEvaluatorService`로 분리했다. `MainCommandsService`는 전환 후보 로딩, 상태 변경, snapshot 발행을 유지하고 조건 평가 정책은 새 서비스에 위임한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 default transition, 단서 공개 조건, 전투 종료 조건, GM 승인 조건, 다중 분기 목적지 지정 수동 확인이다.
- 2026-07-02: interpreter action type -> main command/map control/meta/out-of-scope route 매핑, OUT_OF_SCOPE 조사 텍스트 fallback, fallback interpreted command 보정, interpreter route용 target/item/spell DTO 조립, route metadata 생성을 `MainCommandInterpreterRouterService`로 분리했다. `MainCommandsService`는 AI interpreter 실행 결과를 받아 응답/dispatch 흐름만 조율하고, 자연어 라우팅 정책 변경은 새 서비스 안에서 끝나도록 축소했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 자유 입력 대화/조사 fallback, 맵 이동·공격 안내, 게임 설명 질문, 대상 후보가 여럿인 NPC 명령 수동 확인이다.
- 2026-07-02: 세션 조회, membership 확인, AI GM/PLAYING 상태 검증, 참가자/활성 캐릭터/캐릭터 소유자 검증, 현재 노드 조회, screenType/nodeId 검증, 보유 아이템 검증, `LoadedContext` 조립을 `MainCommandContextLoaderService`로 분리했다. `MainCommandsService`는 submit 흐름에서 context loader 결과만 받아 가시 엔티티 추출과 명령 dispatch를 이어가며, 기존 spec의 `loadContext` mock 진입점은 얇은 위임 wrapper로 유지했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts`와 AI/Human GM 세션, 미참가자, 캐릭터 미선택, actor mismatch, screenType mismatch, 아이템 미보유 명령 수동 확인이다.
- 2026-07-02: main command 결과의 `TurnLog` 생성 payload 조립, raw input 선택, effective command fallback 해석, response status -> `ActionOutcome` 변환, turn log socket 발행, game state version bump를 `MainCommandPersistenceService`로 분리했다. `MainCommandsService`는 결과 저장/상태 변경 요청을 persistence 서비스에 위임하고, 명령 실행 흐름과 후속 단서 공개 orchestration에 집중하도록 축소했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts`와 슬래시 명령 원문 로그, 자유 입력에서 effective command 로그, 체크 필요 응답, 성공 후 단서 공개 시 snapshot 갱신 수동 확인이다.
- 2026-07-02: VTT door/hazard/object check effect와 main command check effect payload parsing, check option/action candidate 재구성, map point/DC/string array guard를 `MainCommandCheckEffectParserService`로 분리했다. `MainCommandsService`는 check resolve 흐름에서 parser 결과만 받아 후속 효과 적용과 응답 조립을 담당하므로, effect schema 변경 이유가 새 parser 서비스로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts`와 문 열기/파괴, 함정 해제, 오브젝트 파괴, main command check 성공·실패 후속 효과 수동 확인이다.
- 2026-07-03: main command check resolve 흐름에 남아 있던 dice result 정규화, roll summary 문구 조립, 성공/실패 판정 narration, SOCIAL/READ_EMOTION 성공 시 AI check-result 보강 호출을 `MainCommandCheckResultNarrationService`로 분리했다. `MainCommandsService`는 check 후속 효과 적용, 단서/오브젝트 공개, turn log 저장 orchestration을 유지하고, 판정 결과 문구와 AI 보강 정책 변경 이유는 narration 서비스에 모인다. 기존 narration spec도 새 서비스 대상 검증으로 전환했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts`와 설득/위협/속임/감정 읽기/조사/특수 이동 check 성공·실패 문구, dice summary 포함 turn log 수동 확인이다.
- 2026-07-03: node metadata에서 visible scene entity를 추출하는 규칙, `isVisible` 필터, 대상 id/name/부분 이름 매칭, 단일 후보 fallback을 `MainCommandSceneEntityService`로 분리했다. `MainCommandsService`, `MainCommandValidatorService`, `MainCommandInterpreterRouterService`가 같은 scene entity resolver를 공유하므로, 대상 노출/매칭 규칙 변경 이유가 새 서비스 한 곳에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 NPC 이름 일부 입력, 숨김 오브젝트 제외, 대상 필수 명령, 자유 입력 interpreter route의 대상 자동 보정 수동 확인이다.
- 2026-07-03: 자유 입력을 명시 행동으로 인정할지 판단하는 `canUseExplicitPlayerText`와 AI clarification 상태에서 check가 필요한지 판정하는 `shouldRequireMainCommandCheck`를 `MainCommandValidatorService`로 이동했다. `MainCommandsService`와 intent handler runtime은 validator 메서드를 공유하므로, 자연어 명령의 clarification bypass/check required 정책 변경 이유가 validator에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 짧은 대상 지정 발화, 한국어 행동 동사 포함 자유 입력, requiresRoll/needsClarification 조합별 check required 응답 수동 확인이다.
- 2026-07-03: 힌트 명령 처리 중 남아 있던 VTT map 조회, 아직 발동하지 않은 proximity event hint 추출, event reveal 중복 제거, 공개 단서 전부 발견 여부 판정을 `MainCommandHintContextService`로 분리했다. `MainCommandsService.handleHint`는 힌트 보강 컨텍스트를 받아 완료 메시지 또는 AI hint 호출만 조율하므로, 지도 이벤트 힌트와 단서 완료 판정 변경 이유가 새 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 힌트 명령에서 미발동 지도 이벤트 표시, 이미 공개된 event 제외, 모든 단서 발견 시 완료 메시지 수동 확인이다.
- 2026-07-03: 룰 질문 처리 중 `MainCommandsService`에 남아 있던 SRD rule fragment 후보 경로 탐색, JSONL 읽기, fragment schema guard, in-memory cache를 `MainCommandRuleFragmentService`로 분리했다. `handleRuleQuery`는 AI interpreter가 반환한 rule id와 fragment 목록을 매칭해 응답 문구만 조립하고, SRD fragment 파일 위치/파싱 규칙 변경 이유는 새 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 룰 질문에서 관련 rule id 반환 시 최대 3개 요약 표시, fragment 파일 누락 시 fallback 메시지 수동 확인이다.
- 2026-07-03: 장면 전환과 힌트 양쪽에서 쓰이던 최근 턴 로그 로딩, 공개 단서 요약 추출, 공개된 단서 상태 조회, 방문 노드 조회, 전환 평가용 `TransitionEvidence` 조립을 `MainCommandProgressEvidenceService`로 분리했다. `MainCommandsService`는 기존 spec 진입점을 보존하는 얇은 wrapper만 유지하고, `MainCommandHintContextService`도 공개 단서 완료 판정에 같은 evidence 서비스를 공유하므로 진행 증거 스키마와 조회 정책 변경 이유가 새 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 장면 전환 조건에서 공개된 단서/방문 노드/전투 완료 flag 반영, 힌트 명령의 모든 단서 발견 판정 수동 확인이다.
- 2026-07-03: 장면 전환 후보 로딩 중 transition JSON 파싱, fallback node 후보 생성, target session scenario node 조회, node type 정규화를 `MainCommandTransitionCandidateService`로 분리했다. `MainCommandsService`는 기존 `loadTransitionCandidates` wrapper를 유지해 spec mock 지점을 보존하고, 전환 후보 데이터 계약 변경 이유는 새 candidate 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 명시 transition, fallback transition, 존재하지 않는 target node 제외, 목적지 지정 장면 진행 수동 확인이다.
- 2026-07-03: 장면 전환 적용 중 target node 조회, target node의 기본 VTT map 병합, game state의 current node/phase/version 갱신, `sessionNodeVisit` upsert를 `MainCommandSceneTransitionStateService`로 분리했다. `MainCommandsService`는 기존 `applySceneTransition` wrapper를 유지해 spec mock 지점을 보존하고, 장면 이동 시 저장되는 상태와 방문 기록 변경 이유는 새 상태 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 장면 진행 후 current node/phase 변경, 기본 VTT map 반영, 방문 횟수 증가, 존재하지 않는 target node 거절 수동 확인이다.
- 2026-07-03: 장면 전환 성공/차단 응답 DTO 조립, 차단 status 선택, transition condition metadata 노출, node type -> phase state patch 변환을 `MainCommandSceneTransitionResponseService`로 분리했다. `MainCommandsService.resolveSceneTransition`은 전환 적용과 snapshot 발행 순서만 조율하고, 장면 전환 응답 형식 변경 이유는 새 response 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 전환 성공 응답의 statePatch, 조건 미충족/GM 검토 필요 응답의 status/data, 다중 분기 안내 수동 확인이다.
- 2026-07-03: 장면 진행 요청이 ending node에 도달했는지 판정하는 node meta 해석, `completeSessionFromEndingNode` 호출, ending node 완료 응답 조립을 `MainCommandEndingNodeService`로 분리했다. `MainCommandsService.handleSceneTransition`은 엔딩 응답이 있으면 즉시 반환하고, 아니면 전환 후보 평가를 이어가므로 세션 완료 트리거와 일반 장면 전환 변경 이유가 분리된다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 `isEndingNode`, `endBehavior: "SESSION_COMPLETE"` 노드에서 세션 완료 처리, 일반 노드에서 후보 로딩 계속 진행 수동 확인이다.
- 2026-07-03: 장면 전환의 후보 없음, 만족한 분기 다수, 모든 분기 조건 불충족 응답도 `MainCommandSceneTransitionResponseService`로 추가 이동했다. `MainCommandsService.handleSceneTransition`은 후보 평가 결과를 어떤 응답으로 보여줄지 직접 조립하지 않고 response 서비스에 위임하므로, 장면 진행 UX 문구와 metadata 변경 이유가 response 서비스로 더 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 다음 노드 없음, 복수 목적지 안내, missing terms metadata 수동 확인이다.
- 2026-07-03: VTT door/hazard/object check 결과 처리 중 effect parsing, 현재 노드 mismatch 거절, 성공 시 VTT 상태 변경 호출, 실패 메시지 선택, dice summary 포함 turn log 저장과 socket 발행, 응답 조립을 `MainCommandVttCheckResultService`로 분리했다. `MainCommandsService.resolveMainCommandCheck`는 VTT check 결과가 있으면 즉시 반환하고, 없을 때만 일반 main command check 후속 처리를 이어가므로 VTT 후속 효과 변경 이유와 일반 명령 판정 변경 이유가 갈라진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts`와 문 열기/파괴, 함정 해제, 오브젝트 파괴 check 성공·실패, 현재 노드 불일치 거절, dice summary turn log 수동 확인이다.
- 2026-07-03: 일반 main command check 성공 후 오브젝트 내용 공개, 시야 내 오브젝트 발견 표시, 행동 단서 공개, 공개된 단서/아이템 문구 조립, 공개 count 반환을 `MainCommandCheckRevealService`로 분리했다. `submitMainCommand`의 즉시 오브젝트 조사 공개도 같은 서비스의 `applyImmediateObjectInvestigation`을 사용하므로, VTT 공개 정책과 공개 문구 변경 이유가 `MainCommandsService`에서 빠지고 check reveal 서비스로 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts`와 오브젝트 조사 즉시 공개, check 성공 후 단서/아이템 공개, 관찰 명령의 오브젝트 표시, 공개 발생 시 snapshot 발행 수동 확인이다.
- 2026-07-03: 일반 main command check 성공 후 `SPECIAL_MOVE`의 token 이동 적용, 이동 실패 시 결과 메시지 교체와 turn log outcome 보정을 `MainCommandCheckMovementService`로 분리했다. `MainCommandsService.resolveMainCommandCheck`는 이동 보강 결과만 받아 이후 공개 처리와 turn log 저장을 이어가므로, 이동 규칙/실패 처리 변경 이유가 check movement 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts`와 특수 이동 check 성공 시 token 이동, 이동 불가 시 `IMPOSSIBLE` outcome과 메시지 보정 수동 확인이다.
- 2026-07-03: 일반 main command check 결과의 `TurnLog` payload 조립, dice result 포함 structured action 저장, outcome 반영, turn log socket 발행을 `MainCommandCheckResultLogService`로 분리했다. `MainCommandsService.resolveMainCommandCheck`는 최종 narration 문자열을 만든 뒤 로그 서비스에 전달하고 응답을 반환하므로, check 결과 기록/발행 변경 이유가 새 로그 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts`와 check 성공/실패 turn log payload, 특수 이동 불가 시 outcome 보정, dice summary narration 수동 확인이다.
- 2026-07-03: 일반 main command check 후속 처리의 effect parsing, 처리 불가/mismatched node 응답, dice result 정규화와 roll summary 생성, 기본 성공/실패 result 생성을 `MainCommandCheckResolutionService`로 분리했다. `MainCommandsService.resolveMainCommandCheck`는 VTT check가 아닌 일반 check를 준비 서비스에서 받은 뒤 movement/reveal/log 단계만 조율하므로, check 입력 계약 검증과 후속 효과 orchestration 변경 이유가 나뉜다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts`와 잘못된 check effect 거절, 현재 노드 불일치 거절, dice summary 포함 성공/실패 narration 수동 확인이다.
- 2026-07-03: `CHECK_REQUIRED` 응답에 붙는 main command check effect payload 조립과 action candidate 기본 projection을 `MainCommandCheckEffectAttachmentService`로 분리했다. `MainCommandsService`는 기존 `buildActionCandidate`/`attachMainCommandCheckEffect` wrapper를 유지해 intent handler runtime 호출면을 보존하고, check effect 스키마와 후보 projection 변경 이유는 attachment 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 check required 응답의 `data.checkEffect`, target/item/mapPoint/checkOption/publicClues/actionCandidate payload 수동 확인이다.
- 2026-07-03: AI interpreter 호출 payload의 raw text, scene summary, 최근 로그, 가시 대상 id/detail 목록, target type fallback 조립을 `MainCommandInterpreterPayloadService`로 분리했다. `MainCommandsService`는 기존 `buildInterpreterPayload` wrapper만 유지해 intent handler runtime 호출면을 보존하고, interpreter 입력 projection 변경 이유는 payload 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 자유 입력에서 available target/detail, 최근 로그 전달, target id만 있을 때 target type 보정 수동 확인이다.
- 2026-07-03: 아이템 명령 문구에 쓰이는 보유 인벤토리 item id/itemDefinitionId/name 매칭과 `"도구"` fallback을 `MainCommandInventoryLabelService`로 분리했다. `MainCommandsService`는 기존 `resolveOwnedItemName` wrapper만 유지해 intent handler runtime 호출면을 보존하고, 아이템 표시명/식별자 매칭 정책 변경 이유는 inventory label 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 아이템 id, itemDefinitionId, 이름 입력, itemId 누락 시 도구 fallback 문구 수동 확인이다.
- 2026-07-03: NPC 대화 명령의 NPC 대상 해석, AI dialogue request 조립, speaker metadata 응답 생성을 `MainCommandNpcDialogueService`로 분리했다. `MainCommandsService`는 기존 `handleNpcDialogue` wrapper를 유지해 dispatch/runtime 호출면을 보존하고, NPC 대화 입력/응답 계약 변경 이유는 새 dialogue 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 NPC 대상 지정 대화, NPC 미지정 오류, 최근 로그 6개 전달, `data.npcDialogue` speaker metadata 수동 확인이다.
- 2026-07-03: 힌트/요약/전술 질의의 AI request DTO 조립, recent log/public clue slice 정책, 힌트 완료 메시지, AI 응답 message DTO 생성을 `MainCommandAiQueryService`로 분리했다. `MainCommandsService`는 기존 `handleHint`/`handleSummary`/`handleTacticQuery` wrapper를 유지해 dispatch/runtime 호출면을 보존하고, AI query 입력/응답 계약 변경 이유는 새 query 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 힌트의 미발동 지도 이벤트/모든 단서 발견 메시지, 요약의 최근 로그 fallback, 전술 질의 public clue 전달 수동 확인이다.
- 2026-07-03: 룰 질문 처리 중 AI interpreter 호출, required rule id와 fragment 매칭, 관련 명령 prefix, 최대 3개 규칙 요약 응답, rule fragment 누락 fallback 메시지를 `MainCommandRuleQueryService`로 분리했다. `MainCommandsService`는 기존 `handleRuleQuery` wrapper만 유지하고, rule fragment 파일 로딩은 `MainCommandRuleFragmentService`, 룰 질문 응답 계약은 query 서비스로 나뉘므로 변경 이유가 더 작아진다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 관련 rule id 반환 시 최대 3개 요약, `relatedIntent` prefix, fragment 매칭 실패 fallback 수동 확인이다.
- 2026-07-03: 장면 정보 명령의 target entity 해석, 대상별 `"이름: 요약"` 메시지, 대상이 없을 때 현재 장면 본문 fallback 응답을 `MainCommandSceneInfoService`로 분리했다. `MainCommandsService`는 기존 `handleSceneInfo` wrapper만 유지하고, 화면 정보 표시 계약 변경 이유는 scene info 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 대상 지정 장면 정보, 단일 visible entity fallback, 대상 미지정 시 현재 장면 본문 응답 수동 확인이다.
- 2026-07-03: 장면 전환 resolution 단계의 조건 미충족 차단 응답, scene transition state 적용, session snapshot 빌드/발행, 성공 응답 조립 순서를 `MainCommandSceneTransitionResolutionService`로 분리했다. `MainCommandsService`는 후보 선택과 조건 평가 흐름만 유지하고, 전환 적용 후 실시간 동기화 정책 변경 이유는 resolution 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 전환 성공 후 snapshot 발행, 조건 미충족/GM 검토 필요 응답, target node phase/statePatch 수동 확인이다.
- 2026-07-03: main command 결과 저장 이후의 행동 단서 공개 가능 여부 판정, `revealCurrentNodeCluesAfterAction` 호출, 즉시 오브젝트 공개 count와 합산한 scenario state 변경, session snapshot 발행을 `MainCommandPostActionRevealService`로 분리했다. `MainCommandsService.submitMainCommand`는 응답 생성, immediate object reveal, turn log 저장 후 후속 공개 서비스를 호출만 하므로, 행동 후 공개/동기화 정책 변경 이유가 새 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 실제 행동 후보 응답의 단서 공개, `DECLARE_RP_ACTION`/불가/GM 승인/check required 응답에서 공개 미실행, 공개 발생 시 snapshot 발행 수동 확인이다.
- 2026-07-03: 일반 main command check 성공 후 reveal count 합산, scenario state 변경, session snapshot 발행 조건을 `MainCommandCheckRevealSyncService`로 분리했다. `MainCommandsService.resolveMainCommandCheck`는 reveal 적용과 turn log 저장 후 sync 서비스에 outcome/count만 전달하므로, check 공개 이후 동기화 정책 변경 이유가 새 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts`와 check 성공 후 단서/오브젝트/관찰 공개 시 snapshot 발행, check 실패 또는 reveal count 0일 때 snapshot 미발행 수동 확인이다.
- 2026-07-03: 자유 입력 interpreter route 중 `GAME_META_QUESTION`, `MAP_CONTROL_ACTION`, `OUT_OF_SCOPE`, missing requirement 응답의 메시지/status/`interpreterRoute` metadata 조립을 `MainCommandInterpreterRouteResponseService`로 분리했다. `MainCommandsService`는 MAIN_COMMAND route dispatch만 직접 이어가고, route 응답 표시 계약 변경 이유는 route response 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 게임 설명 질문, 맵 이동/공격 안내, 처리 불가 route, target/item/spell 누락 안내의 `data.interpreterRoute` 수동 확인이다.
- 2026-07-03: 자유 입력이 실제 main command로 라우팅된 뒤 응답 `data`에 `effectiveMainCommand`와 `interpreterRoute`를 병합하는 후처리를 `MainCommandInterpreterRouteResponseService.withRoutedMainCommandData`로 이동했다. `MainCommandsService.handleInterpreterMainCommandRoute`는 dispatch 결과를 받아 route response 서비스에 보강을 위임하므로, 자유 입력 로그/응답 metadata 변경 이유가 route response 서비스에 더 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 자유 입력 대화/조사/힌트 라우팅 응답의 `data.effectiveMainCommand`, `data.interpreterRoute`, 기존 response data 보존 수동 확인이다.
- 2026-07-03: 자유 입력 interpreter가 명시 route로 매핑되지 않았을 때의 clarification 응답, check required 응답, 낮은 confidence GM 승인 응답, 행동 후보 기록 응답 문구/status/check option payload 조립을 `MainCommandInterpreterRouteResponseService`로 이동했다. `MainCommandsService.handleGeneralGmRequest`는 interpreter 실행과 route 선택만 조율하고, 자유 입력 fallback 응답 표시 계약 변경 이유는 route response 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 clarification 질문, requiresRoll check required, low confidence GM approval, route 미매칭 행동 후보 기록 응답 수동 확인이다.
- 2026-07-03: OUT_OF_SCOPE 자유 입력을 조사 명령으로 fallback할 때 intent 판정, `ResolvedInterpreterActionRoute` 조립, fallback interpreted command 보정을 한 번에 반환하는 `resolveTextFallbackRoute`를 `MainCommandInterpreterRouterService`에 추가했다. `MainCommandsService.handleGeneralGmRequest`는 fallback bundle을 받아 dispatch만 수행하므로, 자연어 fallback route 계약 변경 이유가 router 서비스에 더 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 OUT_OF_SCOPE 조사/살피기/확인 자유 입력이 `INVESTIGATE_OBJECT` route로 보정되는지 수동 확인이다.
- 2026-07-03: intent handler 내부에 있던 GM 승인 필요 intent 목록을 `MainCommandApprovalPolicyService`로 분리했다. `MainCommandIntentHandlersRunner`는 combat talk 등에서 approval 필요 여부를 policy에 질의하므로, 어떤 자연어/전투/아이템 intent가 즉시 실행 대신 GM 승인 흐름으로 가는지의 변경 이유가 policy 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-command-intent-handlers.service.spec.ts main-commands.service.spec.ts`와 `SPLIT_PARTY_TASK`, `COMBAT_MANEUVER`, `USE_ITEM_COMBAT`, `USE_SPELL_CREATIVELY` 계열 자유 입력의 GM 승인 응답 수동 확인이다.
- 2026-07-03: `MainCommandIntentHandlersService`가 `MainCommandApprovalPolicyService`를 생성자 주입받아 runner에 전달하도록 정리했다. `MainCommandsService`의 수동 기본 생성 경로도 같은 policy 인스턴스를 넘기므로, approval policy provider 등록과 실제 사용 경로가 일치한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-command-intent-handlers.service.spec.ts main-commands.service.spec.ts`와 approval policy mock/override가 runner에 반영되는지 수동 확인이다.
- 2026-07-04: `MainCommandsService` 생성자에 남아 있던 `new MainCommand...Service(...)` 기본값 조립을 제거하고, production runtime에서는 `ActionsModule` provider 기반 DI만 사용하도록 정리했다. 기존 spec의 간단 생성 경로는 `createMainCommandsService` 테스트 fixture helper로 이동해, 수동 조립 책임이 application facade가 아니라 테스트 setup에만 남는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 자유 입력 라우팅, check required/resolve, 장면 전환, 힌트/룰 질문 수동 확인이다.
- 2026-07-04: Main command 하위 provider 중 `MainCommandIntentHandlersService`, `MainCommandInterpreterRouterService`, `MainCommandInterpreterRouteResponseService`, `MainCommandHintContextService`, `MainCommandNpcDialogueService`, `MainCommandProgressEvidenceService`, `MainCommandTransitionCandidateService`, `MainCommandVttCheckResultService` 등에 남아 있던 내부 `new MainCommand...Service(...)` 기본 조립을 제거했다. production runtime의 의존성 그래프는 `ActionsModule` provider 등록을 따르고, spec의 수동 생성은 `main-commands.service.spec.ts` fixture helper에만 남긴다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`와 자유 입력 라우팅, approval policy override, 힌트/전환 후보, VTT check result 수동 확인이다.

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

### 진행 기록

- 2026-07-03: `fe/src/services/api.ts`가 도메인 API re-export barrel로 축소된 상태에서, characters feature 훅의 legacy barrel 의존을 추가로 줄였다. `useCharacterCatalogs.ts`는 `listItems`/`listRuleCatalog`를 `catalogApi.ts`에서 직접 가져오고, `useCharacterAvatarAssets.ts`는 avatar asset 목록/업로드/삭제 wrapper를 `characterApi.ts`에서 직접 가져오도록 바꿨다. `features/characters`와 `CharacterPage`는 더 이상 `services/api.ts`를 통하지 않으므로, 캐릭터 기능의 API 변경 이유가 catalog/character 도메인 API 파일로 더 직접 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성/수정 모달에서 아이템/룰 catalog 로딩, 초상화 라이브러리 목록/업로드/삭제 수동 확인이다.
- 2026-07-03: 인증/프로필 훅의 legacy API barrel 의존을 도메인별 API로 전환했다. `useAuth.ts`는 guest/login/logout/reissue/me/oauth/delete/update API를 `authApi.ts`에서 직접 가져오고, 인증 만료/토큰 재발급 이벤트만 `httpClient.ts`에서 가져오도록 분리했다. `useCurrentProfile.ts`도 `getMe`를 `authApi.ts`에서 직접 가져온다. 인증 훅 변경 이유는 auth API와 http client 이벤트로 나뉘며, `hooks` 영역에서 남은 `services/api.ts` 의존은 세션/캐릭터/액션 API가 섞인 `useSession.ts`로 좁혀졌다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 게스트 로그인, 이메일 로그인/로그아웃, 토큰 만료 후 재발급, 내 프로필 로딩 수동 확인이다.
- 2026-07-03: `useSession.ts`의 legacy API barrel 의존을 제거하고, 캐릭터 CRUD/레벨업/세션 캐릭터 선택은 `characterApi.ts`, Human GM runtime 변경은 `humanGmApi.ts`, 세션 생성/참여/시작/이탈/ready/turn log/rest/main command는 `sessionApi.ts`에서 직접 가져오도록 분리했다. 이로써 `fe/src/hooks` 영역은 더 이상 `services/api.ts`를 통하지 않으며, 세션 훅 내부 orchestration은 유지하되 endpoint 변경 이유는 도메인 API 파일로 분산된다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 세션 목록/생성/참여/시작/이탈, 캐릭터 생성·수정·삭제·레벨업, Human GM 설정 변경, 메인 커맨드/휴식 액션 수동 확인이다.
- 2026-07-03: 작은 페이지들의 legacy API barrel 의존을 추가로 줄였다. `SessionCreatePage.tsx`와 `SessionDiscoverPage.tsx`는 scenario preview 조회를 `scenarioApi.ts`에서 직접 가져오고, `PublicProfilePage.tsx`는 공개 프로필 조회를 `authApi.ts`에서 직접 가져오며, `ProfilePage.tsx`는 내 캐릭터 목록을 `characterApi.ts`, 세션/캐릭터 vault/이관 요청을 `sessionApi.ts`에서 직접 가져오도록 분리했다. 남은 `services/api.ts` 의존은 App, PlayPage, ScenarioPage, ScenarioEditorPage, SessionDetailPage처럼 더 큰 화면으로 좁혀졌다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 세션 생성/탐색의 시나리오 preview, 공개 프로필 조회, 내 프로필의 캐릭터/세션/vault/이관 요청 수동 확인이다.
- 2026-07-03: `App.tsx`의 legacy API barrel 의존을 도메인별 import로 전환했다. OAuth URL 조회는 `authApi.ts`, race/class catalog 조회는 `catalogApi.ts`, 사용 가능한 시나리오 목록은 `scenarioApi.ts`, 세션 상세 조회는 `sessionApi.ts`에서 직접 가져온다. 앱 shell의 데이터 bootstrap은 유지하면서 endpoint 변경 이유가 auth/catalog/scenario/session API 파일로 나뉘었고, 남은 `services/api.ts` 의존은 PlayPage, ScenarioPage, ScenarioEditorPage, SessionDetailPage로 좁혀졌다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 앱 첫 진입 시 OAuth 버튼 URL, race/class catalog 로딩, 시나리오 목록 로딩, 세션 상세 진입 수동 확인이다.
- 2026-07-03: `SessionDetailPage.tsx`의 campaign archive, long campaign completion, character transfer approve/reject, session detail 조회 API import를 legacy barrel에서 `sessionApi.ts` 직접 import로 전환했다. 세션 상세 페이지의 endpoint 변경 이유가 session 도메인 API 파일로 모이고, 남은 `services/api.ts` 의존은 PlayPage, ScenarioPage, ScenarioEditorPage로 좁혀졌다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 세션 상세 조회, 장기 캠페인 완료/아카이브 조회, 캐릭터 이관 승인/거절 수동 확인이다.
- 2026-07-03: `ScenarioPage.tsx`와 `ScenarioEditorPage.tsx`의 시나리오 CRUD, 공개/비공개 전환, 신고/모더레이션, fork, asset 목록/업로드/삭제 API import를 legacy barrel에서 `scenarioApi.ts` 직접 import로 전환했다. 시나리오 라이브러리와 에디터의 endpoint 변경 이유가 scenario 도메인 API 파일로 모이고, 남은 `services/api.ts` 의존은 PlayPage 하나로 좁혀졌다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 시나리오 목록/검색/삭제/복제/신고/모더레이션, 에디터 저장/발행/asset 업로드·삭제 수동 확인이다.
- 2026-07-03: `PlayPage.tsx`의 combat/catalog/character/Human GM/scenario/session/VTT map API import를 도메인별 파일(`combatApi.ts`, `catalogApi.ts`, `characterApi.ts`, `humanGmApi.ts`, `scenarioApi.ts`, `sessionApi.ts`, `vttMapApi.ts`)로 전환하고, 기존에 실제로 쓰이지 않던 rest action import도 제거했다. 코드에서 `services/api.ts` 참조가 사라진 것을 확인한 뒤 legacy re-export barrel인 `fe/src/services/api.ts`를 삭제했다. FE API 호출 변경 이유가 도메인별 API 파일로 모이며, P2-2의 임시 barrel 제거 단계까지 완료했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 플레이 화면에서 전투 시작/행동/종료, Human GM 메시지·AI assist·인벤토리·경제·전투 상태 변경, VTT map 저장/토큰 이동/ping/상호작용, 아이템 사용, 시나리오 노드 이동 수동 확인이다.

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

진행 기록:

- 2026-07-02: 캐릭터 생성의 시작 주문 검증, 준비 주문 갱신, 레벨업 주문 습득/교체/준비 주문 제한, 실행 주문 카탈로그 pool 판정을 `CharacterSpellSelectionService`로 분리했다. `CharactersService`는 기존 생성·레벨업·준비 주문 public API를 유지하고 주문 JSON 산출만 새 서비스에 위임한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts level-up.service.spec.ts rule-catalog.service.spec.ts`와 캐릭터 생성/레벨업/준비 주문 저장 수동 확인이다.
- 2026-07-02: 기본 오른손/왼손 장비 선택, 인벤토리 장착 가능성 검증, 세션 인벤토리 장착 후보 조회, 양손/방패/쌍수 제한, 방어도 재계산을 `CharacterEquipmentLoadoutService`로 분리했다. `CharactersService`는 캐릭터 생성·수정·레벨업·장비 변경 흐름에서 장비 정책을 새 서비스에 위임하고, 영속화와 이벤트 발행 orchestration을 유지한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts`와 캐릭터 생성 시작 장비, 장비 변경, 방패/양손 무기/쌍수 장착, 레벨업 후 AC 재계산 수동 확인이다.
- 2026-07-02: avatar asset 목록/업로드/삭제, R2 업로드/삭제 서명, content type/파일 크기 검증, avatar asset schema guard, 업로드 asset 삭제 시 캐릭터 avatar 초기화 처리를 `CharacterAvatarAssetService`로 분리했다. `CharactersService`는 기존 avatar asset public API를 유지하되 파일 저장소와 asset 영속화 정책을 새 서비스에 위임한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts`와 avatar 목록 조회·PNG/JPEG/WebP 업로드·파일 크기 제한·asset 삭제 후 캐릭터 기본 avatar 복귀 수동 확인이다.
- 2026-07-02: 종족 feature 선택, 직업 feature 선택, 전투 유파/주적/전문화/ASI·Feat 검증, 서브클래스 선택 가능성 검증, 최종 feature snapshot 생성을 `CharacterFeatureSnapshotService`로 분리했다. `CharactersService`는 캐릭터 생성·수정·clone·레벨업 흐름에서 feature 정책 결과만 받아 영속화한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts rule-catalog.service.spec.ts`와 드래곤본 혈통, 파이터 전투 유파, 레인저 주적, 로그 전문화, ASI/Feat, 서브클래스 선택 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 레벨업 Feat 선택 검증(`LEVEL_UP_TOO_MANY_FEATS`, 중복 Feat, 허용되지 않은 Feat, 이미 보유한 Feat)을 `CharacterFeatureSnapshotService.resolveLevelUpFeatSelections`로 이동했다. `CharactersService`는 레벨업 orchestration 중 ASI 지점과 기존 feature id를 전달해 선택된 Feat id만 받고, Feat 허용 목록과 선택 정책 변경 이유는 feature snapshot 서비스에 모인다. 이 이동으로 `CharactersService`의 중복 `ALLOWED_FEAT_IDS`와 ASI choice level helper도 제거했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts rule-catalog.service.spec.ts`와 레벨업 모달에서 Feat 중복 선택, 허용되지 않은 Feat, 이미 보유한 Feat 재선택, 정상 Feat 선택 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 레벨업 ASI 능력치 상승 검증(`LEVEL_UP_INVALID_ASI`, `LEVEL_UP_ASI_REQUIRED`, ASI 최대 20 제한, Feat 선택 수에 따른 필수 배분점 계산)을 `CharacterFeatureSnapshotService.resolveLevelUpAbilityScores`로 이동했다. `CharactersService`는 레벨업 orchestration 중 현재 능력치, 요청 상승치, 지나간 ASI 지점, Feat 선택 수를 전달해 보정된 능력치만 받고, ASI/Feat 선택 정책 변경 이유는 feature snapshot 서비스에 더 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts rule-catalog.service.spec.ts`와 레벨업에서 ASI 점수 미배분/초과 배분, 20 초과 상승, Feat 선택 시 ASI 요구점 감소, 정상 ASI 상승 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 P6 야만전사 20레벨 Primal Champion 능력치 보정(`str`/`con` +4, 최대 24)을 `CharacterFeatureSnapshotService.applyP6CapstoneAbilityAdjustments`로 이동했다. `CharactersService`는 최종 feature snapshot과 ASI 적용 능력치를 넘겨 capstone 보정 결과만 받으므로, feature id 기반 능력치 정책 변경 이유는 feature snapshot 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts rule-catalog.service.spec.ts`와 야만전사 19->20 레벨업에서 `class.barbarian.feature.primal_champion` 보유 시 STR/CON 보정, 미보유/타 직업/20레벨 미만 경로 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 feature runtime tag 기반 최대 HP 보너스 해석(`hp_bonus:per_level`, `hp_bonus:per_{class}_level`)을 `CharacterFeatureSnapshotService.resolveMaxHpBonusFromFeatures`로 이동했다. 생성/수정/레벨업 orchestration은 feature snapshot과 직업/레벨만 전달하고, feature tag 계약 변경 이유는 feature snapshot 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts rule-catalog.service.spec.ts`와 Tough 같은 per-level HP bonus feature를 보유한 캐릭터 생성/수정/레벨업의 maxHp 산출 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 시작 장비 슬롯 검증, placeholder 장비의 실제 아이템 선택 검증, catalog item 기반 inventory 조립을 `CharacterEquipmentLoadoutService.resolveStartingEquipment`로 이동했다. `CharactersService`는 생성 흐름에서 직업과 시작 장비 선택값만 전달하고 기본 장착/AC 계산으로 이어가므로, 시작 장비 catalog 계약과 장비 선택 정책 변경 이유는 equipment loadout 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts`와 캐릭터 생성 시 모든 시작 장비 슬롯 선택, placeholder 단순/군용 무기·악기 실제 아이템 선택, 잘못된 옵션 index와 잘못된 placeholder item category 거부 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 생성/수정 입력 검증 중 능력치 범위, 종족 보정 후 point-buy 비용, 클래스 숙련 스킬 선택/정규화 규칙을 `CharacterCreationService`로 이동했다. `CharactersService`는 race 조회 결과와 class/skill 입력값을 전달하고 검증 결과만 받아 저장 흐름을 이어가므로, 생성 규칙 변경 이유가 creation 서비스로 모이기 시작했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts normalize-skill.spec.ts`와 캐릭터 생성/수정에서 능력치 범위 초과, point-buy 비용 불일치, 숙련 스킬 개수/중복/허용 목록 검증 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 생성/수정용 proficiency bonus와 maxHp 공식 산출 및 DTO 입력값 일치 검증을 `CharacterCreationService.resolveLevelStats`로 이동했다. `CharactersService`는 생성/수정 orchestration 중 직업, 레벨, 능력치, HP feature bonus, 요청값만 전달하므로, 생성 통계 공식과 legacy class fallback 변경 이유가 creation 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts level-up.service.spec.ts`와 캐릭터 생성/수정에서 proficiencyBonus/maxHp 불일치 거부, feature HP bonus 반영, 시드에 없는 className legacy fallback 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 ancestry 입력값의 race 조회 규칙(key 우선, 한국어 이름 fallback)을 `CharacterCreationService.findRaceForAncestry`로 이동했다. 생성/수정/레벨업 흐름은 ancestry 문자열만 전달해 race를 받고, ancestry 입력 해석과 race lookup 변경 이유는 creation 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts`와 캐릭터 생성/수정/레벨업에서 race key 입력, 한국어 종족명 입력, 빈/legacy ancestry fallback 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 캐릭터 생성 시나리오 선택 검증(제공 시나리오/소유 시나리오 허용, 시작 레벨 일치, 외부 사용자 시나리오 404 처리)을 `CharacterCreationService.resolveScenarioForLevel`로 이동했다. `CharactersService`는 생성 요청의 userId/scenarioId/level만 전달하고 저장할 scenario id만 받으므로, 생성 요청 검증 변경 이유가 creation 서비스로 더 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts`와 캐릭터 생성에서 제공 시나리오, 본인 시나리오, 타인 시나리오, 시작 레벨 불일치 경로 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 캐릭터 생성/수정 avatar DTO type을 Prisma enum으로 변환하는 매핑을 `CharacterAvatarAssetService.resolveAvatarType`으로 이동했다. `CharactersService`는 avatar 입력값을 저장 가능한 enum으로 변환만 위임하고, avatar type 계약 변경 이유는 avatar asset 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts`와 캐릭터 생성/수정에서 기본/preset/upload avatarType 저장값 수동 확인이다.
- 2026-07-03: `CharactersService`에 남아 있던 레벨업 HP 보정용 ability modifier 계산을 `LevelUpService.resolveAbilityModifier`로 위임하고 중복 helper를 제거했다. 레벨업 HP delta와 레벨 통계 산출이 같은 능력치 수정치 공식을 공유하므로, 공식 변경 이유는 rules level-up 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- characters.service.spec.ts level-up.service.spec.ts`와 CON 변경이 있는 레벨업의 maxHp/currentHp 보정 수동 확인이다.

## P3. AiHarnessService 분리

### 현재 문제

`AiHarnessService`는 역할별 AI 실행과 fallback 생성을 모두 담당한다. 특히 interpreter fallback 휴리스틱과 role별 fallback response가 같은 클래스에 있어 모델 호출 정책 변경과 fallback 문구 변경이 충돌한다.

### 목표 구조

- `AiHarnessService`
  - role service 호출 facade.

- `AiRoleRunner`
  - prompt load, model call, schema validation, retry.

- `AiSmokeRunner`
  - smoke endpoint model call, schema validation, retry, success logging.

- `AiFallbackPolicy`
  - fallback 허용 failure type 판정.

- `InterpreterFallbackService`
  - interpreter local fallback action 추론.

- `RoleFallbackTemplates`
  - narrator/director/summarizer/actor/npc/check-result fallback response.

- `RoleFallbackResponseFactory`
  - role별 fallback response envelope, promptVersion, trace wiring.

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
python -m pytest ai/app/tests/test_fallback_policy.py
python -m pytest ai/app/tests/test_interpreter_contract_validation.py
```

진행 기록:

- 2026-07-03: `AiHarnessService` 안에 남아 있던 interpreter fallback 휴리스틱 중 direct request intent 허용 목록, general GM request 텍스트 분류, NPC target 추론, fallback `InterpreterOutput` 조립을 `InterpreterFallbackService`로 분리했다. Harness는 provider 실패 시 fallback output 생성을 새 서비스에 위임하고 response wrapping/logging만 유지하므로, 자연어 fallback 분류 변경 이유는 interpreter fallback 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `python -m pytest ai/app/tests/test_harness_service.py ai/app/tests/test_fallback_policy.py`와 GENERAL_GM_REQUEST 대화/힌트/요약/장면 정보 fallback 수동 확인이다.
- 2026-07-03: `AiHarnessService` 안에 남아 있던 narrator/director/summarizer/actor/npc_dialogue/check_result fallback parsed payload 조립과 director hint 문구 템플릿을 `RoleFallbackTemplates`로 분리했다. Harness는 role별 fallback response envelope, trace, logging만 유지하고 fallback 문구와 parsed schema 변경 이유는 role fallback template 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `python -m pytest ai/app/tests/test_harness_service.py`와 narrator/director/summarizer/actor/npc/check-result fallback 응답 문구 수동 확인이다.
- 2026-07-03: `AiHarnessService` 안에 남아 있던 failure logging 위임과 trace history 읽기/필터링/`TraceListResponse` 조립을 `AiTraceService`로 분리했다. Harness는 public trace API를 유지하되 trace 저장소 조회와 list item projection을 새 서비스에 위임하므로, trace listing 계약 변경 이유는 trace 서비스에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `python -m pytest ai/app/tests/test_harness_service.py`와 성공/fallback/failure trace 목록 role/status/session 필터 수동 확인이다.
- 2026-07-03: `AiHarnessService` 안에 남아 있던 template fallback trace payload 생성과 fallback response logPaths 주입 wrapper를 `AiTraceService.fallback_trace`/`log_fallback_response`로 이동했다. Harness는 fallback response envelope을 만들 때 trace 서비스에 trace payload와 fallback logging을 위임하므로, fallback trace/logging 계약 변경 이유가 trace 서비스에 더 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `python -m pytest ai/app/tests/test_harness_service.py`와 interpreter/narrator/director 등 fallback trace의 provider/model/promptVersion/failureType/logPaths 수동 확인이다.
- 2026-07-03: `AiHarnessService`의 interpreter/narrator/director/summarizer/actor/npc_dialogue/check_result 실행 메서드에 반복되던 role service 호출, `AiClientError` fallback 판정, success/fallback logging, `logPaths` 주입 흐름을 `AiRoleRunner`로 분리했다. Harness는 endpoint별 service와 fallback response builder를 runner에 전달하는 facade로 축소되며, role 실행/로깅 흐름 변경 이유는 role runner에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `python -m pytest ai/app/tests/test_harness_service.py ai/app/tests/test_fallback_policy.py`와 각 role 성공/실패/fallback logPaths 수동 확인이다.
- 2026-07-03: `AiHarnessService.run_smoke_test`에 남아 있던 smoke endpoint 모델 호출, interpreter schema 검증, retry, success logging payload 조립을 `AiSmokeRunner`로 분리했다. Harness는 smoke API도 runner에 위임하는 facade로 축소되며, smoke endpoint의 provider 호출/로그 계약 변경 이유는 smoke runner에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `python -m pytest ai/app/tests/test_harness_service.py`와 `/ai/smoke` 성공 응답의 trace/logPaths/promptVersion 수동 확인이다.
- 2026-07-03: `AiHarnessService`에 남아 있던 role별 fallback response envelope 조립, `promptVersion`, fallback trace 연결, `fallbackReason` 채우기를 `RoleFallbackResponseFactory`로 분리했다. Harness는 role service 실행과 fallback factory 메서드를 `AiRoleRunner`에 연결하는 facade가 되고, fallback 응답 계약 변경 이유는 factory와 template 서비스로 나뉜다. 테스트는 실행하지 않았으며, 권장 검증은 `python -m pytest ai/app/tests/test_harness_service.py ai/app/tests/test_fallback_policy.py`와 각 role fallback 응답의 provider/model/promptVersion/trace/fallbackReason 수동 확인이다.

## 단계별 진행 순서

1. 현재 변경분 감사
   - 미커밋 파일을 기능 축별로 묶는다.
   - 각 묶음이 어떤 변경 이유를 줄였는지, 어떤 새 wiring 비용을 만들었는지 기록한다.
   - 이 단계에서는 새 분리를 시작하지 않는다.

2. 안정화 우선순위 결정
   - `api.ts` 분리처럼 성공 기준이 명확한 축은 그대로 굳힌다.
   - `MainCommandsService`, `SessionsService`처럼 생성자/DI 비용이 커진 축은 추가 분해를 멈추고 wiring을 정리한다.
   - `PlayPage`, `CharacterPage`처럼 import surface가 커진 축은 새 hook 추출보다 기능별 grouping과 return shape 정리를 우선한다.

3. 수동 dependency 조립 제거
   - Nest provider로 등록한 service는 facade 생성자에서 기본값으로 직접 `new` 하지 않는다.
   - 순수 로직은 service로 승격하지 않고 함수 module로 유지하거나 되돌린다.
   - spec 편의 때문에 필요했던 기본 생성 경로는 테스트 provider mock으로 대체한다.

4. 커밋 가능한 단위로 분리
   - FE API client split.
   - Actions inventory/rest/action queue split.
   - Sessions VTT/session policy split.
   - Character creation/rule/avatar split.
   - PlayPage hook/presentation split.
   - AI harness fallback/trace/runner split.
   - 한 커밋에서 FE god page와 BE god service를 동시에 변경하지 않는다.

5. public 계약 확인
   - controller/page 외부 호출면, DTO, API path, socket event shape를 유지한다.
   - 변경이 있으면 리팩터링이 아니라 별도 behavior change로 문서화한다.

6. 검증 안내 작성
   - 테스트는 직접 실행하지 않는다.
   - 각 커밋/PR 설명에 권장 테스트 명령과 수동 확인 플로우를 남긴다.

7. 추가 SRP 작업 재개 조건
   - 현재 변경분이 커밋 가능한 단위로 정리된 뒤에만 새 대상을 잡는다.
   - 새 대상은 실제 변경 이유, 예상 회귀 범위, 검증 방법이 명확해야 한다.

## 현재 커밋 분할안

2026-07-04 기준 미커밋 변경분은 다음 순서로 나누는 것을 권장한다. 각 단위는 가능한 한 독립적으로 리뷰하고, 테스트는 직접 실행하지 않고 아래 명령과 수동 확인 항목을 PR 설명에 남긴다.

| 순서 | 커밋 단위 | 포함 범위 | 안정화 체크 | 권장 검증 |
|---|---|---|---|---|
| 1 | SRP 계획/가드레일 문서 | `doc/completed/future_plan_srp_refactoring.md` | 추가 분해 중단 기준, DI 조립 제거, 커밋 분할 기준이 문서화되어 있다. | 문서 리뷰 |
| 2 | FE API client split | `fe/src/services/api.ts` 삭제, `httpClient.ts`, `authApi.ts`, `sessionApi.ts`, `scenarioApi.ts`, `characterApi.ts`, `combatApi.ts`, `humanGmApi.ts`, `catalogApi.ts`, `vttMapApi.ts`, import 전환 파일 | endpoint wrapper가 도메인별 파일로 이동했고 auth reissue/error formatting은 `httpClient.ts`에 남아 있다. | `npm --prefix fe run build`, `npm --prefix fe run lint`; 로그인/토큰 재발급/세션 목록/시나리오 상세/전투 액션 수동 확인 |
| 3 | Actions queue/rest/inventory runtime split and processor DI stabilization | `be/src/modules/actions/actions.service.ts`, `actions.module.ts`, `action-processor.service.ts`, `action-*`, `rest-approval-*`, `inventory-*`, `srd-equipment-policy*` | `ActionsService`는 submit/rest/inventory orchestration만 유지하고, policy/runtime/publisher 책임이 분리되어 있다. `ActionProcessorService` 생성자에 provider 기본 `new ...Service(...)` 조립이 없다. | `npm --prefix be test -- actions.service.spec.ts action-processor.service.spec.ts action-submission-context-loader.service.spec.ts action-queue-submission.service.spec.ts inventory-item-policy.spec.ts`; 일반 행동 제출, action queue 처리, 휴식 승인, 아이템 사용 수동 확인 |
| 4 | Main command DI stabilization and runtime split | `main-commands.service.ts`, `main-commands.service.spec.ts`, `main-command-*` | `MainCommandsService`와 main-command 하위 provider 생성자에 `new MainCommand...Service(...)` 기본값이 없고, 테스트 수동 조립은 spec fixture helper에만 있다. | `npm --prefix be test -- main-commands.service.spec.ts main-command-intent-handlers.service.spec.ts`; 자유 입력 라우팅, check resolve, 장면 전환, 힌트/룰 질문 수동 확인 |
| 5 | Sessions DI stabilization and session policy/VTT split | `sessions.service.ts`, `sessions.service.spec.ts`, `sessions.module.ts`, `session-*`, `campaign-archive-runtime.service.ts` | `SessionsService`와 session 하위 provider 생성자에 `new Session...Service(...)`/`new CampaignArchiveRuntimeService()` 기본값이 없고, 테스트 수동 조립은 spec fixture helper에만 있다. pure runtime helper 직접 생성은 별도 후속 후보로 분리되어 있다. | `npm --prefix be test -- sessions.service.spec.ts session-character-selection.service.spec.ts session-vtt-default-map-reader.service.spec.ts`; 세션 생성/참여/시작/이탈, Human GM, VTT map/player movement, 캠페인 완료/이관 수동 확인 |
| 6 | Characters service/page split | `characters.service.ts`, `characters.module.ts`, `CharacterPage.tsx`, `features/characters/*` | 캐릭터 생성/레벨업/장비/주문/아바타 규칙이 도메인별 service/hook/pure module에 있다. 작은 wrapper hook 추가는 중단한다. | `npm --prefix be test -- characters.service.spec.ts`, `npm --prefix fe run build`, `npm --prefix fe run lint`; 캐릭터 생성/빠른 생성/레벨업/아바타/장비 수동 확인 |
| 7 | Play page and session surface split | `PlayPage.tsx`, `CombatNodeSurface.tsx`, `ExplorationNodeSurface.tsx`, `StoryNodeSurface.tsx`, `features/sessionPlay/hooks/*`, `features/sessionPlay/utils/*` | page/surface는 조립과 이벤트 연결 중심이며, presentation/model/geometry/save queue는 feature 파일에 있다. 새 hook 추출은 보류하고 return shape 안정화를 우선한다. | `npm --prefix fe run build`, `npm --prefix fe run lint`; 플레이 입장, 로그 탭, 메인 커맨드, VTT 이동/ping, 전투 액션, Human GM assist 수동 확인 |
| 8 | Combat service split and DI stabilization | `combat.service.ts`, `combat.module.ts`, `combat-movement.service.ts`, `combat-auto-monster-turn-scheduler*`, `combat-reaction-continuation*`, 관련 rules 변경 | 자동 몬스터 턴/반응 지속/강제 이동 같은 전투 정책 변경 축만 분리되어 있고, `CombatService`/`CombatMovementService` 생성자에 provider 기본 `new ...Service(...)` 조립이 없다. 테스트 수동 조립은 spec fixture에만 있다. | `npm --prefix be test -- combat.service.spec.ts combat-movement.service.spec.ts combat-cover.service.spec.ts combat-targeting.service.spec.ts combat-auto-monster-turn-scheduler.service.spec.ts combat-reaction-continuation.service.spec.ts`; 전투 시작/공격/반응/몬스터 턴/강제 이동, 지형 효과 거리/cover/targeting 수동 확인 |
| 9 | AI harness fallback/trace split | `ai/app/services/harness.py`, `fallback_*`, `interpreter_fallback.py`, `role_*`, `smoke_runner.py`, `trace_service.py`, `ai/app/tests/test_fallback_policy.py` | harness는 role runner/fallback factory/trace service를 조합하고 fallback 응답 계약은 별도 service에 모인다. | `python -m pytest ai/app/tests/test_harness_service.py ai/app/tests/test_fallback_policy.py`; role fallback 응답, trace/logPaths, smoke endpoint 수동 확인 |

커밋 전 공통 확인:

- 같은 커밋 안에서 backend god service와 frontend god page를 동시에 바꾸지 않는다.
- 각 커밋 설명에는 실행하지 않은 테스트와 권장 검증을 그대로 적는다.
- `git diff --check`로 공백/patch 위생만 확인한다.
- 아직 직접 실행하지 않은 테스트를 "통과"로 쓰지 않는다.

## 완료 기준

각 대상은 다음 조건을 만족하면 해당 단계 완료로 본다.

- public API는 유지되거나 변경 사유가 별도 문서화되어 있다.
- facade 파일은 orchestration과 delegation 중심으로 축소되어 있다.
- 새 서비스/훅 이름이 변경 이유를 드러낸다.
- 순수 로직은 DB/socket/UI state에 의존하지 않는다.
- facade 생성자가 수동 composition root가 되지 않는다.
- Nest provider 목록과 React import 목록이 새 병목이 되지 않았거나, 남은 비용이 명시적으로 수용된다.
- 작은 service/hook으로 나눈 결과 테스트 mock이 과도하게 복잡해지지 않았다.
- 권장 테스트 명령과 수동 확인 항목이 PR 또는 작업 로그에 남아 있다.
- 사용자-visible 회귀가 의심되는 흐름은 수동 확인 항목으로 명시되어 있다.

## 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 서비스 순환 의존성 증가 | facade에서만 조합하고 하위 서비스끼리 직접 참조를 최소화한다. 공통 타입/순수 함수는 별도 module로 둔다. |
| 복잡도 이동 | 파일 줄 수만 보지 않고 생성자 인자 수, provider 목록, import 수, spec mock 수를 함께 본다. |
| 과분해 | 같은 변경 이유로 함께 바뀌는 service/hook은 다시 묶거나 pure module로 낮춘다. |
| 수동 `new Service(...)` 기본값 확산 | Nest provider는 DI로만 받고, 테스트 편의는 spec provider mock으로 해결한다. |
| 순수 runtime helper와 Nest provider 혼재 | `EconomyRuntimeService`처럼 provider가 아닌 순수 class는 즉시 DI로 승격하지 않는다. 변경 이유가 커질 때 함수 module 전환 또는 provider 승격을 별도 커밋에서 판단한다. |
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

진행 기록:

- 2026-07-02: `CampaignArchiveRuntimeService`를 추가해 캠페인 아카이브 파싱/스냅샷 생성, 캐릭터 이관 request 파싱, 레벨 범위 정책, 이관 inventory 정책, 완료 downtime 집계를 `SessionsService`에서 분리했다. `SessionsService`는 기존 public API를 유지하고 새 런타임 서비스에 위임한다. 기존 시나리오 레벨 정책 spec도 새 서비스 책임에 맞춰 대상을 조정했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts`이다.
- 2026-07-02: post-combat 완료 node, ending node 세션 완료, party defeat 완료 시 game state flags에 저장하는 `completedCombatNodeIds`, `sessionCompletedAt`, `completedNodeId`, `completionReason`, `partyDefeated`, `partyDefeatedAt`, `defeatedCombatNodeId` payload 조립 책임을 `SessionCompletionFlagStoreService`로 분리했다. `SessionsService.completeActiveCombatState`, `completeSessionFromEndingNode`, `completeSessionAfterPartyDefeat`는 phase/status mutation, combat 종료, snapshot/event 발행 orchestration을 유지하고, 일반 세션 완료 flags 저장 계약 변경 이유는 새 서비스에 모인다. completion flag store service spec에 기존 flags 보존, completed combat node 정규화/중복 방지, ending node marker, party defeat marker, null combat node 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-completion-flag-store.service.spec.ts`와 전투 종료, ending node 완료, party defeat 후 game state flags 수동 확인이다.
- 2026-07-02: long campaign 완료 시 `CampaignArchiveResponseDto`를 조립하는 책임, archive id/completedAt 생성, epilogue trim, share/transfer 기본값, final reward dedupe/20개 제한, 캐릭터/analytics/snapshot 조합을 `SessionCampaignArchiveBuilderService`로 분리했다. `SessionsService.completeLongCampaign`은 세션 조회, 완료 여부 확인, 필요한 count/character 조회, 완료 mutation, audit/snapshot 발행 orchestration을 유지하고, archive 응답 shape 변경 이유는 새 builder 서비스에 모인다. archive builder service spec에 archive shape, reward dedupe, downtime analytics, snapshot, optional field 기본값 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-campaign-archive-builder.service.spec.ts session-campaign-archive-audit.service.spec.ts`와 long campaign 완료 후 archive 응답/flags/snapshot 수동 확인이다.
- 2026-07-02: long campaign 완료 시 game state flags에 저장하는 `sessionCompletedAt`, `completedNodeId`, `completionReason`, `p6CampaignArchive` payload 조립 책임을 `SessionCampaignArchiveFlagStoreService`로 분리했다. `SessionsService.completeLongCampaign`은 transaction과 version increment를 유지하고, 완료 flags 저장 계약 변경 이유는 새 서비스에 모인다. flag store service spec에 기존 flags 보존, 완료 marker, archive 저장, null final node 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-campaign-archive-flag-store.service.spec.ts session-campaign-archive-builder.service.spec.ts`와 long campaign 완료 후 game state flags 확인 수동 검증이다.
- 2026-07-02: long campaign 완료 시 생성하는 `/campaign complete` turn log, `p6_campaign_archive` structured action, state diff JSON, 별도 stateDiff row 생성 책임을 `SessionCampaignArchiveAuditService`로 분리했다. `SessionsService.completeLongCampaign`은 archive 조립, 세션/시나리오/game state 완료 mutation, snapshot/event 발행 orchestration을 유지하고, 캠페인 완료 audit payload 변경 이유는 새 서비스에 모인다. archive audit service spec에 turn number 증가, turn log structured action/state diff, stateDiff row payload, 기존 turn log 없음 fallback 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-campaign-archive-audit.service.spec.ts`와 long campaign 완료, turn log 감사 기록, archive state diff 표시 수동 확인이다.
- 2026-07-02: completed campaign의 session character assignment를 character vault item DTO로 조립하는 책임, active/fallback session scenario 선택, archive 없는 assignment 제외, `allowCharacterTransfer` 기반 transferable 표시를 `SessionCharacterVaultItemService`로 분리했다. `SessionsService.listCharacterVault`는 사용자별 completed session character 조회만 유지하고, vault 목록 projection 변경 이유는 새 서비스에 모인다. vault item service spec에 archive 기반 DTO 조립, archive 누락 제외, fallback scenario 사용과 transferable false 표시 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-character-vault-item.service.spec.ts`와 캠페인 완료 후 character vault 목록, 이관 허용/비허용 표시 수동 확인이다.
- 2026-07-02: 캐릭터 이관 승인 시 source character를 cloned character create payload로 복사하는 책임과 target session character 초기 HP/상태/inventory snapshot payload 조립을 `SessionCharacterTransferClonePayloadService`로 분리했다. `SessionsService.approveCharacterTransfer`는 이관 요청 검증, transaction, source retire, flags 갱신, snapshot 발행 orchestration을 유지하고, clone 데이터 계약 변경 이유는 새 서비스에 모인다. clone payload service spec에 `character-transfer-*` id 생성, 원본 character 필드 복사, target session character ACTIVE payload 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-character-transfer-clone-payload.service.spec.ts session-character-transfer-request-store.service.spec.ts`와 캐릭터 이관 승인 후 cloned character/session character 생성 수동 확인이다.
- 2026-07-02: 캐릭터 이관 요청 flags 배열의 pending duplicate 탐색, request append, approve/reject 시 index 교체와 기존 flags 보존 책임을 `SessionCharacterTransferRequestStoreService`로 분리했다. `SessionsService.requestCharacterTransfer`/`approveCharacterTransfer`/`rejectCharacterTransfer`는 대상/source 검증, 캐릭터 clone/retire mutation, snapshot 발행 orchestration을 유지하고, `p6CharacterTransferRequests` 저장 배열 변경 이유는 새 store 서비스에 모인다. request store service spec에 pending duplicate 탐색, append, replaceAt 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-character-transfer-request-store.service.spec.ts`와 캐릭터 이관 요청 중복 방지, 승인, 거절 수동 확인이다.
- 2026-07-02: Human GM economy action의 초기 economy state 생성, action 전 state 보정, wallet 정규화, action type별 `EconomyRuntimeService` dispatch, 필수 필드 검증을 `SessionEconomyService`로 분리했다. `SessionsService`는 game state 조회, resolution 적용, inventory snapshot refresh, socket event 발행만 유지하고, 경제 정책과 runtime 호출 변경 이유는 새 서비스에 모인다. economy service spec에 초기 상태, wallet 정규화, purchase state 준비, purchase resolution, 필수 필드 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-economy.service.spec.ts`와 Human GM 구매/판매/보상 지급/party stash 배분/제작 진행 수동 확인이다.
- 2026-07-02: 세션 참가자 목록 조회, participant connection status 조회, socket 접속/해제 시 connection status 갱신, ready 상태 변경 검증/update, 캐릭터 선택/해제 후 ready 해제와 participant update 이벤트 발행을 `SessionParticipantStatusService`로 분리했다. `SessionsService`는 session lookup, membership 확인, ready 변경 후 snapshot 발행만 유지하고, 참가자 조회 shape와 connection/ready 표시·발행 정책 변경 이유는 새 서비스에 모인다. participant status service spec에 joined participant 조회 query, connection status 매핑, 변경된 connection status update/event, 누락·동일 상태 no-op, 플레이어 ready 시나리오 레벨 검증, GM auto-ready, clear ready 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-participant-status.service.spec.ts`와 세션 참가자 목록, socket 접속/해제 후 참가자 connection status 표시, 모집 화면 ready 토글/GM ready 처리, 캐릭터 선택/해제 후 ready 초기화 수동 확인이다.
- 2026-07-02: 세션 캐릭터 선택/선택 해제의 참가자 검증, 캐릭터 소유권/중복 세션 배정 검증, 시나리오 레벨 검증 호출, `sessionCharacter` upsert/delete, 선택 캐릭터 inventory entry 재구성, character update 이벤트 발행을 `SessionCharacterSelectionService`로 분리했다. `SessionsService`는 session lookup과 선택 후 snapshot 발행만 유지하고, 캐릭터 선택 runtime 변경 이유는 새 서비스에 모인다. selection service spec에 선택 해제와 정상 선택/inventory sync/character event 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-character-selection.service.spec.ts session-participant-status.service.spec.ts`와 캐릭터 선택, 선택 해제, 이미 다른 세션에서 사용 중인 캐릭터 거절, 선택 후 인벤토리 표시 수동 확인이다.
- 2026-07-02: 세션 캐릭터 inventory entry 교체, itemDefinition 존재 확인, inventory grant/remove, inventory snapshot refresh JSON 조립을 `SessionInventoryService`로 분리했다. `SessionsService`는 Human GM runtime 호환을 위해 기존 private helper 이름만 얇게 유지하고 새 서비스로 위임하며, `SessionCharacterSelectionService`도 선택 캐릭터 inventory sync를 새 서비스에 위임한다. inventory service spec에 entry 교체, grant increment, remove decrement/missing, snapshot refresh 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-inventory.service.spec.ts session-character-selection.service.spec.ts`와 캐릭터 선택 후 인벤토리 표시, Human GM 인벤토리 지급/회수, economy party stash 배분 수동 확인이다.
- 2026-07-02: 공개 세션 목록과 내 세션 목록에서 반복되던 세션 카드 DTO 조립 책임을 `SessionListItemService`로 분리했다. `SessionsService`는 목록 query와 public id 보정만 유지하고, active scenario 선택, host/owner 매핑, 참가자 수/빈 슬롯 계산, 요청자 role 표시 정책은 새 서비스에 모인다. list item service spec에 active scenario 우선 선택, scenario fallback, role 생략, scenario 없는 세션 제외 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-list-item.service.spec.ts`와 공개 세션 목록/내 세션 목록 필터, 참여자 수, 내 역할 표시 수동 확인이다.
- 2026-07-02: 공개 세션 목록과 내 세션 목록의 Prisma `where` 조립 책임을 `SessionListFilterService`로 분리했다. `SessionsService`는 pagination/order/include와 public id 보정, DTO 조립 위임만 유지하고, status/role/active scenario/ruleset/삭제 host 제외 필터 변경 이유는 새 필터 서비스에 모인다. list filter service spec에 공개 모집 기본 필터, 공개 목록 status/ruleset/scenario 필터, 내 세션 joined participant/role 필터 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-list-filter.service.spec.ts session-list-item.service.spec.ts`와 공개 세션 목록 상태/시나리오/ruleset 필터, 내 세션 role 필터 수동 확인이다.
- 2026-07-02: 세션 생성, 목록, snapshot/detail 조립 경로에 걸쳐 있던 public id 생성·보정·충돌 재시도 책임을 `SessionPublicIdService`로 분리했다. `SessionsService`는 기존 `generateSessionPublicId`/`ensureSessionPublicId` runtime 계약을 얇은 위임으로 유지하고, 공개 식별자 할당 정책의 변경 이유는 새 서비스에 모인다. public id service spec에 기존 public id no-op, 누락 public id update, update collision retry, 신규 public id 생성, 반복 collision 실패 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-public-id.service.spec.ts session-snapshot.service.spec.ts`와 신규 세션 생성, 공개/내 세션 목록, 세션 상세 publicId 표시 수동 확인이다.
- 2026-07-02: 세션 생성과 invite join/detail 경로에 흩어져 있던 invite code 생성, 입력 normalize/lookup, 공유 URL DTO 조립을 `SessionInviteService`로 분리했다. `SessionsService`는 사용자 확인, membership 확인, join orchestration만 유지하고, 초대 코드 충돌 재시도와 초대 응답 shape 변경 이유는 새 서비스에 모인다. invite service spec에 신규 코드 생성, 반복 collision 실패, 입력 normalize lookup, unknown code 거절, share URL 조립 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-invite.service.spec.ts`와 신규 세션 생성, 초대 코드 join, invite info 공유 URL 수동 확인이다.
- 2026-07-02: 세션 생성/수정 DTO에서 visibility와 legacy `isPrivate`/`isPublic` flag를 Prisma visibility로 해석하는 정책, API GM mode를 Prisma GM mode로 변환하는 정책을 `SessionSettingsService`로 분리했다. `SessionsService`는 create/update mutation과 권한 검증만 유지하고, 세션 설정 입력 호환성 변경 이유는 새 서비스에 모인다. settings service spec에 명시 visibility 우선순위, legacy flag, fallback visibility, GM mode 매핑 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-settings.service.spec.ts`와 공개/비공개 세션 생성, legacy `isPrivate`/`isPublic` 요청, GM mode 변경 수동 확인이다.
- 2026-07-02: 세션 시작 전 모집 상태, 참가자 존재, HUMAN GM 참가자, 플레이어 존재, 플레이어 캐릭터 선택, 시나리오 레벨 범위, ready 상태 검증을 `SessionStartPolicyService`로 분리했다. `SessionsService.startSession`은 참가자/active scenario 조회, VTT map 초기화, DB 상태 전환, 이벤트 발행만 유지하고, 시작 가능 조건 변경 이유는 새 정책 서비스에 모인다. start policy service spec에 정상 시작 가능, 비모집 상태, 참가자/플레이어 누락, HUMAN GM 누락, 캐릭터 미선택, ready 누락 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-start-policy.service.spec.ts`와 AI GM/HUMAN GM 세션 시작, 캐릭터 미선택/미준비/레벨 불일치 거절 수동 확인이다.
- 2026-07-02: 세션 수정 전 모집 상태 확인, `maxParticipants` 축소 시 현재 JOINED 참가자 수 검증, `captainUserId`가 JOINED 참가자인지 확인하는 정책을 `SessionUpdatePolicyService`로 분리했다. `SessionsService.updateSession`은 host 권한 확인, update payload 조립, status update event 발행만 유지하고, 수정 가능 조건 변경 이유는 새 정책 서비스에 모인다. update policy service spec에 정상 검증, 비모집 세션 거절, 참가자 수보다 작은 maxParticipants 거절, captain 미참가 거절, captain 해제 허용 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-update-policy.service.spec.ts`와 모집/진행 중 세션 수정, maxParticipants 축소, captain 지정/해제 수동 확인이다.
- 2026-07-02: HUMAN GM 지정 전 세션 GM mode, 모집 상태, 대상 `gmUserId`의 JOINED 참가자 여부 검증을 `SessionHumanGmAssignmentPolicyService`로 분리했다. `SessionsService.updateHumanGm`은 host 권한 확인, 기존 GM role 초기화, 새 GM role/ready 설정, snapshot 발행만 유지하고, HUMAN GM 지정 가능 조건 변경 이유는 새 정책 서비스에 모인다. human GM assignment policy spec에 정상 지정, AI GM 세션 거절, 모집 이후 거절, 누락/LEFT 참가자 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-human-gm-assignment-policy.service.spec.ts`와 HUMAN GM 세션 GM 지정, AI GM 세션 지정 거절, LEFT 참가자 지정 거절 수동 확인이다.
- 2026-07-02: 세션 삭제 전 모집 상태 검증을 `SessionDeletePolicyService`로 분리했다. `SessionsService.deleteSession`은 host 권한 확인, 세션 캐릭터/시나리오 링크 정리, 참가자 LEFT 처리, 세션 DISBANDED 변경만 유지하고, 삭제 가능 상태 변경 이유는 새 정책 서비스에 모인다. delete policy service spec에 모집 세션 허용과 PLAYING/PAUSED/COMPLETED/DISBANDED 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-delete-policy.service.spec.ts`와 모집 중 세션 삭제, 진행/완료 세션 삭제 거절 수동 확인이다.
- 2026-07-02: 세션 참여 전 모집 상태 확인, 기존 JOINED 참가자 중복 참여 거절, 현재 JOINED 참가자 수 기반 정원 초과 거절, 기존 LEFT 참가자 row 재사용 판정을 `SessionJoinPolicyService`로 분리했다. `SessionsService.joinSessionEntity`는 user/session lookup, participant update/create, participant/snapshot 이벤트 발행만 유지하고, 참여 가능 조건 변경 이유는 새 정책 서비스에 모인다. join policy service spec에 신규 참여 허용, LEFT row 반환, 비모집 세션 거절, 이미 참여 중인 사용자 거절, 정원 초과 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-join-policy.service.spec.ts`와 세션 ID 참여, invite code 참여, 이미 참여 중인 사용자 재참여 거절, LEFT 참가자 재참여, 정원 초과 거절 수동 확인이다.
- 2026-07-02: 참가자 이탈 후 남은 참가자 목록을 기준으로 세션 해산 여부, snapshot 발행 여부, assigned GM 해제 여부, host 승계 대상과 승계 role을 결정하는 로직을 `SessionLeaveResolutionService`로 분리했다. `SessionsService.leaveSession`은 참가자 LEFT 처리, 캐릭터 선택 삭제, 남은 참가자 조회, 결정 결과에 따른 DB mutation과 snapshot 발행만 유지하고, 이탈 후 승계 정책 변경 이유는 새 서비스에 모인다. leave resolution service spec에 마지막 참가자 이탈, assigned GM 이탈, host 이탈 승계, assigned GM이 next host가 되는 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-leave-resolution.service.spec.ts`와 일반 플레이어 이탈, GM 이탈, host 이탈 승계, 마지막 참가자 이탈 시 세션 해산 수동 확인이다.
- 2026-07-02: 세션 생성 중 시나리오 노드 목록과 `transitionsJson`을 해석해 시작 노드를 결정하는 graph fallback 정책을 `SessionStartNodeService`로 분리했다. `SessionsService.createSession`은 scenario 조회, 세션/참가자/game state 생성, node visit 기록만 유지하고, start node 선택 규칙 변경 이유는 새 서비스에 모인다. start node service spec에 노드 없음, 단일 root 우선, 여러 root에서 요청 start node 사용, fallback 첫 노드, 잘못된 transition JSON 무시 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-start-node.service.spec.ts`와 기본 시나리오 세션 생성, start node가 지정된 시나리오 생성, root가 여러 개인 시나리오 생성 수동 확인이다.
- 2026-07-02: 세션 생성 시 game state flags에 저장하는 P3 scenario revision snapshot 생성, 초기 flags key 조립, `P3_REVISION_META` 파싱을 `SessionScenarioRevisionSnapshotService`로 분리했다. `SessionsService.createSession`은 세션/참가자/game state create orchestration을 유지하고, revision metadata shape와 저장 key 변경 이유는 새 서비스에 모인다. revision snapshot service spec에 초기 flags 조립, metadata 기반 flag 생성, marker 없음 draft fallback, malformed JSON/unknown status fallback 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-scenario-revision-snapshot.service.spec.ts`와 draft/public revision 시나리오로 세션 생성 후 game state flag 확인 수동 검증이다.
- 2026-07-02: scenario node를 session scenario node snapshot으로 복사하는 count/findMany/createMany 흐름과 session scenario node 조회/누락 처리 책임을 `SessionScenarioNodeSnapshotService`로 분리했다. `SessionsService`는 기존 runtime callback wrapper를 유지해 Human GM/reveal/VTT 호출면을 보존하고, node snapshot 생성 규칙 변경 이유는 새 서비스에 모인다. node snapshot service spec에 기존 node 조회, 누락 node 거절, 기존 snapshot skip, scenario node 복사, transaction boundary 유지 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-scenario-node-snapshot.service.spec.ts`와 신규 세션 생성, 세션 시작 시 node snapshot 생성, Human GM node 이동 수동 확인이다.
- 2026-07-02: host-only action 검증, AI GM 세션에서 host runtime control 허용, HUMAN GM 세션에서 assigned GM/host fallback operator 판정, GM-only VTT data visibility 판단을 `SessionAccessPolicyService`로 분리했다. `SessionsService`는 기존 private/public wrapper 이름을 유지해 호출면을 보존하고 새 정책 서비스로 위임하며, 접근 정책 변경 이유는 새 서비스에 모인다. access policy service spec에 host 권한, AI GM host control, HUMAN GM assigned operator, HUMAN GM host fallback visibility 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-access-policy.service.spec.ts`와 host-only update/delete, AI GM host VTT control, HUMAN GM assigned operator 권한, player map redaction 수동 확인이다.
- 2026-07-02: GM runtime 실행 전 `sessionParticipant` row를 조회하고 JOINED 상태의 GM/HOST participant인지 검증하는 책임을 `SessionGmRuntimeParticipantAccessService`로 분리했다. `SessionsService.getHumanGmSessionForOperator`와 economy GM runtime 접근 흐름은 session 조회, GM mode/host-assigned operator 판정, orchestration을 유지하고, participant row 조회 shape와 JOINED role 검증 변경 이유는 새 서비스에 모인다. participant access service spec에 JOINED GM/HOST 허용, JOINED PLAYER 거절, LEFT GM 거절, 누락 participant 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-gm-runtime-participant-access.service.spec.ts session-access-policy.service.spec.ts`와 HUMAN GM message/economy action, GM 이탈 후 runtime endpoint 거절 수동 확인이다.
- 2026-07-02: VTT token 이동 경로 탐색, blocker collision, 대각 모서리 통과 방지, player map shell 변조 검증, token-only move 검증, grid 이동 거리 계산을 `SessionVttMovementPolicyService`로 분리했다. `SessionsService`는 `moveSessionToken`, player map update, 몬스터 token 이동 orchestration을 유지하고, 지도 이동 규칙 변경 이유는 새 정책 서비스에 모인다. movement policy service spec에 reachable path, wall 차단, diagonal corner-cut 방지, Chebyshev 거리, shell 변조 거절, token 좌표 변경 허용 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-vtt-movement-policy.service.spec.ts map-runtime.service.spec.ts`와 일반 플레이어 token 이동, 전투 중 current actor 이동, 벽/문/지형에 막힌 이동, 몬스터가 대상에게 접근하는 흐름 수동 확인이다.
- 2026-07-02: VTT map의 grid/size/token/fog/ping/light source/terrain/wall/door/object/hazard 정규화와 persisted partial map 복원 책임을 `SessionVttMapNormalizationService`로 분리했다. `SessionsService.normalizeVttMap`과 `toVttMapOrNull`은 기존 runtime/spec 호출면을 유지하는 wrapper가 되었고, map schema 보정 규칙 변경 이유는 새 서비스에 모인다. normalization service spec에 map/token clamp, 구조물/door/object/hazard 정규화, partial map 복원/invalid value 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-vtt-map-normalization.service.spec.ts map-runtime.service.spec.ts`와 세션 시작 시 기본 map 생성, GM map 편집 저장, scenario check option vttMap 로딩, player map 이동 echo 수동 확인이다.
- 2026-07-02: 기본 VTT map 생성, 기본 starting position 계산, active session character 조회, scenario map의 non-player token 보존, 기존 player token 위치/이미지 보정 책임을 `SessionVttMapBootstrapService`로 분리했다. `SessionsService.buildDefaultVttMap`과 `applyScenarioStartingPositions`는 기존 Human GM/runtime 호출면을 유지하는 wrapper가 되었고, 세션 캐릭터를 VTT player token으로 배치하는 규칙 변경 이유는 새 서비스에 모인다. bootstrap service spec에 기본 map 생성, active character query, 기존 NPC token 보존, 기존 player token 위치 clamp/hostile 제거 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-vtt-map-bootstrap.service.spec.ts session-vtt-map-normalization.service.spec.ts map-runtime.service.spec.ts`와 세션 생성/시작 후 player token 배치, scenario default map의 NPC token 보존, 캐릭터 avatar 변경 후 map token 표시 수동 확인이다.
- 2026-07-02: VTT runtime map 변경 후 `gameState.flagsJson`에 map을 저장하고 version을 증가시키는 영속화, VTT map flags payload 조립, host/player map update 이벤트 발행, snapshot 이벤트 발행 책임을 `SessionVttMapPersistenceService`로 분리했다. `SessionsService.getVttMapForUser`의 starting position 보정 저장과 `startSession`의 초기 runtime map 저장은 transaction/version 의미만 유지하고 flags payload 조립은 persistence service에 위임한다. `SessionsService.updateVttMap`, `hideVttToken`, `moveSessionCharacterTokenToMapPoint`, `finalizeRuntimeVttMapChange`, monster token 이동 경로는 hazard/proximity orchestration만 유지하고 저장/발행 변경 이유는 새 서비스에 모인다. persistence service spec에 flags 병합 조립/저장, map update 이벤트 payload, snapshot 이벤트 발행 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-vtt-map-persistence.service.spec.ts map-runtime.service.spec.ts`와 세션 시작 후 runtime map 저장, GM map 저장, token 숨김, player token 이동 후 host/player map 이벤트, hazard trigger 후 snapshot 갱신 수동 확인이다.
- 2026-07-02: VTT interaction DTO에서 직접 mapPoint를 좌표로 변환하고, door/object target id를 cell center 좌표로 해석하는 책임을 `SessionVttInteractionPointService`로 분리했다. `SessionsService.resolveVttMapInteractionPoint`는 map baseline 조회 orchestration만 유지하고, interaction target 좌표 해석 규칙 변경 이유는 새 서비스에 모인다. interaction point service spec에 mapPoint floor 처리, target id trim/null 처리, door/object 중심 좌표, unknown target null 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-vtt-interaction-point.service.spec.ts vtt-map-interaction-runtime.service.spec.ts`와 map point interaction, 문/오브젝트 클릭 interaction 수동 확인이다.
- 2026-07-02: 전투 중 player VTT token 이동에서 participant별 이동 거리 합산, session character speed 조회, combat turn state upsert/update, 남은 이동력 초과 거절 책임을 `SessionVttCombatMovementSpendService`로 분리했다. `SessionsService.applyPlayerVttMapUpdate`는 token 변경 검증과 active combat participant 판정만 유지하고, 전투 이동력 차감 저장 규칙 변경 이유는 새 서비스에 모인다. combat movement spend service spec에 no-op, participant별 거리 합산, character speed 우선, 이동력 초과 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-vtt-combat-movement-spend.service.spec.ts session-vtt-movement-policy.service.spec.ts`와 전투 중 current actor token 이동, 이동력 초과 거절, 비전투 player token 이동 수동 확인이다.
- 2026-07-02: player가 제출한 VTT map diff를 server baseline에 적용하는 책임, uncontrolled token 위치 보존, visible token add/remove 거절, combat movement spend 산출을 `SessionVttPlayerMapUpdateService`로 분리했다. `SessionsService.applyPlayerVttMapUpdate`는 baseline/controlled token/active combat 조회와 movement spend 저장 orchestration만 유지하고, player map diff 적용 규칙 변경 이유는 새 서비스에 모인다. player map update service spec에 stale uncontrolled token 보존, token 제거/추가 거절, current actor movement spend 산출 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-vtt-player-map-update.service.spec.ts session-vtt-combat-movement-spend.service.spec.ts session-vtt-movement-policy.service.spec.ts`와 다인 세션에서 다른 플레이어 stale token echo, player token 이동, 전투 중 current actor 이동 수동 확인이다.
- 2026-07-02: 자동/몬스터 token 이동 path를 frame별 VTT map update 이벤트로 발행하고, 각 frame의 host map/player redacted map 생성과 delay를 관리하는 책임을 `SessionVttMovementFramePublisherService`로 분리했다. `SessionsService.emitVttTokenMovementFrames`는 기존 wrapper로 남겨 `moveVttTokenTowardToken` 호출면을 유지하고, 실시간 프레임 발행 정책 변경 이유는 새 서비스에 모인다. movement frame publisher spec에 empty path no-op, frame별 host/player map event 발행, redaction 호출 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-vtt-movement-frame-publisher.service.spec.ts session-vtt-movement-policy.service.spec.ts`와 몬스터/자동 token 접근 이동 시 host/player 화면 frame 표시 수동 확인이다.
- 2026-07-02: session scenario node의 `checkOptionsJson`에서 default VTT map을 조회/복원하고, legacy check array 또는 `{ checks }` wrapper를 해석하는 책임을 `SessionVttDefaultMapReaderService`로 분리했다. `SessionsService.getScenarioDefaultVttMapForNode`, `extractVttMapFromCheckOptions`, `extractChecksFromCheckOptions`는 Human GM/reveal runtime callback 표면을 유지하는 wrapper가 되었고, scenario node option schema 해석 변경 이유는 새 서비스에 모인다. default map reader spec에 nodeId 없음, node 누락, vttMap 복원, legacy checks 추출, malformed JSON fallback 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-vtt-default-map-reader.service.spec.ts session-vtt-map-normalization.service.spec.ts`와 scenario default map 로딩, Human GM node 이동 후 map 적용, reveal/check option 표시 수동 확인이다.
- 2026-07-02: active session scenario 우선 선택, fallback 첫 scenario 선택, scenario link 누락 예외, 세션 scenario link 삭제 책임을 `SessionScenarioLinkService`로 분리했다. `SessionsService.getActiveSessionScenarioEntityOrThrow`, `getActiveSessionScenario`, `deleteSessionScenarioLinks`는 기존 Human GM/reveal/transfer 호출면을 유지하는 wrapper가 되었고, session-scenario link query shape 변경 이유는 새 서비스에 모인다. scenario link service spec에 active 우선, fallback, 누락 예외, transaction delete, included link 선택 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-scenario-link.service.spec.ts`와 세션 삭제, Human GM node 이동, 캐릭터 transfer request/approve에서 active scenario 참조 수동 확인이다.
- 2026-07-02: Human GM AI assist suggestion flags의 shape 검증, invalid persisted entry 필터링, append 시 최근 100개 유지, accept 상태와 accepted metadata 갱신 책임을 `SessionHumanGmAiAssistSuggestionStoreService`로 분리했다. `SessionsService`는 생성/목록/수락/실패 보고 orchestration을 유지하고, suggestion 저장 배열의 호환성 및 상태 변경 규칙은 새 서비스에 모인다. suggestion store service spec에 유효 suggestion 필터링, 최근 100개 유지, accepted metadata 갱신 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-human-gm-ai-assist-suggestion-store.service.spec.ts`와 Human GM AI assist 생성/목록/수락/실패 보고 수동 확인이다.
- 2026-07-02: Human GM private note flags의 shape 검증, invalid persisted entry 필터링, append 시 최근 100개 유지, GM endpoint의 최신순 projection 책임을 `SessionHumanGmPrivateNoteStoreService`로 분리했다. `SessionsService`는 private note 생성/조회 orchestration과 audit log 생성 흐름을 유지하고, private note 저장 배열의 호환성 및 표시 순서 변경 이유는 새 서비스에 모인다. private note store service spec에 유효 note 필터링, 최신순 정렬, 최근 100개 유지 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-human-gm-private-note-store.service.spec.ts`와 Human GM private note 생성, GM 전용 private note 목록, 공개 turn log에 private note가 노출되지 않는지 수동 확인이다.
- 2026-07-02: Human GM message flags record 생성, `gmMessages` append, legacy message entry 보존, 최근 50개 유지 책임을 `SessionHumanGmMessageStoreService`로 분리했다. `HumanGmRuntimeService.createHumanGmMessage`는 세션 상태 전환, node snapshot 보정, audit turn log 생성, 이벤트 발행 orchestration을 유지하고, message 저장 배열 변경 이유는 새 store 서비스에 모인다. message store service spec에 message record 생성, 최근 50개 유지, unrelated flags/legacy entry 보존 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-human-gm-message-store.service.spec.ts`와 Human GM message 생성, NPC dialogue 생성, private note 포함 message에서 공개 turn log에 private note가 노출되지 않는지 수동 확인이다.
- 2026-07-02: 승인된 Human GM AI assist suggestion 적용 실패를 기록하는 turn log 생성, 실패 사유/작업명 trimming fallback, `ai_assist_apply_failure` structured action metadata 조립 책임을 `SessionHumanGmAiAssistFailureAuditService`로 분리했다. `SessionsService.reportHumanGmAiAssistApplicationFailure`는 HUMAN GM 접근, suggestion 존재/ACCEPTED 상태 검증, snapshot/event 발행 orchestration만 유지하고, 실패 audit log 계약 변경 이유는 새 서비스에 모인다. failure audit service spec에 turn number 증가, audit payload, blank failure fallback 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-human-gm-ai-assist-failure-audit.service.spec.ts session-human-gm-ai-assist-suggestion-store.service.spec.ts`와 AI assist 수락 후 적용 실패 보고, 실패 사유 공백 fallback, turn log 표시 수동 확인이다.
- 2026-07-02: campaign calendar action 중 플레이어가 직접 제출할 수 있는 `propose_schedule`/`respond_schedule` 판정과 GM 권한이 필요한 action type 판정을 `SessionCampaignCalendarActionPolicyService`로 분리했다. `SessionsService.applyCampaignCalendarAction`은 membership/GM 권한 확인과 runtime 적용 orchestration만 유지하고, calendar action 권한 정책 변경 이유는 새 서비스에 모인다. calendar action policy spec에 player 제출 허용 action과 GM 전용 action 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-campaign-calendar-action-policy.service.spec.ts`와 플레이어 일정 제안/응답, GM 일정 확정/시간 진행/downtime action 수동 확인이다.
- 2026-07-04: `SessionsService` 생성자에 남아 있던 `new Session...Service(...)` 기본값 조립을 제거하고, production runtime에서는 `SessionsModule` provider 기반 DI로 협력 객체를 받도록 정리했다. 기존 `sessions.service.spec.ts`의 다수 직접 생성 경로는 `createSessionsService` 테스트 fixture helper로 모아, 수동 조립 책임이 facade가 아니라 테스트 setup에만 남는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts`와 세션 생성/시작/참여/이탈, Human GM 메시지·노드 이동, VTT map 저장·player 이동, 캠페인 완료/이관, 인벤토리 지급·회수 수동 확인이다.
- 2026-07-04: Sessions 하위 provider 중 `SessionCampaignArchiveBuilderService`, `SessionCharacterSelectionService`, `SessionCharacterVaultItemService`, `SessionParticipantStatusService`, `SessionStartPolicyService`, `SessionVttDefaultMapReaderService`, `HumanGmRuntimeService`에 남아 있던 `new Session...Service(...)`/`new CampaignArchiveRuntimeService()` 기본 조립을 제거했다. production runtime은 `SessionsModule` provider 등록을 따르고, spec의 수동 생성은 각 spec fixture와 `createSessionsService` helper에만 남긴다. `SessionEconomyService`의 `EconomyRuntimeService`처럼 Nest provider가 아닌 pure runtime helper 직접 생성은 이번 DI 안정화 범위 밖의 잔여 예외로 두고, 후속으로 함수 module 전환 여부만 검토한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- sessions.service.spec.ts session-character-selection.service.spec.ts session-vtt-default-map-reader.service.spec.ts`와 캐릭터 선택/준비 상태, 세션 시작 레벨 검증, 기본 VTT map 로딩, Human GM message 수동 확인이다.

두 번째 PR:

- `PlayPage`의 log presentation helper와 main command parser를 분리한다.
- 화면 동작 변경 없음.
- 권장 검증: FE build/lint, 세션 로그/메인 커맨드 수동 확인.

진행 기록:

- 2026-07-02: `PlayPage`에서 로그 표시 규칙과 전투 결과 표시/타입가드 helper를 분리했다. `sessionLogPresentation.ts`는 메인 로그 tone, NPC 대화 표시, 세션 로그 프로필 판정을 담당하고, `combatResultPresentation.ts`는 combat response/action result 타입가드, reaction prompt dedupe, 전투 결과 메시지 포맷을 담당한다. `PlayPage`는 기존 UI 흐름을 유지하면서 새 유틸을 import해 사용한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 세션 로그/전투 액션 수동 확인이다.
- 2026-07-02: `PlayPage`의 combat reaction type -> 사용자 표시 라벨 매핑을 `combatResultPresentation.ts`로 이동했다. 반응 선택 모달은 pending reaction state와 accept/decline 이벤트만 담당하고, 반응 타입 표시 문구 변경 이유는 전투 결과 표시 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 opportunity attack/shield/ready action/counterspell 반응 선택 모달 수동 확인이다.
- 2026-07-02: `PlayPage`의 combat reaction prompt가 현재 사용자 소유 session character 대상인지 판정하는 로직을 `combatResultPresentation.ts`로 이동했다. 페이지는 현재 combat/sessionCharacters/user id만 전달하고, combat participant/session character 매칭 규칙 변경 이유는 전투 결과 presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 다인 세션에서 본인 reaction prompt만 뜨고 다른 플레이어 reaction이 중복 표시되지 않는지 수동 확인이다.
- 2026-07-02: `PlayPage`의 combat reaction decision promise 관리, pending reaction modal state, 이전 pending resolver 자동 거절, reaction id 중복 claim set, decision 이후 submit callback 실행을 `useCombatReactionDecision` 훅으로 분리했다. 페이지는 reaction prompt 수신, 현재 유저 대상 판정, accept/decline API 선택, 전투/맵 결과 반영 helper만 유지하고, reaction decision 생명주기 변경 이유는 sessionPlay combat reaction 훅에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 opportunity attack/shield/ready action/counterspell reaction prompt 중복 표시 방지와 수락/거절 수동 확인이다.
- 2026-07-02: `PlayPage`의 VTT map render signature 생성과 battle-map 이동 성능 로그 gating/formatting을 `vttMapRender.ts`로 분리했다. 페이지는 토큰 이동 요청과 optimistic map 갱신 흐름을 유지하고, 렌더 비교 키 생성과 개발용 성능 로그 포맷은 sessionPlay 유틸이 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 VTT map 로딩·토큰 이동·GM/player map 저장 수동 확인이다.
- 2026-07-02: `PlayPage`의 optimistic token move map 복사/좌표 반영 helper를 `vttMapState.ts`로 분리했다. `PlayPage`는 전투 이동과 일반 세션 토큰 이동에서 optimistic 갱신 시점을 결정하고, map 불변 갱신 규칙은 sessionPlay VTT state 유틸이 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 전투 토큰 이동·세션 토큰 이동 optimistic 반영/서버 응답 reconciliation 수동 확인이다.
- 2026-07-02: `PlayPage`의 VTT map 저장 큐 상태 생성, 세션 전환 시 pending 초기화, pending map enqueue, 저장 claim/complete, 같은 세션 재flush 판정을 `vttMapSaveQueue.ts`로 분리했다. 페이지는 실제 VTT map 저장 API 호출과 저장 성공/실패 UI 반영만 유지하고, 저장 큐 상태 전이 변경 이유는 sessionPlay VTT save queue 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 GM map 연속 편집 저장, 저장 실패 시 최신 확정 map rollback, 세션 전환 시 pending 저장이 남지 않는지 수동 확인이다.
- 2026-07-02: `PlayPage`의 탭 설명, unread count 표시, 채팅 avatar label, participant/token 색상 CSS 변수, socket 연결 라벨, check option label fallback을 `playPagePresentation.ts`로 분리했다. 페이지는 어떤 상태를 보여줄지 결정하고, 반복되는 표시 문자열/스타일 변환 규칙은 sessionPlay presentation 유틸이 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 탭 설명, 채팅 unread badge, 프로필/파티/맵 토큰 색상, 연결 상태 라벨, 판정 옵션 라벨 수동 확인이다.
- 2026-07-02: `PlayPage`의 participant badge, session character 연결, 프로필 색상, 로그 작성자 프로필 색상, NPC dialogue token 이미지 lookup, GM/캐릭터 프로필 이미지 fallback을 `playPageProfilePresentation.ts`로 분리했다. 페이지는 현재 session/participants/characters/map/node 입력만 넘기고, 플레이어/GM/NPC 프로필 표시 모델 변경 이유는 sessionPlay profile presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 참가자 HOST/GM badge, 플레이어 프로필 색상, NPC 대화 로그 이미지, GM narration 프로필 이미지 수동 확인이다.
- 2026-07-02: `PlayPage`의 우측 사이드바 리사이즈 시작 처리, `document.body` cursor/userSelect 임시 변경, window pointermove/pointerup listener 등록/해제를 `sidebarResize.ts`로 분리했다. 페이지는 resizer pointer down 이벤트에서 min/max width와 setter만 전달하고, 브라우저 포인터 이벤트 정리와 width clamp 변경 이유는 sessionPlay sidebar resize 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 우측 패널 드래그 리사이즈, 드래그 종료 후 cursor/user-select 복원, 사이드바 접기/펼치기 수동 확인이다.
- 2026-07-02: `PlayPage`의 `[MAIN]`/`[CHAT]` scope prefix 제거, 채팅/메인 로그 탭 판정, 로그 날짜 grouping key/label 생성을 `sessionLogPresentation.ts`로 이동했다. 페이지는 어떤 로그 목록을 렌더링할지 조합하고, 로그 메시지 scope와 날짜 표시 규칙 변경 이유는 세션 로그 presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 메인/채팅 탭 분리, 로그 날짜 구분선, `[MAIN]`/`[CHAT]` prefix 표시 제거 수동 확인이다.
- 2026-07-02: `PlayPage`의 로그 sender label 결정 규칙을 `sessionLogPresentation.ts`로 이동했다. 페이지는 row class와 presentation 결과를 전달하고, NPC/GM/system/player 표시 이름 fallback 규칙은 세션 로그 presentation 유틸이 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 GM narration/system result/NPC dialogue/player chat sender 표시 수동 확인이다.
- 2026-07-02: `PlayPage`의 캐릭터 능력치 요약 표시 helper를 `characterFeaturePresentation.ts`로 이동했다. 페이지는 carousel에 표시할 캐릭터를 선택하고, STR/DEX/CON/INT/WIS/CHA 라벨과 값 배열 생성은 캐릭터 presentation 유틸이 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 화면 캐릭터 carousel의 능력치 표시 수동 확인이다.
- 2026-07-02: `PlayPage`의 combat missing error 판정과 combat request success debug logging payload 생성을 `combatResultPresentation.ts`로 이동했다. 페이지는 전투 조회/액션 흐름을 유지하고, 전투 응답 관찰/로그 포맷 변경 이유는 전투 결과 presentation 유틸이 담당한다. 호출되지 않던 `getMainCommandCheckEffect`도 제거했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 전투 없는 세션의 fallback 처리, 전투 액션 성공 시 개발자 콘솔 로그 수동 확인이다.
- 2026-07-02: `PlayPage`의 빠른 캐릭터 생성 전투 기본값 계산 중 숙련 보너스, 기대 HP, AC, 이동 속도 계산을 `quickCharacterCombatDefaults.ts`로 분리했다. 페이지는 선택된 종족/직업/레벨/능력치를 조합하고, quick create combat defaults 변경 이유는 characters feature 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 빠른 캐릭터 생성 모달의 LV/HP/AC/이동 표시와 생성 payload 수동 확인이다.
- 2026-07-02: `PlayPage`의 빠른 캐릭터 생성 point-buy 기본 능력치, 종족 능력치 보너스 적용, ASI 가능 레벨/우선순위 선택/적용 계산을 `quickCharacterAbilityDefaults.ts`로 분리했다. 페이지는 선택된 종족/직업/시나리오 레벨을 넘겨 결과를 조합하고, quick create ability defaults 변경 이유는 characters feature 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 빠른 캐릭터 생성 모달의 능력치/ASI 반영과 생성 payload 수동 확인이다.
- 2026-07-02: `PlayPage`의 빠른 캐릭터 생성 기본 feature token 선택 규칙을 `quickCharacterAbilityDefaults.ts`로 이동했다. 페이지는 proficient skill과 ASI 선택 결과를 넘기고, dragonborn ancestry, fighting style, favored enemy, rogue expertise, ASI/feat fallback token 생성 규칙은 characters feature 유틸이 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 dragonborn/fighter/ranger/rogue 빠른 생성 payload의 features 수동 확인이다.
- 2026-07-02: `PlayPage`의 빠른 캐릭터 생성 avatar preset 매핑과 subclass 기본 선택/레벨 판정을 `quickCharacterPresetDefaults.ts`로 분리했다. 페이지는 선택된 직업 key와 레벨을 넘기고, 직업별 preset id와 subclass unlock level/default subclass 정책은 characters feature 유틸이 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 빠른 생성 캐릭터의 avatar preset과 subclassName payload 수동 확인이다.
- 2026-07-02: `PlayPage`의 빠른 캐릭터 생성 starting spell 기본값 계산을 `characterSpellSelectionRules.ts`로 이동했다. 페이지는 선택된 직업, 레벨, 능력치, rule catalog, static spell pool을 넘기고, catalog spell level 해석, quickCreate fallback pool 선택, known/prepared/cantrip 개수 계산은 주문 선택 규칙 유틸이 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 주문 시전 직업 빠른 생성 payload의 cantrips/spells/preparedSpells 수동 확인이다.
- 2026-07-02: `PlayPage`의 빠른 캐릭터 생성 form 기본값, 기본 ancestry/class key, 저장용 className 변환, 시작 장비 item selection 기본값을 `quickCharacterFormDefaults.ts`로 분리했다. 페이지는 모달 상태와 submit 시점만 관리하고, quick create form/equipment 기본값 변경 이유는 characters feature 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 빠른 생성 모달 초기 종족/직업 선택과 시작 장비 payload 수동 확인이다.
- 2026-07-02: `PlayPage`의 main command target 필수 intent 판정을 `mainCommandModel.ts`로 분리했다. 페이지는 submit payload 조립 중 판정 결과만 사용하고, intent별 target requirement 정책 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 target 필수 명령과 일반 GM 요청 submit payload 수동 확인이다.
- 2026-07-02: `PlayPage`의 node type -> main command screen type 변환을 `mainCommandModel.ts`로 이동하고, 사용되지 않던 main command category icon map을 제거했다. 페이지는 현재 노드/완료 전투 상태만 판단하고, main command screen type 변환 정책은 sessionPlay main command 모델 유틸이 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 story/exploration/combat/완료 전투 노드에서 명령 preset 노출 수동 확인이다.
- 2026-07-02: `PlayPage`의 main command slash metadata, slash command/description/helper group getter, helper group compatibility map, slash input parser, general GM fallback preset builder를 `mainCommandModel.ts`로 이동했다. 페이지는 autocomplete와 submit 흐름에서 모델 유틸을 호출하고, slash command/guide/parser 정책 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 `/대화`, `/정보`, `/룰`, helper group autocomplete, 일반 GM 요청 fallback submit 수동 확인이다.
- 2026-07-02: `PlayPage`의 main command category option 생성, slash token 판정, autocomplete 후보/구분선/활성 항목 모델 생성을 `mainCommandModel.ts`로 이동했다. 페이지는 입력 상태와 선택 index만 넘겨 autocomplete view model을 받고, slash autocomplete 노출/정렬/대상 선택 필요 구분 정책 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 `/` 입력 시 명령어 목록, 대상 선택 필요 구분선, 방향키/Home/End/Tab/Enter autocomplete 수동 확인이다.
- 2026-07-02: `PlayPage`의 main command field config map, helper option 정의, 화면/대상/인벤토리 기반 helper option 가시성, 활성 helper option 선택, command field config 선택을 `mainCommandModel.ts`로 이동했다. 페이지는 현재 화면 타입, visible target, 인벤토리 개수, 선택 명령만 넘기고, helper button 노출과 target/item/map point field 정책 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 NPC 없는 탐험 화면의 NPC helper 숨김, object/area target helper, 인벤토리 유무에 따른 아이템 helper, 전투 대화 helper, target/item/map point 입력 표시 수동 확인이다.
- 2026-07-02: `PlayPage`의 main command visible target 필터링, 입력 필드 표시 view model, related intent 후보 필터, target/map point payload 포함 판정을 `mainCommandModel.ts`로 이동했다. 페이지는 선택 상태와 submit 이벤트를 조율하고, target/item/spell/related intent/map point UI 표시 및 payload 포함 정책 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 NPC target 필드, ASK_RULE related intent 선택, map point 입력/누락 오류, target 대신 map point 제출, 탐험 맵 선택 후 payload 반영 수동 확인이다.
- 2026-07-02: `PlayPage`의 main command 좌표 입력 파싱, submit 필수 입력 판정, submit payload 포함 플래그, 사용자 오류 메시지 선택을 `mainCommandModel.ts`의 submit policy builder로 이동했다. 페이지는 policy 결과의 error와 payload flag만 사용하고, target/item/spell/map point/related intent 필수 조건과 오류 문구 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 target 필수 명령의 대상 누락 오류, 아이템/주문/좌표 필수 오류, 좌표 한쪽만 입력한 경우, 일반 텍스트 없이 대상 또는 좌표가 필요한 명령 수동 확인이다.
- 2026-07-02: `PlayPage`의 탐험 main command 즉시 전송 intent 판정, request target/item 해석, 탐험 request raw input 생성, item/map point payload 포함 판정을 `mainCommandModel.ts`로 이동했다. 페이지는 탐험 surface 이벤트를 받아 draft로 보낼지 즉시 submit할지 연결하고, 탐험 명령의 즉시 실행/대기 및 target/item/map point payload 정책 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 탐험 맵에서 조사/관찰/상호작용 즉시 전송, 아이템 활용 draft 전환, targetId 유효성 필터, slash raw input 로그, map point payload 반영 수동 확인이다.
- 2026-07-02: `PlayPage`의 pending exploration main command draft를 입력 폼 상태로 복원하는 message/target/item/map point 문자열 변환을 `mainCommandModel.ts`로 이동했다. 페이지는 draft input model 결과를 state setter에 반영하고, draft 전환 후 slash 원문 조립과 선택값 복원 정책 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 아이템 활용 등 draft 전환 명령에서 slash 입력, 대상/아이템 선택, 좌표 x/y 복원 수동 확인이다.
- 2026-07-02: `PlayPage`의 main command screen/category/intent 값, 화면별 preset 정의, 탐험 화면에서 숨길 preset 필터, 탐험 intent별 preset 조회를 `mainCommandModel.ts`로 이동했다. 페이지는 현재 screen type과 exploration context만 넘겨 preset 목록을 받고, 장면별 명령 라벨/카테고리/intent 노출 정책 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 story/exploration/combat 화면별 명령 목록, 탐험 화면에서 맵 surface 전용 명령 숨김, 탐험 명령 요청의 preset 매칭 수동 확인이다.
- 2026-07-02: `PlayPage`의 main command category label 생성, active/open category 계산, category/intent 선택 상태 보정, open category 옵션 필터를 `mainCommandModel.ts`로 이동했다. 페이지는 보정 결과를 state setter에 반영하고, 장면 전환이나 preset 변경 시 카테고리 선택 유지/초기화 정책 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 story/exploration/combat 전환 시 선택 카테고리 초기화, 열린 카테고리 닫힘, 없는 intent 선택 해제, 카테고리별 명령 목록 수동 확인이다.
- 2026-07-02: `PlayPage`의 main command autocomplete index 보정, 방향키/Home/End 다음 index 계산, active helper group 유효성 판정을 `mainCommandModel.ts`로 이동했다. 페이지는 입력 이벤트와 state setter를 연결하고, autocomplete 이동 및 helper group 선택 유지/초기화 정책 변경 이유는 sessionPlay main command 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 autocomplete 후보가 바뀔 때 active index 초기화, 방향키/Home/End 이동, helper option이 사라지는 화면 전환 시 선택 해제 수동 확인이다.
- 2026-07-02: `PlayPage`의 탐험 맵 선택 라벨과 선택 아이템 라벨 생성을 `playPagePresentation.ts`로 이동했다. 페이지는 선택 상태를 넘겨 표시 문자열만 받아오고, tile/token/door/object/wall/terrain 및 아이템 수량 표시 문구 변경 이유는 sessionPlay presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 탐험 맵 타일/토큰/문/오브젝트/벽/지형 선택 라벨과 아이템 수량 라벨 수동 확인이다.
- 2026-07-02: `PlayPage`의 완료 전투 node id 파싱을 `combatResultPresentation.ts`로, 인벤토리 검색 key와 방패 아이템 판정을 `inventoryItemModel.ts`로 이동했다. 페이지는 완료 전투 여부와 장비 변경 흐름에서 유틸 결과만 사용하고, combat flag 파싱 및 shield/offhand 판정 변경 이유는 각각 전투 결과 표시 유틸과 인벤토리 모델 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 완료된 전투 노드가 탐험 화면처럼 보이는지, 방패 장착/해제 시 offhand 슬롯이 갱신되는지 수동 확인이다.
- 2026-07-02: `PlayPage`의 Human GM AI assist 최근 로그 snippet 생성과 공개 단서 id signature 생성을 `humanGmAssistModel.ts`로 이동했다. 페이지는 현재 로그와 노드 단서를 전달하고, assist context 요약 길이와 단서 변경 감지 키 생성 정책은 Human GM assist 모델 유틸이 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 AI assist 생성 시 최근 로그 context 반영과 새 공개 단서 추가 후 suggestion stale 처리 수동 확인이다.
- 2026-07-02: `PlayPage`의 휴식 승인 대기 목록 projection, 로그/snapshot 중복 제거, 만료/해결 요청 필터, 내 휴식 요청 표시 선택을 `restApprovalPresentation.ts`로 이동했다. 페이지는 GM 승인 카드와 플레이어 취소 카드 표시 여부만 결정하고, 휴식 승인 표시 모델 변경 이유는 sessionPlay rest approval presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 Human GM 세션에서 짧은/긴 휴식 승인 요청·중복 표시 방지·승인/거절/취소 후 카드 제거 수동 확인이다.
- 2026-07-02: `PlayPage`의 story RP 말풍선 후보 로그 필터링, 최근 발화 window 판정, participant -> character 매핑, scope prefix 제거를 `storyRpPresentation.ts`로 이동했다. 페이지는 로그/참가자/캐릭터 목록을 전달하고, 스토리 화면 말풍선 표시 모델 변경 이유는 sessionPlay story RP presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 story 노드에서 메인 RP 발화 후 캐릭터 말풍선이 뜨고 시스템/턴 로그가 말풍선으로 뜨지 않는지 수동 확인이다.
- 2026-07-02: `PlayPage`의 모집 화면 캐릭터 선택 가능 상태, 레벨 제한 문구, 캐러셀 후보/현재 항목/다음 index 계산, 참가자 슬롯 padding, 플레이어 참가자 id 추출을 `recruitingPresentation.ts`로 이동했다. 페이지는 선택/해제 이벤트와 캐러셀 index 상태만 관리하고, 모집 화면 표시 모델 변경 이유는 sessionPlay recruiting presentation 유틸에 모인다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 모집 화면에서 레벨 제한 캐릭터 비활성화, 캐릭터 캐러셀 이동/선택/해제, 빈 참가자 슬롯 표시 수동 확인이다.
- 2026-07-02: `PlayPage`의 메인/채팅 로그 row view model 생성을 `sessionLogPresentation.ts`로 이동했다. 날짜 구분선, pending action 표시, NPC speaker fallback, row class, tone label, sender label 조합을 세션 로그 presentation 유틸이 담당하고, 페이지는 현재 탭/로그/참가자/맵 토큰 입력만 전달한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 메인/채팅 로그 날짜 구분선, pending 표시, NPC 대화 speaker/profile, 플레이어 캐릭터명 sender 표시 수동 확인이다.

세 번째 PR:

- `CombatService`의 monster auto turn과 reaction continuation을 분리한다.
- 권장 검증: combat 관련 spec.

진행 기록:

- 2026-07-02: 자동 몬스터 턴의 실행 중/예약 중 세션 상태를 `CombatService`의 private `Set`에서 `CombatAutoMonsterTurnSchedulerService`로 분리했다. `CombatTurnService`는 기존 자동 턴 실행 흐름을 유지하되, 스케줄/실행 중복 방지 상태를 새 서비스 API로 조회·갱신한다. 새 scheduler 전용 spec을 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- combat.service.spec.ts combat-auto-monster-turn-scheduler.service.spec.ts`이다.
- 2026-07-02: 강제 이동 판정에 필요한 wall/door obstacle projection과 terrain hazard projection을 `CombatMovementService`로 이동했다. `CombatService`는 강제 이동 흐름 orchestration만 유지하고, grid cell/terrain effect 해석은 이동 서비스가 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- combat.service.spec.ts combat-movement.service.spec.ts`와 push/pull/slide 강제 이동, 닫힌 문/벽 충돌, 위험 지형 진입 수동 확인이다.
- 2026-07-02: 강제 이동 mode 문자열 검증과 `push`/`pull`/`slide` 정규화를 `ForcedMovementService.normalizeMode`로 이동했다. `CombatService`는 DTO 값을 rule service에 넘기고, 지원하지 않는 mode에 대한 domain error 정책은 강제 이동 규칙 소유 서비스가 담당한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- combat.service.spec.ts combat-movement.service.spec.ts`와 잘못된 강제 이동 mode 요청 수동 확인이다.
- 2026-07-02: 준비행동/기타 reaction 해결 뒤 자동 몬스터 턴을 재개할 수 있는 조건을 `CombatAutoMonsterTurnSchedulerService.shouldResumeAfterReaction`으로 이동했다. `CombatService`는 HUMAN GM 여부, pending triggered ready action, pending combat reaction, 현재 턴 자동 몬스터 여부를 읽어 전달하고, 재개 정책 변경 이유는 scheduler 서비스에 모인다. scheduler spec에 정책 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- combat.service.spec.ts combat-auto-monster-turn-scheduler.service.spec.ts`와 AI GM 전투에서 준비행동/reaction 해결 후 몬스터 턴 재개, HUMAN GM 전투에서 자동 재개 방지 수동 확인이다.
- 2026-07-02: reaction continuation 후 턴 자동 종료 가능 여부와 ` / 턴 종료` 메시지 suffix 생성을 `CombatReactionContinuationService`로 분리했다. `CombatService`는 opportunity attack continuation과 monster multiattack continuation에서 실제 턴 advance 실행만 유지하고, autoEndTurn/pending reaction/전투 상태 조합 정책은 새 continuation 서비스가 담당한다. 정책 단위 spec을 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- combat.service.spec.ts combat-reaction-continuation.service.spec.ts`와 opportunity attack 후속 공격, Shield로 중단된 monster multiattack 재개, pending reaction 발생 시 턴 종료 보류 수동 확인이다.
- 2026-07-04: `CombatService`와 `CombatMovementService` 생성자에 남아 있던 `new ...Service(...)` 기본값 조립을 제거했다. production runtime은 `CombatModule`/`RulesModule` provider 등록을 따르고, 기존 기본 생성 경로는 `combat.service.spec.ts`와 관련 service spec의 명시 fixture 조립으로 이동했다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- combat.service.spec.ts combat-movement.service.spec.ts combat-cover.service.spec.ts combat-targeting.service.spec.ts combat-auto-monster-turn-scheduler.service.spec.ts combat-reaction-continuation.service.spec.ts`와 전투 시작/공격/반응/몬스터 턴/강제 이동, 지형 효과 거리/cover/targeting 수동 확인이다.

네 번째 PR:

- `CharacterPage`의 spell selection/rule helper와 avatar asset hook을 분리한다.
- 권장 검증: FE build/lint, 캐릭터 생성/레벨업 수동 확인.

진행 기록:

- 2026-07-02: `CharacterPage`에서 아바타 asset 라이브러리 로딩, 업로드 파일 변환, 업로드/삭제 busy 상태, API 에러 처리를 `useCharacterAvatarAssets` 훅으로 분리했다. 페이지는 현재 캐릭터 폼에 업로드 초상화를 적용하거나 삭제 시 기본 초상화로 되돌리는 UI/form 책임만 유지한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 캐릭터 생성/수정 모달에서 초상화 업로드·선택·삭제 수동 확인이다.
- 2026-07-02: `CharacterPage` 상단에 있던 주문 선택 옵션 생성, fallback spell pool 처리, 주문 상세 표시 정보 생성, 준비 주문 제한 계산을 `characterSpellSelectionRules.ts`로 분리했다. 페이지는 생성/레벨업 폼 상태와 `SpellSelectionGrid` 연결만 유지하고, SRD 주문 진행 규칙과 표시 옵션 조립은 새 모듈에 위임한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 그리고 주문 시전 직업 생성·레벨업 주문 습득/교체·준비 주문 저장 수동 확인이다.

다섯 번째 PR:

- `AiHarnessService`의 fallback 허용 정책을 분리한다.
- 권장 검증: harness/fallback policy 관련 pytest.

진행 기록:

- 2026-07-02: `AiFallbackPolicy`를 추가해 fallback 허용 failure type과 HTTP status guard를 `AiHarnessService`에서 분리했다. `AiHarnessService`는 기존 fallback response 생성, trace 구성, logging orchestration을 유지하고 fallback 가능 여부만 새 정책 객체에 위임한다. 정책 단위 spec을 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `python -m pytest ai/app/tests/test_harness_service.py ai/app/tests/test_fallback_policy.py`이다.

여섯 번째 PR:

- FE API 클라이언트의 공통 HTTP 처리 책임을 분리한다.
- 권장 검증: FE build/lint, 인증 재발급 흐름 수동 확인.

진행 기록:

- 2026-07-02: `fe/src/services/api.ts`에 있던 base URL 계산, socket base URL 계산, 인증 만료/토큰 재발급 이벤트, API 에러 본문 파싱, 401 토큰 재발급 retry, `requestJson` 공통 요청 처리를 `httpClient.ts`로 분리했다. 기존 `api.ts`는 endpoint wrapper export와 기존 상수 re-export를 유지하므로 호출부 import 경로는 바꾸지 않았다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 로그인 만료 후 토큰 재발급/로그아웃 이벤트 수동 확인이다.
- 2026-07-02: guest/register/login/logout/reissue/me/oauth/public profile endpoint wrapper를 `authApi.ts`로 분리했다. `api.ts`는 동일한 함수명을 re-export해 `useAuth`, `useCurrentProfile`, `PublicProfilePage`, OAuth login 호출부의 import 경로를 유지한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 게스트 로그인·이메일 로그인·회원가입·OAuth 로그인·프로필 수정/탈퇴 수동 확인이다.
- 2026-07-02: public/my scenario 목록, available scenario 조합, scenario CRUD/publish/fork/delete, collaboration/review/moderation, scenario image/asset endpoint wrapper와 선택용 helper를 `scenarioApi.ts`로 분리했다. `api.ts`는 기존 함수명을 re-export하고 세션 생성 기본 시나리오 상수만 내부 별칭으로 참조한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 시나리오 목록/내 시나리오/시나리오 생성·수정·공개·fork·asset 업로드/삭제 수동 확인이다.
- 2026-07-02: session list/my list, create/join/get/detail, long campaign archive, character vault/transfer, session action/rest request, main command/check resolve, inventory use, turn log, campaign calendar endpoint wrapper를 `sessionApi.ts`로 분리했다. `api.ts`는 기존 함수명을 re-export해 `useSession`, `SessionDetailPage`, `ProfilePage`, `PlayPage`의 import 경로를 유지한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 세션 목록·생성·참여·상세 조회·메인 커맨드·휴식 요청·턴 로그·캠페인 캘린더 수동 확인이다.
- 2026-07-02: VTT map 조회/저장, GM map 저장, token 이동, ping 생성, map interaction endpoint wrapper를 `vttMapApi.ts`로 분리했다. `api.ts`는 기존 함수명을 re-export해 `PlayPage`의 import 경로를 유지한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, VTT map 로딩·토큰 이동·GM/player map 저장·ping·interaction 수동 확인이다.
- 2026-07-02: combat 조회/시작/종료/턴 종료, 피해/공격/무기 공격, 전투 class feature action, dash/dodge/hide, actor action, auto monster turn, spell cast, 이동/강제 이동, reaction accept/decline endpoint wrapper를 `combatApi.ts`로 분리했다. `api.ts`는 기존 함수명을 re-export해 `PlayPage`의 import 경로를 유지한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 전투 시작·공격·주문 시전·이동/강제 이동·reaction 처리·턴 종료 수동 확인이다.
- 2026-07-02: character 생성/목록/clone/update/delete, level up, 장비/준비 주문 저장, avatar asset 목록/업로드/삭제, session character selection endpoint wrapper를 `characterApi.ts`로 분리했다. `api.ts`는 기존 함수명을 re-export해 `useSession`, `CharacterPage`, `ProfilePage`, `PlayPage`, `useCharacterAvatarAssets`의 import 경로를 유지한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 캐릭터 생성·수정·복제·삭제·레벨업·장비 변경·준비 주문 저장·아바타 업로드/삭제·세션 캐릭터 선택 수동 확인이다.
- 2026-07-02: participant ready, session start, session leave endpoint wrapper를 `sessionApi.ts`로 이동해 세션 lifecycle 변경 이유를 한 파일로 모았다. `api.ts`는 기존 함수명을 re-export하므로 호출부 import 경로는 유지된다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 세션 모집 화면에서 ready 토글·세션 시작·세션 나가기 수동 확인이다.
- 2026-07-02: Human GM 지정, 노드 이동, 메시지, 이동 옵션, 인벤토리 지급/삭제, 경제 액션, 전투 상태/HP/DC 조정, private note, AI assist suggestion endpoint wrapper를 `humanGmApi.ts`로 분리했다. `api.ts`는 legacy barrel로 같은 함수명을 re-export해 `PlayPage`의 import 경로를 유지한다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, Human GM 메시지·노드 이동·private note·AI assist 생성/수락/실패 보고·인벤토리/경제/전투 HP·상태 조정 수동 확인이다.
- 2026-07-02: race/class/item/rule catalog 조회 endpoint wrapper를 `catalogApi.ts`로 분리했다. 이로써 `api.ts`는 도메인 endpoint 구현 없이 기존 import 경로 호환을 위한 re-export barrel 역할만 남는다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix fe run build`, `npm --prefix fe run lint`, 앱 초기 로딩의 종족/직업 목록·캐릭터/플레이 화면의 아이템/룰 카탈로그 로딩 수동 확인이다.

일곱 번째 PR:

- `ActionsService`의 휴식 승인 command/metadata 정책을 분리한다.
- 권장 검증: actions/rest approval 관련 spec.

진행 기록:

- 2026-07-02: 휴식 승인 요청의 `/rest ...` raw text 생성, raw text에서 rest type/hit dice 파싱, short rest에만 hit dice metadata를 유지하는 정책을 `rest-approval-policy.ts`로 이동했다. `ActionsService`는 승인/거절/취소/만료 orchestration과 DB 상태 변경을 유지하고, 휴식 승인 command 문자열과 metadata 해석 변경 이유는 정책 파일에 모인다. 정책 spec에 raw text/metadata 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts rest-approval-policy.spec.ts`와 Human GM 세션에서 짧은 휴식 hit dice 승인, 긴 휴식 승인, 거절/취소/만료 로그 metadata 수동 확인이다.
- 2026-07-02: 휴식 승인 API 응답의 `restApproval` metadata 조립을 `buildRestApprovalResponseMetadata`로 이동했다. `ActionsService`는 상태별 queue 결과와 turn log 기록을 유지하고, action id/rest type/status/hit dice/expiresAt 응답 계약 변경 이유는 `rest-approval-policy.ts`에 모인다. 정책 spec에 explicit 값과 raw text 기반 metadata 조립 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts rest-approval-policy.spec.ts`와 휴식 요청 생성/승인/거절/취소 응답 payload 수동 확인이다.
- 2026-07-02: 휴식 요청 대기 로그와 거절/취소/만료 로그의 `structuredAction` 조립을 `buildRestRequestStructuredAction`, `buildRestApprovalStructuredAction`으로 이동했다. `ActionsService`는 로그 생성 시점과 발행만 담당하고, rest approval log payload의 status/expiresAt/hit dice 포함 규칙 변경 이유는 `rest-approval-policy.ts`에 모인다. 정책 spec에 요청 로그와 처리 로그 metadata 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts rest-approval-policy.spec.ts`와 휴식 요청 대기 로그, GM 거절 로그, 요청자 취소 로그, 만료 로그의 structured action 수동 확인이다.
- 2026-07-02: Human GM 휴식 승인 요청 기록의 playerAction 생성, accepted 이벤트 발행, GM 승인 대기 turn log 생성, `restApproval` 응답 metadata 조립을 `RestApprovalRequestRecorderService`로 분리했다. `ActionsService`는 휴식 명령 해석과 Human GM 승인 필요 판단 뒤 recorder를 호출하고, 승인 대기 요청 기록/로그/응답 계약 변경 이유는 새 서비스에 모인다. recorder service spec에 action 생성 payload, accepted/log 이벤트, 응답 metadata 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts rest-approval-request-recorder.service.spec.ts rest-approval-policy.spec.ts`와 Human GM 세션에서 짧은 휴식 승인 요청, 대기 로그, GM 승인/거절 진입 수동 확인이다.
- 2026-07-02: Human GM 휴식 승인 요청의 승인/거절/취소/만료 처리에서 claim `updateMany`, 승인 accepted 이벤트와 action processor 재진입, rest approval turn log 생성, log 이벤트 발행, 응답 metadata 조립을 `RestApprovalResolutionService`로 분리했다. `ActionsService`는 권한/요청 유효성/전투 차단을 확인한 뒤 resolution service를 호출하고, 승인 요청 상태 전환과 로그/응답 계약 변경 이유는 새 서비스에 모인다. resolution service spec에 승인 requeue/process, GM 거절, 요청자 취소 guard, 이미 claim된 만료 no-op, 만료 로그 생성 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts rest-approval-resolution.service.spec.ts rest-approval-policy.spec.ts`와 GM 승인, GM 거절, 요청자 취소, 만료된 승인 요청 처리 수동 확인이다.
- 2026-07-02: Human GM 휴식 승인 endpoint들에 반복되던 Human GM mode 확인, GM operator 권한 확인, 승인 요청 action 조회/유효성 검증, 요청자 취소 권한 확인, 만료 시 resolution 위임을 `RestApprovalGuardService`로 분리했다. `ActionsService`는 승인/거절/취소 endpoint별 순서와 전투 차단만 조율하고, 휴식 승인 guard 정책 변경 이유는 새 서비스에 모인다. guard service spec에 Human GM only, GM 권한, 유효한 승인 action 조회, 만료 action resolution 위임 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts rest-approval-guard.service.spec.ts rest-approval-resolution.service.spec.ts`와 GM 아닌 사용자 승인/거절 거부, 요청자 아닌 취소 거부, 만료 요청 처리 수동 확인이다.
- 2026-07-02: 일반 action submit과 rest submit의 참가자 joined 확인, actor session character 조회, 캐릭터 소유권/선택 검증, action scope 기본값/전투 턴 허용 검증, GM 휴식 대상 캐릭터 선택을 `ActionSubmissionContextLoaderService`로 분리했다. `ActionsService`는 세션 membership/playing 확인 뒤 context loader 결과로 playerAction 생성과 queue 처리만 이어가고, 제출 가능한 actor/context 정책 변경 이유는 새 서비스에 모인다. context loader spec에 party shared submit, non-host party action 거절, individual turn mismatch, GM rest target 선택, 타 사용자 rest 캐릭터 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts action-submission-context-loader.service.spec.ts`와 전투/비전투 일반 행동 제출, 다인 세션 party action 권한, GM 휴식 대리 요청, 플레이어 휴식 요청 캐릭터 검증 수동 확인이다.
- 2026-07-02: 일반 pending action 제출과 AI/GM 직접 휴식 제출에 반복되던 `playerAction` 생성, accepted 이벤트 발행, action processor 재진입, `ActionAcceptedResponseDto` 조립을 `ActionQueueSubmissionService`로 분리했다. `ActionsService`는 제출 context와 raw command만 준비하고 queue 기록/발행/처리 계약 변경 이유는 새 서비스에 모인다. queue submission service spec에 pending action create payload, accepted 이벤트, processor 호출, 응답 shape 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts action-queue-submission.service.spec.ts action-submission-context-loader.service.spec.ts`와 일반 행동 제출, AI GM 휴식 즉시 처리, Human GM이 직접 대리 휴식 실행하는 흐름 수동 확인이다.
- 2026-07-04: `ActionProcessorService` 생성자에 남아 있던 `new SpellSlotService()`/`new RuleEngineService()` 기본 조립을 제거했다. production runtime은 `ActionsModule`이 import하는 `RulesModule` provider를 따르고, 기존 spec 직접 생성 경로는 mock 인자를 명시하는 fixture 조립으로만 남긴다. 테스트는 실행하지 않았으며, 권장 검증은 `npm --prefix be test -- action-processor.service.spec.ts actions.service.spec.ts`와 action queue 중복 처리, 실패 로그 보정, map-only runtime effect precondition, rest runtime effect 수동 확인이다.

여덟 번째 PR:

- `ActionsService`의 인벤토리 아이템 사용 판정/런타임 flag 정책을 분리한다.
- 권장 검증: actions inventory item 관련 spec.

진행 기록:

- 2026-07-02: P3 item runtime flags key/type, flags JSON 정규화, 안전한 JSON parse fallback, quick usable item 판정, pack-like item 판정, legacy healing fallback amount, item search key 생성을 `inventory-item-policy.ts`로 분리했다. `ActionsService`는 아이템 사용 orchestration, DB 상태 변경, 이벤트 발행, 전투/맵 효과 처리를 유지하고, 아이템 사용 가능성 및 runtime flag shape 변경 이유는 새 policy 파일에 모인다. 정책 spec을 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-policy.spec.ts`와 포션 사용, 꾸러미 풀기, 조율 필요 아이템, 충전형 아이템 사용 수동 확인이다.
- 2026-07-02: 아이템 주문/아이템 대상 판정에 쓰이는 grid distance 계산, participant token lookup, session character token lookup, radius 내 생존 참가자 필터링을 `inventory-item-policy.ts`로 이동했다. `ActionsService`는 사거리 초과 시 domain error를 던지는 흐름과 주문 효과 적용 orchestration을 유지하고, 맵 거리 계산 및 범위 대상 추출 규칙 변경 이유는 policy 파일에 모인다. 정책 spec에 거리 계산, 토큰 매칭, 범위 필터 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-policy.spec.ts`와 magic missile 사거리, fireball 범위 대상, web 지점 사거리, 일반 아이템 대상 사거리 수동 확인이다.
- 2026-07-02: magic missile/fireball/web 아이템 주문의 turn log message, `structuredAction`, `stateDiff` 조립을 `buildMagicMissileItemSpellLogModel`, `buildFireballItemSpellLogModel`, `buildWebItemSpellLogModel`로 분리했다. `ActionsService`는 대상 검증, dice roll, HP/terrain 변경, turn log 저장만 담당하고, 아이템 주문 로그 계약 변경 이유는 policy 파일에 모인다. 정책 spec에 세 주문 로그 모델 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-policy.spec.ts`와 magic missile 피해 로그, fireball 다중 대상/무대상 로그, web terrain 로그 수동 확인이다.
- 2026-07-02: 조율 로그와 일반 아이템 사용 로그의 message/`structuredAction` 조립을 `buildItemAttunementLogModel`, `buildInventoryItemUseLogModel`로 분리했다. `ActionsService`는 조율 상태 저장, HP/temp HP/condition 적용, 아이템 소모, dice/event 발행 흐름을 유지하고, 조율/사용 로그 계약 변경 이유는 policy 파일에 모인다. 정책 spec에 조율 로그와 HP 회복/효과 메시지 사용 로그 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-policy.spec.ts`와 조율 필요 아이템 최초 사용 로그, 포션 회복 로그, utility/condition 아이템 사용 로그 수동 확인이다.
- 2026-07-02: SRD equipment JSONL 로딩/cache, 장비 record -> itemDefinition data 변환, 장비 설명/useEffect/pack contents JSON 생성, pack record lookup, pack 획득 summary 생성을 `srd-equipment-policy.ts`로 분리했다. `ActionsService`는 꾸러미 인벤토리 트랜잭션과 snapshot sync만 유지하고, SRD 장비 스키마/표시/변환 규칙 변경 이유는 policy 파일에 모인다. 정책 spec에 이름 fallback, 무기/방어구/치유 물약 변환, pack contents/summary 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts srd-equipment-policy.spec.ts`와 꾸러미 풀기, SRD 무기/방어구 itemDefinition 생성, 치유 물약 useEffect 수동 확인이다.
- 2026-07-02: 아이템 주문 지점 기반 terrain cell과 사용자 token 기반 terrain cell의 size/좌표 clamp/id/description 조립을 `buildPointItemTerrainCell`, `buildTokenItemTerrainCell`로 분리했다. `ActionsService`는 VTT map 조회와 system map 저장만 유지하고, terrain 배치 좌표 계산 변경 이유는 `inventory-item-policy.ts`에 모인다. 정책 spec에 point-centered cell과 token-centered cell 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-policy.spec.ts`와 web 주문 지형 배치, terrain 효과 아이템 사용 시 맵 가장자리 clamp 수동 확인이다.
- 2026-07-02: temporary HP 적용값/메시지, condition/utility/tool/spell 효과의 condition tag/duration/message, terrain 효과 메시지 생성을 `resolveTemporaryHpEffect`, `buildItemConditionEffectMetadata`, `buildTerrainItemEffectMessage`로 분리했다. `ActionsService`는 dice roll과 `ConditionRuntimeService` 적용만 유지하고, 아이템 효과 metadata 변경 이유는 `inventory-item-policy.ts`에 모인다. 정책 spec에 temporary HP, condition/tool/spell metadata, terrain message 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-policy.spec.ts`와 temporary HP 아이템, condition/utility/tool 아이템, terrain 아이템 사용 로그 수동 확인이다.
- 2026-07-02: 조율된 item entry 목록 조회, 조율 item entry 추가, 충전형 아이템 사용 전/후 잔여 충전 계산을 `getAttunedItemEntryIds`, `addAttunedItemEntry`, `resolveItemChargeUsage`로 분리했다. `ActionsService`는 조율 슬롯 초과/충전 소진 domain error와 runtime flags 저장만 유지하고, P3 item runtime flag shape 변경 이유는 `inventory-item-policy.ts`에 모인다. 정책 spec에 불변 조율 추가와 충전 차감/소진 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-policy.spec.ts`와 조율 필요 아이템 최초 사용, 조율 슬롯 초과, 충전형 아이템 사용/소진 수동 확인이다.
- 2026-07-02: 실행형 아이템 효과 해석 중 dice roll, temporary HP, condition runtime 적용, terrain message 반환을 `InventoryItemEffectRuntimeService`로 분리했다. `ActionsService`는 아이템 사용 흐름에서 효과 해석 결과를 받아 DB 업데이트/아이템 소모/이벤트 발행을 이어가고, 효과 런타임 의존 변경 이유는 새 서비스에 모인다. runtime service spec을 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-effect-runtime.service.spec.ts inventory-item-policy.spec.ts`와 healing/temporary HP/condition/terrain 아이템 사용 수동 확인이다.
- 2026-07-02: magic missile/fireball/web 아이템 주문 실행, 전투 참가자/토큰 검증, 주문 사거리 검증, 주문 피해 적용, web terrain 저장, 주문 turn log 생성을 `InventoryItemSpellRuntimeService`로 분리했다. `ActionsService`는 주문 아이템 분기에서 runtime 결과를 받아 아이템 소모/충전 저장/이벤트 발행만 이어가고, 아이템 주문 실행 변경 이유는 새 서비스에 모인다. runtime service spec에 magic missile 피해/로그와 web 지형 저장 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-spell-runtime.service.spec.ts inventory-item-policy.spec.ts`와 magic missile, fireball, web 아이템 주문 수동 확인이다.
- 2026-07-02: 일반 아이템 대상 사거리 검증과 token 중심 terrain 아이템 배치를 `InventoryItemMapRuntimeService`로 분리했다. `ActionsService`는 일반 아이템 사용 흐름에서 map runtime을 호출만 하고, VTT map 조회, session character token 탐색, 거리 계산, system terrain 저장 변경 이유는 새 서비스에 모인다. runtime service spec에 terrain 배치, 사용자 token 누락, 대상 token 누락, 사거리 초과 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-map-runtime.service.spec.ts inventory-item-policy.spec.ts`와 일반 아이템 대상 사거리, terrain 효과 아이템 사용, 맵 가장자리 terrain clamp 수동 확인이다.
- 2026-07-02: 전투 중 아이템 사용의 action/bonus action 비용 차감, 현재 턴 참가자 검증, active combat 조회를 `InventoryItemActionCostRuntimeService`로 분리했다. `ActionsService`는 아이템 사용 흐름에서 action cost runtime을 호출만 하고, 전투 턴 검증과 `ActionEconomyService` 호출 변경 이유는 새 서비스에 모인다. runtime service spec에 비전투 no-op, action 차감, bonus action 차감, 현재 턴 불일치 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-action-cost-runtime.service.spec.ts inventory-item-policy.spec.ts`와 전투 중 action 아이템, bonus action 아이템, 자신의 턴이 아닐 때 아이템 사용 거절 수동 확인이다.
- 2026-07-02: SRD 꾸러미 풀기 트랜잭션, pack entry 소모/감소, content itemDefinition upsert, content inventoryEntry 생성, 인벤토리 snapshot sync를 `InventoryPackRuntimeService`로 분리했다. `ActionsService`는 pack 판정 후 runtime 호출, 캐릭터 재조회, 응답/이벤트 발행만 유지하고, pack contents mutation 변경 이유는 새 서비스에 모인다. runtime service spec에 단일 pack 삭제, stack pack 감소, 잘못된 pack entry, 누락된 content definition 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-pack-runtime.service.spec.ts srd-equipment-policy.spec.ts`와 탐험가/던전 탐험가 꾸러미 풀기, stack된 꾸러미 수량 감소, 꾸러미 내용물 표시 수동 확인이다.
- 2026-07-02: 아이템 사용 후 인벤토리 포함 session character 재조회와 `mapSessionCharacter` DTO 매핑을 `InventoryItemCharacterReaderService`로 분리했다. `ActionsService`는 조율/꾸러미/주문/일반 아이템 결과에서 reader 호출만 하고, 캐릭터 include shape와 inventory DTO mapping 변경 이유는 새 서비스에 모인다. reader service spec에 inventory entry 포함 재조회와 mapper 호출 결과 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-character-reader.service.spec.ts`와 아이템 사용 후 캐릭터 인벤토리 갱신 표시 수동 확인이다.
- 2026-07-02: P3 item runtime flags의 game state 저장과 기존 flags JSON 병합을 `InventoryItemRuntimeFlagsService`로 분리했다. `ActionsService`는 조율/충전형 아이템 사용 후 runtime flags 저장을 서비스에 위임하고, `gameState.update` payload와 `p3ItemRuntime` 저장 key 변경 이유는 새 서비스에 모인다. runtime flags service spec에 기존 flags 유지와 item runtime 병합 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-runtime-flags.service.spec.ts inventory-item-policy.spec.ts`와 조율 아이템, 충전형 아이템 사용 후 flags 유지 수동 확인이다.
- 2026-07-02: 조율 필요 여부/슬롯 초과 판정과 충전형 아이템 잔여 충전 차감/소진 거절을 `InventoryItemRuntimeStateService`로 분리했다. `ActionsService`는 조율 결과 저장, 로그 생성, 후속 아이템 사용 흐름만 조율하고, 조율 슬롯 정책과 charge runtime state 변경 이유는 새 서비스에 모인다. runtime state service spec에 신규 조율, 이미 조율됨, 슬롯 초과, 충전 차감, 충전 소진 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-runtime-state.service.spec.ts inventory-item-policy.spec.ts`와 조율 필요 아이템 최초/재사용, 조율 슬롯 초과, 충전형 아이템 사용/소진 수동 확인이다.
- 2026-07-02: 일반 아이템 효과 적용 시 회복량 clamp, legacy healing fallback, temp HP/condition DB update payload 구성을 `InventoryItemEffectApplicationService`로 분리했다. `ActionsService`는 effect runtime 결과를 application service에 넘기고 `healedHp`만 받아 로그/응답을 이어가며, 캐릭터 HP/temp HP/condition 저장 규칙 변경 이유는 새 서비스에 모인다. application service spec에 bounded healing, temp HP+condition 적용, legacy healing fallback, no-op 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-effect-application.service.spec.ts inventory-item-effect-runtime.service.spec.ts`와 포션 회복, temporary HP 아이템, condition 아이템 사용 수동 확인이다.
- 2026-07-02: 인벤토리 아이템 사용 결과의 character/dice/turn log/session snapshot 이벤트 발행과 `UseInventoryItemResponseDto` 조립을 `InventoryItemResultPublisherService`로 분리했다. `ActionsService`는 조율/꾸러미/주문/일반 아이템 분기에서 결과 데이터만 publisher에 넘기고, 실시간 이벤트 발행 순서와 응답 shape 변경 이유는 새 서비스에 모인다. result publisher spec에 중복 character update 제거, dice/turn log/snapshot 발행, response payload 조립 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-result-publisher.service.spec.ts`와 아이템 사용 후 캐릭터 갱신, dice 로그, turn log, session snapshot 수동 확인이다.
- 2026-07-02: 아이템 사용 요청의 actor session character 조회, 대상 캐릭터 조회, inventory entry 검색, 실행형 item manifest 조회, backend 사용 가능성 검증을 `InventoryItemContextLoaderService`로 분리했다. `ActionsService`는 세션 membership/playing 확인 뒤 item use context만 받아 이후 orchestration을 이어가고, item lookup 조건과 early domain error 변경 이유는 새 서비스에 모인다. context loader spec에 actor/target/item/executable 로딩, 캐릭터 미선택, 대상 없음, 아이템 없음, quick usable 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-context-loader.service.spec.ts inventory-item-policy.spec.ts`와 아이템 id/itemDefinitionId/name 사용, 타겟 아이템 사용, 미사용 가능 아이템 거절 수동 확인이다.
- 2026-07-02: 아이템 사용 후 entry 수량 소모와 충전형 아이템 runtime flags 저장을 `InventoryItemConsumptionRuntimeService`로 분리했다. `ActionsService`는 주문/일반 아이템 분기에서 사용 비용 영속화를 호출하고 `consumedQuantity`만 응답에 반영하며, 소모형/비소모형/충전형 아이템 저장 규칙 변경 이유는 새 서비스에 모인다. consumption runtime spec에 legacy item 소모, reusable charge item flags 저장, expendable charge item 소모+flags 저장 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-consumption-runtime.service.spec.ts inventory-item-runtime-flags.service.spec.ts`와 소모형 아이템, 비소모 충전형 아이템, 소모+충전형 아이템 사용 후 인벤토리/flags 수동 확인이다.
- 2026-07-02: SRD 꾸러미 사용 여부 판정, catalog item key 조회, pack-like item 내용물 누락 거절, unpack 후 응답 캐릭터/메시지 조립을 `InventoryPackUseRuntimeService`로 분리했다. `ActionsService`는 pack 사용 결과가 있으면 publisher에 전달하고, pack lookup과 pack-specific domain error 변경 이유는 새 서비스에 모인다. pack use runtime spec에 SRD pack unpack 결과, non-pack null, pack-like contents 누락 거절 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-pack-use-runtime.service.spec.ts inventory-pack-runtime.service.spec.ts srd-equipment-policy.spec.ts`와 탐험가 꾸러미 풀기, 일반 아이템 사용, 내용물 없는 custom 꾸러미 거절 수동 확인이다.
- 2026-07-02: 조율 필요 아이템의 최초 사용 처리에서 runtime flags 저장, 조율 후 캐릭터 재조회, 조율 turn log 생성을 `InventoryItemAttunementRuntimeService`로 분리했다. `ActionsService`는 조율 필요 여부만 판정한 뒤 attunement runtime 결과를 publisher에 전달하고, 조율 저장/로그 계약 변경 이유는 새 서비스에 모인다. attunement runtime spec에 flags 저장, 조율 로그 생성, 반환 메시지/캐릭터/turn log 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-attunement-runtime.service.spec.ts inventory-item-runtime-state.service.spec.ts inventory-item-runtime-flags.service.spec.ts`와 조율 필요 아이템 최초 사용, 재사용 시 효과 발동, 조율 로그 표시 수동 확인이다.
- 2026-07-02: 일반 아이템 사용 후 대상/행위자 캐릭터 재조회, 사용 로그 message/structuredAction 생성, dice 포함 turn log 생성, publisher에 넘길 updatedCharacters/diceResults 조립을 `InventoryItemUseResultRuntimeService`로 분리했다. `ActionsService`는 효과 적용과 사용 비용 저장 뒤 use result runtime 결과를 publisher에 전달하고, 일반 아이템 사용 결과 계약 변경 이유는 새 서비스에 모인다. use result runtime spec에 타겟 아이템 회복 로그/주사위/캐릭터 응답과 자기 대상 아이템의 캐릭터 재조회 최적화 케이스를 추가했으며 테스트는 실행하지 않았다. 권장 검증은 `npm --prefix be test -- actions.service.spec.ts inventory-item-use-result-runtime.service.spec.ts inventory-item-policy.spec.ts inventory-item-result-publisher.service.spec.ts`와 포션 회복 로그, 대상 아이템 사용 후 양쪽 캐릭터 갱신, dice roll 이벤트 수동 확인이다.

## 참고한 코드 위치

- `be/src/modules/sessions/sessions.service.ts`
- `be/src/modules/sessions/session-character-selection.service.ts`
- `be/src/modules/sessions/session-economy.service.ts`
- `be/src/modules/sessions/session-inventory.service.ts`
- `be/src/modules/sessions/session-participant-status.service.ts`
- `fe/src/pages/PlayPage.tsx`
- `fe/src/features/characters/characterFeaturePresentation.ts`
- `fe/src/features/characters/characterSpellSelectionRules.ts`
- `fe/src/features/characters/quickCharacterAbilityDefaults.ts`
- `fe/src/features/characters/quickCharacterCombatDefaults.ts`
- `fe/src/features/characters/quickCharacterFormDefaults.ts`
- `fe/src/features/characters/quickCharacterPresetDefaults.ts`
- `fe/src/features/sessionPlay/hooks/useCombatReactionDecision.ts`
- `fe/src/features/sessionPlay/utils/playPagePresentation.ts`
- `fe/src/features/sessionPlay/utils/playPageProfilePresentation.ts`
- `fe/src/features/sessionPlay/utils/recruitingPresentation.ts`
- `fe/src/features/sessionPlay/utils/restApprovalPresentation.ts`
- `fe/src/features/sessionPlay/utils/sidebarResize.ts`
- `fe/src/features/sessionPlay/utils/storyRpPresentation.ts`
- `fe/src/features/sessionPlay/utils/mainCommandModel.ts`
- `fe/src/features/sessionPlay/utils/sessionLogPresentation.ts`
- `fe/src/features/sessionPlay/utils/vttMapRender.ts`
- `fe/src/features/sessionPlay/utils/vttMapSaveQueue.ts`
- `fe/src/features/sessionPlay/utils/vttMapState.ts`
- `be/src/modules/combat/combat.service.ts`
- `fe/src/pages/CharacterPage.tsx`
- `be/src/modules/actions/main-commands.service.ts`
- `fe/src/services/api.ts`
- `fe/src/services/authApi.ts`
- `fe/src/services/catalogApi.ts`
- `fe/src/services/characterApi.ts`
- `fe/src/services/combatApi.ts`
- `fe/src/services/humanGmApi.ts`
- `fe/src/services/httpClient.ts`
- `fe/src/services/scenarioApi.ts`
- `fe/src/services/sessionApi.ts`
- `fe/src/services/vttMapApi.ts`
- `be/src/modules/characters/character-avatar-asset.service.ts`
- `be/src/modules/characters/character-equipment-loadout.service.ts`
- `be/src/modules/characters/character-feature-snapshot.service.ts`
- `be/src/modules/characters/character-spell-selection.service.ts`
- `be/src/modules/characters/characters.service.ts`
- `be/src/modules/actions/action-queue-submission.service.ts`
- `be/src/modules/actions/action-submission-context-loader.service.ts`
- `be/src/modules/actions/main-command-ai-query.service.ts`
- `be/src/modules/actions/main-command-approval-policy.service.ts`
- `be/src/modules/actions/main-command-check-builder.service.ts`
- `be/src/modules/actions/main-command-check-effect-parser.service.ts`
- `be/src/modules/actions/main-command-check-reveal-sync.service.ts`
- `be/src/modules/actions/main-command-context-loader.service.ts`
- `be/src/modules/actions/main-command-interpreter-payload.service.ts`
- `be/src/modules/actions/main-command-interpreter-route-response.service.ts`
- `be/src/modules/actions/main-command-interpreter-router.service.ts`
- `be/src/modules/actions/main-command-inventory-label.service.ts`
- `be/src/modules/actions/main-command-npc-dialogue.service.ts`
- `be/src/modules/actions/main-command-persistence.service.ts`
- `be/src/modules/actions/main-command-post-action-reveal.service.ts`
- `be/src/modules/actions/main-command-rule-fragment.service.ts`
- `be/src/modules/actions/main-command-rule-query.service.ts`
- `be/src/modules/actions/main-command-scene-info.service.ts`
- `be/src/modules/actions/main-command-scene-transition-resolution.service.ts`
- `be/src/modules/actions/main-command-transition-evaluator.service.ts`
- `be/src/modules/actions/inventory-item-action-cost-runtime.service.ts`
- `be/src/modules/actions/inventory-item-attunement-runtime.service.ts`
- `be/src/modules/actions/inventory-item-character-reader.service.ts`
- `be/src/modules/actions/inventory-item-consumption-runtime.service.ts`
- `be/src/modules/actions/inventory-item-context-loader.service.ts`
- `be/src/modules/actions/inventory-item-effect-application.service.ts`
- `be/src/modules/actions/inventory-item-policy.ts`
- `be/src/modules/actions/inventory-item-effect-runtime.service.ts`
- `be/src/modules/actions/inventory-item-map-runtime.service.ts`
- `be/src/modules/actions/inventory-item-result-publisher.service.ts`
- `be/src/modules/actions/inventory-item-runtime-flags.service.ts`
- `be/src/modules/actions/inventory-item-runtime-state.service.ts`
- `be/src/modules/actions/inventory-item-spell-runtime.service.ts`
- `be/src/modules/actions/inventory-item-use-result-runtime.service.ts`
- `be/src/modules/actions/inventory-pack-runtime.service.ts`
- `be/src/modules/actions/inventory-pack-use-runtime.service.ts`
- `be/src/modules/actions/rest-approval-guard.service.ts`
- `be/src/modules/actions/rest-approval-policy.ts`
- `be/src/modules/actions/rest-approval-request-recorder.service.ts`
- `be/src/modules/actions/rest-approval-resolution.service.ts`
- `be/src/modules/actions/srd-equipment-policy.ts`
- `ai/app/services/harness.py`
