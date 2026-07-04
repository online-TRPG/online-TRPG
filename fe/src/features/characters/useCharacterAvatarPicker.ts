import { useMemo, type Dispatch, type SetStateAction } from 'react';
import type { CharacterAvatarAssetResponseDto } from '@trpg/shared-types';
import type { CharacterPayload } from '../../hooks/useSession';
import type { StoredUser } from '../../types/session';
import {
  applyAvatarPresetToCharacterForm,
  applyUploadedAvatarToCharacterForm,
  buildCharacterAvatarPickerViewModel,
  clearDeletedAvatarFromCharacterForm,
} from './characterAvatarPresentation';
import { useCharacterAvatarAssets } from './useCharacterAvatarAssets';

export function useCharacterAvatarPicker(params: {
  user: StoredUser;
  formState: CharacterPayload;
  setFormState: Dispatch<SetStateAction<CharacterPayload>>;
  onNotify: (message: string) => void;
}) {
  const { user, formState, setFormState, onNotify } = params;

  function applyUploadedAvatar(asset: CharacterAvatarAssetResponseDto) {
    setFormState((current) => applyUploadedAvatarToCharacterForm(current, asset));
  }

  const {
    avatarAssets,
    avatarAssetError,
    avatarUploadBusy,
    deletingAvatarAssetId,
    uploadAvatarAsset,
    removeAvatarAsset,
  } = useCharacterAvatarAssets({
    user,
    onAvatarUploaded: applyUploadedAvatar,
    onAvatarDeleted: (asset) => {
      setFormState((current) => clearDeletedAvatarFromCharacterForm(current, asset));
    },
    onNotify,
  });

  const avatarPickerViewModel = useMemo(
    () =>
      buildCharacterAvatarPickerViewModel({
        avatarUrl: formState.avatarUrl,
        avatarPresetId: formState.avatarPresetId,
        avatarType: formState.avatarType,
        className: formState.className,
        avatarAssets,
        deletingAvatarAssetId,
      }),
    [
      avatarAssets,
      deletingAvatarAssetId,
      formState.avatarPresetId,
      formState.avatarType,
      formState.avatarUrl,
      formState.className,
    ]
  );

  async function deleteUploadedAvatar(asset: CharacterAvatarAssetResponseDto) {
    const ok = window.confirm(
      `"${asset.fileName}" 초상화를 삭제할까요?\n이 이미지를 사용 중인 내 캐릭터는 기본 초상화로 되돌아갑니다.`
    );
    if (!ok) return;
    await removeAvatarAsset(asset);
  }

  return {
    avatarPickerViewModel,
    avatarAssetError,
    avatarUploadBusy,
    uploadAvatarAsset,
    applyUploadedAvatar,
    deleteUploadedAvatar,
    selectAvatarPreset(presetId: string) {
      setFormState((current) => applyAvatarPresetToCharacterForm(current, presetId));
    },
  };
}
