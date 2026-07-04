import { useState } from 'react';
import type { FormEvent } from 'react';

type UseSessionChatInputParams = {
  onAction: (label: string) => void;
};

export function useSessionChatInput(params: UseSessionChatInputParams) {
  const { onAction } = params;
  const [chatMessage, setChatMessage] = useState('');

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = chatMessage.trim();
    if (!next) return;

    onAction(`CHAT:${next}`);
    setChatMessage('');
  }

  return {
    chatMessage,
    setChatMessage,
    handleChatSubmit,
  };
}
