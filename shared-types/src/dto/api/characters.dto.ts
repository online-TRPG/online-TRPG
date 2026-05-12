import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  CharacterAvatarType,
  SessionCharacterStatus,
} from "../../constants/enums";

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemDefinitionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  weightLb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  volumeCuFt?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  damageDice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  damageType?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  properties?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  containerId?: string;
}

export class CreateCharacterDto {
  @ApiPropertyOptional({ nullable: true, description: "캐릭터를 묶을 시나리오 id. 지정하면 시나리오의 startLevel과 level이 일치해야 함." })
  @IsOptional()
  @IsString()
  scenarioId?: string | null;

  @ApiPropertyOptional({
    type: [Number],
    description: "클래스 시작 장비 슬롯별 선택 인덱스. 시드된 className일 때 필수, 슬롯 개수만큼 정확히 보내야 함.",
    example: [0, 1, 0, 0],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  startingEquipmentSelection?: number[];

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  subclassName?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

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

  @ApiPropertyOptional({ enum: CharacterAvatarType, default: CharacterAvatarType.DEFAULT })
  @IsOptional()
  @IsEnum(CharacterAvatarType)
  avatarType?: CharacterAvatarType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarPresetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
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
  @IsString()
  @MaxLength(50)
  subclassName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

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

  @ApiPropertyOptional({ enum: CharacterAvatarType })
  @IsOptional()
  @IsEnum(CharacterAvatarType)
  avatarType?: CharacterAvatarType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarPresetId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string | null;
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

  @ApiPropertyOptional({ nullable: true })
  scenarioId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  ancestry!: string;

  @ApiProperty()
  className!: string;

  @ApiPropertyOptional({ nullable: true })
  subclassName!: string | null;

  @ApiProperty()
  level!: number;

  @ApiPropertyOptional({ nullable: true })
  bio!: string | null;

  @ApiProperty({ type: AbilityScoresDto })
  abilities!: AbilityScoresDto;

  @ApiProperty()
  proficiencyBonus!: number;

  @ApiProperty({ type: [String] })
  proficientSkills!: string[];

  @ApiProperty({ type: [String] })
  features!: string[];

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

  @ApiProperty({ enum: CharacterAvatarType })
  @IsEnum(CharacterAvatarType)
  avatarType!: CharacterAvatarType;

  @ApiPropertyOptional({ nullable: true })
  avatarPresetId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUpdatedAt!: string | null;

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
  userId!: string;

  @ApiProperty()
  characterId!: string;

  @ApiProperty()
  ownerUserId!: string;

  @ApiProperty({ enum: SessionCharacterStatus })
  @IsEnum(SessionCharacterStatus)
  status!: SessionCharacterStatus;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  ancestry!: string;

  @ApiProperty()
  className!: string;

  @ApiPropertyOptional({ nullable: true })
  subclassName!: string | null;

  @ApiProperty()
  level!: number;

  @ApiProperty({ type: AbilityScoresDto })
  abilities!: AbilityScoresDto;

  @ApiProperty()
  proficiencyBonus!: number;

  @ApiProperty({ type: [String] })
  proficientSkills!: string[];

  @ApiProperty({ type: [String] })
  features!: string[];

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

  @ApiPropertyOptional({ nullable: true })
  bio!: string | null;

  @ApiProperty({ enum: CharacterAvatarType })
  @IsEnum(CharacterAvatarType)
  avatarType!: CharacterAvatarType;

  @ApiPropertyOptional({ nullable: true })
  avatarPresetId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ type: [String] })
  conditions!: string[];

  @ApiPropertyOptional({ nullable: true })
  initiative!: number | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
