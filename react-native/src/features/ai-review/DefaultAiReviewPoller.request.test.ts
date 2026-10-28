import { NetworkError, TimeoutError } from '../../core/http/ApiError';
import { unauthorized } from '../../core/http/__testing__/createNetHarness';
import { t } from '../../shared/copy';
import {
  COMPLETED,
  FAILED_RETRY,
  GET_AI,
  NONE,
  POST_202,
  POST_AI,
  POST_ID,
  PROCESSING,
  createAiReviewHarness,
  fx,
  gate,
} from './__testing__/createAiReviewHarness';

const SEC = 1000;
const POST_400_LIMIT = fx('ai-review-post__400-limit-reached');

describe('AiReviewPoller 요청(POST)', () => {
  it('TC-AIR-022 POST 202 PROCESSING이면 분석중이 되고 응답 시각을 창 시작으로 3초 간격 폴링한다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: [NONE, PROCESSING] } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.clock.advance(40 * SEC);
    const sent = h.clock.now().getTime();
    await h.poller.request(POST_ID);
    expect(h.poller.getSnapshot()).toMatchObject({
      requesting: false,
      review: { status: 'PROCESSING' },
    });
    expect(h.timesOf(POST_AI)).toEqual([sent]);
    await h.pollSleeper.advance(2900);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    await h.pollSleeper.advance(100);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
  });

  it('TC-AIR-022 POST 중에는 requesting이고 "AI 요청중" 상태를 구독자에게 알린다', async () => {
    const slow = gate(fx('ai-review-post__202-processing'));
    const h = await createAiReviewHarness({ routes: { [POST_AI]: slow.route } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    const pending = h.poller.request(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().requesting).toBe(true);
    slow.release();
    await pending;
    expect(h.poller.getSnapshot().requesting).toBe(false);
  });

  it('TC-AIR-023 응답을 기다리는 중 연타해도 POST는 1건이고 응답 뒤에도 자동 재전송이 없다', async () => {
    const slow = gate(fx('ai-review-post__202-processing'));
    const h = await createAiReviewHarness({ routes: { [POST_AI]: slow.route } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    const first = h.poller.request(POST_ID);
    void h.poller.request(POST_ID);
    void h.poller.request(POST_ID);
    await h.pollSleeper.settle();
    slow.release();
    await first;
    await h.pollSleeper.advance(30 * SEC);
    expect(h.timesOf(POST_AI)).toHaveLength(1);
  });

  it('TC-AIR-024 이미 완료된 리뷰의 POST 200 COMPLETED는 그대로 표시하고 폴링하지 않는다', async () => {
    const h = await createAiReviewHarness({
      routes: { [POST_AI]: fx('ai-review-post__200-completed') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.poller.request(POST_ID);
    expect(h.poller.getSnapshot().review).toMatchObject({
      status: 'COMPLETED',
      result: { overallScore: 7.5 },
    });
    await h.pollSleeper.advance(600 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
  });

  it('TC-AIR-025 FAILED 재요청의 폴링 창은 이번 POST 시각부터 300초다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: [FAILED_RETRY, PROCESSING], [POST_AI]: POST_202 },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().review).toMatchObject({
      status: 'FAILED',
      canRequestAgain: true,
    });
    h.clock.advance(1000 * SEC);
    await h.poller.request(POST_ID);
    expect(h.poller.getSnapshot().review?.status).toBe('PROCESSING');
    await h.pollSleeper.advance(299 * SEC);
    expect(h.poller.getSnapshot().stalled).toBe(false);
    await h.pollSleeper.advance(1 * SEC);
    expect(h.poller.getSnapshot().stalled).toBe(true);
  });

  it('TC-AIR-026 400 "더 이상 ... 요청할 수 없습니다."는 서버 message를 그대로 알리고 이전 단계를 유지하며 다시 보내지 않는다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: FAILED_RETRY, [POST_AI]: POST_400_LIMIT },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.poller.request(POST_ID);
    expect(h.toast.messages).toEqual(['더 이상 AI 리뷰를 다시 요청할 수 없습니다.']);
    expect(h.poller.getSnapshot()).toMatchObject({
      requesting: false,
      review: { status: 'FAILED' },
    });
    await h.pollSleeper.advance(60 * SEC);
    expect(h.timesOf(POST_AI)).toHaveLength(1);
  });

  it('TC-AIR-026 400 "지금은 ... 요청할 수 없습니다."도 서버 message 그대로다', async () => {
    const h = await createAiReviewHarness({
      routes: { [POST_AI]: fx('ai-review-post__400-disabled') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.poller.request(POST_ID);
    expect(h.toast.messages).toEqual(['지금은 AI 리뷰를 요청할 수 없습니다.']);
    expect(h.poller.getSnapshot().review?.status).toBe('NONE');
  });

  it('TC-AIR-027 정지 회원 POST 403은 정해진 문구를 보이고 재요청하지 않으며 GET은 정상 조회된다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: COMPLETED, [POST_AI]: fx('ai-review-post__403-banned') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().review?.status).toBe('COMPLETED');
    await h.poller.request(POST_ID);
    expect(h.toast.messages).toEqual([t('ai.error.banned')]);
    expect(h.poller.getSnapshot().review?.status).toBe('COMPLETED');
    await h.pollSleeper.advance(60 * SEC);
    expect(h.timesOf(POST_AI)).toHaveLength(1);
  });

  it('TC-AIR-028 POST 404면 조회 불가(hidden)로 두고 추가 조회를 막는다', async () => {
    const h = await createAiReviewHarness({
      routes: { [POST_AI]: fx('ai-review-post__404-not-found') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.poller.request(POST_ID);
    expect(h.poller.getSnapshot().phase).toBe('hidden');
    expect(h.toast.messages).toEqual([t('ai.error.not-found')]);
    await h.pollSleeper.advance(60 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
  });

  it('TC-AIR-029 POST 401(남은 UNAUTHORIZED)은 로그인으로 보내고 오류 문구를 만들지 않는다', async () => {
    const h = await createAiReviewHarness({ routes: { [POST_AI]: unauthorized() } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.poller.request(POST_ID);
    expect(h.authFlow.calls).toEqual(['login']);
    expect(h.toast.messages).toEqual([]);
    expect(h.poller.getSnapshot().requesting).toBe(false);
  });

  it('TC-AIR-030 POST 응답이 유실되면 네트워크 문구를 보이고 POST는 반복하지 않으며 GET으로 동기화한다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: [NONE, PROCESSING], [POST_AI]: () => new TimeoutError('response') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.poller.request(POST_ID);
    await h.pollSleeper.settle();
    expect(h.toast.messages).toEqual([t('ai.error.network')]);
    expect(h.timesOf(POST_AI)).toHaveLength(1);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
    // 요청이 접수됐을 수 있으므로 서버가 PROCESSING이면 분석중으로 따라간다.
    expect(h.poller.getSnapshot().review?.status).toBe('PROCESSING');
    await h.pollSleeper.advance(3 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(3);
    expect(h.timesOf(POST_AI)).toHaveLength(1);
  });

  it('TC-AIR-030 연결 실패(NetworkError)도 같다', async () => {
    const h = await createAiReviewHarness({ routes: { [POST_AI]: () => new NetworkError('x') } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.poller.request(POST_ID);
    await h.pollSleeper.settle();
    expect(h.toast.messages).toEqual([t('ai.error.network')]);
    expect(h.timesOf(POST_AI)).toHaveLength(1);
  });

  it('TC-AIR-031 POST 500은 자동 재시도 없이 오류 문구를 보이고 이전 단계를 유지한다', async () => {
    const h = await createAiReviewHarness({
      routes: { [POST_AI]: fx('ai-review-post__500-server-error') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.poller.request(POST_ID);
    await h.pollSleeper.advance(30 * SEC);
    expect(h.toast.messages).toEqual([t('ai.error.load')]);
    expect(h.timesOf(POST_AI)).toHaveLength(1);
    expect(h.poller.getSnapshot().review?.status).toBe('NONE');
  });

  it('TC-AIR-004 POST 응답이 유효하지 않으면 "정보를 불러오지 못했어요"를 알리고 GET으로 동기화한다', async () => {
    const h = await createAiReviewHarness({
      routes: { [POST_AI]: fx('ai-review-get__completed-no-result') },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.poller.request(POST_ID);
    await h.pollSleeper.settle();
    expect(h.toast.messages).toEqual([t('ai.error.load')]);
    expect(h.timesOf(POST_AI)).toHaveLength(1);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
  });

  it('TC-AIR-042 POST 응답 전에 stop하면 늦게 온 응답으로 상태를 바꾸거나 폴링을 시작하지 않는다', async () => {
    const slow = gate(fx('ai-review-post__202-processing'));
    const h = await createAiReviewHarness({ routes: { [POST_AI]: slow.route } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    const pending = h.poller.request(POST_ID);
    await h.pollSleeper.settle();
    h.poller.stop();
    slow.release();
    await pending;
    await h.pollSleeper.advance(30 * SEC);
    expect(h.poller.getSnapshot().review?.status).toBe('NONE');
    expect(h.timesOf(GET_AI)).toHaveLength(1);
  });

  it('TC-AIR-044 POST 응답 전에 게시물·계정이 바뀌면 늦은 응답을 버린다', async () => {
    const slow = gate(fx('ai-review-post__202-processing'));
    const h = await createAiReviewHarness({ routes: { [POST_AI]: slow.route } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    const pending = h.poller.request(POST_ID);
    await h.pollSleeper.settle();
    await h.sessionStore.clear();
    slow.release();
    await pending;
    await h.pollSleeper.advance(30 * SEC);
    expect(h.poller.getSnapshot().review?.status).not.toBe('PROCESSING');
    expect(h.timesOf(GET_AI)).toHaveLength(1);
    expect(h.toast.messages).toEqual([]);
  });
});
