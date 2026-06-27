type ItemNameSource = {
  id?: string | null;
  name?: string | null;
  itemDefinitionId?: string | null;
};

const explicitItemLabelMap = new Map<string, string>([
  ['equipment.potion_of_healing', '치유 물약'],
  ['equipment.healer_s_kit', '치료사의 도구'],
  ['equipment.thieves__tools', '도둑 도구'],
  ['equipment.rope__hempen__50_feet', '삼베 밧줄 50피트'],
  ['equipment.backpack', '배낭'],
  ['equipment.crowbar', '쇠지렛대'],
  ['equipment.torch', '횃불'],
  ['equipment.acid__vial', '산성액 병'],
  ['equipment.alchemist_s_fire__flask', '연금술사의 불꽃 병'],
  ['equipment.antitoxin__vial', '해독제 병'],
  ['equipment.ball_bearings__bag_of_1_000', '쇠구슬 주머니'],
  ['equipment.caltrops__bag_of_20', '마름쇠 주머니'],
  ['equipment.holy_water__flask', '성수 병'],
  ['equipment.oil__flask', '기름 병'],
  ['equipment.poison__basic__vial', '기본 독 병'],
]);

export function looksLikeFrontendInternalId(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  return /^[a-z][a-z0-9_-]*(?:[.:][a-z0-9가-힣_-]+|__+[a-z0-9가-힣_-]+)+$/i.test(
    normalized
  );
}

function looksLikeOpaqueDatabaseId(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  if (!normalized) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    return true;
  }
  return /^[a-z][a-z0-9]{16,}$/i.test(normalized);
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatInternalIdAsReadableName(
  value: string | null | undefined,
  fallback = '항목'
) {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  if (looksLikeOpaqueDatabaseId(normalized)) return fallback;

  const explicitLabel = explicitItemLabelMap.get(normalized);
  if (explicitLabel) return explicitLabel;

  const tail = normalized.split(/[.:]/).filter(Boolean).at(-1) ?? normalized;
  const readable = tail
    .replace(/__+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!readable) return fallback;
  return /[가-힣]/.test(readable) ? readable : toTitleCase(readable);
}

export function getUserFacingItemName(item: ItemNameSource, fallback = '아이템') {
  const name = item.name?.trim();
  if (name && !looksLikeFrontendInternalId(name) && !looksLikeOpaqueDatabaseId(name)) {
    const normalizedName = normalizeDisplayToken(name);
    if (
      itemTypeLabelMap.has(normalizedName) ||
      itemTypeLabelMap.has(normalizedName.replace(/_/g, '-')) ||
      itemPropertyLabelMap.has(normalizedName) ||
      itemPropertyLabelMap.has(normalizedName.replace(/_/g, '-')) ||
      damageTypeLabelMap.has(normalizedName)
    ) {
      const definitionName = item.itemDefinitionId
        ? formatInternalIdAsReadableName(item.itemDefinitionId, '')
        : '';
      return definitionName || getUserFacingItemPropertyLabel(name) || getUserFacingItemTypeLabel(name);
    }
    return name;
  }

  const itemDefinitionId = item.itemDefinitionId?.trim();
  if (itemDefinitionId) {
    const definitionName = formatInternalIdAsReadableName(itemDefinitionId, '');
    if (definitionName) return definitionName;
  }

  const id = item.id?.trim();
  if (id && looksLikeFrontendInternalId(id)) {
    const idName = formatInternalIdAsReadableName(id, '');
    if (idName) return idName;
  }
  return id && !looksLikeOpaqueDatabaseId(id) ? id : fallback;
}

const itemTypeLabelMap = new Map<string, string>([
  ['weapon', '무기'],
  ['armor', '방어구'],
  ['shield', '방패'],
  ['pack', '꾸러미'],
  ['consumable', '소모품'],
  ['tool', '도구'],
  ['currency', '화폐'],
  ['gear', '장비'],
  ['adventuring_gear', '모험 장비'],
  ['adventuring-gear', '모험 장비'],
  ['instrument', '악기'],
  ['musical_instrument', '악기'],
  ['musical-instrument', '악기'],
  ['artisan', '장인 도구'],
  ['artisan_tool', '장인 도구'],
  ['artisan-tool', '장인 도구'],
  ['gaming', '게임 도구'],
  ['gaming_set', '게임 도구'],
  ['gaming-set', '게임 도구'],
  ['kit', '키트'],
  ['focus', '주문시전 초점구'],
  ['spellcasting_focus', '주문시전 초점구'],
  ['spellcasting-focus', '주문시전 초점구'],
  ['holy_symbol', '성표'],
  ['holy-symbol', '성표'],
  ['mount', '탈것'],
  ['vehicle', '탈것/운송수단'],
  ['vehicle_land', '육상 운송수단'],
  ['vehicle-land', '육상 운송수단'],
  ['vehicle_water', '수상 운송수단'],
  ['vehicle-water', '수상 운송수단'],
  ['ammunition', '탄약'],
  ['magic_item', '마법 아이템'],
  ['magic-item', '마법 아이템'],
  ['wondrous_item', '기이한 물품'],
  ['wondrous-item', '기이한 물품'],
  ['simple', '단순 무기'],
  ['martial', '군용 무기'],
  ['light', '경장 방어구'],
  ['medium', '평장 방어구'],
  ['heavy', '중장 방어구'],
  ['armor_heavy', '중장 방어구'],
  ['armor-heavy', '중장 방어구'],
  ['potion', '물약'],
  ['scroll', '두루마리'],
  ['ring', '반지'],
  ['wand', '완드'],
  ['rod', '로드'],
  ['staff', '스태프'],
]);

const itemPropertyLabelMap = new Map<string, string>([
  ['ammunition', '탄약'],
  ['finesse', '기교'],
  ['heavy', '중량'],
  ['light', '경량'],
  ['loading', '장전'],
  ['melee', '근접'],
  ['range', '원거리'],
  ['ranged', '원거리'],
  ['reach', '간격'],
  ['special', '특수'],
  ['thrown', '투척'],
  ['two-handed', '양손'],
  ['two_handed', '양손'],
  ['versatile', '다용도'],
  ['simple', '단순'],
  ['martial', '군용'],
  ['light-armor', '경장 방어구'],
  ['medium-armor', '평장 방어구'],
  ['heavy-armor', '중장 방어구'],
  ['light_armor', '경장 방어구'],
  ['medium_armor', '평장 방어구'],
  ['heavy_armor', '중장 방어구'],
  ['armor-light', '경장 방어구'],
  ['armor-medium', '평장 방어구'],
  ['armor-heavy', '중장 방어구'],
  ['armor_light', '경장 방어구'],
  ['armor_medium', '평장 방어구'],
  ['armor_heavy', '중장 방어구'],
  ['artisan', '장인 도구'],
  ['gaming', '게임 도구'],
  ['instrument', '악기'],
  ['kit', '키트'],
  ['mount', '탈것'],
  ['vehicle-land', '육상 운송수단'],
  ['vehicle-water', '수상 운송수단'],
  ['vehicle_land', '육상 운송수단'],
  ['vehicle_water', '수상 운송수단'],
  ['weapon', '무기'],
  ['armor', '방어구'],
  ['shield', '방패'],
  ['static-srd', ''],
  ['static_srd', ''],
  ['srd-engine', ''],
  ['srd_engine', ''],
]);

const damageTypeLabelMap = new Map<string, string>([
  ['acid', '산성'],
  ['bludgeoning', '타격'],
  ['cold', '냉기'],
  ['fire', '화염'],
  ['force', '역장'],
  ['lightning', '번개'],
  ['necrotic', '사령'],
  ['piercing', '관통'],
  ['poison', '독'],
  ['psychic', '정신'],
  ['radiant', '광휘'],
  ['slashing', '참격'],
  ['thunder', '천둥'],
]);

function normalizeDisplayToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function formatCompositeDisplayTokens(
  value: string,
  labelMaps: Array<Map<string, string>>,
  fallback: string
) {
  const rawTokens = value
    .split(/[,/|·]+|\s{2,}/)
    .flatMap((token) => token.trim().split(/\s+/))
    .map((token) => token.trim())
    .filter(Boolean);

  if (rawTokens.length <= 1) return null;

  const labels = rawTokens.map((token) => {
    const normalized = normalizeDisplayToken(token);
    for (const labelMap of labelMaps) {
      const mapped =
        labelMap.get(normalized) ??
        labelMap.get(normalized.replace(/_/g, '-'));
      if (mapped) return mapped;
    }
    return formatInternalIdAsReadableName(normalized, fallback);
  });

  return Array.from(new Set(labels)).join(' / ');
}

export function getUserFacingItemTypeLabel(itemType: string | null | undefined) {
  const raw = itemType?.trim() ?? '';
  const normalized = normalizeDisplayToken(itemType ?? '');
  if (!normalized) return '미분류';
  const directLabel =
    itemTypeLabelMap.get(normalized) ??
    itemTypeLabelMap.get(normalized.replace(/_/g, '-'));
  if (directLabel) return directLabel;
  const compositeLabel = formatCompositeDisplayTokens(
    raw,
    [itemTypeLabelMap, itemPropertyLabelMap],
    '미분류'
  );
  if (compositeLabel) return compositeLabel;
  return (
    formatInternalIdAsReadableName(normalized, '미분류')
  );
}

export function getUserFacingItemPropertyLabel(property: string | null | undefined): string {
  const raw = property?.trim() ?? '';
  const normalized = normalizeDisplayToken(property ?? '');
  if (!normalized) return '';
  const rangeMatch = normalized.match(/^(thrown|ammunition)_?\(([^)]+)\)$/);
  if (rangeMatch) {
    const base: string = getUserFacingItemPropertyLabel(rangeMatch[1]);
    return `${base} (${rangeMatch[2]})`;
  }
  const directLabel =
    itemPropertyLabelMap.get(normalized) ??
    itemPropertyLabelMap.get(normalized.replace(/_/g, '-'));
  if (directLabel) return directLabel;
  const compositeLabel = formatCompositeDisplayTokens(
    raw,
    [itemPropertyLabelMap, itemTypeLabelMap],
    property ?? ''
  );
  if (compositeLabel) return compositeLabel;
  return (
    formatInternalIdAsReadableName(normalized, property ?? '')
  );
}

export function getUserFacingDamageTypeLabel(damageType: string | null | undefined) {
  const normalized = normalizeDisplayToken(damageType ?? '');
  if (!normalized) return '';
  return (
    damageTypeLabelMap.get(normalized) ??
    formatInternalIdAsReadableName(normalized, damageType ?? '')
  );
}
