import { useMemo } from 'react';
import {
  readCompletedCombatNodeIdsFromSessionFlags,
  readVttMapFromSessionFlags,
  type SessionStateFlags,
} from '../utils/sessionStateFlags';

type EconomyStateProjection = {
  partyStash?: Array<{
    itemDefinitionId: string;
    quantity: number;
    identified?: boolean;
    damaged?: boolean;
    attunedBySessionCharacterId?: string | null;
    chargesRemaining?: number | null;
  }>;
  walletsBySessionCharacterId?: Record<string, { cp?: number; sp?: number; ep?: number; gp?: number; pp?: number }>;
  shopStatesById?: Record<string, { shopId: string; inventory: Array<{ itemDefinitionId: string; quantity: number; priceGp: number }> }>;
  craftingProgressById?: Record<
    string,
    {
      craftingId: string;
      recipeId: string;
      sessionCharacterId: string;
      outputItemDefinitionId: string;
      completedHours: number;
      requiredHours: number;
      status: string;
    }
  >;
};

type CampaignCalendarStateProjection = {
  inGameDate?: string | null;
  elapsedDays?: number;
  scheduleProposals?: Array<{
    id: string;
    title?: string;
    startsAt?: string;
    durationMinutes?: number;
    timeZone?: string;
    status?: string;
    responses?: Array<{ id: string; userId: string; availability: string; note?: string | null }>;
  }>;
  timeline?: Array<{ id: string; type: string; inGameDate?: string | null; elapsedDays?: number; note?: string | null }>;
  downtimeTasks?: Array<{
    id: string;
    type: string;
    sessionCharacterId: string;
    title?: string;
    status?: string;
    costGp?: number;
    workDaysRequired?: number;
    workDaysCompleted?: number;
    requiredTools?: string[];
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;
}

function compactMap<TInput, TOutput>(
  values: TInput[],
  map: (value: TInput) => TOutput | null,
): TOutput[] {
  return values.flatMap((value) => {
    const mapped = map(value);
    return mapped === null ? [] : [mapped];
  });
}

function optionalStringField(record: Record<string, unknown>, key: string): Record<string, string> {
  const value = readString(record[key]);
  return value === null ? {} : { [key]: value };
}

function optionalNullableStringField(record: Record<string, unknown>, key: string): Record<string, string | null> {
  const value = record[key];
  return value === null || typeof value === 'string' ? { [key]: value } : {};
}

function optionalNumberField(record: Record<string, unknown>, key: string): Record<string, number> {
  const value = readNumber(record[key]);
  return value === null ? {} : { [key]: value };
}

function optionalBooleanField(record: Record<string, unknown>, key: string): Record<string, boolean> {
  return typeof record[key] === 'boolean' ? { [key]: record[key] } : {};
}

function readEconomyState(flags: SessionStateFlags): EconomyStateProjection | null {
  if (!flags || !isRecord(flags.economy)) return null;
  const economy = flags.economy;

  const partyStash = Array.isArray(economy.partyStash)
    ? compactMap(
        economy.partyStash,
        (entry) => {
          if (!isRecord(entry)) return null;
          const itemDefinitionId = readString(entry.itemDefinitionId);
          const quantity = readNumber(entry.quantity);
          if (!itemDefinitionId || quantity === null) return null;
          return {
            itemDefinitionId,
            quantity,
            ...optionalBooleanField(entry, 'identified'),
            ...optionalBooleanField(entry, 'damaged'),
            ...optionalNullableStringField(entry, 'attunedBySessionCharacterId'),
            ...(entry.chargesRemaining === null ? { chargesRemaining: null } : optionalNumberField(entry, 'chargesRemaining')),
          };
        },
      )
    : undefined;

  const walletsBySessionCharacterId = isRecord(economy.walletsBySessionCharacterId)
    ? Object.fromEntries(
        compactMap(
          Object.entries(economy.walletsBySessionCharacterId),
          ([id, wallet]) => {
            if (!isRecord(wallet)) return null;
            return [
              id,
              {
                ...optionalNumberField(wallet, 'cp'),
                ...optionalNumberField(wallet, 'sp'),
                ...optionalNumberField(wallet, 'ep'),
                ...optionalNumberField(wallet, 'gp'),
                ...optionalNumberField(wallet, 'pp'),
              },
            ] as const;
          },
        ),
      )
    : undefined;

  const shopStatesById = isRecord(economy.shopStatesById)
    ? Object.fromEntries(
        compactMap(
          Object.entries(economy.shopStatesById),
          ([id, shop]) => {
            if (!isRecord(shop)) return null;
            const shopId = readString(shop.shopId);
            if (!shopId || !Array.isArray(shop.inventory)) return null;
            const inventory = compactMap(
              shop.inventory,
              (entry) => {
                if (!isRecord(entry)) return null;
                const itemDefinitionId = readString(entry.itemDefinitionId);
                const quantity = readNumber(entry.quantity);
                const priceGp = readNumber(entry.priceGp);
                return itemDefinitionId && quantity !== null && priceGp !== null
                  ? { itemDefinitionId, quantity, priceGp }
                  : null;
              },
            );
            return [id, { shopId, inventory }] as const;
          },
        ),
      )
    : undefined;

  const craftingProgressById = isRecord(economy.craftingProgressById)
    ? Object.fromEntries(
        compactMap(
          Object.entries(economy.craftingProgressById),
          ([id, progress]) => {
            if (!isRecord(progress)) return null;
            const craftingId = readString(progress.craftingId);
            const recipeId = readString(progress.recipeId);
            const sessionCharacterId = readString(progress.sessionCharacterId);
            const outputItemDefinitionId = readString(progress.outputItemDefinitionId);
            const completedHours = readNumber(progress.completedHours);
            const requiredHours = readNumber(progress.requiredHours);
            const status = readString(progress.status);
            return craftingId &&
              recipeId &&
              sessionCharacterId &&
              outputItemDefinitionId &&
              completedHours !== null &&
              requiredHours !== null &&
              status
              ? [id, { craftingId, recipeId, sessionCharacterId, outputItemDefinitionId, completedHours, requiredHours, status }] as const
              : null;
          },
        ),
      )
    : undefined;

  return {
    ...(partyStash ? { partyStash } : {}),
    ...(walletsBySessionCharacterId ? { walletsBySessionCharacterId } : {}),
    ...(shopStatesById ? { shopStatesById } : {}),
    ...(craftingProgressById ? { craftingProgressById } : {}),
  };
}

function readCampaignCalendarState(flags: SessionStateFlags): CampaignCalendarStateProjection | null {
  if (!flags || !isRecord(flags.campaignCalendar)) return null;
  const calendar = flags.campaignCalendar;

  const scheduleProposals = Array.isArray(calendar.scheduleProposals)
    ? compactMap(
        calendar.scheduleProposals,
        (entry) => {
          if (!isRecord(entry)) return null;
          const id = readString(entry.id);
          if (!id) return null;
          const responses = Array.isArray(entry.responses)
            ? compactMap(
                entry.responses,
                (response) => {
                  if (!isRecord(response)) return null;
                  const responseId = readString(response.id);
                  const userId = readString(response.userId);
                  const availability = readString(response.availability);
                  return responseId && userId && availability
                    ? { id: responseId, userId, availability, ...optionalNullableStringField(response, 'note') }
                    : null;
                },
              )
            : undefined;
          return {
            id,
            ...optionalStringField(entry, 'title'),
            ...optionalStringField(entry, 'startsAt'),
            ...optionalNumberField(entry, 'durationMinutes'),
            ...optionalStringField(entry, 'timeZone'),
            ...optionalStringField(entry, 'status'),
            ...(responses ? { responses } : {}),
          };
        },
      )
    : undefined;

  const timeline = Array.isArray(calendar.timeline)
    ? compactMap(
        calendar.timeline,
        (entry) => {
          if (!isRecord(entry)) return null;
          const id = readString(entry.id);
          const type = readString(entry.type);
          return id && type
            ? {
                id,
                type,
                ...optionalNullableStringField(entry, 'inGameDate'),
                ...optionalNumberField(entry, 'elapsedDays'),
                ...optionalNullableStringField(entry, 'note'),
              }
            : null;
        },
      )
    : undefined;

  const downtimeTasks = Array.isArray(calendar.downtimeTasks)
    ? compactMap(
        calendar.downtimeTasks,
        (entry) => {
          if (!isRecord(entry)) return null;
          const id = readString(entry.id);
          const type = readString(entry.type);
          const sessionCharacterId = readString(entry.sessionCharacterId);
          if (!id || !type || !sessionCharacterId) return null;
          const requiredTools = readStringArray(entry.requiredTools);
          return {
            id,
            type,
            sessionCharacterId,
            ...optionalStringField(entry, 'title'),
            ...optionalStringField(entry, 'status'),
            ...optionalNumberField(entry, 'costGp'),
            ...optionalNumberField(entry, 'workDaysRequired'),
            ...optionalNumberField(entry, 'workDaysCompleted'),
            ...(requiredTools ? { requiredTools } : {}),
          };
        },
      )
    : undefined;

  return {
    ...optionalNullableStringField(calendar, 'inGameDate'),
    ...optionalNumberField(calendar, 'elapsedDays'),
    ...(scheduleProposals ? { scheduleProposals } : {}),
    ...(timeline ? { timeline } : {}),
    ...(downtimeTasks ? { downtimeTasks } : {}),
  };
}

type UseSessionStateFlagsProjectionParams = {
  flags: SessionStateFlags;
};

export function useSessionStateFlagsProjection({
  flags,
}: UseSessionStateFlagsProjectionParams) {
  return useMemo(
    () => ({
      economyState: readEconomyState(flags),
      campaignCalendarState: readCampaignCalendarState(flags),
      snapshotVttMap: readVttMapFromSessionFlags(flags),
      completedCombatNodeIds: readCompletedCombatNodeIdsFromSessionFlags(flags),
      isPartyDefeated: flags?.partyDefeated === true,
    }),
    [flags],
  );
}
