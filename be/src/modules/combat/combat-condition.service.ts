import { Injectable } from "@nestjs/common";
import {
  SRD_COMBAT_CONDITION_IDS,
  type CombatConditionViewDto,
} from "@trpg/shared-types";
import { parseJsonOrThrow } from "../../common/utils/json-runtime";
import { PrismaService } from "../../database/prisma.service";
import { ConditionRuntimeService } from "../rules/condition-runtime.service";
import type { ConditionInstance, ConditionStateEntry } from "../rules/condition-runtime.service";

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
const DISPLAY_PRIORITY_CONDITION_IDS = new Set<string>([
  ...SRD_COMBAT_CONDITION_IDS,
  "condition.burning",
  "condition.concentration",
  "condition.dodge",
  "condition.disengage",
  "condition.hidden",
  "condition.rage",
  "condition.sleep",
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

  combatConditionTags(entries: ConditionStateEntry[]): string[] {
    return Array.from(new Set(entries.flatMap((entry) => this.conditionEntryTags(entry))));
  }

  combatConditionViews(entries: ConditionStateEntry[]): CombatConditionViewDto[] {
    const views = entries.flatMap((entry) => {
      const directConditionId = this.toDisplayConditionId(
        typeof entry === "string" ? entry : entry.conditionId,
      );
      const tags = typeof entry === "string" ? [entry] : entry.tags;
      const taggedConditionIds = tags.flatMap((tag) => {
        const conditionId = this.toDisplayConditionId(tag);
        return conditionId && DISPLAY_PRIORITY_CONDITION_IDS.has(conditionId)
          ? [conditionId]
          : [];
      });
      const conditionIds = taggedConditionIds.length
        ? Array.from(new Set(taggedConditionIds))
        : directConditionId
          ? [directConditionId]
          : [];
      const remainingRounds =
        typeof entry !== "string" && entry.duration.type === "rounds"
          ? entry.duration.remaining
          : null;
      return conditionIds.map((conditionId) => ({
          conditionId,
          sourceId: typeof entry === "string" ? null : entry.sourceId,
          polarity: this.resolveConditionPolarity(conditionId, tags),
          remainingRounds,
        } satisfies CombatConditionViewDto));
    });

    return Array.from(
      new Map(
        views.map((view) => [
          `${view.conditionId}:${view.sourceId ?? ""}`,
          view,
        ]),
      ).values(),
    );
  }

  isCombatParticipantIncapacitated(participant: CombatConditionParticipant): boolean {
    const tags = this.parseConditions(participant.conditionsJson ?? "[]");
    return tags.some((tag) => COMBAT_INCAPACITATING_CONDITION_TAGS.has(tag));
  }

  conditionEntryTags(entry: ConditionStateEntry): string[] {
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

  async readCombatConditionEntries(participant: CombatConditionParticipant): Promise<ConditionStateEntry[]> {
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
    conditions: ConditionStateEntry[],
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
    return this.parseConditionEntries(value).flatMap((entry) =>
      typeof entry === "string" ? [entry] : this.conditionEntryTags(entry),
    );
  }

  private parseConditionEntries(value: string): ConditionStateEntry[] {
    return parseJsonOrThrow(
      value,
      [],
      (parsed) => this.decodeConditionEntries(parsed),
      "sessionCharacter.conditionsJson",
    );
  }

  private decodeConditionEntries(value: unknown): ConditionStateEntry[] {
    if (!Array.isArray(value)) {
      throw new Error("conditions must be an array.");
    }
    return value.map((entry, index) => {
      if (typeof entry === "string") {
        return entry;
      }
      const [condition] = this.conditionRuntime.parseConditionsJson(JSON.stringify([entry]));
      if (!condition) {
        throw new Error(`conditions[${index}] is invalid.`);
      }
      return condition;
    });
  }

  private toDisplayConditionId(value: string): string | null {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    const runtimeConditionIds: Record<string, string> = {
      "combat:dodge": "condition.dodge",
      "combat:disengage": "condition.disengage",
      "combat:hidden": "condition.hidden",
      "combat:sleep": "condition.sleep",
      "condition:unconscious": "condition.unconscious",
    };
    if (runtimeConditionIds[normalized]) {
      return runtimeConditionIds[normalized];
    }
    if (normalized.startsWith("condition.")) {
      return normalized;
    }
    if (/^condition:[a-z0-9_]+$/.test(normalized)) {
      return `condition.${normalized.slice("condition:".length)}`;
    }
    return null;
  }

  private resolveConditionPolarity(
    conditionId: string,
    tags: string[],
  ): CombatConditionViewDto["polarity"] {
    if (
      [
        "condition.invisible",
        "condition.concentration",
        "condition.dodge",
        "condition.disengage",
        "condition.hidden",
        "condition.rage",
      ].includes(conditionId)
    ) {
      return "beneficial";
    }
    if (
      SRD_COMBAT_CONDITION_IDS.includes(
        conditionId as (typeof SRD_COMBAT_CONDITION_IDS)[number],
      ) ||
      conditionId === "condition.burning" ||
      conditionId === "condition.sleep"
    ) {
      return "harmful";
    }
    if (
      tags.some((tag) =>
        tag.startsWith("roll_bonus:") ||
        tag.startsWith("temporary_hp:") ||
        tag.startsWith("advantage:") ||
        tag.startsWith("grant:") ||
        tag.startsWith("movement_speed_bonus:"),
      )
    ) {
      return "beneficial";
    }
    if (
      conditionId.startsWith("condition.spell.") ||
      tags.some((tag) =>
        tag.startsWith("condition:") ||
        tag.startsWith("disadvantage:") ||
        tag.startsWith("damage_over_time:") ||
        tag === "action_blocked" ||
        tag === "reaction_blocked" ||
        tag === "movement_blocked" ||
        tag === "speed:zero",
      )
    ) {
      return "harmful";
    }
    return "neutral";
  }
}
