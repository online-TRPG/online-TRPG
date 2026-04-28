import { FormEvent, useEffect, useMemo, useState } from "react";
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

  const activeCharacterId =
    snapshot?.participants.find((participant) => participant.userId === user.id)?.characterId ?? null;

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

    if (activeCharacterId && characters.some((character) => character.id === activeCharacterId)) {
      setSelectedCharacterId(activeCharacterId);
      return;
    }

    setSelectedCharacterId((current) => current ?? characters[0].id);
  }, [activeCharacterId, characters]);

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  );

  const equippedItem =
    selectedCharacter?.inventory.find((item) => item.id === selectedCharacter.equippedWeaponId) ?? null;

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
    <main className="character-page character-screen">
      <section className="character-screen-grid">
        <section className="character-library character-library-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">My roster</span>
              <h2>{characters.length} characters</h2>
            </div>
            <button type="button" className="primary compact-action" onClick={openCreateModal}>
              <Icon name="plus" />
              New character
            </button>
          </div>

          <div className="character-library-grid">
            {characters.map((character) => (
              <button
                type="button"
                key={character.id}
                className={`character-library-card${character.id === selectedCharacterId ? " active" : ""}`}
                onClick={() => setSelectedCharacterId(character.id)}
              >
                <div className="character-profile-card">
                  <div className="character-profile-avatar">{character.name.slice(0, 1)}</div>
                  <strong>{character.name}</strong>
                  <span>
                    {character.ancestry} / {character.className}
                  </span>
                </div>

                <dl className="character-library-meta">
                  <div>
                    <dt>LV</dt>
                    <dd>{character.level}</dd>
                  </div>
                  <div>
                    <dt>HP</dt>
                    <dd>{character.maxHp}</dd>
                  </div>
                  <div>
                    <dt>AC</dt>
                    <dd>{character.armorClass}</dd>
                  </div>
                  <div>
                    <dt>SPD</dt>
                    <dd>{character.speed}</dd>
                  </div>
                </dl>

                <div className="character-card-tags">
                  <span className={`status-chip${character.isSelectable ? "" : " muted"}`}>
                    {character.isSelectable ? "Selectable" : "Locked"}
                  </span>
                  {character.activeSessionId ? <span className="status-chip muted">In session</span> : null}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="character-detail-shell">
          {selectedCharacter ? (
            <article className="character-focus-card character-detail-panel">
              <div className="character-detail-panel-top">
                <div className="character-detail-hero-head">
                  <div className="avatar avatar-xl">{selectedCharacter.name.slice(0, 1)}</div>
                  <div>
                    <span className="eyebrow">Character detail</span>
                    <h2>{selectedCharacter.name}</h2>
                    <p>
                      {selectedCharacter.ancestry} / {selectedCharacter.className} / Lv {selectedCharacter.level}
                    </p>
                  </div>
                </div>

                <div className="character-detail-actions">
                  <button type="button" disabled>
                    Edit
                  </button>
                  <button type="button" disabled>
                    Duplicate
                  </button>
                  <button type="button" className="danger-button" disabled>
                    Delete
                  </button>
                </div>
              </div>

              <div className="character-detail-grid">
                <article className="character-detail-card">
                  <span className="eyebrow">Combat sheet</span>
                  <div className="character-combat-grid">
                    <div>
                      <dt>Max HP</dt>
                      <dd>{selectedCharacter.maxHp}</dd>
                    </div>
                    <div>
                      <dt>Armor Class</dt>
                      <dd>{selectedCharacter.armorClass}</dd>
                    </div>
                    <div>
                      <dt>Speed</dt>
                      <dd>{selectedCharacter.speed}</dd>
                    </div>
                    <div>
                      <dt>Proficiency</dt>
                      <dd>+{selectedCharacter.proficiencyBonus}</dd>
                    </div>
                  </div>
                </article>

                <article className="character-detail-card">
                  <span className="eyebrow">Ability scores</span>
                  <div className="character-ability-grid">
                    {(Object.keys(abilityLabels) as AbilityKey[]).map((ability) => (
                      <div key={ability}>
                        <dt>{abilityLabels[ability]}</dt>
                        <dd>{selectedCharacter.abilities[ability]}</dd>
                        <span>{formatModifier(selectedCharacter.abilities[ability])}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="character-detail-card">
                  <span className="eyebrow">Skills & traits</span>
                  <div className="character-chip-row">
                    {selectedCharacter.proficientSkills.length ? (
                      selectedCharacter.proficientSkills.map((skill) => <span key={skill}>{skill}</span>)
                    ) : (
                      <span>No skills selected</span>
                    )}
                  </div>
                </article>

                <article className="character-detail-card">
                  <span className="eyebrow">Inventory</span>
                  {selectedCharacter.inventory.length ? (
                    <ul className="character-inventory-list">
                      {selectedCharacter.inventory.map((item) => (
                        <li key={item.id}>
                          <strong>{item.name}</strong>
                          <span>x{item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="character-empty-note">No inventory items yet.</p>
                  )}
                  <p className="character-equipped-note">
                    Equipped weapon: {equippedItem ? equippedItem.name : "None"}
                  </p>
                </article>
              </div>
            </article>
          ) : (
            <article className="character-focus-card">
              <span className="eyebrow">Character detail</span>
              <h2>Select a character</h2>
              <p>Choose a card from My roster to inspect that character here.</p>
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
