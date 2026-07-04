import { useEffect, useState } from 'react';
import type { PersistentCharacter } from '../../types/session';

const characterInUseDeleteMessage =
  '\uC774 \uCE90\uB9AD\uD130\uB294 \uC138\uC158\uC5D0\uC11C \uC0AC\uC6A9 \uC911\uC785\uB2C8\uB2E4.\n\uC0AC\uC6A9 \uC911\uC778 \uC138\uC158\uC744 \uC885\uB8CC\uD558\uACE0 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.';

export function useCharacterDeleteFlow(params: {
  selectedCharacter: PersistentCharacter | null;
  usedCharacterIds: Set<string>;
  onDeleteCharacter: (characterId: string) => void | Promise<void>;
}) {
  const { selectedCharacter, usedCharacterIds, onDeleteCharacter } = params;
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!deleteWarning) return undefined;

    const timeout = window.setTimeout(() => {
      setDeleteWarning(null);
    }, 4200);

    return () => window.clearTimeout(timeout);
  }, [deleteWarning]);

  function requestDeleteSelectedCharacter() {
    if (!selectedCharacter) return;
    if (usedCharacterIds.has(selectedCharacter.id)) {
      setDeleteWarning(characterInUseDeleteMessage);
      return;
    }
    setDeleteModalOpen(true);
  }

  async function confirmDeleteSelectedCharacter() {
    if (!selectedCharacter) return;
    await onDeleteCharacter(selectedCharacter.id);
    setDeleteModalOpen(false);
  }

  return {
    isDeleteModalOpen,
    deleteWarning,
    dismissDeleteWarning: () => setDeleteWarning(null),
    closeDeleteModal: () => setDeleteModalOpen(false),
    requestDeleteSelectedCharacter,
    confirmDeleteSelectedCharacter,
  };
}
