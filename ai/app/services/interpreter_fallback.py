import re

from app.schemas.harness import InterpreterHarnessRequest
from app.schemas.interpreter import InterpreterOutput, StructuredAction


class InterpreterFallbackService:
    FALLBACK_DIRECT_REQUEST_INTENTS = {
        "TALK_TO_NPC",
        "SOCIAL_PERSUADE",
        "SOCIAL_INTIMIDATE",
        "SOCIAL_DECEIVE",
        "READ_EMOTION",
        "ASK_SCENE_INFO",
        "ASK_HINT",
        "ASK_SUMMARY",
        "REQUEST_SCENE_TRANSITION",
        "OBSERVE_AREA",
        "INSPECT_STORY_OBJECT",
        "INVESTIGATE_OBJECT",
        "LISTEN",
        "DETECT_DANGER",
        "SPECIAL_MOVE",
        "INTERACT_OBJECT",
        "USE_TOOL",
        "USE_ITEM_EXPLORE",
        "SPLIT_PARTY_TASK",
        "COMBAT_MANEUVER",
        "ENVIRONMENT_USE",
        "IMPROVISED_ATTACK",
        "CALLED_SHOT",
        "READY_ACTION",
        "REACTION_REQUEST",
        "COMBAT_TALK",
        "USE_ITEM_COMBAT",
        "USE_SPELL_CREATIVELY",
        "TACTIC_QUERY",
        "ASK_RULE",
        "MAP_MOVE",
        "MAP_ATTACK",
        "MAP_CAST_SPELL",
        "MAP_USE_CLASS_FEATURE",
        "MAP_END_TURN",
        "GM_ONLY_DAMAGE",
        "GM_ONLY_HEAL",
        "GM_ONLY_CONDITION",
        "GM_ONLY_INVENTORY_MUTATION",
        "GAME_META_QUESTION",
    }

    def build_output(self, request: InterpreterHarnessRequest) -> InterpreterOutput:
        fallback_action = self._infer_request_intent_fallback_action(request)
        if fallback_action is None:
            fallback_action = self._infer_general_gm_fallback_action(request)
        if fallback_action is not None:
            action_type, target_id = fallback_action
            return InterpreterOutput(
                action=StructuredAction(
                    type=action_type,
                    actorCharacterId=request.actorCharacterId,
                    targetId=target_id,
                    approach=self._fallback_approach(request.rawText),
                    confidence=0.62,
                    requiresRoll=False,
                ),
                needsClarification=False,
                clarificationQuestion=None,
                safetyNotes=["AI 해석 실패로 로컬 fallback 분류를 사용함", "게임 상태는 변경하지 않음"],
            )

        return InterpreterOutput(
            action=StructuredAction(
                type="OUT_OF_SCOPE",
                actorCharacterId=request.actorCharacterId,
                approach=self._fallback_approach(request.rawText),
                confidence=0.0,
                requiresRoll=False,
            ),
            needsClarification=True,
            clarificationQuestion="행동을 조금 더 구체적으로 선택해 주세요.",
            safetyNotes=["AI 해석 실패로 템플릿 fallback을 사용함", "게임 상태는 변경하지 않음"],
        )

    def _infer_request_intent_fallback_action(
        self, request: InterpreterHarnessRequest
    ) -> tuple[str, str | None] | None:
        request_intent = (request.requestIntent or "").strip().upper()
        if request_intent not in self.FALLBACK_DIRECT_REQUEST_INTENTS:
            return None

        return (request_intent, self._resolve_fallback_target_id(request))

    def _infer_general_gm_fallback_action(
        self, request: InterpreterHarnessRequest
    ) -> tuple[str, str | None] | None:
        if (request.requestIntent or "").strip().upper() != "GENERAL_GM_REQUEST":
            return None

        text = request.rawText.strip()
        normalized_text = self._normalize_fallback_text(text)
        if not normalized_text:
            return None

        npc_target_id = self._resolve_fallback_target_id(request, required_kind="NPC")
        if (
            npc_target_id
            and self._looks_like_npc_dialogue(normalized_text)
        ) or self._looks_like_clear_dialogue_action(normalized_text):
            return ("TALK_TO_NPC", npc_target_id)

        if self._contains_any(
            normalized_text,
            [
                "힌트",
                "도움",
                "도와",
                "막혔",
                "뭐하면",
                "뭐해야",
                "뭐하지",
                "뭐할",
                "무엇을하면",
                "무엇을해야",
                "뭘해야",
                "뭘하면",
                "뭘하지",
                "어떻게해야",
                "어떡해야",
                "다음에뭘",
                "다음뭐",
                "다음행동",
            ],
        ):
            return ("ASK_HINT", None)

        if self._contains_any(
            normalized_text,
            [
                "요약",
                "정리",
                "지금까지",
                "이전내용",
                "지난내용",
                "로그",
            ],
        ):
            return ("ASK_SUMMARY", None)

        if self._looks_like_scene_info_question(normalized_text):
            return ("ASK_SCENE_INFO", None)

        return None

    def _resolve_fallback_target_id(
        self, request: InterpreterHarnessRequest, *, required_kind: str | None = None
    ) -> str | None:
        available_target_ids = set(request.availableTargets)
        if request.targetId and request.targetId in available_target_ids:
            return request.targetId

        normalized_text = self._normalize_fallback_text(request.rawText)
        for detail in request.availableTargetDetails:
            if detail.id not in available_target_ids:
                continue
            if required_kind and (detail.kind or "").strip().upper() != required_kind:
                continue
            if any(
                name and name in normalized_text
                for name in self._fallback_target_name_candidates(detail.name)
            ):
                return detail.id
        return None

    @staticmethod
    def _fallback_approach(raw_text: str) -> str:
        approach = raw_text.strip()
        return approach[:300] if approach else "자유 입력 요청"

    @staticmethod
    def _normalize_fallback_text(value: str) -> str:
        return re.sub(r"[^0-9a-zA-Z가-힣]+", "", value.casefold())

    @classmethod
    def _fallback_target_name_candidates(cls, name: str) -> list[str]:
        normalized_name = cls._normalize_fallback_text(name)
        parts = [
            cls._normalize_fallback_text(part)
            for part in re.split(r"[\s()/,]+", name)
            if part.strip()
        ]
        return [candidate for candidate in [normalized_name, *parts] if len(candidate) >= 2]

    @staticmethod
    def _contains_any(text: str, needles: list[str]) -> bool:
        return any(needle in text for needle in needles)

    def _looks_like_npc_dialogue(self, text: str) -> bool:
        return self._contains_any(
            text,
            [
                "말을건",
                "말을겁",
                "말건",
                "말을걸",
                "말걸",
                "대화",
                "인사",
                "안녕",
                "묻",
                "물어",
                "질문",
                "얘기",
                "이야기",
            ],
        )

    def _looks_like_clear_dialogue_action(self, text: str) -> bool:
        return self._looks_like_npc_dialogue(text) and self._contains_any(
            text,
            [
                "에게",
                "한테",
                "에게서",
                "한테서",
                "와대화",
                "과대화",
                "와말",
                "과말",
                "와얘기",
                "과얘기",
                "와이야기",
                "과이야기",
                "에게말",
                "한테말",
            ],
        )

    def _looks_like_scene_info_question(self, text: str) -> bool:
        return self._contains_any(
            text,
            [
                "뭐가보",
                "무엇이보",
                "장면정보",
                "현재장면",
                "상황알려",
                "상황이뭐",
                "여기어디",
                "어디야",
                "주변에뭐",
                "보이는것",
            ],
        )
