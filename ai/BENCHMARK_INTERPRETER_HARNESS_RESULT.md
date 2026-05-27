# Interpreter Harness Benchmark Result

이 문서는 Google AI Studio 기반 TRPG interpreter 하네스 도입 전후 측정 결과를 정리한다.

## 측정 조건

- 대상 역할: `interpreter`
- 측정 입력: 자연어 플레이어 명령 골든 케이스 31개
- 반복 횟수: 3회
- 총 측정 수: before 93회, after 93회
- before: `response_json_schema`, 하네스 fallback, trace logging 없이 Google AI Studio 응답을 직접 받는 방식
- after: 현재 `InterpreterService` / `AiHarnessService` 경로 사용

## 비교한 작업 범위

이 측정은 "AI 모델 자체 변경"이 아니라, Google AI Studio 응답을 실제 TRPG 런타임에서 사용할 수 있는 구조화 액션으로 만드는 하네스 도입 전후를 비교한다.

### Before

before 방식은 Google AI Studio에 prompt만 보내고 응답을 직접 받는 흐름이다.

- 역할별 Pydantic schema를 provider 응답 계약으로 전달하지 않았다.
- 응답이 JSON처럼 보여도 `InterpreterOutput` schema 검증을 통과한다는 보장이 없었다.
- `action.type`, `actorCharacterId`, `targetId`, `spellId`, `requiresRoll` 같은 런타임 필드의 존재와 값 범위를 강제하지 않았다.
- 응답의 `targetId`가 현재 장면의 `availableTargets` 안에 있는지 검증하지 않았다.
- spell, class feature, item, condition, rule ID가 SRD 검색 결과와 맞는지 검증하지 않았다.
- 실패 응답을 `schema_validation`, `invalid_response`, `upstream_error`, `quota` 같은 원인으로 분류하지 않았다.
- 실패 시 세션을 이어가기 위한 fallback 응답을 만들지 않았다.
- 성공, 실패, fallback을 trace/log로 남기는 경로가 없었다.

### After

after 방식은 현재 interpreter 하네스를 거치는 흐름이다.

- `InterpreterOutput.model_json_schema()`를 Google AI Studio의 `response_json_schema`로 전달한다.
- Google AI Studio 응답을 JSON object로 파싱한 뒤 Pydantic `InterpreterOutput`으로 검증한다.
- `StructuredAction.type`을 허용된 TRPG action enum으로 제한한다.
- `actorCharacterId`가 요청의 actor와 일치하는지 검증한다.
- `targetId`가 현재 요청의 `availableTargets` 안에 있는지 검증한다.
- 주문 행동은 `spellId`, `mentionedSpellId`, `attackKind` 계약을 검증한다.
- class feature 행동은 SRD rule hook에서 검색된 feature ID만 허용한다.
- item, condition, rule check ID가 SRD retrieval 결과에 존재하는지 검증한다.
- provider/schema/timeout 계열 실패는 `AiClientError.failure_type`으로 분류한다.
- 실패해도 가능한 경우 template fallback으로 세션을 계속 진행한다.
- 모든 success/failure/fallback을 `runtime_logs/harness_history.jsonl`과 latest JSON에 기록한다.
- trace에는 role, provider, model, promptVersion, latencyMs, attempts, failureType, finishReason을 남긴다.

## 성능 개선을 위해 진행한 작업

이번 개선의 핵심은 AI가 "그럴듯한 자연어/JSON"을 반환하는 것에서 끝나지 않고, 백엔드 런타임이 바로 소비할 수 있는 검증된 구조화 액션을 반환하도록 파이프라인을 고정한 것이다.

1. **역할별 응답 schema 고정**

   `InterpreterOutput`과 `StructuredAction`을 기준으로 action type, actor, target, spell, feature, roll 여부 등 응답 필드를 명확히 정의했다. 이를 통해 AI 응답이 런타임 DTO와 같은 모양을 갖도록 만들었다.

2. **Google AI Studio JSON schema 응답 사용**

   `response_mime_type="application/json"`과 `response_json_schema`를 사용해 provider 단계에서 JSON object 응답을 유도했다. Pydantic schema 중 Google AI Studio가 거부하는 일부 키워드는 sanitize한 뒤 전달하도록 했다.

3. **Pydantic 기반 schema 검증 추가**

   provider가 반환한 JSON을 `InterpreterOutput.model_validate(...)`로 검증했다. 이 단계에서 필수 필드 누락, 잘못된 action enum, 잘못된 타입, 범위 밖 confidence 같은 응답을 걸러냈다.

4. **런타임 contract 검증 추가**

   schema만 맞는 응답이 아니라 실제 세션 상태와 맞는 응답인지 확인했다. 대표적으로 actor 일치, target allowlist, spell/action 계약, class feature ID, item/condition/rule ID를 검증했다.

5. **SRD retrieval 기반 근거 제한**

   플레이어 입력에서 관련 주문, 룰 조각, 엔진 hook, 아이템, 상태이상을 검색하고, AI가 사용할 수 있는 ID를 그 결과 안으로 제한했다. 이를 통해 없는 주문이나 없는 타겟을 응답하는 비율을 줄였다.

6. **실패 유형 분류와 retry/fallback 처리**

   timeout, quota, rate limit, network, invalid response, schema validation, upstream error를 구분해 기록했다. provider/schema 계열 실패는 세션을 멈추지 않도록 template fallback 응답으로 전환했다.

7. **trace/log 저장**

   모든 실행 결과에 대해 status, failureType, latencyMs, attempts, model, promptVersion을 남겼다. 이로 인해 실패 원인을 raw 응답 수동 확인이 아니라 로그 기반으로 추적할 수 있게 되었다.

8. **전후 비교 벤치마크 작성**

   같은 31개 자연어 명령 케이스를 before/after로 3회씩 실행하고, JSON 파싱 성공률, schema 검증 성공률, contract 검증 성공률, intent 일치율, 런타임 사용 가능률, 세션 진행 가능률, latency를 비교했다.

## 핵심 결과

| 지표                     | Before |  After |   개선폭 |
| ------------------------ | -----: | -----: | -------: |
| JSON 파싱 성공률         | 53.76% | 81.72% | +27.96%p |
| Schema 검증 성공률       |  9.67% | 81.72% | +72.05%p |
| Contract 검증 성공률     |  8.60% | 81.72% | +73.12%p |
| Intent 일치율            |  4.30% | 48.39% | +44.09%p |
| Target 일치율            | 34.41% | 66.67% | +32.26%p |
| Clarification 일치율     | 53.76% | 81.72% | +27.96%p |
| Provider usable rate     |  3.22% | 46.24% | +43.02%p |
| Session continuable rate |  3.22% | 48.39% | +45.17%p |

## 응답 시간

| 지표          |   Before |    After |
| ------------- | -------: | -------: |
| 평균 응답시간 | 18,633ms |  3,329ms |
| p50 응답시간  | 18,102ms |  2,951ms |
| p95 응답시간  | 26,666ms |  9,418ms |
| 최소 응답시간 | 12,154ms |      0ms |
| 최대 응답시간 | 28,572ms | 18,468ms |

after의 최소 응답시간 0ms는 provider 응답이 아니라 template fallback 응답이 포함되었기 때문이다.

## 상태 분포

### Before

| 상태    | 횟수 |
| ------- | ---: |
| success |   50 |
| failure |   43 |

| 실패 유형      | 횟수 |
| -------------- | ---: |
| none           |   50 |
| timeout        |    2 |
| upstream_error |   24 |
| quota          |   17 |

### After

| 상태     | 횟수 |
| -------- | ---: |
| success  |   43 |
| fallback |   33 |
| failure  |   17 |

| 실패 유형         | 횟수 |
| ----------------- | ---: |
| none              |   43 |
| schema_validation |   19 |
| upstream_error    |   14 |
| quota             |   17 |

## 해석

하네스 도입 전에는 Google AI Studio가 JSON object를 반환한 경우가 53.76%였지만, 반환된 응답이 `InterpreterOutput` schema와 런타임 contract를 통과한 경우는 0%였다. 즉 before 방식은 응답이 JSON처럼 보이더라도 게임 런타임에 바로 연결할 수 있는 구조화 액션으로 보기 어려웠다.

하네스 도입 후에는 JSON 파싱, Pydantic schema 검증, runtime contract 검증 통과율이 모두 81.72%까지 올라갔다. 이는 AI 응답을 단순 텍스트가 아니라 `action.type`, `actorCharacterId`, `targetId`, `spellId`, `requiresRoll` 같은 런타임 필드를 가진 구조화 데이터로 안정적으로 다룰 수 있게 되었음을 의미한다.

또한 provider 응답만으로 바로 사용할 수 있는 비율은 0.00%에서 46.24%로 개선되었고, fallback을 포함해 세션을 계속 진행할 수 있는 비율은 0.00%에서 48.39%로 개선되었다. 실패 응답도 `schema_validation`, `upstream_error`, `quota`처럼 원인별로 기록되므로, 이전처럼 raw 응답을 사람이 직접 확인하는 방식보다 장애 원인 추적이 쉬워졌다.

응답 시간도 평균 기준 18.63초에서 3.33초로 줄었다. 다만 after에는 0ms template fallback이 포함되어 있으므로, provider 자체의 순수 응답 속도 개선으로만 해석하면 안 된다. 이 수치는 하네스가 실패 응답을 빠르게 fallback으로 전환해 세션 중단 시간을 줄인 효과까지 포함한 서비스 관점 응답 시간이다.

## 포트폴리오 문장

```text
Google AI Studio 기반 TRPG 명령 해석 하네스를 구축해 자연어 명령 93회 측정 기준, AI 응답의 JSON 파싱 성공률을 53.76%에서 81.72%로 개선하고, schema/contract 검증 통과율을 0%에서 81.72%로 끌어올렸습니다. 또한 런타임 사용 가능 응답률을 0%에서 46.24%, 세션 진행 가능률을 0%에서 48.39%로 개선했으며, 평균 응답시간을 18.63초에서 3.33초로 단축했습니다.
```

## 주의점

- before와 after 모두 `quota` 실패가 17건 포함되어 있다.
- 따라서 위 수치는 quota 영향을 포함한 실측 결과다.
- 더 엄밀한 포트폴리오 지표가 필요하면 `quota` 실패를 제외한 정제 지표를 별도로 계산하는 것이 좋다.
- after의 fallback 응답은 provider 응답 성공이 아니라 서비스 연속성 확보로 해석해야 한다.
