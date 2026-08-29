# AI 폴더 한눈에 보기

이 폴더는 TRPG 플랫폼의 AI GM 기능을 검증하는 FastAPI 하네스다.

AI는 말을 만들고, 의도를 해석하고, 후보를 제안한다. 게임 상태를 확정하는 쪽은 항상 백엔드 엔진이다.

## 지금 기준

- 기본 provider: Google AI Studio
- 기본 모델: `gemma-4-31b-it`
- 서버 코드: `app/`
- 프롬프트: `app/prompts/*.md`
- 생성된 SRD 런타임 데이터: repo root의 `srd-data/generated/srd/`
- 실행 로그: `runtime_logs/`

## 가장 중요한 규칙

1. AI는 HP, 피해, 명중, DC, 상태 변경, 보상, 노드 이동을 확정하지 않는다.
2. AI 출력은 JSON Schema를 통과해야 한다.
3. LLM 실패는 세션 실패가 아니다. 역할별 fallback으로 계속 진행한다.
4. 긴 SRD Markdown을 prompt에 넣지 않는다. repo root의 `srd-data/generated/srd/`에 있는 작은 catalog와 rule fragment만 넣는다.
5. 새 출력 필드를 추가하면 `contracts/internal_ai_contract_v1.json`, `AI_STUDIO_IO_FIELD_REFERENCE.md`, schema, BE decoder와 test를 같이 고친다. 입력 projection 변경은 필드 문서와 실제 prompt projection test를 같이 고친다.

## 문서 읽는 순서

| 먼저 볼 문서                         | 용도                                       |
| ------------------------------------ | ------------------------------------------ |
| `README.md`                          | 현재 구조와 실행법                         |
| `AI_REQUEST_INVENTORY.md`            | 어떤 AI 요청이 있고 누가 책임지는지        |
| `AI_STUDIO_IO_FIELD_REFERENCE.md`    | Google AI Studio와 하네스 DTO 필드 뜻      |
| `contracts/internal_ai_contract_v1.json` | 내부·provider 최소 출력의 기계 판독 기준 |
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
| `CheckResult` | 확정된 판정 결과를 짧게 서술             | 판정 변경, 새 단서·보상 생성    |

## API

하네스 직접 호출:

- `GET /internal/ai/health/live`
- `GET /internal/ai/health/ready`
- `GET /internal/ai/health` (readiness 호환 alias)
- `POST /internal/ai/smoke` (최소 `{ "ok": true }` structured-output 연결 확인)
- `POST /internal/ai/interpreter`
- `POST /internal/ai/narrator`
- `POST /internal/ai/director`
- `POST /internal/ai/summarizer`
- `POST /internal/ai/actor`
- `POST /internal/ai/npc-dialogue`
- `POST /internal/ai/check-result`
- `GET /internal/ai/traces`

제품의 `/api/v1/sessions/{sessionId}/ai/*` API는 백엔드만 소유한다. AI 서버는 `/internal/ai/*`만 제공하며, 백엔드가 세션·권한·GM 모드를 검증한 뒤 내부 호출한다.

## 빠른 실행

```powershell
cd C:\WORK\online-TRPG\ai
python -m pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
```

로컬 실행과 Docker Compose 모두 루트의 `.env.ai`를 사용한다. `ai/.env`는 더 이상 사용하지 않는다.

응답 진단 로그는 `AI_LOG_MAX_BYTES`를 파일당 상한으로 사용하고,
`harness_history.jsonl`과 회전본의 총량은
`AI_LOG_MAX_BYTES * (AI_LOG_BACKUP_COUNT + 1)` 바이트 이하로 제한한다.
역할별 `*.latest.json`은 각 파일이 같은 파일당 상한을 따르며, 고정된 내부 endpoint마다
하나만 덮어쓴다. `AI_TRACE_SCAN_MAX_BYTES`는 저장량이 아니라 한 번의 trace 조회가 읽는
전체 byte 상한이다. 프로세스가 처음 로그를 기록할 때 현재 설정을 넘는 이전 history,
초과 backup, `*.latest.json`을 정리하므로 max byte나 backup 개수를 낮춘 뒤에도 같은
상한을 복구한다. 운영 기본값은 payload 전문을 기록하지 않는다.

## 자주 쓰는 검증

일반 테스트는 외부 AI 호출 없이 실행한다. SRD 테스트도 현재 repo에 포함된 `srd-data/generated/srd/` 런타임 catalog를 기준으로 검증한다.

```powershell
python -m pytest
```

Google AI Studio 실제 통신만 확인하려면 아래 한 줄을 실행한다. 이 테스트는 `GoogleAiStudioClient.generate_json()`으로 실제 요청을 1회 보내므로 Google AI Studio 사용량에 잡힌다.

```powershell
python -m pytest app\tests\test_live_google_ai_studio.py -q
```

계획서의 token 절감 기준은 변경 전·후 동일 fixture의 provider usage를 별도 JSONL로 캡처한 뒤 비교한다. 전체 역할 비교에는 `role_token_cases.json`과 역할 공통 캡처기를 사용한다. 모든 fixture는 최소 하나의 비어 있지 않은 의미 품질 assertion을 가져야 한다. 두 서버는 usage가 포함된 `trace`를 반환해야 하며, baseline checkout에는 동작을 바꾸지 않는 usage 계측만 이식한다. 캡처기는 요청·응답 전문이나 raw model output을 저장하지 않고 fixture fingerprint, 역할, 모델, prompt version, token usage와 의미 품질 결과만 기록한다.

```powershell
python scripts\capture_ai_role_token_usage.py --base-url http://127.0.0.1:8001 --label before --model gemma-4-31b-it --repeat 3 --out runtime_logs\ai_token_before.jsonl
python scripts\capture_ai_role_token_usage.py --base-url http://127.0.0.1:8002 --label after --model gemma-4-31b-it --repeat 3 --out runtime_logs\ai_token_after.jsonl
python scripts\compare_ai_token_usage.py --before runtime_logs\ai_token_before.jsonl --after runtime_logs\ai_token_after.jsonl --before-mode before --after-mode after
```

위 캡처 명령은 서버를 통해 실제 Google 호출을 수행한다. 비교기는 같은 case ID뿐 아니라 각 행 identity에서 재계산한 canonical fixture set SHA-256, 선언된 사례 수와 반복 횟수, 반복별 완전성, 7개 운영 역할, request intent, 실제 `google-ai-studio` provider와 동일 모델이 모두 일치하는지 검사한다. 중단된 JSONL이나 일부 역할만 담긴 캡처는 비교하지 않는다. `--allow-partial-roles`는 진단용이며 완료 판정에는 사용하지 않는다. 전체 30%, known-intent 40%, GENERAL 20% 절감과 baseline·after 전 행의 의미 품질 통과를 만족하지 않으면 종료 코드 1이다. `measure_interpreter_harness.py --mode before`는 구버전 baseline이 아니라 현재 prompt의 비구조화 연구 경로이므로 완료 baseline으로 사용하지 않는다.

`GOOGLE_API_KEY`는 루트 `.env.ai`에 넣거나 현재 PowerShell 세션에 설정한다. 키가 없으면 live test는 skip된다.

```powershell
$env:GOOGLE_API_KEY='...'
```

`srd-data/generated/srd/`를 다시 생성하는 빌드 스크립트는 `translated/` 원천 Markdown이 있는 별도 작업 환경에서만 실행한다. 일반 테스트 경로에는 포함하지 않는다.

## 현재 생성 데이터

`srd-data/generated/srd/`는 런타임에 필요한 compact catalog라서 repo에 포함한다.

| 데이터                              | 현재 개수 |
| ----------------------------------- | --------: |
| 주문                                |       319 |
| 상태 이상                           |        15 |
| 규칙 카드                           |        80 |
| 규칙 조각                           |        11 |
| 규칙 hook fixture                   |        12 |
| 마법 아이템                         |       239 |
| 장비 item                           |       145 |
| 장비 참조 섹션                      |         8 |
| 몬스터/NPC                          |       317 |
| 종족                                |         9 |
| 직업                                |        12 |
| 백엔드 P0 contract case             |        12 |
| Interpreter -> backend handoff case |         3 |
| Narrator input fixture              |         3 |

## 다음에 볼 것

1. 백엔드 엔진 연동을 고칠 때는 `BACKEND_ENGINE_INTEGRATION_PLAN.md`의 P0 hook과 현재 백엔드 `rules/actions` 구현을 함께 본다.
2. AI DTO를 공용 타입으로 옮길 때는 `AI_SHARED_TYPES_ALIGNMENT.md`의 adapter 기준을 따른다.
3. prompt나 schema를 바꾸면 일반 test와 Google AI Studio live smoke를 다시 돌린다.
