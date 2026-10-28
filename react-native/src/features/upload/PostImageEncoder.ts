import type { LocalFiles } from '../../core/media/LocalFiles';
import type { EncodedImage, ImageEngine } from '../photo-edit/ImageEngine';
import type { PhotoEdit } from '../photo-edit/PhotoEdit';

export type PostImageEncoderDeps = {
  engine: Pick<ImageEngine, 'readBounds' | 'encodeWebp'>;
  files: LocalFiles;
};

export type EncodeInput = {
  sourceUri: string;
  edit: PhotoEdit;
  /** 항상 정책 응답값. */
  maxBytes: number;
};

/**
 * 업로드용 WebP 만들기(REQ-UPL-027~033). 크기만 읽고(readBounds) 긴 변 4096 이하로 줄일 크기를 정한 뒤,
 * 품질 사다리 [90, 80, 60, 40]를 내려가며 첫 번째로 maxBytes 이하가 되는 결과를 쓴다.
 * 품질 40에서도 넘으면 가로·세로를 0.85배(반올림)로 줄여 처음부터 다시, 축소는 최대 3번(총 4라운드)이며 모두 실패하면 SizeLimitExceededError.
 * 성공하지 못한 시도의 임시 파일은 바로 지우고, 취소되면 진행 중이던 결과도 지운다.
 */
export class PostImageEncoder {
  constructor(private readonly deps: PostImageEncoderDeps) {
    void this.deps;
  }

  encode(input: EncodeInput, signal?: AbortSignal): Promise<EncodedImage> {
    void input;
    void signal;
    throw new Error('not implemented');
  }
}
