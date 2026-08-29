import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { CombatStatus as PrismaCombatStatus, GamePhase as PrismaGamePhase, GmMode as PrismaGmMode, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import {
  CreateVttMapPingDto,
  MoveSessionTokenDto,
  UpdateVttMapDto,
  VttMapInteractionDto,
  VttMapInteractionResponseDto,
  VttMapStateDto,
} from "@trpg/shared-types";
import { parseJsonRecordOrThrow } from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import { RealtimeEventsService } from "../realtime/realtime-events.service";
import { SessionsService } from "./sessions.service";
import { VttMapInteractionRuntimeService } from "./vtt-map-interaction-runtime.service";
import {
  AuthoritativeVttMap,
  markAuthoritativeVttMap,
} from "./vtt-map-authority";

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
    const isGmOperator = session.gmMode === PrismaGmMode.HUMAN && session.hostUserId === userId;
    if (!isGmOperator) {
      throw new ForbiddenException("GM map changes require GM permission.");
    }
    const { state, sessionScenario } = await this.sessionsService.getGameStateEntityOrThrow(resolvedSessionId);
    const flags = parseJsonRecordOrThrow(state.flagsJson, {}, "gameState.flagsJson");
    const previousMap = await this.sessionsService.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const requestedMap = markAuthoritativeVttMap(
      this.sessionsService.normalizeInputVttMap(
        dto.map,
        state.currentNodeId ?? null,
        "vttMap",
      ),
    );
    const hasActiveCombat = Boolean(
      await this.prisma.combat.findFirst({
        where: { sessionId: resolvedSessionId, status: PrismaCombatStatus.ACTIVE },
        select: { id: true },
      }),
    );
    this.logger.debug(
      `[VTT_GM_MAP_UPDATE] sessionId=${resolvedSessionId} userId=${userId} nodeId=${state.currentNodeId ?? "null"} gmOperator=${isGmOperator} activeCombat=${hasActiveCombat} requestedTokens=${requestedMap.tokens.length}`,
    );
    if (hasActiveCombat) {
      throw new ForbiddenException("Combat map changes must use combat command endpoints.");
    }

    const result = await this.sessionsService.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map: requestedMap,
      previousMap,
      expectedStateVersion: state.version,
    });
    return result.map;
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

    const flags = parseJsonRecordOrThrow(state.flagsJson, {}, "gameState.flagsJson");
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

    const moveTo = this.sessionsService.readVttMapPointInput(dto.to, "moveToken.to");
    const requestedToken = {
      ...token,
      x: this.sessionsService.clampNumber(Math.floor(moveTo.x), 0, Math.max(0, previousMap.width - token.size)),
      y: this.sessionsService.clampNumber(Math.floor(moveTo.y), 0, Math.max(0, previousMap.height - token.size)),
    };
    this.sessionsService.ensureTokenPathIsReachable(previousMap, token, requestedToken);

    const changedMap: AuthoritativeVttMap = {
      ...previousMap,
      tokens: previousMap.tokens.map((candidate) =>
        candidate.id === token.id ? requestedToken : candidate,
      ),
      updatedAt: new Date().toISOString(),
    };
    const result = await this.sessionsService.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map: changedMap,
      previousMap,
      expectedStateVersion: state.version,
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
    const flags = parseJsonRecordOrThrow(state.flagsJson, {}, "gameState.flagsJson");
    const previousMap = await this.sessionsService.getVttMapBaseline(resolvedSessionId, sessionScenario.id, state);
    const now = Date.now();
    const map: AuthoritativeVttMap = {
      ...previousMap,
      pings: [
        ...(previousMap.pings ?? [])
          .filter((ping) => Date.parse(ping.expiresAt) > now)
          .slice(-4),
        {
          id: `ping:${randomUUID()}`,
          x: this.sessionsService.clampNumber(
            Math.floor(this.sessionsService.readVttMapNumberInput(dto.x, "ping.x")),
            0,
            previousMap.width,
          ),
          y: this.sessionsService.clampNumber(
            Math.floor(this.sessionsService.readVttMapNumberInput(dto.y, "ping.y")),
            0,
            previousMap.height,
          ),
          label: dto.label?.trim().slice(0, 8) || "!",
          expiresAt: new Date(now + 2200).toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    const result = await this.sessionsService.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map,
      previousMap,
      expectedStateVersion: state.version,
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

  async saveSystemVttMap(
    sessionId: string,
    map: AuthoritativeVttMap,
    options: {
      transactionEffect?: (tx: Prisma.TransactionClient) => Promise<void>;
    } = {},
  ): Promise<AuthoritativeVttMap> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    const flags = parseJsonRecordOrThrow(state.flagsJson, {}, "gameState.flagsJson");
    const normalizedMap = markAuthoritativeVttMap(
      this.sessionsService.normalizeVttMap(
        map,
        state.currentNodeId ?? null,
      ),
    );
    const previousMap = await this.sessionsService.getVttMapBaseline(session.id, sessionScenario.id, state);
    const result = await this.sessionsService.finalizeRuntimeVttMapChange({
      session,
      sessionScenarioId: sessionScenario.id,
      currentNodeId: state.currentNodeId,
      flags,
      map: normalizedMap,
      previousMap,
      expectedStateVersion: state.version,
      transactionEffect: options.transactionEffect,
    });

    return result.map;
  }
}
