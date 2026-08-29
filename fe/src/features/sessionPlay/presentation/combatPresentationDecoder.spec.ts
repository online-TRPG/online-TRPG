import { describe, expect, it } from 'vitest';
import { ActionOutcome } from '@trpg/shared-types/frontend';
import type { TurnLogResponseDto } from '@trpg/shared-types';
import { decodeCombatPresentationEnvelope } from './combatPresentationDecoder';

function turnLog(presentationV1: unknown): TurnLogResponseDto {
  return {
    turnLogId: 'turn-1',
    turnNumber: 1,
    playerActionId: null,
    actorUserId: 'user-1',
    sessionCharacterId: null,
    actionClientCreatedAt: null,
    actionCreatedAt: null,
    actionQueueStatus: null,
    rawInput: null,
    structuredAction: { presentationV1 } as never,
    diceResult: null,
    stateDiff: null,
    outcome: ActionOutcome.SUCCESS,
    narration: '검 공격이 명중했습니다.',
    createdAt: '2026-08-08T00:00:00.000Z',
  };
}

describe('decodeCombatPresentationEnvelope', () => {
  it('accepts a versioned combat presentation', () => {
    const result = decodeCombatPresentationEnvelope(turnLog({
      schemaVersion: 1,
      sourceParticipantId: 'actor-1',
      delivery: 'melee',
      presetId: 'melee.slashing',
      impacts: [],
    }));

    expect(result).toMatchObject({
      turnLogId: 'turn-1',
      narration: '검 공격이 명중했습니다.',
      presentation: { schemaVersion: 1, delivery: 'melee' },
    });
  });

  it('skips unsupported versions without breaking the TurnLog flow', () => {
    expect(decodeCombatPresentationEnvelope(turnLog({
      schemaVersion: 2,
      sourceParticipantId: null,
      delivery: 'aura',
      presetId: 'future',
      impacts: [],
    }))).toBeNull();
  });

  it('rejects oversized amounts and impact arrays', () => {
    expect(decodeCombatPresentationEnvelope(turnLog({
      schemaVersion: 1,
      sourceParticipantId: 'actor-1',
      delivery: 'melee',
      presetId: 'unsafe.amount',
      impacts: [{
        targetParticipantId: 'target-1',
        outcome: 'hit',
        damagePackets: [{
          damageType: 'fire',
          rolledAmount: 1_000_000_001,
          appliedAmount: 1,
          modifiers: [],
        }],
        healingPackets: [],
        conditionChanges: [],
      }],
    }))).toBeNull();

    expect(decodeCombatPresentationEnvelope(turnLog({
      schemaVersion: 1,
      sourceParticipantId: null,
      delivery: 'aura',
      presetId: 'unsafe.impacts',
      impacts: Array.from({ length: 81 }, () => ({
        targetParticipantId: null,
        outcome: 'applied',
        damagePackets: [],
        healingPackets: [],
        conditionChanges: [],
      })),
    }))).toBeNull();
  });
});
