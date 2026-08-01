import { ConflictException, Injectable } from "@nestjs/common";
import {
  GmMode as PrismaGmMode,
  ParticipantRole as PrismaParticipantRole,
  SessionCharacterStatus as PrismaSessionCharacterStatus,
  SessionStatus as PrismaSessionStatus,
} from "@prisma/client";

type SessionStartParticipant = {
  userId: string;
  role: PrismaParticipantRole;
  isReady: boolean;
  sessionCharacter?: {
    id: string;
    status: PrismaSessionCharacterStatus;
    character: {
      name: string;
      level: number;
    };
  } | null;
};

type PlayerTokenProjection = {
  sessionCharacterId?: string | null;
  hidden?: boolean;
  isHostile?: boolean;
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

    const playerWithoutCharacter = params.participants.find((participant) => {
      const isPlayerParticipant =
        participant.role === PrismaParticipantRole.PLAYER;
      const isAiHostPlayer =
        params.session.gmMode === PrismaGmMode.AI &&
        participant.role === PrismaParticipantRole.HOST &&
        participant.userId === params.session.hostUserId;
      return (
        (isPlayerParticipant || isAiHostPlayer) &&
        (!participant.sessionCharacter ||
          participant.sessionCharacter.status !==
            PrismaSessionCharacterStatus.ACTIVE)
      );
    });
    if (playerWithoutCharacter) {
      throw new ConflictException(
        "SESSION_CHARACTER_ASSIGNMENT_REQUIRED: 참가 중인 플레이어가 활성 캐릭터를 선택하지 않았습니다.",
      );
    }

    // 준비 여부와 접속 여부는 관리자 판단에 맡기되, 맵 토큰의 근거가 되는
    // 플레이어-세션 캐릭터 연결만 데이터 무결성 조건으로 강제한다.
  }

  ensurePlayerTokensCreated(params: {
    session: {
      hostUserId: string;
      gmMode: PrismaGmMode;
    };
    participants: SessionStartParticipant[];
    tokens: PlayerTokenProjection[];
  }): void {
    const requiredSessionCharacterIds = params.participants.flatMap(
      (participant) => {
        const isPlayerParticipant =
          participant.role === PrismaParticipantRole.PLAYER;
        const isAiHostPlayer =
          params.session.gmMode === PrismaGmMode.AI &&
          participant.role === PrismaParticipantRole.HOST &&
          participant.userId === params.session.hostUserId;
        return (isPlayerParticipant || isAiHostPlayer) &&
          participant.sessionCharacter?.status ===
            PrismaSessionCharacterStatus.ACTIVE
          ? [participant.sessionCharacter.id]
          : [];
      },
    );
    const createdSessionCharacterIds = new Set(
      params.tokens.flatMap((token) =>
        token.sessionCharacterId &&
        token.hidden !== true &&
        token.isHostile !== true
          ? [token.sessionCharacterId]
          : [],
      ),
    );
    const missingSessionCharacterIds = requiredSessionCharacterIds.filter(
      (id) => !createdSessionCharacterIds.has(id),
    );
    if (missingSessionCharacterIds.length > 0) {
      throw new ConflictException({
        code: "SESSION_CHARACTER_TOKEN_REQUIRED",
        message:
          "활성 캐릭터의 시작 토큰을 생성하지 못했습니다. 캐릭터 선택과 시나리오 시작 위치를 확인해주세요.",
        missingSessionCharacterIds,
      });
    }
  }
}
