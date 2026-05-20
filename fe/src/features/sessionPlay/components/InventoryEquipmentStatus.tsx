import type { InventoryItemDto } from '@trpg/shared-types';
import { GameIcon } from '../../../components/GameIcon';
import type { GameIconName } from '../../../components/GameIcon';
import './InventoryEquipmentStatus.css';

interface InventoryEquipmentStatusProps {
  inventory: InventoryItemDto[];
  equippedWeaponId?: string | null;
  offhandWeaponId?: string | null;
}

function getItemSearchKey(item: InventoryItemDto) {
  return [item.id, item.itemDefinitionId, item.name, item.itemType, ...(item.properties ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isEquippedItem(item: InventoryItemDto, equippedWeaponId: string | null | undefined) {
  return item.id === equippedWeaponId || item.itemDefinitionId === equippedWeaponId;
}

function isShieldItem(item: InventoryItemDto) {
  const key = getItemSearchKey(item);
  return item.itemType === 'shield' || key.includes('shield') || key.includes('방패');
}

function isArmorItem(item: InventoryItemDto) {
  if (isShieldItem(item)) return false;
  const key = getItemSearchKey(item);
  return item.itemType === 'armor' || key.includes('armor-') || key.includes('갑옷');
}

function isTwoHandedItem(item: InventoryItemDto | null) {
  if (!item) return false;
  const normalizedProperties = (item.properties ?? []).map((property) =>
    property.trim().toLowerCase().replace(/[_\s]+/g, '-')
  );
  const key = getItemSearchKey(item).replace(/_/g, '-');

  return normalizedProperties.includes('two-handed') || key.includes('two-handed');
}

function EquipmentSlot({
  label,
  value,
  iconName,
  iconClassName,
}: {
  label: string;
  value: string;
  iconName: GameIconName;
  iconClassName?: string;
}) {
  return (
    <div className="inventory-equipment-status-slot">
      <span className="inventory-equipment-status-icon" aria-hidden="true">
        <GameIcon name={iconName} size={20} className={iconClassName} />
      </span>
      <div className="inventory-equipment-status-copy">
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    </div>
  );
}

export function InventoryEquipmentStatus({
  inventory,
  equippedWeaponId,
  offhandWeaponId,
}: InventoryEquipmentStatusProps) {
  // 캐릭터 상세 모달의 장착 판정과 같은 기준으로, 현재 보이는 인벤토리 패널에도 같은 장착 상태를 노출합니다.
  const rightHandItem =
    inventory.find((item) => isEquippedItem(item, equippedWeaponId)) ?? null;
  const leftHandItem =
    inventory.find((item) => isEquippedItem(item, offhandWeaponId)) ?? null;
  const bodyItem = inventory.find((item) => isArmorItem(item)) ?? null;
  const leftHandLabel = isTwoHandedItem(rightHandItem)
    ? '양손 점유'
    : leftHandItem?.name ?? '비어 있음';

  return (
    <section className="inventory-equipment-status" aria-label="장착 상태">
      <span className="inventory-equipment-status-title">장착 상태</span>
      <dl className="inventory-equipment-status-grid">
        <EquipmentSlot
          label="오른손"
          value={rightHandItem?.name ?? '비어 있음'}
          iconName="game-icons:mailed-fist"
        />
        <EquipmentSlot
          label="왼손"
          value={leftHandLabel}
          iconName="game-icons:mailed-fist"
          iconClassName="inventory-equipment-status-icon-left"
        />
        <EquipmentSlot
          label="몸통"
          value={bodyItem?.name ?? '비어 있음'}
          iconName="game-icons:armor-vest"
        />
      </dl>
    </section>
  );
}
