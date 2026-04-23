import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateGuestUserDto {
  @ApiProperty({ example: "Alice" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  displayName!: string;
}

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  createdAt!: string;
}
