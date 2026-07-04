export type CombatClassFeatureAction =
  | 'second_wind'
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

export function buildCombatClassFeatureCommand(
  action: CombatClassFeatureAction,
  targetParticipantId?: string,
): string | null {
  if (action === 'second_wind') return null;

  if (action === 'action_surge') return '/feature action_surge';
  if (action === 'rage') return '/feature rage';
  if (action === 'frenzy') return '/feature frenzy';

  if (action.startsWith('cunning_')) {
    return `/feature cunning_action ${action.slice('cunning_'.length)}`;
  }

  if (
    action === 'divine_sense' ||
    action === 'lay_on_hands' ||
    action === 'primeval_awareness'
  ) {
    return `/feature ${action}`;
  }

  if (action === 'ki_patient_defense') return '/feature ki patient_defense';
  if (action === 'ki_step_of_wind') return '/feature ki step_of_the_wind';
  if (action === 'channel_divinity') return '/feature channel_divinity';
  if (action === 'font_of_magic') return '/feature font_of_magic';
  if (action === 'wild_shape') return '/feature wild_shape';

  if (action === 'bardic_inspiration' && targetParticipantId) {
    return `/feature bardic_inspiration ${targetParticipantId}`;
  }

  if (action === 'dragonborn_breath' && targetParticipantId) {
    return `/feature breath_weapon ${targetParticipantId}`;
  }

  return null;
}
