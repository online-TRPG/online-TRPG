import type { CSSProperties } from 'react';
import type { SessionTokenColor } from '../../../utils/sessionTokenColors';

type UseCombatNodeSurfacePresentationParams = {
  phase?: string | null;
};

function getPhaseLabel(phase: string | null | undefined) {
  if (!phase) return '상태 미확인';
  if (phase === 'combat') return '진행: 전투';
  if (phase === 'exploration') return '진행: 탐색';
  if (phase === 'dialogue') return '진행: 대화';
  if (phase === 'lobby') return '진행: 대기';
  if (phase === 'rest') return '진행: 휴식';
  return `진행: ${phase}`;
}

function getResourceFillPercent(
  current: number | null | undefined,
  max: number | null | undefined
) {
  if (typeof current !== 'number' || typeof max !== 'number' || max <= 0) return 0;
  return Math.min(100, Math.max(0, (current / max) * 100));
}

export function getCombatResourceMeterStyle(
  current: number | null | undefined,
  max: number | null | undefined
) {
  return {
    '--combat-resource-fill': `${getResourceFillPercent(current, max)}%`,
  } as CSSProperties;
}

function readParticipantColorVar(
  colorStyle: CSSProperties | undefined,
  name: '--participant-frame-color' | '--participant-bg-color' | '--participant-text-color',
  fallback: string
) {
  const value = (colorStyle as Record<string, string> | undefined)?.[name];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function getCombatTurnCardColorStyle(
  colorStyle: CSSProperties | undefined,
  fallbackColor: SessionTokenColor
): CSSProperties {
  const accentColor = readParticipantColorVar(
    colorStyle,
    '--participant-frame-color',
    fallbackColor.frame
  );
  const backgroundColor = readParticipantColorVar(
    colorStyle,
    '--participant-bg-color',
    fallbackColor.background
  );
  const textColor = readParticipantColorVar(
    colorStyle,
    '--participant-text-color',
    fallbackColor.text
  );

  return {
    ...colorStyle,
    ['--combat-turn-accent' as string]: accentColor,
    ['--combat-turn-bg' as string]: backgroundColor,
    ['--combat-turn-text' as string]: textColor,
  } as CSSProperties;
}

export function useCombatNodeSurfacePresentation({
  phase,
}: UseCombatNodeSurfacePresentationParams) {
  return {
    phaseLabel: getPhaseLabel(phase),
  };
}
