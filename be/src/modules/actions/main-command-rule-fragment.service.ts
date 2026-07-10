import { Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonOrFallback } from "../../common/utils/json-runtime";

export type RuleFragmentSummary = {
  id: string;
  titleKo: string;
  summaryKo: string;
};

@Injectable()
export class MainCommandRuleFragmentService {
  private ruleFragmentsCache: RuleFragmentSummary[] | null = null;

  loadRuleFragments(): RuleFragmentSummary[] {
    if (this.ruleFragmentsCache) {
      return this.ruleFragmentsCache;
    }

    const candidatePaths = [
      join(process.cwd(), "srd-data", "generated", "srd", "rule_fragments.jsonl"),
      join(process.cwd(), "..", "srd-data", "generated", "srd", "rule_fragments.jsonl"),
      join(process.cwd(), "ai", "generated", "srd", "rule_fragments.jsonl"),
      join(process.cwd(), "..", "ai", "generated", "srd", "rule_fragments.jsonl"),
    ];
    const ruleFragmentsPath = candidatePaths.find((candidate) => existsSync(candidate));
    if (!ruleFragmentsPath) {
      this.ruleFragmentsCache = [];
      return this.ruleFragmentsCache;
    }

    const content = readFileSync(ruleFragmentsPath, "utf8");
    this.ruleFragmentsCache = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .flatMap((line) => {
        if (!line) {
          return [];
        }
        const item = parseJsonOrFallback(line, null, (value) => this.decodeRuleFragmentSummary(value));
        return item ? [item] : [];
      });

    return this.ruleFragmentsCache;
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private decodeRuleFragmentSummary(value: unknown): RuleFragmentSummary {
    if (!this.isRecord(value)) {
      throw new Error("rule fragment must be an object.");
    }
    const id = this.readString(value.id);
    const titleKo = this.readString(value.titleKo);
    const summaryKo = this.readString(value.summaryKo);
    if (!id || !titleKo || !summaryKo) {
      throw new Error("rule fragment is missing required fields.");
    }
    return { id, titleKo, summaryKo };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
}
