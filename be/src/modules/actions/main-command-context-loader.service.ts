import { Injectable } from "@nestjs/common";
import {
  GmMode as PrismaGmMode,
  ParticipantStatus as PrismaParticipantStatus,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";
import { MainCommandScreenType, ScenarioNodeType, SubmitMainCommandDto } from "@trpg/shared-types";
import { badRequest, forbidden } from "../../common/exceptions/domain-error";
import { parseJsonRecordOrFallback } from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import { readCompletedCombatNodeIds } from "../sessions/session-completion-flag-store.service";
import { SessionsService } from "../sessions/sessions.service";
import type { LoadedContext } from "./main-commands.service";

@Injectable()
export class MainCommandContextLoaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionsService: SessionsService,
  ) {}

  async loadContext(userId: string, sessionId: string, dto: SubmitMainCommandDto): Promise<LoadedContext> {
    const session = await this.sessionsService.getSessionEntityOrThrow(sessionId);
    await this.sessionsService.ensureMembership(userId, session.id);

    if (session.gmMode !== PrismaGmMode.AI) {
      throw badRequest("MAIN_COMMAND_400", "AI GM 세션에서만 메인 명령을 사용할 수 있습니다.", {
        reason: "AI_GM_ONLY",
      });
    }

    if (session.status !== PrismaSessionStatus.PLAYING) {
      throw forbidden("MAIN_COMMAND_403", "세션이 진행 중일 때만 메인 명령을 사용할 수 있습니다.", {
        reason: "SESSION_NOT_PLAYING",
      });
    }

    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
    });

    if (!participant || participant.status !== PrismaParticipantStatus.JOINED) {
      throw forbidden("MAIN_COMMAND_403", "현재 세션 참가자만 메인 명령을 사용할 수 있습니다.", {
        reason: "NOT_A_SESSION_PARTICIPANT",
      });
    }

    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: {
        sessionId_userId: {
          sessionId: session.id,
          userId,
        },
      },
      include: {
        character: true,
        inventoryEntries: {
          include: {
            itemDefinition: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!sessionCharacter || sessionCharacter.status !== PrismaSessionCharacterStatus.ACTIVE) {
      throw forbidden("MAIN_COMMAND_403", "캐릭터를 선택한 뒤 메인 명령을 사용해주세요.", {
        reason: "CHARACTER_NOT_SELECTED",
      });
    }

    if (![sessionCharacter.id, sessionCharacter.characterId].includes(dto.actorId)) {
      throw forbidden("MAIN_COMMAND_403", "선택한 캐릭터와 요청 actorId가 일치하지 않습니다.", {
        reason: "ACTOR_MISMATCH",
      });
    }

    if (sessionCharacter.character.ownerUserId !== userId) {
      throw forbidden("MAIN_COMMAND_403", "다른 유저의 캐릭터로 메인 명령을 사용할 수 없습니다.", {
        reason: "CHARACTER_OWNERSHIP_MISMATCH",
      });
    }

    const { sessionScenario, state } = await this.sessionsService.getGameStateEntityOrThrow(session.id);
    if (!state.currentNodeId) {
      throw badRequest("MAIN_COMMAND_400", "현재 진행 중인 노드가 없습니다.", {
        reason: "CURRENT_NODE_REQUIRED",
      });
    }

    const currentNode = await this.prisma.sessionScenarioNode.findUnique({
      where: {
        sessionScenarioId_nodeId: {
          sessionScenarioId: sessionScenario.id,
          nodeId: state.currentNodeId,
        },
      },
    });

    if (!currentNode) {
      throw badRequest("MAIN_COMMAND_400", "현재 노드 정보를 찾을 수 없습니다.", {
        reason: "CURRENT_NODE_NOT_FOUND",
      });
    }

    const expectedScreenType = this.toExpectedMainScreenType(currentNode.nodeType, state.flagsJson, currentNode.nodeId);
    if (dto.screenType !== expectedScreenType) {
      throw badRequest("MAIN_COMMAND_400", "현재 노드 화면 타입과 요청 screenType이 일치하지 않습니다.", {
        reason: "SCREEN_TYPE_MISMATCH",
      });
    }

    if (dto.nodeId && dto.nodeId !== currentNode.nodeId) {
      throw badRequest("MAIN_COMMAND_400", "요청 nodeId가 현재 진행 중인 노드와 다릅니다.", {
        reason: "NODE_ID_MISMATCH",
      });
    }

    this.ensureItemOwnership(dto, sessionCharacter.inventoryEntries);

    return {
      sessionId: session.id,
      sessionScenarioId: sessionScenario.id,
      sessionCharacterId: sessionCharacter.id,
      actorCharacterId: sessionCharacter.character.id,
      inventoryItems: sessionCharacter.inventoryEntries.map((entry) => ({
        id: entry.id,
        itemDefinitionId: entry.itemDefinitionId,
        name: entry.itemDefinition.name,
      })),
      currentNodeId: currentNode.nodeId,
      currentNodeTitle: currentNode.title,
      currentNodeSceneText: currentNode.sceneText,
      currentNodeTransitionsJson: currentNode.transitionsJson,
      currentNodeCluesJson: currentNode.cluesJson,
      currentNodeNodeMetaJson: currentNode.nodeMetaJson,
      currentNodeFallbackNodeId: currentNode.fallbackNodeId,
      flagsJson: state.flagsJson,
    };
  }

  private ensureItemOwnership(
    dto: SubmitMainCommandDto,
    inventoryEntries: Array<{
      id: string;
      itemDefinitionId: string;
      itemDefinition: { id: string; name: string };
    }>,
  ): void {
    if (!dto.itemId) {
      return;
    }

    const normalized = dto.itemId.trim().toLowerCase();
    const hasItem = inventoryEntries.some((entry) =>
      [entry.id, entry.itemDefinitionId, entry.itemDefinition.id, entry.itemDefinition.name]
        .map((value) => value.trim().toLowerCase())
        .includes(normalized),
    );

    if (!hasItem) {
      throw badRequest("MAIN_COMMAND_400", "해당 아이템은 현재 캐릭터가 보유하고 있지 않습니다.", {
        reason: "ITEM_NOT_OWNED",
      });
    }
  }

  private toExpectedMainScreenType(nodeType: string, flagsJson: string | null, nodeId: string): MainCommandScreenType {
    const screenType = this.toMainScreenType(nodeType);
    if (screenType !== MainCommandScreenType.COMBAT) {
      return screenType;
    }

    const flags = parseJsonRecordOrFallback(flagsJson);
    const completedCombatNodeIds = readCompletedCombatNodeIds(flags);

    return completedCombatNodeIds.includes(nodeId) ? MainCommandScreenType.EXPLORATION : MainCommandScreenType.COMBAT;
  }

  private toMainScreenType(nodeType: string): MainCommandScreenType {
    switch (this.toScenarioNodeType(nodeType)) {
      case ScenarioNodeType.EXPLORATION:
        return MainCommandScreenType.EXPLORATION;
      case ScenarioNodeType.COMBAT:
        return MainCommandScreenType.COMBAT;
      case ScenarioNodeType.STORY:
      default:
        return MainCommandScreenType.STORY;
    }
  }

  private toScenarioNodeType(nodeType: string): ScenarioNodeType {
    switch (nodeType) {
      case ScenarioNodeType.EXPLORATION:
        return ScenarioNodeType.EXPLORATION;
      case ScenarioNodeType.COMBAT:
        return ScenarioNodeType.COMBAT;
      case ScenarioNodeType.STORY:
      default:
        return ScenarioNodeType.STORY;
    }
  }

}
