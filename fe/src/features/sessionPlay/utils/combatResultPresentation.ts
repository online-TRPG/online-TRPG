import type {
  CombatActionResultDto,
  CombatMoveResultDto,
  CombatReactionPromptDto,
  CombatResponseDto,
} from '@trpg/shared-types';
import type { Character } from '../../../types/session';

export function getCompletedCombatNodeIds(flags: Record<string, unknown> | undefined): Set<string> {
  const value = flags?.completedCombatNodeIds;
  return new Set(
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  );
}

export function isCombatResponseDto(value: unknown): value is CombatResponseDto {
  if (!value || typeof value !== 'object') return false;
  return (
    'combatId' in value &&
    'participants' in value &&
    Array.isArray((value as { participants?: unknown }).participants)
  );
}

export function isCombatActionResultDto(value: unknown): value is CombatActionResultDto {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'combat' in value &&
      'message' in value &&
      typeof (value as { message?: unknown }).message === 'string'
  );
}

export function isCombatReactionPromptDto(value: unknown): value is CombatReactionPromptDto {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { id?: unknown }).id === 'string' &&
      ['opportunity_attack', 'shield', 'ready_action', 'counterspell'].includes(
        String((value as { type?: unknown }).type)
      ) &&
      typeof (value as { reactorParticipantId?: unknown }).reactorParticipantId === 'string' &&
      typeof (value as { message?: unknown }).message === 'string'
  );
}

export function getCombatReactionPrompts(result: {
  pendingReaction?: CombatReactionPromptDto | null;
  pendingReactions?: CombatReactionPromptDto[] | null;
}): CombatReactionPromptDto[] {
  const prompts = [
    ...(Array.isArray(result.pendingReactions) ? result.pendingReactions : []),
    result.pendingReaction,
  ].filter(isCombatReactionPromptDto);
  const seen = new Set<string>();
  return prompts.filter((prompt) => {
    if (seen.has(prompt.id)) return false;
    seen.add(prompt.id);
    return true;
  });
}

export function getCombatReactionTypeLabel(type: CombatReactionPromptDto['type']) {
  switch (type) {
    case 'opportunity_attack':
      return '기회공격';
    case 'shield':
      return 'Shield 반응';
    case 'ready_action':
      return '준비행동';
    case 'counterspell':
      return 'Counterspell 반응';
    default:
      return '반응';
  }
}

export function buildCombatReactionBannerPresentation(
  reaction: CombatReactionPromptDto | null,
) {
  if (!reaction) return null;

  return {
    ariaLabel: '전투 반응 대기',
    eyebrow: getCombatReactionTypeLabel(reaction.type),
    title: `${reaction.reactorName} 반응 선택`,
    message: reaction.message,
    declineLabel: '포기',
    acceptLabel: '사용',
  };
}

export function isCombatReactionForUser(params: {
  reaction: CombatReactionPromptDto;
  combat: CombatResponseDto | null;
  sessionCharacters: Character[];
  userId: string;
}): boolean {
  return Boolean(
    params.combat?.participants.some(
      (candidate) =>
        candidate.sessionEntityId === params.reaction.reactorParticipantId &&
        candidate.sessionCharacterId &&
        params.sessionCharacters.some(
          (character) => character.id === candidate.sessionCharacterId && character.userId === params.userId
        )
    )
  );
}

export function isMissingCombatError(message: string) {
  return (
    message.includes('COMBAT_404') ||
    message.includes('ACTIVE_COMBAT_NOT_FOUND') ||
    message.includes('전투가 존재하지 않습니다') ||
    message.includes('(404)')
  );
}

export function logCombatRequestSucceeded(sessionId: string, combat: CombatResponseDto) {
  const currentParticipant =
    combat.participants.find((participant) => participant.sessionEntityId === combat.currentEntityId) ?? null;
  console.info('[COMBAT_REQUEST_SUCCEEDED]', {
    sessionId,
    combatId: combat.combatId,
    status: combat.status,
    roundNo: combat.roundNo,
    turnNo: combat.turnNo,
    currentEntityId: combat.currentEntityId,
    currentParticipant: currentParticipant
      ? {
          id: currentParticipant.sessionEntityId,
          name: currentParticipant.name,
          type: currentParticipant.entityType,
          isHostile: currentParticipant.isHostile,
          isAlive: currentParticipant.isAlive,
        }
      : null,
    participants: combat.participants.map((participant) => ({
      id: participant.sessionEntityId,
      name: participant.name,
      type: participant.entityType,
      isHostile: participant.isHostile,
      isAlive: participant.isAlive,
      turnOrder: participant.turnOrder,
      initiative: participant.initiative,
    })),
  });
}

export function formatCombatMoveResultMessage(result: unknown): string {
  const source = result && typeof result === 'object'
    ? (result as {
        message?: string | null;
        movementDistanceFt?: number | null;
        movementCostFt?: number | null;
      })
    : {};
  const baseMessage = source.message?.trim() || '전투 이동을 처리했습니다.';
  const movementDistanceFt =
    typeof source.movementDistanceFt === 'number' ? source.movementDistanceFt : null;
  const movementCostFt = typeof source.movementCostFt === 'number' ? source.movementCostFt : null;

  if (
    movementDistanceFt !== null &&
    movementCostFt !== null &&
    movementCostFt !== movementDistanceFt &&
    !/소모\s*\d+\s*ft/i.test(baseMessage)
  ) {
    return `${baseMessage} / 이동 소모 ${movementCostFt}ft`;
  }

  return baseMessage;
}

export function formatCombatActionResultMessage(result: CombatActionResultDto): string {
  const baseMessage = result.message?.trim() || '전투 행동을 처리했습니다.';
  const details: string[] = [];

  if (
    typeof result.attackTotal === 'number' &&
    !/(명중|공격|attack)\s*(굴림|총합|total)?\s*\d+/i.test(baseMessage)
  ) {
    details.push(`명중 ${result.attackTotal}`);
  }

  if (
    typeof result.damageTotal === 'number' &&
    result.damageTotal > 0 &&
    !/(피해|damage)\s*\d+/i.test(baseMessage)
  ) {
    details.push(`피해 ${result.damageTotal}`);
  }

  return details.length ? `${baseMessage} / ${details.join(' / ')}` : baseMessage;
}
