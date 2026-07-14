import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { AuthProvider, UserRole } from "../../constants/enums";

export class CreateGuestUserDto {
  @ApiProperty({ example: "Alice" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  displayName!: string;
}

export class RegisterUserDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(100)
  email!: string;

  @ApiProperty({ example: "P@ssword123" })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ example: "홍길동" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(10)
  name!: string;
}

export class ConvertGuestToLocalUserDto extends RegisterUserDto {}

export class LoginUserDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: "P@ssword123" })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class DeleteMeDto {
  @ApiProperty({ required: false, example: "P@ssword123" })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reauthTicket?: string;

  @ApiProperty({ required: false, example: "DELETE" })
  @IsOptional()
  @IsString()
  confirmation?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}

export class RequestPasswordResetDto {
  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(100)
  email!: string;
}

export class ConfirmPasswordResetDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}

export const PRODUCT_EVENT_NAMES = [
  "tutorial_started",
  "tutorial_completed",
  "tutorial_dismissed",
  "first_action_submitted",
  "session_search_performed",
  "session_create_started",
  "session_create_completed",
  "invite_preview_opened",
  "invite_join_completed",
  "session_resumed",
  "session_application_submitted",
  "session_play_scheduled",
  "session_proximity_warning_shown",
  "session_proximity_warning_acknowledged",
  "session_lobby_entered",
  "session_live_play_switched",
  "session_play_finished",
  "session_member_left",
  "session_member_removed",
  "account_conversion_completed",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export class RecordProductEventDto {
  @ApiProperty({ enum: PRODUCT_EVENT_NAMES })
  @IsIn([...PRODUCT_EVENT_NAMES])
  eventName!: ProductEventName;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  eventVersion!: number;

  @ApiProperty()
  @IsISO8601()
  occurredAt!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  screen!: string;

  @ApiProperty()
  @IsBoolean()
  success!: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reasonCode?: string | null;
}

export class UpdateMeDto {
  @ApiProperty({ example: "길동이" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(10)
  displayName!: string;
}

export class OAuthUrlQueryDto {
  @ApiProperty({ example: "http://localhost:5173/oauth/callback" })
  @IsString()
  @IsNotEmpty()
  redirectUri!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  state?: string;
}

export class OAuthLoginDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  redirectUri!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  state?: string;
}

export class AuthTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: "Bearer" })
  tokenType!: "Bearer";

  @ApiProperty({ example: 172800 })
  expiresIn!: number;
}

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  publicId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ required: false, nullable: true })
  email!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  nickname!: string;

  @ApiProperty({ enum: AuthProvider })
  authProvider!: AuthProvider;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  createdAt!: string;
}

export class LoginResponseDto extends AuthTokenResponseDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}

export class EmailCheckResponseDto {
  @ApiProperty()
  email!: string;

  @ApiProperty()
  available!: boolean;
}

export class OAuthUrlResponseDto {
  @ApiProperty()
  provider!: "KAKAO" | "DISCORD";

  @ApiProperty()
  authUrl!: string;
}

export class OAuthReauthResponseDto {
  @ApiProperty()
  ticket!: string;

  @ApiProperty({ example: 300 })
  expiresIn!: number;
}

export const PRODUCT_PROGRESS_ACTIONS = [
  "start_tutorial",
  "dismiss_tutorial",
  "complete_tutorial",
  "record_first_action",
  "dismiss_coachmark",
] as const;

export type ProductProgressAction = (typeof PRODUCT_PROGRESS_ACTIONS)[number];

export class UpdateUserProductProgressDto {
  @ApiProperty({ enum: PRODUCT_PROGRESS_ACTIONS })
  @IsIn(PRODUCT_PROGRESS_ACTIONS)
  action!: ProductProgressAction;

  @ApiProperty({ required: false, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  coachmark?: string;
}

export class UserProductProgressResponseDto {
  @ApiProperty()
  onboardingVersion!: number;

  @ApiProperty({ nullable: true })
  tutorialStartedAt!: string | null;

  @ApiProperty({ nullable: true })
  firstActionAt!: string | null;

  @ApiProperty({ nullable: true })
  completedAt!: string | null;

  @ApiProperty({ nullable: true })
  dismissedAt!: string | null;

  @ApiProperty({ type: [String] })
  dismissedCoachmarks!: string[];
}
