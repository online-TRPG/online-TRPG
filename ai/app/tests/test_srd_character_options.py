import json
from pathlib import Path

from app.srd.build import EXPECTED_COUNTS, build, build_class_options, build_equipment_items, build_race_options
from app.srd.retrieval import SrdRetriever


def test_race_option_parser_preserves_core_fields_and_subraces():
    races = build_race_options()

    elf = next(race for race in races if race.id == "race.elf")

    assert len(races) == EXPECTED_COUNTS["races"]
    assert elf.nameKo == "엘프"
    assert elf.nameEn == "Elf"
    assert elf.sizeRaw == "Medium"
    assert elf.speedRaw == "30 ft."
    assert elf.abilityScoreIncreaseRaw == "Dexterity +2"
    assert any(subrace["nameKo"] == "하이 엘프" for subrace in elf.subraces)
    assert any(trait["nameKo"] == "암시야" for trait in elf.traits)
    assert elf.source.file == "translated/races/엘프.md"

    dragonborn = next(race for race in races if race.id == "race.dragonborn")
    assert any(option["nameEn"] == "Black" and option["damageType"] == "Acid" for option in dragonborn.ancestryOptions)


def test_class_option_parser_preserves_core_fields_and_level_features():
    classes = build_class_options()

    fighter = next(class_option for class_option in classes if class_option.id == "class.fighter")

    assert len(classes) == EXPECTED_COUNTS["classes"]
    assert fighter.nameKo == "파이터"
    assert fighter.nameEn == "Fighter"
    assert fighter.hitDieRaw == "d10"
    assert fighter.savingThrowsRaw == "Strength, Constitution"
    assert fighter.armorProficienciesRaw == "모든 방어구, 방패"
    assert fighter.weaponProficienciesRaw == "단순 무기, 군용 무기"
    assert "운동" in fighter.skillChoicesRaw
    assert any("체인 메일" in equipment for equipment in fighter.startingEquipment)
    assert any(
        choice["id"] == "class.fighter.starting_equipment.1"
        and choice["requiredSelections"] == 1
        and any(option["raw"] == "체인 메일" for option in choice["options"])
        for choice in fighter.startingEquipmentChoices
    )
    assert any(
        option["raw"] == "가죽 갑옷, 롱보우, 화살 20개"
        and option["itemRefs"] == ["equipment.가죽_갑옷", "equipment.롱보우", "equipment.화살"]
        for choice in fighter.startingEquipmentChoices
        for option in choice["options"]
    )
    assert any(
        option["raw"] == "군용 무기와 방패"
        and option["itemRefs"] == ["equipment.군용_무기", "equipment.방패"]
        for choice in fighter.startingEquipmentChoices
        for option in choice["options"]
    )
    assert any(
        option["raw"] == "라이트 크로스보우와 볼트 20개"
        and option["itemRefs"] == ["equipment.라이트_크로스보우", "equipment.볼트"]
        for choice in fighter.startingEquipmentChoices
        for option in choice["options"]
    )
    assert fighter.srdSubclassRaw == "Champion"
    assert any(feature["level"] == "5" and "추가 공격" in feature["features"] for feature in fighter.levelFeatures)
    assert any(
        feature["id"] == "class.fighter.feature.전투_방식"
        and feature["availableAtLevels"] == ["1"]
        for feature in fighter.featureReferences
    )
    assert any(
        feature["id"] == "class.fighter.subclass_feature.향상된_치명타"
        and feature["availableAtLevels"] == ["3"]
        for feature in fighter.featureReferences
    )
    assert any(row["레벨"] == "20" and "추가 공격 3회" in row["기능"] for row in fighter.levelProgression)
    assert fighter.source.file == "translated/classes/파이터.md"

    wizard = next(class_option for class_option in classes if class_option.id == "class.wizard")
    assert wizard.spellcasting["ability"] == "Intelligence"
    assert "주문 내성 DC" in wizard.spellcasting["formulas"]
    assert any("준비 주문 수" in formula for formula in wizard.spellcasting["formulaList"])
    assert any(row["레벨"] == "1" and row["캔트립"] == "3" for row in wizard.levelProgression)
    assert any(
        row["classLevel"] == "1"
        and row["cantripsKnown"] == "3"
        and row["spellSlotsByLevel"]["1"] == "2"
        for row in wizard.spellcastingProgression
    )

    bard = next(class_option for class_option in classes if class_option.id == "class.bard")
    first_choice = bard.startingEquipmentChoices[0]
    assert [option["raw"] for option in first_choice["options"]] == ["레이피어", "롱소드", "단순 무기 하나"]


def test_starting_equipment_items_are_cataloged_from_class_choices():
    classes = build_class_options()
    equipment_items = build_equipment_items(classes)

    chain_mail = next(item for item in equipment_items if item.id == "equipment.체인_메일")
    arrows = next(item for item in equipment_items if item.id == "equipment.화살")
    shield = next(item for item in equipment_items if item.id == "equipment.방패")

    assert chain_mail.nameKo == "체인 메일"
    assert chain_mail.kind == "armor"
    assert "class.fighter" in chain_mail.sourceClassIds
    assert arrows.quantityRaw == "20개"
    assert arrows.kind == "ammunition"
    assert shield.kind == "armor"


def test_character_option_retrieval_matches_korean_and_english_names():
    retriever = SrdRetriever(races=build_race_options(), classes=build_class_options(), spells=[], conditions=[], magic_items=[])

    ko_matches = retriever.related_entities_for_text("하이 엘프 파이터 캐릭터를 만들고 싶다", limit=5)
    en_matches = retriever.related_entities_for_text("I want an Elf Fighter character", limit=5)

    assert any(match.id == "race.elf" and match.kind == "race" for match in ko_matches)
    assert any(match.id == "class.fighter" and match.kind == "class" for match in ko_matches)
    assert any(match.id == "race.elf" and match.kind == "race" for match in en_matches)
    assert any(match.id == "class.fighter" and match.kind == "class" for match in en_matches)


def test_build_writes_character_option_jsonl():
    output_dir = Path("runtime_logs_test") / "srd_character_options_build"
    result = build(output_dir)

    races_path = output_dir / "races.jsonl"
    classes_path = output_dir / "classes.jsonl"
    equipment_items_path = output_dir / "equipment_items.jsonl"

    assert result["races"] == 9
    assert result["classes"] == 12
    assert result["equipment_items"] >= 20
    assert races_path.exists()
    assert classes_path.exists()
    assert equipment_items_path.exists()
    assert len([line for line in races_path.read_text(encoding="utf-8").splitlines() if line.strip()]) == 9
    assert len([line for line in classes_path.read_text(encoding="utf-8").splitlines() if line.strip()]) == 12
    assert json.loads(classes_path.read_text(encoding="utf-8").splitlines()[0])["id"].startswith("class.")
