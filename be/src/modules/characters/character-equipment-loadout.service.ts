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
import { normalizeSrdCharacterClassKey } from "@trpg/srd-data/rules";
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

    const startingEquipment = JSON.parse(klass.startingEquipmentJson) as StartingEquipmentDto;
    const slots = startingEquipment.slots;

    if (!Array.isArray(params.selection) || params.selection.length !== slots.length) {
      throw new BadRequestException(
        `시작 장비: ${slots.length}개 슬롯 모두에 옵션 인덱스를 보내야 합니다. (받은 길이: ${params.selection?.length ?? 0})`,
      );
    }

    const inventory: InventoryItemDto[] = [];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex]!;
      const optionIndex = params.selection[slotIndex]!;
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= slot.options.length) {
        throw new BadRequestException(
          `시작 장비: 슬롯 ${slotIndex} 의 옵션 인덱스 ${optionIndex} 가 유효 범위(0..${slot.options.length - 1})를 벗어났습니다.`,
        );
      }
      const option = slot.options[optionIndex]!;
      for (let itemIndex = 0; itemIndex < option.items.length; itemIndex++) {
        const item = option.items[itemIndex]!;
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
      .map((item) => this.calculateArmorItemAc(item, dexMod))
      .filter((value): value is number => value !== null);

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
      .map((item) => item.itemDefinitionId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
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
    return [item.id, item.itemDefinitionId, item.name, item.itemType]
      .filter((value): value is string => Boolean(value))
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
    if (matchedKey) return profiles[matchedKey]!;

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
    if (!value) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((entry): entry is string => typeof entry === "string")
        : [];
    } catch {
      return [];
    }
  }

  private parseInventoryItemsJson(value: string | null | undefined): InventoryItemDto[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as InventoryItemDto[]) : [];
    } catch {
      return [];
    }
  }

  private getAbilityModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }
}
