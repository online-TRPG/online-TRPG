import {
  MONSTER_ACTION_UNAVAILABLE_REASONS,
} from '@trpg/shared-types/frontend';
import type {
  MonsterActionUnavailableReason,
} from '@trpg/shared-types';
import { GameIcon } from '../../../components/GameIcon';
import type { GameIconName } from '../../../components/GameIcon';
import { getSpellIconName } from '../../spells/spellPresentation';

type MonsterActionPresentationInput = {
  rangeFt?: number | null;
  longRangeFt?: number | null;
  unavailableReason?: string | null;
  available?: boolean | null;
  targetKind?: string | null;
  resolutionKind?: string | null;
  childActions?: Array<{ actionId: string; count: number }> | null;
  save?: { ability?: string | null; fixedDc?: number | null } | null;
  conditionRiders?: string[] | null;
  effectTags?: string[] | null;
  recharge?: string | null;
  usage?: string | null;
};

const monsterActionUnavailableLabels: Record<MonsterActionUnavailableReason, string> = {
  [MONSTER_ACTION_UNAVAILABLE_REASONS.RECHARGE_EXPENDED]: '재충전 대기',
  [MONSTER_ACTION_UNAVAILABLE_REASONS.LIMITED_USE_EXPENDED]: '사용 완료',
};

const combatActionIconNames: Partial<Record<string, GameIconName>> = {
  공격: 'game-icons:crossed-swords',
  '보조 공격': 'game-icons:two-handed-sword',
  도약: 'game-icons:jump-across',
  대시: 'game-icons:running-shoe',
  회피: 'game-icons:dodge',
  숨기: 'game-icons:ninja-mask',
  준비: 'game-icons:time-trap',
  기절: 'game-icons:knockout',
  중독: 'game-icons:poison-bottle',
  넘어짐: 'game-icons:falling',
  화상: 'game-icons:burning-round-shot',
  'Second Wind': 'game-icons:health-increase',
  Rage: 'game-icons:muscle-up',
  Frenzy: 'game-icons:axe-swing',
  'Bardic Inspiration': 'game-icons:sing',
  'Channel Divinity': 'game-icons:holy-symbol',
  'Preserve Life': 'game-icons:holy-symbol',
  'Wild Shape': 'game-icons:wolf-head',
  Ki: 'game-icons:monk-face',
  'Patient Defense': 'game-icons:dodge',
  'Step of the Wind': 'game-icons:wind-slap',
  'Divine Sense': 'game-icons:divine-sight',
  'Lay on Hands': 'game-icons:healing',
  'Primeval Awareness': 'game-icons:forest',
  'Action Surge': 'game-icons:winged-sword',
  'Sneak Attack': 'game-icons:sharp-smile',
  'Cunning Dash': 'game-icons:sprint',
  'Cunning Disengage': 'game-icons:dodging',
  'Cunning Hide': 'game-icons:hidden',
  'Create Spell Slot': 'game-icons:magic-swirl',
  'Chill Touch': 'game-icons:ice-bolt',
  'Fire Bolt': 'game-icons:fireball',
  'Ray of Frost': 'game-icons:ice-bolt',
  'Sacred Flame': 'game-icons:holy-hand-grenade',
  Light: 'game-icons:sun',
  'Detect Magic': 'game-icons:magic-eye',
  Bless: 'game-icons:angel-outfit',
  Bane: 'game-icons:evil-eyes',
  'Magic Missile': 'game-icons:magic-swirl',
  'Burning Hands': 'game-icons:fire-breath',
  Thunderwave: 'game-icons:sonic-boom',
  Entangle: 'game-icons:vines',
  'Cure Wounds': 'game-icons:health-increase',
  Shield: 'game-icons:magic-shield',
  Sleep: 'game-icons:night-sleep',
  Fireball: 'game-icons:fireball',
};

function getCombatActionIconName(label: string): GameIconName | undefined {
  return combatActionIconNames[label];
}

function isMonsterActionUnavailableReason(value: unknown): value is MonsterActionUnavailableReason {
  return (
    value === MONSTER_ACTION_UNAVAILABLE_REASONS.RECHARGE_EXPENDED ||
    value === MONSTER_ACTION_UNAVAILABLE_REASONS.LIMITED_USE_EXPENDED
  );
}

export function CombatActionButtonContent({
  label,
  spellId,
}: {
  label: string;
  spellId?: string | null;
}) {
  const iconName = spellId ? getSpellIconName(spellId, label) : getCombatActionIconName(label);

  if (!iconName) return <span className="combat-action-button-label">{label}</span>;

  return (
    <>
      <GameIcon name={iconName} size={36} className="combat-action-button-icon" />
      <span className="combat-action-button-label">{label}</span>
    </>
  );
}

export function getMonsterActionRangeLabel(action: MonsterActionPresentationInput) {
  if (!action.rangeFt) return null;
  if (action.longRangeFt && action.longRangeFt > action.rangeFt) {
    return `${action.rangeFt}/${action.longRangeFt}ft`;
  }
  return `${action.rangeFt}ft`;
}

export function getMonsterActionUnavailableLabel(action: MonsterActionPresentationInput) {
  if (isMonsterActionUnavailableReason(action.unavailableReason)) {
    return monsterActionUnavailableLabels[action.unavailableReason];
  }
  return action.available === false ? '사용 불가' : null;
}

export function getMonsterActionSummaryLabels(action: MonsterActionPresentationInput) {
  const labels: string[] = [];
  if (action.targetKind === 'single_target') labels.push('Target');
  if (action.targetKind === 'self') labels.push('Self');
  if (action.targetKind === 'area') labels.push('Area');
  if (action.resolutionKind === 'attack') labels.push('Attack');
  if (action.resolutionKind === 'save') labels.push('Save');
  if (action.resolutionKind === 'special') labels.push('Special');
  if (action.childActions?.length) {
    labels.push(
      action.childActions
        .map((child) => `${child.actionId}${child.count > 1 ? ` x${child.count}` : ''}`)
        .join(', ')
    );
  }
  if (action.save?.ability) {
    labels.push(
      `${action.save.ability.toUpperCase()} save${
        action.save.fixedDc ? ` DC ${action.save.fixedDc}` : ''
      }`
    );
  }
  if (action.conditionRiders?.length) {
    labels.push(action.conditionRiders.join(', '));
  }
  if (action.effectTags?.includes('legendary_or_lair_candidate')) {
    labels.push('Legendary/Lair candidate');
  }
  action.effectTags
    ?.filter(
      (tag) =>
        tag.startsWith('legendary_like:') ||
        tag.startsWith('lair:') ||
        tag.startsWith('phase:') ||
        tag.startsWith('terrain:')
    )
    .forEach((tag) => labels.push(tag.replace(/_/g, ' ')));
  if (action.recharge) labels.push(`Recharge ${action.recharge}`);
  if (action.usage) labels.push(action.usage);
  return labels;
}
