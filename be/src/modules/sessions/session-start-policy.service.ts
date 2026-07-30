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

    const playerWithoutCharacter = params.participants.find(
      (participant) =>
        participant.role === PrismaParticipantRole.PLAYER &&
        !participant.sessionCharacter,
    );
    if (playerWithoutCharacter) {
      throw new ConflictException(
        "SESSION_CHARACTER_ASSIGNMENT_REQUIRED: 참가 중인 플레이어가 캐릭터를 선택하지 않았습니다.",
      );
    }

    // 준비 여부와 접속 여부는 관리자 판단에 맡기되, 맵 토큰의 근거가 되는
    // 플레이어-세션 캐릭터 연결만 데이터 무결성 조건으로 강제한다.
  }
}
