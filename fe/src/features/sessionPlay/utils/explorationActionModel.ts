import type { SubmitMainCommandDto, VttMapStateDto } from '@trpg/shared-types';
import type { GameIconName } from '../../../components/GameIcon';
import type { BattleMapSelection } from '../components/SessionBattleMap';

export type ExplorationMainCommandRequest = {
  intent: SubmitMainCommandDto['intent'];
  playerText: string;
  mapPoint?: { x: number; y: number };
  targetId?: string;
  itemId?: string;
};

export type ExplorationActionButton = {
  label: string;
  request?: ExplorationMainCommandRequest;
  localAction?:
    | 'move'
    | 'ping'
    | 'open_door'
    | 'close_door'
    | 'unlock_door'
    | 'break_door'
    | 'break_object'
    | 'investigate_object'
    | 'disarm_hazard';
  disabled?: boolean;
  // 기본 탐험 행동은 전투/채팅 버튼과 바로 구분되도록 RPG풍 아이콘을 함께 표시합니다.
  iconName?: GameIconName;
};

export type ExplorationLocalAction = NonNullable<ExplorationActionButton['localAction']>;

const ExplorationMainCommandIntent = {
  TALK_TO_NPC: 'TALK_TO_NPC' as SubmitMainCommandDto['intent'],
  OBSERVE_AREA: 'OBSERVE_AREA' as SubmitMainCommandDto['intent'],
  INVESTIGATE_OBJECT: 'INVESTIGATE_OBJECT' as SubmitMainCommandDto['intent'],
  INTERACT_OBJECT: 'INTERACT_OBJECT' as SubmitMainCommandDto['intent'],
};

const explorationActionIconNames: Partial<Record<string, GameIconName>> = {
  관찰: 'game-icons:eye-target',
  이동: 'game-icons:boots',
  '핑 찍기': 'game-icons:flag-objective',
  대화: 'game-icons:conversation',
  조사: 'game-icons:magnifying-glass',
  열기: 'game-icons:open-gate',
  닫기: 'game-icons:closed-doors',
  '잠금 해제': 'game-icons:padlock-open',
  부수기: 'game-icons:hammer-break',
  '함정 해제': 'game-icons:wolf-trap',
};

function getExplorationActionIconName(label: string): GameIconName | undefined {
  return explorationActionIconNames[label];
}

function getSelectionTargetLabel(selection: BattleMapSelection | null) {
  if (!selection) return '현재 위치';
  if (selection.kind === 'tile') return `타일 ${selection.tile.column}, ${selection.tile.row}`;
  if (selection.kind !== 'token') {
    const fallback =
      selection.kind === 'door'
        ? '문'
        : selection.kind === 'object'
          ? '오브젝트'
          : selection.kind === 'wall'
            ? '벽'
            : '지형';
    return selection.cell.name?.trim() || fallback;
  }
  return selection.token.name;
}

function getSelectionMapPoint(selection: BattleMapSelection | null) {
  if (!selection) return undefined;
  return {
    x: Math.round(selection.point.x),
    y: Math.round(selection.point.y),
  };
}

function command(
  label: string,
  intent: SubmitMainCommandDto['intent'],
  selection: BattleMapSelection | null,
  playerText: string
): ExplorationActionButton {
  return {
    label,
    iconName: getExplorationActionIconName(label),
    request: {
      intent,
      playerText,
      mapPoint: getSelectionMapPoint(selection),
      targetId: selection?.kind === 'token' ? (selection.token.npcId ?? undefined) : undefined,
    },
  };
}

function getSelectionHazard(selection: BattleMapSelection | null) {
  if (!selection || selection.kind !== 'object') return null;
  if (!('hazard' in selection.cell)) return null;
  return selection.cell.hazard;
}

function isDetectedArmedHazardSelection(selection: BattleMapSelection | null): boolean {
  const hazard = getSelectionHazard(selection);
  return Boolean(
    hazard &&
      hazard.armed !== false &&
      Array.isArray(hazard.detectedBySessionCharacterIds) &&
      hazard.detectedBySessionCharacterIds.length > 0
  );
}

function isArmedHazardSelection(selection: BattleMapSelection | null): boolean {
  const hazard = getSelectionHazard(selection);
  return Boolean(hazard && hazard.armed !== false);
}

export function hasObjectEvents(selection: BattleMapSelection | null): boolean {
  if (!selection || selection.kind !== 'object') return false;
  if (!('events' in selection.cell)) return false;
  return Array.isArray(selection.cell.events) && selection.cell.events.length > 0;
}

function getBasePositionActions(): ExplorationActionButton[] {
  return [
    {
      label: '이동',
      localAction: 'move',
      iconName: getExplorationActionIconName('이동'),
    },
    {
      label: '핑 찍기',
      localAction: 'ping',
      iconName: getExplorationActionIconName('핑 찍기'),
    },
  ];
}

export function getContextActions(
  selection: BattleMapSelection | null,
  isGmView = false
): ExplorationActionButton[] {
  const targetLabel = getSelectionTargetLabel(selection);
  const positionActions = getBasePositionActions();

  if (!selection) {
    return [
      command('관찰', ExplorationMainCommandIntent.OBSERVE_AREA, null, '주변을 살핍니다.'),
      ...positionActions,
    ];
  }

  if (selection.kind === 'token') {
    return selection.token.npcId
      ? [
          ...positionActions,
          command(
            '대화',
            ExplorationMainCommandIntent.TALK_TO_NPC,
            selection,
            `${targetLabel}에게 말을 겁니다.`
          ),
          command(
            '조사',
            ExplorationMainCommandIntent.INVESTIGATE_OBJECT,
            selection,
            `${targetLabel}의 상태와 행동을 살핍니다.`
          ),
        ]
      : positionActions;
  }

  if (selection.kind === 'door') {
    const investigateAction: ExplorationActionButton = isGmView
      ? {
          label: '조사',
          localAction: 'investigate_object',
          iconName: getExplorationActionIconName('조사'),
        }
      : command(
          '조사',
          ExplorationMainCommandIntent.INVESTIGATE_OBJECT,
          selection,
          `${targetLabel}을 조사합니다.`
        );
    const unlockAction: ExplorationActionButton = isGmView
      ? {
          label: '잠금 해제',
          localAction: 'unlock_door',
          iconName: getExplorationActionIconName('잠금 해제'),
        }
      : command(
          '잠금 해제',
          ExplorationMainCommandIntent.INTERACT_OBJECT,
          selection,
          `${targetLabel}의 잠금을 해제합니다.`
        );

    return [
      ...positionActions,
      {
        label: '열기',
        localAction: 'open_door',
        iconName: getExplorationActionIconName('열기'),
      },
      {
        label: '닫기',
        localAction: 'close_door',
        iconName: getExplorationActionIconName('열기'),
      },
      investigateAction,
      unlockAction,
      {
        label: '부수기',
        localAction: 'break_door',
        iconName: getExplorationActionIconName('부수기'),
      },
    ];
  }

  if (selection.kind === 'object') {
    const objectCell = selection.cell as NonNullable<VttMapStateDto['objectCells']>[number];
    const canDisarmHazard = isGmView
      ? isArmedHazardSelection(selection)
      : isDetectedArmedHazardSelection(selection);
    const hazardActions: ExplorationActionButton[] = canDisarmHazard
      ? [
          {
            label: '함정 해제',
            localAction: 'disarm_hazard',
            iconName: getExplorationActionIconName('함정 해제'),
          },
        ]
      : [];
    const investigateAction: ExplorationActionButton = isGmView
      ? {
          label: '조사',
          localAction: 'investigate_object',
          iconName: getExplorationActionIconName('조사'),
        }
      : command(
          '조사',
          ExplorationMainCommandIntent.INVESTIGATE_OBJECT,
          selection,
          `${targetLabel}을 조사합니다.`
        );
    const breakActions: ExplorationActionButton[] =
      objectCell.canBreak && !objectCell.broken
        ? [
            {
              label: '부수기',
              localAction: 'break_object',
              iconName: getExplorationActionIconName('부수기'),
            },
          ]
        : [];

    return [...positionActions, ...hazardActions, investigateAction, ...breakActions];
  }

  return positionActions;
}
