import type { CSSProperties } from 'react';
import type { BattleMapSelection } from '../components/SessionBattleMap';
import type { SessionTokenColor } from '../../../utils/sessionTokenColors';

export const sessionTabDescriptions: Record<
  string,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  Main: {
    eyebrow: 'Session log',
    title: '메인 로그',
    description: '행동 선언과 진행 상황이 시간순으로 기록됩니다.',
  },
  Chat: {
    eyebrow: 'Party chat',
    title: '파티 채팅',
    description: '파티원들과 자유롭게 메시지를 주고받을 수 있습니다.',
  },
  Info: {
    eyebrow: 'Scenario guide',
    title: '시나리오 정보와 장면 가이드',
    description: '시나리오 설명과 판정 가이드, 단서를 확인합니다.',
  },
  Settings: {
    eyebrow: 'Room settings',
    title: '세션 설정',
    description: '세션 정보를 확인하고 세션에서 나갈 수 있습니다.',
  },
};

export function formatUnreadCount(count: number) {
  return count > 99 ? '99+' : `${count}`;
}

export function getAvatarLabel(title: string, userName: string) {
  const trimmed = title.trim();
  if (!trimmed) return '?';
  if (trimmed === userName) return userName.slice(0, 1).toUpperCase();
  return trimmed.slice(0, 1).toUpperCase();
}

export function buildProfileColorStyle(color: SessionTokenColor): CSSProperties {
  return {
    ['--participant-frame-color' as string]: color.frame,
    ['--participant-bg-color' as string]: color.background,
    ['--participant-text-color' as string]: color.text,
    ['--chat-avatar-frame-color' as string]: color.frame,
    ['--chat-avatar-bg-color' as string]: color.background,
    ['--chat-avatar-text-color' as string]: color.text,
    ['--chat-message-frame-color' as string]: color.frame,
    ['--chat-message-bg-color' as string]: color.background,
    ['--chat-message-text-color' as string]: color.text,
  } as CSSProperties;
}

export function buildStoryPartyColorStyle(color: SessionTokenColor): CSSProperties {
  return {
    ...buildProfileColorStyle(color),
    ['--story-party-frame-color' as string]: color.frame,
    ['--story-party-bg-color' as string]: color.background,
    ['--story-party-text-color' as string]: color.text,
  } as CSSProperties;
}

export function buildMapPartyColorStyle(color: SessionTokenColor): CSSProperties {
  return {
    ...buildProfileColorStyle(color),
    ['--map-party-frame-color' as string]: color.frame,
    ['--map-party-bg-color' as string]: color.background,
    ['--map-party-text-color' as string]: color.text,
  } as CSSProperties;
}

export function getConnectionLabel(connected: boolean) {
  return connected ? 'Connected' : 'Offline';
}

export function getNodeLabel(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.label === 'string') return candidate.label;
  if (typeof candidate.id === 'string') return candidate.id;
  if (typeof candidate.skill === 'string') return candidate.skill;
  return null;
}

export function getSelectedExplorationMapLabel(
  selection: BattleMapSelection | null,
  visibleTargets: Array<{ id: string; name?: string | null }>
): string {
  if (!selection) return '맵 선택 없음';
  if (selection.kind === 'tile') {
    return `타일 (${selection.tile.column}, ${selection.tile.row})`;
  }
  if (selection.kind === 'token') {
    const npcTarget = selection.token.npcId
      ? visibleTargets.find((target) => target.id === selection.token.npcId)
      : null;
    return `${npcTarget?.name ?? selection.token.name} (${selection.tile.column}, ${selection.tile.row})`;
  }

  const fallback =
    selection.kind === 'door'
      ? '문'
      : selection.kind === 'object'
        ? '오브젝트'
        : selection.kind === 'wall'
          ? '벽'
          : '지형';
  return `${selection.cell.name?.trim() || fallback} (${selection.tile.column}, ${selection.tile.row})`;
}

export function getSelectedExplorationItemLabel(
  item: { name: string; quantity: number } | null
): string {
  return item ? `${item.name} x${item.quantity}` : '아이템 선택 없음';
}
