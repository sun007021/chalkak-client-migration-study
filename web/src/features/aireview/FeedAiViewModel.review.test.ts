import { t } from '../../copy/ko';
import type { DateString } from '../../core/time/kst';
import { deferred } from '../../test/deferred';
import { loadFixture } from '../../test/fixtures';
import { AI_POST_ID, aiGet, aiPost, createFeedAiHarness, finish, getFx, gets, posts, postFx, settle } from '../../test/aiReviewHarness';
import { FeedAiViewModel } from './FeedAiViewModel';

const TODAY = '2026-10-27' as DateString;

describe('FeedAiViewModel 코드리뷰 회귀', () => {
  it('리뷰9 TC-AIR-027 403 뒤 알약을 다시 눌러도 시트 없이 정지 안내 토스트가 다시 뜨고 POST는 늘지 않는다', async () => {
    const h = createFeedAiHarness({ routes: { [aiPost()]: postFx('403-banned') } });
    h.vm.setPost({ isMine: true, topicDate: TODAY });
    await finish(h, h.vm.onShown());
    h.vm.onPillPress();
    await finish(h, h.vm.confirmStart());
    expect(h.toasts.messages).toEqual([t('ai.error.banned')]);
    h.vm.onPillPress();
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
    expect(h.toasts.messages).toEqual([t('ai.error.banned'), t('ai.error.banned')]);
    expect(posts(h)).toBe(1);
  });

  it('리뷰10 캐시된 낡은 완료 상태가 있어도 자동 열기는 내 show의 GET 반영 뒤에만 하고 중복 onShown도 같다', async () => {
    const gate = deferred<void>();
    const h = createFeedAiHarness({ openAiReview: true, routes: { [aiGet()]: getFx('completed') } });
    const other = h.store.watch(AI_POST_ID, { refreshCompleted: true });
    await finish(h, other.show());
    other.release(); // 저장소에는 낡은 COMPLETED가 남는다
    h.router.set(aiGet(), async () => (await gate.promise, loadFixture(`${getFx('failed-cannot-retry')}.json`).toResponse()));
    h.vm.setPost({ isMine: true, topicDate: TODAY });
    const first = h.vm.onShown();
    const second = h.vm.onShown();
    await settle();
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
    gate.resolve();
    await finish(h, Promise.all([first, second]));
    expect(h.vm.state.sheet).toEqual({ kind: 'failed', reason: 'no-more', canRetry: false });
    expect(gets(h)).toBe(1); // 중복 onShown이 GET을 하나 더 보내지 않는다(라우트를 바꾼 뒤의 호출 수)
  });

  it('리뷰11 자동 열기를 소비하면 한 번만 알린다(해당 없음인 GET none에서도)', async () => {
    const calls: number[] = [];
    const h = createFeedAiHarness({ routes: { [aiGet()]: getFx('none') } });
    const vm = new FeedAiViewModel({ postId: AI_POST_ID, clock: h.clock, store: h.store, toast: h.toast, openAiReview: true, onOpenAiReviewConsumed: () => calls.push(1) });
    vm.setPost({ isMine: true, topicDate: TODAY });
    await finish(h, vm.onShown());
    vm.onHidden();
    await finish(h, vm.onShown());
    expect(calls).toHaveLength(1);
  });
});
