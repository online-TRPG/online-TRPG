import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { CombatStatus as PrismaCombatStatus, GamePhase as PrismaGamePhase } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  CreateVttMapPingDto,
  MoveSessionTokenDto,
  UpdateVttMapDto,
  VttMapInteractionDto,
  VttMapInteractionResponseDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "./sessions.service";
import { VttMapInteractionRuntimeService } from "./vtt-map-interaction-runtime.service";

@Injectable()
export class MapRuntimeService {
  private readonly logger = new Logger(MapRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
    private readonly sessionsService: SessionsService,
    private readonly interactionRuntime: VttMapInteractionRuntimeService,
  ) {}

  async updateGmVttMap(
    userId: string,
    sessionId: string,
    dto: UpdateVttMapDto,
  ): Promise<VttMapStateDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.sessionsService.ensureMembership(userId, resolvedSessionId);
    const { state, sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(resolvedSessionId);
    const flags = this.sessionsService.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const previousMap = await this.sessionsService.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const requestedMap = this.sessionsService.normalizeVttMap(dto.map, state.currentNodeId ?? null);
    const hasActiveCombat = Boolean(
      await this.prisma.combat.findFirst({
        where: { sessionId: resolvedSessionId, status: PrismaCombatStatus.ACTIVE },
        select: { id: true },
      }),
    );
    this.logger.debug(
      `[VTT_GM_MAP_UPDATE] sessionId=${resolvedSessionId} userId=${userId} nodeId=${state.currentNodeId ?? "null"} host=${session.hostUserId === userId} activeCombat=${hasActiveCombat} requestedTokens=${requestedMap.tokens.length}`,
    );
    if (session.hostUserId !== userId) {
      throw new ForbiddenException("GM map changes require the session host.");
    }
    if (hasActiveCombat) {
      throw new ForbiddenException("Combat map changes must use combat command endpoints.");
    }

    let map = requestedMap;
    map = await this.sessionsService.applyVttObjectProximityEvents({
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      map,
    });
    const hazardTriggerResult = await this.sessionsService.applyVttHazardTriggers({
      sessionId: resolvedSessionId,
      sessionScenarioId: sessionScenario.id,
      map,
      previousMap,
    });
    map = hazardTriggerResult.map;
    const beforeHazardDetectionMap = map;
    map = await this.sessionsService.applyVttHazardDetections({
      sessionId: resolvedSessionId,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      map,
      previousMap,
    });
    const hazardDetectionChanged =
      JSON.stringify(beforeHazardDetectionMap.objectCells ?? []) !== JSON.stringify(map.objectCells ?? []);

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          ...flags,
          vttMap: map,
        }),
      },
    });

    const playerMap = this.sessionsService.redactVttMapForPlayer(map);
    this.realtimeEvents.emitVttMapUpdated(resolvedSessionId, {
      hostUserId: session.hostUserId,
      hostMap: map,
      playerMap,
    });
    if (hazardTriggerResult.triggered || hazardDetectionChanged) {
      this.realtimeEvents.emitSessionSnapshot(
        resolvedSessionId,
        await this.sessionsService.buildSnapshot(resolvedSessionId),
      );
    }
    return map;
  }

  async moveSessionToken(
    userId: string,
    sessionId: string,
    dto: MoveSessionTokenDto,
  ): Promise<VttMapStateDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.sessionsService.ensureMembership(userId, resolvedSessionId);
    let { state, sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(resolvedSessionId);
    const activeCombat = await this.prisma.combat.findFirst({
      where: { sessionId: resolvedSessionId, status: PrismaCombatStatus.ACTIVE },
      select: { id: true },
    });
    if (activeCombat) {
      if (state.phase === PrismaGamePhase.COMBAT) {
        throw new ForbiddenException("Combat movement must use the combat move command.");
      }

      this.logger.warn(
        `[VTT_STALE_ACTIVE_COMBAT_SELF_HEAL] sessionId=${resolvedSessionId} activeCombatId=${activeCombat.id} phase=${state.phase}`,
      );
      await this.sessionsService.completeActiveCombatState(resolvedSessionId);
      this.realtimeEvents.emitSessionSnapshot(
        resolvedSessionId,
        await this.sessionsService.buildSnapshot(resolvedSessionId),
      );
      ({ state, sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(resolvedSessionId));
    }

    const flags = this.sessionsService.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const previousMap = await this.sessionsService.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const controlledTokenIds = await this.sessionsService.getControlledSessionCharacterIds(userId, resolvedSessionId);
    const token = previousMap.tokens.find((candidate) => {
      if (candidate.hidden === true || candidate.isHostile === true) {
        return false;
      }
      if (dto.tokenId && candidate.id === dto.tokenId) {
        return true;
      }
      return Boolean(dto.sessionCharacterId && candidate.sessionCharacterId === dto.sessionCharacterId);
    });

    if (!token?.sessionCharacterId || !controlledTokenIds.has(token.sessionCharacterId)) {
      throw new ForbiddenException("Players can only move their own tokens.");
    }

    const requestedToken = {
      ...token,
      x: this.sessionsService.clampNumber(Math.floor(dto.to.x), 0, Math.max(0, previousMap.width - token.size)),
      y: this.sessionsService.clampNumber(Math.floor(dto.to.y), 0, Math.max(0, previousMap.height - token.size)),
    };
    this.sessionsService.ensureTokenPathIsReachable(previousMap, token, requestedToken);

    const changedMap: VttMapStateDto = {
      ...previousMap,
      tokens: previousMap.tokens.map((candidate) =>
        candidate.id === token.id ? requestedToken : candidate,
      ),
      updatedAt: new Date().toISOString(),
    };
    const result = await this.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map: changedMap,
      previousMap,
    });

    return session.hostUserId === userId ? result.map : result.playerMap;
  }

  async createVttMapPing(
    userId: string,
    sessionId: string,
    dto: CreateVttMapPingDto,
  ): Promise<VttMapStateDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    const resolvedSessionId = session.id;
    await this.sessionsService.ensureMembership(userId, resolvedSessionId);
    const { state, sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(resolvedSessionId);
    const flags = this.sessionsService.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const previousMap = await this.sessionsService.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const now = Date.now();
    const map: VttMapStateDto = {
      ...previousMap,
      pings: [
        ...(previousMap.pings ?? [])
          .filter((ping) => Date.parse(ping.expiresAt) > now)
          .slice(-4),
        {
          id: `ping:${randomUUID()}`,
          x: this.sessionsService.clampNumber(Math.floor(dto.x), 0, previousMap.width),
          y: this.sessionsService.clampNumber(Math.floor(dto.y), 0, previousMap.height),
          label: dto.label?.trim().slice(0, 8) || "!",
          expiresAt: new Date(now + 2200).toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    const result = await this.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map,
      previousMap,
    });

    return session.hostUserId === userId ? result.map : result.playerMap;
  }

  async runVttMapInteraction(
    userId: string,
    sessionId: string,
    dto: VttMapInteractionDto,
  ): Promise<VttMapInteractionResponseDto> {
    return this.interactionRuntime.runVttMapInteraction(userId, sessionId, dto);
  }

  async saveSystemVttMap(sessionId: string, map: VttMapStateDto): Promise<VttMapStateDto> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const flags = this.sessionsService.parseJson<Record<string, unknown>>(state.flagsJson, {});
    const normalizedMap = this.sessionsService.normalizeVttMap(map, state.currentNodeId ?? null);
    const runtimeMap = await this.sessionsService.applyVttObjectProximityEvents({
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      map: normalizedMap,
    });

    await this.prisma.gameState.update({
      where: { sessionScenarioId: sessionScenario.id },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          ...flags,
          vttMap: runtimeMap,
        }),
      },
    });

    this.realtimeEvents.emitVttMapUpdated(session.id, {
      hostUserId: session.hostUserId,
      hostMap: runtimeMap,
      playerMap: this.sessionsService.redactVttMapForPlayer(runtimeMap),
    });

    return runtimeMap;
  }

  private async finalizeRuntimeVttMapChange(params: {
    session: { id: string; hostUserId: string };
    sessionScenarioId: string;
    currentNodeId: string | null;
    flags: Record<string, unknown>;
    map: VttMapStateDto;
    previousMap: VttMapStateDto;
  }): Promise<{ map: VttMapStateDto; playerMap: VttMapStateDto }> {
    let map = await this.sessionsService.applyVttObjectProximityEvents({
      sessionScenarioId: params.sessionScenarioId,
      currentNodeId: params.currentNodeId,
      map: params.map,
    });
    const hazardTriggerResult = await this.sessionsService.applyVttHazardTriggers({
      sessionId: params.session.id,
      sessionScenarioId: params.sessionScenarioId,
      map,
      previousMap: params.previousMap,
    });
    map = hazardTriggerResult.map;
    const beforeHazardDetectionMap = map;
    map = await this.sessionsService.applyVttHazardDetections({
      sessionId: params.session.id,
      sessionScenarioId: params.sessionScenarioId,
      currentNodeId: params.currentNodeId,
      map,
      previousMap: params.previousMap,
    });
    const hazardDetectionChanged =
      JSON.stringify(beforeHazardDetectionMap.objectCells ?? []) !== JSON.stringify(map.objectCells ?? []);

    await this.prisma.gameState.update({
      where: { sessionScenarioId: params.sessionScenarioId },
      data: {
        version: { increment: 1 },
        flagsJson: JSON.stringify({
          ...params.flags,
          vttMap: map,
        }),
      },
    });

    const playerMap = this.sessionsService.redactVttMapForPlayer(map);
    this.realtimeEvents.emitVttMapUpdated(params.session.id, {
      hostUserId: params.session.hostUserId,
      hostMap: map,
      playerMap,
    });
    if (hazardTriggerResult.triggered || hazardDetectionChanged) {
      this.realtimeEvents.emitSessionSnapshot(
        params.session.id,
        await this.sessionsService.buildSnapshot(params.session.id),
      );
    }

    return { map, playerMap };
  }
}
