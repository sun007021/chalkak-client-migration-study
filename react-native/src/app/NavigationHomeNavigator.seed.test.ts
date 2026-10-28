import { listSeed } from '../features/feed/__testing__/createFeedHarness';
import { NavigationHomeNavigator } from './NavigationHomeNavigator';

const expectedSeed = (p: ReturnType<typeof listSeed>) => ({
  id: p.id,
  authorId: p.authorId,
  originalImageUrl: p.originalImageUrl,
  thumbnailImageUrl: p.thumbnailImageUrl,
  signatureOriginalImageUrl: p.signatureOriginalImageUrl,
  title: p.title,
  likeCount: p.likeCount,
  isLiked: p.isLiked,
  isMine: p.isMine,
});

describe('NavigationHomeNavigator → PostDetail 계약', () => {
  it('REQ-NAV-027 홈 랭킹에서 상세를 열면 목록 항목을 시드로 싣는다(상세 응답 전에도 이미지·좋아요 값 표시)', () => {
    const navigate = jest.fn();
    const navigator = new NavigationHomeNavigator({ isReady: () => true, navigate } as never);
    const seed = listSeed({ likeCount: 12, isLiked: true });
    navigator.openPostDetail({ postId: seed.id, seed });
    expect(navigate).toHaveBeenCalledWith('PostDetail', {
      postId: seed.id,
      seed: expectedSeed(seed),
    });
  });

  it('REQ-NAV-027 시드가 없으면 postId만 싣는다(기존 동작 유지)', () => {
    const navigate = jest.fn();
    const navigator = new NavigationHomeNavigator({ isReady: () => true, navigate } as never);
    navigator.openPostDetail({ postId: 'p1', seed: null });
    expect(navigate).toHaveBeenCalledWith('PostDetail', { postId: 'p1' });
  });
});
