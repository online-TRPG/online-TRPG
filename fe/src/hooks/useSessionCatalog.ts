import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvailableSessionListItem, StoredUser } from '../types/session';
import {
  listMySessions,
  listSessions,
  type PaginatedList,
  type SessionListParams,
} from '../services/sessionApi';

export interface SessionCatalogSection {
  data: PaginatedList<AvailableSessionListItem>;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export interface SessionCatalogState {
  publicSessions: SessionCatalogSection;
  mySessions: SessionCatalogSection;
}

const EMPTY_PAGE: PaginatedList<AvailableSessionListItem> = {
  content: [],
  page: 0,
  size: 10,
  totalElements: 0,
  totalPages: 0,
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '세션 목록을 불러오지 못했습니다.';
}

export function useSessionCatalog(
  user: StoredUser,
  accessToken: string | null,
  publicParams: SessionListParams,
  myParams: SessionListParams,
  refreshKey?: string | null,
): SessionCatalogState {
  const [publicData, setPublicData] = useState(EMPTY_PAGE);
  const [myData, setMyData] = useState(EMPTY_PAGE);
  const [publicLoading, setPublicLoading] = useState(true);
  const [myLoading, setMyLoading] = useState(true);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [myError, setMyError] = useState<string | null>(null);
  const [publicRetryVersion, setPublicRetryVersion] = useState(0);
  const [myRetryVersion, setMyRetryVersion] = useState(0);
  const publicRequestSequence = useRef(0);
  const myRequestSequence = useRef(0);

  const retryPublic = useCallback(() => setPublicRetryVersion((value) => value + 1), []);
  const retryMy = useCallback(() => setMyRetryVersion((value) => value + 1), []);

  useEffect(() => {
    const sequence = ++publicRequestSequence.current;
    setPublicLoading(true);
    setPublicError(null);

    void listSessions(user, accessToken, publicParams)
      .then((result) => {
        if (sequence !== publicRequestSequence.current) return;
        setPublicData(result);
      })
      .catch((error: unknown) => {
        if (sequence !== publicRequestSequence.current) return;
        setPublicError(getErrorMessage(error));
      })
      .finally(() => {
        if (sequence === publicRequestSequence.current) {
          setPublicLoading(false);
        }
      });
  }, [
    accessToken,
    publicParams.gmMode,
    publicParams.page,
    publicParams.query,
    publicParams.ruleSetId,
    publicParams.scenarioId,
    publicParams.size,
    publicParams.sort,
    publicParams.status,
    publicRetryVersion,
    refreshKey,
    user,
  ]);

  useEffect(() => {
    const sequence = ++myRequestSequence.current;
    setMyLoading(true);
    setMyError(null);

    void listMySessions(user, accessToken, myParams)
      .then((result) => {
        if (sequence !== myRequestSequence.current) return;
        setMyData(result);
      })
      .catch((error: unknown) => {
        if (sequence !== myRequestSequence.current) return;
        setMyError(getErrorMessage(error));
      })
      .finally(() => {
        if (sequence === myRequestSequence.current) {
          setMyLoading(false);
        }
      });
  }, [
    accessToken,
    myParams.gmMode,
    myParams.page,
    myParams.query,
    myParams.role,
    myParams.ruleSetId,
    myParams.scenarioId,
    myParams.size,
    myParams.sort,
    myParams.status,
    myRetryVersion,
    refreshKey,
    user,
  ]);

  return {
    publicSessions: {
      data: publicData,
      loading: publicLoading,
      error: publicError,
      retry: retryPublic,
    },
    mySessions: {
      data: myData,
      loading: myLoading,
      error: myError,
      retry: retryMy,
    },
  };
}
