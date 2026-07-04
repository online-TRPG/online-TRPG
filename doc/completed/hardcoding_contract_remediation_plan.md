# 하드코딩/암묵 계약 개선 계획

작성일: 2026-07-04

## Summary

전수조사에서 확인한 주요 위험은 다음 여섯 가지다.

- 프론트/백엔드에 흩어진 상태값, 모드값, 응답 status 문자열 비교.
- 메인 명령 체크 플로우가 서버 응답의 세부 구조에 직접 의존하는 문제.
- AI/메인 명령 판단 임계값과 UI 제한값의 의미가 코드 밖에 드러나지 않는 문제.
- 프론트 전투 인벤토리 룰이 무기명, 속성명, 사거리 숫자를 직접 추론하는 문제.
- 런타임 flag key와 unavailable reason 같은 내부 계약 문자열이 중복 정의되는 문제.
- VTT 맵 변경 후처리 순서가 여러 경로에 반복되어 순서 규칙이 코드에 암묵적으로 남아 있는 문제.

목표는 동작을 크게 바꾸지 않고, 먼저 계약을 이름 붙인 상수/타입/어댑터/오케스트레이터로 모아 이후 기능 추가 시 같은 문제가 재발하지 않게 만드는 것이다. 테스트는 이 문서 작성 시 실행하지 않았으며, 구현 단계에서 사용자가 아래 Test Plan의 명령을 선택해 실행한다.

## 원칙

- 기존 public API와 DTO shape는 한 번에 바꾸지 않는다. 먼저 호환 어댑터를 만든 뒤 사용처를 옮긴다.
- shared enum이 이미 있는 값은 새 상수를 만들기보다 `@trpg/shared-types`의 enum을 우선 사용한다.
- Prisma enum과 shared enum의 대소문자 차이는 mapper 계층에서만 다룬다.
- 프론트는 가능한 한 서버 응답 구조를 직접 해석하지 않고, shared 타입 가드나 서비스 어댑터를 통해 의미 단위로 사용한다.
- 룰/AI 임계값은 "숫자"가 아니라 "정책 이름"으로 읽히게 한다.
- 순서가 중요한 파이프라인은 단일 함수로 감싸고, 호출자는 그 함수만 부르게 한다.

## 1. 상태/모드 리터럴 비교 정리

### 문제

`shared-types/src/constants/enums.ts`에 `SessionStatus`, `SessionScenarioStatus`, `SessionParticipantStatus`, `MainCommandStatus`, `CombatStatus`, `GmMode`가 있지만 프론트 일부는 문자열을 직접 비교한다.

대표 위치:

- `fe/src/types/session.ts`
- `fe/src/hooks/useSession.ts`
- `fe/src/pages/SessionDetailPage.tsx`
- `fe/src/features/sessionPlay/hooks/useSessionPermissionProjection.ts`
- `fe/src/features/sessionPlay/hooks/usePlayNodeModeProjection.ts`
- `fe/src/features/sessionPlay/hooks/useGmVttMapSaveQueue.ts`

특히 `SessionStatus`는 shared enum 값이 소문자이고 `GmMode`는 대문자인데, 별도로 `SessionGmMode`라는 소문자 enum도 있어 혼동 가능성이 있다.

### 해결 계획

1. `shared-types/src/constants/enums.ts`의 enum 중 실제 DTO에서 쓰는 값을 기준으로 표준을 정한다.
   - 세션 GM 모드는 `GmMode`를 표준으로 둔다.
   - `SessionGmMode`는 사용처가 없으면 deprecated 주석을 붙인 뒤 후속 PR에서 제거한다.
2. `shared-types`에 상태 판별 helper를 추가한다.
   - 예: `isBlockingSessionStatus(status: SessionStatus): boolean`
   - 예: `isActiveSessionScenarioStatus(status: SessionScenarioStatus): boolean`
   - 예: `isHumanGmMode(gmMode: GmMode): boolean`
3. 프론트 사용처를 helper 또는 enum 비교로 교체한다.
   - `'completed'` -> `SessionStatus.COMPLETED`
   - `'disbanded'` -> `SessionStatus.DISBANDED`
   - `'ACTIVE'` -> `SessionScenarioStatus.ACTIVE`
   - `'JOINED'` -> `SessionParticipantStatus.JOINED`
   - `'HUMAN'` -> `GmMode.HUMAN`
   - `'AI'` -> `GmMode.AI`
4. `fe/src/types/session.ts`의 `normalizeSessionPublicId`에서 `status.toLowerCase()` 캐스팅을 제거한다.
   - 서버가 이미 shared DTO enum 값을 반환해야 하므로, lowercase 보정은 호환 함수로 격리한다.
   - 과거 대문자 status 응답을 계속 받을 가능성이 있으면 `normalizeSessionStatus(value: unknown): SessionStatus`를 shared 또는 FE adapter에 둔다.

### Acceptance Criteria

- 프론트 `fe/src`에서 세션/전투/메인 명령의 핵심 status 비교가 enum 또는 helper를 통해 이루어진다.
- `SessionGmMode`와 `GmMode`의 역할이 문서화되거나 하나로 수렴한다.
- 서버 mapper 계층 외부에서 Prisma enum 문자열을 직접 기대하지 않는다.

## 2. 메인 명령 응답 구조 결합 완화

### 문제

메인 명령 체크 플로우는 프론트가 `MainCommandResponseDto` 내부 구조를 세부적으로 알고 있다.

대표 위치:

- `fe/src/hooks/useSession.ts`
- `fe/src/features/sessionPlay/hooks/useMainCommandCheckResolver.ts`
- `be/src/modules/actions/main-command-check-effect-attachment.service.ts`

현재 프론트는 `response.status === 'CHECK_REQUIRED'`, `response.checkOptions[0]`, `response.data.checkEffect`, `response.requestId`를 직접 조합한다. 백엔드도 `response.checkOptions?.[0]`을 `checkEffect`에 붙인다. 체크 옵션이 복수화되거나 `data` 구조가 바뀌면 UI가 깨질 수 있다.

### 해결 계획

1. `shared-types`에 메인 명령 응답 타입 가드와 accessor를 추가한다.
   - `isMainCommandCheckRequired(response): boolean`
   - `getPrimaryMainCommandCheckOption(response)`
   - `getMainCommandCheckEffect(response)`
   - `isMainCommandImpossible(response)`
2. `MainCommandResponseDto.data`에 들어가는 check effect shape를 명시 타입으로 승격한다.
   - 현재 `Record<string, unknown>` 접근을 줄이고 `MainCommandCheckEffectDto` 또는 union 타입을 둔다.
3. 백엔드의 `MainCommandCheckEffectAttachmentService`가 `checkOptions[0]`을 직접 고르는 대신, shared helper와 같은 의미의 내부 helper를 사용한다.
4. 프론트 `useSession.ts`의 자동 체크 처리 로직을 작은 adapter 함수로 분리한다.
   - 예: `buildPendingMainCommandCheckFromResponse(response)`
   - 예: `buildResolveMainCommandCheckPayload(response, diceOverlay, actorId)`
5. UI hook은 adapter 결과만 보고 동작한다.
   - 응답 구조 변경 시 adapter만 수정하도록 한다.

### Acceptance Criteria

- `fe/src/hooks/useSession.ts`에서 `response.data` 직접 탐색이 사라지거나 adapter 함수 안으로 격리된다.
- 체크 옵션 대표값 선택 규칙이 한 곳에 있다.
- `MainCommandStatus.CHECK_REQUIRED`와 `MainCommandStatus.IMPOSSIBLE` 비교가 enum/helper 기반이다.

## 3. 임계값/제한값 정책화

### 문제

AI/메인 명령 판단에 쓰이는 `0.45`, `0.55`, `0.6`, `0.65`, `0.7` 같은 값이 의미 이름 없이 흩어져 있다. UI/서버 제한값도 `45_000`, `1000`, `99`, `40`, `100` 등이 개별 파일에 직접 등장한다.

대표 위치:

- `be/src/modules/actions/main-command-intent-handlers.service.ts`
- `be/src/modules/actions/main-command-transition-evaluator.service.ts`
- `fe/src/hooks/useSession.ts`
- `be/src/modules/realtime/realtime.gateway.ts`
- `be/src/modules/sessions/human-gm-runtime.service.ts`

### 해결 계획

1. 백엔드 메인 명령 판단 기준을 정책 파일로 모은다.
   - 신규 후보: `be/src/modules/actions/main-command-policy.constants.ts`
   - 예:
     - `MAIN_COMMAND_CONFIDENCE.INTIMIDATE_MINIMUM = 0.45`
     - `MAIN_COMMAND_CONFIDENCE.TOOL_GM_REVIEW_THRESHOLD = 0.6`
     - `MAIN_COMMAND_CONFIDENCE.TRANSITION_GM_REVIEW_THRESHOLD = 0.55`
     - `MAIN_COMMAND_CONFIDENCE.HOSTILE_PERSUASION_REJECT_THRESHOLD = 0.65`
2. 프론트 대기 로그 timeout과 채팅 길이 제한은 shared 가능한 계약 상수로 승격한다.
   - 후보: `shared-types/src/constants/runtime-limits.ts`
   - 예:
     - `MAIN_COMMAND_PENDING_LOG_TIMEOUT_MS = 45_000`
     - `CHAT_MESSAGE_MAX_LENGTH = 1000`
3. 서버 validation과 프론트 validation이 같은 상수를 참조하게 한다.
   - `realtime.gateway.ts`의 1000자 제한과 `fe/src/hooks/useSession.ts`의 1000자 제한을 맞춘다.
4. 도메인 룰 수치와 UI 표현 수치를 분리한다.
   - HP percentage의 100, badge `99+` 같은 UI 숫자는 UI constants로 둔다.
   - DC 1-40, quantity 1-99 같은 서버 정책은 backend policy constants로 둔다.

### Acceptance Criteria

- 메인 명령 confidence 비교에 raw decimal이 남지 않는다.
- 채팅 길이 제한은 FE와 BE가 같은 이름의 상수를 쓰거나, 최소한 같은 shared value에서 온다.
- 정책 상수 이름만 읽어도 해당 숫자의 의미가 드러난다.

## 4. 전투 인벤토리 룰의 데이터 기반화

### 문제

`fe/src/features/sessionPlay/utils/combatInventoryRules.ts`는 무기 id/name 포함 여부로 사거리와 속성을 추정한다.

예:

- `longbow`면 150ft.
- `javelin`이면 30ft 또는 120ft.
- `단검`, `다트`, `핸드액스` 같은 한국어 문자열로 thrown/light/finesse를 추정.

이는 SRD 데이터, 백엔드 룰 엔진, 프론트 UI가 서로 다른 근거로 같은 룰을 계산하게 만든다.

### 해결 계획

1. `InventoryItemDto` 또는 SRD item catalog에 전투 UI가 필요한 필드를 확인한다.
   - `rangeFt`
   - `longRangeFt`
   - `properties`
   - `weaponCategory`
   - `damageDice`
2. 부족한 필드는 `srd-data` 생성 산출물 또는 shared DTO에 추가한다.
   - 이미 원천 데이터에 있으면 FE sync 경로만 연결한다.
3. `combatInventoryRules.ts`를 fallback 전용으로 축소한다.
   - 우선순위:
     1. DTO 명시 필드.
     2. SRD catalog lookup.
     3. 마지막 호환 fallback.
4. 이름 기반 fallback은 별도 map으로 격리하고 deprecated 주석을 붙인다.
   - 예: `LEGACY_WEAPON_RANGE_FALLBACKS`
5. 백엔드의 실제 사거리/속성 계산과 프론트 표시 계산이 같은 item id를 기준으로 검증되게 한다.

### Acceptance Criteria

- `combatInventoryRules.ts`의 핵심 경로에서 `key.includes('longbow')` 같은 이름 추론이 사용되지 않는다.
- 새 무기 추가 시 프론트 코드를 수정하지 않고 데이터만 추가해 표시/행동 가능 여부가 반영된다.
- legacy fallback은 테스트나 오래된 데이터 호환 목적으로만 남는다.

## 5. 내부 계약 문자열 중복 제거

### 문제

동일한 런타임 flag key 또는 unavailable reason 문자열이 여러 파일에 중복 정의되어 있다.

대표 위치:

- `be/src/modules/actions/action-processor.service.ts`
- `be/src/modules/combat/combat-monster-resource.service.ts`
- `fe/src/features/sessionPlay/components/CombatActionPresentation.tsx`

예:

- `monsterLimitedUseExpended`
- `MONSTER_RECHARGE_ACTION_EXPENDED`
- `MONSTER_LIMITED_USE_ACTION_EXPENDED`

### 해결 계획

1. 몬스터 리소스 flag key를 하나의 backend constants 파일로 옮긴다.
   - 후보: `be/src/modules/combat/combat-runtime-flags.constants.ts`
   - `MONSTER_RECHARGE_EXPENDED_FLAG`
   - `MONSTER_LIMITED_USE_EXPENDED_FLAG`
2. unavailable reason은 shared DTO union으로 명시한다.
   - 후보: `shared-types/src/constants/combat-reasons.ts`
   - 예: `MonsterActionUnavailableReason`
3. 백엔드는 shared reason 값을 반환하고, 프론트는 label map으로 표시한다.
   - `Record<MonsterActionUnavailableReason, string>`
4. 문자열 reason을 새로 추가할 때 label 누락이 타입 에러가 되도록 한다.

### Acceptance Criteria

- `monsterLimitedUseExpended` literal은 단일 constants 파일에만 남는다.
- 프론트 unavailable reason label은 shared union을 기준으로 exhaustive하게 매핑된다.
- 새 reason 추가 시 프론트 label 누락이 타입 검사로 드러난다.

## 6. VTT 맵 변경 파이프라인 단일화

### 문제

VTT 맵 변경 후처리 순서가 여러 경로에 반복된다.

현재 반복되는 순서:

1. baseline map 로드.
2. requested map normalize.
3. proximity event 적용.
4. hazard trigger 적용.
5. hazard detection 적용.
6. map 저장.
7. player map redaction.
8. realtime publish.
9. 필요 시 snapshot publish.

대표 위치:

- `be/src/modules/sessions/map-runtime.service.ts`
- `be/src/modules/sessions/sessions.service.ts`

이 순서는 도메인 규칙인데, 여러 메서드가 직접 나열하고 있어 누락/순서 변경 위험이 있다.

### 해결 계획

1. 이미 존재하는 `SessionsService.applyAndPersistVttRuntimeMap` 계열 함수를 기준 함수로 삼는다.
2. 같은 순서를 직접 나열한 경로를 기준 함수 호출로 교체한다.
   - `MapRuntimeService.updateGmVttMap`
   - `SessionsService.updateGmVttMap`
   - `SessionsService.moveSessionToken`
   - 기타 `applyVttObjectProximityEvents`부터 publish까지 직접 호출하는 경로.
3. 기준 함수 반환값에 publish 결과를 포함한다.
   - `hostMap`
   - `playerMap`
   - `hazardTriggered`
   - `hazardDetectionChanged`
   - `snapshotPublished`
4. baseline 계산과 requested map normalize는 호출자가 선택할 수 있게 하되, 후처리 순서는 기준 함수 안에서 고정한다.
5. 함수 주석에 순서의 의미를 짧게 남긴다.
   - proximity event가 먼저 fog를 변경한다.
   - hazard trigger는 이동 전후 비교가 필요하다.
   - hazard detection은 trigger 결과 이후 맵을 기준으로 한다.

### Acceptance Criteria

- VTT 맵 후처리 순서가 한 함수에 모인다.
- 새 VTT mutation 추가 시 개별 서비스가 proximity/hazard/publish 순서를 직접 조립하지 않는다.
- hazard trigger와 hazard detection snapshot publish 조건이 모든 경로에서 동일하다.

## 7. 서버 응답 래핑/에러 계약 정리

### 문제

`fe/src/services/httpClient.ts`는 `{ code, data }` 래퍼를 감지해 풀고, error body의 `data.fieldErrors[].reason` 구조를 직접 읽는다. 공통 처리라 위험이 낮지만, API 응답 래퍼 계약이 타입으로 고정되어 있지 않아 서버 응답 모양 변경 시 조용히 다른 값으로 캐스팅될 수 있다.

### 해결 계획

1. shared-types에 API response envelope 타입을 추가한다.
   - `ApiSuccessEnvelope<T>`
   - `ApiErrorEnvelope`
   - `ApiFieldError`
2. `httpClient.unwrapApiResponse`가 envelope 판별 타입 가드를 사용하게 한다.
3. 백엔드 `api-response.ts`와 프론트 `httpClient.ts`가 같은 envelope 타입 이름을 공유하게 한다.
4. `isMissingRouteResponse`의 Nest 기본 404 message 정규식 의존은 local dev fallback 전용임을 주석으로 명확히 한다.

### Acceptance Criteria

- API envelope 구조가 shared type으로 명시된다.
- 프론트 error parsing이 `Record<string, unknown>` 중심에서 타입 가드 중심으로 바뀐다.
- fallback base URL 로직은 "개발용 route miss fallback"으로 의도가 드러난다.

## 작업 순서

### Phase 1: 계약 상수와 helper 추가

1. shared enum helper와 runtime limit constants 추가.
2. backend main command confidence policy constants 추가.
3. combat runtime flag constants 추가.
4. shared unavailable reason union 추가.

이 단계는 동작 변경 없이 import 경로만 준비한다.

### Phase 2: 프론트 리터럴 비교 치환

1. 세션 status/gmMode/participant status 비교를 enum/helper로 교체.
2. 메인 명령 status 비교를 helper로 교체.
3. combat status 비교를 `CombatStatus`로 교체.
4. 채팅 길이 제한과 pending timeout을 shared constants로 교체.

### Phase 3: 백엔드 정책/flag 치환

1. 메인 명령 confidence threshold를 policy constants로 교체.
2. VTT/몬스터 runtime flag key를 constants로 교체.
3. unavailable reason 반환 경로를 shared union으로 정렬.

### Phase 4: 메인 명령 응답 adapter 도입

1. shared 타입 가드/accessor 작성.
2. FE `useSession.ts`에서 응답 구조 직접 탐색 제거.
3. BE check effect attachment에서 primary check option 선택 규칙 통일.

### Phase 5: VTT 파이프라인 수렴

1. 기준 함수의 입력/출력 shape 확정.
2. 직접 나열된 후처리 경로를 기준 함수로 교체.
3. snapshot publish 조건 차이를 정리.

### Phase 6: 전투 인벤토리 데이터 기반화

1. DTO/catalog 필드 현황 확인.
2. 누락 필드 추가 또는 sync.
3. FE fallback 축소.
4. legacy 이름 추론을 별도 map으로 격리.

## Test Plan

테스트는 구현자가 직접 선택해서 실행한다. 이 문서 작성 과정에서는 실행하지 않았다.

권장 순서:

1. 타입/빌드 확인
   - `npm run build -w @trpg/shared-types`
   - `npm run build -w @trpg/be`
   - `npm run build -w @trpg/fe`
2. 백엔드 단위 회귀
   - `npm run test:quiet -w @trpg/be`
3. 룰/데이터 동기화 확인
   - `npm run verify:rule-data-sync`
   - `npm run verify:spell-presentation`
4. 관련 집중 테스트
   - 메인 명령 체크 관련 spec.
   - 전투/몬스터 리소스 관련 spec.
   - 세션/VTT 맵 관련 spec.

## Done Definition

- 새 기능 추가자가 status 문자열, runtime flag, confidence threshold를 파일 안에 직접 쓰지 않아도 된다.
- 프론트가 서버 응답의 내부 `data` 구조를 직접 캐스팅하는 핵심 경로가 adapter 뒤로 숨는다.
- VTT 맵 후처리 순서가 단일 함수로 설명되고 강제된다.
- 프론트 전투 인벤토리 표시는 SRD/DTO 데이터가 1차 원천이고 이름 기반 추론은 legacy fallback으로만 남는다.
- shared-types가 FE/BE 계약의 중심 역할을 더 분명히 한다.

## Progress Log

### 2026-07-04

완료한 1차 정리:

- `shared-types`에 status/gm/combat/main-command helper, runtime limit constants, monster action unavailable reason 상수를 추가했다.
- 프론트의 핵심 세션/전투/메인 명령 리터럴 비교를 shared helper 기반으로 치환했다.
- `MainCommandResponseDto`의 체크 응답 접근을 위한 shared accessor를 추가하고, `useSession`의 `CHECK_REQUIRED` 처리에서 사용하도록 바꿨다.
- 메인 명령 confidence threshold와 transition partial match ratio를 backend policy constants로 모았다.
- 몬스터 runtime flag key를 backend constants로 모으고, unavailable reason은 shared constants를 사용하게 했다.
- 채팅 길이 제한과 main command pending timeout을 shared constants로 연결했다.
- `MainCommandResponseDto.data.checkEffect`를 shared DTO/union으로 명시하고, VTT 문/함정/오브젝트 판정 effect type과 action 값을 shared constants로 모았다.
- 메인 명령 체크 결과 처리 서비스들이 로컬 parser 타입 대신 shared `MainCommandNarrativeCheckEffectDto`/VTT effect DTO를 참조하게 했다.
- `SessionsService.finalizeRuntimeVttMapChange`를 공개 VTT mutation 오케스트레이터로 승격하고, `MapRuntimeService`와 주요 세션 맵 변경 경로가 proximity event -> hazard trigger -> hazard detection -> save -> redacted publish -> snapshot 순서를 공유하게 했다.
- VTT 오케스트레이터 반환값에 `hazardTriggered`, `hazardDetectionChanged`, `snapshotPublished`를 포함해 후처리 결과를 호출자가 확인할 수 있게 했다.
- `InventoryItemDto`에 선택적 `rangeFt`/`longRangeFt`를 추가하고, SRD 장비 rangeRaw를 `range:`/`range_long:` properties로 변환해 런타임 DTO에 노출하는 경로를 열었다.
- 프론트 전투 인벤토리 range/property 판정은 DTO 명시 필드와 properties tag를 먼저 읽고, 이름 기반 추론은 `LEGACY_WEAPON_RULE_FALLBACKS`로 격리했다.
- 백엔드 장착 무기 프로필 계산도 `range:` property를 먼저 읽도록 바꿔 FE/BE가 같은 데이터 태그를 우선 사용하게 했다.
- shared `ApiSuccessEnvelope`/`ApiErrorEnvelope`/field error guard를 추가하고, 백엔드 `ApiResponse<T>`와 프론트 `httpClient.unwrapApiResponse`/error formatting이 같은 계약을 참조하게 했다.
- 로컬 개발용 base URL fallback에서 Nest 기본 404 route miss 메시지를 보는 이유를 주석으로 명시했다.
- `SessionVttObjectRuntimeService`의 문/오브젝트/함정 직접 변경 경로에 `persistAndPublishVttMap`/`publishVttMapUpdate`를 추가해 save -> redacted publish -> optional snapshot 순서를 한곳으로 모았다.
- 수동 오브젝트 이벤트 트리거는 `recordSessionReveal`과 map save의 기존 트랜잭션을 유지하고, 트랜잭션 이후 발행만 공통 helper를 사용하게 했다.
- VTT door state와 map interaction kind를 `shared-types/src/constants/vtt-map.ts`의 `VTT_DOOR_STATES`, `VTT_MAP_INTERACTION_KINDS`로 승격했다.
- `VttDoorCellDto.state`와 `VttMapInteractionDto.kind`가 shared constants/type을 참조하게 했고, 백엔드 interaction dispatcher와 프론트 탐험 액션/맵 에디터/시야/이동 차단 계산의 door state 문자열 비교를 상수로 치환했다.
- 정적 검색 기준으로 실제 런타임 코드의 `open_door`/`close_door`/`break_door`/`break_object`/`investigate_object`/`disarm_hazard`/`detect_hazard`/`trigger_object` 리터럴은 shared constants 정의 파일에만 남았다.
- `MainCommandCheckEffectAttachmentService`도 `getPrimaryMainCommandCheckOption`을 사용하게 바꿔 체크 옵션 대표값 선택 규칙을 shared accessor로 수렴했다.
- legacy lowercase `SessionGmMode`에는 deprecated 주석을 추가했고, 프론트 세션 상세/발견 화면의 GM mode/status 표시 비교를 shared enum/helper 기반으로 정리했다.
- `CHAT_MESSAGE_MAX_LENGTH` 외에 `HUMAN_GM_MESSAGE_CONTENT_MAX_LENGTH`, `HUMAN_GM_PRIVATE_NOTE_MAX_LENGTH`, `HUMAN_GM_AI_ASSIST_CONTENT_MAX_LENGTH`, `HUMAN_GM_AI_ASSIST_PROMPT_MAX_LENGTH`를 추가해 DTO validation과 프론트 입력 제한이 같은 값에서 오도록 했다.
- GM AI assist 생성 prompt는 서버 DTO의 500자 제한을 넘기면 요청 버튼이 비활성화되도록 해, 화면 입력과 서버 계약이 조용히 어긋나는 경로를 줄였다.
- `git diff --check` 기준 whitespace 오류는 없고, CRLF 변환 경고만 확인했다.
- `.\node_modules\.bin\tsc.cmd -p .\shared-types\tsconfig.json --noEmit` 타입체크는 통과했다.
- `.\node_modules\.bin\tsc.cmd -p .\fe\tsconfig.json --noEmit`는 실행했지만, FE가 source가 아닌 아직 갱신되지 않은 `@trpg/shared-types` 빌드 산출물을 참조해 새 export들을 찾지 못하는 형태로 실패했다. 다음 검증 때는 `npm run build -w @trpg/shared-types`를 먼저 실행한 뒤 FE 타입체크를 다시 돌린다.

당시 남은 작업:

- VTT door state fixture 문자열은 일부 spec 파일에 입력 데이터로 남아 있다. 테스트 가독성을 우선해 유지할지, shared constants fixture로 바꿀지 후속 정리에서 결정한다.
- `shared-types` 빌드 산출물을 갱신한 뒤 FE/BE 타입/빌드와 관련 spec을 실행해 타입/회귀를 확인한다. 테스트성 명령은 사용자 허락을 받은 뒤 실행한다.

### 2026-07-05

추가 정리:

- `shared-types/dist`가 새 export를 포함하지 않아 FE 타입체크가 실패하던 원인을 확인했고, `npm run build -w @trpg/shared-types`로 로컬 shared-types 산출물을 갱신했다.
- `be/src/database/seed/items.ts`의 SRD itemDefinition seed 경로에도 `range:`/`range_long:` properties 생성을 추가했다. 이제 seed 재실행 시 기존 `itemDefinition.propertiesJson`도 SRD range 태그를 받는다.
- seed 마지막에 기존 `SessionCharacter.inventorySnapshotJson`을 inventory entries + 최신 itemDefinition 기준으로 재계산하는 backfill을 추가했다. 기존 DB에서 seed를 다시 실행하면 캐시성 snapshot에도 `rangeFt`/`longRangeFt`가 반영된다.
- `SessionInventoryService.refreshSessionInventorySnapshot`도 `range:`/`range_long:` properties를 읽어 snapshot DTO에 `rangeFt`/`longRangeFt`를 포함하게 했다.
- `InventoryRuntimeService`에서 item properties가 없을 때 빈 배열로 처리하도록 해 range parser 타입 오류를 제거했다.
- 공유 DTO와 enum 계약이 엄격해지면서 드러난 BE spec fixture 타입 오류를 보정했다. 메인 명령 check effect fixture는 shared `MainCommandNarrativeCheckEffectDto`/`MAIN_COMMAND_CHECK_EFFECT_TYPES`를 사용하고, scenario/session/inventory/VTT 관련 spec 더미도 현재 Prisma/shared 타입에 맞췄다.
- Battle map 구조 inspector의 door state select option을 shared `VTT_DOOR_STATES`에서 읽도록 바꿔 에디터 UI의 문 상태 문자열도 shared 계약으로 수렴했다.
- Human GM 인벤토리 수량 제한, VTT encounter priority 제한, VTT check DC 제한을 `shared-types/src/constants/runtime-limits.ts`에 이름 붙인 상수로 추가하고, shared DTO validation과 프론트 GM 입력 UI가 같은 값을 참조하게 했다.
- `ActionSubmissionContextLoaderService`의 active combat 조회에서 직접 문자열 `"ACTIVE"`를 쓰던 경로를 Prisma `CombatStatus.ACTIVE`로 교체했다.
- shared-types workspace package의 CommonJS dist를 Vite production build가 처리할 수 있도록 `fe/vite.config.ts`의 `build.commonjsOptions.include`에 `shared-types/dist`를 포함했다. shared-types 루트에서 런타임 helper/constant를 가져오는 경로가 FE 번들에서 실패하던 문제를 해소했다.
- `@trpg/shared-types/frontend` subpath를 추가해 FE 런타임이 enum/helper/constants/API envelope guard만 가져오도록 분리했다. FE의 루트 `@trpg/shared-types` import는 AST 기준 type-only로 남겨 DTO 데코레이터/Nest 계열 모듈이 브라우저 번들에 끌려오는 경로를 끊었다.
- Human GM runtime의 inventory quantity/DC 검증, VTT map normalizer/object runtime의 DC/encounter priority clamp, battle map inspector의 DC 입력 범위도 shared runtime limit constants를 참조하도록 맞췄다. DTO validation, FE 입력 제한, BE runtime 정규화가 같은 계약 상수를 보게 되었다.
- Monster runtime flag/reason과 VTT door state의 spec fixture도 shared/backend constants를 사용하도록 바꿨다. 정적 검색 기준 해당 문자열들은 constants 정의 파일에만 남는다.

검증:

- `npm run build -w @trpg/shared-types` 통과.
- `.\node_modules\.bin\tsc.cmd -p .\fe\tsconfig.json --noEmit` 통과.
- `npm run build -w @trpg/fe` 통과. Nest/class-validator browser externalization 경고는 사라졌고, 현재는 Vite chunk size 경고만 남는다.
- `npm run build -w @trpg/be` 통과.
- `.\node_modules\.bin\tsc.cmd -p .\be\tsconfig.json --noEmit` 통과.
- TypeScript AST 확인 기준 FE에는 루트 `@trpg/shared-types` 런타임 import가 남아 있지 않다.
- TypeScript AST 확인 기준 아직 남은 status 문자열 비교는 scenario moderation/revision, rest approval, campaign archive, AI assist suggestion 등 별도 도메인 상태값이 대부분이다. 이번 계획에서 지정한 세션/전투/메인 명령/VTT 핵심 status 비교 경로는 shared enum/helper/constants 쪽으로 수렴했다.
- 정적 검색 기준 `monsterLimitedUseExpended`, `MONSTER_RECHARGE_ACTION_EXPENDED`, `MONSTER_LIMITED_USE_ACTION_EXPENDED`, VTT door state literal은 constants 정의 파일에만 남는다.
- `git diff --check` 기준 whitespace 오류는 없고 CRLF 변환 경고만 확인했다.

남은 큰 작업:

- FE production build에는 chunk size 경고가 남아 있다. 이번 계약 정리 범위 밖이지만, 필요하면 route/code splitting으로 별도 개선한다.
- Scenario moderation/revision, rest approval, campaign archive, AI assist suggestion 상태값도 장기적으로는 별도 status union/constants로 승격할 수 있다. 이번 계획의 대표 위험 범위 밖이어서 후속 전수정리 후보로 남긴다.
- 실제 Jest 회귀 테스트는 사용자 허락 없이 실행하지 않았다. 필요 시 메인 명령 체크, 전투 인벤토리, 세션/VTT 맵 관련 spec을 우선 실행한다.
