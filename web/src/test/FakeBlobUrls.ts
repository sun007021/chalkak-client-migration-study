import type { BlobUrlFactory } from '../features/signature/BlobUrlFactory';

export class FakeBlobUrls implements BlobUrlFactory {
  readonly created: Blob[] = [];
  readonly revoked: string[] = [];
  create(blob: Blob): string {
    this.created.push(blob);
    return `blob:fake-${this.created.length}`;
  }
  revoke(url: string): void {
    this.revoked.push(url);
  }
}
