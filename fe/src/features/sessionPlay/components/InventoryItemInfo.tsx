import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { InventoryItemDto } from '@trpg/shared-types';
import './InventoryItemInfo.css';

type InventoryItemInfoProps = {
  item: InventoryItemDto;
  tabIndex?: number;
};

const tooltipWidth = 300;
const tooltipMargin = 12;
const internalPropertyIds = new Set(['srd-engine']);

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function getItemTypeLabel(itemType: string | undefined) {
  const normalized = itemType?.trim().toLowerCase();
  if (!normalized) return '미분류';
  if (normalized === 'weapon') return '무기';
  if (normalized === 'armor') return '방어구';
  if (normalized === 'shield') return '방패';
  if (normalized === 'pack') return '꾸러미';
  if (normalized === 'consumable') return '소모품';
  if (normalized === 'tool') return '도구';
  if (normalized === 'currency') return '화폐';
  return itemType ?? '미분류';
}

function getPropertyLabel(property: string) {
  const normalized = property.trim().toLowerCase();
  const propertyLabels: Record<string, string> = {
    ammunition: '탄약',
    finesse: '기교',
    heavy: '중량',
    light: '경량',
    loading: '장전',
    melee: '근접',
    range: '원거리',
    ranged: '원거리',
    reach: '간격',
    special: '특수',
    thrown: '투척',
    'two-handed': '양손',
    versatile: '다용도',
  };
  return propertyLabels[normalized] ?? property;
}

function getDisplayProperties(item: InventoryItemDto) {
  return (item.properties ?? []).filter(
    (property) => !internalPropertyIds.has(property.trim().toLowerCase())
  );
}

function getInventoryItemKey(item: InventoryItemDto) {
  return [item.itemType, item.name, ...(item.properties ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getItemDescription(item: InventoryItemDto) {
  if (item.description?.trim()) {
    return item.description.trim();
  }

  const key = getInventoryItemKey(item);
  const propertyLabels = getDisplayProperties(item).map(getPropertyLabel);

  if (key.includes('potion') || key.includes('healing') || key.includes('포션')) {
    return '마시거나 사용해서 회복 또는 특수 효과를 얻는 소모품입니다.';
  }

  if (item.itemType === 'weapon' || item.damageDice) {
    const damage = item.damageDice
      ? `${item.damageDice}${item.damageType ? ` ${item.damageType}` : ''} 피해`
      : '무기 피해';
    const properties = propertyLabels.length ? ` ${propertyLabels.join(', ')} 속성을 가집니다.` : '';
    return `공격에 사용하는 무기입니다. 명중 시 ${damage}를 줍니다.${properties}`;
  }

  if (item.itemType === 'armor' || key.includes('armor') || key.includes('갑옷')) {
    return '착용자의 방어도를 높이는 방어구입니다.';
  }

  if (item.itemType === 'shield' || key.includes('shield') || key.includes('방패')) {
    return '한 손에 들어 방어에 사용하는 장비입니다.';
  }

  if (item.itemType === 'pack' || key.includes('pack') || key.includes('꾸러미')) {
    return '탐험에 필요한 여러 소모품과 도구가 들어 있는 장비 꾸러미입니다.';
  }

  if (item.itemType === 'tool' || key.includes('tool') || key.includes('kit') || key.includes('도구')) {
    return '특정 작업이나 판정에 활용할 수 있는 도구입니다.';
  }

  if (key.includes('scroll') || key.includes('spell') || key.includes('두루마리')) {
    return '마법 효과나 주문과 관련된 기록물입니다.';
  }

  if (key.includes('key') || key.includes('열쇠')) {
    return '잠긴 문이나 장치를 여는 데 사용할 수 있는 열쇠입니다.';
  }

  if (key.includes('coin') || key.includes('gold') || key.includes('금화')) {
    return '거래와 보상에 사용하는 화폐입니다.';
  }

  return '세션 중 보유하고 사용할 수 있는 아이템입니다.';
}

export function getInventoryMetaLabel(item: InventoryItemDto) {
  const displayProperties = getDisplayProperties(item);
  const labels = [
    getItemTypeLabel(item.itemType),
    item.damageDice ? `${item.damageDice}${item.damageType ? ` ${item.damageType}` : ''}` : null,
    item.weightLb !== undefined ? `${formatNumber(item.weightLb)} lb` : null,
    displayProperties.length ? displayProperties.map(getPropertyLabel).join(', ') : null,
  ].filter(Boolean);

  return labels.length ? labels.join(' / ') : '상세 정보 없음';
}

function getInventoryInfoRows(item: InventoryItemDto) {
  const displayProperties = getDisplayProperties(item);
  return [
    { label: '설명', value: getItemDescription(item) },
    { label: '분류', value: getItemTypeLabel(item.itemType) },
    { label: '수량', value: `x${item.quantity}` },
    item.damageDice
      ? {
          label: '피해',
          value: `${item.damageDice}${item.damageType ? ` ${item.damageType}` : ''}`,
        }
      : null,
    item.armorClassBase !== undefined || item.armorClassBonus !== undefined
      ? {
          label: '장착 AC',
          value: [
            item.armorClassBase !== undefined ? `기본 ${item.armorClassBase}` : null,
            item.armorClassBonus !== undefined && item.armorClassBonus !== 0
              ? `+${item.armorClassBonus}`
              : null,
          ]
            .filter(Boolean)
            .join(' ') || '정보 없음',
        }
      : null,
    item.armorStrengthRequirement !== undefined
      ? { label: '필요 근력', value: String(item.armorStrengthRequirement) }
      : null,
    item.armorStealthDisadvantage !== undefined
      ? { label: '은신', value: item.armorStealthDisadvantage ? '불리점' : '불리점 없음' }
      : null,
    item.useEffect ? { label: '사용 효과', value: item.useEffect } : null,
    item.packContents?.length
      ? {
          label: '내용물',
          value: item.packContents
            .map((content) => `${content.name} x${content.quantity}`)
            .join(', '),
        }
      : null,
    item.weightLb !== undefined ? { label: '무게', value: `${formatNumber(item.weightLb)} lb` } : null,
    item.volumeCuFt !== undefined
      ? { label: '부피', value: `${formatNumber(item.volumeCuFt)} cu ft` }
      : null,
    displayProperties.length
      ? { label: '속성', value: displayProperties.map(getPropertyLabel).join(', ') }
      : null,
  ].filter((row): row is { label: string; value: string } => Boolean(row));
}

export function InventoryItemInfo({ item, tabIndex = 0 }: InventoryItemInfoProps) {
  const rows = getInventoryInfoRows(item);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [isTooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number;
    top: number;
    placement: 'above' | 'below';
  }>({ left: tooltipMargin, top: tooltipMargin, placement: 'above' });

  const updateTooltipPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const tooltipHeight = tooltipRef.current?.offsetHeight ?? 220;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const left = Math.max(
      tooltipMargin,
      Math.min(rect.left, viewportWidth - tooltipWidth - tooltipMargin)
    );
    const spaceAbove = rect.top - tooltipMargin;
    const spaceBelow = viewportHeight - rect.bottom - tooltipMargin;
    const placement = spaceAbove >= tooltipHeight + 8 || spaceAbove > spaceBelow ? 'above' : 'below';
    setTooltipPosition({
      left,
      top:
        placement === 'above'
          ? Math.max(tooltipMargin, rect.top - tooltipHeight - 8)
          : Math.max(
              tooltipMargin,
              Math.min(rect.bottom + 8, viewportHeight - tooltipHeight - tooltipMargin)
            ),
      placement,
    });
  }, []);

  const showTooltip = useCallback(() => {
    updateTooltipPosition();
    setTooltipVisible(true);
  }, [updateTooltipPosition]);

  useEffect(() => {
    if (!isTooltipVisible) return undefined;

    updateTooltipPosition();
    window.addEventListener('resize', updateTooltipPosition);
    window.addEventListener('scroll', updateTooltipPosition, true);
    return () => {
      window.removeEventListener('resize', updateTooltipPosition);
      window.removeEventListener('scroll', updateTooltipPosition, true);
    };
  }, [isTooltipVisible, updateTooltipPosition]);

  useLayoutEffect(() => {
    if (!isTooltipVisible) return;
    updateTooltipPosition();
  }, [isTooltipVisible, rows.length, updateTooltipPosition]);

  const tooltipStyle = {
    left: tooltipPosition.left,
    top: tooltipPosition.top,
  } satisfies CSSProperties;

  return (
    <span
      ref={triggerRef}
      className="inventory-item-info"
      tabIndex={tabIndex}
      onMouseEnter={showTooltip}
      onMouseLeave={() => setTooltipVisible(false)}
      onFocus={showTooltip}
      onBlur={() => setTooltipVisible(false)}
    >
      <span className="inventory-item-info-name">{item.name}</span>
      {isTooltipVisible
        ? createPortal(
            <span
              ref={tooltipRef}
              className={`inventory-item-info-tooltip ${tooltipPosition.placement}`}
              role="tooltip"
              style={tooltipStyle}
            >
              <b>{item.name}</b>
              <dl>
                {rows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
