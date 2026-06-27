# 프론트엔드 사용자 표시 규칙

이 문서는 사용자 화면에 노출되는 텍스트의 기본 원칙을 정한다.

## 절대 원칙: 내부 ID 노출 금지

프론트엔드는 사용자에게 내부 ID를 직접 표시하지 않는다.

이 규칙은 예시 목록 방식이 아니다. 아래 목록은 이해를 돕기 위한 참고일 뿐이며, 목록에 없더라도 내부 식별자라면 전부 금지한다. 주문, 아이템, 특성, 사용자, 시나리오, 세션, 노드, 토큰, 액션, 에러 메시지, 관리자 외 일반 화면 등 모든 도메인과 모든 사용자-facing UI에 적용한다.

내부 ID의 예:

- DB primary key, foreign key, cuid, UUID, nanoid, provider user id
- API/DB 필드명에 `Id`, `ID`, `Key`, `Code`, `Ref`가 붙은 식별자
- `userId`, `createdByUserId`, `publishedByUserId`, `scenarioId`, `sessionId`, `characterId`
- `spellId`, `itemId`, `itemDefinitionId`, `featureId`, `classKey`, `raceKey`, `subclassKey`
- `nodeId`, `tokenId`, `actionId`, `conditionId`, `terrainEffectId`, `monsterId`
- `spell.fire_bolt`, `equipment.potion_of_healing`, `class.wizard.feature.spellcasting`, `scenario_p2_storm_vault`처럼 namespace가 붙은 catalog key
- raw enum key, storage key, provider id, opaque database id

내부 ID는 API payload, 상태 저장, 룰 매칭, 디버깅, 테스트 fixture에서만 사용한다. 사용자 화면에는 반드시 다음 중 하나로 변환한 값을 표시한다.

- 한국어 표시명
- 공식/프로젝트 용어집에 따른 사용자용 이름
- 준비된 표시명이 없을 때의 사람이 읽을 수 있는 fallback 이름

준비된 표시명이 없더라도 raw ID를 fallback으로 쓰지 않는다. namespace를 제거하거나 `_`, `-`, `.` 같은 저장용 구분자를 치환해 보여주는 것도 기본적으로 금지한다. 매핑이 불가능하면 `알 수 없는 사용자`, `선택한 시나리오`, `이름 없는 아이템`, `선택한 특성`처럼 맥락형 fallback을 쓴다.

금지 예:

- `치유 물약 / equipment.potion_of_healing`
- `Action Surge / class.fighter.feature.action_surge`
- `Race Elf Trait Base Traits`
- `scenario_p2_storm_vault was not found.`
- `공개한 유저: cmabc123...`

허용 예:

- `치유 물약`
- `액션 서지`
- `엘프 기본 특성`
- `폭풍 금고의 마지막 비행을 찾을 수 없습니다.`
- `공개한 유저: 아리아`

## 사용자 표시명

작성자, 공개한 유저, 세션 호스트, 참가자, 리뷰어, 운영자처럼 사람을 가리키는 값은 반드시 표시명으로 변환한다. 사용자 ID 계열 값은 이름을 알 수 없을 때도 fallback으로 표시하지 않는다.

표시 우선순위:

1. 공개 프로필 닉네임
2. 계정 displayName
3. 프로젝트가 정한 익명/알 수 없음 fallback

금지 예:

- `publishedByUserId: cmabc123...`
- `createdByUserId: user-1`
- `공개한 유저: cm2biiik0004sksc2b4zeo8z`

허용 예:

- `공개한 유저: 하린`
- `작성자: test-user`
- `공개한 유저: 알 수 없는 사용자`

권한 판별과 API 요청에는 내부 ID를 사용할 수 있지만, JSX에 직접 렌더링되는 값은 표시명이어야 한다.

## 주문 표시명

주문은 `spellPresentation`, SRD 정적 데이터, rule catalog의 사용자용 label을 통해 표시한다.

금지 예:

- `Fire Bolt / spell.fire_bolt`
- `Light / spell.light`
- `spell.magic_missile`

허용 예:

- `화염 화살`
- `빛`
- `마법 화살`

영문명과 한글명이 함께 있는 원천 데이터가 들어오면, 기본 사용자 화면에서는 한글명을 우선 표시한다.

## 아이템/장비 표시명

아이템은 인벤토리의 `name`, SRD 아이템 카탈로그, 세션 경제 상태의 사용자용 표시명을 통해 표시한다.

금지 예:

- `equipment.potion_of_healing`
- `equipment.thieves__tools`
- `itemDefinitionId`

허용 예:

- `치유 물약`
- `도둑 도구`
- `아이템 선택`

## 특성/종족/직업 표시명

캐릭터 특성은 feature ID를 화면에 직접 보여주지 않고, canonical feature/race/class presentation 데이터를 통해 이름과 설명을 표시한다.

금지 예:

- `class.bard.feature.spellcasting`
- `race.elf.trait.base_traits`
- `subclass.wizard.evocation.feature.evocation_savant`

허용 예:

- `주문시전`
- `엘프 기본 특성`
- `방출술의 대가`

## 에러 메시지

사용자용 에러 메시지에서도 내부 ID를 그대로 넣지 않는다. 서버나 프론트가 내부 ID만 가지고 있는 경우, 사용자용 이름으로 매핑한 뒤 표시한다. 매핑이 불가능하면 `선택한 시나리오`, `선택한 아이템`, `선택한 특성`처럼 맥락형 이름을 쓴다. `scenario_xxx was not found`, `user cmxxx not found` 같은 메시지를 그대로 노출하지 않는다.

## 예외

개발자 전용 로그, 테스트 로그, 관리자용 진단 화면처럼 내부 식별자 확인이 목적일 때만 ID를 노출할 수 있다. 이 경우에도 일반 플레이어 화면과 혼동되지 않게 “개발자/진단” 맥락을 명확히 분리한다.

예외 화면을 만들 때도 기본 화면과 같은 컴포넌트를 공유한다면 ID가 일반 사용자 화면으로 새지 않는지 별도로 확인한다.
