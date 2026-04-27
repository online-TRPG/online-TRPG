from app.schemas.interpreter import InterpreterOutput


def test_interpreter_output_accepts_backend_actionable_spell_cast():
    parsed = InterpreterOutput.model_validate(
        {
            "action": {
                "type": "cast_spell",
                "actorCharacterId": "wizard-1",
                "targetId": "goblin-1",
                "spellId": "spell.chill_touch",
                "attackKind": "ranged_spell_attack",
                "ability": None,
                "skill": None,
                "approach": "싸늘한 손길을 적 고블린에게 시전한다.",
                "confidence": 0.96,
                "requiresRoll": True,
                "suggestedDifficulty": None,
            },
            "needsClarification": False,
            "clarificationQuestion": None,
            "mentionedSpellId": "spell.chill_touch",
            "mentionedItemId": None,
            "mentionedConditionIds": [],
            "requiredRuleCheckIds": [
                "rule.spellcasting.casting_time.action",
                "rule.spellcasting.range",
                "rule.spellcasting.spell_attack",
                "rule.combat.attack_roll",
            ],
            "rulesConfidence": 0.91,
            "safetyNotes": ["명중 여부와 피해는 백엔드 엔진이 확정해야 함"],
        }
    )

    assert parsed.action.type == "cast_spell"
    assert parsed.action.spellId == "spell.chill_touch"
    assert parsed.action.attackKind == "ranged_spell_attack"
