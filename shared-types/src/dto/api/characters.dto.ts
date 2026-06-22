import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsIn,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  CharacterAvatarType,
  SessionCharacterStatus,
} from "../../constants/enums";

export class InventoryPackContentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

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

export class LevelUpAbilityScoreIncreasesDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  str?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  dex?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  con?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  int?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  wis?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cha?: number;
}

export class StartingSpellsDto {
  @ApiProperty({ type: [String], example: ["light", "ray-of-frost", "fire-bolt"] })
  @IsArray()
  @IsString({ each: true })
  cantrips!: string[];

  @ApiProperty({ type: [String], example: ["magic-missile", "shield", "burning-hands"] })
  @IsArray()
  @IsString({ each: true })
  spells!: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "하루 동안 준비된 슬롯 주문. 없으면 legacy 호환을 위해 spells 전체를 준비된 것으로 취급합니다.",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preparedSpells?: string[];

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
  @IsString()
  description?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  armorClassBase?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  armorClassBonus?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  armorStrengthRequirement?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  armorStealthDisadvantage?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  useEffect?: string;

  @ApiPropertyOptional({ type: [InventoryPackContentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryPackContentDto)
  packContents?: InventoryPackContentDto[];

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

  @ApiPropertyOptional({
    type: Object,
    description: "시작 장비 옵션 안의 자유 선택 placeholder별 실제 아이템 key. key 형식: `${slotIndex}:${itemIndex}`.",
    example: { "1:0": "longsword" },
  })
  @IsOptional()
  @IsObject()
  startingEquipmentItemSelections?: Record<string, string>;

  @ApiPropertyOptional({
    type: StartingSpellsDto,
    description: "마법 클래스(startingCantripCount + startingSpellCount > 0)일 때 필수. 개수가 클래스 시드와 일치해야 함.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => StartingSpellsDto)
  startingSpells?: StartingSpellsDto;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  offhandWeaponId?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  offhandWeaponId?: string | null;

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

export class LevelUpCharacterDto {
  @ApiProperty({ minimum: 2, maximum: 20 })
  @IsInt()
  @Min(2)
  @Max(20)
  targetLevel!: number;

  @ApiPropertyOptional({ enum: ["average", "rolled"], default: "average" })
  @IsOptional()
  @IsString()
  @IsIn(["average", "rolled"])
  hpMode?: "average" | "rolled";

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  rolledHpByLevel?: Record<number, number>;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  applyToActiveSessions?: boolean;

  @ApiPropertyOptional({
    description: "레벨업 중 서브클래스 선택이 필요한 경우 선택한 SRD subclass key입니다.",
    example: "champion",
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  subclassName?: string | null;

  @ApiPropertyOptional({
    type: LevelUpAbilityScoreIncreasesDto,
    description: "4, 8, 12, 16, 19레벨 ASI에서 배분할 능력치 상승치입니다. ASI마다 총 2점을 배분합니다.",
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LevelUpAbilityScoreIncreasesDto)
  abilityScoreIncreases?: LevelUpAbilityScoreIncreasesDto;

  @ApiPropertyOptional({
    type: [String],
    description: "레벨업과 함께 갱신할 준비 주문 목록입니다. 알고 있는 슬롯 주문만 허용됩니다.",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preparedSpells?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "레벨업으로 새로 습득하거나 주문책에 추가할 MVP 슬롯 주문 목록입니다.",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knownSpells?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "레벨업으로 새로 습득할 캔트립 목록입니다.",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cantrips?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "known caster가 이번 레벨업에서 교체할 기존 슬롯 주문 목록입니다.",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  forgottenSpells?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: "이번 레벨업에서 교체할 기존 캔트립 목록입니다.",
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  forgottenCantrips?: string[];
}

export class UpdateCharacterEquipmentDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  equippedWeaponId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  offhandWeaponId?: string | null;
}

export class UpdatePreparedSpellsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  preparedSpells!: string[];
}

export class CharacterInventoryResponseDto {
  @ApiProperty()
  characterId!: string;

  @ApiProperty({ type: [InventoryItemDto] })
  inventory!: InventoryItemDto[];

  @ApiPropertyOptional({ type: StartingSpellsDto, nullable: true })
  spells!: StartingSpellsDto | null;

  @ApiPropertyOptional({ nullable: true })
  equippedWeaponId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  offhandWeaponId!: string | null;
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

  @ApiPropertyOptional({ type: StartingSpellsDto, nullable: true })
  spells!: StartingSpellsDto | null;

  @ApiPropertyOptional({ nullable: true })
  equippedWeaponId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  offhandWeaponId!: string | null;

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

  @ApiProperty()
  hitDiceTotal!: number;

  @ApiProperty()
  hitDiceSpent!: number;

  @ApiProperty()
  hitDiceRemaining!: number;

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

  @ApiPropertyOptional({ type: StartingSpellsDto, nullable: true })
  spells!: StartingSpellsDto | null;

  @ApiPropertyOptional({ nullable: true })
  equippedWeaponId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  offhandWeaponId!: string | null;

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
