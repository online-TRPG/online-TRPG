import { BadRequestException, Injectable } from "@nestjs/common";
import {
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import type {
  AbilityScoresDto,
  InventoryItemDto,
  StartingEquipmentDto,
} from "@trpg/shared-types";
import { isRecord } from "@trpg/shared-types";
import { normalizeSrdCharacterClassKey } from "@trpg/srd-data/rules";
import {
  decodeStringArray,
  parseJsonOrThrow,
} from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import { CatalogService } from "../catalog/catalog.service";

@Injectable()
export class CharacterEquipmentLoadoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
  ) {}

  resolveDefaultEquippedWeaponId(inventory: InventoryItemDto[]): string | null {
    const weapon = inventory.find((item) => this.isWeaponInventoryItem(item));
    return weapon?.itemDefinitionId ?? weapon?.id ?? null;
  }

  resolveDefaultOffhandEquipmentId(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null,
  ): string | null {
    const mainWeapon = inventory.find(
      (item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId,
    );
    if (mainWeapon && !this.isOneHandWeaponCandidate(mainWeapon)) {
      return null;
    }

    const shield = inventory.find((item) => this.isShieldInventoryItem(item));
    return shield?.itemDefinitionId ?? shield?.id ?? null;
  }

  async resolveStartingEquipment(params: {
    className: string;
    selection: number[] | undefined;
    itemSelections: Record<string, string> | undefined;
  }): Promise<InventoryItemDto[] | null> {
    const classKey = normalizeSrdCharacterClassKey(params.className);
    const klass = await this.catalogService.findClassByKey(classKey);
    if (!klass) {
      return null;
    }

    const startingEquipment = parseJsonOrThrow(
      klass.startingEquipmentJson,
      { slots: [] },
      decodeStartingEquipment,
      "characterClass.startingEquipmentJson",
    );
    const slots = startingEquipment.slots;

    if (!Array.isArray(params.selection) || params.selection.length !== slots.length) {
      throw new BadRequestException(
        `시작 장비: ${slots.length}개 슬롯 모두에 옵션 인덱스를 보내야 합니다. (받은 길이: ${params.selection?.length ?? 0})`,
      );
    }

    const inventory: InventoryItemDto[] = [];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex];
      const optionIndex = params.selection[slotIndex];
      if (!slot || optionIndex === undefined) {
        throw new BadRequestException(`시작 장비: 슬롯 ${slotIndex} 정보를 찾을 수 없습니다.`);
      }
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= slot.options.length) {
        throw new BadRequestException(
          `시작 장비: 슬롯 ${slotIndex} 의 옵션 인덱스 ${optionIndex} 가 유효 범위(0..${slot.options.length - 1})를 벗어났습니다.`,
        );
      }
      const option = slot.options[optionIndex];
      if (!option) {
        throw new BadRequestException(`시작 장비: 슬롯 ${slotIndex} 의 옵션을 찾을 수 없습니다.`);
      }
      for (const [itemIndex, item] of option.items.entries()) {
        const baseCatalogItem = await this.prisma.item.findUnique({ where: { key: item.itemKey } });
        if (!baseCatalogItem) {
          throw new BadRequestException(
            `시작 장비: 아이템 시드에 ${item.itemKey} 가 없습니다.`,
          );
        }
        const catalogItem = await this.resolveConcreteStartingEquipmentItem(
          baseCatalogItem,
          params.itemSelections?.[`${slotIndex}:${itemIndex}`],
          slotIndex,
          itemIndex,
        );
        inventory.push({
          id: `${catalogItem.key}-${slotIndex}-${inventory.length}`,
          name: catalogItem.koName,
          quantity: item.quantity,
          itemDefinitionId: catalogItem.id,
          itemType: catalogItem.category,
        });
      }
    }
    return inventory;
  }

  async resolveNextEquipmentLoadout(params: {
    characterId: string;
    inventory: InventoryItemDto[];
    currentMainWeaponId: string | null;
    currentOffhandWeaponId: string | null;
    requestedMainWeaponId?: string | null;
    requestedOffhandWeaponId?: string | null;
  }): Promise<{ equippedWeaponId: string | null; offhandWeaponId: string | null }> {
    const currentMainWeaponId = await this.normalizeEquippedWeaponId(
      params.inventory,
      params.currentMainWeaponId,
      params.characterId,
    );
    const currentOffhandWeaponId = await this.normalizeEquippedWeaponId(
      params.inventory,
      params.currentOffhandWeaponId,
      params.characterId,
    );
    const requestedMainWeaponId =
      params.requestedMainWeaponId === undefined
        ? undefined
        : await this.normalizeEquippedWeaponId(
            params.inventory,
            params.requestedMainWeaponId,
            params.characterId,
          );
    const requestedOffhandWeaponId =
      params.requestedOffhandWeaponId === undefined
        ? undefined
        : await this.normalizeEquippedWeaponId(
            params.inventory,
            params.requestedOffhandWeaponId,
            params.characterId,
          );
    let equippedWeaponId =
      requestedMainWeaponId === undefined ? currentMainWeaponId : requestedMainWeaponId;
    let offhandWeaponId =
      requestedOffhandWeaponId === undefined ? currentOffhandWeaponId : requestedOffhandWeaponId;

    if (
      requestedMainWeaponId &&
      requestedOffhandWeaponId === undefined &&
      currentMainWeaponId &&
      !currentOffhandWeaponId
    ) {
      const currentMain = await this.resolveEquippedWeaponCandidate(
        params.inventory,
        currentMainWeaponId,
        { allowSessionInventoryForCharacterId: params.characterId },
      );
      const requestedMain = await this.resolveEquippedWeaponCandidate(
        params.inventory,
        requestedMainWeaponId,
        { allowSessionInventoryForCharacterId: params.characterId },
      );

      if (
        currentMain &&
        requestedMain &&
        this.isOneHandWeaponCandidate(currentMain) &&
        this.isOneHandWeaponCandidate(requestedMain) &&
        (currentMainWeaponId !== requestedMainWeaponId ||
          (requestedMain.quantity ?? 0) >= 2)
      ) {
        equippedWeaponId = currentMainWeaponId;
        offhandWeaponId = requestedMainWeaponId;
      }
    }

    if (equippedWeaponId && offhandWeaponId && equippedWeaponId === offhandWeaponId) {
      const duplicatedWeapon = await this.resolveEquippedWeaponCandidate(
        params.inventory,
        equippedWeaponId,
        { allowSessionInventoryForCharacterId: params.characterId },
      );
      if ((duplicatedWeapon?.quantity ?? 0) < 2) {
        offhandWeaponId = null;
      }
    }

    if (!equippedWeaponId && offhandWeaponId) {
      const offhand = await this.resolveEquippedWeaponCandidate(params.inventory, offhandWeaponId, {
        allowSessionInventoryForCharacterId: params.characterId,
      });
      if (!offhand || this.isWeaponInventoryItem(offhand)) {
        offhandWeaponId = null;
      }
    }

    if (equippedWeaponId) {
      const main = await this.resolveEquippedWeaponCandidate(params.inventory, equippedWeaponId, {
        allowSessionInventoryForCharacterId: params.characterId,
      });
      if (main && !this.isOneHandWeaponCandidate(main)) {
        if (requestedOffhandWeaponId !== undefined && offhandWeaponId) {
          throw new BadRequestException(
            "장비: 두손 무기를 장착한 상태에서는 왼손 장비를 함께 장착할 수 없습니다.",
          );
        }
        offhandWeaponId = null;
      }
    }

    await this.validateEquipmentLoadout(params.inventory, equippedWeaponId, offhandWeaponId, {
      allowSessionInventoryForCharacterId: params.characterId,
    });

    return { equippedWeaponId, offhandWeaponId };
  }

  async resolveEquippedWeaponCandidate(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null,
    options?: { allowSessionInventoryForCharacterId?: string },
  ): Promise<InventoryItemDto | null> {
    if (!equippedWeaponId) {
      return null;
    }

    const matched = inventory.find(
      (item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId,
    );
    if (matched) {
      return matched;
    }

    if (!options?.allowSessionInventoryForCharacterId) {
      return null;
    }

    const sessionInventoryMatch = await this.prisma.inventoryEntry.findFirst({
      where: {
        sessionCharacter: {
          characterId: options.allowSessionInventoryForCharacterId,
          status: PrismaSessionCharacterStatus.ACTIVE,
          session: {
            status: { in: [PrismaSessionStatus.PLAYING, PrismaSessionStatus.PAUSED] },
          },
        },
        OR: [{ id: equippedWeaponId }, { itemDefinitionId: equippedWeaponId }],
      },
      include: { itemDefinition: true },
    });

    if (sessionInventoryMatch) {
      return {
        id: sessionInventoryMatch.id,
        name: sessionInventoryMatch.itemDefinition.name,
        quantity: sessionInventoryMatch.quantity,
        itemDefinitionId: sessionInventoryMatch.itemDefinitionId,
        itemType: sessionInventoryMatch.itemDefinition.itemType,
        damageDice: sessionInventoryMatch.itemDefinition.damageDice ?? undefined,
        damageType: sessionInventoryMatch.itemDefinition.damageType ?? undefined,
        properties: this.parseStringArrayJson(sessionInventoryMatch.itemDefinition.propertiesJson),
      };
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findFirst({
      where: {
        characterId: options.allowSessionInventoryForCharacterId,
        status: PrismaSessionCharacterStatus.ACTIVE,
        session: {
          status: { in: [PrismaSessionStatus.PLAYING, PrismaSessionStatus.PAUSED] },
        },
      },
      select: {
        inventorySnapshotJson: true,
        character: { select: { inventoryJson: true } },
      },
    });
    const snapshotInventory = this.parseInventoryItemsJson(
      sessionCharacter?.inventorySnapshotJson ?? sessionCharacter?.character.inventoryJson,
    );
    return (
      snapshotInventory.find(
        (item) => item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId,
      ) ?? null
    );
  }

  async validateEquipmentLoadout(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null,
    offhandWeaponId: string | null,
    options?: { allowSessionInventoryForCharacterId?: string },
  ): Promise<void> {
    await this.validateInventoryAndEquippedWeapon(inventory, equippedWeaponId, "rightHand", options);
    await this.validateInventoryAndEquippedWeapon(inventory, offhandWeaponId, "leftHand", options);

    if (!equippedWeaponId || !offhandWeaponId) {
      return;
    }
    const main = await this.resolveEquippedWeaponCandidate(inventory, equippedWeaponId, options);
    const offhand = await this.resolveEquippedWeaponCandidate(inventory, offhandWeaponId, options);

    if (equippedWeaponId === offhandWeaponId && (main?.quantity ?? 0) < 2) {
      throw new BadRequestException("장비: 같은 무기를 양손에 동시에 장착할 수 없습니다.");
    }

    if (!main || !offhand) {
      return;
    }
    if (!this.isOneHandWeaponCandidate(main)) {
      throw new BadRequestException(
        "장비: 두손 무기를 장착한 상태에서는 왼손 장비를 함께 장착할 수 없습니다.",
      );
    }

    if (this.isShieldInventoryItem(offhand)) {
      return;
    }

    if (!this.isOneHandWeaponCandidate(offhand)) {
      throw new BadRequestException(
        "장비: 쌍수 장착은 한손 근접 무기 두 개일 때만 가능합니다.",
      );
    }
  }

  resolveArmorClass(
    className: string,
    abilities: AbilityScoresDto,
    inventory: InventoryItemDto[],
    fallbackArmorClass: number | undefined,
    offhandEquipmentId: string | null = null,
    hasEquippedShield = false,
  ): number {
    const dexMod = this.getAbilityModifier(abilities.dex);
    const conMod = this.getAbilityModifier(abilities.con);
    const wisMod = this.getAbilityModifier(abilities.wis);
    const normalizedClass = normalizeSrdCharacterClassKey(className);
    const shieldBonus = hasEquippedShield || inventory.some(
      (item) =>
        this.isShieldInventoryItem(item) &&
        Boolean(offhandEquipmentId) &&
        (item.id === offhandEquipmentId || item.itemDefinitionId === offhandEquipmentId),
    )
      ? 2
      : 0;
    const armorCandidates = inventory
      .filter((item) => this.isArmorInventoryItem(item))
      .flatMap((item) => {
        const armorClass = this.calculateArmorItemAc(item, dexMod);
        return armorClass === null ? [] : [armorClass];
      });

    const armorAc = armorCandidates.length ? Math.max(...armorCandidates) + shieldBonus : null;
    const unarmoredAc =
      normalizedClass.includes("barbarian")
        ? 10 + dexMod + conMod
        : normalizedClass.includes("monk")
          ? 10 + dexMod + wisMod
          : 10 + dexMod;
    const calculatedAc = Math.max(armorAc ?? Number.MIN_SAFE_INTEGER, unarmoredAc);

    return calculatedAc > 0 ? calculatedAc : fallbackArmorClass ?? 10;
  }

  isArmorInventoryItem(item: InventoryItemDto): boolean {
    const key = this.getInventoryItemSearchKey(item);
    return item.itemType === "armor" || key.includes("armor-") || key.includes("갑옷");
  }

  isShieldInventoryItem(item: InventoryItemDto): boolean {
    const key = this.getInventoryItemSearchKey(item);
    return item.itemType === "shield" || key.includes("shield") || key.includes("방패");
  }

  private async normalizeEquippedWeaponId(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null | undefined,
    characterId: string,
  ): Promise<string | null> {
    if (!equippedWeaponId) {
      return null;
    }
    const matched = await this.resolveEquippedWeaponCandidate(inventory, equippedWeaponId, {
      allowSessionInventoryForCharacterId: characterId,
    });
    return matched?.itemDefinitionId ?? matched?.id ?? equippedWeaponId;
  }

  private async validateInventoryAndEquippedWeapon(
    inventory: InventoryItemDto[],
    equippedWeaponId: string | null,
    slot: "rightHand" | "leftHand",
    options?: { allowSessionInventoryForCharacterId?: string },
  ): Promise<void> {
    const definitionIds = inventory
      .flatMap((item) => (typeof item.itemDefinitionId === "string" && item.itemDefinitionId.length > 0 ? [item.itemDefinitionId] : []));
    if (definitionIds.length > 0) {
      const found = await this.prisma.item.findMany({
        where: { id: { in: definitionIds } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((row) => row.id));
      for (const id of definitionIds) {
        if (!foundIds.has(id)) {
          throw new BadRequestException(`장비: 카탈로그에 없는 itemDefinitionId(${id}) 가 인벤토리에 있습니다.`);
        }
      }
    }

    if (equippedWeaponId) {
      const matched = await this.resolveEquippedWeaponCandidate(
        inventory,
        equippedWeaponId,
        options,
      );
      if (matched) {
        const isValidEquipment =
          slot === "rightHand"
            ? this.isWeaponInventoryItem(matched)
            : this.isWeaponInventoryItem(matched) || this.isShieldInventoryItem(matched);
        if (!isValidEquipment) {
          throw new BadRequestException(
            slot === "rightHand"
              ? `장비: 오른손 장착 대상(${equippedWeaponId})은 무기가 아닙니다.`
              : `장비: 왼손 장착 대상(${equippedWeaponId})은 무기 또는 방패가 아닙니다.`,
          );
        }
        return;
      }

      if (!matched) {
        throw new BadRequestException(
          `장비: 장착 장비 id(${equippedWeaponId})가 인벤토리에 없습니다.`,
        );
      }
    }
  }

  private calculateArmorItemAc(item: InventoryItemDto, dexMod: number): number | null {
    const key = this.getInventoryItemSearchKey(item);
    if (key.includes("shield") || key.includes("방패")) {
      return null;
    }
    if (key.includes("chain-mail") || key.includes("chain mail") || key.includes("체인 메일")) {
      return 16;
    }
    if (key.includes("scale-mail") || key.includes("scale mail") || key.includes("스케일 메일")) {
      return 14 + Math.min(dexMod, 2);
    }
    if (key.includes("leather-armor") || key.includes("leather armor") || key.includes("가죽 갑옷")) {
      return 11 + dexMod;
    }
    return null;
  }

  private isWeaponInventoryItem(item: InventoryItemDto): boolean {
    const key = this.getInventoryItemSearchKey(item);
    return item.itemType === "weapon" || key.includes("weapon-") || key.includes("무기");
  }

  private isOneHandWeaponCandidate(item: InventoryItemDto): boolean {
    if (!this.isWeaponInventoryItem(item)) {
      return false;
    }
    const properties = new Set(
      [...(item.properties ?? []), ...this.getFallbackWeaponProperties(item)]
        .map((property) => property.toLowerCase().replace(/\s+/g, "-")),
    );
    return !properties.has("two-handed") && !properties.has("ranged");
  }

  private getInventoryItemSearchKey(item: InventoryItemDto): string {
    return compactPresentStrings([item.id, item.itemDefinitionId, item.name, item.itemType])
      .join(" ")
      .toLowerCase();
  }

  private getFallbackWeaponProperties(item: InventoryItemDto): string[] {
    const key = this.getInventoryItemSearchKey(item).replace(/_/g, "-");
    const profiles: Record<string, string[]> = {
      dagger: ["finesse", "light", "thrown"],
      dart: ["ranged", "thrown"],
      greataxe: ["melee", "heavy", "two-handed"],
      handaxe: ["light", "thrown"],
      javelin: ["thrown"],
      "light-crossbow": ["ranged", "two-handed"],
      longsword: ["melee", "versatile"],
      longbow: ["ranged", "two-handed"],
      mace: ["melee"],
      quarterstaff: ["melee", "versatile"],
      rapier: ["melee", "finesse"],
      scimitar: ["melee", "finesse", "light"],
      shortbow: ["ranged", "two-handed"],
      shortsword: ["melee", "finesse", "light"],
      warhammer: ["melee", "versatile"],
    };
    const matchedKey = Object.keys(profiles).find((profileKey) => key.includes(profileKey));
    if (matchedKey) {
      return profiles[matchedKey] ?? [];
    }

    const koreanProfiles: Array<[string, string[]]> = [
      ["단검", profiles.dagger],
      ["다트", profiles.dart],
      ["그레이트액스", profiles.greataxe],
      ["핸드액스", profiles.handaxe],
      ["재블린", profiles.javelin],
      ["라이트 크로스보우", profiles["light-crossbow"]],
      ["롱소드", profiles.longsword],
      ["롱보우", profiles.longbow],
      ["메이스", profiles.mace],
      ["쿼터스태프", profiles.quarterstaff],
      ["레이피어", profiles.rapier],
      ["시미터", profiles.scimitar],
      ["쇼트보우", profiles.shortbow],
      ["쇼트소드", profiles.shortsword],
      ["워해머", profiles.warhammer],
    ];
    return koreanProfiles.find(([name]) => key.includes(name))?.[1] ?? [];
  }

  private async resolveConcreteStartingEquipmentItem(
    baseCatalogItem: { id: string; key: string; koName: string; category: string },
    selectedItemKey: string | undefined,
    slotIndex: number,
    itemIndex: number,
  ): Promise<{ id: string; key: string; koName: string; category: string }> {
    const matcher = this.getStartingEquipmentPlaceholderMatcher(baseCatalogItem.category);
    if (!matcher) {
      return baseCatalogItem;
    }

    const normalizedSelectedItemKey = selectedItemKey?.trim();
    if (!normalizedSelectedItemKey) {
      throw new BadRequestException(
        `시작 장비: 슬롯 ${slotIndex} 의 ${itemIndex}번째 항목(${baseCatalogItem.koName})은 실제 아이템 선택이 필요합니다.`,
      );
    }

    const selectedCatalogItem = await this.prisma.item.findUnique({
      where: { key: normalizedSelectedItemKey },
    });
    if (!selectedCatalogItem) {
      throw new BadRequestException(
        `시작 장비: 선택한 아이템 ${normalizedSelectedItemKey} 이(가) 아이템 시드에 없습니다.`,
      );
    }
    if (!matcher.isAllowed(selectedCatalogItem.category)) {
      throw new BadRequestException(
        `시작 장비: ${baseCatalogItem.koName} 자리에는 ${matcher.label}만 선택할 수 있습니다. (받은 값: ${selectedCatalogItem.koName})`,
      );
    }

    return selectedCatalogItem;
  }

  private getStartingEquipmentPlaceholderMatcher(category: string):
    | { label: string; isAllowed: (candidateCategory: string) => boolean }
    | null {
    switch (category) {
      case "placeholder-weapon-simple":
        return {
          label: "단순 무기",
          isAllowed: (candidateCategory) =>
            candidateCategory.startsWith("weapon-") && candidateCategory.endsWith("-simple"),
        };
      case "placeholder-weapon-simple-melee":
        return {
          label: "단순 근접 무기",
          isAllowed: (candidateCategory) => candidateCategory === "weapon-melee-simple",
        };
      case "placeholder-weapon-martial":
        return {
          label: "군용 무기",
          isAllowed: (candidateCategory) =>
            candidateCategory.startsWith("weapon-") && candidateCategory.endsWith("-martial"),
        };
      case "placeholder-weapon-martial-melee":
        return {
          label: "군용 근접 무기",
          isAllowed: (candidateCategory) => candidateCategory === "weapon-melee-martial",
        };
      case "placeholder-instrument":
        return {
          label: "악기",
          isAllowed: (candidateCategory) => candidateCategory === "instrument",
        };
      default:
        return null;
    }
  }

  private parseStringArrayJson(value: string | null | undefined): string[] {
    return parseJsonOrThrow(value, [], decodeStringArray, "itemDefinition.propertiesJson");
  }

  private parseInventoryItemsJson(value: string | null | undefined): InventoryItemDto[] {
    return parseJsonOrThrow(value, [], decodeInventoryItems, "sessionCharacter.inventorySnapshotJson");
  }

  private getAbilityModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }
}

function decodeStartingEquipment(value: unknown): StartingEquipmentDto {
  if (!isRecord(value) || !Array.isArray(value.slots)) {
    throw new Error("starting equipment must contain slots.");
  }
  return {
    slots: value.slots.map((slot) => ({
      options: isRecord(slot) && Array.isArray(slot.options)
        ? slot.options.map((option) => ({
            items: isRecord(option) && Array.isArray(option.items)
              ? option.items.flatMap((item) => {
                  if (!isRecord(item) || typeof item.itemKey !== "string") {
                    return [];
                  }
                  const quantity = readPositiveIntegerProperty(item, "quantity");
                  return quantity === null ? [] : [{ itemKey: item.itemKey, quantity }];
                })
              : [],
          }))
        : [],
    })),
  };
}

function decodeInventoryItems(value: unknown): InventoryItemDto[] {
  if (!Array.isArray(value)) {
    throw new Error("inventory must be an array.");
  }
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") {
      return [];
    }
    const quantity = readPositiveIntegerProperty(item, "quantity");
    if (quantity === null) {
      return [];
    }
    const weightLb = readNonNegativeNumberProperty(item, "weightLb");
    const volumeCuFt = readNonNegativeNumberProperty(item, "volumeCuFt");
    const rangeFt = readNonNegativeNumberProperty(item, "rangeFt");
    const longRangeFt = readNonNegativeNumberProperty(item, "longRangeFt");
    const armorClassBase = readNonNegativeNumberProperty(item, "armorClassBase");
    const armorClassBonus = readFiniteNumberProperty(item, "armorClassBonus");
    const armorStrengthRequirement = readNonNegativeNumberProperty(item, "armorStrengthRequirement");
    return [{
      id: item.id,
      name: item.name,
      quantity,
      ...(typeof item.itemDefinitionId === "string" ? { itemDefinitionId: item.itemDefinitionId } : {}),
      ...(typeof item.itemType === "string" ? { itemType: item.itemType } : {}),
      ...(typeof item.description === "string" ? { description: item.description } : {}),
      ...(weightLb !== undefined ? { weightLb } : {}),
      ...(volumeCuFt !== undefined ? { volumeCuFt } : {}),
      ...(typeof item.damageDice === "string" ? { damageDice: item.damageDice } : {}),
      ...(typeof item.damageType === "string" ? { damageType: item.damageType } : {}),
      ...(rangeFt !== undefined ? { rangeFt } : {}),
      ...(longRangeFt !== undefined ? { longRangeFt } : {}),
      ...(armorClassBase !== undefined ? { armorClassBase } : {}),
      ...(armorClassBonus !== undefined ? { armorClassBonus } : {}),
      ...(armorStrengthRequirement !== undefined ? { armorStrengthRequirement } : {}),
      ...(typeof item.armorStealthDisadvantage === "boolean" ? { armorStealthDisadvantage: item.armorStealthDisadvantage } : {}),
      ...(typeof item.useEffect === "string" ? { useEffect: item.useEffect } : {}),
      ...(Array.isArray(item.packContents) ? { packContents: decodeInventoryPackContents(item.packContents) } : {}),
      ...(Array.isArray(item.properties) ? { properties: decodeOptionalStringArray(item.properties) } : {}),
      ...(typeof item.containerId === "string" ? { containerId: item.containerId } : {}),
      ...(typeof item.displayName === "string" ? { displayName: item.displayName } : {}),
      ...(typeof item.displayTypeLabel === "string" ? { displayTypeLabel: item.displayTypeLabel } : {}),
      ...(typeof item.displayDescription === "string" ? { displayDescription: item.displayDescription } : {}),
      ...(typeof item.displayUseEffect === "string" ? { displayUseEffect: item.displayUseEffect } : {}),
      ...(Array.isArray(item.displayPropertyLabels) ? { displayPropertyLabels: decodeOptionalStringArray(item.displayPropertyLabels) } : {}),
      ...(Array.isArray(item.displayPackContents) ? { displayPackContents: decodeInventoryPackContents(item.displayPackContents) } : {}),
    }];
  });
}

function decodeInventoryPackContents(value: unknown): NonNullable<InventoryItemDto["packContents"]> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.itemId !== "string" || typeof item.name !== "string") {
      return [];
    }
    const quantity = readPositiveIntegerProperty(item, "quantity");
    if (quantity === null) {
      return [];
    }
    return [{
      itemId: item.itemId,
      name: item.name,
      quantity,
      ...(typeof item.displayName === "string" ? { displayName: item.displayName } : {}),
    }];
  });
}

function decodeOptionalStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => (typeof entry === "string" ? [entry] : []));
}

function compactPresentStrings(value: readonly unknown[]): string[] {
  return value.flatMap((entry) => (typeof entry === "string" && entry ? [entry] : []));
}

function readPositiveIntegerProperty(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

function readFiniteNumberProperty(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNonNegativeNumberProperty(record: Record<string, unknown>, key: string): number | undefined {
  const value = readFiniteNumberProperty(record, key);
  return value !== undefined && value >= 0 ? value : undefined;
}
