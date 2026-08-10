export type CombatTargetPoint = { x: number; y: number };

const EPSILON = 0.000001;

export function getCombatTargetDistance(from: CombatTargetPoint, to: CombatTargetPoint) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function isPointInCombatCircle({
  center,
  point,
  radius,
}: {
  center: CombatTargetPoint;
  point: CombatTargetPoint;
  radius: number;
}) {
  return getCombatTargetDistance(center, point) <= Math.max(0, radius) + EPSILON;
}

export function isPointInCombatCone({
  origin,
  target,
  point,
  length,
  angleDegrees = 90,
}: {
  origin: CombatTargetPoint;
  target: CombatTargetPoint;
  point: CombatTargetPoint;
  length: number;
  angleDegrees?: number;
}) {
  const directionLength = getCombatTargetDistance(origin, target);
  const pointLength = getCombatTargetDistance(origin, point);
  if (directionLength <= EPSILON || pointLength > Math.max(0, length) + EPSILON) return false;
  if (pointLength <= EPSILON) return true;
  const directionX = (target.x - origin.x) / directionLength;
  const directionY = (target.y - origin.y) / directionLength;
  const pointX = (point.x - origin.x) / pointLength;
  const pointY = (point.y - origin.y) / pointLength;
  const cosine = Math.max(-1, Math.min(1, directionX * pointX + directionY * pointY));
  const angle = Math.acos(cosine) * (180 / Math.PI);
  return angle <= Math.max(0, angleDegrees) / 2 + EPSILON;
}

export function isPointInCombatLine({
  origin,
  target,
  point,
  length,
  width,
}: {
  origin: CombatTargetPoint;
  target: CombatTargetPoint;
  point: CombatTargetPoint;
  length: number;
  width: number;
}) {
  const directionLength = getCombatTargetDistance(origin, target);
  if (directionLength <= EPSILON) return false;
  const directionX = (target.x - origin.x) / directionLength;
  const directionY = (target.y - origin.y) / directionLength;
  const relativeX = point.x - origin.x;
  const relativeY = point.y - origin.y;
  const along = relativeX * directionX + relativeY * directionY;
  if (along < -EPSILON || along > Math.max(0, length) + EPSILON) return false;
  const perpendicular = Math.abs(relativeX * directionY - relativeY * directionX);
  return perpendicular <= Math.max(0, width) / 2 + EPSILON;
}
