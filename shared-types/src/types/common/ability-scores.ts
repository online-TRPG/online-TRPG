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
  description?: string;
  weightLb?: number;
  volumeCuFt?: number;
  damageDice?: string;
  damageType?: string;
  armorClassBase?: number;
  armorClassBonus?: number;
  armorStrengthRequirement?: number;
  armorStealthDisadvantage?: boolean;
  useEffect?: string;
  packContents?: Array<{
    itemId: string;
    name: string;
    quantity: number;
  }>;
  properties?: string[];
  containerId?: string;
};
