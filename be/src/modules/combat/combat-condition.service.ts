import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { ConditionRuntimeService } from "../rules/condition-runtime.service";
import type { ConditionInstance } from "../rules/condition-runtime.service";

type CombatConditionParticipant = {
  id: string;
  sessionCharacterId: string | null;
  conditionsJson: string | null;
};

const COMBAT_CONDITION_SLEEP = "combat:sleep";
const COMBAT_CONDITION_UNCONSCIOUS = "condition:unconscious";
const COMBAT_INCAPACITATING_CONDITION_TAGS = new Set([
  COMBAT_CONDITION_SLEEP,
  COMBAT_CONDITION_UNCONSCIOUS,
  "condition:incapacitated",
  "condition:paralyzed",
  "condition:petrified",
  "condition:stunned",
]);

@Injectable()
export class CombatConditionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conditionRuntime: ConditionRuntimeService,
  ) {}

  async wakeSleepingCombatParticipant(participant: CombatConditionParticipant): Promise<void> {
    const current = await this.readCombatConditionEntries(participant);
    const tags = this.combatConditionTags(current);
    if (!tags.includes(COMBAT_CONDITION_SLEEP)) {
      return;
    }
    const remaining = current.filter((entry) => {
      const entryTags = this.conditionEntryTags(entry);
      return !entryTags.includes(COMBAT_CONDITION_SLEEP) &&
        !entryTags.includes(COMBAT_CONDITION_UNCONSCIOUS);
    });
    await this.writeCombatConditionEntries(participant, remaining);
  }

  async addCombatCondition(
    participant: CombatConditionParticipant,
    condition: string,
  ): Promise<void> {
    const current = await this.readCombatConditionEntries(participant);
    if (!this.combatConditionTags(current).includes(condition)) {
      current.push(condition);
    }
    await this.writeCombatConditionEntries(participant, current);
  }

  async addCombatConditionInstance(
    participant: CombatConditionParticipant,
    condition: ConditionInstance,
  ): Promise<void> {
    const current = await this.readCombatConditionEntries(participant);
    if (condition.stackPolicy === "replace") {
      await this.writeCombatConditionEntries(
        participant,
        [
          ...current.filter((entry) => !this.conditionEntryTags(entry).includes(condition.conditionId)),
          condition,
        ],
      );
      return;
    }
    if (
      condition.stackPolicy === "ignore_duplicate" &&
      this.combatConditionTags(current).includes(condition.conditionId)
    ) {
      return;
    }
    await this.writeCombatConditionEntries(participant, [...current, condition]);
  }

  async removeCombatCondition(
    participant: CombatConditionParticipant,
    condition: string,
  ): Promise<void> {
    const current = await this.readCombatConditionEntries(participant);
    const next = current.filter((entry) => !this.conditionEntryTags(entry).includes(condition));
    if (next.length === current.length) {
      return;
    }
    await this.writeCombatConditionEntries(participant, next);
  }

  async resolveTurnEndConditions(
    participant: CombatConditionParticipant,
    roundNo: number,
    turnNo: number,
  ): Promise<number> {
    const current = await this.readCombatConditionEntries(participant);
    if (current.length === 0) {
      return 0;
    }

    const parsed = this.conditionRuntime.parseConditionsJson(JSON.stringify(current));
    const resolution = this.conditionRuntime.resolveTurnEnd(parsed, { round: roundNo, turn: turnNo });
    if (resolution.expiredConditions.length === 0 && resolution.updatedConditions.length === 0) {
      return 0;
    }

    const remainingByKey = new Map(
      resolution.conditions.map((condition) => [this.conditionEntryKey(condition), condition]),
    );
    const nextConditions = current.flatMap((entry, index) => {
      const parsedCondition = parsed[index];
      if (!parsedCondition) {
        return [];
      }
      const remaining = remainingByKey.get(this.conditionEntryKey(parsedCondition));
      if (!remaining) {
        return [];
      }
      return [typeof entry === "string" ? entry : remaining];
    });

    await this.writeCombatConditionEntries(participant, nextConditions);
    return resolution.expiredConditions.length + resolution.updatedConditions.length;
  }

  async readCombatConditions(participant: CombatConditionParticipant): Promise<string[]> {
    if (!participant.sessionCharacterId) {
      return this.parseConditions(participant.conditionsJson ?? "[]");
    }
    const sessionCharacter = await this.prisma.sessionCharacter.findUnique({
      where: { id: participant.sessionCharacterId },
      select: { conditionsJson: true },
    });
    return this.parseConditions(sessionCharacter?.conditionsJson ?? participant.conditionsJson ?? "[]");
  }

  combatConditionTags(entries: unknown[]): string[] {
    return Array.from(new Set(entries.flatMap((entry) => this.conditionEntryTags(entry))));
  }

  isCombatParticipantIncapacitated(participant: CombatConditionParticipant): boolean {
    const tags = this.parseConditions(participant.conditionsJson ?? "[]");
    return tags.some((tag) => COMBAT_INCAPACITATING_CONDITION_TAGS.has(tag));
  }

  conditionEntryTags(entry: unknown): string[] {
    return this.conditionRuntime.toConditionTags(JSON.stringify([entry]));
  }

  async writeCombatConditions(
    participant: CombatConditionParticipant,
    conditions: string[],
  ): Promise<void> {
    const conditionsJson = JSON.stringify(conditions);
    await this.prisma.combatParticipant.update({
      where: { id: participant.id },
      data: { conditionsJson },
    });
    if (participant.sessionCharacterId) {
      await this.prisma.sessionCharacter.update({
        where: { id: participant.sessionCharacterId },
        data: { conditionsJson },
      });
    }
    participant.conditionsJson = conditionsJson;
  }

  async readCombatConditionEntries(participant: CombatConditionParticipant): Promise<unknown[]> {
    const raw = participant.sessionCharacterId
      ? (await this.prisma.sessionCharacter.findUnique({
          where: { id: participant.sessionCharacterId },
          select: { conditionsJson: true },
        }))?.conditionsJson ?? participant.conditionsJson ?? "[]"
      : participant.conditionsJson ?? "[]";
    return this.parseConditionEntries(raw);
  }

  async writeCombatConditionEntries(
    participant: CombatConditionParticipant,
    conditions: unknown[],
  ): Promise<void> {
    const conditionsJson = JSON.stringify(conditions);
    await this.prisma.combatParticipant.update({
      where: { id: participant.id },
      data: { conditionsJson },
    });
    if (participant.sessionCharacterId) {
      await this.prisma.sessionCharacter.update({
        where: { id: participant.sessionCharacterId },
        data: { conditionsJson },
      });
    }
    participant.conditionsJson = conditionsJson;
  }

  conditionEntryKey(condition: {
    conditionId: string;
    sourceId: string | null;
    appliedAtRound: number | null;
  }): string {
    return `${condition.conditionId}:${condition.sourceId ?? ""}:${condition.appliedAtRound ?? ""}`;
  }

  private parseConditions(value: string): string[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.flatMap((entry) =>
            typeof entry === "string"
              ? [entry]
              : this.conditionEntryTags(entry),
          )
        : [];
    } catch {
      return [];
    }
  }

  private parseConditionEntries(value: string): unknown[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
