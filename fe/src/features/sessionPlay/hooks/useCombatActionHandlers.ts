import { useMemo } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { CombatResponseDto, VttMapStateDto } from '@trpg/shared-types';
import type { StoredUser } from '../../../types/session';
import {
  castCombatSpell,
  dashCombatAction,
  dodgeCombatAction,
  endCombat,
  endCombatTurn,
  hideCombatAction,
  resolveCombatActorAction,
  resolveEquippedWeaponAttack,
  resolveOffhandWeaponAttack,
  resolveSneakAttackCombatAction,
  useSecondWindCombatAction,
} from '../../../services/combatApi';
import {
  buildCombatClassFeatureCommand,
  type CombatClassFeatureAction,
} from '../utils/combatClassFeatureCommand';

type CombatRequestRunner = (
  request: () => Promise<CombatResponseDto | { combat: CombatResponseDto } | unknown>,
) => Promise<void>;

type CastCombatSpellPayload = {
  targetParticipantIds?: string[];
  point?: { x: number; y: number } | null;
  slotLevel?: number;
};

type UseCombatActionHandlersParams = {
  user: StoredUser;
  sessionId: string | null;
  isCombatBusy: boolean;
  runCombatRequest: CombatRequestRunner;
  setMap: Dispatch<SetStateAction<VttMapStateDto | null>>;
  latestConfirmedMapRef: MutableRefObject<VttMapStateDto | null>;
  onSendAction: (message: string) => Promise<void> | void;
};

export function useCombatActionHandlers(params: UseCombatActionHandlersParams) {
  const {
    user,
    sessionId,
    isCombatBusy,
    runCombatRequest,
    setMap,
    latestConfirmedMapRef,
    onSendAction,
  } = params;

  return useMemo(
    () => ({
      handleEquippedWeaponAttack: async (targetParticipantId: string) => {
        if (!sessionId || isCombatBusy) return;
        await runCombatRequest(() =>
          resolveEquippedWeaponAttack(user, sessionId, { targetParticipantId }),
        );
      },
      handleOffhandWeaponAttack: async (targetParticipantId: string) => {
        if (!sessionId || isCombatBusy) return;
        await runCombatRequest(() =>
          resolveOffhandWeaponAttack(user, sessionId, { targetParticipantId }),
        );
      },
      handleSneakAttack: async (targetParticipantId: string) => {
        if (!sessionId || isCombatBusy) return;
        await runCombatRequest(() =>
          resolveSneakAttackCombatAction(user, sessionId, { targetParticipantId }),
        );
      },
      handleMonsterCombatAction: async (
        targetParticipantId?: string | null,
        actionType: 'attack' | 'dash' | 'dodge' | 'hide' = 'attack',
        actionId?: string | null,
      ) => {
        if (!sessionId || isCombatBusy) return;
        await runCombatRequest(async () => {
          const result = await resolveCombatActorAction(user, sessionId, {
            actionType,
            actionId: actionId ?? null,
            targetParticipantId: targetParticipantId ?? null,
            autoEndTurn: false,
          });
          if (result.map) {
            setMap(result.map);
            latestConfirmedMapRef.current = result.map;
          }
          return result;
        });
      },
      handleDashCombatAction: async () => {
        if (!sessionId || isCombatBusy) return;
        await runCombatRequest(() => dashCombatAction(user, sessionId));
      },
      handleDodgeCombatAction: async () => {
        if (!sessionId || isCombatBusy) return;
        await runCombatRequest(() => dodgeCombatAction(user, sessionId));
      },
      handleHideCombatAction: async () => {
        if (!sessionId || isCombatBusy) return;
        await runCombatRequest(() => hideCombatAction(user, sessionId));
      },
      handleReadyCombatAction: async (targetParticipantId: string) => {
        if (!sessionId || isCombatBusy) return;
        await onSendAction(`/ready enter attack ${targetParticipantId} 30`);
      },
      handleCombatClassFeature: async (
        action: CombatClassFeatureAction,
        targetParticipantId?: string,
      ) => {
        if (!sessionId || isCombatBusy) return;
        if (action === 'second_wind') {
          await runCombatRequest(() => useSecondWindCombatAction(user, sessionId));
          return;
        }

        const command = buildCombatClassFeatureCommand(action, targetParticipantId);
        if (command) await onSendAction(command);
      },
      handleCastCombatSpell: async (spellId: string, payload: CastCombatSpellPayload) => {
        if (!sessionId || isCombatBusy) return;
        await runCombatRequest(async () => {
          const result = await castCombatSpell(user, sessionId, { spellId, ...payload });
          if (result.map) {
            setMap(result.map);
            latestConfirmedMapRef.current = result.map;
          }
          return result;
        });
      },
      handleEndCombatTurn: (force = false) => {
        if (!sessionId) return;
        void runCombatRequest(() => endCombatTurn(user, sessionId, { force }));
      },
      handleEndCombat: () => {
        if (!sessionId) return;
        void runCombatRequest(() => endCombat(user, sessionId));
      },
    }),
    [isCombatBusy, latestConfirmedMapRef, onSendAction, runCombatRequest, sessionId, setMap, user],
  );
}
