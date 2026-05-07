import { createElement, Fragment, useEffect, useMemo, useState } from 'react';
import type {
  RulebookDocumentResponseDto,
  RulebookIndexResponseDto,
} from '@trpg/shared-types';
import { getRulebookDocument, getRulebookIndex } from '../services/api';

interface RulebookPageProps {
  ruleSetId?: string;
}

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

export function RulebookPage({ ruleSetId = 'dnd5e' }: RulebookPageProps) {
  const [rulebookIndex, setRulebookIndex] = useState<RulebookIndexResponseDto | null>(null);
  const [activeDocumentSlug, setActiveDocumentSlug] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState<RulebookDocumentResponseDto | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTocIds, setExpandedTocIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoadingIndex(true);
    setError(null);

    getRulebookIndex(ruleSetId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setRulebookIndex(result);
        setActiveDocumentSlug((current) => current ?? result.defaultDocumentSlug);
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }
        setError(caught instanceof Error ? caught.message : '룰북 색인을 불러오지 못했습니다.');
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
    if (!activeDocumentSlug) {
      return;
    }

    let cancelled = false;
    setLoadingDocument(true);
    setError(null);
    setActiveDocument(null);

    getRulebookDocument(activeDocumentSlug, ruleSetId)
      .then((result) => {
        if (!cancelled) {
          setActiveDocument(result);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '룰북 문서를 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDocument(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDocumentSlug, ruleSetId]);

  const parsedDocument = useMemo(
    () => parseMarkdown(activeDocument?.content ?? ''),
    [activeDocument?.content],
  );
  const tocTree = useMemo(() => buildTocTree(parsedDocument.headings), [parsedDocument.headings]);

  const documentList = rulebookIndex?.documents ?? [];

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
                  aria-label={`${node.text} 하위 목차 ${expanded ? '접기' : '펼치기'}`}
                >
                  <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
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

  return (
    <main className="rulebook-page">
      <section className="rulebook-hero">
        <span className="eyebrow">{rulebookIndex?.ruleSetId?.toUpperCase() ?? 'RULEBOOK'}</span>
        <h1>{rulebookIndex?.title ?? '룰북'}</h1>
        <p>
          {rulebookIndex?.description ??
            '번역된 룰북 문서를 문서 목록과 목차로 이어서 읽을 수 있습니다.'}
        </p>
        {rulebookIndex?.attribution ? (
          <p className="rulebook-attribution">{rulebookIndex.attribution}</p>
        ) : null}
      </section>

      <section className="rulebook-layout">
        <aside className="rulebook-doc-nav">
          <div className="rulebook-panel-head">
            <span className="eyebrow">Documents</span>
            <strong>문서 목록</strong>
          </div>
          {loadingIndex ? <p className="rulebook-muted">룰북 문서 목록을 불러오는 중입니다.</p> : null}
          {!loadingIndex && !documentList.length ? (
            <p className="rulebook-muted">표시할 룰북 문서가 없습니다.</p>
          ) : null}
          <div className="rulebook-doc-list">
            {documentList.map((document) => (
              <button
                key={document.slug}
                type="button"
                className={
                  document.slug === activeDocumentSlug
                    ? 'rulebook-doc-button active'
                    : 'rulebook-doc-button'
                }
                onClick={() => setActiveDocumentSlug(document.slug)}
              >
                <strong>{document.title}</strong>
                {document.description ? <span>{document.description}</span> : null}
              </button>
            ))}
          </div>
        </aside>

        <div className="rulebook-content-shell">
          {error ? <p className="panel-error">{error}</p> : null}

          {activeDocument ? (
            <>
              <header className="rulebook-document-head">
                <div>
                  <span className="eyebrow">Current document</span>
                  <h2>{activeDocument.title}</h2>
                  {activeDocument.description ? <p>{activeDocument.description}</p> : null}
                </div>
                <dl className="rulebook-document-meta">
                  <div>
                    <dt>Category</dt>
                    <dd>{activeDocument.category}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{new Date(activeDocument.updatedAt).toLocaleString()}</dd>
                  </div>
                </dl>
              </header>

              <div className="rulebook-content-grid">
                <nav className="rulebook-toc" aria-label="Rulebook table of contents">
                  <div className="rulebook-panel-head">
                    <span className="eyebrow">TOC</span>
                    <strong>목차</strong>
                  </div>
                  {tocTree.length ? (
                    <div className="rulebook-toc-list">
                      {renderTocNodes(tocTree)}
                    </div>
                  ) : (
                    <p className="rulebook-muted">이 문서에는 생성할 수 있는 목차가 없습니다.</p>
                  )}
                </nav>

                <article className="rulebook-article">
                  {loadingDocument ? (
                    <p className="rulebook-muted">문서를 불러오는 중입니다.</p>
                  ) : null}
                  {!loadingDocument
                    ? parsedDocument.blocks.map((block, index) => {
                        if (block.type === 'heading') {
                          return renderHeading(
                            block.level,
                            block.id,
                            block.text,
                            `${block.id}-${index}`,
                          );
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
                      })
                    : null}
                </article>
              </div>
            </>
          ) : !loadingIndex ? (
            <div className="rulebook-empty-state">
              <span className="eyebrow">Rulebook</span>
              <strong>선택된 룰북 문서가 없습니다.</strong>
              <p>왼쪽 목록에서 문서를 선택하면 목차와 전체 내용을 볼 수 있습니다.</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
