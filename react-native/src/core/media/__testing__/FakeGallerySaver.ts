import type { GallerySaveRequest, GallerySaveResult, GallerySaver } from '../GallerySaver';

export class FakeGallerySaver implements GallerySaver {
  readonly saved: GallerySaveRequest[] = [];
  /** 결과를 Promise로 주면 save가 끝나는 시점을 테스트가 정한다. */
  result: GallerySaveResult | Promise<GallerySaveResult> = 'saved';

  async save(request: GallerySaveRequest): Promise<GallerySaveResult> {
    this.saved.push(request);
    return this.result;
  }
}
