import { AI_REVIEW_POLL_INTERVAL_MS, AI_REVIEW_POLL_WINDOW_MS } from '../../constants';
import shared from '../../../../shared/constants.json';
import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { failWhile } from '../../test/displayAsserts';
import { loadFixture } from '../../test/fixtures';
import { AI_POST_ID, PAST_POST_ID, aiGet, aiPost, createAiHarness, finish, getFx, gets, posts, postFx, settle, tick, timed } from '../../test/aiReviewHarness';
import type { AiHarness } from '../../test/aiReviewHarness';

const entryOf = (h: AiHarness, postId: string = AI_POST_ID) => h.store.entry(postId);
const respond = (fixture: string) => loadFixture(`${fixture}.json`).toResponse();

async function shown(h: AiHarness, options: Parameters<AiHarness['watch']>[0] = {}) {
  const w = h.watch(options);
  await finish(h, w.show());
  return w;
}

describe('AiReviewStore 폴링 간격 (D-03, TC-AIR-032 ~ 034, 048)', () => {
  it('TC-AIR-048 폴링 간격 3초·창 300초 상수는 shared/constants.json과 같다(홈 5초가 아님)', () => {
    expect(AI_REVIEW_POLL_INTERVAL_MS).toBe(shared.AI_REVIEW_POLL_INTERVAL_MS);
    expect(AI_REVIEW_POLL_WINDOW_MS).toBe(shared.AI_REVIEW_POLL_WINDOW_MS);
    expect(AI_REVIEW_POLL_INTERVAL_MS).toBe(3_000);
    expect(AI_REVIEW_POLL_WINDOW_MS).toBe(300_000);
  });

  it('TC-AIR-032 REQ-AIR-025 POST 202 직후 2.9초에는 폴링 GET이 0건이고 3.0초에 1건이다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: [getFx('none'), getFx('processing')], [aiPost()]: postFx('202-processing') } });
    const w = await shown(h);
    await finish(h, w.request());
    const base = gets(h);
    await tick(h, 2_900);
    expect(gets(h)).toBe(base);
    await tick(h, 100);
    expect(gets(h)).toBe(base + 1);
  });

  it('TC-AIR-033 PROCESSING이 유지되면 3.0, 6.0, 9.0초…에 한 번씩 GET이 나간다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing') } });
    await shown(h);
    for (const expected of [2, 3, 4]) {
      await tick(h, 3_000);
      expect(gets(h)).toBe(expected);
    }
  });

  it('TC-AIR-033 응답이 3초보다 늦어도 동시에 두 요청이 진행되지 않는다', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const gates: ReturnType<typeof deferred<void>>[] = [];
    const h = createAiHarness();
    h.router.set(aiGet(), async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const call = gets(h);
      if (call >= 2) {
        const gate = deferred<void>();
        gates.push(gate);
        await gate.promise;
      }
      inFlight -= 1;
      return respond(getFx('processing'));
    });
    await shown(h);
    await tick(h, 12_000); // 두 번째 GET이 응답하지 않는 12초 동안
    expect(gets(h)).toBe(2);
    expect(maxInFlight).toBe(1);
    gates[0]!.resolve();
    await settle();
    await tick(h, 3_000);
    expect(maxInFlight).toBe(1);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING' });
  });

  it('TC-AIR-034 창 시작은 화면에 들어온 시각이고 서버 requestedAt(하루 전)은 기준이 아니다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing-old-requested-at') } });
    await shown(h);
    await tick(h, 299_999);
    expect(entryOf(h)).toMatchObject({ polling: true, stalled: false });
    await tick(h, 1);
    expect(entryOf(h)).toMatchObject({ polling: false, stalled: true });
  });

  it('REQ-AIR-034 TC-AIR-025 재요청의 창은 이번 POST를 보낸 시각부터 새로 300초다(이전 requestedAt·진입 시각과 무관)', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: [getFx('failed-can-retry'), getFx('processing')], [aiPost()]: postFx('202-processing') } });
    const w = await shown(h);
    await tick(h, 200_000); // FAILED라 폴링은 없다
    expect(gets(h)).toBe(1);
    await finish(h, w.request());
    await tick(h, 299_999);
    expect(entryOf(h)).toMatchObject({ polling: true, stalled: false });
    await tick(h, 1);
    expect(entryOf(h)).toMatchObject({ stalled: true });
  });
});

describe('AiReviewStore 폴링 창 (TC-AIR-035 ~ 038)', () => {
  it('TC-AIR-035 299.999초까지 폴링 GET이 허용되고(3~297초 사이 99회) 300.000초에는 GET 없이 중단하며 PROCESSING을 유지하고 POST는 0건이다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing') } });
    await shown(h);
    await tick(h, 299_999);
    expect(gets(h)).toBe(1 + 99);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', polling: true, stalled: false });
    await tick(h, 1);
    expect(gets(h)).toBe(1 + 99);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', polling: false, stalled: true });
    expect(h.clock.pendingTimers).toBe(0);
    await tick(h, 60_000);
    expect(gets(h)).toBe(1 + 99);
    expect(posts(h)).toBe(0);
  });

  it('TC-AIR-036 창이 끝난 뒤 화면에 다시 들어오면 GET부터 새 300초 창이 열리고 POST는 보내지 않는다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing') } });
    const w = await shown(h);
    await tick(h, 300_000);
    expect(entryOf(h)).toMatchObject({ stalled: true });
    const before = gets(h);
    w.hide();
    await finish(h, w.show());
    expect(gets(h)).toBe(before + 1);
    expect(entryOf(h)).toMatchObject({ stalled: false, polling: true, status: 'PROCESSING' });
    await tick(h, 299_999);
    expect(entryOf(h)).toMatchObject({ stalled: false });
    await tick(h, 1);
    expect(entryOf(h)).toMatchObject({ stalled: true });
    expect(posts(h)).toBe(0);
  });

  it('TC-AIR-037 창 종료 뒤 "AI 상태 다시 확인"은 GET 1회를 보내고 PROCESSING이면 폴링을 재개한다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing') } });
    const w = await shown(h);
    await tick(h, 300_000);
    const before = gets(h);
    await finish(h, w.recheck());
    expect(gets(h)).toBe(before + 1);
    expect(entryOf(h)).toMatchObject({ stalled: false, polling: true });
    await tick(h, 3_000);
    expect(gets(h)).toBe(before + 2);
    expect(posts(h)).toBe(0);
  });

  it('TC-AIR-037 창 종료 뒤 다시 확인했더니 COMPLETED면 결과를 표시하고 폴링하지 않는다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: [getFx('processing')] } });
    const w = await shown(h);
    await tick(h, 300_000);
    h.router.set(aiGet(), getFx('completed'));
    await finish(h, w.recheck());
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED', stalled: false, polling: false });
    expect(h.clock.pendingTimers).toBe(0);
  });

  it('TC-AIR-038 폴링 중 COMPLETED를 받으면 폴링을 멈추고 결과를 보인다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: [getFx('processing'), getFx('processing'), getFx('completed')] } });
    await shown(h);
    await tick(h, 6_000);
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED', polling: false });
    expect(entryOf(h)?.result?.overallScore).toBe(7.5);
    const before = gets(h);
    await tick(h, 30_000);
    expect(gets(h)).toBe(before);
    expect(h.clock.pendingTimers).toBe(0);
  });

  it('TC-AIR-038 폴링 중 FAILED를 받으면 폴링을 멈추고 실패 상태가 된다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: [getFx('processing'), getFx('failed-can-retry')] } });
    await shown(h);
    await tick(h, 3_000);
    expect(entryOf(h)).toMatchObject({ status: 'FAILED', canRequestAgain: true, polling: false });
    const before = gets(h);
    await tick(h, 30_000);
    expect(gets(h)).toBe(before);
    expect(posts(h)).toBe(0);
  });

  it('TC-AIR-038 서버가 자동 재시도하는 동안 PROCESSING이 이어지면 상태 참조가 바뀌지 않는다(UI가 바뀌지 않는다)', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing') } });
    await shown(h);
    const before = entryOf(h);
    await tick(h, 9_000);
    expect(entryOf(h)).toBe(before);
  });
});

describe('AiReviewStore 폴링 오류 (TC-AIR-039, 041, 046, 047, 029)', () => {
  it('TC-AIR-039 폴링 GET이 5xx여도 계속 폴링하고 오류 문구는 한 번만 보이며 복구 뒤 완료 결과를 표시한다', async () => {
    let failing = false;
    const h = createAiHarness();
    h.router.set(aiGet(), (_req, index) => (index === 0 ? respond(getFx('processing')) : failWhile(() => failing, getFx('500-server-error'), getFx('completed'))()));
    await shown(h);
    failing = true;
    await tick(h, 30_000); // 폴링이 계속 실패하는 30초
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', polling: true });
    expect(h.toasts.messages).toEqual([t('ai.error.load')]);
    failing = false;
    await tick(h, 6_000);
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED', polling: false });
    expect(h.toasts.messages).toEqual([t('ai.error.load')]);
  });

  it('TC-AIR-039 TC-AIR-046 연결 실패(오프라인)가 이어져도 계속 폴링하고 창은 계속 흐르며 복구되면 완료된다(네트워크 문구 1회)', async () => {
    let offline = false;
    const h = createAiHarness();
    h.router.set(aiGet(), (_req, index) => (index === 0 ? respond(getFx('processing')) : failWhile(() => offline, 'network', getFx('completed'))()));
    await shown(h);
    offline = true;
    await tick(h, 120_000);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', stalled: false });
    expect(h.toasts.messages).toEqual([t('ai.error.network')]);
    offline = false;
    await tick(h, 6_000);
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED' });
  });

  it('TC-AIR-046 오프라인이 창(300초) 끝까지 이어지면 창은 그대로 흘러 멈춘다', async () => {
    const h = createAiHarness();
    h.router.set(aiGet(), (_req, index) => (index === 0 ? respond(getFx('processing')) : failWhile(() => true, 'network', getFx('completed'))()));
    await shown(h);
    await tick(h, 300_000);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', stalled: true, polling: false });
  });

  it('TC-AIR-041 REQ-AIR-030 폴링 중 GET이 404면 메시지 없이 조회 불가(hidden)로 바꾸고 추가 조회를 막는다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: [getFx('processing'), getFx('404-not-found')] } });
    await shown(h);
    await tick(h, 3_000);
    expect(entryOf(h)).toMatchObject({ phase: 'hidden', polling: false });
    expect(h.toasts.messages).toEqual([]);
    const before = gets(h);
    await tick(h, 30_000);
    expect(gets(h)).toBe(before);
  });

  it('TC-AIR-029 REQ-AIR-030 폴링 중 401을 갱신할 수 없으면 폴링을 멈추고 인증 처리(세션 만료)에 맡긴다', async () => {
    const h = createAiHarness({ routes: { 'POST /auth/refresh': 'auth/refresh__reauthentication-required' } });
    h.router.set(aiGet(), (_req, index) => (index === 0 ? respond(getFx('processing')) : respond('ai-review/ai-review-post__401-unauthorized')));
    await shown(h);
    await tick(h, 3_000);
    expect(h.expired.count).toBe(1);
    expect(entryOf(h)).toMatchObject({ polling: false });
    const before = gets(h);
    await tick(h, 30_000);
    expect(gets(h)).toBe(before);
  });

  it('TC-AIR-047 D-21 폴링 GET이 503 Retry-After: 1이면 1초 기다린 뒤 다시 보내고(창 시계는 그대로) 완료를 받는다', async () => {
    const h = createAiHarness();
    const route = timed(h, [getFx('processing'), getFx('503-retry-after'), getFx('completed')]);
    h.router.set(aiGet(), route.route);
    await shown(h);
    await tick(h, 3_000); // 3초 폴링 GET이 503 + Retry-After
    await tick(h, 1_000);
    const [, failedAt, retriedAt] = route.times;
    expect(failedAt).toBe(3_000);
    expect(retriedAt! - failedAt!).toBeGreaterThanOrEqual(1_000);
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED' });
  });
});

describe('AiReviewStore 가시성과 낡은 응답 (TC-AIR-042 ~ 044, REQ-AIR-023, 028, 031)', () => {
  it('TC-AIR-042 REQ-AIR-028 가려지면 폴링을 멈추고 보이면 GET부터 새 300초 창을 시작한다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing') } });
    const w = await shown(h);
    await tick(h, 100_000);
    w.hide();
    expect(entryOf(h)).toMatchObject({ polling: false });
    const before = gets(h);
    await tick(h, 100_000);
    expect(gets(h)).toBe(before);
    await finish(h, w.show());
    expect(gets(h)).toBe(before + 1);
    await tick(h, 299_999);
    expect(entryOf(h)).toMatchObject({ stalled: false });
    await tick(h, 1);
    expect(entryOf(h)).toMatchObject({ stalled: true });
  });

  it('TC-AIR-042 이탈 뒤 도착한 폴링 GET 응답은 상태를 갱신하지 않는다', async () => {
    const gate = deferred<void>();
    const h = createAiHarness();
    h.router.set(aiGet(), async (_req, index) => {
      if (index === 1) {
        await gate.promise;
        return respond(getFx('completed'));
      }
      return respond(getFx('processing'));
    });
    const w = await shown(h);
    await tick(h, 3_000); // 두 번째 GET이 지연 중
    w.hide();
    gate.resolve();
    await settle();
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING' });
  });

  it('TC-AIR-042 REQ-AIR-023 POST 응답을 기다리다 이탈하면 늦게 온 응답은 상태를 바꾸지 않고 requesting도 풀리며, 복귀하면 GET부터 시작한다', async () => {
    const gate = deferred<void>();
    const h = createAiHarness({ routes: { [aiPost()]: async () => (await gate.promise, respond(postFx('202-processing'))) } });
    const w = await shown(h);
    void w.request();
    await settle();
    expect(entryOf(h)).toMatchObject({ requesting: true });
    w.hide();
    expect(entryOf(h)).toMatchObject({ requesting: false });
    gate.resolve();
    await settle();
    expect(entryOf(h)).toMatchObject({ status: 'NONE', polling: false });
    h.router.set(aiGet(), getFx('processing'));
    await finish(h, w.show());
    expect(gets(h)).toBe(1);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', polling: true });
  });

  it('TC-AIR-043 REQ-AIR-031 수동 갱신 뒤 늦게 도착한 이전 폴링 응답은 완료된 결과를 덮어쓰지 않는다', async () => {
    const gate = deferred<void>();
    const h = createAiHarness();
    h.router.set(aiGet(), async (_req, index) => {
      if (index === 1) {
        await gate.promise;
        return respond(getFx('processing')); // 느린 이전 폴링: 낡은 PROCESSING
      }
      return respond(index === 0 ? getFx('processing') : getFx('completed'));
    });
    const w = await shown(h);
    await tick(h, 3_000); // 폴링 GET(느림)
    await finish(h, w.recheck()); // 수동 갱신: 빠른 COMPLETED
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED' });
    gate.resolve();
    await settle();
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED', polling: false });
    expect(entryOf(h)?.result).not.toBeNull();
  });

  it('TC-AIR-044 게시물 A의 늦은 GET 응답은 게시물 B의 상태를 덮어쓰지 않는다', async () => {
    const gate = deferred<void>();
    const h = createAiHarness({
      routes: {
        [aiGet()]: async () => (await gate.promise, respond(getFx('completed'))),
        [aiGet(PAST_POST_ID)]: getFx('failed-can-retry'),
      },
    });
    const a = h.watch();
    void a.show();
    await settle();
    a.hide();
    a.release();
    const b = h.store.watch(PAST_POST_ID, { refreshCompleted: true });
    await finish(h, b.show());
    gate.resolve();
    await settle();
    expect(entryOf(h, PAST_POST_ID)).toMatchObject({ status: 'FAILED', result: null });
    expect(entryOf(h)).not.toMatchObject({ status: 'COMPLETED' });
  });

  it('TC-AIR-044 REQ-AIR-023 계정 전환(reset) 뒤에는 이전 계정의 GET·POST 응답을 폐기하고 상태도 비운다', async () => {
    const getGate = deferred<void>();
    const postGate = deferred<void>();
    const h = createAiHarness({ routes: { [aiPost()]: async () => (await postGate.promise, respond(postFx('202-processing'))) } });
    const w = await shown(h);
    h.router.set(aiGet(), async () => (await getGate.promise, respond(getFx('completed'))));
    void w.recheck();
    void w.request();
    await settle();
    h.store.reset();
    expect(entryOf(h)).toBeNull();
    getGate.resolve();
    postGate.resolve();
    await settle();
    expect(entryOf(h)).toBeNull();
    await tick(h, 30_000);
    expect(gets(h)).toBe(1); // 폴링이 이어지지 않는다
  });

  it('reset 뒤 다시 show하면 새 계정 기준으로 GET부터 시작한다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('completed') } });
    const w = await shown(h);
    h.store.reset();
    await finish(h, w.show());
    expect(gets(h)).toBe(2);
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED' });
  });

  it('REQ-AIR-028 보이는 손잡이가 하나라도 있으면 폴링은 계속되고(홈이 가려져도 상세가 보이는 동안) 모두 가려지면 멈춘다. 폴링은 게시물당 하나다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing') } });
    const home = await shown(h, { refreshCompleted: false });
    const feed = await shown(h);
    home.hide();
    const before = gets(h);
    await tick(h, 9_000);
    expect(gets(h) - before).toBe(3);
    feed.hide();
    expect(entryOf(h)).toMatchObject({ polling: false });
    await tick(h, 9_000);
    expect(gets(h) - before).toBe(3);
  });

  it('release한 손잡이는 가려진 것으로 본다(마지막 손잡이를 놓으면 폴링이 멈춘다)', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing') } });
    const w = await shown(h);
    w.release();
    const before = gets(h);
    await tick(h, 30_000);
    expect(gets(h)).toBe(before);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', polling: false });
  });
});
