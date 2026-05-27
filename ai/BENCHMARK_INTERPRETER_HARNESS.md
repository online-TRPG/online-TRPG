# Interpreter Harness Benchmark

이 벤치마크는 AI interpreter 하네스 도입 전/후를 같은 입력 케이스로 비교한다.

## 비교 기준

- before: `response_json_schema`, 하네스 fallback, trace logging 없이 Google AI Studio 응답을 직접 받는다.
- after: 현재 `InterpreterService`/`AiHarnessService` 경로를 사용한다.
- 공통: 같은 case, 같은 model, 같은 temperature, 같은 prompt context를 사용한다.

## 주요 지표

- `jsonParsed`: JSON object 파싱 성공 여부
- `schemaValid`: `InterpreterOutput` Pydantic 검증 성공 여부
- `contractValid`: actor, target, spell/item/rule contract 검증 성공 여부
- `intentMatched`: 기대 action type과 실제 action type 일치 여부
- `targetMatched`: 기대 target이 있는 case에서 target 일치 여부
- `providerUsable`: fallback 없이 provider 응답만으로 런타임 사용 가능 여부
- `sessionContinuable`: fallback 포함 세션 진행 가능 여부
- `latencyMs`: provider 응답 시간

## 실행

프로젝트 지침상 이 문서는 실행 명령어만 제공한다. 실제 Google AI Studio 호출은 사용자가 직접 실행한다.

```powershell
cd C:\Users\SSAFY\work\S14P31A201\ai
python -m pip install -e .[dev]
python scripts\measure_interpreter_harness.py --mode both --repeat 3 --out runtime_logs\interpreter_harness_benchmark.jsonl
python scripts\summarize_interpreter_harness_benchmark.py --input runtime_logs\interpreter_harness_benchmark.jsonl
```

비용을 줄여 smoke만 확인하려면:

```powershell
cd C:\Users\SSAFY\work\S14P31A201\ai
python scripts\measure_interpreter_harness.py --mode both --limit 5 --repeat 1 --out runtime_logs\interpreter_harness_benchmark.smoke.jsonl
python scripts\summarize_interpreter_harness_benchmark.py --input runtime_logs\interpreter_harness_benchmark.smoke.jsonl --out-json runtime_logs\interpreter_harness_benchmark.smoke.summary.json --out-csv runtime_logs\interpreter_harness_benchmark.smoke.summary.csv
```

## 결과 해석 문장 템플릿

```text
Google AI Studio interpreter 하네스를 도입해 자연어 플레이어 명령 N건 기준 JSON 파싱 성공률을 A%에서 B%로, schema/contract 검증 통과율을 C%에서 D%로, 런타임 사용 가능 응답률을 E%에서 F%로 개선했다. fallback 포함 세션 진행 가능률은 G%를 확보했다.
```
