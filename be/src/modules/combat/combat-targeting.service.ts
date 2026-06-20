import { Injectable } from "@nestjs/common";
import type { VttMapStateDto } from "@trpg/shared-types";
import { conflict } from "../../common/exceptions/domain-error";
import { CombatCoverService } from "./combat-cover.service";
import { CombatMovementService } from "./combat-movement.service";
import { CombatStatsService } from "./combat-stats.service";

type CombatTargetParticipant = {
  tokenId: string | null;
  sessionCharacterId: string | null;
  nameSnapshot: string;
};

export type CombatTargetVisibility = {
  targetable: boolean;
  heavilyObscured: boolean;
  reason: "TOKEN_HIDDEN_OR_MISSING" | null;
};

@Injectable()
export class CombatTargetingService {
  constructor(
    private readonly combatMovement: CombatMovementService,
    private readonly combatCover: CombatCoverService,
    private readonly combatStats: CombatStatsService,
  ) {}

  findParticipantToken(
    map: VttMapStateDto,
    participant: CombatTargetParticipant,
  ): VttMapStateDto["tokens"][number] | null {
    if (participant.tokenId) {
      return map.tokens.find((token) => token.id === participant.tokenId && token.hidden !== true) ?? null;
    }
    if (!participant.sessionCharacterId) {
      const matchingHostileTokens = map.tokens.filter(
        (token) =>
          token.hidden !== true &&
          token.isHostile === true &&
          this.combatStats.resolveTokenName(token).trim() === participant.nameSnapshot.trim(),
      );
      return matchingHostileTokens.length === 1 ? matchingHostileTokens[0] : null;
    }
    return (
      map.tokens.find(
        (token) =>
          token.sessionCharacterId === participant.sessionCharacterId && token.hidden !== true,
      ) ?? null
    );
  }

  resolveParticipantTargetVisibility(
    map: VttMapStateDto,
    participant: CombatTargetParticipant,
  ): CombatTargetVisibility {
    const token = this.findParticipantToken(map, participant);
    if (!token) {
      return {
        targetable: false,
        heavilyObscured: false,
        reason: "TOKEN_HIDDEN_OR_MISSING",
      };
    }

    return {
      targetable: true,
      heavilyObscured: this.combatMovement
        .resolveTerrainEffectsAtPoint(map, { x: token.x, y: token.y })
        .some((entered) => entered.effect.heavilyObscured),
      reason: null,
    };
  }

  assertSpellTargetInRange(
    map: VttMapStateDto,
    casterToken: VttMapStateDto["tokens"][number],
    target: CombatTargetParticipant,
    rangeFt: number,
  ): void {
    const targetToken = this.findParticipantToken(map, target);
    if (
      !targetToken ||
      this.combatMovement.getTokenGridDistanceFt(map, casterToken, targetToken) > rangeFt
    ) {
      throw conflict("COMBAT_409", "주문 대상이 사거리 밖입니다.", {
        reason: "SPELL_TARGET_OUT_OF_RANGE",
      });
    }
  }

  assertSpellTargetLineOfEffect(
    map: VttMapStateDto,
    casterToken: VttMapStateDto["tokens"][number],
    target: CombatTargetParticipant,
  ): void {
    this.combatCover.assertSpellTargetLineOfEffect(
      map,
      casterToken,
      this.findParticipantToken(map, target),
    );
  }

  requireTargetPoint(
    _map: VttMapStateDto,
    casterToken: VttMapStateDto["tokens"][number],
  ): { x: number; y: number } {
    return { x: casterToken.x, y: casterToken.y };
  }

  assertPointInRange(
    map: VttMapStateDto,
    casterToken: VttMapStateDto["tokens"][number],
    point: { x: number; y: number },
    rangeFt: number,
  ): void {
    if (this.getGridPointDistanceFt(map, point, casterToken) > rangeFt) {
      throw conflict("COMBAT_409", "주문 지점이 사거리 밖입니다.", {
        reason: "SPELL_POINT_OUT_OF_RANGE",
      });
    }
  }

  getGridPointDistanceFt(
    map: VttMapStateDto,
    point: { x: number; y: number },
    token: VttMapStateDto["tokens"][number],
  ): number {
    const pointToken = { ...token, x: point.x, y: point.y };
    return this.combatMovement.getTokenGridDistanceFt(map, pointToken, token);
  }

  assertLightPointAllowed(map: VttMapStateDto, point: { x: number; y: number }): void {
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    const blocked = [
      ...(map.terrainCells ?? []).filter(
        (cell) => !this.combatMovement.extractTerrainEffectId(cell),
      ),
      ...(map.wallCells ?? []),
      ...(map.doorCells ?? []).filter((door) => door.state !== "open" && door.state !== "broken"),
    ].some(
      (cell) =>
        x >= cell.x &&
        x < cell.x + cell.width &&
        y >= cell.y &&
        y < cell.y + cell.height,
    );
    if (blocked) {
      throw conflict("COMBAT_409", "Light는 벽이나 이동불가 타일에 사용할 수 없습니다.", {
        reason: "LIGHT_POINT_BLOCKED",
      });
    }
  }
}
