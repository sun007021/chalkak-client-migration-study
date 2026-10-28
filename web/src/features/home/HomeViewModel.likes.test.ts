import { t } from '../../copy/ko';
import { loadFixture } from '../../test/fixtures';
import { POPULAR_TODAY, POPULAR_YESTERDAY, createHomeHarness, finish, settle } from '../../test/homeHarness';
import type { HomeHarness } from '../../test/homeHarness';
import { createLikeServer } from '../../test/likeServer';
import { deferred } from '../../test/deferred';
import { MINE, OTHER, likeKey, postId } from '../../test/postRoutes';
import type { RankingKey } from './HomeViewModel';
import type { RankingSection } from './HomeViewModel';

const posts = (section: RankingSection) => {
  if (section.status !== 'ready') throw new Error(`ranking ${section.status}`);
  return section.posts;
};
const valueOf = (h: HomeHarness, key: RankingKey, id: string): [boolean, number] => {
  const p = posts(h.viewModel.state[key]).find((x) => x.id === id);
  if (!p) throw new Error(`${id} 없음`);
  return [p.isLiked, p.likeCount];
};
const open = async (h: HomeHarness) => {
  await finish(h, h.viewModel.onShown());
};

describe('HomeViewModel 랭킹 좋아요 (REQ-HOME-033, TC-LIKE-005, 014)', () => {
  it('TC-LIKE-005 오늘 인기 하트를 누르면 즉시 낙관 반영되고 서버 값으로 확정된다', async () => {
    const h = createHomeHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    await open(h);
    const press = h.viewModel.onRankingLikePress('popular', OTHER);
    expect(valueOf(h, 'popular', OTHER)).toEqual([true, 39]);
    await server.succeed();
    await finish(h, press);
    expect(valueOf(h, 'popular', OTHER)).toEqual([true, 39]);
    expect(server.methods).toEqual(['PUT']);
  });

  it('이미 좋아요한 사진의 하트는 DELETE로 취소하고 즉시 -1이다(TC-LIKE-007)', async () => {
    const h = createHomeHarness();
    const server = createLikeServer(h, postId(203), { isLiked: true, likeCount: 37 });
    await open(h);
    const press = h.viewModel.onRankingLikePress('popular', postId(203));
    expect(valueOf(h, 'popular', postId(203))).toEqual([false, 36]);
    await server.succeed();
    await finish(h, press);
    expect(server.methods).toEqual(['DELETE']);
  });

  it('TC-LIKE-009 실패하면 되돌리고 토스트 "좋아요를 반영하지 못했어요"를 띄운다', async () => {
    const h = createHomeHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    await open(h);
    const press = h.viewModel.onRankingLikePress('popular', OTHER);
    await server.invalid();
    await finish(h, press);
    expect(valueOf(h, 'popular', OTHER)).toEqual([false, 38]);
    expect(h.toasts.messages).toEqual([t('like.error.generic')]);
  });

  it('TC-LIKE-014 게스트가 하트를 누르면 상태 변화 없이 토스트 "좋아요를 누르려면 로그인이 필요해요"이고 요청이 없다', async () => {
    const h = createHomeHarness({ mode: 'guest' });
    await open(h);
    const calls = h.ff.calls.length;
    const before = valueOf(h, 'popular', OTHER);
    await h.viewModel.onRankingLikePress('popular', OTHER);
    expect(h.toasts.messages).toEqual([t('nav.guest.like')]);
    expect(valueOf(h, 'popular', OTHER)).toEqual(before);
    expect(h.ff.calls).toHaveLength(calls);
  });

  it('목록에 없는 id를 누르면 아무 일도 없다', async () => {
    const h = createHomeHarness();
    await open(h);
    const calls = h.ff.calls.length;
    await h.viewModel.onRankingLikePress('popular', postId(999));
    expect(h.ff.calls).toHaveLength(calls);
    expect(h.toasts.messages).toEqual([]);
  });

  it('어제 랭킹에서도 같은 규칙이다(둘 다 같은 저장소)', async () => {
    const h = createHomeHarness();
    const id = postId(261);
    const server = createLikeServer(h, id, { isLiked: false, likeCount: 30 });
    await open(h);
    const press = h.viewModel.onRankingLikePress('yesterday', id);
    expect(valueOf(h, 'yesterday', id)).toEqual([true, 31]);
    await server.succeed();
    await finish(h, press);
  });
});

describe('HomeViewModel 랭킹과 변경 이벤트 (D-04, TC-LIKE-021, TC-HOME-046)', () => {
  it('다른 화면의 like 이벤트는 오늘 인기에 반영된다', async () => {
    const h = createHomeHarness();
    await open(h);
    h.changes.publish({ type: 'like', postId: OTHER, isLiked: true, likeCount: 55 });
    expect(valueOf(h, 'popular', OTHER)).toEqual([true, 55]);
  });

  it('TC-LIKE-021 좋아요 완료 전에 보낸 재조회 응답이 늦게 와도 완료된 좋아요를 덮지 않는다', async () => {
    const gate = deferred<void>();
    const h = createHomeHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    await open(h);
    h.router.set(POPULAR_TODAY, async () => {
      await gate.promise;
      return loadFixture('home/posts-list__popular-8.json').toResponse(); // 좋아요 전에 읽은 값(false, 38)
    });
    const refreshing = h.viewModel.onShown();
    await settle();
    const press = h.viewModel.onRankingLikePress('popular', OTHER);
    await server.succeed();
    await finish(h, press);
    gate.resolve();
    await finish(h, refreshing);
    expect(valueOf(h, 'popular', OTHER)).toEqual([true, 39]);
  });

  it('removed 이벤트는 랭킹에서 해당 게시물을 뺀다', async () => {
    const h = createHomeHarness();
    await open(h);
    h.changes.publish({ type: 'removed', postId: OTHER });
    expect(posts(h.viewModel.state.popular).map((p) => p.id)).not.toContain(OTHER);
    expect(posts(h.viewModel.state.yesterday).length).toBe(3);
  });

  it('다시 불러온 랭킹 응답에서도 삭제된 게시물은 걸러진다', async () => {
    const h = createHomeHarness();
    await open(h);
    h.changes.publish({ type: 'removed', postId: OTHER });
    await finish(h, h.viewModel.onShown());
    expect(posts(h.viewModel.state.popular).map((p) => p.id)).not.toContain(OTHER);
    expect(h.router.calls(POPULAR_TODAY).length).toBeGreaterThanOrEqual(1);
  });

  it('TC-HOME-046 내 오늘 게시물이 removed면 히어로는 empty, 주간 기록의 그 칸은 비운다', async () => {
    const h = createHomeHarness();
    await open(h);
    expect(h.viewModel.state.hero.kind).toBe('photo');
    const before = h.viewModel.state.weekly.status === 'ready' ? h.viewModel.state.weekly.count : -1;
    h.changes.publish({ type: 'removed', postId: MINE });
    expect(h.viewModel.state.hero).toEqual({ kind: 'empty', banned: false });
    const weekly = h.viewModel.state.weekly;
    if (weekly.status !== 'ready') throw new Error('weekly');
    expect(weekly.count).toBe(before - 1);
    expect(weekly.days.some((d) => d.entry?.postId === MINE)).toBe(false);
  });

  it('다른 게시물의 removed는 히어로에 영향이 없다', async () => {
    const h = createHomeHarness();
    await open(h);
    h.changes.publish({ type: 'removed', postId: OTHER });
    expect(h.viewModel.state.hero.kind).toBe('photo');
  });

  it('title 이벤트는 랭킹 항목의 제목을 바꾼다', async () => {
    const h = createHomeHarness();
    await open(h);
    h.changes.publish({ type: 'title', postId: OTHER, title: '새 제목' });
    expect(posts(h.viewModel.state.popular).find((p) => p.id === OTHER)!.title).toBe('새 제목');
  });

  it('TC-LIKE-010 좋아요 404는 롤백 뒤 랭킹에서 빼고 토스트를 띄운다', async () => {
    const h = createHomeHarness();
    h.router.set(likeKey('PUT', OTHER), 'like/posts-likes-put__404-not-found');
    await open(h);
    await finish(h, h.viewModel.onRankingLikePress('popular', OTHER));
    expect(posts(h.viewModel.state.popular).map((p) => p.id)).not.toContain(OTHER);
    expect(h.toasts.messages).toEqual([t('like.error.generic')]);
  });

  it('어제 랭킹 라우트가 있어도 오늘 인기 좋아요가 어제 목록을 바꾸지 않는다(다른 게시물)', async () => {
    const h = createHomeHarness();
    await open(h);
    expect(h.router.calls(POPULAR_YESTERDAY)).toHaveLength(1);
    h.changes.publish({ type: 'like', postId: OTHER, isLiked: true, likeCount: 55 });
    expect(posts(h.viewModel.state.yesterday).map((p) => p.likeCount)).toEqual([30, 20, 12]);
  });
});
