# 성능 확장성 1x·10x·100x 결과 기록 템플릿

측정일: YYYY-MM-DD
브랜치/커밋:
측정 담당자:
Node/PostgreSQL/Python 버전:
CPU/메모리/OS:

이 문서는 실행 결과를 기록하는 템플릿이다. 측정하지 않은 값은 추정해 채우지 않고 `미실행`으로 둔다.

## 데이터셋

`seed-scale.mjs` dry-run의 계획값은 다음과 같다. apply 출력의 `created`와 DB count를 별도로 기록해 계획값과 일치하는지 확인한다.

| scale | 사용자 | 세션/시나리오 | participant/character | inventory | Reveal/Visit | PlayerAction/TurnLog/StateDiff/AiTrace | 중재 연결 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1x | 6 | 100/100 | 4/4 | 20 | 100/100 | 각 1,000 | 1 |
| 10x | 42 | 1,000/1,000 | 40/40 | 200 | 1,000/1,000 | 각 10,000 | 100 |
| 100x | 402 | 10,000/10,000 | 400/400 | 2,000 | 10,000/10,000 | 각 100,000 | 10,000 |

| scale | 실제 사용자 | 실제 세션 | 실제 시나리오 | 실제 participant | 실제 character | 실제 inventory | 실제 Reveal/Visit | 맵 토큰/objectCells | SRD 항목 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- |
| 1x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 100/100 | 미실행 |  |
| 10x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 1,000/1,000 | 미실행 |  |
| 100x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 10,000/10,000 | 미실행 |  |

`scripts/performance/verify-scale-fixture.sql`의 모든 `pass`, integrity, orphan 결과:

| scale | count 전부 true | integrity 전부 0 | orphan 전부 0 | 원본 결과 |
| --- | --- | --- | --- | --- |
| 1x | 미실행 | 미실행 | 미실행 |  |
| 10x | 미실행 | 미실행 | 미실행 |  |
| 100x | 미실행 | 미실행 | 미실행 |  |

## API 결과

각 scale에서 같은 route, 요청 수, 동시성, warmup, timeout을 사용한다. 인증 header 값은 결과 파일에 기록하지 않는다. 표에는 결과 JSON의 `mode`가 `run`인 측정만 기록하며 기본 dry-run 출력은 설정 확인에만 사용한다.

| benchmark | scale | p50 ms | p95 ms | p99 ms | req/s | error rate | response bytes | 결과 JSON |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| public scenario list | 1x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| public scenario list | 10x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| public scenario list | 100x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| session snapshot | 1x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| session snapshot | 10x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| session snapshot | 100x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |

## Socket·VTT 결과

| scale | full bytes | delta bytes | 감소율 | build p95 ms | apply p95 ms | 결과 JSON |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| 10x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| 100x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |

운영과 같은 세션에서는 `PERFORMANCE_DIAGNOSTICS=1` 로그의 `session.snapshot`, `combat.updated`, `state.diff.applied`, `character.updated`, `vtt.map.updated`, `vtt.map.delta.v2` byte도 함께 비교한다.

공간 인덱스 수치는 `npm run benchmark:performance:vtt-spatial`의 JSON 원본을 보관하고 아래 표에 옮긴다. `falseNegativeCount`가 하나라도 있으면 시간 수치와 무관하게 실패다.

### Snapshot 생성

| scale | duration ms | Prisma operations | DB queries | DB duration ms | returned model rows | JSON bytes | 판정 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| 10x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| 100x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |

`session_snapshot_built.rowCounts`에서 participant, assignment, character, resource, inventory entry, item definition, scenario, game state, pending approval 관련 행을 함께 보관한다. `kind=detail`은 host 1행도 포함한다.

### 공간 후보

| kind | scale | source count | query count | chunk/fallback query | candidate count | unique candidate count | lookup ms | 판정 |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| proximity | 1x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| proximity | 10x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| proximity | 100x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| hazard detection | 1x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| hazard detection | 10x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| hazard detection | 100x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| hazard trigger | 1x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| hazard trigger | 10x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| hazard trigger | 100x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |

## SQL 실행계획

`scripts/performance/explain-performance-queries.sql`을 fixture scale별 대표 `session_id`, `user_id`로 실행하고 각 query의 JSON plan이 포함된 원본 출력을 보관한다.

| query | scale | execution ms | plan rows/actual rows | scan | sort | buffers hit/read | 판정 |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| public scenario list | 1x | 미실행 |  |  |  |  |  |
| public scenario list | 10x | 미실행 |  |  |  |  |  |
| public scenario list | 100x | 미실행 |  |  |  |  |  |
| AiTrace quality aggregate | 1x | 미실행 |  |  |  |  |  |
| AiTrace quality aggregate | 10x | 미실행 |  |  |  |  |  |
| AiTrace quality aggregate | 100x | 미실행 |  |  |  |  |  |

원본 plan에는 다음 label이 모두 있어야 한다: `public_scenario_list`, `public_scenario_recommended_list`, `public_scenario_level_list`, `scenario_moderation_queue`, `my_scenario_list`, `scenario_collaborator_grants`, `public_session_list`, `hosted_session_list`, `character_owner_list`, `scenario_source_list`, `scenario_base_forks`, `scenario_nodes`, `active_session_scenarios`, `turn_log_cursor_page`, `turn_log_by_player_action`, `turn_log_idempotency_lookup`, `ai_trace_cursor_page`, `ai_trace_quality_aggregate`, `recent_revealed_clues`, `exact_revealed_clue`, `exact_node_visit`, `scenario_moderation_linked_sessions`.

## 전환 증거·중재 fan-out

`PERFORMANCE_DIAGNOSTICS=1`에서 본문 없는 구조화 이벤트를 수집한다.
중재 API 표에는 `run-moderation-fanout-benchmark.mjs` 결과의 `mode`가 `apply`인 단일 POST만 기록한다. 기본 dry-run은 URL, scale, timeout, request byte를 확인하는 용도이며 duration이나 성공 판정에 사용하지 않는다.

| scale | moderation API duration ms | HTTP status | response bytes | action ID | verifier pass | 결과 JSON |
| ---: | ---: | ---: | ---: | --- | --- | --- |
| 1x | 미실행 | 미실행 | 미실행 |  | 미실행 |  |
| 10x | 미실행 | 미실행 | 미실행 |  | 미실행 |  |
| 100x | 미실행 | 미실행 | 미실행 |  | 미실행 |  |

| event | scale | duration ms | query 및 candidate/key 또는 linked count | page/group/createMany | retry | JSON bytes 또는 최종 로그 수 | 판정 |
| --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| `transition_evidence_built` | 1x | 미실행 | 미실행 | 해당 없음 | 해당 없음 | 미실행 |  |
| `transition_evidence_built` | 10x | 미실행 | 미실행 | 해당 없음 | 해당 없음 | 미실행 |  |
| `transition_evidence_built` | 100x | 미실행 | 미실행 | 해당 없음 | 해당 없음 | 미실행 |  |
| `scenario_moderation_turn_logs_built` | 1x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| `scenario_moderation_turn_logs_built` | 10x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |
| `scenario_moderation_turn_logs_built` | 100x | 미실행 | 미실행 | 미실행 | 미실행 | 미실행 |  |

## SRD 검색 결과

`ai/scripts/benchmark_srd_retrieval.py` 결과의 `construction_ms`, `index.estimated_bytes`, `search.p50_ms`, `search.p95_ms`, `search.max_ms`, `result_ids`를 기록한다. `result_consistency.pass`가 false이면 성능 수치와 무관하게 실패로 판정하고 `mismatches`를 원본 결과와 함께 보관한다.

플레이 화면 network 기록에서는 세션에 등장한 직업의 `srd/class-features/{class}.json`과 작은 `srd/fe-spell-pools.json`만 허용한다. `srd/class-features.json`, `srd/spells.json`, `srd/items.json`, `srd/monsters.json` 요청이 있으면 실패로 기록한다.

| scale | 직업별 manifest 요청 | 전체 class fallback | spells/items/monsters 요청 | transferred bytes | 판정 |
| --- | --- | --- | --- | ---: | --- |
| 1x | 미실행 | 미실행 | 미실행 | 미실행 |  |
| 10x | 미실행 | 미실행 | 미실행 | 미실행 |  |
| 100x | 미실행 | 미실행 | 미실행 | 미실행 |  |

## 판정과 후속 조치

- 기능 결과 동일성:
- 10x 증가율:
- 100x 증가율:
- 병목 query/event:
- rollback 또는 추가 작업:
- 테스트 실행 명령과 원본 결과 위치:
