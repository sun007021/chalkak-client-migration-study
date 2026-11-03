import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { gated } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { finish, settle } from '../../test/homeHarness';
import { createLikeServer } from '../../test/likeServer';
import { createPostHarness } from '../../test/postHarness';
import type { PostHarness } from '../../test/postHarness';
import { MINE, OTHER, deleteKey, detailKey, likeKey, postId, titleKey } from '../../test/postRoutes';
import type { PostChange, PostSeed } from '../post/postModels';

const seedOf = (id: string, over: Partial<PostSeed> = {}): PostSeed => ({
  id,
  authorId: id === MINE ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  originalImageUrl: `https://cdn.example.test/posts/${id}/original.webp`,
  thumbnailImageUrl: `https://cdn.example.test/posts/${id}/thumbnail.webp`,
  title: id === MINE ? '비 오는 날' : '은행잎',
  likeCount: id === MINE ? 10 : 38,
  isLiked: false,
  isMine: id === MINE,
  ...over,
});
const SEED_OTHER = seedOf(OTHER);
const SEED_MINE = seedOf(MINE);

/** 상세를 열고 확정(응답 도착)까지 기다린다. */
async function open(h: PostHarness, id: string, opts: { seed?: PostSeed | null; assumeMine?: boolean; userId?: string | null } = {}) {
  const { vm, navigator } = h.feed({ postId: id, seed: opts.seed === undefined ? seedOf(id) : opts.seed, assumeMine: opts.assumeMine, userId: opts.userId });
  await finish(h, vm.load());
  return { vm, navigator };
}
const record = (h: PostHarness) => {
  const events: PostChange[] = [];
  h.changes.subscribe((c) => events.push(c));
  return events;
};
const puts = (h: PostHarness, id: string) => h.router.calls(titleKey(id));

describe('FeedViewModel 로드 (REQ-FEED-001~010, TC-FEED-001~012)', () => {
  it('TC-FEED-001 시드가 있으면 상세 응답 전에도 시드 내용을 보여 주고 좋아요·수정·삭제는 막는다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [detailKey(MINE)]: gated(gate, 'feed/posts-detail__mine-today') } });
    const { vm } = h.feed({ postId: MINE, seed: SEED_MINE });
    const loading = vm.load();
    await settle();
    expect(vm.state).toMatchObject({ view: { kind: 'content' }, confirmed: false, isMine: true, canLike: false, canEditTitle: false, canDelete: false });
    expect(vm.state.post).toMatchObject({ id: MINE, title: '비 오는 날', likeCount: 10, topicDate: null, topicTitle: null });
    await vm.onLikePress();
    vm.openTitleEdit();
    vm.openDelete();
    expect(vm.state.titleDialog.open).toBe(false);
    expect(vm.state.deleteDialog.open).toBe(false);
    expect(h.router.calls(likeKey('PUT', MINE))).toHaveLength(0);
    gate.resolve();
    await finish(h, loading);
    expect(vm.state).toMatchObject({ confirmed: true, canLike: true, canEditTitle: true, canDelete: true });
    expect(vm.state.post).toMatchObject({ topicDate: '2026-10-27', topicTitle: '가을 하늘' });
  });

  it('TC-FEED-002 시드가 없으면 Loading 뒤 내용이 되고 GET /posts/{id}를 한 번 부른다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [detailKey(OTHER)]: gated(gate, 'feed/posts-detail__other') } });
    const { vm } = h.feed({ postId: OTHER, seed: null });
    const loading = vm.load();
    await settle();
    expect(vm.state).toMatchObject({ view: { kind: 'loading' }, post: null });
    gate.resolve();
    await finish(h, loading);
    expect(vm.state).toMatchObject({ view: { kind: 'content' }, confirmed: true, isMine: false, canLike: true, canEditTitle: false, canDelete: false });
    expect(h.router.calls(detailKey(OTHER))).toHaveLength(1);
  });

  it('TC-FEED-003 썸네일이 null이어도 오류가 아니다', async () => {
    const id = postId(205);
    const h = createPostHarness({ routes: { [detailKey(id)]: 'feed/posts-detail__null-thumbnail' } });
    const { vm } = await open(h, id, { seed: null });
    expect(vm.state.view.kind).toBe('content');
    expect(vm.state.post!.thumbnailImageUrl).toBeNull();
  });

  it('TC-FEED-004 D-26 isMine은 authorId와 저장된 userId 비교로 정한다(응답에는 isMine이 없다)', async () => {
    const h = createPostHarness();
    expect((await open(h, MINE, { seed: null })).vm.state.isMine).toBe(true);
    expect((await open(h, OTHER, { seed: null })).vm.state.isMine).toBe(false);
    expect((await open(h, MINE, { seed: null, userId: null })).vm.state.isMine).toBe(false);
  });

  it('TC-FEED-004 REQ-FEED-002 기록·푸시에서 연(assumeMine) 상세는 확정 전에도 내 것이고 확정 뒤에도 내 것으로 유지된다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [detailKey(MINE)]: gated(gate, 'feed/posts-detail__mine-today') } });
    const { vm } = h.feed({ postId: MINE, seed: SEED_OTHER && seedOf(MINE, { isMine: false }), assumeMine: true, userId: null });
    const loading = vm.load();
    await settle();
    expect(vm.state.isMine).toBe(true);
    gate.resolve();
    await finish(h, loading);
    expect(vm.state.isMine).toBe(true);
  });

  it('TC-FEED-007 404면 not-found 화면이고 시드가 있었으면 removed를 알려 목록에서 빠지게 한다', async () => {
    const h = createPostHarness({ routes: { [detailKey(OTHER)]: 'feed/posts-detail__404-not-found' } });
    const events = record(h);
    const { vm } = await open(h, OTHER, { seed: SEED_OTHER });
    expect(vm.state).toMatchObject({ view: { kind: 'not-found' }, canLike: false });
    expect(events).toEqual([{ type: 'removed', postId: OTHER }]);
    expect(h.changes.wasRemoved(OTHER)).toBe(true);
  });

  it('TC-FEED-007 시드 없이 열어 404여도 not-found 화면이다', async () => {
    const h = createPostHarness({ routes: { [detailKey(OTHER)]: 'feed/posts-detail__404-not-found' } });
    const { vm } = await open(h, OTHER, { seed: null });
    expect(vm.state.view).toEqual({ kind: 'not-found' });
  });

  it.each([
    ['feed/posts-detail__400-invalid-id', 'load'],
    ['feed/posts-detail__500-server-error', 'load'],
    ['feed/posts-detail__invalid-schema', 'invalid'],
  ] as const)('TC-FEED-008 TC-FEED-009 시드 없이 %s면 오류 화면(%s)이고 다시 시도하면 성공한다', async (fixture, reason) => {
    const h = createPostHarness({ routes: { [detailKey(OTHER)]: fixture } });
    const { vm } = await open(h, OTHER, { seed: null });
    expect(vm.state.view).toEqual({ kind: 'error', reason });
    h.router.set(detailKey(OTHER), 'feed/posts-detail__other');
    await finish(h, vm.retry());
    expect(vm.state.view.kind).toBe('content');
    expect(vm.state.confirmed).toBe(true);
  });

  it('TC-FEED-008 연결 실패는 network 오류 화면이다', async () => {
    const h = createPostHarness({ routes: { [detailKey(OTHER)]: () => Promise.reject(new TypeError('Failed to fetch')) } });
    const { vm } = await open(h, OTHER, { seed: null });
    expect(vm.state.view).toEqual({ kind: 'error', reason: 'network' });
  });

  it.each([
    ['feed/posts-detail__500-server-error', t('feed.error.load')],
    ['feed/posts-detail__invalid-schema', t('feed.error.invalid')],
  ])('TC-FEED-012 시드가 있으면 %s여도 시드 내용을 유지하고 토스트만 띄우며 확정 전까지 막는다', async (fixture, message) => {
    const h = createPostHarness({ routes: { [detailKey(OTHER)]: fixture } });
    const { vm } = await open(h, OTHER, { seed: SEED_OTHER });
    expect(vm.state).toMatchObject({ view: { kind: 'content' }, confirmed: false, canLike: false });
    expect(h.toasts.messages).toEqual([message]);
  });

  it('TC-FEED-012 시드가 있고 연결 실패면 토스트 "네트워크 연결을 확인해 주세요"이고 좋아요가 막힌다', async () => {
    const h = createPostHarness({ routes: { [detailKey(OTHER)]: () => Promise.reject(new TypeError('Failed to fetch')) } });
    const { vm } = await open(h, OTHER, { seed: SEED_OTHER });
    expect(h.toasts.messages).toEqual([t('common.error.network')]);
    await vm.onLikePress();
    expect(h.router.calls(likeKey('PUT', OTHER))).toHaveLength(0);
  });

  it('TC-FEED-010 이미 보이는 상세를 다시 확인해 실패하면 내용을 유지하고 토스트만 띄운다', async () => {
    const h = createPostHarness();
    const { vm } = await open(h, OTHER);
    h.router.set(detailKey(OTHER), 'feed/posts-detail__500-server-error');
    await finish(h, vm.refresh());
    expect(vm.state).toMatchObject({ view: { kind: 'content' }, confirmed: true, refreshing: false });
    expect(h.toasts.messages).toEqual([t('feed.error.load')]);
  });

  it('TC-FEED-011 화면 이탈(dispose) 뒤에 늦은 응답이 와도 오류·토스트가 되지 않는다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [detailKey(OTHER)]: gated(gate, 'feed/posts-detail__other') } });
    const { vm } = h.feed({ postId: OTHER, seed: null });
    void vm.load();
    await settle();
    vm.dispose();
    gate.resolve();
    await settle();
    expect(h.toasts.messages).toEqual([]);
  });
});

describe('FeedViewModel 수정·삭제 가능 여부 (TC-FEED-016, 017, 034)', () => {
  it('TC-FEED-016 내 오늘 게시물만 수정 가능하고 남의 글·지난 주제는 불가하다', async () => {
    const past = postId(290);
    const h = createPostHarness({ routes: { [detailKey(past)]: 'feed/posts-detail__mine-past' } });
    expect((await open(h, MINE)).vm.state).toMatchObject({ canEditTitle: true, canDelete: true });
    expect((await open(h, OTHER)).vm.state).toMatchObject({ canEditTitle: false, canDelete: false });
    const pastVm = (await open(h, past, { seed: null })).vm;
    expect(pastVm.state).toMatchObject({ isMine: true, canEditTitle: false, canDelete: true });
    pastVm.openTitleEdit();
    expect(pastVm.state.titleDialog.open).toBe(false);
  });

  it('TC-FEED-017 KST 23:59:59.999에는 수정할 수 있고 화면이 열린 채 자정을 지나면 수정할 수 없게 된다', async () => {
    const h = createPostHarness({ now: '2026-10-27T14:59:59.999Z' });
    const { vm } = await open(h, MINE);
    expect(vm.state.canEditTitle).toBe(true);
    await h.clock.advance(1);
    expect(vm.state.canEditTitle).toBe(false);
    expect(vm.state.canDelete).toBe(true);
  });

  it('TC-FEED-017 자정 뒤에 열면 처음부터 수정할 수 없다', async () => {
    const h = createPostHarness({ now: '2026-10-27T15:00:00.000Z' });
    const { vm } = await open(h, MINE);
    expect(vm.state.canEditTitle).toBe(false);
  });

  it('TC-FEED-016 남의 게시물에서는 어떤 수정·삭제 요청도 나가지 않는다', async () => {
    const h = createPostHarness();
    const { vm } = await open(h, OTHER);
    vm.openTitleEdit();
    vm.openDelete();
    await vm.saveTitle();
    await vm.confirmDelete();
    expect(h.ff.calls.filter((c) => c.method === 'PUT' || c.method === 'DELETE')).toEqual([]);
  });
});

describe('FeedViewModel 좋아요 (D-04, TC-LIKE-006, 023, 024)', () => {
  it('TC-LIKE-006 확정 뒤 하트를 누르면 즉시 낙관 반영되고 서버 값으로 확정된다', async () => {
    const h = createPostHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    const { vm } = await open(h, OTHER);
    const press = vm.onLikePress();
    expect(vm.state.post).toMatchObject({ isLiked: true, likeCount: 39 });
    await server.succeed();
    await finish(h, press);
    expect(vm.state.post).toMatchObject({ isLiked: true, likeCount: 39 });
  });

  it('TC-LIKE-009 실패하면 되돌리고 토스트를 띄운다(무음 롤백 금지)', async () => {
    const h = createPostHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    const { vm } = await open(h, OTHER);
    const press = vm.onLikePress();
    await server.invalid();
    await finish(h, press);
    expect(vm.state.post).toMatchObject({ isLiked: false, likeCount: 38 });
    expect(h.toasts.messages).toEqual([t('like.error.generic')]);
  });

  it('TC-LIKE-010 좋아요가 404면 롤백하고 토스트를 띄운 뒤 상세를 닫는다', async () => {
    const h = createPostHarness({ routes: { [likeKey('PUT', OTHER)]: 'like/posts-likes-put__404-not-found' } });
    const events = record(h);
    const { vm, navigator } = await open(h, OTHER);
    await finish(h, vm.onLikePress());
    expect(navigator.closes).toBe(1);
    expect(h.toasts.messages).toEqual([t('like.error.generic')]);
    expect(events).toContainEqual({ type: 'removed', postId: OTHER });
  });

  it('TC-LIKE-023 상세 재조회가 느리게 도착해도 먼저 끝난 좋아요를 덮지 않는다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    const { vm } = await open(h, OTHER);
    h.router.set(detailKey(OTHER), gated(gate, 'feed/posts-detail__other'));
    const refreshing = vm.refresh();
    await settle();
    const press = vm.onLikePress();
    await server.succeed();
    await finish(h, press);
    gate.resolve();
    await finish(h, refreshing);
    expect(vm.state.post).toMatchObject({ isLiked: true, likeCount: 39 });
  });

  it('다른 화면의 like 이벤트는 상세의 값을 바꾼다(화면 간 동기)', async () => {
    const h = createPostHarness();
    const { vm } = await open(h, OTHER);
    h.changes.publish({ type: 'like', postId: OTHER, isLiked: true, likeCount: 77 });
    expect(vm.state.post).toMatchObject({ isLiked: true, likeCount: 77 });
    h.changes.publish({ type: 'like', postId: MINE, isLiked: true, likeCount: 1 });
    expect(vm.state.post).toMatchObject({ likeCount: 77 });
  });

  it('이 게시물의 removed 이벤트가 오면 상세를 닫는다(다른 게시물이면 무시)', async () => {
    const h = createPostHarness();
    const { vm, navigator } = await open(h, OTHER);
    h.changes.publish({ type: 'removed', postId: MINE });
    expect(navigator.closes).toBe(0);
    h.changes.publish({ type: 'removed', postId: OTHER });
    expect(navigator.closes).toBe(1);
    expect(vm.state.view.kind).not.toBe('error');
  });

  it('dispose 뒤에는 이벤트를 더 받지 않는다', async () => {
    const h = createPostHarness();
    const { vm, navigator } = await open(h, OTHER);
    vm.dispose();
    h.changes.publish({ type: 'removed', postId: OTHER });
    expect(navigator.closes).toBe(0);
  });
});

describe('FeedViewModel 제목 수정 (TC-FEED-018~033)', () => {
  it('TC-FEED-018 열면 현재 제목이 채워지고 취소는 요청을 보내지 않는다', async () => {
    const h = createPostHarness();
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    expect(vm.state.titleDialog).toEqual({ open: true, input: '비 오는 날', saving: false, error: null });
    vm.cancelTitleEdit();
    expect(vm.state.titleDialog.open).toBe(false);
    expect(puts(h, MINE)).toHaveLength(0);
  });

  it('TC-FEED-018 제목이 없으면 빈 입력으로 연다', async () => {
    const h = createPostHarness({ routes: { [detailKey(MINE)]: () => json(200, { ...(h0Mine()), title: null }) } });
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    expect(vm.state.titleDialog.input).toBe('');
  });

  it('TC-FEED-019 TC-FEED-020 입력은 code point 10개까지만 들어간다', async () => {
    const h = createPostHarness();
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    vm.setTitleInput('😀'.repeat(11));
    expect(Array.from(vm.state.titleDialog.input)).toHaveLength(10);
    vm.setTitleInput('👨‍👩‍👧👨‍👩‍👧가');
    expect(Array.from(vm.state.titleDialog.input)).toHaveLength(10);
  });

  it('TC-FEED-021 앞뒤 공백은 제거해 전송하고 화면에도 그 값을 보인다', async () => {
    const h = createPostHarness();
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    vm.setTitleInput(' 가나다라마바사아자차 ');
    await finish(h, vm.saveTitle());
    expect(puts(h, MINE)).toHaveLength(1);
    expect(JSON.parse(puts(h, MINE)[0]!.body as string)).toEqual({ title: '가나다라마바사아자차' });
    expect(vm.state.post!.title).toBe('가나다라마바사아자차');
  });

  it('TC-FEED-022 빈 입력은 title: null을 보내고 성공 뒤 제목은 null("무제")이다', async () => {
    const h = createPostHarness({ routes: { [titleKey(MINE)]: 'feed/posts-title-update__200-null-title' } });
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    vm.setTitleInput('   ');
    await finish(h, vm.saveTitle());
    expect(JSON.parse(puts(h, MINE)[0]!.body as string)).toEqual({ title: null });
    expect(vm.state.post!.title).toBeNull();
  });

  it('TC-FEED-023 TC-FEED-024 성공하면 다이얼로그를 닫고 토스트 1회, changes에 title 이벤트를 알린다', async () => {
    const h = createPostHarness();
    const events = record(h);
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    vm.setTitleInput('가나다라마바사아자차');
    await finish(h, vm.saveTitle());
    expect(vm.state.titleDialog.open).toBe(false);
    expect(h.toasts.messages).toEqual([t('feed.edit.success')]);
    expect(events).toEqual([{ type: 'title', postId: MINE, title: '가나다라마바사아자차' }]);
  });

  it('TC-FEED-025 저장 중에는 saving이고 연타해도 PUT은 1회다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [titleKey(MINE)]: gated(gate, 'feed/posts-title-update__200') } });
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    vm.setTitleInput('가나다라마바사아자차');
    const first = vm.saveTitle();
    const second = vm.saveTitle();
    await settle();
    expect(vm.state.titleDialog.saving).toBe(true);
    expect(puts(h, MINE)).toHaveLength(1);
    gate.resolve();
    await finish(h, Promise.all([first, second]));
    expect(puts(h, MINE)).toHaveLength(1);
    expect(vm.state.titleDialog.saving).toBe(false);
  });

  it('TC-FEED-026 상세 재조회가 진행 중일 때 제목을 수정하면 늦은 이전 응답이 수정한 제목을 덮지 않는다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness();
    const { vm } = await open(h, MINE);
    h.router.set(detailKey(MINE), gated(gate, 'feed/posts-detail__mine-today'));
    const refreshing = vm.refresh();
    await settle();
    vm.openTitleEdit();
    vm.setTitleInput('가나다라마바사아자차');
    await finish(h, vm.saveTitle());
    gate.resolve();
    await finish(h, refreshing);
    expect(vm.state.post!.title).toBe('가나다라마바사아자차');
  });

  it.each([
    ['TC-FEED-027', 'feed/posts-title-update__400-not-editable', t('feed.edit.error.state')],
    ['TC-FEED-028', 'feed/posts-title-update__400-title-too-long', t('feed.edit.error.state')],
    ['TC-FEED-029', 'feed/posts-title-update__403-banned', t('feed.edit.error.banned')],
  ])('%s 실패하면 다이얼로그와 입력을 유지하고 사유 문구를 둔다(%s)', async (_tc, fixture, message) => {
    const h = createPostHarness({ routes: { [titleKey(MINE)]: fixture } });
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    vm.setTitleInput('새 제목');
    await finish(h, vm.saveTitle());
    expect(vm.state.titleDialog).toEqual({ open: true, input: '새 제목', saving: false, error: message });
    expect(vm.state.post!.title).toBe('비 오는 날');
    expect(puts(h, MINE)).toHaveLength(1); // 403도 재요청하지 않는다
  });

  it('TC-FEED-030 404면 다이얼로그를 닫고 not-found 화면이 되며 removed를 알린다', async () => {
    const h = createPostHarness({ routes: { [titleKey(MINE)]: 'feed/posts-title-update__404-not-found' } });
    const events = record(h);
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    vm.setTitleInput('새 제목');
    await finish(h, vm.saveTitle());
    expect(vm.state.titleDialog.open).toBe(false);
    expect(vm.state.view).toEqual({ kind: 'not-found' });
    expect(events).toContainEqual({ type: 'removed', postId: MINE });
  });

  it('TC-FEED-031 401은 refresh 뒤 재전송하고 그래도 401이면 "로그인이 필요해요"다', async () => {
    const h = createPostHarness({
      routes: { [titleKey(MINE)]: ['feed/posts-title-update__401-unauthorized', 'feed/posts-title-update__401-unauthorized'], 'POST /auth/refresh': 'auth/refresh__success' },
    });
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    vm.setTitleInput('새 제목');
    await finish(h, vm.saveTitle());
    expect(h.router.calls('POST /auth/refresh')).toHaveLength(1);
    expect(vm.state.titleDialog).toMatchObject({ open: true, error: t('feed.edit.error.login') });
  });

  it('TC-FEED-032 5xx는 재시도(최대 2회) 뒤에도 실패면 "게시물 제목을 수정하지 못했어요"다', async () => {
    const h = createPostHarness({ routes: { [titleKey(MINE)]: 'feed/posts-title-update__500-server-error' } });
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    vm.setTitleInput('새 제목');
    await finish(h, vm.saveTitle());
    expect(puts(h, MINE)).toHaveLength(3);
    expect(vm.state.titleDialog.error).toBe(t('feed.edit.error.other'));
  });

  it('TC-FEED-032 연결 실패는 "네트워크 연결을 확인해 주세요"이고 입력을 유지해 다시 저장할 수 있다', async () => {
    let failing = true;
    const h = createPostHarness({
      routes: { [titleKey(MINE)]: () => (failing ? Promise.reject(new TypeError('Failed to fetch')) : json(200, { postId: MINE, title: '새 제목' })) },
    });
    const { vm } = await open(h, MINE);
    vm.openTitleEdit();
    vm.setTitleInput('새 제목');
    await finish(h, vm.saveTitle());
    expect(vm.state.titleDialog.error).toBe(t('common.error.network'));
    failing = false;
    await finish(h, vm.saveTitle());
    expect(vm.state.titleDialog.open).toBe(false);
    expect(vm.state.post!.title).toBe('새 제목');
  });

  it('TC-FEED-033 같은 제목을 다시 저장해도 200 멱등 응답을 성공으로 처리한다', async () => {
    const h = createPostHarness();
    const { vm } = await open(h, MINE);
    for (let i = 0; i < 2; i += 1) {
      vm.openTitleEdit();
      vm.setTitleInput('가나다라마바사아자차');
      await finish(h, vm.saveTitle());
    }
    expect(puts(h, MINE)).toHaveLength(2);
    expect(vm.state.titleDialog.error).toBeNull();
  });
});

describe('FeedViewModel 삭제 (TC-FEED-034~045)', () => {
  it('TC-FEED-035 삭제 버튼은 확인창을 열고 취소하면 요청이 없다', async () => {
    const h = createPostHarness();
    const { vm } = await open(h, MINE);
    vm.openDelete();
    expect(vm.state.deleteDialog).toEqual({ open: true, deleting: false });
    vm.cancelDelete();
    expect(vm.state.deleteDialog.open).toBe(false);
    expect(h.router.calls(deleteKey(MINE))).toHaveLength(0);
  });

  it('TC-FEED-036 204면 removed를 알리고 토스트 "게시물을 삭제했어요"를 1회 띄운 뒤 닫는다', async () => {
    const h = createPostHarness();
    const events = record(h);
    const { vm, navigator } = await open(h, MINE);
    vm.openDelete();
    await finish(h, vm.confirmDelete());
    expect(events).toEqual([{ type: 'removed', postId: MINE }]);
    expect(h.toasts.messages).toEqual([t('feed.delete.success')]);
    expect(navigator.closes).toBe(1);
    expect(h.changes.wasRemoved(MINE)).toBe(true);
  });

  it('TC-FEED-038 삭제 진행 중 연타해도 DELETE는 1회고 완료 뒤 반복 탭도 무시한다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [deleteKey(MINE)]: async () => { await gate.promise; return new Response(null, { status: 204 }); } } });
    const { vm, navigator } = await open(h, MINE);
    vm.openDelete();
    const a = vm.confirmDelete();
    const b = vm.confirmDelete();
    await settle();
    expect(vm.state.deleteDialog.deleting).toBe(true);
    gate.resolve();
    await finish(h, Promise.all([a, b]));
    await finish(h, vm.confirmDelete());
    expect(h.router.calls(deleteKey(MINE))).toHaveLength(1);
    expect(navigator.closes).toBe(1);
  });

  it.each([
    ['TC-FEED-039', 'feed/posts-delete__400-validating', t('feed.delete.error.state')],
    ['TC-FEED-039', 'feed/posts-delete__400-rejected', t('feed.delete.error.state')],
    ['TC-FEED-040', 'feed/posts-delete__403-not-owner', t('feed.delete.error.forbidden')],
    ['TC-FEED-042', 'feed/posts-delete__500-server-error', t('feed.delete.error.other')],
  ])('%s %s는 화면에 머물고 토스트로 알리며 다시 시도할 수 있다', async (_tc, fixture, message) => {
    const h = createPostHarness({ routes: { [deleteKey(MINE)]: fixture } });
    const { vm, navigator } = await open(h, MINE);
    vm.openDelete();
    await finish(h, vm.confirmDelete());
    expect(h.toasts.messages).toEqual([message]);
    expect(navigator.closes).toBe(0);
    expect(vm.state.view.kind).toBe('content');
    expect(vm.state.deleteDialog.deleting).toBe(false);
    h.router.set(deleteKey(MINE), 'feed/posts-delete__204');
    vm.openDelete();
    await finish(h, vm.confirmDelete());
    expect(navigator.closes).toBe(1);
  });

  it('TC-FEED-041 404면 not-found 화면 + removed + 토스트 "게시물을 찾을 수 없어요"다', async () => {
    const h = createPostHarness({ routes: { [deleteKey(MINE)]: 'feed/posts-delete__404-not-found' } });
    const events = record(h);
    const { vm } = await open(h, MINE);
    vm.openDelete();
    await finish(h, vm.confirmDelete());
    expect(vm.state.view).toEqual({ kind: 'not-found' });
    expect(events).toContainEqual({ type: 'removed', postId: MINE });
    expect(h.toasts.messages).toEqual([t('feed.error.not-found')]);
  });

  it('TC-FEED-042 연결 실패는 "네트워크 연결을 확인해 주세요", 401은 "로그인이 필요해요"다', async () => {
    const h = createPostHarness({ routes: { [deleteKey(MINE)]: () => Promise.reject(new TypeError('Failed to fetch')) } });
    const { vm } = await open(h, MINE);
    vm.openDelete();
    await finish(h, vm.confirmDelete());
    expect(h.toasts.messages).toEqual([t('common.error.network')]);
    h.router.set(deleteKey(MINE), ['feed/posts-delete__401-unauthorized', 'feed/posts-delete__401-unauthorized']);
    h.router.set('POST /auth/refresh', 'auth/refresh__success');
    vm.openDelete();
    await finish(h, vm.confirmDelete());
    expect(h.toasts.messages.at(-1)).toBe(t('feed.edit.error.login'));
  });

  it('TC-FEED-045 삭제 진행 중 화면을 떠나도 결과는 changes에 반영된다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [deleteKey(MINE)]: async () => { await gate.promise; return new Response(null, { status: 204 }); } } });
    const events = record(h);
    const { vm } = await open(h, MINE);
    vm.openDelete();
    const deleting = vm.confirmDelete();
    await settle();
    vm.dispose();
    gate.resolve();
    await finish(h, deleting);
    expect(events).toEqual([{ type: 'removed', postId: MINE }]);
  });

  it('TC-FEED-044 삭제한 id는 기억되어 늦은 목록 응답에서 걸러진다', async () => {
    const h = createPostHarness();
    const { vm } = await open(h, MINE);
    vm.openDelete();
    await finish(h, vm.confirmDelete());
    expect(h.changes.withoutRemoved([{ id: MINE }, { id: OTHER }])).toEqual([{ id: OTHER }]);
  });
});

function h0Mine(): object {
  return {
    id: MINE,
    authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    topic: { id: '11111111-1111-4111-8111-111111111127', title: '가을 하늘', topicDate: '2026-10-27' },
    originalImageUrl: `https://cdn.example.test/posts/${MINE}/original.webp`,
    thumbnailImageUrl: null,
    signatureOriginalImageUrl: null,
    likeCount: 10,
    isLiked: false,
  };
}
