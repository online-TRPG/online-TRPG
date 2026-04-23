import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class AbilityScoresDto {
  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  str!: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  dex!: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  con!: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  int!: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  wis!: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  cha!: number;
}

export class InventoryItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateCharacterDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  ancestry!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  className!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  @ApiPropertyOptional({ type: AbilityScoresDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AbilityScoresDto)
  abilities?: AbilityScoresDto;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  proficiencyBonus?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proficientSkills?: string[];

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxHp?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  armorClass?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  speed?: number;

  @ApiPropertyOptional({ type: [InventoryItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  inventory?: InventoryItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  equippedWeaponId?: string;
}

export class UpdateCharacterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  ancestry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  className?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  @ApiPropertyOptional({ type: AbilityScoresDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AbilityScoresDto)
  abilities?: AbilityScoresDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  proficiencyBonus?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proficientSkills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxHp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  armorClass?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  speed?: number;

  @ApiPropertyOptional({ type: [InventoryItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  inventory?: InventoryItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  equippedWeaponId?: string | null;
}

export class UpdateCharacterEquipmentDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  equippedWeaponId?: string | null;
}

export class CharacterInventoryResponseDto {
  @ApiProperty()
  characterId!: string;

  @ApiProperty({ type: [InventoryItemDto] })
  inventory!: InventoryItemDto[];

  @ApiPropertyOptional({ nullable: true })
  equippedWeaponId!: string | null;
}

export class CharacterResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  ownerUserId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  ancestry!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty()
  level!: number;

  @ApiProperty({ type: AbilityScoresDto })
  abilities!: AbilityScoresDto;

  @ApiProperty()
  proficiencyBonus!: number;

  @ApiProperty({ type: [String] })
  proficientSkills!: string[];

  @ApiProperty()
  maxHp!: number;

  @ApiProperty()
  armorClass!: number;

  @ApiProperty()
  speed!: number;

  @ApiProperty({ type: [InventoryItemDto] })
  inventory!: InventoryItemDto[];

  @ApiPropertyOptional({ nullable: true })
  equippedWeaponId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  activeSessionId!: string | null;

  @ApiProperty()
  isSelectable!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class SessionCharacterResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  participantId!: string;

  @ApiProperty()
  characterId!: string;

  @ApiProperty()
  ownerUserId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  ancestry!: string;

  @ApiProperty()
  className!: string;

  @ApiProperty()
  level!: number;

  @ApiProperty({ type: AbilityScoresDto })
  abilities!: AbilityScoresDto;

  @ApiProperty()
  proficiencyBonus!: number;

  @ApiProperty({ type: [String] })
  proficientSkills!: string[];

  @ApiProperty()
  maxHp!: number;

  @ApiProperty()
  currentHp!: number;

  @ApiProperty()
  tempHp!: number;

  @ApiProperty()
  armorClass!: number;

  @ApiProperty()
  speed!: number;

  @ApiProperty({ type: [InventoryItemDto] })
  inventory!: InventoryItemDto[];

  @ApiPropertyOptional({ nullable: true })
  equippedWeaponId!: string | null;

  @ApiProperty({ type: [String] })
  conditions!: string[];

  @ApiPropertyOptional({ nullable: true })
  initiative!: number | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
