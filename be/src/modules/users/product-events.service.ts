import { Injectable, Logger } from "@nestjs/common";
import type { RecordProductEventDto } from "@trpg/shared-types";

@Injectable()
export class ProductEventsService {
  private readonly logger = new Logger("ProductEvent");

  record(userId: string, event: RecordProductEventDto): void {
    this.logger.log(JSON.stringify({
      kind: "product_event",
      userId,
      eventName: event.eventName,
      eventVersion: event.eventVersion,
      occurredAt: event.occurredAt,
      screen: event.screen,
      success: event.success,
      reasonCode: event.reasonCode ?? null,
    }));
  }
}
