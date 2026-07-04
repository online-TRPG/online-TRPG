import type {
  ClassDefinitionResponseDto,
  ItemResponseDto,
  RaceResponseDto,
  RuleCatalogReferenceDto,
} from '@trpg/shared-types';
import { requestJson } from './httpClient';

export function listRaces(): Promise<RaceResponseDto[]> {
  return requestJson<RaceResponseDto[]>('/races');
}

export function listClassDefinitions(): Promise<ClassDefinitionResponseDto[]> {
  return requestJson<ClassDefinitionResponseDto[]>('/classes');
}

export function listItems(): Promise<ItemResponseDto[]> {
  return requestJson<ItemResponseDto[]>('/items');
}

export function listRuleCatalog(): Promise<RuleCatalogReferenceDto[]> {
  return requestJson<RuleCatalogReferenceDto[]>('/rule-catalog');
}
