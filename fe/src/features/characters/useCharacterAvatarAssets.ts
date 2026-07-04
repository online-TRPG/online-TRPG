import { useEffect, useState } from 'react';
import type { CharacterAvatarAssetResponseDto } from '@trpg/shared-types';
import type { StoredUser } from '../../types/session';
import {
  deleteCharacterAvatarAsset,
  listCharacterAvatarAssets,
  uploadCharacterAvatarAsset,
} from '../../services/characterApi';

type UseCharacterAvatarAssetsParams = {
  user: StoredUser;
  onAvatarUploaded?: (asset: CharacterAvatarAssetResponseDto) => void;
  onAvatarDeleted?: (asset: CharacterAvatarAssetResponseDto) => void;
  onNotify?: (message: string) => void;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

export function useCharacterAvatarAssets({
  user,
  onAvatarUploaded,
  onAvatarDeleted,
  onNotify,
}: UseCharacterAvatarAssetsParams) {
  const [avatarAssets, setAvatarAssets] = useState<CharacterAvatarAssetResponseDto[]>([]);
  const [avatarAssetError, setAvatarAssetError] = useState<string | null>(null);
  const [avatarUploadBusy, setAvatarUploadBusy] = useState(false);
  const [deletingAvatarAssetId, setDeletingAvatarAssetId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    listCharacterAvatarAssets(user)
      .then((assets) => {
        if (!ignore) {
          setAvatarAssets(assets);
          setAvatarAssetError(null);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setAvatarAssetError(
            caught instanceof Error ? caught.message : '초상화 라이브러리를 불러오지 못했습니다.'
          );
        }
      });
    return () => {
      ignore = true;
    };
  }, [user]);

  async function uploadAvatarAsset(file: File | null) {
    if (!file) return;
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      const message = '초상화는 PNG, JPEG, WebP 이미지만 업로드할 수 있습니다.';
      setAvatarAssetError(message);
      onNotify?.(message);
      return;
    }

    setAvatarUploadBusy(true);
    setAvatarAssetError(null);
    try {
      const dataBase64 = await fileToBase64(file);
      const asset = await uploadCharacterAvatarAsset(user, {
        fileName: file.name,
        contentType: file.type,
        dataBase64,
      });
      setAvatarAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      onAvatarUploaded?.(asset);
      onNotify?.('업로드한 이미지를 초상화로 선택했습니다.');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '초상화 업로드에 실패했습니다.';
      setAvatarAssetError(message);
      onNotify?.(message);
    } finally {
      setAvatarUploadBusy(false);
    }
  }

  async function removeAvatarAsset(asset: CharacterAvatarAssetResponseDto) {
    setDeletingAvatarAssetId(asset.id);
    setAvatarAssetError(null);
    try {
      await deleteCharacterAvatarAsset(user, asset.id);
      setAvatarAssets((current) => current.filter((item) => item.id !== asset.id));
      onAvatarDeleted?.(asset);
      onNotify?.('초상화를 삭제했습니다.');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '초상화 삭제에 실패했습니다.';
      setAvatarAssetError(message);
      onNotify?.(message);
    } finally {
      setDeletingAvatarAssetId(null);
    }
  }

  return {
    avatarAssets,
    avatarAssetError,
    avatarUploadBusy,
    deletingAvatarAssetId,
    uploadAvatarAsset,
    removeAvatarAsset,
  };
}
