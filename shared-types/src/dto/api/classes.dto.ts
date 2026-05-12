import { ApiProperty } from "@nestjs/swagger";

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
}
