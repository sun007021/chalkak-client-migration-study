import type { SecureKeyValueStorage } from '../SecureKeyValueStorage';

export class FakeSecureKeyValueStorage implements SecureKeyValueStorage {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  failNextWrite = false;
  /** true면 다음 getItem이 예외를 던진다(Keystore 복원 실패 등). */
  failNextRead = false;
  private readGate: Promise<void> | null = null;
  /** 각 호출 사이에 마이크로태스크 지연을 줘서 read-modify-write 경합을 드러낸다. */
  latencyTicks = 0;

  private async tick(): Promise<void> {
    for (let i = 0; i < this.latencyTicks; i += 1) await Promise.resolve();
  }

  /**
   * 다음 getItem을 release()가 불릴 때까지 붙잡는다. 붙잡힌 읽기는 release 뒤에 "그 시점의" 값을 돌려준다.
   * 경쟁 상황(읽는 사이 다른 갱신이 끝남)을 결정적으로 재현할 때 쓴다.
   */
  holdNextRead(): () => void {
    let release!: () => void;
    this.readGate = new Promise<void>((resolve) => (release = resolve));
    return release;
  }

  async getItem(key: string): Promise<string | null> {
    const gate = this.readGate;
    this.readGate = null;
    if (gate) await gate;
    await this.tick();
    if (this.failNextRead) {
      this.failNextRead = false;
      throw new Error('storage read failed');
    }
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
