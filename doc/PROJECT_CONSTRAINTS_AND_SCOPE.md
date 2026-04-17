# TRPG Platform with AI GM - 확정 제약 및 범위

## 1. 확정된 전제

본 프로젝트는 로컬 Ollama와 연동하여, 로컬 LLM이 TRPG의 GM 역할 일부를 대신하는 온라인 TRPG 플랫폼을 목표로 한다.

현재 확정된 제약은 다음과 같다.

- 룰셋: D&D 5e 계열의 공개 SRD 기반 룰을 사용한다.
- 콘텐츠: 공개 SRD와 무료 공개 시나리오만 사용한다.
- 로컬 LLM: Ollama 기반 Gemma 4 계열 모델을 사용한다.
- 추론 장비: VRAM 8GB, RAM 64GB 노트북을 기준으로 한다.
- 응답 시간 목표: 사용자 액션 1회당 30초 이내 응답을 목표로 한다.
- MVP 범위: 여러 플레이어가 같은 세션에 접속하는 온라인 플레이를 포함한다.
- 핵심 구조: AI가 게임의 진실값을 직접 결정하지 않고, 규칙 엔진과 상태 엔진이 최종 상태를 확정한다.

## 2. 라이선스 및 콘텐츠 정책

### 허용 콘텐츠

- D&D 5e SRD에서 공개된 규칙, 클래스, 주문, 몬스터, 장비, 조건, 판정 구조
- CC-BY-4.0 또는 그와 호환되는 명시적 무료 라이선스가 있는 시나리오
- 팀이 직접 작성한 오리지널 시나리오, NPC, 지역, 몬스터 변형
- 사용자가 직접 입력한 세션 내 플레이 로그와 캐릭터 정보

### 금지 콘텐츠

- SRD에 포함되지 않은 유료 룰북 전문 또는 고유 설정
- Forgotten Realms 등 별도 IP에 속하는 세계관, 지명, 캐릭터, 고유 몬스터
- 라이선스가 불명확한 팬 시나리오, 이미지, 지도, 텍스트
- 무료 배포 PDF라 하더라도 재배포나 제품 내 포함 권리가 명확하지 않은 원문 텍스트

### 구현 원칙

- 로컬 PDF는 개발 참고 자료로만 두고, 저장소에 커밋하지 않는다.
- 서비스 DB나 seed 데이터에는 허용 라이선스가 확인된 내용만 넣는다.
- SRD 원문을 그대로 대량 복제하기보다, 엔진에 필요한 구조화 데이터와 짧은 근거 참조 중심으로 사용한다.
- 제품/문서에는 SRD 사용 attribution을 포함한다.

권장 attribution:

```text
This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.
```

## 3. MVP 범위

MVP는 "AI 채팅 앱"이 아니라, 여러 플레이어가 접속 가능한 최소 TRPG 세션을 완주하는 것을 목표로 한다.

### MVP에 포함

- 세션 생성, 참가, 재입장
- 세션 초대 코드 또는 링크
- 여러 플레이어의 캐릭터 생성 및 세션 참여
- 캐릭터 시트 조회 및 기본 수정
- 공용 세션 로그
- 디지털 주사위 굴림
- SRD 5e 기반 기본 판정
- 기본 전투 상태 관리
- 시나리오 노드 진행
- 사용자 자연어 입력을 구조화 액션으로 변환하는 Interpreter
- 확정된 판정 결과를 서술하는 Narrator
- LLM 출력 검증, 재시도, fallback
- 최소 1개 무료/오리지널 데모 시나리오 완주

### MVP에서 제외

- 대규모 캠페인 관리
- 상용 룰북 전체 지원
- 복잡한 자동 전투 AI
- 고급 Director 자동 연출
- 유료 콘텐츠 마켓
- 권한이 복잡한 공개 방 목록
- 모바일 앱

## 4. 로컬 LLM 제약

VRAM 8GB 기준에서는 모델 응답 품질과 속도 편차를 전제로 설계해야 한다.

### 운영 기준

- LLM 호출은 한 턴에 최소화한다.
- MVP 기본 루프는 Interpreter 1회, Narrator 1회 호출을 기준으로 한다.
- Actor와 Director는 MVP 이후 또는 제한된 상황에서만 호출한다.
- 30초를 넘기면 timeout으로 처리하고 fallback 응답을 제공한다.
- structured output 실패 시 최대 1회 재시도한다.
- 재시도 후에도 실패하면 "판정 후보 선택 UI" 또는 "기본 판정 요청"으로 대체한다.

### 프롬프트 기준

- 긴 룰북 전문을 넣지 않는다.
- 현재 상태, 현재 노드, 최근 로그, 필요한 룰 조각만 전달한다.
- 출력은 JSON Schema로 제한한다.
- Narrator는 상태를 변경하지 못한다.

## 5. 온라인 멀티플레이 기준

MVP는 여러 플레이어가 같은 세션에 들어오는 것을 포함하므로, 상태 변경은 서버에서 단일 순서로 처리한다.

### 기본 원칙

- 클라이언트는 상태를 직접 확정하지 않는다.
- 모든 액션은 서버의 Turn Orchestrator를 거친다.
- 세션에는 하나의 authoritative state가 있다.
- 동시에 들어온 액션은 서버 수신 순서 또는 턴 순서에 따라 큐잉한다.
- 모든 상태 변경은 TurnLog와 StateDiff로 기록한다.

### 실시간 동기화

MVP에서는 WebSocket 또는 Server-Sent Events 중 하나를 사용한다.

- 세션 로그 추가 이벤트
- 캐릭터 상태 변경 이벤트
- 주사위 결과 이벤트
- 현재 턴 변경 이벤트
- AI 응답 처리 중 이벤트

## 6. 보강 문서 목록

구현 전 다음 문서를 기준으로 삼는다.

- `MVP_RULESET_SRD5E.md`: MVP에서 구현할 SRD 5e 기반 룰 범위
- `DATA_MODEL.md`: 핵심 엔티티와 스키마 초안
- `TURN_LOOP.md`: 한 턴이 처리되는 서버 흐름
- `AI_CONTRACTS.md`: Interpreter, Narrator, Actor의 입출력 계약
- `MVP_ACCEPTANCE_CRITERIA.md`: MVP 완료 판정 기준
