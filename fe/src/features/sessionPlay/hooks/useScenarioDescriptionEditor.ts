import { useEffect, useRef, useState } from 'react';

type UseScenarioDescriptionEditorParams = {
  activeTab: string;
  scenarioDescription?: string | null;
};

export function useScenarioDescriptionEditor(params: UseScenarioDescriptionEditorParams) {
  const { activeTab, scenarioDescription } = params;
  const [infoText, setInfoText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scenarioDescriptionText = infoText || scenarioDescription || '';

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [activeTab, scenarioDescriptionText]);

  return {
    scenarioDescriptionText,
    scenarioDescriptionTextareaRef: textareaRef,
    setScenarioDescriptionText: setInfoText,
  };
}
