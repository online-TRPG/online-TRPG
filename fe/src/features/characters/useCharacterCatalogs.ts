import { useEffect, useState } from 'react';
import type { ItemResponseDto, RuleCatalogReferenceDto } from '@trpg/shared-types';
import {
  loadClassFeatureManifest,
  loadClassOptions,
  loadFeSpellPools,
  loadRaceData,
  loadSpellCatalog,
  type CanonicalClassFeatureEntry,
  type ClassOption,
  type RaceData,
  type StaticFeSpellPools,
  type StaticSpellCatalogEntry,
} from '../../services/staticSrd';
import { listItems, listRuleCatalog } from '../../services/catalogApi';

export function useCharacterCatalogs() {
  const [classCatalog, setClassCatalog] = useState<ClassOption[]>([]);
  const [classFeatureManifest, setClassFeatureManifest] = useState<CanonicalClassFeatureEntry[]>([]);
  const [raceCatalog, setRaceCatalog] = useState<RaceData[]>([]);
  const [spellCatalog, setSpellCatalog] = useState<StaticSpellCatalogEntry[]>([]);
  const [spellPools, setSpellPools] = useState<StaticFeSpellPools | null>(null);
  const [itemCatalog, setItemCatalog] = useState<ItemResponseDto[]>([]);
  const [ruleCatalog, setRuleCatalog] = useState<RuleCatalogReferenceDto[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setCatalogError(null);

    Promise.all([
      loadClassOptions(),
      loadClassFeatureManifest(),
      loadRaceData(),
      loadSpellCatalog(),
      loadFeSpellPools(),
    ])
      .then(([loadedClasses, loadedClassFeatures, loadedRaces, loadedSpells, loadedSpellPools]) => {
        if (ignore) return;
        setClassCatalog(loadedClasses);
        setClassFeatureManifest(loadedClassFeatures);
        setRaceCatalog(loadedRaces);
        setSpellCatalog(loadedSpells);
        setSpellPools(loadedSpellPools);
      })
      .catch((caught) => {
        if (ignore) return;
        setCatalogError(
          caught instanceof Error
            ? caught.message
            : '정적 SRD 직업/종족/주문 데이터를 불러오지 못했습니다.'
        );
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    listItems()
      .then((items) => {
        if (!ignore) setItemCatalog(items);
      })
      .catch(() => undefined);

    listRuleCatalog()
      .then((rules) => {
        if (!ignore) setRuleCatalog(rules);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, []);

  return {
    catalogError,
    classCatalog,
    classFeatureManifest,
    itemCatalog,
    raceCatalog,
    ruleCatalog,
    spellCatalog,
    spellPools,
  };
}
