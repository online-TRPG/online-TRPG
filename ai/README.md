# AI 폴더 한눈에 보기

이 폴더는 TRPG 플랫폼의 AI GM 기능을 검증하는 FastAPI 하네스다.

AI는 말을 만들고, 의도를 해석하고, 후보를 제안한다. 게임 상태를 확정하는 쪽은 항상 백엔드 엔진이다.

## 지금 기준

- 기본 provider: Google AI Studio
- 기본 모델: `gemma-4-31b-it`
- 서버 코드: `app/`
- 프롬프트: `app/prompts/*.md`
- 생성된 SRD 런타임 데이터: `generated/srd/`
- 실행 로그: `runtime_logs/`

## 가장 중요한 규칙

1. AI는 HP, 피해, 명중, DC, 상태 변경, 보상, 노드 이동을 확정하지 않는다.
2. AI 출력은 JSON Schema를 통과해야 한다.
3. LLM 실패는 세션 실패가 아니다. 역할별 fallback으로 계속 진행한다.
4. 긴 SRD Markdown을 prompt에 넣지 않는다. `generated/srd/`의 작은 catalog와 rule fragment만 넣는다.
5. 새 입출력 필드를 추가하면 `AI_STUDIO_IO_FIELD_REFERENCE.md`, schema, test를 같이 고친다.

## 문서 읽는 순서

| 먼저 볼 문서                         | 용도                                       |
| ------------------------------------ | ------------------------------------------ |
| `README.md`                          | 현재 구조와 실행법                         |
| `AI_REQUEST_INVENTORY.md`            | 어떤 AI 요청이 있고 누가 책임지는지        |
| `AI_STUDIO_IO_FIELD_REFERENCE.md`    | Google AI Studio와 하네스 DTO 필드 뜻      |
| `SRD_DATA_RULES_PIPELINE_PLAN.md`    | SRD Markdown이 런타임 JSON으로 바뀌는 방식 |
| `BACKEND_ENGINE_INTEGRATION_PLAN.md` | 백엔드 룰 엔진으로 옮길 hook 순서          |
| `AI_SHARED_TYPES_ALIGNMENT.md`       | AI DTO와 백엔드/shared-types 매핑          |

## 역할

| 역할          | 하는 일                                   | 하지 않는 일                    |
| ------------- | ----------------------------------------- | ------------------------------- |
| `Interpreter` | 플레이어 자연어를 구조화 행동 후보로 바꿈 | 성공/실패, 피해, 상태 변경 확정 |
| `Narrator`    | 백엔드가 확정한 결과를 한국어로 서술      | 새 사실 추가                    |
| `Director`    | 공개 정보 안에서 힌트 제안                | 정답 강제, 숨김 단서 공개       |
| `Summarizer`  | 로그를 플레이어용/AI 문맥용으로 요약      | 새 사실 생성                    |
| `Actor`       | 허용된 NPC 행동 후보 중 하나 선택         | NPC 대사 작성, 새 행동 생성     |
| `NpcDialogue` | 이미 허용된 상황 안에서 NPC 대사 작성     | 행동 선택, 결과 확정            |

## API

하네스 직접 호출:

- `GET /api/health`
- `POST /internal/ai/smoke`
- `POST /internal/ai/interpreter`
- `POST /internal/ai/narrator`
- `POST /internal/ai/director`
- `POST /internal/ai/summarizer`
- `POST /internal/ai/actor`
- `POST /internal/ai/npc-dialogue`
- `GET /internal/ai/traces`

백엔드 세션 API 모양으로 재사용하는 경로:

- `POST /api/v1/sessions/{sessionId}/ai/hint`
- `POST /api/v1/sessions/{sessionId}/ai/npc-dialogue`
- `POST /api/v1/sessions/{sessionId}/ai/narration`
- `POST /api/v1/sessions/{sessionId}/ai/summary`
- `GET /api/v1/sessions/{sessionId}/ai-traces`

현재 AI 서버 자체는 최종 세션 권한/모드 검증자가 아니다. 실제 제품에서는 백엔드가 세션, 권한, GM 모드를 검증한 뒤 호출한다.

## 빠른 실행

```powershell
cd C:\WORK\S14P31A201\ai
python -m pip install -e .[dev]
uvicorn app.main:app --reload --port 8100
```

로컬 실행과 Docker Compose 모두 루트의 `.env.ai`를 사용한다. `ai/.env`는 더 이상 사용하지 않는다.

## 자주 쓰는 검증

일반 테스트는 외부 AI 호출 없이 실행한다. SRD 테스트도 현재 repo에 포함된 `generated/srd/` 런타임 catalog를 기준으로 검증한다.

```powershell
python -m pytest
```

Google AI Studio 실제 통신만 확인하려면 아래 한 줄을 실행한다. 이 테스트는 `GoogleAiStudioClient.generate_json()`으로 실제 요청을 1회 보내므로 Google AI Studio 사용량에 잡힌다.

```powershell
python -m pytest app\tests\test_live_google_ai_studio.py -q
```

`GOOGLE_API_KEY`는 루트 `.env.ai`에 넣거나 현재 PowerShell 세션에 설정한다. 키가 없으면 live test는 skip된다.

```powershell
$env:GOOGLE_API_KEY='...'
```

`generated/srd/`를 다시 생성하는 빌드 스크립트는 `translated/` 원천 Markdown이 있는 별도 작업 환경에서만 실행한다. 일반 테스트 경로에는 포함하지 않는다.

## 현재 생성 데이터

`generated/srd/`는 런타임에 필요한 compact catalog라서 repo에 포함한다.

| 데이터                              | 현재 개수 |
| ----------------------------------- | --------: |
| 주문                                |       319 |
| 상태 이상                           |        15 |
| 규칙 카드                           |        80 |
| 규칙 조각                           |        16 |
| 규칙 hook fixture                   |        17 |
| 마법 아이템                         |       239 |
| 장비 item                           |       145 |
| 장비 참조 섹션                      |         8 |
| 몬스터/NPC                          |       317 |
| 종족                                |         9 |
| 직업                                |        12 |
| 백엔드 P0 contract case             |        19 |
| Interpreter -> backend handoff case |         7 |
| Narrator input fixture              |         7 |

## 다음에 볼 것

1. 백엔드 엔진 연동을 고칠 때는 `BACKEND_ENGINE_INTEGRATION_PLAN.md`의 P0 hook과 현재 백엔드 `rules/actions` 구현을 함께 본다.
2. AI DTO를 공용 타입으로 옮길 때는 `AI_SHARED_TYPES_ALIGNMENT.md`의 adapter 기준을 따른다.
3. prompt나 schema를 바꾸면 일반 test와 Google AI Studio live smoke를 다시 돌린다.
