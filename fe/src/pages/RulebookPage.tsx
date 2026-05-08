import { createElement, Fragment, useEffect, useMemo, useState } from 'react';
import type {
  RulebookDocumentResponseDto,
  RulebookIndexResponseDto,
} from '@trpg/shared-types';
import dndLogo from '../assets/images/DnD5e_Logo.webp';
import './RulebookPage.css';

interface RulebookPageProps {
  ruleSetId?: string;
}

type StaticRulebookCollection = Omit<RulebookIndexResponseDto, 'documents'> & {
  documents: RulebookDocumentResponseDto[];
};

type StaticRulebookExport = {
  version: number;
  rulebooks: StaticRulebookCollection[];
};

type RulebookPane = 'translated' | 'original' | 'copyright';

type HeadingEntry = {
  id: string;
  level: number;
  text: string;
};

type TocNode = HeadingEntry & {
  children: TocNode[];
  depth: number;
};

type MarkdownBlock =
  | { type: 'heading'; id: string; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'hr' };

function slugifyHeading(text: string, duplicates: Map<string, number>) {
  const base =
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  const count = duplicates.get(base) ?? 0;
  duplicates.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function isTableSeparator(line: string) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*(?:\s*:?-{3,}:?\s*)?\|?\s*$/.test(line);
}

function splitTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isStructuralLine(line: string, nextLine?: string) {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^---+$/.test(line.trim()) ||
    Boolean(nextLine && line.includes('|') && isTableSeparator(nextLine))
  );
}

function parseMarkdown(markdown: string): { blocks: MarkdownBlock[]; headings: HeadingEntry[] } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  const headings: HeadingEntry[] = [];
  const duplicates = new Map<string, number>();

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      const text = headingMatch[2].trim();
      const level = headingMatch[1].length;
      const id = slugifyHeading(text, duplicates);
      const heading = { id, level, text };
      headings.push(heading);
      blocks.push({ type: 'heading', ...heading });
      index += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const language = trimmed.slice(3).trim();
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      continue;
    }

    if (trimmed.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const rows = [splitTableRow(line)];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, '').trim());
        index += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, '').trim());
        index += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index];
      const nextTrimmed = nextLine.trim();
      if (!nextTrimmed || isStructuralLine(nextTrimmed, lines[index + 1]?.trim())) {
        break;
      }
      paragraphLines.push(nextTrimmed);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
  }

  return { blocks, headings };
}

function renderInline(text: string) {
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const segments = text.split(tokenPattern).filter(Boolean);

  return segments.map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return <code key={`${segment}-${index}`}>{segment.slice(1, -1)}</code>;
    }

    if (segment.startsWith('**') && segment.endsWith('**')) {
      return <strong key={`${segment}-${index}`}>{segment.slice(2, -2)}</strong>;
    }

    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(segment);
    if (linkMatch) {
      return (
        <a
          key={`${segment}-${index}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return <Fragment key={`${segment}-${index}`}>{segment}</Fragment>;
  });
}

function renderHeading(level: number, id: string, text: string, key: string) {
  const safeLevel = Math.min(Math.max(level, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6;
  return createElement(`h${safeLevel}`, { key, id }, text);
}

function getRulebookAssetUrl(ruleSetId: string) {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBaseUrl}rulebooks/${ruleSetId}.json`;
}

function buildTocTree(headings: HeadingEntry[]): TocNode[] {
  const relevantHeadings = headings.some((heading) => heading.level > 1)
    ? headings.filter((heading) => heading.level > 1)
    : headings;
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];

  relevantHeadings.forEach((heading) => {
    while (stack.length && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1] ?? null;
    const node: TocNode = {
      ...heading,
      children: [],
      depth: parent ? parent.depth + 1 : 0,
    };

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    stack.push(node);
  });

  return roots;
}

function collectDefaultExpandedIds(nodes: TocNode[]): string[] {
  const expandedIds: string[] = [];

  const visit = (node: TocNode) => {
    if (node.children.length > 0 && node.depth < 2) {
      expandedIds.push(node.id);
    }
    node.children.forEach(visit);
  };

  nodes.forEach(visit);
  return expandedIds;
}

function RulebookTabIcon({ mode }: { mode: RulebookPane }) {
  if (mode === 'translated') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v16.5a.5.5 0 0 1-.8.4c-.8-.6-1.7-.9-2.7-.9H7.5A2.5 2.5 0 0 0 5 20.5V4.5Z"
          fill="currentColor"
          opacity=".92"
        />
        <path d="M8 7h8M8 10h6M8 13h7" stroke="#f8edd9" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (mode === 'original') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M4.5 5.5A2.5 2.5 0 0 1 7 3h10a2 2 0 0 1 2 2v13.2l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4V5.5Z"
          fill="currentColor"
          opacity=".92"
        />
        <path d="M8 8h7M8 11h8M8 14h5" stroke="#f8edd9" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.8 4.5 6v5.2c0 5 3 9.4 7.5 11 4.5-1.6 7.5-6 7.5-11V6L12 2.8Z"
        fill="currentColor"
        opacity=".92"
      />
      <path d="M9.2 12.1 11 14l3.8-4" stroke="#f8edd9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RulebookSpinner() {
  return (
    <div className="rulebook-page__loading">
      <div className="rulebook-page__spinner" aria-hidden="true" />
      <p>정보를 불러오는 중입니다</p>
    </div>
  );
}

export function RulebookPage({ ruleSetId = 'dnd5e' }: RulebookPageProps) {
  const [rulebook, setRulebook] = useState<StaticRulebookCollection | null>(null);
  const [activeDocumentSlug, setActiveDocumentSlug] = useState<string | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTocIds, setExpandedTocIds] = useState<string[]>([]);
  const [activePane, setActivePane] = useState<RulebookPane>('translated');

  useEffect(() => {
    let cancelled = false;
    setLoadingIndex(true);
    setError(null);
    setRulebook(null);
    setActiveDocumentSlug(null);

    fetch(getRulebookAssetUrl(ruleSetId))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`룰북 데이터를 불러오지 못했습니다. (${response.status})`);
        }

        return (await response.json()) as StaticRulebookExport;
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        const nextRulebook = payload.rulebooks.find((entry) => entry.ruleSetId === ruleSetId);
        if (!nextRulebook) {
          throw new Error(`룰셋 "${ruleSetId}"에 해당하는 룰북을 찾을 수 없습니다.`);
        }

        setRulebook(nextRulebook);
        setActivePane('translated');
        setActiveDocumentSlug(nextRulebook.defaultDocumentSlug);
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }
        setError(caught instanceof Error ? caught.message : '룰북 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingIndex(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ruleSetId]);

  useEffect(() => {
    if (!rulebook) {
      return;
    }

    const slugByPane: Record<RulebookPane, string> = {
      translated: 'rulebook',
      original: 'original',
      copyright: 'copyright',
    };

    const nextSlug = slugByPane[activePane];
    const exists = rulebook.documents.some((document) => document.slug === nextSlug);
    setActiveDocumentSlug(exists ? nextSlug : rulebook.defaultDocumentSlug);
  }, [activePane, rulebook]);

  const activeDocument = useMemo(
    () => rulebook?.documents.find((document) => document.slug === activeDocumentSlug) ?? null,
    [activeDocumentSlug, rulebook],
  );

  const parsedDocument = useMemo(
    () => parseMarkdown(activeDocument?.content ?? ''),
    [activeDocument?.content],
  );
  const tocTree = useMemo(() => buildTocTree(parsedDocument.headings), [parsedDocument.headings]);

  useEffect(() => {
    setExpandedTocIds(collectDefaultExpandedIds(tocTree));
  }, [tocTree, activeDocumentSlug]);

  const toggleTocNode = (id: string) => {
    setExpandedTocIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const expandTocNode = (id: string) => {
    setExpandedTocIds((current) => (current.includes(id) ? current : [...current, id]));
  };

  const renderTocNodes = (nodes: TocNode[]) => (
    <ul className="rulebook-toc-tree">
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const expanded = expandedTocIds.includes(node.id);

        return (
          <li
            key={node.id}
            className={`rulebook-toc-item depth-${Math.min(node.depth, 3)}${expanded ? ' expanded' : ''}`}
          >
            <div className="rulebook-toc-row">
              {hasChildren ? (
                <button
                  type="button"
                  className="rulebook-toc-toggle"
                  onClick={() => toggleTocNode(node.id)}
                  aria-expanded={expanded}
                  aria-label={`${node.text} 목차 ${expanded ? '접기' : '펼치기'}`}
                >
                  <span aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>
              ) : (
                <span className="rulebook-toc-spacer" aria-hidden="true" />
              )}
              <a
                href={`#${node.id}`}
                className="rulebook-toc-link"
                onClick={() => {
                  if (hasChildren) {
                    expandTocNode(node.id);
                  }
                }}
              >
                {node.text}
              </a>
            </div>
            {hasChildren && expanded ? renderTocNodes(node.children) : null}
          </li>
        );
      })}
    </ul>
  );

  const renderDocumentBlocks = () =>
    parsedDocument.blocks.map((block, index) => {
      if (block.type === 'heading') {
        return renderHeading(block.level, block.id, block.text, `${block.id}-${index}`);
      }

      if (block.type === 'paragraph') {
        return <p key={`paragraph-${index}`}>{renderInline(block.text)}</p>;
      }

      if (block.type === 'unordered-list') {
        return (
          <ul key={`unordered-${index}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
            ))}
          </ul>
        );
      }

      if (block.type === 'ordered-list') {
        return (
          <ol key={`ordered-${index}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
            ))}
          </ol>
        );
      }

      if (block.type === 'blockquote') {
        return (
          <blockquote key={`blockquote-${index}`}>
            {block.lines.map((line, lineIndex) => (
              <p key={`${line}-${lineIndex}`}>{renderInline(line)}</p>
            ))}
          </blockquote>
        );
      }

      if (block.type === 'code') {
        return (
          <pre key={`code-${index}`}>
            <code className={block.language ? `language-${block.language}` : undefined}>
              {block.code}
            </code>
          </pre>
        );
      }

      if (block.type === 'table') {
        const [header, ...rows] = block.rows;
        return (
          <div key={`table-${index}`} className="rulebook-table-wrap">
            <table>
              <thead>
                <tr>
                  {header.map((cell, cellIndex) => (
                    <th key={`${cell}-${cellIndex}`}>{renderInline(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${cell}-${cellIndex}`}>{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      return <hr key={`hr-${index}`} />;
    });

  const renderReaderPane = () => (
    <div className="rulebook-page__screen">
      <section className="rulebook-layout">
        <div className="rulebook-content-shell">
          {activeDocument ? (
            <>
              <header className="rulebook-document-head">
                <div className="rulebook-document-summary">
                  <div className="rulebook-document-inline">
                    <div className="rulebook-document-inline-main">
                      <h2>{activeDocument.title}</h2>
                      {activeDocument.description ? <p>- {activeDocument.description}</p> : null}
                    </div>
                    <p className="rulebook-document-inline-date">
                      업데이트: {new Date(activeDocument.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </header>

              <div className="rulebook-content-grid">
                <nav className="rulebook-toc" aria-label="Rulebook table of contents">
                  <div className="rulebook-panel-head">
                    <strong>목차</strong>
                  </div>
                  {tocTree.length ? (
                    <div className="rulebook-toc-list">{renderTocNodes(tocTree)}</div>
                  ) : (
                    <p className="rulebook-muted">이 문서에는 표시할 목차가 없습니다.</p>
                  )}
                </nav>

                <article className="rulebook-article">{renderDocumentBlocks()}</article>
              </div>
            </>
          ) : (
            <div className="rulebook-empty-state">
              <span className="eyebrow">Rulebook</span>
              <strong>선택한 룰북 문서를 찾을 수 없습니다.</strong>
              <p>왼쪽 사이드바에서 다른 문서를 선택해 다시 확인해 주세요.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  return (
    <main className="rulebook-page rulebook-page--fantasy">
      <aside className="rulebook-page__sidebar">
        <div className="rulebook-page__title-box">
          <img src={dndLogo} alt="D&D 5e SRD 룰북" className="rulebook-page__title-image" />
        </div>

        <nav className="rulebook-page__side-nav" aria-label="Rulebook sections">
          <button
            type="button"
            className={`rulebook-page__side-button${activePane === 'translated' ? ' active' : ''}`}
            onClick={() => setActivePane('translated')}
          >
            <span>룰북 (번역본)</span>
          </button>
          <button
            type="button"
            className={`rulebook-page__side-button${activePane === 'original' ? ' active' : ''}`}
            onClick={() => setActivePane('original')}
          >
            <span>룰북 (원문)</span>
          </button>
          <button
            type="button"
            className={`rulebook-page__side-button${activePane === 'copyright' ? ' active' : ''}`}
            onClick={() => setActivePane('copyright')}
          >
            <span>저작권</span>
          </button>
        </nav>
      </aside>

      <section className="rulebook-page__main">
        {error ? <p className="panel-error">{error}</p> : null}
        {loadingIndex ? <RulebookSpinner /> : renderReaderPane()}
      </section>

      <footer className="rulebook-page__footer">
        <p>
          This work includes material taken from the System Reference Document 5.1 ("SRD 5.1")
          by Wizards of the Coast LLC and available at
          <br />
          <a
            href="https://dnd.wizards.com/resources/systems-reference-document"
            target="_blank"
            rel="noreferrer"
          >
            https://dnd.wizards.com/resources/systems-reference-document
          </a>
          . The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International
          License available at
          <br />
          <a
            href="https://creativecommons.org/licenses/by/4.0/legalcode"
            target="_blank"
            rel="noreferrer"
          >
            https://creativecommons.org/licenses/by/4.0/legalcode
          </a>
          .
        </p>
      </footer>
    </main>
  );
}
