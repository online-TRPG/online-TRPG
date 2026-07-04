import { ConflictException, Injectable } from "@nestjs/common";
import { SessionStatus as PrismaSessionStatus } from "@prisma/client";

@Injectable()
export class SessionDeletePolicyService {
  ensureCanDelete(sessionStatus: PrismaSessionStatus): void {
    if (sessionStatus !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("Only recruiting sessions can be deleted.");
    }
  }
}
