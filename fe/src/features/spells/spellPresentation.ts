import type { GameIconName } from '../../components/GameIcon';
import { cleanUserFacingSpellLabel, hasKoreanSpellText } from './spellDisplay';

export type SpellPresentationTone =
  | 'acid'
  | 'arcane'
  | 'cold'
  | 'control'
  | 'defense'
  | 'divine'
  | 'fire'
  | 'healing'
  | 'illusion'
  | 'lightning'
  | 'mobility'
  | 'nature'
  | 'necrotic'
  | 'poison'
  | 'psychic'
  | 'radiant'
  | 'thunder'
  | 'utility';

export type SpellPresentation = {
  id: string;
  shortLabel: string;
  iconName: GameIconName;
  tone: SpellPresentationTone;
  tags: string[];
};

const curatedSpellPresentationOverrides: Record<string, SpellPresentation> = {
  'spell.chill_touch': spell('spell.chill_touch', '냉기의 손길', 'game-icons:ice-bolt', 'necrotic', ['피해', '원거리', '캔트립']),
  'spell.fire_bolt': spell('spell.fire_bolt', '화염 화살', 'game-icons:fire-ray', 'fire', ['피해', '원거리', '화염', '캔트립']),
  'spell.light': spell('spell.light', '빛', 'game-icons:sunbeams', 'utility', ['유틸', '빛', '캔트립']),
  'spell.ray_of_frost': spell('spell.ray_of_frost', '서리 광선', 'game-icons:ice-spear', 'cold', ['피해', '원거리', '냉기', '캔트립']),
  'spell.sacred_flame': spell('spell.sacred_flame', '신성한 불꽃', 'game-icons:holy-hand-grenade', 'radiant', ['피해', '내성', '광휘', '캔트립']),
  'spell.acid_splash': spell('spell.acid_splash', '산성 물보라', 'game-icons:acid-blob', 'acid', ['피해', '산성', '캔트립']),
  'spell.guidance': spell('spell.guidance', '인도', 'game-icons:angel-outfit', 'divine', ['지원', '판정', '캔트립']),
  'spell.mage_hand': spell('spell.mage_hand', '마법사의 손', 'game-icons:magic-palm', 'utility', ['유틸', '조작', '캔트립']),
  'spell.minor_illusion': spell('spell.minor_illusion', '하급 환영', 'game-icons:invisible-face', 'illusion', ['유틸', '환영', '캔트립']),
  'spell.shocking_grasp': spell('spell.shocking_grasp', '전격의 손길', 'game-icons:lightning-arc', 'lightning', ['피해', '근접', '번개', '캔트립']),
  'spell.blade_ward': spell('spell.blade_ward', '칼날 방호', 'game-icons:shield-reflect', 'defense', ['방어', '저항', '캔트립']),
  'spell.dancing_lights': spell('spell.dancing_lights', '춤추는 빛', 'game-icons:fairy-wand', 'illusion', ['유틸', '빛', '캔트립']),
  'spell.eldritch_blast': spell('spell.eldritch_blast', '섬뜩한 방출', 'game-icons:implosion', 'arcane', ['피해', '원거리', '캔트립']),
  'spell.friends': spell('spell.friends', '친구', 'game-icons:handshake', 'control', ['사회', '매혹', '캔트립']),
  'spell.mending': spell('spell.mending', '수선', 'game-icons:sewing-needle', 'utility', ['유틸', '수리', '캔트립']),
  'spell.message': spell('spell.message', '전언', 'game-icons:talk', 'utility', ['유틸', '소통', '캔트립']),
  'spell.poison_spray': spell('spell.poison_spray', '독 분사', 'game-icons:poison-gas', 'poison', ['피해', '독', '캔트립']),
  'spell.produce_flame': spell('spell.produce_flame', '불꽃 생성', 'game-icons:flame', 'fire', ['피해', '빛', '화염', '캔트립']),
  'spell.resistance': spell('spell.resistance', '저항', 'game-icons:aura', 'defense', ['지원', '내성', '캔트립']),
  'spell.spare_the_dying': spell('spell.spare_the_dying', '빈사 안정화', 'game-icons:life-support', 'healing', ['회복', '안정화', '캔트립']),

  'spell.bane': spell('spell.bane', '파멸', 'game-icons:evil-eyes', 'control', ['약화', '내성']),
  'spell.bless': spell('spell.bless', '축복', 'game-icons:holy-grail', 'divine', ['지원', '명중', '내성']),
  'spell.burning_hands': spell('spell.burning_hands', '타오르는 손길', 'game-icons:fire-breath', 'fire', ['피해', '범위', '화염']),
  'spell.command': spell('spell.command', '명령', 'game-icons:shouting', 'control', ['제어', '정신', '내성']),
  'spell.cure_wounds': spell('spell.cure_wounds', '상처 치료', 'game-icons:health-increase', 'healing', ['회복', '접촉']),
  'spell.detect_magic': spell('spell.detect_magic', '마법 탐지', 'game-icons:magic-eye', 'utility', ['탐지', '의식']),
  'spell.entangle': spell('spell.entangle', '휘감기', 'game-icons:vines', 'nature', ['제어', '지형', '내성']),
  'spell.guiding_bolt': spell('spell.guiding_bolt', '인도하는 화살', 'game-icons:divine-sight', 'radiant', ['피해', '광휘', '이점']),
  'spell.healing_word': spell('spell.healing_word', '치유의 언어', 'game-icons:healing', 'healing', ['회복', '보너스 행동']),
  'spell.inflict_wounds': spell('spell.inflict_wounds', '상처 가하기', 'game-icons:bloody-stash', 'necrotic', ['피해', '근접', '사령']),
  'spell.magic_missile': spell('spell.magic_missile', '마법 화살', 'game-icons:magic-swirl', 'arcane', ['피해', '자동 명중']),
  'spell.shield': spell('spell.shield', '방패', 'game-icons:magic-shield', 'defense', ['방어', '반응']),
  'spell.sleep': spell('spell.sleep', '수면', 'game-icons:night-sleep', 'control', ['제어', '군중 제어']),
  'spell.thunderwave': spell('spell.thunderwave', '천둥파', 'game-icons:sonic-boom', 'thunder', ['피해', '밀치기', '천둥']),
  'spell.charm_person': spell('spell.charm_person', '인간형 매혹', 'game-icons:charm', 'control', ['매혹', '사회', '내성']),
  'spell.faerie_fire': spell('spell.faerie_fire', '요정의 불꽃', 'game-icons:fairy', 'utility', ['드러냄', '이점', '광원']),
  'spell.feather_fall': spell('spell.feather_fall', '깃털 낙하', 'game-icons:feather', 'mobility', ['방어', '낙하', '반응']),
  'spell.fog_cloud': spell('spell.fog_cloud', '안개 구름', 'game-icons:fog', 'control', ['시야 차단', '지형']),
  'spell.grease': spell('spell.grease', '기름칠', 'game-icons:oil-drum', 'control', ['지형', '넘어짐']),
  'spell.heroism': spell('spell.heroism', '영웅심', 'game-icons:muscle-up', 'defense', ['지원', '공포 면역', '임시 HP']),
  'spell.hunters_mark': spell('spell.hunters_mark', '사냥꾼의 표식', 'game-icons:targeted', 'nature', ['표식', '추가 피해']),
  'spell.longstrider': spell('spell.longstrider', '활보', 'game-icons:running-shoe', 'mobility', ['이동', '지원']),
  'spell.alarm': spell('spell.alarm', '경보', 'game-icons:ringing-alarm', 'utility', ['의식', '감시']),
  'spell.animal_friendship': spell('spell.animal_friendship', '동물 친화', 'game-icons:deer-head', 'nature', ['매혹', '동물']),
  'spell.armor_of_agathys': spell('spell.armor_of_agathys', '아가티스의 갑옷', 'game-icons:ice-shield', 'cold', ['방어', '임시 HP', '냉기']),
  'spell.color_spray': spell('spell.color_spray', '색채 분사', 'game-icons:prism', 'illusion', ['제어', '실명']),
  'spell.comprehend_languages': spell('spell.comprehend_languages', '언어 이해', 'game-icons:book-cover', 'utility', ['의식', '언어']),
  'spell.create_or_destroy_water': spell('spell.create_or_destroy_water', '물 생성·파괴', 'game-icons:water-drop', 'utility', ['물', '유틸']),
  'spell.expeditious_retreat': spell('spell.expeditious_retreat', '신속 후퇴', 'game-icons:sprint', 'mobility', ['이동', '보너스 행동']),
  'spell.false_life': spell('spell.false_life', '거짓 생명', 'game-icons:heart-plus', 'necrotic', ['임시 HP', '방어']),
  'spell.find_familiar': spell('spell.find_familiar', '사역마 찾기', 'game-icons:raven', 'utility', ['소환', '의식']),
  'spell.goodberry': spell('spell.goodberry', '굿베리', 'game-icons:berries-bowl', 'healing', ['회복', '식량']),
  'spell.jump': spell('spell.jump', '도약', 'game-icons:jump-across', 'mobility', ['이동', '도약']),
  'spell.mage_armor': spell('spell.mage_armor', '마법 갑옷', 'game-icons:armor-vest', 'defense', ['방어', 'AC']),

  'spell.hold_person': spell('spell.hold_person', '인간형 포박', 'game-icons:grab', 'control', ['마비', '내성']),
  'spell.misty_step': spell('spell.misty_step', '안개 걸음', 'game-icons:teleport', 'mobility', ['순간이동', '보너스 행동']),
  'spell.scorching_ray': spell('spell.scorching_ray', '작열 광선', 'game-icons:laser-gun', 'fire', ['피해', '다중 광선', '화염']),
  'spell.web': spell('spell.web', '거미줄', 'game-icons:spider-web', 'control', ['구속', '지형']),
  'spell.aid': spell('spell.aid', '원조', 'game-icons:three-friends', 'healing', ['최대 HP', '지원']),
  'spell.blindness_deafness': spell('spell.blindness_deafness', '실명·청각상실', 'game-icons:blindfold', 'control', ['상태', '내성']),
  'spell.darkness': spell('spell.darkness', '어둠', 'game-icons:dark-squad', 'control', ['시야 차단', '어둠']),
  'spell.invisibility': spell('spell.invisibility', '투명화', 'game-icons:invisible', 'illusion', ['은신', '유틸']),
  'spell.lesser_restoration': spell('spell.lesser_restoration', '하급 회복', 'game-icons:medical-pack', 'healing', ['상태 제거', '회복']),
  'spell.moonbeam': spell('spell.moonbeam', '달빛 광선', 'game-icons:moon', 'radiant', ['피해', '광휘', '지속']),
  'spell.spiritual_weapon': spell('spell.spiritual_weapon', '영체 무기', 'game-icons:spinning-sword', 'divine', ['공격', '보너스 행동']),
  'spell.alter_self': spell('spell.alter_self', '자기 변형', 'game-icons:shambling-mound', 'utility', ['변신', '유틸']),
  'spell.blur': spell('spell.blur', '흐릿함', 'game-icons:blurred-vision', 'illusion', ['방어', '환영']),
  'spell.darkvision': spell('spell.darkvision', '암시야', 'game-icons:night-vision', 'utility', ['시야', '지원']),
  'spell.enhance_ability': spell('spell.enhance_ability', '능력 강화', 'game-icons:upgrade', 'divine', ['지원', '능력치']),
  'spell.enlarge_reduce': spell('spell.enlarge_reduce', '확대·축소', 'game-icons:resize', 'control', ['크기', '제어']),
  'spell.flaming_sphere': spell('spell.flaming_sphere', '화염 구체', 'game-icons:burning-meteor', 'fire', ['피해', '화염', '지속']),
  'spell.gust_of_wind': spell('spell.gust_of_wind', '돌풍', 'game-icons:wind-slap', 'control', ['밀치기', '바람']),
  'spell.heat_metal': spell('spell.heat_metal', '금속 가열', 'game-icons:hot-surface', 'fire', ['피해', '금속', '화염']),
  'spell.levitate': spell('spell.levitate', '공중 부양', 'game-icons:levitate', 'mobility', ['이동', '제어']),
  'spell.locate_object': spell('spell.locate_object', '물체 탐지', 'game-icons:treasure-map', 'utility', ['탐지', '유틸']),
  'spell.mirror_image': spell('spell.mirror_image', '거울상', 'game-icons:mirror-mirror', 'illusion', ['방어', '환영']),
  'spell.spider_climb': spell('spell.spider_climb', '거미 등반', 'game-icons:sticky-boot', 'mobility', ['이동', '등반']),

  'spell.dispel_magic': spell('spell.dispel_magic', '마법 해제', 'game-icons:cancel', 'utility', ['해제', '마법']),
  'spell.fireball': spell('spell.fireball', '화염구', 'game-icons:fireball', 'fire', ['피해', '광역', '화염']),
  'spell.counterspell': spell('spell.counterspell', '주문 무효화', 'game-icons:counterspell', 'defense', ['반응', '해제']),
  'spell.fly': spell('spell.fly', '비행', 'game-icons:wingfoot', 'mobility', ['이동', '비행']),
  'spell.haste': spell('spell.haste', '가속', 'game-icons:fast-arrow', 'mobility', ['지원', '가속']),
  'spell.lightning_bolt': spell('spell.lightning_bolt', '번개 화살', 'game-icons:lightning-trio', 'lightning', ['피해', '광역', '번개']),
  'spell.revivify': spell('spell.revivify', '소생', 'game-icons:life-in-the-balance', 'healing', ['부활', '회복']),
  'spell.call_lightning': spell('spell.call_lightning', '번개 소환', 'game-icons:lightning-storm', 'lightning', ['피해', '지속', '번개']),
  'spell.fear': spell('spell.fear', '공포', 'game-icons:screaming', 'psychic', ['공포', '제어']),
  'spell.gaseous_form': spell('spell.gaseous_form', '기체 형태', 'game-icons:smoke-bomb', 'mobility', ['변신', '이동']),
  'spell.plant_growth': spell('spell.plant_growth', '식물 성장', 'game-icons:root-tip', 'nature', ['지형', '식물']),
  'spell.protection_from_energy': spell('spell.protection_from_energy', '에너지 보호', 'game-icons:energy-shield', 'defense', ['저항', '방어']),
  'spell.sleet_storm': spell('spell.sleet_storm', '진눈깨비 폭풍', 'game-icons:snowing', 'cold', ['지형', '냉기', '제어']),
  'spell.slow': spell('spell.slow', '둔화', 'game-icons:snail', 'control', ['약화', '시간']),
  'spell.water_walk': spell('spell.water_walk', '수면 보행', 'game-icons:walking-boot', 'mobility', ['이동', '물']),

  'spell.blight': spell('spell.blight', '황폐화', 'game-icons:dead-wood', 'necrotic', ['피해', '사령']),
  'spell.death_ward': spell('spell.death_ward', '죽음 방호', 'game-icons:death-zone', 'defense', ['방어', '죽음']),
  'spell.dimension_door': spell('spell.dimension_door', '차원문', 'game-icons:portal', 'mobility', ['순간이동', '장거리']),
  'spell.freedom_of_movement': spell('spell.freedom_of_movement', '이동의 자유', 'game-icons:freedom-dove', 'mobility', ['이동', '상태 방지']),
  'spell.ice_storm': spell('spell.ice_storm', '얼음 폭풍', 'game-icons:ice-spell-cast', 'cold', ['피해', '광역', '냉기']),
  'spell.locate_creature': spell('spell.locate_creature', '생물 탐지', 'game-icons:radar-sweep', 'utility', ['탐지', '추적']),
  'spell.phantasmal_killer': spell('spell.phantasmal_killer', '환영 살인자', 'game-icons:terror', 'psychic', ['공포', '정신', '피해']),
  'spell.wall_of_fire': spell('spell.wall_of_fire', '화염 장벽', 'game-icons:fire-wall', 'fire', ['지형', '화염', '피해']),
};

const generatedSpellPresentationOverrides: Record<string, SpellPresentation> = {
  'spell.acid_arrow': spell('spell.acid_arrow', 'Acid Arrow', 'game-icons:chemical-arrow', 'acid', ['주문', '피해']),
  'spell.animal_messenger': spell('spell.animal_messenger', 'Animal Messenger', 'game-icons:animal-hide', 'nature', ['주문', '자연']),
  'spell.animal_shapes': spell('spell.animal_shapes', 'Animal Shapes', 'game-icons:animal-skull', 'nature', ['주문', '자연']),
  'spell.animate_dead': spell('spell.animate_dead', 'Animate Dead', 'game-icons:dead-eye', 'necrotic', ['주문', '피해']),
  'spell.animate_objects': spell('spell.animate_objects', 'Animate Objects', 'game-icons:all-seeing-eye', 'utility', ['주문', '유틸']),
  'spell.antilife_shell': spell('spell.antilife_shell', 'Antilife Shell', 'game-icons:armoured-shell', 'defense', ['주문', '방어']),
  'spell.antimagic_field': spell('spell.antimagic_field', 'Antimagic Field', 'game-icons:bubble-field', 'utility', ['주문', '유틸']),
  'spell.antipathy_sympathy': spell('spell.antipathy_sympathy', 'Antipathy Sympathy', 'game-icons:andromeda-chain', 'control', ['주문', '제어']),
  'spell.arcane_eye': spell('spell.arcane_eye', 'Arcane Eye', 'game-icons:beast-eye', 'utility', ['주문', '유틸']),
  'spell.arcane_gate': spell('spell.arcane_gate', 'Arcane Gate', 'game-icons:dungeon-gate', 'mobility', ['주문', '이동']),
  'spell.arcane_hand': spell('spell.arcane_hand', 'Arcane Hand', 'game-icons:black-hand-shield', 'utility', ['주문', '유틸']),
  'spell.arcane_lock': spell('spell.arcane_lock', 'Arcane Lock', 'game-icons:key-lock', 'utility', ['주문', '유틸']),
  'spell.arcane_sword': spell('spell.arcane_sword', 'Arcane Sword', 'game-icons:rune-sword', 'utility', ['주문', '유틸']),
  'spell.arcanists_magic_aura': spell('spell.arcanists_magic_aura', 'Arcanists Magic Aura', 'game-icons:beams-aura', 'defense', ['주문', '방어']),
  'spell.astral_projection': spell('spell.astral_projection', 'Astral Projection', 'game-icons:arabic-door', 'mobility', ['주문', '이동']),
  'spell.augury': spell('spell.augury', 'Augury', 'game-icons:angel-wings', 'divine', ['주문', '신성']),
  'spell.aura_of_life': spell('spell.aura_of_life', 'Aura Of Life', 'game-icons:book-aura', 'healing', ['주문', '회복']),
  'spell.aura_of_purity': spell('spell.aura_of_purity', 'Aura Of Purity', 'game-icons:icicles-aura', 'defense', ['주문', '방어']),
  'spell.awaken': spell('spell.awaken', 'Awaken', 'game-icons:bird-cage', 'nature', ['주문', '자연']),
  'spell.banishment': spell('spell.banishment', 'Banishment', 'game-icons:box-trap', 'control', ['주문', '제어']),
  'spell.barkskin': spell('spell.barkskin', 'Barkskin', 'game-icons:abdominal-armor', 'defense', ['주문', '방어']),
  'spell.beacon_of_hope': spell('spell.beacon_of_hope', 'Beacon Of Hope', 'game-icons:bowl-of-rice', 'healing', ['주문', '회복']),
  'spell.beast_sense': spell('spell.beast_sense', 'Beast Sense', 'game-icons:flat-paw-print', 'nature', ['주문', '자연']),
  'spell.bestow_curse': spell('spell.bestow_curse', 'Bestow Curse', 'game-icons:cursed-star', 'control', ['주문', '제어']),
  'spell.black_tentacles': spell('spell.black_tentacles', 'Black Tentacles', 'game-icons:black-book', 'utility', ['주문', '유틸']),
  'spell.blade_barrier': spell('spell.blade_barrier', 'Blade Barrier', 'game-icons:barrier', 'utility', ['주문', '유틸']),
  'spell.blink': spell('spell.blink', 'Blink', 'game-icons:bleeding-eye', 'utility', ['주문', '유틸']),
  'spell.branding_smite': spell('spell.branding_smite', 'Branding Smite', 'game-icons:bolt-eye', 'utility', ['주문', '유틸']),
  'spell.calm_emotions': spell('spell.calm_emotions', 'Calm Emotions', 'game-icons:book-pile', 'utility', ['주문', '유틸']),
  'spell.chain_lightning': spell('spell.chain_lightning', 'Chain Lightning', 'game-icons:chain-lightning', 'lightning', ['주문', '피해']),
  'spell.circle_of_death': spell('spell.circle_of_death', 'Circle Of Death', 'game-icons:death-skull', 'necrotic', ['주문', '피해']),
  'spell.clairvoyance': spell('spell.clairvoyance', 'Clairvoyance', 'game-icons:book-storm', 'utility', ['주문', '유틸']),
  'spell.clone': spell('spell.clone', 'Clone', 'game-icons:boss-key', 'utility', ['주문', '유틸']),
  'spell.cloudkill': spell('spell.cloudkill', 'Cloudkill', 'game-icons:alien-skull', 'poison', ['주문', '피해']),
  'spell.commune': spell('spell.commune', 'Commune', 'game-icons:boomerang-cross', 'divine', ['주문', '신성']),
  'spell.commune_with_nature': spell('spell.commune_with_nature', 'Commune With Nature', 'game-icons:pouch-with-beads', 'nature', ['주문', '자연']),
  'spell.compulsion': spell('spell.compulsion', 'Compulsion', 'game-icons:breaking-chain', 'control', ['주문', '제어']),
  'spell.cone_of_cold': spell('spell.cone_of_cold', 'Cone Of Cold', 'game-icons:cold-heart', 'cold', ['주문', '피해']),
  'spell.confusion': spell('spell.confusion', 'Confusion', 'game-icons:cage', 'control', ['주문', '제어']),
  'spell.conjure_animals': spell('spell.conjure_animals', 'Conjure Animals', 'game-icons:plants-and-animals', 'nature', ['주문', '자연']),
  'spell.conjure_celestial': spell('spell.conjure_celestial', 'Conjure Celestial', 'game-icons:byzantin-temple', 'divine', ['주문', '신성']),
  'spell.conjure_elemental': spell('spell.conjure_elemental', 'Conjure Elemental', 'game-icons:brass-eye', 'utility', ['주문', '유틸']),
  'spell.conjure_fey': spell('spell.conjure_fey', 'Conjure Fey', 'game-icons:burning-book', 'utility', ['주문', '유틸']),
  'spell.conjure_minor_elementals': spell('spell.conjure_minor_elementals', 'Conjure Minor Elementals', 'game-icons:burning-eye', 'utility', ['주문', '유틸']),
  'spell.conjure_woodland_beings': spell('spell.conjure_woodland_beings', 'Conjure Woodland Beings', 'game-icons:car-key', 'utility', ['주문', '유틸']),
  'spell.contact_other_plane': spell('spell.contact_other_plane', 'Contact Other Plane', 'game-icons:plane-wing', 'mobility', ['주문', '이동']),
  'spell.contagion': spell('spell.contagion', 'Contagion', 'game-icons:broken-skull', 'poison', ['주문', '피해']),
  'spell.contingency': spell('spell.contingency', 'Contingency', 'game-icons:crystal-eye', 'utility', ['주문', '유틸']),
  'spell.continual_flame': spell('spell.continual_flame', 'Continual Flame', 'game-icons:candle-flame', 'fire', ['주문', '피해']),
  'spell.control_water': spell('spell.control_water', 'Control Water', 'game-icons:holy-water', 'utility', ['주문', '유틸']),
  'spell.control_weather': spell('spell.control_weather', 'Control Weather', 'game-icons:control-tower', 'utility', ['주문', '유틸']),
  'spell.create_food_and_water': spell('spell.create_food_and_water', 'Create Food And Water', 'game-icons:manual-water-pump', 'utility', ['주문', '유틸']),
  'spell.create_undead': spell('spell.create_undead', 'Create Undead', 'game-icons:skull-crossed-bones', 'necrotic', ['주문', '피해']),
  'spell.creation': spell('spell.creation', 'Creation', 'game-icons:cyber-eye', 'utility', ['주문', '유틸']),
  'spell.daylight': spell('spell.daylight', 'Daylight', 'game-icons:allied-star', 'radiant', ['주문', '피해']),
  'spell.delayed_blast_fireball': spell('spell.delayed_blast_fireball', 'Delayed Blast Fireball', 'game-icons:blast', 'fire', ['주문', '피해']),
  'spell.demiplane': spell('spell.demiplane', 'Demiplane', 'game-icons:bat-wing', 'mobility', ['주문', '이동']),
  'spell.detect_evil_and_good': spell('spell.detect_evil_and_good', 'Detect Evil And Good', 'game-icons:evil-hand', 'utility', ['주문', '유틸']),
  'spell.detect_poison_and_disease': spell('spell.detect_poison_and_disease', 'Detect Poison And Disease', 'game-icons:poison', 'poison', ['주문', '피해']),
  'spell.detect_thoughts': spell('spell.detect_thoughts', 'Detect Thoughts', 'game-icons:metal-detector', 'utility', ['주문', '유틸']),
  'spell.disguise_self': spell('spell.disguise_self', 'Disguise Self', 'game-icons:inner-self', 'illusion', ['주문', '환영']),
  'spell.disintegrate': spell('spell.disintegrate', 'Disintegrate', 'game-icons:disintegrate', 'utility', ['주문', '유틸']),
  'spell.dispel_evil_and_good': spell('spell.dispel_evil_and_good', 'Dispel Evil And Good', 'game-icons:evil-book', 'utility', ['주문', '유틸']),
  'spell.divination': spell('spell.divination', 'Divination', 'game-icons:egg-eye', 'utility', ['주문', '유틸']),
  'spell.divine_favor': spell('spell.divine_favor', 'Divine Favor', 'game-icons:water-diviner-stick', 'divine', ['주문', '신성']),
  'spell.divine_word': spell('spell.divine_word', 'Divine Word', 'game-icons:two-handed-sword', 'control', ['주문', '제어']),
  'spell.dominate_beast': spell('spell.dominate_beast', 'Dominate Beast', 'game-icons:paw', 'control', ['주문', '제어']),
  'spell.dominate_monster': spell('spell.dominate_monster', 'Dominate Monster', 'game-icons:fish-monster', 'control', ['주문', '제어']),
  'spell.dominate_person': spell('spell.dominate_person', 'Dominate Person', 'game-icons:person', 'control', ['주문', '제어']),
  'spell.dream': spell('spell.dream', 'Dream', 'game-icons:dream-catcher', 'psychic', ['주문', '피해']),
  'spell.druidcraft': spell('spell.druidcraft', 'Druidcraft', 'game-icons:bird-claw', 'nature', ['주문', '자연']),
  'spell.earthquake': spell('spell.earthquake', 'Earthquake', 'game-icons:earth-crack', 'utility', ['주문', '유틸']),
  'spell.enthrall': spell('spell.enthrall', 'Enthrall', 'game-icons:chain-mail', 'control', ['주문', '제어']),
  'spell.etherealness': spell('spell.etherealness', 'Etherealness', 'game-icons:boot-kick', 'mobility', ['주문', '이동']),
  'spell.eyebite': spell('spell.eyebite', 'Eyebite', 'game-icons:eye-of-horus', 'utility', ['주문', '유틸']),
  'spell.fabricate': spell('spell.fabricate', 'Fabricate', 'game-icons:eye-shield', 'utility', ['주문', '유틸']),
  'spell.faithful_hound': spell('spell.faithful_hound', 'Faithful Hound', 'game-icons:basset-hound-head', 'divine', ['주문', '신성']),
  'spell.feeblemind': spell('spell.feeblemind', 'Feeblemind', 'game-icons:brain', 'psychic', ['주문', '피해']),
  'spell.feign_death': spell('spell.feign_death', 'Feign Death', 'game-icons:death-juice', 'necrotic', ['주문', '피해']),
  'spell.find_steed': spell('spell.find_steed', 'Find Steed', 'game-icons:horse-head', 'utility', ['주문', '유틸']),
  'spell.find_the_path': spell('spell.find_the_path', 'Find The Path', 'game-icons:interstellar-path', 'mobility', ['주문', '이동']),
  'spell.find_traps': spell('spell.find_traps', 'Find Traps', 'game-icons:gift-trap', 'utility', ['주문', '유틸']),
  'spell.finger_of_death': spell('spell.finger_of_death', 'Finger Of Death', 'game-icons:death-note', 'necrotic', ['주문', '피해']),
  'spell.fire_shield': spell('spell.fire_shield', 'Fire Shield', 'game-icons:fire-shield', 'fire', ['주문', '피해']),
  'spell.fire_storm': spell('spell.fire_storm', 'Fire Storm', 'game-icons:alien-fire', 'fire', ['주문', '피해']),
  'spell.flame_blade': spell('spell.flame_blade', 'Flame Blade', 'game-icons:flame-claws', 'fire', ['주문', '피해']),
  'spell.flame_strike': spell('spell.flame_strike', 'Flame Strike', 'game-icons:flame-spin', 'fire', ['주문', '피해']),
  'spell.flesh_to_stone': spell('spell.flesh_to_stone', 'Flesh To Stone', 'game-icons:rune-stone', 'utility', ['주문', '유틸']),
  'spell.floating_disk': spell('spell.floating_disk', 'Floating Disk', 'game-icons:floating-crystal', 'utility', ['주문', '유틸']),
  'spell.forbiddance': spell('spell.forbiddance', 'Forbiddance', 'game-icons:eye-target', 'utility', ['주문', '유틸']),
  'spell.forcecage': spell('spell.forcecage', 'Forcecage', 'game-icons:falling-eye', 'utility', ['주문', '유틸']),
  'spell.foresight': spell('spell.foresight', 'Foresight', 'game-icons:acid-shield', 'defense', ['주문', '방어']),
  'spell.freezing_sphere': spell('spell.freezing_sphere', 'Freezing Sphere', 'game-icons:stone-sphere', 'cold', ['주문', '피해']),
  'spell.gate': spell('spell.gate', 'Gate', 'game-icons:gate', 'mobility', ['주문', '이동']),
  'spell.geas': spell('spell.geas', 'Geas', 'game-icons:circle-cage', 'control', ['주문', '제어']),
  'spell.gentle_repose': spell('spell.gentle_repose', 'Gentle Repose', 'game-icons:health-capsule', 'healing', ['주문', '회복']),
  'spell.giant_insect': spell('spell.giant_insect', 'Giant Insect', 'game-icons:insect-jaws', 'nature', ['주문', '자연']),
  'spell.glibness': spell('spell.glibness', 'Glibness', 'game-icons:hand', 'utility', ['주문', '유틸']),
  'spell.globe_of_invulnerability': spell('spell.globe_of_invulnerability', 'Globe Of Invulnerability', 'game-icons:hand-of-god', 'utility', ['주문', '유틸']),
  'spell.glyph_of_warding': spell('spell.glyph_of_warding', 'Glyph Of Warding', 'game-icons:chameleon-glyph', 'defense', ['주문', '방어']),
  'spell.greater_invisibility': spell('spell.greater_invisibility', 'Greater Invisibility', 'game-icons:android-mask', 'illusion', ['주문', '환영']),
  'spell.greater_restoration': spell('spell.greater_restoration', 'Greater Restoration', 'game-icons:health-decrease', 'healing', ['주문', '회복']),
  'spell.guardian_of_faith': spell('spell.guardian_of_faith', 'Guardian Of Faith', 'game-icons:crown-of-thorns', 'divine', ['주문', '신성']),
  'spell.guards_and_wards': spell('spell.guards_and_wards', 'Guards And Wards', 'game-icons:froe-and-mallet', 'defense', ['주문', '방어']),
  'spell.hallow': spell('spell.hallow', 'Hallow', 'game-icons:camargue-cross', 'divine', ['주문', '신성']),
  'spell.hallucinatory_terrain': spell('spell.hallucinatory_terrain', 'Hallucinatory Terrain', 'game-icons:architect-mask', 'illusion', ['주문', '환영']),
  'spell.harm': spell('spell.harm', 'Harm', 'game-icons:bone-gnawer', 'necrotic', ['주문', '피해']),
  'spell.heal': spell('spell.heal', 'Heal', 'game-icons:health-normal', 'healing', ['주문', '회복']),
  'spell.hellish_rebuke': spell('spell.hellish_rebuke', 'Hellish Rebuke', 'game-icons:hand-bag', 'utility', ['주문', '유틸']),
  'spell.heroes_feast': spell('spell.heroes_feast', 'Heroes Feast', 'game-icons:hot-meal', 'utility', ['주문', '유틸']),
  'spell.hideous_laughter': spell('spell.hideous_laughter', 'Hideous Laughter', 'game-icons:hand-bandage', 'utility', ['주문', '유틸']),
  'spell.hold_monster': spell('spell.hold_monster', 'Hold Monster', 'game-icons:monster-grasp', 'control', ['주문', '제어']),
  'spell.holy_aura': spell('spell.holy_aura', 'Holy Aura', 'game-icons:rear-aura', 'defense', ['주문', '방어']),
  'spell.hypnotic_pattern': spell('spell.hypnotic_pattern', 'Hypnotic Pattern', 'game-icons:gear-stick-pattern', 'control', ['주문', '제어']),
  'spell.identify': spell('spell.identify', 'Identify', 'game-icons:hand-grip', 'utility', ['주문', '유틸']),
  'spell.illusory_script': spell('spell.illusory_script', 'Illusory Script', 'game-icons:hand-ok', 'utility', ['주문', '유틸']),
  'spell.imprisonment': spell('spell.imprisonment', 'Imprisonment', 'game-icons:food-chain', 'control', ['주문', '제어']),
  'spell.incendiary_cloud': spell('spell.incendiary_cloud', 'Incendiary Cloud', 'game-icons:cloud-download', 'fire', ['주문', '피해']),
  'spell.insect_plague': spell('spell.insect_plague', 'Insect Plague', 'game-icons:plague-doctor-profile', 'nature', ['주문', '자연']),
  'spell.instant_summons': spell('spell.instant_summons', 'Instant Summons', 'game-icons:hand-saw', 'utility', ['주문', '유틸']),
  'spell.irresistible_dance': spell('spell.irresistible_dance', 'Irresistible Dance', 'game-icons:avoidance', 'utility', ['주문', '유틸']),
  'spell.knock': spell('spell.knock', 'Knock', 'game-icons:knocked-out-stars', 'utility', ['주문', '유틸']),
  'spell.legend_lore': spell('spell.legend_lore', 'Legend Lore', 'game-icons:hand-truck', 'utility', ['주문', '유틸']),
  'spell.locate_animals_or_plants': spell('spell.locate_animals_or_plants', 'Locate Animals Or Plants', 'game-icons:carnivorous-plant', 'nature', ['주문', '자연']),
  'spell.magic_circle': spell('spell.magic_circle', 'Magic Circle', 'game-icons:circle', 'utility', ['주문', '유틸']),
  'spell.magic_jar': spell('spell.magic_jar', 'Magic Jar', 'game-icons:magic-axe', 'utility', ['주문', '유틸']),
  'spell.magic_mouth': spell('spell.magic_mouth', 'Magic Mouth', 'game-icons:carnivore-mouth', 'utility', ['주문', '유틸']),
  'spell.magic_weapon': spell('spell.magic_weapon', 'Magic Weapon', 'game-icons:axe-sword', 'utility', ['주문', '유틸']),
  'spell.magnificent_mansion': spell('spell.magnificent_mansion', 'Magnificent Mansion', 'game-icons:bird-house', 'cold', ['주문', '피해']),
  'spell.major_image': spell('spell.major_image', 'Major Image', 'game-icons:ursa-major', 'illusion', ['주문', '환영']),
  'spell.mass_cure_wounds': spell('spell.mass_cure_wounds', 'Mass Cure Wounds', 'game-icons:fleshy-mass', 'healing', ['주문', '회복']),
  'spell.mass_heal': spell('spell.mass_heal', 'Mass Heal', 'game-icons:health-potion', 'healing', ['주문', '회복']),
  'spell.mass_healing_word': spell('spell.mass_healing_word', 'Mass Healing Word', 'game-icons:healing-shield', 'healing', ['주문', '회복']),
  'spell.mass_suggestion': spell('spell.mass_suggestion', 'Mass Suggestion', 'game-icons:infested-mass', 'control', ['주문', '제어']),
  'spell.maze': spell('spell.maze', 'Maze', 'game-icons:maze', 'control', ['주문', '제어']),
  'spell.meld_into_stone': spell('spell.meld_into_stone', 'Meld Into Stone', 'game-icons:curling-stone', 'utility', ['주문', '유틸']),
  'spell.meteor_swarm': spell('spell.meteor_swarm', 'Meteor Swarm', 'game-icons:fragmented-meteor', 'fire', ['주문', '피해']),
  'spell.mind_blank': spell('spell.mind_blank', 'Mind Blank', 'game-icons:hive-mind', 'defense', ['주문', '방어']),
  'spell.mirage_arcane': spell('spell.mirage_arcane', 'Mirage Arcane', 'game-icons:bat-mask', 'illusion', ['주문', '환영']),
  'spell.mislead': spell('spell.mislead', 'Mislead', 'game-icons:bird-mask', 'illusion', ['주문', '환영']),
  'spell.modify_memory': spell('spell.modify_memory', 'Modify Memory', 'game-icons:hand-wing', 'utility', ['주문', '유틸']),
  'spell.move_earth': spell('spell.move_earth', 'Move Earth', 'game-icons:earth-africa-europe', 'utility', ['주문', '유틸']),
  'spell.nondetection': spell('spell.nondetection', 'Nondetection', 'game-icons:heart-key', 'utility', ['주문', '유틸']),
  'spell.pass_without_trace': spell('spell.pass_without_trace', 'Pass Without Trace', 'game-icons:boarding-pass', 'utility', ['주문', '유틸']),
  'spell.passwall': spell('spell.passwall', 'Passwall', 'game-icons:key', 'utility', ['주문', '유틸']),
  'spell.phantom_steed': spell('spell.phantom_steed', 'Phantom Steed', 'game-icons:trojan-horse', 'utility', ['주문', '유틸']),
  'spell.planar_ally': spell('spell.planar_ally', 'Planar Ally', 'game-icons:ghost-ally', 'utility', ['주문', '유틸']),
  'spell.planar_binding': spell('spell.planar_binding', 'Planar Binding', 'game-icons:key-card', 'utility', ['주문', '유틸']),
  'spell.plane_shift': spell('spell.plane_shift', 'Plane Shift', 'game-icons:paper-plane', 'mobility', ['주문', '이동']),
  'spell.polymorph': spell('spell.polymorph', 'Polymorph', 'game-icons:magic-broom', 'utility', ['주문', '유틸']),
  'spell.power_word_kill': spell('spell.power_word_kill', 'Power Word Kill', 'game-icons:swords-power', 'control', ['주문', '제어']),
  'spell.power_word_stun': spell('spell.power_word_stun', 'Power Word Stun', 'game-icons:green-power', 'control', ['주문', '제어']),
  'spell.prayer_of_healing': spell('spell.prayer_of_healing', 'Prayer Of Healing', 'game-icons:gift-of-knowledge', 'healing', ['주문', '회복']),
  'spell.prestidigitation': spell('spell.prestidigitation', 'Prestidigitation', 'game-icons:magic-gate', 'utility', ['주문', '유틸']),
  'spell.prismatic_spray': spell('spell.prismatic_spray', 'Prismatic Spray', 'game-icons:spray', 'utility', ['주문', '유틸']),
  'spell.prismatic_wall': spell('spell.prismatic_wall', 'Prismatic Wall', 'game-icons:brick-wall', 'utility', ['주문', '유틸']),
  'spell.private_sanctum': spell('spell.private_sanctum', 'Private Sanctum', 'game-icons:private', 'utility', ['주문', '유틸']),
  'spell.programmed_illusion': spell('spell.programmed_illusion', 'Programmed Illusion', 'game-icons:bottled-shadow', 'illusion', ['주문', '환영']),
  'spell.project_image': spell('spell.project_image', 'Project Image', 'game-icons:film-projector', 'illusion', ['주문', '환영']),
  'spell.protection_from_evil_and_good': spell('spell.protection_from_evil_and_good', 'Protection From Evil And Good', 'game-icons:protection-glasses', 'defense', ['주문', '방어']),
  'spell.protection_from_poison': spell('spell.protection_from_poison', 'Protection From Poison', 'game-icons:poison-bottle', 'poison', ['주문', '피해']),
  'spell.purify_food_and_drink': spell('spell.purify_food_and_drink', 'Purify Food And Drink', 'game-icons:drink-me', 'utility', ['주문', '유틸']),
  'spell.raise_dead': spell('spell.raise_dead', 'Raise Dead', 'game-icons:dead-head', 'necrotic', ['주문', '피해']),
  'spell.ray_of_enfeeblement': spell('spell.ray_of_enfeeblement', 'Ray Of Enfeeblement', 'game-icons:manta-ray', 'psychic', ['주문', '피해']),
  'spell.regenerate': spell('spell.regenerate', 'Regenerate', 'game-icons:ball-heart', 'healing', ['주문', '회복']),
  'spell.reincarnate': spell('spell.reincarnate', 'Reincarnate', 'game-icons:magic-hat', 'utility', ['주문', '유틸']),
  'spell.remove_curse': spell('spell.remove_curse', 'Remove Curse', 'game-icons:gem-chain', 'control', ['주문', '제어']),
  'spell.resilient_sphere': spell('spell.resilient_sphere', 'Resilient Sphere', 'game-icons:holosphere', 'utility', ['주문', '유틸']),
  'spell.resurrection': spell('spell.resurrection', 'Resurrection', 'game-icons:conway-life-glider', 'healing', ['주문', '회복']),
  'spell.reverse_gravity': spell('spell.reverse_gravity', 'Reverse Gravity', 'game-icons:magic-lamp', 'utility', ['주문', '유틸']),
  'spell.rope_trick': spell('spell.rope_trick', 'Rope Trick', 'game-icons:jumping-rope', 'utility', ['주문', '유틸']),
  'spell.sanctuary': spell('spell.sanctuary', 'Sanctuary', 'game-icons:slumbering-sanctuary', 'defense', ['주문', '방어']),
  'spell.scrying': spell('spell.scrying', 'Scrying', 'game-icons:magic-portal', 'utility', ['주문', '유틸']),
  'spell.secret_chest': spell('spell.secret_chest', 'Secret Chest', 'game-icons:chest', 'utility', ['주문', '유틸']),
  'spell.see_invisibility': spell('spell.see_invisibility', 'See Invisibility', 'game-icons:apple-seeds', 'illusion', ['주문', '환영']),
  'spell.seeming': spell('spell.seeming', 'Seeming', 'game-icons:carnival-mask', 'illusion', ['주문', '환영']),
  'spell.sending': spell('spell.sending', 'Sending', 'game-icons:envelope', 'utility', ['주문', '유틸']),
  'spell.sequester': spell('spell.sequester', 'Sequester', 'game-icons:magic-potion', 'utility', ['주문', '유틸']),
  'spell.shapechange': spell('spell.shapechange', 'Shapechange', 'game-icons:magic-trident', 'utility', ['주문', '유틸']),
  'spell.shatter': spell('spell.shatter', 'Shatter', 'game-icons:shatter', 'thunder', ['주문', '피해']),
  'spell.shield_of_faith': spell('spell.shield_of_faith', 'Shield Of Faith', 'game-icons:american-shield', 'defense', ['주문', '방어']),
  'spell.shillelagh': spell('spell.shillelagh', 'Shillelagh', 'game-icons:bird-limb', 'nature', ['주문', '자연']),
  'spell.silence': spell('spell.silence', 'Silence', 'game-icons:silence', 'utility', ['주문', '유틸']),
  'spell.silent_image': spell('spell.silent_image', 'Silent Image', 'game-icons:ceremonial-mask', 'illusion', ['주문', '환영']),
  'spell.simulacrum': spell('spell.simulacrum', 'Simulacrum', 'game-icons:metal-hand', 'utility', ['주문', '유틸']),
  'spell.speak_with_animals': spell('spell.speak_with_animals', 'Speak With Animals', 'game-icons:skull-with-syringe', 'nature', ['주문', '자연']),
  'spell.speak_with_dead': spell('spell.speak_with_dead', 'Speak With Dead', 'game-icons:half-dead', 'necrotic', ['주문', '피해']),
  'spell.speak_with_plants': spell('spell.speak_with_plants', 'Speak With Plants', 'game-icons:bonsai-tree', 'nature', ['주문', '자연']),
  'spell.spike_growth': spell('spell.spike_growth', 'Spike Growth', 'game-icons:tree-growth', 'nature', ['주문', '자연']),
  'spell.spirit_guardians': spell('spell.spirit_guardians', 'Spirit Guardians', 'game-icons:spark-spirit', 'divine', ['주문', '신성']),
  'spell.stinking_cloud': spell('spell.stinking_cloud', 'Stinking Cloud', 'game-icons:poison-cloud', 'poison', ['주문', '피해']),
  'spell.stone_shape': spell('spell.stone_shape', 'Stone Shape', 'game-icons:dripping-stone', 'utility', ['주문', '유틸']),
  'spell.stoneskin': spell('spell.stoneskin', 'Stoneskin', 'game-icons:armor-blueprint', 'defense', ['주문', '방어']),
  'spell.storm_of_vengeance': spell('spell.storm_of_vengeance', 'Storm Of Vengeance', 'game-icons:master-of-arms', 'thunder', ['주문', '피해']),
  'spell.suggestion': spell('spell.suggestion', 'Suggestion', 'game-icons:grease-trap', 'control', ['주문', '제어']),
  'spell.sunbeam': spell('spell.sunbeam', 'Sunbeam', 'game-icons:aztec-calendar-sun', 'radiant', ['주문', '피해']),
  'spell.sunburst': spell('spell.sunburst', 'Sunburst', 'game-icons:barbed-star', 'radiant', ['주문', '피해']),
  'spell.symbol': spell('spell.symbol', 'Symbol', 'game-icons:griffin-symbol', 'utility', ['주문', '유틸']),
  'spell.telekinesis': spell('spell.telekinesis', 'Telekinesis', 'game-icons:millenium-key', 'utility', ['주문', '유틸']),
  'spell.telepathic_bond': spell('spell.telepathic_bond', 'Telepathic Bond', 'game-icons:james-bond-aperture', 'utility', ['주문', '유틸']),
  'spell.telepathy': spell('spell.telepathy', 'Telepathy', 'game-icons:telepathy', 'utility', ['주문', '유틸']),
  'spell.teleport': spell('spell.teleport', 'Teleport', 'game-icons:boot-prints', 'mobility', ['주문', '이동']),
  'spell.teleportation_circle': spell('spell.teleportation_circle', 'Teleportation Circle', 'game-icons:circle-claws', 'mobility', ['주문', '이동']),
  'spell.thaumaturgy': spell('spell.thaumaturgy', 'Thaumaturgy', 'game-icons:octogonal-eye', 'utility', ['주문', '유틸']),
  'spell.time_stop': spell('spell.time_stop', 'Time Stop', 'game-icons:backward-time', 'utility', ['주문', '유틸']),
  'spell.tiny_hut': spell('spell.tiny_hut', 'Tiny Hut', 'game-icons:hut', 'utility', ['주문', '유틸']),
  'spell.tongues': spell('spell.tongues', 'Tongues', 'game-icons:lizard-tongue', 'utility', ['주문', '유틸']),
  'spell.transport_via_plants': spell('spell.transport_via_plants', 'Transport Via Plants', 'game-icons:tree-door', 'mobility', ['주문', '이동']),
  'spell.tree_stride': spell('spell.tree_stride', 'Tree Stride', 'game-icons:tree-swing', 'mobility', ['주문', '이동']),
  'spell.true_polymorph': spell('spell.true_polymorph', 'True Polymorph', 'game-icons:open-book', 'utility', ['주문', '유틸']),
  'spell.true_resurrection': spell('spell.true_resurrection', 'True Resurrection', 'game-icons:life-bar', 'healing', ['주문', '회복']),
  'spell.true_seeing': spell('spell.true_seeing', 'True Seeing', 'game-icons:pendant-key', 'utility', ['주문', '유틸']),
  'spell.true_strike': spell('spell.true_strike', 'True Strike', 'game-icons:bowling-strike', 'utility', ['주문', '유틸']),
  'spell.tsunami': spell('spell.tsunami', 'Tsunami', 'game-icons:big-wave', 'radiant', ['주문', '피해']),
  'spell.unseen_servant': spell('spell.unseen_servant', 'Unseen Servant', 'game-icons:poker-hand', 'utility', ['주문', '유틸']),
  'spell.vampiric_touch': spell('spell.vampiric_touch', 'Vampiric Touch', 'game-icons:bone-knife', 'necrotic', ['주문', '피해']),
  'spell.vicious_mockery': spell('spell.vicious_mockery', 'Vicious Mockery', 'game-icons:jester-hat', 'utility', ['주문', '유틸']),
  'spell.wall_of_force': spell('spell.wall_of_force', 'Wall Of Force', 'game-icons:broken-wall', 'utility', ['주문', '유틸']),
  'spell.wall_of_ice': spell('spell.wall_of_ice', 'Wall Of Ice', 'game-icons:defensive-wall', 'cold', ['주문', '피해']),
  'spell.wall_of_stone': spell('spell.wall_of_stone', 'Wall Of Stone', 'game-icons:stone-wall', 'utility', ['주문', '유틸']),
  'spell.wall_of_thorns': spell('spell.wall_of_thorns', 'Wall Of Thorns', 'game-icons:spiked-wall', 'nature', ['주문', '자연']),
  'spell.warding_bond': spell('spell.warding_bond', 'Warding Bond', 'game-icons:armor-cuisses', 'defense', ['주문', '방어']),
  'spell.water_breathing': spell('spell.water_breathing', 'Water Breathing', 'game-icons:water-bolt', 'utility', ['주문', '유틸']),
  'spell.weird': spell('spell.weird', 'Weird', 'game-icons:brain-dump', 'psychic', ['주문', '피해']),
  'spell.wind_walk': spell('spell.wind_walk', 'Wind Walk', 'game-icons:wind-hole', 'thunder', ['주문', '피해']),
  'spell.wind_wall': spell('spell.wind_wall', 'Wind Wall', 'game-icons:wall-light', 'thunder', ['주문', '피해']),
  'spell.wish': spell('spell.wish', 'Wish', 'game-icons:robber-hand', 'utility', ['주문', '유틸']),
  'spell.word_of_recall': spell('spell.word_of_recall', 'Word Of Recall', 'game-icons:pick-of-destiny', 'control', ['주문', '제어']),
  'spell.zone_of_truth': spell('spell.zone_of_truth', 'Zone Of Truth', 'game-icons:broken-heart-zone', 'utility', ['주문', '유틸']),
};

export const spellPresentationOverrides: Record<string, SpellPresentation> = {
  ...curatedSpellPresentationOverrides,
  ...generatedSpellPresentationOverrides,
};

function spell(
  id: string,
  shortLabel: string,
  iconName: GameIconName,
  tone: SpellPresentationTone,
  tags: string[],
): SpellPresentation {
  return { id, shortLabel, iconName, tone, tags };
}

export function getSpellPresentation(spellId: string, label?: string): SpellPresentation {
  const normalizedId = normalizeSpellId(spellId);
  const override = spellPresentationOverrides[normalizedId];
  if (!override) return buildFallbackSpellPresentation(normalizedId, label);

  const displayLabel = cleanUserFacingSpellLabel(label);
  return displayLabel && hasKoreanSpellText(displayLabel)
    ? { ...override, shortLabel: displayLabel }
    : override;
}

export function getSpellIconName(spellId: string, label?: string): GameIconName {
  return getSpellPresentation(spellId, label).iconName;
}

export function getSpellTone(spellId: string, label?: string): SpellPresentationTone {
  return getSpellPresentation(spellId, label).tone;
}

export function hasSpellPresentationOverride(spellId: string): boolean {
  return normalizeSpellId(spellId) in spellPresentationOverrides;
}

function normalizeSpellId(spellId: string): string {
  const normalized = spellId.trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized) return 'spell.unknown';
  return normalized.startsWith('spell.') ? normalized : `spell.${normalized}`;
}

function buildFallbackSpellPresentation(spellId: string, label?: string): SpellPresentation {
  const haystack = `${spellId} ${label ?? ''}`.toLowerCase();
  if (/(fire|burn|flame|heat)/.test(haystack)) {
    return spell(spellId, fallbackLabel(spellId, label), 'game-icons:flame', 'fire', ['화염']);
  }
  if (/(ice|frost|cold|sleet|snow)/.test(haystack)) {
    return spell(spellId, fallbackLabel(spellId, label), 'game-icons:ice-bolt', 'cold', ['냉기']);
  }
  if (/(heal|cure|restoration|revivify|aid)/.test(haystack)) {
    return spell(spellId, fallbackLabel(spellId, label), 'game-icons:healing', 'healing', ['회복']);
  }
  if (/(shield|armor|ward|protection)/.test(haystack)) {
    return spell(spellId, fallbackLabel(spellId, label), 'game-icons:magic-shield', 'defense', ['방어']);
  }
  if (/(detect|locate|comprehend|message|alarm)/.test(haystack)) {
    return spell(spellId, fallbackLabel(spellId, label), 'game-icons:magic-eye', 'utility', ['유틸']);
  }
  if (/(misty|fly|jump|door|stride|walk|movement)/.test(haystack)) {
    return spell(spellId, fallbackLabel(spellId, label), 'game-icons:teleport', 'mobility', ['이동']);
  }
  return spell(spellId, fallbackLabel(spellId, label), 'game-icons:spell-book', 'arcane', ['주문']);
}

function fallbackLabel(spellId: string, label?: string): string {
  if (label) return label.split('/')[0]?.trim() || label;
  const raw = spellId.includes('.') ? spellId.slice(spellId.lastIndexOf('.') + 1) : spellId;
  return raw
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
