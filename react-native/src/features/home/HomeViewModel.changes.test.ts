import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { d } from '../../core/time/__testing__/helpers';
import { createHomeHarness, flush } from './__testing__/createHomeHarness';

const RANKED = '22222222-2222-4222-8222-222222222202';
const WEEK_POST = '22222222-2222-4222-8222-222222222294';
const POPULAR_ROUTE = 'GET /posts?topicDate=2026-10-27&sort=popular&page=1&pageSize=20';

async function shown() {
  const h = await createHomeHarness();
  await h.viewModel.onShown();
  await flush();
  return h;
}

const popularPosts = (h: Awaited<ReturnType<typeof shown>>) => {
  const section = h.viewModel.getSnapshot().popular;
  return section.status === 'ready' ? section.posts : [];
};

describe('HomeViewModel 게시물 변경(삭제·제목) 반영', () => {
  it('삭제된 게시물은 랭킹에서 빠진다', async () => {
    const h = await shown();
    expect(popularPosts(h).some((p) => p.id === RANKED)).toBe(true);
    h.changes.publish({ kind: 'deleted', postId: RANKED });
    expect(popularPosts(h).some((p) => p.id === RANKED)).toBe(false);
  });

  it('삭제된 게시물은 이번 주 기록 칸에서 빠지고 기록 수가 줄어든다', async () => {
    const h = await shown();
    const before = h.viewModel.getSnapshot().weekly;
    expect(before.status === 'ready' && before.count).toBeGreaterThan(0);
    h.changes.publish({ kind: 'deleted', postId: WEEK_POST });
    const after = h.viewModel.getSnapshot().weekly;
    if (after.status !== 'ready' || before.status !== 'ready') throw new Error('weekly not ready');
    expect(after.days.find((day) => day.date.equals(d('2026-10-26')))?.entry).toBeNull();
    expect(after.count).toBe(before.count - 1);
  });

  it('제목이 바뀐 게시물은 랭킹의 제목이 바뀐다', async () => {
    const h = await shown();
    h.changes.publish({ kind: 'title-changed', postId: RANKED, title: '새 제목' });
    expect(popularPosts(h).find((p) => p.id === RANKED)?.title).toBe('새 제목');
  });

  it('새로고침 응답이 오는 중에 도착한 삭제·제목 변경이 그 응답에도 반영된다', async () => {
    const h = await shown();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    h.router.set(POPULAR_ROUTE, async () => {
      await gate;
      return fixtureResponse('home/posts-list__popular-8');
    });
    const reloading = h.viewModel.onShown();
    await flush();
    h.changes.publish({ kind: 'title-changed', postId: RANKED, title: '진행 중 변경' });
    h.changes.publish({ kind: 'deleted', postId: '22222222-2222-4222-8222-222222222203' });
    release();
    await reloading;
    expect(popularPosts(h).find((p) => p.id === RANKED)?.title).toBe('진행 중 변경');
    expect(popularPosts(h).some((p) => p.id.endsWith('203'))).toBe(false);
  });

  it('홈이 안 보이는 동안(구독 해제)에는 반응하지 않고 복귀 때 서버 값으로 다시 맞춘다', async () => {
    const h = await shown();
    h.viewModel.onHidden();
    expect(h.changes.listenerCount).toBe(0);
  });
});
