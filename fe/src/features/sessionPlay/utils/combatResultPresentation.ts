import type {
  CombatActionResultDto,
  CombatReactionPromptDto,
  CombatResponseDto,
} from '@trpg/shared-types';
import {
  decodeCombatActionResult,
  decodeCombatReactionPrompt,
  decodeCombatResponse,
  isRecord,
} from '@trpg/shared-types/frontend';
import type { Character } from '../../../types/session';

export function isCombatResponseDto(value: unknown): value is CombatResponseDto {
  try {
    decodeCombatResponse(value);
    return true;
  } catch {
    return false;
  }
}

export function isCombatActionResultDto(value: unknown): value is CombatActionResultDto {
  try {
    decodeCombatActionResult(value);
    return true;
  } catch {
    return false;
  }
}

export function isCombatReactionPromptDto(value: unknown): value is CombatReactionPromptDto {
  try {
    decodeCombatReactionPrompt(value);
    return true;
  } catch {
    return false;
  }
}

export function getCombatReactionPrompts(result: unknown): CombatReactionPromptDto[] {
  if (!isRecord(result)) {
    return [];
  }
  const prompts = [
    ...(Array.isArray(result.pendingReactions) ? result.pendingReactions : []),
    result.pendingReaction,
  ].flatMap((candidate): CombatReactionPromptDto[] => {
    try {
      return [decodeCombatReactionPrompt(candidate)];
    } catch {
      return [];
    }
  });
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
  const source = isRecord(result) ? result : {};
  const baseMessage = typeof source.message === 'string' && source.message.trim()
    ? source.message.trim()
    : '전투 이동을 처리했습니다.';
  const movementDistanceFt = readFiniteNumberOrNull(source.movementDistanceFt);
  const movementCostFt = readFiniteNumberOrNull(source.movementCostFt);

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
  const attackTotal = readFiniteNumberOrNull(result.attackTotal);
  const damageTotal = readFiniteNumberOrNull(result.damageTotal);

  if (
    attackTotal !== null &&
    !/(명중|공격|attack)\s*(굴림|총합|total)?\s*\d+/i.test(baseMessage)
  ) {
    details.push(`명중 ${attackTotal}`);
  }

  if (
    damageTotal !== null &&
    damageTotal > 0 &&
    !/(피해|damage)\s*\d+/i.test(baseMessage)
  ) {
    details.push(`피해 ${damageTotal}`);
  }

  return details.length ? `${baseMessage} / ${details.join(' / ')}` : baseMessage;
}

function readFiniteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
