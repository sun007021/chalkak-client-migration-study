import type { UploadEntry } from '../features/shell/UploadEntry';

export class FakeUploadEntry implements UploadEntry {
  starts = 0;
  start(): void {
    this.starts += 1;
  }
}
