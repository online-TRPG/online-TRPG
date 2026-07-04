import { Injectable } from "@nestjs/common";
import { ApplyCampaignCalendarActionDto } from "@trpg/shared-types";

@Injectable()
export class SessionCampaignCalendarActionPolicyService {
  canPlayerSubmit(actionType: ApplyCampaignCalendarActionDto["actionType"]): boolean {
    return actionType === "propose_schedule" || actionType === "respond_schedule";
  }
}
