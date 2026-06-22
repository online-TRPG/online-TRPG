import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RulebookDocumentSummaryDto {
  @ApiProperty()
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty()
  category!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class RulebookIndexResponseDto {
  @ApiProperty()
  ruleSetId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  attribution!: string | null;

  @ApiProperty()
  defaultDocumentSlug!: string;

  @ApiProperty({ type: [RulebookDocumentSummaryDto] })
  documents!: RulebookDocumentSummaryDto[];
}

export class RulebookDocumentResponseDto extends RulebookDocumentSummaryDto {
  @ApiProperty()
  ruleSetId!: string;

  @ApiProperty()
  content!: string;
}

export class RuleCatalogReferenceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    enum: [
      "race_traits",
      "class_features",
      "subclass_features",
      "spell_definitions",
      "condition_definitions",
      "monster_abilities",
      "terrain_effects",
    ],
  })
  kind!:
    | "race_traits"
    | "class_features"
    | "subclass_features"
    | "spell_definitions"
    | "condition_definitions"
    | "monster_abilities"
    | "terrain_effects";

  @ApiProperty()
  executable!: boolean;
}
