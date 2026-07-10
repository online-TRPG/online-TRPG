import type {
  ClassDefinitionResponseDto,
  ItemResponseDto,
  RaceResponseDto,
  RuleCatalogReferenceDto,
} from '@trpg/shared-types';
import {
  decodeClassDefinitionResponseArray,
  decodeItemResponseArray,
  decodeRaceResponseArray,
  decodeRuleCatalogReferenceArray,
} from '@trpg/shared-types/frontend';
import { requestJson } from './httpClient';

export function listRaces(): Promise<RaceResponseDto[]> {
  return requestJson<RaceResponseDto[]>('/races', { decode: decodeRaceResponseArray });
}

export function listClassDefinitions(): Promise<ClassDefinitionResponseDto[]> {
  return requestJson<ClassDefinitionResponseDto[]>('/classes', {
    decode: decodeClassDefinitionResponseArray,
  });
}

export function listItems(): Promise<ItemResponseDto[]> {
  return requestJson<ItemResponseDto[]>('/items', { decode: decodeItemResponseArray });
}

export function listRuleCatalog(): Promise<RuleCatalogReferenceDto[]> {
  return requestJson<RuleCatalogReferenceDto[]>('/rule-catalog', {
    decode: decodeRuleCatalogReferenceArray,
  });
}
