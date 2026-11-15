// Offline-wachtrij met exponentiële backoff. Opslag is injecteerbaar (AsyncStorage in de app, Map in tests).
export interface KV { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> }
export type QueueItem<T> = { id: string; payload: T; attempts: number; nextAt: number; lastError?: string };

export const backoffMs = (attempts: number) => Math.min(60_000, 2_000 * 2 ** attempts);

export class PersistentQueue<T> {
  constructor(private kv: KV, private key: string, private maxAttempts = 50) {}
  async all(): Promise<QueueItem<T>[]> { return JSON.parse((await this.kv.getItem(this.key)) ?? '[]'); }
  private async save(items: QueueItem<T>[]) { await this.kv.setItem(this.key, JSON.stringify(items)); }
  async push(id: string, payload: T) {
    const items = await this.all();
    if (!items.some((i) => i.id === id)) items.push({ id, payload, attempts: 0, nextAt: 0 });
    await this.save(items);
  }
  async remove(id: string) { await this.save((await this.all()).filter((i) => i.id !== id)); }
  /** Verwerkt items die aan de beurt zijn. send() gooit bij falen. Geeft aantal geslaagde items terug. */
  async flush(send: (p: T, id: string) => Promise<void>, now = Date.now()): Promise<number> {
    const items = await this.all(); let ok = 0; const keep: QueueItem<T>[] = [];
    for (const it of items) {
      if (it.nextAt > now) { keep.push(it); continue; }
      try { await send(it.payload, it.id); ok++; }
      catch (e) {
        const attempts = it.attempts + 1;
        if (attempts < this.maxAttempts) keep.push({ ...it, attempts, nextAt: now + backoffMs(attempts), lastError: String(e) });
      }
    }
    await this.save(keep); return ok;
  }

  /** Items die nu verwerkt mogen worden (voor batch-verzenden). */
  async due(now = Date.now()): Promise<QueueItem<T>[]> {
    return (await this.all()).filter((i) => i.nextAt <= now);
  }

  /** Verwijder geslaagde ids; backoff voor mislukte. Permanente weigeringen: id in okIds zetten. */
  async applyResults(okIds: string[], failed: { id: string; error?: string }[], now = Date.now()) {
    const ok = new Set(okIds);
    const failMap = new Map(failed.map((f) => [f.id, f.error]));
    const keep: QueueItem<T>[] = [];
    for (const it of await this.all()) {
      if (ok.has(it.id)) continue;
      if (failMap.has(it.id)) {
        const attempts = it.attempts + 1;
        if (attempts < this.maxAttempts) {
          keep.push({ ...it, attempts, nextAt: now + backoffMs(attempts), lastError: failMap.get(it.id) });
        }
        continue;
      }
      keep.push(it);
    }
    await this.save(keep);
  }
}
