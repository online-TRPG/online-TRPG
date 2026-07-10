import { Injectable } from "@nestjs/common";
import { MainCommandTargetType, SubmitMainCommandDto, decodeScenarioNodeMeta, isRecord } from "@trpg/shared-types";
import { parseJsonOrThrow } from "../../common/utils/json-runtime";

export type VisibleSceneEntity = {
  id: string;
  name: string;
  summary: string;
  disposition: string;
  kind: MainCommandTargetType;
};

@Injectable()
export class MainCommandSceneEntityService {
  extractVisibleSceneEntities(nodeMetaJson: string | null): VisibleSceneEntity[] {
    const nodeMeta = parseJsonOrThrow(nodeMetaJson, null, decodeScenarioNodeMeta, "scenarioNode.nodeMetaJson");
    if (!nodeMeta) {
      return [];
    }

    return [
      ...this.normalizeEntities(nodeMeta.npcs, MainCommandTargetType.NPC),
      ...this.normalizeEntities(nodeMeta.objects, MainCommandTargetType.OBJECT),
      ...this.normalizeEntities(nodeMeta.items, MainCommandTargetType.OBJECT),
      ...this.normalizeEntities(nodeMeta.areas, MainCommandTargetType.AREA),
    ];
  }

  resolveEntity(dto: SubmitMainCommandDto, entities: VisibleSceneEntity[], preferredType?: MainCommandTargetType): VisibleSceneEntity | null {
    const filtered =
      preferredType && preferredType !== MainCommandTargetType.POINT && preferredType !== MainCommandTargetType.SELF
        ? entities.filter((entity) => entity.kind === preferredType)
        : entities;

    if (!filtered.length) {
      return null;
    }

    if (dto.targetId) {
      const normalizedTargetId = dto.targetId.trim().toLowerCase();
      const matchedById = filtered.find((entity) => entity.id.trim().toLowerCase() === normalizedTargetId);
      if (matchedById) {
        return matchedById;
      }
    }

    const matchedByText = this.resolveEntityMentionedInText(dto.playerText, filtered);
    if (matchedByText) {
      return matchedByText;
    }

    return filtered.length === 1 ? filtered[0] : null;
  }

  resolveEntityMentionedInText(playerText: string, entities: VisibleSceneEntity[]): VisibleSceneEntity | null {
    const normalizedText = playerText.trim().toLowerCase();
    const matched = entities.filter((entity) => {
      const normalizedName = entity.name.trim().toLowerCase();
      if (!normalizedName) {
        return false;
      }

      if (normalizedText.includes(normalizedName)) {
        return true;
      }

      // "밀라 보스턴"처럼 표시명이 길어도 사용자는 보통 "밀라"처럼 부르므로,
      // 공백으로 나뉜 고유 이름 조각이 하나만 매칭될 때는 명시 대상으로 인정한다.
      return normalizedName
        .split(/\s+/)
        .filter((part) => part.length >= 2)
        .some((part) => normalizedText.includes(part));
    });
    return matched.length === 1 ? matched[0] : null;
  }

  private normalizeEntities(value: unknown, kind: MainCommandTargetType): VisibleSceneEntity[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .flatMap((item) => {
        if (!isRecord(item)) {
          return [];
        }
        const record = item;
        const id = this.readString(record.id);
        const name = this.readString(record.name) ?? this.readString(record.title);
        const isVisible = record.isVisible !== false;
        if (!id || !name || !isVisible) {
          return [];
        }
        return [{
          id,
          name,
          kind,
          summary: this.readString(record.shortDescription) ?? this.readString(record.description) ?? this.readString(record.summary) ?? name,
          disposition: this.readString(record.disposition) ?? "neutral",
        }];
      });
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
