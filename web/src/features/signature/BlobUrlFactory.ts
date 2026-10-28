/** 미리보기 이미지용 blob URL. 화면이 언마운트될 때 revoke한다. 테스트는 Fake를 주입한다. */
export interface BlobUrlFactory {
  create(blob: Blob): string;
  revoke(url: string): void;
}

/** 실제 구현: URL.createObjectURL / URL.revokeObjectURL. */
export class ObjectUrlFactory implements BlobUrlFactory {
  create(blob: Blob): string {
    return URL.createObjectURL(blob);
  }
  revoke(url: string): void {
    URL.revokeObjectURL(url);
  }
}
