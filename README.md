# 서울 2반 A201 팀의 깃랩 레포입니다

## 권장 프로젝트 구조

이 레포는 `fe / be / ai / shared-types`를 중심으로 나누는 구조를 기준으로 잡는다.

```text
.
├─ fe/                           # React + TypeScript + Vite 프론트엔드
│  ├─ public/                    # 정적 파일 루트 (favicon, og 이미지 등)
│  └─ src/
│     ├─ app/                    # 앱 진입점, 라우터, 전역 provider, 전역 설정
│     ├─ pages/                  # 페이지 단위 화면
│     ├─ components/             # 공용 UI 컴포넌트와 화면 구성 요소
│     ├─ hooks/                  # 커스텀 React hook
│     ├─ services/               # API, WebSocket 등 외부 통신 코드
│     ├─ store/                  # 전역 상태 관리
│     ├─ types/                  # 프론트 전용 타입
│     ├─ utils/                  # 공통 유틸 함수
│     ├─ assets/                 # 프로젝트 정적 리소스
│     │  ├─ icons/               # 아이콘, 심볼, SVG
│     │  ├─ images/              # 배경, 일러스트, 썸네일
│     │  ├─ sounds/              # 효과음, bgm, 알림음
│     │  └─ fonts/               # 커스텀 폰트
│     ├─ styles/                 # 전역 스타일
│     └─ main.tsx                # 프론트엔드 엔트리 포인트
│
├─ be/                           # NestJS 백엔드
│  └─ src/
│     ├─ main.ts                 # Nest 애플리케이션 진입점
│     ├─ app.module.ts           # 루트 모듈
│     ├─ common/                 # 공통 필터, 가드, 인터셉터, 데코레이터
│     ├─ config/                 # 환경변수, DB, Redis, 보안 설정
│     ├─ modules/                # 도메인별 기능 모듈
│     │  ├─ users/               # 유저 프로필, 계정 관련 기능
│     │  ├─ sessions/            # 세션 생성, 참가, 상태 전환
│     │  ├─ characters/          # 캐릭터 시트, 능력치, 인벤토리
│     │  ├─ scenarios/           # 시나리오, 노드, 단서 데이터
│     │  ├─ rules/               # 명령어 파싱, 주사위, 룰 엔진, 상태 diff
│     │  ├─ actions/             # 플레이어 행동 큐와 처리
│     │  ├─ combat/              # 전투 시작/종료, 턴 진행, 참가자 관리
│     │  ├─ turn-logs/           # TurnLog 기록/조회
│     │  ├─ realtime/            # WebSocket 게이트웨이, 실시간 이벤트
│     │  └─ ai/                  # AI 서비스 호출용 프록시/오케스트레이션
│     ├─ database/               # ORM 스키마, 마이그레이션, 시드 데이터
│     └─ tests/                  # API 통합 테스트, e2e 테스트
│
├─ ai/                           # FastAPI 기반 AI 서비스 (Google AI Studio 게이트)
│  ├─ app/
│  │  ├─ main.py                 # FastAPI 엔트리 포인트
│  │  ├─ api/                    # HTTP 라우터
│  │  │  └─ routes/              # health, harness, session_ai 등
│  │  ├─ core/                   # 설정, 로깅, 공통 예외 처리
│  │  ├─ clients/                # Google AI Studio 등 외부 모델 클라이언트
│  │  ├─ services/               # 역할별 실행 서비스
│  │  │  ├─ interpreter/         # 행동 해석
│  │  │  ├─ narrator/            # 결과 서술 생성
│  │  │  ├─ actor/               # NPC 행동 선택
│  │  │  ├─ director/            # 힌트/전개 제안
│  │  │  ├─ npc_dialogue/        # NPC 대사 생성
│  │  │  └─ summarizer/          # 로그 요약
│  │  ├─ prompts/                # 역할별 프롬프트 버전 관리
│  │  ├─ schemas/                # AI 입력/출력 검증 스키마
│  │  ├─ validators/             # no-new-facts 등 규칙 검증
│  │  └─ tests/                  # AI 응답 검증 테스트
│  └─ models/                    # 로컬 모델 설정, 실험 메모, 운영 스크립트
│
├─ shared-types/                 # fe / be / ai가 함께 쓰는 공용 타입 집합
│  └─ src/
│     ├─ dto/api/                # REST 요청/응답 DTO
│     ├─ dto/ws/                 # WebSocket 이벤트 DTO
│     ├─ types/domain/           # User, Session, Character 등 핵심 타입
│     ├─ types/common/           # 공통 유틸 타입
│     ├─ constants/              # phase, role, action type 같은 상수
│     └─ index.ts                # 공용 export 진입점
│
├─ doc/                          # 기획/설계 문서와 문서 지도
├─ infra/                        # nginx 설정과 배포 runbook
├─ .gitignore
└─ README.md
```

## 폴더별 역할 설명

### `fe/`

플레이어가 직접 보는 화면을 담당한다.  
로그인, 로비, 세션 입장, 캐릭터 상태 확인, 행동 입력, 주사위 결과 확인, AI GM 메시지 출력 같은 사용자 경험이 여기 들어간다.

처음부터 복잡한 설계 용어를 쓰기보다, 팀원이 바로 이해할 수 있는 폴더명으로 단순하게 나눈다.

- `pages/`: 라우트와 1:1로 대응되는 화면
- `components/`: 버튼, 모달, 채팅창, 캐릭터 카드, 주사위 결과 표시 같은 UI 컴포넌트
- `hooks/`: WebSocket 연결, 세션 상태 구독, 폼 처리 같은 커스텀 hook
- `services/`: REST API 클라이언트, WebSocket 클라이언트, AI 메시지 요청 코드
- `store/`: 로그인 유저, 현재 세션, 게임 상태 같은 전역 상태
- `types/`: 프론트에서만 쓰는 화면 상태 타입
- `utils/`: 날짜 포맷, 주사위 표기 변환, 문자열 처리 같은 공통 함수
- `assets/`: `icons`, `images`, `sounds`, `fonts` 같은 정적 리소스

예시:

- `pages/PlayPage.tsx`: 실제 플레이 화면
- `pages/SessionDiscoverPage.tsx`: 공개 세션 탐색
- `pages/SessionCreatePage.tsx`: 세션 생성
- `pages/CharacterPage.tsx`: 캐릭터 생성/수정/조회
- `components/BattleMap.tsx`: 전투 맵 표시
- `components/LogPanel.tsx`: 세션 로그 표시
- `services/api.ts`: REST API 호출
- `services/realtime.ts`: 실시간 이벤트 송수신

### `be/`

게임의 실제 상태를 확정하는 서버다.  
세션 생성, 인증, 참가 처리, 캐릭터 저장, 턴 로그 저장, 판정 계산, 상태 반영, WebSocket 브로드캐스트는 모두 여기서 담당한다.

문서 기준으로 이 프로젝트의 authoritative state는 백엔드가 가져야 하므로, AI가 말한 내용도 최종 상태 확정은 `be/`에서 한다.

현재 구현 모듈은 아래와 같다.

- `sessions/`: 방 생성, 참가, 시작, 종료, pause/resume
- `characters/`: 캐릭터 생성/수정/조회
- `scenarios/`: 시나리오와 노드 관리
- `rules/`: 명령어 파싱, 주사위, 룰 엔진, 상태 diff
- `actions/`: 플레이어 행동 큐, AI Interpreter 호출, 룰 판정 연결
- `combat/`: 전투 시작/종료, 턴 진행, 참가자 조회
- `turn-logs/`: TurnLog 기록/조회
- `realtime/`: WebSocket 이벤트 송수신
- `ai/`: FastAPI AI 서비스와 통신하는 계층

### `ai/`

AI GM 관련 책임을 분리한 서비스다.  
NestJS가 게임 상태를 확정하고, `ai/`는 자연어 해석과 서술 생성에 집중한다.

현재 하네스에는 `Interpreter`, `Narrator`, `Actor`, `Director`, `NpcDialogue`, `Summarizer` 역할과 내부 smoke/harness 경로가 들어 있다. 백엔드는 게임 상태를 확정하고, AI 서비스는 해석/서술/힌트/대사/요약 후보를 제공한다.

분리 기준은 아래와 같다.

- `api/routes/`: 외부에서 호출하는 엔드포인트
- `clients/`: Google AI Studio (`google-genai`) 호출
- `services/interpreter/`: 유저 행동을 구조화 액션으로 변환
- `services/narrator/`: 확정된 결과를 GM 문장으로 생성
- `services/actor/`: 허용된 NPC 행동 후보 선택
- `services/director/`: 공개 정보 기반 힌트/전개 후보 생성
- `services/npc_dialogue/`: NPC 대사 생성
- `services/summarizer/`: 로그 요약
- `prompts/`: 프롬프트 버전 파일
- `schemas/`: 입출력 JSON 검증

### `shared-types/`

프론트, 백엔드, AI 서비스가 모두 같은 데이터 형태를 보도록 맞춰두는 공용 폴더다.  
즉, 각 서비스가 서로 주고받는 DTO와 타입, 스키마를 한곳에서 관리한다.

이 폴더를 두는 이유는 아래와 같다.

- 프론트와 백엔드의 필드 이름 불일치 방지
- WebSocket 이벤트 구조 통일
- AI 요청/응답 JSON 구조 통일
- 도메인 타입과 검증 스키마를 한 번에 관리

현재 공개 구현은 `src/` 아래에 있다.

- `src/dto/api/`: REST 요청/응답 DTO
- `src/dto/ws/`: 실시간 이벤트 DTO
- `types/domain/`: `User`, `Session`, `Character`
- `src/types/common/`: 공통 유틸 타입
- `src/constants/`: phase, condition, action type 상수

## 서버 PostgreSQL 연결 테스트

### 1. `.env.backend`에 추가할 코드 예시

```env
SERVER_DATABASE_URL=postgresql://DB_USER:URL_ENCODED_DB_PASSWORD@127.0.0.1:LOCAL_TUNNEL_PORT/DB_NAME?schema=public
```

### 2. SSH 열 때 커맨드창에 칠 예시 코드

```powershell
ssh -i "C:\path\to\key.pem" -L LOCAL_TUNNEL_PORT:SERVER_INTERNAL_DB_HOST:SERVER_INTERNAL_DB_PORT SSH_USER@SSH_HOST
```

### 3. 접속 확인 테스트 실행 코드

```powershell
npm run test:server-db -w @trpg/be
```

## 루트 폴더 운영 원칙

- `doc/`에는 기획 문서와 설계 문서를 모은다.
- `infra/`는 nginx 설정과 배포 runbook을 모은다. Docker Compose와 Jenkinsfile은 현재 루트에 둔다.

## 현재 주요 폴더

```text
fe/
be/
ai/
shared-types/
doc/
infra/
```
