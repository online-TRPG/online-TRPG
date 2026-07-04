import { Injectable } from "@nestjs/common";
import {
  CharacterAvatarType as PrismaCharacterAvatarType,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
} from "@prisma/client";
import { randomUUID } from "crypto";

type CharacterTransferSourceCharacter = {
  name: string;
  ancestry: string;
  className: string;
  subclassName: string | null;
  level: number;
  bio: string | null;
  abilitiesJson: string;
  proficiencyBonus: number;
  featuresJson: string | null;
  proficientSkillsJson: string;
  maxHp: number;
  armorClass: number;
  speed: number;
  spellsJson: string | null;
  equippedWeaponId: string | null;
  offhandWeaponId: string | null;
  avatarType: PrismaCharacterAvatarType | null;
  avatarPresetId: string | null;
  avatarUrl: string | null;
  avatarUpdatedAt: Date | null;
};

@Injectable()
export class SessionCharacterTransferClonePayloadService {
  buildCharacterCreateData(params: {
    requestedByUserId: string;
    targetScenarioId: string;
    sourceCharacter: CharacterTransferSourceCharacter;
    transferableInventoryJson: string;
    createId?: () => string;
  }) {
    const createId = params.createId ?? randomUUID;
    return {
      id: `character-transfer-${createId()}`,
      ownerUserId: params.requestedByUserId,
      scenarioId: params.targetScenarioId,
      name: params.sourceCharacter.name,
      ancestry: params.sourceCharacter.ancestry,
      className: params.sourceCharacter.className,
      subclassName: params.sourceCharacter.subclassName,
      level: params.sourceCharacter.level,
      bio: params.sourceCharacter.bio,
      abilitiesJson: params.sourceCharacter.abilitiesJson,
      proficiencyBonus: params.sourceCharacter.proficiencyBonus,
      featuresJson: params.sourceCharacter.featuresJson ?? undefined,
      proficientSkillsJson: params.sourceCharacter.proficientSkillsJson,
      maxHp: params.sourceCharacter.maxHp,
      armorClass: params.sourceCharacter.armorClass,
      speed: params.sourceCharacter.speed,
      inventoryJson: params.transferableInventoryJson,
      spellsJson: params.sourceCharacter.spellsJson ?? undefined,
      equippedWeaponId: params.sourceCharacter.equippedWeaponId,
      offhandWeaponId: params.sourceCharacter.offhandWeaponId,
      avatarType: params.sourceCharacter.avatarType ?? undefined,
      avatarPresetId: params.sourceCharacter.avatarPresetId,
      avatarUrl: params.sourceCharacter.avatarUrl,
      avatarUpdatedAt: params.sourceCharacter.avatarUpdatedAt,
    };
  }

  buildSessionCharacterCreateData(params: {
    targetSessionId: string;
    requestedByUserId: string;
    clonedCharacter: {
      id: string;
      maxHp: number;
      inventoryJson: string | null;
    };
  }) {
    return {
      sessionId: params.targetSessionId,
      userId: params.requestedByUserId,
      characterId: params.clonedCharacter.id,
      status: PrismaSessionCharacterStatus.ACTIVE,
      currentHp: params.clonedCharacter.maxHp,
      tempHp: 0,
      conditionsJson: "[]",
      inventorySnapshotJson: params.clonedCharacter.inventoryJson,
    };
  }
}
