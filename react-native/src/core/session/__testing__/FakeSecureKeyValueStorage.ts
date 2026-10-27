import type { SecureKeyValueStorage } from '../SecureKeyValueStorage';

export class FakeSecureKeyValueStorage implements SecureKeyValueStorage {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  failNextWrite = false;
  /** 각 호출 사이에 마이크로태스크 지연을 줘서 read-modify-write 경합을 드러낸다. */
  latencyTicks = 0;

  private async tick(): Promise<void> {
    for (let i = 0; i < this.latencyTicks; i += 1) await Promise.resolve();
  }

  async getItem(key: string): Promise<string | null> {
    await this.tick();
    return this.data.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.tick();
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('storage write failed');
    }
    this.writes.push(key);
    this.data.set(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    await this.tick();
    this.data.delete(key);
  }
}
