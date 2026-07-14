import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActionAcceptedResponseDto,
  ActionAcceptedEventDto,
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
  VttMapDeltaDto,
  VttMapStateDto,
  ActivePlayResponseDto,
  SessionPlayResponseDto,
  SessionScheduleVersionAcknowledgementDto,
} from '@trpg/shared-types';
import {
  ActionInputType,
  ActionOutcome,
  ActionScope,
  CHAT_MESSAGE_MAX_LENGTH,
  DiceAdvantageState,
  MAIN_COMMAND_PENDING_LOG_TIMEOUT_MS,
  getMainCommandCheckEffect,
  getPrimaryMainCommandCheckOption,
  isMainCommandCheckRequired,
  isRecord,
  normalizeSessionStatus,
  SessionActivityStatus,
  SessionParticipantStatus,
} from '@trpg/shared-types/frontend';
import {
  applyVttMapDelta,
  parseCharacterStateDiff,
  SessionCharacterStatus,
} from '@trpg/shared-types/browser-runtime';
import type { Socket } from 'socket.io-client';
import {
  cloneCharacter as apiCloneCharacter,
  createCharacter as apiCreateCharacter,
  deleteCharacter as apiDeleteCharacter,
  listMyCharacters as apiListMyCharacters,
  levelUpCharacter as apiLevelUpCharacter,
  selectSessionCharacter as apiSelectSessionCharacter,
  updateCharacter as apiUpdateCharacter,
  updatePreparedSpells as apiUpdatePreparedSpells,
} from '../services/characterApi';
import {
  approveRestAction as apiApproveRestAction,
  enterActivePlay as apiEnterActivePlay,
  heartbeatActivePlay as apiHeartbeatActivePlay,
  leaveActivePlay as apiLeaveActivePlay,
  listSessionPlays as apiListSessionPlays,
  cancelRestAction as apiCancelRestAction,
  createSession as apiCreateSession,
  getSession,
  getSessionApplicationProximityWarnings as apiGetSessionApplicationProximityWarnings,
  getSessionInviteProximityWarnings as apiGetSessionInviteProximityWarnings,
  joinSession as apiJoinSession,
  joinSessionById as apiJoinSessionById,
  leaveSession as apiLeaveSession,
  listRemovedParticipants as apiListRemovedParticipants,
  listTurnLogs as apiListTurnLogs,
  listMySessions as apiListMySessions,
  listSessions,
  rejectRestAction as apiRejectRestAction,
  removeSessionParticipant as apiRemoveSessionParticipant,
  restoreSessionParticipant as apiRestoreSessionParticipant,
  resolveMainCommandCheck as apiResolveMainCommandCheck,
  startSessionPlay as apiStartSessionPlay,
  submitAction as apiSubmitAction,
  submitMainCommand as apiSubmitMainCommand,
  submitRestAction as apiSubmitRestAction,
  updateSession as apiUpdateSession,
  transitionSessionPlay as apiTransitionSessionPlay,
  updateReadyState as apiUpdateReadyState,
} from '../services/sessionApi';
import type { CreateSessionInput, UpdateSessionInput } from '../services/sessionApi';
import { connectSessionSocket, sendRealtimeChatMessage } from '../services/realtime';
import { clearStoredSnapshot, loadStoredSnapshot, saveStoredSnapshot } from '../services/storage';
import { readVttMapFromSessionFlags } from '../features/sessionPlay/utils/sessionStateFlags';
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
import type { AppendLogsFn, LogWriteInput } from './useLogs';

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

function toRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
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
  sessionListTotal: number;
  mySessionList: AvailableSessionListItem[];
  mySessionListTotal: number;
  myCharacters: PersistentCharacter[];
  removedParticipants: Participant[];
  sessionPlays: SessionPlayResponseDto[];
  activePlay: ActivePlayResponseDto | null;
  socketConnected: boolean;
  hasOlderTurnLogs: boolean;
  isLoadingTurnLogs: boolean;
  busy: boolean;
  error: string | null;
  confirmation: { title: string; message: string; confirmLabel: string; danger?: boolean } | null;
  resolveConfirmation: (confirmed: boolean) => void;
  createSession: (input: CreateSessionInput) => Promise<SessionSnapshot | null>;
  updateSession: (input: UpdateSessionInput) => Promise<SessionSnapshot | null>;
  joinSession: (inviteCode: string) => Promise<SessionSnapshot | null>;
  joinSessionById: (sessionId: string) => Promise<SessionSnapshot | null>;
  enterPlay: (sessionId: string, playId: string) => Promise<boolean>;
  exitPlayView: () => Promise<void>;
  refreshSessionPlays: (sessionId?: string) => Promise<void>;
  createCharacter: (payload: CharacterPayload) => Promise<boolean>;
  cloneCharacter: (characterId: string) => Promise<void>;
  updateCharacter: (characterId: string, payload: CharacterPayload) => Promise<boolean>;
  levelUpCharacter: (characterId: string, payload: LevelUpCharacterDto) => Promise<boolean>;
  updatePreparedSpells: (characterId: string, payload: UpdatePreparedSpellsDto) => Promise<boolean>;
  deleteCharacter: (characterId: string) => Promise<void>;
  selectCharacter: (characterId: string | null) => Promise<void>;
  setReadyState: (isReady: boolean) => Promise<void>;
  startSession: () => Promise<void>;
  finishCurrentPlay: () => Promise<SessionSnapshot | null>;
  leaveSession: () => Promise<boolean>;
  removeParticipant: (participantPublicId: string) => Promise<boolean>;
  restoreParticipant: (participantPublicId: string) => Promise<boolean>;
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

function isDeclareRpActionIntent(value: unknown): boolean {
  return value === 'DECLARE_RP_ACTION';
}

function isRpMainCommandTurnLog(turnLog: TurnLogResponseDto): boolean {
  const structuredAction = toRecord(turnLog.structuredAction);
  return Boolean(structuredAction && isDeclareRpActionIntent(structuredAction.intent));
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
  const command = toRecord(turnLog.structuredAction);

  if (!command || command.type !== 'main_command') {
    return undefined;
  }

  const data = toRecord(command.data);
  const npcDialogue = toRecord(data?.npcDialogue);
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
  const restAction = toRecord(turnLog.structuredAction);

  if (
    !restAction ||
    restAction.type !== 'rest' ||
    restAction.approvalStatus !== 'gm_required' ||
    turnLog.actionQueueStatus !== 'REJECTED' ||
    !turnLog.playerActionId
  ) {
    return undefined;
  }

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

  return compactStrings(parts).join(' / ');
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return values.flatMap((value) => typeof value === 'string' && value.length > 0 ? [value] : []);
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

function readDiceInteger(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
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

  const diceRecord = toRecord(dice);
  if (!diceRecord) {
    return null;
  }
  const rawRolls = diceRecord.rolls;
  const rolls = Array.isArray(rawRolls)
    ? rawRolls.filter(isPositiveInteger)
    : [];
  if (!rolls.length) {
    return null;
  }

  const modifier = readDiceInteger(diceRecord, "modifier") ?? 0;
  const total = readDiceInteger(diceRecord, "total") ?? 0;
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

  const structured = toRecord(turnLog.structuredAction);
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
    targetValue = structured ? readDiceInteger(structured, "dc") : null;
  } else if (actionType === "attack") {
    title = "공격";
    subtitle = "공격 판정";
    targetLabel = "방어도";
    targetValue = structured
      ? readDiceInteger(structured, "targetArmorClass") ??
        readDiceInteger(structured, "dc")
      : null;
  } else if (actionType === "combat_hide") {
    title = "숨기";
    subtitle = "민첩(은신) 판정";
    targetLabel = "난이도";
    targetValue = structured ? readDiceInteger(structured, "dc") : null;
  } else if (actionType === "auto_hazard_detection") {
    title = "위험 탐지";
    subtitle = "지혜(감지) 판정";
    targetLabel = "난이도";
    targetValue =
      structured ? readDiceInteger(structured, "detectionDc") : readDiceInteger(diceRecord, "dc");
  } else if (actionType === "vtt_hazard_trigger") {
    title = "함정 피해";
    subtitle = "피해 굴림";
    targetLabel = "피해";
    targetValue = readDiceInteger(diceRecord, "total");
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

// CHECK_REQUIRED 시 대상 클라이언트에만 d20 오버레이를 띄운다.
// 결과는 check-result API 를 통해 서버 TurnLog 로 브로드캐스트한다.
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
    typeof checkOption.dc === "number" &&
    Number.isInteger(checkOption.dc) &&
    checkOption.dc >= 5 &&
    checkOption.dc <= 30
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

function buildCheckRequiredDiceResult(
  overlay: DiceRollOverlayData,
): ResolveMainCommandCheckDto['diceResult'] {
  return {
    expression: overlay.expression,
    rolls: overlay.rolls,
    modifier: overlay.modifier,
    total: overlay.total,
    advantageState: DiceAdvantageState[overlay.advantage],
    naturalRoll: overlay.naturalRoll,
    dc: overlay.targetValue ?? undefined,
    outcome: ActionOutcome[overlay.outcome],
  };
}

export function useSession(
  user: StoredUser | null,
  accessToken: string | null,
  appendLog: AppendLogFn,
  appendOlderLogs: AppendLogsFn,
  removeLog: (id: string) => void,
  clearSessionLogs: () => void
): UseSessionReturn {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(() => loadStoredSnapshot());
  const [sessionList, setSessionList] = useState<AvailableSessionListItem[]>([]);
  const [sessionListTotal, setSessionListTotal] = useState(0);
  const [mySessionList, setMySessionList] = useState<AvailableSessionListItem[]>([]);
  const [mySessionListTotal, setMySessionListTotal] = useState(0);
  const [myCharacters, setMyCharacters] = useState<PersistentCharacter[]>([]);
  const [removedParticipants, setRemovedParticipants] = useState<Participant[]>([]);
  const [sessionPlays, setSessionPlays] = useState<SessionPlayResponseDto[]>([]);
  const [activePlay, setActivePlay] = useState<ActivePlayResponseDto | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [turnLogNextCursor, setTurnLogNextCursor] = useState<string | null>(null);
  const [isLoadingTurnLogs, setIsLoadingTurnLogs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<UseSessionReturn['confirmation']>(null);
  // 세션 진행 중 주사위 굴림을 전원에게 보여주는 오버레이. turn.log.created 이벤트로 채워진다.
  const [activeDiceRoll, setActiveDiceRoll] = useState<DiceRollOverlayData | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const snapshotRef = useRef<SessionSnapshot | null>(snapshot);
  const seenTurnLogIdsRef = useRef<Set<string>>(new Set());
  const loadedTurnLogSessionIdRef = useRef<string | null>(null);
  const pendingMainCommandLogsRef = useRef<PendingMainCommandLog[]>([]);
  const pendingMainCommandCheckLogsRef = useRef<PendingMainCommandCheckLog[]>([]);
  const confirmationResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  function requestConfirmation(next: NonNullable<UseSessionReturn['confirmation']>): Promise<boolean> {
    confirmationResolverRef.current?.(false);
    setConfirmation(next);
    return new Promise<boolean>((resolve) => {
      confirmationResolverRef.current = resolve;
    });
  }

  function resolveConfirmation(confirmed: boolean) {
    const resolve = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmation(null);
    resolve?.(confirmed);
  }

  useEffect(() => () => confirmationResolverRef.current?.(false), []);

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
      }, MAIN_COMMAND_PENDING_LOG_TIMEOUT_MS);
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
    setActivePlay(null);
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
    setSessionPlays([]);
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
          status: normalizeSessionStatus(matchedSession.status),
        },
      };
    },
    []
  );

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (!user) {
      // 로그아웃/토큰 만료 직후 이전 사용자의 세션 화면이 남지 않도록 메모리 상태까지 함께 비웁니다.
      setSnapshot(null);
      snapshotRef.current = null;
      clearStoredSnapshot();
      setSessionList([]);
      setSessionListTotal(0);
      setMySessionList([]);
      setMySessionListTotal(0);
      setMyCharacters([]);
      setRemovedParticipants([]);
      seenTurnLogIdsRef.current.clear();
      loadedTurnLogSessionIdRef.current = null;
      setTurnLogNextCursor(null);
      setIsLoadingTurnLogs(false);
      clearSessionLogs();
      return;
    }

    void listSessions(user, accessToken)
      .then((result) => {
        setSessionList(result.content);
        setSessionListTotal(result.totalElements);
      })
      .catch(() => undefined);

    void apiListMySessions(user, accessToken)
      .then((result) => {
        setMySessionList(result.content);
        setMySessionListTotal(result.totalElements);
      })
      .catch(() => undefined);

    void apiListMyCharacters(user, accessToken)
      .then(setMyCharacters)
      .catch(() => undefined);
  }, [accessToken, clearSessionLogs, user]);

  useEffect(() => {
    if (!user || !snapshot || snapshot.session.hostUserId !== user.id) {
      setRemovedParticipants([]);
      return;
    }
    void apiListRemovedParticipants(user, snapshot.session.id, accessToken)
      .then(setRemovedParticipants)
      .catch(() => setRemovedParticipants([]));
  }, [accessToken, snapshot?.session.hostUserId, snapshot?.session.id, user]);

  const buildPlayerRawInputLog = useCallback(
    (turnLog: TurnLogResponseDto): LogWriteInput | null => {
      if (isAutoHazardDetectionTurnLog(turnLog) || isVttHazardTriggerTurnLog(turnLog)) {
        return null;
      }

      const rawInput = turnLog.rawInput?.trim();
      if (!rawInput) {
        return null;
      }

      // TurnLog는 DB에 남으므로 새로고침/재접속 후에도 같은 id로 말풍선을 다시 만들 수 있습니다.
      const rawLogId = turnLog.playerActionId
        ? `player-action:${turnLog.playerActionId}:raw`
        : `turn-log:${turnLog.turnLogId}:${isRpMainCommandTurnLog(turnLog) ? 'rp-raw' : 'raw'}`;
      const senderName = turnLog.actorUserId
        ? getSenderNameByUserId(turnLog.actorUserId, snapshotRef.current)
        : '알 수 없음';

      return {
        kind: 'action',
        title: senderName,
        message: `[MAIN]${rawInput}`,
        id: rawLogId,
        createdAt: getRawInputCreatedAt(turnLog),
      };
    },
    []
  );

  const appendPlayerRawInputLog = useCallback(
    (turnLog: TurnLogResponseDto, writeLog: AppendLogFn) => {
      const rawInputLog = buildPlayerRawInputLog(turnLog);
      if (!rawInputLog) return;

      writeLog(
        rawInputLog.kind,
        rawInputLog.title,
        rawInputLog.message,
        rawInputLog.id,
        rawInputLog.createdAt,
        rawInputLog.metadata
      );
    },
    [buildPlayerRawInputLog]
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

  const appendHistoricalTurnLogs = useCallback(
    (turnLogs: TurnLogResponseDto[]) => {
      const entries: LogWriteInput[] = [];

      for (const turnLog of turnLogs) {
        if (seenTurnLogIdsRef.current.has(turnLog.turnLogId)) {
          continue;
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

        entries.push({
          kind: 'action',
          title: '세션 로그',
          message: formatTurnLogMessage(turnLog),
          id: `turn-log:${turnLog.turnLogId}`,
          createdAt: turnLog.createdAt,
          metadata: getTurnLogMetadata(turnLog),
        });
        const rawInputLog = buildPlayerRawInputLog(turnLog);
        if (rawInputLog) entries.push(rawInputLog);
      }

      appendOlderLogs(entries);
    },
    [appendOlderLogs, buildPlayerRawInputLog, removeLog, removePendingMainCommandLog]
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
        appendHistoricalTurnLogs(result.turnLogs);
        setTurnLogNextCursor(result.nextCursor);
      } catch {
        // 게임룸 진입 직후 로그 조회 실패는 입력 흐름 자체를 막을 정도의 오류가 아니므로 조용히 넘깁니다.
      } finally {
        if (snapshotRef.current?.session.id === sessionId) {
          setIsLoadingTurnLogs(false);
        }
      }
    },
    [accessToken, appendHistoricalTurnLogs, user]
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
      appendHistoricalTurnLogs(result.turnLogs);
      setTurnLogNextCursor(result.nextCursor);
    } catch {
      // 이전 로그 조회 실패는 현재 입력 흐름을 막지 않으므로 화면에는 기존 로그를 그대로 둡니다.
    } finally {
      if (snapshotRef.current?.session.id === sessionId) {
        setIsLoadingTurnLogs(false);
      }
    }
  }, [accessToken, appendHistoricalTurnLogs, isLoadingTurnLogs, turnLogNextCursor, user]);

  useEffect(() => {
    if (
      !user ||
      !snapshot?.session.id ||
      !snapshot.session.currentPlayId ||
      activePlay?.sessionId !== snapshot.session.id ||
      activePlay.playId !== snapshot.session.currentPlayId
    ) return undefined;

    const socket: Socket = connectSessionSocket(user, snapshot.session.id, {
      onSnapshot: updateSnapshot,
      onParticipantUpdated: (participant: Participant) => {
        if (participant.userId === user.id && participant.status !== SessionParticipantStatus.JOINED) {
          clearLocalSessionState();
          setError(
            participant.status === SessionParticipantStatus.KICKED
              ? '세션 관리자가 이 세션에서 내보냈습니다.'
              : '세션 소속이 종료되었습니다.',
          );
          return;
        }
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
        }, MAIN_COMMAND_PENDING_LOG_TIMEOUT_MS);
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
        const current = snapshotRef.current;
        if (!current) return false;
        if (current.state.version === stateDiff.nextVersion) return true;
        if (current.state.version !== stateDiff.baseVersion) return false;

        const patches = parseCharacterStateDiff(stateDiff);
        if (!patches) return false;
        const byCharacterId = new Map(
          patches
            .filter((patch) => patch.sessionCharacterId)
            .map((patch) => [patch.sessionCharacterId as string, patch]),
        );
        if (
          [...byCharacterId.keys()].some(
            (characterId) => !current.characters.some((character) => character.id === characterId),
          )
        ) {
          return false;
        }

        const characters = current.characters.map((character) => {
          const patch = byCharacterId.get(character.id);
          if (!patch) return character;
          return {
            ...character,
            ...(patch.currentHp === undefined ? {} : { currentHp: patch.currentHp }),
            ...(patch.tempHp === undefined ? {} : { tempHp: patch.tempHp }),
            ...(patch.conditions === undefined ? {} : { conditions: patch.conditions }),
            ...(patch.markDead === true
              ? { status: SessionCharacterStatus.DEAD }
              : patch.markDead === false && character.status === SessionCharacterStatus.DEAD
                ? { status: SessionCharacterStatus.ACTIVE }
                : {}),
          };
        });
        updateSnapshot({
          ...current,
          characters,
          sessionCharacters: characters,
          state: {
            ...current.state,
            version: stateDiff.nextVersion,
          },
        });
        appendLog('socket', '상태 변화', formatStateDiffMessage(stateDiff));
        return true;
      },
      onVttMapUpdated: (map: VttMapStateDto) => {
        const current = snapshotRef.current;
        if (!current) return;
        const currentMap = readVttMapFromSessionFlags(current.state.flags);
        if (getVttMapSocketSignature(currentMap) === getVttMapSocketSignature(map)) {
          return;
        }

        updateSnapshot({
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
        });
      },
      onVttMapDelta: (delta: VttMapDeltaDto) => {
        const current = snapshotRef.current;
        if (!current) return false;
        const currentMap = readVttMapFromSessionFlags(current.state.flags);
        if (!currentMap) return false;
        const result = applyVttMapDelta(currentMap, delta);
        if (result.status !== 'applied') {
          return false;
        }
        if (result.map === currentMap) {
          return true;
        }

        updateSnapshot({
          ...current,
          state: {
            ...current.state,
            flags: {
              ...current.state.flags,
              vttMap: result.map,
            },
            state: {
              ...current.state.state,
              vttMap: result.map,
            },
          },
        });
        return true;
      },
      onCombatUpdated: (combat) => {
        const current = snapshotRef.current;
        if (current) {
          const byCharacterId = new Map(
            combat.participants
              .filter((participant) => participant.sessionCharacterId)
              .map((participant) => [participant.sessionCharacterId as string, participant]),
          );
          const characters = current.characters.map((character) => {
            const participant = byCharacterId.get(character.id);
            if (!participant) return character;
            return {
              ...character,
              ...(participant.currentHp === null ? {} : { currentHp: participant.currentHp }),
              ...(typeof participant.tempHp === 'number' ? { tempHp: participant.tempHp } : {}),
              ...(participant.isAlive === false
                ? { status: SessionCharacterStatus.DEAD }
                : character.status === SessionCharacterStatus.DEAD
                  ? { status: SessionCharacterStatus.ACTIVE }
                  : {}),
              conditions: participant.conditions,
            };
          });
          updateSnapshot({
            ...current,
            characters,
            sessionCharacters: characters,
          });
        }
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
  }, [activePlay?.playId, activePlay?.sessionId, appendLog, appendServerTurnLog, removeLog, snapshot?.session.currentPlayId, snapshot?.session.id, updateSnapshot, user]);

  useEffect(() => {
    if (!user || !activePlay) return undefined;
    const intervalId = window.setInterval(() => {
      void apiHeartbeatActivePlay(user, activePlay.playId, accessToken)
        .then(setActivePlay)
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [accessToken, activePlay?.playId, user]);

  useEffect(() => {
    if (!user) return undefined;
    const refreshPlays = () => {
      const sessionId = snapshotRef.current?.session.id;
      if (!sessionId) return;
      void apiListSessionPlays(user, sessionId, accessToken).then(setSessionPlays).catch(() => undefined);
    };
    const handleActivePlayChanged = (event: Event) => {
      if (!(event instanceof CustomEvent) || !isRecord(event.detail)) return;
      const payload = event.detail;
      if (payload.activePlay === null) {
        setActivePlay(null);
        return;
      }
      if (!isRecord(payload.activePlay)) return;
      const next = payload.activePlay;
      if (
        typeof next.sessionId === 'string' &&
        typeof next.playId === 'string' &&
        typeof next.acquiredAt === 'string' &&
        typeof next.heartbeatAt === 'string'
      ) {
        setActivePlay({
          sessionId: next.sessionId,
          playId: next.playId,
          acquiredAt: next.acquiredAt,
          heartbeatAt: next.heartbeatAt,
        });
      }
    };
    window.addEventListener('trpg:session-play-updated', refreshPlays);
    window.addEventListener('trpg:session-attendance-updated', refreshPlays);
    window.addEventListener('trpg:active-play-changed', handleActivePlayChanged);
    return () => {
      window.removeEventListener('trpg:session-play-updated', refreshPlays);
      window.removeEventListener('trpg:session-attendance-updated', refreshPlays);
      window.removeEventListener('trpg:active-play-changed', handleActivePlayChanged);
    };
  }, [accessToken, user]);

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
      setSessionListTotal(publicSessions.totalElements);
      setMySessionList(mySessions.content);
      setMySessionListTotal(mySessions.totalElements);
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

  async function refreshSessionPlays(sessionId = snapshotRef.current?.session.id) {
    if (!user || !sessionId) {
      setSessionPlays([]);
      return;
    }
    try {
      setSessionPlays(await apiListSessionPlays(user, sessionId, accessToken));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '플레이 일정을 불러오지 못했습니다.');
    }
  }

  async function enterPlay(sessionId: string, playId: string): Promise<boolean> {
    if (!user) return false;
    setError(null);
    setBusy(true);
    try {
      const acquired = await apiEnterActivePlay(user, sessionId, playId, false, accessToken);
      setActivePlay(acquired);
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '대기실에 입장하지 못했습니다.';
      if (
        (message.includes('다른 플레이') || message.includes('이동하면 현재 플레이')) &&
        await requestConfirmation({
          title: '실시간 플레이 전환',
          message: `${message}\n\n현재 플레이에서 나가고 새 플레이로 이동할까요?`,
          confirmLabel: '새 플레이로 이동',
        })
      ) {
        try {
          const acquired = await apiEnterActivePlay(user, sessionId, playId, true, accessToken);
          setActivePlay(acquired);
          return true;
        } catch (retryError) {
          setError(retryError instanceof Error ? retryError.message : '플레이 전환에 실패했습니다.');
          return false;
        }
      }
      setError(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function exitPlayView(): Promise<void> {
    if (user) {
      try {
        await apiLeaveActivePlay(user, accessToken);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '플레이 화면에서 나가지 못했습니다.');
      }
    }
    setActivePlay(null);
    clearLocalSessionState();
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

  async function createSession(input: CreateSessionInput): Promise<SessionSnapshot | null> {
    if (!user) return null;

    setError(null);
    setBusy(true);

    try {
      const next = await apiCreateSession(user, input, accessToken);
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

  async function updateSession(input: UpdateSessionInput): Promise<SessionSnapshot | null> {
    if (!user || !snapshot) return null;

    setError(null);
    setBusy(true);
    try {
      await apiUpdateSession(
        user,
        snapshot.session.publicId || snapshot.session.id,
        input,
        accessToken,
      );
      const next = await getSession(
        user,
        snapshot.session.publicId || snapshot.session.id,
        accessToken,
      );
      updateSnapshot(next);
      await refreshSessionListInternal();
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '세션 설정을 저장하지 못했습니다.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function confirmProximityWarnings(sessionId: string): Promise<SessionScheduleVersionAcknowledgementDto[] | null> {
    if (!user) return null;
    const warnings = await apiGetSessionApplicationProximityWarnings(user, sessionId, accessToken);
    if (!warnings.length) return [];
    const scheduleLines = warnings.map((warning) => {
      const start = new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(warning.scheduledStartAt));
      const hours = Math.floor(warning.differenceMinutes / 60);
      const minutes = warning.differenceMinutes % 60;
      const interval = hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
      return `· ${warning.sessionTitle} · ${start} · 시작 간격 ${interval}`;
    });
    const confirmed = await requestConfirmation({
      title: '가까운 플레이 일정 확인',
      message: [
      '이미 참가를 예정한 플레이와 시작 시간이 6시간 이하로 가깝습니다.',
      '',
      ...scheduleLines,
      '',
      '시간이 겹칠 수 있다는 점을 확인했으며 그대로 계속할까요?',
      ].join('\n'),
      confirmLabel: '확인하고 계속',
    });
    return confirmed ? warnings.map((warning) => ({
      comparedPlayId: warning.comparedPlayId,
      playScheduleVersion: warning.targetScheduleVersion,
      comparedScheduleVersion: warning.scheduleVersion,
    })) : null;
  }

  async function confirmInviteProximityWarnings(inviteCode: string): Promise<SessionScheduleVersionAcknowledgementDto[] | null> {
    if (!user) return null;
    const warnings = await apiGetSessionInviteProximityWarnings(user, inviteCode, accessToken);
    if (!warnings.length) return [];
    const lines = warnings.map((warning) =>
      `· ${warning.sessionTitle} · ${new Date(warning.scheduledStartAt).toLocaleString('ko-KR')} · ${warning.differenceMinutes}분 차이`,
    );
    const confirmed = await requestConfirmation({
      title: '가까운 플레이 일정 확인',
      message: [
      '이미 참가를 예정한 플레이와 시작 시간이 6시간 이하로 가깝습니다.',
      '',
      ...lines,
      '',
      '겹칠 수 있음을 확인하고 초대를 수락할까요?',
      ].join('\n'),
      confirmLabel: '확인하고 초대 수락',
    });
    return confirmed ? warnings.map((warning) => ({
      comparedPlayId: warning.comparedPlayId,
      playScheduleVersion: warning.targetScheduleVersion,
      comparedScheduleVersion: warning.scheduleVersion,
    })) : null;
  }

  async function joinSession(inviteCode: string): Promise<SessionSnapshot | null> {
    if (!user) return null;

    setError(null);
    setBusy(true);

    try {
      const acknowledged = await confirmInviteProximityWarnings(inviteCode);
      if (acknowledged === null) return null;
      const next = await apiJoinSession(user, inviteCode, accessToken, acknowledged);
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
    const currentSessionMatches = snapshotRef.current && (
      snapshotRef.current.session.id === sessionId ||
      snapshotRef.current.session.publicId === sessionId
    );

    setError(null);
    setBusy(true);

    try {
      const acknowledged = knownSession || currentSessionMatches
        ? []
        : await confirmProximityWarnings(sessionId);
      if (acknowledged === null) return null;
      const next = currentSessionMatches
        ? await getSession(user, sessionId, accessToken)
        : knownSession
        ? await getSession(
            user,
            knownSession.sessionPublicId || knownSession.sessionId,
            accessToken
          )
        : await apiJoinSessionById(user, sessionId, accessToken, acknowledged);
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

  async function startSession() {
    if (!user || !snapshot?.session.currentPlayId) return;
    setError(null);
    setBusy(true);

    try {
      const plays = await apiListSessionPlays(user, snapshot.session.id, accessToken);
      const currentPlay = plays.find((play) => play.id === snapshot.session.currentPlayId);
      if (!currentPlay) throw new Error('현재 플레이 정보를 찾지 못했습니다.');
      const next = await apiStartSessionPlay(user, snapshot.session.id, currentPlay.id, {
        expectedStateVersion: currentPlay.stateVersion,
      }, accessToken);
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
    const isHostLeaving = snapshot.session.hostUserId === user.id;
    clearLocalSessionState();

    try {
      await apiLeaveSession(user, leavingSessionId, accessToken);
      appendLog(
        'rest',
        isHostLeaving ? '세션 삭제' : '세션 이탈',
        isHostLeaving
          ? `${leavingSessionTitle} 세션을 삭제했습니다.`
          : `${leavingSessionTitle} 세션에서 이탈했습니다.`,
      );
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

  async function finishCurrentPlay(): Promise<SessionSnapshot | null> {
    if (!user || !snapshot?.session.currentPlayId) return null;
    setError(null);
    setBusy(true);
    try {
      const plays = await apiListSessionPlays(user, snapshot.session.id, accessToken);
      const currentPlay = plays.find((play) => play.id === snapshot.session.currentPlayId);
      if (!currentPlay) throw new Error('현재 플레이 정보를 찾지 못했습니다.');
      await apiTransitionSessionPlay(user, snapshot.session.id, currentPlay.id, 'finish', {
        expectedStateVersion: currentPlay.stateVersion,
      }, accessToken);
      setActivePlay(null);
      socketRef.current?.disconnect();
      socketRef.current = null;
      const next = await getSession(user, snapshot.session.id, accessToken);
      updateSnapshot(next);
      await refreshSessionListInternal();
      setSessionPlays(await apiListSessionPlays(user, next.session.id, accessToken));
      appendLog('rest', '플레이 닫기', '진행을 저장하고 플레이를 닫았습니다.');
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '진행을 저장하지 못했습니다.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function removeParticipant(participantPublicId: string): Promise<boolean> {
    if (!user || !snapshot) return false;
    setBusy(true);
    setError(null);
    try {
      await apiRemoveSessionParticipant(user, snapshot.session.id, participantPublicId, accessToken);
      const removed = snapshot.participants.find(
        (participant) => participant.user.publicId === participantPublicId,
      );
      if (removed) setRemovedParticipants((current) => [removed, ...current]);
      const nextSnapshot = await getSession(user, snapshot.session.id, accessToken);
      updateSnapshot(nextSnapshot);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '참가자를 내보내지 못했습니다.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function restoreParticipant(participantPublicId: string): Promise<boolean> {
    if (!user || !snapshot) return false;
    setBusy(true);
    setError(null);
    try {
      await apiRestoreSessionParticipant(user, snapshot.session.id, participantPublicId, accessToken);
      setRemovedParticipants((current) =>
        current.filter((participant) => participant.user.publicId !== participantPublicId),
      );
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '참가자 복구에 실패했습니다.');
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
          ? ActionScope.INDIVIDUAL_TURN
          : ActionScope.PARTY_SHARED,
      inputType: trimmed.startsWith('/')
        ? ActionInputType.COMMAND
        : ActionInputType.TEXT,
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
    }, MAIN_COMMAND_PENDING_LOG_TIMEOUT_MS);
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
      const primaryCheckOption = getPrimaryMainCommandCheckOption(response);
      if (isMainCommandCheckRequired(response) && primaryCheckOption) {
        const diceOverlay = buildCheckRequiredOverlay(
          primaryCheckOption,
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
                    ? ActionOutcome.SUCCESS
                    : ActionOutcome.FAILURE,
                effect: checkEffect,
                diceResult: buildCheckRequiredDiceResult(diceOverlay),
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

    if (trimmed.length > CHAT_MESSAGE_MAX_LENGTH) {
      const message = `채팅 메시지는 ${CHAT_MESSAGE_MAX_LENGTH}자 이하로 입력해주세요.`;
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
    sessionListTotal,
    mySessionList,
    mySessionListTotal,
    myCharacters,
    removedParticipants,
    sessionPlays,
    activePlay,
    socketConnected,
    hasOlderTurnLogs: Boolean(turnLogNextCursor),
    isLoadingTurnLogs,
    busy,
    error,
    confirmation,
    resolveConfirmation,
    createSession,
    updateSession,
    joinSession,
    joinSessionById,
    enterPlay,
    exitPlayView,
    refreshSessionPlays,
    createCharacter,
    cloneCharacter,
    updateCharacter,
    levelUpCharacter,
    updatePreparedSpells,
    deleteCharacter,
    selectCharacter,
    setReadyState,
    startSession,
    finishCurrentPlay,
    leaveSession,
    removeParticipant,
    restoreParticipant,
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
