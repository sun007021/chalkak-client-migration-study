import { ids, openToday, ready } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';
import { finish, settle } from '../../test/homeHarness';
import { createPostHarness } from '../../test/postHarness';
import type { PostHarness } from '../../test/postHarness';
import { TODAY, YESTERDAY, postId, postsKey } from '../../test/postRoutes';
import type { DisplayViewModel } from './DisplayViewModel';

const NEW_POST = postId('299');
const CREATED = { type: 'created', postId: NEW_POST, topicDate: TODAY, moderationStatus: 'PENDING' } as const;

/** 오늘 최신순 첫 페이지에 방금 올린 사진(299)이 맨 앞에 더 있는 응답. */
function withNewPost() {
  const base = loadFixture('display/posts-list__recent-page1.json').json as { posts: Record<string, unknown>[] };
  const mine = { ...base.posts[0]!, id: NEW_POST, isMine: true, likeCount: 0, isLiked: false, title: null };
  return () => json(200, { ...base, posts: [mine, ...base.posts] });
}

async function visited(h: PostHarness, vm: DisplayViewModel) {
  await openToday(h, vm); // 오늘 최신순을 캐시에 남긴다
  const todayIds = ids(ready(vm).posts);
  await finish(h, vm.applyRoute({ date: YESTERDAY, sort: 'popular' }));
  const yesterdayIds = ids(ready(vm).posts);
  return { todayIds, yesterdayIds };
}

describe('DisplayViewModel created 변경(업로드 직후 전시, REQ-UPL-062)', () => {
  it('TC-UPL-060 created 뒤 그 날짜로 돌아오면 방금 올린 사진이 빠진 낡은 캐시를 보이지 않고 다시 받아 보인다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    const { todayIds, yesterdayIds } = await visited(h, vm);
    expect(todayIds).not.toContain('299');
    h.changes.publish(CREATED);
    h.router.set(postsKey(TODAY, 'recent'), withNewPost());
    const moving = vm.applyRoute({ date: TODAY, sort: 'recent' });
    expect(ids(ready(vm).posts)).toEqual(yesterdayIds); // 낡은 오늘 목록(todayIds)을 먼저 보이지 않는다
    await finish(h, moving);
    expect(ids(ready(vm).posts)[0]).toBe('299');
    expect(ids(ready(vm).posts)).toEqual(['299', ...todayIds]);
  });

  it('TC-UPL-060 다른 날짜의 캐시는 그대로 두어 즉시 보인다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    const { yesterdayIds } = await visited(h, vm);
    await finish(h, vm.applyRoute({ date: TODAY, sort: 'recent' }));
    h.changes.publish(CREATED);
    const back = vm.applyRoute({ date: YESTERDAY, sort: 'popular' });
    expect(ids(ready(vm).posts)).toEqual(yesterdayIds);
    await finish(h, back);
  });

  it('TC-UPL-060 지금 그 날짜를 보고 있으면 화면을 비우지 않고(loading 없음) 첫 페이지를 조용히 다시 받아 사진이 나타난다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    const statuses: string[] = [];
    vm.subscribe(() => statuses.push(vm.state.body.status));
    h.router.set(postsKey(TODAY, 'recent'), withNewPost());
    h.changes.publish(CREATED);
    await finish(h, Promise.resolve());
    await settle();
    expect(h.router.calls(postsKey(TODAY, 'recent')).length).toBeGreaterThan(0);
    expect(statuses).not.toContain('loading');
    expect(ids(ready(vm).posts)[0]).toBe('299');
    expect(ready(vm).refreshing).toBe(false);
  });
});
