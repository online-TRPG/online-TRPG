import { ConflictException, Injectable } from "@nestjs/common";
import {
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";

type SessionStartParticipant = {
  userId: string;
  role: PrismaParticipantRole;
  isReady: boolean;
  sessionCharacter?: {
    character: {
      name: string;
      level: number;
    };
  } | null;
};

type SessionStartScenario = {
  title?: string | null;
  startLevel?: number | null;
  recommendedEndLevel?: number | null;
};

@Injectable()
export class SessionStartPolicyService {
  ensureCanStart(params: {
    session: {
      status: PrismaSessionStatus;
      hostUserId: string;
      gmMode: PrismaGmMode;
      gmUserId?: string | null;
    };
    participants: SessionStartParticipant[];
    scenario: SessionStartScenario;
  }): void {
    if (params.session.status !== PrismaSessionStatus.RECRUITING) {
      throw new ConflictException("입장 가능한 대기실에서만 플레이를 시작할 수 있습니다.");
    }

    // 준비 여부, 접속 여부, 캐릭터 선택과 인원은 세션 관리자에게 보여 줄 정보이지 시작 차단 조건이 아니다.
    // 실제 TRPG처럼 최종 시작 판단은 세션 관리자에게 둔다.
  }
}
