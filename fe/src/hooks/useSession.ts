import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActionAcceptedResponseDto,
  ActionAcceptedEventDto,
  ActionInputType,
  ActionScope,
  DiceRollResponseDto,
  MainCommandResponseDto,
  ResolveMainCommandCheckDto,
  StateDiffResponseDto,
  RestActionDto,
  LevelUpCharacterDto,
  SubmitMainCommandDto,
  SystemMessageEventDto,
  SubmitActionDto,
  TurnLogResponseDto,
  UpdatePreparedSpellsDto,
  VttMapStateDto,
} from '@trpg/shared-types';
import type { Socket } from 'socket.io-client';
import {
  approveRestAction as apiApproveRestAction,
  cancelRestAction as apiCancelRestAction,
  cloneCharacter as apiCloneCharacter,
  createCharacter as apiCreateCharacter,
  createSession as apiCreateSession,
  deleteCharacter as apiDeleteCharacter,
  getSession,
  joinSession as apiJoinSession,
  joinSessionById as apiJoinSessionById,
  leaveSession as apiLeaveSession,
  listTurnLogs as apiListTurnLogs,
  listMyCharacters as apiListMyCharacters,
  listMySessions as apiListMySessions,
  listSessions,
  levelUpCharacter as apiLevelUpCharacter,
  selectSessionCharacter as apiSelectSessionCharacter,
  startSession as apiStartSession,
  resolveMainCommandCheck as apiResolveMainCommandCheck,
  rejectRestAction as apiRejectRestAction,
  submitMainCommand as apiSubmitMainCommand,
  submitRestAction as apiSubmitRestAction,
  submitAction as apiSubmitAction,
  updateCharacter as apiUpdateCharacter,
  updateHumanGm as apiUpdateHumanGm,
  updatePreparedSpells as apiUpdatePreparedSpells,
  updateReadyState as apiUpdateReadyState,
} from '../services/api';
import { connectSessionSocket, sendRealtimeChatMessage } from '../services/realtime';
import { clearStoredSnapshot, loadStoredSnapshot, saveStoredSnapshot } from '../services/storage';
import type {
  AvailableSessionListItem,
  Character,
  ChatMessage,
  LogEntry,
  Participant,
  PersistentCharacter,
  SessionSnapshot,
  StoredUser,
} from '../types/session';
import type {
  DiceAdvantage,
  DiceRollOutcome,
  DiceRollOverlayData,
} from '../features/sessionPlay/components/DiceRollOverlay';

function getVttMapSocketSignature(map: VttMapStateDto | null | undefined) {
  if (!map) return 'null';
  const tokenSignature = map.tokens
    .map((token) => [token.id, token.x, token.y, token.hidden === true ? 'h' : 'v'].join(','))
    .join('|');
  return [
    map.id,
    map.updatedAt,
    map.width,
    map.height,
    map.gridSize,
    tokenSignature,
    map.terrainCells?.length ?? 0,
    map.wallCells?.length ?? 0,
    map.doorCells?.length ?? 0,
    map.objectCells?.length ?? 0,
    map.lightSources?.length ?? 0,
  ].join(';');
}

export interface CharacterPayload {
  name: string;
  ancestry: string;
  className: string;
  subclassName?: string | null;
  avatarType?: 'DEFAULT' | 'PRESET' | 'UPLOAD';
  avatarPresetId?: string | null;
  avatarUrl?: string | null;
  scenarioId?: string | null;
  startingEquipmentSelection?: number[];
  startingEquipmentItemSelections?: Record<string, string>;
  startingSpells?: { cantrips: string[]; spells: string[]; preparedSpells?: string[] };
  level?: number;
  abilities?: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  proficiencyBonus?: number;
  proficientSkills?: string[];
  features?: string[];
  maxHp?: number;
  armorClass?: number;
  speed?: number;
  inventory?: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;
  equippedWeaponId?: string | null;
  offhandWeaponId?: string | null;
  assignToSession?: boolean;
}

export interface UseSessionReturn {
  snapshot: SessionSnapshot | null;
  sessionList: AvailableSessionListItem[];
  mySessionList: AvailableSessionListItem[];
  myCharacters: PersistentCharacter[];
  socketConnected: boolean;
  hasOlderTurnLogs: boolean;
  isLoadingTurnLogs: boolean;
  busy: boolean;
  error: string | null;
  createSession: (
    title: string,
    options?: { scenarioId?: string; maxParticipants?: number; useAiGm?: boolean }
  ) => Promise<SessionSnapshot | null>;
  joinSession: (inviteCode: string) => Promise<SessionSnapshot | null>;
  joinSessionById: (sessionId: string) => Promise<SessionSnapshot | null>;
  createCharacter: (payload: CharacterPayload) => Promise<boolean>;
  cloneCharacter: (characterId: string) => Promise<void>;
  updateCharacter: (characterId: string, payload: CharacterPayload) => Promise<boolean>;
  levelUpCharacter: (characterId: string, payload: LevelUpCharacterDto) => Promise<boolean>;
  updatePreparedSpells: (characterId: string, payload: UpdatePreparedSpellsDto) => Promise<boolean>;
  deleteCharacter: (characterId: string) => Promise<void>;
  selectCharacter: (characterId: string | null) => Promise<void>;
  setReadyState: (isReady: boolean) => Promise<void>;
  setHumanGm: (gmUserId: string) => Promise<void>;
  startSession: () => Promise<void>;
  leaveSession: () => Promise<boolean>;
  sendMainCommand: (payload: SubmitMainCommandDto) => Promise<MainCommandResponseDto | null>;
  resolveMainCommandCheck: (
    payload: ResolveMainCommandCheckDto
  ) => Promise<MainCommandResponseDto | null>;
  requestRest: (
    restType: RestActionDto['restType'],
    characterId?: string,
    hitDiceToSpend?: number,
  ) => Promise<void>;
  approveRestRequest: (actionId: string) => Promise<boolean>;
  rejectRestRequest: (actionId: string) => Promise<boolean>;
  cancelRestRequest: (actionId: string) => Promise<boolean>;
  sendAction: (rawText: string) => Promise<void>;
  sendChatMessage: (content: string, scope?: 'CHAT' | 'MAIN') => Promise<void>;
  loadOlderTurnLogs: () => Promise<void>;
  refreshSessionList: () => Promise<void>;
  refreshMyCharacters: () => Promise<void>;
  clearSnapshot: () => void;
  clearError: () => void;
  activeDiceRoll: DiceRollOverlayData | null;
  dismissDiceRoll: () => void;
}

type SessionListRefreshResult = {
  publicSessions: AvailableSessionListItem[];
  mySessions: AvailableSessionListItem[];
};

type AppendLogFn = (
  kind: LogEntry['kind'],
  title: string,
  message: string,
  id?: string,
  createdAt?: string,
  metadata?: LogEntry['metadata']
) => void;

type PendingMainCommandLog = {
  clientLogId: string;
  rawLogId: string;
  pendingLogId: string;
  rawText: string;
  userId: string;
  isPendingVisible: boolean;
  timeoutId?: number;
};

type PendingMainCommandCheckLog = {
  pendingLogId: string;
  timeoutId?: number;
};

function isBlockingSessionStatus(status: string | undefined): boolean {
  return status !== 'completed' && status !== 'disbanded';
}

function isDeclareRpActionIntent(value: unknown): boolean {
  return value === 'DECLARE_RP_ACTION';
}

function isRpMainCommandTurnLog(turnLog: TurnLogResponseDto): boolean {
  const structuredAction = turnLog.structuredAction;
  return (
    Boolean(structuredAction) &&
    typeof structuredAction === 'object' &&
    isDeclareRpActionIntent((structuredAction as { intent?: unknown }).intent)
  );
}

function isAutoHazardDetectionTurnLog(turnLog: TurnLogResponseDto): boolean {
  const structuredAction = turnLog.structuredAction;
  return Boolean(
    structuredAction &&
      typeof structuredAction === 'object' &&
      structuredAction.type === 'auto_hazard_detection'
  );
}

function isVttHazardTriggerTurnLog(turnLog: TurnLogResponseDto): boolean {
  const structuredAction = turnLog.structuredAction;
  return Boolean(
    structuredAction &&
      typeof structuredAction === 'object' &&
      structuredAction.type === 'vtt_hazard_trigger'
  );
}

function isStaleLeaveErrorMessage(message: string): boolean {
  return (
    message.includes('(403)') ||
    message.includes('(404)') ||
    message.includes('You must join the session before accessing it.') ||
    message.includes('was not found')
  );
}

function formatTurnLogMessage(turnLog: TurnLogResponseDto): string {
  const structuredAction = turnLog.structuredAction;
  const narration = turnLog.narration?.trim();

  if (
    structuredAction &&
    typeof structuredAction === 'object' &&
    structuredAction.type === 'main_command'
  ) {
    return `[MAIN]${narration || '메인 명령을 처리했습니다.'}`;
  }

  if (
    structuredAction &&
    typeof structuredAction === 'object' &&
    structuredAction.type === 'main_command_check_result'
  ) {
    return `[MAIN]${narration || '판정 결과를 반영했습니다.'}`;
  }

  if (
    structuredAction &&
    typeof structuredAction === 'object' &&
    structuredAction.type === 'action_error'
  ) {
    return `[MAIN]${narration || '행동 처리에 실패했습니다.'}`;
  }

  if (isAutoHazardDetectionTurnLog(turnLog)) {
    return `[MAIN]${narration || '주변 위험을 자동으로 확인했습니다.'}`;
  }

  if (isVttHazardTriggerTurnLog(turnLog)) {
    return `[MAIN]${narration || '함정이 발동했습니다.'}`;
  }

  if (
    structuredAction &&
    typeof structuredAction === 'object' &&
    structuredAction.type === 'attack'
  ) {
    return `[MAIN]${narration || '공격을 처리했습니다.'}`;
  }

  return `[MAIN]${narration || '행동을 처리했습니다.'}`;
}

function getTurnLogMainCommandMetadata(turnLog: TurnLogResponseDto): LogEntry['metadata'] | undefined {
  const structuredAction = turnLog.structuredAction;

  if (
    !structuredAction ||
    typeof structuredAction !== 'object' ||
    (structuredAction as { type?: unknown }).type !== 'main_command'
  ) {
    return undefined;
  }

  const command = structuredAction as {
    intent?: unknown;
    targetId?: unknown;
    targetType?: unknown;
    data?: unknown;
  };
  const data = command.data && typeof command.data === 'object'
    ? (command.data as Record<string, unknown>)
    : null;
  const npcDialogue = data?.npcDialogue && typeof data.npcDialogue === 'object'
    ? (data.npcDialogue as Record<string, unknown>)
    : null;
  const npcDialogueId = typeof npcDialogue?.npcId === 'string' ? npcDialogue.npcId : null;
  const npcDialogueSpeakerName =
    typeof npcDialogue?.speakerName === 'string' ? npcDialogue.speakerName : null;

  return {
    mainCommand: {
      intent: typeof command.intent === 'string' ? command.intent : null,
      targetId: typeof command.targetId === 'string' ? command.targetId : npcDialogueId,
      targetType: typeof command.targetType === 'string' ? command.targetType : null,
      ...(npcDialogueId || npcDialogueSpeakerName
        ? {
            npcDialogue: {
              npcId: npcDialogueId,
              speakerName: npcDialogueSpeakerName,
            },
          }
        : {}),
    },
  };
}

function getTurnLogRestApprovalMetadata(turnLog: TurnLogResponseDto): LogEntry['metadata'] | undefined {
  const structuredAction = turnLog.structuredAction;

  if (
    !structuredAction ||
    typeof structuredAction !== 'object' ||
    (structuredAction as { type?: unknown }).type !== 'rest' ||
    (structuredAction as { approvalStatus?: unknown }).approvalStatus !== 'gm_required' ||
    turnLog.actionQueueStatus !== 'REJECTED' ||
    !turnLog.playerActionId
  ) {
    return undefined;
  }

  const restAction = structuredAction as {
    restType?: unknown;
    approvalStatus?: unknown;
    approvalExpiresAt?: unknown;
  };
  return {
    restApproval: {
      actionId: turnLog.playerActionId,
      restType:
        restAction.restType === 'short' || restAction.restType === 'long'
          ? restAction.restType
          : null,
      status: typeof restAction.approvalStatus === 'string' ? restAction.approvalStatus : null,
      expiresAt:
        typeof restAction.approvalExpiresAt === 'string'
          ? restAction.approvalExpiresAt
          : null,
    },
  };
}

function getRestApprovalMetadataFromResponse(
  response: ActionAcceptedResponseDto
): LogEntry['metadata'] | undefined {
  const restApproval = response.restApproval;

  if (!restApproval?.actionId) {
    return undefined;
  }

  return {
    restApproval: {
      actionId: restApproval.actionId,
      restType: restApproval.restType,
      status: restApproval.status,
      hitDiceToSpend: restApproval.hitDiceToSpend ?? null,
      expiresAt: restApproval.expiresAt ?? null,
    },
  };
}

function formatRestApprovalRequestMessage(
  restApproval: NonNullable<ActionAcceptedResponseDto['restApproval']>
) {
  const label = restApproval.restType === 'long' ? '긴 휴식' : '짧은 휴식';
  const hitDiceSuffix =
    restApproval.restType === 'short' && restApproval.hitDiceToSpend
      ? ` · 히트 다이스 ${restApproval.hitDiceToSpend}개`
      : '';

  return `[MAIN]${label} 요청이 GM 승인 대기 상태입니다.${hitDiceSuffix}`;
}

function isLongRestAccepted(response: ActionAcceptedResponseDto, requestedRestType?: RestActionDto['restType']) {
  return response.restApproval?.restType === 'long' || requestedRestType === 'long';
}

function getTurnLogMetadata(turnLog: TurnLogResponseDto): LogEntry['metadata'] | undefined {
  const metadata = {
    ...getTurnLogMainCommandMetadata(turnLog),
    ...getTurnLogRestApprovalMetadata(turnLog),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function isMainCommandTurnLog(turnLog: TurnLogResponseDto): boolean {
  const structuredAction = turnLog.structuredAction;

  return Boolean(
    structuredAction &&
      typeof structuredAction === 'object' &&
      structuredAction.type === 'main_command'
  );
}

function isCheckRequiredMainCommandTurnLog(turnLog: TurnLogResponseDto): boolean {
  const structuredAction = turnLog.structuredAction;

  return Boolean(
    structuredAction &&
      typeof structuredAction === 'object' &&
      structuredAction.type === 'main_command' &&
      (structuredAction as Record<string, unknown>).status === 'CHECK_REQUIRED'
  );
}

function getMainCommandCheckEffect(response: MainCommandResponseDto): Record<string, unknown> | null {
  const data = response.data;
  if (!data || typeof data !== 'object') return null;
  const effect = (data as Record<string, unknown>).checkEffect;
  return effect && typeof effect === 'object' ? (effect as Record<string, unknown>) : null;
}

function getSenderNameByUserId(userId: string, snapshot: SessionSnapshot | null): string {
  const participant = snapshot?.participants.find((item) => item.userId === userId);

  return participant?.user.displayName ?? '알 수 없음';
}

function getRawInputCreatedAt(turnLog: TurnLogResponseDto): string {
  return turnLog.actionClientCreatedAt ?? turnLog.actionCreatedAt ?? turnLog.createdAt;
}

function formatDiceRollMessage(diceResult: DiceRollResponseDto): string {
  const parts = [
    `${diceResult.expression} = ${diceResult.total}`,
    diceResult.rolls.length ? `굴림: ${diceResult.rolls.join(', ')}` : null,
    diceResult.modifier ? `수정치 ${diceResult.modifier}` : null,
  ];

  return parts.filter((part): part is string => Boolean(part)).join(' / ');
}

function formatStateDiffMessage(stateDiff: StateDiffResponseDto): string {
  return `상태 버전 ${stateDiff.baseVersion} -> ${stateDiff.nextVersion} (${stateDiff.reason})`;
}

// shared-types/src/constants/skills.ts (DND5E_SKILLS) 인라인 미러.
// Vite/Rollup 이 shared-types named value export 를 추적 못 해 직접 import 불가 — skills.ts 변경 시 함께 갱신.
const DND5E_SKILL_INLINE: ReadonlyArray<{
  code: string;
  ko: string;
  abilityKo: string;
}> = [
  { code: "acrobatics", ko: "곡예", abilityKo: "민첩" },
  { code: "animalhandling", ko: "동물 조련", abilityKo: "지혜" },
  { code: "arcana", ko: "비전학", abilityKo: "지능" },
  { code: "athletics", ko: "운동", abilityKo: "근력" },
  { code: "deception", ko: "기만", abilityKo: "매력" },
  { code: "history", ko: "역사", abilityKo: "지능" },
  { code: "insight", ko: "통찰", abilityKo: "지혜" },
  { code: "intimidation", ko: "위협", abilityKo: "매력" },
  { code: "investigation", ko: "조사", abilityKo: "지능" },
  { code: "medicine", ko: "의학", abilityKo: "지혜" },
  { code: "nature", ko: "자연", abilityKo: "지능" },
  { code: "perception", ko: "감지", abilityKo: "지혜" },
  { code: "performance", ko: "공연", abilityKo: "매력" },
  { code: "persuasion", ko: "설득", abilityKo: "매력" },
  { code: "religion", ko: "종교", abilityKo: "지능" },
  { code: "sleightofhand", ko: "손재주", abilityKo: "민첩" },
  { code: "stealth", ko: "은신", abilityKo: "민첩" },
  { code: "survival", ko: "생존", abilityKo: "지혜" },
];

function resolveCheckSkillInline(
  checkName: string,
): { titleKo: string; abilityKo: string } | null {
  const trimmed = checkName.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const entry = DND5E_SKILL_INLINE.find(
    (skill) => skill.ko === trimmed || skill.code === lower,
  );
  return entry ? { titleKo: entry.ko, abilityKo: entry.abilityKo } : null;
}

function readDiceNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeDiceAdvantage(value: unknown): DiceAdvantage {
  return value === "ADVANTAGE" || value === "DISADVANTAGE" ? value : "NORMAL";
}

function normalizeDiceOutcome(value: unknown): DiceRollOutcome {
  return value === "SUCCESS" || value === "FAILURE" || value === "IMPOSSIBLE"
    ? value
    : "NO_ROLL";
}

// turn.log.created 이벤트의 turnLog 에서 주사위 오버레이 표시 데이터를 추출한다.
// diceResult 가 없으면(다이스 없는 행동) null 반환 → 오버레이 표시 안 함.
function buildDiceRollOverlayData(
  turnLog: TurnLogResponseDto,
  snapshot: SessionSnapshot | null,
): DiceRollOverlayData | null {
  const dice = turnLog.diceResult;
  if (!dice || typeof dice !== "object") {
    return null;
  }

  const diceRecord = dice as Record<string, unknown>;
  const rawRolls = diceRecord.rolls;
  const rolls = Array.isArray(rawRolls)
    ? rawRolls.filter((roll): roll is number => typeof roll === "number")
    : [];
  if (!rolls.length) {
    return null;
  }

  const modifier = readDiceNumber(diceRecord, "modifier") ?? 0;
  const total = readDiceNumber(diceRecord, "total") ?? 0;
  const expression =
    typeof diceRecord.expression === "string" ? diceRecord.expression : "";
  const advantage = normalizeDiceAdvantage(diceRecord.advantageState);
  const isD20 = /d20/i.test(expression);
  const naturalRoll =
    advantage === "ADVANTAGE"
      ? Math.max(...rolls)
      : advantage === "DISADVANTAGE"
        ? Math.min(...rolls)
        : rolls[0];

  const structured =
    turnLog.structuredAction && typeof turnLog.structuredAction === "object"
      ? (turnLog.structuredAction as Record<string, unknown>)
      : null;
  const actionType = typeof structured?.type === "string" ? structured.type : "";

  let title = expression || "주사위";
  let subtitle: string | null = null;
  let targetLabel: string | null = null;
  let targetValue: number | null = null;
  let outcome = normalizeDiceOutcome(turnLog.outcome);

  if (actionType === "skill_check") {
    const checkName =
      typeof structured?.checkName === "string" ? structured.checkName : "";
    const skill = resolveCheckSkillInline(checkName);
    title = skill?.titleKo || checkName || "능력 판정";
    subtitle = skill ? `${skill.abilityKo} 판정` : "능력 판정";
    targetLabel = "난이도";
    targetValue = structured ? readDiceNumber(structured, "dc") : null;
  } else if (actionType === "attack") {
    title = "공격";
    subtitle = "공격 판정";
    targetLabel = "방어도";
    targetValue = structured
      ? readDiceNumber(structured, "targetArmorClass") ??
        readDiceNumber(structured, "dc")
      : null;
  } else if (actionType === "combat_hide") {
    title = "숨기";
    subtitle = "민첩(은신) 판정";
    targetLabel = "난이도";
    targetValue = structured ? readDiceNumber(structured, "dc") : null;
  } else if (actionType === "auto_hazard_detection") {
    title = "위험 탐지";
    subtitle = "지혜(감지) 판정";
    targetLabel = "난이도";
    targetValue =
      structured ? readDiceNumber(structured, "detectionDc") : readDiceNumber(diceRecord, "dc");
  } else if (actionType === "vtt_hazard_trigger") {
    title = "함정 피해";
    subtitle = "피해 굴림";
    targetLabel = "피해";
    targetValue = readDiceNumber(diceRecord, "total");
    outcome = "NO_ROLL";
  }

  const actorName = turnLog.actorUserId
    ? getSenderNameByUserId(turnLog.actorUserId, snapshot)
    : turnLog.sessionCharacterId
      ? snapshot?.sessionCharacters.find((character) => character.id === turnLog.sessionCharacterId)
          ?.name ?? "세션 로그"
      : "세션 로그";

  return {
    id: turnLog.turnLogId,
    actorName,
    title,
    subtitle,
    targetLabel,
    targetValue,
    isD20,
    naturalRoll,
    rolls,
    modifier,
    total,
    expression,
    advantage,
    outcome,
  };
}

// CHECK_REQUIRED 시 클라이언트 로컬 d20 굴림으로 임시 오버레이 생성.
// 한계 — BE 를 거치지 않아 다른 플레이어에겐 안 보임 (단일 클라이언트 가시).
// 캐릭터 보정값은 v1 에서 0 고정. 서버 권위 굴림 + 브로드캐스트는 BE 합의 후 후속 작업으로 교체.
function buildCheckRequiredOverlay(
  checkOption: { ability?: string; skill?: string; dc?: number; reason: string },
  actorUserId: string,
  actorDisplayName: string,
): DiceRollOverlayData {
  const skillInput = checkOption.skill?.trim() ?? '';
  const skill = skillInput
    ? DND5E_SKILL_INLINE.find(
        (entry) => entry.code === skillInput.toLowerCase() || entry.ko === skillInput,
      )
    : null;

  const title = skill?.ko || skillInput || '능력 판정';
  const subtitle = skill
    ? `${skill.abilityKo} 판정`
    : checkOption.ability
      ? `${checkOption.ability} 판정`
      : '능력 판정';

  const dc =
    Number.isInteger(checkOption.dc) && checkOption.dc !== undefined
      ? Math.max(5, Math.min(30, checkOption.dc))
      : 15;
  const naturalRoll = Math.floor(Math.random() * 20) + 1;
  const modifier = 0;
  const total = naturalRoll + modifier;

  return {
    id: `check-required-${actorUserId}-${Date.now()}`,
    actorName: actorDisplayName,
    title,
    subtitle,
    targetLabel: '난이도',
    targetValue: dc,
    isD20: true,
    naturalRoll,
    rolls: [naturalRoll],
    modifier,
    total,
    expression: '1d20',
    advantage: 'NORMAL',
    outcome: total >= dc ? 'SUCCESS' : 'FAILURE',
  };
}

export function useSession(
  user: StoredUser | null,
  accessToken: string | null,
  appendLog: AppendLogFn,
  appendOlderLog: AppendLogFn,
  removeLog: (id: string) => void,
  clearSessionLogs: () => void
): UseSessionReturn {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(() => loadStoredSnapshot());
  const [sessionList, setSessionList] = useState<AvailableSessionListItem[]>([]);
  const [mySessionList, setMySessionList] = useState<AvailableSessionListItem[]>([]);
  const [myCharacters, setMyCharacters] = useState<PersistentCharacter[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);
  const [turnLogNextCursor, setTurnLogNextCursor] = useState<string | null>(null);
  const [isLoadingTurnLogs, setIsLoadingTurnLogs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mySessionsLoaded, setMySessionsLoaded] = useState(false);
  // 세션 진행 중 주사위 굴림을 전원에게 보여주는 오버레이. turn.log.created 이벤트로 채워진다.
  const [activeDiceRoll, setActiveDiceRoll] = useState<DiceRollOverlayData | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const snapshotRef = useRef<SessionSnapshot | null>(snapshot);
  const seenTurnLogIdsRef = useRef<Set<string>>(new Set());
  const loadedTurnLogSessionIdRef = useRef<string | null>(null);
  const pendingMainCommandLogsRef = useRef<PendingMainCommandLog[]>([]);
  const pendingMainCommandCheckLogsRef = useRef<PendingMainCommandCheckLog[]>([]);

  const removePendingMainCommandLog = useCallback(
    (entry: PendingMainCommandLog, options?: { removeRaw?: boolean; removePending?: boolean }) => {
      const shouldRemoveRaw = options?.removeRaw ?? true;
      const shouldRemovePending = options?.removePending ?? true;

      if (entry.timeoutId !== undefined) {
        window.clearTimeout(entry.timeoutId);
      }
      if (shouldRemoveRaw) {
        removeLog(entry.rawLogId);
      }
      if (shouldRemovePending) {
        removeLog(entry.pendingLogId);
      }

      pendingMainCommandLogsRef.current = pendingMainCommandLogsRef.current.filter(
        (item) => item.clientLogId !== entry.clientLogId
      );
    },
    [removeLog]
  );

  const removePendingMainCommandCheckLog = useCallback(
    (entry: PendingMainCommandCheckLog) => {
      if (entry.timeoutId !== undefined) {
        window.clearTimeout(entry.timeoutId);
      }
      removeLog(entry.pendingLogId);
      pendingMainCommandCheckLogsRef.current = pendingMainCommandCheckLogsRef.current.filter(
        (item) => item.pendingLogId !== entry.pendingLogId
      );
    },
    [removeLog]
  );

  const appendPendingMainCommandCheckLog = useCallback(
    (requestId?: string | null): PendingMainCommandCheckLog => {
      const pendingLogId = `main-command-check:${requestId || crypto.randomUUID()}:pending`;
      const entry: PendingMainCommandCheckLog = { pendingLogId };

      appendLog('action', '세션 로그', '[MAIN]...', pendingLogId);
      entry.timeoutId = window.setTimeout(() => {
        removePendingMainCommandCheckLog(entry);
      }, 45_000);
      pendingMainCommandCheckLogsRef.current = [
        ...pendingMainCommandCheckLogsRef.current,
        entry,
      ];
      return entry;
    },
    [appendLog, removePendingMainCommandCheckLog]
  );

  const clearLocalSessionState = useCallback(() => {
    clearStoredSnapshot();
    setSnapshot(null);
    snapshotRef.current = null;
    setSocketConnected(false);
    socketRef.current?.disconnect();
    socketRef.current = null;
    seenTurnLogIdsRef.current.clear();
    loadedTurnLogSessionIdRef.current = null;
    pendingMainCommandLogsRef.current.forEach((entry) => {
      if (entry.timeoutId !== undefined) {
        window.clearTimeout(entry.timeoutId);
      }
    });
    pendingMainCommandLogsRef.current = [];
    pendingMainCommandCheckLogsRef.current.forEach((entry) => {
      if (entry.timeoutId !== undefined) {
        window.clearTimeout(entry.timeoutId);
      }
    });
    pendingMainCommandCheckLogsRef.current = [];
    setTurnLogNextCursor(null);
    setIsLoadingTurnLogs(false);
    clearSessionLogs();
  }, [clearSessionLogs]);

  const updateSnapshot = useCallback((next: SessionSnapshot) => {
    if (snapshotRef.current?.session.id !== next.session.id) {
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = null;
      setTurnLogNextCursor(null);
      setIsLoadingTurnLogs(false);
      clearSessionLogs();
    }
    snapshotRef.current = next;
    setSnapshot(next);
    saveStoredSnapshot(next);
  }, [clearSessionLogs]);

  const reconcileSnapshotWithLists = useCallback(
    (nextSnapshot: SessionSnapshot, lists: SessionListRefreshResult | null): SessionSnapshot => {
      if (!lists) return nextSnapshot;

      const matchedSession =
        lists.mySessions.find(
          (item) =>
            item.sessionId === nextSnapshot.session.id ||
            item.sessionPublicId === nextSnapshot.session.publicId
        ) ??
        lists.publicSessions.find(
          (item) =>
            item.sessionId === nextSnapshot.session.id ||
            item.sessionPublicId === nextSnapshot.session.publicId
        );

      if (!matchedSession) return nextSnapshot;

      return {
        ...nextSnapshot,
        session: {
          ...nextSnapshot.session,
          status: matchedSession.status as typeof nextSnapshot.session.status,
        },
      };
    },
    []
  );

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const hasBlockingSession = useCallback(
    () => mySessionList.some((item) => isBlockingSessionStatus(item.status)),
    [mySessionList]
  );

  useEffect(() => {
    if (!user) {
      // 로그아웃/토큰 만료 직후 이전 사용자의 세션 화면이 남지 않도록 메모리 상태까지 함께 비웁니다.
      setSnapshot(null);
      snapshotRef.current = null;
      clearStoredSnapshot();
      setSessionList([]);
      setMySessionList([]);
      setMyCharacters([]);
      setMySessionsLoaded(false);
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = null;
      setTurnLogNextCursor(null);
      setIsLoadingTurnLogs(false);
      clearSessionLogs();
      return;
    }

    void listSessions(user, accessToken)
      .then((result) => setSessionList(result.content))
      .catch(() => undefined);

    void apiListMySessions(user, accessToken)
      .then((result) => {
        setMySessionList(result.content);
        setMySessionsLoaded(true);
      })
      .catch(() => undefined);

    void apiListMyCharacters(user, accessToken)
      .then(setMyCharacters)
      .catch(() => undefined);
  }, [accessToken, clearSessionLogs, user]);

  useEffect(() => {
    if (!user || !snapshot || !mySessionsLoaded || busy) return;

    const matchedSession = mySessionList.find(
      (item) =>
        item.sessionId === snapshot.session.id || item.sessionPublicId === snapshot.session.publicId
    );

    if (!matchedSession) {
      clearLocalSessionState();
      return;
    }

    if (
      matchedSession &&
      !isBlockingSessionStatus(matchedSession.status) &&
      isBlockingSessionStatus(snapshot.session.status)
    ) {
      clearStoredSnapshot();
      setSnapshot(null);
      setSocketConnected(false);
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = null;
      setTurnLogNextCursor(null);
      setIsLoadingTurnLogs(false);
    }
  }, [busy, clearLocalSessionState, mySessionList, mySessionsLoaded, snapshot, user]);

  const appendPlayerRawInputLog = useCallback(
    (turnLog: TurnLogResponseDto, writeLog: AppendLogFn) => {
      if (isAutoHazardDetectionTurnLog(turnLog) || isVttHazardTriggerTurnLog(turnLog)) {
        return;
      }

      const rawInput = turnLog.rawInput?.trim();
      if (!rawInput) {
        return;
      }

      // TurnLog는 DB에 남으므로 새로고침/재접속 후에도 같은 id로 말풍선을 다시 만들 수 있습니다.
      const rawLogId = turnLog.playerActionId
        ? `player-action:${turnLog.playerActionId}:raw`
        : `turn-log:${turnLog.turnLogId}:${isRpMainCommandTurnLog(turnLog) ? 'rp-raw' : 'raw'}`;
      const senderName = turnLog.actorUserId
        ? getSenderNameByUserId(turnLog.actorUserId, snapshotRef.current)
        : '알 수 없음';

      writeLog('action', senderName, `[MAIN]${rawInput}`, rawLogId, getRawInputCreatedAt(turnLog));
    },
    []
  );

  const appendServerTurnLog = useCallback(
    (turnLog: TurnLogResponseDto) => {
      if (seenTurnLogIdsRef.current.has(turnLog.turnLogId)) {
        return;
      }

      appendPlayerRawInputLog(turnLog, appendLog);
      seenTurnLogIdsRef.current.add(turnLog.turnLogId);
      if (turnLog.playerActionId) {
        removeLog(`player-action:${turnLog.playerActionId}:pending`);
      }
      if (isMainCommandTurnLog(turnLog)) {
        const rawInput = turnLog.rawInput?.trim();
        const matchingPending = pendingMainCommandLogsRef.current.filter(
          (entry) => entry.rawText === rawInput && entry.userId === turnLog.actorUserId
        );
        const matchedPending =
          matchingPending.find((entry) => entry.isPendingVisible) ?? matchingPending[0];

        if (matchedPending) {
          // 메인 명령은 playerActionId가 없어서, 같은 입력의 서버 TurnLog가 도착하면 로컬 임시 로그를 실제 기록으로 교체합니다.
          removePendingMainCommandLog(matchedPending);
        }
      }
      if (isCheckRequiredMainCommandTurnLog(turnLog)) {
        return;
      }
      appendLog(
        'action',
        '세션 로그',
        formatTurnLogMessage(turnLog),
        `turn-log:${turnLog.turnLogId}`,
        turnLog.createdAt,
        getTurnLogMetadata(turnLog)
      );
    },
    [appendLog, appendPlayerRawInputLog, removeLog, removePendingMainCommandLog]
  );

  const appendHistoricalTurnLog = useCallback(
    (turnLog: TurnLogResponseDto) => {
      if (seenTurnLogIdsRef.current.has(turnLog.turnLogId)) {
        return;
      }

      seenTurnLogIdsRef.current.add(turnLog.turnLogId);
      if (turnLog.playerActionId) {
        removeLog(`player-action:${turnLog.playerActionId}:pending`);
      }
      if (isMainCommandTurnLog(turnLog)) {
        const rawInput = turnLog.rawInput?.trim();
        const matchingPending = pendingMainCommandLogsRef.current.filter(
          (entry) => entry.rawText === rawInput && entry.userId === turnLog.actorUserId
        );
        const matchedPending =
          matchingPending.find((entry) => entry.isPendingVisible) ?? matchingPending[0];

        if (matchedPending) {
          removePendingMainCommandLog(matchedPending);
        }
      }
      if (isCheckRequiredMainCommandTurnLog(turnLog)) {
        appendPlayerRawInputLog(turnLog, appendOlderLog);
        return;
      }

      // 과거 로그는 배열 앞쪽에 넣어 화면에서 현재 로그보다 위에 보이게 합니다.
      appendOlderLog(
        'action',
        '세션 로그',
        formatTurnLogMessage(turnLog),
        `turn-log:${turnLog.turnLogId}`,
        turnLog.createdAt,
        getTurnLogMetadata(turnLog)
      );
      appendPlayerRawInputLog(turnLog, appendOlderLog);
    },
    [appendOlderLog, appendPlayerRawInputLog, removeLog, removePendingMainCommandLog]
  );

  const loadRecentTurnLogs = useCallback(
    async (sessionId: string) => {
      if (!user) return;
      setIsLoadingTurnLogs(true);

      try {
        const result = await apiListTurnLogs(
          user,
          sessionId,
          {
            size: 10,
            includeDiceResult: true,
            includeStateDiff: true,
          },
          accessToken
        );

        // 최신순으로 받은 10개를 이미 최신순인 배열에 그대로 붙이면 화면에서 오래된 것부터 보입니다.
        if (snapshotRef.current?.session.id !== sessionId) return;
        result.turnLogs.forEach(appendHistoricalTurnLog);
        setTurnLogNextCursor(result.nextCursor);
      } catch {
        // 게임룸 진입 직후 로그 조회 실패는 입력 흐름 자체를 막을 정도의 오류가 아니므로 조용히 넘깁니다.
      } finally {
        if (snapshotRef.current?.session.id === sessionId) {
          setIsLoadingTurnLogs(false);
        }
      }
    },
    [accessToken, appendHistoricalTurnLog, user]
  );

  useEffect(() => {
    if (!user || !snapshot?.session.id) return;

    if (loadedTurnLogSessionIdRef.current !== snapshot.session.id) {
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = snapshot.session.id;
      setTurnLogNextCursor(null);
      setIsLoadingTurnLogs(false);
    }

    void loadRecentTurnLogs(snapshot.session.id);
  }, [loadRecentTurnLogs, snapshot?.session.id, user]);

  const loadOlderTurnLogs = useCallback(async () => {
    const sessionId = snapshotRef.current?.session.id;
    if (!user || !sessionId || !turnLogNextCursor || isLoadingTurnLogs) {
      return;
    }

    setIsLoadingTurnLogs(true);

    try {
      const result = await apiListTurnLogs(
        user,
        sessionId,
        {
          cursor: turnLogNextCursor,
          size: 10,
          includeDiceResult: true,
          includeStateDiff: true,
        },
        accessToken
      );

      if (snapshotRef.current?.session.id !== sessionId) return;
      result.turnLogs.forEach(appendHistoricalTurnLog);
      setTurnLogNextCursor(result.nextCursor);
    } catch {
      // 이전 로그 조회 실패는 현재 입력 흐름을 막지 않으므로 화면에는 기존 로그를 그대로 둡니다.
    } finally {
      if (snapshotRef.current?.session.id === sessionId) {
        setIsLoadingTurnLogs(false);
      }
    }
  }, [accessToken, appendHistoricalTurnLog, isLoadingTurnLogs, turnLogNextCursor, user]);

  useEffect(() => {
    if (!user || !snapshot?.session.id) return undefined;

    const socket: Socket = connectSessionSocket(user, snapshot.session.id, {
      onSnapshot: updateSnapshot,
      onParticipantUpdated: (participant: Participant) => {
        setSnapshot((current) => {
          if (!current) return current;

          const participants = current.participants.some((item) => item.id === participant.id)
            ? current.participants.map((item) => (item.id === participant.id ? participant : item))
            : [...current.participants, participant];

          const next = { ...current, participants };
          saveStoredSnapshot(next);
          return next;
        });
      },
      onCharacterUpdated: (character: Character) => {
        setSnapshot((current) => {
          if (!current) return current;

          const characters = current.characters.some((item) => item.id === character.id)
            ? current.characters.map((item) => (item.id === character.id ? character : item))
            : [...current.characters, character];

          const next = { ...current, characters, sessionCharacters: characters };
          saveStoredSnapshot(next);
          return next;
        });
      },
      onChatMessage: (message: ChatMessage) => {
        const scope = message.scope === 'MAIN' ? 'MAIN' : 'CHAT';
        // 기존 PlayPage는 scope prefix가 붙은 로그를 해당 탭에 보여줍니다.
        // 화면 컴포넌트 충돌을 줄이기 위해 수신 메시지만 기존 로그 흐름에 넣습니다.
        appendLog(
          'action',
          message.senderDisplayName,
          `[${scope}]${message.content}`,
          undefined,
          message.createdAt
        );
      },
      onActionAccepted: (action: ActionAcceptedEventDto) => {
        const rawText = action.rawText.trim();
        if (!rawText) return;

        // 사용자가 선언한 문장은 처리 결과를 기다리지 않고, 서버가 접수한 시점에 모두에게 채팅처럼 보여줍니다.
        appendLog(
          'action',
          getSenderNameByUserId(action.actorUserId, snapshotRef.current),
          `[MAIN]${rawText}`,
          `player-action:${action.playerActionId}:raw`,
          action.clientCreatedAt
        );
        appendLog(
          'action',
          '세션 로그',
          '[MAIN]로딩 중...',
          `player-action:${action.playerActionId}:pending`
        );

        window.setTimeout(() => {
          removeLog(`player-action:${action.playerActionId}:pending`);
        }, 45_000);
      },
      onTurnLogCreated: (turnLog: TurnLogResponseDto) => {
        // 라이브 turn.log.created 만 오버레이를 띄운다 (과거 로그 로딩은 별도 경로).
        // appendServerTurnLog 가 turnLogId 를 seen 집합에 넣기 전에 신규 여부를 먼저 확인한다.
        const isNewTurnLog = !seenTurnLogIdsRef.current.has(turnLog.turnLogId);
        appendServerTurnLog(turnLog);
        if (isNewTurnLog) {
          const diceOverlay = buildDiceRollOverlayData(turnLog, snapshotRef.current);
          if (diceOverlay) {
            setActiveDiceRoll(diceOverlay);
          }
        }
      },
      onSystemMessage: (message: SystemMessageEventDto) => {
        if (message.playerActionId) {
          removeLog(`player-action:${message.playerActionId}:pending`);
        }

        // 서버 처리 실패도 Main 탭에 남겨 사용자가 "응답 없음"이 아니라 실패 원인을 볼 수 있게 합니다.
        appendLog(
          'action',
          '세션 로그',
          `[MAIN]${message.message}`,
          `system-message:${message.code}:${message.playerActionId ?? message.message}`
        );
      },
      onDiceRolled: (diceResult: DiceRollResponseDto) => {
        // 주사위 결과는 TurnLog에도 포함되므로 Main 로그에 중복으로 넣지 않고, 실시간 이벤트 확인 로그로만 남깁니다.
        appendLog('socket', '주사위 결과', formatDiceRollMessage(diceResult));
      },
      onStateDiffApplied: (stateDiff: StateDiffResponseDto) => {
        // 실제 화면 상태 갱신은 전용 snapshot/도메인 이벤트가 책임지고, 여기서는 상태 변경 이벤트 수신 여부를 남깁니다.
        appendLog('socket', '상태 변화', formatStateDiffMessage(stateDiff));
      },
      onVttMapUpdated: (map: VttMapStateDto) => {
        setSnapshot((current) => {
          if (!current) return current;
          const currentMap = current.state.flags?.vttMap as VttMapStateDto | null | undefined;
          if (getVttMapSocketSignature(currentMap) === getVttMapSocketSignature(map)) {
            return current;
          }

          const next = {
            ...current,
            state: {
              ...current.state,
              flags: {
                ...current.state.flags,
                vttMap: map,
              },
              state: {
                ...current.state.state,
                vttMap: map,
              },
            },
          };
          saveStoredSnapshot(next);
          return next;
        });
      },
      onCombatUpdated: () => {
        appendLog('socket', '전투 상태', '전투 추적기가 갱신되었습니다.');
      },
      onStatusChange: setSocketConnected,
      onLog: (title, message) => appendLog('socket', title, message),
    });
    socketRef.current = socket;

    return () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.disconnect();
    };
  }, [appendLog, appendServerTurnLog, removeLog, snapshot?.session.id, updateSnapshot, user]);

  useEffect(() => {
    if (!user || !snapshot?.session.id) return;
    void refreshSessionList();
  }, [accessToken, snapshot?.session.id, snapshot?.session.status, user]);

  useEffect(() => {
    if (!user || !snapshot?.session.id) return undefined;
    if (socketConnected) return undefined;

    let disposed = false;
    const intervalId = window.setInterval(() => {
      void getSession(user, snapshot.session.id, accessToken)
        .then((next) => {
          if (!disposed) {
            updateSnapshot(next);
          }
        })
        .catch(() => undefined);
    }, 3000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [accessToken, snapshot?.session.id, socketConnected, updateSnapshot, user]);

  async function refreshSessionListInternal(): Promise<SessionListRefreshResult | null> {
    if (!user) return null;

    try {
      const [publicSessions, mySessions] = await Promise.all([
        listSessions(user, accessToken),
        apiListMySessions(user, accessToken),
      ]);
      setSessionList(publicSessions.content);
      setMySessionList(mySessions.content);
      setMySessionsLoaded(true);
      return {
        publicSessions: publicSessions.content,
        mySessions: mySessions.content,
      };
    } catch {
      // ignore
    }

    return null;
  }

  async function refreshSessionList() {
    await refreshSessionListInternal();
  }

  async function refreshMyCharacters() {
    if (!user) return;

    try {
      const next = await apiListMyCharacters(user, accessToken);
      setMyCharacters(next);
    } catch {
      // ignore
    }
  }

  async function syncSession(sessionId: string) {
    if (!user) return;
    updateSnapshot(await getSession(user, sessionId, accessToken));
  }

  async function createSession(
    title: string,
    options?: { scenarioId?: string; maxParticipants?: number; useAiGm?: boolean }
  ): Promise<SessionSnapshot | null> {
    if (!user) return null;
    if (hasBlockingSession()) {
      setError('모집 중인 세션에는 하나만 참가할 수 있습니다.');
      return null;
    }

    setError(null);
    setBusy(true);

    try {
      const next = await apiCreateSession(user, title, options, accessToken);
      updateSnapshot(next);
      appendLog('rest', '세션 생성', `${next.session.title} 세션을 생성했습니다.`);
      const lists = await refreshSessionListInternal();
      const reconciledSnapshot = reconcileSnapshotWithLists(next, lists);
      if (reconciledSnapshot.session.status !== next.session.status) {
        updateSnapshot(reconciledSnapshot);
      }
      return reconciledSnapshot;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '세션 생성에 실패했습니다.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function joinSession(inviteCode: string): Promise<SessionSnapshot | null> {
    if (!user) return null;
    if (hasBlockingSession()) {
      setError('모집 중인 세션에는 하나만 참가할 수 있습니다.');
      return null;
    }

    setError(null);
    setBusy(true);

    try {
      const next = await apiJoinSession(user, inviteCode, accessToken);
      updateSnapshot(next);
      appendLog('rest', '세션 입장', `${next.session.title} 세션에 입장했습니다.`);
      const lists = await refreshSessionListInternal();
      const reconciledSnapshot = reconcileSnapshotWithLists(next, lists);
      if (reconciledSnapshot.session.status !== next.session.status) {
        updateSnapshot(reconciledSnapshot);
      }
      return reconciledSnapshot;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '세션 입장에 실패했습니다.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function joinSessionById(sessionId: string): Promise<SessionSnapshot | null> {
    if (!user) return null;
    const knownSession = mySessionList.find(
      (item) => item.sessionId === sessionId || item.sessionPublicId === sessionId
    );
    if (!knownSession && hasBlockingSession()) {
      setError('모집 중인 세션에는 하나만 참가할 수 있습니다.');
      return null;
    }

    setError(null);
    setBusy(true);

    try {
      const next = knownSession
        ? await getSession(
            user,
            knownSession.sessionPublicId || knownSession.sessionId,
            accessToken
          )
        : await apiJoinSessionById(user, sessionId, accessToken);
      updateSnapshot(next);
      appendLog('rest', '세션 입장', `${next.session.title} 세션에 입장했습니다.`);
      const lists = await refreshSessionListInternal();
      const reconciledSnapshot = reconcileSnapshotWithLists(next, lists);
      if (reconciledSnapshot.session.status !== next.session.status) {
        updateSnapshot(reconciledSnapshot);
      }
      return reconciledSnapshot;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '세션 입장에 실패했습니다.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createCharacter(payload: CharacterPayload): Promise<boolean> {
    if (!user) return false;
    setError(null);
    setBusy(true);
    let succeeded = false;

    try {
      const shouldAssignToSession = payload.assignToSession === true && Boolean(snapshot);
      const next = await apiCreateCharacter(
        user,
        {
          ...payload,
          sessionId: shouldAssignToSession ? snapshot?.session.id : undefined,
        },
        accessToken
      );

      if (next) {
        updateSnapshot(next);
      }

      await refreshMyCharacters();
      succeeded = true;
      appendLog('rest', '캐릭터 생성', `${payload.name} 캐릭터를 생성했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '캐릭터 생성에 실패했습니다.');
    } finally {
      setBusy(false);
    }
    // 호출자(CharacterPage)가 모달 close 여부를 결정할 수 있도록 성공 여부를 반환한다.
    // setError 로 사용자 메시지는 이미 노출됨. PlayPage 처럼 결과를 무시하는 호출도 안전.
    return succeeded;
  }

  async function cloneCharacter(characterId: string) {
    if (!user) return;
    setError(null);
    setBusy(true);

    try {
      const cloned = await apiCloneCharacter(user, characterId, accessToken);
      await refreshMyCharacters();
      appendLog('rest', '캐릭터 복제', `${cloned.name} 캐릭터를 복제했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '캐릭터 복제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function updateCharacter(characterId: string, payload: CharacterPayload): Promise<boolean> {
    if (!user) return false;
    setError(null);
    setBusy(true);
    let succeeded = false;

    try {
      await apiUpdateCharacter(
        user,
        characterId,
        {
          name: payload.name,
          ancestry: payload.ancestry,
          className: payload.className,
          subclassName: payload.subclassName,
          avatarType: payload.avatarType,
          avatarPresetId: payload.avatarPresetId,
          avatarUrl: payload.avatarUrl,
          level: payload.level,
          abilities: payload.abilities,
          proficiencyBonus: payload.proficiencyBonus,
          proficientSkills: payload.proficientSkills,
          maxHp: payload.maxHp,
          armorClass: payload.armorClass,
          speed: payload.speed,
          inventory: payload.inventory,
        },
        accessToken
      );

      await refreshMyCharacters();
      succeeded = true;
      appendLog('rest', '캐릭터 수정', `${payload.name} 캐릭터를 수정했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '캐릭터 수정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
    return succeeded;
  }

  async function levelUpCharacter(
    characterId: string,
    payload: LevelUpCharacterDto
  ): Promise<boolean> {
    if (!user) return false;
    setError(null);
    setBusy(true);
    let succeeded = false;

    try {
      const updated = await apiLevelUpCharacter(user, characterId, payload, accessToken);
      await refreshMyCharacters();
      if (snapshot) {
        await syncSession(snapshot.session.id);
      }
      succeeded = true;
      appendLog('rest', '레벨업', `${updated.name} 캐릭터가 ${updated.level}레벨이 되었습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '캐릭터 레벨업에 실패했습니다.');
    } finally {
      setBusy(false);
    }
    return succeeded;
  }

  async function updatePreparedSpells(
    characterId: string,
    payload: UpdatePreparedSpellsDto
  ): Promise<boolean> {
    if (!user) return false;
    setError(null);
    setBusy(true);
    let succeeded = false;

    try {
      const updated = await apiUpdatePreparedSpells(user, characterId, payload, accessToken);
      await refreshMyCharacters();
      if (snapshot) {
        await syncSession(snapshot.session.id);
      }
      succeeded = true;
      appendLog('rest', '준비 주문', `${updated.name} 캐릭터의 준비 주문을 갱신했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '준비 주문 갱신에 실패했습니다.');
    } finally {
      setBusy(false);
    }
    return succeeded;
  }

  async function deleteCharacter(characterId: string) {
    if (!user) return;
    setError(null);
    setBusy(true);

    try {
      await apiDeleteCharacter(user, characterId, accessToken);
      await refreshMyCharacters();
      appendLog('rest', '캐릭터 삭제', '캐릭터를 삭제했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '캐릭터 삭제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function selectCharacter(characterId: string | null) {
    if (!user || !snapshot) return;
    setError(null);
    setBusy(true);

    try {
      await apiSelectSessionCharacter(user, snapshot.session.id, characterId, accessToken);
      await syncSession(snapshot.session.id);
      const selected = myCharacters.find((character) => character.id === characterId);
      appendLog(
        'rest',
        characterId ? '캐릭터 선택' : '캐릭터 선택 해제',
        characterId
          ? `${selected?.name ?? '캐릭터'}를 선택했습니다.`
          : '캐릭터 선택을 해제했습니다.'
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '캐릭터 선택에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function setReadyState(isReady: boolean) {
    if (!user || !snapshot) return;
    setError(null);
    setBusy(true);

    try {
      await apiUpdateReadyState(user, snapshot.session.id, isReady, accessToken);
      await syncSession(snapshot.session.id);
      appendLog(
        'rest',
        isReady ? 'READY' : 'READY 해제',
        isReady ? 'READY 상태로 변경했습니다.' : 'READY를 해제했습니다.'
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'READY 상태 변경에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function setHumanGm(gmUserId: string) {
    if (!user || !snapshot) return;
    setError(null);
    setBusy(true);

    try {
      const next = await apiUpdateHumanGm(user, snapshot.session.id, gmUserId, accessToken);
      updateSnapshot(next);
      appendLog('rest', 'GM 지정', '인간 GM을 변경했습니다.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'GM 지정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function startSession() {
    if (!user || !snapshot) return;
    setError(null);
    setBusy(true);

    try {
      const next = await apiStartSession(user, snapshot.session.id, accessToken);
      updateSnapshot(next);
      await refreshSessionList();
      appendLog('rest', '세션 시작', `${next.session.title} 세션을 시작했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '세션 시작에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function leaveSession(): Promise<boolean> {
    if (!user || !snapshot) return false;
    setError(null);
    setBusy(true);

    const previousSnapshot = snapshot;
    const leavingSessionId = snapshot.session.id;
    const leavingSessionTitle = snapshot.session.title;
    clearLocalSessionState();

    try {
      await apiLeaveSession(user, leavingSessionId, accessToken);
      appendLog('rest', '세션 이탈', `${leavingSessionTitle} 세션에서 이탈했습니다.`);
      await refreshSessionList();
      await refreshMyCharacters();
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '세션 이탈에 실패했습니다.';

      if (isStaleLeaveErrorMessage(message)) {
        appendLog('rest', '세션 이탈', `${leavingSessionTitle} 세션 이탈 상태를 동기화했습니다.`);
        await refreshSessionList();
        await refreshMyCharacters();
        return true;
      }

      updateSnapshot(previousSnapshot);
      setError(message);
      await refreshSessionList();
      await refreshMyCharacters();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function sendAction(rawText: string) {
    if (!user || !snapshot) return;

    const trimmed = rawText.trim();
    if (!trimmed) return;

    const myParticipant = snapshot.participants.find(
      (participant) => participant.userId === user.id
    );
    const selectedCharacterId =
      myParticipant?.sessionCharacterId ?? myParticipant?.characterId ?? null;

    if (!selectedCharacterId) {
      const message = '행동을 입력하려면 먼저 캐릭터를 선택해야 합니다.';
      setError(message);
      appendLog('socket', '행동 전송 실패', message);
      return;
    }

    const payload: SubmitActionDto = {
      characterId: selectedCharacterId,
      rawText: trimmed,
      clientCreatedAt: new Date().toISOString(),
      // 전투가 아닐 때는 파티 공용 행동으로 보내며, 현재 백엔드 검증 규칙을 따릅니다.
      actionScope:
        snapshot.state.phase === 'combat'
          ? ('INDIVIDUAL_TURN' as ActionScope)
          : ('PARTY_SHARED' as ActionScope),
      inputType: trimmed.startsWith('/')
        ? ('COMMAND' as ActionInputType)
        : ('TEXT' as ActionInputType),
    };

    setError(null);
    setBusy(true);

    try {
      await apiSubmitAction(user, snapshot.session.id, payload, accessToken);
      // 화면 표시는 서버가 저장하고 브로드캐스트하는 turn.log.created 이벤트만 믿습니다.
      // 그래야 DB에 남은 기록과 사용자가 보는 로그가 같은 출처를 가집니다.
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '행동 전송에 실패했습니다.';
      setError(message);
      appendLog('socket', '행동 전송 실패', message);
    } finally {
      setBusy(false);
    }
  }

  async function requestRest(
    restType: RestActionDto['restType'],
    characterId?: string,
    hitDiceToSpend?: number,
  ) {
    if (!user || !snapshot) return;

    const myParticipant = snapshot.participants.find(
      (participant) => participant.userId === user.id
    );
    const selectedCharacterId =
      characterId ?? myParticipant?.sessionCharacterId ?? myParticipant?.characterId ?? null;

    if (!selectedCharacterId) {
      const message = '휴식하려면 먼저 캐릭터를 선택해야 합니다.';
      setError(message);
      appendLog('socket', '휴식 요청 실패', message);
      return;
    }

    setError(null);
    setBusy(true);

    try {
      const response = await apiSubmitRestAction(
        user,
        snapshot.session.id,
        {
          characterId: selectedCharacterId,
          restType,
          ...(restType === 'short' && hitDiceToSpend && hitDiceToSpend > 0
            ? { hitDiceToSpend }
            : {}),
        },
        accessToken,
      );
      const restApprovalMetadata = getRestApprovalMetadataFromResponse(response);
      if (response.restApproval?.status === 'gm_required' && restApprovalMetadata) {
        appendLog(
          'action',
          user.displayName,
          formatRestApprovalRequestMessage(response.restApproval),
          `rest-approval:${response.restApproval.actionId}`,
          undefined,
          restApprovalMetadata
        );
      }
      await syncSession(snapshot.session.id);
      if (isLongRestAccepted(response, restType) && response.restApproval?.status !== 'gm_required') {
        appendLog(
          'rest',
          '준비 주문 안내',
          '긴 휴식이 처리되었습니다. 준비 주문을 쓰는 캐릭터는 캐릭터 화면에서 준비 주문을 다시 조정할 수 있습니다.',
          `long-rest-prepared-spells:${response.playerActionId}`
        );
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '휴식 요청에 실패했습니다.';
      setError(message);
      appendLog('socket', '휴식 요청 실패', message);
    } finally {
      setBusy(false);
    }
  }

  async function approveRestRequest(actionId: string) {
    if (!user || !snapshot) return false;

    setError(null);
    setBusy(true);

    try {
      const response = await apiApproveRestAction(user, snapshot.session.id, actionId, accessToken);
      await syncSession(snapshot.session.id);
      appendLog(
        'rest',
        '휴식 승인',
        'GM이 휴식 요청을 승인했습니다.',
        `rest-approval:${actionId}:approved`,
        undefined,
        getRestApprovalMetadataFromResponse(response)
      );
      if (isLongRestAccepted(response)) {
        appendLog(
          'rest',
          '준비 주문 안내',
          '긴 휴식이 승인되었습니다. 준비 주문을 쓰는 캐릭터는 캐릭터 화면에서 준비 주문을 다시 조정할 수 있습니다.',
          `long-rest-prepared-spells:${response.playerActionId}`
        );
      }
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '휴식 요청 승인에 실패했습니다.';
      setError(message);
      appendLog('socket', '휴식 승인 실패', message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function rejectRestRequest(actionId: string) {
    if (!user || !snapshot) return false;

    setError(null);
    setBusy(true);

    try {
      const response = await apiRejectRestAction(user, snapshot.session.id, actionId, accessToken);
      await syncSession(snapshot.session.id);
      appendLog(
        'rest',
        '휴식 거절',
        'GM이 휴식 요청을 거절했습니다.',
        `rest-approval:${actionId}:rejected`,
        undefined,
        getRestApprovalMetadataFromResponse(response)
      );
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '휴식 요청 거절에 실패했습니다.';
      setError(message);
      appendLog('socket', '휴식 거절 실패', message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function cancelRestRequest(actionId: string) {
    if (!user || !snapshot) return false;

    setError(null);
    setBusy(true);

    try {
      const response = await apiCancelRestAction(user, snapshot.session.id, actionId, accessToken);
      await syncSession(snapshot.session.id);
      appendLog(
        'rest',
        '휴식 요청 취소',
        '휴식 요청을 취소했습니다.',
        `rest-approval:${actionId}:cancelled`,
        undefined,
        getRestApprovalMetadataFromResponse(response)
      );
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '휴식 요청 취소에 실패했습니다.';
      setError(message);
      appendLog('socket', '휴식 요청 취소 실패', message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendMainCommand(
    payload: SubmitMainCommandDto
  ): Promise<MainCommandResponseDto | null> {
    if (!user || !snapshot) return null;

    const rawText = payload.rawInputText?.trim() || payload.playerText.trim();
    if (!rawText) return null;

    const clientLogId = crypto.randomUUID();
    const isRpAction = isDeclareRpActionIntent(payload.intent);
    const rawLogId = `main-command:${clientLogId}:${isRpAction ? 'rp-raw' : 'raw'}`;
    const pendingLogId = `main-command:${clientLogId}:pending`;
    const createdAt = new Date().toISOString();
    const pendingEntry: PendingMainCommandLog = {
      clientLogId,
      rawLogId,
      pendingLogId,
      rawText,
      userId: user.id,
      isPendingVisible: true,
    };

    setError(null);
    setBusy(true);

    // API 왕복 전에 사용자의 입력과 대기 상태를 먼저 표시해 전송이 먹혔는지 즉시 알 수 있게 합니다.
    appendLog('action', user.displayName, `[MAIN]${rawText}`, rawLogId, createdAt);
    appendLog('action', '세션 로그', '[MAIN]...', pendingLogId);
    pendingEntry.timeoutId = window.setTimeout(() => {
      removeLog(pendingLogId);
      pendingEntry.isPendingVisible = false;
      pendingEntry.timeoutId = undefined;
    }, 45_000);
    pendingMainCommandLogsRef.current = [...pendingMainCommandLogsRef.current, pendingEntry];

    try {
      const response = await apiSubmitMainCommand(
        user,
        snapshot.session.id,
        payload,
        accessToken,
      );
      // CHECK_REQUIRED 응답 시 로컬 d20 굴림으로 오버레이 띄움 (v1: 단일 클라이언트 가시).
      // 서버 권위 굴림 + 브로드캐스트는 BE 합의 후 후속 작업으로 교체.
      if (response?.status === 'CHECK_REQUIRED' && response.checkOptions?.[0]) {
        const diceOverlay = buildCheckRequiredOverlay(
          response.checkOptions[0],
          user.id,
          user.displayName,
        );
        setActiveDiceRoll(diceOverlay);
        const checkEffect = getMainCommandCheckEffect(response);
        if (checkEffect) {
          const checkPendingEntry = appendPendingMainCommandCheckLog(response.requestId);
          try {
            const resolved = await apiResolveMainCommandCheck(
              user,
              snapshot.session.id,
              {
                requestId: response.requestId,
                actorId: payload.actorId,
                outcome:
                  diceOverlay.outcome === 'SUCCESS'
                    ? ('SUCCESS' as ResolveMainCommandCheckDto['outcome'])
                    : ('FAILURE' as ResolveMainCommandCheckDto['outcome']),
                effect: checkEffect,
              },
              accessToken,
            );
            return resolved;
          } catch (caught) {
            const message =
              caught instanceof Error ? caught.message : '판정 결과 반영에 실패했습니다.';
            setError(message);
            appendLog('socket', '판정 결과 반영 실패', message);
          } finally {
            removePendingMainCommandCheckLog(checkPendingEntry);
          }
        }
      }
      return response;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '메인 명령 전송에 실패했습니다.';
      removePendingMainCommandLog(pendingEntry, { removeRaw: false });
      setError(message);
      appendLog('socket', '메인 명령 전송 실패', message);
      appendLog(
        'action',
        '세션 로그',
        `[MAIN]메인 명령 전송 실패: ${message}`,
        `main-command:${clientLogId}:error`
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function resolveMainCommandCheck(
    payload: ResolveMainCommandCheckDto
  ): Promise<MainCommandResponseDto | null> {
    if (!user || !snapshot) return null;

    setError(null);
    setBusy(true);
    const checkPendingEntry = appendPendingMainCommandCheckLog(payload.requestId);

    try {
      return await apiResolveMainCommandCheck(user, snapshot.session.id, payload, accessToken);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '판정 결과 반영에 실패했습니다.';
      setError(message);
      appendLog('socket', '판정 결과 반영 실패', message);
      return null;
    } finally {
      removePendingMainCommandCheckLog(checkPendingEntry);
      setBusy(false);
    }
  }

  async function sendChatMessage(content: string, scope: 'CHAT' | 'MAIN' = 'CHAT') {
    if (!user || !snapshot) return;

    const trimmed = content.trim();
    if (!trimmed) return;

    setError(null);

    if (trimmed.length > 1000) {
      const message = '채팅 메시지는 1000자 이하로 입력해주세요.';
      setError(message);
      appendLog('socket', scope === 'MAIN' ? 'RP 대사 전송 실패' : '채팅 전송 실패', message);
      return;
    }

    const socket = socketRef.current;
    if (!socket?.connected) {
      const message = '실시간 채팅 연결 후 다시 시도해주세요.';
      setError(message);
      appendLog('socket', scope === 'MAIN' ? 'RP 대사 전송 실패' : '채팅 전송 실패', message);
      return;
    }

    // 서버가 membership을 다시 확인하고 같은 세션 room에 broadcast합니다.
    // 그래서 로컬에 즉시 추가하지 않고, 서버가 알려준 chat.message 이벤트만 화면에 표시합니다.
    sendRealtimeChatMessage(socket, snapshot.session.id, trimmed, scope);
  }

  function clearSnapshot() {
    clearLocalSessionState();
  }

  // 오버레이 컴포넌트의 onDismiss 로 넘어가므로 안정적인 참조여야 한다
  // (매 렌더마다 새 함수면 오버레이 내부 자동 닫힘 타이머가 계속 리셋된다).
  const dismissDiceRoll = useCallback(() => setActiveDiceRoll(null), []);

  return {
    snapshot,
    sessionList,
    mySessionList,
    myCharacters,
    socketConnected,
    hasOlderTurnLogs: Boolean(turnLogNextCursor),
    isLoadingTurnLogs,
    busy,
    error,
    createSession,
    joinSession,
    joinSessionById,
    createCharacter,
    cloneCharacter,
    updateCharacter,
    levelUpCharacter,
    updatePreparedSpells,
    deleteCharacter,
    selectCharacter,
    setReadyState,
    setHumanGm,
    startSession,
    leaveSession,
    sendMainCommand,
    resolveMainCommandCheck,
    requestRest,
    approveRestRequest,
    rejectRestRequest,
    cancelRestRequest,
    sendAction,
    sendChatMessage,
    loadOlderTurnLogs,
    refreshSessionList,
    refreshMyCharacters,
    clearSnapshot,
    clearError: () => setError(null),
    activeDiceRoll,
    dismissDiceRoll,
  };
}
