import { Injectable } from "@nestjs/common";

export type ItemInteractionPoint = {
  x: number;
  y: number;
};

export type ItemInteractionEntry = {
  entryId: string;
  itemDefinitionId: string;
  name: string;
  quantity: number;
  weightLb?: number | null;
  damageDice?: string | null;
  damageType?: string | null;
  properties?: string[] | null;
};

export type ItemDropInput = {
  item: ItemInteractionEntry;
  quantity: number;
  actorPoint: ItemInteractionPoint;
  dropPoint: ItemInteractionPoint;
  maxInteractionDistanceFt?: number;
};

export type ItemPickupInput = {
  objectId: string;
  itemDefinitionId: string;
  quantity: number;
  actorPoint: ItemInteractionPoint;
  objectPoint: ItemInteractionPoint;
  maxInteractionDistanceFt?: number;
  containerCapacityRemaining?: number | null;
};

export type ItemThrowInput = {
  item: ItemInteractionEntry;
  quantity: number;
  actorPoint: ItemInteractionPoint;
  targetPoint: ItemInteractionPoint;
  strengthModifier: number;
  dexterityModifier: number;
  proficiencyBonus: number;
  proficient?: boolean;
};

export type ItemInteractionResolution =
  | {
      type: "drop";
      accepted: true;
      entryId: string;
      removeQuantity: number;
      createObject: {
        itemDefinitionId: string;
        name: string;
        quantity: number;
        point: ItemInteractionPoint;
      };
      distanceFt: number;
    }
  | {
      type: "pickup";
      accepted: true;
      objectId: string;
      itemDefinitionId: string;
      quantity: number;
      distanceFt: number;
      removeObject: boolean;
    }
  | {
      type: "throw";
      accepted: true;
      entryId: string;
      removeQuantity: number;
      attack: {
        kind: "thrown_weapon" | "improvised_thrown";
        ability: "str" | "dex";
        attackBonus: number;
        normalRangeFt: number;
        longRangeFt: number;
        inNormalRange: boolean;
        inLongRange: boolean;
        damageDice: string;
        damageType: string;
      };
      missObject: {
        itemDefinitionId: string;
        name: string;
        quantity: number;
        point: ItemInteractionPoint;
      };
      distanceFt: number;
    };

export type ItemInteractionRejection = {
  accepted: false;
  rejectedReason:
    | "invalid_quantity"
    | "insufficient_quantity"
    | "out_of_interaction_range"
    | "container_capacity_exceeded"
    | "out_of_throw_range";
  distanceFt?: number;
};

const FEET_PER_GRID = 5;
const DEFAULT_INTERACTION_DISTANCE_FT = 5;
const IMPROVISED_THROW_NORMAL_RANGE_FT = 20;
const IMPROVISED_THROW_LONG_RANGE_FT = 60;

@Injectable()
export class ItemInteractionService {
  resolveDrop(input: ItemDropInput): ItemInteractionResolution | ItemInteractionRejection {
    const quantity = this.normalizeQuantity(input.quantity);
    if (quantity === null) {
      return { accepted: false, rejectedReason: "invalid_quantity" };
    }
    if (quantity > input.item.quantity) {
      return { accepted: false, rejectedReason: "insufficient_quantity" };
    }

    const distanceFt = this.distanceFt(input.actorPoint, input.dropPoint);
    if (distanceFt > (input.maxInteractionDistanceFt ?? DEFAULT_INTERACTION_DISTANCE_FT)) {
      return { accepted: false, rejectedReason: "out_of_interaction_range", distanceFt };
    }

    return {
      type: "drop",
      accepted: true,
      entryId: input.item.entryId,
      removeQuantity: quantity,
      createObject: {
        itemDefinitionId: input.item.itemDefinitionId,
        name: input.item.name,
        quantity,
        point: input.dropPoint,
      },
      distanceFt,
    };
  }

  resolvePickup(input: ItemPickupInput): ItemInteractionResolution | ItemInteractionRejection {
    const quantity = this.normalizeQuantity(input.quantity);
    if (quantity === null) {
      return { accepted: false, rejectedReason: "invalid_quantity" };
    }

    const distanceFt = this.distanceFt(input.actorPoint, input.objectPoint);
    if (distanceFt > (input.maxInteractionDistanceFt ?? DEFAULT_INTERACTION_DISTANCE_FT)) {
      return { accepted: false, rejectedReason: "out_of_interaction_range", distanceFt };
    }
    if (input.containerCapacityRemaining !== null && input.containerCapacityRemaining !== undefined) {
      if (!Number.isInteger(input.containerCapacityRemaining) || input.containerCapacityRemaining < quantity) {
        return { accepted: false, rejectedReason: "container_capacity_exceeded", distanceFt };
      }
    }

    return {
      type: "pickup",
      accepted: true,
      objectId: input.objectId,
      itemDefinitionId: input.itemDefinitionId,
      quantity,
      distanceFt,
      removeObject: true,
    };
  }

  resolveThrow(input: ItemThrowInput): ItemInteractionResolution | ItemInteractionRejection {
    const quantity = this.normalizeQuantity(input.quantity);
    if (quantity === null) {
      return { accepted: false, rejectedReason: "invalid_quantity" };
    }
    if (quantity > input.item.quantity) {
      return { accepted: false, rejectedReason: "insufficient_quantity" };
    }

    const distanceFt = this.distanceFt(input.actorPoint, input.targetPoint);
    const thrown = this.hasProperty(input.item, "thrown");
    const normalRangeFt = thrown ? this.resolveThrownNormalRange(input.item) : IMPROVISED_THROW_NORMAL_RANGE_FT;
    const longRangeFt = thrown ? this.resolveThrownLongRange(input.item, normalRangeFt) : IMPROVISED_THROW_LONG_RANGE_FT;
    if (distanceFt > longRangeFt) {
      return { accepted: false, rejectedReason: "out_of_throw_range", distanceFt };
    }

    const ability = thrown && this.hasProperty(input.item, "finesse")
      ? (input.dexterityModifier >= input.strengthModifier ? "dex" : "str")
      : "str";
    const abilityModifier = ability === "dex" ? input.dexterityModifier : input.strengthModifier;
    const attackBonus = abilityModifier + (input.proficient ? input.proficiencyBonus : 0);

    return {
      type: "throw",
      accepted: true,
      entryId: input.item.entryId,
      removeQuantity: quantity,
      attack: {
        kind: thrown ? "thrown_weapon" : "improvised_thrown",
        ability,
        attackBonus,
        normalRangeFt,
        longRangeFt,
        inNormalRange: distanceFt <= normalRangeFt,
        inLongRange: distanceFt <= longRangeFt,
        damageDice: input.item.damageDice ?? "1d4",
        damageType: input.item.damageType ?? "bludgeoning",
      },
      missObject: {
        itemDefinitionId: input.item.itemDefinitionId,
        name: input.item.name,
        quantity,
        point: input.targetPoint,
      },
      distanceFt,
    };
  }

  private normalizeQuantity(quantity: number): number | null {
    return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
  }

  private distanceFt(from: ItemInteractionPoint, to: ItemInteractionPoint): number {
    this.assertPoint(from);
    this.assertPoint(to);
    return Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) * FEET_PER_GRID;
  }

  private assertPoint(point: ItemInteractionPoint): void {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) {
      throw new Error("item interaction points must use integer grid coordinates.");
    }
  }

  private hasProperty(item: ItemInteractionEntry, property: string): boolean {
    return (item.properties ?? []).map((value) => value.trim().toLowerCase()).includes(property);
  }

  private resolveThrownNormalRange(item: ItemInteractionEntry): number {
    if (this.hasProperty(item, "javelin")) {
      return 30;
    }
    return 20;
  }

  private resolveThrownLongRange(item: ItemInteractionEntry, normalRangeFt: number): number {
    if (this.hasProperty(item, "javelin")) {
      return 120;
    }
    return normalRangeFt * 3;
  }
}
