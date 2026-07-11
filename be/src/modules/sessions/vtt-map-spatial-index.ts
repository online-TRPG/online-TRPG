export type VttSpatialRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export class VttMapSpatialIndex<T extends VttSpatialRect> {
  private static readonly MAX_CHUNKS_PER_ENTRY = 256;
  private readonly chunkSize: number;
  private readonly entries: readonly T[];
  private readonly entriesByChunk = new Map<string, T[]>();
  private readonly largeEntries: T[] = [];
  private chunkQueryCount = 0;
  private scanFallbackQueryCount = 0;

  constructor(chunkSize: number, entries: readonly T[]) {
    this.chunkSize = Math.max(1, Math.floor(chunkSize));
    this.entries = entries;
    for (const entry of entries) {
      if (this.getChunkCount(entry) > VttMapSpatialIndex.MAX_CHUNKS_PER_ENTRY) {
        this.largeEntries.push(entry);
        continue;
      }
      for (const chunkKey of this.getChunkKeys(entry)) {
        const chunkEntries = this.entriesByChunk.get(chunkKey);
        if (chunkEntries) {
          chunkEntries.push(entry);
        } else {
          this.entriesByChunk.set(chunkKey, [entry]);
        }
      }
    }
  }

  query(rect: Omit<VttSpatialRect, "id">): T[] {
    if (!this.entries.length) return [];
    const bounds = this.getChunkBounds(rect);
    const chunkCount =
      (bounds.maxChunkX - bounds.minChunkX + 1) *
      (bounds.maxChunkY - bounds.minChunkY + 1);
    if (chunkCount > Math.max(256, this.entries.length * 2)) {
      this.scanFallbackQueryCount += 1;
      return this.entries.filter((entry) => this.rectsOverlap(entry, rect));
    }

    this.chunkQueryCount += 1;
    const result = this.largeEntries.filter((entry) => this.rectsOverlap(entry, rect));
    const seen = new Set(result.map((entry) => entry.id));
    for (let chunkY = bounds.minChunkY; chunkY <= bounds.maxChunkY; chunkY += 1) {
      for (let chunkX = bounds.minChunkX; chunkX <= bounds.maxChunkX; chunkX += 1) {
        for (const entry of this.entriesByChunk.get(`${chunkX}:${chunkY}`) ?? []) {
          if (!seen.has(entry.id)) {
            result.push(entry);
            seen.add(entry.id);
          }
        }
      }
    }
    return result;
  }

  getQueryStats(): {
    chunkQueryCount: number;
    scanFallbackQueryCount: number;
    largeEntryCount: number;
  } {
    return {
      chunkQueryCount: this.chunkQueryCount,
      scanFallbackQueryCount: this.scanFallbackQueryCount,
      largeEntryCount: this.largeEntries.length,
    };
  }

  private getChunkCount(rect: Omit<VttSpatialRect, "id">): number {
    const bounds = this.getChunkBounds(rect);
    return (
      (bounds.maxChunkX - bounds.minChunkX + 1) *
      (bounds.maxChunkY - bounds.minChunkY + 1)
    );
  }

  private getChunkKeys(rect: Omit<VttSpatialRect, "id">): string[] {
    const bounds = this.getChunkBounds(rect);
    const keys: string[] = [];
    for (let chunkY = bounds.minChunkY; chunkY <= bounds.maxChunkY; chunkY += 1) {
      for (let chunkX = bounds.minChunkX; chunkX <= bounds.maxChunkX; chunkX += 1) {
        keys.push(`${chunkX}:${chunkY}`);
      }
    }
    return keys;
  }

  private getChunkBounds(rect: Omit<VttSpatialRect, "id">) {
    return {
      minChunkX: Math.floor(rect.x / this.chunkSize),
      minChunkY: Math.floor(rect.y / this.chunkSize),
      maxChunkX: Math.floor(
        (rect.x + Math.max(rect.width, 1) - Number.EPSILON) / this.chunkSize,
      ),
      maxChunkY: Math.floor(
        (rect.y + Math.max(rect.height, 1) - Number.EPSILON) / this.chunkSize,
      ),
    };
  }

  private rectsOverlap(
    left: Omit<VttSpatialRect, "id">,
    right: Omit<VttSpatialRect, "id">,
  ): boolean {
    const leftWidth = Math.max(left.width, 1);
    const leftHeight = Math.max(left.height, 1);
    const rightWidth = Math.max(right.width, 1);
    const rightHeight = Math.max(right.height, 1);
    return (
      left.x < right.x + rightWidth &&
      left.x + leftWidth > right.x &&
      left.y < right.y + rightHeight &&
      left.y + leftHeight > right.y
    );
  }
}
