import { useEffect, useState } from 'react';
import {
  loadClassFeatureManifest,
  loadFeSpellPools,
  type CanonicalClassFeatureEntry,
  type StaticFeSpellPools,
} from '../../../services/staticSrd';

export function useStaticSrdPlayData() {
  const [classFeatureManifest, setClassFeatureManifest] = useState<CanonicalClassFeatureEntry[]>([]);
  const [spellPools, setSpellPools] = useState<StaticFeSpellPools | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadClassFeatureManifest(), loadFeSpellPools()])
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
  }, []);

  return {
    classFeatureManifest,
    spellPools,
  };
}
