import type { ApplyCampaignCalendarActionDto } from "@trpg/shared-types";
import { SessionCampaignCalendarActionPolicyService } from "./session-campaign-calendar-action-policy.service";

describe("SessionCampaignCalendarActionPolicyService", () => {
  const service = new SessionCampaignCalendarActionPolicyService();

  it.each<ApplyCampaignCalendarActionDto["actionType"]>([
    "propose_schedule",
    "respond_schedule",
  ])("allows players to submit %s actions", (actionType) => {
    expect(service.canPlayerSubmit(actionType)).toBe(true);
  });

  it.each<ApplyCampaignCalendarActionDto["actionType"]>([
    "confirm_schedule",
    "advance_game_time",
    "start_downtime",
    "pause_downtime",
    "resume_downtime",
    "complete_downtime",
  ])("requires GM authority for %s actions", (actionType) => {
    expect(service.canPlayerSubmit(actionType)).toBe(false);
  });
});
