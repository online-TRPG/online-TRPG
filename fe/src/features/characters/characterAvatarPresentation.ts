import type { CharacterAvatarAssetResponseDto } from '@trpg/shared-types';
import type { CharacterPayload } from '../../hooks/useSession';
import defaultArcherImage from '../../assets/images/Profile_Default_Archer.webp';
import defaultRogueImage from '../../assets/images/Profile_Default_Rouge.webp';
import defaultWarriorImage from '../../assets/images/Profile_Default_Warrior.webp';
import defaultWizardImage from '../../assets/images/Profile_Default_Wizard.webp';

export const avatarPresets = [
  { id: 'preset_wizard', label: '위자드', image: defaultWizardImage },
  { id: 'preset_archer', label: '레인저', image: defaultArcherImage },
  { id: 'preset_rogue', label: '로그', image: defaultRogueImage },
  { id: 'preset_warrior', label: '파이터', image: defaultWarriorImage },
] as const;

const presetIdByClassName: Map<string, string> = new Map([
  ['Barbarian', 'preset_warrior'],
  ['Bard', 'preset_wizard'],
  ['Cleric', 'preset_warrior'],
  ['Druid', 'preset_archer'],
  ['Wizard', 'preset_wizard'],
  ['Monk', 'preset_rogue'],
  ['Paladin', 'preset_warrior'],
  ['Ranger', 'preset_archer'],
  ['Rogue', 'preset_rogue'],
  ['Sorcerer', 'preset_wizard'],
  ['Warlock', 'preset_wizard'],
  ['Fighter', 'preset_warrior'],
  ['Archer', 'preset_archer'],
  ['Warrior', 'preset_warrior'],
]);

export function getCharacterArt(className: string) {
  const normalized = className.toLowerCase();
  if (
    normalized.includes('wizard') ||
    normalized.includes('mage') ||
    normalized.includes('sorcer') ||
    normalized.includes('warlock') ||
    normalized.includes('bard')
  ) {
    return defaultWizardImage;
  }
  if (
    normalized.includes('archer') ||
    normalized.includes('ranger') ||
    normalized.includes('druid') ||
    normalized.includes('bow')
  ) {
    return defaultArcherImage;
  }
  if (
    normalized.includes('rogue') ||
    normalized.includes('rouge') ||
    normalized.includes('thief') ||
    normalized.includes('monk')
  ) {
    return defaultRogueImage;
  }
  if (
    normalized.includes('barbarian') ||
    normalized.includes('cleric') ||
    normalized.includes('fighter') ||
    normalized.includes('paladin') ||
    normalized.includes('warrior') ||
    normalized.includes('knight')
  ) {
    return defaultWarriorImage;
  }
  return defaultWizardImage;
}

export function getAvatarPresetImage(avatarPresetId?: string | null) {
  return avatarPresets.find((preset) => preset.id === avatarPresetId)?.image ?? null;
}

export function getCharacterImage(character: {
  avatarUrl?: string | null;
  avatarPresetId?: string | null;
  className: string;
}) {
  if (character.avatarUrl) return character.avatarUrl;
  return getAvatarPresetImage(character.avatarPresetId) ?? getCharacterArt(character.className);
}

export function getPresetIdForClassName(className: string) {
  return presetIdByClassName.get(className) ?? 'preset_wizard';
}

export function buildCharacterAvatarPickerViewModel(params: {
  avatarUrl?: string | null;
  avatarPresetId?: string | null;
  avatarType?: string | null;
  className?: string | null;
  avatarAssets: CharacterAvatarAssetResponseDto[];
  deletingAvatarAssetId: string | null;
}) {
  const isUploadedAvatar = params.avatarType === 'UPLOAD';
  return {
    previewImage:
      params.avatarUrl ||
      getAvatarPresetImage(params.avatarPresetId) ||
      getCharacterArt(params.className ?? 'Wizard'),
    previewTitle: isUploadedAvatar ? '업로드 초상화' : '기본 프리셋',
    previewDescription: isUploadedAvatar
      ? '세션 토큰과 프로필에 이 이미지가 우선 표시됩니다.'
      : '프리셋을 선택하거나 직접 이미지를 업로드할 수 있습니다.',
    presetOptions: avatarPresets.map((preset) => ({
      ...preset,
      isSelected: params.avatarPresetId === preset.id,
    })),
    uploadedAssets: params.avatarAssets.map((asset) => ({
      asset,
      id: asset.id,
      publicUrl: asset.publicUrl,
      fileName: asset.fileName,
      sizeLabel: `${Math.max(1, Math.round(asset.fileSizeBytes / 1024))} KB`,
      isSelected: params.avatarUrl === asset.publicUrl,
      isDeleting: params.deletingAvatarAssetId === asset.id,
    })),
  };
}

export function applyUploadedAvatarToCharacterForm(
  current: CharacterPayload,
  asset: CharacterAvatarAssetResponseDto
): CharacterPayload {
  return {
    ...current,
    avatarType: 'UPLOAD',
    avatarPresetId: null,
    avatarUrl: asset.publicUrl,
  };
}

export function applyAvatarPresetToCharacterForm(
  current: CharacterPayload,
  avatarPresetId: string
): CharacterPayload {
  return {
    ...current,
    avatarType: 'PRESET',
    avatarPresetId,
    avatarUrl: null,
  };
}

export function clearDeletedAvatarFromCharacterForm(
  current: CharacterPayload,
  asset: CharacterAvatarAssetResponseDto
): CharacterPayload {
  if (current.avatarUrl !== asset.publicUrl) return current;

  return {
    ...current,
    avatarType: 'DEFAULT',
    avatarPresetId: null,
    avatarUrl: null,
  };
}
