import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  AbilityScoresDto,
  StartingSpellsDto,
} from "@trpg/shared-types";
import {
  getCantripsKnownLimit,
  getKnownSpellsLimit,
  getSrdClassSpellcastingProgression,
  normalizeSrdCharacterClassKey,
  resolveCharacterSpellSelectionRequirements,
  resolveKnownSpellDelta,
  resolveMaximumCastableSpellLevel,
  resolvePreparedSpellLimit as resolveSrdPreparedSpellLimit,
} from "@trpg/srd-data/rules";
import { CatalogService } from "../catalog/catalog.service";
import { RuleCatalogService } from "../rules/rule-catalog.service";

const defaultAbilityScores: AbilityScoresDto = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

@Injectable()
export class CharacterSpellSelectionService {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly ruleCatalogService: RuleCatalogService,
  ) {}

  async resolveStartingSpells(
    className: string,
    level: number,
    abilities: AbilityScoresDto,
    startingSpells: StartingSpellsDto | undefined,
  ): Promise<string | null> {
    const classKey = normalizeSrdCharacterClassKey(className);
    const klass = await this.catalogService.findClassByKey(classKey);
    if (!klass) return null;

    const executableSlotSpellPool = this.getExecutableSlotSpellPool(classKey, level);
    const requirements = resolveCharacterSpellSelectionRequirements({
      classKey,
      level,
      abilities,
      executableSpellPools: {
        cantrips: Array.from(this.getExecutableCantripIds()),
        slotSpells: Array.from(executableSlotSpellPool),
      },
    });
    const needCantrips = requirements.cantripCount;
    const needSpells = requirements.knownOrSpellbookSpellCount;
    const usesDynamicPreparedPool = requirements.usesDynamicPreparedPool;

    if (needCantrips === 0 && needSpells === 0 && !usesDynamicPreparedPool) {
      return null;
    }

    if (!startingSpells || !Array.isArray(startingSpells.cantrips) || !Array.isArray(startingSpells.spells)) {
      throw new BadRequestException(
        `시작 주문: ${klass.koName} 은(는) 캔트립 ${needCantrips}개 + 주문 ${needSpells}개를 지정해야 합니다.`,
      );
    }

    if (startingSpells.cantrips.length !== needCantrips) {
      throw new BadRequestException(
        `시작 주문: 캔트립 ${startingSpells.cantrips.length}개가 ${klass.koName} 요구치 ${needCantrips}개와 일치하지 않습니다.`,
      );
    }

    if (startingSpells.spells.length !== needSpells) {
      throw new BadRequestException(
        `시작 주문: 주문 ${startingSpells.spells.length}개가 ${klass.koName} 요구치 ${needSpells}개와 일치하지 않습니다.`,
      );
    }

    const cantrips = startingSpells.cantrips.map((s) => s.trim()).filter((s) => s.length > 0);
    const spells = usesDynamicPreparedPool
      ? Array.from(executableSlotSpellPool).sort()
      : startingSpells.spells.map((s) => s.trim()).filter((s) => s.length > 0);
    if (cantrips.length !== needCantrips) {
      throw new BadRequestException(
        `시작 주문: 비어 있지 않은 캔트립 ${cantrips.length}개가 ${klass.koName} 요구치 ${needCantrips}개와 일치하지 않습니다.`,
      );
    }
    if (!usesDynamicPreparedPool && spells.length !== needSpells) {
      throw new BadRequestException(
        `시작 주문: 비어 있지 않은 주문 ${spells.length}개가 ${klass.koName} 요구치 ${needSpells}개와 일치하지 않습니다.`,
      );
    }
    this.assertUniqueStartingSpellIds(cantrips, "캔트립");
    this.assertUniqueStartingSpellIds(spells, "주문");
    this.assertExecutableStartingSpellPool(
      cantrips,
      "캔트립",
      this.getExecutableCantripIds(),
    );
    this.assertExecutableStartingSpellPool(spells, "주문", executableSlotSpellPool);
    const knownSpellIds = new Set(spells.map((spell) => this.normalizeSpellId(spell)));
    const rawPreparedSpells = startingSpells.preparedSpells
      ? Array.from(
          new Set(
            startingSpells.preparedSpells
              .map((spell) => this.normalizeSpellId(spell))
              .filter(Boolean),
          ),
        )
      : undefined;
    const preparedSpellLimit = requirements.preparedSpellCount;
    const preparedSpells =
      rawPreparedSpells && (rawPreparedSpells.length > 0 || preparedSpellLimit !== null)
        ? rawPreparedSpells
        : undefined;
    if (preparedSpellLimit !== null && !preparedSpells) {
      throw new BadRequestException({
        code: "PREPARED_SPELLS_REQUIRED",
        message: "이 직업은 생성 시 준비 주문을 선택해야 합니다.",
        preparedLimit: preparedSpellLimit,
      });
    }
    const unknownPreparedSpell = preparedSpells?.find((spell) => !knownSpellIds.has(spell));
    if (unknownPreparedSpell) {
      throw new BadRequestException({
        code: "PREPARED_SPELL_NOT_KNOWN",
        message: "알고 있거나 주문책에 있는 슬롯 주문만 준비할 수 있습니다.",
        spellId: unknownPreparedSpell,
      });
    }
    if (preparedSpells) {
      this.assertPreparedSpellLimit({ className, level, abilities }, preparedSpells);
      if (preparedSpellLimit !== null && preparedSpells.length !== preparedSpellLimit) {
        throw new BadRequestException({
          code: "PREPARED_SPELL_COUNT_MISMATCH",
          message: "준비 주문 수가 직업/레벨/능력치 기준과 일치하지 않습니다.",
          preparedCount: preparedSpells.length,
          preparedLimit: preparedSpellLimit,
        });
      }
    }

    return JSON.stringify({
      cantrips,
      spells,
      ...(preparedSpells ? { preparedSpells } : {}),
    });
  }

  resolvePreparedSpellsJson(
    spellsJson: string | null,
    requestedPreparedSpells: string[],
    character: { className: string; level: number; abilities: AbilityScoresDto },
  ): string {
    const spells = this.parseSpellsJson(spellsJson);
    if (!spells) {
      throw new BadRequestException({
        code: "PREPARED_SPELLS_NOT_AVAILABLE",
        message: "주문을 가진 캐릭터만 준비 주문을 갱신할 수 있습니다.",
      });
    }

    const knownSpellIds = new Set(spells.spells.map((spell) => this.normalizeSpellId(spell)));
    const preparedSpells = Array.from(
      new Set(requestedPreparedSpells.map((spell) => this.normalizeSpellId(spell)).filter(Boolean)),
    );
    const unknownPreparedSpell = preparedSpells.find((spell) => !knownSpellIds.has(spell));
    if (unknownPreparedSpell) {
      throw new BadRequestException({
        code: "PREPARED_SPELL_NOT_KNOWN",
        message: "알고 있거나 주문책에 있는 슬롯 주문만 준비할 수 있습니다.",
        spellId: unknownPreparedSpell,
      });
    }
    this.assertPreparedSpellLimit(character, preparedSpells);

    return JSON.stringify({
      ...spells,
      preparedSpells,
    });
  }

  resolveLevelUpSpellsJson(
    spellsJson: string | null,
    params: {
      knownSpells?: string[];
      preparedSpells?: string[];
      cantrips?: string[];
      forgottenSpells?: string[];
      forgottenCantrips?: string[];
      currentLevel: number;
      level: number;
      className: string;
      abilities: AbilityScoresDto;
    },
  ): string {
    const parsedSpells = this.parseSpellsJson(spellsJson);
    const spells = parsedSpells ?? this.createEmptyLevelUpSpellState(params.className, params.level);
    if (!spells) {
      throw new BadRequestException({
        code: "LEVEL_UP_SPELLS_NOT_AVAILABLE",
        message: "주문을 가진 캐릭터만 레벨업 주문을 갱신할 수 있습니다.",
      });
    }

    const knownSpellPool = this.getExecutableSlotSpellPool(params.className, params.level);
    const cantripPool = this.getExecutableCantripIds();
    const currentCantrips = spells.cantrips
      .map((spell) => this.normalizeSpellId(spell))
      .filter(Boolean);
    const currentKnownSpells = spells.spells
      .map((spell) => this.normalizeSpellId(spell))
      .filter(Boolean);
    const requestedCantrips = this.normalizeUniqueSpellSelection(params.cantrips);
    const requestedKnownSpells = (params.knownSpells ?? [])
      .map((spell) => this.normalizeSpellId(spell))
      .filter(Boolean);
    const forgottenCantrips = this.normalizeUniqueSpellSelection(params.forgottenCantrips);
    const forgottenKnownSpells = this.normalizeUniqueSpellSelection(params.forgottenSpells);
    this.assertForgottenSpellsExist(currentCantrips, forgottenCantrips, "LEVEL_UP_CANTRIP_NOT_KNOWN");
    this.assertForgottenSpellsExist(currentKnownSpells, forgottenKnownSpells, "LEVEL_UP_SPELL_NOT_KNOWN");
    this.assertNewSpellSelections(
      currentCantrips,
      requestedCantrips,
      forgottenCantrips,
      "LEVEL_UP_CANTRIP_ALREADY_KNOWN",
    );
    this.assertNewSpellSelections(
      currentKnownSpells,
      requestedKnownSpells,
      forgottenKnownSpells,
      "LEVEL_UP_SPELL_ALREADY_KNOWN",
    );
    const nextCantrips = Array.from(new Set([
      ...currentCantrips.filter((spell) => !forgottenCantrips.includes(spell)),
      ...requestedCantrips,
    ]));
    const nextKnownSpells = Array.from(new Set([
      ...currentKnownSpells.filter((spell) => !forgottenKnownSpells.includes(spell)),
      ...requestedKnownSpells,
    ]));
    const unsupportedCantrip = requestedCantrips.find((spell) => !cantripPool.has(spell));
    if (unsupportedCantrip) {
      throw new BadRequestException({
        code: "LEVEL_UP_CANTRIP_NOT_AVAILABLE",
        message: "현재 실행 주문 카탈로그에 있는 캔트립만 습득할 수 있습니다.",
        spellId: unsupportedCantrip,
      });
    }
    const unsupportedKnownSpell = requestedKnownSpells.find((spell) => !knownSpellPool.has(spell));
    if (unsupportedKnownSpell) {
      throw new BadRequestException({
        code: "LEVEL_UP_SPELL_NOT_AVAILABLE",
        message: "현재 실행 주문 카탈로그에 있는 슬롯 주문만 레벨업으로 습득할 수 있습니다.",
        spellId: unsupportedKnownSpell,
      });
    }
    this.assertLevelUpCantripProgression({
      className: params.className,
      currentLevel: params.currentLevel,
      targetLevel: params.level,
      currentCantrips,
      requestedCantrips,
      forgottenCantrips,
      nextCantrips,
    });
    this.assertLevelUpKnownSpellProgression({
      className: params.className,
      currentLevel: params.currentLevel,
      targetLevel: params.level,
      currentKnownSpells,
      requestedKnownSpells,
      forgottenKnownSpells,
      nextKnownSpells,
      availableSpellCount: knownSpellPool.size,
    });

    if (!this.isPreparedSpellcaster(params.className, params.level)) {
      const requestedPreparedSpells = this.normalizeUniqueSpellSelection(params.preparedSpells);
      if (requestedPreparedSpells.length > 0) {
        throw new BadRequestException({
          code: "PREPARED_SPELLS_NOT_SUPPORTED",
          message: "이 직업은 준비 주문 모델을 사용하지 않습니다.",
          className: params.className,
        });
      }
      const knownCasterSpells = { ...spells };
      delete knownCasterSpells.preparedSpells;
      return JSON.stringify({
        ...knownCasterSpells,
        cantrips: nextCantrips,
        spells: nextKnownSpells,
      });
    }

    const preparedSpells =
      params.preparedSpells === undefined
        ? (spells.preparedSpells ?? [])
        : Array.from(
            new Set(
              params.preparedSpells.map((spell) => this.normalizeSpellId(spell)).filter(Boolean),
            ),
          );
    const nextKnownSet = new Set(nextKnownSpells);
    const unknownPreparedSpell = preparedSpells.find((spell) => !nextKnownSet.has(spell));
    if (unknownPreparedSpell) {
      throw new BadRequestException({
        code: "PREPARED_SPELL_NOT_KNOWN",
        message: "알고 있거나 주문책에 있는 슬롯 주문만 준비할 수 있습니다.",
        spellId: unknownPreparedSpell,
      });
    }
    this.assertPreparedSpellLimit({
      className: params.className,
      level: params.level,
      abilities: params.abilities,
    }, preparedSpells);

    return JSON.stringify({
      ...spells,
      cantrips: nextCantrips,
      spells: nextKnownSpells,
      preparedSpells,
    });
  }

  private createEmptyLevelUpSpellState(
    className: string,
    level: number,
  ): StartingSpellsDto | null {
    const classKey = normalizeSrdCharacterClassKey(className);
    const progression = getSrdClassSpellcastingProgression(classKey, level);
    if (!progression) {
      return null;
    }

    return {
      cantrips: [],
      spells: [],
      ...(this.isPreparedSpellcaster(classKey, level) ? { preparedSpells: [] } : {}),
    };
  }

  private normalizeUniqueSpellSelection(spells: string[] | undefined): string[] {
    return Array.from(
      new Set((spells ?? []).map((spell) => this.normalizeSpellId(spell)).filter(Boolean)),
    );
  }

  private assertForgottenSpellsExist(
    currentSpells: string[],
    forgottenSpells: string[],
    code: string,
  ): void {
    const current = new Set(currentSpells);
    const unknown = forgottenSpells.find((spell) => !current.has(spell));
    if (unknown) {
      throw new BadRequestException({
        code,
        message: "현재 알고 있는 주문만 교체 대상으로 지정할 수 있습니다.",
        spellId: unknown,
      });
    }
  }

  private assertNewSpellSelections(
    currentSpells: string[],
    requestedSpells: string[],
    forgottenSpells: string[],
    code: string,
  ): void {
    const current = new Set(currentSpells);
    const forgotten = new Set(forgottenSpells);
    const duplicate = requestedSpells.find((spell) => current.has(spell) || forgotten.has(spell));
    if (duplicate) {
      throw new BadRequestException({
        code,
        message: "새로 습득할 주문은 현재 주문 또는 교체 대상과 중복될 수 없습니다.",
        spellId: duplicate,
      });
    }
  }

  private assertLevelUpCantripProgression(params: {
    className: string;
    currentLevel: number;
    targetLevel: number;
    currentCantrips: string[];
    requestedCantrips: string[];
    forgottenCantrips: string[];
    nextCantrips: string[];
  }): void {
    const classKey = normalizeSrdCharacterClassKey(params.className);
    const spellDelta = resolveKnownSpellDelta({
      classKey,
      currentLevel: params.currentLevel,
      targetLevel: params.targetLevel,
    });
    const targetLimit = getCantripsKnownLimit(classKey, params.targetLevel);
    if (!spellDelta.targetHasCantripProgression || targetLimit === null) {
      if (params.requestedCantrips.length || params.forgottenCantrips.length) {
        throw new BadRequestException({
          code: "LEVEL_UP_CANTRIPS_NOT_SUPPORTED",
          message: "이 직업은 현재 레벨에서 캔트립 성장 모델을 사용하지 않습니다.",
        });
      }
      return;
    }

    const levelDelta = params.targetLevel - params.currentLevel;
    const learnedAllowance = spellDelta.cantripDelta;
    if (params.forgottenCantrips.length > levelDelta) {
      throw new BadRequestException({
        code: "LEVEL_UP_CANTRIP_REPLACEMENT_LIMIT_EXCEEDED",
        message: "한 레벨당 캔트립 하나까지만 교체할 수 있습니다.",
        replacementLimit: levelDelta,
      });
    }
    if (params.requestedCantrips.length < params.forgottenCantrips.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_CANTRIP_REPLACEMENT_INCOMPLETE",
        message: "교체 대상으로 뺀 캔트립 수만큼 새 캔트립을 선택해야 합니다.",
      });
    }
    if (params.requestedCantrips.length > learnedAllowance + params.forgottenCantrips.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_CANTRIP_LEARN_LIMIT_EXCEEDED",
        message: "이번 레벨업에서 습득하거나 교체할 수 있는 캔트립 수를 초과했습니다.",
        learnLimit: learnedAllowance + params.forgottenCantrips.length,
      });
    }
    if (
      params.nextCantrips.length >
      Math.min(targetLimit, this.getExecutableCantripIds().size)
    ) {
      throw new BadRequestException({
        code: "LEVEL_UP_CANTRIP_LIMIT_EXCEEDED",
        message: "목표 레벨의 캔트립 습득 상한을 초과했습니다.",
      });
    }
  }

  private assertLevelUpKnownSpellProgression(params: {
    className: string;
    currentLevel: number;
    targetLevel: number;
    currentKnownSpells: string[];
    requestedKnownSpells: string[];
    forgottenKnownSpells: string[];
    nextKnownSpells: string[];
    availableSpellCount: number;
  }): void {
    const classKey = normalizeSrdCharacterClassKey(params.className);
    const levelDelta = params.targetLevel - params.currentLevel;
    const spellDelta = resolveKnownSpellDelta({
      classKey,
      currentLevel: params.currentLevel,
      targetLevel: params.targetLevel,
    });
    if (!spellDelta.canReplaceKnownSpells) {
      if (params.forgottenKnownSpells.length) {
        throw new BadRequestException({
          code: classKey === "wizard"
            ? "LEVEL_UP_WIZARD_SPELL_REPLACEMENT_NOT_SUPPORTED"
            : "LEVEL_UP_SPELL_REPLACEMENT_NOT_SUPPORTED",
          message: classKey === "wizard"
            ? "위저드 주문책 주문은 레벨업으로 제거하지 않습니다."
            : "이 직업은 known spell 교체 모델을 사용하지 않습니다.",
        });
      }
    }

    if (classKey === "wizard") {
      if (params.requestedKnownSpells.length > spellDelta.knownSpellDelta) {
        throw new BadRequestException({
          code: "LEVEL_UP_SPELL_LEARN_LIMIT_EXCEEDED",
          message: "위저드는 레벨당 주문책 주문 두 개를 추가할 수 있습니다.",
          learnLimit: spellDelta.knownSpellDelta,
        });
      }
      return;
    }

    const targetLimit = getKnownSpellsLimit(classKey, params.targetLevel);
    if (!spellDelta.targetHasKnownSpellProgression || targetLimit === null) {
      return;
    }

    const learnedAllowance = spellDelta.knownSpellDelta;
    if (params.forgottenKnownSpells.length > levelDelta) {
      throw new BadRequestException({
        code: "LEVEL_UP_SPELL_REPLACEMENT_LIMIT_EXCEEDED",
        message: "한 레벨당 알고 있는 슬롯 주문 하나까지만 교체할 수 있습니다.",
        replacementLimit: levelDelta,
      });
    }
    if (params.requestedKnownSpells.length < params.forgottenKnownSpells.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_SPELL_REPLACEMENT_INCOMPLETE",
        message: "교체 대상으로 뺀 슬롯 주문 수만큼 새 주문을 선택해야 합니다.",
      });
    }
    if (params.requestedKnownSpells.length > learnedAllowance + params.forgottenKnownSpells.length) {
      throw new BadRequestException({
        code: "LEVEL_UP_SPELL_LEARN_LIMIT_EXCEEDED",
        message: "이번 레벨업에서 습득하거나 교체할 수 있는 슬롯 주문 수를 초과했습니다.",
        learnLimit: learnedAllowance + params.forgottenKnownSpells.length,
      });
    }
    if (params.nextKnownSpells.length > Math.min(targetLimit, params.availableSpellCount)) {
      throw new BadRequestException({
        code: "LEVEL_UP_KNOWN_SPELL_LIMIT_EXCEEDED",
        message: "목표 레벨의 알고 있는 주문 수 상한을 초과했습니다.",
      });
    }
  }

  private assertPreparedSpellLimit(
    character: { className: string; level: number; abilities: AbilityScoresDto },
    preparedSpells: string[],
  ): void {
    const limit = this.resolvePreparedSpellLimit(character);
    if (limit === null) {
      throw new BadRequestException({
        code: "PREPARED_SPELLS_NOT_SUPPORTED",
        message: "이 직업은 준비 주문 모델을 사용하지 않습니다.",
        className: character.className,
      });
    }
    if (preparedSpells.length <= limit) {
      return;
    }

    throw new BadRequestException({
      code: "PREPARED_SPELL_LIMIT_EXCEEDED",
      message: "준비 가능한 주문 수를 초과했습니다.",
      preparedCount: preparedSpells.length,
      preparedLimit: limit,
    });
  }

  private resolvePreparedSpellLimit(
    character: { className: string; level: number; abilities: AbilityScoresDto },
  ): number | null {
    return resolveSrdPreparedSpellLimit({
      classKey: character.className,
      level: character.level,
      abilities: character.abilities,
    });
  }

  private isPreparedSpellcaster(className: string, level = 1): boolean {
    return this.resolvePreparedSpellLimit({
      className,
      level,
      abilities: defaultAbilityScores,
    }) !== null;
  }

  private parseSpellsJson(value: string | null | undefined): StartingSpellsDto | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Partial<StartingSpellsDto> | null;
      if (!parsed || !Array.isArray(parsed.cantrips) || !Array.isArray(parsed.spells)) {
        return null;
      }
      return {
        cantrips: parsed.cantrips.filter((spell): spell is string => typeof spell === "string"),
        spells: parsed.spells.filter((spell): spell is string => typeof spell === "string"),
        preparedSpells: Array.isArray(parsed.preparedSpells)
          ? parsed.preparedSpells.filter((spell): spell is string => typeof spell === "string")
          : undefined,
      };
    } catch {
      return null;
    }
  }

  private normalizeSpellId(spellId: string): string {
    const normalized = spellId.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return normalized.startsWith("spell.") ? normalized : `spell.${normalized}`;
  }

  private assertUniqueStartingSpellIds(spellIds: string[], label: string): void {
    const normalized = spellIds.map((spellId) => this.normalizeSpellId(spellId));
    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException(`시작 주문: ${label} 선택에 중복이 있습니다.`);
    }
  }

  private assertExecutableStartingSpellPool(spellIds: string[], label: string, allowedSpellIds: Set<string>): void {
    const unsupportedSpellId = spellIds
      .map((spellId) => this.normalizeSpellId(spellId))
      .find((spellId) => !allowedSpellIds.has(spellId));
    if (unsupportedSpellId) {
      throw new BadRequestException(`시작 주문: ${label} ${unsupportedSpellId}은(는) 현재 실행 주문 카탈로그에 없습니다.`);
    }
  }

  private getExecutableSlotSpellPool(className: string, level: number): Set<string> {
    const maxSpellLevel = this.getMaximumSlotSpellLevelForClassLevel(className, level);
    return new Set(
      this.ruleCatalogService
        .listEntries("spell_definitions")
        .filter((entry) => {
          const spellLevel = this.getCatalogSpellLevel(entry);
          return spellLevel > 0 && spellLevel <= maxSpellLevel;
        })
        .map((entry) => entry.id),
    );
  }

  private getExecutableCantripIds(): Set<string> {
    return new Set(
      this.ruleCatalogService
        .listEntries("spell_definitions")
        .filter((entry) => this.getCatalogSpellLevel(entry) === 0)
        .map((entry) => entry.id),
    );
  }

  private getCatalogSpellLevel(
    entry: ReturnType<RuleCatalogService["listEntries"]>[number],
  ): number {
    const tag = entry.runtimeEffect.tags.find((value) =>
      value.startsWith("spell_level:"),
    );
    const level = Number(tag?.slice("spell_level:".length));
    return Number.isInteger(level) && level >= 0 ? level : -1;
  }

  private getMaximumSlotSpellLevelForClassLevel(className: string, level: number): number {
    return resolveMaximumCastableSpellLevel(className, level);
  }
}
