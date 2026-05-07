import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { SessionCharacterResponseDto } from "../api/characters.dto";
import {
  CombatResponseDto,
  DiceRollResponseDto,
  StateDiffResponseDto,
  TurnAdvanceResponseDto,
  TurnLogResponseDto,
} from "../api/gameplay.dto";
import {
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  VttMapStateDto,
} from "../api/sessions.dto";

export class SessionJoinMessageDto {
  @ApiProperty()
  @IsString()
  sessionId!: string;
}

export class ChatSendMessageDto {
  @ApiProperty()
  @IsString()
  sessionId!: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content!: string;
}

export class SessionSnapshotEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: SessionSnapshotDto })
  snapshot!: SessionSnapshotDto;
}

export class ParticipantUpdatedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: SessionParticipantResponseDto })
  participant!: SessionParticipantResponseDto;
}

export class CharacterUpdatedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: SessionCharacterResponseDto })
  character!: SessionCharacterResponseDto;
}

export class SessionStatusUpdatedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: SessionResponseDto })
  session!: SessionResponseDto;
}

export class ActionAcceptedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  playerActionId!: string;
}

export class TurnLogCreatedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: TurnLogResponseDto })
  turnLog!: TurnLogResponseDto;
}

export class DiceRolledEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: DiceRollResponseDto })
  diceResult!: DiceRollResponseDto;
}

export class StateDiffAppliedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: StateDiffResponseDto })
  stateDiff!: StateDiffResponseDto;
}

export class CombatUpdatedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: CombatResponseDto })
  combat!: CombatResponseDto;
}

export class TurnChangedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: TurnAdvanceResponseDto })
  turn!: TurnAdvanceResponseDto;
}

export class SystemMessageEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty()
  code!: string;
}

export class ChatMessageEventDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  senderUserId!: string;

  @ApiProperty()
  senderDisplayName!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  createdAt!: string;
}

export class VttMapUpdatedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: VttMapStateDto })
  map!: VttMapStateDto;
}
