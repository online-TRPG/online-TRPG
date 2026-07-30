# AI Runtime Rules

## 1. AI는 게임의 진실값을 확정하지 않는다

AI는 입력 해석, 후보 선택, 대사, 내레이션, 힌트, 요약을 도울 수 있지만 최종 상태 변경 권한은 없다.

지켜야 할 것:

- Interpreter는 행동을 구조화할 뿐 피해, 단서 획득, HP 변경, DC를 확정하지 않는다.
- Narrator는 확정된 결과를 서술할 뿐 새 사실을 추가하지 않는다.
- Actor는 허용된 행동 후보 중 하나를 고를 뿐 행동 후보를 새로 만들지 않는다.
- NpcDialogue는 대사를 만들 뿐 행동 선택이나 상태 변경을 하지 않는다.
- Director는 힌트와 전개 후보를 제안할 뿐 상태를 바꾸지 않는다.

이유:

AI 출력은 확률적이고, 세션 상태와 룰의 source of truth가 될 수 없다. 게임의 일관성은 Rule Engine, State Engine, 서버 검증이 보장해야 한다.

## 2. AI 출력은 항상 구조화하고 검증한다

AI 응답은 바로 적용하지 않고 서버 하네스를 거친다.

지켜야 할 것:

- 역할별 출력은 JSON 객체로 받는다.
- JSON parse, schema 검증, 의미 검증, 룰 검증을 통과해야 한다.
- schema 실패나 parse 실패는 역할별 최대 1회만 재시도한다.
- `AI_MAX_RETRIES`는 0 또는 1만 허용해 최초 호출을 포함한 provider 호출 상한을 2회로 고정한다.
- 재시도 후 실패하면 fallback으로 전환한다.
- 검증 실패 원인은 `AiTrace` 또는 실패 로그로 추적 가능해야 한다.

이유:

AI가 자연어로 잘못된 형식, 존재하지 않는 대상, 금지된 상태 변경을 만들 수 있다. 구조화와 검증이 있어야 AI를 플랫폼 내부의 안전한 보조 계층으로 쓸 수 있다.

## 3. LLM 호출은 최소화한다

MVP 기본 루프는 Interpreter 1회, Narrator 1회 호출을 기준으로 한다.

- provider prompt에는 역할 판단에 필요한 의미 데이터만 넣는다. `sessionId`, `turnId`, model override, 로그 경로 같은 추적·라우팅 메타데이터는 제외한다.
- 요청 의도가 확정된 Interpreter 호출은 전체 분류 taxonomy를 다시 읽지 않고 parameter extraction prompt를 사용한다.
- SRD entity, rule, class feature, transition 문맥은 해당 의도에서만 조회·전달한다.
- 서버가 계산할 수 있는 summary type, 범위, tone, 확정 intent의 confidence, safety note를 모델에게 생성시키지 않는다. 미분류 일반 요청의 분류 confidence만 모델 출력으로 받되 서버 검증과 fallback을 우선한다.
- Check Result의 민감한 정보 보상에는 action/scene/target 비공개 문맥을 보내지 않고, 모델이 선택한 문장도 `allowedRewardFacts` 한 항목과 정확히 일치할 때만 수용한다.
- 역할별 input/output/total token usage와 재시도율을 trace에 기록한다.
- 내부 AI→BE 및 Google provider 최소 출력 필드 집합은 `ai/contracts/internal_ai_contract_v1.json`으로 고정하고 Pydantic·조건부 provider schema·BE decoder allowlist와 함께 검증한다.

지켜야 할 것:

- 매 턴 Actor, NpcDialogue, Director, Summarizer를 무조건 호출하지 않는다.
- 필요한 현재 상태, 현재 노드, 최근 로그, 룰 조각만 전달한다.
- 긴 룰북 전문이나 전체 세션 로그를 프롬프트에 넣지 않는다.
- Interpreter의 고정 `requestIntent`는 지원 action type만 허용하고 알 수 없는 값은 provider 호출 전에 거부한다.
- timeout, quota, rate limit을 정상 경로의 일부로 다룬다.

이유:

호스팅 LLM은 지연, 비용, rate limit, 장애 가능성이 있다. AI 호출이 늘수록 세션 응답성과 안정성이 나빠지므로 engine-heavy, AI-light 구조를 유지해야 한다.

## 4. 실패 시 세션 진행 가능한 fallback을 제공한다

AI 실패는 사용자에게 막다른 오류가 아니라 대체 진행으로 보여야 한다.

지켜야 할 것:

- Interpreter 실패 시 선택지, 확인 질문, 기본 판정 요청으로 대체한다.
- Narrator 실패 시 템플릿 기반 서술을 사용한다.
- rate limit 또는 quota 오류는 즉시 fallback으로 전환한다.
- provider가 생성된 요청을 400/409로 거부하거나 모델을 찾지 못한 경우 재시도하지 않고 fallback으로 전환한다.
- provider 인증 401/403은 제품 호출자의 인증 오류가 아니므로 외부 401/403으로 전달하지 않는다.
- timeout은 30초 목표 안에서 끊고 fallback을 제공한다.
- BE transport timeout은 AI 서버 전체 deadline보다 길게 두되 BE에서 재시도하지 않는다.
- BE transport timeout은 응답 헤더뿐 아니라 body 읽기와 decode가 끝날 때까지 유지한다.
- readiness는 네트워크 호출 없이 API 키·provider·기본 모델과 `google-genai` 필수 request config 타입의 설치 여부를 확인한다.

이유:

AI는 보조 계층이다. AI가 실패해도 규칙 엔진, 상태 엔진, 사람 GM, 선택지 UI로 세션을 이어갈 수 있어야 한다.

## 5. API 키와 프롬프트 원문은 노출하지 않는다

AI 제공자 호출은 백엔드 내부에서만 수행한다.

지켜야 할 것:

- API 키는 백엔드 환경변수에만 둔다.
- 프론트엔드 번들에 AI 키나 provider secret을 포함하지 않는다.
- 클라이언트 응답에 내부 프롬프트 전문을 노출하지 않는다.
- `AiTrace`에도 키나 민감한 provider 메타데이터를 저장하지 않는다.
- 제품 Narrator 호출은 JOINED GM/HOST만 허용하고 구조화된 확정 `action`과 `scene` 없이 게시하지 않는다.
- request/response 전문과 raw model output은 기본 trace 저장 대상이 아니다.

이유:

AI 키와 내부 프롬프트는 보안 자산이다. 노출되면 비용, 악용, 세션 데이터 유출 위험이 생긴다.

