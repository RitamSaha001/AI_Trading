import { NewsArticle } from "./types";

export class NewsDeduplicator {
  private static seenHashes: Map<string, number> = new Map(); // hash -> timestamp
  private static readonly MAX_ENTRIES = 2000;
  private static readonly RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Fast, zero-dependency 64-bit FNV-1a deterministic content hash
   * Works identically in both Browser (Vite/React) and Server (Node.js/Fastify)
   */
  public static hashArticle(article: NewsArticle): string {
    const str = article.headline
      .toLowerCase()
      .replace(/[^a-z0-9]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    let h1 = 0x811c9dc5;
    let h2 = 0xcbf29ce4;

    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 0x01000193);
      h2 = Math.imul(h2 ^ ch, 0x5bd1e995);
    }

    const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
    const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
    return hex1 + hex2;
  }

  /**
   * Checks if an article has already been ingested.
   */
  public static isDuplicate(article: NewsArticle): boolean {
    const hash = this.hashArticle(article);
    const existingTime = this.seenHashes.get(hash);
    if (!existingTime) return false;

    // Check if expired
    if (Date.now() - existingTime > this.RETENTION_MS) {
      this.seenHashes.delete(hash);
      return false;
    }
    return true;
  }

  /**
   * Registers a new article. Returns true if newly added, false if it was a duplicate.
   */
  public static register(article: NewsArticle): boolean {
    const hash = this.hashArticle(article);
    const now = Date.now();

    if (this.seenHashes.has(hash)) {
      const existingTime = this.seenHashes.get(hash)!;
      if (now - existingTime <= this.RETENTION_MS) {
        return false; // Duplicate
      }
    }

    // Prune if over capacity
    if (this.seenHashes.size >= this.MAX_ENTRIES) {
      this.pruneExpired(now);
      if (this.seenHashes.size >= this.MAX_ENTRIES) {
        const entries = Array.from(this.seenHashes.entries()).sort((a, b) => a[1] - b[1]);
        const dropCount = Math.floor(this.MAX_ENTRIES * 0.2);
        for (let i = 0; i < dropCount; i++) {
          this.seenHashes.delete(entries[i][0]);
        }
      }
    }

    this.seenHashes.set(hash, now);
    return true;
  }

  /**
   * Prunes entries older than 24 hours.
   */
  public static pruneExpired(now: number = Date.now()): void {
    for (const [hash, timestamp] of this.seenHashes.entries()) {
      if (now - timestamp > this.RETENTION_MS) {
        this.seenHashes.delete(hash);
      }
    }
  }

  /**
   * Clears the cache (used in testing).
   */
  public static clear(): void {
    this.seenHashes.clear();
  }

  public static size(): number {
    return this.seenHashes.size;
  }
}
