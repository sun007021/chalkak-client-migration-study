import { d } from '../../core/net/decode';
import type { Decoder } from '../../core/net/decode';
import { DecodeError } from '../../core/net/decode';
import type { PostItem } from './postModels';

/** 0 이상의 유한한 수(likeCount). 음수는 계약 위반이다. */
export function nonNegativeNumber(): Decoder<number> {
  const number = d.number();
  return (value) => {
    const n = number(value);
    if (n < 0) throw new DecodeError(`expected a non-negative number but got ${n}`);
    return n;
  };
}

/** GET /posts 목록 항목. 필수 필드가 없거나 likeCount가 음수면 던진다. */
export const decodePostItem: Decoder<PostItem> = d.object({
  id: d.string(),
  authorId: d.string(),
  originalImageUrl: d.string(),
  thumbnailImageUrl: d.nullable(d.string()),
  signatureOriginalImageUrl: d.nullable(d.string()),
  signatureThumbnailImageUrl: d.nullable(d.string()),
  title: d.nullable(d.string()),
  likeCount: nonNegativeNumber(),
  isLiked: d.boolean(),
  isMine: d.boolean(),
});
