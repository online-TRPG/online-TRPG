import type { CombatSpellActionCostKind, SpellFilter } from './combatSpellModel';

export type { SpellFilter };

export type CombatSpellTargetingMetadata = {
  rangeFt: number;
  targeting: 'self' | 'token' | 'point';
  targetDisposition?: 'ally' | 'enemy' | 'any';
};

export const spellFilterOptions: Array<{ id: SpellFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'cantrip', label: '소마법' },
  { id: 'level1', label: '1레벨 마법' },
  { id: 'level2', label: '2레벨 마법' },
  { id: 'level3', label: '3레벨 마법' },
  { id: 'level4', label: '4레벨 마법' },
  { id: 'level5', label: '5레벨 마법' },
  { id: 'level6', label: '6레벨 마법' },
  { id: 'level7', label: '7레벨 마법' },
  { id: 'level8', label: '8레벨 마법' },
  { id: 'level9', label: '9레벨 마법' },
];

export function getSpellTargetingHint(
  spellId: string,
  spellMetadataById?: ReadonlyMap<string, CombatSpellTargetingMetadata>
) {
  if (
    spellId === 'spell.acid_splash' ||
    spellId === 'spell.shocking_grasp' ||
    spellId === 'spell.chill_touch' ||
    spellId === 'spell.fire_bolt' ||
    spellId === 'spell.ray_of_frost'
  ) {
    return '사거리 안의 적 토큰을 선택하세요. 벽/닫힌 문/오브젝트 엄폐는 서버가 명중 보정에 반영합니다.';
  }
  if (spellId === 'spell.sacred_flame') {
    return '시야와 사거리 안의 적 토큰을 선택하세요. 대상은 민첩 내성을 굴리며 엄폐 내성 보너스를 받지 않습니다.';
  }
  if (spellId === 'spell.magic_missile') {
    return '사거리 안의 적 토큰을 선택하세요. 대상이 완전 엄폐 뒤에 있으면 슬롯/행동 소모 전에 서버가 차단합니다.';
  }
  if (spellId === 'spell.cure_wounds') {
    return '접촉 가능한 아군 또는 자기 토큰을 선택하세요. 완전 엄폐 뒤 대상은 서버가 차단합니다.';
  }
  if (spellId === 'spell.sleep') {
    return '사거리 안의 타일을 선택하세요. 원점에서 완전 엄폐인 대상은 Sleep HP pool에서 제외됩니다.';
  }
  if (spellId === 'spell.fireball') {
    return '사거리 안의 폭발 원점을 선택하세요. 완전 엄폐 대상은 제외되고, 일부 엄폐는 Dex 내성 보너스로 적용됩니다.';
  }
  if (spellId === 'spell.burning_hands') {
    return '시전자에서 15ft 이내의 방향 타일을 선택하세요. 해당 방향의 15ft cone 안 대상이 Dex 내성을 굴립니다.';
  }
  if (spellId === 'spell.thunderwave') {
    return '시전자에서 15ft 이내의 시작 타일을 선택하세요. 15ft cube 안 대상은 건강 내성을 굴리고, 실패하면 10ft 밀려납니다.';
  }
  if (spellId === 'spell.entangle') {
    return '사거리 안의 시작 타일을 선택하세요. 20ft cube가 험지가 되고, 범위 안 대상은 힘 내성 실패 시 구속됩니다.';
  }
  if (spellId === 'spell.light') {
    return '사거리 안의 타일을 선택하세요.';
  }
  if (spellId === 'spell.detect_magic') {
    return '시전자 중심 30ft 안의 마법 효과를 감지합니다. 맵의 아무 타일이나 선택해 시전하세요.';
  }
  if (spellId === 'spell.bless') {
    return '30ft 안의 아군 토큰을 선택하세요. 공격 굴림과 내성 굴림에 매번 1d4를 더합니다.';
  }
  if (spellId === 'spell.bane') {
    return '30ft 안의 적 토큰을 선택하세요. 매력 내성 실패 시 공격 굴림과 내성 굴림에서 매번 1d4를 뺍니다.';
  }
  if (spellId === 'spell.guiding_bolt') {
    return '120ft 안의 적 토큰을 선택하세요. 명중하면 다음 공격이 이점을 얻습니다.';
  }
  if (spellId === 'spell.inflict_wounds') {
    return '접촉 가능한 적 토큰을 선택하세요.';
  }
  if (spellId === 'spell.healing_word') {
    return '60ft 안의 아군 또는 자기 토큰을 선택하세요. Bonus Action을 사용합니다.';
  }
  if (spellId === 'spell.command' || spellId === 'spell.hold_person') {
    return '60ft 안의 적 토큰을 선택하세요. 대상은 지혜 내성을 굴립니다.';
  }
  if (spellId === 'spell.web') {
    return '60ft 안의 시작 타일을 선택하세요. 20ft cube가 험지가 되고 대상이 구속될 수 있습니다.';
  }
  if (spellId === 'spell.misty_step') {
    return '30ft 안의 빈 타일을 선택하세요. Bonus Action으로 그 지점으로 순간이동합니다.';
  }
  if (spellId === 'spell.scorching_ray') {
    return '120ft 안의 적 토큰을 선택하세요. 광선 공격 굴림을 처리합니다.';
  }
  if (spellId === 'spell.dispel_magic') {
    return '120ft 안에서 해제할 주문 효과가 걸린 토큰을 선택하세요.';
  }
  if (
    spellId === 'spell.faerie_fire' ||
    spellId === 'spell.fog_cloud' ||
    spellId === 'spell.grease' ||
    spellId === 'spell.darkness' ||
    spellId === 'spell.moonbeam' ||
    spellId === 'spell.minor_illusion' ||
    spellId === 'spell.mage_hand' ||
    spellId === 'spell.lightning_bolt'
  ) {
    return '사거리 안의 효과 중심 또는 방향 타일을 선택하세요.';
  }
  if (
    spellId === 'spell.guidance' ||
    spellId === 'spell.feather_fall' ||
    spellId === 'spell.heroism' ||
    spellId === 'spell.longstrider' ||
    spellId === 'spell.aid' ||
    spellId === 'spell.invisibility' ||
    spellId === 'spell.lesser_restoration' ||
    spellId === 'spell.fly' ||
    spellId === 'spell.haste'
  ) {
    return '사거리 안의 아군 또는 자기 토큰을 선택하세요.';
  }
  if (
    spellId === 'spell.charm_person' ||
    spellId === 'spell.hunters_mark' ||
    spellId === 'spell.blindness_deafness' ||
    spellId === 'spell.spiritual_weapon'
  ) {
    return '사거리 안의 적 토큰을 선택하세요.';
  }
  if (spellId === 'spell.revivify') {
    return '접촉 가능한 쓰러진 아군 토큰을 선택하세요.';
  }
  if (spellId === 'spell.counterspell') {
    return 'Counterspell은 적이 주문을 시전할 때 반응 팝업으로 사용합니다.';
  }

  const p3Spell = spellMetadataById?.get(spellId);
  if (p3Spell?.targeting === 'token') {
    if (p3Spell.targetDisposition === 'ally') {
      return `${p3Spell.rangeFt}ft 안의 아군 또는 자기 토큰을 선택하세요.`;
    }
    if (p3Spell.targetDisposition === 'enemy') {
      return `${p3Spell.rangeFt}ft 안의 적 토큰을 선택하세요.`;
    }
    return `${p3Spell.rangeFt}ft 안의 대상 토큰을 선택하세요.`;
  }
  if (p3Spell?.targeting === 'point') {
    return `${p3Spell.rangeFt}ft 안의 효과 지점 또는 이동 목적지를 선택하세요.`;
  }
  return '사거리 안의 타일 또는 대상을 선택하세요.';
}

export function formatLevel1SpellSlots(remaining: number, total: number) {
  return formatSpellSlotPips('1', remaining, total);
}

export function formatSpellSlotPips(level: string, remaining: number, total: number) {
  const cappedTotal = Math.max(0, Math.floor(total));
  const cappedRemaining = Math.min(cappedTotal, Math.max(0, Math.floor(remaining)));
  if (cappedTotal <= 0) return `${level} --`;
  return `${level} ${Array.from({ length: cappedTotal }, (_, index) =>
    index < cappedRemaining ? '●' : '○'
  ).join('')}`;
}

export function getCombatSpellActionButtonTitle({
  label,
  costKind,
  isSlottedSpell,
  spellLevel,
  spellSlotRemaining,
  isTargeting,
}: {
  label: string;
  costKind: CombatSpellActionCostKind;
  isSlottedSpell: boolean;
  spellLevel?: number;
  spellSlotRemaining: number;
  isTargeting: boolean;
}) {
  if (costKind === 'reaction') {
    return `${label}은(는) 조건이 충족될 때 반응 팝업으로 사용합니다.`;
  }
  if (isSlottedSpell && spellSlotRemaining <= 0) {
    return `사용 가능한 ${spellLevel}레벨 주문 슬롯이 없습니다.`;
  }
  if (isTargeting) {
    return `${label} 사거리 안의 유효한 대상 또는 지점을 선택하세요.`;
  }
  return `${label} 타겟팅`;
}
