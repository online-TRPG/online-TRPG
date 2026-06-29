# Architecture Rules

## 1. 서버가 게임 상태의 최종 권위자다

클라이언트는 액션 요청과 화면 표시를 담당하고, 상태 확정은 서버가 한다.

지켜야 할 것:

- 클라이언트에서 HP, 단서 획득, 노드 이동, 전투 결과를 최종 확정하지 않는다.
- 모든 게임 행동은 서버 API 또는 세션 큐를 거쳐 처리한다.
- 클라이언트의 optimistic UI는 임시 로그 표시 수준으로 제한한다.
- 서버 이벤트를 기준으로 최종 화면을 갱신한다.

이유:

여러 플레이어가 같은 세션에 접속하기 때문에 클라이언트별 임의 상태가 생기면 같은 장면을 서로 다르게 보게 된다. 서버가 authoritative state를 유지해야 재입장, 로그 재생, 동시성 검증, 전투 처리, 사람 GM 조작이 일관된다.

## 2. 상태 변경은 순서와 이력을 남긴다

모든 중요한 상태 변경은 재현 가능한 형태로 기록해야 한다.

지켜야 할 것:

- 플레이어 입력은 `PlayerAction` 또는 그에 준하는 요청 기록으로 남긴다.
- 실제 플레이 결과는 `TurnLog`로 남긴다.
- 상태 변경은 `StateDiff`로 표현한다.
- 주사위 결과는 별도 로그나 턴 로그 snapshot으로 추적 가능해야 한다.
- 공개된 단서, 방문 노드, 전투 이력은 현재 상태 필드에만 묻어두지 않는다.

이유:

TRPG 세션은 현재 상태뿐 아니라 “어떻게 여기까지 왔는가”가 중요하다. 이력이 있어야 리플레이, 감사, 디버깅, 요약, AI 컨텍스트 구성, 사람 GM 개입을 안정적으로 지원할 수 있다.

## 3. 세션과 시나리오는 분리한다

`Session`은 사람들의 모임이고, `Scenario`는 플레이 콘텐츠다.

지켜야 할 것:

- `Session`이 원본 `Scenario`를 직접 현재 진행 상태처럼 소유하지 않는다.
- 세션에서 플레이 중인 시나리오는 `SessionScenario` 같은 연결 단위로 관리한다.
- 원본 장면은 `ScenarioNode`, 세션 진행 중 장면은 `SessionScenarioNode`처럼 분리한다.
- 이미 시작한 세션은 원본 시나리오 수정의 영향을 직접 받지 않아야 한다.

이유:

같은 세션이 여러 시나리오를 이어갈 수 있고, 같은 원본 시나리오를 여러 세션이 사용할 수 있다. 원본과 런타임 데이터를 섞으면 시나리오 편집, 복제, 재개, 사람 GM의 장면 수정이 서로 영향을 주기 쉽다.

## 4. 긴 데이터는 현재 포인터와 이력으로 나눈다

`GameState`는 현재 위치, phase, version 같은 짧은 런타임 포인터를 맡고, 공개/방문/로그/전투 상세는 별도 모델이 맡는다.

지켜야 할 것:

- `GameState`에 모든 이력을 JSON 덩어리로 누적하지 않는다.
- 공개 단서는 `SessionReveal` 같은 공개 이력으로 관리한다.
- 방문 노드는 `SessionNodeVisit` 같은 방문 이력으로 관리한다.
- 전투 순서와 액션 자원은 전투 전용 모델로 관리한다.

이유:

현재 상태와 이력을 한 필드에 섞으면 조회, 권한 projection, 복구, 동시성 제어가 어려워진다. 현재 포인터와 이력을 나눠야 성능과 의미가 모두 명확해진다.

## 5. 실패해도 세션은 멈추지 않아야 한다

외부 AI, 네트워크, rate limit, 일부 검증 실패가 있어도 세션 진행은 가능한 fallback으로 이어져야 한다.

지켜야 할 것:

- LLM 실패를 세션 전체 실패로 전파하지 않는다.
- Interpreter 실패 시 선택지 기반 fallback을 제공한다.
- Narrator 실패 시 템플릿 서술을 제공한다.
- 실패는 숨기지 않고 로그로 남긴다.

이유:

TRPG 세션은 사람들의 동기화된 플레이 시간에 의존한다. 외부 AI 호출 하나가 실패했다고 세션 전체가 멈추면 서비스 신뢰성이 크게 떨어진다.

## 6. SRD 데이터는 단일 원천에서 생성한다

SRD 기반 직업, 특성, 주문, 종족, 장비, 몬스터 데이터는 `srd-data/generated` 산출물을 기준으로 관리한다.

지켜야 할 것:

- 사람이 SRD id, 이름, 레벨, 설명, 선택 규칙을 FE/BE에 새로 중복 작성하지 않는다.
- SRD 데이터 수정은 `ai/translated/*`와 `srd-data` generator/export 흐름을 통해 반영한다.
- 직업별 주문 목록은 `srd-data/sources/spell-class-lists.json`을 canonical source로 두고, D&D 5e API 2014 SRD 기반 importer `npm run import:spell-class-lists -w @trpg/srd-data`로 갱신한다.
- canonical 보조 artifact인 `class-features.json`, `spell-class-lists.json`, `fe-spell-pools.json`, `fe-usable-items.json`, `item-labels.json`, `catalog-fingerprint.json`은 `npm run build -w @trpg/srd-data`로 생성/검증한다.
- FE의 `fe/public/srd/*.json`은 원천이 아니라 `npm run sync:fe:srd`로 생성되는 배포용 복사본으로 본다.
- FE/BE/AI catalog version은 `srd-data/generated/srd/catalog-fingerprint.json`과 FE public 복사본으로 대조한다.
- id 기반 보강 입력은 `srd-data/overrides/README.md`의 허용 범위 안에서만 추가한다.
- FE-only 보강은 아이콘, 색상, 카드 tone, UX grouping 같은 id 기반 presentation override로 제한한다.
- BE-only 보강은 action cost, hook id, resource id, targeting 같은 canonical id 기반 runtime metadata로 제한한다.
- 새 SRD id나 runtime content id를 추가하거나 바꾼 뒤에는 `npm run verify:rule-data-sync`가 통과해야 한다.

이유:

FE, BE, AI가 서로 다른 SRD 데이터를 읽으면 캐릭터 생성 프리뷰, 서버 검증, 전투 실행, AI 검색 결과가 어긋난다. `srd-data`를 단일 원천으로 두고 `verify:rule-data-sync`로 drift를 막아야 “FE에는 보이지만 BE는 모르는 id”나 “BE에는 있지만 FE 설명이 fallback으로 떨어지는 feature”가 재발하지 않는다.

