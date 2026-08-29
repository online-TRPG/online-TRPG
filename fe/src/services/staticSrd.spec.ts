import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadClassFeatureManifest } from './staticSrd';

describe('loadClassFeatureManifest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts the generated manifest including unmapped level-zero features', async () => {
    const manifestPath = path.resolve(process.cwd(), 'public/srd/class-features.json');
    const payload: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => payload,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const manifest = await loadClassFeatureManifest();

    expect(manifest.length).toBeGreaterThan(0);
    expect(manifest.some((feature) => feature.level === 0)).toBe(true);
    expect(
      manifest
        .filter((feature) => feature.level === 0)
        .every((feature) => feature.availableAtLevels.length === 0),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/srd/class-features.json');
  });
});
