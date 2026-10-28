import type { UploadEntry } from '../features/shell/UploadEntry';

export class FakeUploadEntry implements UploadEntry {
  starts = 0;
  cancels = 0;
  start(): void {
    this.starts += 1;
  }
  cancel(): void {
    this.cancels += 1;
  }
}
