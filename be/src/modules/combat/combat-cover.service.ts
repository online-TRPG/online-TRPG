import { Injectable } from "@nestjs/common";
import type { VttMapStateDto } from "@trpg/shared-types";
import { conflict } from "../../common/exceptions/domain-error";
import { CoverPositionService } from "../rules/cover-position.service";
import type { CoverBlocker } from "../rules/cover-position.service";
import { RuleEngineService } from "../rules/rule-engine.service";
import type { CoverModifierProduced } from "../rules/rule-engine.types";
import { CombatMovementService } from "./combat-movement.service";

const DEFAULT_MELEE_ATTACK_DISTANCE_FT = 5;

@Injectable()
export class CombatCoverService {
  constructor(
    private readonly coverPositions: CoverPositionService,
    private readonly ruleEngine: RuleEngineService,
    private readonly combatMovement: CombatMovementService,
  ) {}

  resolveAttackCover(
    map: VttMapStateDto,
    attackerToken: VttMapStateDto["tokens"][number] | null,
    targetToken: VttMapStateDto["tokens"][number] | null,
  ): ReturnType<CoverPositionService["resolveCover"]> {
    if (!attackerToken || !targetToken) {
      return this.coverPositions.resolveCover({
        attacker: { x: 0, y: 0 },
        target: { x: 0, y: 0 },
        blockers: [],
      });
    }
    if (
      this.combatMovement.getTokenGridDistanceFt(map, attackerToken, targetToken) <=
      DEFAULT_MELEE_ATTACK_DISTANCE_FT
    ) {
      return this.coverPositions.resolveCover({
        attacker: this.toCoverGridPoint(map, attackerToken),
        target: this.toCoverGridPoint(map, targetToken),
        blockers: [],
      });
    }

    return this.coverPositions.resolveCover({
      attacker: this.toCoverGridPoint(map, attackerToken),
      target: this.toCoverGridPoint(map, targetToken),
      blockers: this.mapCoverBlockers(map),
    });
  }

  resolveAoeCover(
    map: VttMapStateDto,
    origin: { x: number; y: number },
    targetToken: VttMapStateDto["tokens"][number] | null,
    appliesToDexteritySave: boolean,
  ): CoverModifierProduced {
    const coverResolution = targetToken
      ? this.coverPositions.resolveCover({
          attacker: this.combatMovement.mapPointToGridPoint(map, origin),
          target: this.toCoverGridPoint(map, targetToken),
          blockers: this.mapCoverBlockers(map),
        })
      : this.coverPositions.resolveCover({
          attacker: { x: 0, y: 0 },
          target: { x: 0, y: 0 },
          blockers: [],
        });

    return this.ruleEngine.resolveCoverModifiers({
      coverLevel: coverResolution.coverLevel,
      appliesToAttackRoll: false,
      appliesToDexteritySave,
    }).produced;
  }

  assertSpellTargetLineOfEffect(
    map: VttMapStateDto,
    casterToken: VttMapStateDto["tokens"][number],
    targetToken: VttMapStateDto["tokens"][number] | null,
  ): void {
    if (!targetToken) {
      return;
    }
    const coverResolution = this.coverPositions.resolveCover({
      attacker: this.toCoverGridPoint(map, casterToken),
      target: this.toCoverGridPoint(map, targetToken),
      blockers: this.mapCoverBlockers(map),
    });
    const coverRuleResult = this.ruleEngine.resolveCoverModifiers({
      coverLevel: coverResolution.coverLevel,
      appliesToAttackRoll: false,
      appliesToDexteritySave: false,
    });
    if (!coverRuleResult.produced.targetable) {
      const data = {
        reason: "TARGET_HAS_FULL_COVER",
        coverLevel: coverRuleResult.produced.coverLevel,
      };
      const error = conflict("COMBAT_409", "대상이 완전 엄폐 상태입니다.", data);
      (error as typeof error & { data: typeof data }).data = data;
      throw error;
    }
  }

  toCoverGridPoint(
    map: VttMapStateDto,
    token: VttMapStateDto["tokens"][number],
  ): { x: number; y: number } {
    return {
      x: this.combatMovement.getGridIndex(token.x, map.gridSize, map.width),
      y: this.combatMovement.getGridIndex(token.y, map.gridSize, map.height),
    };
  }

  toAoeGridCell(point: { x: number; y: number }): { column: number; row: number } {
    return { column: point.x, row: point.y };
  }

  private mapCoverBlockers(map: VttMapStateDto): CoverBlocker[] {
    return [
      ...(map.wallCells ?? []).flatMap((cell) => this.cellCoverBlockers(map, cell, "full", true)),
      ...(map.doorCells ?? [])
        .filter((door) => door.state !== "open" && door.state !== "broken")
        .flatMap((cell) => this.cellCoverBlockers(map, cell, "full", true)),
      ...(map.objectCells ?? []).flatMap((cell) => this.cellCoverBlockers(map, cell, "half", false)),
    ];
  }

  private cellCoverBlockers(
    map: VttMapStateDto,
    cell: { x: number; y: number; width: number; height: number },
    coverLevel: CoverBlocker["coverLevel"],
    blocksLineOfEffect: boolean,
  ): CoverBlocker[] {
    const minColumn = this.combatMovement.getGridIndex(cell.x, map.gridSize, map.width);
    const minRow = this.combatMovement.getGridIndex(cell.y, map.gridSize, map.height);
    const maxColumn = this.combatMovement.getGridIndex(
      cell.x + Math.max(cell.width, 1) - 1,
      map.gridSize,
      map.width,
    );
    const maxRow = this.combatMovement.getGridIndex(
      cell.y + Math.max(cell.height, 1) - 1,
      map.gridSize,
      map.height,
    );
    const blockers: CoverBlocker[] = [];
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        blockers.push({
          point: { x: column, y: row },
          coverLevel,
          blocksLineOfEffect,
        });
      }
    }
    return blockers;
  }
}
