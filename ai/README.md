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
│  │  ├─ interpreter.v1.md
│  │  └─ narrator.v1.md
│  ├─ schemas/
│  │  ├─ harness.py
│  │  ├─ interpreter.py
│  │  └─ narrator.py
│  ├─ services/
│  │  ├─ harness.py
│  │  ├─ interpreter/service.py
│  │  └─ narrator/service.py
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
  -Uri http://127.0.0.1:8100/api/harness/smoke `
  -Method Post `
  -ContentType 'application/json' `
  -Body (@{
    prompt = '플레이어가 "문을 조사한다"라고 말했다. 이를 구조화 액션으로 바꿔라.'
  } | ConvertTo-Json)
```

## 엔드포인트

- `GET /api/health`
- `POST /api/harness/smoke`
- `POST /api/harness/interpreter`
- `POST /api/harness/narrator`

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
- `harness_history.jsonl`

응답을 한 번 호출한 뒤 이 파일들을 열면 요청, 응답, 에러를 바로 확인할 수 있다.

## 다음 단계

- 상세 요청 목록과 제한 기준은 `ai/AI_REQUEST_INVENTORY.md`를 우선 기준으로 본다.
- `shared-types`와 AI 입출력 DTO 정렬
- 응답 trace를 `AiTrace` 저장 포맷으로 매핑
- 실패 유형별 fallback 정책과 백엔드 연동
- 실제 interpreter/narrator 프롬프트 고도화
