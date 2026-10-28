import { NetworkError } from '../../core/http/ApiError';
import { reauth, unauthorized } from '../../core/http/__testing__/createNetHarness';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { AI_REVIEW_POLL_INTERVAL_MS, AI_REVIEW_POLL_WINDOW_MS } from '../../shared/constants';
import { t } from '../../shared/copy';
import {
  COMPLETED,
  GET_AI,
  GET_OTHER_AI,
  NONE,
  OTHER_POST_ID,
  POST_AI,
  POST_ID,
  PROCESSING,
  createAiReviewHarness,
  fx,
  gate,
} from './__testing__/createAiReviewHarness';

const SEC = 1000;

/** 폴링 시작 시각을 0으로 한 GET 요청 경과 초. */
const offsets = (h: Awaited<ReturnType<typeof createAiReviewHarness>>, startMs: number) =>
  h.timesOf(GET_AI).map((at) => (at - startMs) / SEC);

describe('AiReviewPoller 폴링 정책 (D-03)', () => {
  it('TC-AIR-048 간격 3초·창 300초 상수는 shared/constants.json과 같다', () => {
    expect(AI_REVIEW_POLL_INTERVAL_MS).toBe(3000);
    expect(AI_REVIEW_POLL_WINDOW_MS).toBe(300_000);
  });

  it('TC-AIR-011 TC-AIR-012 NONE이면 GET 한 번뿐이고 폴링도 POST도 없다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: NONE } });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(600 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    expect(h.timesOf(POST_AI)).toHaveLength(0);
    expect(h.poller.getSnapshot()).toMatchObject({
      postId: POST_ID,
      phase: 'ready',
      requesting: false,
      stalled: false,
      review: { status: 'NONE' },
    });
  });

  it('TC-AIR-014 COMPLETED면 폴링하지 않는다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: COMPLETED } });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(600 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    expect(h.poller.getSnapshot().review?.status).toBe('COMPLETED');
  });

  it('TC-AIR-013 PROCESSING이면 첫 GET은 바로 나가고 폴링을 시작한다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    expect(h.poller.getSnapshot()).toMatchObject({
      phase: 'ready',
      review: { status: 'PROCESSING' },
    });
    expect(h.pollSleeper.waiting).toBe(1);
  });

  it('TC-AIR-032 2.9초에는 폴링 GET이 0건이고 3.0초에 1건이다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.pollSleeper.advance(2900);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    await h.pollSleeper.advance(100);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
    expect(h.pollSleeper.calls[0]).toBe(AI_REVIEW_POLL_INTERVAL_MS);
  });

  it('TC-AIR-033 GET이 3.0, 6.0, 9.0초에 한 번씩 나간다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    const start = h.clock.now().getTime();
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(9 * SEC);
    expect(offsets(h, start)).toEqual([0, 3, 6, 9]);
  });

  it('TC-AIR-033 응답이 3초보다 늦어도 동시에 두 요청이 진행되지 않는다', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow = gate(PROCESSING);
    const h = await createAiReviewHarness({
      routes: {
        [GET_AI]: async (_request, index) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          try {
            if (index === 1) await slow.opened;
            return fixtureResponse(PROCESSING);
          } finally {
            inFlight -= 1;
          }
        },
      },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(30 * SEC);
    // 두 번째 GET이 10초 넘게 응답하지 않아도 그 사이 세 번째 GET은 나가지 않는다.
    expect(h.timesOf(GET_AI)).toHaveLength(2);
    slow.release();
    await h.pollSleeper.advance(30 * SEC);
    expect(maxInFlight).toBe(1);
    expect(h.timesOf(GET_AI).length).toBeGreaterThan(2);
  });

  it('TC-AIR-034 창 시작은 폴링을 시작한 시각이고 서버 requestedAt(하루 전)은 기준이 아니다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: fx('ai-review-get__processing-old-requested-at') },
    });
    const start = h.clock.now().getTime();
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(30 * SEC);
    expect(offsets(h, start)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30]);
    expect(h.poller.getSnapshot().stalled).toBe(false);
  });

  it('TC-AIR-035 기본 설정: 3~297초 사이 폴링 99회, 300.000초에는 GET 없이 멈추고 PROCESSING을 유지한다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    const start = h.clock.now().getTime();
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(AI_REVIEW_POLL_WINDOW_MS);
    const seconds = offsets(h, start);
    expect(seconds.slice(1)).toHaveLength(99);
    expect(seconds[1]).toBe(3);
    expect(seconds[seconds.length - 1]).toBe(297);
    expect(h.poller.getSnapshot()).toMatchObject({
      stalled: true,
      review: { status: 'PROCESSING' },
    });
    await h.pollSleeper.advance(120 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(100);
    expect(h.timesOf(POST_AI)).toHaveLength(0);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-AIR-035 299.999초에 도는 GET은 허용된다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: PROCESSING },
      intervalMs: 299_999,
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(299_999);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
  });

  it('TC-AIR-035 300.000초에 도는 GET은 보내지 않고 창 종료로 본다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: PROCESSING },
      intervalMs: 300_000,
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(300_000);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    expect(h.poller.getSnapshot().stalled).toBe(true);
  });

  it('TC-AIR-036 창 종료 뒤 다시 start하면 GET부터 새 300초 창이 열리고 POST는 없다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(AI_REVIEW_POLL_WINDOW_MS);
    expect(h.poller.getSnapshot().stalled).toBe(true);
    const restart = h.clock.now().getTime();
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.timesOf(GET_AI).filter((at) => at === restart)).toHaveLength(1);
    expect(h.poller.getSnapshot().stalled).toBe(false);
    await h.pollSleeper.advance(299 * SEC);
    expect(h.poller.getSnapshot().stalled).toBe(false);
    await h.pollSleeper.advance(1 * SEC);
    expect(h.poller.getSnapshot().stalled).toBe(true);
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-037 창 종료 뒤 refresh는 GET 1회를 보내고 PROCESSING이면 폴링을 재개한다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(AI_REVIEW_POLL_WINDOW_MS);
    const before = h.timesOf(GET_AI).length;
    h.poller.refresh(POST_ID);
    await h.pollSleeper.settle();
    expect(h.timesOf(GET_AI)).toHaveLength(before + 1);
    expect(h.poller.getSnapshot().stalled).toBe(false);
    await h.pollSleeper.advance(3 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(before + 2);
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-038 COMPLETED를 받으면 폴링을 멈추고 결과를 담는다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: [PROCESSING, PROCESSING, COMPLETED] },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(6 * SEC);
    expect(h.poller.getSnapshot().review).toMatchObject({
      status: 'COMPLETED',
      result: { overallScore: 7.5 },
    });
    await h.pollSleeper.advance(60 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(3);
  });

  it('TC-AIR-038 FAILED를 받으면 폴링을 멈추고 자동 재요청하지 않는다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: [PROCESSING, fx('ai-review-get__failed-can-retry')] },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(3 * SEC);
    expect(h.poller.getSnapshot().review).toMatchObject({
      status: 'FAILED',
      canRequestAgain: true,
    });
    await h.pollSleeper.advance(60 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-038 PROCESSING이 이어지는 동안은 상태가 바뀌지 않아 구독자에게 알리지 않는다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    const listener = jest.fn();
    h.poller.subscribe(listener);
    await h.pollSleeper.advance(30 * SEC);
    expect(h.timesOf(GET_AI).length).toBeGreaterThan(5);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('AiReviewPoller 오류 (D-20, D-21)', () => {
  it('TC-AIR-039 폴링 GET이 5xx여도 계속 폴링하고 복구 뒤 완료를 표시하며 메시지는 많아야 한 번이다', async () => {
    const h = await createAiReviewHarness({
      routes: {
        [GET_AI]: [
          PROCESSING,
          fx('ai-review-get__500-server-error'),
          fx('ai-review-get__500-server-error'),
          fx('ai-review-get__500-server-error'),
          fx('ai-review-get__500-server-error'),
          fx('ai-review-get__500-server-error'),
          fx('ai-review-get__500-server-error'),
          COMPLETED,
        ],
      },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(9 * SEC);
    expect(h.poller.getSnapshot().review?.status).toBe('COMPLETED');
    expect(h.toast.messages.length).toBeLessThanOrEqual(1);
    expect(h.toast.messages.every((m) => m === t('ai.error.load'))).toBe(true);
  });

  it('TC-AIR-039 폴링 GET의 연결 실패도 계속 폴링한다', async () => {
    const h = await createAiReviewHarness({
      routes: {
        [GET_AI]: (_request, index) =>
          index === 0 ? fixtureResponse(PROCESSING) : new NetworkError('x'),
      },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(12 * SEC);
    expect(h.timesOf(GET_AI).length).toBeGreaterThan(4);
    expect(h.poller.getSnapshot().review?.status).toBe('PROCESSING');
    expect(h.toast.messages.length).toBeLessThanOrEqual(1);
  });

  it('TC-AIR-040 첫 GET이 5xx면 check-failed가 되고 오류 문구를 보여 주며 폴링하지 않는다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: fx('ai-review-get__500-server-error') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(60 * SEC);
    expect(h.poller.getSnapshot()).toMatchObject({ phase: 'check-failed', review: null });
    expect(h.toast.messages).toEqual([t('ai.error.load')]);
    // HTTP 계층의 자동 재시도(총 3회)만 있고 폴러는 다시 보내지 않는다.
    expect(h.timesOf(GET_AI)).toHaveLength(3);
  });

  it('TC-AIR-040 첫 GET이 연결 실패면 네트워크 문구를 보여 준다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: () => new NetworkError('offline') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().phase).toBe('check-failed');
    expect(h.toast.messages).toEqual([t('ai.error.network')]);
  });

  it('TC-AIR-004 첫 GET 응답이 유효하지 않으면 check-failed와 "정보를 불러오지 못했어요"를 보여 준다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: fx('ai-review-get__completed-no-result') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot()).toMatchObject({ phase: 'check-failed', review: null });
    expect(h.toast.messages).toEqual([t('ai.error.load')]);
  });

  it('TC-AIR-040 check-failed에서 refresh로 다시 확인하면 정상 상태가 된다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: fx('ai-review-get__500-server-error') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.router.set(GET_AI, PROCESSING);
    h.poller.refresh(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot()).toMatchObject({
      phase: 'ready',
      review: { status: 'PROCESSING' },
    });
    await h.pollSleeper.advance(3 * SEC);
    expect(h.timesOf(GET_AI).length).toBeGreaterThan(3);
  });

  it('TC-AIR-004 폴링 중 유효하지 않은 응답은 이전 상태를 유지하고 문구를 한 번 알린다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: [PROCESSING, fx('ai-review-get__completed-no-result'), PROCESSING] },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(9 * SEC);
    expect(h.poller.getSnapshot().review?.status).toBe('PROCESSING');
    expect(h.toast.messages).toEqual([t('ai.error.load')]);
  });

  it('TC-AIR-041 폴링 중 GET이 404면 메시지 없이 hidden이 되고 더 조회하지 않는다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: [PROCESSING, fx('ai-review-get__404-not-found')] },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(60 * SEC);
    expect(h.poller.getSnapshot().phase).toBe('hidden');
    expect(h.toast.messages).toEqual([]);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
  });

  it('TC-AIR-017 첫 GET이 404여도 같다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: fx('ai-review-get__404-not-found') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(60 * SEC);
    expect(h.poller.getSnapshot().phase).toBe('hidden');
    expect(h.timesOf(GET_AI)).toHaveLength(1);
  });

  it('TC-AIR-029 폴링 중 남은 401(UNAUTHORIZED)은 폴링을 멈추고 AuthErrorPolicy에 따라 로그인으로 보낸다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: [PROCESSING, unauthorized()] } });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(60 * SEC);
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
    const gets = h.timesOf(GET_AI).length;
    await h.pollSleeper.advance(60 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(gets);
  });

  it('TC-AIR-029 REAUTHENTICATION_REQUIRED면 화면은 아무것도 하지 않고 폴링만 멈춘다', async () => {
    const h = await createAiReviewHarness({
      routes: {
        [GET_AI]: [PROCESSING, unauthorized()],
        'POST /auth/refresh': () => reauth(),
      },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(60 * SEC);
    expect(h.authFlow.calls).toEqual([]);
    expect(h.toast.messages).toEqual([]);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
  });

  it('TC-AIR-047 폴링 GET이 503 Retry-After 1초면 기다린 뒤 다시 보내고 폴링 창 시계는 그대로다', async () => {
    const h = await createAiReviewHarness({
      routes: {
        [GET_AI]: [PROCESSING, fx('ai-review-get__503-retry-after'), COMPLETED],
      },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(3 * SEC);
    expect(h.sleeper.calls).toEqual([1000]);
    expect(h.poller.getSnapshot().review?.status).toBe('COMPLETED');
    expect(h.pollSleeper.calls).toEqual([3000]);
  });
});

describe('AiReviewPoller 시작·정지·중복 (TC-AIR-018, 019, 042, 043)', () => {
  it('TC-AIR-018 같은 게시물의 완료 결과는 stop 뒤 다시 start해도 재조회 없이 유지한다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: COMPLETED } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.poller.stop();
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    expect(h.poller.getSnapshot().review?.status).toBe('COMPLETED');
  });

  it('TC-AIR-018 처리 중이던 게시물은 결과를 표시한 채 상태 조회를 재개한다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.poller.stop();
    const revisit = gate(PROCESSING);
    h.router.set(GET_AI, revisit.route);
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().review?.status).toBe('PROCESSING');
    revisit.release();
    await h.pollSleeper.settle();
    expect(h.timesOf(GET_AI)).toHaveLength(2);
  });

  it('TC-AIR-018 게시물이 달라지면 이전 완료 결과를 바로 지우고 새 게시물을 조회한다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: COMPLETED, [GET_OTHER_AI]: PROCESSING },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.poller.start(OTHER_POST_ID);
    expect(h.poller.getSnapshot().review).toBeNull();
    expect(h.poller.getSnapshot().postId).toBe(OTHER_POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().review?.status).toBe('PROCESSING');
  });

  it('TC-AIR-019 완료된 게시물에 refresh(상세 재진입)하면 GET으로 갱신하되 POST는 없다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: COMPLETED } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.poller.refresh(POST_ID);
    await h.pollSleeper.settle();
    expect(h.timesOf(GET_AI)).toHaveLength(2);
    expect(h.timesOf(POST_AI)).toHaveLength(0);
  });

  it('TC-AIR-042 stop하면 폴링이 멈추고 대기 중인 sleep도 취소된다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(3 * SEC);
    h.poller.stop();
    await h.pollSleeper.advance(120 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
    expect(h.pollSleeper.waiting).toBe(0);
  });

  it('TC-AIR-042 stop 뒤에 도착한 GET 응답은 상태를 갱신하지 않는다', async () => {
    const late = gate(COMPLETED);
    const h = await createAiReviewHarness({ routes: { [GET_AI]: [PROCESSING] } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.router.set(GET_AI, late.route);
    await h.pollSleeper.advance(3 * SEC);
    h.poller.stop();
    late.release();
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().review?.status).toBe('PROCESSING');
  });

  it('TC-AIR-042 stop은 결과 상태를 지우지 않고, 복귀(start)하면 GET부터 새 300초 창을 시작한다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(200 * SEC);
    h.poller.stop();
    expect(h.poller.getSnapshot().review?.status).toBe('PROCESSING');
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(299 * SEC);
    expect(h.poller.getSnapshot().stalled).toBe(false);
    await h.pollSleeper.advance(1 * SEC);
    expect(h.poller.getSnapshot().stalled).toBe(true);
  });

  it('TC-AIR-042 같은 게시물로 start를 반복해도 폴링 루프는 하나다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    const start = h.clock.now().getTime();
    h.poller.start(POST_ID);
    h.poller.start(POST_ID);
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(6 * SEC);
    expect(offsets(h, start).filter((s) => s > 0)).toEqual([3, 6]);
  });

  it('TC-AIR-043 수동 갱신 이후 늦게 도착한 이전 폴링 응답은 완료 결과를 덮어쓰지 않는다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    const slow = gate(PROCESSING);
    h.router.set(GET_AI, slow.route);
    await h.pollSleeper.advance(3 * SEC);
    h.router.set(GET_AI, COMPLETED);
    h.poller.refresh(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().review?.status).toBe('COMPLETED');
    slow.release();
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().review?.status).toBe('COMPLETED');
  });
});

describe('AiReviewPoller 취소: 게시물·계정·dispose (TC-AIR-044)', () => {
  it('TC-AIR-044 게시물 A에서 B로 이동하면 A의 늦은 GET 응답이 B 상태를 덮어쓰지 않는다', async () => {
    const lateA = gate(COMPLETED);
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: lateA.route, [GET_OTHER_AI]: PROCESSING },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.poller.start(OTHER_POST_ID);
    await h.pollSleeper.settle();
    lateA.release();
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot()).toMatchObject({
      postId: OTHER_POST_ID,
      review: { status: 'PROCESSING' },
    });
  });

  it('TC-AIR-044 세션 세대가 바뀌면(로그아웃·계정 전환) 폴링이 멈춘다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.advance(3 * SEC);
    await h.sessionStore.clear();
    const gets = h.timesOf(GET_AI).length;
    await h.pollSleeper.advance(120 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(gets);
    expect(h.pollSleeper.waiting).toBe(0);
  });

  it('TC-AIR-044 사용자 A의 늦은 응답은 B가 로그인한 뒤 폐기된다', async () => {
    const lateA = gate(COMPLETED);
    const h = await createAiReviewHarness({ routes: { [GET_AI]: lateA.route } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.sessionStore.saveAuthenticated({
      userId: 'user-b',
      accessToken: 'access-b',
      accessTokenExpiresAt: new Date(h.clock.now().getTime() + 900_000),
      refreshToken: 'refresh-b',
      refreshTokenExpiresAt: new Date(h.clock.now().getTime() + 900_000_000),
    });
    lateA.release();
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().review).toBeNull();
    expect(h.poller.getSnapshot().phase).not.toBe('ready');
  });

  it('TC-AIR-044 clearAll(UserDataCache)은 폴링을 멈추고 상태를 처음으로 되돌린다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: COMPLETED } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.poller.clearAll();
    expect(h.poller.getSnapshot()).toMatchObject({
      postId: null,
      phase: 'idle',
      review: null,
      requesting: false,
      stalled: false,
    });
  });

  it('TC-AIR-042 dispose하면 대기 중인 sleep이 취소되고 이후 GET이 나가지 않는다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.poller.dispose();
    await h.pollSleeper.advance(120 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    expect(h.pollSleeper.waiting).toBe(0);
  });

  it('TC-AIR-044 계정이 바뀐 뒤 응답은 오류 문구·로그인 이동도 만들지 않는다', async () => {
    const lateA = gate(PROCESSING);
    const h = await createAiReviewHarness({ routes: { [GET_AI]: lateA.route } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.sessionStore.clear();
    lateA.release();
    await h.pollSleeper.settle();
    expect(h.toast.messages).toEqual([]);
    expect(h.authFlow.calls).toEqual([]);
  });
});
