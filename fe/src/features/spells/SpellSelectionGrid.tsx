import { useMemo, useState } from 'react';
import { GameIcon } from '../../components/GameIcon';
import { getSpellPresentation } from './spellPresentation';
import './SpellSelectionGrid.css';

export type SpellSelectionGridOption = {
  id: string;
  label: string;
  level?: number | null;
  detail?: SpellSelectionGridDetail | null;
};

export type SpellSelectionGridDetail = {
  specs?: string[];
  summary?: string | null;
  higherLevel?: string | null;
  scaling?: string | null;
  tags?: string[];
};

type SpellSelectionGridProps = {
  title: string;
  helper?: string;
  options: SpellSelectionGridOption[];
  selectedIds: string[];
  maxSelected: number;
  disabled?: boolean;
  onChange: (selectedIds: string[]) => void;
};

const FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'damage', label: '피해' },
  { id: 'healing', label: '회복' },
  { id: 'defense', label: '방어' },
  { id: 'control', label: '제어' },
  { id: 'mobility', label: '이동' },
  { id: 'utility', label: '유틸' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

export function SpellSelectionGrid({
  title,
  helper,
  options,
  selectedIds,
  maxSelected,
  disabled = false,
  onChange,
}: SpellSelectionGridProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const normalizedQuery = query.trim().toLowerCase();
  const selectedCount = selectedIds.length;
  const isComplete = selectedCount === maxSelected;

  const visibleOptions = useMemo(
    () =>
      options.filter((option) => {
        const presentation = getSpellPresentation(option.id, option.label);
        const searchable = `${option.id} ${option.label} ${presentation.shortLabel} ${presentation.tags.join(' ')}`.toLowerCase();
        if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
        if (filter === 'all') return true;
        if (filter === 'damage') {
          return ['fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant', 'psychic', 'arcane'].includes(
            presentation.tone,
          ) && presentation.tags.some((tag) => ['피해', '광역', '원거리', '근접'].includes(tag));
        }
        return presentation.tone === filter || presentation.tags.includes(FILTER_LABELS[filter]);
      }),
    [filter, normalizedQuery, options],
  );

  function toggleSpell(spellId: string) {
    if (disabled) return;
    if (selectedSet.has(spellId)) {
      onChange(selectedIds.filter((id) => id !== spellId));
      return;
    }
    if (selectedIds.length >= maxSelected) return;
    onChange([...selectedIds, spellId]);
  }

  return (
    <section className="spell-selection-grid" aria-label={title}>
      <div className="spell-selection-grid-head">
        <div>
          <h3>{title}</h3>
          {helper ? <p>{helper}</p> : null}
        </div>
        <strong
          className={`spell-selection-count${isComplete ? ' is-complete' : ''}`}
          aria-live="polite"
        >
          {selectedCount} / {maxSelected}
        </strong>
      </div>

      <div className="spell-selection-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="주문 검색"
          aria-label={`${title} 검색`}
        />
        <div className="spell-selection-filter-list" aria-label={`${title} 필터`}>
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? 'active' : ''}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="spell-selection-card-grid">
        {visibleOptions.map((option) => {
          const presentation = getSpellPresentation(option.id, option.label);
          const selected = selectedSet.has(option.id);
          const locked = !selected && selectedCount >= maxSelected;
          const tooltipId = `${title.replace(/\s+/g, '-')}-${option.id.replace(/[^a-z0-9_-]/gi, '-')}-tooltip`;
          const detailSpecs = option.detail?.specs?.filter(Boolean) ?? [];
          const detailTags = option.detail?.tags?.filter(Boolean).slice(0, 8) ?? [];
          const hasDetail = Boolean(
            detailSpecs.length ||
              option.detail?.summary ||
              option.detail?.higherLevel ||
              option.detail?.scaling ||
              detailTags.length,
          );
          return (
            <button
              key={option.id}
              type="button"
              className={[
                'spell-selection-card',
                `tone-${presentation.tone}`,
                selected ? 'is-selected' : '',
                locked ? 'is-disabled' : '',
              ].filter(Boolean).join(' ')}
              aria-pressed={selected}
              aria-describedby={hasDetail ? tooltipId : undefined}
              disabled={disabled || locked}
              onClick={() => toggleSpell(option.id)}
            >
              <span className="spell-selection-card-icon">
                <GameIcon name={presentation.iconName} size={26} title={presentation.shortLabel} />
              </span>
              <span className="spell-selection-card-body">
                <span className="spell-selection-card-title">{presentation.shortLabel}</span>
                <span className="spell-selection-card-subtitle">{option.label}</span>
              </span>
              {typeof option.level === 'number' ? (
                <span className="spell-selection-card-level">
                  {option.level === 0 ? 'C' : option.level}
                </span>
              ) : null}
              {selected ? <span className="spell-selection-card-check">✓</span> : null}
              {hasDetail ? (
                <span id={tooltipId} className="spell-selection-card-tooltip" role="tooltip">
                  <span className="spell-selection-tooltip-title">{presentation.shortLabel}</span>
                  {detailSpecs.length ? (
                    <span className="spell-selection-tooltip-specs">
                      {detailSpecs.map((spec) => (
                        <span key={spec}>{spec}</span>
                      ))}
                    </span>
                  ) : null}
                  {option.detail?.summary ? (
                    <span className="spell-selection-tooltip-summary">{option.detail.summary}</span>
                  ) : null}
                  {option.detail?.higherLevel ? (
                    <span className="spell-selection-tooltip-note">
                      <strong>고레벨:</strong> {option.detail.higherLevel}
                    </span>
                  ) : null}
                  {option.detail?.scaling ? (
                    <span className="spell-selection-tooltip-note">
                      <strong>성장:</strong> {option.detail.scaling}
                    </span>
                  ) : null}
                  {detailTags.length ? (
                    <span className="spell-selection-tooltip-tags" aria-label="주문 태그">
                      {detailTags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {!visibleOptions.length ? (
        <p className="spell-selection-empty">조건에 맞는 주문이 없습니다.</p>
      ) : null}
    </section>
  );
}

const FILTER_LABELS: Record<Exclude<FilterId, 'all' | 'damage'>, string> = {
  healing: '회복',
  defense: '방어',
  control: '제어',
  mobility: '이동',
  utility: '유틸',
};
