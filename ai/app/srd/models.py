from pydantic import BaseModel, Field


class SourceManifestEntry(BaseModel):
    path: str
    domain: str
    bytes: int = Field(ge=0)
    sha256: str


class SourceManifest(BaseModel):
    sourceRoot: str
    files: list[SourceManifestEntry]
    expectedCounts: dict[str, int]


class SpellSource(BaseModel):
    file: str
    page: str | None = None
    heading: str


class SpellComponents(BaseModel):
    verbal: bool = False
    somatic: bool = False
    material: str | None = None
    raw: str


class SpellCastingTime(BaseModel):
    raw: str


class SpellRange(BaseModel):
    raw: str


class SpellDuration(BaseModel):
    raw: str


class Spell(BaseModel):
    id: str
    nameEn: str
    nameKo: str
    level: int | None = Field(default=None, ge=0, le=9)
    schoolKo: str | None = None
    ritual: bool = False
    castingTime: SpellCastingTime | None = None
    range: SpellRange | None = None
    components: SpellComponents | None = None
    duration: SpellDuration | None = None
    concentration: bool = False
    playReference: str
    higherLevel: str | None = None
    scaling: str | None = None
    reviewNotes: list[str] = Field(default_factory=list)
    source: SpellSource


class SrdEntityMatch(BaseModel):
    id: str
    nameEn: str
    nameKo: str
    kind: str
    summaryKo: str
    source: SpellSource


class Condition(BaseModel):
    id: str
    nameEn: str
    nameKo: str
    effects: list[str] = Field(default_factory=list)
    summaryKo: str
    source: SpellSource


class RuleCard(BaseModel):
    id: str
    domain: str
    titleKo: str
    engineOwned: bool
    aiAssistOnly: bool = True
    gmPolicy: bool = False
    summaryKo: str
    aiAllowedUse: list[str] = Field(default_factory=list)
    aiForbiddenUse: list[str] = Field(default_factory=list)
    source: SpellSource


class RuleFragment(BaseModel):
    id: str
    domain: str
    titleKo: str
    trigger: str
    engineOwned: bool = True
    summaryKo: str
    aiForbiddenUse: list[str] = Field(default_factory=list)
    source: SpellSource


class RuleHookFixture(BaseModel):
    id: str
    domain: str
    titleKo: str
    engineFunction: str
    trigger: str
    consumes: list[str] = Field(default_factory=list)
    produces: list[str] = Field(default_factory=list)
    sourceRuleIds: list[str] = Field(default_factory=list)
    sourceEntityIds: list[str] = Field(default_factory=list)
    aiForbiddenUse: list[str] = Field(default_factory=list)
    acceptanceChecks: list[str] = Field(default_factory=list)


class BackendEngineContractCase(BaseModel):
    caseId: str
    hookId: str
    priority: str
    engineFunction: str
    request: dict[str, object]
    expectedResponse: dict[str, object]
    assertions: list[str] = Field(default_factory=list)


class InterpreterBackendHandoffCase(BaseModel):
    caseId: str
    rawText: str
    interpreterOutput: dict[str, object]
    backendState: dict[str, object]
    expectedHookIds: list[str]
    hookRequests: list[dict[str, object]]
    notes: list[str] = Field(default_factory=list)


class NarratorInputFixtureCase(BaseModel):
    caseId: str
    sourceHandoffCaseId: str
    backendHookResults: list[dict[str, object]]
    narratorRequest: dict[str, object]
    expectedVisibleSummary: str
    forbiddenNarrationFacts: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class MagicItem(BaseModel):
    id: str
    nameEn: str
    nameKo: str
    categoryRaw: str | None = None
    rarityRaw: str | None = None
    requiresAttunement: bool | None = None
    playReference: str
    reviewNotes: list[str] = Field(default_factory=list)
    source: SpellSource


class Monster(BaseModel):
    id: str
    nameEn: str
    nameKo: str
    basicRaw: str
    armorClassRaw: str | None = None
    hitPointsRaw: str | None = None
    speedRaw: str | None = None
    challengeRaw: str | None = None
    savesRaw: str | None = None
    skillsRaw: str | None = None
    damageVulnerabilitiesRaw: str | None = None
    damageResistancesRaw: str | None = None
    damageImmunitiesRaw: str | None = None
    conditionImmunitiesRaw: str | None = None
    sensesRaw: str | None = None
    languagesRaw: str | None = None
    traits: list[str] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)
    legendaryActions: list[str] = Field(default_factory=list)
    playReference: str
    reviewNotes: list[str] = Field(default_factory=list)
    source: SpellSource


class RaceOption(BaseModel):
    id: str
    nameKo: str
    nameEn: str | None = None
    sizeRaw: str | None = None
    speedRaw: str | None = None
    abilityScoreIncreaseRaw: str | None = None
    languagesRaw: str | None = None
    subraces: list[dict[str, str]] = Field(default_factory=list)
    traits: list[dict[str, str]] = Field(default_factory=list)
    ancestryOptions: list[dict[str, str]] = Field(default_factory=list)
    summaryKo: str
    source: SpellSource


class ClassSpellcastingProgression(BaseModel):
    classLevel: int
    cantripsKnown: int | None = None
    spellsKnown: int | None = None
    pactMagicSlots: int | None = None
    pactMagicSlotLevel: int | None = None
    spellSlotsByLevel: dict[str, int] = Field(default_factory=dict)


class ClassOption(BaseModel):
    id: str
    nameKo: str
    nameEn: str | None = None
    hitDieRaw: str | None = None
    primaryAbilitiesRaw: str | None = None
    savingThrowsRaw: str | None = None
    armorProficienciesRaw: str | None = None
    weaponProficienciesRaw: str | None = None
    toolProficienciesRaw: str | None = None
    skillChoicesRaw: str | None = None
    startingEquipment: list[str] = Field(default_factory=list)
    startingEquipmentChoices: list[dict[str, object]] = Field(default_factory=list)
    spellcasting: dict[str, object] = Field(default_factory=dict)
    spellcastingProgression: list[ClassSpellcastingProgression] = Field(default_factory=list)
    srdSubclassRaw: str | None = None
    levelFeatures: list[dict[str, str]] = Field(default_factory=list)
    featureReferences: list[dict[str, object]] = Field(default_factory=list)
    levelProgression: list[dict[str, str]] = Field(default_factory=list)
    summaryKo: str
    source: SpellSource


class EquipmentItem(BaseModel):
    id: str
    nameKo: str
    kind: str
    nameEn: str | None = None
    costRaw: str | None = None
    weightRaw: str | None = None
    equipmentCategory: str | None = None
    armorCategory: str | None = None
    armorClassRaw: str | None = None
    strengthRequirementRaw: str | None = None
    stealthRaw: str | None = None
    weaponCategory: str | None = None
    weaponRange: str | None = None
    damageRaw: str | None = None
    damageType: str | None = None
    rangeRaw: str | None = None
    propertiesRaw: str | None = None
    quantityRaw: str | None = None
    aliasesKo: list[str] = Field(default_factory=list)
    sourceClassIds: list[str] = Field(default_factory=list)
    sourceTable: str | None = None


class EquipmentReference(BaseModel):
    id: str
    titleKo: str
    summaryKo: str
    source: SpellSource
