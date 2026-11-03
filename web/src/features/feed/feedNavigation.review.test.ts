import { readFeedSeed } from './feedNavigation';

const base = {
  id: '22222222-2222-4222-8222-222222222202',
  authorId: 'b',
  originalImageUrl: 'https://cdn.example.test/o.webp',
  thumbnailImageUrl: 'https://cdn.example.test/t.webp',
  title: 'x',
  likeCount: 1,
  isLiked: false,
  isMine: false,
};

describe('readFeedSeed 이미지 URL (코드리뷰)', () => {
  it('https 이미지 URL의 시드는 받는다', () => {
    expect(readFeedSeed({ seed: base }, base.id)).not.toBeNull();
  });

  it.each([
    ['originalImageUrl', 'javascript:alert(1)'],
    ['originalImageUrl', 'http://cdn.example.test/o.webp'],
    ['originalImageUrl', 'data:image/png;base64,AAAA'],
    ['thumbnailImageUrl', 'javascript:alert(1)'],
    ['signatureOriginalImageUrl', 'http://x.test/s.png'],
    ['originalImageUrl', 'not a url'],
  ])('%s가 %s이면 시드를 버린다', (field, value) => {
    expect(readFeedSeed({ seed: { ...base, [field]: value } }, base.id)).toBeNull();
  });

  it('thumbnail·signature가 null이어도 받는다', () => {
    expect(readFeedSeed({ seed: { ...base, thumbnailImageUrl: null, signatureOriginalImageUrl: null } }, base.id)).not.toBeNull();
  });
});
