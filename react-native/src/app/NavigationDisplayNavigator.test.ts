import { listSeed } from '../features/feed/__testing__/createFeedHarness';
import { NavigationDisplayNavigator } from './NavigationDisplayNavigator';

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

describe('NavigationDisplayNavigator', () => {
  it('TC-DISP-055 사진을 누르면 PostDetail에 postId와 직렬화 가능한 시드(id·이미지 URL·likeCount·isLiked)를 싣고 이동한다', () => {
    const navigate = jest.fn();
    const navigator = new NavigationDisplayNavigator({ isReady: () => true, navigate } as never);
    const seed = listSeed({ likeCount: 12, isLiked: true });
    navigator.openPostDetail({ postId: seed.id, seed });
    expect(navigate).toHaveBeenCalledWith('PostDetail', {
      postId: seed.id,
      seed: expectedSeed(seed),
    });
    const params = navigate.mock.calls[0][1];
    expect(JSON.parse(JSON.stringify(params))).toEqual(params);
  });

  it('내비게이션이 준비되기 전의 요청은 버린다', () => {
    const navigate = jest.fn();
    const navigator = new NavigationDisplayNavigator({ isReady: () => false, navigate } as never);
    navigator.openPostDetail({ postId: 'p', seed: listSeed() });
    expect(navigate).not.toHaveBeenCalled();
  });
});
