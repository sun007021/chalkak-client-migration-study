export class ScrollMemory {
  private m = new Map<string, number>();
  save(key: string, top: number): void { this.m.set(key, Number.isFinite(top) ? Math.max(0, top) : 0); }
  read(key: string): number | null { return this.m.get(key) ?? null; }
}
