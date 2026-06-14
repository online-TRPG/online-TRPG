from app.srd.retrieval import SrdRetriever, load_spells


def test_spell_retrieval_matches_korean_spell_name():
    retriever = SrdRetriever(load_spells())

    matches = retriever.related_entities_for_text("산성 화살을 고블린에게 쏜다")

    assert matches
    assert matches[0].id == "spell.acid_arrow"
    assert matches[0].kind == "spell"
    assert "원거리 주문 공격" in matches[0].summaryKo


def test_spell_retrieval_matches_english_spell_name():
    retriever = SrdRetriever(load_spells())

    matches = retriever.related_entities_for_text("I cast Acid Arrow")

    assert matches
    assert matches[0].id == "spell.acid_arrow"
