import { FormEvent, useEffect, useMemo, useState } from "react";
import defaultArcherImage from "../assets/images/Profile_Default_Archer.png";
import defaultRogueImage from "../assets/images/Profile_Default_Rouge.png";
import defaultWarriorImage from "../assets/images/Profile_Default_Warrior.png";
import defaultWizardImage from "../assets/images/Profile_Default_Wizard.png";
import boxBulletinNarrow from "../components/Box_Bulletin_Narrow.png";
import navbarImage from "../components/Navbar.png";
import profileBorderCharacter from "../components/Profile_Border_Character.png";
import profileBorderStats from "../components/Profile_Border_Stats.png";
import { Icon } from "../components/Icon";
import type { CharacterPayload } from "../hooks/useSession";
import type { PersistentCharacter, SessionSnapshot, StoredUser } from "../types/session";

interface CharacterPageProps {
  user: StoredUser;
  characters: PersistentCharacter[];
  snapshot: SessionSnapshot | null;
  busy: boolean;
  error: string | null;
  onCreateCharacter: (payload: CharacterPayload) => void;
}

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

interface InventoryDraftItem {
  id: string;
  name: string;
  quantity: number;
}

const defaultCharacter: CharacterPayload = {
  name: "",
  ancestry: "Human",
  className: "Wizard",
  level: 1,
  abilities: {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  },
  proficiencyBonus: 2,
  proficientSkills: [],
  maxHp: 12,
  armorClass: 10,
  speed: 30,
  inventory: [],
};

const abilityLabels: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

const suggestedSkills = [
  "Acrobatics",
  "Arcana",
  "Athletics",
  "History",
  "Insight",
  "Investigation",
  "Perception",
  "Persuasion",
  "Stealth",
  "Survival",
];

function calcModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function formatModifier(score: number) {
  const modifier = calcModifier(score);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
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

function getCharacterClassLabel(className: string) {
  const normalized = className.toLowerCase();
  if (normalized.includes("wizard") || normalized.includes("mage") || normalized.includes("sorcer")) return "마법사";
  if (normalized.includes("archer") || normalized.includes("ranger") || normalized.includes("bow")) return "궁수";
  if (normalized.includes("rogue") || normalized.includes("rouge") || normalized.includes("thief")) return "도적";
  if (normalized.includes("fighter") || normalized.includes("warrior") || normalized.includes("knight")) return "전사";
  return className;
}

export function CharacterPage({
  user,
  characters,
  snapshot,
  busy,
  error,
  onCreateCharacter,
}: CharacterPageProps) {
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [inventoryDraft, setInventoryDraft] = useState<InventoryDraftItem[]>([]);
  const [formState, setFormState] = useState<CharacterPayload>(defaultCharacter);

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

    setSelectedCharacterId((current) => current ?? characters[0].id);
  }, [characters]);

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  );

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
    setFormState(defaultCharacter);
    setInventoryDraft([]);
    setSkillInput("");
  }

  function openCreateModal() {
    resetCreateForm();
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    resetCreateForm();
  }

  function submitCreateCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onCreateCharacter({
      ...formState,
      proficientSkills: formState.proficientSkills?.filter(Boolean) ?? [],
      inventory: inventoryDraft.filter((item) => item.name.trim()),
      assignToSession: false,
    });

    closeCreateModal();
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
            style={{ backgroundImage: `url(${navbarImage})` }}
            onClick={openCreateModal}
          >
            새 캐릭터 생성
          </button>
          <button type="button" className="fantasy-character-sidebutton" style={{ backgroundImage: `url(${navbarImage})` }} disabled>
            캐릭터 복제
          </button>
          <button type="button" className="fantasy-character-sidebutton" style={{ backgroundImage: `url(${navbarImage})` }} disabled>
            캐릭터 수정
          </button>
          <button type="button" className="fantasy-character-sidebutton" style={{ backgroundImage: `url(${navbarImage})` }} disabled>
            캐릭터 삭제
          </button>
        </aside>

        <section className="fantasy-character-board" style={{ backgroundImage: `url(${boxBulletinNarrow})` }}>
          <div className="fantasy-character-board-scroll fantasy-scroll-hidden">
            <div className="fantasy-character-grid">
              {characters.map((character) => {
                const isSelected = character.id === selectedCharacterId;
                const isInUse = usedCharacterIds.has(character.id);
                const art = getCharacterArt(character.className);

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
          <div className="fantasy-scroll-indicator">⌄</div>
        </section>

        <section className="fantasy-character-detail">
          {selectedCharacter ? (
            <>
              <article
                className="fantasy-character-profile-frame"
                style={{ ["--frame-image" as string]: `url(${profileBorderCharacter})` }}
              >
                <img
                  src={getCharacterArt(selectedCharacter.className)}
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
                        <dd>{selectedCharacter.ancestry}</dd>
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
                          {selectedCharacter.maxHp}/{selectedCharacter.maxHp}
                        </dd>
                      </div>
                      <div>
                        <dt>AC</dt>
                        <dd>{selectedCharacter.armorClass}</dd>
                      </div>
                      <div>
                        <dt>속도</dt>
                        <dd>{selectedCharacter.speed}</dd>
                      </div>
                      <div>
                        <dt>Proficiency</dt>
                        <dd>{selectedCharacter.proficiencyBonus}</dd>
                      </div>
                    </dl>

                    <section className="fantasy-character-stats-section">
                      <h3>기본 스탯</h3>
                      <div className="fantasy-character-abilities-grid">
                        {(Object.keys(abilityLabels) as AbilityKey[]).map((ability) => (
                          <div key={ability}>
                            <strong>{abilityLabels[ability]}</strong>
                            <span>{selectedCharacter.abilities[ability]}</span>
                            <small>{formatModifier(selectedCharacter.abilities[ability])}</small>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="fantasy-character-stats-section">
                      <h3>스킬 / 특성</h3>
                      {selectedCharacter.proficientSkills.length ? (
                        <ul className="fantasy-character-text-list">
                          {selectedCharacter.proficientSkills.map((skill) => (
                            <li key={skill}>{skill}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>아직 없음</p>
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
                <div className="fantasy-scroll-indicator fantasy-scroll-indicator-stats">⌄</div>
              </article>
            </>
          ) : (
            <article className="character-focus-card">
              <span className="eyebrow">Character detail</span>
              <h2>캐릭터를 선택해 주세요</h2>
              <p>왼쪽 목록에서 캐릭터 카드를 선택하면 상세 정보가 표시됩니다.</p>
            </article>
          )}
        </section>
      </section>

      {error ? <p className="panel-error">{error}</p> : null}

      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCreateModal}>
          <div
            className="modal-card modal-card-wide"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">Create character</span>
                <h2>New character</h2>
              </div>
              <button type="button" className="modal-close" onClick={closeCreateModal}>
                Close
              </button>
            </div>

            <form className="modal-form character-create-form" onSubmit={submitCreateCharacter}>
              <section className="character-form-section">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">Identity</span>
                    <h2>Profile</h2>
                  </div>
                </div>

                <div className="field-row">
                  <div>
                    <label htmlFor="character-name-create">Name</label>
                    <input
                      id="character-name-create"
                      value={formState.name}
                      onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                      maxLength={50}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="character-level-create">Level</label>
                    <input
                      id="character-level-create"
                      type="number"
                      min={1}
                      value={formState.level ?? 1}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, level: Number(event.target.value) || 1 }))
                      }
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div>
                    <label htmlFor="character-ancestry-create">Ancestry</label>
                    <input
                      id="character-ancestry-create"
                      value={formState.ancestry}
                      onChange={(event) => setFormState((current) => ({ ...current, ancestry: event.target.value }))}
                      maxLength={50}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="character-class-create">Class</label>
                    <input
                      id="character-class-create"
                      value={formState.className}
                      onChange={(event) => setFormState((current) => ({ ...current, className: event.target.value }))}
                      maxLength={50}
                      required
                    />
                  </div>
                </div>
              </section>

              <section className="character-form-section">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">Combat stats</span>
                    <h2>Core stats</h2>
                  </div>
                </div>

                <div className="field-row field-row-4">
                  <div>
                    <label htmlFor="character-hp-create">HP</label>
                    <input
                      id="character-hp-create"
                      type="number"
                      min={1}
                      value={formState.maxHp ?? 12}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, maxHp: Number(event.target.value) || 1 }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="character-ac-create">AC</label>
                    <input
                      id="character-ac-create"
                      type="number"
                      min={1}
                      value={formState.armorClass ?? 10}
                      onChange={(event) =>
                        setFormState((current) => ({ ...current, armorClass: Number(event.target.value) || 1 }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor="character-speed-create">Speed</label>
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
                    <label htmlFor="character-prof-create">Proficiency</label>
                    <input
                      id="character-prof-create"
                      type="number"
                      min={0}
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
                    <span className="eyebrow">Ability scores</span>
                    <h2>Abilities</h2>
                  </div>
                </div>

                <div className="field-row field-row-3">
                  {(Object.keys(abilityLabels) as AbilityKey[]).map((ability) => (
                    <div key={ability}>
                      <label htmlFor={`character-${ability}`}>{abilityLabels[ability]}</label>
                      <input
                        id={`character-${ability}`}
                        type="number"
                        min={1}
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
                    <span className="eyebrow">Skills</span>
                    <h2>Proficiencies</h2>
                  </div>
                </div>

                <div className="character-skill-picker">
                  <input
                    value={skillInput}
                    onChange={(event) => setSkillInput(event.target.value)}
                    placeholder="Add a skill"
                  />
                  <button type="button" onClick={() => addSkill(skillInput)}>
                    Add
                  </button>
                </div>

                <div className="character-chip-row">
                  {suggestedSkills.map((skill) => (
                    <button key={skill} type="button" className="character-skill-chip" onClick={() => addSkill(skill)}>
                      {skill}
                    </button>
                  ))}
                </div>

                <div className="character-chip-row">
                  {(formState.proficientSkills ?? []).length ? (
                    (formState.proficientSkills ?? []).map((skill) => (
                      <span key={skill} className="character-selected-chip">
                        {skill}
                        <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`}>
                          x
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="status-chip muted">No skills selected</span>
                  )}
                </div>
              </section>

              <section className="character-form-section">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">Inventory</span>
                    <h2>Items</h2>
                  </div>
                  <button type="button" onClick={addInventoryRow}>
                    Add item
                  </button>
                </div>

                <div className="character-inventory-editor">
                  {inventoryDraft.length ? (
                    inventoryDraft.map((item) => (
                      <div key={item.id} className="character-inventory-row">
                        <input
                          value={item.name}
                          onChange={(event) => updateInventoryRow(item.id, "name", event.target.value)}
                          placeholder="Item name"
                        />
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) => updateInventoryRow(item.id, "quantity", event.target.value)}
                          placeholder="Qty"
                        />
                        <button type="button" className="ghost" onClick={() => removeInventoryRow(item.id)}>
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="character-empty-note">No items added yet.</p>
                  )}
                </div>
              </section>

              <button type="submit" className="primary" disabled={busy}>
                Create
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
