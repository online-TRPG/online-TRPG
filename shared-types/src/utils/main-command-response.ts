import { MainCommandStatus } from "../constants/enums";
import { MAIN_COMMAND_CHECK_EFFECT_TYPES } from "../constants/main-command-check-effects";
import type {
  MainCommandCheckEffectDto,
  MainCommandCheckOptionDto,
  MainCommandResponseDto,
} from "../dto/api/gameplay.dto";

export function isMainCommandCheckRequired(response: MainCommandResponseDto | null | undefined): response is MainCommandResponseDto {
  return response?.status === MainCommandStatus.CHECK_REQUIRED;
}

export function isMainCommandImpossible(response: MainCommandResponseDto | null | undefined): response is MainCommandResponseDto {
  return response?.status === MainCommandStatus.IMPOSSIBLE;
}

export function getPrimaryMainCommandCheckOption(
  response: MainCommandResponseDto | null | undefined,
): MainCommandCheckOptionDto | null {
  return response?.checkOptions?.[0] ?? null;
}

export function getMainCommandCheckEffect(response: MainCommandResponseDto | null | undefined): MainCommandCheckEffectDto | null {
  const data = response?.data;
  if (!data || typeof data !== "object") return null;
  const effect = data.checkEffect;
  return isMainCommandCheckEffect(effect) ? effect : null;
}

export function isMainCommandCheckEffect(value: unknown): value is MainCommandCheckEffectDto {
  if (!value || typeof value !== "object") {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  return (
    type === MAIN_COMMAND_CHECK_EFFECT_TYPES.MAIN_COMMAND_CHECK ||
    type === MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_DOOR ||
    type === MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_HAZARD ||
    type === MAIN_COMMAND_CHECK_EFFECT_TYPES.VTT_OBJECT
  );
}
