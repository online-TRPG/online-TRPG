export type SpellDisplayCatalogEntry = {
  id: string;
  nameKo?: string | null;
  nameEn?: string | null;
};

export function hasKoreanSpellText(value: string) {
  return /[가-힣]/.test(value);
}

function looksLikeSpellInternalId(value: string) {
  return /^[a-z]+[._:-][a-z0-9_.:-]+$/i.test(value.trim());
}

export function cleanUserFacingSpellLabel(label: string | null | undefined) {
  const candidates = (label ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !looksLikeSpellInternalId(part));

  return candidates.find(hasKoreanSpellText) ?? candidates[0] ?? null;
}

export function formatSpellIdLabel(spellId: string) {
  const raw = spellId.includes('.') ? spellId.slice(spellId.lastIndexOf('.') + 1) : spellId;
  return raw
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getSpellDisplayLabel({
  spellId,
  label,
  catalogEntry,
}: {
  spellId: string;
  label?: string | null;
  catalogEntry?: SpellDisplayCatalogEntry | null;
}) {
  const catalogKoName = catalogEntry?.nameKo?.trim();
  if (catalogKoName) return catalogKoName;

  const cleanedLabel = cleanUserFacingSpellLabel(label);
  if (cleanedLabel) return cleanedLabel;

  const catalogEnName = catalogEntry?.nameEn?.trim();
  if (catalogEnName) return catalogEnName;

  return formatSpellIdLabel(spellId);
}
