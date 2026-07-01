import { ApiProperty } from "@nestjs/swagger";

// API response shape only. SRD spell progression data and calculations live in @trpg/srd-data/rules.
export type SpellcastingProgressionEntry = {
  classLevel: number;
  cantripsKnown: number | null;
  spellsKnown: number | null;
};

export class ItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "quarterstaff" })
  key!: string;

  @ApiProperty({ example: "쿼터스태프" })
  koName!: string;

  @ApiProperty({ example: "weapon-melee-simple" })
  category!: string;
}

export class StartingEquipmentItemDto {
  @ApiProperty({ example: "quarterstaff" })
  itemKey!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;
}

export class StartingEquipmentOptionDto {
  @ApiProperty({ type: [StartingEquipmentItemDto] })
  items!: StartingEquipmentItemDto[];
}

export class StartingEquipmentSlotDto {
  @ApiProperty({ type: [StartingEquipmentOptionDto] })
  options!: StartingEquipmentOptionDto[];
}

export class StartingEquipmentDto {
  @ApiProperty({ type: [StartingEquipmentSlotDto] })
  slots!: StartingEquipmentSlotDto[];
}

export class ClassDefinitionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "wizard" })
  key!: string;

  @ApiProperty({ example: "위저드" })
  koName!: string;

  @ApiProperty({ example: "d6" })
  hitDie!: string;

  @ApiProperty({ type: StartingEquipmentDto })
  startingEquipment!: StartingEquipmentDto;

  @ApiProperty({ example: 3, description: "1레벨 시점 시작 캔트립 수" })
  startingCantripCount!: number;

  @ApiProperty({ example: 6, description: "1레벨 시점 시작 주문 수 (준비 주문 동적 클래스는 0)" })
  startingSpellCount!: number;

  @ApiProperty({
    type: [String],
    example: ["비전학", "역사", "통찰", "조사", "의학", "종교"],
    description: "1레벨 클래스 숙련 스킬 선택지 (한국어 명칭). 시드에 없는 클래스는 빈 배열.",
  })
  skillChoices!: string[];

  @ApiProperty({
    example: 2,
    description: "선택해야 할 숙련 스킬 개수. 0이면 검증 없음 (시드에 없는 legacy 클래스).",
  })
  skillChoiceCount!: number;

  @ApiProperty({ type: [Object] })
  spellcastingProgression?: SpellcastingProgressionEntry[];
}
