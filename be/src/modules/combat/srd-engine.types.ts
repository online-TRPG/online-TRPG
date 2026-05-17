export type SrdEngineActionConfidence = "high" | "medium" | "low" | "none";

export interface SrdEngineDamageEntry {
  average?: number;
  dice?: string;
  type?: string;
  raw?: string;
}

export interface SrdEngineCombatParsedAction {
  isAttack?: boolean;
  attackKind?: string | null;
  attackRoll?: {
    toHit?: number;
    raw?: string;
  } | null;
  range?: {
    reachFt?: number;
    rangeFt?: {
      normal?: number;
      long?: number;
    };
  };
  damage?: SrdEngineDamageEntry[];
  confidence?: SrdEngineActionConfidence;
}

export interface SrdEngineMonsterAction {
  id: string;
  nameEn?: string;
  rawName?: string;
  rawText?: string;
  combatParsed?: SrdEngineCombatParsedAction;
}

export interface SrdEngineMonsterProfile {
  id: string;
  type: "monster";
  schemaVersion: string;
  name: {
    en: string;
    ko?: string | null;
    aliases?: string[];
  };
  statBlock?: {
    armorClass?: {
      value?: number;
      raw?: string;
    };
    hitPoints?: {
      average?: number;
      formula?: string;
      raw?: string;
    };
    speed?: {
      modes?: Record<string, { ft?: number }>;
      raw?: string;
    };
  };
  features?: {
    actions?: SrdEngineMonsterAction[];
  };
}

export interface SrdEngineMonsterCombatStats {
  currentHp: number;
  maxHp: number;
  armorClass: number;
  speedFt: number;
}

export interface SrdEngineExecutableMonsterAction {
  monsterId: string;
  actionId: string;
  label: string;
  attackKind: string;
  attackBonus: number;
  damageDice: string;
  damageType: string | null;
  reachFt: number | null;
  rangeFt: {
    normal: number | null;
    long: number | null;
  } | null;
  confidence: SrdEngineActionConfidence;
}
