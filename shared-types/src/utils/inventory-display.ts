export type InventoryPackContentDisplaySource = {
  itemId?: string;
  id?: string;
  name?: string;
  quantity?: number;
  itemDefinitionId?: string;
  itemType?: string;
  properties?: string[];
};

export type InventoryItemDisplaySource = InventoryPackContentDisplaySource & {
  description?: string | null;
  useEffect?: string | null;
  damageDice?: string;
  damageType?: string;
  packContents?: InventoryPackContentDisplaySource[];
};

export type InventoryItemDisplayFields = {
  displayName: string;
  displayTypeLabel: string;
  displayDescription: string;
  displayUseEffect?: string;
  displayPropertyLabels: string[];
  displayPackContents?: Array<InventoryPackContentDisplaySource & {
    itemId: string;
    name: string;
    quantity: number;
    displayName: string;
  }>;
};

const itemTypeLabelMap = new Map<string, string>([
  ["weapon", "무기"],
  ["armor", "방어구"],
  ["shield", "방패"],
  ["pack", "꾸러미"],
  ["consumable", "소모품"],
  ["tool", "도구"],
  ["currency", "화폐"],
  ["gear", "장비"],
  ["container", "용기"],
  ["magic", "마법 아이템"],
  ["adventuring_gear", "모험 장비"],
  ["adventuring-gear", "모험 장비"],
  ["instrument", "악기"],
  ["musical_instrument", "악기"],
  ["musical-instrument", "악기"],
  ["artisan", "장인 도구"],
  ["artisan_tool", "장인 도구"],
  ["artisan-tool", "장인 도구"],
  ["artisan_tools", "장인 도구"],
  ["artisan-tools", "장인 도구"],
  ["gaming", "게임 도구"],
  ["gaming_set", "게임 도구"],
  ["gaming-set", "게임 도구"],
  ["kit", "키트"],
  ["focus", "주문시전 초점구"],
  ["spellcasting_focus", "주문시전 초점구"],
  ["spellcasting-focus", "주문시전 초점구"],
  ["holy_symbol", "성표"],
  ["holy-symbol", "성표"],
  ["mount", "탈것"],
  ["vehicle", "탈것/운송수단"],
  ["vehicle_land", "육상 운송수단"],
  ["vehicle-land", "육상 운송수단"],
  ["vehicle_water", "수상 운송수단"],
  ["vehicle-water", "수상 운송수단"],
  ["ammunition", "탄약"],
  ["magic_item", "마법 아이템"],
  ["magic-item", "마법 아이템"],
  ["wondrous_item", "기이한 물품"],
  ["wondrous-item", "기이한 물품"],
  ["simple", "단순 무기"],
  ["martial", "군용 무기"],
  ["melee", "근접"],
  ["ranged", "원거리"],
  ["light", "경장 방어구"],
  ["medium", "평장 방어구"],
  ["heavy", "중장 방어구"],
  ["potion", "물약"],
  ["scroll", "두루마리"],
  ["ring", "반지"],
  ["wand", "완드"],
  ["rod", "로드"],
  ["staff", "스태프"],
]);

const itemPropertyLabelMap = new Map<string, string>([
  ["ammunition", "탄약"],
  ["finesse", "기교"],
  ["heavy", "중량"],
  ["light", "경량"],
  ["loading", "장전"],
  ["melee", "근접"],
  ["range", "원거리"],
  ["ranged", "원거리"],
  ["reach", "간격"],
  ["special", "특수"],
  ["thrown", "투척"],
  ["two-handed", "양손"],
  ["two_handed", "양손"],
  ["versatile", "다용도"],
  ["simple", "단순"],
  ["martial", "군용"],
  ["light-armor", "경장 방어구"],
  ["medium-armor", "평장 방어구"],
  ["heavy-armor", "중장 방어구"],
  ["armor-light", "경장 방어구"],
  ["armor-medium", "평장 방어구"],
  ["armor-heavy", "중장 방어구"],
  ["light_armor", "경장 방어구"],
  ["medium_armor", "평장 방어구"],
  ["heavy_armor", "중장 방어구"],
  ["armor_light", "경장 방어구"],
  ["armor_medium", "평장 방어구"],
  ["armor_heavy", "중장 방어구"],
  ["artisan", "장인 도구"],
  ["artisan_tools", "장인 도구"],
  ["artisan-tools", "장인 도구"],
  ["gaming", "게임 도구"],
  ["instrument", "악기"],
  ["musical_instrument", "악기"],
  ["musical-instrument", "악기"],
  ["kit", "키트"],
  ["mount", "탈것"],
  ["vehicle-land", "육상 운송수단"],
  ["vehicle-water", "수상 운송수단"],
  ["vehicle_land", "육상 운송수단"],
  ["vehicle_water", "수상 운송수단"],
  ["weapon", "무기"],
  ["armor", "방어구"],
  ["shield", "방패"],
  ["static-srd", ""],
  ["srd-engine", ""],
]);

const damageTypeLabelMap = new Map<string, string>([
  ["acid", "산성"],
  ["bludgeoning", "타격"],
  ["cold", "냉기"],
  ["fire", "화염"],
  ["force", "역장"],
  ["lightning", "번개"],
  ["necrotic", "사령"],
  ["piercing", "관통"],
  ["poison", "독"],
  ["psychic", "정신"],
  ["radiant", "광휘"],
  ["slashing", "참격"],
  ["thunder", "천둥"],
]);

function normalizeDisplayToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function toTitleCase(value: string) {
  return value.replace(/\b[a-z]/g, (match) => match.toUpperCase());
}

function looksLikeInternalId(value: string) {
  return /^[a-z]+[._-][a-z0-9._-]+$/i.test(value.trim());
}

function looksLikeOpaqueDatabaseId(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    return true;
  }
  return /^[a-z][a-z0-9]{16,}$/i.test(raw);
}

function formatInventoryIdentifierAsName(value: string | null | undefined, fallback = "아이템") {
  return looksLikeOpaqueDatabaseId(value) ? fallback : formatInternalInventoryIdAsName(value, fallback);
}

export function formatInternalInventoryIdAsName(value: string | null | undefined, fallback = "아이템") {
  const raw = value?.trim() ?? "";
  if (!raw) return fallback;
  if (looksLikeOpaqueDatabaseId(raw)) return fallback;
  const tail = raw.split(/[.:]/).filter(Boolean).pop() ?? raw;
  const readable = tail
    .replace(/__+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!readable) return fallback;
  return /[가-힣]/.test(readable) ? readable : toTitleCase(readable);
}

function getDirectLabel(value: string, labelMaps: Array<Map<string, string>>) {
  const normalized = normalizeDisplayToken(value);
  for (const labelMap of labelMaps) {
    const mapped = labelMap.get(normalized) ?? labelMap.get(normalized.replace(/_/g, "-"));
    if (mapped !== undefined) return mapped;
  }
  return null;
}

function formatCompositeInventoryTokens(
  value: string,
  labelMaps: Array<Map<string, string>>,
  fallback: string,
) {
  const directLabel = getDirectLabel(value, labelMaps);
  if (directLabel !== null) return directLabel || null;

  const rawTokens = value
    .split(/[,/|·]+|\s{2,}/)
    .flatMap((token) => token.trim().split(/\s+/))
    .flatMap((token) => {
      const direct = getDirectLabel(token, labelMaps);
      return direct !== null ? [token] : token.split(/[_-]+/);
    })
    .map((token) => token.trim())
    .filter(Boolean);

  if (rawTokens.length <= 1) return null;

  const labels = rawTokens
    .map((token) => getDirectLabel(token, labelMaps) ?? formatInternalInventoryIdAsName(token, fallback))
    .filter(Boolean);

  return labels.length ? Array.from(new Set(labels)).join(" / ") : null;
}

export function getUserFacingInventoryItemTypeLabel(itemType: string | null | undefined) {
  const raw = itemType?.trim() ?? "";
  if (!raw) return "미분류";
  return (
    formatCompositeInventoryTokens(raw, [itemTypeLabelMap, itemPropertyLabelMap], "미분류") ??
    formatInternalInventoryIdAsName(raw, "미분류")
  );
}

export function getUserFacingInventoryItemPropertyLabel(property: string | null | undefined): string {
  const raw = property?.trim() ?? "";
  if (!raw) return "";
  const normalized = normalizeDisplayToken(raw);
  const rangeMatch = normalized.match(/^(thrown|ammunition)_?\(([^)]+)\)$/);
  if (rangeMatch) {
    const base: string = getUserFacingInventoryItemPropertyLabel(rangeMatch[1]);
    return `${base} (${rangeMatch[2]})`;
  }
  return (
    formatCompositeInventoryTokens(raw, [itemPropertyLabelMap, itemTypeLabelMap], raw) ??
    formatInternalInventoryIdAsName(raw, raw)
  );
}

export function getUserFacingInventoryDamageTypeLabel(damageType: string | null | undefined) {
  const raw = damageType?.trim() ?? "";
  if (!raw) return "";
  const normalized = normalizeDisplayToken(raw);
  return damageTypeLabelMap.get(normalized) ?? formatInternalInventoryIdAsName(raw, raw);
}

function getDisplayProperties(item: InventoryItemDisplaySource) {
  return (item.properties ?? [])
    .map((property) => property.trim())
    .filter((property) => Boolean(property))
    .map(getUserFacingInventoryItemPropertyLabel)
    .filter((label) => Boolean(label));
}

function getInventoryItemSearchKey(item: InventoryItemDisplaySource) {
  return [item.itemType, item.name, ...(item.properties ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getUserFacingInventoryItemName(item: InventoryItemDisplaySource, fallback = "아이템") {
  const name = item.name?.trim();
  if (name && !looksLikeInternalId(name) && !looksLikeOpaqueDatabaseId(name)) {
    const categoryLabel = formatCompositeInventoryTokens(name, [itemTypeLabelMap, itemPropertyLabelMap], "");
    if (categoryLabel) {
      const definitionName = item.itemDefinitionId
        ? formatInventoryIdentifierAsName(item.itemDefinitionId, "")
        : "";
      return definitionName || categoryLabel;
    }
    return name;
  }

  if (item.itemDefinitionId?.trim()) {
    const definitionName = formatInventoryIdentifierAsName(item.itemDefinitionId, "");
    if (definitionName) return definitionName;
  }
  if (item.id?.trim()) {
    const idName = formatInventoryIdentifierAsName(item.id, "");
    if (idName) return idName;
  }
  return fallback;
}

export function formatUserFacingInventoryText(text: string | null | undefined) {
  const raw = text?.trim() ?? "";
  if (!raw) return "";

  return raw
    .split(/\r?\n/)
    .map((line) => {
      const categoryMatch = line.match(/^(분류|category)\s*:\s*(.+)$/i);
      if (categoryMatch) {
        return `분류: ${getUserFacingInventoryItemTypeLabel(categoryMatch[2])}`;
      }
      const rarityMatch = line.match(/^(희귀도|rarity)\s*:\s*(.+)$/i);
      if (rarityMatch) {
        return `희귀도: ${formatInternalInventoryIdAsName(rarityMatch[2], rarityMatch[2])}`;
      }
      const rawCategoryLabel = formatCompositeInventoryTokens(line, [itemTypeLabelMap, itemPropertyLabelMap], "");
      return rawCategoryLabel ?? line;
    })
    .join("\n");
}

function buildFallbackDescription(item: InventoryItemDisplaySource, displayName: string, propertyLabels: string[]) {
  const key = getInventoryItemSearchKey(item);
  if (key.includes("potion") || key.includes("healing") || key.includes("포션")) {
    return "마시거나 사용해서 회복 또는 특수 효과를 얻는 소모품입니다.";
  }
  if (item.itemType === "weapon" || item.damageDice) {
    const damage = item.damageDice
      ? `${item.damageDice}${item.damageType ? ` ${getUserFacingInventoryDamageTypeLabel(item.damageType)}` : ""} 피해`
      : "무기 피해";
    const properties = propertyLabels.length ? ` ${propertyLabels.join(", ")} 속성을 가집니다.` : "";
    return `${displayName}은(는) 공격에 사용하는 무기입니다. 명중 시 ${damage}를 줍니다.${properties}`;
  }
  if (item.itemType === "armor" || key.includes("armor") || key.includes("갑옷")) {
    return `${displayName}은(는) 착용자의 방어도를 높이는 방어구입니다.`;
  }
  if (item.itemType === "shield" || key.includes("shield") || key.includes("방패")) {
    return `${displayName}은(는) 한 손에 들어 방어에 사용하는 장비입니다.`;
  }
  if (item.itemType === "pack" || key.includes("pack") || key.includes("꾸러미")) {
    return "탐험에 필요한 여러 소모품과 도구가 들어 있는 장비 꾸러미입니다.";
  }
  if (item.itemType === "tool" || key.includes("tool") || key.includes("kit") || key.includes("도구")) {
    return "특정 작업이나 판정에 활용할 수 있는 도구입니다.";
  }
  if (key.includes("scroll") || key.includes("spell") || key.includes("두루마리")) {
    return "마법 효과나 주문과 관련된 기록물입니다.";
  }
  if (key.includes("key") || key.includes("열쇠")) {
    return "잠긴 문이나 장치를 여는 데 사용할 수 있는 열쇠입니다.";
  }
  if (key.includes("coin") || key.includes("gold") || key.includes("금화")) {
    return "거래와 보상에 사용하는 화폐입니다.";
  }
  return "세션 중 보유하고 사용할 수 있는 아이템입니다.";
}

export function buildInventoryItemDisplayFields(item: InventoryItemDisplaySource): InventoryItemDisplayFields {
  const displayName = getUserFacingInventoryItemName(item);
  const displayTypeLabel = getUserFacingInventoryItemTypeLabel(item.itemType);
  const displayPropertyLabels = getDisplayProperties(item);
  const rawDescription = formatUserFacingInventoryText(item.description);
  const displayDescription =
    rawDescription || buildFallbackDescription(item, displayName, displayPropertyLabels);
  const displayUseEffect = formatUserFacingInventoryText(item.useEffect);
  const displayPackContents = item.packContents?.map((content) => {
    const displayName = getUserFacingInventoryItemName(content);
    const name = content.name?.trim() || displayName;
    return {
      ...content,
      itemId: content.itemId ?? content.id ?? displayName,
      name,
      quantity: content.quantity ?? 1,
      displayName,
    };
  });

  return {
    displayName,
    displayTypeLabel,
    displayDescription,
    displayUseEffect: displayUseEffect || undefined,
    displayPropertyLabels,
    displayPackContents,
  };
}

export function normalizeInventoryItemDisplay<T extends InventoryItemDisplaySource>(
  item: T,
): T & InventoryItemDisplayFields {
  return {
    ...item,
    ...buildInventoryItemDisplayFields(item),
  };
}

export function normalizeInventoryItemsDisplay<T extends InventoryItemDisplaySource>(
  items: T[],
): Array<T & InventoryItemDisplayFields> {
  return items.map((item) => normalizeInventoryItemDisplay(item));
}
