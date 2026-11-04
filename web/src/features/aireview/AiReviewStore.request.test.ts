import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { failWhile } from '../../test/displayAsserts';
import { loadFixture } from '../../test/fixtures';
import { json } from '../../test/fixtureRouter';
import { AI_POST_ID, PAST_POST_ID, aiGet, aiPost, createAiHarness, finish, getFx, gets, posts, postFx, settle, tick } from '../../test/aiReviewHarness';
import type { AiHarness } from '../../test/aiReviewHarness';

const entryOf = (h: AiHarness, postId: string = AI_POST_ID) => h.store.entry(postId);

/** 보이는 상태로 붙여 첫 GET이 반영될 때까지 기다린 손잡이. */
async function shown(h: AiHarness, options: Parameters<AiHarness['watch']>[0] = {}) {
  const w = h.watch(options);
  await finish(h, w.show());
  return w;
}

describe('AiReviewStore 진입과 상태 (TC-AIR-011 ~ 019)', () => {
  it('TC-AIR-011 진입하면 GET만 1회 보내고 POST는 보내지 않는다. 시간이 흘러도 자동 요청은 없다', async () => {
    const h = createAiHarness();
    await shown(h);
    await tick(h, 60_000);
    expect(gets(h)).toBe(1);
    expect(posts(h)).toBe(0);
  });

  it('붙기 전에는 entry가 null이고, 첫 GET 진행 중에는 phase=checking이다(REQ-AIR-008)', async () => {
    const gate = deferred<void>();
    const h = createAiHarness({ routes: { [aiGet()]: async () => (await gate.promise, loadFixture(`${getFx('none')}.json`).toResponse()) } });
    expect(entryOf(h)).toBeNull();
    const w = h.watch();
    const shownPromise = w.show();
    await settle();
    expect(entryOf(h)).toMatchObject({ postId: AI_POST_ID, phase: 'checking', status: null, requesting: false });
    gate.resolve();
    await finish(h, shownPromise);
    expect(entryOf(h)).toMatchObject({ phase: 'ready', status: 'NONE' });
  });

  it('TC-AIR-012 NONE: 폴링하지 않는다(타이머 0)', async () => {
    const h = createAiHarness();
    await shown(h);
    expect(entryOf(h)).toMatchObject({ phase: 'ready', status: 'NONE', canRequestAgain: false, result: null, polling: false, stalled: false });
    expect(h.clock.pendingTimers).toBe(0);
  });

  it('TC-AIR-013 PROCESSING: 폴링을 시작한다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing') } });
    await shown(h);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', polling: true, result: null });
    expect(h.clock.pendingTimers).toBeGreaterThan(0);
  });

  it('TC-AIR-014 COMPLETED: 결과가 있고 폴링하지 않는다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('completed') } });
    await shown(h);
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED', polling: false, canRequestAgain: false });
    expect(entryOf(h)?.result?.overallScore).toBe(7.5);
    expect(h.clock.pendingTimers).toBe(0);
  });

  it('TC-AIR-015 FAILED: canRequestAgain은 서버 값 그대로다. 자동으로 재요청하지 않는다(REQ-AIR-017)', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: [getFx('failed-can-retry'), getFx('failed-cannot-retry')] } });
    const w = await shown(h);
    expect(entryOf(h)).toMatchObject({ status: 'FAILED', canRequestAgain: true, result: null, polling: false });
    await tick(h, 30_000);
    expect(posts(h)).toBe(0);
    await finish(h, w.recheck());
    expect(entryOf(h)).toMatchObject({ status: 'FAILED', canRequestAgain: false });
  });

  it('TC-AIR-018 홈 방식(refreshCompleted=false): 복귀해도 완료 결과는 다시 조회하지 않고 유지한다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('completed') } });
    const w = await shown(h, { refreshCompleted: false });
    const before = entryOf(h);
    w.hide();
    await finish(h, w.show());
    expect(gets(h)).toBe(1);
    expect(entryOf(h)).toBe(before);
  });

  it('TC-AIR-018 홈 복귀 때 처리 중이었다면 결과(상태)를 표시한 채 GET을 다시 시작한다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('processing') } });
    const w = await shown(h, { refreshCompleted: false });
    w.hide();
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', polling: false });
    await finish(h, w.show());
    expect(gets(h)).toBe(2);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', polling: true });
  });

  it('TC-AIR-018 게시물이 달라지면 게시물마다 따로 상태를 갖는다(이전 완료 결과가 새 게시물에 남지 않는다)', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('completed'), [aiGet(PAST_POST_ID)]: getFx('none') } });
    const first = await shown(h, { refreshCompleted: false });
    first.release();
    const second = h.store.watch(PAST_POST_ID, { refreshCompleted: false });
    await finish(h, second.show());
    expect(entryOf(h, PAST_POST_ID)).toMatchObject({ status: 'NONE', result: null });
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED' });
    expect(gets(h, PAST_POST_ID)).toBe(1);
  });

  it('TC-AIR-019 REQ-AIR-051 상세 방식(refreshCompleted=true): 완료된 게시물에 다시 들어오면 GET으로 갱신하고 자동 요청하지 않는다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('completed') } });
    const w = await shown(h);
    w.hide();
    await finish(h, w.show());
    expect(gets(h)).toBe(2);
    expect(posts(h)).toBe(0);
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED' });
  });

  it('REQ-AIR-050 두 화면(홈·상세)이 같은 게시물을 붙잡으면 같은 상태를 본다: 한쪽의 요청 결과를 다른 쪽 entry가 그대로 본다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: postFx('202-processing') } });
    const home = await shown(h, { refreshCompleted: false });
    const feed = await shown(h);
    await finish(h, home.request());
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', polling: true });
    feed.release();
    home.release();
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING' }); // 손잡이를 놓아도 상태는 캐시로 남는다
  });
});

describe('AiReviewStore 요청 POST (TC-AIR-020 ~ 031)', () => {
  it('TC-AIR-020 TC-AIR-022 NONE에서 request()는 POST를 본문 없이 1회 보내고 202 PROCESSING이면 분석중이 된다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: postFx('202-processing') } });
    const w = await shown(h);
    await finish(h, w.request());
    expect(posts(h)).toBe(1);
    expect(h.router.calls(aiPost())[0]!.body).toBeNull();
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', requesting: false, polling: true, canRequestAgain: false });
  });

  it('REQ-AIR-003 canRequest()가 false면 POST를 보내지 않는다(자정이 지난 시점의 재확인)', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: postFx('202-processing') } });
    let allowed = true;
    const w = await shown(h, { canRequest: () => allowed });
    allowed = false;
    await finish(h, w.request());
    expect(posts(h)).toBe(0);
    expect(entryOf(h)).toMatchObject({ status: 'NONE', requesting: false });
  });

  it.each([
    ['PROCESSING', 'processing'],
    ['COMPLETED', 'completed'],
    ['FAILED + canRequestAgain=false', 'failed-cannot-retry'],
  ])('REQ-AIR-017 REQ-AIR-033 %s에서는 request()가 POST를 보내지 않는다', async (_name, fixture) => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx(fixture), [aiPost()]: postFx('202-processing') } });
    const w = await shown(h);
    await finish(h, w.request());
    expect(posts(h)).toBe(0);
  });

  it('TC-AIR-023 POST 응답을 기다리는 중 연타해도 추가 POST는 0건이고 응답 뒤에도 자동 재전송은 없다. 그동안 requesting이다', async () => {
    const gate = deferred<void>();
    const h = createAiHarness({
      routes: { [aiGet()]: [getFx('none'), getFx('processing')], [aiPost()]: async () => (await gate.promise, loadFixture(`${postFx('202-processing')}.json`).toResponse()) },
    });
    const w = await shown(h);
    const first = w.request();
    const second = w.request();
    const third = w.request();
    await settle();
    expect(entryOf(h)).toMatchObject({ requesting: true });
    expect(posts(h)).toBe(1);
    gate.resolve();
    await finish(h, Promise.all([first, second, third]));
    await tick(h, 10_000);
    expect(posts(h)).toBe(1);
    expect(entryOf(h)).toMatchObject({ requesting: false, status: 'PROCESSING' });
  });

  it('TC-AIR-024 이미 완료된 리뷰에 POST하면 200 COMPLETED를 그대로 표시하고 폴링하지 않는다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: postFx('200-completed') } });
    const w = await shown(h);
    await finish(h, w.request());
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED', polling: false });
    expect(entryOf(h)?.result?.overallScore).toBe(7.5);
    const before = gets(h);
    await tick(h, 30_000);
    expect(gets(h)).toBe(before);
  });

  it('REQ-AIR-022 POST 응답이 FAILED면 실패 상태로 바꾼다', async () => {
    const h = createAiHarness({
      routes: { [aiPost()]: () => json(200, { status: 'FAILED', requestedAt: null, completedAt: null, result: null, canRequestAgain: true }) },
    });
    const w = await shown(h);
    await finish(h, w.request());
    expect(entryOf(h)).toMatchObject({ status: 'FAILED', canRequestAgain: true, polling: false });
  });

  it('TC-AIR-025 FAILED + canRequestAgain이면 재요청 POST 202로 분석중이 된다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('failed-can-retry'), [aiPost()]: postFx('202-processing') } });
    const w = await shown(h);
    await finish(h, w.request());
    expect(posts(h)).toBe(1);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', polling: true });
  });

  it.each([
    ['한도 초과', postFx('400-limit-reached'), '더 이상 AI 리뷰를 다시 요청할 수 없습니다.'],
    ['비활성', postFx('400-disabled'), '지금은 AI 리뷰를 요청할 수 없습니다.'],
  ])('TC-AIR-026 POST 400(%s): 서버 message를 그대로 토스트로 보이고 이전 상태를 유지하며 자동 재요청하지 않는다', async (_name, fixture, message) => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('failed-can-retry'), [aiPost()]: fixture } });
    const w = await shown(h);
    await finish(h, w.request());
    expect(h.toasts.messages).toEqual([message]);
    expect(entryOf(h)).toMatchObject({ status: 'FAILED', canRequestAgain: true, requesting: false, blocked: false });
    await tick(h, 10_000);
    expect(posts(h)).toBe(1);
  });

  it('TC-AIR-027 D-08 POST 403: 정지 안내 토스트, 같은 요청을 다시 보내지 않고 GET은 정상 조회된다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: postFx('403-banned') } });
    const w = await shown(h);
    await finish(h, w.request());
    expect(h.toasts.messages).toEqual([t('ai.error.banned')]);
    expect(entryOf(h)).toMatchObject({ status: 'NONE', blocked: true, requesting: false });
    await finish(h, w.request());
    await finish(h, w.request());
    expect(posts(h)).toBe(1);
    h.router.set(aiGet(), getFx('completed'));
    await finish(h, w.recheck());
    expect(entryOf(h)).toMatchObject({ status: 'COMPLETED', blocked: true });
  });

  it('TC-AIR-028 POST 404: 조회 불가(hidden)로 두고 안내 토스트를 보이며 추가 조회를 하지 않는다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: postFx('404-not-found') } });
    const w = await shown(h);
    await finish(h, w.request());
    expect(entryOf(h)).toMatchObject({ phase: 'hidden', requesting: false });
    expect(h.toasts.messages).toEqual([t('ai.error.not-found')]);
    await tick(h, 30_000);
    expect(gets(h)).toBe(1);
  });

  it('TC-AIR-029 POST 401: refresh 뒤 원 요청을 1회만 재전송해 성공한다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: [postFx('401-unauthorized'), postFx('202-processing')], 'POST /auth/refresh': 'auth/refresh__success' } });
    const w = await shown(h);
    await finish(h, w.request());
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(h.ff.callsTo(`POST /posts/${AI_POST_ID}/ai-review`)).toHaveLength(2);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING' });
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-AIR-029 D-17 refresh가 REAUTHENTICATION_REQUIRED면 세션이 만료되고 로그인 안내 토스트 외에는 다시 보내지 않는다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: postFx('401-unauthorized'), 'POST /auth/refresh': 'auth/refresh__reauthentication-required' } });
    const w = await shown(h);
    await finish(h, w.request());
    expect(h.expired.count).toBe(1);
    expect(h.toasts.messages).toEqual([t('ai.error.login')]);
    expect(entryOf(h)).toMatchObject({ status: 'NONE', requesting: false });
    await tick(h, 10_000);
    expect(posts(h)).toBe(1);
  });

  it('TC-AIR-030 REQ-AIR-024 POST 응답이 유실되면(연결 실패) 네트워크 토스트 뒤 GET으로 서버 상태를 동기화하고 POST는 다시 보내지 않는다', async () => {
    const h = createAiHarness({
      routes: {
        [aiGet()]: [getFx('none'), getFx('processing')], // 요청이 접수됐을 수 있다: 동기화 GET이 PROCESSING을 돌려준다
        [aiPost()]: () => {
          throw new TypeError('Failed to fetch');
        },
      },
    });
    const w = await shown(h);
    await finish(h, w.request());
    expect(h.toasts.messages).toEqual([t('ai.error.network')]);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING', requesting: false });
    await tick(h, 20_000);
    expect(posts(h)).toBe(1);
  });

  it('TC-AIR-031 POST 500: 자동 재시도 없이 오류 문구를 보이고 이전 상태를 유지한 채 GET으로 동기화한다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: postFx('500-server-error') } });
    const w = await shown(h);
    await finish(h, w.request());
    await tick(h, 10_000);
    expect(posts(h)).toBe(1);
    expect(h.toasts.messages).toEqual([t('ai.error.load')]);
    expect(entryOf(h)).toMatchObject({ status: 'NONE', requesting: false });
    expect(gets(h)).toBe(2);
  });

  it('REQ-AIR-044 POST 응답이 계약 위반이면 오류 문구를 보이고 이전 상태를 유지한다', async () => {
    const h = createAiHarness({ routes: { [aiPost()]: () => json(202, { status: 'SOMETHING_NEW', requestedAt: null, completedAt: null, result: null }) } });
    const w = await shown(h);
    await finish(h, w.request());
    expect(h.toasts.messages).toEqual([t('ai.error.load')]);
    expect(entryOf(h)).toMatchObject({ status: 'NONE', requesting: false });
    expect(posts(h)).toBe(1);
  });

  it('POST 409(방어)는 토스트 없이 GET으로 다시 조회한다', async () => {
    const h = createAiHarness({
      routes: { [aiGet()]: [getFx('none'), getFx('processing')], [aiPost()]: () => json(409, { errorCode: 'BUSINESS_ERROR', message: '충돌' }) },
    });
    const w = await shown(h);
    await finish(h, w.request());
    expect(h.toasts.messages).toEqual([]);
    expect(entryOf(h)).toMatchObject({ status: 'PROCESSING' });
    expect(posts(h)).toBe(1);
  });
});

describe('AiReviewStore 첫 조회 오류 (TC-AIR-040, 041, REQ-AIR-005, 016, 044)', () => {
  it('TC-AIR-040 첫 GET이 실패하면 check-failed + 오류 문구, 다시 확인하면 GET을 다시 보내 복구된다', async () => {
    let failing = true;
    const h = createAiHarness({ routes: { [aiGet()]: failWhile(() => failing, getFx('500-server-error'), getFx('none')) } });
    const w = h.watch();
    await finish(h, w.show());
    expect(entryOf(h)).toMatchObject({ phase: 'check-failed', status: null });
    expect(h.toasts.messages).toEqual([t('ai.error.load')]);
    failing = false;
    await finish(h, w.recheck());
    expect(entryOf(h)).toMatchObject({ phase: 'ready', status: 'NONE' });
  });

  it('TC-AIR-040 D-20 첫 GET이 연결 실패면 네트워크 문구다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: failWhile(() => true, 'network', getFx('none')) } });
    await finish(h, h.watch().show());
    expect(entryOf(h)).toMatchObject({ phase: 'check-failed' });
    expect(h.toasts.messages).toEqual([t('ai.error.network')]);
  });

  it('REQ-AIR-044 첫 GET 응답이 계약 위반이면 check-failed + "AI 피드백 정보를 불러오지 못했어요."', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('completed-no-result') } });
    await finish(h, h.watch().show());
    expect(entryOf(h)).toMatchObject({ phase: 'check-failed' });
    expect(h.toasts.messages).toEqual([t('ai.error.load')]);
  });

  it('REQ-AIR-044 이미 확인한 상태가 있으면 재확인이 계약 위반이어도 이전 상태를 유지하고 문구만 보인다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: [getFx('completed'), getFx('score-out-of-range')] } });
    const w = await shown(h);
    await finish(h, w.recheck());
    expect(entryOf(h)).toMatchObject({ phase: 'ready', status: 'COMPLETED' });
    expect(h.toasts.messages).toEqual([t('ai.error.load')]);
  });

  it('REQ-AIR-005 첫 GET이 404면 메시지 없이 hidden이고 폴링도 추가 조회도 없다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: getFx('404-not-found') } });
    await shown(h);
    expect(entryOf(h)).toMatchObject({ phase: 'hidden' });
    expect(h.toasts.messages).toEqual([]);
    await tick(h, 30_000);
    expect(gets(h)).toBe(1);
  });

  it('TC-AIR-029 첫 GET이 401이고 갱신 불가면 로그인 안내를 보이고 조회를 이어가지 않는다', async () => {
    const h = createAiHarness({ routes: { [aiGet()]: 'ai-review/ai-review-post__401-unauthorized', 'POST /auth/refresh': 'auth/refresh__reauthentication-required' } });
    await finish(h, h.watch().show());
    expect(h.expired.count).toBe(1);
    expect(h.toasts.messages).toEqual([t('ai.error.login')]);
    await tick(h, 10_000);
    expect(gets(h)).toBe(1);
  });
});
