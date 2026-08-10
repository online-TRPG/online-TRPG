import { describe, expect, it } from 'vitest';
import type {
  CombatReactionPromptDto,
  CombatResponseDto,
} from '@trpg/shared-types';
import { projectCombatMapAttention } from './combatMapAttention';

function combatFixture(): CombatResponseDto {
  return {
    combatId: 'combat-1',
    sessionId: 'session-1',
    status: 'active',
    roundNo: 1,
    turnNo: 1,
    roundTurnNo: 1,
    currentEntityId: 'caster',
    participants: [
      {
        sessionEntityId: 'caster', tokenId: 'token-caster', concentration: {
          spellId: 'spell.hold_person', targetIds: ['visible-target', 'hidden-target'],
          effectIds: [], startedAtRound: 1, endsAtRound: null, endsAtTurn: null,
        },
      },
      { sessionEntityId: 'visible-target', tokenId: 'token-visible', concentration: null },
      { sessionEntityId: 'hidden-target', tokenId: 'token-hidden', concentration: null },
    ] as CombatResponseDto['participants'],
  };
}

describe('projectCombatMapAttention', () => {
  it('projects only visible active, reaction, and concentration tokens', () => {
    const pendingReaction = {
      id: 'reaction-1', type: 'shield', reactorParticipantId: 'visible-target',
      reactorName: 'Target', moverParticipantId: 'caster', moverName: 'Caster', message: 'React?',
    } satisfies CombatReactionPromptDto;
    expect(projectCombatMapAttention({
      combat: combatFixture(), pendingReaction,
      visibleTokenIds: new Set(['token-caster', 'token-visible']),
    })).toEqual({
      activeTokenId: 'token-caster',
      reactingTokenIds: ['token-visible'],
      concentrationCasters: [{
        tokenId: 'token-caster', visibleTargetTokenIds: ['token-visible'],
      }],
    });
  });

  it('does not leak attention state for tokens outside visibility', () => {
    expect(projectCombatMapAttention({
      combat: combatFixture(), pendingReaction: null, visibleTokenIds: new Set(),
    })).toEqual({ activeTokenId: null, reactingTokenIds: [], concentrationCasters: [] });
  });
});
