import { Injectable } from "@nestjs/common";
import { SessionNodeRuntimeTransitionService } from "../sessions/session-node-runtime-transition.service";
import type { LoadedContext } from "./main-commands.service";

@Injectable()
export class MainCommandSceneTransitionStateService {
  constructor(
    private readonly sessionNodeRuntimeTransition: SessionNodeRuntimeTransitionService,
  ) {}

  async applySceneTransition(context: LoadedContext, targetNodeId: string): Promise<void> {
    await this.sessionNodeRuntimeTransition.transition({
      sessionId: context.sessionId,
      sessionScenarioId: context.sessionScenarioId,
      targetNodeId,
    });
  }
}
