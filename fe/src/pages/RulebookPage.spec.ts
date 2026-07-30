import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { decodeStaticRulebookExport } from './RulebookPage';

describe('decodeStaticRulebookExport', () => {
  it('inherits ruleSetId from the collection for compact static documents', async () => {
    const rulebookPath = path.resolve(process.cwd(), 'public/rulebooks/dnd5e.json');
    const payload: unknown = JSON.parse(await readFile(rulebookPath, 'utf8'));

    const decoded = decodeStaticRulebookExport(payload);

    expect(decoded.rulebooks).toHaveLength(1);
    expect(decoded.rulebooks[0]?.documents.map((document) => document.slug)).toEqual([
      'rulebook',
      'copyright',
      'original',
    ]);
    expect(
      decoded.rulebooks[0]?.documents.every((document) => document.ruleSetId === 'dnd5e'),
    ).toBe(true);
  });

  it('rejects a document ruleSetId that conflicts with its collection', () => {
    expect(() =>
      decodeStaticRulebookExport({
        version: 1,
        rulebooks: [
          {
            ruleSetId: 'dnd5e',
            title: 'D&D 5e SRD',
            description: null,
            attribution: null,
            defaultDocumentSlug: 'rulebook',
            documents: [
              {
                slug: 'rulebook',
                title: '룰북',
                description: null,
                category: '번역본',
                updatedAt: '2026-01-01T00:00:00.000Z',
                ruleSetId: 'other',
                content: '# 룰북',
              },
            ],
          },
        ],
      }),
    ).toThrow('ruleSetId must match the containing rulebook.');
  });
});
