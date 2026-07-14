import { useState } from 'react';

export type ScenarioPublicationVisibility = 'public' | 'link' | 'private';

export function useScenarioPublicationForm() {
  const [isOpen, setOpen] = useState(false);
  const [changelog, setChangelog] = useState('');
  const [visibility, setVisibility] = useState<ScenarioPublicationVisibility>('public');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [rightsBasis, setRightsBasis] = useState('');
  const [forkAllowed, setForkAllowed] = useState(false);

  function open(defaultRightsBasis: string) {
    setChangelog('');
    setVisibility('public');
    setRightsConfirmed(false);
    setRightsBasis(defaultRightsBasis);
    setForkAllowed(false);
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  return {
    isOpen,
    changelog,
    visibility,
    rightsConfirmed,
    rightsBasis,
    forkAllowed,
    open,
    close,
    setChangelog,
    setVisibility,
    setRightsConfirmed,
    setRightsBasis,
    setForkAllowed,
  };
}
