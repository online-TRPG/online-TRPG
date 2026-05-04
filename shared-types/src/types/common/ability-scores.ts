export type AbilityScores = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

export type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  itemDefinitionId?: string;
  itemType?: string;
  weightLb?: number;
  volumeCuFt?: number;
  damageDice?: string;
  damageType?: string;
  properties?: string[];
  containerId?: string;
};
