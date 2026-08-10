import type { VttMapStateDto } from '@trpg/shared-types';
import {
  isPointInCombatCircle,
  isPointInCombatCone,
  isPointInCombatLine,
} from '@trpg/shared-types/frontend';
import type {
  CombatTargetPreview,
  CombatTargetingMode,
} from './combatEffectTypes';

type VttToken = VttMapStateDto['tokens'][number];
type Point = { x: number; y: number };

function centerOf(token: VttToken): Point {
  return { x: token.x + token.size / 2, y: token.y + token.size / 2 };
}

function gridDistanceFt(from: Point, to: Point, gridSize: number) {
  const fromColumn = Math.floor(from.x / gridSize);
  const fromRow = Math.floor(from.y / gridSize);
  const toColumn = Math.floor(to.x / gridSize);
  const toRow = Math.floor(to.y / gridSize);
  return Math.max(Math.abs(toColumn - fromColumn), Math.abs(toRow - fromRow)) * 5;
}

function tokenAtPoint(tokens: VttToken[], point: Point) {
  return tokens.find((token) =>
    point.x >= token.x && point.x <= token.x + token.size &&
    point.y >= token.y && point.y <= token.y + token.size,
  ) ?? null;
}

export function projectCombatTargetPreview({
  mode,
  point,
  tokens,
  gridSize,
}: {
  mode: CombatTargetingMode;
  point: Point | null;
  tokens: VttToken[];
  gridSize: number;
}): CombatTargetPreview {
  const sourceToken = tokens.find((token) => token.id === mode.sourceTokenId) ?? null;
  const source = sourceToken ? centerOf(sourceToken) : null;
  const hoveredToken = point && mode.shape === 'single' ? tokenAtPoint(tokens, point) : null;
  const evaluationPoint = hoveredToken ? centerOf(hoveredToken) : point;
  const inRange = Boolean(
    source && evaluationPoint && gridDistanceFt(source, evaluationPoint, gridSize) <= mode.rangeFt,
  );
  const pixelPerFoot = gridSize / 5;
  let visibleAffectedTokenIds: string[] = [];

  if (source && point && mode.geometryKnown) {
    if (mode.shape === 'single') {
      visibleAffectedTokenIds = hoveredToken && mode.eligibleTokenIds.includes(hoveredToken.id) && inRange
        ? [hoveredToken.id]
        : [];
    } else if (mode.shape === 'circle') {
      const radius = (mode.radiusFt ?? 0) * pixelPerFoot;
      visibleAffectedTokenIds = tokens
        .filter((token) => isPointInCombatCircle({ center: point, point: centerOf(token), radius }))
        .map((token) => token.id);
    } else if (mode.shape === 'cone') {
      visibleAffectedTokenIds = tokens
        .filter((token) => isPointInCombatCone({
          origin: source,
          target: point,
          point: centerOf(token),
          length: (mode.lengthFt ?? mode.rangeFt) * pixelPerFoot,
          angleDegrees: mode.angleDegrees,
        }))
        .map((token) => token.id);
    } else {
      visibleAffectedTokenIds = tokens
        .filter((token) => isPointInCombatLine({
          origin: source,
          target: point,
          point: centerOf(token),
          length: (mode.lengthFt ?? mode.rangeFt) * pixelPerFoot,
          width: (mode.widthFt ?? 5) * pixelPerFoot,
        }))
        .map((token) => token.id);
    }
  }

  let validity: CombatTargetPreview['validity'] = 'unknown';
  let reasonLabel: string | null = point ? '서버 판정 필요' : '지점을 가리키세요';
  if (point && !source) {
    validity = 'invalid';
    reasonLabel = '시전자 위치를 찾을 수 없음';
  } else if (point && !inRange) {
    validity = 'invalid';
    reasonLabel = '사거리 밖';
  } else if (point && mode.shape === 'single') {
    if (!hoveredToken) {
      reasonLabel = '대상을 가리키세요';
    } else if (mode.defeatedTokenIds.includes(hoveredToken.id)) {
      validity = 'invalid';
      reasonLabel = '쓰러진 대상';
    } else if (!mode.eligibleTokenIds.includes(hoveredToken.id)) {
      validity = 'invalid';
      reasonLabel = '대상 종류가 맞지 않음';
    } else {
      validity = 'valid';
      reasonLabel = '사용 가능';
    }
  } else if (point && mode.geometryKnown) {
    validity = 'valid';
    reasonLabel = '예상 범위 · 서버 최종 판정';
  }

  return {
    ...mode,
    point,
    validity,
    visibleAffectedTokenIds,
    reasonLabel,
  };
}
