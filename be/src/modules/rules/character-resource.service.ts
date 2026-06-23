import { Injectable } from "@nestjs/common";
import { Prisma, SessionCharacterResource } from "@prisma/client";
import { badRequest } from "../../common/exceptions/domain-error";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class CharacterResourceService {
  constructor(private readonly prisma: PrismaService) {}

  private getClient(client?: Pick<Prisma.TransactionClient, "sessionCharacterResource">) {
    return client ?? this.prisma;
  }

  async getOrCreateResource(
    sessionCharacterId: string,
    defaults: {
      secondWindAvailable?: boolean;
      actionSurgeUses?: number;
      rageUses?: number;
      hitDiceSpent?: number;
    } = {},
    client?: Pick<Prisma.TransactionClient, "sessionCharacterResource">,
  ): Promise<SessionCharacterResource> {
    return this.getClient(client).sessionCharacterResource.upsert({
      where: { sessionCharacterId },
      create: {
        sessionCharacterId,
        ...defaults,
      },
      update: {},
    });
  }

  async spendSecondWind(
    sessionCharacterId: string,
    client?: Pick<Prisma.TransactionClient, "sessionCharacterResource">,
  ): Promise<SessionCharacterResource> {
    const resource = await this.getOrCreateResource(sessionCharacterId, {}, client);
    if (!resource.secondWindAvailable) {
      throw badRequest("ACTION_400", "Second Wind를 이미 사용했습니다.", {
        reason: "SECOND_WIND_UNAVAILABLE",
      });
    }

    return this.updateResource(sessionCharacterId, { secondWindAvailable: false }, client);
  }

  async spendActionSurgeUse(
    sessionCharacterId: string,
    client?: Pick<Prisma.TransactionClient, "sessionCharacterResource">,
  ): Promise<SessionCharacterResource> {
    const resource = await this.getOrCreateResource(sessionCharacterId, {}, client);
    if (resource.actionSurgeUses < 1) {
      throw badRequest("ACTION_400", "Action Surge 사용 횟수가 남아있지 않습니다.", {
        reason: "ACTION_SURGE_UNAVAILABLE",
      });
    }

    return this.updateResource(sessionCharacterId, {
      actionSurgeUses: { decrement: 1 },
    }, client);
  }

  async startRage(params: {
    sessionCharacterId: string;
    rageEndsAtRound?: number | null;
    rageEndsAtTurn?: number | null;
  }, client?: Pick<Prisma.TransactionClient, "sessionCharacterResource">): Promise<SessionCharacterResource> {
    const resource = await this.getOrCreateResource(params.sessionCharacterId, {}, client);
    if (resource.rageActive) {
      throw badRequest("ACTION_400", "이미 Rage 상태입니다.", {
        reason: "RAGE_ALREADY_ACTIVE",
      });
    }
    if (resource.rageUses < 1) {
      throw badRequest("ACTION_400", "Rage 사용 횟수가 남아있지 않습니다.", {
        reason: "RAGE_UNAVAILABLE",
      });
    }

    return this.updateResource(params.sessionCharacterId, {
      rageUses: { decrement: 1 },
      rageActive: true,
      rageEndsAtRound: params.rageEndsAtRound ?? null,
      rageEndsAtTurn: params.rageEndsAtTurn ?? null,
    }, client);
  }

  async startFrenzy(
    sessionCharacterId: string,
    client?: Pick<Prisma.TransactionClient, "sessionCharacterResource">,
  ): Promise<SessionCharacterResource> {
    const resource = await this.getOrCreateResource(sessionCharacterId, {}, client);
    if (!resource.rageActive) {
      throw badRequest("ACTION_400", "Frenzy는 Rage 중에만 시작할 수 있습니다.", {
        reason: "FRENZY_REQUIRES_RAGE",
      });
    }

    return this.updateResource(sessionCharacterId, { frenzyActive: true }, client);
  }

  async endRage(sessionCharacterId: string): Promise<SessionCharacterResource> {
    const resource = await this.getOrCreateResource(sessionCharacterId);
    const nextExhaustionLevel = resource.frenzyActive
      ? resource.exhaustionLevel + 1
      : resource.exhaustionLevel;

    return this.updateResource(sessionCharacterId, {
      rageActive: false,
      rageEndsAtRound: null,
      rageEndsAtTurn: null,
      frenzyActive: false,
      // Frenzy는 Rage 종료 시 exhaustion을 올리므로 종료 처리에서 함께 계산한다.
      exhaustionLevel: nextExhaustionLevel,
    });
  }

  async recoverShortRest(params: {
    sessionCharacterId: string;
    secondWindAvailable?: boolean;
    actionSurgeUses?: number;
    hitDiceSpent?: number;
  }, client?: Pick<Prisma.TransactionClient, "sessionCharacterResource">): Promise<SessionCharacterResource> {
    await this.getOrCreateResource(params.sessionCharacterId, {}, client);

    return this.updateResource(params.sessionCharacterId, {
      ...(params.secondWindAvailable === undefined
        ? {}
        : { secondWindAvailable: params.secondWindAvailable }),
      ...(params.actionSurgeUses === undefined
        ? {}
        : { actionSurgeUses: params.actionSurgeUses }),
      ...(params.hitDiceSpent === undefined ? {} : { hitDiceSpent: params.hitDiceSpent }),
    }, client);
  }

  async recoverLongRest(params: {
    sessionCharacterId: string;
    secondWindAvailable?: boolean;
    actionSurgeUses?: number;
    rageUses?: number;
    reduceExhaustionBy?: number;
    hitDiceSpent?: number;
  }, client?: Pick<Prisma.TransactionClient, "sessionCharacterResource">): Promise<SessionCharacterResource> {
    const resource = await this.getOrCreateResource(params.sessionCharacterId, {}, client);
    const reduceExhaustionBy = params.reduceExhaustionBy ?? 1;

    return this.updateResource(params.sessionCharacterId, {
      ...(params.secondWindAvailable === undefined
        ? {}
        : { secondWindAvailable: params.secondWindAvailable }),
      ...(params.actionSurgeUses === undefined
        ? {}
        : { actionSurgeUses: params.actionSurgeUses }),
      ...(params.rageUses === undefined ? {} : { rageUses: params.rageUses }),
      ...(params.hitDiceSpent === undefined ? {} : { hitDiceSpent: params.hitDiceSpent }),
      rageActive: false,
      rageEndsAtRound: null,
      rageEndsAtTurn: null,
      frenzyActive: false,
      exhaustionLevel: Math.max(resource.exhaustionLevel - reduceExhaustionBy, 0),
    }, client);
  }

  private updateResource(
    sessionCharacterId: string,
    data: Prisma.SessionCharacterResourceUpdateInput,
    client?: Pick<Prisma.TransactionClient, "sessionCharacterResource">,
  ): Promise<SessionCharacterResource> {
    return this.getClient(client).sessionCharacterResource.update({
      where: { sessionCharacterId },
      data,
    });
  }
}
