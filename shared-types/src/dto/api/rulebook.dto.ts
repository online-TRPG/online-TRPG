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
