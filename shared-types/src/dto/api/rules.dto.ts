import { ApiProperty } from "@nestjs/swagger";

export class MvpContentOptionDto {
  @ApiProperty({ example: "Fighter" })
  value!: string;

  @ApiProperty({ example: "Fighter" })
  label!: string;
}

export class MvpSpellResponseDto {
  @ApiProperty({ example: "spell.magic_missile" })
  id!: string;

  @ApiProperty({ example: "Magic Missile" })
  name!: string;

  @ApiProperty({ example: 1 })
  level!: number;

  @ApiProperty({ type: [String], example: ["Wizard"] })
  classes!: string[];

  @ApiProperty({ enum: ["SUPPORTED", "GM_ASSIST", "DEFERRED"], example: "SUPPORTED" })
  automationStatus!: "SUPPORTED" | "GM_ASSIST" | "DEFERRED";

  @ApiProperty({ enum: ["attack", "defense", "healing", "utility", "control"], example: "attack" })
  primaryUse!: "attack" | "defense" | "healing" | "utility" | "control";
}

export class MvpMagicItemResponseDto {
  @ApiProperty({ example: "magic_item.potion_of_healing" })
  id!: string;

  @ApiProperty({ example: "Potion of Healing" })
  name!: string;

  @ApiProperty({ enum: ["SUPPORTED", "GM_ASSIST", "DEFERRED"], example: "SUPPORTED" })
  automationStatus!: "SUPPORTED" | "GM_ASSIST" | "DEFERRED";

  @ApiProperty({ enum: ["healing", "attack", "defense", "utility", "storage"], example: "healing" })
  primaryUse!: "healing" | "attack" | "defense" | "utility" | "storage";
}

export class MvpContentResponseDto {
  @ApiProperty({ example: 2 })
  characterLevel!: number;

  @ApiProperty({ type: [MvpContentOptionDto] })
  races!: MvpContentOptionDto[];

  @ApiProperty({ type: [MvpContentOptionDto] })
  classes!: MvpContentOptionDto[];

  @ApiProperty({ type: [MvpSpellResponseDto] })
  spells!: MvpSpellResponseDto[];

  @ApiProperty({ type: [MvpMagicItemResponseDto] })
  magicItems!: MvpMagicItemResponseDto[];
}
