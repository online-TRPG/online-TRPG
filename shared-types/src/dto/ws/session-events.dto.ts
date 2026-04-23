import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";
import { CharacterResponseDto } from "../api/characters.dto";
import {
  SessionParticipantResponseDto,
  SessionResponseDto,
  SessionSnapshotDto,
} from "../api/sessions.dto";

export class SessionJoinMessageDto {
  @ApiProperty()
  @IsString()
  sessionId!: string;
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

  @ApiProperty({ type: CharacterResponseDto })
  character!: CharacterResponseDto;
}

export class SessionStatusUpdatedEventDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: SessionResponseDto })
  session!: SessionResponseDto;
}
