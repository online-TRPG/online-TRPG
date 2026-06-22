import { Injectable } from "@nestjs/common";
import { conflict, notFound } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";
import { RuleCatalogService } from "../rules/rule-catalog.service";
import type { RuleCatalogEntry } from "../rules/rule-catalog.types";
import type { SavingThrowAbility } from "../rules/rule-engine.types";
import { SessionsService } from "../sessions/sessions.service";
import { SpellScalingService } from "../rules/spell-scaling.service";
import type { SpellScalingResult, SpellScalingRule } from "../rules/spell-scaling.service";
import { SpellSlotService } from "../rules/spell-slot.service";

type SpellSessionCharacter = {
  character: {
    abilitiesJson: string | null;
    className: string;
    featuresJson?: string | null;
    level: number;
    proficiencyBonus: number;
  };
};

@Injectable()
export class CombatSpellService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
    private readonly ruleCatalog: RuleCatalogService,
    private readonly spellScaling: SpellScalingService,
    private readonly spellSlots: SpellSlotService,
  ) {}

  normalizeSpellId(spellId: string): string {
    const normalized = spellId.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return normalized.startsWith("spell.") ? normalized : `spell.${normalized}`;
  }

  async getSessionCharacterForSpell(sessionCharacterId: string) {
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: sessionCharacterId },
      include: { character: true },
    });
    if (!sessionCharacter) {
      throw notFound("COMBAT_404", "주문 시전자 캐릭터를 찾을 수 없습니다.", { reason: "SPELL_CASTER_NOT_FOUND" });
    }
    return sessionCharacter;
  }

  assertMvpSpellKnown(
    sessionCharacter: {
      character: {
        className: string;
        spellsJson: string | null;
      };
    },
    spellId: string,
  ): void {
    const allowed = new Set(
      this.ruleCatalog
        .listEntries("spell_definitions")
        .filter((entry) => entry.runtimeEffect.type !== "resolver_pending")
        .map((entry) => entry.id),
    );
    if (!allowed.has(spellId)) {
      throw conflict("COMBAT_409", "MVP 범위 밖의 주문입니다.", { reason: "SPELL_NOT_MVP", spellId });
    }
    const spells = this.parseJson<{ cantrips?: string[]; spells?: string[]; preparedSpells?: string[] } | null>(
      sessionCharacter.character.spellsJson,
      null,
    );
    const knownCantrips = (spells?.cantrips ?? []).map((value) => this.normalizeSpellId(value));
    const knownSpells = (spells?.spells ?? []).map((value) => this.normalizeSpellId(value));
    if (knownCantrips.includes(spellId)) return;

    const baseSpellLevel = this.resolveCombatBaseSpellLevel(spellId);
    const preparedSpells = Array.isArray(spells?.preparedSpells)
      ? spells.preparedSpells.map((value) => this.normalizeSpellId(value))
      : null;
    if (preparedSpells && baseSpellLevel > 0) {
      if (knownSpells.includes(spellId) && preparedSpells.includes(spellId)) return;
      if (knownSpells.includes(spellId)) {
        throw conflict("COMBAT_409", "준비되지 않은 주문입니다.", { reason: "SPELL_NOT_PREPARED", spellId });
      }
    }

    if (knownSpells.includes(spellId)) return;
    throw conflict("COMBAT_409", "해당 캐릭터가 익힌 주문이 아닙니다.", { reason: "SPELL_NOT_KNOWN", spellId });
  }

  resolveCombatSpellSlotLevel(spellId: string, requestedSlotLevel: number | null | undefined): number {
    const baseSpellLevel = this.resolveCombatBaseSpellLevel(spellId);
    const slotLevel = requestedSlotLevel ?? baseSpellLevel;
    if (!Number.isInteger(slotLevel) || slotLevel < 0 || slotLevel > 9) {
      throw conflict("COMBAT_409", "주문 슬롯 레벨이 유효하지 않습니다.", {
        reason: "INVALID_SPELL_SLOT_LEVEL",
        spellId,
        slotLevel,
      });
    }
    if (baseSpellLevel === 0 && slotLevel !== 0) {
      throw conflict("COMBAT_409", "Cantrip은 주문 슬롯을 사용하지 않습니다.", {
        reason: "CANTRIP_SLOT_LEVEL_NOT_ALLOWED",
        spellId,
        slotLevel,
      });
    }
    if (slotLevel < baseSpellLevel) {
      throw conflict("COMBAT_409", "주문 슬롯 레벨이 주문 레벨보다 낮습니다.", {
        reason: "SPELL_SLOT_BELOW_SPELL_LEVEL",
        spellId,
        baseSpellLevel,
        slotLevel,
      });
    }
    return slotLevel;
  }

  resolveCombatBaseSpellLevel(spellId: string): number {
    const catalogSpellLevel = this.resolveCombatSpellLevel(this.resolveCombatSpellDefinition(spellId));
    if (catalogSpellLevel !== null) {
      return catalogSpellLevel;
    }
    switch (spellId) {
      case "spell.fire_bolt":
      case "spell.chill_touch":
      case "spell.ray_of_frost":
      case "spell.sacred_flame":
      case "spell.light":
        return 0;
      case "spell.cure_wounds":
      case "spell.burning_hands":
      case "spell.bane":
      case "spell.bless":
      case "spell.detect_magic":
      case "spell.entangle":
      case "spell.magic_missile":
      case "spell.shield":
      case "spell.sleep":
      case "spell.thunderwave":
        return 1;
      case "spell.fireball":
        return 3;
      default:
        return 0;
    }
  }

  resolveCombatSpellDefinition(spellId: string): RuleCatalogEntry | null {
    const entry = this.ruleCatalog.getEntry(spellId);
    return entry?.kind === "spell_definitions" ? entry : null;
  }

  resolveCombatSpellLevel(spellDefinition: RuleCatalogEntry | null): number | null {
    const spellLevelTag = spellDefinition?.runtimeEffect.tags.find((tag) => tag.startsWith("spell_level:"));
    const spellLevel = Number(spellLevelTag?.slice("spell_level:".length));
    return Number.isInteger(spellLevel) && spellLevel >= 0 ? spellLevel : null;
  }

  resolveCombatSpellScalingFromCatalog(
    spellDefinition: RuleCatalogEntry | null,
    slotLevel: number,
  ): SpellScalingResult {
    if (!spellDefinition) {
      throw conflict("COMBAT_409", "주문 정의를 찾을 수 없습니다.", {
        reason: "SPELL_DEFINITION_NOT_FOUND",
      });
    }
    return this.resolveCombatSpellScaling({
      spellId: spellDefinition.id,
      baseSpellLevel: this.resolveCombatSpellLevel(spellDefinition) ?? 0,
      slotLevel,
      baseDamageDice: this.resolveCombatSpellBaseDamageDice(spellDefinition),
      baseTargetCount: this.resolveCombatSpellBaseTargetCount(spellDefinition),
      scalingRules: this.toCombatSpellScalingRules(spellDefinition),
    });
  }

  resolveCombatAreaTargeting(
    spellDefinition: RuleCatalogEntry | null,
    spellId: string,
  ): Extract<RuleCatalogEntry["targeting"], { type: "area" }> {
    if (spellDefinition?.targeting.type !== "area") {
      throw conflict("COMBAT_409", "범위 주문 정의가 유효하지 않습니다.", {
        reason: "SPELL_AREA_TARGETING_REQUIRED",
        spellId,
      });
    }
    return spellDefinition.targeting;
  }

  resolveCombatSpellRangeFt(spellDefinition: RuleCatalogEntry | null, fallback: number): number {
    if (spellDefinition?.targeting.type === "creature" && spellDefinition.targeting.rangeFt !== null) {
      return spellDefinition.targeting.rangeFt;
    }
    const rangeTag = spellDefinition?.runtimeEffect.tags.find((tag) => tag.startsWith("range:"));
    const rangeFt = Number(rangeTag?.slice("range:".length));
    return Number.isInteger(rangeFt) && rangeFt > 0 ? rangeFt : fallback;
  }

  resolveCombatSpellSaveAbility(
    spellDefinition: RuleCatalogEntry | null,
    fallback: SavingThrowAbility,
  ): SavingThrowAbility {
    return spellDefinition?.save?.ability ?? fallback;
  }

  resolveCombatSpellDamageType(spellDefinition: RuleCatalogEntry | null, fallback: string): string {
    return spellDefinition?.damage?.type ?? fallback;
  }

  resolveCombatSpellHalfDamageOnSuccess(spellDefinition: RuleCatalogEntry | null): boolean {
    return spellDefinition?.runtimeEffect.tags.includes("half_damage_on_success") ?? false;
  }

  resolveCombatLightRadiusFt(spellDefinition: RuleCatalogEntry | null): number {
    const radiusTag = spellDefinition?.runtimeEffect.tags.find((tag) => tag.startsWith("light_radius:"));
    const radiusFt = Number(radiusTag?.slice("light_radius:".length));
    return Number.isInteger(radiusFt) && radiusFt > 0 ? radiusFt : 40;
  }

  resolveCombatSpellBaseDamageDice(spellDefinition: RuleCatalogEntry | null): string | null {
    const poolTag = spellDefinition?.runtimeEffect.tags.find((tag) => tag.startsWith("hit_point_pool:"));
    return poolTag?.slice("hit_point_pool:".length) ?? spellDefinition?.damage?.dice ?? null;
  }

  resolveCombatSpellBaseTargetCount(spellDefinition: RuleCatalogEntry): number | null {
    const targetCountTag = spellDefinition.runtimeEffect.tags.find((tag) =>
      tag.startsWith("target_count:"),
    );
    const taggedTargetCount = Number(targetCountTag?.slice("target_count:".length));
    if (Number.isInteger(taggedTargetCount) && taggedTargetCount > 0) {
      return taggedTargetCount;
    }
    const missileTag = spellDefinition.runtimeEffect.tags.find((tag) => tag.startsWith("missile_count:"));
    const missileCount = Number(missileTag?.slice("missile_count:".length));
    if (Number.isInteger(missileCount) && missileCount > 0) {
      return missileCount;
    }
    return spellDefinition.targeting.type === "creature" ? 1 : null;
  }

  resolveMagicMissileDamageDice(spellDefinition: RuleCatalogEntry | null, missileCount: number): string {
    const damageDice = spellDefinition?.damage?.dice ?? "3d4+3";
    const normalizedMissileCount = Number.isInteger(missileCount) && missileCount > 0 ? missileCount : 3;
    const match = damageDice.trim().toLowerCase().match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!match) {
      return "1d4+1";
    }

    const diceCount = Number(match[1]);
    const diceSides = Number(match[2]);
    const modifier = match[3] ? Number(match[3]) : 0;
    if (
      diceCount <= 0 ||
      diceSides <= 0 ||
      diceCount % normalizedMissileCount !== 0 ||
      modifier % normalizedMissileCount !== 0
    ) {
      return "1d4+1";
    }

    const perMissileDiceCount = diceCount / normalizedMissileCount;
    const perMissileModifier = modifier / normalizedMissileCount;
    const modifierText =
      perMissileModifier === 0
        ? ""
        : perMissileModifier > 0
          ? `+${perMissileModifier}`
          : String(perMissileModifier);
    return `${perMissileDiceCount}d${diceSides}${modifierText}`;
  }

  async resolveSpellAttackBonus(sessionCharacterId: string): Promise<number> {
    const sessionCharacter = await this.getSessionCharacterForSpell(sessionCharacterId);
    return this.resolveSpellAttackBonusForCharacter(sessionCharacter);
  }

  resolveSpellAttackBonusForCharacter(sessionCharacter: SpellSessionCharacter): number {
    return sessionCharacter.character.proficiencyBonus +
      this.resolveSpellcastingAbilityModifierForCharacter(sessionCharacter);
  }

  async resolveSpellcastingAbilityModifier(sessionCharacterId: string): Promise<number> {
    const sessionCharacter = await this.getSessionCharacterForSpell(sessionCharacterId);
    return this.resolveSpellcastingAbilityModifierForCharacter(sessionCharacter);
  }

  resolveSpellcastingAbilityModifierForCharacter(sessionCharacter: SpellSessionCharacter): number {
    const abilities = this.parseJson<Record<string, number>>(sessionCharacter.character.abilitiesJson, {});
    const abilityKey = this.resolveSpellcastingAbilityKey(sessionCharacter.character.className);
    return this.getAbilityModifier(abilities[abilityKey] ?? 10);
  }

  async resolveCombatSpellSaveDc(sessionCharacterId: string): Promise<number> {
    const sessionCharacter = await this.getSessionCharacterForSpell(sessionCharacterId);
    return this.resolveCombatSpellSaveDcForCharacter(sessionCharacter);
  }

  resolveCombatSpellSaveDcForCharacter(sessionCharacter: SpellSessionCharacter): number {
    return 8 +
      sessionCharacter.character.proficiencyBonus +
      this.resolveSpellcastingAbilityModifierForCharacter(sessionCharacter);
  }

  async resolveCharacterLevel(sessionCharacterId: string): Promise<number> {
    const sessionCharacter = await this.getSessionCharacterForSpell(sessionCharacterId);
    return this.resolveCharacterLevelForCharacter(sessionCharacter);
  }

  resolveCharacterLevelForCharacter(sessionCharacter: SpellSessionCharacter): number {
    return sessionCharacter.character.level;
  }

  resolveElementalAffinityDamageBonusForCharacter(
    sessionCharacter: SpellSessionCharacter,
    damageType: string,
  ): number {
    if (
      !sessionCharacter.character.className
        .trim()
        .toLowerCase()
        .includes("sorcerer") ||
      sessionCharacter.character.level < 6
    ) {
      return 0;
    }
    const featureIds = this.parseJson<string[]>(
      sessionCharacter.character.featuresJson,
      [],
    );
    const runtimeTags = this.ruleCatalog.resolveRuntimeTags(featureIds);
    if (
      !runtimeTags.includes("trigger:spell_damage_matching_ancestry") ||
      !runtimeTags.includes(`resistance:${damageType.trim().toLowerCase()}`)
    ) {
      return 0;
    }
    return Math.max(
      this.resolveSpellcastingAbilityModifierForCharacter(sessionCharacter),
      0,
    );
  }

  hasPotentCantripForCharacter(
    sessionCharacter: SpellSessionCharacter,
  ): boolean {
    if (
      !sessionCharacter.character.className
        .trim()
        .toLowerCase()
        .includes("wizard") ||
      sessionCharacter.character.level < 6
    ) {
      return false;
    }
    const featureIds = this.parseJson<string[]>(
      sessionCharacter.character.featuresJson,
      [],
    );
    return this.ruleCatalog
      .resolveRuntimeTags(featureIds)
      .includes("damage:half_on_success");
  }

  resolveCantripDamageDice(baseDice: string, level: number): string {
    if (level >= 17) return baseDice.replace(/^1d/, "4d");
    if (level >= 11) return baseDice.replace(/^1d/, "3d");
    if (level >= 5) return baseDice.replace(/^1d/, "2d");
    return baseDice;
  }

  async spendSpellSlot(sessionId: string, sessionCharacterId: string, slotLevel: number): Promise<void> {
    return this.spendSpellSlotWithMaximum(sessionId, sessionCharacterId, slotLevel);
  }

  async spendSpellSlotWithMaximum(
    sessionId: string,
    sessionCharacterId: string,
    slotLevel: number,
    maximumSlots?: number,
  ): Promise<void> {
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const spellSlots = this.parseJson<Record<string, Record<string, number>>>(
      JSON.stringify(flags.spellSlotsBySessionCharacterId ?? {}),
      {},
    );
    const key = String(slotLevel);
    const resolvedMaximumSlots = maximumSlots ?? await this.resolveSpellSlotMaximum(sessionCharacterId, slotLevel);
    const characterSlots = spellSlots[sessionCharacterId] ?? { [key]: resolvedMaximumSlots };
    const remaining = Math.max(0, Math.floor(characterSlots[key] ?? resolvedMaximumSlots));
    if (remaining <= 0) {
      throw conflict("COMBAT_409", `사용 가능한 ${slotLevel}레벨 주문 슬롯이 없습니다.`, { reason: "NO_SPELL_SLOT" });
    }
    spellSlots[sessionCharacterId] = { ...characterSlots, [key]: remaining - 1 };
    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: { flagsJson: JSON.stringify({ ...flags, spellSlotsBySessionCharacterId: spellSlots }) },
    });
  }

  async assertSpellSlotAvailable(
    sessionId: string,
    sessionCharacterId: string,
    slotLevel: number,
    maximumSlots?: number,
  ): Promise<void> {
    if (slotLevel < 1) return;
    if ((await this.getRemainingSpellSlots(sessionId, sessionCharacterId, slotLevel, maximumSlots)) <= 0) {
      throw conflict("COMBAT_409", `사용 가능한 ${slotLevel}레벨 주문 슬롯이 없습니다.`, {
        reason: "NO_SPELL_SLOT",
      });
    }
  }

  async getRemainingSpellSlots(
    sessionId: string,
    sessionCharacterId: string,
    slotLevel: number,
    maximumSlots?: number,
  ): Promise<number> {
    const { state } = await this.sessionsService.getGameStateEntityOrThrow(sessionId);
    const flags = this.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const spellSlots = this.parseJson<Record<string, Record<string, number>>>(
      JSON.stringify(flags.spellSlotsBySessionCharacterId ?? {}),
      {},
    );
    const resolvedMaximumSlots = maximumSlots ?? await this.resolveSpellSlotMaximum(sessionCharacterId, slotLevel);
    return Math.max(
      0,
      Math.min(
        resolvedMaximumSlots,
        Math.floor(spellSlots[sessionCharacterId]?.[String(slotLevel)] ?? resolvedMaximumSlots),
      ),
    );
  }

  async resolveSpellSlotMaximum(sessionCharacterId: string, slotLevel: number): Promise<number> {
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: sessionCharacterId },
      include: {
        character: {
          select: {
            className: true,
            level: true,
          },
        },
      },
    });
    return this.spellSlots.resolveMaximumForCharacter(
      sessionCharacter?.character ?? null,
      slotLevel,
    );
  }

  resolveSpellSlotMaximumForCharacter(
    sessionCharacter: { character: { className: string; level: number } },
    slotLevel: number,
  ): number {
    return this.spellSlots.resolveMaximumForCharacter(sessionCharacter.character, slotLevel);
  }

  resolveCombatSpellSlotResources(
    character: { className: string; level: number } | null,
    rawSlots: Record<string, number> | undefined,
  ): Record<string, { total: number; remaining: number }> {
    const resources: Record<string, { total: number; remaining: number }> = {};
    for (let slotLevel = 1; slotLevel <= 9; slotLevel += 1) {
      const total = this.spellSlots.resolveMaximumForCharacter(character, slotLevel);
      if (total <= 0 && rawSlots?.[String(slotLevel)] === undefined) {
        continue;
      }
      const remaining = Math.max(
        0,
        Math.min(total, Math.floor(rawSlots?.[String(slotLevel)] ?? total)),
      );
      resources[String(slotLevel)] = { total, remaining };
    }
    return resources;
  }

  private resolveCombatSpellScaling(input: {
    spellId: string;
    baseSpellLevel: number;
    slotLevel: number;
    baseDamageDice?: string | null;
    baseTargetCount?: number | null;
    scalingRules: SpellScalingRule[];
  }): SpellScalingResult {
    try {
      return this.spellScaling.resolveUpcast(input);
    } catch (error) {
      throw conflict("COMBAT_409", "주문 슬롯 스케일링을 적용할 수 없습니다.", {
        reason: "INVALID_SPELL_SCALING",
        spellId: input.spellId,
        slotLevel: input.slotLevel,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private toCombatSpellScalingRules(spellDefinition: RuleCatalogEntry): SpellScalingRule[] {
    const table = spellDefinition.scaling?.table;
    if (!table || typeof table !== "object" || Array.isArray(table)) {
      return [];
    }

    const mode = table.mode;
    switch (mode) {
      case "damage_dice":
        return typeof table.dice === "string"
          ? [{ mode, dice: table.dice, perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove) }]
          : [];
      case "target_count":
      case "summon_count":
        return typeof table.count === "number"
          ? [{ mode, count: table.count, perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove) }]
          : [];
      case "duration":
        return typeof table.unit === "string" && typeof table.amountPerSlotAbove === "number"
          ? [{
              mode,
              unit: table.unit as "round" | "minute" | "hour" | "day",
              amountPerSlotAbove: table.amountPerSlotAbove,
              perSlotAbove: this.toOptionalPositiveInteger(table.perSlotAbove),
            }]
          : [];
      default:
        return [];
    }
  }

  private toOptionalPositiveInteger(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
  }

  private getAbilityModifier(score: number | null | undefined): number {
    return Math.floor(((score ?? 10) - 10) / 2);
  }

  private resolveSpellcastingAbilityKey(className: string): "int" | "wis" | "cha" {
    const classKey = className.trim().toLowerCase();
    if (classKey === "cleric" || classKey === "druid" || classKey === "ranger") {
      return "wis";
    }
    if (
      classKey === "bard" ||
      classKey === "paladin" ||
      classKey === "sorcerer" ||
      classKey === "warlock"
    ) {
      return "cha";
    }
    return "int";
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
