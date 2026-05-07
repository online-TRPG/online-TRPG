import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import {
  RulebookDocumentResponseDto,
  RulebookIndexResponseDto,
} from "@trpg/shared-types";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

type GeneratedRulebookDocument = {
  slug: string;
  title: string;
  description: string | null;
  category: string;
  updatedAt: string;
  content: string;
};

type GeneratedRulebookCollection = {
  ruleSetId: string;
  title: string;
  description: string | null;
  attribution: string | null;
  defaultDocumentSlug: string;
  documents: GeneratedRulebookDocument[];
};

type GeneratedRulebookExport = {
  version: number;
  rulebooks: GeneratedRulebookCollection[];
};

@Injectable()
export class RulebookService {
  private cachedExport: GeneratedRulebookExport | null = null;

  getRulebookIndex(ruleSetId: string): RulebookIndexResponseDto {
    const rulebook = this.getRulebookCollection(ruleSetId);

    return {
      ruleSetId: rulebook.ruleSetId,
      title: rulebook.title,
      description: rulebook.description,
      attribution: rulebook.attribution,
      defaultDocumentSlug: rulebook.defaultDocumentSlug,
      documents: rulebook.documents.map(({ content, ...document }) => document),
    };
  }

  getRulebookDocument(ruleSetId: string, documentSlug: string): RulebookDocumentResponseDto {
    const rulebook = this.getRulebookCollection(ruleSetId);
    const document = rulebook.documents.find((entry) => entry.slug === documentSlug);

    if (!document) {
      throw new NotFoundException(
        `Rulebook document "${documentSlug}" was not found for "${ruleSetId}".`,
      );
    }

    return {
      ruleSetId,
      slug: document.slug,
      title: document.title,
      description: document.description,
      category: document.category,
      updatedAt: document.updatedAt,
      content: document.content,
    };
  }

  private getRulebookCollection(ruleSetId: string): GeneratedRulebookCollection {
    const payload = this.loadRulebookExport();
    const rulebook = payload.rulebooks.find((entry) => entry.ruleSetId === ruleSetId);

    if (!rulebook) {
      throw new BadRequestException(
        `Only generated rulebooks are supported. Received "${ruleSetId}".`,
      );
    }

    return rulebook;
  }

  private loadRulebookExport(): GeneratedRulebookExport {
    if (this.cachedExport) {
      return this.cachedExport;
    }

    const exportPath = this.resolveRulebookExportPath();

    try {
      const parsed = JSON.parse(readFileSync(exportPath, "utf8")) as GeneratedRulebookExport;

      if (!Array.isArray(parsed.rulebooks)) {
        throw new Error("rulebooks must be an array");
      }

      this.cachedExport = parsed;
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown rulebook export error";
      throw new InternalServerErrorException(`Failed to read generated rulebook export: ${message}`);
    }
  }

  private resolveRulebookExportPath(): string {
    const candidates = [
      resolve(process.cwd(), "ai", "generated", "srd", "rulebook.json"),
      resolve(process.cwd(), "..", "ai", "generated", "srd", "rulebook.json"),
      resolve(__dirname, "..", "..", "..", "..", "ai", "generated", "srd", "rulebook.json"),
      resolve(__dirname, "..", "..", "..", "..", "..", "ai", "generated", "srd", "rulebook.json"),
    ];

    const matched = candidates.find((candidate) => existsSync(candidate));
    if (!matched) {
      throw new NotFoundException("Generated rulebook export could not be found.");
    }

    return matched;
  }
}
