# Type Runtime Safety Audit

작성일: 2026-07-05

## 조사 범위

- 대상: `be/src`, `fe/src`, `shared-types/src`
- 제외: `node_modules`, `dist`, 테스트 파일, 번역/정적 데이터 문서
- 중점: `any`, 강제 캐스팅, nullable 처리, 외부 입력 검증 누락
- 확인한 기준 설정: 루트/BE/FE/공유 `tsconfig`는 `strict`, `noImplicitAny`, `strictNullChecks`가 켜져 있음. 문제는 설정 부재보다 런타임 경계에서 타입을 단언하는 코드에 집중되어 있음.

## 우선순위 높은 문제

### P1. 프론트 HTTP 응답이 제네릭 타입으로만 신뢰됨

- 위치:
  - `fe/src/services/httpClient.ts:103`
  - `fe/src/services/httpClient.ts:175`
  - `fe/src/services/httpClient.ts:254`
  - `fe/src/services/staticSrd.ts:274`
- 패턴:
  - `response.json()` 결과를 `unknown`으로 받은 뒤 `unwrapApiResponse<T>()` 또는 `as T`로 반환한다.
  - `requestJson<SessionSnapshotDto>(...)`처럼 호출부 제네릭이 런타임 검증 역할을 하는 것처럼 보이지만 실제 검증은 없다.
- 런타임 위험:
  - 서버 envelope 구조가 바뀌거나 `data`가 빠지면 화면은 컴파일상 정상 타입으로 처리하다가 `participants.map`, `payload.combat.participants` 같은 접근에서 터질 수 있다.
  - 정적 SRD JSON이 누락/오염되어도 `as T` 때문에 로딩 시점에 구조 오류를 조기에 잡지 못한다.
- 해결 계획:
  - `requestJson`에 선택적 `decode` 콜백을 추가한다. 예: `requestJson(path, { decode: parseSessionSnapshot })`.
  - `shared-types`에 핵심 응답별 `isXxxDto`/`parseXxxDto` 가드를 둔다.
  - 한 번에 전 endpoint를 바꾸기보다 세션 스냅샷, 전투 응답, VTT map, character 응답부터 적용한다.

### P1. 프론트 WebSocket 이벤트 payload가 타입 주석만으로 신뢰됨

- 위치:
  - `fe/src/services/realtime.ts:65`
  - `fe/src/services/realtime.ts:70`
  - `fe/src/services/realtime.ts:78`
  - `fe/src/services/realtime.ts:83`
  - `fe/src/services/realtime.ts:87`
  - `fe/src/services/realtime.ts:91`
  - `fe/src/services/realtime.ts:95`
  - `fe/src/services/realtime.ts:99`
  - `fe/src/services/realtime.ts:103`
  - `fe/src/services/realtime.ts:107`
  - `fe/src/services/realtime.ts:112`
  - `fe/src/services/realtime.ts:118`
- 패턴:
  - `socket.on("session.snapshot", (payload: { snapshot: SessionSnapshot }) => ...)`처럼 콜백 인자 타입을 붙였지만 Socket.IO payload는 외부 입력이다.
- 런타임 위험:
  - 이벤트명은 맞지만 payload shape가 다르면 `payload.participant.user.displayName`, `payload.reaction.message` 등에서 즉시 예외가 난다.
  - 서버/프론트 DTO 버전 불일치가 화면 전체 연결 끊김으로 보일 수 있다.
- 해결 계획:
  - `safeSocketOn(eventName, decoder, handler)` 헬퍼를 만든다.
  - 잘못된 payload는 UI handler로 넘기지 않고 `onLog("Realtime payload ignored", ...)`로 기록한다.
  - `session.snapshot`은 `normalizeSessionSnapshot` 호출 전에 최소 구조를 검증한다.

### P1. 백엔드 AI 서버 응답이 `as T`로만 통과됨

- 위치:
  - `be/src/modules/ai/ai.client.ts:365`
- 패턴:
  - AI 서버 HTTP 응답을 `return (await response.json()) as T`로 반환한다.
- 런타임 위험:
  - Python AI 서비스 응답이 누락/오류 envelope/부분 JSON이어도 백엔드 서비스는 정상 DTO로 간주한다.
  - 이후 interpreter/director/narrator 결과 접근에서 예외 또는 잘못된 게임 상태 변경으로 이어질 수 있다.
- 해결 계획:
  - AI client 메서드별 응답 decoder를 받게 한다.
  - interpreter, director, actor, check_result 응답부터 필수 필드와 enum을 검증한다.
  - 검증 실패는 `BadGatewayException`으로 막고, fallback 정책이 있는 경로는 검증 실패도 fallback 조건에 포함한다.

### P1. `Record<string, unknown>` DTO가 깊은 구조를 검증하지 않음

- 위치:
  - `shared-types/src/dto/api/gameplay.dto.ts:464`
  - `shared-types/src/dto/api/gameplay.dto.ts:483`
  - `shared-types/src/dto/api/scenarios.dto.ts:223`
  - `shared-types/src/dto/api/scenarios.dto.ts:230`
  - `shared-types/src/dto/api/scenarios.dto.ts:236`
  - `shared-types/src/dto/api/scenarios.dto.ts:241`
  - `shared-types/src/dto/api/scenarios.dto.ts:246`
- 패턴:
  - `@IsObject()` 또는 `@IsObject({ each: true })`는 "객체인지"만 확인한다.
  - `MainCommandCheckEffectDto`, `checkOptions`, `transitions`, `clues`, `vttMap`, `nodeMeta`, `diceResult`의 실제 내부 shape는 런타임에서 보장되지 않는다.
- 런타임 위험:
  - 클라이언트가 `{ type: "door", targetId: 1 }`처럼 내부 필드 타입이 틀린 객체를 보내도 DTO 단계에서 통과할 수 있다.
  - 이후 parser나 runtime service가 `as Record<string, unknown>` 뒤 필드를 꺼내며 누락을 조용히 fallback하거나, 일부 경로에서 예외가 난다.
- 해결 계획:
  - `MainCommandCheckEffectDto`는 discriminated union DTO로 분리하고 `type`별 nested validation을 적용한다.
  - scenario node의 `checkOptions/transitions/clues`는 최소 필드 DTO를 정의한다.
  - `vttMap`은 이미 `VttMapStateDto`가 있으므로 `ScenarioNodeInputDto.vttMap`도 가능한 범위에서 `VttMapStateDto | null` 검증으로 통일한다.

## 우선순위 중간 문제

### P2. DB JSON 파싱이 제네릭 `parseJson<T>`에 과하게 의존함

- 위치 예시:
  - `be/src/common/mappers/domain.mapper.ts:178`
  - `be/src/modules/turn-logs/turn-logs.service.ts:246`
  - `be/src/modules/sessions/sessions.service.ts:2614`
  - `be/src/modules/combat/combat.service.ts:3946`
  - `be/src/modules/rules/action-rule.service.ts:3766`
  - `be/src/modules/actions/action-processor.service.ts:1984`
  - `be/src/modules/scenarios/scenarios.service.ts:2413`
- 패턴:
  - `JSON.parse(value) as T`를 공통 fallback처럼 사용한다.
  - 일부 파일은 try/catch와 배열 필터링이 있지만, 많은 경로는 JSON 문법 오류 또는 shape mismatch를 그대로 던진다.
- 런타임 위험:
  - 오래된 DB row, 수동 수정, 이전 버전 flags가 섞이면 mapper/서비스가 500을 낼 수 있다.
  - `fallback` 인자가 있어도 JSON이 invalid이면 fallback으로 복구되지 않는 구현이 많다.
- 해결 계획:
  - `parseJsonOrFallback(value, fallback, decoder?)`를 공통 유틸로 만들고 JSON syntax 오류도 fallback/도메인 오류로 명확히 처리한다.
  - `flagsJson`, `inventoryJson`, `abilitiesJson`, `stateDiffJson`, `vttMap` 등 쓰임새별 decoder를 둔다.
  - 저장 시점에도 같은 decoder를 사용해 "읽을 때만 방어"가 되지 않게 한다.

### P2. `any[]` 위임 래퍼가 타입 시스템을 무력화함

- 위치:
  - `be/src/modules/actions/main-command-intent-handlers.service.ts:12`
  - `be/src/modules/actions/main-command-intent-handlers.service.ts:61`
  - `be/src/modules/sessions/session-vtt-object-runtime.service.ts:29`
  - `be/src/modules/sessions/session-vtt-object-runtime.service.ts:65`
  - `be/src/modules/rules/action-spell-rule.service.ts:35`
  - `be/src/modules/rules/action-spell-rule.service.ts:72`
- 패턴:
  - 큰 서비스에서 private helper를 런타임 객체로 주입하면서 모든 인자/반환값을 `(...args: any[]) => any`로 선언했다.
- 런타임 위험:
  - helper signature가 바뀌어도 컴파일러가 호출부를 잡지 못한다.
  - 인자 순서 오류, 반환 shape 변경이 테스트 전까지 숨어 있을 수 있다.
- 해결 계획:
  - 각 runtime interface에 실제 함수 시그니처를 명시한다.
  - 가능하면 private helper 위임 대신 독립 injectable service로 추출한다.
  - 임시 단계에서는 `type RuntimeMethod<K extends keyof MainCommandsService> = MainCommandsService[K]` 식의 타입 참조로 `any`를 제거한다.

### P2. localStorage/session state 복원에서 부분 검증 후 강제 캐스팅

- 위치:
  - `fe/src/services/storage.ts:19`
  - `fe/src/services/storage.ts:83`
  - `fe/src/components/battleMap/BattleMapCore.tsx:267`
  - `fe/src/pages/ScenarioEditorPage.tsx:843`
- 패턴:
  - 저장된 JSON을 DTO로 캐스팅하고 일부 필드만 확인한다.
- 런타임 위험:
  - 오래된 브라우저 저장값이 새 DTO와 달라지면 페이지 진입 직후 예외가 날 수 있다.
  - `normalizeSessionSnapshot`은 `participants.map`을 기대하므로 `participants`가 배열이 아니면 복구 전에 터질 수 있다.
- 해결 계획:
  - localStorage별 schema version을 넣고, version mismatch는 폐기한다.
  - 저장된 snapshot/editor draft는 최소 필수 배열 필드를 검사한 뒤 normalize한다.
  - 파싱 실패뿐 아니라 shape 실패도 storage cleanup 대상으로 처리한다.

### P2. 외부 OAuth 응답은 일부 필드만 확인하고 나머지는 단언됨

- 위치:
  - `be/src/modules/users/users.service.ts:545`
  - `be/src/modules/users/users.service.ts:562`
  - `be/src/modules/users/users.service.ts:621`
  - `be/src/modules/users/users.service.ts:638`
  - `be/src/modules/users/users.service.ts:822`
- 패턴:
  - `readJson<T>()`가 외부 JSON을 타입으로 단언한다.
  - access token, provider id 등 일부 필드는 후속 체크가 있으나 전체 shape 검증은 없다.
- 런타임 위험:
  - provider 응답 변화가 displayName/email 처리에서 예외 또는 비정상 fallback으로 나타날 수 있다.
- 해결 계획:
  - OAuth token/user 응답별 `parseKakaoTokenResponse`, `parseDiscordUserResponse`를 둔다.
  - 필수 식별자와 선택 필드를 분리해 명시적으로 normalize한다.

## 우선순위 낮거나 관찰 대상

### P3. JWT payload 파싱 후 필수 claim 검증이 약함

- 위치:
  - `be/src/common/auth/token.utils.ts:66`
  - `fe/src/services/authToken.ts:16`
- 패턴:
  - JWT body를 `TokenPayload`/`JwtPayload`로 캐스팅한다.
- 런타임 위험:
  - 서버는 `type`, `exp`는 확인하지만 `sub`가 문자열인지 확인하지 않는다.
  - 프론트는 만료 시간만 읽으므로 위험은 낮다.
- 해결 계획:
  - 서버 `verifyToken`에서 `typeof payload.sub === "string"`, `typeof payload.exp === "number"`를 확인한다.
  - 프론트는 현재처럼 보조 판단만 하되 decode 결과를 `unknown`에서 좁힌다.

### P3. 일부 Prisma/enum 캐스팅이 생성 타입 불일치를 숨김

- 위치:
  - `be/src/modules/characters/character-avatar-asset.service.ts:152`
  - `be/src/modules/characters/character-avatar-asset.service.ts:162`
  - `be/src/modules/scenarios/scenarios.service.ts:2466`
- 패턴:
  - Prisma client 또는 enum 값을 `as unknown as ...`로 맞춘다.
- 런타임 위험:
  - Prisma schema/client가 어긋나도 컴파일러가 놓친다.
  - 잘못된 asset kind가 들어오면 이후 분기에서 예외 또는 잘못된 저장이 될 수 있다.
- 해결 계획:
  - Prisma client 재생성/타입 동기화로 unknown cast를 제거한다.
  - enum은 `Object.values(...).includes(...)` 또는 상수 배열 guard를 통과한 값만 저장한다.

## 안전하다고 본 패턴

- `as const`로 literal을 고정하는 코드
- enum/상수 배열 membership 확인 직후의 캐스팅
- React `CSSProperties`용 CSS custom property 캐스팅
- `dto.point!` 중 `if (dto.point)` 블록 안에서만 쓰이는 non-null assertion
- 컨트롤러의 `page`, `size`, `status`, `role` query는 별도 변환/검증 helper가 있어 우선순위에서 제외

## 작업 계획

### 목표

타입스크립트 타입이 실제 런타임 데이터 검증을 대신하고 있는 구간을 제거한다. 외부 입력, 서버 응답, WebSocket payload, DB JSON, 브라우저 저장소, AI/OAuth 응답을 `unknown`에서 명시적으로 좁힌 뒤 도메인 로직으로 넘기는 구조로 바꾼다.

### 완료 기준

- 새로 들어오는 외부 데이터는 `as T` 또는 콜백 인자 타입 주석만으로 신뢰하지 않는다.
- 핵심 런타임 경계에는 decoder/type guard가 존재한다.
- 잘못된 입력은 400, 잘못된 upstream 응답은 502 계열, 손상된 localStorage/DB JSON은 fallback 또는 도메인 오류로 일관 처리된다.
- `(...args: any[]) => any` 위임 래퍼는 제거하거나 실제 시그니처로 대체한다.
- 변경된 경로의 빌드가 통과하고, 사용자가 선택한 테스트가 통과한다.

### 2026-07-05 1차 반영 상태

  - 완료:
    - `shared-types`에 BE/FE 공용 runtime guard와 API decoder 기반을 추가했다.
  - 프론트 HTTP client에 선택적 decoder 경로를 추가하고 세션/전투/VTT/auth/character/avatar asset/catalog/scenario API부터 적용했다.
  - auth API의 login/register/me/OAuth URL/token reissue 응답과 HTTP client 내부 access-token reissue 경로에 decoder를 연결했다.
  - character 생성/목록/복제/수정/레벨업/장비/주문/아바타 asset 응답과 character-selection participant 응답에 decoder를 연결했다.
  - catalog API의 race/class/item/rule catalog 응답 배열에 decoder를 연결했다.
  - scenario API의 목록/상세/플레이어 view/협업/review/moderation/asset/node image 응답에 decoder를 연결했다.
  - human GM API의 세션 snapshot, node move option, private note, AI assist suggestion 응답에 decoder를 연결했다.
  - session API의 campaign archive, character vault/transfer, action accepted, main command, inventory use, turn log list, raw session state 응답에 decoder를 연결했다.
  - combat turn advance와 VTT map interaction 특수 응답에 decoder를 연결했다.
  - 프론트 `requestJson`은 응답 body가 있는 호출에 decoder overload를 요구하도록 바꾸고, decoder 없는 `return data as T` fallback을 제거했다. decoder 없는 경로는 `void` 요청의 응답 body를 타입으로 신뢰하지 않고 폐기한다.
  - 프론트 HTTP error body도 `decodeApiErrorEnvelope`로 최소 구조를 검증하고, `httpClient`의 env/error/json 처리에 남아 있던 단일 `as` 단언을 제거했다.
  - 공용 API decoder의 enum/literal reader에서 `value as T`를 제거하고, user/session/participant/combat/session-character 핵심 응답은 enum guard와 명시 객체 재구성으로 바꿨다.
  - `runtime-guards`의 generic `passthroughRecord<T>` 단언을 제거하고, record만 필요한 API decoder 경로는 typed-record helper 대신 record guard를 직접 사용하게 했다.
  - 공용 API decoder의 `readTypedRecord<T>`, `readOptionalTypedRecord<T>`, `readOptionalTypedRecordArray<T>` generic helper를 제거했다.
  - class starting equipment/spellcasting progression, character ability/inventory/spell/level-up preview, campaign archive analytics/snapshot, action rest approval, combat reaction/action resource/monster action/terrain effect 응답은 필드별 decoder로 재구성하도록 바꿨다.
  - main command의 자유형 `statePatch/data`, scenario node의 자유형 record 배열, VTT map의 자유형 map 요소는 generic cast 대신 `Record<string, unknown>` guard를 통과한 값만 전달하게 했다.
  - session snapshot의 `sessionScenarios/state/pendingRestApprovals`와 player scenario node `checkOptions`, main command `checkOptions/actionCandidate`는 전용 decoder로 구조 검증하도록 바꿨다.
  - VTT map state의 token/monster/encounter scaling/fog/starting position/ping/light/terrain/door/object 하위 구조를 필드별 decoder로 재구성하도록 바꿨다.
  - `status-helpers`, `main-command-response`, `main-command-check-effect-parser`의 enum/object narrowing에서 남아 있던 `as` 단언을 membership guard와 record guard로 대체했다.
  - SRD engine monster/equipment JSONL decoder는 id 확인 후 전체 타입을 단언하지 않고, 실제 사용 필드를 명시 재구성하도록 바꿨다.
  - inventory runtime flags, transition condition rule, calendar integer guard, level-up hit die guard의 단언을 타입 가드/리터럴 분기로 대체했다.
  - combat reaction/resource flags JSON은 제네릭 `parseJson<Record<string, unknown>>` 대신 `parseJsonRecordOrFallback`과 entry guard를 사용하도록 바꿨다.
  - `domain.mapper`의 character/session-character abilities, inventory, spells, pack contents, scenario node config, nodeMeta 파싱은 legacy `parseJson<T>` 대신 저장 JSON 전용 decoder와 record/string-array parser를 통과하도록 바꿨다.
  - `ScenariosService`의 scenario policy node, transition, checkOptions/nodeMeta rewrite, public ecosystem metadata 파싱은 legacy `parseJson<T>`와 `JSON.parse(...) as ...` 대신 record/record-array parser와 `isRecord` narrowing을 통과하도록 바꿨다.
  - `TurnLogsService`의 structuredAction/diceResult/stateDiff 파싱은 nullable record parser를 사용하고, ActionOutcome/ActionQueueStatus 매핑은 enum 강제 캐스팅 대신 명시 switch 매핑으로 바꿨다.
  - `CombatMapperService`의 flags/spellSlots/ready-action prompt 파싱은 제네릭 `parseJson<T>`와 partial type assertion 대신 record parser와 필드별 guard를 사용하도록 바꿨고, combat status/entity enum은 명시 switch 매핑으로 바꿨다.
  - `CombatSpellService`의 character spell list, ability score, feature id, game state flags, spell slot table 파싱은 제네릭 `parseJson<T>` 대신 record/string-array parser와 필드별 guard를 통과하도록 바꿨고, spell scaling duration unit 캐스팅도 literal guard로 대체했다.
  - `ActionProcessorService`의 spell slot override table 파싱은 제네릭 `parseJson<T>` 재파싱 대신 `flagsJson` record에서 필드별 number guard를 통과하도록 바꿨고, ready/item runtime 주변 record 단언도 `isRecord` narrowing으로 줄였다.
  - `ActionSpellRuleService`의 spell inventory, abilities, feature id 파싱은 runtime adapter의 generic `parseJson<T>` 의존을 끊고, 서비스 내부 record/string-array parser와 필드별 guard를 사용하도록 바꿨다.
  - `ActionRuleService`의 conditions, ability score, proficient/feature string arrays, legacy inventory JSON 파싱은 제네릭 `parseJson<T>` 대신 unknown-array/record/string-array parser와 inventory item decoder를 사용하도록 바꿨다.
  - `ActionsService`의 game state flags 파싱은 `inventory-item-policy`의 generic `parseJson<T>` helper 대신 공통 `parseJsonRecordOrFallback`을 사용하도록 바꿨고, 해당 generic helper를 제거했다.
  - `MapRuntimeService`의 VTT map flags 파싱과 `SessionVttObjectRuntimeService`의 hazard detection ability 파싱은 session service generic parser 대신 record/number guard 기반 parser를 사용하도록 바꿨다.
  - `HumanGmRuntimeService`의 flags, combat condition entries, node transitions 파싱은 runtime generic `parseJson<T>` 대신 record/unknown-array/record-array parser를 직접 사용하도록 바꿨고, combat status/entity mapping도 명시 매핑으로 바꿨다.
  - `SessionRevealService`의 clues/snapshot/nodeMeta 파싱은 session runtime의 generic `parseJson<T>` 주입 대신 record/record-array/nullable-record parser를 직접 사용하도록 바꿨고, reveal policy와 visible target normalization의 object cast를 `isRecord` guard로 대체했다.
  - `CombatService`의 game state flags, ability score, feature id, proficient skill, inventory snapshot 파싱은 legacy `parseJson<T>`/`parseJsonArray<T>` helper 대신 record/number-record/string-array/unknown-array/inventory decoder를 사용하도록 바꿨다.
  - `SessionCharacterSelectionService`의 character inventory 복사 경로는 `InventoryItemDto[]` 강제 파싱 대신 필수 `id/name`과 선택 장비 필드를 검증하는 decoder를 통과하도록 바꿨다.
  - scene transition과 default VTT map reader의 checkOptions 파싱은 decoder 없는 `parseJsonOrFallback<unknown>` 호출과 record cast 대신 identity decoder와 `isRecord` narrowing을 사용하도록 바꿨다.
  - 공통 `parseJsonOrFallback`은 decoder 인자를 필수로 바꾸고, decoder 없이 parsed JSON을 `T`로 신뢰하던 fallback 경로를 제거했다.
  - 프론트 WebSocket payload를 handler 진입 전에 검증하도록 `realtime` 경계를 정리했다.
  - `realtime`의 action/system/chat/dice/state-diff/reaction payload는 필수 필드를 읽어 명시 객체로 재구성하도록 바꿨다.
  - `realtime`의 enum/literal payload narrowing과 character/session payload 처리에서 남아 있던 `as` 단언을 제거하고, membership guard 및 공용 session-character decoder를 사용하도록 바꿨다.
  - 프론트 localStorage, JWT payload, 정적 SRD JSON, 전투맵 탐색 상태, 시나리오 editor draft 복원 경로에 decoder를 적용했다.
  - 프론트 GM 액션 snapshot map, 플레이 snapshot VTT map, combat reaction custom event, optimistic map rollback 경계에서 `VttMapStateDto`/custom event 단언을 제거하고 `isRecord`/`decodeVttMapState`/literal guard를 통과하도록 바꿨다.
  - Rulebook 정적 JSON 로더의 `response.json() as StaticRulebookExport`를 제거하고, rulebook collection/document 필수 필드를 검증하는 decoder를 추가했다.
  - Character 생성 후 세션 복귀 경로와 앱 character return navigation의 non-null assertion을 local narrowing으로 대체했다.
  - 프론트 서비스의 non-void `requestJson<T>` 호출은 `void`/raw record 예외를 제외하고 주변 40줄 기준 `decode:` 누락 후보가 없음을 확인했다.
  - `VttMapInteractionResponse`의 `checkOptions`와 `data.checkEffect/effect`는 자유형 record passthrough 대신 main-command check option/effect guard를 통과하도록 decoder를 좁혔고, 백엔드 응답 생성부의 record-array 캐스팅도 제거했다.
  - 정적 SRD JSON decoder는 검증 후 `as unknown as`로 반환하지 않고 class/race/monster/spell/item catalog 객체를 명시 재구성하도록 바꿨다.
  - 공용 API decoder의 세션/전투/VTT 응답도 `as unknown as` 반환을 제거하고, 상위 DTO를 검증된 필드와 typed record helper로 재구성하도록 바꿨다.
  - 백엔드 AI/OAuth/JWT 응답 경계에 decoder를 추가했고, AI parsed 응답은 검증 후 명시 객체로 재구성하도록 바꿨다.
  - `AiClient`의 string record/literal/abort error 처리에 남아 있던 `as T` 계열 보조 단언을 명시 루프와 membership narrowing, `isRecord` guard로 제거했다.
  - `SessionPublicIdService`의 generic publicId 보장 경로와 main-command special move, session inventory, combat spell point, spell save, VTT object item grant 경로의 non-null assertion은 local narrowing/명시 fallback/객체 재구성으로 제거했다.
  - 백엔드 DB JSON 파싱을 `be/src/common/utils/json-runtime.ts` 중심으로 모으고, record/string-array/record-array/unknown-array 계열 fallback parser를 적용했다.
  - `main-command`, `session-vtt-object`, `action-spell-rule` runtime adapter의 `any[]` 위임 타입을 실제 시그니처로 대체했다.
  - `ResolveMainCommandCheckDto.effect`와 `ScenarioNodeInputDto`의 `checkOptions/transitions/clues/vttMap/nodeMeta`에 최소 내부 구조 validator를 추가했다.
  - `CreateScenarioDto`/`UpdateScenarioDto`의 `npcs` 입력과 `ResolveMainCommandCheckDto.diceResult`는 object-only 검증에서 벗어나, 실제 사용하는 문자열/숫자/배열/enum 필드 타입을 확인하는 custom validator를 추가했다.
  - `ScenariosService`의 Prisma user delegate 캐스팅과 `ScenarioAssetKind` 강제 캐스팅을 제거하고 명시 매핑으로 바꿨다.
  - `CharacterAvatarAsset` 접근은 generated Prisma delegate 타입으로 교체해 수동 delegate 캐스팅을 제거했다.
  - `combat-turn` dice result와 scenario editor VTT map 저장 payload의 이중 캐스팅을 runtime guard/객체 재구성으로 대체했다.
  - `useSession`의 turn log metadata/dice overlay/VTT map socket 갱신 경계와 campaign archive snapshot/transfer inventory, catalog/race/spell/rest/inventory decoder 경계에 남아 있던 record 단언을 `isRecord`/VTT decoder 기반 narrowing으로 줄였다.
  - campaign calendar/economy clone, main-command persisted response data, combat condition/ready-action parser, VTT map 복원, battle map structure patch 경계에 남아 있던 `Partial<T>`/record 단언을 field guard와 공용 decoder 기반 재구성으로 제거했다.
  - 브라우저 `location.state`, OAuth provider localStorage, auth/combat custom event detail, character transfer request flag, Prisma/shared `ActionOutcome`, VTT token id map, selection summary 문자열 배열 경계에 남아 있던 캐스팅을 guard/decoder/명시 enum 매핑으로 제거했다.
  - rule command parser의 condition operation, rule engine의 cunning action, condition runtime의 saving throw ability, inventory runtime의 bag-of-holding integrity는 문자열 캐스팅 대신 리터럴 guard/switch로 좁히도록 바꿨다.
  - character level-up의 class `hitDie`는 catalog 값을 `HitDie`로 단언하지 않고 `parseHitDie`를 통과하게 했으며, 잘못된 catalog 값은 `BadRequestException`으로 중단하도록 했다.
  - `CharactersService`와 `CharacterEquipmentLoadoutService`의 abilities/inventory/spells/starting equipment JSON은 `JSON.parse(...) as ...` 및 record array 단언 대신 필드별 decoder를 통과하도록 바꿨다.
  - battle map structure inspector, session discovery sort, scenario public sort, human GM AI assist type, campaign calendar action/availability/downtime type, economy action select 값은 `event.target.value as ...` 대신 허용 목록 guard를 통과한 값만 상태와 서버 payload로 반영하도록 바꿨다.
  - session list reconciliation은 목록의 status를 snapshot status로 단언하지 않고 `normalizeSessionStatus`를 사용해 잘못된 status 값을 기본값으로 정규화하도록 바꿨다.
  - inventory item action의 장비 표시 상태 확장은 호출부 타입에 명시하고, combat cover error data 부착은 error 타입 단언 대신 `Object.assign`으로 처리하도록 바꿨다.
  - `ScenarioEditorPage.tsx`의 license/node type/transition condition/clue importance/reveal mode/NPC disposition select 값은 enum/literal guard를 통과하도록 바꿨고, asset kind/node type/license 기본값도 enum 멤버 또는 문맥 타입으로 표현해 강제 캐스팅을 제거했다.
  - 시작 장비 해석, profile character image, scenario featured NPC/node reachability, combat/session VTT movement BFS, exploration map BFS, combat spell catalog lookup, ASI ability 계산의 non-null assertion은 지역 변수 narrowing, 명시 fallback, `continue` guard로 제거했다.
  - `useSession`의 action scope/input type/check outcome payload는 문자열 캐스팅 대신 공용 enum 멤버를 사용하도록 바꿨고, `normalizeSessionPublicId`의 status 정규화 결과 캐스팅도 제거했다.
  - `staticSrd` 정적 JSON 캐시는 decode된 `Promise<T>`를 path 단위로 강제 재사용하지 않고 raw JSON promise를 캐시한 뒤 호출별 decoder를 통과하도록 바꿔 generic cache 캐스팅을 제거했다.
  - `BattleMapCore`의 선택된 object cell 처리와 구조 도구 선택은 반복 캐스팅 대신 `selectedObjectCell` narrowing, `isObjectCell` guard, switch narrowing으로 바꿨다.
  - 직접 검색 기준으로 `be/src`, `fe/src`, `shared-types/src`의 비테스트 코드에서 `any[]`, `as any`, `as unknown as`, `JSON.parse(...) as ...`, `JSON.parse(value) as T`, `return data as T`, `undefined as T` 패턴을 제거했다.
  - 고위험 non-null assertion은 local narrowing/명시 fallback/객체 재구성으로 줄였다. 현재 `!:` DTO definite assignment는 class-validator/Nest Swagger DTO 관용구라 런타임 입력 검증 실패 지점과 성격이 달라 별도 카테고리로 분리한다.
  - 직접 검색 기준으로 `be/src/common`, `be/src/modules`의 비테스트 코드에서 `parseJson<T>`, `runtime.parseJson`, `parseJsonArray<T>`, decoder 없는 `parseJsonOrFallback<unknown>` 패턴을 제거했다.
- 후속:
  - DTO class의 `!:` definite assignment는 class-validator/Nest Swagger DTO 관용구라 런타임 입력 검증 실패 지점과 성격이 다르지만, 실제 non-null assertion 검색에는 계속 잡히므로 감사 기준에서 별도 카테고리로 분리해 관리한다.
  - DTO nested validation은 최소 내부 구조 검증을 넘어서 type별 입력 DTO 분리와 프론트 editor payload 호환성 확인을 별도 PR 단위로 진행한다.
  - 공용 API decoder에 남은 자유형 `Record<string, unknown>` passthrough는 도메인별 DTO가 확정되는 순서대로 nested decoder로 계속 축소한다.
  - 프론트 서비스 호출부의 decoder 누락 여부를 계속 감시하고, `httpClient` overload 변경이 모든 호출부에서 타입 오류 없이 통과하는지 빌드로 확인한다.
  - 공용 API decoder와 realtime에 남은 자유형 payload는 도메인 DTO가 확정된 순서대로 field decoder로 추가 축소한다.
  - 전체 빌드와 테스트는 프로젝트 지침에 따라 사용자가 명시적으로 선택해 실행한다.

### 2026-07-05 2차 반영 상태

- 완료:
  - `storage`의 저장 사용자 role 기본값은 `"USER" as UserRole` 같은 문자열 단언 대신 `UserRole.USER/MODERATOR/ADMIN` enum 멤버를 사용하도록 바꿨다.
  - AI trace 조회 결과의 Prisma enum을 공유 DTO enum으로 넘길 때 `as AiTraceKind`, `as AiTraceStatus`로 단언하지 않고 명시 switch 매핑을 통과하도록 바꿨다.
  - combat AOE 방향 계산은 조합 문자열을 `as AoeDirection`으로 단언하지 않고 `toAoeDirection` helper의 리터럴 분기로만 반환하도록 바꿨다.
  - terrain effect id 정규화는 prefix 문자열을 `TerrainEffectDefinitionId`로 단언하지 않고 `TERRAIN_EFFECTS` membership guard를 통과한 값만 반환하도록 바꿨다.
  - character spell 준비 능력치는 catalog 결과를 `CharacterAbilityKey`로 단언하지 않고 허용 ability key guard를 통과하게 했다.
  - 정적 SRD class label lookup은 `value as ClassOptionValue` 대신 `Map<string, string>` lookup으로 legacy 문자열을 안전하게 처리하도록 바꿨다.
  - SRD equipment seed JSON decoder는 `return value as SrdEquipmentRecord`를 제거하고, name/category/economy/weapon/armor/use/contents 하위 필드를 각각 검증해 객체를 재구성하도록 바꿨다.
  - main command/exploration command 상수는 각 literal마다 `as SubmitMainCommandDto[...]`를 붙이지 않고 객체 단위 `satisfies Record<string, ...>`로 DTO union과 맞추도록 바꿨다.
  - `selectedMainRelatedIntent` 상태는 문자열 상태를 반환 시점에 DTO intent로 단언하지 않고, 상태 자체를 `SubmitMainCommandDto['intent'] | ''`로 선언했다.
  - `BattleMapSelection`은 `terrain/wall/door/object`를 하나의 union branch로 뭉치지 않고 kind별 branch로 분리해, object 선택 후 `selection.cell as objectCell` 단언이 필요 없게 했다.
  - `BattleMapStructureInspector` props도 kind별 discriminated union으로 바꿔 `kind === 'object' ? cell as ObjectCell` 같은 UI 내부 단언을 제거했다.
  - inventory equip UI의 `__equipmentDisplayState` 확장은 `InventoryItemDto` 또는 session inventory item으로 숨겨 단언하지 않고, 전용 `InventoryItemWithEquipmentDisplayState` 타입을 드러냈다.
  - feature preview status counter는 초기 accumulator를 명시 타입 변수로 선언해 `as Record<...>` accumulator 단언을 제거했다.
  - `BattleMapCore`의 `updateStructureCells` 내부 `NonNullable<VttMapStateDto['...Cells']>` 배열 단언은 door cell guard와 구조물 종류별 업데이트로 제거했다.
  - `CombatMapperService` callback에서 받은 participant는 이미 `CombatTargeting`/`CombatMonsterActions`가 요구하는 structural 필드를 갖고 있으므로, `participant as CombatParticipantEntity` 단언 없이 그대로 전달하도록 바꿨다.
- 후속:
  - 직접 검색 기준으로 위 2차 대상 패턴은 비테스트 코드에서 더 이상 발견되지 않는다.
  - 실제 타입 호환성은 프로젝트 지침에 따라 사용자가 선택한 빌드 명령으로 확인한다.

### 2026-07-05 3차 반영 상태

- 완료:
  - `CombatService.getAvailableActions`의 `state.phase.toLowerCase() as GamePhase` 단언을 제거하고, Prisma `GamePhase`에서 공유 `GamePhase`로 명시 switch 매핑하도록 바꿨다.
  - `SessionVttMapNormalizationService`의 door state 정규화는 `cell.state as VttDoorState` 단언 대신 `isVttDoorState` membership guard를 통과한 값만 사용하도록 바꿨다.
- 후속:
  - `Record<string, unknown>` passthrough는 도메인별 nested decoder가 확정되는 순서대로 계속 축소한다.

### 2026-07-05 4차 반영 상태

- 완료:
  - 프론트 JWT payload 만료 보조 판정의 직접 `JSON.parse` 호출을 제거하고, `parseJsonWithDecoder(..., decodeJwtPayload)` 경로로 통일했다.
  - 직접 검색 기준으로 `fe/src` 비테스트 코드의 `JSON.parse` 직접 호출은 더 이상 발견되지 않는다.
- 후속:
  - 백엔드/공유 유틸 내부의 `JSON.parse`는 공통 parser 구현부 또는 fallback parser 구현부로 남아 있으므로, 호출부에서 제네릭 단언 없이 decoder/fallback을 통과하는지 계속 감시한다.

### 2026-07-05 5차 반영 상태

- 완료:
  - 백엔드 JWT payload 검증도 직접 `JSON.parse` 대신 `parseJsonWithDecoder(..., decodeTokenPayload)` 경로를 사용하도록 바꿨다.
  - seed 데이터의 보조 JSON 파싱은 로컬 try/catch `JSON.parse` 대신 공통 `parseJsonOrFallback`을 사용하도록 바꿨다.
  - 직접 검색 기준으로 `be/src`, `fe/src`, `shared-types/src` 비테스트 코드의 `JSON.parse` 호출은 `shared-types/src/utils/runtime-guards.ts`와 `be/src/common/utils/json-runtime.ts`의 공통 parser 구현부에만 남아 있다.
- 후속:
  - 공통 parser 호출부가 의미 있는 decoder를 넘기는지 계속 감시하고, identity decoder 사용은 정적 seed/마이그레이션 보조처럼 런타임 외부 입력 경계가 아닌 곳으로 제한한다.

### 2026-07-05 6차 반영 상태

- 완료:
  - `decodeScenarioNode`의 `checkOptions`, `transitions`, `clues`는 더 이상 `readRecordArray`로 전체 record를 그대로 통과시키지 않고, editor와 player view가 실제 사용하는 필드를 검증해 재구성하도록 바꿨다.
  - transition의 `conditionRule.requirements`도 배열과 각 requirement의 문자열 필드를 검증하는 nested decoder를 통과하도록 바꿨다.
- 후속:
  - scenario node의 배열 필드와 `nodeMeta`는 명명 DTO로 승격됐다. `vttMap`, moderation report/appeal/action 같은 자유형 record는 도메인별 표시/저장 규칙이 확정된 순서대로 같은 방식으로 축소한다.

### 2026-07-05 7차 반영 상태

- 완료:
  - `decodeScenarioNode.nodeMeta`는 더 이상 서버 record를 그대로 통과시키지 않고, `npcs/objects/items/areas`, `isEndingNode`, `endBehavior`, `gmNotes`, `ruleRefs`를 검증해 재구성하도록 바꿨다.
  - `ruleRefs`는 실제 editor payload와 화면 복원 로직이 사용하는 `spellIds`, `conditionIds`, `terrainEffectIds` 문자열 배열만 허용하도록 좁혔다.
  - node meta의 확장 필드(`p5Scenario` 등)는 저장 왕복 호환성을 위해 보존하되, JSON 호환 값으로만 제한해 함수/undefined 같은 런타임 비JSON 값이 통과하지 못하게 했다.
  - `ScenarioNodeMetaConstraint`도 `ruleRefs`를 record-array로 잘못 기대하던 상태에서 실제 payload 구조인 문자열 배열 record 검증으로 맞췄다.
- 후속:
  - `ScenarioNodeResponseDto.nodeMeta`는 `ScenarioNodeMetaDto | null`로 승격됐다. `vttMap`, moderation report/appeal/action, campaign archive snapshot처럼 아직 자유형 record가 남은 경계는 화면/서비스 사용 필드가 확정된 순서대로 nested decoder를 추가한다.

### 2026-07-05 8차 반영 상태

- 완료:
  - `decodeScenarioNode.vttMap`은 더 이상 `readOptionalNullableRecord`로 서버 record를 그대로 통과시키지 않고, scenario node용 map shell을 보정한 뒤 기존 `decodeVttMapState`를 통과하도록 바꿨다.
  - 오래된/부분 scenario map 데이터와의 호환성을 위해 `id`, `scenarioNodeId`, `gridType`, `gridSize`, `width`, `height`, `tokens`, `fogRects`, `updatedAt`에는 기본값을 채우되, 배열 엔트리와 VTT 하위 구조는 기존 VTT decoder가 필드별로 검증한다.
  - `ScenarioVttMapConstraint`도 실제 `VttMapStateDto` 필드명인 `tokens/fogRects/startingPositions/pings/lightSources/terrainCells/wallCells/doorCells/objectCells/encounterScaling` 기준으로 최소 구조를 확인하도록 넓혔다.
- 후속:
  - `ScenarioNodeResponseDto.vttMap` 타입은 28차에서 type-only import를 통해 `VttMapStateDto | null`로 승격했다.
  - moderation report/appeal/action, campaign archive snapshot, main command의 자유형 `statePatch/data`는 도메인별 표시/저장 규칙이 확정된 순서대로 nested decoder를 계속 추가한다.

### 2026-07-05 9차 반영 상태

- 완료:
  - `ScenarioModerationQueueItemDto`의 `reports`, `appeals`, `actions`를 `Record<string, unknown>[]` 대신 명명된 queue record 타입 배열로 좁혔다.
  - `decodeScenarioModerationQueueItem`은 더 이상 moderation queue의 nested 배열을 `readRecordArray`로 통과시키지 않고, report reason, appeal status, action/status/notice 리터럴과 nullable string 필드를 검증해 재구성한다.
  - 단건 report/appeal/action 응답은 이미 status/action 리터럴을 검증하고 있어, 이번 변경은 운영자 queue 응답의 nested record passthrough 제거에 집중했다.
- 후속:
  - scenario summary의 `validationReport`, campaign archive snapshot, turn log `structuredAction/diceResult/stateDiff`, main command `statePatch/data` 같은 자유형 record는 사용처별 하위 구조가 확정된 순서대로 계속 축소한다.
  - moderation queue를 실제 화면에 렌더링할 때는 이번에 추가한 명명 타입을 기반으로 동적 record access 없이 표시 컴포넌트를 작성할 수 있다.

### 2026-07-05 10차 반영 상태

- 완료:
  - `decodeScenarioCollaborationState.collaborators`는 더 이상 `readRecordArray(...).map(...)` 경유로 raw record 배열을 만든 뒤 읽지 않고, `decodeScenarioCollaborator` 전용 decoder를 `readArray`에 직접 연결하도록 바꿨다.
  - collaborator `role`은 기존 허용 목록(`owner/editor/reviewer/viewer`)을 그대로 통과하며, `userId`도 전용 decoder에서 필수 문자열로 확인한다.
  - 공용 API decoder에서 마지막으로 남아 있던 `readRecordArray` helper 호출과 helper 정의를 제거했다.
- 후속:
  - campaign archive snapshot, turn log `structuredAction/diceResult/stateDiff`, main command `statePatch/data`처럼 의도적으로 자유형인 record는 도메인별 표시/저장 규칙을 확인한 뒤 전용 decoder로 좁힌다.
  - `Record<string, unknown>` 타입이 남은 DTO는 실제 화면/서비스 계약이 안정된 순서대로 명명 DTO로 승격한다.

### 2026-07-05 11차 반영 상태

- 완료:
  - `ScenarioSummaryResponseDto.validationReport`를 `Record<string, unknown> | null`에서 `ScenarioValidationReportDto | null`로 좁혔다.
  - `decodeScenarioSummary`는 `validationReport`를 더 이상 `readOptionalNullableRecord`로 통과시키지 않고, `status`, `checkedAt`, `issues`, `nodeCounts`, `p4Policy`, `revisionDiff`를 필드별로 검증하는 `decodeScenarioValidationReport`를 사용한다.
  - backend `mapScenarioSummary`와 `ScenariosService.parseScenarioRevisionMetadata`도 저장된 revision metadata의 validation report를 같은 decoder로 검증한 뒤 반환하도록 맞췄다.
- 후속:
  - campaign archive snapshot, turn log `structuredAction/diceResult/stateDiff`, main command `statePatch/data`는 아직 의도적인 자유형 record라서 사용처별 계약을 확인한 뒤 다음 축소 대상으로 삼는다.
  - validation report를 화면에 표시할 경우 이번에 추가한 `ScenarioValidationReportDto`를 기준으로 동적 record access 없이 UI를 작성할 수 있다.

### 2026-07-06 12차 반영 상태

- 완료:
  - `TurnLogResponseDto.diceResult`를 `Record<string, unknown> | null`에서 `TurnLogDiceResultDto | null`로 좁혔다. 일반 dice 응답 필드(`expression`, `rolls`, `modifier`, `total`, `advantageState`)에 더해 로그 표시용 `naturalRoll`, `dc`, `outcome` 선택 필드를 보존한다.
  - `TurnLogResponseDto.stateDiff`를 `Record<string, unknown> | null`에서 `StateDiffResponseDto | null`로 좁혔다.
  - 공용 API decoder에 `decodeDiceRollResponse`, `decodeTurnLogDiceResult`, `decodeStateDiffResponse`를 추가하고, HTTP turn log list와 WebSocket `turn.log.created`, `dice.rolled`, `state.diff.applied` 경계가 같은 decoder를 사용하도록 맞췄다.
  - 백엔드 `TurnLogsService.mapTurnLog`도 저장 JSON을 같은 decoder로 검증한 뒤 반환하며, 손상된 과거 로그 JSON은 기존 fallback 성격을 유지해 해당 필드만 `null`로 처리한다.
- 후속:
  - `TurnLogResponseDto.structuredAction`은 `main_command`, `main_command_check_result`, `action_error`, `auto_hazard_detection`, `vtt_hazard_trigger`, `attack`, `rest` 등 생성 경로가 많으므로 다음 단계에서 discriminated union 후보를 먼저 정리한다.
  - main command `statePatch/data`는 state diff와 겹치는 부분이 있으므로 실제 응답 생성부와 프론트 소비 필드를 함께 확인한 뒤 전용 DTO로 축소한다.

### 2026-07-06 13차 반영 상태

- 완료:
  - `TurnLogResponseDto.structuredAction`을 `Record<string, unknown> | null`에서 `TurnLogStructuredActionDto | null`로 좁혔다.
  - `TurnLogStructuredActionDto`는 넓은 action variant를 보존하되, 값은 `JsonValue`로 제한해 `function`, `undefined`, class instance 같은 비JSON 런타임 값이 HTTP/WS 응답 경계를 통과하지 못하게 했다.
  - 공용 API decoder에 `decodeTurnLogStructuredAction`을 추가하고, HTTP turn log list와 WebSocket `turn.log.created`가 같은 decoder를 사용하도록 맞췄다.
  - 백엔드 `TurnLogsService.mapTurnLog`도 저장된 `structuredActionJson`을 같은 decoder로 검증한 뒤 반환하며, 손상된 과거 로그 JSON은 해당 필드만 `null`로 fallback한다.
- 후속:
  - `TurnLogsService.createTurnLog` 입력 타입은 120차에서 `TurnLogStructuredActionDto`로 좁혔다. 더 세밀한 `main_command`, `rest`, `action_error`, hazard, combat/rule action 계열 discriminated union은 장기 개선 후보로 남긴다.
  - 프론트 `useSession`의 `toRecord(turnLog.structuredAction)` 접근은 새 `JsonValue` 기반 타입을 활용해 점진적으로 type guard/helper로 대체한다.

### 2026-07-06 14차 반영 상태

- 완료:
  - 12차에서 `TurnLogResponseDto.stateDiff`를 `StateDiffResponseDto | null`로 좁힌 판단을 실제 저장 경로 기준으로 재검토했다. `turn.log.created`에 포함되는 값은 엄격한 `StateDiffResponseDto`뿐 아니라 main command의 일반 `statePatch`도 들어올 수 있으므로, 응답 타입을 `TurnLogStateDiffDto | null`로 보정했다.
  - `TurnLogStateDiffDto`는 `StateDiffResponseDto` envelope를 그대로 보존하되, 그 외 객체는 `JsonObject`로 제한한다. 따라서 과거처럼 임의 `Record<string, unknown>`를 통과시키지 않고, JSON으로 표현 가능한 상태 patch만 허용한다.
  - 공용 API decoder에 `decodeTurnLogStateDiff`를 추가했다. `baseVersion`, `nextVersion`, `reason`, `diff`를 갖춘 값은 기존 `decodeStateDiffResponse`로 엄격 검증하고, 일반 patch는 모든 하위 값을 `JsonValue`로 검증한다.
  - HTTP turn log list와 WebSocket `turn.log.created`는 `decodeTurnLogStateDiff`를 사용한다. 별도 실시간 이벤트 `state.diff.applied`는 계속 `decodeStateDiffResponse`를 사용해 strict diff 계약을 유지한다.
  - 백엔드 `TurnLogsService.createTurnLog`와 `attachStateDiff`는 저장 전에 `structuredAction`과 `stateDiff`를 decoder에 통과시킨 뒤 JSON 문자열로 저장한다. 저장된 과거 로그를 읽을 때는 손상된 필드만 `null`로 fallback하는 기존 복구 정책을 유지한다.
  - `TurnLogsService`를 우회해 `turnLog.create`를 직접 호출하던 campaign calendar, economy, campaign archive audit, scenario moderation audit, human GM, VTT object runtime 경계에도 `decodeTurnLogStructuredAction`/`decodeTurnLogStateDiff` 저장 전 검증을 적용했다.
- 후속:
  - `TurnLogsService.createTurnLog`의 `structuredAction`/`stateDiff` 입력 타입은 120차에서 각각 `TurnLogStructuredActionDto`/`TurnLogStateDiffDto`로 좁혔다.
  - `StateDiffResponseDto.diff`는 16차에서 `JsonObject`로 좁혔다. 더 구체적인 patch DTO는 실제 state patch variant가 안정된 뒤 별도 작업으로 분리한다.
  - `diceResultJson` 직접 저장 경계 중 `advantageState`가 없는 자동 위험탐지 로그처럼 기존 `DiceRollResponseDto`와 필드 계약이 맞지 않는 값은 15차의 `TurnLogDiceResultDto` 분리와 후속 저장 전 decoder로 보정했다.

### 2026-07-06 15차 반영 상태

- 완료:
  - `TurnLogDiceResultDto`를 `DiceRollResponseDto & ...`에서 turn log 전용 타입으로 분리했다. `expression`, `rolls`, `modifier`, `total`은 필수로 유지하고, `advantageState`, `naturalRoll`, `dc`, `outcome`, `ability`, `skill`, `damageType`은 선택 필드로 두었다.
  - `decodeTurnLogDiceResult`는 더 이상 `decodeDiceRollResponse`를 강제하지 않는다. 대신 turn log 필수 dice 필드를 검증하고, `advantageState`가 있는 경우에만 enum으로 확인하며, 그 밖의 확장 필드는 `JsonValue`로 제한한다.
  - `dice.rolled` WebSocket 이벤트는 계속 `decodeDiceRollResponse`를 사용해 strict dice 응답 계약을 유지한다. 반면 HTTP turn log list와 WebSocket `turn.log.created`는 `decodeTurnLogDiceResult`를 사용한다.
  - `TurnLogsService.createTurnLog`는 `diceResult`를 저장하기 전에 `decodeTurnLogDiceResult`를 통과시킨다.
  - `TurnLogsService`를 우회하던 VTT object runtime의 자동 위험탐지/함정 발동 로그도 `diceResultJson` 저장 전에 `decodeTurnLogDiceResult`를 사용한다.
- 후속:
  - `TurnLogsService.createTurnLog`의 `structuredAction`, `diceResult`, `stateDiff` 입력 타입은 119~120차에서 각각 `TurnLogStructuredActionDto`, `TurnLogDiceResultDto`, `TurnLogStateDiffDto` 계열로 좁혔다.
  - campaign calendar/economy runtime의 `mapTurnLog`는 80차 이후 `decodeTurnLogDiceResult`/`decodeTurnLogStateDiff` 경유로 정리했고, 136차에서 `parseNullableJsonRecordOrFallback` 유틸 자체를 제거했다.

### 2026-07-06 16차 반영 상태

- 완료:
  - `StateDiffResponseDto.diff`를 `Record<string, unknown>`에서 `JsonObject`로 좁혔다.
  - `decodeStateDiffResponse`가 `diff`를 단순 `readRecord`로 통과시키지 않고, 모든 하위 값을 `JsonValue`로 검증하도록 바꿨다.
  - `decodeTurnLogStateDiff`의 일반 patch 경로도 같은 `decodeJsonObject` helper를 사용하게 정리했다.
  - economy, campaign calendar, human GM override, campaign archive audit, 공용 `StateDiffService`가 `StateDiffResponseDto`를 만들 때 `decodeStateDiffResponse`를 통과하도록 바꿨다.
  - campaign archive audit의 `stateDiff` table 저장은 기존 요약 diff 형태를 보존하되, 저장 전 별도 `decodeStateDiffResponse`로 검증한다.
- 후속:
  - `GmOverrideInput.statePatch`와 `GmOverrideResolution.stateDiff.diff`는 아직 `Record<string, unknown>`다. 현재는 `SessionsService.applyHumanGmResolution`에서 state diff로 승격할 때 검증되지만, 다음 단계에서는 GM override 입력 DTO 또는 service 입력 타입을 `JsonObject`로 좁힌다.
  - `CharacterStatePatch.conditions`의 `unknown[]`는 125차에서 `ConditionStateEntry[]`로 좁혔다. `rule-engine.types.ts`의 patch 모델은 128차에서 현재 동작에 맞게 빈 patch 계약으로 좁혔고, archive transfer 경계는 129차에서 `JsonObject[]`로 좁혔다.

### 2026-07-06 17차 반영 상태

- 완료:
  - `decodeJsonObject`를 공용 API decoder로 export해, 자유형 record를 `JsonObject`로 승격하는 재사용 경계를 만들었다.
  - `GmOverrideInput.statePatch`, `GmOverrideInput.metadata`, `GmOverrideResolution.turnLog.structuredAction.metadata`, `GmOverrideResolution.stateDiff.diff`를 `Record<string, unknown>`에서 `JsonObject`로 좁혔다.
  - `GmOverrideService.resolveOverride`는 `statePatch`와 `metadata`를 즉시 `decodeJsonObject`에 통과시켜 GM override 내부로 비JSON 값이 들어오지 못하게 했다.
  - `SessionsService.createHumanGmOverrideTurnLog`의 params 타입도 `JsonObject`로 맞춰, human GM runtime 호출부가 자유형 record 대신 JSON-compatible 객체를 넘기도록 타입 피드백을 받게 했다.
  - human GM condition 변경 경로는 먼저 `decodeJsonObject`로 state patch를 검증했고, 126차에서 `ConditionStateEntry[]`까지 좁혔다.
- 후속:
  - action rule 계열의 `CharacterStatePatch.conditions`는 125차에서 condition entry 전용 타입으로 좁혔다. `rule-engine.types.ts`의 `statePatch`는 128차에서 현재처럼 patch를 생산하지 않는 명시 타입으로 좁혔다.
  - `economy-runtime`의 audit metadata는 별도 경제 도메인 이벤트 모델이므로, `JsonObject` 승격 대상인지 도메인 DTO로 분리할지 사용처를 확인한다.

### 2026-07-06 18차 반영 상태

- 완료:
  - `EconomyAuditEvent.metadata`를 `Record<string, unknown>`에서 `JsonObject`로 좁혔다.
  - `EconomyRuntimeService.accept`가 audit event를 resolution/state diff로 내보내기 전에 `metadata`를 `decodeJsonObject`로 검증해, 경제 이벤트 metadata에도 비JSON 값이 들어오지 못하게 했다.
  - `EconomyResolution.auditEvent`와 `EconomyResolution.stateDiff.economy`는 같은 normalized audit event를 공유하므로, turn log structuredAction과 state diff 저장 경계가 동일한 검증 결과를 받는다.
  - GM override/economy runtime의 `JsonObject` import를 type import로 정리해 타입 전용 의도를 명확히 했다.
- 후속:
  - `EconomyState.downtimeCompletionsById.*Effects`의 `Array<Record<string, unknown>>`는 아직 넓다. downtime completion effect 구조를 확인한 뒤 `JsonObject[]` 또는 도메인별 effect DTO로 좁힌다.
  - `RewardTable`/`EconomyAuditEvent`는 현재 생성 경로가 코드 내부에 한정돼 있지만, 외부 DTO에서 reward/economy action을 더 많이 받게 되면 입력 decoder를 별도로 둔다.

### 2026-07-06 19차 반영 상태

- 완료:
  - `EconomyState.downtimeCompletionsById.*Effects`의 `Array<Record<string, unknown>>`를 `JsonObject[]`로 좁혔다.
  - `EconomyRuntimeService.cloneState`는 downtime completion effect를 복제할 때 `decodeJsonObject`를 통과시켜, 내부 경제 상태 복제 과정에서도 JSON-compatible 객체만 유지한다.
  - `CampaignCalendarRuntimeService.resolveDowntimeEconomyState`가 생성하는 downtime completion effect도 `cloneJsonObjectArray`를 통해 검증된 `JsonObject[]`로 저장한다.
  - 오래된 flags JSON을 복원하는 `cloneDowntimeCompletion`은 effect 배열 안의 잘못된 entry를 버리고 유효한 JSON object만 보존한다.
- 후속:
  - scenario/checkOptions/transitions/clues 계열 `Record<string, unknown>[]`는 20차 이후 DTO 선언, domain model, decoder 반환 타입까지 명명 DTO로 좁혔다.
  - `MainCommandResponseDto.statePatch`는 29차에서 `JsonObject | null`로 승격해 main command 응답 자체에서도 JSON object 검증을 통과하게 했다.

### 2026-07-06 20차 반영 상태

- 완료:
  - scenario node의 `checkOptions`, `transitions`, `clues`에 `ScenarioCheckOptionDto`, `ScenarioTransitionDto`, `ScenarioTransitionConditionRuleDto`, `ScenarioTransitionRequirementDto`, `ScenarioClueDto` 타입을 추가했다.
  - `ScenarioNodeResponseDto`, `ScenarioNodeInputDto`, `ScenarioNodeModel`의 `checkOptions/transitions/clues`를 `Record<string, unknown>[]`에서 위 명명 DTO 배열로 좁혔다.
  - `decodeScenarioNode` 하위 decoder의 반환 타입도 명명 DTO로 맞췄다.
  - validator가 이미 허용하던 `checkOptions.reason`, `checkOptions.nextNodeId`, `transitions.nextNodeId`를 타입과 decoder에 반영했다. `nextNodeId`는 명시적 `null`도 보존한다.
- 후속:
  - 세션 내부 raw JSON reader인 `SessionVttDefaultMapReaderService.extractChecksFromCheckOptions`, `SessionsService.extractChecksFromCheckOptions`, `SessionRevealService.mapPlayerCheckOptions`는 21차에서 `ScenarioCheckOptionDto[]` 흐름으로 교체했다.
  - scenario DTO의 `npcs`와 `nodeMeta`는 각각 26차/27차에서 명명 DTO로 좁혔다. `vttMap` 타입은 아직 후속으로 남아 있다.

### 2026-07-06 21차 반영 상태

- 완료:
  - legacy `checkOptionsJson` reader를 `decodeScenarioNodeCheckOptionsConfig`로 분리했다. 배열 형태와 `{ checks, vttMap }` envelope를 모두 같은 `ScenarioNodeCheckOptionsConfigDto`로 정규화한다.
  - `SessionVttDefaultMapReaderService.extractChecksFromCheckOptions`, `SessionsService.extractChecksFromCheckOptions`, `SessionRevealService.mapPlayerCheckOptions`의 check option 흐름을 `Record<string, unknown>[]` 대신 `ScenarioCheckOptionDto[]`로 좁혔다.
  - `domain.mapper`의 scenario node config parsing도 같은 decoder를 사용해 DB JSON에서 DTO로 넘어가는 경계를 통일했다.
- 후속:
  - `sessions.service.parseRecordArrayJson`, scenario mutation용 `parseScenarioNodeConfigForMutation`, `ScenarioNodeInputDto.npcs`의 범용 record 배열 경계는 22차-26차에서 목적별 DTO/decoder로 나눴다.
  - `ScenarioNodeInputDto.vttMap`은 28차에서 `VttMapStateDto | null`로 좁혔다.

### 2026-07-06 22차 반영 상태

- 완료:
  - `ScenariosService.parseScenarioNodeConfigForMutation`도 `decodeScenarioNodeCheckOptionsConfig`를 재사용하도록 바꿨다.
  - scenario asset 갱신 시 필요한 `vttMap.imageUrl` 및 `vttMap.tokens[].imageUrl`은 `toScenarioNodeMutationVttMap`에서 문자열/null만 보존하도록 좁혔다.
  - mutation 경로의 `checks` 타입도 `Record<string, unknown>[]`에서 `ScenarioCheckOptionDto[]`로 좁혔다.
- 후속:
  - `sessions.service.parseRecordArrayJson`은 24차에서 제거했고 호출부는 clue decoder로 분리했다.
  - `ScenarioNodeInputDto.npcs`와 `ScenarioNodeResponseDto.nodeMeta`는 각각 26차/27차에서 명명 DTO로 좁혔다. `ScenarioNodeResponseDto.vttMap`은 여전히 후속이다.

### 2026-07-06 23차 반영 상태

- 완료:
  - `decodeScenarioTransitionArray`를 추가해 `transitionsJson` 배열을 `ScenarioTransitionDto[]`로 정규화한다.
  - `ScenariosService.parseTransitionRecords`의 반환 타입을 `Record<string, unknown>[]`에서 `ScenarioTransitionDto[]`로 좁혔다.
  - scenario publish validation, start node resolution, clone/reference rewrite가 transition DTO를 기준으로 `nextNodeId`를 읽도록 정리했다.
- 후속:
  - `sessions.service.parseRecordArrayJson`, `ScenarioNodeInputDto.npcs`, static SRD record array reader는 24차-26차에서 목적별 decoder로 치환했다.
  - shared `decodeRecordArray`와 BE `parseJsonRecordArrayOrFallback`은 26차에서 호출부를 목적별 decoder로 줄인 뒤 제거했다.

### 2026-07-06 24차 반영 상태

- 완료:
  - `decodeScenarioClueArray`를 추가해 `cluesJson` 배열을 `ScenarioClueDto[]`로 정규화한다.
  - clue decoder가 `summary`, `discoverySource`, `playerText`, object형 `revealPolicy`를 보존하도록 확장했다.
  - `SessionRevealService`, `SessionsService.findSessionScenarioRevealable`, `SessionVttObjectRuntimeService.getCurrentNodeClueSnapshots`의 clue JSON parsing을 목적별 decoder로 교체했다.
  - `HumanGmRuntimeService`와 `SessionStartNodeService`의 transition JSON parsing도 `decodeScenarioTransitionArray`로 교체했다.
  - 테스트 파일 제외 기준으로 `be/src/modules/sessions` 내부의 `parseJsonRecordArrayOrFallback` 호출과 직접 `Record<string, unknown>[]` 시그니처가 사라졌다.
- 후속:
  - shared/BE 공통 `decodeRecordArray` 유틸은 26차에서 제거했다.
  - `ScenarioNodeInputDto.npcs`와 static SRD reader는 각각 `ScenarioNpcDto[]`, `StaticItemCatalogEntry[]`로 좁혔다.

### 2026-07-06 25차 반영 상태

- 완료:
  - `VttMapInteractionResponseDto.checkOptions`를 `Record<string, unknown>[]`에서 `MainCommandCheckOptionDto[]`로 좁혔다. 기존 response decoder와 BE runtime 반환 타입이 이미 이 타입을 사용하고 있어 선언을 실제 경계와 맞췄다.
  - FE static SRD item catalog에 `StaticItemCatalogEntry`를 추가하고 `equipmentItems/magicItems`를 목적별 entry 배열로 좁혔다.
  - `staticSrd.readRecordArray`를 제거하고 `decodeItemCatalogEntry`로 `items.json`의 id/name 및 주요 표시 필드를 검증한다.
- 후속:
  - `domain.mapper`와 일부 action service에 남아 있던 `parseJsonRecordArrayOrFallback` 호출은 26차에서 `decodeScenarioTransitionArray`/`decodeScenarioClueArray`/`decodeScenarioNpcArray`로 치환했다.
  - `ScenarioNodeInputDto.npcs`와 `CreateScenarioDto/UpdateScenarioDto.npcs`는 26차에서 `ScenarioNpcDto[]`로 좁혔다.

### 2026-07-06 26차 반영 상태

- 완료:
  - `ScenarioNpcDto`와 `decodeScenarioNpcArray`를 추가했다.
  - `ScenarioResponseDto`, `CreateScenarioDto`, `UpdateScenarioDto`의 `npcs`를 `ScenarioNpcDto[]`로 좁히고, `domain.mapper`의 `npcsJson` parsing도 목적별 decoder로 교체했다.
  - `domain.mapper`의 `transitionsJson`/`cluesJson` 응답 mapping과 action transition/evidence 서비스의 transition/clue parsing을 `decodeScenarioTransitionArray`, `decodeScenarioClueArray`로 교체했다.
  - 더 이상 호출되지 않는 BE `parseJsonRecordArrayOrFallback`/`decodeRecordArray`와 shared `decodeRecordArray`를 제거했다.
  - combat monster action의 `childActions`도 `decodeCombatMonsterChildAction`으로 전용 검증하도록 바꿨다.
- 후속:
  - `Record<string, unknown>[]`, `any[]`, `as any`, `as unknown as`, `JSON.parse(...) as` 계열 검색은 테스트 제외 기준으로 더 이상 직접 hit가 없다. 다음 단계는 `Record<string, unknown> | null`로 남은 객체 경계를 목적별 DTO로 좁히는 것이다.

### 2026-07-06 27차 반영 상태

- 완료:
  - `ScenarioNodeMetaDto`, `ScenarioNodeMetaEntityDto`, `ScenarioNodeMetaRuleRefsDto`를 추가했다.
  - `ScenarioNodeResponseDto.nodeMeta`와 `ScenarioNodeInputDto.nodeMeta`를 `Record<string, unknown> | null`에서 `ScenarioNodeMetaDto | null`로 좁혔다.
  - `decodeScenarioNodeMeta`, `decodeScenarioNodeMetaEntity`, `decodeScenarioNodeMetaRuleRefs`의 반환 타입을 명명 DTO로 맞췄다.
  - `ScenarioEditorPage`의 `nodeMeta` helper들이 `ScenarioNodeMetaDto`를 직접 받아 `npcs`, `ruleRefs`, `gmNotes`, ending flag를 읽도록 바꿨다.
- 후속:
  - 시나리오 `vttMap`은 28차에서 `VttMapStateDto | null`로 좁혔다.
  - `VttMapInteractionResponseDto.data`와 `MainCommandResponseDto.statePatch`는 29차에서 각각 `MainCommandResponseDataDto | null`, `JsonObject | null`로 좁혔다.

### 2026-07-06 28차 반영 상태

- 완료:
  - `ScenarioNodeResponseDto.vttMap`, `ScenarioNodeInputDto.vttMap`, `ScenarioNodeCheckOptionsConfigDto.vttMap`을 `VttMapStateDto | null`로 좁혔다.
  - `scenarios.dto.ts`는 `sessions.dto.ts`를 runtime import하지 않도록 `VttMapStateDto`를 type-only import한다.
  - `decodeScenarioNodeVttMap`과 legacy `{ checks, vttMap }` config decoder가 `VttMapStateDto`를 반환하도록 맞췄다.
  - `domain.mapper`는 node id를 config decoder에 넘겨 오래된 partial scenario map도 기존처럼 id/scenarioNodeId 기본값을 채운 뒤 `VttMapStateDto`로 반환한다.
- 후속:
  - `SessionDetailResponseDto.publicRevisionLineage`는 30차에서 `CampaignArchivePublicRevisionLineageDto | null`로 좁혔다.

### 2026-07-06 29차 반영 상태

- 완료:
  - `MainCommandResponseDto.statePatch`를 `Record<string, unknown> | null`에서 `JsonObject | null`로 좁혔다.
  - `decodeMainCommandResponse`가 `statePatch`를 `decodeJsonObject`에 통과시키도록 바꿔, 응답 경계에서도 비JSON 객체가 들어오지 못하게 했다.
  - `VttMapInteractionResponseDto.data`를 `Record<string, unknown> | null`에서 `MainCommandResponseDataDto | null`로 좁혔다.
  - `decodeVttMapInteractionData`의 반환 타입을 `VttMapInteractionResponseDto["data"]`와 맞추고, `checkEffect/effect`는 기존처럼 `isMainCommandCheckEffect`로 검증한다.
- 후속:
  - campaign archive/public revision lineage는 30차에서 명명 DTO와 decoder로 좁혔다.
  - `MainCommandResponseDto.data`의 `checkEffect/effect`도 30차에서 `isMainCommandCheckEffect` 검증을 통과하게 했다.

### 2026-07-06 30차 반영 상태

- 완료:
  - `CampaignArchivePublicRevisionLineageDto`를 추가하고 `CampaignArchiveSnapshotDto.publicRevisionLineage`를 `Record<string, unknown> | null`에서 해당 DTO로 좁혔다.
  - `decodeCampaignArchiveSnapshot`이 `publicRevisionLineage`를 필드별 `string | null` 구조로 검증하도록 `decodeCampaignArchivePublicRevisionLineage`를 추가했다.
  - `CampaignArchiveRuntimeService`의 archive flag 복원과 `P5_PUBLIC_META.lineage` 추출 경로가 임의 record를 그대로 반환하지 않고 `normalizePublicRevisionLineage`를 거치게 했다.
  - `decodeMainCommandResponse`의 `data`도 `decodeMainCommandResponseData`를 거치게 해 `checkEffect/effect`를 `isMainCommandCheckEffect`로 검증한다.
  - VTT interaction의 `data` decoder는 같은 `decodeMainCommandResponseData`를 재사용해 main command 응답과 검증 규칙이 갈라지지 않게 했다.
  - `CombatMonsterActionSaveDto`를 추가하고 `CombatMonsterActionOptionDto.save`의 inline object 타입을 명명 DTO로 좁혔다.
  - `decodeCombatMonsterActionSave`를 추가해 combat action `save`를 전용 decoder로 검증하고, 더 이상 필요 없는 `readOptionalNullableRecord` 헬퍼를 제거했다.
- 후속:
  - shared DTO의 직접 `Record<string, unknown> | null` 경계는 검색 기준으로 제거됐다.
  - 다음 단계는 남은 범용 record helper 사용처 중 실제 DTO 계약을 더 좁힐 수 있는 항목과 BE/FE 외부 입력 경계의 nullable 처리 누락을 계속 줄이는 것이다.

### 2026-07-06 31차 반영 상태

- 완료:
  - `BattleMapCore`의 explored vision localStorage payload에 `version`을 추가했다.
  - `decodeStoredExploredVisionCells`가 저장 payload의 `version`, `width`, `height`, `gridSize`, `cells`를 모두 검증하게 했다.
  - 저장된 explored vision cache가 구버전이거나 현재 map 크기/grid와 맞지 않거나 JSON/shape가 손상된 경우, 빈 set으로 fallback하면서 해당 localStorage key를 제거하도록 했다.
- 후속:
  - 다른 localStorage/debug flag 경계는 값이 단순 literal인지, 장기 저장 state인지 구분해 장기 저장 state부터 versioned schema로 확대한다.
  - FE `location.state`/custom event detail처럼 브라우저 내부 경계지만 외부 값처럼 취급해야 하는 영역의 decoder 누락도 계속 확인한다.

### 2026-07-06 32차 반영 상태

- 완료:
  - `useCombatReactionAutoHandler`의 `trpg:combat-reaction-prompt` custom event 수신 경계를 보강했다.
  - 기존 수신 guard는 reaction `type`만 확인해 `id`, `reactorParticipantId`, `message` 같은 필수 필드 누락을 막지 못했다.
  - 이미 전투 결과 표시 경로에서 쓰는 `isCombatReactionPromptDto`를 재사용해 custom event detail도 필수 필드와 허용 reaction type을 모두 통과한 값만 자동 반응 처리로 넘기게 했다.
- 후속:
  - custom event dispatch 경계는 WebSocket decoder를 통과하지만, 수신자가 별도로 detail을 읽는 곳은 계속 receiver-side guard를 유지한다.
  - `location.state` reader는 이미 page별 guard가 있으므로, 새 route state 추가 시 같은 패턴을 유지한다.

### 2026-07-06 33차 반영 상태

- 완료:
  - FE auth custom event detail은 이미 `CustomEvent`와 문자열 필드 guard를 통과하고 있음을 확인했다.
  - FE `location.state`는 `App.tsx`의 page별 reader가 `isRecord`, enum/literal, DTO decoder를 통과시키고 있음을 확인했다.
  - `fe/src/main.tsx`의 `document.getElementById("root")!` non-null assertion을 제거하고, root element가 없으면 명시적인 오류를 던지도록 바꿨다.
- 후속:
  - DTO class의 `!:` definite assignment는 계속 감사 제외군으로 두되, 실제 런타임 nullable 값에 붙은 `!`는 검색으로 별도 추적한다.
  - 숫자 input의 `Number(event.target.value)` 경계는 UI 범위 clamp가 없는 곳부터 순차적으로 `Number.isFinite` 기반 helper로 통일한다.

### 2026-07-06 34차 반영 상태

- 완료:
  - `BattleMapFogInspector`의 fog 좌표/크기 숫자 input이 `Number(event.target.value)` 결과를 그대로 map state에 넣지 않도록 했다.
  - fog `x/y`는 유효한 finite number일 때만 갱신하고, 잘못된 값은 기존 값을 유지한다.
  - fog `width/height`는 finite number 검증 후 최소 1 이상으로 보정한다.
  - `BattleMapTokenInspector`의 token `x/y/size/encounterPriority`도 finite number 검증을 거치게 했다.
  - token `size`와 `encounterPriority`는 검증 후 기존 허용 범위 clamp를 적용한다.
- 후속:
  - `BattleMapStructureInspector`의 구조물 좌표/크기와 DC 입력도 같은 방식으로 finite/clamp helper를 적용한다.
  - combat/human GM 숫자 입력은 서버 DTO 검증과 중복되더라도 프론트 상태에는 `NaN`을 저장하지 않도록 정리한다.

### 2026-07-06 35차 반영 상태

- 완료:
  - `BattleMapStructureInspector`의 구조물 `x/y/width/height` 숫자 input이 `Number(event.target.value)` 결과를 그대로 map state에 넣지 않도록 했다.
  - 구조물 `x/y`는 finite number일 때만 갱신하고, `width/height`는 finite 검증 후 최소 1 이상으로 보정한다.
  - door/object `breakCheckDc`는 빈 값만 `null`로 처리하고, 숫자 값은 finite 검증 후 `VTT_CHECK_DC_MIN`-`VTT_CHECK_DC_MAX` 범위로 clamp한다.
  - object reveal check DC, hazard radius/DC, fog reveal event trigger distance/reveal radius도 finite 검증 후 기존 허용 범위 clamp를 적용한다.
- 후속:
  - combat/human GM 숫자 입력은 서버 DTO 검증과 중복되더라도 프론트 상태에는 `NaN`을 저장하지 않도록 정리한다.
  - 반복되는 숫자 input helper는 battle map 컴포넌트 간 중복이 더 늘어나면 공용 UI parsing helper로 승격한다.

### 2026-07-06 36차 반영 상태

- 완료:
  - `CombatNodeSurface`의 주문 슬롯 select가 `Number(event.target.value)`를 바로 저장하지 않고, 실제 `availableSlotLevels`에 포함된 값만 `spellSlotLevelBySpellId`에 저장하도록 했다.
  - GM HP 직접 조정 input은 finite number 검증 후 0-대상 max HP 범위로 clamp하고, 잘못된 입력은 기존 HP 값을 유지한다.
  - GM 강제 이동 거리 select는 `gmForcedMovementDistanceOptions`에 포함된 값만 상태로 반영한다.
- 후속:
  - `ExplorationNodeSurface`와 `StoryNodeSurface`의 휴식/GM inventory 숫자 입력도 같은 방식으로 finite/integer helper를 적용한다.
  - 반복되는 숫자 input helper는 battle/combat/exploration 컴포넌트에서 동일 패턴이 충분히 쌓이면 공용 UI parsing helper로 승격한다.

### 2026-07-06 37차 반영 상태

- 완료:
  - `ExplorationNodeSurface`의 short rest hit dice input이 직접 `Number(event.target.value)`를 상태에 넣지 않고, `readClampedInteger`를 통해 0-현재 hit dice maximum 범위의 정수만 저장하게 했다.
  - `ExplorationNodeSurface`의 GM inventory grant 수량 input도 `Number.parseInt(...) || min` 대신 같은 정수 clamp helper를 사용해 invalid 입력이면 기존 수량을 유지한다.
  - `StoryNodeSurface`의 short rest hit dice input도 동일하게 정수 clamp helper를 통과한다.
- 후속:
  - `Number(event.target.value)`가 남은 FE 숫자 입력 중 서버 요청 payload에 직접 연결되는 경계를 계속 우선 정리한다.
  - 반복되는 숫자 input helper는 battle/combat/exploration 컴포넌트에서 동일 패턴이 충분히 쌓이면 공용 UI parsing helper로 승격한다.

### 2026-07-06 38차 반영 상태

- 완료:
  - `SessionEconomyPanel`의 economy action 숫자 입력이 `Number(event.target.value) || fallback` 결과를 서버 payload 상태에 바로 저장하지 않도록 했다.
  - `quantity`, `laborHours`, `chargesRecovered`, `maximumCharges`는 `readClampedInteger`를 통해 최소 1 이상의 정수만 저장한다.
  - `priceGp`, `costGp`, `rewardGp`는 `readClampedNumber`를 통해 0 이상의 finite number만 저장한다.
  - invalid 입력은 0/1로 강제 재설정하지 않고 기존 상태 값을 clamp한 결과를 유지한다.
- 후속:
  - 남은 `SessionCampaignCalendarPanel`, `SessionCreatePage`, `CharacterPage` 숫자 입력 중 서버 요청 payload와 직접 연결되는 경계를 우선 정리한다.
  - 반복되는 숫자 input helper는 battle/combat/exploration/economy 컴포넌트에서 동일 패턴이 충분히 쌓이면 공용 UI parsing helper로 승격한다.

### 2026-07-06 39차 반영 상태

- 완료:
  - `SessionCampaignCalendarPanel`의 campaign calendar action 숫자 입력이 `Number(event.target.value) || fallback` 결과를 서버 payload 상태에 바로 저장하지 않도록 했다.
  - `durationMinutes`는 `readClampedInteger`를 통해 최소 1 이상의 정수만 저장한다.
  - `elapsedDays`, `costGp`, `workDaysRequired`, `workDaysDelta`는 같은 helper를 통해 0 이상의 정수만 저장한다.
  - invalid 입력은 0/1로 강제 재설정하지 않고 기존 상태 값을 clamp한 결과를 유지한다.
- 후속:
  - 남은 `SessionCreatePage`, `CharacterPage`, battle map editor controls 숫자 입력 중 서버 요청 payload와 직접 연결되는 경계를 우선 정리한다.
  - 반복되는 숫자 input helper는 battle/combat/exploration/economy/calendar 컴포넌트에서 동일 패턴이 충분히 쌓이면 공용 UI parsing helper로 승격한다.

### 2026-07-06 40차 반영 상태

- 완료:
  - `SessionCreatePage`의 세션 생성 참가 인원 입력이 raw `Number(event.target.value)` 결과를 생성 payload 상태에 바로 저장하지 않도록 했다.
  - 참가 인원은 `readClampedInteger`를 통해 1~4 범위의 정수만 `maxPlayers`에 저장한다.
  - `CharacterPage`의 시작 장비 슬롯 선택 인덱스가 select value를 숫자로 단언하지 않고, `readOptionIndex`로 실제 옵션 범위 안의 정수인지 확인한 뒤 draft에 반영되도록 했다.
  - 캐릭터 생성 능력치 입력과 레벨업 목표 레벨 입력은 `readClampedInteger`를 통해 각각 최소 능력치 1, 현재 레벨+1~20 범위 안의 정수만 상태 전이에 넘긴다.
- 후속:
  - 남은 FE 숫자 입력 중 `parseInt(event.target.value)`, `Number(value)`가 서버 payload나 draft reset에 직접 연결되는 곳을 계속 우선 정리한다.
  - `readClampedInteger`, `readOptionIndex` 패턴이 페이지/컴포넌트 전반에 충분히 반복되면 공용 UI input parsing helper로 승격한다.

### 2026-07-06 41차 반영 상태

- 완료:
  - `BattleMapEditorControls`의 encounter scaling 기준 파티 인원 입력이 raw `Number(event.target.value)` 결과를 map state patch에 바로 저장하지 않도록 했다.
  - 기준 파티 인원은 `readClampedInteger`를 통해 1~12 범위의 정수만 `basePartySize`에 반영한다.
  - zoom select는 임의 숫자 변환 대신 `readAllowedNumber`로 `zoomSteps`에 실제 존재하는 값만 `onZoomSelect`에 넘긴다.
  - 더 이상 필요 없는 toolbar `clamp` prop 전달을 제거해 새 helper와 기존 prop이 중복되지 않게 했다.
- 후속:
  - FE 입력 경계에서 직접 `Number(event.target.value)` 패턴은 정리됐으므로, 다음 단계는 localStorage/브라우저 저장값 decoder와 `as` cast 후보 중 외부 입력에 닿는 경계를 우선 확인한다.
  - 반복된 `readClampedInteger`, `readAllowedNumber`, `readOptionIndex`는 이후 공용 UI input parsing helper로 묶을 후보로 남긴다.

### 2026-07-06 42차 반영 상태

- 완료:
  - `fe/src/services/storage.ts`의 localStorage 복원 경계가 현재 작업트리 기준 `parseJsonWithDecoder`, `decodeStoredUser`, `decodeSessionSnapshot`을 거치고 있음을 확인했다.
  - App OAuth callback provider 값도 `readOAuthProvider`로 `kakao | discord`만 통과시키고 있음을 확인했다.
  - `ScenarioPage`의 `formatScenarioLevel`에서 `Scenario`를 `Scenario & { startLevel; recommendedEndLevel }`로 재단언하던 불필요 cast를 제거했다.
  - `Scenario` DTO가 이미 갖는 `startLevel`, `recommendedEndLevel` 필드를 직접 읽되, 런타임 값이 number일 때만 표시 레벨 계산에 사용하도록 유지했다.
- 후속:
  - 남은 `as` 후보 중 DOM/CSS 타입 보정이 아닌 서버 응답, 브라우저 저장값, URL/navigation state 등 외부 입력에 닿는 cast를 계속 선별한다.
  - `ScenarioPage`처럼 타입 모델에 이미 존재하는 필드를 재단언하는 패턴은 guard 또는 직접 타입 사용으로 축소한다.

### 2026-07-06 43차 반영 상태

- 완료:
  - `SessionDiscoverPage`의 theme/GM/status 필터 select가 raw `event.target.value`를 그대로 필터 상태에 저장하지 않도록 했다.
  - theme 필터는 `sessionVisualPresets`에서 만든 허용 테마 목록 또는 `all`만 통과시키고, GM/status 필터도 각각 허용 label/status 목록에 포함될 때만 상태를 갱신한다.
  - `mainCommandModel`에 `toMainCommandIntent` guard를 추가해 문자열을 `SubmitMainCommandDto["intent"]`로 좁히는 경계를 한 곳에 모았다.
  - `PlayPage`의 main command target/item/related intent select는 옵션에 실제 존재하는 ID 또는 intent만 상태로 반영한다.
- 후속:
  - URL/navigation state, select value, 자동완성 입력처럼 브라우저 문자열이 서버 command payload로 이어지는 경계를 계속 우선 점검한다.
  - target/item ID는 이후 draft 복원이나 map selection에서 들어오는 경로도 같은 reconciliation/guard 정책으로 맞춘다.

### 2026-07-06 44차 반영 상태

- 완료:
  - `SessionEconomyPanel`의 character/shop/item/crafting select가 raw `event.target.value`를 서버 economy action payload 상태에 바로 저장하지 않도록 했다.
  - 각 ID select는 빈 값 또는 현재 렌더링된 옵션 목록에 포함된 ID만 상태로 반영한다.
  - `SessionCampaignCalendarPanel`의 schedule/character/downtime task select도 같은 방식으로 guard를 적용했다.
  - 사용자가 직접 입력하는 자유 텍스트 ID(`craftingId`, `recipeId`, `outputItemDefinitionId`)는 의도된 입력 경로로 유지하고, 목록 선택형 ID만 이번 범위에서 제한했다.
- 후속:
  - session play 패널의 남은 select/input 중 서버 payload로 이어지는 값이 “자유 텍스트”인지 “허용 목록 선택”인지 계속 구분한다.
  - 허용 목록 선택값은 `readOptionalOptionId` 패턴을 공용 helper 후보에 포함한다.

### 2026-07-06 45차 반영 상태

- 완료:
  - 백엔드 `checkOptionsJson`에서 VTT map을 꺼내는 런타임 경로 중 identity decoder(`candidate => candidate`)에 기대던 부분을 제거했다.
  - `MainCommandSceneTransitionStateService`는 scene transition 대상 노드의 `checkOptionsJson`을 `decodeScenarioNodeCheckOptionsConfig`로 검증한 뒤 `vttMap`만 flags에 반영한다.
  - `SessionVttDefaultMapReaderService`도 default VTT map 추출 시 같은 decoder를 사용하고, 기존 map normalization을 한 번 더 통과시킨다.
  - 잘못된 JSON 또는 shape mismatch는 기존 `parseJsonOrFallback` 정책대로 `{ checks: [], vttMap: null }` fallback으로 처리되어 scene transition 자체를 깨지 않게 유지했다.
- 후속:
  - seed/fixture 보조 코드를 제외하고 런타임 서비스에 남은 `parseJsonOrFallback(..., candidate => candidate)` 패턴을 계속 제거한다.
  - `flagsJson` 안의 `vttMap`, economy, calendar처럼 도메인별 구조가 있는 값은 record fallback에서 전용 decoder로 점진적으로 옮긴다.

### 2026-07-06 46차 반영 상태

- 완료:
  - `AiClient`는 현재 작업트리 기준 `attemptPostJson`에서 응답 JSON을 endpoint별 decoder로 통과시키고, decoder 실패를 `BadGatewayException`으로 감싸고 있음을 확인했다.
  - OAuth/JWT 경계도 현재 작업트리 기준 Kakao/Discord token/user 응답과 JWT payload가 필수 필드 decoder를 거치고 있음을 확인했다.
  - `RuleCatalogService`의 `canonicalClassFeatures as CanonicalClassFeature[]` 단언을 제거했다.
  - generated class feature catalog는 `decodeCanonicalClassFeatures`를 통해 배열 여부, non-empty `id`, 선택적 `nameKo/summaryKo` 문자열/null 여부를 검증한 뒤 map으로 만든다.
  - `CombatTurnService`의 빈 `DiceRollResponseDto[]` fallback 단언을 명시 타입 fallback 객체로 바꿔 불필요한 배열 cast를 제거했다.
- 후속:
  - 정적/generated data import 중 `as SomeType[]`로 catalog를 신뢰하는 패턴을 계속 검색한다.
  - OAuth provider 응답 decoder는 필수 필드 정책 변경이 생기면 `decodeKakao*`, `decodeDiscord*` 함수에서만 수정되도록 유지한다.

### 2026-07-06 47차 반영 상태

- 완료:
  - 프론트의 남은 단언 후보 중 런타임 문자열/객체 키 접근에 가까운 항목을 우선 정리했다.
  - `mainCommandModel`의 intent 문자열 변환은 `value as SubmitMainCommandDto['intent']` 대신 `isMainCommandIntent` 타입 가드를 통과한 값만 반환한다.
  - `displayNames`는 generated item label 객체를 임의 key cast로 조회하지 않고 `Map<string, string>`으로 만든 뒤 조회한다.
  - `GameIcon`은 alias 객체 key cast 대신 명시 resolver로 아이콘 이름을 결정한다.
  - `characterRacePresentation`, `characterBuildRules`, `characterFeatureChoices`는 `Object.entries/Object.values/Object.fromEntries` 결과를 `Record` 또는 tuple array로 단언하지 않고 `abilityKeys`를 기준으로 계산한다.
  - `SessionCampaignCalendarPanel`의 action label 목록은 `Object.entries(... ) as Array<...>` 대신 명시 typed tuple 목록을 사용한다.
- 확인:
  - 편집 범위에서 `as Record<`, `as keyof`, `as Array<`, `as SomeType[]` 후보 검색 결과가 0건임을 확인했다.
  - 전역 고위험 패턴(`as unknown as`, `as any`, `any[]`, `JSON.parse(...) as`, `private parseJson<T>`, `return data as T`) 검색 결과가 0건임을 확인했다.
- 후속:
  - 남은 `keyof`/CSS custom property/React ref 계열 단언은 런타임 입력 경계인지와 단순 TS 표현 한계인지 구분해서 처리한다.
  - generated/static catalog 조회는 `Map` 또는 전용 decoder를 우선 사용하고, key cast 기반 조회를 새로 추가하지 않는다.

### 2026-07-06 48차 반영 상태

- 완료:
  - 8단계 localStorage/editor draft 복원 경계를 다시 점검했다.
  - `storage.ts`의 user/snapshot 저장값과 `BattleMapCore`의 explored vision 저장값은 현재 작업트리 기준 `parseJsonWithDecoder`와 전용 decoder를 거쳐 손상 JSON을 폐기하고 있음을 확인했다.
  - `ScenarioEditorPage`의 draft 비교 로직에서 `JSON.parse(...) as CreateScenarioDto & UpdateScenarioDto` 계열의 위험은 이미 제거되어 있었고, 이번에는 decoder가 `...value`로 임의 필드를 그대로 유지하지 않도록 더 좁혔다.
  - `decodeDirtyScenarioSnapshot`은 비교에 필요한 metadata, `npcs`, `nodes`만 명시적으로 복원하고, `nodes`는 object 배열 여부와 `id` 문자열 여부를 확인한다.
  - node 변경 비교는 `Object.keys(node)`와 `keyof` cast 대신 `dirtyScenarioNodeKeys` 명시 목록만 비교한다.
- 확인:
  - `storage.ts`, `BattleMapCore`, `ScenarioEditorPage`의 저장값 JSON 파싱 경로가 `parseJsonWithDecoder`를 사용함을 확인했다.
  - `ScenarioEditorPage`에서 `Object.fromEntries`, `...value`, node 비교용 `as keyof` 후보가 남지 않음을 확인했다.
- 후속:
  - draft snapshot은 현재 비교용 최소 decoder이므로, 실제 draft 복원 기능이 추가되면 `CreateScenarioDto`/`UpdateScenarioDto` 전체 decoder를 별도로 두고 저장 schema version을 붙인다.
  - localStorage payload는 `schemaVersion` 없는 기존 값을 graceful fallback으로 처리하되, 새 저장 format에는 version을 포함하는 방향으로 이어간다.

### 2026-07-06 49차 반영 상태

- 완료:
  - 백엔드 ingress로 쓰이는 scenario DTO의 중첩 객체 validation을 다시 점검했다.
  - `ScenarioNodeInputDto`의 `checkOptions`, `transitions`, `clues`, `vttMap`, `nodeMeta`는 커스텀 constraint를 통해 검증하도록 구성되어 있음을 확인하고, 느슨했던 내부 필드 검증을 보강했다.
  - `ScenarioCheckOptionsConstraint`는 `id/playerLabel/label/type/skill/ability/reason/nextNodeId/dc` 타입을 함께 확인한다.
  - `ScenarioTransitionsConstraint`는 `id/label/condition/nextNodeId/note`뿐 아니라 `conditionRule.logic`과 `requirements[]` 내부 문자열 필드도 확인한다.
  - `ScenarioCluesConstraint`는 clue DTO에 선언된 주요 문자열 필드와 `revealPolicy`의 허용 shape를 확인한다.
  - `ScenarioNpcsConstraint`와 `ScenarioNodeMetaConstraint`는 공통 `isScenarioMetaEntity` 규칙을 사용해 `npcs/objects/items/areas` 배열 원소가 단순 object 배열로만 통과하지 않게 했다.
- 확인:
  - `shared-types/src/dto/api/scenarios.dto.ts`의 DTO constraint 편집 범위에서 `as unknown as`, `as any`, `any[]`, `JSON.parse(...) as` 검색 결과가 0건임을 확인했다.
- 후속:
  - scenario VTT map constraint는 아직 tokens/fogRects/cells를 object 배열 수준으로 보는 부분이 남아 있으므로, `VttMapStateDto`의 nested DTO/decoder와 같은 기준으로 점진적으로 좁힌다.
  - gameplay DTO의 `MainCommandCheckEffectConstraint`, `MainCommandDiceResultConstraint`도 같은 방식으로 실제 사용 필드까지 검증하는지 이어서 점검한다.

### 2026-07-06 50차 반영 상태

- 완료:
  - gameplay DTO의 `MainCommandCheckEffectConstraint`와 `MainCommandDiceResultConstraint`를 점검하고 보강했다.
  - narrative main-command check effect는 `intent`와 `screenType`을 단순 문자열이 아니라 `MainCommandIntent`, `MainCommandScreenType`의 실제 enum 값 목록과 대조한다.
  - `targetId/targetName/targetSummary/targetDisposition/itemId/itemName`은 문자열/null/undefined만 허용하고, `mapPoint`는 finite number 좌표 객체 또는 null/undefined만 허용한다.
  - `checkOption`은 optional object일 때 `ability/skill`, `reason`, `dc` 타입과 범위를 확인하고, `actionCandidate`는 `actorId`, `targetId`, `actionSummary`, `declaredMethod` shape를 확인한다.
  - `diceResult.rolls`와 `naturalRoll`은 d20 정수 범위(1-20), `dc`는 1-40 정수 범위로 좁혀 `main-command-check-result-narration`의 sanitize 기대와 맞췄다.
- 확인:
  - `shared-types/src/dto/api/gameplay.dto.ts` 편집 범위에서 `as unknown as`, `as any`, `any[]`, `JSON.parse(...) as`, `return data as T` 검색 결과가 0건임을 확인했다.
- 후속:
  - `MainCommandCheckEffectConstraint`의 `checkOption`과 `actionCandidate`는 현재 실제 사용 필드 중심의 최소 shape 검증이므로, DTO가 확장되면 constraint도 함께 확장한다.
  - VTT map DTO nested constraint와 DB 저장 JSON decoder의 남은 object-array 경계를 계속 좁힌다.

### 2026-07-06 51차 반영 상태

- 완료:
  - scenario DTO의 `ScenarioVttMapConstraint`에서 VTT map nested 배열을 단순 object 배열로만 통과시키던 부분을 보강했다.
  - `tokens`는 `id/name/x/y/size`, nullable id/image 필드, hidden/hostile boolean, encounter role/priority, monster object 여부를 확인한다.
  - `fogRects`, `startingPositions`, `pings`, `lightSources`, `terrainCells`, `wallCells`, `doorCells`는 각 DTO가 기대하는 주요 문자열/숫자/enum/nullable 필드를 확인한다.
  - `objectCells`는 terrain cell 기본 shape 외에 `shapeCells`, `visibleToPlayers/canBreak/broken`, `breakCheckDc`, hidden/observed id 배열, `revealChecks`, `events`, `hazard`의 주요 nested shape를 확인한다.
  - `encounterScaling`은 `enabled`, `basePartySize`, `minMonsterCount`, `mode`를 확인한다.
- 확인:
  - `shared-types/src/dto/api/scenarios.dto.ts`에서 VTT map nested 배열에 대한 `isRecordArray(value.tokens/fogRects/terrainCells/objectCells/...)` 식의 느슨한 검증이 남지 않음을 확인했다.
  - 같은 파일에서 `as unknown as`, `as any`, `any[]`, `JSON.parse(...) as`, `return data as T` 검색 결과가 0건임을 확인했다.
- 후속:
  - scenario VTT constraint는 이제 주요 shape를 막지만, `monster` 내부는 object 여부까지만 본다. 필요하면 `SrdMonsterReferenceDto`의 필수 필드 기준으로 더 좁힌다.
  - VTT map runtime API는 이미 `UpdateVttMapDto`의 `@ValidateNested`를 사용하므로, scenario 저장 경로와 runtime map update 경로의 정책 차이를 계속 줄인다.

### 2026-07-06 52차 반영 상태

- 완료:
  - DB 저장 JSON 경계 중 economy/campaign-calendar runtime의 turn log mapping을 보강했다.
  - `EconomyStateRuntimeService.mapTurnLog`와 `CampaignCalendarRuntimeService.mapTurnLog`는 더 이상 `structuredActionJson`, `diceResultJson`, `stateDiffJson`을 nullable record fallback으로만 복원하지 않는다.
  - 세 필드는 각각 `decodeTurnLogStructuredAction`, `decodeTurnLogDiceResult`, `decodeTurnLogStateDiff`를 `parseJsonOrFallback` decoder로 통과한 경우에만 응답 DTO에 반영된다.
  - 손상되었거나 shape가 맞지 않는 저장 JSON은 기존 fallback 정책대로 `null`이 되어, 잘못된 DB JSON이 프론트 응답 DTO 안으로 record 형태 그대로 새지 않는다.
- 확인:
  - 두 runtime service에서 `parseNullableJsonRecordOrFallback(row.structuredActionJson/diceResultJson/stateDiffJson)` 호출이 사라졌음을 확인했다.
- 후속:
  - `structuredActionJson`, `stateDiffJson`, `diceResultJson`을 직접 매핑하는 다른 service도 같은 turn-log decoder 정책으로 맞춘다.
  - `flagsJson`은 도메인별 flag store/economy/calendar/VTT map decoder로 계속 분리하고, 단순 `Record<string, unknown>`으로 읽은 뒤 깊은 필드를 바로 사용하는 경로를 줄인다.

### 2026-07-07 53차 반영 상태

- 완료:
  - `flagsJson`에서 복원되는 economy/calendar 도메인 상태 guard를 보강했다.
  - `EconomyStateRuntimeService.readEconomyStateFromFlags`는 이제 `partyStash`, `walletsBySessionCharacterId`, `shopStatesById`, `craftingProgressById`의 내부 item/wallet/shop/crafting 필드 shape까지 확인한 뒤 `EconomyState`로 인정한다.
  - `CampaignCalendarRuntimeService.readCalendarStateFromFlags`는 `scheduleProposals`, `responses`, `timeline`, `downtimeTasks`, `processedIdempotencyKeys`의 원소 필수 문자열/숫자/status enum shape를 확인한 뒤 `CampaignCalendarState`로 인정한다.
  - 이전처럼 top-level 배열/객체 여부만으로 DB flags JSON을 도메인 상태로 좁히지 않게 했다.
- 확인:
  - 편집 범위에서 `as unknown as`, `as any`, `any[]`, `JSON.parse(...) as`, `return data as T` 검색 결과가 0건임을 확인했다.
- 후속:
  - `flagsJson`의 VTT map, human GM message, transfer request, AI assist suggestion 등 다른 도메인 flag store도 같은 방식으로 “top-level record + 내부 shape guard”를 맞춘다.
  - 오래된 flags shape를 유지해야 하는 경우에는 guard에서 바로 타입을 인정하지 말고 migration/normalization 함수를 별도로 둔다.

### 2026-07-07 54차 반영 상태

- 완료:
  - human GM message flag store의 기존 `gmMessages` 배열 처리 방식을 보강했다.
  - `SessionHumanGmMessageStoreService.append`는 더 이상 `flags.gmMessages`가 배열이면 원소 shape와 무관하게 그대로 보존하지 않는다.
  - `list`와 `isMessage` guard를 추가해 `id`, `type`, `speakerName`, `content`, `createdAt`, `authorUserId` shape를 통과한 메시지만 기존 flags에서 유지하고, 손상된 legacy 원소는 다음 append 시 제거한다.
  - 변경된 정책에 맞춰 `session-human-gm-message-store.service.spec.ts`의 legacy message 기대값도 “보존”에서 “drop malformed legacy entry”로 수정했다.
- 확인:
  - `SessionHumanGmAiAssistSuggestionStoreService`, `SessionHumanGmPrivateNoteStoreService`, `CampaignArchiveRuntimeService.parseCharacterTransferRequests`는 현재 작업트리 기준 원소 guard를 이미 사용하고 있음을 확인했다.
- 후속:
  - human GM message flags를 실제 snapshot/API 응답에 노출하는 경로가 추가되면 `list(flags)`를 통해서만 읽도록 한다.
  - 다른 session flag store도 append/replace 시 기존 배열을 raw spread하지 않는지 계속 검색한다.

### 2026-07-07 55차 반영 상태

- 완료:
  - action processor의 pending ready action flags 보존 경로를 보강했다.
  - `storePendingReadyAction`은 더 이상 `pendingReadyActions` 배열에서 object이고 id만 다른 원소를 그대로 보존하지 않는다.
  - `isPendingReadyAction`, `isReadyActionTrigger`, `isReadyHeldAction` guard를 추가해 `PendingReadyAction`의 필수 문자열/숫자/enum성 필드와 trigger/held action 내부 shape를 확인한 뒤 기존 flags 원소를 유지한다.
  - 손상된 pending ready action flags 원소는 다음 ready action 저장 시 제거되고, 새 pending action만 정상 shape로 저장된다.
- 확인:
  - `SessionHumanGmAiAssistSuggestionStoreService`, `SessionHumanGmPrivateNoteStoreService`, `CampaignArchiveRuntimeService.parseCharacterTransferRequests`는 기존 flags 원소를 guard/sanitize하고 있음을 확인했다.
- 후속:
  - `combat.service`의 `parsePendingReadyActions`와 `triggeredReadyActions` 경로도 같은 guard 기준을 공유하거나 공용 ready-action flag decoder로 모은다.
  - monster limited-use flags와 spell slot override flags처럼 record 형태로 저장되는 action flags도 값 타입을 계속 좁힌다.

### 2026-07-07 56차 반영 상태

- 완료:
  - combat runtime의 pending/triggered ready action flags 복원 경로를 action processor와 같은 수준의 shape guard로 보강했다.
  - `combat.service`의 `parsePendingReadyActions`는 이제 `trigger`, `heldAction`, `originalCost`, `consumesReaction`, `createdAt`까지 확인한 원소만 `PendingReadyAction`으로 인정한다.
  - `parseTriggeredReadyActions`는 더 이상 `pending`/`triggerEvent` 존재 여부만으로 `TriggeredReadyAction`을 인정하지 않고, 내부 pending ready action과 trigger event의 필수 문자열/숫자/enum성 필드까지 확인한다.
  - movement/participant event에서 triggered ready action을 저장할 때 기존 `triggeredReadyActions` 배열을 raw spread하지 않고 `parseTriggeredReadyActions`를 통과한 원소만 보존하도록 바꿨다.
  - `combat-mapper.service`의 pending reaction prompt 매핑도 triggered ready action/pending/event 내부 shape를 검증한 뒤에만 UI 응답으로 노출하도록 맞췄다.
  - monster limited-use flags는 `parseMonsterLimitedUseExpended`에서 `usage`, `used`, `limit`, `roundNo`, `turnNo` shape가 맞는 entry만 유지하도록 좁혔다.
  - long/short rest 회복 경로의 `clearRestBoundMonsterLimitedUses`도 malformed limited-use entry를 보존하지 않고 제거하도록 맞췄다.
- 확인:
  - `triggeredReadyActions` 저장 경로의 `Array.isArray(flags[TRIGGERED_READY_ACTIONS_FLAG]) ? ... : []` raw append 패턴을 제거했다.
  - `Boolean(triggered.pending)`, `Boolean(triggered.triggerEvent)`, pending ready action 내부 `Boolean(trigger/heldAction)`식 truthy guard를 제거했다.
- 후속:
  - ready action guard가 `action-processor.service`와 `combat.service`에 중복되므로, 이후에는 공용 ready-action flag decoder/service로 추출해 기준이 갈라지지 않게 한다.
  - `combat-mapper.service`도 같은 guard를 중복 보유하게 되었으므로 공용 decoder 추출 대상에 함께 포함한다.

### 2026-07-07 57차 반영 상태

- 완료:
  - monster recharge expended flags 복원 경로도 limited-use flags와 같은 entry-level guard로 보강했다.
  - `parseMonsterRechargeExpended`는 더 이상 participant/action record를 그대로 복사하지 않고, `recharge`, `roundNo`, `turnNo` shape가 맞는 entry만 유지한다.
  - `extractMonsterRechargeValue`도 `isMonsterRechargeEntry`를 통과한 값에서만 recharge 문자열을 꺼내도록 바꿨다.
  - malformed recharge entry는 action availability 판정과 turn start recharge roll 대상에서 제외된다.
- 확인:
  - monster resource flag 파서에서 recharge/limited-use 모두 action entry 내부 필수 필드를 확인하도록 맞췄다.
- 후속:
  - ready action guard와 monster resource entry guard가 여러 서비스에 흩어지지 않도록 공용 flag decoder 추출을 검토한다.
  - spell slot override flags, rage/concentration/condition 계열 flags에도 동일하게 nested value guard가 적용되어 있는지 계속 검색한다.

### 2026-07-07 58차 반영 상태

- 완료:
  - `spellSlotsBySessionCharacterId` flags decoder를 주문 슬롯 도메인에 맞게 보강했다.
  - `combat-spell.service`, `action-processor.service`, `combat-mapper.service`의 spell slot override 복원 경로는 이제 slot key가 `1`-`9` 문자열이고 remaining 값이 0 이상의 정수일 때만 보존한다.
  - 기존 `Number.isFinite`만으로 음수/소수/의미 없는 slot key를 통과시키던 경로를 줄였다.
- 확인:
  - `decodeNumberRecord`는 능력치 JSON 등 일반 숫자 record에도 쓰이므로 그대로 두고, spell slot 전용 decoder에서만 더 엄격한 guard를 적용했다.
- 후속:
  - spell slot decoder도 세 서비스에 중복되어 있으므로, ready action/monster resource flags와 함께 공용 DB flag decoder 후보로 묶는다.
  - 저장 시점에서 slotLevel 입력 자체가 1-9 정수로 제한되는지도 계속 확인한다.

### 2026-07-07 59차 반영 상태

- 완료:
  - `any[]` adapter 예시로 조사했던 `main-command-intent-handlers.service`, `session-vtt-object-runtime.service`, `action-spell-rule.service`는 현재 작업트리 기준 실제 런타임 시그니처로 교체되어 있음을 확인했다.
  - BE/FE/shared 소스 범위의 대표 `any[]`, `as any`, `as unknown as`, `JSON.parse(...) as`, `return data as T` 검색도 현재 작업트리 기준 잔여 결과가 없음을 확인했다.
  - OAuth 응답 타입에서 decoder가 이미 보장하는 필수 필드(`KakaoTokenResponse.access_token`, `KakaoUserResponse.id`, `DiscordTokenResponse.access_token`, `DiscordUserResponse.id`)를 optional이 아닌 required로 맞췄다.
  - Kakao/Discord access token은 decoder에서 trim된 non-empty string으로 확정하고, 호출부의 중복 `!payload.access_token` 검사를 제거했다.
  - Kakao/Discord provider user id도 decoder 단계에서 필수값으로 확정되므로 로그인 흐름의 후속 `?? ""` 방어를 제거했다.
  - OAuth optional number 필드는 finite number일 때만 보존하도록 좁혔다.
- 확인:
  - `users.service.ts`에서 `payload.access_token` optional 재검사와 `kakaoUser.id ?? ""`, `discordUser.id ?? ""` 패턴이 사라졌음을 확인한다.
- 후속:
  - OAuth `response.ok` 확인 전에 decoder를 호출하는 현재 순서는 provider 오류 응답도 shape 오류로 기록될 수 있으므로, 오류 응답 body 로깅/분류 정책을 별도로 정할지 검토한다.
  - 프론트 `authToken.ts`는 현재 exp만 읽는 정책이므로, 서버와 동일한 strict JWT payload guard가 필요한지 UX 정책에 맞춰 결정한다.

### 2026-07-07 60차 반영 상태

- 완료:
  - 프론트 HTTP/WebSocket/localStorage ingress의 현재 상태를 재확인했다.
  - `httpClient.requestJson`은 typed response에 `decode` callback을 요구하는 오버로드가 들어가 있고, 주요 API service 호출부는 DTO decoder를 전달하고 있음을 확인했다.
  - `realtime.ts`는 `safeSocketOn(eventName, decoder, handler)`로 Socket.IO payload를 handler 전에 decode하고, 실패 payload는 handler로 넘기지 않음을 확인했다.
  - `storage.ts`는 stored user/session snapshot을 `parseJsonWithDecoder`와 shared decoder로 복원하며, shape 실패 시 localStorage 값을 삭제한다.
  - `BattleMapCore`의 explored vision localStorage decoder를 보강해 `version`은 0 이상 정수, `width/height/gridSize`는 양의 정수, `cells`는 string array일 때만 저장값을 인정하도록 좁혔다.
  - `decodeStoredExploredVisionCells`가 `cells: string[]`을 보장하므로 호출부의 중복 `Array.isArray`/string filter를 제거했다.
- 확인:
  - 정적 SRD fetch 경로도 `fetchStaticAsset(relativePath, decode)` 형태로 decoder를 통과한 값만 반환하고 있음을 확인했다.
- 후속:
  - localStorage snapshot schemaVersion wrapper는 63차에서 1차 적용했다. 이후 schemaVersion을 올릴 때 migration 분기를 추가한다.
  - Scenario editor dirty snapshot은 비교용 partial snapshot이라 unknown 필드를 허용하고 있으므로, 저장 payload로 직접 재사용되는 경로가 없는지 계속 확인한다.

### 2026-07-07 61차 반영 상태

- 완료:
  - AI client 응답 경계를 재확인했다.
  - `AiClient`는 endpoint별 decoder를 `postJson`에 전달하고, `response.json()` 결과를 decoder 통과 후에만 반환하며, 실패 시 `BadGatewayException`으로 차단하고 있음을 확인했다.
  - base harness response의 `latencyMs`와 `trace.latencyMs`는 0 이상 숫자, `trace.attempts`는 양의 정수일 때만 통과하도록 보강했다.
  - interpreter action/scene transition `confidence`는 0-1 범위 숫자일 때만 통과하도록 보강했다.
- 확인:
  - AI 응답 경계에 남아 있던 `return (await response.json()) as T` 패턴은 현재 작업트리 기준 사라졌고, `decode(await response.json())` 경로만 남아 있음을 확인했다.
- 후속:
  - `response.json()` 문법 오류와 decoder shape 오류가 현재 같은 `BadGatewayException` 메시지로 묶이므로, 운영 관측을 위해 내부 로그에는 구분된 reason을 남길지 검토한다.
  - AI fallback 응답 생성 함수도 같은 decoder를 통과할 수 있는 shape인지 별도 검산한다.

### 2026-07-07 62차 반영 상태

- 완료:
  - 백엔드 DTO nested validation 잔여 지점을 재확인했다.
  - scenario node의 `checkOptions/transitions/clues/vttMap/nodeMeta`는 현재 shared decoder와 DTO constraint가 붙어 있고, BE 읽기 경로도 `decodeScenarioNodeCheckOptionsConfig`, `decodeScenarioTransitionArray`, `decodeScenarioClueArray`, `decodeVttMapState`를 사용하고 있음을 확인했다.
  - `ResolveMainCommandCheckDto.diceResult`의 constraint를 보강해, 값이 제공된 경우 `rolls`가 비어 있지 않은 d20 배열이고 `total`이 finite number일 때만 통과하게 했다.
  - `MainCommandCheckResultNarrationService.sanitizeDiceResult`의 반환 타입을 `Record<string, unknown>`에서 `SanitizedMainCommandDiceResult`로 좁혔다.
  - main command check result log 경로도 sanitized dice result 타입을 유지하도록 맞춰, 검증된 굴림 결과가 다시 `unknown`으로 넓어지는 지점을 줄였다.
- 확인:
  - `effect`는 `MainCommandCheckEffectConstraint`와 서버 parser가 모두 붙어 있고, main-command/VTT check effect 타입별 필수 필드와 enum성 필드를 확인한다.
- 후속:
  - `MainCommandDiceResultConstraint`와 `sanitizeDiceResult`의 기준이 계속 함께 움직이도록 공용 decoder로 추출할지 검토한다.
  - `MainCommandCheckOptionDto` class 필드 자체는 Swagger 중심 DTO라 데코레이터가 약하므로, 입력 DTO로 쓰이는 곳이 추가되면 nested validator를 별도로 붙인다.

### 2026-07-07 63차 반영 상태

- 완료:
  - 프론트 localStorage의 schema version 저장 정책을 1차 적용했다.
  - `trpg.currentUser`, `trpg.currentSnapshot`은 새로 저장할 때 `{ schemaVersion, data }` wrapper로 저장한다.
  - 기존 브라우저에 남아 있는 legacy user/snapshot payload는 그대로 decoder를 통과해 읽을 수 있게 유지했다.
  - wrapper가 있더라도 schemaVersion이 예상 값과 다르거나 `data`가 없으면 legacy payload로 인정되지 않고, 최종 DTO decoder 실패 시 기존 정책대로 저장값을 삭제한다.
- 확인:
  - token/authMode는 단순 문자열 저장이라 schema wrapper 대상에서 제외했다.
  - snapshot은 wrapper 내부 `data`도 기존 `decodeSessionSnapshot`과 `normalizeSessionSnapshot`을 통과해야만 복원된다.
- 후속:
  - battle map explored vision처럼 기능별 localStorage payload는 이미 자체 version을 가지므로, 필요 시 공통 helper로 중복을 줄인다.
  - schemaVersion을 올릴 때 migration이 필요한 payload는 `decodeStored*`에서 version별 decoder를 분기한다.

### 2026-07-07 64차 반영 상태

- 완료:
  - 전역 강제 캐스팅/`any[]`/`JSON.parse(...) as` 계열 검색을 다시 수행했고, 현재 작업트리 기준 런타임 소스에서 직접 hit가 없음을 확인했다.
  - 프론트 숫자 입력 중 서버 main-command payload로 이어지는 map point 좌표 파서를 보강했다.
  - `parseMainCommandMapPointInput`은 더 이상 `Number(pointX)`/`Number(pointY)`를 검증과 값 생성에서 반복하지 않고, `parseFiniteMapPointCoordinate`를 통해 finite number로 한 번 좁힌 뒤 payload 좌표를 만든다.
- 확인:
  - 빈 좌표, 한쪽만 입력된 좌표, finite number가 아닌 좌표는 계속 `hasInvalidMapPointInput`으로 처리되고 서버 payload에 `mapPoint`가 실리지 않는다.
- 후속:
  - 남은 프론트 숫자 입력 중 서버 payload로 이어지는 경계는 `readClampedInteger`, `readFiniteNumber`, 허용 목록 parser처럼 목적별 helper를 통과하는지 계속 점검한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 65차 반영 상태

- 완료:
  - 공개 시나리오 목록 필터의 `minLevel`/`maxLevel` 서버 쿼리 payload가 문자열 입력값을 직접 `Number(...)`로 변환하던 경계를 제거했다.
  - `readOptionalScenarioLevelFilter`를 추가해 빈 값은 `undefined`, 1-20 범위의 정수만 query level 값으로 통과시키고, `NaN`/소수/범위 밖 값은 서버 요청에서 제외한다.
- 확인:
  - 브라우저의 `input[type=number]` 제약만 신뢰하지 않고 `buildPublicScenarioQuery` 직전에 런타임 값 검증을 수행한다.
  - 잘못된 레벨 필터 입력은 프론트 타입상 `string`이어도 API DTO에 숫자로 포함되지 않는다.
- 후속:
  - 남은 프론트 숫자 입력 중 서버 요청 payload 또는 저장 draft로 직접 이어지는 값을 계속 `readOptional*`, `readClamped*`, enum parser 형태로 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 66차 반영 상태

- 완료:
  - 시나리오 에디터가 저장된 VTT map 후보값의 `gridSize`/`width`/`height`를 `Number(value) || fallback`으로 정규화하던 경계를 제거했다.
  - `valueAsPositiveInteger`를 추가해 number/string 입력 중 finite 양수만 맵 치수로 통과시키고, 그 외 값은 기존 fallback으로 복구한다.
- 확인:
  - 외부/저장 JSON에서 들어온 `Infinity`, 음수, 객체, 빈 문자열은 더 이상 맵 치수 후보로 decode 단계에 전달되지 않는다.
  - 기존 손상 데이터 복구 정책인 기본 `gridSize=64`, `width=1280`, `height=832` fallback은 유지했다.
- 후속:
  - 남은 VTT map 편집 컨트롤의 숫자 입력은 화면 상태 전용인지 서버 저장 payload로 이어지는지 구분해, 저장 payload 경계부터 목적별 parser로 계속 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 67차 반영 상태

- 완료:
  - 캐릭터 빌드 규칙의 `normalizeIntegerValue`, `normalizeLevel`에서 `Number(value) || fallback`에 의존하던 숫자 정규화를 제거했다.
  - 두 함수 모두 타입상 number 입력이어도 `Number.isFinite`를 통과한 값만 계산에 사용하고, `NaN`/`Infinity`는 기존 fallback으로 복구한다.
- 확인:
  - 캐릭터 생성/레벨업 계산 경로에서 잘못된 숫자 값이 `Math.round`/레벨 보너스 계산으로 직접 전파되는 위험을 줄였다.
  - 기존 기본값 정책인 정수 fallback 0, 레벨 fallback 1은 유지했다.
- 후속:
  - 캐릭터 payload 직렬화 전 단계에서 ability/level/선택 index가 DTO 제약과 같은 범위로 다시 검증되는지 계속 확인한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 68차 반영 상태

- 완료:
  - `StateDiffResponseDto` decoder의 `baseVersion`/`nextVersion`을 단순 number가 아니라 non-negative finite integer로 검증하도록 좁혔다.
  - `TurnLogResponseDto.stateDiff` union 판별도 version 필드가 정수일 때만 structured state diff로 해석하게 바꿨다.
  - 프론트 JWT payload decoder에서 `exp`를 finite number일 때만 만료시각 계산에 사용하게 했다.
- 확인:
  - 서버 응답/로그의 state diff version에 `NaN`, `Infinity`, 소수, 음수가 들어오면 structured DTO로 조용히 통과하지 않는다.
  - 외부 JWT payload의 비정상 `exp` 값은 기존 정책대로 “즉시 프론트에서 만료 처리하지 않고 서버 401에 맡기는” 경로로 떨어진다.
- 후속:
  - 남은 `typeof value === "number"` 후보 중 외부 JSON/DB JSON에서 온 값은 `Number.isFinite`/`Number.isInteger`/범위 helper로 계속 축소한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 69차 반영 상태

- 완료:
  - 프론트 세션 로그의 dice overlay 복원에서 `rolls` 배열을 `typeof number`만으로 필터하던 경계를 finite number 필터로 좁혔다.
- 확인:
  - turn log metadata/diceResult가 자유형 record로 재해석되는 화면 경계에서 `NaN`/`Infinity`가 natural roll, 표시용 rolls, check result payload로 전파되지 않는다.
- 후속:
  - turn log metadata를 화면별 view model로 바꾸는 보조 함수들도 서버 decoder와 같은 숫자/nullable 규칙을 쓰는지 계속 점검한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 70차 반영 상태

- 완료:
  - 백엔드 캐릭터/세션 응답 mapper와 장비 loadout 서비스의 인벤토리 JSON 복원 경계에서 `quantity`를 단순 number가 아니라 1 이상의 정수로 검증하게 했다.
  - 저장 JSON에서 온 `weightLb`, `volumeCuFt`, `rangeFt`, `longRangeFt`, `armorClassBase`, `armorStrengthRequirement`는 0 이상 finite number일 때만 응답 DTO에 포함하고, `armorClassBonus`는 finite number일 때만 포함한다.
  - pack contents와 starting equipment item quantity도 같은 positive integer 기준으로 좁혔다.
- 확인:
  - 깨진 character inventory JSON이나 starting equipment JSON에 `NaN`, `Infinity`, 소수 quantity, 음수 quantity가 있어도 화면/장비 계산 응답으로 그대로 전파되지 않는다.
  - optional 숫자 필드는 손상 값이면 기존 복구 정책대로 생략하고, 필수 quantity가 손상된 항목은 해당 entry를 버린다.
- 후속:
  - campaign calendar/economy runtime의 재고, 가격, 작업 시간 같은 저장 JSON 숫자 필드도 같은 finite/range 기준으로 계속 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 71차 반영 상태

- 완료:
  - campaign calendar runtime이 저장된 economy state를 복원할 때 party/shop inventory `quantity`를 1 이상의 정수로, `priceGp`/`costGp`/`completedHours`를 0 이상 finite number로, `requiredHours`/`sellPriceMultiplier`를 양수 finite number로 검증하게 했다.
  - `chargesRemaining`과 `buyLimit`은 null 또는 0 이상의 정수일 때만 통과하도록 좁혔다.
  - economy state validator도 clone 기준과 맞춰 quantity/price/hour/limit 필드가 같은 범위 규칙을 통과해야 유효한 state로 인정한다.
- 확인:
  - 저장된 economy/campaign calendar JSON에 `NaN`, `Infinity`, 소수 quantity, 음수 가격/비용/시간이 있어도 런타임 상태로 그대로 복원되지 않는다.
  - 필수 숫자 필드가 손상된 inventory/shop/crafting/downtime entry는 기존 복구 정책대로 해당 entry를 버린다.
- 후속:
  - economy/campaign calendar action payload에서 DTO 검증 이후 서비스 내부로 들어오는 숫자도 저장 JSON 복원 기준과 일치하는지 계속 점검한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 72차 반영 상태

- 완료:
  - 프론트 전투 결과 메시지 formatter가 unknown result를 구조 타입으로 단언하던 경계를 제거하고 `isRecord`와 finite number helper로만 `movementDistanceFt`/`movementCostFt`를 읽게 했다.
  - 전투 행동 결과의 `attackTotal`/`damageTotal`도 finite number일 때만 표시 메시지에 포함한다.
  - 전투 주문 모델과 캐릭터 주문 선택 모델의 spell level 해석을 0-9 정수, slot level 해석을 1-9 정수 기준으로 좁혔다.
  - spell filter 문자열과 카탈로그 `rangeFt` 표시도 각각 허용 slot level과 0 이상 finite number만 사용한다.
- 확인:
  - WebSocket/HTTP decoder 이후 화면 보조 함수가 값을 다시 조합하는 경계에서 `NaN`, `Infinity`, 범위 밖 spell level이 표시/선택 로직으로 전파되지 않는다.
  - 변경 파일의 남은 `typeof number` 패턴은 helper 내부의 명시적 finite/integer/range guard뿐이다.
- 후속:
  - 전투/주문 UI에 남은 숫자 표시 로직 중 decoder 보장 값과 재해석 값의 경계를 계속 구분한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 73차 반영 상태

- 완료:
  - 세션 캐릭터 선택 시 캐릭터 인벤토리 snapshot을 복원하는 경계에서 `quantity`를 1 이상의 정수로만 인정하고, 손상 값은 기존 정책대로 1로 복구하게 했다.
  - 같은 경계의 `weightLb`/`volumeCuFt`는 0 이상 finite number, `rangeFt`/`longRangeFt`/`armorClassBase`/`armorStrengthRequirement`는 0 이상 정수, `armorClassBonus`는 finite number일 때만 보존한다.
  - 캠페인 아카이브 복원에서 캐릭터 `level`은 1-20 정수, snapshot/count/stateVersion 계열은 0 이상 정수만 사용하게 했다.
  - main command check effect parser의 map point는 x/y가 정수일 때만 통과한다.
- 확인:
  - 세션 선택, 캠페인 아카이브, main command effect처럼 서버 런타임 상태로 이어지는 보조 parser에서 `NaN`, `Infinity`, 소수 quantity/level/point가 조용히 DTO로 들어가지 않는다.
  - 기존 복구 정책은 유지한다. 인벤토리 quantity가 손상되면 1로 복구하고, 아카이브 count는 0, 레벨은 1로 복구한다.
- 후속:
  - SRD 장비/몬스터 카탈로그 로더처럼 외부 정적 데이터에서 숫자를 읽는 경계도 finite/range guard와 도메인 범위 기준을 계속 맞춘다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 74차 반영 상태

- 완료:
  - SRD 장비 policy 로더에서 `weight.lb`는 0 이상 finite number, armor class base/strength requirement는 0 이상 정수, armor class bonus는 finite number일 때만 보존한다.
  - SRD 장비 pack contents의 `quantity`는 1 이상의 정수일 때만 통과한다.
  - SRD 몬스터 엔진 로더에서 armor class/hit point average/speed ft는 양의 정수, attack to-hit은 finite integer, reach/range ft는 0 이상 정수, damage average는 0 이상 finite number일 때만 통과한다.
  - rule catalog 응답의 spell level은 0-9 정수, rangeFt는 0 이상 finite number, class starting equipment quantity는 1 이상 정수로 좁혔다.
- 확인:
  - 외부 정적 SRD 데이터에 `NaN`, `Infinity`, 소수 수량/거리/AC/HP가 들어와도 카탈로그/전투/아이템 계산 경계로 그대로 전파되지 않는다.
  - 변경 파일의 남은 `typeof number` 패턴은 helper 내부의 명시적 finite/integer/range guard 또는 기존 positive-integer helper뿐이다.
- 후속:
  - 남은 SRD seed 보조 코드와 실제 런타임 서비스의 숫자 해석 기준이 어긋나지 않는지 계속 점검한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 75차 반영 상태

- 완료:
  - 프론트 전투 인벤토리 range 계산에서 `item.rangeFt`/`item.longRangeFt`와 legacy property range는 0 이상 정수일 때만 명시 거리로 인정하도록 좁혔다.
  - terrain effect 합성의 `saveDc` 최대값 계산은 finite number만 후보로 사용해 `NaN`/`Infinity`가 terrain resolution에 섞이지 않게 했다.
  - `ActionRuleService`의 legacy inventory JSON decoder는 item `quantity`를 1 이상의 정수일 때만 보존하도록 바꿨다.
  - `CombatService`의 inventory snapshot decoder도 item `quantity`를 1 이상의 정수로 제한했다.
  - 세션 economy audit event의 party stash 분배 quantity는 1 이상의 정수일 때만 실제 inventory grant로 이어지게 했다.
  - 몬스터 action save DC는 fixed/tag 양쪽 모두 1-40 정수만 허용하도록 좁혔다.
  - 프론트 dice overlay는 socket/turn-log dice rolls에서 양의 정수만 표시 대상으로 삼고, check-required fallback DC는 5-30 정수만 신뢰하게 했다.
- 확인:
  - DB JSON, 서버 이벤트, 정적/legacy item data, 몬스터 action tag처럼 타입 선언만으로는 보장되지 않는 경계에서 소수 quantity/range/DC와 비유한 숫자가 도메인 로직으로 그대로 들어갈 가능성을 줄였다.
  - 기존 fallback 정책은 유지한다. 잘못된 range는 legacy/default range로, 잘못된 dice/check 값은 overlay 미표시 또는 기본 DC로 복구된다.
- 후속:
  - 남은 `Number.isFinite`/`typeof number` 후보 중 표시 전용 계산과 런타임 상태 변경 경계를 계속 분리해 점검한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 76차 반영 상태

- 완료:
  - scenario policy node 생성 경계에서 `checkOptionsJson`은 `decodeScenarioNodeCheckOptionsConfig`, `nodeMetaJson`은 `decodeScenarioNodeMeta`를 통과한 값만 policy service로 넘기도록 좁혔다.
  - 공용 `decodeScenarioNodeMeta`를 export해 백엔드 응답 decoder와 정책용 DB JSON 복원 경계가 같은 구조 검증을 공유하게 했다.
  - 프론트 정적 SRD class feature reference와 canonical class feature decoder의 `level`/`availableAtLevels`는 1-20 정수만 허용하도록 바꿨다.
  - 백엔드 spell level tag 해석은 character spell selection, combat spell, action spell rule 경계에서 모두 0-9 정수로 제한했다.
  - action spell character-level scaling table threshold는 1-20 정수이면서 현재 캐릭터 레벨 이하인 값만 후보로 사용한다.
- 확인:
  - scenario policy 판단에 쓰이는 DB JSON이 자유형 `unknown` identity parser를 그대로 통과하지 않고, 기존 API decoder와 동일한 최소 구조 검증을 거친다.
  - SRD/룰 카탈로그 숫자 태그가 음수, 10레벨 이상 spell level, 0레벨 character feature threshold처럼 도메인 밖 값일 때 런타임 계산에 그대로 반영되지 않는다.
- 후속:
  - 문자열 치환용 `rewriteScenarioJsonNodeReferences`의 raw JSON 순회는 도메인 객체 신뢰가 아니라 JSON tree transform 용도이므로 별도 관찰 대상으로 남긴다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 77차 반영 상태

- 완료:
  - 공용 API decoder에 `readIntegerInRange`와 `decodeNonNegativeIntegerRecord`를 추가했다.
  - campaign archive 응답의 character level은 1-20 정수, analytics/snapshot/count/stateVersion 계열은 0 이상 정수로 좁혔다.
  - campaign archive snapshot의 `characterInventoryCounts`는 finite number record가 아니라 0 이상 정수 record만 허용하도록 바꿨다.
  - character vault item과 character response의 `level`은 1-20 정수로 제한했다.
  - character level-up preview context의 downtime/inventory/spell/condition count는 0 이상 정수만 허용하도록 좁혔다.
- 확인:
  - 프론트 HTTP decoder가 서버 응답의 count/level/version 필드를 단순 `number`로 신뢰하지 않고, 화면 로직이 기대하는 정수/범위 조건을 먼저 확인한다.
  - 소수 count, 음수 count, 21레벨 character 같은 서버/DB 응답 shape mismatch가 UI 상태로 조용히 들어가는 경로를 줄였다.
- 후속:
  - session/combat/VTT decoder의 좌표·거리·HP·turn number처럼 도메인별로 정수/범위 기준이 다른 숫자 필드를 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 78차 반영 상태

- 완료:
  - 공용 API decoder에 `readPositiveInteger`, `readNullableInteger`, `readNullableNonNegativeInteger`를 추가했다.
  - session 응답의 `maxParticipants`/`maxPlayers`는 양의 정수, session list와 pagination count/page/size 계열은 0 이상 또는 양의 정수로 좁혔다.
  - session character 응답의 `level`은 1-20 정수, hit dice/HP/temp HP/speed는 0 이상 정수, max HP/AC/proficiency bonus는 양의 정수로 제한했다.
  - session scenario `sequence`, game state `version`, pending rest approval `hitDiceToSpend`는 정수 범위 guard를 통과하게 했다.
  - combat 응답의 round/turn/order, concentration round/turn, spell slot/movement resource, monster child action count, participant HP/AC/initiative/turnOrder를 정수 guard로 좁혔다.
- 확인:
  - HTTP/WebSocket decoder가 세션과 전투 상태의 정수 전제 필드를 단순 finite number로 통과시키지 않는다.
  - 소수 round/turn/order, 음수 HP/count, 0 이하 정원 같은 응답 불일치가 클라이언트 상태와 UI 계산에 조용히 들어가는 경로를 줄였다.
- 후속:
  - VTT 좌표/크기/거리처럼 실수 허용 가능성이 있는 값은 별도 기준으로 유지하고, `dc`/거리/피해량 등 도메인별 범위가 확실한 필드를 계속 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 79차 반영 상태

- 완료:
  - 공용 API decoder에 optional positive/non-negative integer와 optional/nullable integer range helper를 추가했다.
  - scenario node VTT shell과 VTT map state의 `gridSize`/`width`/`height`는 각각 16-160, 320-4000, 240-4000 정수 범위를 통과하도록 맞췄다.
  - VTT light source range, token size, fog/terrain/wall/object cell width/height, proximity event distance/reveal radius는 양의 정수로 제한했다.
  - VTT encounter scaling의 `basePartySize`/`minMonsterCount`, token `encounterPriority`, hazard `detectionRadiusCells`를 정수 guard로 좁혔다.
  - door/object `breakCheckDc`, object reveal check `dc`, hazard `detectionDc`는 1-40 정수 또는 null/undefined만 허용한다.
  - VTT object cell의 optional boolean/string-array 필드는 중복 read 대신 지역 변수 narrowing을 사용하도록 정리했다.
- 확인:
  - VTT 좌표 `x/y`처럼 실수 좌표가 자연스러운 값은 유지하고, 규칙값으로 쓰이는 거리·크기·DC·수량 계열만 런타임 범위 검증을 강화했다.
  - 손상된 VTT map JSON 또는 서버 응답의 소수/음수 DC, 0 크기 token/cell, 과도한 map 크기가 프론트 상태로 조용히 들어가는 경로를 줄였다.
- 후속:
  - combat action result의 damage/attack total, terrain damage처럼 음수 허용 여부가 도메인별로 다른 숫자는 사용처를 더 확인한 뒤 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 80차 반영 상태

- 완료:
  - action accepted 응답의 `baseStateVersion`은 0 이상 정수, rest approval `hitDiceToSpend`는 null 또는 0 이상 정수로 좁혔다.
  - main command check option `dc`는 5-30 정수만 허용하도록 바꿨다.
  - inventory use 응답의 `consumedQuantity`는 양의 정수, `healedHp`는 null 또는 0 이상 정수로 제한했다.
  - dice roll/turn-log dice result의 `rolls`는 양의 정수 배열, `modifier`/`total`은 정수, `naturalRoll`은 1-20 정수, `dc`는 1-40 정수로 좁혔다.
  - combat monster action의 `attackBonus`는 정수, range/longRange는 0 이상 정수, fixed save DC는 1-40 정수 또는 null로 제한했다.
  - combat terrain damage packet/terrain effect damage total, combat action result damage total, combat move distance/cost는 0 이상 정수로 좁혔다.
  - combat action result attack total은 null 또는 정수로 제한했다.
- 확인:
  - 전투/행동 응답에서 소수 주사위, 음수 피해량, 소수 이동 비용, 범위 밖 DC가 프론트 상태로 들어가는 경로를 줄였다.
  - modifier/attack bonus처럼 음수가 가능한 필드는 non-negative가 아니라 integer guard로만 좁혀 도메인 의미를 보존했다.
- 후속:
  - class/race/rule catalog decoder의 remaining `readNumber` 필드 중 count/level/range 성격이 명확한 값들을 계속 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 81차 반영 상태

- 완료:
  - auth token `expiresIn`은 양의 정수로 제한했다.
  - class spellcasting progression의 `classLevel`은 1-20 정수, known spell/cantrip count는 null 또는 0 이상 정수로 좁혔다.
  - class starting equipment quantity는 양의 정수, starting spell/cantrip/skill choice count는 0 이상 정수로 제한했다.
  - race `baseSpeed`는 양의 정수로 제한했다.
  - rule catalog reference의 `spellLevel`은 0-9 정수, `rangeFt`는 0 이상 정수로 좁혔다.
  - scenario validation report의 issue/node/policy count와 scenario `revisionNumber`/`estimatedMinutes`/`forkCount`는 0 이상 정수로 제한했다.
  - scenario `startLevel`/`recommendedEndLevel`은 1-20 정수 범위를 통과하게 했다.
  - scenario/character avatar asset의 width/height는 null 또는 양의 정수, fileSizeBytes는 0 이상 정수로 좁혔다.
  - scenario moderation queue의 report/appeal/action count는 0 이상 정수만 허용한다.
- 확인:
  - catalog/scenario/auth 응답에서 count/level/range/file-size 계열이 단순 finite number로 통과하지 않는다.
  - 정적/서버 응답의 음수 count, 소수 레벨, 0 이하 장비 수량, 잘못된 asset size가 프론트 상태로 들어가는 경로를 줄였다.
- 후속:
  - character ability score/proficiency/HP, turn log number, 남은 rule/detail DTO의 숫자 필드를 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 82차 반영 상태

- 완료:
  - character/session character 공용 ability score decoder는 각 능력치를 1-30 정수로 제한한다.
  - character inventory와 pack/display pack contents의 `quantity`는 양의 정수로 좁혔다.
  - inventory weight/volume은 0 이상 finite number, range/longRange/armor base/strength requirement는 0 이상 정수, armor bonus는 정수로 제한했다.
  - turn log `turnNumber`는 양의 정수로 제한했다.
  - character response의 `proficiencyBonus`, `maxHp`, `armorClass`는 양의 정수, `speed`는 0 이상 정수로 좁혔다.
  - scenario node check option `dc`는 1-40 정수로 좁히고, 공용 decoder의 generic `optionalNumberField` helper를 제거했다.
- 확인:
  - character/inventory/turn-log 응답에서 소수 능력치, 0 이하 수량, 음수 weight/range/HP, 범위 밖 check DC가 타입만 믿고 통과하는 경로를 줄였다.
  - armor bonus처럼 음수가 가능할 수 있는 값은 non-negative가 아니라 integer guard만 적용했다.
- 후속:
  - 남은 `readNumber` 호출 중 좌표/일반 수치로 유지해야 하는 값과 더 좁힐 수 있는 값의 분류를 계속한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 83차 반영 상태

- 완료:
  - race ability increase는 각 능력치별 0-4 정수만 허용하도록 좁혔다.
  - 공용 API decoder에서 사용처가 사라진 `readNullableNumber` helper를 제거했다.
- 확인:
  - 공용 API decoder의 직접 `readNumber` 호출은 helper 내부와 VTT 좌표 `x/y` 계열만 남았다.
  - VTT 좌표는 드래그/배치/캔버스 계산에서 실수 좌표가 자연스러운 값이라 이번 범위에서는 finite number 검증으로 유지한다.
- 후속:
  - 남은 좌표성 number를 정수 grid cell로 강제해야 하는 특정 경로가 있는지 VTT 저장/렌더링 정책과 함께 별도 점검한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 84차 반영 상태

- 완료:
  - API error envelope의 `statusCode`는 단순 finite number가 아니라 100-599 범위의 정수만 수용하도록 좁혔다.
  - 사용처 없는 `decodeUnknownRecord` export를 제거해 공용 API decoder에 raw record passthrough 탈출구가 남지 않게 했다.
  - `decodeUnknownRecord` 제거 후 사용처가 사라진 `passthroughRecord` runtime guard도 제거했다.
- 확인:
  - 현재 repo 내부에서 `decodeUnknownRecord` 참조는 제거됐다.
  - 공용 runtime guard의 generic record 진입점은 검증 실패 시 예외를 내는 `readRecord`만 남았다.
  - API error envelope의 `statusCode`는 잘못된 값이 들어와도 error display 자체를 깨지 않도록 `undefined`로 흡수한다.
- 후속:
  - 서버 error response가 문자열 상태 코드나 비표준 status code를 내려주는 실제 경로가 있는지 별도 integration 확인이 필요하다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 85차 반영 상태

- 완료:
  - 정적 SRD item catalog decoder의 optional nullable string property 조립에서 `as Pick<StaticItemCatalogEntry, K>` 단언을 제거했다.
  - 각 optional 필드를 먼저 `readOptionalNullableString`으로 검증한 뒤, 필드별 조건부 spread로 `StaticItemCatalogEntry`를 구성하게 했다.
- 확인:
  - item catalog의 `kind`, `costRaw`, `weightRaw`, `equipmentCategory`, `armorCategory`, `weaponCategory`, `damageRaw`, `damageType`, `rangeRaw`, `propertiesRaw`, `rarity`, `sourceTable`은 여전히 string/null/undefined만 허용한다.
  - computed property 단언 제거로 정적 JSON decoder 경계에서 타입 시스템 우회 지점이 하나 줄었다.
- 후속:
  - 남은 `as CSSProperties`, DOM event `as Node`, React ref cast처럼 UI/DOM 타입 보정 성격의 단언은 외부 JSON/저장소/서버 응답 경계와 분리해 낮은 우선순위로 관리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 86차 반영 상태

- 완료:
  - main command autocomplete의 `event.key as MainCommandAutocompleteNavigationKey` 단언을 제거했다.
  - 브라우저 keyboard event key를 `isMainCommandAutocompleteNavigationKey` guard로 좁힌 뒤 navigation index 계산에 넘기도록 바꿨다.
- 확인:
  - 허용 navigation key는 `ArrowDown`, `ArrowUp`, `Home`, `End` 네 값으로 유지된다.
  - 브라우저 이벤트 문자열이 union 타입으로 강제 단언되어 내부 navigation 로직으로 들어가는 경로를 제거했다.
- 후속:
  - DOM/ref/CSS presentation 보정 cast는 남아 있지만, 런타임 외부 데이터 신뢰 문제와 직접 연결되는 keyboard event cast는 우선 제거했다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 87차 반영 상태

- 완료:
  - human GM runtime과 reveal 서비스의 `gmTurnLog as HumanGmOverrideLogResult | null` 단언을 제거했다.
  - `gmTurnLog` 지역 변수의 기존 `HumanGmOverrideLogResult | null` 타입을 그대로 사용해 realtime emit 분기를 처리하게 했다.
- 확인:
  - `createHumanGmOverrideTurnLog` 반환 타입은 이미 `HumanGmOverrideLogResult`로 추론되고 있었고, nullable 여부도 지역 변수 선언에 반영되어 있었다.
  - 불필요한 재단언 제거로 백엔드 세션 realtime emit 경로의 타입 우회 지점이 줄었다.
- 후속:
  - 남은 `as const` 리터럴 보정은 도메인 discriminated union 구성용인지, 외부 입력을 숨기는 단언인지 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 88차 반영 상태

- 완료:
  - `useSession`의 turn log dice overlay 보조 reader를 finite number 허용에서 integer 허용으로 좁혔다.
  - `modifier`, `total`, `dc`, `targetArmorClass`, `detectionDc` fallback 추출이 `Number.isInteger`를 통과한 값만 사용하게 했다.
- 확인:
  - shared API decoder의 dice result 정책(`rolls` 양의 정수 배열, `modifier/total` 정수, `dc` 정수 범위)과 프론트 overlay fallback reader의 기본 전제가 맞춰졌다.
  - 손상된 turn log metadata에 소수 total/DC가 들어와도 dice overlay target/total 계산에 그대로 반영되지 않는다.
- 후속:
  - `targetArmorClass`/`detectionDc`의 세부 범위는 structured action 종류별 계약이 더 명확해지면 `1-40` 또는 AC 전용 범위로 추가 축소한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 89차 반영 상태

- 완료:
  - backend command parser의 `parseOptionalPositiveInteger`가 이름과 달리 `0`을 허용하던 문제를 수정했다.
  - 수량, spell slot, save DC, hit dice spend처럼 입력값이 양의 정수여야 하는 경로는 직접 입력된 `0`을 거부한다.
  - target distance와 ready range처럼 `0`이 의미 있을 수 있는 경로는 `parseOptionalNonNegativeInteger`로 분리했다.
- 확인:
  - 입력이 없을 때 쓰는 fallback `0`은 유지하되, 사용자가 명시적으로 `0`을 입력한 양수 도메인 값은 더 이상 통과하지 않는다.
  - helper 이름과 런타임 검증 조건이 맞아, 타입/이름만 보고 양수라고 오해할 수 있는 지점이 줄었다.
- 후속:
  - spell slot은 현재 positive integer까지만 보장하므로, 실제 슬롯 레벨 정책에 맞춰 `1-9` 범위 guard로 더 좁힐 수 있다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 90차 반영 상태

- 완료:
  - backend command parser에 `parseOptionalIntegerInRange`를 추가했다.
  - `cast_spell`/`cast_area_spell`의 명시 spell slot 입력은 1-9 정수만 허용하도록 좁혔다.
  - area spell save DC 입력은 1-40 정수만 허용하도록 좁혔다.
- 확인:
  - spell slot이 10 이상이거나 save DC가 도메인 범위를 벗어난 문자열 입력은 action rule 내부로 들어가기 전에 400으로 거부된다.
  - 이전 89차 후속으로 남겼던 spell slot 범위 축소를 command parser 경계에서 반영했다.
- 후속:
  - 일반 check `parseDc`의 범위는 현재 호출별 fallback이 달라, main command/check option 정책과 맞춰 별도 축소한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 91차 반영 상태

- 완료:
  - backend command parser의 일반 `parseDc`가 호출부별 min/max 범위를 받도록 바꿨다.
  - `/check` DC는 main command check option 정책과 맞춰 5-30 정수만 허용한다.
  - `/attack` target DC/AC와 `/save` DC는 dice/DC 계열 정책과 맞춰 1-40 정수만 허용한다.
- 확인:
  - 소수 DC, 음수 DC, 과도한 DC가 parsed command로 들어가기 전에 400으로 거부된다.
  - 입력이 없을 때 사용하는 기존 fallback 값은 유지했다.
- 후속:
  - `/attack`의 `dc` 명칭은 실제로 target AC에 가까우므로, 타입 이름을 별도 필드로 분리할지 action rule 쪽 계약과 함께 검토한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 92차 반영 상태

- 완료:
  - VTT object runtime에 `readIntegerInRange` helper를 추가했다.
  - hazard disarm check의 `detectionDc`는 5-30 정수일 때만 사용하고, 아니면 기존 fallback 15를 사용한다.
  - 자동 hazard detection의 `detectionDc`는 `VTT_CHECK_DC_MIN`-`VTT_CHECK_DC_MAX` 범위 정수일 때만 사용하고, 아니면 기존 fallback 12를 사용한다.
- 확인:
  - DB/맵 JSON에서 온 `hazard.detectionDc`가 문자열, 소수, 범위 밖 숫자인 경우 `Number(...) || fallback`로 조용히 보정되어 쓰이지 않는다.
  - 손상된 VTT hazard JSON은 기존 fallback 정책으로 복구되지만, 유효값 인정 기준은 정수/범위 guard로 명확해졌다.
- 후속:
  - proximity event distance/reveal radius, hazard detection radius처럼 `Number(...)`로 복원되는 남은 VTT 수치도 정수/범위 기준을 계속 분리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 93차 반영 상태

- 완료:
  - VTT object manual/proximity reveal의 `revealRadiusFeet`를 5-500 정수일 때만 사용하도록 좁혔다.
  - VTT proximity event의 `trigger.distanceFeet`를 0-500 정수일 때만 사용하도록 좁혔다.
  - 문자열/소수/범위 밖 값은 기존 fallback 정책대로 각각 5 또는 0을 사용한다.
- 확인:
  - `Number(event.trigger?.distanceFeet)`와 `Number(event.effect?.revealRadiusFeet)` 직접 복원 경로를 제거했다.
  - 손상된 VTT event JSON이 proximity/reveal 계산에 유효 설정처럼 반영되는 경로를 줄였다.
- 후속:
  - hazard detection radius와 map normalization 내부의 남은 `Number(...) || fallback` 경로도 같은 방식으로 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 94차 반영 상태

- 완료:
  - VTT object runtime의 `hazard.detectionRadiusCells`를 1-20 정수일 때만 사용하도록 좁혔다.
  - VTT object runtime의 reveal check `dc`도 `VTT_CHECK_DC_MIN`-`VTT_CHECK_DC_MAX` 범위 정수일 때만 사용하도록 좁혔다.
  - VTT map normalization의 reveal check `dc`, proximity `distanceFeet`/`revealRadiusFeet`, hazard `detectionRadiusCells`/`detectionDc`도 정수/범위 helper로 통일했다.
  - normalization 단계의 문자열/소수/범위 밖 VTT 수치는 기존 fallback 값으로 복구하되 유효 설정으로 인정하지 않는다.
- 확인:
  - runtime과 normalization에서 hazard/proximity 수치 정책이 서로 어긋나지 않게 됐다.
  - 손상된 VTT map JSON의 DC/radius/distance 값이 `Number(...) || fallback` 경유로 조용히 통과하는 경로를 추가로 줄였다.
- 후속:
  - token 좌표, encounter scaling, structure cell geometry처럼 실수 좌표/정수 크기 정책이 섞인 남은 VTT normalization 수치를 별도로 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 95차 반영 상태

- 완료:
  - VTT map normalization의 token `encounterPriority`를 정수 범위 helper로 좁혔다.
  - encounter scaling의 `basePartySize`와 `minMonsterCount`를 각각 1-12, 0-80 정수일 때만 사용하도록 좁혔다.
  - `toVttMapOrNull`의 root `gridSize`/`width`/`height` fallback도 정수 범위 helper로 통일했다.
- 확인:
  - 문자열/소수 map size, encounter count, priority 값이 `Number(...) || fallback` 경유로 유효 설정처럼 인정되지 않는다.
  - 좌표와 structure geometry는 실수 좌표 가능성이 있어 이번 범위에서는 유지하고, 정수 성격이 분명한 값만 좁혔다.
- 후속:
  - structure cell width/height와 shape cell geometry는 grid 정책을 확인한 뒤 정수 cell 값으로 강제할지 별도 판단한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 96차 반영 상태

- 완료:
  - VTT map normalization의 terrain/wall/door/object cell `width`/`height`를 정수 범위 helper로 좁혔다.
  - object `shapeCells`의 `width`/`height`도 정수 범위 helper로 좁혔다.
  - fallback은 기존처럼 `gridSize`를 사용하되, 문자열/소수/범위 밖 크기는 유효 설정으로 인정하지 않는다.
- 확인:
  - shared VTT API decoder의 cell/shape `width`/`height` positive integer 정책과 normalization의 복원 기준을 맞췄다.
  - 좌표 `x/y`는 드래그/캔버스 실수 좌표 가능성이 있어 이번 범위에서는 유지했다.
- 후속:
  - 좌표 `x/y`를 정수 grid cell로 강제해야 하는 저장 경로가 있는지는 VTT 렌더링/드래그 정책과 함께 별도 확인한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 97차 반영 상태

- 완료:
  - combat stats의 encounter scaling 소비부에서 `basePartySize`와 `minMonsterCount`를 정수 범위 helper로 좁혔다.
  - `basePartySize`는 1-12 정수, `minMonsterCount`는 현재 monster token 수를 상한으로 하는 0 이상 정수일 때만 사용한다.
- 확인:
  - VTT map normalization에서 정리한 encounter scaling 정책이 실제 전투 스케일링 계산에서도 같은 기준으로 적용된다.
  - 문자열/소수 encounter scaling 값이 combat scaling 로직에서 `Number(...) || fallback`로 조용히 유효값이 되는 경로를 제거했다.
- 후속:
  - monster stat parsing의 HP/AC 추출은 SRD raw text parser 성격이므로, 외부 JSON trust 문제와 분리해 별도 룰 파서 품질 항목으로 관리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 98차 반영 상태

- 완료:
  - VTT 자동 hazard detection의 WIS 능력치 복원 경로에서 `Number(abilities.wis) || 10` fallback을 제거했다.
  - `abilities.wis`는 1-30 정수일 때만 능력치로 사용하고, 문자열/소수/범위 밖 값은 기본값 10으로 처리한다.
- 확인:
  - character ability JSON이 generic number record로 파싱되더라도, 판정 modifier 계산 직전에 D&D ability score 의미 범위가 다시 검증된다.
  - 손상된 WIS 값이 `Number(...)` 강제 변환으로 조용히 유효 modifier가 되는 경로를 차단했다.
- 후속:
  - 다른 ability score 소비부도 generic finite number와 도메인 범위 검증이 섞여 있지 않은지 같은 기준으로 확인한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 99차 반영 상태

- 완료:
  - quick character HP 기본값 계산에서 `Number(hitDie.replace(...)) || 6` fallback을 제거하고, `d6/d8/d10/d12` 허용 목록으로 hit die max를 복원하도록 바꿨다.
  - FE static SRD class feature level 복원에서 `Number.parseInt(...) || 0`을 제거하고, `1-20` 정수 문자열만 level로 인정하도록 좁혔다.
- 확인:
  - 비정상 hit die 문자열이 임의 숫자 HP 계산으로 이어지지 않고 `d6` 기준 fallback으로 처리된다.
  - `1abc`처럼 `parseInt`가 부분 성공시키는 class feature level 값은 더 이상 유효 level로 취급되지 않는다.
- 후속:
  - static SRD의 speed parsing처럼 raw text parser 성격이 남은 숫자 추출은 정적 seed/표시용인지, 서버 payload 경계인지 계속 구분한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 100차 반영 상태

- 완료:
  - VTT map normalization의 token `x/y` 복원에서 `Number(token.x) || 0` coercion fallback을 제거했다.
  - structure/object shape cell `x/y` 복원도 `Number(cell.x)` 대신 finite number guard를 통과한 값만 clamp하도록 맞췄다.
- 확인:
  - 문자열 숫자 좌표가 서버 정규화 과정에서 조용히 numeric coordinate로 승격되는 경로를 제거했다.
  - 정상 number 좌표는 기존과 동일하게 map bounds 안으로 clamp된다.
- 후속:
  - VTT 좌표 정책은 실수 좌표 허용을 유지하되, grid cell 단위로 강제해야 하는 저장 경로가 생기면 별도 integer guard를 적용한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 101차 반영 상태

- 완료:
  - 프론트 session state flags projection에서 `flags.vttMap`을 `unknown` 그대로 loader로 넘기지 않고, `decodeVttMapState`를 통과한 `VttMapStateDto | null`로 좁혔다.
  - `usePlayScenarioMapLoader`의 `snapshotVttMap` 입력 타입을 `unknown`에서 `VttMapStateDto | null`로 바꾸고, 중복 decode/예외 기반 fallback을 제거했다.
- 확인:
  - 손상된 snapshot VTT map은 projection 단계에서 `null`로 정리되어, 명시적 VTT map load fallback 경로로만 이어진다.
  - loader는 더 이상 외부 flags payload shape를 직접 신뢰하거나 재해석하지 않는다.
- 후속:
  - 같은 projection hook의 `economy`와 `campaignCalendar`도 현재 `object | null` 수준이므로, panel view 타입과 맞는 decoder로 좁히는 작업을 이어간다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 102차 반영 상태

- 완료:
  - 프론트 session state flags projection의 `economy`와 `campaignCalendar`를 `object | null` passthrough에서 패널 view가 실제로 읽는 필드 decoder로 좁혔다.
  - economy stash/wallet/shop/crafting 항목과 calendar schedule/timeline/downtime 항목은 필수 문자열과 finite number를 통과한 경우에만 화면 상태로 전달한다.
- 확인:
  - 손상된 `flags.economy`/`flags.campaignCalendar` 객체가 패널의 `Object.values`, 배열 순회, 숫자 표시 경로로 그대로 흘러가지 않는다.
  - 부분 손상된 배열 항목은 전체 패널을 깨지 않고 해당 항목만 제외된다.
- 후속:
  - projection hook의 decoder 타입과 패널-local view 타입이 구조적으로 맞으므로, 장기적으로는 view 타입을 별도 model 파일로 분리해 중복을 줄인다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 103차 반영 상태

- 완료:
  - `completedCombatNodeIds`도 session state flags projection 단계에서 `Set<string>`으로 복원하도록 옮겼다.
  - `usePlayNodeModeProjection`은 더 이상 `Record<string, unknown>` flags 전체를 받지 않고, 이미 검증된 `ReadonlySet<string>`만 받는다.
  - raw flags를 직접 읽던 `getCompletedCombatNodeIds(flags)` helper를 제거했다.
- 확인:
  - combat node mode 계산 hook이 외부 snapshot flags 구조에 직접 의존하지 않는다.
  - 손상된 `completedCombatNodeIds` 값은 projection 단계에서 빈 set 또는 문자열 항목만 남긴 set으로 정리된다.
- 후속:
  - `state.flags`를 직접 받는 남은 hook/utility가 있으면 실제 사용 필드 단위 projection으로 계속 분리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 104차 반영 상태

- 완료:
  - `adjustHumanGmCombatHp`만 `decodeSessionSnapshot` 이후 `normalizeSessionSnapshot`을 거치지 않고 `SessionSnapshotDto`를 반환하던 계약 불일치를 수정했다.
  - HUMAN GM scene/combat admin hook의 snapshot map 추출 인자를 `unknown`에서 정규화된 `SessionSnapshot`으로 좁혔다.
- 확인:
  - HUMAN GM API의 session snapshot 반환 경로가 모두 같은 정규화 계약을 따른다.
  - hook 내부에서 `isRecord(snapshot.state.flags)`로 snapshot 전체 shape를 다시 추측하지 않고, HTTP decoder가 보장한 snapshot 타입 위에서 `vttMap`만 별도 decode한다.
- 후속:
  - `state.flags.vttMap` 추출 helper가 여러 hook에 중복되므로, 다음 정리 시 session snapshot projection 유틸로 모아 중복을 줄인다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 105차 반영 상태

- 완료:
  - 백엔드 `completedCombatNodeIds` flags 복원 로직을 `readCompletedCombatNodeIds` helper로 분리했다.
  - combat start guard, main command screen type projection, progress evidence, transition evaluator가 각자 `Array.isArray(...).filter(string)`를 반복하지 않고 같은 helper를 사용하도록 맞췄다.
- 확인:
  - `completedCombatNodeIds`가 손상된 flags JSON에서 오더라도 문자열 배열 항목만 도메인 로직으로 전달되는 정책이 한 곳으로 모였다.
  - combat 재시작 방지, main command 화면 전환, transition requirement 평가가 동일한 런타임 guard를 공유한다.
- 후속:
  - `partyDefeated`, `vttMap`, ready action flags처럼 여러 서비스가 직접 읽는 flags도 같은 방식으로 읽기 helper를 도메인별로 모은다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 106차 반영 상태

- 완료:
  - 프론트 session state flags의 `vttMap`과 `completedCombatNodeIds` 복원을 `sessionStateFlags` 유틸로 분리했다.
  - `useSession`, HUMAN GM scene/combat admin hook, session state flags projection이 같은 `readVttMapFromSessionFlags` helper를 사용하도록 맞췄다.
  - `completedCombatNodeIds`의 프론트 복원도 `readCompletedCombatNodeIdsFromSessionFlags`로 모아 raw flags 직접 읽기를 줄였다.
- 확인:
  - 손상된 `flags.vttMap`은 모든 연결 지점에서 `VttMapStateDto | null`로 정리된다.
  - 실시간 payload decoder와 시나리오 에디터 map decoder처럼 각자 외부 입력 경계인 decode는 유지하고, session snapshot flags projection 중복만 제거했다.
- 후속:
  - `partyDefeated`, auth/localStorage debug flag처럼 단순 boolean/literal flags도 장기적으로 같은 projection 유틸에 모을지 판단한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 107차 반영 상태

- 완료:
  - FE `getSessionState`가 `/sessions/:id/state` 응답을 `Record<string, unknown>`로 받던 경계를 `GameStateResponseDto`로 좁혔다.
  - shared `decodeGameStateResponse`를 export하고, `getSessionState`가 해당 decoder를 사용하도록 연결했다.
- 확인:
  - 프론트 session API의 직접 `requestJson<Record<string, unknown>>` 호출이 제거됐다.
  - 서버 controller의 `GameStateResponseDto` 응답 계약과 FE decoder가 같은 shape를 사용한다.
- 후속:
  - 백엔드 controller의 `ApiResponse<Record<string, unknown>>` 목록 응답은 실제 pagination envelope DTO로 승격할 수 있는지 별도로 확인한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 108차 반영 상태

- 완료:
  - 백엔드 session list와 my sessions controller 반환 타입을 `ApiResponse<Record<string, unknown>>`에서 `ApiResponse<PaginatedResponse<SessionListItemResponseDto>>`로 좁혔다.
  - FE가 이미 `decodePaginatedResponse(..., decodeSessionListItem)`로 기대하던 pagination envelope와 백엔드 타입 계약을 맞췄다.
- 확인:
  - 비테스트 백엔드 controller 범위의 직접 `ApiResponse<Record<string, unknown>>` 반환 타입이 제거됐다.
  - 목록 응답의 `content/page/size/totalElements/totalPages` 구조가 타입 시스템에 드러난다.
- 후속:
  - Swagger `@ApiOkResponse`는 generic pagination envelope를 런타임 decorator로 완전히 표현하지 못하므로, 필요하면 별도 paginated DTO class를 만든다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 109차 반영 상태

- 완료:
  - session revealable content lookup 반환 타입을 `Promise<Record<string, unknown>>`에서 `RevealableScenarioClue`로 좁혔다.
  - `RevealableScenarioClue`는 `decodeScenarioClueArray`를 통과한 `ScenarioClueDto`에 source node id를 덧붙인 타입으로 정의했다.
  - `SessionsService.findSessionScenarioRevealable` wrapper도 같은 반환 타입을 쓰도록 맞췄다.
- 확인:
  - HUMAN GM reveal 경로가 임의 record가 아니라 scenario clue decoder를 통과한 단서 payload를 snapshot으로 저장한다는 사실이 타입에 드러난다.
  - `Promise<Record<string, unknown>>`로 남아 있던 revealable lookup 반환 경계가 제거됐다.
- 후속:
  - 저장된 reveal snapshot JSON은 과거 데이터 호환 때문에 `Record<string, unknown>`으로 복원되므로, 새 snapshot 저장 경로부터 명명 DTO로 더 좁힐 수 있는지 별도 확인한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 110차 반영 상태

- 완료:
  - VTT object runtime의 현재 노드 clue snapshot map을 `Map<string, Record<string, unknown>>`에서 `Map<string, ScenarioClueDto>`로 좁혔다.
  - `decodeScenarioClueArray`를 통과한 clue DTO를 reveal 저장 직전까지 명명 타입으로 유지하도록 했다.
  - clue/item/event가 함께 들어가는 generic reveal 저장 경계에서는 `toRecordSnapshot` 헬퍼를 통해서만 `Record<string, unknown>` snapshot으로 변환하도록 모았다.
- 확인:
  - VTT object reveal 경로와 hazard 자동 reveal 경로가 같은 clue snapshot 변환 규칙을 사용한다.
  - 새 clue snapshot을 만드는 경로에서는 decoder 결과가 즉시 임의 record로 넓어지지 않는다.
- 후속:
  - 저장된 `sessionReveal.snapshotJson` 복원 경로는 legacy 데이터 호환 때문에 여전히 `Record<string, unknown>` map을 사용한다.
  - persisted reveal snapshot을 좁히려면 clue/item/event별 migration-compatible decoder를 별도로 두고, 과거 row의 최소 표시 필드를 보존하는 fallback 정책을 먼저 정해야 한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 111차 반영 상태

- 완료:
  - 저장된 clue reveal snapshot 복원 결과를 `Map<string, Record<string, unknown>>`에서 `Map<string, RevealedClueSnapshot>`으로 좁혔다.
  - `RevealedClueSnapshot`은 플레이어 표시 경로가 실제로 사용하는 `id`, `title`, `handoutText`, `playerText`, `importance`만 보존한다.
  - legacy `snapshotJson`은 먼저 record fallback으로 읽되, `toRevealedClueSnapshot`에서 문자열 필드만 추출해 플레이어 DTO 매핑으로 넘기도록 했다.
- 확인:
  - `mapPlayerScenarioNode`, `getPublicClueSummariesForUser`, `mapPlayerScenarioClue`가 더 이상 persisted clue snapshot을 임의 record로 받지 않는다.
  - 과거 row가 깨져 있거나 필드 타입이 달라도 표시 가능한 문자열 필드만 통과하고, content id fallback은 유지된다.
- 후속:
  - item/event reveal snapshot은 아직 generic storage 경계로 남아 있다. 화면 표시 요구가 확정되면 `RevealedItemSnapshot`, `RevealedEventSnapshot`처럼 분리한다.
  - `mapPlayerScenarioClue`의 fallback title/id 정책은 보존했지만, 장기적으로는 저장 시점에서 player-visible text가 없는 clue reveal을 막는 검증을 추가할 수 있다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 112차 반영 상태

- 완료:
  - clue reveal policy 판정 함수들의 입력을 `Record<string, unknown>`에서 `ScenarioClueDto`로 좁혔다.
  - `recordCurrentNodeCluesByPolicy`와 node visit 자동 reveal 경로가 decoder를 통과한 clue DTO를 판정에 그대로 사용하도록 했다.
  - 저장 boundary로 넘길 때만 `toScenarioClueRecord`를 통해 snapshot record로 변환하도록 했다.
- 확인:
  - `shouldRevealOnNodeVisit`, `getRevealPolicyMode`, `shouldRevealClueForPolicy`, `matchesDiscoverySource`가 더 이상 clue를 임의 record로 받지 않는다.
  - `ScenarioClueDto`에 이미 있는 `source`, `discoverySource`, `revealPolicy` 필드를 기준으로 policy와 discovery matching을 수행한다.
- 후속:
  - `recordSessionReveal`의 `contentKind`/`scope`/`snapshot`은 clue/item/event를 모두 받는 저장 boundary라 아직 넓다. 다음 단계에서는 discriminated params union으로 `contentKind`별 snapshot 타입을 분리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 113차 반영 상태

- 완료:
  - `recordSessionReveal` 저장 입력을 `RecordSessionRevealParams` discriminated union으로 분리했다.
  - `contentKind`는 `"clue" | "item" | "event"`, `scope`는 `"party" | "user" | "character"`로 좁혔다.
  - clue/item/event snapshot을 각각 `RevealClueSnapshot`, `RevealItemSnapshot`, `RevealEventSnapshot`으로 분리했다.
  - `SessionsService`와 VTT object runtime wrapper가 같은 `RecordSessionRevealParams` 타입을 참조하도록 해 중복된 `string`/`Record` params 선언을 제거했다.
  - `RevealSessionContentDto`와 `SessionRevealResponseDto`의 `contentKind`, `scope` 선언도 validator와 같은 literal union으로 맞췄다.
- 확인:
  - VTT object reveal 입력은 `VttObjectRevealInput` union을 유지하고, 저장 호출 시 `recordVttObjectReveal`에서 content kind별 snapshot 타입을 보존한다.
  - DB row에서 올라오는 reveal response 값은 `toRevealContentKind`, `toRevealScope`를 통과해 잘못된 저장값을 조용히 DTO로 위장하지 않는다.
  - 수동 GM reveal 경로는 실제 구현이 scenario clue lookup만 지원하므로, item/event 요청을 명시적 `BadRequestException`으로 막아 타입 계약과 런타임 동작을 일치시켰다.
- 후속:
  - `SessionRevealResponseDto`를 소비하는 프론트 API decoder가 별도 경로로 추가되면 같은 literal union 검증을 적용한다.
  - `RevealEventSnapshot.trigger/effect`는 VTT event DTO 타입으로 좁혔지만, 저장 전 JSON-compatible 검증을 더 엄격히 하려면 event snapshot decoder를 별도로 둔다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 114차 반영 상태

- 완료:
  - 공유 API decoder에 `decodeSessionRevealResponse`를 추가했다.
  - `SessionRevealResponseDto.contentKind`는 `"clue" | "item" | "event"`, `scope`는 `"party" | "user" | "character"` literal union으로 검증한다.
  - `recipientId`와 `reason`은 nullable string으로 검증하고, `revealedAt`, `revealedBy` 등 필수 문자열 필드는 누락/타입 불일치를 에러로 처리한다.
  - 프론트 전용 export surface인 `shared-types/src/frontend.ts`에도 decoder를 노출했다.
- 확인:
  - `shared-types/src/index.ts`는 `utils/api-decoders`를 wildcard export하므로 별도 추가 없이 백엔드/공용 import에서도 decoder가 노출된다.
  - 현재 FE에는 GM reveal API 클라이언트가 없어 직접 사용처는 없지만, 향후 `requestJson<SessionRevealResponseDto>` 경로가 추가될 때 raw generic 응답 대신 사용할 수 있는 decoder가 준비됐다.
- 후속:
  - FE에 수동 reveal API 호출이 추가되면 반드시 `decodeSessionRevealResponse`를 `requestJson`의 `decode` 옵션으로 연결한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 115차 반영 상태

- 완료:
  - FE 서비스의 `requestJson` 호출을 정적 스캔해, `decode`가 없는 호출은 현재 `void` 응답 경로뿐임을 확인했다.
  - `requestJson<void>`가 204가 아닌 성공 응답에서 빈 body를 `response.json()`으로 파싱하다 실패할 수 있는 문제를 수정했다.
  - decode가 없는 void 경로는 `response.text()`로 body를 소모한 뒤 `undefined`를 반환하도록 바꿨다.
- 확인:
  - VTT map, combat, scenario, human GM, auth, character 주요 응답 경로는 기존 공유 decoder를 `requestJson`의 `decode` 옵션으로 연결하고 있다.
  - localStorage의 user/session snapshot과 battle-map explored vision cells, scenario editor dirty snapshot은 이미 `parseJsonWithDecoder` 기반 복원 경로를 사용한다.
- 후속:
  - `requestJson<T>`에서 decoder 없이 non-void 타입을 호출하는 회귀를 막으려면 lint rule 또는 정적 검증 스크립트를 추가한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 116차 반영 상태

- 완료:
  - WebSocket 수신 경계의 `turn.log.created` payload가 로컬 재구성 대신 공유 `decodeTurnLogResponse`를 사용하도록 했다.
  - `combat.reaction.prompt` payload도 로컬 재구성 대신 공유 `decodeCombatReactionPrompt`를 사용하도록 했다.
  - 공유 decoder의 `decodeTurnLogResponse`, `decodeCombatReactionPrompt`를 frontend export surface에 노출했다.
- 확인:
  - `realtime.ts`는 모든 주요 Socket.IO 이벤트를 `safeSocketOn(socket, event, decoder, handler)`로 받고, decoder 실패 시 payload를 무시한다.
  - session snapshot, participant, character, dice, state diff, VTT map, combat, turn log, combat reaction payload는 공유 DTO decoder를 통과한다.
  - chat/system/action accepted 이벤트는 별도 shared decoder가 아직 없지만, 현재 로컬 decoder가 필수 문자열과 enum-like scope를 검증한다.
- 후속:
  - `ChatMessageEventDto`, `SystemMessageEventDto`, `ActionAcceptedEventDto` decoder도 shared-types로 승격하면 WebSocket 이벤트 decoder가 모두 한곳에 모인다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-07 117차 반영 상태

- 완료:
  - 백엔드 JWT payload decoder의 `exp` claim을 finite number뿐 아니라 integer로도 검증하도록 좁혔다.
  - Kakao/Discord OAuth token 응답의 `expires_in`, `refresh_token_expires_in` 선택 필드를 정수 seconds로만 보존하도록 했다.
  - OAuth token helper 이름을 `readOptionalInteger`로 바꿔, 외부 응답 숫자 필드 정책이 정수 seconds임을 코드에 드러냈다.
- 확인:
  - OAuth access token 필수 필드는 기존처럼 trim된 non-empty string decoder를 통과한다.
  - OAuth user id 필수 필드와 JWT `sub/type/exp` 필수 claim은 타입만 믿지 않고 decoder에서 확인한다.
- 후속:
  - OAuth error response body는 현재 인증 실패로 통합 처리된다. 운영 관측이 필요하면 provider error code/message를 별도 안전 decoder로 분리해 로그에만 남긴다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 118차 반영 상태

- 완료:
  - 프론트 access token 만료 보조 판정도 서버 JWT decoder와 맞춰 `exp` claim을 finite integer seconds로만 인정하도록 좁혔다.
  - AI interpreter 응답의 `rulesConfidence`를 단순 number가 아니라 0~1 범위 confidence 값으로 검증하도록 했다.
  - AI client에서 더 이상 쓰지 않는 optional number helper를 제거해 숫자 경계 정책이 `readConfidence`/`readOptionalConfidence`로 드러나게 했다.
- 확인:
  - `be/src`, `fe/src`, `shared-types/src` 범위에서 테스트 파일을 제외하고 `as any`, `as unknown as`, `: any`, `any[]`, `JSON.parse(...) as`, `return data as T`, `response.json() as` 패턴을 재스캔했을 때 남은 항목이 없었다.
  - AI client의 외부 응답은 `attemptPostJson(path, body, decode)` 경로에서 decoder 실패 시 `BadGatewayException`으로 분류된다.
- 후속:
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.
  - 넓은 `Record<string, unknown>` DTO/도메인 필드는 자유형 상태 저장을 위한 의도적 사용과 추가로 좁힐 수 있는 입력 경계를 계속 분리해 검토한다.

### 2026-07-08 119차 반영 상태

- 완료:
  - `ResolveMainCommandCheckDto.diceResult`의 타입 표면을 `Record<string, unknown>`에서 `TurnLogDiceResultDto`로 좁혔다.
  - 기존 `MainCommandDiceResultConstraint`는 유지해 클라이언트가 보내는 판정 주사위 결과가 `expression`, `rolls`, `modifier`, `total`, `advantageState`, `naturalRoll`, `dc`, `outcome` 범위 검증을 계속 통과하도록 했다.
  - `TurnLogsService.createTurnLog`와 주사위 결과 stringify helper도 `TurnLogDiceResultDto | null` 입력으로 좁혀, 로그 저장 boundary에서 임의 record를 받지 않도록 했다.
  - 메인 커맨드 판정 sanitizer의 결과 타입을 `TurnLogDiceResultDto` 기반으로 맞추고, `dc`는 숫자인 경우에만 보존하도록 정리했다.
- 확인:
  - DTO validator와 TypeScript 타입이 같은 주사위 결과 계약을 바라보게 되어, 판정 결과 저장/로그 경로에서 임의 record로 취급되는 구간이 줄었다.
- 후속:
  - 남은 `Record<string, unknown>` DTO 필드는 `GameStateResponseDto.flags/state`, `ScenarioClueDto.revealPolicy`처럼 자유형 상태 저장이나 정책 표현이 필요한 필드인지, 입력 boundary에서 더 좁힐 수 있는 필드인지 계속 분리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 120차 반영 상태

- 완료:
  - `TurnLogsService.createTurnLog`의 `structuredAction` 입력을 `TurnLogStructuredActionDto | null`로 좁혔다.
  - `TurnLogsService.createTurnLog`와 `attachStateDiff`의 `stateDiff` 입력을 `TurnLogStateDiffDto | null` 또는 `TurnLogStateDiffDto`로 좁혔다.
  - `stringifyStructuredAction`, `stringifyTurnLogStateDiff`도 같은 DTO 타입을 받아 공유 decoder를 통과한 값만 저장하도록 맞췄다.
  - `ActionRuleService.ActionResolution.structuredAction`도 `TurnLogStructuredActionDto`로 맞춰, 도메인 규칙 결과가 로그 저장 경계까지 임의 record로 흘러가지 않게 했다.
- 확인:
  - `TurnLogsService`와 `ActionResolution`의 로그 구조 입력에서 `Record<string, unknown>` 표면이 제거됐다.
  - 상태 diff와 structured action은 저장 직전에 `decodeTurnLogStateDiff`, `decodeTurnLogStructuredAction`을 통과한다.
- 후속:
  - `TurnLogStructuredActionDto`는 다양한 액션 로그를 담기 위해 JSON object 기반의 느슨한 구조를 유지한다. 장기적으로는 `type`별 structured action union을 별도 마일스톤으로 분리할 수 있다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 121차 반영 상태

- 완료:
  - Human GM override 로그 생성 경로에서 저장 직후 반환하는 `TurnLogResponseDto.structuredAction/stateDiff`를 nullable record parser가 아니라 `decodeTurnLogStructuredAction`, `decodeTurnLogStateDiff`로 복원하도록 바꿨다.
  - VTT object runtime의 자동 위험탐지/함정 발동 turn log 이벤트도 저장 전 decoder 결과인 `structuredActionForLog`, `stateDiffForLog`, `diceResultForLog`를 그대로 재사용하도록 맞췄다.
  - `SessionsService`에 남아 있던 사용되지 않는 `parseNullableRecordJson` helper와 관련 import를 제거했다.
- 확인:
  - `turnLog.create` 직접 호출 경계에서 `structuredActionJson`, `stateDiffJson`, `diceResultJson`을 decoder 없이 `JSON.stringify`하는 패턴을 재스캔했을 때 남은 항목이 없었다.
  - 직접 생성 후 반환/emit하는 turn log 객체도 저장 전 검증 결과를 재사용하므로, DB 저장값과 실시간/HTTP 반환값의 타입 계약이 어긋날 가능성이 줄었다.
- 후속:
  - direct `turnLog.create` 호출 자체를 장기적으로 `TurnLogsService` 또는 작은 audit-log writer로 모으면 저장 전 검증 정책을 더 쉽게 유지할 수 있다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 122차 반영 상태

- 완료:
  - WebSocket `action.accepted`, `system.message`, `chat.message` 이벤트 decoder를 `shared-types/src/utils/api-decoders.ts`로 승격했다.
  - `decodeActionAcceptedEvent`, `decodeSystemMessageEvent`, `decodeChatMessageEvent`, `decodeChatMessageEventPayload`를 frontend export surface에 노출했다.
  - FE `realtime.ts`의 로컬 `action.accepted`/`system.message`/`chat.message` decoder 구현을 공유 decoder 호출로 대체했다.
- 확인:
  - `chat.message.scope`는 공유 decoder에서 `"CHAT" | "MAIN"`만 허용한다.
  - `system.message.playerActionId`는 누락/`null`/문자열만 허용하고, 그 외 타입은 수신 handler로 전달하지 않는다.
  - 기존 `safeSocketOn` 경로는 유지되어 잘못된 payload는 handler 대신 `Realtime payload ignored` 로그로 빠진다.
- 후속:
  - `session.snapshot`, `participant.updated`, `character.updated`, `dice.rolled`, `state.diff.applied`, `vtt.map.updated`, `combat.updated`, `combat.reaction.prompt`도 payload wrapper decoder를 공유 함수로 모으면 `realtime.ts`의 수신 경계가 더 얇아진다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 123차 반영 상태

- 완료:
  - WebSocket `session.snapshot`, `participant.updated`, `character.updated`, `turn.log.created`, `dice.rolled`, `state.diff.applied`, `vtt.map.updated`, `combat.updated`, `combat.reaction.prompt` payload wrapper decoder를 `shared-types/src/utils/api-decoders.ts`로 승격했다.
  - 해당 wrapper decoder를 `shared-types/src/frontend.ts`에 노출하고, FE `realtime.ts`의 로컬 wrapper 재구성 로직을 공유 decoder 호출로 대체했다.
  - `realtime.ts`에서 nested DTO를 직접 읽던 경계를 제거하고, 모든 주요 Socket.IO 수신 이벤트가 `safeSocketOn`과 공유 decoder를 통과한 뒤 handler로 들어가도록 맞췄다.
- 확인:
  - 각 wrapper decoder는 `sessionId` 문자열을 필수로 확인하고, 실제 payload 본문은 기존 `decodeSessionSnapshot`, `decodeSessionParticipant`, `decodeSessionCharacter`, `decodeTurnLogResponse`, `decodeDiceRollResponse`, `decodeStateDiffResponse`, `decodeVttMapState`, `decodeCombatResponse`, `decodeCombatReactionPrompt`를 재사용한다.
  - `realtime.ts`에는 `readRecord` 기반 로컬 payload 파싱이 남지 않았다.
  - 잘못된 payload를 handler로 넘기지 않는 `safeSocketOn` 실패 처리 흐름은 그대로 유지했다.
- 후속:
  - 현재 FE가 구독하지 않는 `turn.changed`, `session.status.updated` 같은 이벤트를 추가하게 되면 같은 wrapper decoder 패턴으로 먼저 shared-types에 계약을 만들고 연결한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 124차 반영 상태

- 완료:
  - `UsersService`의 OAuth JSON reader를 `readJson(response, decoder)` 형태로 바꿔, Kakao/Discord token/user 응답을 읽는 즉시 성공 DTO decoder를 통과하게 했다.
  - Kakao/Discord token/user 요청에서 `response.ok`를 먼저 확인하고, 성공 응답에 대해서만 `decodeKakaoTokenResponse`, `decodeKakaoUserResponse`, `decodeDiscordTokenResponse`, `decodeDiscordUserResponse`를 적용하도록 순서를 정리했다.
  - JSON 파싱 실패와 shape 검증 실패를 `readJson` 내부에서 각각 `OAuth 응답을 해석할 수 없습니다.`, `OAuth 응답 형식이 올바르지 않습니다.`로 감싸도록 했다.
- 확인:
  - `be/src/modules/users/users.service.ts`의 Kakao/Discord OAuth 호출부 네 곳은 더 이상 `await this.readJson(response)`를 받은 뒤 별도 decoder를 호출하지 않는다.
  - OAuth 실패 응답 body가 성공 DTO shape가 아니더라도, 성공 DTO decoder보다 provider별 실패 메시지가 먼저 적용된다.
- 후속:
  - OAuth error body의 `error`, `error_description`을 별도 decoder로 읽어 운영 로그에 남기면 upstream 장애 분석성이 더 좋아진다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 125차 반영 상태

- 완료:
  - `ConditionRuntimeService`에 저장 조건 배열의 실제 계약인 `ConditionStateEntry = string | ConditionInstance`를 추가했다.
  - `ActionRuleService`의 `CharacterStatePatch.conditions`, 집중/피해/조건 추가 제거 helper, 휴식 결과 비교 helper가 `unknown[]` 대신 `ConditionStateEntry[]`를 사용하도록 좁혔다.
  - `ActionRuleService`에 `parseConditionEntriesJson`을 추가해 `conditionsJson`에서 레거시 문자열 조건 또는 `ConditionRuntimeService`로 해석 가능한 구조화 조건만 상태 변경 경계로 넘기게 했다.
  - `RestResolutionService`의 입력/출력 조건 배열과 내부 helper 시그니처를 같은 `ConditionStateEntry[]`로 맞췄다.
- 확인:
  - `action-rule.service.ts`의 조건 상태 패치 경계에서는 `conditions?: unknown[]`, `conditions: unknown[]`, `removedConditions: unknown[]` 패턴이 사라졌다.
  - `rest-resolution.service.ts`도 휴식 조건 제거/태그 확인 helper가 공용 조건 entry 타입을 사용한다.
  - 짧은 휴식 중 주문 회복 태그를 추가할 때 기존 구조화 조건 entry를 문자열 배열로 축소하지 않고 `ConditionStateEntry[]` 안에 보존한다.
- 후속:
  - `human-gm-runtime.service.ts`는 126차, `action-spell-rule.service.ts`는 127차에서 같은 `ConditionStateEntry[]` 계약으로 좁혔다.
  - `rule-engine.types.ts`의 `statePatch`는 128차에서 현재 동작에 맞게 빈 patch 계약으로 좁혔다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 126차 반영 상태

- 완료:
  - `HumanGmRuntimeService`의 전투 조건 추가/삭제 경로가 `unknown[]` 대신 `ConditionStateEntry[]`를 사용하도록 바꿨다.
  - `parseHumanGmConditionEntries`를 추가해 `conditionsJson`에서 레거시 문자열 조건 또는 `ConditionRuntimeService`가 해석 가능한 구조화 조건만 저장/emit 경계로 넘기게 했다.
  - Human GM 전투 조건 변경 realtime response의 `nextConditions`, condition tag 추출, concentration 복원 입력도 `ConditionStateEntry[]`로 좁혔다.
- 확인:
  - `human-gm-runtime.service.ts` 안의 조건 조작 helper와 combat response helper에는 더 이상 `unknown[]` 시그니처가 남지 않았다.
  - 손상되었거나 조건으로 해석할 수 없는 저장 entry는 Human GM 조건 변경/HP 조정 emit 경계에서 제외된다.
- 후속:
  - `action-spell-rule.service.ts`의 concentration 조건 결과는 127차에서 `ConditionStateEntry[]`로 좁혔다.
  - `rule-engine.types.ts`의 `statePatch`는 128차에서 현재 동작에 맞게 빈 patch 계약으로 좁혔다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 127차 반영 상태

- 완료:
  - `ActionSpellRuleRuntime.resolveConcentrationDamageCheck`의 반환 타입 중 `conditions`, `removedConditions`를 `unknown[]`에서 `ConditionStateEntry[]`로 좁혔다.
  - `ActionRuleService.resolveConcentrationDamageCheck`가 이미 `ConditionStateEntry[]`를 반환하므로, spell rule adapter 경계의 타입 계약을 실제 구현과 맞췄다.
- 확인:
  - `action-spell-rule.service.ts`에는 더 이상 `unknown[]` 시그니처가 남지 않았다.
  - spell rule에서 concentration 실패로 state patch를 만들 때 조건 배열이 `CharacterStatePatch.conditions`의 `ConditionStateEntry[]` 계약과 일치한다.
- 후속:
  - `campaign-archive-runtime.service.ts`의 transfer inventory 지역 변수는 129차에서 `JsonObject[]`와 archive payload decoder로 좁혔다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 128차 반영 상태

- 완료:
  - `RuleHookResult.statePatch`를 `unknown[]`에서 `RuleStatePatch = readonly []`로 좁혔다.
  - 현재 `RuleEngineService`의 accepted/rejected hook 결과가 모두 `statePatch: []`만 반환한다는 실제 동작을 타입 계약으로 명시했다.
- 확인:
  - `rule-engine.types.ts`에는 더 이상 `statePatch: unknown[]`가 남지 않았다.
  - 룰 엔진이 앞으로 실제 patch를 생산하려면 `RuleStatePatch` 타입을 명시적으로 확장해야 하므로, 임의 배열이 조용히 hook 결과로 들어가는 경로가 막혔다.
- 후속:
  - `campaign-archive-runtime.service.ts`의 transfer inventory 지역 변수는 129차에서 `JsonObject[]`와 archive payload decoder로 좁혔다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 129차 반영 상태

- 완료:
  - `CampaignArchiveRuntimeService.ensureCharacterTransferInventoryPolicy`의 transfer inventory 지역 변수를 `unknown[]`에서 `JsonObject[]`로 좁혔다.
  - `decodeTransferInventoryItems`를 추가해 이관 inventory JSON이 배열이고, 각 entry가 `decodeJsonObject`를 통과한 JSON-compatible 객체인지 먼저 검증하도록 했다.
  - 캠페인 귀속/파티 공유/경제 장부 아이템 검사도 `JsonObject`를 입력으로 받게 맞췄다.
- 확인:
  - `campaign-archive-runtime.service.ts`에는 transfer inventory `unknown[]`와 `decodeUnknownArray` 사용이 남지 않았다.
  - 이관 inventory에 비객체 entry나 비JSON 값이 섞이면 기존처럼 `ConflictException("이관 가능한 캐릭터 inventory 형식이 아닙니다.")`로 거부된다.
- 후속:
  - combat 모듈의 조건 entry 경계(`combat-condition.service.ts`, `combat-mapper.service.ts`, `combat.service.ts`, `combat-terrain.types.ts`)는 130차에서 `ConditionStateEntry[]` 계열로 좁혔다.
  - `action-rule.service.ts`와 `combat.service.ts`의 `parseUnknownArrayJson` private helper는 131차에서 호출부별 도메인 decoder로 대체했다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 130차 반영 상태

- 완료:
  - `CombatConditionService`의 `combatConditionTags`, `readCombatConditionEntries`, `writeCombatConditionEntries`, `parseConditionEntries`를 `unknown[]`에서 `ConditionStateEntry[]` 계약으로 좁혔다.
  - `CombatMapperService`의 condition entry parser도 `ConditionRuntimeService`를 통과해 레거시 문자열 또는 해석 가능한 구조화 조건만 response mapping에 넘기도록 맞췄다.
  - `CombatTerrainEffectApplication.concentrationCheck.removedConditions`와 `CombatService.removeExpiredConditionEntries`도 `ConditionStateEntry[]`로 좁혔다.
- 확인:
  - combat 조건 entry 경계의 `unknown[]` 시그니처는 사라졌다.
  - combat 조건 tag 계산은 raw JSON 배열이 아니라 `ConditionStateEntry[]` decoder를 통과한 값만 받는다.
- 후속:
  - `action-rule.service.ts`와 `combat.service.ts`의 `parseUnknownArrayJson` private helper는 131차에서 inventory/condition decoder로 대체했다.
  - `combat.service.ts`의 Prisma raw query varargs `unknown[]`는 조건 entry와 무관한 기술적 타입이므로 별도 검토 대상으로 둔다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 131차 반영 상태

- 완료:
  - `ActionRuleService`의 `parseUnknownArrayJson` private helper를 제거하고, 조건 JSON은 `decodeConditionEntriesForRules`, 인벤토리 JSON은 `decodeInventoryItemsForRules`를 `parseJsonOrFallback`에 직접 연결했다.
  - `CombatService`의 `parseUnknownArrayJson` private helper를 제거하고, 조건 JSON은 `decodeConditionEntries`, inventory snapshot JSON은 `decodeInventorySnapshotItems`를 `parseJsonOrFallback`에 직접 연결했다.
  - JSON 배열 여부를 확인하는 책임을 범용 `unknown[]` helper가 아니라 호출부별 도메인 decoder가 맡도록 바꿨다.
- 확인:
  - `action-rule.service.ts`와 `combat.service.ts`에는 `parseUnknownArrayJson`과 `parseJsonUnknownArrayOrFallback` 사용이 남지 않았다.
  - 두 파일에서 남은 `unknown[]`는 `combat.service.ts`의 Prisma `$executeRaw` varargs뿐이며, 외부 JSON/조건/인벤토리 모델 경계와 무관하다.
- 후속:
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 132차 반영 상태

- 완료:
  - `ConditionRuntimeService.parseConditionsJson`가 `parseJsonUnknownArrayOrFallback`로 raw 배열을 받은 뒤 변환하지 않고, `decodeConditionInstances`를 `parseJsonOrFallback`에 직접 연결하도록 바꿨다.
  - `CombatConditionService`, `CombatMapperService`, `HumanGmRuntimeService`의 조건 JSON 파싱도 각 서비스의 condition entry decoder를 통해 `ConditionStateEntry[]`로 직접 좁히도록 맞췄다.
  - `CampaignArchiveRuntimeService.countArchiveInventoryItems`는 archive inventory JSON을 record 배열 decoder로 통과시켜 수량 집계를 수행하도록 바꿨다.
  - `domain.mapper.ts`의 condition summary 파싱도 `decodeConditionSummary`로 분리해 raw `unknown[]`를 직접 다루지 않게 했다.
- 확인:
  - `parseJsonUnknownArrayOrFallback` 직접 호출은 비테스트 `be/src`, `fe/src`, `shared-types/src` 기준 공통 유틸 정의부 외에는 남지 않았다.
  - 남은 `unknown[]` 시그니처는 공통 유틸의 generic unknown-array decoder, Prisma `$executeRaw` varargs, 그리고 배열 decoder 함수 인자처럼 아직 도메인 입력을 숨기는 단언이 아닌 항목으로 분류했다.
- 후속:
  - `decodeInventoryPackContents(value: unknown[])` 계열은 함수 인자를 `unknown`으로 받고 내부에서 `Array.isArray`를 수행하는 형태로 추가 축소할 수 있다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 133차 반영 상태

- 완료:
  - `characters.service.ts`, `character-equipment-loadout.service.ts`의 `decodeInventoryPackContents` 인자를 `unknown[]`에서 `unknown`으로 낮추고 내부 `Array.isArray` 검증을 추가했다.
  - seed item decoder의 `decodeSrdEquipmentContents`도 `unknown` 입력을 받아 배열 여부를 직접 검증하도록 바꿨다.
  - 더 이상 호출되지 않는 `parseJsonUnknownArrayOrFallback`, `decodeUnknownArray`를 `be/src/common/utils/json-runtime.ts`에서 제거했다.
- 확인:
  - 비테스트 `be/src`, `fe/src`, `shared-types/src` 기준 `parseJsonUnknownArrayOrFallback`, `decodeUnknownArray` 검색 결과는 0건이다.
  - 같은 범위의 `unknown[]` 검색 결과는 `combat.service.ts`의 Prisma `$executeRaw` varargs 1건만 남았다.
- 후속:
  - Prisma transaction client 보정용 `$executeRaw` varargs는 외부 JSON/응답/저장 모델 경계와 무관하므로, 별도 타입 보정 이슈로 분리해 관리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 134차 반영 상태

- 완료:
  - `CombatService.lockSessionRuntime`와 `SessionsService.lockSessionRuntime`의 `tx: unknown` + `$executeRaw` 객체 캐스팅을 제거했다.
  - 두 helper는 이제 `Pick<Prisma.TransactionClient, "$executeRaw">`를 직접 받아 transaction callback의 실제 타입 계약을 드러낸다.
  - `CombatService`는 필요한 Prisma namespace import를 추가하고, 직접 작성한 `...values: unknown[]` varargs 타입을 제거했다.
- 확인:
  - 비테스트 `be/src`, `fe/src`, `shared-types/src` 기준 `unknown[]`, `tx as`, `as { $executeRaw`, `parseJsonUnknownArrayOrFallback`, `decodeUnknownArray` 검색 결과는 0건이다.
  - 대표 고위험 패턴(`as unknown as`, `as any`, `: any`, `any[]`, `JSON.parse(...) as`, `response.json() as`)도 직접 hit가 없고, 남은 결과는 `as const` 리터럴 보정과 CSS `overflow-wrap: anywhere` 등 감사 제외군이다.
- 후속:
  - 남은 `as const`는 discriminated union/tuple literal 보정인지 계속 분류하고, 외부 입력 또는 저장 데이터 신뢰를 숨기는 단언이 새로 생기지 않도록 검색 기준을 유지한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 135차 반영 상태

- 완료:
  - `domain.mapper.ts`의 `mapScenarioNode`가 `node.nodeMetaJson`을 `parseNullableJsonRecordOrFallback`로 단순 record 복원하지 않고, `parseJsonOrFallback(..., decodeScenarioNodeMeta)` 경로로 복원하도록 바꿨다.
  - 서버 mapper의 `ScenarioNodeResponseDto.nodeMeta`도 shared decoder와 같은 `ScenarioNodeMetaDto | null` 검증 규칙을 사용하게 됐다.
- 확인:
  - `nodeMeta: parseNullableJsonRecordOrFallback(node.nodeMetaJson)` 직접 사용은 사라졌다.
  - 비테스트 `be/src`, `fe/src`, `shared-types/src` 기준 `unknown[]`, `tx as`, `as { $executeRaw`, `parseJsonUnknownArrayOrFallback`, `decodeUnknownArray`, legacy nodeMeta fallback 검색 결과는 0건이다.
- 후속:
  - `parseNullableJsonRecordOrFallback` 잔여 사용처 중 실제 DTO decoder가 있는 저장 JSON은 계속 목적별 decoder로 교체한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 136차 반영 상태

- 완료:
  - `TurnLogsService`의 structured action/dice result/state diff 복원을 nullable record parser 경유가 아니라 `parseJsonOrFallback(..., decodeTurnLogStructuredAction|decodeTurnLogDiceResult|decodeTurnLogStateDiff)`로 직접 연결했다.
  - `SessionRevealService`, `MainCommandEndingNodeService`, `MainCommandSceneEntityService`의 `nodeMetaJson` 파싱을 `decodeScenarioNodeMeta` 경유로 맞췄다.
  - `CombatStatsService`, `MainCommandRuleFragmentService`, `MapPositionService`, `domain.mapper.ts`의 spell summary 파싱은 지역 decoder를 사용하도록 바꿨다.
  - 더 이상 사용되지 않는 `parseNullableJsonRecordOrFallback`, `decodeNullableRecord`를 `be/src/common/utils/json-runtime.ts`에서 제거했다.
- 확인:
  - 비테스트 `be/src`, `fe/src`, `shared-types/src` 기준 `parseNullableJsonRecordOrFallback`, `decodeNullableRecord`, `parseNullableJson(` 검색 결과는 0건이다.
  - 같은 범위에서 `unknown[]`, `tx as`, `as { $executeRaw`, `parseJsonUnknownArrayOrFallback`, `decodeUnknownArray`, legacy `nodeMeta` fallback 검색 결과도 0건을 유지한다.
- 후속:
  - 남은 `parseJsonRecordOrFallback` 사용처 중 flags처럼 open-ended 저장소가 아닌 곳은 계속 목적별 decoder로 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 137차 반영 상태

- 완료:
  - `SessionRevealService.getRevealedClueSnapshotsForUser`가 `reveal.snapshotJson`을 범용 record fallback으로 복원하지 않고, `parseRevealedClueSnapshot`/`decodeRevealedClueSnapshot`으로 전용 필드만 검증해 복원하도록 바꿨다.
  - `MainCommandProgressEvidenceService.loadRevealedClueState`도 clue evidence snapshot 전용 decoder를 거쳐 title/text 후보 필드만 읽도록 바꿨다.
  - `ActionRuleService`, `ActionSpellRuleService`, `CombatSpellService`, `SessionVttObjectRuntimeService`의 abilities JSON number record 파싱은 `parseJsonRecordOrFallback` 후처리가 아니라 `parseJsonOrFallback(..., decodeNumberRecord)`로 직접 연결했다.
- 확인:
  - 대표 고위험 패턴(`as unknown as`, `as any`, `: any`, `any[]`, `unknown[]`, `JSON.parse(...) as`, `response.json() as`, 제거된 JSON fallback helper들)은 비테스트 소스 기준 직접 hit가 없고, 검색 결과는 CSS `overflow-wrap: anywhere` 같은 텍스트 매칭뿐이다.
  - clue snapshot을 읽던 직접 `parseJsonRecordOrFallback(reveal.snapshotJson...)` 경계는 전용 decoder로 대체됐다.
- 후속:
  - 남은 `parseJsonRecordOrFallback` 사용처 중 scenario metadata나 public attribution marker처럼 구조가 알려진 저장 문자열은 계속 목적별 decoder 후보로 본다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 138차 반영 상태

- 완료:
  - `ScenariosService.parseScenarioRevisionMetadata`, `SessionScenarioRevisionSnapshotService.parseMetadata`, `domain.mapper.ts`의 P3 revision metadata 복원을 `parseJsonRecordOrFallback(metadataText)`에서 목적별 revision metadata decoder로 전환했다.
  - `ScenariosService.parseScenarioCollaborationMetadata`도 collaborators/reviews 전용 decoder를 통과해 필요한 필드만 재구성하도록 바꿨다.
- 확인:
  - P3 revision metadata와 collaboration metadata의 직접 `parseJsonRecordOrFallback(metadataText)` 경계는 사라졌다.
  - `scenarios.service.ts`에 남은 직접 record fallback metadata 경계는 public ecosystem metadata와 legacy moderation report이며, 다음 축소 후보로 분리했다.
- 후속:
  - public ecosystem metadata는 구조가 크므로 ratings/reports/appeals/actions/tags를 별도 decoder 함수로 나눠 단계적으로 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 139차 반영 상태

- 완료:
  - `ScenariosService.parseLegacyModerationReports`의 legacy report chunk 복원을 `parseJsonRecordOrFallback(chunk)`에서 `parseJsonOrFallback(..., decodeLegacyModerationReport)`로 바꿨다.
  - public ecosystem metadata의 `ratings`, `reports`, `appeals` 배열 entry 검증을 각각 `decodePublicRating`, `decodePublicModerationReport`, `decodePublicModerationAppeal` helper로 분리했다.
  - moderation report reason은 `toScenarioModerationReportReason` helper를 통과해 허용 literal 또는 `"other"`로 정규화한다.
- 확인:
  - legacy moderation report chunk의 직접 record fallback은 사라졌다.
  - 대표 고위험 패턴 검색은 비테스트 소스 기준 CSS `overflow-wrap: anywhere` 텍스트 매칭만 남는다.
- 후속:
  - public ecosystem metadata의 `moderationActions`, `rightsDeclaration`, `lineage`, scalar field도 같은 방식으로 목적별 decoder로 분리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 140차 반영 상태

- 완료:
  - public ecosystem metadata의 `moderationActions` entry 검증을 `decodePublicModerationAction` helper로 분리했다.
  - `rightsDeclaration`, `lineage` 복원도 각각 `decodePublicRightsDeclaration`, `decodePublicLineage`로 옮겨 inline object 접근을 줄였다.
  - `tags`, `contentWarnings`, `estimatedMinutes`, `forkCount`, `gmMode` scalar/array 필드는 `decodeTrimmedStringArray`, `decodePositiveRoundedNumber`, `decodeNonNegativeInteger`, `decodeScenarioPublicGmMode` helper를 통과하도록 정리했다.
- 확인:
  - public ecosystem metadata의 actions/rights/lineage/scalar 필드 검증은 본문 inline guard 대신 목적별 helper로 분리됐다.
  - 대표 고위험 패턴 검색은 비테스트 소스 기준 CSS `overflow-wrap: anywhere` 텍스트 매칭만 남는다.
- 후속:
  - public ecosystem metadata 최상위 `parseJsonRecordOrFallback(metadataText)`도 전체 metadata decoder로 감싸 최종적으로 직접 record fallback을 제거한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 141차 반영 상태

- 완료:
  - `ScenariosService.parseScenarioPublicEcosystemMetadata`의 최상위 `parseJsonRecordOrFallback(metadataText)`를 `parseJsonOrFallback(..., decodePublicEcosystemMetadata)`로 교체했다.
  - public ecosystem metadata 전체 복원 흐름이 `decodePublicEcosystemMetadata` 안에서 하위 decoder들을 조합하도록 정리됐다.
  - moderation status fallback 계산은 `decodeScenarioPublicModerationStatus` helper로 분리했다.
- 확인:
  - `scenarios.service.ts`의 public ecosystem metadata 최상위 직접 record fallback은 사라졌다.
  - 대표 고위험 패턴 검색은 비테스트 소스 기준 CSS `overflow-wrap: anywhere` 텍스트 매칭만 남는다.
- 후속:
  - `scenarios.service.ts`에 남은 `parseJsonRecordOrFallback` 직접 사용은 legacy moderation/report 외 marker가 아닌 flags 또는 별도 chunk 경계인지 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 142차 반영 상태

- 완료:
  - 남은 `parseJsonRecordOrFallback` 사용처를 다시 분류했고, 대부분은 의도적으로 schema가 열려 있는 `GameState.flagsJson` 계열임을 확인했다.
  - `AiService.getQualityMetrics`의 AI trace `responseJson` fallback 판별은 `parseJsonRecordOrFallback(...).fallback` 속성 접근에서 `parseJsonOrFallback(..., decodeAiTraceFallbackFlag)`로 전환했다.
  - AI trace 응답 JSON이 객체인지 확인한 뒤 `fallback === true`만 판별하도록 만들어, metric 계산 경계에서도 목적별 decoder를 통과하게 했다.
- 확인:
  - `be/src/modules/ai/ai.service.ts`에는 더 이상 `parseJsonRecordOrFallback` 직접 사용이 없다.
  - `scenarios.service.ts`의 직접 `parseJsonRecordOrFallback` 사용도 현재 검색 범위에서 사라졌다.
- 후속:
  - 남은 직접 record fallback 사용처는 대부분 flags projection/update 계열이므로, 무작정 제거하기보다 `flagsJson` 내부에서 실제로 고정 구조가 있는 하위 namespace를 먼저 식별한 뒤 목적별 decoder로 분리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 143차 반영 상태

- 완료:
  - `CampaignArchiveRuntimeService.extractPublicRevisionLineage`의 `P5_PUBLIC_META` attribution marker 복원을 `parseJsonRecordOrFallback(...).lineage` 접근에서 `parseJsonOrFallback(..., decodePublicRevisionLineageMetadata)`로 전환했다.
  - marker JSON이 객체인지 확인한 뒤 `lineage`만 기존 `normalizePublicRevisionLineage`로 넘기도록 해, public revision lineage 경계를 목적별 decoder로 분리했다.
- 확인:
  - `campaign-archive-runtime.service.ts`의 직접 `parseJsonRecordOrFallback` import/use는 사라졌다.
- 후속:
  - 남은 직접 record fallback 사용처는 `GameState.flagsJson` projection/update와 일부 combat/session 내부 helper 중심이다. helper가 실제로 flags 전용인지, 아니면 고정 구조 JSON을 숨기고 있는지 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 144차 반영 상태

- 완료:
  - `CombatService.parseRecordJson` helper 사용처를 분류해, 대부분은 `flagsJson` 전용이고 `parseNumberRecordJson`만 능력치 JSON 고정 구조를 다루는 것을 확인했다.
  - `CombatService.parseNumberRecordJson`을 `parseRecordJson` 후처리에서 `parseJsonOrFallback(..., decodeNumberRecord)`로 분리했다.
  - 능력치 JSON은 객체 여부를 먼저 확인한 뒤 finite number entry만 남기는 목적별 decoder를 통과한다.
- 확인:
  - `CombatService.parseRecordJson`은 계속 flags 계열 호출에서만 사용되고, 능력치 JSON 파싱은 더 이상 record fallback helper에 의존하지 않는다.
- 후속:
  - `SessionsService.parseRecordJson` 호출은 현재 모두 `flagsJson` 기반으로 보인다. 다만 flags 내부의 고정 namespace(`humanGm`, completion, VTT 등)는 별도 store/helper가 있는지 확인해 점진적으로 분리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 145차 반영 상태

- 완료:
  - `pendingReadyActions`, `triggeredReadyActions` flags는 고정 구조임에도 `ActionProcessorService`, `CombatService`, `CombatMapperService`에 validator가 중복되어 있었다.
  - `ReadyActionService`에 `readPendingReadyActions`, `readTriggeredReadyActions`, `isPendingReadyAction`, `isTriggeredReadyAction`을 추가해 ready action flags 구조 검증을 한곳으로 모았다.
  - `ActionProcessorService.storePendingReadyAction`, `CombatService.parsePendingReadyActions/parseTriggeredReadyActions`, `CombatMapperService.mapTriggeredReadyActionPrompts`가 공통 reader를 사용하도록 바꿨다.
- 확인:
  - ready action guard 중복 검색 결과, 검증 로직은 `ReadyActionService`에만 남고 각 소비자는 공통 reader를 호출한다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과했다.
- 후속:
  - `flagsJson`에 남은 고정 namespace 중 spell slot override, monster limited/recharge expended, VTT map 등도 같은 방식으로 owner service/helper에 read/update API를 모아 중복 guard를 줄인다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 146차 반영 상태

- 완료:
  - `spellSlotsBySessionCharacterId` flags decoder가 `ActionProcessorService`, `CombatSpellService`, `CombatMapperService`에 중복되어 있었다.
  - `SpellSlotService.readSpellSlotsBySessionCharacterId`를 추가해 spell slot override flags 구조 검증을 owner service로 모았다.
  - 세 소비자는 private `decodeSpellSlotsBySessionCharacterId`/`decodeSpellSlotRecord` 대신 공통 reader를 호출하도록 전환했다.
- 확인:
  - 비테스트 소스의 spell slot flags decoder 검색 결과, 중복 private decoder는 사라지고 `SpellSlotService.readSpellSlotsBySessionCharacterId` 호출만 남았다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과했다.
- 후속:
  - monster limited/recharge expended flags는 이미 `CombatMonsterResourceService`가 owner에 가깝다. 다음 단계에서는 `ActionProcessorService`의 rest recovery 경계가 이 owner service를 재사용할 수 있는지 확인한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 147차 반영 상태

- 완료:
  - `ActionProcessorService`의 short/long rest recovery가 `monsterLimitedUseExpended` flags 구조와 rest-bound entry 판별을 자체 구현하고 있었다.
  - `combat-monster-resource.service.ts`에 `clearRestBoundMonsterLimitedUses` exported helper를 추가해 monster limited-use flags 검증과 rest-bound 제거 로직을 owner 파일로 이동했다.
  - `ActionProcessorService.recoverLongRestSpellSlots`, `recoverShortRestMonsterLimitedUses`는 새 helper를 호출하도록 전환하고 중복 `isMonsterLimitedUseEntry`/`isRestBoundMonsterLimitedUse`를 제거했다.
- 확인:
  - ActionProcessor 쪽 monster limited-use rest recovery 중복 guard는 사라지고, 해당 flags 검증은 combat monster resource 파일의 helper를 통과한다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과했다.
- 후속:
  - monster recharge flags는 현재 `CombatMonsterResourceService`와 `CombatMonsterActionService`가 같은 owner parser를 사용 중이다. 다음에는 VTT map 또는 item runtime flags처럼 아직 `flagsJson` raw access가 넓은 namespace를 이어서 줄인다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 148차 반영 상태

- 완료:
  - `SessionsService` 안에서 `flags.vttMap`을 직접 꺼내 `toVttMapOrNull`에 넘기는 패턴이 세 곳에 반복되어 있었다.
  - `readRuntimeVttMapFromFlags(flags)` helper를 추가하고 `getVttMapForUser`, `startSession`, `getVttMapBaseline`이 이 helper를 사용하도록 전환했다.
  - VTT map flags shape 검증은 계속 `SessionVttMapNormalizationService.toVttMapOrNull`을 통과하되, `SessionsService` 내부 raw `flags.vttMap` 접근 위치를 한 곳으로 모았다.
- 확인:
  - `sessions.service.ts`의 `flags.vttMap` 직접 접근은 `readRuntimeVttMapFromFlags` helper 내부로 제한됐다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과했다.
- 후속:
  - `MapPositionService.createRuntimeMapFromFlagsJson`는 룰 런타임용 별도 VTT projection이므로 현 상태에서는 유지한다. 다음 단계에서는 item runtime flags나 human GM flags처럼 여전히 raw namespace 접근이 넓은 영역을 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 149차 반영 상태

- 완료:
  - `ActionProcessorService.recoverLongRestItemCharges`가 `flags.p3ItemRuntime`과 `chargesByItemEntryId`를 직접 record로 해석하고 있었다.
  - 기존 목적별 decoder인 `parseP3ItemRuntimeFlags`와 `P3_ITEM_RUNTIME_FLAGS_KEY`를 사용하도록 바꿔, long rest item charge recovery도 malformed item runtime flags를 같은 계약으로 정리하게 했다.
  - item runtime flags write도 문자열 literal `p3ItemRuntime` 대신 key 상수를 사용하도록 맞췄다.
- 확인:
  - 비테스트 actions 소스에서 `rawRuntime`/`flags.p3ItemRuntime` 직접 접근은 사라졌다.
  - item runtime flags 소비자는 `ActionsService`와 `ActionProcessorService` 모두 `parseP3ItemRuntimeFlags`를 통과한다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과했다.
- 후속:
  - 남은 raw flags 접근 중 human GM messages/notes/suggestions와 map runtime처럼 namespace별 store가 이미 있는 영역을 이어서 owner helper로 모은다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 150차 반영 상태

- 완료:
  - human GM AI assist suggestions는 store decoder를 통과하고 있었지만, `SessionsService`가 `list(...).find(...)` 조회 조건을 반복하고 있었다.
  - `SessionHumanGmAiAssistSuggestionStoreService.findById(flags, suggestionId)`를 추가해 특정 suggestion 조회도 owner store를 통하도록 정리했다.
  - `acceptHumanGmAiAssistSuggestion`, `reportHumanGmAiAssistApplicationFailure`의 suggestion 조회는 `getHumanGmAiAssistSuggestion` wrapper를 통해 store `findById`를 사용한다.
- 확인:
  - 비테스트 sessions 소스에서 `humanGmAiAssistSuggestions` raw 배열 접근은 store 내부로만 제한됐다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과했다.
- 후속:
  - `gmMessages`, `gmPrivateNotes`도 이미 store 내부로 배열 접근이 제한되어 있는지 최종 분류하고, 남은 flags namespace 중 campaign archive/economy/calendar처럼 도메인 store가 있는 영역을 계속 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 151차 반영 상태

- 완료:
  - `gmMessages`, `gmPrivateNotes`, `humanGmAiAssistSuggestions`의 raw 배열 접근은 각각 store 내부로 제한된 상태임을 확인했다.
  - `p6CharacterTransferRequests`는 runtime parser와 request store가 분리되어 있었지만, approve/reject 흐름에서 `findIndex` 조회가 반복되고 있었다.
  - `SessionCharacterTransferRequestStoreService.findByIdWithIndex`를 추가하고 `approveCharacterTransfer`, `rejectCharacterTransfer`가 이 helper를 사용하도록 전환했다.
- 확인:
  - `p6CharacterTransferRequests` raw 배열 접근은 `CampaignArchiveRuntimeService.parseCharacterTransferRequests`와 `SessionCharacterTransferRequestStoreService` 내부로 제한됐다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과했다.
- 후속:
  - campaign archive snapshot 생성 중 `campaignCalendar`/`economy` 하위 구조를 직접 `isRecord`로 만지는 부분은 각 domain runtime reader가 있는지 확인한 뒤 같은 방식으로 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 152차 반영 상태

- 완료:
  - `CampaignArchiveRuntimeService.buildCampaignArchiveSnapshot`와 `countCompletedDowntimeTasks`가 `campaignCalendar`/`economy` flags 하위 구조를 직접 읽고 있었다.
  - `CAMPAIGN_CALENDAR_FLAGS_KEY`, `ECONOMY_FLAGS_KEY` 상수를 사용하도록 바꾸고, archive용 요약을 `summarizeArchiveCalendarFlags`, `summarizeArchiveEconomyFlags` helper로 분리했다.
  - archive snapshot 생성 경계에서 calendar/economy raw 하위 구조 접근 위치가 helper 내부로 모였다.
- 확인:
  - `campaign-archive-runtime.service.ts`에서 `flags.campaignCalendar`/`flags.economy` 직접 접근은 제거됐고, key 상수 기반 helper를 통한다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과했다.
- 후속:
  - archive snapshot 내부 저장값 복원(`parseCampaignArchiveSnapshot`)은 이미 snapshot 자체를 별도 decoder처럼 다루지만, 더 세분화할 수 있는 nested summary helper가 있는지 계속 확인한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 153차 반영 상태

- 완료:
  - `CampaignArchiveRuntimeService.parseCampaignArchiveSnapshot`의 downtime/economy/inventory/combat nested summary 복원을 각각 helper로 분리했다.
  - `parseArchiveCalendarSummary`, `parseArchiveEconomySummary`, `parseArchiveInventorySummary`, `parseArchiveCombatSummary`가 각 summary shape를 담당한다.
  - snapshot 값이 record가 아닐 때 쓰는 fallback도 `emptyArchiveCalendarSummary`, `emptyArchiveEconomySummary`, `emptyArchiveInventorySummary`로 분리했다.
- 확인:
  - archive snapshot nested field 접근은 `parseCampaignArchiveSnapshot` 본문에 몰려 있지 않고 summary helper를 통한다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과했다.
- 후속:
  - 이제 남은 `parseJsonRecordOrFallback` 사용처 중 대부분은 `flagsJson` open-ended 처리다. 다음에는 전체 목록을 다시 뽑아, 목적별 decoder로 더 줄일 수 있는 마지막 비-flags 후보가 있는지 확인한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 154차 반영 상태

- 완료:
  - `SessionCompletionFlagStoreService`의 `completedCombatNodeIds` flags 접근을 상수 기반으로 정리했다.
  - `readCompletedCombatNodeIds`가 `Record<string, unknown>` 전제를 요구하지 않고 `unknown`을 받아 record 여부와 string 배열 여부를 직접 좁히도록 바꿨다.
  - 전투 시작/완료, main command 전환 판정에서 쓰는 완료 combat node id 배열의 런타임 검증 책임을 completion flag store에 더 명확히 모았다.
- 확인:
  - `readCompletedCombatNodeIds` 호출부는 기존처럼 record flags를 넘겨도 동작하지만, 잘못된 값이 들어와도 빈 배열로 복구된다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과해야 한다.
- 후속:
  - 남은 raw flags 접근 중 `p6CampaignArchive`, `p6CharacterTransferRequests`, `humanGmAiAssistSuggestions`처럼 namespace별 store/parser가 있는 항목과 단순 open-ended 조건 평가 항목을 계속 분리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 155차 반영 상태

- 완료:
  - campaign archive flags namespace의 실제 저장 키를 `P6_CAMPAIGN_ARCHIVE_FLAG`, `P6_CHARACTER_TRANSFER_REQUESTS_FLAG` 상수로 분리했다.
  - `CampaignArchiveRuntimeService.parseCampaignArchive`, `parseCharacterTransferRequests`가 두 상수로 flags 값을 읽도록 바꿨다.
  - `SessionCampaignArchiveFlagStoreService`, `SessionCharacterTransferRequestStoreService`도 같은 상수로 flags 값을 쓰도록 정리했다.
- 확인:
  - archive runtime/parser와 request store의 읽기/쓰기 키가 동일 상수를 공유한다.
  - audit log diff의 `p6CampaignArchive`는 persisted flags가 아니라 로그 payload shape라 이번 범위에서는 유지했다.
- 후속:
  - 남은 `flags.<key>`/`flags[KEY]` 접근 중 실제 open-ended 조건 평가(`FLAG_SET`)와 도메인 namespace를 계속 구분한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 156차 반영 상태

- 완료:
  - Human GM flags store의 `gmMessages`, `gmPrivateNotes`, `humanGmAiAssistSuggestions` 저장 키를 각 store 내부 상수로 분리했다.
  - `SessionHumanGmMessageStoreService.list`, `SessionHumanGmPrivateNoteStoreService.list/listNewestFirst`, `SessionHumanGmAiAssistSuggestionStoreService.list/findById`가 `Record<string, unknown>` 전제를 요구하지 않고 `unknown`을 받아 record 여부를 먼저 검증하도록 바꿨다.
  - append/markAccepted 경로도 같은 키 상수를 사용해 읽기/쓰기 키 불일치 위험을 줄였다.
- 확인:
  - 세 store 모두 잘못된 flags 값이 들어오면 빈 배열로 복구하고, 배열 항목은 기존 DTO guard를 통과한 값만 반환한다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과해야 한다.
- 후속:
  - `combat-reaction`, `combat-monster-resource`, `combat-spell`처럼 flags namespace별 service가 이미 있는 영역에서 reader 입력을 `unknown`으로 더 좁힐 수 있는지 확인한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 157차 반영 상태

- 완료:
  - `CombatReactionService.hasPendingCombatReaction`이 `pendingCombatReaction`의 단순 truthy 여부가 아니라 `readPendingCombatReaction` guard 결과를 보도록 바꿨다.
  - `consumePendingCombatReaction`도 같은 reader를 재사용한다.
  - `isPendingCombatReaction`은 공통 필드(`id`, `sessionId`, `combatId`, `roundNo`, `turnNo`, `createdAt`)와 reaction 타입별 필수 필드를 최소 검증한다.
- 확인:
  - 손상된 pending reaction flags 값은 자동 턴 진행 차단 조건이나 consume 반환값으로 들어가지 않고, 기존 not found 흐름으로 정리된다.
  - 이번 변경 파일의 `git diff --check`는 줄끝 경고 외 문제 없이 통과해야 한다.
- 후속:
  - `combat-monster-resource`의 recharge/limited-use flags reader와 `combat-spell`의 spell slot reader처럼 이미 domain reader가 있는 곳을 계속 `unknown` 경계 중심으로 점검한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 158차 반영 상태

- 완료:
  - `SpellSlotService`에 `SPELL_SLOTS_BY_SESSION_CHARACTER_ID_FLAG`와 `readSpellSlotsFromFlags(flags: unknown)`를 추가했다.
  - `ActionProcessorService`, `CombatSpellService`, `CombatMapperService`의 spell slot flags 읽기는 raw `flags.spellSlotsBySessionCharacterId` 접근 대신 `readSpellSlotsFromFlags`를 통하도록 바꿨다.
  - spell slot flags 쓰기 경로도 같은 상수 computed key를 사용하도록 정리했다.
- 확인:
  - 비테스트 action/combat 소스에서 raw `flags.spellSlotsBySessionCharacterId` 접근은 제거됐다.
  - 손상된 spell slot flags는 `SpellSlotService`의 record/slot-level/remaining-count 검증을 통과한 값만 도메인 로직으로 들어간다.
- 후속:
  - 남은 flags 접근 중 `combat-monster-resource`처럼 이미 parser가 충분한 곳과 `main-command-transition`의 open-ended `FLAG_SET`처럼 의도적으로 동적인 곳을 분리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 159차 반영 상태

- 완료:
  - `CombatMonsterResourceService`에 `readMonsterRechargeExpendedFromFlags(flags: unknown)`, `readMonsterLimitedUseExpendedFromFlags(flags: unknown)`를 추가했다.
  - monster recharge/limited-use flags 읽기 경로가 raw `flags[MONSTER_*_EXPENDED_FLAG]` 접근 대신 서비스 reader를 통하도록 정리됐다.
  - `CombatMonsterActionService.resolveMonsterActionUnavailableReason`도 같은 reader를 사용한다.
- 확인:
  - 손상된 monster resource flags는 기존 `parseMonsterRechargeExpended`, `parseMonsterLimitedUseExpended` guard를 통과한 항목만 가용성 판정에 들어간다.
  - 쓰기 경로는 기존 constants key를 유지하되, 읽기 경계는 service reader로 모였다.
- 후속:
  - 남은 `flags[KEY]` 접근 중 ready action처럼 이미 domain service reader가 있는 영역과 `FLAG_SET`처럼 동적 조건 평가로 남겨야 하는 영역을 최종 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 160차 반영 상태

- 완료:
  - `ReadyActionService`에 `readPendingReadyActionsFromFlags(flags: unknown)`, `readTriggeredReadyActionsFromFlags(flags: unknown)`를 추가했다.
  - `ActionProcessorService`, `CombatMapperService`, `CombatService`의 ready action flags 읽기 경로가 raw `flags[PENDING_READY_ACTIONS_FLAG]`, `flags[TRIGGERED_READY_ACTIONS_FLAG]` 대신 service reader를 통하도록 정리됐다.
  - ready action 저장 경로는 기존 constants key를 유지해 쓰기 shape는 바꾸지 않았다.
- 확인:
  - 비테스트 action/combat 소스에서 raw ready action flags 읽기 패턴은 제거됐다.
  - 손상된 ready action 배열은 `ReadyActionService`의 pending/triggered guard를 통과한 항목만 도메인 로직으로 들어간다.
- 후속:
  - 남은 flags 접근 중 `P3_ITEM_RUNTIME_FLAGS_KEY`, VTT map, campaign archive summary처럼 각 domain parser 내부에서 의도적으로 읽는 영역과 `FLAG_SET` 동적 조건 평가를 계속 구분한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 161차 반영 상태

- 완료:
  - `parseP3ItemRuntimeFlagsFromFlags(flags: unknown)`를 추가해 P3 item runtime flags 읽기 경계를 parser 내부로 모았다.
  - `ActionsService`, `ActionProcessorService`의 P3 item runtime 읽기는 raw `flags[P3_ITEM_RUNTIME_FLAGS_KEY]` 대신 새 helper를 통하도록 바꿨다.
  - `SessionVttMapNormalizationService`에 `VTT_MAP_FLAGS_KEY`, `toVttMapFromFlags(flags: unknown)`를 추가하고, `SessionsService.readRuntimeVttMapFromFlags`가 raw `flags.vttMap` 대신 normalization reader를 사용하도록 바꿨다.
- 확인:
  - P3 item runtime과 VTT map 모두 손상된 flags 값이 들어오면 각 domain parser/normalizer에서 빈 runtime 또는 null로 복구된다.
  - 저장 경로는 기존 key를 유지하고, 읽기 경계만 domain helper로 모았다.
- 후속:
  - 남은 raw flags 접근은 campaign archive/calendar/economy summary처럼 helper 내부에서 의도적으로 읽는 영역과 `main-command-transition`의 `FLAG_SET` 동적 조건 평가 중심으로 재분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 162차 반영 상태

- 완료:
  - `clearRestBoundMonsterLimitedUsesFromFlags(flags: unknown, restKind)`를 추가했다.
  - `ActionProcessorService`의 short/long rest monster limited-use recovery가 raw `flags[MONSTER_LIMITED_USE_EXPENDED_FLAG]` 대신 flags 전체를 service wrapper에 넘기도록 바뀌었다.
- 확인:
  - rest recovery 호출부는 monster limited-use flags key를 직접 읽지 않고, 손상된 값은 기존 recovery guard에서 `{ changed: false, hasFlag: false }` 또는 정리된 value로 복구된다.
  - 쓰기 경로는 기존 constants key를 유지해 persisted shape는 바꾸지 않았다.
- 후속:
  - 남은 raw flags 접근은 domain parser 내부 접근과 동적 조건 평가(`FLAG_SET`) 여부를 기준으로 분류하고, 더 옮길 수 있는 호출부만 계속 줄인다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 163차 반영 상태

- 완료:
  - `domain.mapper.ts`의 level-up preview flags 접근을 `LEVEL_UP_PREVIEW_FLAGS`, `readRecordFlag` helper로 모았다.
  - public game state 응답 projection에서 제거하는 private flags key를 `PRIVATE_GAME_FLAG_KEYS` set으로 분리했다.
  - `stripPrivateGameFlags`가 destructuring에 박힌 문자열 대신 key set 기반 필터를 사용하도록 바꿨다.
- 확인:
  - character level-up preview에서 archive/calendar/economy flags는 record guard를 통과한 값만 사용한다.
  - public game state 응답에서 감추는 flags 목록이 한 곳에 모여, 서버 응답 구조 의존성이 더 명확해졌다.
- 후속:
  - 남은 raw flags 접근은 대부분 domain parser 내부 또는 동적 `FLAG_SET` 평가다. 다음에는 `parseJsonRecordOrFallback` 사용처를 다시 분류해 진짜 호출부 경계인지, parser 내부 경계인지 나눈다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 164차 반영 상태

- 완료:
  - `AiClient.attemptPostJson`이 `response.json()` 결과를 `unknown` 변수에 담은 뒤 endpoint decoder에 넘기도록 바꿨다.
  - `staticSrd.fetchStaticAsset`도 정적 JSON 응답을 `unknown`으로 캐시한 뒤 각 catalog decoder를 통과한다.
  - `RulebookPage`의 static rulebook export 로더도 `response.json()` 결과를 `unknown`으로 좁힌 뒤 `decodeStaticRulebookExport`에 넘긴다.
- 확인:
  - `response.json(): any`가 decoder 인자에 직접 들어가던 외부/정적 JSON ingress를 줄였다.
  - 실패 시 기존 AI `BadGatewayException`, 정적 SRD/rulebook 오류 흐름은 유지된다.
- 후속:
  - 남은 `response.json()`은 `httpClient`와 OAuth helper처럼 이미 `unknown` 변수 또는 decoder helper를 통과하는 경로인지 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 165차 반영 상태

- 완료:
  - `useCombatReactionAutoHandler`의 `trpg:combat-reaction-prompt` CustomEvent 소비 경계를 `decodeCombatReactionPrompt`로 전환했다.
  - 기존 최소 필드 type guard 대신 shared-types decoder를 통과한 `CombatReactionPromptDto`만 자동 반응 처리로 들어간다.
- 확인:
  - Socket payload는 `realtime.ts`의 `decodeCombatReactionPromptEvent`를 통과하고, 브라우저 CustomEvent 재전달 후 소비 지점에서도 같은 계열 decoder를 다시 통과한다.
  - 손상된 `event.detail`은 자동 반응 제출로 이어지지 않는다.
- 후속:
  - 남은 CustomEvent 소비 경로는 `trpg:combat-updated`처럼 이미 decoder를 통과하는지, auth token 이벤트처럼 field guard가 충분한지 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 166차 반영 상태

- 완료:
  - `combatResultPresentation`의 전투 응답/행동 결과/반응 prompt 판정을 shared-types decoder 기반으로 전환했다.
  - `getCombatReactionPrompts`가 `pendingReaction`/`pendingReactions` 후보를 얕은 필드 체크로 통과시키지 않고 `decodeCombatReactionPrompt` 성공값만 반환하게 했다.
  - `useCombatRequestRunner`에서 별도 pending reaction 컨테이너 guard와 강제 구조 좁힘을 제거하고, unknown result를 decoder 기반 유틸에 넘기도록 단순화했다.
- 확인:
  - 전투 요청 후 자동 반응 처리 경로가 `id/type/reactorParticipantId/message` 일부 필드만 맞는 객체를 더 이상 DTO로 취급하지 않는다.
  - `CombatActionResultDto` 판정도 `combat`, `message`만 보는 방식이 아니라 `decodeCombatActionResult`의 `combat/map/pendingReactions` 검증을 통과해야 한다.
- 후속:
  - 같은 패턴의 로컬 guard가 남아 있는 화면/훅을 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 167차 반영 상태

- 완료:
  - 프론트 access token payload decoder를 `sub`, `type: "access"`, `exp` 필수 검증으로 좁혔다.
  - `loadStoredToken`이 localStorage의 손상된 token을 그대로 복원하지 않고, access token payload 파싱 실패 시 저장값을 제거하게 했다.
  - `useAuth`의 `trpg:auth-expired`, `trpg:auth-token-reissued` CustomEvent 소비 경계를 명명 decoder로 분리했다.
  - token reissued 이벤트는 `accessToken` 문자열 여부뿐 아니라 access token payload가 파싱되는 경우에만 상태에 반영한다.
- 확인:
  - localStorage에 임의 문자열이나 `exp/type/sub`가 빠진 JWT가 남아 있어도 회원 인증 상태로 바로 복원되지 않는다.
  - 외부 스크립트나 손상된 이벤트가 `auth-token-reissued`를 dispatch해도 유효한 access token payload가 아니면 저장/상태 갱신으로 이어지지 않는다.
- 후속:
  - OAuth callback/localStorage provider 값과 editor draft 저장소 쪽도 같은 기준으로 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 168차 반영 상태

- 완료:
  - OAuth callback provider 저장소 접근을 `storage.ts`의 `loadStoredOAuthProvider`/`saveStoredOAuthProvider`/`clearStoredOAuthProvider`로 캡슐화했다.
  - `loadStoredOAuthProvider`가 `kakao`/`discord` 외 값을 발견하면 즉시 제거하고 `null`을 반환하게 했다.
  - `App`의 OAuth callback 처리와 로그인 시작 흐름에서 `trpg.oauthProvider` raw localStorage key 직접 접근을 제거했다.
- 확인:
  - 손상되거나 임의로 주입된 OAuth provider 값은 `auth.handleOAuthCallback`까지 전달되지 않는다.
  - App 컴포넌트는 저장소에서 읽은 문자열을 직접 union 타입으로 믿지 않고, storage decoder가 반환한 `OAuthProvider | null`만 사용한다.
- 후속:
  - editor draft 저장소와 battle map debug/snapshot localStorage 직접 접근을 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 169차 반영 상태

- 완료:
  - 백엔드 OAuth upstream decoder에서 optional field가 잘못된 타입일 때 조용히 무시하지 않고 인증 오류로 거부하게 했다.
  - Kakao user `id`는 non-empty string 또는 integer number만 허용하도록 좁혔다.
  - Kakao `kakao_account`, `profile`, `properties`가 존재할 경우 object인지 검증하고, Discord/Kakao optional string/number/boolean 필드도 존재하면 타입 검증을 통과해야 한다.
- 확인:
  - OAuth provider 응답 구조가 바뀌거나 일부 필드가 잘못된 타입으로 오면 도메인 사용자 생성/연결 로직까지 들어가지 않는다.
  - 기존 필수 필드인 token `access_token`, Kakao/Discord user `id` 검증 흐름은 유지하면서 선택 필드의 침묵하는 fallback을 줄였다.
- 후속:
  - OAuth DTO 본문(`code`, `redirectUri`) nested validation과 controller query enum 변환 경계를 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 170차 반영 상태

- 완료:
  - `ScenariosService.normalizeNodeInputs`가 `ScenarioNodeInputDto[]` 타입만 믿고 `title.trim()`/`sceneText.trim()`/JSON stringify로 바로 들어가던 경계를 service-level decoder로 보강했다.
  - scenario node 입력의 `title`, `sceneText`, `nodeType`, nullable string 필드를 저장 직전에 재검증하고, `checkOptions`/`vttMap`/`transitions`/`clues`/`nodeMeta`는 shared decoder를 통과한 값만 DB JSON으로 저장한다.
  - 잘못된 중첩 node payload는 내부 TypeError나 손상 JSON 저장 대신 `BadRequestException`으로 거부된다.
- 확인:
  - create/update scenario 모두 `normalizeNodeInputs`를 거치므로 같은 검증 경로를 공유한다.
  - scenario node의 전투/VTT map, transition, clue, nodeMeta 입력은 기존 response/DB JSON decoder와 같은 계열 검증 함수를 사용한다.
- 후속:
  - scenario 최상위 `npcs`, publish/moderation DTO, session VTT map update DTO의 중첩 입력 경계를 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 171차 반영 상태

- 완료:
  - `ScenariosService.createScenario`/`updateScenario`의 최상위 `npcs` 저장 경계를 `decodeScenarioNpcsInput`으로 보강했다.
  - `dto.npcs`를 바로 `JSON.stringify`하지 않고, `decodeScenarioNpcArray`를 통과한 값만 `npcsJson`에 저장한다.
  - 응답용 decoder가 잘못된 NPC 항목을 필터링하는 복구 동작을 입력 경계에서는 실패로 해석하도록, 입력 배열 길이와 decode 결과 길이가 다르면 `BadRequestException`을 던진다.
- 확인:
  - 시나리오 생성/수정 모두 같은 `scenario.npcs` 검증 경로를 공유한다.
  - 손상된 NPC 항목이 조용히 누락되거나 원본 그대로 DB JSON에 저장되는 위험을 줄였다.
- 후속:
  - publish/moderation DTO와 session VTT map update DTO의 중첩 입력 경계를 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 172차 반영 상태

- 완료:
  - session VTT map 전체 업데이트 입력을 `decodeVttMapState` 기반 `normalizeInputVttMap`으로 보강했다.
  - legacy `SessionsService.updateVttMap`과 GM `MapRuntimeService.updateGmVttMap` 모두 `dto.map`을 바로 normalize하지 않고, shared decoder 통과 후 정규화한다.
  - token move/ping/map interaction 좌표 입력은 finite number 검증을 통과한 뒤 `Math.floor`/clamp 처리로 들어가게 했다.
- 확인:
  - 잘못된 `map`, `to`, `x/y`, `mapPoint` payload는 NaN 좌표나 손상된 VTT map으로 이어지지 않고 `BadRequestException`으로 거부된다.
  - map update 경로가 FE/BE 공통 `VttMapStateDto` decoder를 공유한다.
- 후속:
  - publish/moderation DTO와 기타 session command DTO의 중첩 입력 경계를 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 173차 반영 상태

- 완료:
  - campaign archive inventory summary가 DB JSON을 `Record<string, unknown>[]`로 받은 뒤 reducer에서 직접 `quantity`를 읽던 경계를 제거했다.
  - archive inventory JSON은 `decodeArchiveInventorySummaryItems`에서 `ArchiveInventorySummaryItem[]`으로 변환되고, `quantity`는 1 이상 정수일 때만 보존하며 나머지는 기존 호환 fallback인 1로 정규화한다.
  - `countArchiveInventoryItems`는 더 이상 raw record의 동적 필드를 직접 읽지 않고 검증된 summary item의 `quantity`만 합산한다.
- 확인:
  - 비배열 archive inventory JSON은 기존처럼 fallback 빈 배열로 복구된다.
  - 배열 안의 비객체 항목은 summary 계산에서 제외되고, 객체 항목의 잘못된 수량은 NaN/문자열 계산으로 이어지지 않는다.
- 후속:
  - campaign calendar/economy summary처럼 flags 내부 배열을 `filter(isRecord)`로만 통과시키는 경계를 계속 목적별 summary DTO로 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 174차 반영 상태

- 완료:
  - campaign archive calendar summary가 `downtimeTasks.filter(isRecord)`로 raw task record를 통과시킨 뒤 `status/id`를 직접 읽던 경계를 제거했다.
  - archive summary에 필요한 최소 타입 `ArchiveDowntimeSummaryTask`를 두고, `decodeArchiveDowntimeSummaryTasks`에서 `id` 문자열과 `active | paused | completed` 상태만 통과시키도록 했다.
  - `summarizeArchiveCalendarFlags`는 검증된 downtime summary task 배열만 대상으로 active/paused/completed count와 task id 목록을 계산한다.
- 확인:
  - 손상된 downtime task 항목이나 알 수 없는 status 값은 summary count에 반영되지 않는다.
  - `taskIds`는 더 이상 raw record에서 동적 필드를 map/filter로 읽지 않고, decoder가 보장한 문자열 id만 사용한다.
- 후속:
  - campaign archive characters summary와 economy summary의 raw record/array 경계를 계속 목적별 DTO로 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 175차 반영 상태

- 완료:
  - campaign archive response flags의 `characters` 배열을 `filter(isRecord).map(...).filter(...)` 체인으로 처리하던 경계를 제거했다.
  - `decodeArchiveCharacterEntries`를 추가해 `sessionCharacterId`, `characterId`, `userId`가 모두 non-empty string인 항목만 `ArchiveCharacterEntry`로 변환한다.
  - `name`, `className`, `subclassName`, `level`, `status`는 기존 archive 호환 fallback을 유지하되, level은 1-20 정수일 때만 보존한다.
- 확인:
  - 손상된 archive character 항목은 빈 id fallback 객체를 만든 뒤 후단 filter로 제거되지 않고, decoder 단계에서 바로 제외된다.
  - `parseCampaignArchive`의 `characters` 반환값은 raw record 배열이 아니라 DTO shape로 좁혀진 배열이다.
- 후속:
  - campaign archive economy summary의 party stash 등 내부 배열/record count 경계를 목적별 summary decoder로 계속 좁힌다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 176차 반영 상태

- 완료:
  - campaign archive economy summary가 `partyStash.length`와 `Object.keys(...)`로 raw 배열/record 개수를 그대로 세던 경계를 제거했다.
  - `summarizeArchiveEconomyState`, `countArrayValues`, `countRecordValues`를 추가해 archive summary에 필요한 최소 shape를 만족하는 economy 값만 count에 포함하도록 했다.
  - party stash item은 `itemDefinitionId`와 1 이상 정수 `quantity`, wallet은 통화 필드의 non-negative finite number, shop/crafting/downtime completion은 summary count에 필요한 최소 필드를 확인한다.
- 확인:
  - 손상된 economy namespace가 있으면 기존처럼 `hasEconomyState: false`와 0 count로 복구된다.
  - economy namespace가 record여도 내부 배열/record 값이 최소 shape를 만족하지 않으면 archive summary count에 포함되지 않는다.
- 후속:
  - archive summary count helper는 전체 economy state 복원이 아니라 count 목적 검증이다. 전체 상태 복원이 필요한 경로는 `EconomyStateRuntimeService`의 state validator와 기준을 계속 맞춘다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 177차 반영 상태

- 완료:
  - `domain.mapper`의 level-up preview context가 campaign calendar `downtimeTasks`를 `filter(isRecord)`로 통과시킨 뒤 `status`를 직접 읽던 경계를 제거했다.
  - preview에 필요한 최소 타입 `LevelUpPreviewDowntimeTaskSummary`와 decoder를 두고 `active | paused | completed` 상태만 count에 포함하도록 했다.
  - `scenarios.service`의 scenario node mutation VTT map 변환은 이미 `VttMapStateDto` decoder를 통과한 `tokens`를 raw record로 다시 필터링하지 않고, typed token 배열을 그대로 image URL 보정 mapper에 넘긴다.
  - `ScenarioEditorPage`의 transition requirement 복원은 `filter(isRecord)` 체인 대신 `mapTransitionRequirement(value: unknown)`에서 직접 record guard를 수행하고 invalid 항목을 제외한다.
- 확인:
  - 이번 범위의 `filter(isRecord)` 검색 hit는 제거됐고, 각 경계는 목적별 summary/mapper 함수 이름으로 드러난다.
  - scenario VTT token 변환은 `decodeVttMapState` 이후의 typed DTO를 다시 약한 record 배열로 낮추지 않는다.
- 후속:
  - 남은 `parseJsonRecordOrFallback(flagsJson)` 사용처는 flags 최상위 namespace reader인지, 내부 shape를 직접 읽는 경계인지 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 178차 반영 상태

- 완료:
  - Human GM AI assist suggestion flags store가 저장 JSON 항목을 local `isSuggestion` 타입가드로 중복 검증하던 경계를 공용 `decodeHumanGmAiAssistSuggestion` 기반 복원으로 바꿨다.
  - Human GM private note flags store도 local `isNote` 타입가드 대신 공용 `decodeHumanGmPrivateNote`를 항목별로 적용한다.
  - 기존 호환 정책은 유지해 배열 전체를 실패시키지 않고, 손상된 항목만 제외한다.
- 확인:
  - BE flags store와 FE/API response decoder가 Human GM suggestion/private note 필드 규칙을 공유한다.
  - 저장 flags에 오래된/손상된 항목이 섞여도 유효한 항목은 계속 복구된다.
- 후속:
  - Human GM message store처럼 아직 공용 DTO decoder가 없는 저장 flags 배열은 DTO 승격 또는 store 전용 decoder 명명화를 계속 진행한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 179차 반영 상태

- 완료:
  - Human GM message flags store의 저장 메시지 복원을 `isMessage` 타입가드 통과 방식에서 `decodeHumanGmStoredMessage` 명명 decoder로 바꿨다.
  - 저장 메시지는 요청 DTO인 `HumanGmMessageDto`와 shape가 다르므로 공용 API decoder로 억지 통합하지 않고, store 전용 decoder에서 `id/type/speakerName/content/createdAt/authorUserId`를 확인한 뒤 새 객체로 재구성한다.
  - 기존 복구 정책은 유지해 손상된 message 항목만 제외하고 유효한 항목은 계속 반환한다.
- 확인:
  - `SessionHumanGmMessageStoreService.list`는 더 이상 원본 record를 타입가드로만 믿지 않고, decoder가 만든 `HumanGmStoredMessage` 배열만 반환한다.
  - Human GM suggestion/private note는 공용 decoder, message는 저장 전용 decoder로 각 shape의 실제 소유권이 드러난다.
- 후속:
  - 남은 flags store들도 공용 response DTO와 같은 shape인지, 저장 전용 shape인지 구분해 공용 decoder 재사용 또는 store 전용 decoder 명명화로 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 180차 반영 상태

- 완료:
  - completed combat node ids flags store가 `Array.isArray(...).filter((entry): entry is string => ...)`로 익명 복원하던 경계를 `decodeCompletedCombatNodeIds` 명명 decoder로 바꿨다.
  - `readCompletedCombatNodeIds`는 flags top-level record만 확인한 뒤, 해당 namespace 값은 전용 decoder에 맡긴다.
  - 기존 호환 정책은 유지해 비배열 값은 빈 배열로 복구하고, 배열 안의 비문자열 항목만 제외한다.
- 확인:
  - combat completion guard, main-command screen projection, progress evidence, transition evaluator가 모두 같은 `readCompletedCombatNodeIds` 경로를 계속 사용한다.
  - 완료 node id flags의 저장 구조가 “문자열 배열”이라는 사실이 함수 이름과 반환 타입에 드러난다.
- 후속:
  - 남은 flags namespace도 단순 string-array, DTO-like array, domain record store로 분류해 decoder 이름을 붙인다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 181차 반영 상태

- 완료:
  - SRD equipment JSONL loader에서 `map(parse).filter(record is ...)`로 nullable 중간값을 만들던 흐름을 `decodeSrdEquipmentLineOrEmpty`로 바꿨다.
  - equipment `contents`와 weapon `properties` 복원도 `map(decode).filter(non-null)` 대신 `decodeEquipmentContents`, `decodeEquipmentProperties` helper가 `flatMap`으로 유효 항목만 반환하도록 정리했다.
  - 정적 SRD 데이터 경계는 기존처럼 손상된 line/항목만 제외하되, nullable 중간 배열을 후단 타입가드에 맡기지 않는다.
- 확인:
  - SRD equipment 파일은 이미 `parseJsonWithDecoder`를 사용하고 있으며, 이번 변경은 decoder 결과를 명명 helper로 재구성하는 범위에 한정했다.
  - pack contents와 weapon properties는 여전히 기존 필드 정책을 유지한다.
- 후속:
  - seed/static 데이터 decoder는 런타임 외부 입력과 구분하되, nullable filter 체인이 반복되는 곳은 같은 방식으로 명명 helper로 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 182차 반영 상태

- 완료:
  - 공용 API decoder의 scenario check option, transition, clue, NPC 배열 복원에서 반복되던 `map(decode).filter(Boolean type guard)` 패턴을 `decodeLenientArray` helper로 통합했다.
  - 기존 정책처럼 배열 자체가 아니면 오류를 내고, 배열 안의 손상된 항목만 제외한다.
  - scenario 계열 공용 decoder가 nullable 중간값 배열을 만들지 않고, helper가 유효 DTO 항목만 반환한다.
- 확인:
  - `decodeScenarioCheckOptionArray`, `decodeScenarioTransitionArray`, `decodeScenarioClueArray`, `decodeScenarioNpcArray`가 동일한 lenient item 정책을 공유한다.
  - 프론트/백엔드가 함께 쓰는 shared decoder 경계의 동작은 유지하되, 반복된 type predicate 필터를 줄였다.
- 후속:
  - shared decoder의 다른 lenient array 복원도 “전체 실패”가 맞는지 “항목별 제외”가 맞는지 구분해 helper 재사용 여부를 결정한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 183차 반영 상태

- 완료:
  - 프론트 `useSessionStateFlagsProjection`의 economy/calendar flags projection에서 반복되던 `map(...null).filter(non-null)` 체인을 `compactMap` helper로 통합했다.
  - party stash, wallet, shop inventory, crafting progress, schedule response, schedule proposal, timeline, downtime task projection은 기존처럼 손상된 항목만 제외하되 nullable 중간 배열을 후단 type predicate에 맡기지 않는다.
  - `sessionStateFlags.ts`의 completed combat node ids도 서버 store와 같은 `decodeCompletedCombatNodeIds` 명명 decoder로 정리했다.
- 확인:
  - 프론트 flags projection은 서버 flags의 부분 손상에 대해 기존 복구 정책을 유지한다.
  - completed combat node ids는 FE/BE 모두 문자열 배열 decoder 이름으로 동일한 의도를 드러낸다.
- 후속:
  - 프론트의 다른 localStorage/debug flag, static SRD fetch, custom event projection 경계도 공용 decoder가 있는지 먼저 확인하고, 없으면 목적별 helper를 둔다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 184차 반영 상태

- 완료:
  - `domain.mapper`의 DB JSON 복원 경계에서 반복되던 문자열 배열 type predicate 필터를 `decodeStringArray` helper로 모았다.
  - character inventory JSON의 `decodeInventoryItems`는 `map(decode).filter(non-null)` 대신 `flatMap`으로 유효한 `InventoryItemDto`만 반환한다.
  - inventory `properties`, condition `tags`, spell summary의 `spells/cantrips/preparedSpells`가 같은 string-array decoder를 공유한다.
- 확인:
  - 기존처럼 비배열 값은 빈 배열로 복구하고, 배열 안의 비문자열 항목은 제외한다.
  - character/session mapper가 DB JSON의 부분 손상에 대해 기존 복구 정책을 유지하면서 nullable 중간값 의존을 줄였다.
- 후속:
  - `characters.service`와 `character-equipment-loadout.service`의 중복 inventory decoder도 같은 정책으로 정리하거나 공용화 후보로 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 185차 반영 상태

- 완료:
  - `characters.service`의 inventory/spell DB JSON 복원에서 반복되던 string-array type predicate 필터를 `decodeOptionalStringArray` helper로 모았다.
  - inventory `properties`, `displayPropertyLabels`, character inventory spells의 `cantrips/spells/preparedSpells`가 같은 optional string-array 복구 정책을 사용한다.
  - `character-equipment-loadout.service`의 inventory `properties`와 `displayPropertyLabels`도 같은 `decodeOptionalStringArray` helper를 사용하게 했다.
- 확인:
  - 비배열 optional 필드는 기존처럼 빈 배열 또는 undefined로 복구된다.
  - 배열 안의 비문자열 항목은 제외되고, 유효 문자열 항목만 DTO로 전달된다.
- 후속:
  - character inventory decoder 중복은 파일별 정책이 더 안정화된 뒤 공용 helper/mapper로 승격할지 검토한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 186차 반영 상태

- 완료:
  - `CampaignCalendarRuntimeService.cloneEconomyState`가 economy flags를 복제하면서 `map(...null).filter(type predicate)`로 유효 항목을 고르던 경계를 `compactMap`/`compactRecord` helper로 통합했다.
  - party stash, shop state, crafting progress, downtime completion, shop inventory, downtime effect JSON object 배열이 같은 “손상 항목만 제외” 정책을 공유한다.
  - `cloneJsonObjectArray`도 `decodeJsonObject` 실패 항목을 `null`로 만든 뒤 type predicate로 제거하지 않고 `compactMap`으로 유효 `JsonObject`만 반환한다.
- 확인:
  - economy state 복원 정책은 기존처럼 잘못된 항목을 제외하고 유효 항목은 유지한다.
  - 저장 flags에서 읽은 economy 하위 record/array가 nullable 중간값에 의존하지 않고 명명 helper를 거친다.
- 후속:
  - 다른 runtime service의 `Object.entries(...).filter(entry is [string, number])` 숫자 record decoder도 목적별 helper로 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 187차 반영 상태

- 완료:
  - `SpellSlotService.readSpellSlotRecord`의 spell slot record 복원에서 `Object.entries(...).filter(entry is [string, number])` 타입 가드 의존을 제거했다.
  - slot level key는 기존처럼 `1`부터 `9`까지만 허용하고, 값은 0 이상의 정수일 때만 유지한다.
  - 손상된 slot entry는 기존 정책과 동일하게 제외하며, 유효한 entry만 `flatMap`으로 `Object.fromEntries`에 전달한다.
- 확인:
  - spell slot flags가 record가 아니면 빈 객체로 복구한다.
  - record 내부의 비정수, 음수, 비숫자, 범위 밖 slot key는 기존처럼 무시된다.
- 후속:
  - combat/action/session runtime의 `decodeNumberRecord`들도 목적별 키/값 정책을 확인한 뒤 같은 방식으로 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 188차 반영 상태

- 완료:
  - combat/action/session runtime의 `decodeNumberRecord` 계열에서 `Object.entries(...).filter(entry is [string, number])` 타입 가드 의존을 제거했다.
  - 대상은 `combat.service`, `combat-spell.service`, `action-spell-rule.service`, `action-rule.service`, `action-processor.service`, `session-vtt-object-runtime.service`다.
  - 각 decoder는 기존처럼 record가 아니면 파일별 정책에 따라 `{}` 반환 또는 파싱 오류를 유지하고, record 내부에서는 finite number 값만 보존한다.
  - `CombatNodeSurface`의 token movement range projection도 `map(...null).filter(entry is [string, number])` 대신 `flatMap`으로 유효 token id entry만 만든다.
- 확인:
  - 숫자 record의 key는 기존처럼 원본 문자열 key를 유지한다.
  - `NaN`, `Infinity`, 비숫자 값은 기존과 동일하게 제외된다.
  - 프론트 token movement projection은 token id가 없는 participant를 기존처럼 제외한다.
- 후속:
  - 남은 `map(...).filter(item is T)` 패턴 중 DB JSON/서버 응답 경계에 있는 항목을 우선 선별해 목적별 decoder나 `flatMap`으로 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 189차 반영 상태

- 완료:
  - `ActionRuleService.decodeInventoryItemsForRules`의 inventory JSON 복원에서 `map(decode).filter(item is InventoryItemForRules)` 체인을 제거했다.
  - 손상된 inventory item은 기존처럼 제외하되, decoder 결과를 `flatMap`으로 즉시 반영한다.
  - inventory `properties`도 문자열 항목만 보존하는 `decodeStringArray` helper를 거치게 했다.
- 확인:
  - inventory JSON이 배열이 아니면 기존처럼 파싱 오류를 낸다.
  - item이 record가 아니거나 `id`가 없으면 제외된다.
  - `properties` 배열 안의 비문자열 값은 기존처럼 제외된다.
- 후속:
  - `combat.service`의 inventory snapshot decoder와 조건/문자열 배열 type predicate도 같은 기준으로 계속 줄인다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 190차 반영 상태

- 완료:
  - `CombatService.removeExpiredConditionEntries`에서 condition key를 `map(...).filter(key is string)`으로 좁히던 흐름을 `flatMap`으로 정리했다.
  - `CombatService.decodeInventorySnapshotItem`의 inventory snapshot `properties`도 문자열 항목만 보존하는 `decodeStringArray` helper를 거치게 했다.
- 확인:
  - condition entry key가 파싱되지 않는 항목은 기존처럼 제거 key set에 들어가지 않는다.
  - inventory snapshot `properties` 배열 안의 비문자열 값은 기존처럼 제외된다.
  - snapshot item 자체의 부분 복구 정책은 유지된다.
- 후속:
  - `combat.service`에 남은 문자열 type predicate 중 서버 상태/DB JSON 복원 경계에 가까운 항목부터 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 191차 반영 상태

- 완료:
  - `CombatService`에 남아 있던 `filter((value): value is string => Boolean(value))` 계열 문자열 type predicate를 제거했다.
  - 이동/강제이동 메시지 조합은 `flatMap`으로 빈 메시지를 제외한다.
  - condition tag에서 숫자 캡처를 읽는 AC, HP, 이동속도, 집중 내성 보너스 계산은 `matchFirstGroup` helper를 거치게 했다.
  - rage 만료 처리의 DB 조회용 `sessionCharacterIds`도 `compactPresentStrings` helper로 null/빈 문자열을 제외한다.
- 확인:
  - 메시지 조합은 기존처럼 `null`과 빈 문자열을 제외한다.
  - 정규식 캡처가 없는 condition tag는 기존처럼 숫자 계산에서 제외된다.
  - `sessionCharacterId`가 없거나 빈 값인 participant는 기존처럼 rage 만료 DB 조회 대상에서 제외된다.
- 후속:
  - 다른 combat/action runtime 파일의 문자열 배열/메시지 조합 type predicate도 런타임 입력 경계 우선순위에 따라 같은 방식으로 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 192차 반영 상태

- 완료:
  - `CombatSpellService.readOptionalStringArray`와 `ActionSpellRuleService.readOptionalStringArray`의 spell list JSON 복원에서 문자열 배열 type predicate 필터를 제거했다.
  - `cantrips`, `spells`, `preparedSpells` optional 배열은 기존처럼 비배열이면 `undefined`로 두고, 배열 내부에서는 문자열 항목만 `flatMap`으로 보존한다.
- 확인:
  - spell list/spell inventory JSON이 `null`이면 기존처럼 `null`을 유지한다.
  - spell list object의 optional 배열 필드가 비배열이면 기존처럼 `undefined`가 된다.
  - 배열 안의 비문자열 값은 기존처럼 제외된다.
- 후속:
  - action/combat runtime의 남은 discriminated union type predicate 중 외부 입력 복원 경계와 단순 분기 보조용을 구분해, 복원 경계부터 decoder/helper로 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 193차 반영 상태

- 완료:
  - `CharacterSpellSelectionService.decodeStartingSpells`의 `spellsJson` 복원에서 `cantrips`, `spells`, `preparedSpells` 문자열 배열 type predicate 필터를 `decodeSpellIdArray` helper로 대체했다.
  - `CharacterEquipmentLoadoutService.resolveArmorClass`의 armor AC 후보 계산에서 `number | null` 중간 배열을 만들지 않도록 `flatMap`으로 정리했다.
  - `CharacterEquipmentLoadoutService.validateInventoryAndEquippedWeapon`의 `itemDefinitionId` 검증 배열과 inventory search key 조립도 nullable 문자열 type predicate 없이 복원한다.
- 확인:
  - `spellsJson`의 `cantrips`와 `spells` 필수 배열 검증은 유지된다.
  - optional `preparedSpells`가 비배열이면 기존처럼 `undefined`다.
  - armor item이 shield이거나 AC를 계산할 수 없으면 기존처럼 armor 후보에서 제외된다.
  - 빈 `itemDefinitionId`와 빈 search key 조각은 기존처럼 제외된다.
- 후속:
  - sessions/rules 쪽 저장 JSON 복원 경계의 `filter(... is string)` 후보를 계속 줄인다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 194차 반영 상태

- 완료:
  - `CampaignArchiveRuntimeService.parseCampaignArchive`의 `finalRewardIds` 복원에서 문자열 배열 type predicate 필터를 `decodeStringArray` helper로 대체했다.
  - archive snapshot downtime summary의 `taskIds` 복원도 같은 helper를 사용한다.
  - campaign-bound transfer item 판정에서 string flag/tag를 모을 때 nullable 문자열 중간 배열을 만들지 않고 `flatMap`으로 문자열만 보존한다.
- 확인:
  - `finalRewardIds`는 기존처럼 비배열이면 빈 배열이고, 문자열 항목만 최대 20개 유지한다.
  - `taskIds`는 기존처럼 비배열이면 빈 배열이고, 문자열 항목만 최대 50개 유지한다.
  - transfer marker 비교는 기존처럼 문자열 값만 소문자로 변환해 검사한다.
- 후속:
  - `human-gm-runtime`, `session-reveal`, `session-snapshot`의 flags/DTO 복원 경계에 남은 nullable/type-predicate 필터를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 195차 반영 상태

- 완료:
  - `HumanGmRuntimeService`의 item 지급 lookup id, combat token id set, condition tag 복원, reachable node id 추출에서 문자열 type predicate 필터를 제거했다.
  - 비문자열만 제외하는 `decodeStringArray`와 빈 문자열까지 제외하는 `compactPresentStrings` helper로 기존 정책을 분리했다.
- 확인:
  - item definition lookup은 기존처럼 dto id/catalog id/catalog key 중 truthy 문자열만 사용한다.
  - combat participant token id set은 기존처럼 token id가 없는 participant를 제외한다.
  - condition tag 복원은 `conditionId`와 `tags` 배열의 문자열 값만 유지하고, 빈 값은 제외한다.
  - reachable node target 검증은 기존처럼 `nextNodeId`가 있는 transition과 fallback node만 허용 후보로 본다.
- 후속:
  - `session-reveal`, `session-snapshot`, `session-vtt-*`의 DTO/flags projection에서 남은 nullable/type-predicate 필터를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 196차 반영 상태

- 완료:
  - `SessionSnapshotService.buildPendingRestApprovals`의 session character id DB 조회 배열에서 문자열 type predicate 필터를 제거했다.
  - `SessionRevealService`의 player scenario/reveal DTO projection에서 `map(...null).filter(type predicate)` 흐름을 `flatMap`으로 정리했다.
  - player clue mapping은 `mapPlayerScenarioClueEntry` helper로 `PlayerScenarioClueDto | null`을 즉시 배열화해 후단 필터에 의존하지 않게 했다.
- 확인:
  - rest approval 조회는 기존처럼 `sessionCharacterId`가 있는 action만 sessionCharacter DB 조회 대상으로 삼는다.
  - 방문 노드 projection은 DB에서 찾은 node만 player DTO로 만든다.
  - public clue, visible target, check option projection은 기존처럼 필수 표시 값이 없으면 제외한다.
- 후속:
  - `session-vtt-object-runtime`, `session-vtt-combat-movement-spend`, `session-inventory`의 projection/type predicate 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 197차 반영 상태

- 완료:
  - `SessionVttObjectRuntimeRunner.applyVttHazardTriggers`에서 moved token pair를 `map(...null).filter(type predicate)`로 만들던 흐름을 `flatMap`으로 정리했다.
  - `SessionVttCombatMovementSpendService.loadCharacterSpeedBySessionCharacterId`의 session character id DB 조회 배열에서 문자열 type predicate 필터를 제거했다.
  - `SessionInventoryService.replaceSessionInventoryEntries`의 item definition id 조회 배열도 `flatMap`으로 truthy id만 보존한다.
- 확인:
  - hidden token, session character id가 없는 token, 위치가 변하지 않은 token은 기존처럼 hazard trigger 대상에서 제외된다.
  - movement spend의 character speed 조회는 기존처럼 `sessionCharacterId`가 있는 spend만 대상으로 한다.
  - session inventory replacement는 기존처럼 `itemDefinitionId`가 있는 inventory item만 itemDefinition 조회 대상으로 한다.
- 후속:
  - `session-vtt-object-runtime`에 남은 discriminated union 필터는 타입 분기 보조인지, 외부 입력 복원 경계인지 구분해서 필요 시 helper화한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 198차 반영 상태

- 완료:
  - `SessionVttObjectRuntimeRunner`의 VTT object reveal 결과 조립에서 nullable item candidate를 만들고 type predicate로 제거하던 흐름을 `flatMap`으로 정리했다.
  - `revealedClues` 조립도 `Extract<VttObjectRevealInput, { contentKind: "clue" }>` 필터에 의존하지 않고 clue branch에서 바로 summary DTO를 만든다.
- 확인:
  - item reveal candidate는 기존처럼 content kind가 `item`이고 item definition lookup에 성공한 경우만 유지된다.
  - clue reveal summary는 기존처럼 새로 reveal된 clue 입력에서만 생성된다.
  - item grant/recovery count 정책은 유지된다.
- 후속:
  - 남은 type predicate 후보 중 `session` 경계의 단순 message join과 response formatting은 위험도가 낮으므로, 다음은 `rules`/`actions`의 외부 입력 복원 경계 후보를 우선 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 199차 반영 상태

- 완료:
  - `MainCommandCheckEffectParserService.readStringArray`가 명령 해석 payload의 문자열 배열을 `map(readString).filter(item is string)`으로 복원하던 흐름을 `readStringEntry`/`flatMap`으로 정리했다.
  - `MainCommandTransitionEvaluatorService`의 transition candidate 문자열 매칭 후보와 evidence text 조합에서 문자열 type predicate 필터 의존을 제거했다.
  - `readTransitionConditionRule`의 requirements 복원도 `filter(item is Record<string, unknown>).reduce(...)` 대신 reduce 내부에서 record guard를 통과한 항목만 누적한다.
- 확인:
  - visible entity/public clue 문자열 배열은 기존처럼 trim 후 빈 문자열과 비문자열을 제외한다.
  - transition direct/text matching 후보는 기존처럼 truthy 문자열만 비교한다.
  - structured transition requirement는 기존처럼 record가 아니거나 type이 유효하지 않은 항목을 제외한다.
- 후속:
  - `action-rule`, `condition-runtime`, `map-position`, `inventory-runtime`의 runtime rule 입력 복원 경계를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 200차 반영 상태

- 완료:
  - `ConditionRuntimeService.decodeConditionInstances`가 조건 JSON 배열을 `map(...null).filter(entry is ConditionInstance)`로 복원하던 흐름을 `flatMap`으로 정리했다.
  - condition `tags` 복원은 `decodeStringArray` helper를 거쳐 비문자열 항목만 제외한다.
  - `MapPositionService.createRuntimeMap`의 token/object cell 복원과 object cell `hiddenItemIds` 복원에서 type predicate 필터 의존을 제거했다.
  - `InventoryRuntimeService.parsePackContentsJson`의 pack contents JSON 복원도 nullable item 중간 배열 없이 `flatMap`으로 유효 항목만 반환한다.
- 확인:
  - 조건 JSON에서 문자열 entry는 기존처럼 condition instance로 승격되고, 손상된 object entry는 제외된다.
  - VTT map flags에서 좌표/id가 없는 token/object cell은 기존처럼 제외된다.
  - `hiddenItemIds`와 condition `tags`는 기존처럼 문자열 항목만 유지한다.
  - pack contents는 기존처럼 `itemId`, `name`, 양의 정수 `quantity`가 있는 항목만 유지한다.
- 후속:
  - 남은 `action-rule`, `forced-movement`, `terrain-effect`, `monster-ability`의 rule 계산 경계 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 201차 반영 상태

- 완료:
  - `ForcedMovementService.resolveForcedMovement`의 entered terrain effect 복원에서 nullable effect 중간 배열과 type predicate 필터를 제거했다.
  - `TerrainEffectService.resolveCombinedEffects`의 terrain effect id 해석과 `maxNullable` 숫자 선별도 `flatMap`으로 유효 값만 모으게 했다.
  - `MonsterAbilityService.listExecutableActions`가 rule catalog entry를 executable action으로 복원할 때 `map(...null).filter(action is ExecutableMonsterAction)`에 의존하지 않게 했다.
- 확인:
  - forced movement hazard가 terrain effect로 해석되지 않으면 기존처럼 entered terrain effect 목록에서 제외된다.
  - terrain effect id가 지원되지 않으면 기존처럼 combined effect 계산 대상에서 제외된다.
  - monster ability catalog entry가 실행 가능 action으로 매핑되지 않으면 기존처럼 action 목록에서 제외된다.
- 후속:
  - `action-rule`의 condition tag/string candidate 계산과 `srd-equipment-policy`의 장비 속성 복원 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 202차 반영 상태

- 완료:
  - `ActionRuleService`의 class resource 사용 횟수 계산에서 condition tag regex capture를 `map(...).filter(value is string)`으로 좁히던 흐름을 `matchFirstGroup` helper로 정리했다.
  - target alias와 inventory item id 후보도 nullable 문자열 type predicate 없이 truthy 문자열만 비교한다.
  - `srd-equipment-policy`의 SRD 장비 속성, range property, pack lookup key, alias decoder에서 문자열 type predicate 필터를 제거했다.
- 확인:
  - ki/channel divinity/bardic inspiration/sorcery point/wild shape 사용 횟수는 기존처럼 매칭되는 숫자 condition tag만 반영한다.
  - target alias와 item id 매칭은 기존처럼 빈 값이 아닌 문자열만 사용한다.
  - SRD equipment decoder는 기존처럼 비문자열 alias/property 후보를 제외하고 문자열 값만 보존한다.
- 후속:
  - `action-processor`, `combat-turn`, `combat-mapper` 등 남은 runtime projection 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 203차 반영 상태

- 완료:
  - `srd-engine-loader`의 monster profile decoder에서 alias, speed mode, action, damage entry 복원에 남아 있던 type predicate 필터를 제거했다.
  - alias 배열은 `decodeStringArray`, speed mode record는 `Object.entries(...).flatMap`, action/damage 배열은 decoder 결과를 즉시 배열화하는 helper를 사용한다.
- 확인:
  - SRD engine monster alias는 기존처럼 문자열 항목만 유지한다.
  - speed mode는 기존처럼 `ft`가 양의 정수인 mode만 유지한다.
  - monster action/damage entry는 기존처럼 decoder가 null을 반환한 손상 항목을 제외한다.
- 후속:
  - `combat-mapper`, `combat-turn`, `action-processor`의 runtime response projection 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 204차 반영 상태

- 완료:
  - `ReadyActionService.readPendingReadyActions`와 `readTriggeredReadyActions`의 flags 배열 복원에서 type predicate 필터를 제거하고, guard를 통과한 항목만 `flatMap`으로 유지한다.
  - `CombatMapperService.mapCombat`의 session character id DB 조회 배열, max HP/AC condition bonus, movement speed modifier 계산에서 문자열 type predicate 필터 의존을 제거했다.
- 확인:
  - pending/triggered ready action flags는 기존처럼 guard를 통과한 항목만 유지한다.
  - combat response mapping은 기존처럼 sessionCharacterId가 있는 participant만 sessionCharacter DB 조회 대상으로 삼는다.
  - `max_hp_bonus`, `armor_class`, `movement_speed_*` condition tag는 기존처럼 정규식 캡처가 있는 숫자 항목만 반영한다.
- 후속:
  - `combat-turn`, `combat-terrain`, `combat-movement`, `combat-action`의 runtime response/projection 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 205차 반영 상태

- 완료:
  - `CombatMovementService.resolveTerrainEffectIdsAtPoint`가 terrain cell에서 effect id를 `map(...).filter(id is string)`으로 추출하던 흐름을 `flatMap`으로 정리했다.
  - `CombatActionService`의 Magic Missile target id 선별도 문자열 type predicate 필터 없이 유효한 target id만 보존한다.
- 확인:
  - terrain effect id가 없는 terrain cell은 기존처럼 이동 효과 id 목록에서 제외된다.
  - Magic Missile target ids는 기존처럼 비문자열/빈 문자열을 제외하고 scaling target count만큼만 사용한다.
- 후속:
  - `combat-turn`, `combat-terrain`, `action-processor`, main-command presentation 계열 후보를 위험도 순서대로 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 206차 반영 상태

- 완료:
  - `ActionProcessorService.applyRuntimeEffects`가 inventory/map 원자 처리 대상 runtime effect를 type predicate 필터로 직접 좁히던 흐름을 `collectInventoryMapAtomicRuntimeEffects`로 분리했다.
  - `ActionProcessorService.assertRuntimeEffectPreconditions`의 map runtime effect 검증 대상도 `collectInventoryMapRuntimeEffects`를 통해 명시적으로 수집한다.
- 확인:
  - 원자 처리 대상은 기존처럼 `SPEND_ACTION` 또는 inventory/map runtime effect만 포함한다.
  - map 적용 가능성 검증은 기존처럼 early runtime effect를 제외한 뒤 inventory/map pair가 있는 경우에만 수행된다.
- 후속:
  - `combat-turn`, `combat-terrain`, main-command presentation 계열의 type predicate 필터와 nullable projection 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 207차 반영 상태

- 완료:
  - `httpClient`의 fallback API base URL 후보 생성에서 불필요한 문자열 type predicate 필터를 제거했다.
  - `staticSrd`의 class option 정규화가 `RawClassEntry`를 type predicate 필터로 좁히지 않고, 지원 클래스 순서에 존재하는 entry만 `flatMap`으로 수집하도록 바꿨다.
- 확인:
  - fallback API base URL 후보는 기존처럼 API base URL과 local dev 후보를 중복 제거한 뒤 trailing slash만 정규화한다.
  - class option 목록은 기존처럼 `SUPPORTED_CLASS_ORDER`에 있는 클래스만 순서대로 노출하며, 정적 SRD JSON decoder가 통과시킨 `RawClassEntry`만 사용한다.
- 후속:
  - 프론트 session/editor presentation 계열과 백엔드 `combat-turn`, `combat-terrain`, main-command presentation 계열의 nullable projection 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 208차 반영 상태

- 완료:
  - `CombatTerrainService`의 지형 피해/상태 메시지 조합에서 nullable 문자열 type predicate 필터를 제거하고 `compactStrings`로 수집한다.
  - `CombatTurnService.advanceCurrentTurn`의 턴 메시지 조합, Heroism 임시 HP 태그 숫자 추출, monster action condition rider 수집에서 type predicate/`filter(Boolean)` 의존을 제거했다.
- 확인:
  - 지형 메시지는 기존처럼 피해/상태 메시지가 하나 이상 있을 때만 `" / "`로 연결된다.
  - Heroism 임시 HP는 기존처럼 `temporary_hp:turn_start:<number>` 태그 중 양수 최댓값만 반영한다.
  - monster action condition rider는 기존처럼 비어 있으면 적용하지 않고, 문자열 항목만 이후 면역/조건 적용 경로로 넘긴다.
- 후속:
  - 프론트 session/editor presentation 계열과 백엔드 main-command presentation 계열의 nullable projection 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 209차 반영 상태

- 완료:
  - `ScenariosService`의 summary tag/recommendation reason/revision metadata 문자열 조합에서 nullable 문자열 type predicate 필터를 제거하고 `compactStrings`/`compactTrimmedStrings`로 통일했다.
  - scenario validation의 broken transition 대상 수집은 `nextNodeId`가 문자열인 항목만 `flatMap`으로 보존하도록 바꿨다.
  - legacy public moderation report 복원과 public metadata `tags/contentWarnings` decoder에서 nullable report/string type predicate 필터를 제거했다.
- 확인:
  - summary tag fallback은 기존처럼 difficulty와 system 제공 태그만 trim 후 보존한다.
  - legacy moderation report는 decode 실패 항목을 제외하고 유효한 report record만 유지한다.
  - broken transition 검증은 기존처럼 문자열 `nextNodeId` 중 현재 scenario node id 집합에 없는 항목만 issue로 만든다.
- 후속:
  - 프론트 session/editor presentation 계열과 백엔드 main-command presentation 계열의 nullable projection 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 210차 반영 상태

- 완료:
  - `MainCommandCheckResultNarrationService.sanitizeDiceResult`의 d20 roll 배열 복원에서 숫자 type predicate 필터를 제거하고, 유효한 roll만 `flatMap`으로 수집한다.
  - `MainCommandContextLoaderService`와 `MainCommandInventoryLabelService`의 아이템 식별자 후보는 타입상 문자열 배열이므로 불필요한 predicate 필터를 제거했다.
  - `MainCommandProgressEvidenceService`의 reveal snapshot/log line evidence 조합, `MainCommandCheckRevealService`의 reveal section 조합, `MainCommandRuleFragmentService`의 JSONL rule fragment 로딩, `MainCommandTransitionCandidateService`/`MainCommandSceneEntityService`의 후보 객체 수집에서 nullable type predicate 필터를 제거했다.
  - `MainCommandTransitionEvaluatorService`의 evidence text/alternative condition 수집은 기존 `compactPresentStrings` 경로로 통일했다.
- 확인:
  - dice roll은 기존처럼 1-20 정수만 유지한다.
  - reveal/log evidence는 기존처럼 빈 문자열 결과를 제외하고, 저장 snapshot decode가 실패한 항목은 fallback 경로를 유지한다.
  - transition/scene entity 후보는 기존처럼 연결 노드 또는 visible entity가 실제로 확인된 경우에만 결과 배열에 포함된다.
- 후속:
  - 프론트 session/editor/character presentation 계열과 shared utils의 nullable projection 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 211차 반영 상태

- 완료:
  - `SessionListItemService.buildMany`의 nullable session list item 수집과 `RuleCatalogService.getClassFeatureSnapshot`의 resource id 수집에서 type predicate 필터를 제거했다.
  - 프론트 `useSession`, `InventoryItemInfo`, story RP/rest approval presentation, character spell/race presentation, `ScenarioEditorPage` graph/item option 수집에서 nullable type predicate 필터를 제거했다.
- 확인:
  - session list는 active scenario가 없는 session을 기존처럼 제외한다.
  - rule catalog resource ids는 기존처럼 resource id가 있는 class feature만 중복 제거해 반환한다.
  - 프론트 직접 검색 기준 `fe/src`의 `filter((...): ... is ...)` 패턴은 0건이다.
  - 백엔드/공유 비테스트 런타임 소스 기준 직접 type predicate 필터는 0건이고, 잔여 결과는 `be/src/database/seed/items.ts`의 seed 데이터 정규화 코드뿐이다.
- 후속:
  - seed 데이터 정규화의 predicate 후보와 `filter(Boolean)` 계열 nullable projection을 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 212차 반영 상태

- 완료:
  - `be/src/database/seed/items.ts`의 SRD equipment JSONL 로딩, static item catalog 병합, static/SRD equipment lookup 후보, properties/description/use-effect 문자열 조합에서 익명 type predicate 필터와 `filter(Boolean)` 의존을 제거했다.
  - static item catalog decoder의 `filter(isStaticItemRecord)`도 `toStaticItemRecord` 수집 함수로 바꿔, seed 입력 경계에서 유효 record만 명시적으로 보존한다.
- 확인:
  - SRD equipment JSONL은 기존처럼 빈 줄과 decode 실패 row를 제외하고, id가 있는 record만 seed 대상으로 삼는다.
  - static item catalog는 기존처럼 `equipmentItems`와 `magicItems` 중 id가 있는 item만 병합한다.
  - 현재 검색 기준 `be/src`, `fe/src`, `shared-types/src` 비테스트 소스의 `filter((...): ... is ...)` 직접 패턴은 0건이다.
- 후속:
  - 남은 `filter(Boolean)` 계열 nullable projection과 named type guard filter가 실제 런타임 경계인지 계속 감사한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 213차 반영 상태

- 완료:
  - `shared-types/src/utils/inventory-display.ts`의 표시 토큰/property/search key 수집에서 `filter(Boolean)`을 제거하고 `compactStrings`로 빈 문자열 제거 의미를 명시했다.
  - `shared-types/src/types/api-envelope.ts`의 field error decoder와 reason 추출은 named guard filter 대신 `toApiFieldError` 수집 함수로 통일했다.
  - `domain.mapper`의 condition summary decoder와 `CatalogService.formatRuleCatalogLabel`의 빈 문자열 제거도 명시 조건으로 바꿨다.
- 확인:
  - inventory display는 기존처럼 빈 토큰/빈 라벨을 제외하고 사용자 표시명을 구성한다.
  - API field error는 기존처럼 `reason`이 문자열인 항목만 유지한다.
  - condition summary는 기존처럼 문자열 condition id/tag 중 빈 문자열이 아닌 값만 중복 제거한다.
- 후속:
  - BE AI/combat/character/rules/sessions 모듈과 FE UI 계층의 잔여 `filter(Boolean)`을 위험도 순서대로 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 214차 반영 상태

- 완료:
  - `CharacterSpellSelectionService`의 준비 주문/레벨업 주문 입력 정규화에서 `normalizeSpellSelections`/`normalizeSpellSelection`을 통해 빈 spell id를 명시적으로 제외한다.
  - `AiService`의 Human GM assist prompt/suggestion 조합에서 `filter(Boolean)`을 제거하고 빈 문자열 제거 조건을 명시했다.
  - `CombatActionService`의 spell target participant id 수집을 `uniqueTargetParticipantIds`/`compactStrings`로 통일했다.
- 확인:
  - spell selection은 기존처럼 `normalizeSpellId` 결과가 빈 문자열인 항목을 제외하고 중복 제거한다.
  - AI assist prompt는 기존처럼 optional target/suggested action line이 있을 때만 포함된다.
  - combat spell 대상은 기존처럼 빈 target id를 제외하고, 중복 제거 후 각 주문별 maximum target 수만큼 사용한다.
- 후속:
  - BE rules/sessions/action policy 계열의 잔여 `filter(Boolean)`을 위험도 순서대로 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 215차 반영 상태

- 완료:
  - `SessionCampaignArchiveBuilderService`의 reward id 정규화, `VttMapObjectRuntimeService`의 reveal summary 조합, `InventoryItemPolicy`의 runtime flags/search key 복원에서 `filter(Boolean)`/익명 type predicate 의존을 제거했다.
  - `ConditionRuntimeService`, `ConcentrationRuntimeService`, `EconomyRuntimeService`의 tag/recipient id 정규화를 명시 조건으로 바꿨다.
  - `ActionProcessorService`, `SrdEquipmentPolicy`, `CommandParserService`, `MonsterAbilityService`의 feature id/equipment line/target id/prefixed tag 수집도 빈 문자열 조건을 직접 드러내도록 바꿨다.
- 확인:
  - reward id는 기존처럼 trim 후 빈 값을 제외하고 최대 20개만 유지한다.
  - condition/concentration tag 값은 기존처럼 정규화 후 빈 문자열이 아닌 값만 보존한다.
  - area spell target ids와 monster prefixed tags는 기존처럼 빈 값 제거 후 처리한다.
- 후속:
  - BE 잔여 `filter(Boolean)`은 `character-feature-snapshot`, `combat.service`, `action-rule`, `rule-engine`, `content-manifest` 중심으로 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 216차 반영 상태

- 완료:
  - `CharacterFeatureSnapshotService`의 feat selection 정규화, `CombatService`의 concentration linked effect id/fallback weapon profile key 수집에서 `filter(Boolean)`을 제거했다.
  - `ActionRuleService`의 option/target/damage type token 수집, `RuleEngineService`의 expertise/favored enemy selection 정규화, `content-manifest`의 executable item id 수집에서 빈 문자열 조건을 명시했다.
- 확인:
  - feat/target/rule token은 기존처럼 trim/normalize 후 빈 문자열이 아닌 값만 사용한다.
  - combat concentration linked effect ids는 기존처럼 trim 후 빈 id를 제외한다.
  - 현재 검색 기준 `be/src/modules` 비테스트 소스의 `filter(Boolean)`/`filter(...Boolean...)` 패턴은 0건이다.
- 후속:
  - FE UI/프레젠테이션 계층의 잔여 `filter(Boolean)` 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-08 217차 반영 상태

- 완료:
  - `characterSpellSelectionRules`, `characterCreateDefaults`, `characterLevelUpDraft`, `characterFeatureChoices`, `characterFeaturePresentation`, `characterFeaturePreview`의 주문/특성/생성 payload 정규화에서 `filter(Boolean)`을 제거했다.
  - `InventoryItemInfo`, `inventoryItemModel`, `displayNames`의 서버 DTO 기반 표시 라벨/search key/내부 id 표시명 수집을 `compactStrings`/`compactTrimmedStrings` 또는 명시 조건으로 바꿨다.
- 확인:
  - character 생성/레벨업 payload는 기존처럼 trim 후 빈 주문/스킬/특성 선택값을 제외한다.
  - inventory 표시 모델은 기존처럼 빈 표시 라벨과 빈 search token을 제외한다.
  - 현재 검색 기준 `fe/src/features/characters` 및 변경한 inventory/display utility 파일의 `filter(Boolean)`/`filter(...Boolean...)` 패턴은 0건이다.
- 후속:
  - FE spells/sessionPlay/page UI 계층의 잔여 `filter(Boolean)` 후보를 계속 정리한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-10 218차 반영 상태

- 완료:
  - 주문 선택/표시 모델의 빈 spec 및 내부 id token 제거를 `trim().length > 0` 또는 `length > 0` 조건으로 명시했다.
  - 전투 상태, 탐색 선택, AI 보조 로그, 장비 검색 key, 맵 캐릭터 token id처럼 nullable 서버 DTO 값을 모으는 경로를 `flatMap` 기반의 명시적 `string[]` 정규화로 바꿨다.
  - 세션 UI className, 달력/경제 입력 목록, 룰북 inline token, 장면 문단처럼 이미 문자열인 경로는 빈 문자열 제거 조건을 직접 드러냈다.
- 확인:
  - 현재 검색 기준 `fe/src`의 `filter(Boolean)`/`filter(...Boolean...)` 패턴은 0건이다.
  - nullable DTO 값은 truthy 추론에 기대지 않고 결과 배열 원소 타입이 실제 문자열이 되도록 구성했다.
  - 변경 파일 대상 `git diff --check`는 줄 끝 변환 경고 외 오류 없이 통과했다.
- 후속:
  - `as any`, `as unknown as`, `any[]`, `JSON.parse(...) as`, 외부 입력에 붙은 직접 단언을 전 범위에서 재검색하고 계획 완료 조건과 대조한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-10 219차 반영 상태

- 완료:
  - VTT map point 입력 두 경로의 `as Record<string, unknown>`을 공용 `isRecord` 가드로 바꾸고 좌표별 finite number 검증을 유지했다.
  - account menu의 DOM event target은 `instanceof Node`를 확인한 뒤 사용하고, autocomplete ref는 이미 선언된 `RefObject<HTMLDivElement | null>` 타입을 그대로 JSX에 전달한다.
  - combat hunter's mark 조건 entry는 `isRecord`로 좁히고, VTT reveal 결과는 `SessionsService`의 실제 반환형을 사용해 중복 강제 캐스팅을 제거했다.
  - rulebook heading tag와 forced movement 축 방향은 값 분기로 리터럴 union을 만들도록 바꿔 숫자 강제 캐스팅을 제거했다.
  - `ActionSpellRuleService`의 `private runtime!`를 nullable 상태와 `requireRuntime()` 검증으로 바꿔, spell resolution 밖의 잘못된 호출 순서가 명시적 오류가 되도록 했다.
- 확인:
  - 현재 비테스트 소스에서 외부/도메인 값을 직접 신뢰하는 named type cast는 검색되지 않는다.
  - 잔여 cast는 `as const`, import alias, React CSS custom property 타입 보정으로 분류된다.
  - 변경 파일 대상 `git diff --check`는 줄 끝 변환 경고 외 오류 없이 통과했다.
- 후속:
  - 계획의 각 ingress decoder 연결 상태와 nullable/숫자 범위 검증을 최종 대조한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-10 220차 반영 상태

- 완료:
  - scenario editor의 복원용 `encounterScaling.basePartySize/minMonsterCount`를 finite integer 및 도메인 범위로 정규화한다.
  - create/update payload 생성 시 `startLevel/recommendedEndLevel`을 `valueAsScenarioLevel`로 다시 검증해 `NaN`, 소수, 1~20 범위 밖 값을 전송하지 않는다.
- 확인:
  - malformed encounter scaling 한 필드 때문에 전체 VTT map decoder가 실패하는 경로를 줄였다.
  - UI state 타입이 `number`여도 직렬화 경계에서 런타임 숫자 유효성을 다시 확인한다.
- 후속:
  - DTO/프레임워크 관용구가 아닌 definite assignment 및 숫자 외부 입력 후보를 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-10 221차 반영 상태

- 완료:
  - `ActionSpellRuleService`가 요청별 `ActionSpellRuleRuntime`을 singleton 필드에 임시 저장하던 `withRuntime` 구조를 제거했다.
  - 주문 해석 진입점과 runtime 의존 helper가 runtime을 명시 인자로 전달하므로 호출 순서, 재진입, 향후 비동기화에 따른 공유 상태 오염 위험이 사라졌다.
  - 의도적으로 임의 JSON tree를 보존하는 scenario reference rewrite와 seed 검사 경로를 `parseUnknownJsonOrFallback`로 분리해 identity decoder 사용 목적을 공통 API 이름에 드러냈다.
- 확인:
  - TypeScript AST 정적 진단 기준 반환값이 있는 프론트 `requestJson<T>` 호출 113개 모두 object options에 `decode`를 전달한다.
  - `ActionSpellRuleService`에는 `private runtime`, `withRuntime`, `requireRuntime`, `this.runtime`, `any[]` adapter가 남지 않는다.
  - runtime 의존 object helper 호출에는 모두 `runtime` property가 있고, positional helper의 첫 인자는 `runtime` 또는 `params.runtime`이다.
  - 변경 파일 대상 `git diff --check`와 TypeScript source parse diagnostic은 오류 없이 통과했다.
- 후속:
  - 프론트 HTTP decoder의 연결 누락은 없으므로, shared decoder의 lenient item 복구 정책을 입력/응답/저장 복원 목적별로 계속 구분한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-10 222차 반영 상태

- 완료:
  - scenario check option, transition, clue, NPC 배열 decoder의 기본 정책을 strict로 바꿔 잘못된 항목 하나라도 있으면 외부 응답/요청 검증이 실패하도록 했다.
  - 손상된 기존 DB JSON에서 유효 항목을 보존해야 하는 경로에는 `decodeLenientScenarioNodeCheckOptionsConfig`, `decodeLenientScenarioTransitionArray`, `decodeLenientScenarioClueArray`, `decodeLenientScenarioNpcArray`를 별도로 추가했다.
  - domain mapper, human GM runtime, scene transition/start node, clue reveal/evidence, VTT object runtime 등 DB 복원 호출부를 명시적 lenient decoder로 전환했다.
- 확인:
  - 프론트 소스에는 `decodeLenientScenario*` 사용이 없고 `decodeScenarioResponse` 및 scenario HTTP 응답은 strict decoder를 유지한다.
  - 백엔드의 기본 strict scenario 배열 decoder 사용은 `ScenariosService`의 create/update 입력 검증 경로에만 남는다.
  - 저장 JSON 복원은 기존처럼 손상된 항목만 제외하고 유효 항목을 보존한다.
  - 변경 파일 대상 `git diff --check`는 줄 끝 변환 경고 외 오류 없이 통과했다.
- 후속:
  - 다른 shared decoder의 부분 복구 정책도 HTTP 응답과 DB/storage 복원에 동시에 쓰이는지 같은 기준으로 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-10 223차 반영 상태

- 완료:
  - 1단계 계획에 명시됐지만 빠져 있던 `readOptionalString`, `readOptionalNumber`, `readBoolean`, `readOptionalBoolean`, `decodeOrThrow`를 공용 runtime guard에 추가했다.
  - `readArray`, `readOptionalArray`, `decodeArray`, `parseJsonWithDecoder`가 공통 `decodeOrThrow`를 사용하도록 오류 label 처리 경로를 통합했다.
  - `api-decoders` 내부의 동일한 optional string/number/boolean reader 구현을 제거하고 공용 guard를 사용한다.
  - 새 guard와 `Decoder`, `readOptionalArray`를 `@trpg/shared-types/frontend`에서도 import할 수 있도록 export했다.
- 확인:
  - 기존 `decodeItemWithLabel`은 `decodeOrThrow` 위임 wrapper로 유지해 호환성을 보존한다.
  - 핵심 API decoder의 optional field 검증 오류 메시지와 null/undefined 처리 정책은 변경되지 않는다.
  - 변경 파일 대상 `git diff --check`는 줄 끝 변환 경고 외 오류 없이 통과했다.
- 후속:
  - runtime guard의 직접 사용이 적은 외부 경계에서 로컬 중복 reader를 공용화할 수 있는지 오류 정책별로 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-10 224차 반영 상태

- 완료:
  - `storage.ts`의 user/token/auth mode/OAuth provider/session snapshot 읽기·쓰기·삭제를 예외 안전한 공통 storage wrapper로 통합했다.
  - 브라우저 privacy 설정, storage 비활성화, quota 초과로 `getItem`/`setItem`/`removeItem`이 예외를 던져도 현재 메모리 세션이 중단되지 않는다.
  - battle map과 VTT render의 개발용 localStorage 성능 플래그 조회도 storage 접근 실패 시 `false`로 복구한다.
- 확인:
  - 저장 payload의 기존 schemaVersion 및 decoder 검증은 유지된다.
  - explored vision 저장값의 직접 localStorage 접근은 기존부터 read/write 전체가 try/catch 안에 있고 version/map dimension 검증을 거친다.
  - scenario dirty snapshot은 브라우저 저장값이 아니라 직렬화된 저장 payload의 메모리 비교본이며, `parseJsonWithDecoder` 결과를 diff 표시에만 사용하고 API payload로 재사용하지 않는다.
  - 변경 파일 대상 `git diff --check`는 줄 끝 변환 경고 외 오류 없이 통과했다.
- 후속:
  - 8단계 완료 기준을 마일스톤 증거표에 반영하고 다른 브라우저 외부 입력 경계의 API 자체 예외도 점검한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-10 225차 반영 상태

- 완료:
  - 프론트 로그인, 게스트 전환, OAuth 로그인, 명시적 재발급, HTTP 401 자동 재발급 응답에 claim 검증을 결합한 `decodeValidatedLoginResponse`/`decodeValidatedAuthTokenResponse`를 적용했다.
  - access token은 문자열 여부뿐 아니라 payload의 `sub`, `type === "access"`, integer `exp`와 실제 만료 여부까지 통과해야 현재 세션에 들어온다.
  - localStorage 복원과 저장 시점에도 malformed/expired token을 제거하고, token reissued custom event 수신자도 `assertUsableAccessToken`을 통과한 값만 반영한다.
- 확인:
  - 백엔드 JWT decoder는 기존처럼 `sub`, optional `email`, access/refresh `type`, integer `exp`를 검증하고 expected type 및 만료를 별도로 확인한다.
  - 프론트의 모든 `requestJson<LoginResponseDto|AuthTokenResponseDto>` 호출은 validated decoder를 사용한다.
  - 변경 파일 대상 `git diff --check`는 줄 끝 변환 경고 외 오류 없이 통과했다.
- 후속:
  - OAuth/JWT 완료 기준을 마일스톤 증거표에 반영하고 인증 이벤트·URL state 같은 브라우저 경계를 계속 점검한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-10 226차 반영 상태

- 완료:
  - `json-runtime`에 `parseJsonOrThrow`와 `parseJsonRecordOrThrow`를 추가해 DB JSON의 누락과 손상을 구분했다. `null`/빈 값은 명시한 기본값을 사용하지만, JSON 문법 오류와 객체 shape 오류는 label이 포함된 예외로 처리한다.
  - `GameState.flagsJson`을 다시 저장하는 action, session/VTT, combat, campaign calendar, economy 경로를 strict parser로 전환했다.
  - 주문 슬롯 소비, 몬스터 행동 자원 판정·기록, pending reaction 저장·소비, 아이템 사용, 자동 몬스터 행동처럼 손상된 flags를 `{}`로 복구하면 규칙을 우회할 수 있는 경로도 strict parser를 사용한다.
  - 시나리오 노드 이미지 변경 중 기존 `checkOptionsJson`을 다시 저장하는 경로는 strict decoder를 사용해 손상된 설정을 빈 배열로 덮어쓰지 않는다.
  - 캐릭터 수정·레벨업·준비 주문·장비 변경은 기존 abilities/inventory/features/proficient-skills JSON을 strict decoder로 복원한 뒤에만 저장한다. 조회 API는 기존 fallback 정책을 유지한다.
  - 세션 캐릭터 선택은 `character.inventoryJson` 검증을 assignment upsert보다 먼저 수행하고, 검증된 canonical JSON만 snapshot과 inventory entry에 사용한다.
  - explored-vision localStorage 복구는 cleanup용 `removeItem`까지 예외 안전하게 감싸 storage API 자체가 차단된 환경에서도 페이지 오류를 내지 않는다.
  - race seed의 `parentKey!`를 명시적 null guard로 바꿔 비테스트 TypeScript 소스의 non-null assertion을 제거했다.
  - `SessionsService`와 calendar/economy/reaction의 혼합 helper를 읽기 fallback과 변경 strict 정책으로 분리했다.
- 확인:
  - 비테스트 백엔드 소스의 `parseJsonRecordOrThrow` 호출은 공통 함수 정의를 제외하고 33곳이며, 상태 변경·규칙 판정 경로에 배치돼 있다.
  - `parseJsonRecordOrFallback` 호출은 공통 함수 정의를 제외하고 11곳이며, domain/combat mapper, 응답 조립, 화면 판정, archive 조회, 잔여 주문 슬롯 조회 같은 비변경 경로에만 남는다.
  - BE/FE/shared-types 비테스트 TypeScript/TSX 485개 파일의 source parse diagnostic은 0건이다.
  - `git diff --check`는 줄 끝 변환 경고 외 오류 없이 통과했다.
- 후속:
  - flags 외 inventory/condition/number record JSON helper도 호출 계층에서 저장값을 다시 쓰는지 같은 기준으로 계속 분류한다.
  - 전 범위 완료 판정을 하려면 사용자가 허용한 빌드/테스트 결과까지 함께 확인해야 한다.

### 2026-07-10 227차 반영 상태

- 완료:
  - 계획 1~9단계의 핵심 완료 조건을 현재 비테스트 소스에 다시 대조했다.
  - 브라우저 storage, 캐릭터 저장 JSON, 시나리오 노드 변경, seed nullable 경계에서 재감사 중 발견한 누락을 226차 변경에 추가 반영했다.
- 확인:
  - TypeScript AST 기준 485개 비테스트 TS/TSX 파일의 `any` keyword와 non-null assertion은 각각 0건이다.
  - 남은 일반 type assertion 44건은 모두 프론트 CSS custom property를 `CSSProperties`에 연결하기 위한 표현이며, 비-CSS type assertion은 0건이다.
  - 반환 데이터가 있는 프론트 `requestJson<T>` 호출 113개는 모두 `decode`를 전달한다.
  - WebSocket 도메인 이벤트는 `safeSocketOn`이 `unknown` payload를 decoder로 검증한 뒤 handler에 전달한다. 직접 `socket.on`을 쓰는 경로는 connect/disconnect/connect_error 수명주기 이벤트뿐이다.
  - AI client의 narrator/director/summarizer/NPC/check-result/interpreter/actor 응답과 Kakao/Discord token/user 응답은 각각 전용 decoder를 거친다.
  - main-command effect/dice result와 scenario check options/transitions/clues/vttMap/nodeMeta에는 custom nested validator가 연결돼 있다.
  - source parse diagnostic과 `git diff --check`는 오류 없이 통과했다. 줄 끝 변환 경고는 기존 worktree 설정에 따른 경고다.
- 미실행 검증:
  - 프로젝트 지침에 따라 빌드와 테스트는 실행하지 않았다.
  - 실제 TypeScript semantic check와 회귀 동작 확인은 아래 검증 계획의 사용자 실행 결과가 필요하다.

### 2026-07-10 228차 반영 상태

- 완료:
  - `ConditionRuntimeService.parseConditionsJson`을 strict 기본 API로 바꾸고, 손상 항목 부분 복구가 필요한 combat mapper에만 `parseConditionsJsonOrFallback`을 명시했다.
  - action rule, spell rule, combat, combat condition, combat spell, VTT hazard 판정이 abilities/conditions/inventory/features/proficient-skills/spells JSON의 문법과 항목 shape를 검증한다.
  - number record decoder는 객체가 아니거나 값 하나라도 finite number가 아니면 실패하고, condition/inventory 배열 decoder는 잘못된 항목을 `flatMap`으로 누락시키지 않는다.
  - 캐릭터 생성의 race/class 설정, 시작 장비, 주문 선택과 아이템 속성도 strict decoder를 사용해 손상된 catalog JSON이 제한 없는 기본값으로 바뀌지 않는다.
  - 캐릭터 복제는 abilities, inventory, spells, features, proficient skills를 먼저 검증하고 canonical JSON으로 저장해 손상 데이터를 새 row에 복사하지 않는다.
  - main-command ending/transition/scene entity/scene map 판정, 세션 start node, human GM 이동 권한 판정은 strict scenario decoder를 사용한다.
  - 전투 민첩 계산과 지도 위치 규칙은 손상된 abilities/flags JSON을 기본 민첩 10 또는 지도 없음으로 간주하지 않는다.
- 확인:
  - 비테스트 TS/TSX 485개 파일의 source parse diagnostic은 0건이다.
  - TypeScript AST 기준 `any` keyword, non-null assertion, 비-CSS type assertion은 모두 0건이다.
  - `git diff --check`는 줄 끝 변환 경고 외 오류 없이 통과했다.
  - 남은 JSON fallback은 domain/combat mapper, 목록·아카이브·turn-log 응답, 진행 증거·공개 clue, 읽기 전용 VTT 기본 map 복원처럼 저장값을 다시 쓰지 않는 경로에 배치돼 있다.
- 미실행 검증:
  - 프로젝트 지침에 따라 build와 test는 실행하지 않았다. strict 정책 전환의 semantic type check와 기존 데이터 호환성은 사용자 실행 결과가 필요하다.

### 2026-07-10 229차 반영 상태

- 완료:
  - 공통 `parseJsonRecordOrThrow`가 누락값에만 default를 사용하고 malformed syntax와 non-record shape는 거부하는 테스트를 추가했다.
  - `parseJsonRecordOrFallback`이 mapper 복구 경로에서만 syntax/shape 오류를 명시적 fallback으로 처리하는 테스트를 추가했다.
  - condition runtime에 strict rule path와 lenient mapper path의 계약을 각각 검증하는 테스트를 추가했다. strict 경로는 invalid 항목 하나도 허용하지 않고 mapper 경로는 유효 항목을 보존한다.
  - 세션 캐릭터 선택은 malformed inventory를 assignment upsert 전에 거부하며 어떤 session/inventory write도 수행하지 않는 테스트를 추가했다.
  - 선택 해제 테스트가 삭제 후 inventory 동기화를 기대하던 잘못된 전제를 실제 서비스 계약인 미호출로 수정했다.
- 확인:
  - 테스트 파일을 포함한 TS/TSX 615개 파일의 source parse diagnostic은 0건이다.
  - `git diff --check`는 줄 끝 변환 경고 외 오류 없이 통과했다.
- 미실행 검증:
  - 프로젝트 지침에 따라 새 회귀 테스트를 실행하지 않았다.

### 2026-07-10 230차 반영 상태

- 확인:
  - `parseConditionsJsonOrFallback`을 사용하는 combat mapper는 테스트에서 실제 `ConditionRuntimeService`로 조립된다.
  - condition runtime mock을 사용하는 다른 테스트는 strict `parseConditionsJson`만 호출하는 서비스 대상이므로 새 API를 추가할 필요가 없다.
  - strict/fallback API 변경으로 누락된 테스트 double 또는 생성자 계약은 확인되지 않았다.
- blocked 조건:
  - 계획된 정적 구현, 회귀 테스트 작성, 소스 구문 검사까지 완료했다.
  - 프로젝트 지침에 따라 build와 test를 직접 실행할 수 없으므로, goal 완료 판정에는 사용자 실행 결과가 필요하다.

### 2026-07-10 231차 빌드 검증 완료

- 수정:
  - 공유 타입의 nullable 숫자 가드와 JSON decoder 타입을 보완했다.
  - 백엔드 내부 도메인 객체는 `Record<string, unknown>`으로 유지하고 turn-log 저장 경계에서 decoder가 `unknown`을 검증하도록 책임을 정리했다.
  - AI interpreter payload, SRD 입력, condition, scenario metadata, session reveal 등에서 빌드가 드러낸 nullable 및 판별 유니온 오류를 실제 런타임 가드와 정확한 함수 계약으로 해결했다.
  - 프론트는 공유 enum 값, API decoder, storage snapshot 정규화, VTT 구조 선택 판별 유니온을 사용하도록 정리했다.
- 실행 결과:
  - `npm run build -w @trpg/shared-types`: 통과.
  - `npx tsc -p .\be\tsconfig.json --noEmit --pretty false`: 통과.
  - `npx tsc -b .\fe --pretty false`: 통과.
  - 루트 `npm run build`: 공유 타입, SRD 생성/검증/동기화, Nest 백엔드, 프론트 TypeScript 및 Vite production bundle까지 통과.
- 미실행 검증:
  - 프로젝트 지침에 따라 테스트는 실행하지 않았다. 아래 백엔드 테스트와 프론트 수동 확인은 별도 실행이 필요하다.

### 1단계. 런타임 검증 유틸 기반 만들기

- 대상 파일:
  - `shared-types/src/utils/runtime-guards.ts` 신규
  - `shared-types/src/index.ts`
  - `shared-types/src/frontend.ts`
- 구현:
  - `isRecord(value): value is Record<string, unknown>`
  - `isString`, `isNumber`, `isBoolean`, `isStringArray`
  - `readString`, `readOptionalString`, `readNumber`, `readArray`
  - `parseJsonWithDecoder<T>(raw, decoder, fallback?)`
  - `assertDecode<T>(value, decoder, label)` 또는 `decodeOrThrow<T>()`
- 주의:
  - `shared-types`가 BE/FE 양쪽에서 쓰이므로 DOM/Node 전용 API를 넣지 않는다.
  - 모든 DTO를 한 번에 완전 검증하려 하지 말고, 실제 위험 경로의 최소 필수 필드부터 시작한다.
- 완료 기준:
  - BE/FE에서 import 가능한 guard 유틸이 생긴다.
  - 이후 단계가 이 유틸에 의존해 `unknown`을 좁힐 수 있다.

### 2단계. 프론트 HTTP 응답 decoder 도입

- 대상 파일:
  - `fe/src/services/httpClient.ts`
  - `fe/src/services/sessionApi.ts`
  - `fe/src/services/combatApi.ts`
  - `fe/src/services/vttMapApi.ts`
  - `fe/src/services/characterApi.ts`
  - `fe/src/services/staticSrd.ts`
  - 필요 시 `shared-types/src/utils/*`
- 구현:
  - `RequestOptions<T>`에 `decode?: (value: unknown) => T`를 추가한다.
  - `unwrapApiResponse` 결과를 바로 `T`로 cast하지 않고 `decode`가 있으면 통과시킨다.
  - 1차 적용 endpoint:
    - session snapshot/detail/list item
    - combat response/action result/move result
    - VTT map state
    - character response
  - decoder가 없는 호출은 일시적으로 기존 동작을 유지하되 TODO 없이 계획 항목으로 남긴다.
  - `staticSrd.ts`는 정적 파일별 최소 decoder를 둔다. 예: 클래스/종족/주문 catalog는 배열 여부와 필수 id/name만 확인한다.
- 위험 제어:
  - 기존 UI를 깨지 않도록 decoder 실패 메시지는 사용자에게 "서버 응답 형식이 올바르지 않습니다." 수준으로 감싼다.
  - envelope 자체는 `isApiSuccessEnvelope`를 유지하되 `data` 검증을 추가한다.
- 완료 기준:
  - `fe/src/services/httpClient.ts:103`의 무조건 `return body as T` 경로가 핵심 호출에서 사라진다.
  - 핵심 API 호출부는 `requestJson(path, { decode: ... })` 형태가 된다.

### 3단계. 프론트 WebSocket payload 검증

- 대상 파일:
  - `fe/src/services/realtime.ts`
  - `shared-types/src/dto/ws/session-events.dto.ts`
  - 필요 시 `shared-types/src/utils/runtime-guards.ts`
- 구현:
  - `safeSocketOn<T>(socket, eventName, decode, onValid, onInvalid)` 헬퍼를 만든다.
  - 이벤트별 decoder를 만든다.
    - `session.snapshot`: `{ snapshot }` 확인 후 snapshot decoder 적용
    - `participant.updated`: `{ participant }`
    - `character.updated`: `{ character }`
    - `chat.message`: `{ message }`
    - `turn.log.created`, `dice.rolled`, `state.diff.applied`
    - `vtt.map.updated`
    - `combat.updated`
    - `combat.reaction.prompt`
  - payload가 틀리면 handler 호출을 막고 `handlers.onLog("Realtime payload ignored", "...")`만 남긴다.
- 완료 기준:
  - `socket.on(..., (payload: SomeDto) => ...)`처럼 외부 payload를 타입 주석만으로 믿는 경로가 제거된다.
  - 잘못된 payload가 들어와도 화면 전체가 예외로 멈추지 않는다.

### 4단계. 백엔드 AI client 응답 검증

- 대상 파일:
  - `be/src/modules/ai/ai.client.ts`
  - `be/src/modules/ai/ai.service.ts`
  - AI 응답 타입이 정의된 파일들
- 구현:
  - `attemptPostJson<T>(path, body, decode)`로 시그니처를 바꾼다.
  - 호출 메서드별 decoder를 연결한다.
    - interpreter route response
    - narrator/director/actor/check_result response
    - human GM assist suggestion response
  - decoder 실패 시 `BadGatewayException("AI 서버 응답 형식이 올바르지 않습니다.")`를 던진다.
  - fallback이 있는 서비스는 upstream 형식 오류도 fallback 대상인지 정책을 명확히 한다.
- 완료 기준:
  - `be/src/modules/ai/ai.client.ts:365`의 `as T` 단언 반환이 제거된다.
  - AI 응답 구조 변화가 내부 도메인 로직 예외가 아니라 upstream 오류로 분류된다.

### 5단계. DTO nested validation 강화

- 대상 파일:
  - `shared-types/src/dto/api/gameplay.dto.ts`
  - `shared-types/src/dto/api/scenarios.dto.ts`
  - `shared-types/src/dto/api/sessions.dto.ts`
  - 관련 controller/service parser
- 구현:
  - `ResolveMainCommandCheckDto.effect`를 `@IsObject()` 단독에서 type별 DTO 검증으로 바꾼다.
    - door/hazard/object/narrative effect DTO를 명시한다.
    - class-validator만으로 union 검증이 어려우면 custom validator 또는 controller/service decoder를 추가한다.
  - `diceResult`는 감사 로그용 최소 DTO로 제한한다. 예: `total`, `rolls`, `expression`.
  - `ScenarioNodeInputDto`의 `checkOptions`, `transitions`, `clues`를 최소 입력 DTO 배열로 바꾼다.
  - `ScenarioNodeInputDto.vttMap`은 가능한 범위에서 `VttMapStateDto` nested validation을 사용한다.
  - `nodeMeta`는 자유도를 유지하더라도 허용 namespace를 나눈다. 예: `npcs`, `ruleRefs`, `gmNotes`, `isEndingNode`.
- 호환 전략:
  - 기존 저장 데이터와 프론트 editor payload를 먼저 비교한다.
  - DTO를 강화하기 전 프론트 직렬화 결과가 새 DTO를 만족하도록 `ScenarioEditorPage.tsx`를 맞춘다.
- 완료 기준:
  - 외부 요청에서 내부 필드 타입이 틀린 `checkOptions/transitions/clues/effect/vttMap`이 DTO 또는 decoder에서 거부된다.

### 6단계. DB JSON parser 정리

- 대상 파일:
  - `be/src/common/utils/json-runtime.ts` 신규
  - `be/src/common/mappers/domain.mapper.ts`
  - `be/src/modules/turn-logs/turn-logs.service.ts`
  - `be/src/modules/sessions/sessions.service.ts`
  - `be/src/modules/combat/combat.service.ts`
  - `be/src/modules/rules/action-rule.service.ts`
  - `be/src/modules/actions/action-processor.service.ts`
  - `be/src/modules/scenarios/scenarios.service.ts`
- 구현:
  - 공통 `parseJsonOrFallback<T>(value, fallback, decoder?)`를 만든다.
  - JSON syntax 오류는 fallback으로 복구할지, 도메인 오류로 올릴지 호출부가 선택하게 한다.
  - 우선 decoder:
    - `InventoryItemDto[]`
    - `AbilityScoresDto`
    - `VttMapStateDto`
    - `GameState.flagsJson`
    - `TurnLog.stateDiffJson`
    - `ConditionInstance[]`
  - mapper 계층에서는 가능한 fallback을 사용하고, state mutation 계층에서는 잘못된 저장값을 명시적 오류로 처리한다.
- 완료 기준:
  - 주요 `JSON.parse(value) as T`가 공통 parser와 decoder로 대체된다.
  - 손상된 JSON row가 사용자 요청 전체를 무조건 500으로 만들지 않는다.

### 7단계. `any[]` runtime adapter 제거

- 대상 파일:
  - `be/src/modules/actions/main-command-intent-handlers.service.ts`
  - `be/src/modules/sessions/session-vtt-object-runtime.service.ts`
  - `be/src/modules/rules/action-spell-rule.service.ts`
  - 필요 시 원본 service 파일
- 구현:
  - 각 runtime type의 함수별 실제 인자/반환 타입을 적는다.
  - private helper 위임이 너무 많으면 작은 injectable service로 추출한다.
  - 당장 추출이 어렵다면 최소한 `unknown[]`이 아니라 명시 시그니처를 사용한다.
- 예시:
  - `buildInterpreterPayload(context: LoadedContext, dto: SubmitMainCommandDto, visibleEntities: VisibleSceneEntity[]): InterpreterPayload`
  - `normalizeVttMap(value: unknown): VttMapStateDto`
  - `resolveSpellTargetList(...): SessionCharacterForRules[]`
- 완료 기준:
  - 세 파일에서 `(...args: any[]) => any`가 사라진다.
  - helper signature 변경 시 컴파일 오류가 발생한다.

### 8단계. localStorage와 editor draft 복원 안정화

- 대상 파일:
  - `fe/src/services/storage.ts`
  - `fe/src/components/battleMap/BattleMapCore.tsx`
  - `fe/src/pages/ScenarioEditorPage.tsx`
- 구현:
  - 저장 payload에 `schemaVersion`을 추가한다.
  - 기존 version 없는 데이터는 최소 shape 검증 후 사용하거나 폐기한다.
  - `loadStoredSnapshot`은 `participants`, `session`, `sessionCharacters` 배열 여부를 확인한 뒤 `normalizeSessionSnapshot`을 호출한다.
  - editor dirty snapshot은 `CreateScenarioDto & UpdateScenarioDto`로 cast하지 않고 draft decoder를 통과시킨다.
- 완료 기준:
  - 오래된/손상된 localStorage 값으로 페이지가 예외를 내지 않고 저장값을 폐기하거나 fallback한다.

### 9단계. OAuth, JWT, Prisma/enum cast 정리

- 대상 파일:
  - `be/src/modules/users/users.service.ts`
  - `be/src/common/auth/token.utils.ts`
  - `fe/src/services/authToken.ts`
  - `be/src/modules/characters/character-avatar-asset.service.ts`
  - `be/src/modules/scenarios/scenarios.service.ts`
- 구현:
  - OAuth 응답별 parser를 만든다.
    - Kakao token: `access_token` 필수
    - Kakao user: `id` 필수, profile/email 선택
    - Discord token: `access_token` 필수
    - Discord user: `id` 필수, username/global_name/email/verified 선택
  - JWT payload는 `sub`, `type`, `exp` 타입까지 확인한다.
  - Prisma cast는 schema/client 동기화 후 제거한다.
  - enum cast는 guard 함수 통과 후에만 허용한다.
- 완료 기준:
  - 외부 OAuth/JWT/Prisma enum 경계의 `as T`, `as unknown as`가 줄어든다.
  - 필수 claim/필드 누락 시 명확한 인증 또는 upstream 오류가 난다.

## 마일스톤

### M1. 검증 유틸과 프론트 ingress 방어

- 포함 단계: 1, 2, 3, 8
- 기대 효과: 서버 응답/실시간 이벤트/브라우저 저장값 때문에 프론트가 예외로 멈추는 위험을 줄인다.
- 완료 산출물:
  - `runtime-guards`
  - HTTP decoder 적용
  - WebSocket safe listener
  - storage decoder

### M2. 백엔드 외부 입력과 upstream 방어

- 포함 단계: 4, 5, 9
- 기대 효과: AI/OAuth/REST 요청에서 잘못된 외부 구조가 도메인 로직 안으로 들어오지 않는다.
- 완료 산출물:
  - AI response decoder
  - DTO nested validation
  - OAuth/JWT parser

### M3. 내부 저장 JSON과 adapter 타입 복구

- 포함 단계: 6, 7
- 기대 효과: 오래된 DB JSON과 서비스 분리 adapter가 타입 시스템을 우회하지 않는다.
- 완료 산출물:
  - 공통 JSON parser
  - domain decoder
  - `any[]` adapter 제거

## 검증 계획

테스트는 지시에 따라 이 문서 작성 중 실행하지 않았다. 구현 후 사용자가 아래 순서로 실행하면 된다.

### 빌드 검증

```bash
npm run build -w @trpg/shared-types
npm run build -w @trpg/be
npm run build -w @trpg/fe
npm run build
```

### 백엔드 테스트

```bash
npm test -w @trpg/be -- --runInBand
```

### 프론트 수동 확인

- 로그인 후 세션 목록 진입
- 세션 상세 진입
- 플레이 페이지 진입 후 WebSocket 연결 확인
- 전투/VTT map 갱신 이벤트 확인
- 브라우저 localStorage에 오래된 snapshot이 있어도 화면이 복구되는지 확인

### 실패 케이스 확인

- 서버 응답 `data` 누락 시 프론트가 명확한 오류를 표시하는지 확인
- WebSocket payload shape가 틀릴 때 handler가 호출되지 않고 로그만 남는지 확인
- AI 서버가 빈 객체를 반환할 때 백엔드가 `BadGatewayException`으로 처리하는지 확인
- 잘못된 scenario node `checkOptions/transitions/clues` 요청이 400으로 거부되는지 확인

## 권장 처리 순서

1. 1단계와 2단계를 먼저 진행한다. 프론트 API 경계가 가장 넓고 실제 사용자 화면 오류로 이어지기 쉽다.
2. 3단계를 이어서 진행한다. WebSocket payload는 서버-프론트 버전 불일치가 생기기 쉬운 두 번째 ingress다.
3. 4단계와 5단계로 백엔드 외부 입력을 막는다.
4. 6단계로 DB JSON 안정성을 보강한다.
5. 7단계로 `any[]` adapter를 제거해 이후 리팩터링 안전성을 회복한다.
6. 8단계와 9단계는 M1/M2 작업 중 닿는 파일부터 병행하되, 별도 커밋으로 분리한다.
