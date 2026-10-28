import { t } from '../../shared/copy';
import { d } from '../../core/time/__testing__/helpers';
import { createDisplayHarness, gatedRoute, ID, q } from './__testing__/createDisplayHarness';

const RECENT = q('2026-10-27', 'recent', 1);
const P = ID('02');
const likeOf = (h: Awaited<ReturnType<typeof createDisplayHarness>>, id = P) => {
  const s = h.viewModel.getSnapshot();
  const pick = (list: typeof s.photos) => list.find((p) => p.id === id);
  return { grid: pick(s.photos), featured: pick(s.featured) };
};

describe('DisplayViewModel 좋아요 연동', () => {
  it('TC-LIKE-003 하트를 누르면 현재 표시 값을 컨트롤러에 위임하고, 컨트롤러 알림이 오면 즉시 목록에 반영한다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    h.viewModel.onLikePress(P);
    expect(h.likes.toggled).toEqual([{ postId: P, likeCount: 38, isLiked: false }]);
    h.likes.emit({ kind: 'updated', snapshot: { postId: P, likeCount: 39, isLiked: true } });
    expect(likeOf(h).grid).toMatchObject({ likeCount: 39, isLiked: true });
  });

  it('TC-LIKE-004 아카이브 추천 카드와 그리드 카드는 같은 사진이면 항상 같은 값이다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.openDate(d('2026-10-26'));
    h.viewModel.onLikePress(P);
    h.likes.emit({ kind: 'updated', snapshot: { postId: P, likeCount: 39, isLiked: true } });
    const { grid, featured } = likeOf(h);
    expect(featured).toMatchObject({ likeCount: 39, isLiked: true });
    expect(featured).toEqual(grid);
  });

  it('TC-LIKE-014 게스트가 하트를 누르면 상태 변화 없이 토스트만 뜨고 요청이 없다', async () => {
    const h = await createDisplayHarness({
      mode: 'guest',
      routes: { [RECENT]: 'display/posts-list__guest-page1' },
    });
    await h.viewModel.onShown();
    const requests = h.transport.requests.length;
    h.viewModel.onLikePress(P);
    expect(h.toast.messages).toEqual([t('guest.like')]);
    expect(h.likes.toggled).toEqual([]);
    expect(h.transport.requests).toHaveLength(requests);
  });

  it('TC-LIKE-010 404로 removed가 오면 목록과 추천 카드에서 그 게시물을 뺀다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.openDate(d('2026-10-26'));
    h.likes.emit({ kind: 'removed', postId: P });
    const { grid, featured } = likeOf(h);
    expect(grid).toBeUndefined();
    expect(featured).toBeUndefined();
  });

  it('TC-LIKE-021 요청 시작 뒤에 끝난 좋아요는 늦게 도착한 재검증 응답이 덮어쓰지 않는다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    const gate = gatedRoute(h.router, RECENT, 'display/posts-list__recent-page1');
    const revalidating = h.viewModel.onTabReselected();
    await Promise.resolve();
    h.likes.emit({ kind: 'updated', snapshot: { postId: P, likeCount: 39, isLiked: true } });
    gate.release();
    await revalidating;
    expect(likeOf(h).grid).toMatchObject({ likeCount: 39, isLiked: true });
  });

  it('TC-LIKE-021 요청 시작 전에 끝난 좋아요는 더 새로운 응답 값을 덮지 않는다(revision 병합)', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    h.likes.seed({ postId: P, likeCount: 39, isLiked: true });
    h.router.set(RECENT, 'display/posts-list__popular-page1'); // 응답 값은 likeCount 38, isLiked false
    await h.viewModel.onTabReselected();
    expect(likeOf(h).grid).toMatchObject({ likeCount: 38, isLiked: false });
  });

  it('TC-LIKE-021 처음 불러온 목록 위에도 이미 끝난 좋아요가 있으면 그 이후 응답에서만 덮는다', async () => {
    const h = await createDisplayHarness();
    const gate = gatedRoute(h.router, RECENT, 'display/posts-list__recent-page1');
    const loading = h.viewModel.onShown();
    await Promise.resolve();
    h.likes.emit({ kind: 'updated', snapshot: { postId: P, likeCount: 40, isLiked: true } });
    gate.release();
    await loading;
    expect(likeOf(h).grid).toMatchObject({ likeCount: 40, isLiked: true });
  });
});

describe('DisplayViewModel 게시물 변경 연동', () => {
  it('TC-FEED-024 상세에서 제목을 수정하면 목록에도 새 제목이 반영된다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    h.changes.publish({ kind: 'title-changed', postId: P, title: '새 제목' });
    expect(likeOf(h).grid?.title).toBe('새 제목');
  });

  it('TC-FEED-036 삭제한 게시물은 목록과 추천 카드에서 빠진다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.openDate(d('2026-10-26'));
    h.changes.publish({ kind: 'deleted', postId: P });
    const { grid, featured } = likeOf(h);
    expect(grid).toBeUndefined();
    expect(featured).toBeUndefined();
  });

  it('TC-FEED-044 삭제 뒤 도착한 늦은 재검증 응답이 그 게시물을 다시 포함해도 되살아나지 않는다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    const gate = gatedRoute(h.router, RECENT, 'display/posts-list__recent-page1');
    const revalidating = h.viewModel.onTabReselected();
    await Promise.resolve();
    h.changes.publish({ kind: 'deleted', postId: P });
    gate.release();
    await revalidating;
    expect(likeOf(h).grid).toBeUndefined();
  });
});
