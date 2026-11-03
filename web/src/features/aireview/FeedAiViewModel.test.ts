import { t } from '../../copy/ko';
import type { DateString } from '../../core/time/kst';
import { deferred } from '../../test/deferred';
import { loadFixture } from '../../test/fixtures';
import { AI_POST_ID, aiGet, aiPost, createFeedAiHarness, finish, getFx, gets, posts, postFx, settle, tick } from '../../test/aiReviewHarness';
import type { FeedAiHarness, FeedAiHarnessOptions } from '../../test/aiReviewHarness';

const TODAY = '2026-10-27' as DateString;
const PAST = '2026-10-20' as DateString;
/** KST 2026-10-27 23:59:59 = 14:59:59Z. */
const BEFORE_MIDNIGHT = '2026-10-27T14:59:59Z';

async function open(h: FeedAiHarness, post: { isMine?: boolean; topicDate?: DateString | null } = {}) {
  h.vm.setPost({ isMine: post.isMine ?? true, topicDate: post.topicDate === undefined ? TODAY : post.topicDate });
  await finish(h, h.vm.onShown());
}
const make = (options: FeedAiHarnessOptions = {}) => createFeedAiHarness(options);
const pill = (h: FeedAiHarness) => h.vm.state.pill;

describe('FeedAiViewModel 진입 자격 (TC-AIR-011, 017, REQ-AIR-001, 002)', () => {
  it('TC-AIR-017 REQ-AIR-001 남의 게시물이면 알약도 GET도 없다', async () => {
    const h = make();
    await open(h, { isMine: false });
    await tick(h, 10_000);
    expect(pill(h)).toBe('hidden');
    expect(gets(h)).toBe(0);
    expect(posts(h)).toBe(0);
  });

  it('TC-AIR-011 REQ-AIR-002 내 게시물이면 GET만 보내고 POST는 보내지 않는다', async () => {
    const h = make();
    await open(h);
    await tick(h, 30_000);
    expect(gets(h)).toBe(1);
    expect(posts(h)).toBe(0);
    expect(pill(h)).toBe('request');
  });

  it('보이는 상태가 먼저고 게시물 정보가 나중에 와도(시드 확정 순서) 내 게시물일 때 GET을 보낸다', async () => {
    const h = make();
    void h.vm.onShown();
    await settle();
    expect(gets(h)).toBe(0);
    h.vm.setPost({ isMine: true, topicDate: TODAY });
    await settle();
    await settle();
    expect(gets(h)).toBe(1);
  });

  it('REQ-AIR-008 첫 GET을 기다리는 동안은 checking이다', async () => {
    const gate = deferred<void>();
    const h = make({ routes: { [aiGet()]: async () => (await gate.promise, loadFixture(`${getFx('none')}.json`).toResponse()) } });
    h.vm.setPost({ isMine: true, topicDate: TODAY });
    const shownPromise = h.vm.onShown();
    await settle();
    expect(pill(h)).toBe('checking');
    gate.resolve();
    await finish(h, shownPromise);
    expect(pill(h)).toBe('request');
  });
});

describe('FeedAiViewModel 알약 상태 (TC-AIR-012 ~ 016, 040, 041)', () => {
  it.each([
    ['none', 'request'],
    ['processing', 'processing'],
    ['completed', 'view'],
    ['failed-can-retry', 'retry'],
    ['failed-cannot-retry', 'failed'],
    ['404-not-found', 'hidden'],
  ])('TC-AIR-012 TC-AIR-013 TC-AIR-014 TC-AIR-015 GET %s → 알약 %s', async (fixture, expected) => {
    const h = make({ routes: { [aiGet()]: getFx(fixture) } });
    await open(h);
    expect(pill(h)).toBe(expected);
    expect(h.vm.state.stalled).toBe(false);
  });

  it('TC-AIR-016 지난 주제의 내 게시물: NONE이면 알약을 숨기고 FAILED는 재요청 없이 실패 알약이다', async () => {
    const none = make();
    await open(none, { topicDate: PAST });
    expect(pill(none)).toBe('hidden');
    const failed = make({ routes: { [aiGet()]: getFx('failed-can-retry') } });
    await open(failed, { topicDate: PAST });
    expect(pill(failed)).toBe('failed');
  });

  it('TC-AIR-040 REQ-AIR-016 첫 GET 실패는 "다시 확인" 알약이고 누르면 GET을 다시 보낸다', async () => {
    let failing = true;
    const h = make();
    h.router.set(aiGet(), () => (failing ? loadFixture(`${getFx('500-server-error')}.json`).toResponse() : loadFixture(`${getFx('none')}.json`).toResponse()));
    await open(h);
    expect(pill(h)).toBe('recheck');
    expect(h.vm.state.recheckVisible).toBe(true);
    failing = false;
    await finish(h, h.vm.onRecheckPress());
    expect(pill(h)).toBe('request');
    expect(h.vm.state.recheckVisible).toBe(false);
  });

  it('TC-AIR-041 REQ-AIR-030 폴링 중 GET 404면 알약이 사라진다(메시지 없음)', async () => {
    const h = make({ routes: { [aiGet()]: [getFx('processing'), getFx('404-not-found')] } });
    await open(h);
    await tick(h, 3_000);
    expect(pill(h)).toBe('hidden');
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-AIR-035 TC-AIR-037 창이 끝나면 알약은 분석중을 유지하고 안내 + 다시 확인 버튼이 생기며, 누르면 GET 뒤 안내가 사라진다', async () => {
    const h = make({ routes: { [aiGet()]: getFx('processing') } });
    await open(h);
    await tick(h, 299_999);
    expect(h.vm.state).toMatchObject({ pill: 'processing', stalled: false, recheckVisible: false });
    await tick(h, 1);
    expect(h.vm.state).toMatchObject({ pill: 'processing', stalled: true, recheckVisible: true });
    expect(posts(h)).toBe(0);
    const before = gets(h);
    await finish(h, h.vm.onRecheckPress());
    expect(gets(h)).toBe(before + 1);
    expect(h.vm.state).toMatchObject({ pill: 'processing', stalled: false, recheckVisible: false });
  });

  it('TC-AIR-038 폴링 중 COMPLETED를 받으면 알약이 "보기"로 바뀐다(시트는 자동으로 열지 않는다)', async () => {
    const h = make({ routes: { [aiGet()]: [getFx('processing'), getFx('completed')] } });
    await open(h);
    await tick(h, 3_000);
    expect(pill(h)).toBe('view');
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
  });
});

describe('FeedAiViewModel 시트와 요청 (TC-AIR-020 ~ 027, 049, 052, 053)', () => {
  it('TC-AIR-020 NONE 알약을 누르면 시작 시트가 열리고 닫으면 POST 0건이다', async () => {
    const h = make({ routes: { [aiPost()]: postFx('202-processing') } });
    await open(h);
    h.vm.onPillPress();
    expect(h.vm.state.sheet).toEqual({ kind: 'start', retry: false });
    h.vm.closeSheet();
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
    await tick(h, 10_000);
    expect(posts(h)).toBe(0);
  });

  it('TC-AIR-020 TC-AIR-022 "분석 시작하기"는 시트를 닫고 POST를 1회 보내며 분석중이 된다. 요청 중에는 requesting이다', async () => {
    const gate = deferred<void>();
    const h = make({ routes: { [aiPost()]: async () => (await gate.promise, loadFixture(`${postFx('202-processing')}.json`).toResponse()) } });
    await open(h);
    h.vm.onPillPress();
    const confirming = h.vm.confirmStart();
    await settle();
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
    expect(pill(h)).toBe('requesting');
    gate.resolve();
    await finish(h, confirming);
    expect(posts(h)).toBe(1);
    expect(pill(h)).toBe('processing');
  });

  it('TC-AIR-023 연타(시작 확정 3번)해도 POST는 1건이다', async () => {
    const h = make({ routes: { [aiPost()]: postFx('202-processing') } });
    await open(h);
    h.vm.onPillPress();
    await finish(h, Promise.all([h.vm.confirmStart(), h.vm.confirmStart(), h.vm.confirmStart()]));
    await tick(h, 10_000);
    expect(posts(h)).toBe(1);
  });

  it('TC-AIR-020 REQ-AIR-013 재요청 알약은 재요청 시트(제목이 다르다)를 열고 확정하면 POST 한다', async () => {
    const h = make({ routes: { [aiGet()]: getFx('failed-can-retry'), [aiPost()]: postFx('202-processing') } });
    await open(h);
    expect(pill(h)).toBe('retry');
    h.vm.onPillPress();
    expect(h.vm.state.sheet).toEqual({ kind: 'start', retry: true });
    await finish(h, h.vm.confirmStart());
    expect(posts(h)).toBe(1);
    expect(pill(h)).toBe('processing');
  });

  it('REQ-AIR-022 TC-AIR-024 POST가 곧바로 COMPLETED여도 결과 시트를 자동으로 열지 않는다', async () => {
    const h = make({ routes: { [aiPost()]: postFx('200-completed') } });
    await open(h);
    h.vm.onPillPress();
    await finish(h, h.vm.confirmStart());
    expect(pill(h)).toBe('view');
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
  });

  it('processing·checking·requesting 알약은 눌러도 시트가 열리지 않는다', async () => {
    const h = make({ routes: { [aiGet()]: getFx('processing') } });
    await open(h);
    h.vm.onPillPress();
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
  });

  it('TC-AIR-026 POST 400이면 서버 message 토스트(2.5초 안에 관찰)를 보이고 알약은 그대로 요청 가능이다', async () => {
    const h = make({ routes: { [aiPost()]: postFx('400-limit-reached') } });
    await open(h);
    h.vm.onPillPress();
    await finish(h, h.vm.confirmStart());
    expect(h.toast.state.toast?.message).toBe('더 이상 AI 리뷰를 다시 요청할 수 없습니다.');
    await tick(h, 2_400);
    expect(h.toast.state.toast?.message).toBe('더 이상 AI 리뷰를 다시 요청할 수 없습니다.');
    await tick(h, 200);
    expect(h.toast.state.toast).toBeNull();
    expect(pill(h)).toBe('request');
  });

  it('TC-AIR-027 정지 회원: POST 403 토스트, 같은 요청을 다시 보내지 않는다. 결과는 GET으로 볼 수 있다', async () => {
    const h = make({ routes: { [aiPost()]: postFx('403-banned') } });
    await open(h);
    h.vm.onPillPress();
    await finish(h, h.vm.confirmStart());
    expect(h.toast.state.toast?.message).toBe(t('ai.error.banned'));
    h.vm.onPillPress();
    await finish(h, h.vm.confirmStart());
    expect(posts(h)).toBe(1);
    h.router.set(aiGet(), getFx('completed'));
    await finish(h, h.vm.onRecheckPress());
    expect(pill(h)).toBe('view');
  });

  it('TC-AIR-028 POST 404면 알약이 사라지고 안내 토스트가 뜬다', async () => {
    const h = make({ routes: { [aiPost()]: postFx('404-not-found') } });
    await open(h);
    h.vm.onPillPress();
    await finish(h, h.vm.confirmStart());
    expect(pill(h)).toBe('hidden');
    expect(h.toast.state.toast?.message).toBe(t('ai.error.not-found'));
  });

  it('TC-AIR-049 TC-AIR-052 COMPLETED 알약은 결과 시트를 열고 기준 설명 다이얼로그를 열고 닫을 수 있다', async () => {
    const h = make({ routes: { [aiGet()]: getFx('completed') } });
    await open(h);
    h.vm.onPillPress();
    expect(h.vm.state.sheet).toMatchObject({ kind: 'result', result: { overallScore: 7.5 } });
    h.vm.openCriteria();
    expect(h.vm.state.criteriaOpen).toBe(true);
    h.vm.closeCriteria();
    expect(h.vm.state.criteriaOpen).toBe(false);
    expect(h.vm.state.sheet.kind).toBe('result');
    h.vm.closeSheet();
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
    expect(posts(h)).toBe(0);
  });

  it('시트를 닫으면 기준 설명 다이얼로그도 닫힌다', async () => {
    const h = make({ routes: { [aiGet()]: getFx('completed') } });
    await open(h);
    h.vm.onPillPress();
    h.vm.openCriteria();
    h.vm.closeSheet();
    expect(h.vm.state).toMatchObject({ criteriaOpen: false, sheet: { kind: 'none' } });
  });

  it('TC-AIR-053 REQ-AIR-015 FAILED + 재요청 불가 알약은 실패 시트(이유: no-more)를 열고 재요청 버튼이 없다', async () => {
    const h = make({ routes: { [aiGet()]: getFx('failed-cannot-retry') } });
    await open(h);
    h.vm.onPillPress();
    expect(h.vm.state.sheet).toEqual({ kind: 'failed', reason: 'no-more', canRetry: false });
  });

  it('TC-AIR-016 TC-AIR-053 지난 주제의 FAILED는 이유가 past이고 재요청이 없다', async () => {
    const h = make({ routes: { [aiGet()]: getFx('failed-can-retry') } });
    await open(h, { topicDate: PAST });
    h.vm.onPillPress();
    expect(h.vm.state.sheet).toEqual({ kind: 'failed', reason: 'past', canRetry: false });
  });
});

describe('FeedAiViewModel 홈 자세히 보기 진입 (REQ-AIR-046 ~ 048 중 웹 해당분, openAiReview)', () => {
  it('COMPLETED면 첫 GET 반영 뒤 결과 시트를 한 번만 자동으로 연다. 닫은 뒤 다시 보여도 다시 열지 않는다', async () => {
    const h = make({ openAiReview: true, routes: { [aiGet()]: getFx('completed') } });
    await open(h);
    expect(h.vm.state.sheet).toMatchObject({ kind: 'result' });
    h.vm.closeSheet();
    h.vm.onHidden();
    await finish(h, h.vm.onShown());
    expect(gets(h)).toBe(2);
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
  });

  it('먼저 GET을 보내고 그 최신 결과 기준으로 연다: GET 응답 전에는 열리지 않는다', async () => {
    const gate = deferred<void>();
    const h = make({ openAiReview: true, routes: { [aiGet()]: async () => (await gate.promise, loadFixture(`${getFx('completed')}.json`).toResponse()) } });
    h.vm.setPost({ isMine: true, topicDate: TODAY });
    const shownPromise = h.vm.onShown();
    await settle();
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
    gate.resolve();
    await finish(h, shownPromise);
    expect(h.vm.state.sheet.kind).toBe('result');
  });

  it('FAILED면 실패 시트를 연다: 재요청 가능 + 오늘이면 재요청 버튼이 있고, 불가면 이유 문구만 있다', async () => {
    const can = make({ openAiReview: true, routes: { [aiGet()]: getFx('failed-can-retry') } });
    await open(can);
    expect(can.vm.state.sheet).toEqual({ kind: 'failed', reason: 'none', canRetry: true });
    const cannot = make({ openAiReview: true, routes: { [aiGet()]: getFx('failed-cannot-retry') } });
    await open(cannot);
    expect(cannot.vm.state.sheet).toEqual({ kind: 'failed', reason: 'no-more', canRetry: false });
  });

  it.each(['none', 'processing', '404-not-found'])('최신 GET이 %s이면 시트를 열지 않는다', async (fixture) => {
    const h = make({ openAiReview: true, routes: { [aiGet()]: getFx(fixture) } });
    await open(h);
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
  });

  it('openAiReview가 없으면(상세로 그냥 들어오면) 완료 상태여도 시트를 열지 않는다', async () => {
    const h = make({ routes: { [aiGet()]: getFx('completed') } });
    await open(h);
    expect(h.vm.state.sheet).toEqual({ kind: 'none' });
  });

  it('실패 시트의 재요청 버튼은 실패 시트를 닫고 재요청 시트를 연다', async () => {
    const h = make({ openAiReview: true, routes: { [aiGet()]: getFx('failed-can-retry') } });
    await open(h);
    h.vm.retryFromFailedSheet();
    expect(h.vm.state.sheet).toEqual({ kind: 'start', retry: true });
  });
});

describe('FeedAiViewModel 자정과 가시성 (TC-AIR-042, 045)', () => {
  it('TC-AIR-045 KST 23:59:59에는 요청 알약이 보이고 00:00:00에는 숨는다. 열려 있던 시작 시트에서 확정해도 POST를 보내지 않는다', async () => {
    const h = make({ now: BEFORE_MIDNIGHT, routes: { [aiPost()]: postFx('202-processing') } });
    await open(h);
    expect(pill(h)).toBe('request');
    h.vm.onPillPress();
    await tick(h, 1_000);
    expect(pill(h)).toBe('hidden');
    await finish(h, h.vm.confirmStart());
    expect(posts(h)).toBe(0);
  });

  it('TC-AIR-045 자정 전에 시작한 진행 중 리뷰의 결과 조회는 자정 뒤에도 계속된다', async () => {
    const h = make({ now: BEFORE_MIDNIGHT, routes: { [aiGet()]: [getFx('none'), getFx('processing')], [aiPost()]: postFx('202-processing') } });
    await open(h);
    h.vm.onPillPress();
    await finish(h, h.vm.confirmStart());
    await tick(h, 4_000);
    expect(pill(h)).toBe('processing');
    expect(gets(h)).toBeGreaterThanOrEqual(2);
  });

  it('TC-AIR-042 가려지면(onHidden) 폴링을 멈추고 다시 보이면(onShown) GET부터 다시 시작한다', async () => {
    const h = make({ routes: { [aiGet()]: getFx('processing') } });
    await open(h);
    h.vm.onHidden();
    const before = gets(h);
    await tick(h, 30_000);
    expect(gets(h)).toBe(before);
    await finish(h, h.vm.onShown());
    expect(gets(h)).toBe(before + 1);
  });

  it('dispose하면 손잡이를 놓아 폴링이 멈추지만 상태는 저장소에 남는다(홈 카드가 이어서 본다)', async () => {
    const h = make({ routes: { [aiGet()]: getFx('processing') } });
    await open(h);
    h.vm.dispose();
    const before = gets(h);
    await tick(h, 30_000);
    expect(gets(h)).toBe(before);
    expect(h.store.entry(AI_POST_ID)).toMatchObject({ status: 'PROCESSING' });
  });
});
