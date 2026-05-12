import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RaceAbilityIncreaseDto {
  @ApiProperty({ example: 0 })
  str!: number;

  @ApiProperty({ example: 2 })
  dex!: number;

  @ApiProperty({ example: 0 })
  con!: number;

  @ApiProperty({ example: 0 })
  int!: number;

  @ApiProperty({ example: 0 })
  wis!: number;

  @ApiProperty({ example: 0 })
  cha!: number;
}

export class RaceResponseDto {
  @ApiProperty({ example: "race_xxx" })
  id!: string;

  @ApiProperty({ example: "elf", description: "snake-case 영문 식별자" })
  key!: string;

  @ApiProperty({ example: "엘프" })
  koName!: string;

  @ApiProperty({ example: "Medium", description: "Medium 또는 Small" })
  size!: string;

  @ApiProperty({ example: 30, description: "기본 이동속도(ft)" })
  baseSpeed!: number;

  @ApiProperty({ type: RaceAbilityIncreaseDto, description: "종족(+하위종족) 누적 능력치 보정" })
  abilityIncreases!: RaceAbilityIncreaseDto;

  @ApiProperty({ type: [String], example: ["Common", "Elvish"] })
  languages!: string[];

  @ApiPropertyOptional({ nullable: true, description: "상위 종족 id (하위 종족이면)" })
  parentRaceId!: string | null;
}

// Point Buy 룰 상수
export const POINT_BUY_TOTAL = 27;
export const POINT_BUY_MIN_BASE = 8;
export const POINT_BUY_MAX_BASE = 15;
// 능력치 base 값 → 비용 (D&D 5e 표준)
export const POINT_BUY_COST: Readonly<Record<number, number>> = Object.freeze({
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
});
