import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { reauth, unauthorized } from '../../core/http/__testing__/createNetHarness';
import { t } from '../../shared/copy';
import { flush } from '../home/__testing__/createHomeHarness';
import {
  createFeedHarness,
  GET_MINE,
  GET_OTHER,
  gated,
  listSeed,
  MINE,
  OTHER,
} from './__testing__/createFeedHarness';

const openOther = () => createFeedHarness({ open: { entry: 'list', seed: listSeed() } });
const openMine = () => createFeedHarness({ open: { entry: 'mine', postId: MINE } });

describe('FeedViewModel 상세 로드', () => {
  it('TC-FEED-001 전시 시드로 열면 응답 전에도 시드 내용이 보이고 좋아요·수정·삭제는 확정 뒤에만 열린다', async () => {
    const h = await openOther();
    const gate = gated(h.router, GET_OTHER, 'feed/posts-detail__other');
    const loading = h.viewModel.onShown();
    await flush();
    const before = h.viewModel.getSnapshot();
    expect(before).toMatchObject({
      status: 'content',
      confirmed: false,
      canLike: false,
      canEditTitle: false,
      canDelete: false,
    });
    expect(before.content).toMatchObject({
      postId: OTHER,
      title: '은행잎',
      likeCount: 38,
      isLiked: false,
    });
    expect(before.content?.originalImageUrl).toContain('/original.webp');
    gate.release();
    await loading;
    expect(h.viewModel.getSnapshot()).toMatchObject({ confirmed: true, canLike: true });
  });

  it('TC-FEED-001 시드 없이 열면(기록·푸시) 응답 전에는 로딩이고 좋아요가 비활성이다', async () => {
    const h = await openMine();
    const gate = gated(h.router, GET_MINE, 'feed/posts-detail__mine-today');
    const loading = h.viewModel.onShown();
    await flush();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'loading',
      canLike: false,
      content: null,
    });
    gate.release();
    await loading;
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content', canLike: true });
  });

  it('TC-FEED-004 기록에서 진입하면 응답 전에도, 응답 뒤(authorId == 로그인 userId)에도 내 게시물이다', async () => {
    const h = await openMine();
    expect(h.viewModel.getSnapshot().isMine).toBe(true);
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      isMine: true,
      canDelete: true,
      canEditTitle: true,
    });
  });

  it('TC-FEED-004 진입 값과 응답이 다르면 응답(authorId) 기준으로 판정한다(D-26)', async () => {
    const mineEntryOtherPost = await createFeedHarness({
      open: { entry: 'mine', postId: OTHER },
    });
    await mineEntryOtherPost.viewModel.onShown();
    expect(mineEntryOtherPost.viewModel.getSnapshot()).toMatchObject({
      isMine: false,
      canDelete: false,
    });

    const listSaysOthers = await createFeedHarness({
      open: { entry: 'list', seed: listSeed({ id: MINE, isMine: false }) },
    });
    await listSaysOthers.viewModel.onShown();
    expect(listSaysOthers.viewModel.getSnapshot().isMine).toBe(true);
  });

  it('TC-FEED-006 상세 401은 refresh 뒤 1회 재전송해 성공한다', async () => {
    const h = await openOther();
    h.router.set(GET_OTHER, [unauthorized(), 'feed/posts-detail__other']);
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().status).toBe('content');
    expect(h.transport.requests.map((r) => r.method)).toEqual(['GET', 'POST', 'GET']);
  });

  it('TC-FEED-006 REAUTHENTICATION_REQUIRED면 로그인 화면으로 보낸다', async () => {
    const h = await createFeedHarness({
      open: { entry: 'mine', postId: OTHER },
      routes: { [GET_OTHER]: unauthorized(), 'POST /auth/refresh': () => reauth() },
    });
    await h.viewModel.onShown();
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-FEED-005 서버가 401을 주는 직접 진입(refresh 뒤에도 401)은 로그인 화면으로 보낸다', async () => {
    const h = await createFeedHarness({
      open: { entry: 'mine', postId: OTHER },
      routes: { [GET_OTHER]: 'feed/posts-detail__401-unauthorized' },
    });
    await h.viewModel.onShown();
    expect(h.authFlow.calls).toEqual(['login']);
  });

  it('TC-FEED-007 404는 NotFound 화면이고 시드가 있으면 목록·캐시에서 빼도록 알린다', async () => {
    const h = await openOther();
    h.router.set(GET_OTHER, 'feed/posts-detail__404-not-found');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().status).toBe('not-found');
    expect(h.changes.published).toEqual([{ kind: 'deleted', postId: OTHER }]);
  });

  it('TC-FEED-007 시드가 없으면(기록·푸시) NotFound만 보인다', async () => {
    const h = await createFeedHarness({
      open: { entry: 'mine', postId: OTHER },
      routes: { [GET_OTHER]: 'feed/posts-detail__404-not-found' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().status).toBe('not-found');
  });

  it.each([
    ['feed/posts-detail__400-invalid-id', t('feed.error.load')],
    ['feed/posts-detail__500-server-error', t('feed.error.load')],
    ['feed/posts-detail__invalid-schema', t('feed.error.invalid')],
  ])(
    'TC-FEED-008 TC-FEED-009 %s(시드 없음)는 오류 화면 "%s"이고 다시 시도하면 재요청한다',
    async (fixture, message) => {
      const h = await createFeedHarness({
        open: { entry: 'mine', postId: OTHER },
        routes: { [GET_OTHER]: fixture },
      });
      await h.viewModel.onShown();
      expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'error', errorMessage: message });
      h.router.set(GET_OTHER, 'feed/posts-detail__other');
      await h.viewModel.retry();
      expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content', errorMessage: null });
    },
  );

  it('TC-FEED-008 연결 실패는 "네트워크 연결을 확인해 주세요."', async () => {
    const h = await createFeedHarness({
      open: { entry: 'mine', postId: OTHER },
      routes: { [GET_OTHER]: networkFailure() },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'error',
      errorMessage: t('common.error.network'),
    });
  });

  it.each([
    ['feed/posts-detail__500-server-error', t('feed.error.load')],
    ['feed/posts-detail__invalid-schema', t('feed.error.invalid')],
  ])(
    'TC-FEED-010 이미 보이는 상세의 갱신이 %s로 실패하면 내용을 유지하고 토스트만 띄운다',
    async (fixture, message) => {
      const h = await openOther();
      await h.viewModel.onShown();
      const content = h.viewModel.getSnapshot().content;
      h.router.set(GET_OTHER, fixture);
      await h.viewModel.onShown();
      expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content', content });
      expect(h.toast.messages).toEqual([message]);
    },
  );

  it('TC-FEED-011 요청 중 화면을 떠나면 늦은 응답은 무시되고 오류로 보이지 않는다', async () => {
    const h = await openOther();
    const gate = gated(h.router, GET_OTHER, 'feed/posts-detail__other');
    const loading = h.viewModel.onShown();
    await flush();
    h.viewModel.onHidden();
    gate.release();
    await loading;
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content', confirmed: false });
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-FEED-012 오프라인에서 시드 상세를 열면 시드 내용을 보여 주고 네트워크 토스트를 띄우며 좋아요·수정·삭제는 막힌다', async () => {
    const h = await createFeedHarness({
      open: { entry: 'list', seed: listSeed({ id: MINE, isMine: true }) },
      routes: { [GET_MINE]: networkFailure() },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'content',
      confirmed: false,
      canLike: false,
      canEditTitle: false,
      canDelete: false,
    });
    expect(h.toast.messages).toEqual([t('common.error.network')]);
  });

  it('TC-FEED-057 dispose 뒤에는 늦은 응답이 상태·토스트·변경 알림으로 남지 않는다', async () => {
    const h = await openOther();
    const gate = gated(h.router, GET_OTHER, 'feed/posts-detail__404-not-found');
    const loading = h.viewModel.onShown();
    await flush();
    h.viewModel.dispose();
    gate.release();
    await loading;
    expect(h.changes.published).toEqual([]);
    expect(h.toast.messages).toEqual([]);
    expect(h.likes.listenerCount).toBe(0);
  });

  it('TC-FEED-013 상세 응답 뒤 content에 topicDate(KST)와 제목이 들어간다(무제는 화면이 제목 null로 판단)', async () => {
    const h = await createFeedHarness({
      open: { entry: 'list', postId: '22222222-2222-4222-8222-222222222204' },
      routes: { 'GET /posts/22222222-2222-4222-8222-222222222204': 'feed/posts-detail__no-title' },
    });
    await h.viewModel.onShown();
    const content = h.viewModel.getSnapshot().content;
    expect(content?.title).toBeNull();
    expect(content?.topicDate?.toString()).toBe('2026-10-27');
  });

  it('TC-FEED-003 thumbnailImageUrl이 null이어도 오류가 아니다', async () => {
    const id = '22222222-2222-4222-8222-222222222205';
    const h = await createFeedHarness({
      open: { entry: 'list', postId: id },
      routes: { [`GET /posts/${id}`]: 'feed/posts-detail__null-thumbnail' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content' });
    expect(h.viewModel.getSnapshot().content?.thumbnailImageUrl).toBeNull();
  });

  it('TC-FEED-013 TC-FEED-015 뒤로가기는 navigator.close를 부른다', async () => {
    const h = await openOther();
    await h.viewModel.onShown();
    h.viewModel.onBackPress();
    expect(h.navigator.closeCount).toBe(1);
  });
});

describe('FeedViewModel 수정·삭제 버튼 노출', () => {
  it('TC-FEED-016 내 게시물 + 오늘 주제면 수정 버튼, 남의 게시물·지난 주제면 없고 수정 요청도 보내지 않는다', async () => {
    const mineToday = await openMine();
    await mineToday.viewModel.onShown();
    expect(mineToday.viewModel.getSnapshot().canEditTitle).toBe(true);

    const other = await openOther();
    await other.viewModel.onShown();
    expect(other.viewModel.getSnapshot()).toMatchObject({ canEditTitle: false, canDelete: false });
    other.viewModel.openTitleEditor();
    expect(other.viewModel.getSnapshot().titleDialog).toBeNull();
    await other.viewModel.saveTitle();
    expect(other.transport.requests.filter((r) => r.method === 'PUT')).toEqual([]);

    const past = await createFeedHarness({
      open: { entry: 'mine', postId: '22222222-2222-4222-8222-222222222290' },
      routes: { 'GET /posts/22222222-2222-4222-8222-222222222290': 'feed/posts-detail__mine-past' },
    });
    await past.viewModel.onShown();
    expect(past.viewModel.getSnapshot()).toMatchObject({ canEditTitle: false, canDelete: true });
    past.viewModel.openTitleEditor();
    expect(past.viewModel.getSnapshot().titleDialog).toBeNull();
    expect(past.transport.requests.filter((r) => r.method === 'PUT')).toEqual([]);
  });

  it('TC-FEED-017 KST 23:59:59.999에는 수정 버튼이 보이고 15:00:00.000Z(KST 10/28 00:00)에는 보이지 않는다(열린 채 자정을 지나도 재평가)', async () => {
    const h = await createFeedHarness({
      open: { entry: 'mine', postId: MINE },
      now: '2026-10-27T14:59:59.999Z',
    });
    await h.viewModel.onShown();
    expect(h.viewModel.canEditTitle()).toBe(true);
    h.clock.set('2026-10-27T15:00:00.000Z');
    expect(h.viewModel.canEditTitle()).toBe(false);
  });

  it('TC-FEED-034 삭제 버튼은 내 게시물에만 있고 남의 게시물에는 어떤 삭제 요청도 보내지 않는다', async () => {
    const other = await openOther();
    await other.viewModel.onShown();
    other.viewModel.requestDelete();
    await other.viewModel.confirmDelete();
    expect(other.transport.requests.filter((r) => r.method === 'DELETE')).toEqual([]);
    expect(other.viewModel.getSnapshot()).toMatchObject({
      canDelete: false,
      deleteDialogOpen: false,
    });
  });
});
