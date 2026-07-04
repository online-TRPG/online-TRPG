import type { SessionCharacterResponseDto } from '@trpg/shared-types';
import { normalizeSrdCharacterClassKey } from '@trpg/srd-data/rules';

export type CombatClassAbilityAction =
  | 'second_wind'
  | 'sneak_attack'
  | 'action_surge'
  | 'rage'
  | 'frenzy'
  | 'cunning_dash'
  | 'cunning_disengage'
  | 'cunning_hide'
  | 'divine_sense'
  | 'lay_on_hands'
  | 'primeval_awareness'
  | 'ki_patient_defense'
  | 'ki_step_of_wind'
  | 'channel_divinity'
  | 'bardic_inspiration'
  | 'font_of_magic'
  | 'wild_shape'
  | 'dragonborn_breath';

export type CombatAbilityButton = {
  key: string;
  label: string;
  action?: CombatClassAbilityAction;
  title: string;
  requiresAction?: boolean;
  requiresBonusAction?: boolean;
  disabled?: boolean;
  unavailableReason?: string;
};

function hasCharacterFeature(character: SessionCharacterResponseDto, featureId: string) {
  return character.features.some((feature) => feature === featureId);
}

export function getClassAbilityButtons(
  character: SessionCharacterResponseDto | null,
  participantConditions: string[] | undefined
): CombatAbilityButton[] {
  if (!character) return [];

  const classKey = normalizeSrdCharacterClassKey(character.className);
  const conditions = participantConditions ?? [];
  const buttons: CombatAbilityButton[] = [];

  if (hasCharacterFeature(character, 'race.dragonborn.trait.base_traits')) {
    buttons.push({
      key: 'dragonborn_breath',
      label: 'Breath Weapon',
      action: 'dragonborn_breath',
      title: 'Action으로 적을 지정해 15ft 원뿔 브레스를 사용합니다. 대상은 DEX 내성을 굴립니다.',
      requiresAction: true,
      disabled: conditions.includes('resource:dragonborn_breath_expended'),
    });
  }

  if (
    classKey.includes('barbarian') &&
    hasCharacterFeature(character, 'class.barbarian.feature.rage')
  ) {
    buttons.push({
      key: 'rage',
      label: 'Rage',
      action: 'rage',
      title: 'Bonus Action으로 격노를 시작합니다. 피해 저항 태그와 자원 소모가 서버에 기록됩니다.',
      requiresBonusAction: true,
      disabled: conditions.includes('rage') || conditions.includes('condition.rage'),
    });
  }

  if (
    classKey.includes('barbarian') &&
    hasCharacterFeature(character, 'class.barbarian.subclass_feature.frenzy')
  ) {
    buttons.push({
      key: 'frenzy',
      label: 'Frenzy',
      action: 'frenzy',
      title: 'Rage 중 Frenzy를 선언해 이후 턴에 보너스 행동 근접 공격을 사용할 수 있게 합니다.',
      disabled: !conditions.includes('rage') || conditions.includes('frenzy'),
    });
  }

  if (
    classKey.includes('bard') &&
    hasCharacterFeature(character, 'class.bard.feature.bardic_inspiration')
  ) {
    buttons.push({
      key: 'bardic_inspiration',
      label: 'Bardic Inspiration',
      action: 'bardic_inspiration',
      title: 'Bonus Action으로 아군에게 d6를 부여합니다. 다음 공격 굴림에 자동 적용됩니다.',
      requiresBonusAction: true,
    });
  }

  if (
    classKey.includes('cleric') &&
    hasCharacterFeature(character, 'class.cleric.feature.channel_divinity')
  ) {
    buttons.push({
      key: 'cleric_channel_divinity',
      label: 'Preserve Life',
      action: 'channel_divinity',
      title: 'Channel Divinity를 소모해 자신을 최대 HP 절반까지 회복합니다.',
      requiresAction: true,
      disabled: conditions.includes('resource:channel_divinity_expended'),
    });
  }

  if (
    classKey.includes('druid') &&
    hasCharacterFeature(character, 'class.druid.feature.wild_shape')
  ) {
    buttons.push({
      key: 'wild_shape',
      label: 'Wild Shape',
      action: 'wild_shape',
      title: 'Action으로 늑대 형태가 되어 형태 HP 11, 이동 40ft, 물기 공격을 얻습니다.',
      requiresAction: true,
      disabled: conditions.includes('wild_shape:wolf'),
    });
  }

  if (
    classKey.includes('fighter') &&
    hasCharacterFeature(character, 'class.fighter.feature.second_wind')
  ) {
    buttons.push({
      key: 'second_wind',
      label: 'Second Wind',
      action: 'second_wind',
      title: 'Bonus Action을 사용해 1d10 + Fighter 레벨만큼 자신을 회복합니다.',
      requiresBonusAction: true,
      disabled: conditions.includes('resource:second_wind_expended'),
    });
  }

  if (
    classKey.includes('fighter') &&
    hasCharacterFeature(character, 'class.fighter.feature.action_surge')
  ) {
    buttons.push({
      key: 'action_surge',
      label: 'Action Surge',
      action: 'action_surge',
      title: '추가 Action을 얻습니다. 같은 턴에 한 번만 사용할 수 있습니다.',
      disabled:
        conditions.includes('resource:action_surge_expended') ||
        conditions.includes('action_surge:additional_action_granted'),
    });
  }

  if (classKey.includes('monk') && hasCharacterFeature(character, 'class.monk.feature.ki')) {
    buttons.push(
      {
        key: 'ki_patient_defense',
        label: 'Patient Defense',
        action: 'ki_patient_defense',
        title: 'Ki 1점을 소모하고 Bonus Action으로 Dodge를 사용합니다.',
        requiresBonusAction: true,
      },
      {
        key: 'ki_step_of_wind',
        label: 'Step of the Wind',
        action: 'ki_step_of_wind',
        title: 'Ki 1점을 소모하고 Bonus Action으로 Disengage를 사용합니다.',
        requiresBonusAction: true,
      }
    );
  }

  if (
    classKey.includes('paladin') &&
    hasCharacterFeature(character, 'class.paladin.feature.divine_sense')
  ) {
    buttons.push({
      key: 'divine_sense',
      label: 'Divine Sense',
      action: 'divine_sense',
      title: 'Action으로 60ft 안의 celestial/fiend/undead 존재를 감지합니다.',
      requiresAction: true,
      disabled: conditions.includes('resource:divine_sense_expended'),
    });
  }

  if (
    classKey.includes('paladin') &&
    hasCharacterFeature(character, 'class.paladin.feature.lay_on_hands')
  ) {
    buttons.push({
      key: 'lay_on_hands',
      label: 'Lay on Hands',
      action: 'lay_on_hands',
      title: 'Action으로 남은 Lay on Hands 회복 풀을 자신에게 사용합니다.',
      requiresAction: true,
      disabled: conditions.includes('resource:lay_on_hands_expended'),
    });
  }

  if (
    classKey.includes('ranger') &&
    hasCharacterFeature(character, 'class.ranger.feature.primeval_awareness')
  ) {
    buttons.push({
      key: 'primeval_awareness',
      label: 'Primeval Awareness',
      action: 'primeval_awareness',
      title: 'Action과 1레벨 주문 슬롯을 소모해 주변의 특정 생물 유형을 감지합니다.',
      requiresAction: true,
    });
  }

  if (
    classKey.includes('rogue') &&
    hasCharacterFeature(character, 'class.rogue.feature.sneak_attack')
  ) {
    buttons.push({
      key: 'sneak_attack',
      label: 'Sneak Attack',
      action: 'sneak_attack',
      title:
        'Action을 사용해 이점이 있는 finesse 또는 원거리 무기 공격을 합니다. 명중하면 턴당 한 번 추가 피해를 줍니다.',
      requiresAction: true,
      disabled: conditions.includes('resource:sneak_attack_expended'),
    });
  }

  if (
    classKey.includes('rogue') &&
    hasCharacterFeature(character, 'class.rogue.feature.cunning_action')
  ) {
    buttons.push(
      {
        key: 'cunning_dash',
        label: 'Cunning Dash',
        action: 'cunning_dash',
        title: 'Bonus Action으로 Dash를 선언합니다.',
        requiresBonusAction: true,
      },
      {
        key: 'cunning_disengage',
        label: 'Cunning Disengage',
        action: 'cunning_disengage',
        title: 'Bonus Action으로 Disengage를 선언합니다.',
        requiresBonusAction: true,
      },
      {
        key: 'cunning_hide',
        label: 'Cunning Hide',
        action: 'cunning_hide',
        title: 'Bonus Action으로 Hide를 선언합니다.',
        requiresBonusAction: true,
      }
    );
  }

  if (
    classKey.includes('sorcerer') &&
    hasCharacterFeature(character, 'class.sorcerer.feature.font_of_magic')
  ) {
    buttons.push({
      key: 'font_of_magic',
      label: 'Create Spell Slot',
      action: 'font_of_magic',
      title: '소서리 포인트 2점과 Bonus Action을 사용해 1레벨 주문 슬롯 하나를 회복합니다.',
      requiresBonusAction: true,
    });
  }

  return buttons;
}
