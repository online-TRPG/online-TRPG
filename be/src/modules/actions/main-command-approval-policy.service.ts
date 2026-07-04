import { Injectable } from "@nestjs/common";
import { MainCommandIntent } from "@trpg/shared-types";

const APPROVAL_INTENTS = new Set<MainCommandIntent>([
  MainCommandIntent.SPLIT_PARTY_TASK,
  MainCommandIntent.COMBAT_MANEUVER,
  MainCommandIntent.ENVIRONMENT_USE,
  MainCommandIntent.IMPROVISED_ATTACK,
  MainCommandIntent.CALLED_SHOT,
  MainCommandIntent.READY_ACTION,
  MainCommandIntent.REACTION_REQUEST,
  MainCommandIntent.USE_ITEM_EXPLORE,
  MainCommandIntent.USE_ITEM_COMBAT,
  MainCommandIntent.USE_SPELL_CREATIVELY,
]);

@Injectable()
export class MainCommandApprovalPolicyService {
  requiresGmApproval(intent: MainCommandIntent): boolean {
    return APPROVAL_INTENTS.has(intent);
  }
}
