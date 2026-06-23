# MVP Acceptance Criteria

## 문서 목적

이 문서는 MVP가 "완료"되었다고 판단하기 위한 검증 기준을 정의한다.

## 적용 범위

- MVP 완료 여부 판정
- 데모 시나리오 완주 기준
- 기능, 성능, AI 품질, 라이선스 기준

## 핵심 요약

- MVP는 AI GM 세션과 사람 GM 세션이 모두 같은 플랫폼 구조에서 성립해야 완료로 본다.
- 상태 변경은 서버에서 확정되고 TurnLog와 StateDiff로 추적 가능해야 한다.
- LLM 실패가 발생해도 세션 진행은 fallback으로 이어져야 한다.
- 라이선스 출처가 불명확한 콘텐츠는 seed/data/UI에 포함하지 않는다.

## 상세 내용

### 데모 목표

최소 2명 이상의 플레이어가 같은 세션에 접속하여, SRD 5e 기반의 짧은 시나리오를 처음부터 끝까지 진행할 수 있어야 한다.
또한 같은 플랫폼 구조 안에서 `AI GM 세션`과 `사람 GM 세션`이 모두 성립해야 한다.

### 기능 완료 기준

#### 세션

- 사용자는 세션을 생성할 수 있다.
- 사용자는 공개 세션 목록에서 `WAITING` 세션을 찾을 수 있다.
- 다른 사용자는 공개 세션 목록 또는 초대 코드/링크로 같은 세션에 참가할 수 있다.
- 세션 생성 시 `AI GM`과 `사람 GM` 중 진행 모드를 선택할 수 있다.
- 세션 참가자는 온라인/오프라인 상태로 표시된다.
- 세션을 나갔다가 다시 들어와도 최근 상태와 로그를 볼 수 있다.

#### 캐릭터

- 각 플레이어는 계정 소유 캐릭터를 생성할 수 있다.
- 세션 참가 시 사용할 캐릭터를 선택할 수 있다.
- 캐릭터는 1레벨 SRD 기반 최소 필드를 가진다.
- 캐릭터 HP, AC, 능력치, 숙련 기술, 인벤토리를 볼 수 있다.

#### 룰/엔진

- d20 능력치 판정이 가능하다.
- d20 기술 판정이 가능하다.
- advantage/disadvantage를 처리할 수 있다.
- 기본 공격과 피해 적용이 가능하다.
- HP 변경과 상태이상이 StateDiff로 기록된다.
- 상태 변경은 서버에서만 확정된다.

#### 시나리오

- 최소 1개 데모 시나리오가 있다.
- 시나리오는 노드 기반으로 구성된다.
- 성공/실패에 따라 다른 노드 또는 다른 결과로 진행될 수 있다.
- 최소 1개 단서 발견, 1개 대화, 1개 판정, 1개 전투 또는 위험 상황을 포함한다.

#### AI GM

- 자연어 입력을 `StructuredAction`으로 변환할 수 있다.
- 확정된 판정 결과를 한국어 GM 서사로 출력할 수 있다.
- AI 출력이 schema 검증을 통과하지 못하면 상태에 반영되지 않는다.
- AI가 상태 변경을 임의로 추가하면 validator가 차단한다.
- LLM timeout 시 fallback 응답이 제공된다.

#### 사람 GM

- 사람 GM은 메인 진행 메시지를 전송할 수 있다.
- 사람 GM은 특정 NPC 이름으로 대사를 전송할 수 있다.
- 사람 GM은 현재 시나리오 노드를 수동 변경할 수 있다.
- 사람 GM은 이미지/맵/핸드아웃을 플레이어에게 공개할 수 있다.
- 사람 GM 세션에서는 GM만 전투 시작 권한을 가진다.

#### 실시간 동기화

- 한 플레이어의 액션 결과가 같은 세션의 다른 플레이어 화면에 반영된다.
- 주사위 결과가 공용 로그에 기록된다.
- 상태 변경이 모든 참가자에게 동기화된다.
- 전투 중 현재 턴을 표시할 수 있다.
- GM 메시지와 공개 자료가 모든 플레이어 화면에 동기화된다.

### 성능 기준

기준 장비:

- 프론트엔드와 백엔드: AWS EC2 서버에서 실행
- LLM: Google AI Studio / Gemini API의 호스팅 Gemma 4 모델
- 기본 모델: `gemma-4-31b-it`

목표:

- 일반 턴 평균 응답 시간: 30초 이내
- Interpreter timeout rate: 10% 이하
- Narrator timeout rate: 10% 이하
- 전체 fallback rate: 15% 이하
- rate limit 또는 quota로 인한 fallback도 전체 fallback rate에 포함
- 서버 엔진 처리 시간: 1초 이내

### AI 품질 기준

평가 데이터셋 기준:

- Interpreter schema pass rate: 90% 이상
- Interpreter intent accuracy: 80% 이상
- Narrator schema pass rate: 90% 이상
- Narrator no-new-facts violation rate: 5% 이하
- rule validator가 차단한 위험 출력과 provider timeout/fallback은 모두 `AiTrace`의 status, failureType, errorMessage에 남아야 한다.
- Google AI Studio API 오류, rate limit, quota 오류는 세션 중단 없이 fallback으로 처리되어야 한다.

운영 측정:

- `GET /sessions/:sessionId/ai-traces/metrics`에서 세션별 평균 latency, Interpreter/Narrator timeout rate, 전체 fallback rate와 임계값 충족 여부를 확인한다.
- schema pass rate, intent accuracy, no-new-facts 위반율은 정답 라벨이 있는 오프라인 평가 데이터셋으로 별도 측정한다.
- AI 서버를 실행한 뒤 저장소 루트에서 `npm run eval:ai-quality`를 실행한다. 결과는 `ai/runtime_logs/p0_ai_quality_report.json`에 저장되고 기준 미달 시 종료 코드 1을 반환한다.
- Interpreter 평가는 `ai/benchmarks/interpreter_harness_cases.json`, Narrator 평가는 `ai/benchmarks/narrator_quality_cases.json`을 사용한다.
- Narrator no-new-facts 자동 판정은 금지 문구 기반의 결정적 검사이므로, 위반 또는 경계 사례는 보고서의 원문을 사람이 추가 검토한다.

### 라이선스 기준

- 룰 데이터는 SRD 또는 직접 작성 데이터만 포함한다.
- 시나리오는 무료 사용 가능 여부와 attribution이 기록되어 있다.
- SRD attribution 문구가 문서 또는 제품 내 법적 고지에 포함되어 있다.
- 저장소에 권리가 불명확한 룰북 PDF, 유료 콘텐츠 전문, 이미지가 커밋되지 않는다.

### 데모 시나리오 합격 체크리스트

- 플레이어 2명이 세션에 참가한다.
- 각자 캐릭터를 생성한다.
- 첫 장면 설명이 표시된다.
- 플레이어가 자연어로 조사 행동을 입력한다.
- Interpreter가 기술 판정으로 변환한다.
- Dice Engine이 판정을 수행한다.
- Narrator가 결과를 서술한다.
- 단서 또는 플래그가 StateDiff로 반영된다.
- 다른 플레이어 화면에 로그와 상태가 반영된다.
- 위험 상황 또는 전투가 발생한다.
- 턴 순서대로 행동이 처리된다.
- 시나리오 종료 노드에 도달한다.

### MVP 완료 판정

다음 조건을 모두 만족하면 MVP 완료로 본다.

- 데모 시나리오를 처음부터 끝까지 2회 연속 완주한다.
- 두 번째 완주에서 서버 재시작 없이 세션 재입장이 성공한다.
- LLM 실패가 발생해도 세션 진행이 중단되지 않는다.
- 모든 상태 변경이 TurnLog와 StateDiff로 추적 가능하다.
- 라이선스 출처가 불명확한 콘텐츠가 seed/data/UI에 포함되어 있지 않다.

## 관련 원칙

- [../rules/ARCHITECTURE_RULES.md](../rules/ARCHITECTURE_RULES.md): 상태 변경, 로그, fallback 원칙
- [../rules/AI_RUNTIME_RULES.md](../rules/AI_RUNTIME_RULES.md): AI 품질과 실패 처리 원칙
- [../rules/CONTENT_LICENSE_RULES.md](../rules/CONTENT_LICENSE_RULES.md): 콘텐츠/라이선스 원칙

## 관련 문서

- [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md): MVP 범위와 제외 범위
- [RUNTIME_SESSION_TURN_FLOW.md](RUNTIME_SESSION_TURN_FLOW.md): 턴 처리 흐름
- [../scenarios/DEMO_SCENARIO.md](../scenarios/DEMO_SCENARIO.md): 데모 시나리오 본문

## 변경 시 주의사항

- 완료 기준을 바꾸면 `PRODUCT_SCOPE.md`의 MVP 범위와 충돌하지 않는지 확인한다.
- AI 품질 기준을 바꾸면 `AI_RUNTIME_CONTRACTS.md`의 평가 지표도 함께 확인한다.
