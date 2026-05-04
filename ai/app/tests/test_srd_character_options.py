from app.srd.build import (
    EXPECTED_COUNTS,
    build_character_option_validation_report,
    build_equipment_items,
    parse_starting_equipment_lines,
)
from app.srd.retrieval import SrdRetriever, load_classes, load_races


def test_generated_race_options_preserve_core_fields_and_subraces():
    races = load_races()

    elf = next(race for race in races if race.id == "race.elf")

    assert len(races) == EXPECTED_COUNTS["races"]
    assert elf.nameKo == "엘프"
    assert elf.nameEn == "Elf"
    assert elf.sizeRaw == "Medium"
    assert elf.speedRaw == "30 ft."
    assert elf.abilityScoreIncreaseRaw == "Dexterity +2"
    assert any(subrace["nameKo"] == "하이 엘프" for subrace in elf.subraces)
    assert any(trait["nameKo"] == "암시야" for trait in elf.traits)
    assert elf.source.file

    dragonborn = next(race for race in races if race.id == "race.dragonborn")
    assert any(option["nameEn"] == "Black" and option["damageType"] == "Acid" for option in dragonborn.ancestryOptions)


def test_generated_class_options_preserve_core_fields_and_level_features():
    classes = load_classes()

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
    assert fighter.source.file

    wizard = next(class_option for class_option in classes if class_option.id == "class.wizard")
    assert wizard.spellcasting["ability"] == "Intelligence"
    assert "주문 내성 DC" in wizard.spellcasting["formulas"]
    assert any("준비 주문 수" in formula for formula in wizard.spellcasting["formulaList"])
    assert any(row["레벨"] == "1" and row["캔트립"] == "3" for row in wizard.levelProgression)
    assert any(
        row.classLevel == 1
        and row.cantripsKnown == 3
        and row.spellSlotsByLevel["1"] == 2
        for row in wizard.spellcastingProgression
    )

    ranger = next(class_option for class_option in classes if class_option.id == "class.ranger")
    assert ranger.spellcastingProgression[0].classLevel == 2
    assert ranger.spellcastingProgression[0].spellsKnown == 2
    assert ranger.spellcastingProgression[0].spellSlotsByLevel == {"1": 2}

    bard = next(class_option for class_option in classes if class_option.id == "class.bard")
    first_choice = bard.startingEquipmentChoices[0]
    assert [option["raw"] for option in first_choice["options"]] == ["레이피어", "롱소드", "단순 무기 하나"]

    cleric = next(class_option for class_option in classes if class_option.id == "class.cleric")
    assert any(
        option["raw"] == "라이트 크로스보우와 볼트 20개"
        and option["itemRefs"] == ["equipment.라이트_크로스보우", "equipment.볼트"]
        for choice in cleric.startingEquipmentChoices
        for option in choice["options"]
    )

    wizard = next(class_option for class_option in classes if class_option.id == "class.wizard")
    assert any(
        option["raw"] == "주문책" and option["itemRefs"] == ["equipment.spellbook"]
        for choice in wizard.startingEquipmentChoices
        for option in choice["options"]
    )


def test_starting_equipment_fallbacks_cover_classes_when_translation_section_is_missing():
    assert parse_starting_equipment_lines("", "class.cleric") == [
        "메이스 또는 워해머",
        "스케일 메일, 가죽 갑옷, 체인 메일 중 하나",
        "라이트 크로스보우와 볼트 20개 또는 단순 무기 하나",
        "사제 꾸러미 또는 탐험가 꾸러미",
        "방패와 성표",
    ]
    assert "주문책" in parse_starting_equipment_lines("", "class.wizard")


def test_starting_equipment_items_are_cataloged_from_class_choices():
    classes = load_classes()
    equipment_items = build_equipment_items(classes)

    chain_mail = next(item for item in equipment_items if item.id == "equipment.체인_메일")
    arrows = next(item for item in equipment_items if item.id == "equipment.화살")
    shield = next(item for item in equipment_items if item.id == "equipment.방패")
    longsword = next(item for item in equipment_items if item.id == "equipment.롱소드")
    plate = next(item for item in equipment_items if item.id == "equipment.플레이트_갑옷")

    assert chain_mail.nameKo == "체인 메일"
    assert chain_mail.kind == "armor"
    assert chain_mail.nameEn == "Chain Mail"
    assert chain_mail.armorClassRaw == "16"
    assert chain_mail.strengthRequirementRaw == "Str 13"
    assert chain_mail.sourceTable == "srd_armor_table"
    assert "class.fighter" in chain_mail.sourceClassIds
    assert arrows.quantityRaw == "20개"
    assert arrows.kind == "ammunition"
    assert arrows.costRaw == "1 gp / 20"
    assert shield.kind == "armor"
    assert shield.armorClassRaw == "+2"
    assert longsword.damageRaw == "1d8"
    assert longsword.propertiesRaw == "versatile (1d10)"
    assert plate.costRaw == "1500 gp"


def test_equipment_items_include_srd_armor_weapon_and_ammunition_tables():
    equipment_items = build_equipment_items(load_classes())
    item_ids = {item.id for item in equipment_items}

    assert len(equipment_items) >= 60
    assert "equipment.패딩_갑옷" in item_ids
    assert "equipment.스터디드_가죽_갑옷" in item_ids
    assert "equipment.헤비_크로스보우" in item_ids
    assert "equipment.블로우건_바늘" in item_ids
    assert all(item.sourceTable or item.sourceClassIds for item in equipment_items)


def test_character_option_validation_report_surfaces_validator_readiness_and_gaps():
    races = load_races()
    classes = load_classes()
    equipment_items = build_equipment_items(classes)

    report = build_character_option_validation_report(races, classes, equipment_items)

    assert report["readiness"]["raceValidatorInputReady"] is True
    assert report["readiness"]["classCoreValidatorInputReady"] is True
    assert report["readiness"]["startingEquipmentValidatorInputReady"] is True
    assert report["racesMissingRequiredFields"] == []
    assert report["classesMissingRequiredFields"] == []
    assert report["invalidStartingEquipmentChoices"] == []
    assert report["duplicateFeatureIds"] == []
    assert report["classesMissingStartingEquipmentChoices"] == []


def test_character_option_retrieval_matches_korean_and_english_names():
    retriever = SrdRetriever(races=load_races(), classes=load_classes(), spells=[], conditions=[], magic_items=[])

    ko_matches = retriever.related_entities_for_text("하이 엘프 파이터 캐릭터를 만들고 싶다", limit=5)
    en_matches = retriever.related_entities_for_text("I want an Elf Fighter character", limit=5)

    assert any(match.id == "race.elf" and match.kind == "race" for match in ko_matches)
    assert any(match.id == "class.fighter" and match.kind == "class" for match in ko_matches)
    assert any(match.id == "race.elf" and match.kind == "race" for match in en_matches)
    assert any(match.id == "class.fighter" and match.kind == "class" for match in en_matches)

