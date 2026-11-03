import { t } from '../../copy/ko';
import { finish } from '../../test/homeHarness';
import { createPostHarness } from '../../test/postHarness';
import { MINE, OTHER, titleKey } from '../../test/postRoutes';

describe('FeedViewModel 코드리뷰 회귀', () => {
  it('REQ-FEED-017 TC-FEED-017 다이얼로그가 열린 채 자정을 지나면 저장은 요청 없이 "수정할 수 없는 상태" 오류를 다이얼로그에 보인다', async () => {
    const h = createPostHarness({ now: '2026-10-27T14:59:59.000Z' });
    const { vm } = h.feed({ postId: MINE, seed: null });
    await finish(h, vm.load());
    vm.openTitleEdit();
    vm.setTitleInput('새 제목');
    await h.clock.advance(1000); // KST 자정
    await vm.saveTitle();
    expect(h.router.calls(titleKey(MINE))).toHaveLength(0);
    expect(vm.state.titleDialog).toMatchObject({ open: true, saving: false, input: '새 제목', error: t('feed.edit.error.state') });
    expect(vm.state.post?.title).toBe('비 오는 날');
  });

  it('TC-FEED-016 저장된 userId를 읽다 실패해도 확정 뒤 isMine이 바뀌지 않는다', async () => {
    const h = createPostHarness();
    const { vm } = h.feed({
      postId: MINE,
      seed: { id: MINE, authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', originalImageUrl: 'https://cdn.example.test/a.webp', thumbnailImageUrl: null, title: 'x', likeCount: 1, isLiked: false, isMine: true },
      getUserId: () => Promise.reject(new Error('idb')),
    });
    await finish(h, vm.load());
    expect(vm.state).toMatchObject({ confirmed: true, isMine: true, canDelete: true });
    const other = h.feed({ postId: OTHER, seed: null, getUserId: () => Promise.reject(new Error('idb')) });
    await finish(h, other.vm.load());
    expect(other.vm.state.isMine).toBe(false);
  });
});
