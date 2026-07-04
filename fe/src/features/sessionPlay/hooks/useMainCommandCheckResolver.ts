import type {
  ActionOutcome,
  MainCommandCheckEffectDto,
  MainCommandResponseDto,
  ResolveMainCommandCheckDto,
} from '@trpg/shared-types';
import { isMainCommandImpossible } from '@trpg/shared-types/frontend';

export type PendingMainCommandCheck = {
  requestId: string;
  message: string;
  effect: MainCommandCheckEffectDto;
};

type MainCommandCheckActorSource = {
  selectedCharacterId?: string | null;
  participantSessionCharacterId?: string | null;
  participantCharacterId?: string | null;
};

type UseMainCommandCheckResolverParams = {
  pendingMainCommandCheck: PendingMainCommandCheck | null;
  actorSource: MainCommandCheckActorSource;
  setMainCommandError: (error: string | null) => void;
  setPendingMainCommandCheck: (check: PendingMainCommandCheck | null) => void;
  onResolveMainCommandCheck: (
    payload: ResolveMainCommandCheckDto,
  ) => Promise<MainCommandResponseDto | null>;
};

function getMainCommandCheckActorId(
  source: MainCommandCheckActorSource,
): string | undefined {
  return (
    source.selectedCharacterId ??
    source.participantSessionCharacterId ??
    source.participantCharacterId ??
    undefined
  );
}

export function useMainCommandCheckResolver(
  params: UseMainCommandCheckResolverParams,
) {
  const {
    pendingMainCommandCheck,
    actorSource,
    setMainCommandError,
    setPendingMainCommandCheck,
    onResolveMainCommandCheck,
  } = params;

  async function handleResolveMainCommandCheck(outcome: ActionOutcome) {
    if (!pendingMainCommandCheck) return;

    const actorId = getMainCommandCheckActorId(actorSource);
    setMainCommandError(null);
    const response = await onResolveMainCommandCheck({
      requestId: pendingMainCommandCheck.requestId,
      outcome,
      effect: pendingMainCommandCheck.effect,
      ...(actorId ? { actorId } : {}),
    });

    if (isMainCommandImpossible(response)) {
      setMainCommandError(response.message);
      return;
    }

    setPendingMainCommandCheck(null);
  }

  return {
    handleResolveMainCommandCheck,
  };
}
