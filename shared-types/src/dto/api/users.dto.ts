import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AuthProvider } from "../../constants/enums";

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
  @MaxLength(100)
  email!: string;

  @ApiProperty({ example: "P@ssword123" })
  @IsString()
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

export class LoginUserDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "P@ssword123" })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class DeleteMeDto {
  @ApiProperty({ example: "P@ssword123" })
  @IsString()
  @IsNotEmpty()
  password!: string;
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

  @ApiProperty({ example: 3600 })
  expiresIn!: number;
}

export class UserResponseDto {
  @ApiProperty()
  id!: string;

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
