import { useEffect, useRef } from 'react';

export function useCharacterCreateModalLifecycle(params: {
  isCreateModalOpen: boolean;
  autoOpenCreate: boolean;
  openCreateModal: () => void;
}) {
  const { isCreateModalOpen, autoOpenCreate, openCreateModal } = params;
  const didAutoOpenCreateRef = useRef(false);

  useEffect(() => {
    if (!isCreateModalOpen) return undefined;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isCreateModalOpen]);

  useEffect(() => {
    if (!autoOpenCreate || didAutoOpenCreateRef.current) {
      return;
    }

    didAutoOpenCreateRef.current = true;
    openCreateModal();
  }, [autoOpenCreate, openCreateModal]);
}
