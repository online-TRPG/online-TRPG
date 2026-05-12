import defaultArcherImage from '../../../assets/images/Profile_Default_Archer.webp';
import defaultRogueImage from '../../../assets/images/Profile_Default_Rouge.webp';
import defaultWarriorImage from '../../../assets/images/Profile_Default_Warrior.webp';
import defaultWizardImage from '../../../assets/images/Profile_Default_Wizard.webp';
import { getClassLabel } from '../../../services/staticSrd';

interface CharacterVisualSource {
  avatarPresetId?: string | null;
  avatarUrl?: string | null;
  className: string;
}

const avatarPresetImageMap = new Map([
  ['preset_wizard', defaultWizardImage],
  ['preset_archer', defaultArcherImage],
  ['preset_rogue', defaultRogueImage],
  ['preset_warrior', defaultWarriorImage],
]);

function getCharacterArt(className: string) {
  const normalized = className.toLowerCase();
  if (
    normalized.includes('wizard') ||
    normalized.includes('mage') ||
    normalized.includes('sorcer')
  ) {
    return defaultWizardImage;
  }
  if (
    normalized.includes('archer') ||
    normalized.includes('ranger') ||
    normalized.includes('bow')
  ) {
    return defaultArcherImage;
  }
  if (
    normalized.includes('rogue') ||
    normalized.includes('rouge') ||
    normalized.includes('thief')
  ) {
    return defaultRogueImage;
  }
  if (
    normalized.includes('fighter') ||
    normalized.includes('warrior') ||
    normalized.includes('knight')
  ) {
    return defaultWarriorImage;
  }
  return defaultWizardImage;
}

// 캐릭터 이미지는 기존 세션 하단 카드와 같은 우선순위를 써야 화면마다 초상화가 달라지지 않습니다.
export function getCharacterImage(character: CharacterVisualSource) {
  if (character.avatarUrl) return character.avatarUrl;
  if (character.avatarPresetId) {
    return avatarPresetImageMap.get(character.avatarPresetId) ?? getCharacterArt(character.className);
  }
  return getCharacterArt(character.className);
}

export function getCharacterClassLabel(className: string) {
  return getClassLabel(className);
}
