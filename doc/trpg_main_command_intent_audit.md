# TRPG 메인 명령 intent 점검 기록

이 문서는 `doc/trpg_main_command_mvp_flow_with_categories.md`를 기준으로, 메인 채팅 intent가 실제 코드에서 어떤 경로를 타는지 빠르게 확인하기 위한 점검표다.

기준 경로는 아래와 같다.

```text
PlayPage Main 탭
-> useSession.sendMainCommand
-> POST /api/v1/sessions/{sessionId}/actions/main-command
-> MainCommandsService
-> 필요 시 AiService
-> AI 서버 /internal/ai/*
-> MainCommandResponseDto
-> TurnLog main_command
-> 프론트 Main 로그
```

## 스토리 / 탐색 공통

| intent | 프론트 추가 입력 | 백엔드 처리 | AI 역할 | 반환 형태 |
|---|---|---|---|---|
| `TALK_TO_NPC` | 공개 NPC target 선택 | `handleNpcDialogue` + NPC 가시성 검증 | `NpcDialogue` | `MESSAGE` |
| `SOCIAL_PERSUADE` | 공개 NPC target 선택 | `handleSocialPersuade` + target 검증 | `Interpreter` | `CHECK_REQUIRED` / `GM_APPROVAL_REQUIRED` / `IMPOSSIBLE` |
| `SOCIAL_INTIMIDATE` | 공개 NPC target 선택 | `handleSocialIntimidate` + target 검증 | `Interpreter` | `CHECK_REQUIRED` / `GM_APPROVAL_REQUIRED` / `IMPOSSIBLE` |
| `SOCIAL_DECEIVE` | 공개 NPC target 선택 | `handleSocialDeceive` + target 검증 | `Interpreter` | `CHECK_REQUIRED` / `GM_APPROVAL_REQUIRED` / `IMPOSSIBLE` |
| `READ_EMOTION` | 공개 NPC target 선택 | `handleReadEmotion` + target 검증 + recentLogs 전달 | `Interpreter` | `CHECK_REQUIRED` / `IMPOSSIBLE` / `MESSAGE` |
| `ASK_SCENE_INFO` | 선택 target 가능 | `handleSceneInfo` | 없음 | `MESSAGE` |
| `INSPECT_STORY_OBJECT` | 공개 OBJECT target 선택 | `handleInspectStoryObject` + target 검증 | `Interpreter` | `CHECK_REQUIRED` / `MESSAGE` / `IMPOSSIBLE` |
| `DECLARE_RP_ACTION` | 없음 | `handleDeclareRpAction` + recentLogs 전달 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `MESSAGE` |
| `ASK_HINT` | 없음 | `handleHint` | `Director` | `MESSAGE` |
| `ASK_SUMMARY` | 없음 | `handleSummary` | `Summarizer` | `MESSAGE` |
| `REQUEST_SCENE_TRANSITION` | 목적지 문장 또는 targetId | `handleSceneTransition` | 없음 | `GM_APPROVAL_REQUIRED` / `RESOLVED` / `IMPOSSIBLE` |
| `OBSERVE_AREA` | 없음 또는 mapPoint | `handleObserveArea` | `Interpreter` | `CHECK_REQUIRED` / `MESSAGE` |
| `INVESTIGATE_OBJECT` | 공개 target 또는 mapPoint | `handleInvestigateObject` + target/map 검증 | `Interpreter` | `CHECK_REQUIRED` / `GM_APPROVAL_REQUIRED` / `MESSAGE` / `IMPOSSIBLE` |
| `LISTEN` | 선택 target 또는 mapPoint | `handleListen` + recentLogs 전달 | `Interpreter` | `CHECK_REQUIRED` / `MESSAGE` |
| `DETECT_DANGER` | 공개 target 또는 mapPoint | `handleDetectDanger` + target/map 검증 + recentLogs 전달 | `Interpreter` | `CHECK_REQUIRED` / `MESSAGE` |
| `SPECIAL_MOVE` | mapPoint | `handleSpecialMove` + 좌표 검증 | `Interpreter` | `CHECK_REQUIRED` / `MESSAGE` |
| `INTERACT_OBJECT` | 공개 OBJECT target 선택 | `handleInteractObject` + OBJECT target 검증 | `Interpreter` | `ACTION_READY` / `CHECK_REQUIRED` / `GM_APPROVAL_REQUIRED` / `IMPOSSIBLE` |
| `USE_TOOL` | 아이템 선택, target/map 선택 가능 | `handleUseTool` + 아이템 보유 검증 + target/map 해석 | `Interpreter` | `ACTION_READY` / `CHECK_REQUIRED` / `GM_APPROVAL_REQUIRED` / `MESSAGE` |
| `USE_ITEM_EXPLORE` | 아이템 선택, target/map 선택 가능 | `handleUseItemExplore` + 아이템 보유 검증 + target/map 해석 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `CHECK_REQUIRED` / `MESSAGE` |
| `SPLIT_PARTY_TASK` | 없음 | `handleSplitPartyTask` + recentLogs 전달 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `MESSAGE` |

## 전투

| intent | 프론트 추가 입력 | 백엔드 처리 | AI 역할 | 반환 형태 |
|---|---|---|---|---|
| `COMBAT_MANEUVER` | 없음 | `handleCombatManeuver` + recentLogs 전달 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `CHECK_REQUIRED` / `MESSAGE` |
| `ENVIRONMENT_USE` | 공개 target 또는 mapPoint | `handleEnvironmentUse` + target/map 검증 + recentLogs 전달 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `CHECK_REQUIRED` / `MESSAGE` |
| `IMPROVISED_ATTACK` | 공개 target 선택 | `handleImprovisedAttack` + target 검증 + recentLogs 전달 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `CHECK_REQUIRED` / `MESSAGE` / `IMPOSSIBLE` |
| `CALLED_SHOT` | 공개 target 선택 | `handleCalledShot` + target 검증 + recentLogs 전달 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `CHECK_REQUIRED` / `MESSAGE` / `IMPOSSIBLE` |
| `READY_ACTION` | 없음 | `handleReadyAction` + recentLogs 전달 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `MESSAGE` |
| `REACTION_REQUEST` | 없음 | `handleReactionRequest` + recentLogs 전달 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `MESSAGE` |
| `COMBAT_TALK` | 공개 NPC target 선택 | `handleCombatTalk` 선판별 후 필요 시 `handleNpcDialogue` | `Interpreter` + `NpcDialogue` | `CHECK_REQUIRED` / `MESSAGE` |
| `USE_ITEM_COMBAT` | 아이템 선택, target/map 선택 가능 | `handleUseItemCombat` + 아이템 보유 검증 + target/map 해석 + recentLogs 전달 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `CHECK_REQUIRED` / `MESSAGE` |
| `USE_SPELL_CREATIVELY` | 주문 ID/이름, target/map 선택 가능 | `handleUseSpellCreatively` + 주문 입력 검증 + target/map 해석 + recentLogs 전달 | `Interpreter` | `GM_APPROVAL_REQUIRED` / `CHECK_REQUIRED` / `MESSAGE` |
| `TACTIC_QUERY` | 없음 | `handleTacticQuery` | `Director` | `MESSAGE` |
| `ASK_RULE` | 관련 intent 선택 가능 | `handleRuleQuery` + rule fragment 조회 | `Interpreter` | `MESSAGE` |
| `ASK_HINT` | 없음 | `handleHint` | `Director` | `MESSAGE` |
| `ASK_SUMMARY` | 없음 | `handleSummary` | `Summarizer` | `MESSAGE` |

## 이번 패스에서 메운 핵심 간극

1. `player-scenario` 응답에 `visibleTargets`를 추가해 프론트가 공개 대상 `targetId/targetType`를 실제로 보낼 수 있게 했다.
2. `PlayPage` Main 탭에 intent별 보조 입력 UI를 추가해 `targetId`, `itemId`, `spellId`, `mapPoint`, `relatedIntent`를 문서 기준으로 채울 수 있게 했다.
3. `MainCommandsService`에 intent별 최소 payload 검증을 추가했다.
4. Interpreter 요청에 `requestIntent`, `screenType`, `availableTargetDetails`, 선택된 `target/item/spell/mapPoint/relatedIntent`를 함께 보내도록 확장했다.
5. `ASK_RULE`는 정적 안내문 대신 Interpreter가 가리킨 rule fragment를 읽어 응답하도록 바꿨다.
6. `COMBAT_TALK`는 전투 중 판정 필요 여부를 먼저 Interpreter로 확인하고, 바로 대사가 가능한 경우에만 `NpcDialogue`로 내려가도록 분리했다.
