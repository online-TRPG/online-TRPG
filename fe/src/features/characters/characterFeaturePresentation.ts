type CharacterFeatureDisplayInfo = {
  label: string;
  description: string;
  sourceLabel: string;
  tone: 'race' | 'class' | 'subclass' | 'choice' | 'feat' | 'unknown';
};

type CanonicalClassFeatureEntry = {
  id: string;
  nameKo: string;
  category: 'class' | 'subclass' | 'asi' | 'choice' | string;
  summaryKo: string;
};

type RaceTraitDisplayEntry = {
  name: string;
  summary: string;
  aliases?: string[];
};

const skillLabelMap: Map<string, string> = new Map([
  ['Acrobatics', '곡예'],
  ['Arcana', '비전학'],
  ['Athletics', '운동'],
  ['Deception', '기만'],
  ['Intimidation', '위협'],
  ['History', '역사'],
  ['Insight', '통찰'],
  ['Investigation', '조사'],
  ['Medicine', '의학'],
  ['Nature', '자연'],
  ['Perception', '인지능력'],
  ['Performance', '공연'],
  ['Persuasion', '설득'],
  ['Religion', '종교'],
  ['Sleight of Hand', '손재주'],
  ['Stealth', '은신'],
  ['Survival', '생존'],
  ['Animal Handling', '동물 조련'],
]);

const fightingStyleLabelMap: Record<string, string> = {
  archery: '궁술',
  defense: '방어술',
  dueling: '결투술',
  great_weapon_fighting: '대형 무기 전투술',
  protection: '보호술',
  two_weapon_fighting: '쌍수 전투술',
};

const fightingStyleDescriptionMap: Record<string, string> = {
  archery: '원거리 무기 공격 명중 굴림에 +2 보너스를 받습니다.',
  defense: '갑옷을 착용하고 있을 때 방어도에 +1 보너스를 받습니다.',
  dueling: '한 손 근접 무기 하나만 들고 싸울 때 피해 굴림에 +2 보너스를 받습니다.',
  great_weapon_fighting: '양손 또는 겸용 근접 무기 피해 주사위가 1 또는 2이면 다시 굴릴 수 있습니다.',
  protection: '방패를 들고 있을 때 5ft 이내 아군을 향한 공격에 reaction으로 불리점을 줄 수 있습니다.',
  two_weapon_fighting: '쌍수 보조 공격 피해에도 능력 수정치를 더합니다.',
};

const favoredEnemyLabelMap: Record<string, string> = {
  aberrations: '변이체',
  beasts: '야수',
  celestials: '천상체',
  constructs: '구조체',
  dragons: '용',
  elementals: '정령',
  fey: '요정',
  fiends: '악마',
  giants: '거인',
  monstrosities: '괴수',
  oozes: '점액체',
  plants: '식물',
  undead: '언데드',
  humanoid: '인간형',
};

const favoredHumanoidLabelMap: Record<string, string> = {
  dwarves: '드워프',
  elves: '엘프',
  halflings: '하플링',
  humans: '인간',
  dragonborn: '드래곤본',
  gnomes: '노움',
  'half-elves': '하프엘프',
  'half-orcs': '하프오크',
  tieflings: '티플링',
  gnolls: '놀',
  goblins: '고블린',
  hobgoblins: '홉고블린',
  kobolds: '코볼드',
  lizardfolk: '리자드포크',
  orcs: '오크',
};

const draconicAncestryLabelMap: Record<string, string> = {
  black: '블랙 드래곤',
  blue: '블루 드래곤',
  brass: '브라스 드래곤',
  bronze: '브론즈 드래곤',
  copper: '코퍼 드래곤',
  gold: '골드 드래곤',
  green: '그린 드래곤',
  red: '레드 드래곤',
  silver: '실버 드래곤',
  white: '화이트 드래곤',
};

const abilityLabelMap: Record<string, string> = {
  str: '근력',
  dex: '민첩',
  con: '건강',
  int: '지능',
  wis: '지혜',
  cha: '매력',
};

const featureInfoMap: Record<string, Omit<CharacterFeatureDisplayInfo, 'tone'>> = {
  'feat.alert': {
    label: 'Alert / 경계',
    sourceLabel: 'Feat',
    description: '기습에 대비하고 전투 시작 반응성이 뛰어난 캐릭터를 표현하는 특성입니다.',
  },
  'class.barbarian.feature.rage': {
    label: '격노',
    sourceLabel: '직업 특성',
    description: '보조행동으로 격노해 근력 기반 근접 공격 피해와 내구를 강화합니다. 중갑을 입지 않았을 때 주로 사용합니다.',
  },
  'class.barbarian.feature.unarmored_defense': {
    label: '비무장 방어',
    sourceLabel: '직업 특성',
    description: '갑옷을 입지 않았을 때 방어도 계산에 민첩 수정치와 건강 수정치를 함께 사용할 수 있습니다.',
  },
  'class.barbarian.feature.reckless_attack': {
    label: '무모한 공격',
    sourceLabel: '직업 특성',
    description: '턴의 첫 근력 기반 근접 무기 공격에 이점을 얻는 대신, 다음 턴까지 자신을 향한 공격도 이점을 받습니다.',
  },
  'class.barbarian.feature.danger_sense': {
    label: '위험 감지',
    sourceLabel: '직업 특성',
    description: '볼 수 있는 함정이나 주문 같은 위험에 대한 민첩 내성 굴림에 이점을 얻습니다.',
  },
  'class.barbarian.feature.primal_path': {
    label: '원초적 길',
    sourceLabel: '직업 특성',
    description: '3레벨에 바바리안 서브클래스를 선택해 격노와 전투 스타일을 확장합니다.',
  },
  'class.barbarian.feature.extra_attack': {
    label: '추가 공격',
    sourceLabel: '직업 특성',
    description: '공격 행동을 할 때 한 번이 아니라 두 번 공격할 수 있습니다.',
  },
  'class.barbarian.feature.fast_movement': {
    label: '빠른 이동',
    sourceLabel: '직업 특성',
    description: '중갑을 입지 않았을 때 이동속도가 10ft 증가합니다.',
  },
  'class.barbarian.feature.feral_instinct': {
    label: '야성적 본능',
    sourceLabel: '직업 특성',
    description: '선제권 굴림에 이점을 얻고, 기습당해도 첫 턴에 격노하면 행동할 수 있습니다.',
  },
  'class.barbarian.feature.brutal_critical': {
    label: '잔혹한 치명타',
    sourceLabel: '직업 특성',
    description: '근접 무기 공격으로 치명타를 냈을 때 무기 피해 주사위를 추가로 굴립니다.',
  },
  'class.barbarian.feature.relentless_rage': {
    label: '끈질긴 격노',
    sourceLabel: '직업 특성',
    description: '격노 중 HP가 0이 될 때 건강 내성에 성공하면 1 HP로 버틸 수 있습니다.',
  },
  'class.barbarian.feature.persistent_rage': {
    label: '지속되는 격노',
    sourceLabel: '직업 특성',
    description: '무의식 상태가 되거나 직접 끝내지 않는 한 격노가 쉽게 종료되지 않습니다.',
  },
  'class.barbarian.feature.indomitable_might': {
    label: '굴하지 않는 힘',
    sourceLabel: '직업 특성',
    description: '근력 판정 결과가 근력 점수보다 낮으면 근력 점수로 대신 사용할 수 있습니다.',
  },
  'class.barbarian.feature.primal_champion': {
    label: '원초적 투사',
    sourceLabel: '직업 특성',
    description: '근력과 건강이 크게 상승하고 해당 능력치 최대치도 함께 증가하는 바바리안 최종 특성입니다.',
  },
  'class.bard.feature.spellcasting': {
    label: '주문시전',
    sourceLabel: '직업 특성',
    description: '바드는 매력을 주문시전 능력치로 사용하며, 알고 있는 바드 주문을 주문 슬롯으로 시전합니다. 의식 주문과 악기 초점구를 활용할 수 있습니다.',
  },
  'class.bard.feature.bardic_inspiration': {
    label: '바드의 고양감',
    sourceLabel: '직업 특성',
    description: '보조행동으로 아군에게 고양감 주사위를 부여합니다. 대상은 이후 판정, 공격, 내성 굴림에 그 주사위를 더할 수 있습니다.',
  },
  'class.bard.feature.jack_of_all_trades': {
    label: '만물박사',
    sourceLabel: '직업 특성',
    description: '숙련을 받지 않는 능력 판정에 숙련 보너스의 절반을 더합니다.',
  },
  'class.bard.feature.song_of_rest': {
    label: '휴식의 노래',
    sourceLabel: '직업 특성',
    description: '짧은 휴식 중 노래나 연주로 아군의 회복을 돕고 추가 회복 주사위를 제공합니다.',
  },
  'class.bard.feature.expertise': {
    label: '전문화',
    sourceLabel: '직업 특성',
    description: '선택한 두 숙련 기술의 숙련 보너스를 두 배로 적용합니다.',
  },
  'class.bard.feature.bard_college': {
    label: '바드 대학',
    sourceLabel: '직업 특성',
    description: '3레벨에 바드 대학을 선택해 공연, 지식, 전투 방식에 맞는 서브클래스 특성을 얻습니다.',
  },
  'class.bard.feature.font_of_inspiration': {
    label: '고양감의 원천',
    sourceLabel: '직업 특성',
    description: '바드의 고양감 사용 횟수가 긴 휴식뿐 아니라 짧은 휴식 후에도 회복됩니다.',
  },
  'class.bard.feature.bardic_inspiration_d8': {
    label: '바드의 고양감 d8',
    sourceLabel: '직업 특성',
    description: '바드의 고양감 주사위가 d8로 커집니다.',
  },
  'class.bard.feature.countercharm': {
    label: '반대매혹',
    sourceLabel: '직업 특성',
    description: '행동으로 공연을 시작해 주변 아군이 매혹과 공포에 대한 내성 굴림에 이점을 얻도록 돕습니다.',
  },
  'class.bard.feature.bard_college_feature': {
    label: '바드 대학 기능',
    sourceLabel: '서브클래스 특성',
    description: '선택한 바드 대학에서 제공하는 추가 서브클래스 특성을 얻습니다.',
  },
  'class.bard.feature.bardic_inspiration_d10': {
    label: '바드의 고양감 d10',
    sourceLabel: '직업 특성',
    description: '바드의 고양감 주사위가 d10으로 커집니다.',
  },
  'class.bard.feature.expertise_10': {
    label: '전문화 추가',
    sourceLabel: '직업 특성',
    description: '추가로 두 숙련 기술을 선택해 숙련 보너스를 두 배로 적용합니다.',
  },
  'class.bard.feature.magical_secrets': {
    label: '마법의 비밀',
    sourceLabel: '직업 특성',
    description: '다른 직업 주문 목록에서도 주문을 선택해 바드 주문으로 배울 수 있습니다.',
  },
  'class.bard.feature.bardic_inspiration_d12': {
    label: '바드의 고양감 d12',
    sourceLabel: '직업 특성',
    description: '바드의 고양감 주사위가 d12로 커집니다.',
  },
  'class.bard.feature.superior_inspiration': {
    label: '뛰어난 고양감',
    sourceLabel: '직업 특성',
    description: '전투 시작 시 바드의 고양감 사용 횟수가 없으면 1회를 회복합니다.',
  },
  'class.cleric.feature.spellcasting': {
    label: '주문시전',
    sourceLabel: '직업 특성',
    description: '클레릭은 지혜를 주문시전 능력치로 사용하며, 긴 휴식 후 클레릭 주문 목록에서 준비 주문을 바꿀 수 있습니다.',
  },
  'class.cleric.feature.divine_domain': {
    label: '신성 권역',
    sourceLabel: '직업 특성',
    description: '1레벨에 클레릭 권역을 선택해 권역 주문과 추가 기능을 얻습니다.',
  },
  'class.cleric.feature.channel_divinity': {
    label: '신성 변환',
    sourceLabel: '직업 특성',
    description: '성표를 내보이며 신성한 힘을 불러냅니다. 기본적으로 언데드 퇴치 같은 효과를 사용할 수 있고 권역에 따라 선택지가 늘어납니다.',
  },
  'class.cleric.feature.divine_domain_feature': {
    label: '신성 권역 기능',
    sourceLabel: '서브클래스 특성',
    description: '선택한 신성 권역에서 제공하는 추가 주문, 숙련, 신성 변환 선택지, 권역 특성을 얻습니다.',
  },
  'class.cleric.feature.destroy_undead': {
    label: '언데드 파괴',
    sourceLabel: '직업 특성',
    description: '언데드 퇴치에 실패한 낮은 CR의 언데드를 즉시 파괴할 수 있게 됩니다. 적용 가능한 CR은 레벨에 따라 증가합니다.',
  },
  'class.cleric.feature.divine_intervention': {
    label: '신성한 개입',
    sourceLabel: '직업 특성',
    description: '행동으로 신에게 도움을 청합니다. d100 굴림이 클레릭 레벨 이하이면 신적 개입이 성공합니다.',
  },
  'class.cleric.feature.divine_intervention_improvement': {
    label: '신성한 개입 향상',
    sourceLabel: '직업 특성',
    description: '신성한 개입이 굴림 없이 자동으로 성공하는 클레릭 최종 특성입니다.',
  },
  'class.druid.feature.druidic': {
    label: '드루이드어',
    sourceLabel: '직업 특성',
    description: '드루이드의 비밀 언어를 알고, 이 언어로 말하거나 비밀 메시지를 남길 수 있습니다.',
  },
  'class.druid.feature.spellcasting': {
    label: '주문시전',
    sourceLabel: '직업 특성',
    description: '드루이드는 지혜를 주문시전 능력치로 사용하며, 긴 휴식 후 드루이드 주문 목록에서 준비 주문을 바꿀 수 있습니다.',
  },
  'class.druid.feature.wild_shape': {
    label: '야생 변신',
    sourceLabel: '직업 특성',
    description: '행동을 사용해 이전에 본 야수 형태로 변신합니다. 짧은 휴식 또는 긴 휴식마다 제한된 횟수로 사용할 수 있습니다.',
  },
  'class.druid.feature.druid_circle': {
    label: '드루이드 서클',
    sourceLabel: '직업 특성',
    description: '2레벨에 드루이드 서클을 선택해 주문, 자연 회복, 지형 관련 기능 등 서브클래스 기능을 얻습니다.',
  },
  'class.druid.feature.wild_shape_improvement': {
    label: '야생 변신 향상',
    sourceLabel: '직업 특성',
    description: '야생 변신으로 선택할 수 있는 야수의 CR과 이동 유형 제한이 레벨에 따라 완화됩니다.',
  },
  'class.druid.feature.timeless_body': {
    label: '영원한 육체',
    sourceLabel: '직업 특성',
    description: '자연 마법의 힘으로 노화가 크게 느려집니다.',
  },
  'class.druid.feature.beast_spells': {
    label: '야수 주문',
    sourceLabel: '직업 특성',
    description: '야생 변신 상태에서도 대부분의 드루이드 주문을 시전할 수 있습니다.',
  },
  'class.druid.feature.archdruid': {
    label: '대드루이드',
    sourceLabel: '직업 특성',
    description: '야생 변신을 제한 없이 사용할 수 있고, 드루이드 주문 시전 능력이 극대화됩니다.',
  },
  'class.fighter.feature.second_wind': {
    label: '재기의 바람',
    sourceLabel: '직업 특성',
    description: '전투 중 보조행동으로 HP를 회복하는 파이터 특성입니다.',
  },
  'class.fighter.feature.action_surge': {
    label: '액션 서지',
    sourceLabel: '직업 특성',
    description: '자기 턴에 추가 행동 하나를 얻는 파이터 특성입니다.',
  },
  'class.fighter.feature.martial_archetype': {
    label: '무예 아키타입',
    sourceLabel: '직업 특성',
    description: '3레벨에 파이터 서브클래스를 선택해 전투 스타일을 더 구체화합니다.',
  },
  'class.fighter.feature.extra_attack': {
    label: '추가 공격',
    sourceLabel: '직업 특성',
    description: '공격 행동을 할 때 한 번이 아니라 여러 번 공격할 수 있습니다. 파이터는 레벨이 오르면 공격 횟수가 더 늘어납니다.',
  },
  'class.fighter.feature.extra_attack_2': {
    label: '추가 공격 2회',
    sourceLabel: '직업 특성',
    description: '공격 행동을 할 때 세 번 공격할 수 있습니다.',
  },
  'class.fighter.feature.extra_attack_3': {
    label: '추가 공격 3회',
    sourceLabel: '직업 특성',
    description: '공격 행동을 할 때 네 번 공격할 수 있습니다.',
  },
  'class.fighter.feature.indomitable': {
    label: '불굴',
    sourceLabel: '직업 특성',
    description: '실패한 내성 굴림을 다시 굴릴 수 있습니다. 새 결과를 반드시 사용합니다.',
  },
  'class.fighter.feature.fighting_style': {
    label: '전투 방식',
    sourceLabel: '직업 특성',
    description: '선택한 전투 방식에 따라 공격, 방어, 쌍수 전투 등에 보너스를 줍니다.',
  },
  'feature.fighter.fighting_style': {
    label: '전투 방식',
    sourceLabel: '직업 특성',
    description: '선택한 전투 방식에 따라 공격, 방어, 쌍수 전투 등에 보너스를 줍니다.',
  },
  'class.rogue.feature.expertise': {
    label: '전문화',
    sourceLabel: '직업 특성',
    description: '선택한 숙련 기술의 숙련 보너스를 두 배로 적용합니다.',
  },
  'feature.rogue.expertise': {
    label: '전문화',
    sourceLabel: '직업 특성',
    description: '선택한 숙련 기술의 숙련 보너스를 두 배로 적용합니다.',
  },
  'class.rogue.feature.sneak_attack': {
    label: '암습',
    sourceLabel: '직업 특성',
    description: '조건을 만족한 무기 공격에 턴당 한 번 추가 피해를 줍니다.',
  },
  'feature.rogue.sneak_attack': {
    label: '암습',
    sourceLabel: '직업 특성',
    description: '조건을 만족한 무기 공격에 턴당 한 번 추가 피해를 줍니다.',
  },
  'class.rogue.feature.cunning_action': {
    label: '교활한 행동',
    sourceLabel: '직업 특성',
    description: '보조행동으로 질주, 이탈, 숨기 행동을 할 수 있습니다.',
  },
  'class.rogue.feature.thieves_cant': {
    label: '도둑의 은어',
    sourceLabel: '직업 특성',
    description: '도둑과 범죄자들 사이에서 쓰이는 암호, 은어, 표식을 이해하고 사용할 수 있습니다.',
  },
  'class.rogue.feature.roguish_archetype': {
    label: '로그 아키타입',
    sourceLabel: '직업 특성',
    description: '3레벨에 로그 서브클래스를 선택해 전투, 잠입, 기교 방향을 정합니다.',
  },
  'class.rogue.feature.uncanny_dodge': {
    label: '불가사의한 회피',
    sourceLabel: '직업 특성',
    description: '볼 수 있는 공격자가 자신을 명중시켰을 때 reaction으로 그 공격의 피해를 절반으로 줄일 수 있습니다.',
  },
  'class.rogue.feature.evasion': {
    label: '회피',
    sourceLabel: '직업 특성',
    description: '민첩 내성에 성공하면 피해를 받지 않고, 실패해도 일반적으로 절반 피해만 받습니다.',
  },
  'class.rogue.feature.reliable_talent': {
    label: '믿음직한 재능',
    sourceLabel: '직업 특성',
    description: '숙련 보너스를 더하는 능력 판정에서 d20 결과가 9 이하이면 10으로 취급합니다.',
  },
  'class.rogue.feature.blindsense': {
    label: '맹시 감각',
    sourceLabel: '직업 특성',
    description: '들을 수 있는 상태라면 10ft 이내의 숨은 크리처나 투명 크리처의 위치를 감지할 수 있습니다.',
  },
  'class.rogue.feature.slippery_mind': {
    label: '미끄러운 정신',
    sourceLabel: '직업 특성',
    description: '정신을 단련해 지혜 내성 굴림에 숙련을 얻습니다.',
  },
  'class.rogue.feature.elusive': {
    label: '포착 불가',
    sourceLabel: '직업 특성',
    description: '무력화 상태가 아닌 동안 자신을 향한 공격 굴림은 유리함을 얻을 수 없습니다.',
  },
  'class.rogue.feature.stroke_of_luck': {
    label: '행운의 일격',
    sourceLabel: '직업 특성',
    description: '빗나간 공격을 명중으로 바꾸거나 실패한 능력 판정의 d20 결과를 20으로 바꿀 수 있습니다.',
  },
  'class.ranger.feature.favored_enemy': {
    label: '주적',
    sourceLabel: '직업 특성',
    description: '선택한 적 유형을 추적하거나 관련 정보를 판정할 때 쓰이는 레인저 특성입니다.',
  },
  'feature.ranger.favored_enemy': {
    label: '주적',
    sourceLabel: '직업 특성',
    description: '선택한 적 유형을 추적하거나 관련 정보를 판정할 때 쓰이는 레인저 특성입니다.',
  },
  'class.ranger.feature.natural_explorer': {
    label: '자연 탐험가',
    sourceLabel: '직업 특성',
    description: '선택한 지형에서 여행, 추적, 탐색에 능숙해지는 레인저 탐험 특성입니다.',
  },
  'class.ranger.feature.spellcasting': {
    label: '주문시전',
    sourceLabel: '직업 특성',
    description: '레인저는 지혜를 주문시전 능력치로 사용하며, 알고 있는 레인저 주문을 주문 슬롯으로 시전합니다.',
  },
  'class.ranger.feature.fighting_style': {
    label: '전투 방식',
    sourceLabel: '직업 특성',
    description: '2레벨에 궁술, 방어술, 결투술, 쌍수 전투술 등 레인저 전투 방식을 선택합니다.',
  },
  'class.ranger.feature.ranger_archetype': {
    label: '레인저 아키타입',
    sourceLabel: '직업 특성',
    description: '3레벨에 레인저 서브클래스를 선택해 사냥 방식과 전투 역할을 확장합니다.',
  },
  'class.ranger.feature.primeval_awareness': {
    label: '원초적 감지',
    sourceLabel: '직업 특성',
    description: '주문 슬롯을 소비해 주변의 특정 크리처 유형 존재를 감지합니다.',
  },
  'class.ranger.feature.extra_attack': {
    label: '추가 공격',
    sourceLabel: '직업 특성',
    description: '자기 턴에 공격 행동을 할 때 한 번이 아니라 두 번 공격할 수 있습니다.',
  },
  'class.ranger.feature.lands_stride': {
    label: '대지의 발걸음',
    sourceLabel: '직업 특성',
    description: '비마법적 험지와 식물이 이동을 늦추지 않으며, 마법 식물의 방해에 저항하기 쉬워집니다.',
  },
  'class.ranger.feature.hide_in_plain_sight': {
    label: '눈앞의 은신',
    sourceLabel: '직업 특성',
    description: '1분 동안 위장을 준비해 움직이지 않는 동안 은신 판정에 큰 보너스를 받을 수 있습니다.',
  },
  'class.ranger.feature.vanish': {
    label: '사라지기',
    sourceLabel: '직업 특성',
    description: '보조행동으로 숨기 행동을 할 수 있고, 흔적을 남기지 않으면 비마법적 추적을 피할 수 있습니다.',
  },
  'class.ranger.feature.feral_senses': {
    label: '야성 감각',
    sourceLabel: '직업 특성',
    description: '보이지 않는 크리처와 싸울 때의 불리함을 줄이고, 조건을 만족하면 투명한 적의 위치를 감지합니다.',
  },
  'class.ranger.feature.foe_slayer': {
    label: '숙적 처단자',
    sourceLabel: '직업 특성',
    description: '턴마다 한 번 숙적을 향한 공격 굴림이나 피해 굴림에 지혜 수정치를 더할 수 있습니다.',
  },
  'class.monk.feature.unarmored_defense': {
    label: '비무장 방어',
    sourceLabel: '직업 특성',
    description: '갑옷과 방패를 쓰지 않을 때 방어도 계산에 민첩 수정치와 지혜 수정치를 함께 사용할 수 있습니다.',
  },
  'class.monk.feature.martial_arts': {
    label: '무술',
    sourceLabel: '직업 특성',
    description: '몽크 무기와 비무장 공격을 민첩으로 사용할 수 있고, 공격 후 보조행동 비무장 공격을 할 수 있습니다.',
  },
  'class.monk.feature.ki': {
    label: '기',
    sourceLabel: '직업 특성',
    description: '기 포인트를 소비해 질풍격, 인내의 방어, 바람 걸음 같은 몽크 기술을 사용합니다.',
  },
  'class.monk.feature.unarmored_movement': {
    label: '비무장 이동',
    sourceLabel: '직업 특성',
    description: '갑옷과 방패를 쓰지 않을 때 이동속도가 증가합니다.',
  },
  'class.monk.feature.monastic_tradition': {
    label: '수도 전통',
    sourceLabel: '직업 특성',
    description: '3레벨에 몽크 서브클래스를 선택해 수련 방식과 전투 기술을 확장합니다.',
  },
  'class.monk.feature.deflect_missiles': {
    label: '투사체 쳐내기',
    sourceLabel: '직업 특성',
    description: '반응행동으로 원거리 무기 공격의 피해를 줄이고, 조건을 만족하면 투사체를 되던질 수 있습니다.',
  },
  'class.monk.feature.slow_fall': {
    label: '느린 낙하',
    sourceLabel: '직업 특성',
    description: '반응행동으로 낙하 피해를 몽크 레벨에 비례해 줄입니다.',
  },
  'class.monk.feature.extra_attack': {
    label: '추가 공격',
    sourceLabel: '직업 특성',
    description: '공격 행동을 할 때 한 번이 아니라 두 번 공격할 수 있습니다.',
  },
  'class.monk.feature.stunning_strike': {
    label: '충격의 일격',
    sourceLabel: '직업 특성',
    description: '근접 무기 공격 명중 시 기를 소비해 대상에게 건강 내성을 요구하고 실패하면 기절시킵니다.',
  },
  'class.monk.feature.ki_empowered_strikes': {
    label: '기 강화 일격',
    sourceLabel: '직업 특성',
    description: '비무장 공격이 비마법 공격 저항과 면역을 상대할 때 마법 공격으로 취급됩니다.',
  },
  'class.monk.feature.monastic_tradition_feature': {
    label: '수도 전통 기능',
    sourceLabel: '서브클래스 특성',
    description: '선택한 수도 전통에서 제공하는 추가 서브클래스 특성을 얻습니다.',
  },
  'class.monk.feature.evasion': {
    label: '회피',
    sourceLabel: '직업 특성',
    description: '민첩 내성에 성공하면 피해를 받지 않고, 실패해도 일반적으로 절반 피해만 받습니다.',
  },
  'class.monk.feature.stillness_of_mind': {
    label: '고요한 정신',
    sourceLabel: '직업 특성',
    description: '행동을 사용해 자신에게 걸린 매혹 또는 공포 효과 하나를 끝낼 수 있습니다.',
  },
  'class.monk.feature.purity_of_body': {
    label: '순수한 육체',
    sourceLabel: '직업 특성',
    description: '질병과 독에 면역을 얻습니다.',
  },
  'class.monk.feature.diamond_soul': {
    label: '다이아몬드 영혼',
    sourceLabel: '직업 특성',
    description: '모든 내성 굴림에 숙련을 얻고, 기를 소비해 실패한 내성을 다시 굴릴 수 있습니다.',
  },
  'class.monk.feature.empty_body': {
    label: '빈 몸',
    sourceLabel: '직업 특성',
    description: '기를 소비해 투명화에 가까운 상태가 되거나, 더 많은 기를 소비해 아스트랄 투사를 사용할 수 있습니다.',
  },
  'class.monk.feature.perfect_self': {
    label: '완전한 자아',
    sourceLabel: '직업 특성',
    description: '전투 시작 시 기가 부족하면 일부 기를 회복하는 몽크 최종 특성입니다.',
  },
  'class.paladin.feature.divine_sense': {
    label: '신성한 감각',
    sourceLabel: '직업 특성',
    description: '행동으로 주변의 천상체, 악마, 언데드 같은 존재의 위치를 감지합니다.',
  },
  'class.paladin.feature.lay_on_hands': {
    label: '안수치료',
    sourceLabel: '직업 특성',
    description: '치유 풀을 사용해 접촉한 대상의 HP를 회복하거나 질병과 독을 제거합니다.',
  },
  'class.paladin.feature.fighting_style': {
    label: '전투 방식',
    sourceLabel: '직업 특성',
    description: '2레벨에 방어, 결투, 대형 무기 전투, 보호 같은 팔라딘 전투 방식을 선택합니다.',
  },
  'class.paladin.feature.spellcasting': {
    label: '주문시전',
    sourceLabel: '직업 특성',
    description: '팔라딘은 매력을 주문시전 능력치로 사용하며, 긴 휴식 후 준비 주문을 바꿀 수 있습니다.',
  },
  'class.paladin.feature.divine_smite': {
    label: '신성한 강타',
    sourceLabel: '직업 특성',
    description: '근접 무기 공격 명중 시 주문 슬롯을 소비해 추가 광휘 피해를 줄 수 있습니다.',
  },
  'class.paladin.feature.divine_health': {
    label: '신성한 건강',
    sourceLabel: '직업 특성',
    description: '신성한 힘으로 질병에 면역을 얻습니다.',
  },
  'class.paladin.feature.sacred_oath': {
    label: '신성한 맹세',
    sourceLabel: '직업 특성',
    description: '3레벨에 팔라딘 맹세를 선택해 맹세 주문과 신성 변환 선택지를 얻습니다.',
  },
  'class.paladin.feature.extra_attack': {
    label: '추가 공격',
    sourceLabel: '직업 특성',
    description: '공격 행동을 할 때 한 번이 아니라 두 번 공격할 수 있습니다.',
  },
  'class.paladin.feature.aura_of_protection': {
    label: '보호의 오라',
    sourceLabel: '직업 특성',
    description: '자신과 가까운 아군의 내성 굴림에 자신의 매력 수정치를 더합니다.',
  },
  'class.paladin.feature.aura_of_courage': {
    label: '용기의 오라',
    sourceLabel: '직업 특성',
    description: '자신과 가까운 아군이 공포 상태에 면역을 얻습니다.',
  },
  'class.paladin.feature.improved_divine_smite': {
    label: '향상된 신성한 강타',
    sourceLabel: '직업 특성',
    description: '근접 무기 공격이 명중할 때마다 추가 광휘 피해를 줍니다.',
  },
  'class.paladin.feature.cleansing_touch': {
    label: '정화의 손길',
    sourceLabel: '직업 특성',
    description: '행동으로 자신이나 접촉한 크리처에게 걸린 주문 효과 하나를 끝낼 수 있습니다.',
  },
  'class.sorcerer.feature.spellcasting': {
    label: '주문시전',
    sourceLabel: '직업 특성',
    description: '소서러는 매력을 주문시전 능력치로 사용하며, 알고 있는 소서러 주문을 주문 슬롯으로 시전합니다.',
  },
  'class.sorcerer.feature.sorcerous_origin': {
    label: '소서러 기원',
    sourceLabel: '직업 특성',
    description: '1레벨에 소서러 기원을 선택해 마법의 근원과 서브클래스 기능을 정합니다.',
  },
  'class.sorcerer.feature.font_of_magic': {
    label: '마력의 샘',
    sourceLabel: '직업 특성',
    description: '소서리 포인트를 얻고, 이를 주문 슬롯 생성이나 주문 슬롯 변환에 사용할 수 있습니다.',
  },
  'class.sorcerer.feature.metamagic': {
    label: '메타매직',
    sourceLabel: '직업 특성',
    description: '소서리 포인트를 소비해 주문의 거리, 대상, 위력, 시전 방식 등을 변형합니다.',
  },
  'class.sorcerer.feature.metamagic_improvement': {
    label: '메타매직 추가',
    sourceLabel: '직업 특성',
    description: '추가 메타매직 선택지를 얻어 주문 변형 폭이 넓어집니다.',
  },
  'class.sorcerer.feature.sorcerous_restoration': {
    label: '소서러적 회복',
    sourceLabel: '직업 특성',
    description: '짧은 휴식을 마칠 때 소서리 포인트 일부를 회복하는 소서러 최종 특성입니다.',
  },
  'class.warlock.feature.otherworldly_patron': {
    label: '다른 세계의 후원자',
    sourceLabel: '직업 특성',
    description: '1레벨에 워락 후원자를 선택해 계약의 성격과 서브클래스 기능을 정합니다.',
  },
  'class.warlock.feature.pact_magic': {
    label: '계약 마법',
    sourceLabel: '직업 특성',
    description: '워락은 매력을 주문시전 능력치로 사용하며, 짧은 휴식 또는 긴 휴식 후 계약 주문 슬롯을 회복합니다.',
  },
  'class.warlock.feature.eldritch_invocations': {
    label: '섬뜩한 영창',
    sourceLabel: '직업 특성',
    description: '금지된 지식의 조각을 선택해 워락 주문, 감각, 전투 능력을 확장합니다.',
  },
  'class.warlock.feature.pact_boon': {
    label: '계약의 은혜',
    sourceLabel: '직업 특성',
    description: '3레벨에 사슬, 칼날, 책 등 계약의 선물을 선택해 플레이 방식을 확장합니다.',
  },
  'class.warlock.feature.mystic_arcanum_6': {
    label: '신비의 비밀 6레벨',
    sourceLabel: '직업 특성',
    description: '6레벨 주문 하나를 비밀 주문으로 선택하고 긴 휴식마다 한 번 시전할 수 있습니다.',
  },
  'class.warlock.feature.mystic_arcanum_7': {
    label: '신비의 비밀 7레벨',
    sourceLabel: '직업 특성',
    description: '7레벨 주문 하나를 비밀 주문으로 선택하고 긴 휴식마다 한 번 시전할 수 있습니다.',
  },
  'class.warlock.feature.mystic_arcanum_8': {
    label: '신비의 비밀 8레벨',
    sourceLabel: '직업 특성',
    description: '8레벨 주문 하나를 비밀 주문으로 선택하고 긴 휴식마다 한 번 시전할 수 있습니다.',
  },
  'class.warlock.feature.mystic_arcanum_9': {
    label: '신비의 비밀 9레벨',
    sourceLabel: '직업 특성',
    description: '9레벨 주문 하나를 비밀 주문으로 선택하고 긴 휴식마다 한 번 시전할 수 있습니다.',
  },
  'class.warlock.feature.eldritch_master': {
    label: '섬뜩한 주인',
    sourceLabel: '직업 특성',
    description: '후원자에게 간청해 짧은 의식 후 소모한 계약 마법 슬롯을 회복합니다.',
  },
  'class.wizard.feature.spellcasting': {
    label: '주문시전',
    sourceLabel: '직업 특성',
    description: '위저드는 지능을 주문시전 능력치로 사용합니다. 주문책에 주문을 기록하고, 긴 휴식 후 준비 주문을 바꿀 수 있습니다.',
  },
  'class.wizard.feature.arcane_recovery': {
    label: '비전 회복',
    sourceLabel: '직업 특성',
    description: '하루 한 번 짧은 휴식을 마쳤을 때 사용한 주문 슬롯 일부를 회복합니다. 회복 가능한 슬롯 총합은 위저드 레벨 절반 기준입니다.',
  },
  'class.wizard.feature.arcane_tradition': {
    label: '비전 전통',
    sourceLabel: '직업 특성',
    description: '2레벨에 위저드 전통을 선택해 주문 학파와 서브클래스 기능을 얻습니다.',
  },
  'class.wizard.feature.spell_mastery': {
    label: '주문 숙련',
    sourceLabel: '직업 특성',
    description: '낮은 레벨 주문 일부를 완전히 숙달해 주문 슬롯 없이 반복적으로 시전할 수 있습니다.',
  },
  'class.wizard.feature.signature_spells': {
    label: '대표 주문',
    sourceLabel: '직업 특성',
    description: '대표 3레벨 주문을 선택해 준비 상태로 유지하고, 각각 긴 휴식마다 한 번 슬롯 없이 시전할 수 있습니다.',
  },
  'class.barbarian.subclass_feature.frenzy': {
    label: '광란',
    sourceLabel: '서브클래스 특성',
    description: '격노 중 추가 보조행동 근접 공격을 가능하게 하는 광전사 특성입니다.',
  },
};

function formatFeatureTokenValue(value: string) {
  const normalized = value.trim();
  return (
    skillLabelMap.get(normalized) ??
    fightingStyleLabelMap[normalized] ??
    favoredEnemyLabelMap[normalized] ??
    favoredHumanoidLabelMap[normalized] ??
    draconicAncestryLabelMap[normalized] ??
    normalized
  );
}

function humanizeFeatureId(featureId: string) {
  const meaningfulPart =
    featureId.split('.feature.').at(-1) ??
    featureId.split('.trait.').at(-1) ??
    featureId.split('.subclass_feature.').at(-1) ??
    featureId;

  return meaningfulPart
    .split(/[._:-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeLooseToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .trim();
}

function getFeatureTone(featureId: string): CharacterFeatureDisplayInfo['tone'] {
  if (featureId.startsWith('feat.')) return 'feat';
  if (featureId.startsWith('asi:')) return 'feat';
  if (featureId.startsWith('race.') || /^race\s+.+\s+trait\s+/i.test(featureId)) return 'race';
  if (featureId.startsWith('subclass.')) return 'subclass';
  if (featureId.includes(':')) return 'choice';
  if (featureId.startsWith('class.') || featureId.startsWith('feature.')) return 'class';
  return 'unknown';
}

function getFeatureSourceLabel(featureId: string) {
  const tone = getFeatureTone(featureId);
  if (tone === 'feat') return 'Feat';
  if (tone === 'race') return '종족 특성';
  if (tone === 'subclass') return '서브클래스 특성';
  if (tone === 'choice') return '선택 특성';
  if (tone === 'class') return '직업 특성';
  return '특성';
}

function getCanonicalClassFeatureDisplayInfo(
  featureId: string,
  canonicalClassFeatures: CanonicalClassFeatureEntry[] | undefined
): CharacterFeatureDisplayInfo | null {
  if (!canonicalClassFeatures?.length || !featureId.startsWith('class.')) {
    return null;
  }

  const canonicalFeature = canonicalClassFeatures.find((feature) => feature.id === featureId);
  if (!canonicalFeature) {
    return null;
  }

  const staticInfo = featureInfoMap[featureId];
  const tone = canonicalFeature.category === 'subclass' ? 'subclass' : getFeatureTone(featureId);
  return {
    label: canonicalFeature.nameKo || staticInfo?.label || humanizeFeatureId(featureId),
    sourceLabel:
      canonicalFeature.category === 'subclass'
        ? '서브클래스 특성'
        : staticInfo?.sourceLabel ?? getFeatureSourceLabel(featureId),
    tone,
    description:
      canonicalFeature.summaryKo ||
      staticInfo?.description ||
      'SRD class feature manifest에 등록된 캐릭터 특성입니다.',
  };
}

function extractRaceTraitName(featureId: string) {
  const dotTrait = featureId.split('.trait.').at(-1);
  if (dotTrait && dotTrait !== featureId) return dotTrait;

  const legacyTrait = /^race\s+.+?\s+trait\s+(.+)$/i.exec(featureId);
  if (legacyTrait?.[1]) return legacyTrait[1];

  return null;
}

function findRaceTraitSummary(
  raceTraitName: string,
  raceTraitSummaries: RaceTraitDisplayEntry[] | undefined
) {
  if (!raceTraitSummaries?.length) return null;

  const normalizedTraitName = normalizeLooseToken(raceTraitName);
  return (
    raceTraitSummaries.find((trait) => normalizeLooseToken(trait.name) === normalizedTraitName) ??
    raceTraitSummaries.find((trait) =>
      (trait.aliases ?? []).some((alias) => normalizeLooseToken(alias) === normalizedTraitName)
    ) ??
    raceTraitSummaries.find((trait) => {
      const normalizedNames = [trait.name, ...(trait.aliases ?? [])].map(normalizeLooseToken);
      return normalizedNames.some(
        (normalizedName) =>
          normalizedTraitName.includes(normalizedName) || normalizedName.includes(normalizedTraitName)
      );
    }) ??
    null
  );
}

function getRaceTraitDisplayInfo(
  featureId: string,
  raceTraitSummaries: RaceTraitDisplayEntry[] | undefined
): CharacterFeatureDisplayInfo | null {
  const traitName = extractRaceTraitName(featureId);
  if (!traitName) return null;

  const label = humanizeFeatureId(traitName);
  const matchedTrait = findRaceTraitSummary(label, raceTraitSummaries);
  if (matchedTrait) {
    return {
      label: matchedTrait.name,
      sourceLabel: '종족 특성',
      tone: 'race',
      description: matchedTrait.summary,
    };
  }

  const normalizedTraitName = normalizeLooseToken(label);
  if (normalizedTraitName === 'base traits') {
    const summary = raceTraitSummaries?.length
      ? raceTraitSummaries
          .slice(0, 4)
          .map((trait) => `${trait.name}: ${trait.summary}`)
          .join(' · ')
      : '선택한 종족에서 자동으로 얻는 기본 특성입니다.';

    return {
      label: '종족 기본 특성',
      sourceLabel: '종족 특성',
      tone: 'race',
      description: summary,
    };
  }

  return {
    label,
    sourceLabel: '종족 특성',
    tone: 'race',
    description: '선택한 종족에서 자동으로 얻거나 선택한 종족 특성입니다.',
  };
}

export function getCharacterFeatureDisplayInfo(
  feature: string,
  canonicalClassFeatures?: CanonicalClassFeatureEntry[],
  raceTraitSummaries?: RaceTraitDisplayEntry[]
): CharacterFeatureDisplayInfo {
  const normalized = feature.trim();
  const canonicalInfo = getCanonicalClassFeatureDisplayInfo(normalized, canonicalClassFeatures);
  if (canonicalInfo) {
    return canonicalInfo;
  }

  const raceInfo = getRaceTraitDisplayInfo(normalized, raceTraitSummaries);
  if (raceInfo) {
    return raceInfo;
  }

  const staticInfo = featureInfoMap[normalized];
  if (staticInfo) {
    return {
      ...staticInfo,
      tone: getFeatureTone(normalized),
    };
  }

  if (normalized.startsWith('expertise:')) {
    const skill = formatFeatureTokenValue(normalized.slice('expertise:'.length));
    return {
      label: `전문화: ${skill}`,
      sourceLabel: '선택 특성',
      tone: 'choice',
      description: `${skill} 판정에 숙련 보너스를 두 배로 적용합니다.`,
    };
  }

  if (normalized.startsWith('fighting_style:')) {
    const style = normalized.slice('fighting_style:'.length);
    const label = fightingStyleLabelMap[style] ?? style;
    return {
      label: `전투 방식: ${label}`,
      sourceLabel: '선택 특성',
      tone: 'choice',
      description: fightingStyleDescriptionMap[style] ?? `${label} 전투 방식이 적용됩니다.`,
    };
  }

  if (normalized.startsWith('favored_enemy:')) {
    const enemy = formatFeatureTokenValue(normalized.slice('favored_enemy:'.length));
    return {
      label: `주적: ${enemy}`,
      sourceLabel: '선택 특성',
      tone: 'choice',
      description: `${enemy} 유형의 적에 대한 추적, 지식, 단서 판정에 쓰이는 레인저 특성입니다.`,
    };
  }

  if (normalized.startsWith('favored_enemy_humanoid:')) {
    const race = formatFeatureTokenValue(normalized.slice('favored_enemy_humanoid:'.length));
    return {
      label: `주적 인간형: ${race}`,
      sourceLabel: '선택 특성',
      tone: 'choice',
      description: `주적 인간형 선택에 포함된 ${race}입니다.`,
    };
  }

  if (normalized.startsWith('draconic_ancestry:')) {
    const ancestry = formatFeatureTokenValue(normalized.slice('draconic_ancestry:'.length));
    return {
      label: `드래곤 선조: ${ancestry}`,
      sourceLabel: '선택 특성',
      tone: 'choice',
      description: `${ancestry} 혈통에 따른 피해 유형과 저항을 표현하는 드래곤본 특성입니다.`,
    };
  }

  if (normalized.startsWith('asi:')) {
    const ability = normalized.slice('asi:'.length);
    const label = abilityLabelMap[ability] ?? ability;
    return {
      label: `ASI: ${label} +2`,
      sourceLabel: 'ASI/Feat',
      tone: 'feat',
      description: `${label} 능력치를 2점 올리는 능력치 상승 선택입니다. 같은 ASI 지점에서 Feat 대신 선택합니다.`,
    };
  }

  return {
    label: humanizeFeatureId(normalized),
    sourceLabel: getFeatureSourceLabel(normalized),
    tone: getFeatureTone(normalized),
    description: '자동 획득했거나 선택한 캐릭터 특성입니다.',
  };
}

export function summarizeCharacterFeatures(
  features: string[] | null | undefined,
  limit = 4,
  canonicalClassFeatures?: CanonicalClassFeatureEntry[],
  raceTraitSummaries?: RaceTraitDisplayEntry[]
) {
  return (features ?? [])
    .filter((feature) => feature.trim().length > 0)
    .map((feature) =>
      getCharacterFeatureDisplayInfo(feature, canonicalClassFeatures, raceTraitSummaries)
    )
    .slice(0, Math.max(0, limit));
}
