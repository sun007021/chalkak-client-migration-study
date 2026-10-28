import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { t } from '../../shared/copy';
import { flush } from '../home/__testing__/createHomeHarness';
import { createFeedHarness, DELETE_MINE, gated, MINE } from './__testing__/createFeedHarness';

async function openMine(routes: Record<string, unknown> = {}) {
  const h = await createFeedHarness({
    open: { entry: 'mine', postId: MINE },
    routes: routes as never,
  });
  await h.viewModel.onShown();
  return h;
}
const deletes = (h: Awaited<ReturnType<typeof openMine>>) =>
  h.transport.requests.filter((r) => r.method === 'DELETE');

describe('FeedViewModel 삭제', () => {
  it('TC-FEED-035 삭제 버튼은 확인창만 열고, 취소하면 요청이 없다', async () => {
    const h = await openMine();
    h.viewModel.requestDelete();
    expect(h.viewModel.getSnapshot().deleteDialogOpen).toBe(true);
    expect(deletes(h)).toEqual([]);
    h.viewModel.cancelDelete();
    expect(h.viewModel.getSnapshot().deleteDialogOpen).toBe(false);
    expect(deletes(h)).toEqual([]);
  });

  it('TC-FEED-036 TC-FEED-043 204면 이전 화면으로 돌아가며 삭제를 알리고 토스트가 한 번 뜬다', async () => {
    const h = await openMine();
    h.viewModel.requestDelete();
    await h.viewModel.confirmDelete();
    expect(deletes(h)).toHaveLength(1);
    expect(h.navigator.closeCount).toBe(1);
    expect(h.changes.published).toEqual([{ kind: 'deleted', postId: MINE }]);
    expect(h.toast.messages).toEqual([t('feed.delete.success')]);
  });

  it('TC-FEED-038 삭제 진행 중 연타해도 DELETE는 1회이고 완료 뒤 반복 탭도 무시된다', async () => {
    const h = await openMine();
    const gate = gated(h.router, DELETE_MINE, 'feed/posts-delete__204');
    h.viewModel.requestDelete();
    const first = h.viewModel.confirmDelete();
    void h.viewModel.confirmDelete();
    await flush();
    expect(h.viewModel.getSnapshot().deleting).toBe(true);
    gate.release();
    await first;
    await h.viewModel.confirmDelete();
    expect(deletes(h)).toHaveLength(1);
    expect(h.navigator.closeCount).toBe(1);
  });

  it.each([
    ['TC-FEED-039', 'feed/posts-delete__400-validating', t('feed.delete.error.state')],
    ['TC-FEED-039', 'feed/posts-delete__400-rejected', t('feed.delete.error.state')],
    ['TC-FEED-040', 'feed/posts-delete__403-not-owner', t('feed.delete.error.forbidden')],
    ['TC-FEED-042', 'feed/posts-delete__500-server-error', t('feed.delete.error.other')],
  ])('%s %s는 화면에 머문 채 "%s"를 알리고 다시 시도할 수 있다', async (_tc, fixture, message) => {
    const h = await openMine({ [DELETE_MINE]: fixture });
    h.viewModel.requestDelete();
    await h.viewModel.confirmDelete();
    expect(h.toast.messages).toEqual([message]);
    expect(h.navigator.closeCount).toBe(0);
    expect(h.changes.published).toEqual([]);
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'content',
      deleting: false,
      deleteDialogOpen: false,
    });
    h.router.set(DELETE_MINE, 'feed/posts-delete__204');
    h.viewModel.requestDelete();
    await h.viewModel.confirmDelete();
    expect(h.navigator.closeCount).toBe(1);
  });

  it('TC-FEED-041 삭제 404는 "게시물을 찾을 수 없어요" 후 목록에서 제거하도록 알린다', async () => {
    const h = await openMine({ [DELETE_MINE]: 'feed/posts-delete__404-not-found' });
    h.viewModel.requestDelete();
    await h.viewModel.confirmDelete();
    expect(h.toast.messages).toEqual([t('feed.error.not-found')]);
    expect(h.changes.published).toEqual([{ kind: 'deleted', postId: MINE }]);
    expect(h.navigator.closeCount).toBe(1);
  });

  it('TC-FEED-042 삭제 401은 "로그인이 필요해요"와 재인증, 연결 실패는 네트워크 문구다', async () => {
    const h = await openMine({ [DELETE_MINE]: 'feed/posts-delete__401-unauthorized' });
    h.viewModel.requestDelete();
    await h.viewModel.confirmDelete();
    expect(h.toast.messages).toEqual([t('feed.edit.error.login')]);
    expect(h.authFlow.calls).toEqual(['login']);

    const offline = await openMine({ [DELETE_MINE]: networkFailure() });
    offline.viewModel.requestDelete();
    await offline.viewModel.confirmDelete();
    expect(offline.toast.messages).toEqual([t('common.error.network')]);
  });

  it('TC-FEED-045 삭제 진행 중 화면을 떠나도 결과는 반영된다(삭제 알림 발행)', async () => {
    const h = await openMine();
    const gate = gated(h.router, DELETE_MINE, 'feed/posts-delete__204');
    h.viewModel.requestDelete();
    const deleting = h.viewModel.confirmDelete();
    await flush();
    h.viewModel.onHidden();
    gate.release();
    await deleting;
    expect(h.changes.published).toEqual([{ kind: 'deleted', postId: MINE }]);
  });
});
