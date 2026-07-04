import { Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
      .filter((line) => Boolean(line))
      .map((line) => {
        const parsed = this.parseJson<Record<string, unknown> | null>(line, null);
        const id = parsed ? this.readString(parsed.id) : null;
        const titleKo = parsed ? this.readString(parsed.titleKo) : null;
        const summaryKo = parsed ? this.readString(parsed.summaryKo) : null;
        if (!id || !titleKo || !summaryKo) {
          return null;
        }
        return {
          id,
          titleKo,
          summaryKo,
        };
      })
      .filter((item): item is RuleFragmentSummary => Boolean(item));

    return this.ruleFragmentsCache;
  }

  private parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
