import type { LocalFiles } from '../LocalFiles';

/** 메모리 파일 시스템. 만든 파일과 지운 파일을 기록한다. */
export class FakeLocalFiles implements LocalFiles {
  private readonly files = new Map<string, Uint8Array>();
  readonly deleted: string[] = [];

  put(uri: string, bytes: Uint8Array): void {
    this.files.set(uri, bytes);
  }

  exists(uri: string): boolean {
    return this.files.has(uri);
  }

  get existing(): string[] {
    return [...this.files.keys()];
  }

  async readBytes(uri: string): Promise<Uint8Array> {
    const bytes = this.files.get(uri);
    if (!bytes) throw new Error(`no such file: ${uri}`);
    return bytes;
  }

  async delete(uri: string): Promise<void> {
    this.deleted.push(uri);
    this.files.delete(uri);
  }
}
