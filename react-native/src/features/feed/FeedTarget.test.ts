import { listSeed } from './__testing__/createFeedHarness';
import { toFeedSeed } from './FeedTarget';

describe('toFeedSeed', () => {
  it('TC-DISP-055 목록의 id·이미지 URL·likeCount·isLiked 등 필요한 필드만 복사하고 직렬화 가능하다', () => {
    const post = listSeed({ likeCount: 12, isLiked: true });
    const seed = toFeedSeed(post);
    expect(seed).toEqual({
      id: post.id,
      authorId: post.authorId,
      originalImageUrl: post.originalImageUrl,
      thumbnailImageUrl: post.thumbnailImageUrl,
      signatureOriginalImageUrl: post.signatureOriginalImageUrl,
      title: post.title,
      likeCount: 12,
      isLiked: true,
      isMine: false,
    });
    expect(JSON.parse(JSON.stringify(seed))).toEqual(seed);
  });
});
