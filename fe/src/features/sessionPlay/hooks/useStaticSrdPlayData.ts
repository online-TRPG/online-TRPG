import { useEffect, useState } from 'react';
import {
  loadClassFeatureManifest,
  loadFeSpellPools,
  type CanonicalClassFeatureEntry,
  type StaticFeSpellPools,
} from '../../../services/staticSrd';

export function useStaticSrdPlayData(classNames: readonly string[]) {
  const [classFeatureManifest, setClassFeatureManifest] = useState<CanonicalClassFeatureEntry[]>([]);
  const [spellPools, setSpellPools] = useState<StaticFeSpellPools | null>(null);
  const classNameSignature = Array.from(new Set(classNames.map((name) => name.trim())))
    .sort()
    .join('|');

  useEffect(() => {
    let cancelled = false;
    const requestedClassNames = classNameSignature ? classNameSignature.split('|') : [];
    Promise.all([loadClassFeatureManifest(requestedClassNames), loadFeSpellPools()])
      .then(([manifest, loadedSpellPools]) => {
        if (!cancelled) {
          setClassFeatureManifest(manifest);
          setSpellPools(loadedSpellPools);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClassFeatureManifest([]);
          setSpellPools(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [classNameSignature]);

  return {
    classFeatureManifest,
    spellPools,
  };
}
