import { Injectable } from "@nestjs/common";
import { SessionCharacterStatus as PrismaSessionCharacterStatus } from "@prisma/client";
import { VttMapStateDto } from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class SessionVttMapBootstrapService {
  constructor(private readonly prisma: PrismaService) {}

  async buildDefaultMap(sessionId: string, scenarioNodeId: string | null): Promise<VttMapStateDto> {
    const gridSize = 64;
    const width = 1280;
    const height = 832;
    const startingPositions = this.createDefaultStartingPositions(gridSize, width, height, 4);
    const tokens = await this.buildSessionCharacterTokens(sessionId, {
      gridSize,
      width,
      height,
      startingPositions,
    });

    return {
      id: `map:${sessionId}`,
      scenarioNodeId,
      imageUrl: null,
      gridType: "square",
      gridSize,
      width,
      height,
      tokens,
      fogRects: [],
      startingPositions,
      terrainCells: [],
      wallCells: [],
      doorCells: [],
      objectCells: [],
      updatedAt: new Date().toISOString(),
    };
  }

  async applyScenarioStartingPositions(sessionId: string, map: VttMapStateDto): Promise<VttMapStateDto> {
    const tokens = await this.buildSessionCharacterTokens(sessionId, map, map.tokens);
    return {
      ...map,
      tokens,
    };
  }

  private async buildSessionCharacterTokens(
    sessionId: string,
    map: Pick<VttMapStateDto, "gridSize" | "width" | "height" | "startingPositions">,
    existingTokens: VttMapStateDto["tokens"] = [],
  ): Promise<VttMapStateDto["tokens"]> {
    const sessionCharacters = await this.prisma.sessionCharacter.findMany({
      where: {
        sessionId,
        status: PrismaSessionCharacterStatus.ACTIVE,
      },
      include: { character: true },
      orderBy: { createdAt: "asc" },
    });
    const preservedTokens = existingTokens.filter((token) => !token.sessionCharacterId).slice(0, 68);
    const existingPlayerTokenByCharacterId = new Map(
      existingTokens.filter((token) => token.sessionCharacterId).map((token) => [token.sessionCharacterId as string, token]),
    );

    const playerTokens = sessionCharacters.slice(0, 12).map((sessionCharacter, index) => {
      const existingToken = existingPlayerTokenByCharacterId.get(sessionCharacter.id);
      if (existingToken) {
        return {
          ...existingToken,
          id: existingToken.id || `token:${sessionCharacter.id}`,
          sessionCharacterId: sessionCharacter.id,
          name: existingToken.name || sessionCharacter.character.name,
          imageUrl: existingToken.imageUrl ?? sessionCharacter.character.avatarUrl ?? null,
          x: this.clampNumber(existingToken.x, 0, map.width - map.gridSize),
          y: this.clampNumber(existingToken.y, 0, map.height - map.gridSize),
          size: this.clampNumber(existingToken.size, 24, 160),
          isHostile: false,
          monster: null,
        };
      }

      const slot = map.startingPositions?.[index] ?? null;
      const fallback = this.getDefaultPlayerTokenPosition(index, map.gridSize, map.width, map.height);

      return {
        id: `token:${sessionCharacter.id}`,
        sessionCharacterId: sessionCharacter.id,
        name: sessionCharacter.character.name,
        imageUrl: sessionCharacter.character.avatarUrl ?? null,
        x: slot ? this.clampNumber(slot.x, 0, map.width - map.gridSize) : fallback.x,
        y: slot ? this.clampNumber(slot.y, 0, map.height - map.gridSize) : fallback.y,
        size: map.gridSize,
        hidden: false,
        isHostile: false,
        monster: null,
      };
    });

    return [...preservedTokens, ...playerTokens].slice(0, 80);
  }

  private createDefaultStartingPositions(gridSize: number, width: number, height: number, count: number): NonNullable<VttMapStateDto["startingPositions"]> {
    return Array.from({ length: count }, (_, index) => {
      const position = this.getDefaultPlayerTokenPosition(index, gridSize, width, height);
      return {
        id: `start:${index + 1}`,
        label: `P${index + 1}`,
        x: position.x,
        y: position.y,
      };
    });
  }

  private getDefaultPlayerTokenPosition(index: number, gridSize: number, width: number, height: number): { x: number; y: number } {
    const columns = 4;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: this.clampNumber(gridSize * (2 + column), 0, width - gridSize),
      y: this.clampNumber(height - gridSize * (3 - row), 0, height - gridSize),
    };
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }
}
