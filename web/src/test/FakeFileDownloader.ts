import type { FileDownloader } from '../features/record/FileDownloader';
import { deferred } from './deferred';

/** 받은 파일을 기록만 하는 Fake. fail을 주면 그 오류로 거절, hold()로 붙잡아 둘 수 있다. */
export class FakeFileDownloader implements FileDownloader {
  readonly files: { name: string; blob: Blob }[] = [];
  fail: Error | null = null;
  private gate: ReturnType<typeof deferred<void>> | null = null;

  hold(): void {
    this.gate = deferred<void>();
  }

  release(): void {
    this.gate?.resolve();
    this.gate = null;
  }

  async download(file: { name: string; blob: Blob }): Promise<void> {
    if (this.gate) await this.gate.promise;
    if (this.fail) throw this.fail;
    this.files.push(file);
  }
}
