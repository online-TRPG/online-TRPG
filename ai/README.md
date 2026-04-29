# AI Harness

이 폴더는 Google AI Studio 기반 Gemma 호출을 빠르게 시험하고, 이후 프로젝트용 역할별 하네스로 확장하기 위한 최소 FastAPI 서비스를 담는다.

## 확인 기준

- 2026-04-23 기준 Google 공식 문서에서 Gemini API가 지원하는 Gemma 4 모델은 `gemma-4-31b-it`, `gemma-4-26b-a4b-it`이다.
- 따라서 이 하네스의 기본값은 `gemma-4-31b-it`로 맞춘다.
- 필요하면 역할별로 `AI_MODEL_INTERPRETER`, `AI_MODEL_NARRATOR`를 분리해 다른 Gemma 4 모델을 지정할 수 있다.

공식 참고:

- [Run Gemma with the Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)
- [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)

## 구성

```text
ai/
├─ app/
│  ├─ api/routes/
│  │  ├─ harness.py
│  │  └─ health.py
│  ├─ clients/google_ai_studio.py
│  ├─ core/config.py
│  ├─ prompts/
│  │  ├─ actor.v1.md
│  │  ├─ director.v1.md
│  │  ├─ interpreter.v1.md
│  │  ├─ narrator.v1.md
│  │  └─ summarizer.v1.md
│  ├─ schemas/
│  │  ├─ actor.py
│  │  ├─ director.py
│  │  ├─ harness.py
│  │  ├─ interpreter.py
│  │  ├─ narrator.py
│  │  └─ summarizer.py
│  ├─ services/
│  │  ├─ actor/service.py
│  │  ├─ director/service.py
│  │  ├─ harness.py
│  │  ├─ interpreter/service.py
│  │  ├─ narrator/service.py
│  │  └─ summarizer/service.py
│  └─ main.py
└─ pyproject.toml
```

## 빠른 시작

1. 의존성 설치

```powershell
cd C:\Users\SSAFY\work\S14P31A201\ai
python -m pip install -e .[dev]
```

2. 환경변수 설정

```powershell
Copy-Item .env.example .env
```

`.env`에 `GOOGLE_API_KEY`를 넣는다.

3. 서버 실행

```powershell
uvicorn app.main:app --reload --port 8100
```

4. 스모크 테스트

```powershell
Invoke-RestMethod `
  -Uri http://127.0.0.1:8100/internal/ai/smoke `
  -Method Post `
  -ContentType 'application/json' `
  -Body (@{
    prompt = '플레이어가 "문을 조사한다"라고 말했다. 이를 구조화 액션으로 바꿔라.'
  } | ConvertTo-Json)
```

## 엔드포인트

- `GET /internal/ai/health`
- `POST /internal/ai/smoke`
- `POST /internal/ai/interpreter`
- `POST /internal/ai/narrator`
- `POST /internal/ai/director`
- `POST /internal/ai/summarizer`
- `POST /internal/ai/actor`
- `POST /internal/ai/npc-dialogue`
- `GET /internal/ai/traces`

성공 응답에는 아래 trace가 포함된다.

- `attempts`: 실제 호출 시도 횟수
- `finishReason`: Google 응답 종료 사유
- `providerRequestId`: 제공자 요청 식별자
- `logPaths.latest`: 마지막 응답 전체 JSON 파일
- `logPaths.history`: 누적 JSONL 로그 파일

실패 응답은 HTTP 에러와 함께 아래 detail을 반환한다.

- `failureType`: `timeout`, `rate_limit`, `quota`, `network`, `auth`, `invalid_response`, `schema_validation`, `upstream_error`
- `retryable`: 재시도 가능 여부
- `attempts`: 실패 시점까지의 시도 횟수
- `logPaths.latest`: 마지막 실패 전체 JSON 파일
- `logPaths.history`: 누적 JSONL 로그 파일

## 로그 파일

기본 저장 위치는 `ai/runtime_logs/`다.

- `smoke.latest.json`
- `interpreter.latest.json`
- `narrator.latest.json`
- `director.latest.json`
- `summarizer.latest.json`
- `actor.latest.json`
- `npc-dialogue.latest.json`
- `harness_history.jsonl`

응답을 한 번 호출한 뒤 이 파일들을 열면 요청, 응답, 에러를 바로 확인할 수 있다.
각 history row에는 백엔드 `AiTrace` 저장 포맷의 1차 기준인 `aiTrace` 객체가 함께 저장된다.

## 다음 단계

- 상세 요청 목록과 제한 기준은 `ai/AI_REQUEST_INVENTORY.md`를 우선 기준으로 본다.
- Google AI Studio로 보내거나 받는 필드, prompt context, JSON schema를 추가할 때는 `ai/AI_STUDIO_IO_FIELD_REFERENCE.md`에 필드 의미를 반드시 함께 추가한다.
- 백엔드 엔진 연결 순서는 `ai/BACKEND_ENGINE_INTEGRATION_PLAN.md`에 분리했다.
- `shared-types`와 AI 입출력 DTO 정렬 기준은 `ai/AI_SHARED_TYPES_ALIGNMENT.md`에 분리했다.
- 실패 유형별 fallback 정책과 백엔드 연동은 하네스 기준 1차 준비됨
- 실제 interpreter/narrator 프롬프트는 플레이 로그 기반 해석/서술 규칙을 1차 반영함
- 2026-04-28 live Google AI Studio 프롬프트 회귀 검증 9개 시나리오 통과
- 백엔드 엔진 P0 연결 준비 산출물은 `generated/srd/backend_engine_p0_contracts.json`에 생성됨
- shared-types adapter 준비 산출물은 `app/adapters/shared_types.py`에 생성됨
- P0 contract edge case는 12개 정상/경계/거절 case로 확장됨
- Interpreter -> backend hook handoff 샘플은 `generated/srd/interpreter_backend_handoff_cases.json`에 생성됨
- Narrator 입력 fixture는 `generated/srd/narrator_input_fixtures.json`에 생성됨
- AI Narrator의 상태 요약 DTO 이름은 `NarratorStateDiffSummary`/`stateDiffSummary`로 고정됨
- trace row 상태값은 `success`, `failure`, `fallback`으로 고정됨
- `Actor`는 NPC 행동 선택, `NpcDialogue`는 NPC 대사 생성 역할로 분리되고 `/internal/ai/npc-dialogue`로 구현됨
- 다음 실행 후보는 운영 로그/trace fixture 정리다.
