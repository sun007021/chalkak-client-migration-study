import {
  createFeedHarness,
  GET_OTHER,
  gated,
  listSeed,
  MINE,
  OTHER,
} from './__testing__/createFeedHarness';
import { flush } from '../home/__testing__/createHomeHarness';

describe('FeedViewModel 좋아요', () => {
  it('TC-LIKE-006 확정 뒤 하트를 누르면 현재 값을 컨트롤러에 위임하고, 알림이 오면 즉시 반영한다', async () => {
    const h = await createFeedHarness({ open: { entry: 'list', seed: listSeed() } });
    await h.viewModel.onShown();
    h.viewModel.onLikePress();
    expect(h.likes.toggled).toEqual([{ postId: OTHER, likeCount: 38, isLiked: false }]);
    h.likes.emit({ kind: 'updated', snapshot: { postId: OTHER, likeCount: 39, isLiked: true } });
    expect(h.viewModel.getSnapshot().content).toMatchObject({ likeCount: 39, isLiked: true });
  });

  it('TC-LIKE-024 TC-FEED-001 상세 확정 전 전시 시드에서는 하트가 막히고 확정 후에만 허용된다', async () => {
    const h = await createFeedHarness({ open: { entry: 'list', seed: listSeed() } });
    const gate = gated(h.router, GET_OTHER, 'feed/posts-detail__other');
    const loading = h.viewModel.onShown();
    await flush();
    h.viewModel.onLikePress();
    expect(h.likes.toggled).toEqual([]);
    gate.release();
    await loading;
    h.viewModel.onLikePress();
    expect(h.likes.toggled).toHaveLength(1);
  });

  it('TC-LIKE-023 상세 로딩 중 좋아요가 먼저 완료되면 늦게 온 상세 응답이 그 값을 덮지 않는다', async () => {
    const h = await createFeedHarness({ open: { entry: 'list', seed: listSeed() } });
    const gate = gated(h.router, GET_OTHER, 'feed/posts-detail__other');
    const loading = h.viewModel.onShown();
    await flush();
    h.likes.emit({ kind: 'updated', snapshot: { postId: OTHER, likeCount: 39, isLiked: true } });
    gate.release();
    await loading;
    expect(h.viewModel.getSnapshot().content).toMatchObject({ likeCount: 39, isLiked: true });
  });

  it('TC-LIKE-023 요청 시작 전에 끝난 좋아요는 더 새로운 상세 응답 값을 덮지 않는다', async () => {
    const h = await createFeedHarness({ open: { entry: 'list', seed: listSeed() } });
    h.likes.seed({ postId: OTHER, likeCount: 39, isLiked: true });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().content).toMatchObject({ likeCount: 38, isLiked: false });
  });

  it('TC-LIKE-010 좋아요 404로 removed가 오면 상세를 닫는다', async () => {
    const h = await createFeedHarness({ open: { entry: 'mine', postId: MINE } });
    await h.viewModel.onShown();
    h.likes.emit({ kind: 'removed', postId: MINE });
    expect(h.navigator.closeCount).toBe(1);
  });

  it('TC-LIKE-025 다른 게시물의 알림은 무시한다', async () => {
    const h = await createFeedHarness({ open: { entry: 'mine', postId: MINE } });
    await h.viewModel.onShown();
    h.likes.emit({ kind: 'updated', snapshot: { postId: OTHER, likeCount: 99, isLiked: true } });
    expect(h.viewModel.getSnapshot().content).toMatchObject({ likeCount: 10, isLiked: false });
    expect(h.navigator.closeCount).toBe(0);
  });
});
