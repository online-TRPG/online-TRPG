import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { CHAT_MESSAGE_MAX_LENGTH } from "../../constants/runtime-limits";
import { SessionCharacterResponseDto } from "../api/characters.dto";
import {
  CombatResponseDto,
  CombatReactionPromptDto,
  DiceRollResponseDto,
  StateDiffResponseDto,
  TurnAdvanceResponseDto,
  TurnLogResponseDto,
} from "../api/gameplay.dto";
import {
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
  VttMapDeltaDto,
  VttMapStateDto,
} from "../api/sessions.dto";
import { VTT_MAP_DELTA_V2_CAPABILITY } from "../../constants/realtime";

export { VTT_MAP_DELTA_V2_CAPABILITY } from "../../constants/realtime";

export class SessionJoinMessageDto {
  @ApiProperty()
  @IsString()
  sessionId!: string;

  @ApiPropertyOptional({ type: [String], enum: [VTT_MAP_DELTA_V2_CAPABILITY] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn([VTT_MAP_DELTA_V2_CAPABILITY], { each: true })
  capabilities?: string[];
}

export class ChatSendMessageDto {
  @ApiProperty()
  @IsString()
  sessionId!: string;

  @ApiProperty({ maxLength: CHAT_MESSAGE_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHAT_MESSAGE_MAX_LENGTH)
  content!: string;

  @ApiPropertyOptional({ enum: ["CHAT", "MAIN"] })
  @IsOptional()
  @IsIn(["CHAT", "MAIN"])
  scope?: "CHAT" | "MAIN";
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

  @ApiProperty()
  actorUserId!: string;

  @ApiProperty()
  rawText!: string;

  @ApiProperty()
  clientCreatedAt!: string;
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

export class CombatReactionPromptEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: CombatReactionPromptDto })
  reaction!: CombatReactionPromptDto;
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

  @ApiProperty({ required: false, nullable: true })
  playerActionId?: string | null;
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

  @ApiPropertyOptional({ enum: ["CHAT", "MAIN"] })
  scope?: "CHAT" | "MAIN";

  @ApiProperty()
  createdAt!: string;
}

export class VttMapUpdatedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: VttMapStateDto })
  map!: VttMapStateDto;
}

export class VttMapDeltaEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: VttMapDeltaDto })
  delta!: VttMapDeltaDto;
}
