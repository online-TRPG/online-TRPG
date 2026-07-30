import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  decodeLenientScenarioNodeCheckOptionsConfig,
  VttMapStateDto,
} from "@trpg/shared-types";
import { parseJsonOrFallback } from "../../common/utils/json-runtime";
import { SessionVttMapBootstrapService } from "./session-vtt-map-bootstrap.service";
import { SessionVttMapNormalizationService } from "./session-vtt-map-normalization.service";

type RuntimeMapClient = Pick<
  Prisma.TransactionClient,
  | "sessionScenarioNodeRuntimeState"
  | "sessionCharacter"
  | "sessionScenario"
  | "gameState"
  | "$executeRaw"
>;

@Injectable()
export class SessionNodeRuntimeMapService {
  constructor(
    private readonly normalization: SessionVttMapNormalizationService,
    private readonly bootstrap: SessionVttMapBootstrapService,
  ) {}

  async loadOrInitialize(
    tx: RuntimeMapClient,
    params: {
      sessionId: string;
      sessionScenarioId: string;
      node: {
        nodeId: string;
        checkOptionsJson: string;
      };
    },
  ): Promise<{ map: VttMapStateDto; version: number; initialized: boolean }> {
    const existing = await tx.sessionScenarioNodeRuntimeState.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: params.sessionScenarioId,
          nodeId: params.node.nodeId,
        },
      },
    });
    if (existing) {
      const persistedMap = this.decodeRuntimeMap(
        existing.vttMapJson,
        params.node.nodeId,
      );
      const reconciledMap =
        await this.bootstrap.applyScenarioStartingPositions(
          params.sessionId,
          persistedMap,
          tx,
        );
      if (
        JSON.stringify(reconciledMap.tokens) !==
        JSON.stringify(persistedMap.tokens)
      ) {
        const map = this.normalization.normalizeForWrite(
          reconciledMap,
          params.node.nodeId,
        );
        const updated =
          await tx.sessionScenarioNodeRuntimeState.update({
            where: {
              sessionScenarioId_nodeId: {
                sessionScenarioId: params.sessionScenarioId,
                nodeId: params.node.nodeId,
              },
            },
            data: {
              version: { increment: 1 },
              vttMapJson: JSON.stringify(map),
            },
          });
        return {
          map,
          version: updated.version,
          initialized: false,
        };
      }
      return {
        map: persistedMap,
        version: existing.version,
        initialized: false,
      };
    }

    const config = parseJsonOrFallback(
      params.node.checkOptionsJson,
      { checks: [], vttMap: null },
      decodeLenientScenarioNodeCheckOptionsConfig,
    );
    const sourceMap = config.vttMap
      ? this.normalization.decodeAndSanitizeForRead(
          config.vttMap,
          params.node.nodeId,
        )
      : await this.bootstrap.buildDefaultMap(
          params.sessionId,
          params.node.nodeId,
          tx,
        );
    const withPlayers = await this.bootstrap.applyScenarioStartingPositions(
      params.sessionId,
      sourceMap,
      tx,
    );
    const map = this.normalization.normalizeForWrite(
      withPlayers,
      params.node.nodeId,
    );
    this.assertNodeIdentity(map, params.node.nodeId);

    const created = await tx.sessionScenarioNodeRuntimeState.create({
      data: {
        sessionScenarioId: params.sessionScenarioId,
        nodeId: params.node.nodeId,
        vttMapJson: JSON.stringify(map),
      },
    });
    return { map, version: created.version, initialized: true };
  }

  async saveCurrentMap(
    tx: RuntimeMapClient,
    params: {
      sessionScenarioId: string;
      map: VttMapStateDto;
      fallbackFlags?: Record<string, unknown>;
      expectedStateVersion?: number;
    },
  ): Promise<{ map: VttMapStateDto; runtimeVersion: number }> {
    const link = await tx.sessionScenario.findUnique({
      where: { id: params.sessionScenarioId },
      select: { sessionId: true },
    });
    if (!link) {
      throw this.invalidMap("SESSION_SCENARIO_MISSING");
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${link.sessionId}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.sessionScenarioId}))`;
    const state = await tx.gameState.findUnique({
      where: { sessionScenarioId: params.sessionScenarioId },
      select: { currentNodeId: true, flagsJson: true },
    });
    if (!state?.currentNodeId) {
      throw this.invalidMap("CURRENT_NODE_MISSING");
    }
    this.assertNodeIdentity(params.map, state.currentNodeId);

    const map = this.normalization.normalizeForWrite(
      params.map,
      state.currentNodeId,
    );
    const flags = this.parseFlags(
      state.flagsJson,
      params.fallbackFlags ?? {},
    );
    const runtime = await tx.sessionScenarioNodeRuntimeState.upsert({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: params.sessionScenarioId,
          nodeId: state.currentNodeId,
        },
      },
      create: {
        sessionScenarioId: params.sessionScenarioId,
        nodeId: state.currentNodeId,
        vttMapJson: JSON.stringify(map),
      },
      update: {
        version: { increment: 1 },
        vttMapJson: JSON.stringify(map),
      },
    });
    const stateUpdate = await tx.gameState.updateMany({
      where: {
        sessionScenarioId: params.sessionScenarioId,
        ...(params.expectedStateVersion !== undefined
          ? { version: params.expectedStateVersion }
          : {}),
      },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({ ...flags, vttMap: map }),
      },
    });
    if (stateUpdate.count !== 1) {
      throw new ConflictException({
        code: "VTT_409",
        reason: "MAP_STATE_VERSION_CONFLICT",
        expectedVersion: params.expectedStateVersion,
      });
    }
    return { map, runtimeVersion: runtime.version };
  }

  decodeRuntimeMap(value: string, expectedNodeId: string): VttMapStateDto {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw this.invalidMap("INVALID_JSON");
    }
    const map = this.normalization.toVttMapOrNull(parsed);
    if (!map) {
      throw this.invalidMap("INVALID_CONTRACT");
    }
    this.assertNodeIdentity(map, expectedNodeId);
    return map;
  }

  private assertNodeIdentity(map: VttMapStateDto, nodeId: string): void {
    if (map.scenarioNodeId !== nodeId) {
      throw this.invalidMap("NODE_ID_MISMATCH");
    }
  }

  private parseFlags(
    value: string | null,
    fallback: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!value) return fallback;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : fallback;
    } catch {
      return fallback;
    }
  }

  private invalidMap(reason: string): BadRequestException {
    return new BadRequestException({
      code: "SESSION_NODE_RUNTIME_MAP_INVALID",
      reason,
      message: "세션 노드의 런타임 맵 데이터가 올바르지 않습니다.",
    });
  }
}
