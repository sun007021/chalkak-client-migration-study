import type { PhotoEdit } from '../features/upload/editModel';
import type { DecodedImage, EditRenderer } from '../features/upload/imagePorts';
import { FakeDecodedImage } from './FakeImageDecoder';

/** 편집을 적용했다고 치고 같은 크기의 새 이미지를 돌려주는 Fake. 호출 기록과 실패를 조절한다. */
export class FakeEditRenderer implements EditRenderer {
  readonly calls: { image: DecodedImage; edit: PhotoEdit }[] = [];
  readonly outputs: FakeDecodedImage[] = [];
  fail: Error | null = null;

  async render(image: DecodedImage, edit: PhotoEdit, signal: AbortSignal): Promise<DecodedImage> {
    this.calls.push({ image, edit });
    if (signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    if (this.fail) throw this.fail;
    const output = new FakeDecodedImage(image.width, image.height);
    this.outputs.push(output);
    return output;
  }
}
