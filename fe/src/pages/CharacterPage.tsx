import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import defaultArcherImage from "../assets/images/Profile_Default_Archer.png";
import defaultRogueImage from "../assets/images/Profile_Default_Rouge.png";
import defaultWarriorImage from "../assets/images/Profile_Default_Warrior.png";
import defaultWizardImage from "../assets/images/Profile_Default_Wizard.png";
import parchmentScrollImage from "../assets/images/parchment_scroll.webp";
import boxBulletinNarrowFrame from "../components/Box_Bulletin_Narrow_Frame.webp";
import boxBulletinNarrowPlanks from "../components/Box_Bulletin_Narrow_Planks.webp";
import profileBorderCharacter from "../components/Profile_Border_Character.webp";
import profileBorderStats from "../components/Profile_Border_Stats.webp";
import sidePanelImage from "../components/Side_Panel.webp";
import {
  classOptions,
  getClassLabel,
  normalizeClassValue,
  type ClassOption,
  type ClassOptionValue,
} from "../data/class-options";
import { raceData, raceOptions, type RaceAbilityBonus, type RaceData } from "../data/race-options";
import type { CharacterPayload } from "../hooks/useSession";
import type { PersistentCharacter, SessionSnapshot, StoredUser } from "../types/session";

interface CharacterPageProps {
  user: StoredUser;
  characters: PersistentCharacter[];
  snapshot: SessionSnapshot | null;
  busy: boolean;
  error: string | null;
  onCreateCharacter: (payload: CharacterPayload) => void | Promise<void>;
  onCloneCharacter: (characterId: string) => void | Promise<void>;
  onUpdateCharacter: (characterId: string, payload: CharacterPayload) => void | Promise<void>;
  onDeleteCharacter: (characterId: string) => void | Promise<void>;
}

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
type ScalingAbilityKey = "str" | "dex" | "int";

interface InventoryDraftItem {
  id: string;
  name: string;
  quantity: number;
}

interface ClassStatProfile {
  base: {
    maxHp: number;
    armorClass: number;
    speed: number;
    proficiencyBonus: number;
    abilities: Record<ScalingAbilityKey, number>;
  };
  growth: {
    maxHp: number;
    armorClass: number;
    proficiencyBonus: number;
    abilities: Record<ScalingAbilityKey, number>;
  };
}

type ClassName = ClassOptionValue;

const ancestryOptions = raceOptions;

const defaultAncestry = ancestryOptions.find((option) => option.value === "Human")?.value ?? ancestryOptions[0]?.value ?? "Human";

const avatarPresets = [
  { id: "preset_wizard", label: "위자드", image: defaultWizardImage },
  { id: "preset_archer", label: "레인저", image: defaultArcherImage },
  { id: "preset_rogue", label: "로그", image: defaultRogueImage },
  { id: "preset_warrior", label: "파이터", image: defaultWarriorImage },
] as const;

const classStatProfiles: Record<ClassName, ClassStatProfile> = {
  Fighter: {
    base: {
      maxHp: 20,
      armorClass: 20,
      speed: 28,
      proficiencyBonus: 2,
      abilities: {
        str: 14,
        dex: 10,
        int: 8,
      },
    },
    growth: {
      maxHp: 2,
      armorClass: 0.5,
      proficiencyBonus: 0.05,
      abilities: {
        str: 0.5,
        dex: 0,
        int: 0,
      },
    },
  },
  Ranger: {
    base: {
      maxHp: 16,
      armorClass: 16,
      speed: 32,
      proficiencyBonus: 2.4,
      abilities: {
        str: 10,
        dex: 14,
        int: 10,
      },
    },
    growth: {
      maxHp: 1.5,
      armorClass: 0.35,
      proficiencyBonus: 0.08,
      abilities: {
        str: 0,
        dex: 0.5,
        int: 0,
      },
    },
  },
  Rogue: {
    base: {
      maxHp: 14,
      armorClass: 14,
      speed: 36,
      proficiencyBonus: 3,
      abilities: {
        str: 9,
        dex: 15,
        int: 11,
      },
    },
    growth: {
      maxHp: 1.2,
      armorClass: 0.25,
      proficiencyBonus: 0.12,
      abilities: {
        str: 0,
        dex: 0.4,
        int: 0.2,
      },
    },
  },
  Wizard: {
    base: {
      maxHp: 12,
      armorClass: 10,
      speed: 30,
      proficiencyBonus: 2.8,
      abilities: {
        str: 8,
        dex: 10,
        int: 15,
      },
    },
    growth: {
      maxHp: 1,
      armorClass: 0.1,
      proficiencyBonus: 0.15,
      abilities: {
        str: 0,
        dex: 0,
        int: 0.5,
      },
    },
  },
};

const abilityDisplayLabels: Record<AbilityKey, string> = {
  str: "근력",
  dex: "민첩",
  con: "건강",
  int: "지능",
  wis: "지혜",
  cha: "매력",
};

const suggestedSkillOptions = [
  { value: "Acrobatics", label: "곡예" },
  { value: "Arcana", label: "비전학" },
  { value: "Athletics", label: "운동" },
  { value: "History", label: "역사" },
  { value: "Insight", label: "통찰" },
  { value: "Investigation", label: "조사" },
  { value: "Perception", label: "인지능력" },
  { value: "Persuasion", label: "설득" },
  { value: "Stealth", label: "은신" },
  { value: "Survival", label: "생존" },
] as const;

const ancestryLabelMap: Map<string, string> = new Map(ancestryOptions.map((option) => [option.value, option.label]));
const skillLabelMap: Map<string, string> = new Map(suggestedSkillOptions.map((option) => [option.value, option.label]));
const presetIdByClassName: Map<string, string> = new Map([
  ["Wizard", "preset_wizard"],
  ["Ranger", "preset_archer"],
  ["Rogue", "preset_rogue"],
  ["Fighter", "preset_warrior"],
  ["Archer", "preset_archer"],
  ["Warrior", "preset_warrior"],
]);
const classNameByPresetId: Map<string, string> = new Map([
  ["preset_wizard", "Wizard"],
  ["preset_archer", "Ranger"],
  ["preset_rogue", "Rogue"],
  ["preset_warrior", "Fighter"],
]);

function calcModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function formatModifier(score: number) {
  const modifier = calcModifier(score);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

function getAbilityModifierTooltip(ability: AbilityKey, score: number) {
  const label = abilityDisplayLabels[ability];
  const modifier = formatModifier(score);
  return `실제 ${label} 관련 액션을 할 때 ${modifier} 값만큼 보정됩니다.`;
}

function roundStat(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeComputedStat(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatStat(value: number) {
  return Number.isInteger(value) ? `${value}` : `${roundStat(value).toFixed(1)}`;
}

function normalizeLevel(value: number) {
  return Math.max(1, Number(value) || 1);
}

function getClassStatProfile(className: string): ClassStatProfile {
  return classStatProfiles[normalizeClassValue(className)];
}

function getRecommendedStats(className: string, level: number) {
  const normalizedLevel = normalizeLevel(level);
  const profile = getClassStatProfile(className);
  const growthSteps = normalizedLevel - 1;

  return {
    maxHp: normalizeComputedStat(profile.base.maxHp + profile.growth.maxHp * growthSteps),
    armorClass: normalizeComputedStat(profile.base.armorClass + profile.growth.armorClass * growthSteps),
    speed: profile.base.speed,
    proficiencyBonus: normalizeComputedStat(
      profile.base.proficiencyBonus + profile.growth.proficiencyBonus * growthSteps,
    ),
  };
}

function getRecommendedAbilities(className: string, level: number, currentAbilities?: CharacterPayload["abilities"]) {
  const normalizedLevel = normalizeLevel(level);
  const profile = getClassStatProfile(className);
  const growthSteps = normalizedLevel - 1;

  return {
    str: normalizeComputedStat(profile.base.abilities.str + profile.growth.abilities.str * growthSteps),
    dex: normalizeComputedStat(profile.base.abilities.dex + profile.growth.abilities.dex * growthSteps),
    con: currentAbilities?.con ?? 10,
    int: normalizeComputedStat(profile.base.abilities.int + profile.growth.abilities.int * growthSteps),
    wis: currentAbilities?.wis ?? 10,
    cha: currentAbilities?.cha ?? 10,
  };
}

function applyLevelDeltaStats(
  current: Pick<CharacterPayload, "className" | "maxHp" | "armorClass" | "proficiencyBonus">,
  levelDelta: number,
) {
  const profile = getClassStatProfile(current.className);

  return {
    maxHp: normalizeComputedStat((current.maxHp ?? profile.base.maxHp) + profile.growth.maxHp * levelDelta),
    armorClass: normalizeComputedStat(
      (current.armorClass ?? profile.base.armorClass) + profile.growth.armorClass * levelDelta,
    ),
    proficiencyBonus: normalizeComputedStat(
      (current.proficiencyBonus ?? profile.base.proficiencyBonus) + profile.growth.proficiencyBonus * levelDelta,
    ),
  };
}

function applyLevelDeltaAbilities(
  current: Pick<CharacterPayload, "className" | "abilities">,
  levelDelta: number,
) {
  const profile = getClassStatProfile(current.className);
  const abilities = current.abilities ?? {
    str: profile.base.abilities.str,
    dex: profile.base.abilities.dex,
    con: 10,
    int: profile.base.abilities.int,
    wis: 10,
    cha: 10,
  };

  return {
    ...abilities,
    str: normalizeComputedStat(abilities.str + profile.growth.abilities.str * levelDelta),
    dex: normalizeComputedStat(abilities.dex + profile.growth.abilities.dex * levelDelta),
    int: normalizeComputedStat(abilities.int + profile.growth.abilities.int * levelDelta),
  };
}

function createDefaultCharacter(): CharacterPayload {
  const defaultClassName: ClassName = "Wizard";
  const recommendedStats = getRecommendedStats(defaultClassName, 1);
  const recommendedAbilities = getRecommendedAbilities(defaultClassName, 1);

  return {
    name: "",
    ancestry: defaultAncestry,
    className: defaultClassName,
    avatarType: "PRESET",
    avatarPresetId: "preset_wizard",
    avatarUrl: null,
    level: 1,
    abilities: recommendedAbilities,
    proficiencyBonus: recommendedStats.proficiencyBonus,
    proficientSkills: [],
    maxHp: recommendedStats.maxHp,
    armorClass: recommendedStats.armorClass,
    speed: recommendedStats.speed,
    inventory: [],
  };
}

function getCharacterArt(className: string) {
  const normalized = className.toLowerCase();
  if (normalized.includes("wizard") || normalized.includes("mage") || normalized.includes("sorcer")) {
    return defaultWizardImage;
  }
  if (normalized.includes("archer") || normalized.includes("ranger") || normalized.includes("bow")) {
    return defaultArcherImage;
  }
  if (normalized.includes("rogue") || normalized.includes("rouge") || normalized.includes("thief")) {
    return defaultRogueImage;
  }
  if (normalized.includes("fighter") || normalized.includes("warrior") || normalized.includes("knight")) {
    return defaultWarriorImage;
  }
  return defaultWizardImage;
}

function getAvatarPresetImage(avatarPresetId?: string | null) {
  return avatarPresets.find((preset) => preset.id === avatarPresetId)?.image ?? null;
}

function getCharacterImage(character: Pick<PersistentCharacter, "avatarPresetId" | "className">) {
  return getAvatarPresetImage(character.avatarPresetId) ?? getCharacterArt(character.className);
}

function getCharacterClassLabel(className: string) {
  const normalized = className.trim();
  return getClassLabel(normalized || "모험가");
}

function getCharacterAncestryLabel(ancestry: string) {
  const normalized = ancestry.trim();
  return ancestryLabelMap.get(normalized) ?? (normalized || "미정");
}

function getSkillLabel(skill: string) {
  const normalized = skill.trim();
  return skillLabelMap.get(normalized) ?? normalized;
}

function getPresetIdForClassName(className: string) {
  return presetIdByClassName.get(className) ?? "preset_wizard";
}

function getClassNameForPresetId(presetId: string) {
  return classNameByPresetId.get(presetId) ?? "Wizard";
}

function getRaceByValue(value: string): RaceData | null {
  return raceData.find((option) => option.value === value) ?? null;
}

function getClassOptionByValue(value: string): ClassOption | null {
  const normalized = normalizeClassValue(value);
  return classOptions.find((option) => option.value === normalized) ?? null;
}

function formatAbilityBonus(abilityBonus: RaceAbilityBonus) {
  if (abilityBonus.ability === "any") {
    return `자유 능력치 +${abilityBonus.amount}${abilityBonus.note ? ` (${abilityBonus.note})` : ""}`;
  }

  const abilityLabel = abilityDisplayLabels[abilityBonus.ability];
  return `${abilityLabel} +${abilityBonus.amount}${abilityBonus.note ? ` (${abilityBonus.note})` : ""}`;
}

function localizeAbilityText(value: string) {
  return value
    .replace(/Strength/g, "근력")
    .replace(/Dexterity/g, "민첩")
    .replace(/Constitution/g, "건강")
    .replace(/Intelligence/g, "지능")
    .replace(/Wisdom/g, "지혜")
    .replace(/Charisma/g, "매력");
}

export function CharacterPage({
  characters,
  snapshot,
  busy,
  error,
  onCreateCharacter,
  onCloneCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
}: CharacterPageProps) {
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [inventoryDraft, setInventoryDraft] = useState<InventoryDraftItem[]>([]);
  const [formState, setFormState] = useState<CharacterPayload>(() => createDefaultCharacter());
  const inventoryEditorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isCreateModalOpen) return undefined;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isCreateModalOpen]);

  useEffect(() => {
    if (!characters.length) {
      setSelectedCharacterId(null);
      return;
    }

    setSelectedCharacterId((current) =>
      current && characters.some((character) => character.id === current) ? current : characters[0].id,
    );
  }, [characters]);

  useEffect(() => {
    const node = inventoryEditorRef.current;
    if (!node || !inventoryDraft.length) return;
    node.scrollTop = node.scrollHeight;
  }, [inventoryDraft.length]);

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  );
  const selectedRaceInfo = useMemo(() => getRaceByValue(formState.ancestry), [formState.ancestry]);
  const selectedClassInfo = useMemo(() => getClassOptionByValue(formState.className), [formState.className]);

  const usedCharacterIds = useMemo(() => {
    const ids = new Set<string>();

    snapshot?.participants.forEach((participant) => {
      if (participant.characterId) ids.add(participant.characterId);
    });

    characters.forEach((character) => {
      if (character.activeSessionId) ids.add(character.id);
    });

    return ids;
  }, [characters, snapshot]);

  function resetCreateForm() {
    setEditingCharacterId(null);
    setFormState(createDefaultCharacter());
    setInventoryDraft([]);
    setSkillInput("");
  }

  function openCreateModal() {
    resetCreateForm();
    setCreateModalOpen(true);
  }

  function openEditModal() {
    if (!selectedCharacter) return;

    setEditingCharacterId(selectedCharacter.id);
    setFormState({
      name: selectedCharacter.name,
      ancestry: selectedCharacter.ancestry,
      className: selectedCharacter.className,
      avatarType: selectedCharacter.avatarType,
      avatarPresetId:
        selectedCharacter.avatarPresetId ?? getPresetIdForClassName(selectedCharacter.className),
      avatarUrl: selectedCharacter.avatarUrl ?? null,
      level: selectedCharacter.level,
      abilities: { ...selectedCharacter.abilities },
      proficiencyBonus: selectedCharacter.proficiencyBonus,
      proficientSkills: [...selectedCharacter.proficientSkills],
      maxHp: selectedCharacter.maxHp,
      armorClass: selectedCharacter.armorClass,
      speed: selectedCharacter.speed,
      inventory: selectedCharacter.inventory.map((item) => ({ ...item })),
    });
    setInventoryDraft(selectedCharacter.inventory.map((item) => ({ ...item })));
    setSkillInput("");
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    resetCreateForm();
  }

  async function submitCreateCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      ...formState,
      proficientSkills: formState.proficientSkills?.filter(Boolean) ?? [],
      inventory: inventoryDraft.filter((item) => item.name.trim()),
      assignToSession: false,
    };

    if (editingCharacterId) {
      await onUpdateCharacter(editingCharacterId, payload);
    } else {
      await onCreateCharacter(payload);
    }
    closeCreateModal();
  }

  async function handleCloneSelectedCharacter() {
    if (!selectedCharacter) return;
    await onCloneCharacter(selectedCharacter.id);
  }

  async function handleDeleteSelectedCharacter() {
    if (!selectedCharacter) return;
    if (!window.confirm(`'${selectedCharacter.name}' 캐릭터를 삭제할까요?`)) return;
    await onDeleteCharacter(selectedCharacter.id);
  }

  function updateAbility(ability: AbilityKey, value: number) {
    setFormState((current) => ({
      ...current,
      abilities: {
        ...current.abilities!,
        [ability]: value,
      },
    }));
  }

  function addSkill(skill: string) {
    const normalized = skill.trim();
    if (!normalized) return;

    setFormState((current) => ({
      ...current,
      proficientSkills: Array.from(new Set([...(current.proficientSkills ?? []), normalized])),
    }));
    setSkillInput("");
  }

  function removeSkill(skill: string) {
    setFormState((current) => ({
      ...current,
      proficientSkills: (current.proficientSkills ?? []).filter((entry) => entry !== skill),
    }));
  }

  function addInventoryRow() {
    setInventoryDraft((current) => [
      ...current,
      {
        id: `item-${crypto.randomUUID()}`,
        name: "",
        quantity: 1,
      },
    ]);
  }

  function updateInventoryRow(id: string, field: "name" | "quantity", value: string | number) {
    setInventoryDraft((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === "quantity" ? Math.max(1, Number(value) || 1) : value,
            }
          : item,
      ),
    );
  }

  function removeInventoryRow(id: string) {
    setInventoryDraft((current) => current.filter((item) => item.id !== id));
  }

  return (
    <main className="character-page fantasy-character-page">
      <section className="fantasy-character-layout">
        <aside className="fantasy-character-sidebar">
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={openCreateModal}
          >
            새 캐릭터 생성
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={() => void handleCloneSelectedCharacter()}
            disabled={!selectedCharacter || busy}
          >
            캐릭터 복제
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={openEditModal}
            disabled={!selectedCharacter || busy}
          >
            캐릭터 수정
          </button>
          <button
            type="button"
            className="fantasy-character-sidebutton"
            style={{ backgroundImage: `url(${sidePanelImage})` }}
            onClick={() => void handleDeleteSelectedCharacter()}
            disabled={!selectedCharacter || busy}
          >
            캐릭터 삭제
          </button>
        </aside>

        <section className="fantasy-character-board">
          <div
            className="fantasy-character-board-planks"
            style={{ backgroundImage: `url(${boxBulletinNarrowPlanks})` }}
            aria-hidden="true"
          />
          <div className="fantasy-character-board-scroll fantasy-scroll-hidden">
            <div className="fantasy-character-grid">
              {characters.map((character) => {
                const isSelected = character.id === selectedCharacterId;
                const isInUse = usedCharacterIds.has(character.id);
                const art = getCharacterImage(character);

                return (
                  <button
                    type="button"
                    key={character.id}
                    className={`fantasy-character-card${isSelected ? " selected" : ""}`}
                    onClick={() => setSelectedCharacterId(character.id)}
                  >
                    <div
                      className="fantasy-character-card-frame"
                      style={{ ["--frame-image" as string]: `url(${profileBorderCharacter})` }}
                    >
                      <img src={art} alt={character.name} className="fantasy-character-card-art" />
                      {isInUse ? <div className="fantasy-character-card-overlay">사용 중...</div> : null}
                      <div className="fantasy-character-card-nameplate">{character.name}</div>
                      <div className="fantasy-character-card-class">{getCharacterClassLabel(character.className)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div
            className="fantasy-character-board-frame"
            style={{ backgroundImage: `url(${boxBulletinNarrowFrame})` }}
            aria-hidden="true"
          />
        </section>

        <section className="fantasy-character-detail">
          {selectedCharacter ? (
            <>
              <article
                className="fantasy-character-profile-frame"
                style={{ ["--frame-image" as string]: `url(${profileBorderCharacter})` }}
              >
                <img
                  src={getCharacterImage(selectedCharacter)}
                  alt={selectedCharacter.name}
                  className="fantasy-character-profile-art"
                />
                <div className="fantasy-character-profile-name">{selectedCharacter.name}</div>
                <div className="fantasy-character-profile-class">{getCharacterClassLabel(selectedCharacter.className)}</div>
              </article>

              <article
                className="fantasy-character-stats-frame"
                style={{ ["--frame-image" as string]: `url(${profileBorderStats})` }}
              >
                <div className="fantasy-character-stats-scroll fantasy-scroll-hidden">
                  <div className="fantasy-character-stats-content">
                    <h2>{selectedCharacter.name}</h2>

                    <dl className="fantasy-character-summary-list">
                      <div>
                        <dt>종족</dt>
                        <dd>{getCharacterAncestryLabel(selectedCharacter.ancestry)}</dd>
                      </div>
                      <div>
                        <dt>직업</dt>
                        <dd>{getCharacterClassLabel(selectedCharacter.className)}</dd>
                      </div>
                      <div>
                        <dt>레벨</dt>
                        <dd>{selectedCharacter.level}</dd>
                      </div>
                      <div>
                        <dt>HP</dt>
                        <dd>
                          {formatStat(selectedCharacter.maxHp)}/{formatStat(selectedCharacter.maxHp)}
                        </dd>
                      </div>
                      <div>
                        <dt>방어도</dt>
                        <dd>{formatStat(selectedCharacter.armorClass)}</dd>
                      </div>
                      <div>
                        <dt>속도</dt>
                        <dd>{formatStat(selectedCharacter.speed)}</dd>
                      </div>
                      <div>
                        <dt>숙련도</dt>
                        <dd>{formatStat(selectedCharacter.proficiencyBonus)}</dd>
                      </div>
                    </dl>

                    <section className="fantasy-character-stats-section">
                      <h3>능력치</h3>
                      <div className="fantasy-character-abilities-grid">
                        {(Object.keys(abilityDisplayLabels) as AbilityKey[]).map((ability) => (
                          <div key={ability}>
                            <strong>{abilityDisplayLabels[ability]}</strong>
                            <span className="fantasy-character-ability-value">
                              {formatStat(selectedCharacter.abilities[ability])} (
                              {formatModifier(selectedCharacter.abilities[ability])})
                            </span>
                            <span
                              className="fantasy-character-ability-help"
                              tabIndex={0}
                              role="note"
                              aria-label={getAbilityModifierTooltip(ability, selectedCharacter.abilities[ability])}
                            >
                              ?
                              <span className="fantasy-character-ability-tooltip" role="tooltip">
                                {getAbilityModifierTooltip(ability, selectedCharacter.abilities[ability])}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="fantasy-character-stats-section">
                      <h3>기술 숙련</h3>
                      {selectedCharacter.proficientSkills.length ? (
                        <ul className="fantasy-character-text-list">
                          {selectedCharacter.proficientSkills.map((skill) => (
                            <li key={skill}>{getSkillLabel(skill)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>선택된 기술이 없습니다.</p>
                      )}
                    </section>

                    <section className="fantasy-character-stats-section">
                      <h3>인벤토리</h3>
                      {selectedCharacter.inventory.length ? (
                        <ul className="fantasy-character-text-list">
                          {selectedCharacter.inventory.map((item) => (
                            <li key={item.id}>
                              {item.name} x{item.quantity}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>비어 있음</p>
                      )}
                    </section>
                  </div>
                </div>
              </article>
            </>
          ) : (
            <article className="character-focus-card">
              <h2>캐릭터를 생성해 보세요</h2>
            </article>
          )}
        </section>
      </section>

      {error ? <p className="panel-error">{error}</p> : null}

      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCreateModal}>
          <div
            className="modal-card modal-card-wide character-create-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">{editingCharacterId ? "캐릭터 수정" : "캐릭터 생성"}</span>
                <h2>{editingCharacterId ? "캐릭터 수정" : "새 캐릭터"}</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeCreateModal}>
                닫기
              </button>
            </div>

            <form className="modal-form character-create-form" onSubmit={submitCreateCharacter}>
              <div className="character-create-form-left">
              <section className="character-form-section">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">기본 정보</span>
                    <h2>프로필</h2>
                  </div>
                </div>

                <div className="field-row">
                  <div>
                    <label htmlFor="character-name-create">이름</label>
                    <input
                      id="character-name-create"
                      value={formState.name}
                      onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                      maxLength={50}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="character-level-create">레벨</label>
                    <input
                      id="character-level-create"
                      type="number"
                      min={1}
                      value={formState.level ?? 1}
                      onChange={(event) =>
                        setFormState((current) => {
                          const nextLevel = normalizeLevel(Number(event.target.value));
                          const currentLevel = normalizeLevel(current.level ?? 1);
                          const nextStats = applyLevelDeltaStats(current, nextLevel - currentLevel);
                          const nextAbilities = applyLevelDeltaAbilities(current, nextLevel - currentLevel);

                          return {
                            ...current,
                            level: nextLevel,
                            maxHp: nextStats.maxHp,
                            armorClass: nextStats.armorClass,
                            proficiencyBonus: nextStats.proficiencyBonus,
                            abilities: nextAbilities,
                          };
                        })
                      }
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div>
                    <label htmlFor="character-ancestry-create">종족</label>
                    <select
                      id="character-ancestry-create"
                      value={formState.ancestry}
                      onChange={(event) => setFormState((current) => ({ ...current, ancestry: event.target.value }))}
                      required
                    >
                      {ancestryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="character-class-create">직업</label>
                    <select
                      id="character-class-create"
                      value={formState.className}
                      onChange={(event) =>
                        setFormState((current) => {
                          const className = event.target.value;
                          const recommendedStats = getRecommendedStats(className, current.level ?? 1);
                          const recommendedAbilities = getRecommendedAbilities(
                            className,
                            current.level ?? 1,
                            current.abilities,
                          );
                          return {
                            ...current,
                            className,
                            avatarType: "PRESET",
                            avatarPresetId: getPresetIdForClassName(className),
                            avatarUrl: null,
                            maxHp: recommendedStats.maxHp,
                            armorClass: recommendedStats.armorClass,
                            speed: recommendedStats.speed,
                            proficiencyBonus: recommendedStats.proficiencyBonus,
                            abilities: recommendedAbilities,
                          };
                        })
                      }
                      required
                    >
                      {classOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>




              </section>

              <section className="character-form-section">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">전투 수치</span>
                    <h2>코어 스탯</h2>
                  </div>
                </div>

                <div className="field-row field-row-4">
                  <div>
                    <label htmlFor="character-hp-create">HP</label>
                    <input
                      id="character-hp-create"
                      type="number"
                      min={1}
                      step={0.1}
                      value={formState.maxHp ?? 12}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, maxHp: Number(event.target.value) || 1 }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="character-ac-create">방어도</label>
                    <input
                      id="character-ac-create"
                      type="number"
                      min={1}
                      step={0.1}
                      value={formState.armorClass ?? 10}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, armorClass: Number(event.target.value) || 1 }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="character-speed-create">이동속도</label>
                    <input
                      id="character-speed-create"
                      type="number"
                      min={0}
                      value={formState.speed ?? 30}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, speed: Number(event.target.value) || 0 }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="character-prof-create">숙련도</label>
                    <input
                      id="character-prof-create"
                      type="number"
                      min={0}
                      step={0.1}
                      value={formState.proficiencyBonus ?? 2}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          proficiencyBonus: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="character-form-section">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">능력치</span>
                    <h2>능력치</h2>
                  </div>
                </div>

                <div className="field-row field-row-3">
                  {(Object.keys(abilityDisplayLabels) as AbilityKey[]).map((ability) => (
                    <div key={ability}>
                      <label htmlFor={`character-${ability}`}>{abilityDisplayLabels[ability]}</label>
                      <input
                        id={`character-${ability}`}
                        type="number"
                        min={1}
                        step={0.1}
                        value={formState.abilities?.[ability] ?? 10}
                        onChange={(event) => updateAbility(ability, Number(event.target.value) || 1)}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="character-form-section">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">기술</span>
                    <h2>숙련 기술</h2>
                  </div>
                </div>

                <div className="character-skill-picker">
                  <input
                    value={skillInput}
                    onChange={(event) => setSkillInput(event.target.value)}
                    placeholder="기술 이름 입력"
                  />
                  <button type="button" onClick={() => addSkill(skillInput)}>
                    추가
                  </button>
                </div>

                <div className="character-chip-row" style={{ marginTop: "14px" }}>
                  {suggestedSkillOptions.map((skill) => (
                    <button
                      key={skill.value}
                      type="button"
                      className="character-skill-chip"
                      onClick={() => addSkill(skill.value)}
                    >
                      {skill.label}
                    </button>
                  ))}
                </div>

                <div className="character-chip-row" style={{ marginTop: "12px" }}>
                  {(formState.proficientSkills ?? []).length ? (
                    (formState.proficientSkills ?? []).map((skill) => (
                      <span
                        key={skill}
                        className="character-selected-chip"
                        style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}
                      >
                        {getSkillLabel(skill)}
                        <button
                          type="button"
                          onClick={() => removeSkill(skill)}
                          aria-label={`${getSkillLabel(skill)} 제거`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "1.22rem",
                            height: "1.22rem",
                            padding: 0,
                            lineHeight: 1,
                            fontSize: "0.95rem",
                            flexShrink: 0,
                            transform: "translateY(-1px)",
                          }}
                        >
                          x
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="status-chip muted">선택된 기술이 없습니다</span>
                  )}
                </div>
              </section>

              <section className="character-form-section">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">인벤토리</span>
                    <h2>아이템</h2>
                  </div>
                  <button type="button" onClick={addInventoryRow}>
                    아이템 추가
                  </button>
                </div>

                <div ref={inventoryEditorRef} className="character-inventory-editor fantasy-scroll-hidden">
                  {inventoryDraft.length ? (
                    inventoryDraft.map((item) => (
                      <div key={item.id} className="character-inventory-row">
                        <input
                          value={item.name}
                          onChange={(event) => updateInventoryRow(item.id, "name", event.target.value)}
                          placeholder="아이템 이름"
                        />
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) => updateInventoryRow(item.id, "quantity", event.target.value)}
                          placeholder="수량"
                        />
                        <button type="button" className="ghost" onClick={() => removeInventoryRow(item.id)}>
                          삭제
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="character-empty-note">아직 추가된 아이템이 없습니다.</p>
                  )}
                </div>
              </section>

              </div>
              <div className="character-create-form-right">
                <section className="character-form-section">
                <div className="character-avatar-picker">
                  <label>초상화</label>
                  <div className="character-avatar-grid" role="radiogroup" aria-label="캐릭터 초상화 선택">
                    {avatarPresets.map((preset) => {
                      const isSelected = formState.avatarPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`character-avatar-option${isSelected ? " selected" : ""}`}
                          onClick={() =>
                            setFormState((current) => {
                              const className = getClassNameForPresetId(preset.id);
                              const recommendedStats = getRecommendedStats(className, current.level ?? 1);
                              const recommendedAbilities = getRecommendedAbilities(
                                className,
                                current.level ?? 1,
                                current.abilities,
                              );

                              return {
                                ...current,
                                className,
                                avatarType: "PRESET",
                                avatarPresetId: preset.id,
                                avatarUrl: null,
                                maxHp: recommendedStats.maxHp,
                                armorClass: recommendedStats.armorClass,
                                speed: recommendedStats.speed,
                                proficiencyBonus: recommendedStats.proficiencyBonus,
                                abilities: recommendedAbilities,
                              };
                            })
                          }
                          aria-pressed={isSelected}
                        >
                          <img src={preset.image} alt={preset.label} className="character-avatar-option-image" />
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                </section>
                <div className="character-insight-box">
                  <div className="fantasy-insight-content">
                    <div className="fantasy-insight-section">
                      <strong className="fantasy-insight-title">{selectedRaceInfo?.label ?? "종족 정보"}</strong>
                      <p>
                        능력치 보너스:{" "}
                        {selectedRaceInfo?.abilityBonuses.map((bonus) => formatAbilityBonus(bonus)).join(", ") ?? "정보 없음"}
                      </p>
                      <p>이동속도: {selectedRaceInfo ? `${selectedRaceInfo.speed} ft.` : "정보 없음"}</p>
                      <p>크기: {selectedRaceInfo?.size ?? "정보 없음"}</p>
                      <ul className="fantasy-character-text-list">
                        {(selectedRaceInfo?.traitSummaries ?? []).slice(0, 3).map((trait) => (
                          <li key={`${selectedRaceInfo?.value}-${trait.name}`}>
                            <strong>{trait.name}</strong>: {trait.summary}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <hr className="fantasy-insight-divider" />

                    <div className="fantasy-insight-section">
                      <strong className="fantasy-insight-title">{selectedClassInfo?.label ?? "직업 정보"}</strong>
                      <p>{selectedClassInfo?.summary ?? "직업 설명이 없습니다."}</p>
                      <p>주 능력치: {selectedClassInfo ? localizeAbilityText(selectedClassInfo.primaryAbilitiesRaw) : "정보 없음"}</p>
                      <p>히트다이: {selectedClassInfo?.hitDieRaw ?? "정보 없음"}</p>
                      <p>주문 사용: {selectedClassInfo?.spellcastingAbility ? "사용" : "없음"}</p>
                      <ul className="fantasy-character-text-list">
                        {(selectedClassInfo?.levelFeatureSummary ?? []).slice(0, 3).map((feature) => (
                          <li key={`${selectedClassInfo?.value}-${feature.level}`}>
                            <strong>{feature.level}레벨</strong>: {feature.features}
                          </li>
                        ))}
                      </ul>
                      <p>
                        시작 장비:{" "}
                        {selectedClassInfo?.startingEquipment.slice(0, 2).join(" / ") ?? "정보 없음"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <button type="submit" className="primary" disabled={busy}>
                {editingCharacterId ? "저장" : "생성"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
