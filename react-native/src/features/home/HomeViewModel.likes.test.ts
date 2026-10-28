import { flush, createHomeHarness } from './__testing__/createHomeHarness';

const POST = '22222222-2222-4222-8222-222222222202';

describe('HomeViewModel 좋아요(D-04)', () => {
  it('TC-LIKE-005 홈 랭킹 하트는 컨트롤러에 위임하고, 알림이 오면 서버 응답을 기다리지 않고 즉시 낙관 반영된다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    await flush();
    h.viewModel.onRankingLikePress('popular', POST);
    expect(h.likes.toggled).toEqual([{ postId: POST, likeCount: 38, isLiked: false }]);
    h.likes.emit({ kind: 'updated', snapshot: { postId: POST, likeCount: 39, isLiked: true } });
    const section = h.viewModel.getSnapshot().popular;
    expect(section.status === 'ready' && section.posts.find((p) => p.id === POST)).toMatchObject({
      likeCount: 39,
      isLiked: true,
    });
  });
});
