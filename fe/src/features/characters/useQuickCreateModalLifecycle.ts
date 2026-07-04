import { useState } from 'react';

type UseQuickCreateModalLifecycleParams = {
  resetQuickCreateForm: () => void;
};

export function useQuickCreateModalLifecycle(
  params: UseQuickCreateModalLifecycleParams,
) {
  const { resetQuickCreateForm } = params;
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);

  function openCreateModal() {
    resetQuickCreateForm();
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    resetQuickCreateForm();
  }

  return {
    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
  };
}
