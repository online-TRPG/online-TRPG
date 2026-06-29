import directlyUsableP3ItemIds from '@trpg/srd-data/generated/srd/fe-usable-items.json';

const directlyUsableP3ItemIdSet = new Set(directlyUsableP3ItemIds);

export function isDirectlyUsableP3Item(
  itemDefinitionId: string | null | undefined
) {
  return Boolean(itemDefinitionId && directlyUsableP3ItemIdSet.has(itemDefinitionId));
}
