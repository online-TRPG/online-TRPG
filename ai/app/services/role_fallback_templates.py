from app.schemas.actor import ActorOutput
from app.schemas.check_result import CheckResultOutput
from app.schemas.director import DirectorOutput
from app.schemas.harness import (
    ActorHarnessRequest,
    CheckResultHarnessRequest,
    DirectorHarnessRequest,
    NarratorHarnessRequest,
    NpcDialogueHarnessRequest,
    SummarizerHarnessRequest,
)
from app.schemas.narrator import NarratorOutput
from app.schemas.npc_dialogue import NpcDialogueOutput
from app.schemas.summarizer import SummarizerOutput


class RoleFallbackTemplates:
    def narrator(self, request: NarratorHarnessRequest) -> NarratorOutput:
        summary = (
            request.stateDiffSummary.summary
            if request.stateDiffSummary
            else request.actionSummary
            or (request.action.approach if request.action else None)
            or "결과가 확정되었습니다."
        )
        narration = (
            f"{summary} 자세한 묘사는 잠시 생략하고, 확정된 결과만 반영합니다."
        )[: request.constraints.maxLength]
        return NarratorOutput(narration=narration)

    def director(self, request: DirectorHarnessRequest) -> DirectorOutput:
        suggestion = self._director_fallback_suggestion(request)
        return DirectorOutput(
            content=self._director_fallback_content(request, suggestion),
            suggestions=[suggestion] if request.responseMode == "HUMAN_GM_ASSIST" else [],
        )

    def summarizer(self, request: SummarizerHarnessRequest) -> SummarizerOutput:
        selected_logs = request.logs[-(request.lastLogCount or min(3, len(request.logs))) :]
        content = " / ".join(selected_logs)[:1000]
        return SummarizerOutput(content=content)

    def actor(self, request: ActorHarnessRequest) -> ActorOutput:
        selected = request.allowedActions[0]
        return ActorOutput(selectedActionId=selected.id)

    def npc_dialogue(self, request: NpcDialogueHarnessRequest) -> NpcDialogueOutput:
        npc_name = request.npcName or request.npcEntityId
        dialogue = f"{npc_name}: 지금은 말보다 행동으로 답하겠다."[: request.maxLength]
        return NpcDialogueOutput(dialogue=dialogue)

    def check_result(self, request: CheckResultHarnessRequest) -> CheckResultOutput:
        target = request.targetName or "대상"
        if request.outcome == "SUCCESS":
            narration = (
                request.allowedRewardFacts[0]
                if request.allowedRewardFacts
                else f"판정에 성공했습니다. {target}은(는) 시도에 반응하지만 새로운 사실은 드러나지 않습니다."
            )
        else:
            narration = f"판정에 실패했습니다. {target}의 반응은 확실한 정보로 이어지지 않습니다."
        return CheckResultOutput(narration=narration)

    @staticmethod
    def _director_fallback_suggestion(request: DirectorHarnessRequest) -> str:
        if request.publicClues:
            return request.publicClues[0]
        if request.triedApproaches:
            return f"이미 시도한 '{request.triedApproaches[-1]}' 말고 다른 공개 단서를 확인해 보세요."
        if request.recentLogs:
            return "최근 진행에서 언급된 장소나 인물을 다시 확인해 보세요."
        return "현재 장면에 보이는 대상 중 아직 직접 확인하지 않은 것을 조사해 보세요."

    @staticmethod
    def _director_fallback_content(request: DirectorHarnessRequest, suggestion: str) -> str:
        scene_summary = request.sceneSummary
        if "우물" in scene_summary:
            return "공개된 정보만 보면, 지금은 우물 주변이나 우물 아래에서 나는 이상한 소리를 직접 확인해 볼 차례입니다."
        if "밀라" in scene_summary:
            return "공개된 정보만 보면, 밀라에게 상황을 더 묻거나 의뢰의 핵심 단서를 직접 확인해 보세요."
        return f"공개된 정보 안에서는 '{suggestion}'부터 확인해 보는 흐름이 자연스럽습니다."
