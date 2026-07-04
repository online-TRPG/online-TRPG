import { useEffect, useState } from 'react';
import type { ItemResponseDto, RuleCatalogReferenceDto } from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import type { ExplorationNodeMoveOption } from '../components/ExplorationNodeSurface';
import { listItems, listRuleCatalog } from '../../../services/catalogApi';
import { getHumanGmNodeMoveOptions } from '../../../services/humanGmApi';

type UsePlaySupportCatalogsParams = {
  user: StoredUser;
  sessionId: string | null;
  canUseHumanGmView: boolean;
  currentNodeId: string | null;
  stateVersion?: number;
};

export function usePlaySupportCatalogs(params: UsePlaySupportCatalogsParams) {
  const {
    user,
    sessionId,
    canUseHumanGmView,
    currentNodeId,
    stateVersion,
  } = params;
  const [gmNodeMoveOptions, setGmNodeMoveOptions] = useState<ExplorationNodeMoveOption[]>([]);
  const [gmItemCatalog, setGmItemCatalog] = useState<ItemResponseDto[]>([]);
  const [ruleCatalog, setRuleCatalog] = useState<RuleCatalogReferenceDto[]>([]);
  const [isGmItemCatalogLoading, setGmItemCatalogLoading] = useState(false);
  const [gmItemCatalogError, setGmItemCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    listRuleCatalog()
      .then((catalog) => {
        if (!ignore) setRuleCatalog(catalog);
      })
      .catch(() => {
        if (!ignore) setRuleCatalog([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionId || !canUseHumanGmView || !currentNodeId) {
      setGmNodeMoveOptions([]);
      return;
    }

    let ignore = false;
    getHumanGmNodeMoveOptions(user, sessionId)
      .then((options) => {
        if (!ignore) {
          setGmNodeMoveOptions(options);
        }
      })
      .catch(() => {
        if (!ignore) {
          setGmNodeMoveOptions([]);
        }
      });

    return () => {
      ignore = true;
    };
  }, [canUseHumanGmView, currentNodeId, sessionId, stateVersion, user]);

  useEffect(() => {
    if (!canUseHumanGmView || gmItemCatalog.length) {
      return;
    }

    let ignore = false;
    setGmItemCatalogLoading(true);
    setGmItemCatalogError(null);
    listItems()
      .then((items) => {
        if (!ignore) {
          setGmItemCatalog(items);
        }
      })
      .catch((caught) => {
        if (!ignore) {
          setGmItemCatalogError(
            caught instanceof Error ? caught.message : '아이템 목록을 불러오지 못했습니다.',
          );
        }
      })
      .finally(() => {
        if (!ignore) {
          setGmItemCatalogLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [canUseHumanGmView, gmItemCatalog.length]);

  return {
    gmNodeMoveOptions,
    gmItemCatalog,
    ruleCatalog,
    isGmItemCatalogLoading,
    gmItemCatalogError,
  };
}
