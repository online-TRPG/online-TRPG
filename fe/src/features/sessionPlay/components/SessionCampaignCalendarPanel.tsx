import { useEffect, useMemo, useState } from "react";
import type {
  ApplyCampaignCalendarActionDto,
  SessionCharacterResponseDto,
} from "@trpg/shared-types";
import "./SessionCampaignCalendarPanel.css";

type CampaignScheduleProposalView = {
  id: string;
  title?: string;
  startsAt?: string;
  durationMinutes?: number;
  timeZone?: string;
  status?: string;
  responses?: Array<{
    id: string;
    userId: string;
    availability: string;
    note?: string | null;
  }>;
};

type CampaignDowntimeTaskView = {
  id: string;
  type: string;
  sessionCharacterId: string;
  title?: string;
  status?: string;
  costGp?: number;
  workDaysRequired?: number;
  workDaysCompleted?: number;
  requiredTools?: string[];
};

type CampaignTimelineEventView = {
  id: string;
  type: string;
  inGameDate?: string | null;
  elapsedDays?: number;
  note?: string | null;
};

type CampaignCalendarStateView = {
  inGameDate?: string | null;
  elapsedDays?: number;
  scheduleProposals?: CampaignScheduleProposalView[];
  timeline?: CampaignTimelineEventView[];
  downtimeTasks?: CampaignDowntimeTaskView[];
};

interface SessionCampaignCalendarPanelProps {
  calendar: CampaignCalendarStateView | null;
  characters: SessionCharacterResponseDto[];
  canManageCampaign: boolean;
  isBusy: boolean;
  feedback?: string | null;
  onApply: (payload: ApplyCampaignCalendarActionDto) => Promise<void> | void;
}

const actionLabels: Record<ApplyCampaignCalendarActionDto["actionType"], string> = {
  propose_schedule: "일정 후보 제안",
  respond_schedule: "참석 응답",
  confirm_schedule: "일정 확정",
  advance_game_time: "게임 시간 경과",
  start_downtime: "Downtime 시작",
  pause_downtime: "Downtime 중단",
  resume_downtime: "Downtime 재개",
  complete_downtime: "Downtime 완료",
};

const downtimeTypeLabels: Record<NonNullable<ApplyCampaignCalendarActionDto["downtimeType"]>, string> = {
  crafting: "제작",
  training: "훈련",
  research: "연구",
  recovery: "회복",
  identify: "감정",
  repair: "수리",
  shop_restock: "상점 재입고",
};

export function SessionCampaignCalendarPanel({
  calendar,
  characters,
  canManageCampaign,
  isBusy,
  feedback,
  onApply,
}: SessionCampaignCalendarPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [actionType, setActionType] =
    useState<ApplyCampaignCalendarActionDto["actionType"]>("propose_schedule");
  const [scheduleId, setScheduleId] = useState("");
  const [downtimeTaskId, setDowntimeTaskId] = useState("");
  const [sessionCharacterId, setSessionCharacterId] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [timeZone, setTimeZone] = useState("Asia/Seoul");
  const [availability, setAvailability] =
    useState<NonNullable<ApplyCampaignCalendarActionDto["availability"]>>("available");
  const [inGameDate, setInGameDate] = useState("");
  const [elapsedDays, setElapsedDays] = useState(1);
  const [downtimeType, setDowntimeType] =
    useState<NonNullable<ApplyCampaignCalendarActionDto["downtimeType"]>>("research");
  const [costGp, setCostGp] = useState(0);
  const [workDaysRequired, setWorkDaysRequired] = useState(5);
  const [workDaysDelta, setWorkDaysDelta] = useState(1);
  const [requiredTools, setRequiredTools] = useState("");
  const [availableTools, setAvailableTools] = useState("");
  const [note, setNote] = useState("");

  const schedules = calendar?.scheduleProposals ?? [];
  const downtimeTasks = calendar?.downtimeTasks ?? [];
  const timeline = calendar?.timeline ?? [];
  const selectedDowntimeTask =
    downtimeTasks.find((task) => task.id === downtimeTaskId) ?? downtimeTasks[0] ?? null;
  const availableActionLabels = useMemo(
    () =>
      Object.entries(actionLabels).filter(
        ([value]) =>
          canManageCampaign ||
          value === "propose_schedule" ||
          value === "respond_schedule",
      ) as Array<[ApplyCampaignCalendarActionDto["actionType"], string]>,
    [canManageCampaign],
  );

  const characterNameById = useMemo(() => {
    const entries = characters.map((character) => [character.id, character.name] as const);
    return new Map(entries);
  }, [characters]);

  useEffect(() => {
    if (
      !canManageCampaign &&
      actionType !== "propose_schedule" &&
      actionType !== "respond_schedule"
    ) {
      setActionType("respond_schedule");
    }
  }, [actionType, canManageCampaign]);

  function submit() {
    const payload: ApplyCampaignCalendarActionDto = {
      actionType,
      idempotencyKey: `ui-${actionType}-${Date.now()}`,
      scheduleId: scheduleId || undefined,
      responseId: actionType === "respond_schedule" ? `response-${Date.now()}` : undefined,
      downtimeTaskId:
        actionType === "start_downtime"
          ? downtimeTaskId || `downtime-${Date.now()}`
          : downtimeTaskId || selectedDowntimeTask?.id || undefined,
      sessionCharacterId: sessionCharacterId || undefined,
      title: title || undefined,
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      durationMinutes,
      availability,
      timeZone: timeZone || undefined,
      inGameDate: inGameDate || undefined,
      elapsedDays,
      downtimeType,
      costGp,
      workDaysRequired,
      workDaysDelta,
      requiredTools: requiredTools
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      availableTools: availableTools
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      note: note || undefined,
    };

    void onApply(payload);
  }

  return (
    <aside className={`session-campaign-calendar-panel${collapsed ? " collapsed" : ""}`}>
      <button
        type="button"
        className="session-campaign-calendar-toggle"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
      >
        {collapsed ? "캘린더" : "캠페인 캘린더 접기"}
      </button>
      {!collapsed ? (
        <div className="session-campaign-calendar-body">
          <header>
            <strong>캠페인 캘린더 · Downtime</strong>
            <span>현실 일정과 게임 내 시간을 분리하고 서버 감사 로그로 기록합니다.</span>
          </header>

          <section className="session-campaign-calendar-summary">
            <div>
              <b>게임 시간</b>
              <span>{calendar?.inGameDate ?? "미설정"} · {calendar?.elapsedDays ?? 0}일 경과</span>
            </div>
            <div>
              <b>일정 후보</b>
              {schedules.length ? schedules.map((schedule) => (
                <span key={schedule.id}>
                  {schedule.title ?? schedule.id} · {schedule.status ?? "proposed"} · {schedule.responses?.length ?? 0}명 응답
                </span>
              )) : <span>등록된 후보 없음</span>}
            </div>
            <div>
              <b>Downtime</b>
              {downtimeTasks.length ? downtimeTasks.map((task) => (
                <span key={task.id}>
                  {task.title ?? task.id} · {task.status ?? "active"} · {characterNameById.get(task.sessionCharacterId) ?? task.sessionCharacterId}
                </span>
              )) : <span>진행 중인 작업 없음</span>}
            </div>
            <div>
              <b>Timeline</b>
              {timeline.slice(-3).length ? timeline.slice(-3).map((event) => (
                <span key={event.id}>
                  {event.type} · {event.inGameDate ?? "날짜 없음"} · +{event.elapsedDays ?? 0}일
                </span>
              )) : <span>기록 없음</span>}
            </div>
          </section>

          <section className="session-campaign-calendar-form">
            <select value={actionType} onChange={(event) => setActionType(event.target.value as typeof actionType)}>
            {availableActionLabels.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {["respond_schedule", "confirm_schedule"].includes(actionType) ? (
              <select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}>
                <option value="">일정 선택</option>
                {schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>{schedule.title ?? schedule.id}</option>
                ))}
              </select>
            ) : null}
            {actionType === "propose_schedule" ? (
              <>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="일정 제목" />
                <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
                <input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Math.max(1, Number(event.target.value) || 1))} placeholder="분" />
                <input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="Asia/Seoul" />
              </>
            ) : null}
            {actionType === "respond_schedule" ? (
              <select value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)}>
                <option value="available">참석 가능</option>
                <option value="tentative">미정</option>
                <option value="unavailable">참석 불가</option>
              </select>
            ) : null}
            {actionType === "advance_game_time" ? (
              <>
                <input value={inGameDate} onChange={(event) => setInGameDate(event.target.value)} placeholder="게임 내 날짜" />
                <input type="number" min={0} value={elapsedDays} onChange={(event) => setElapsedDays(Math.max(0, Number(event.target.value) || 0))} placeholder="경과 일수" />
              </>
            ) : null}
            {actionType === "start_downtime" ? (
              <>
                <select value={sessionCharacterId} onChange={(event) => setSessionCharacterId(event.target.value)}>
                  <option value="">캐릭터 선택</option>
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>{character.name}</option>
                  ))}
                </select>
                <select value={downtimeType} onChange={(event) => setDowntimeType(event.target.value as typeof downtimeType)}>
                  {Object.entries(downtimeTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="작업 제목" />
                <input type="number" min={0} value={costGp} onChange={(event) => setCostGp(Math.max(0, Number(event.target.value) || 0))} placeholder="비용 gp" />
                <input type="number" min={0} value={workDaysRequired} onChange={(event) => setWorkDaysRequired(Math.max(0, Number(event.target.value) || 0))} placeholder="필요 일수" />
                <input value={requiredTools} onChange={(event) => setRequiredTools(event.target.value)} placeholder="필요 도구, 쉼표 구분" />
                <input value={availableTools} onChange={(event) => setAvailableTools(event.target.value)} placeholder="보유/승인 도구, 쉼표 구분" />
              </>
            ) : null}
            {["pause_downtime", "resume_downtime", "complete_downtime"].includes(actionType) ? (
              <>
                <select value={downtimeTaskId} onChange={(event) => setDowntimeTaskId(event.target.value)}>
                  <option value="">Downtime 선택</option>
                  {downtimeTasks.map((task) => (
                    <option key={task.id} value={task.id}>{task.title ?? task.id}</option>
                  ))}
                </select>
                {actionType === "complete_downtime" ? (
                  <input type="number" min={0} value={workDaysDelta} onChange={(event) => setWorkDaysDelta(Math.max(0, Number(event.target.value) || 0))} placeholder="완료 일수" />
                ) : null}
              </>
            ) : null}
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="감사 로그 메모" />
            <button type="button" disabled={isBusy} onClick={submit}>
              {isBusy ? "처리 중" : actionLabels[actionType]}
            </button>
          </section>
          {feedback ? <p className="session-campaign-calendar-feedback">{feedback}</p> : null}
        </div>
      ) : null}
    </aside>
  );
}
