# TRPG 메인 명령 사용 예시

이 문서는 현재까지 전용 처리로 작업한 메인 명령 intent의 실제 입력 예시를 모아둔 기록이다.

앞으로 새 intent를 전용 처리로 작업할 때마다 이 문서에도 같은 형식으로 예시를 추가한다.

## 스토리 / 탐색

### `TALK_TO_NPC`

- `마을 입구에서 무슨 일이 있었는지 말해줘.`
- `우리가 여기 와도 되는지 먼저 확인하고 싶어.`

기대 결과:
- NPC 대사 `MESSAGE`

### `SOCIAL_PERSUADE`

- `우린 적이 아니야. 상황만 설명해주면 바로 물러날게.`
- `문을 열어주면 경비대에는 네 이름을 빼고 보고할게.`

기대 결과:
- 보통 `CHECK_REQUIRED`
- 상황 판단이 더 필요하면 `GM_APPROVAL_REQUIRED`
- 성립이 약하면 `IMPOSSIBLE`

### `SOCIAL_INTIMIDATE`

- `지금 바로 문을 열지 않으면 네 뒤에 있는 상자부터 전부 부수겠다.`
- `경비를 부르기 전에 우리가 원하는 걸 말해. 아니면 넌 여기서 곤란해질 거야.`

기대 결과:
- 위협이 성립하면 `CHECK_REQUIRED` 또는 `GM_APPROVAL_REQUIRED`
- 위협 근거가 약하면 `IMPOSSIBLE`

### `SOCIAL_DECEIVE`

- `우린 영주의 전갈을 받고 온 조사관이야. 문을 열어.`
- `방금 밖에서 순찰대가 널 찾고 있었어. 지금 숨겨주면 네 이름은 빼줄게.`

기대 결과:
- 거짓말이 성립 가능하면 `CHECK_REQUIRED` 또는 `GM_APPROVAL_REQUIRED`
- 거짓 근거가 너무 빈약하면 `IMPOSSIBLE`

### `READ_EMOTION`

- `저 사람이 지금 뭔가 숨기고 있는 것 같아. 반응을 살펴볼게.`
- `방금 대답할 때 거짓말하는 표정이었는지 읽어볼게.`

기대 결과:
- 보통 `CHECK_REQUIRED`
- 질문이 너무 모호하면 `MESSAGE`
- 대상이 없거나 공개되지 않았으면 `IMPOSSIBLE`

### `ASK_SCENE_INFO`

- `이 방에서 지금 공개적으로 보이는 게 뭐야?`
- `이 물건에 대해 공개된 정보만 알려줘.`

기대 결과:
- 공개 정보 정리 `MESSAGE`

### `INSPECT_STORY_OBJECT`

- `이 문서 표지와 봉인을 자세히 살펴볼게.`
- `상자 표면에 긁힌 자국이나 숨겨진 장치가 있는지 확인해볼게.`

기대 결과:
- 세부 조사면 `CHECK_REQUIRED`
- 공개 설명만 가능하면 `MESSAGE`
- 대상을 못 고르면 `IMPOSSIBLE`

### `DECLARE_RP_ACTION`

- `경계심을 풀기 위해 일부러 무기를 내려놓고 한 걸음 물러선다.`
- `상대가 안심하도록 조용히 의자에 앉아 손을 보이는 자세를 취한다.`

기대 결과:
- 저강도 서사 행동이면 `MESSAGE`
- 판정이나 상황 승인까지 얽히면 `GM_APPROVAL_REQUIRED`

### `ASK_HINT`

- `지금 공개된 단서만 기준으로 다음에 뭘 해야 할지 힌트 줘.`

기대 결과:
- 힌트 응답 `MESSAGE`

### `ASK_SUMMARY`

- `지금까지 나온 단서와 상황을 짧게 요약해줘.`

기대 결과:
- 요약 응답 `MESSAGE`

### `REQUEST_SCENE_TRANSITION`

- `북쪽 복도로 이동하고 싶어.`
- `이제 예배당 쪽으로 가자.`

기대 결과:
- 대상이 분명하면 `RESOLVED`
- 애매하면 `GM_APPROVAL_REQUIRED`
- 이동 불가면 `IMPOSSIBLE`

### `OBSERVE_AREA`

- `주변을 천천히 둘러보면서 눈에 띄는 게 있는지 본다.`
- `천장과 바닥, 벽 모서리를 차례대로 살펴볼게.`

기대 결과:
- 세밀한 관찰이면 `CHECK_REQUIRED`
- 공개 정보 정리면 `MESSAGE`

### `INVESTIGATE_OBJECT`

- `이 상자의 잠금장치와 틈새를 자세히 조사해볼게.`
- `이 제단 표면에 숨겨진 문양이나 장치가 있는지 본다.`

기대 결과:
- 세부 수색이면 `CHECK_REQUIRED`
- 좌표 기반 깊은 조사면 `GM_APPROVAL_REQUIRED`
- 공개 설명만 가능하면 `MESSAGE`
- 대상/위치가 없으면 `IMPOSSIBLE`

### `LISTEN`

- `문 너머에서 발자국 소리가 나는지 들어본다.`
- `복도 끝 방향에 귀를 기울여서 누가 움직이는지 확인해볼게.`

기대 결과:
- 미세한 소리나 숨은 기척 확인이면 `CHECK_REQUIRED`
- 공개적으로 들리는 정보가 없으면 `MESSAGE`

## 전투

### `COMBAT_MANEUVER`

- `방패로 상대 무기를 옆으로 쳐내서 틈을 만들고 싶다.`
- `상대 발을 걸어서 균형을 무너뜨리겠다.`
- `적을 난간 쪽으로 몰아붙이는 기동을 시도하겠다.`

기대 결과:
- 기동 판정이 필요하면 `CHECK_REQUIRED`
- 상황 재단이 필요하면 `GM_APPROVAL_REQUIRED`
- 설명이 모호하면 `MESSAGE`

### `ENVIRONMENT_USE`

- `옆 탁자를 발로 차서 적의 진로를 막고 싶다.`
- `기둥 뒤로 몸을 틀면서 엄폐를 만들겠다.`
- `등불을 넘어뜨려 바닥에 불길을 퍼뜨릴 수 있는지 보겠다.`

기대 결과:
- 환경 활용 판정이 필요하면 `CHECK_REQUIRED`
- 전장 상태 재단이 핵심이면 `GM_APPROVAL_REQUIRED`
- 설명이 모호하면 `MESSAGE`

### `IMPROVISED_ATTACK`

- `깨진 병을 집어 들어 적의 팔을 노려 휘두르겠다.`
- `옆 의자를 들어서 상대에게 내던지고 싶다.`
- `탁자 모서리에 적을 밀어 부딪치게 하겠다.`

기대 결과:
- 즉석 공격 판정이 필요하면 `CHECK_REQUIRED`
- 상황 재단이 더 필요하면 `GM_APPROVAL_REQUIRED`
- 설명이 모호하면 `MESSAGE`
- 대상을 못 고르면 `IMPOSSIBLE`

### `CALLED_SHOT`

- `상대의 검을 쥔 손목을 노려 정확히 베고 싶다.`
- `적의 무릎을 겨냥해서 움직임을 끊어보겠다.`
- `투구 틈을 노려 눈 쪽으로 찌르겠다.`

기대 결과:
- 정밀 사격 판정이 필요하면 `CHECK_REQUIRED`
- 상황 재단이 더 필요하면 `GM_APPROVAL_REQUIRED`
- 설명이 모호하면 `MESSAGE`
- 대상을 못 고르면 `IMPOSSIBLE`

### `READY_ACTION`

- `적이 문을 열고 들어오면 바로 화살을 쏘겠다.`
- `누가 우리 마법사에게 달려들면 그때 개입해서 막아선다.`
- `오우거가 사거리 안으로 들어오면 바로 창으로 찌르겠다.`

기대 결과:
- 발동 조건이 모호하면 `MESSAGE`
- 준비 행동 확정에는 `GM_APPROVAL_REQUIRED`

### `REACTION_REQUEST`

- `적이 내 옆을 스쳐 지나가니까 기회공격을 하고 싶다.`
- `방금 저 공격을 보고 바로 방패로 막아내는 반응을 쓰겠다.`
- `상대가 주문을 시전한 순간 바로 대응 주문을 쓰고 싶다.`

기대 결과:
- 반응 조건이 모호하면 `MESSAGE`
- 반응 행동 확정에는 `GM_APPROVAL_REQUIRED`

### `USE_ITEM_COMBAT`

- `산성 병을 적 발밑에 던져서 움직임을 묶고 싶다.`
- `연막탄을 터뜨려서 우리 쪽이 숨을 틈을 만들겠다.`
- `치유 물약을 지금 바로 앞줄 전사에게 먹이겠다.`

기대 결과:
- 전투 아이템 판정이 필요하면 `CHECK_REQUIRED`
- 전장 상태 재단이 더 필요하면 `GM_APPROVAL_REQUIRED`
- 설명이 모호하면 `MESSAGE`

### `USE_SPELL_CREATIVELY`

- `grease`를 적 발밑이 아니라 경사 계단 전체에 퍼뜨려 넘어지게 만들고 싶다.`
- `mage hand`로 횃불을 밀어 적 시야를 흔들어보겠다.`
- `fog cloud`를 우리 후퇴 경로만 가리도록 깔 수 있는지 보겠다.`

기대 결과:
- 주문의 창의적 사용 판정이 필요하면 `CHECK_REQUIRED`
- 규칙 확인과 장면 재단이 더 필요하면 `GM_APPROVAL_REQUIRED`
- 설명이 모호하면 `MESSAGE`

### `COMBAT_TALK`

- `지금 무기 내려놓으면 살려주겠다.`
- `더 싸우면 너만 손해야. 지금 항복해.`

기대 결과:
- 협상/위협 성격이면 `CHECK_REQUIRED`
- 바로 대사 가능한 상황이면 `MESSAGE`

### `TACTIC_QUERY`

- `지금 전투에서 내가 취할 만한 안전한 전술이 뭐야?`

기대 결과:
- 전술 조언 `MESSAGE`

### `ASK_RULE`

- `이 행동은 어떤 판정이 필요한지 설명해줘.`
- `지금 상황에서 이 주문을 이렇게 쓰면 어떤 규칙을 봐야 해?`

기대 결과:
- 관련 룰 조각 설명 `MESSAGE`
