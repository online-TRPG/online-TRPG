const ruleSetLabels: Record<string, string> = {
  dnd5e: 'D&D 5e',
};

export function getRuleSetLabel(value: string | null | undefined): string {
  return value ? (ruleSetLabels[value] ?? '기타 TRPG 규칙') : 'TRPG';
}
