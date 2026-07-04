import { useEffect, useRef, useState } from 'react';

export type CharacterCreateToast = {
  id: number;
  message: string;
};

export function useCharacterCreateToast(params: {
  isCreateModalOpen: boolean;
  formValidationError: string | null;
  externalError: string | null;
}) {
  const [createToast, setCreateToast] = useState<CharacterCreateToast | null>(null);
  const createToastTimeoutRef = useRef<number | null>(null);

  function clearCreateToast() {
    if (createToastTimeoutRef.current) {
      window.clearTimeout(createToastTimeoutRef.current);
      createToastTimeoutRef.current = null;
    }
    setCreateToast(null);
  }

  function showCreateToast(message: string) {
    const nextToast = { id: Date.now(), message };
    setCreateToast(nextToast);
    if (createToastTimeoutRef.current) {
      window.clearTimeout(createToastTimeoutRef.current);
    }
    createToastTimeoutRef.current = window.setTimeout(() => {
      setCreateToast((current) => (current?.id === nextToast.id ? null : current));
      createToastTimeoutRef.current = null;
    }, 3000);
  }

  useEffect(() => {
    if (!params.isCreateModalOpen) {
      clearCreateToast();
      return;
    }
    if (params.formValidationError) {
      showCreateToast(params.formValidationError);
    }
  }, [params.formValidationError, params.isCreateModalOpen]);

  useEffect(() => {
    if (!params.isCreateModalOpen || !params.externalError) return;
    showCreateToast(params.externalError);
  }, [params.externalError, params.isCreateModalOpen]);

  useEffect(() => () => {
    if (createToastTimeoutRef.current) {
      window.clearTimeout(createToastTimeoutRef.current);
    }
  }, []);

  return {
    createToast,
    clearCreateToast,
    showCreateToast,
  };
}
