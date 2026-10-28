import { CancelledError } from '../../core/http/ApiError';
import {
  POST_IMAGE_MAX_LONG_EDGE,
  WEBP_DOWNSCALE_FACTOR,
  WEBP_DOWNSCALE_MAX_ATTEMPTS,
  WEBP_QUALITY_LADDER,
} from '../../shared/constants';
import type { LocalFiles } from '../../core/media/LocalFiles';
import type { EncodedImage, ImageEngine } from '../photo-edit/ImageEngine';
import { isIdentityEdit, type PhotoEdit } from '../photo-edit/PhotoEdit';
import { limitLongEdge } from '../photo-edit/PhotoEditTransform';
import { SizeLimitExceededError } from './UploadErrors';

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
  constructor(private readonly deps: PostImageEncoderDeps) {}

  async encode(input: EncodeInput, signal?: AbortSignal): Promise<EncodedImage> {
    const { engine, files } = this.deps;
    throwIfAborted(signal);
    const sourceSize = await engine.readBounds(input.sourceUri, signal);
    throwIfAborted(signal);
    // 편집하지 않은 사진은 다시 그리지 않고 그대로 인코딩한다(REQ-UPL-028).
    const edit = isIdentityEdit(input.edit) ? null : input.edit;
    let targetSize = limitLongEdge(sourceSize, POST_IMAGE_MAX_LONG_EDGE);

    for (let round = 0; round <= WEBP_DOWNSCALE_MAX_ATTEMPTS; round += 1) {
      for (const quality of WEBP_QUALITY_LADDER) {
        const encoded = await engine.encodeWebp(
          { sourceUri: input.sourceUri, sourceSize, targetSize, edit, quality },
          signal,
        );
        if (signal?.aborted) {
          await files.delete(encoded.uri);
          throw new CancelledError('aborted');
        }
        if (encoded.byteLength <= input.maxBytes) return encoded;
        await files.delete(encoded.uri);
      }
      targetSize = {
        width: Math.max(1, Math.round(targetSize.width * WEBP_DOWNSCALE_FACTOR)),
        height: Math.max(1, Math.round(targetSize.height * WEBP_DOWNSCALE_FACTOR)),
      };
    }
    throw new SizeLimitExceededError();
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancelledError('aborted');
}
