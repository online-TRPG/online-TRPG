import {
  decodeStringArray,
  parseJsonOrThrow,
} from "../../common/utils/json-runtime";

export const P3_ITEM_RUNTIME_FLAGS_KEY = "p3ItemRuntime";

export type P3ItemRuntimeFlags = {
  attunedItemEntryIdsByCharacter: Record<string, string[]>;
  chargesByItemEntryId: Record<string, number>;
};

type InventoryItemSearchSource = {
  id: string;
  name: string;
  itemType: string;
  propertiesJson: string | null;
};

type MapPoint = { x: number; y: number };
type MapToken = MapPoint & {
  id: string;
  sessionCharacterId?: string | null;
  size?: number;
};
type ParticipantTarget = {
  id: string;
  tokenId: string | null;
  sessionCharacterId: string | null;
};
type RadiusParticipant = ParticipantTarget & {
  currentHp: number | null;
  isAlive: boolean;
};
type ItemSpellBaseLogParams = {
  itemEntryId: string;
  itemDefinitionId: string;
  spellId: string;
  remainingCharges: number | null;
};
type ItemUseBaseLogParams = {
  itemEntryId: string;
  itemDefinitionId: string;
  itemName: string;
};
type TerrainCellMapBounds = {
  gridSize: number;
  width: number;
  height: number;
};
type ItemEffectForPolicy =
  | { type: "temporary_hp"; amount: number }
  | { type: "condition"; tags: string[]; durationRounds: number }
  | { type: "utility"; tags: string[] }
  | { type: "tool"; checkTag: string }
  | { type: "spell"; spellId: string; slotLevel: number }
  | { type: "terrain"; terrainEffectId: string; sizeFt: number };

export function parseP3ItemRuntimeFlags(value: unknown): P3ItemRuntimeFlags {
  if (!isRuntimeRecord(value)) {
    return {
      attunedItemEntryIdsByCharacter: {},
      chargesByItemEntryId: {},
    };
  }

  const attuned =
    isRuntimeRecord(value.attunedItemEntryIdsByCharacter)
      ? Object.fromEntries(
          Object.entries(value.attunedItemEntryIdsByCharacter).map(([characterId, entryIds]) => [
            characterId,
            Array.isArray(entryIds)
              ? entryIds.flatMap((entryId) => typeof entryId === "string" ? [entryId] : [])
              : [],
          ]),
        )
      : {};
  const charges =
    isRuntimeRecord(value.chargesByItemEntryId)
      ? Object.fromEntries(
          Object.entries(value.chargesByItemEntryId).flatMap(([entryId, charge]) =>
            typeof charge === "number" &&
            Number.isInteger(charge) &&
            charge >= 0
              ? [[entryId, charge]]
              : [],
          ),
        )
      : {};

  return {
    attunedItemEntryIdsByCharacter: attuned,
    chargesByItemEntryId: charges,
  };
}

export function parseP3ItemRuntimeFlagsFromFlags(flags: unknown): P3ItemRuntimeFlags {
  if (!isRuntimeRecord(flags)) {
    return parseP3ItemRuntimeFlags(null);
  }
  return parseP3ItemRuntimeFlags(flags[P3_ITEM_RUNTIME_FLAGS_KEY]);
}

function isRuntimeRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getAttunedItemEntryIds(
  itemRuntime: P3ItemRuntimeFlags,
  sessionCharacterId: string,
): string[] {
  return itemRuntime.attunedItemEntryIdsByCharacter[sessionCharacterId] ?? [];
}

export function addAttunedItemEntry(params: {
  itemRuntime: P3ItemRuntimeFlags;
  sessionCharacterId: string;
  itemEntryId: string;
}): P3ItemRuntimeFlags {
  const attunedEntryIds = getAttunedItemEntryIds(
    params.itemRuntime,
    params.sessionCharacterId,
  );

  return {
    ...params.itemRuntime,
    attunedItemEntryIdsByCharacter: {
      ...params.itemRuntime.attunedItemEntryIdsByCharacter,
      [params.sessionCharacterId]: [...attunedEntryIds, params.itemEntryId],
    },
  };
}

export function resolveItemChargeUsage(params: {
  itemRuntime: P3ItemRuntimeFlags;
  itemEntryId: string;
  maxCharges: number;
}): {
  remainingChargesBeforeUse: number;
  remainingChargesAfterUse: number;
  itemRuntime: P3ItemRuntimeFlags;
} {
  const remainingChargesBeforeUse =
    params.itemRuntime.chargesByItemEntryId[params.itemEntryId] ??
    params.maxCharges;
  const remainingChargesAfterUse = Math.max(0, remainingChargesBeforeUse - 1);

  return {
    remainingChargesBeforeUse,
    remainingChargesAfterUse,
    itemRuntime: {
      ...params.itemRuntime,
      chargesByItemEntryId: {
        ...params.itemRuntime.chargesByItemEntryId,
        [params.itemEntryId]: remainingChargesAfterUse,
      },
    },
  };
}

export function buildItemSearchKey(item: InventoryItemSearchSource): string {
  const properties = parseStringArrayJson(item.propertiesJson);
  return [item.id, item.name, item.itemType, ...properties]
    .filter((value) => value.length > 0)
    .join(" ")
    .toLowerCase();
}

export function isPackLikeInventoryItem(item: InventoryItemSearchSource): boolean {
  const key = buildItemSearchKey(item);
  return item.itemType === "pack" || key.includes("꾸러미");
}

export function resolveFallbackHealingAmount(
  item: InventoryItemSearchSource,
): number | null {
  const key = buildItemSearchKey(item);
  return key.includes("healing") || key.includes("치유") ? 7 : null;
}

export function isBackendUsableInventoryItem(
  item: InventoryItemSearchSource,
  executableItem: {
    interaction: "use" | "tool" | string;
  } | null,
): boolean {
  if (
    executableItem &&
    (executableItem.interaction === "use" ||
      executableItem.interaction === "tool")
  ) {
    return true;
  }
  const key = buildItemSearchKey(item);
  return (
    key.includes("consumable") ||
    key.includes("potion") ||
    key.includes("포션") ||
    key.includes("healing") ||
    isPackLikeInventoryItem(item)
  );
}

export function resolveMapDistanceFt(
  gridSize: number,
  from: MapPoint,
  to: MapPoint,
): number {
  const dx = Math.abs(from.x - to.x) / gridSize;
  const dy = Math.abs(from.y - to.y) / gridSize;
  return Math.max(dx, dy) * 5;
}

export function findParticipantMapToken(
  tokens: MapToken[],
  participant: ParticipantTarget,
  options: { allowEmptySessionCharacterMatch?: boolean } = {},
): MapToken | null {
  return (
    tokens.find(
      (token) =>
        token.id === participant.tokenId ||
        ((options.allowEmptySessionCharacterMatch ||
          Boolean(token.sessionCharacterId)) &&
          token.sessionCharacterId === participant.sessionCharacterId),
    ) ?? null
  );
}

export function findSessionCharacterMapToken(
  tokens: MapToken[],
  sessionCharacterId: string,
): MapToken | null {
  return (
    tokens.find((token) => token.sessionCharacterId === sessionCharacterId) ??
    null
  );
}

export function findParticipantsInItemRadius(params: {
  map: {
    gridSize: number;
    tokens: MapToken[];
  };
  combatParticipants: RadiusParticipant[];
  point: MapPoint;
  radiusFt: number;
}): RadiusParticipant[] {
  return params.combatParticipants.filter((participant) => {
    if (!participant.isAlive || (participant.currentHp ?? 0) <= 0) {
      return false;
    }
    const token = findParticipantMapToken(params.map.tokens, participant, {
      allowEmptySessionCharacterMatch: false,
    });
    if (!token) {
      return false;
    }
    return (
      resolveMapDistanceFt(params.map.gridSize, params.point, token) <=
      params.radiusFt
    );
  });
}

export function buildPointItemTerrainCell(params: {
  map: TerrainCellMapBounds;
  point: MapPoint;
  itemEntryId: string;
  itemName: string;
  terrainEffectId: string;
  sizeFt: number;
  nowMs?: number;
}) {
  const sizePx = resolveTerrainSizePx(params.map.gridSize, params.sizeFt);

  return {
    id: `item-spell-terrain:${params.itemEntryId}:${params.nowMs ?? Date.now()}`,
    x: clampTerrainCoordinate(
      Math.floor(params.point.x - sizePx / 2),
      params.map.width,
      sizePx,
    ),
    y: clampTerrainCoordinate(
      Math.floor(params.point.y - sizePx / 2),
      params.map.height,
      sizePx,
    ),
    width: sizePx,
    height: sizePx,
    name: params.itemName,
    description: `${params.itemName}으로 생성된 주문 지형 효과`,
    terrainEffectId: params.terrainEffectId,
  };
}

export function buildTokenItemTerrainCell(params: {
  map: TerrainCellMapBounds;
  token: MapPoint & { size: number };
  itemEntryId: string;
  itemName: string;
  terrainEffectId: string;
  sizeFt: number;
  nowMs?: number;
}) {
  const sizePx = resolveTerrainSizePx(params.map.gridSize, params.sizeFt);

  return {
    id: `item-terrain:${params.itemEntryId}:${params.nowMs ?? Date.now()}`,
    x: clampTerrainCoordinate(
      Math.floor(params.token.x - (sizePx - params.token.size) / 2),
      params.map.width,
      sizePx,
    ),
    y: clampTerrainCoordinate(
      Math.floor(params.token.y - (sizePx - params.token.size) / 2),
      params.map.height,
      sizePx,
    ),
    width: sizePx,
    height: sizePx,
    name: params.itemName,
    description: `${params.itemName}으로 생성된 지형 효과`,
    terrainEffectId: params.terrainEffectId,
  };
}

export function resolveTemporaryHpEffect(params: {
  currentTempHp: number;
  amount: number;
}) {
  return {
    tempHp: Math.max(params.currentTempHp, params.amount),
    message: `임시 HP ${params.amount}을 얻었습니다.`,
  };
}

export function buildItemConditionEffectMetadata(
  effect: Extract<
    ItemEffectForPolicy,
    { type: "condition" | "utility" | "tool" | "spell" }
  >,
) {
  return {
    tags: resolveItemConditionTags(effect),
    durationRounds: effect.type === "condition" ? effect.durationRounds : 10,
    message:
      effect.type === "spell"
        ? `${effect.spellId} 효과가 발동했습니다.`
        : "아이템 효과가 적용되었습니다.",
  };
}

export function buildTerrainItemEffectMessage(
  effect: Extract<ItemEffectForPolicy, { type: "terrain" }>,
): string {
  return `${effect.sizeFt}ft 범위에 ${effect.terrainEffectId} 지형을 배치했습니다.`;
}

export function buildMagicMissileItemSpellLogModel(
  params: ItemSpellBaseLogParams & {
    actorName: string;
    itemName: string;
    targetId: string;
    targetName: string;
    damage: number;
  },
) {
  return {
    message: `${params.actorName}이(가) ${params.itemName}으로 ${params.targetName}에게 마법 미사일을 발사해 ${params.damage} 피해를 줬습니다.`,
    structuredAction: {
      type: "item_spell" as const,
      itemEntryId: params.itemEntryId,
      itemDefinitionId: params.itemDefinitionId,
      spellId: params.spellId,
      targetParticipantIds: [params.targetId],
      remainingCharges: params.remainingCharges,
    },
    stateDiff: {
      damagedParticipants: [
        {
          participantId: params.targetId,
          damage: params.damage,
        },
      ],
    },
  };
}

export function buildItemAttunementLogModel(
  params: ItemUseBaseLogParams & {
    characterName: string;
    attunedCount: number;
  },
) {
  return {
    message: `${params.characterName}이(가) ${params.itemName}에 조율했습니다. 다시 사용하면 효과가 발동합니다.`,
    structuredAction: {
      type: "item_attunement" as const,
      itemEntryId: params.itemEntryId,
      itemDefinitionId: params.itemDefinitionId,
      attunedCount: params.attunedCount,
    },
  };
}

export function buildInventoryItemUseLogModel(
  params: ItemUseBaseLogParams & {
    characterName: string;
    healedHp: number | null;
    effectMessage: string | null;
    consumeOnUse: boolean;
    actionCost: "action" | "bonus_action" | "none";
    effect: unknown;
    remainingCharges: number | null;
  },
) {
  return {
    message:
      params.healedHp && params.healedHp > 0
        ? `${params.characterName}이(가) ${params.itemName}을(를) 사용해 HP를 ${params.healedHp} 회복했습니다.`
        : params.effectMessage
          ? `${params.characterName}이(가) ${params.itemName}을(를) 사용했습니다. ${params.effectMessage}`
          : `${params.characterName}이(가) ${params.itemName}을(를) 사용했습니다.`,
    structuredAction: {
      type: "item_use" as const,
      itemEntryId: params.itemEntryId,
      itemDefinitionId: params.itemDefinitionId,
      consumeOnUse: params.consumeOnUse,
      actionCost: params.actionCost,
      effect: params.effect,
      remainingCharges: params.remainingCharges,
    },
  };
}

export function buildFireballItemSpellLogModel(
  params: ItemSpellBaseLogParams & {
    actorName: string;
    itemName: string;
    point: MapPoint;
    targetIds: string[];
    damage: number;
  },
) {
  return {
    message:
      params.targetIds.length > 0
        ? `${params.actorName}이(가) ${params.itemName}으로 화염구를 폭발시켜 ${params.targetIds.length}명에게 ${params.damage} 화염 피해를 줬습니다.`
        : `${params.actorName}이(가) ${params.itemName}으로 화염구를 폭발시켰지만 범위 안의 대상은 없었습니다.`,
    structuredAction: {
      type: "item_spell" as const,
      itemEntryId: params.itemEntryId,
      itemDefinitionId: params.itemDefinitionId,
      spellId: params.spellId,
      point: params.point,
      targetParticipantIds: params.targetIds,
      remainingCharges: params.remainingCharges,
    },
    stateDiff: {
      damagedParticipants: params.targetIds.map((participantId) => ({
        participantId,
        damage: params.damage,
      })),
    },
  };
}

export function buildWebItemSpellLogModel(
  params: ItemSpellBaseLogParams & {
    actorName: string;
    itemName: string;
    point: MapPoint;
    terrainEffectId: string;
    sizeFt: number;
  },
) {
  return {
    message: `${params.actorName}이(가) ${params.itemName}으로 선택한 지점에 거미줄 영역을 펼쳤습니다.`,
    structuredAction: {
      type: "item_spell" as const,
      itemEntryId: params.itemEntryId,
      itemDefinitionId: params.itemDefinitionId,
      spellId: params.spellId,
      point: params.point,
      terrainEffectId: params.terrainEffectId,
      remainingCharges: params.remainingCharges,
    },
    stateDiff: {
      terrainEffectId: params.terrainEffectId,
      point: params.point,
      sizeFt: params.sizeFt,
    },
  };
}

function parseStringArrayJson(value: string | null): string[] {
  return parseJsonOrThrow(value, [], decodeStringArray, "itemDefinition.propertiesJson");
}

function resolveTerrainSizePx(gridSize: number, sizeFt: number): number {
  return Math.max(gridSize, (sizeFt / 5) * gridSize);
}

function clampTerrainCoordinate(
  coordinate: number,
  mapSize: number,
  terrainSize: number,
): number {
  return Math.max(0, Math.min(mapSize - terrainSize, coordinate));
}

function resolveItemConditionTags(
  effect: Extract<
    ItemEffectForPolicy,
    { type: "condition" | "utility" | "tool" | "spell" }
  >,
): string[] {
  if (effect.type === "condition" || effect.type === "utility") {
    return effect.tags;
  }
  if (effect.type === "tool") {
    return [effect.checkTag];
  }
  return [
    `item_spell:${effect.spellId}`,
    `item_spell_slot_level:${effect.slotLevel}`,
  ];
}
