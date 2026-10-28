import { unauthorized } from '../../core/http/__testing__/createNetHarness';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { AiReviewRepository } from '../../data/ai-review/AiReviewRepository';
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
import { DefaultAiReviewPoller } from './DefaultAiReviewPoller';

const SEC = 1000;

describe('AiReviewPoller 소유자별 정지 (홈과 상세가 폴러 하나를 나눠 쓴다)', () => {
  const home = {};
  const detail = {};

  it('홈이 start(A)한 뒤 상세가 refresh(B)하면, 홈의 stop은 B의 폴링을 멈추지 못한다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: PROCESSING, [GET_OTHER_AI]: PROCESSING },
    });
    h.poller.start(POST_ID, home);
    await h.pollSleeper.settle();
    h.poller.refresh(OTHER_POST_ID, detail);
    await h.pollSleeper.settle();
    h.poller.stop(home);
    const before = h.timesOf(GET_OTHER_AI).length;
    await h.pollSleeper.advance(9 * SEC);
    expect(h.timesOf(GET_OTHER_AI).length).toBe(before + 3);
    expect(h.poller.getSnapshot().postId).toBe(OTHER_POST_ID);
  });

  it('뒤로 가기: 상세가 닫히며 stop하고 홈이 다시 start하면 A 폴링이 돈다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.refresh(OTHER_POST_ID, detail);
    h.poller.stop(detail);
    h.poller.start(POST_ID, home);
    await h.pollSleeper.advance(6 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(3);
  });

  it('뒤로 가기(반대 순서): 홈이 먼저 start하고 상세의 stop이 늦게 와도 홈 폴링은 살아 있다', async () => {
    const h = await createAiReviewHarness({
      routes: { [GET_AI]: PROCESSING, [GET_OTHER_AI]: PROCESSING },
    });
    h.poller.refresh(OTHER_POST_ID, detail);
    await h.pollSleeper.settle();
    h.poller.start(POST_ID, home);
    h.poller.stop(detail);
    await h.pollSleeper.advance(6 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(3);
  });

  it('같은 게시물의 루프를 나눠 쓰는 두 소유자는 둘 다 멈출 때 비로소 멈춘다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID, home);
    h.poller.start(POST_ID, detail);
    h.poller.stop(home);
    await h.pollSleeper.advance(3 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
    h.poller.stop(detail);
    await h.pollSleeper.advance(30 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(2);
  });

  it('소유자 없는 stop()은 무조건 멈춘다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    h.poller.start(POST_ID, home);
    await h.pollSleeper.settle();
    h.poller.stop();
    await h.pollSleeper.advance(30 * SEC);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
  });
});

describe('AiReviewPoller 진행 중인 사용자 POST 보호', () => {
  it('요청 중에 같은 게시물로 start/refresh해도 POST를 중단하지 않고 requesting을 유지한다', async () => {
    const slow = gate(fx('ai-review-post__202-processing'));
    const h = await createAiReviewHarness({ routes: { [POST_AI]: slow.route } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    const pending = h.poller.request(POST_ID);
    await h.pollSleeper.settle();
    h.poller.start(POST_ID);
    h.poller.refresh(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().requesting).toBe(true);
    slow.release();
    await pending;
    expect(h.poller.getSnapshot()).toMatchObject({
      requesting: false,
      review: { status: 'PROCESSING' },
    });
    expect(h.timesOf(POST_AI)).toHaveLength(1);
  });

  it('다른 게시물로 start하면 진행 중이던 POST는 취소된다', async () => {
    const slow = gate(fx('ai-review-post__202-processing'));
    const h = await createAiReviewHarness({
      routes: { [POST_AI]: slow.route, [GET_OTHER_AI]: NONE },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    const pending = h.poller.request(POST_ID);
    await h.pollSleeper.settle();
    h.poller.start(OTHER_POST_ID);
    await pending;
    expect(h.poller.getSnapshot()).toMatchObject({ postId: OTHER_POST_ID, requesting: false });
  });
});

describe('AiReviewPoller 오류 문구와 인증', () => {
  it('POST 실패 뒤 동기화 GET도 실패해도 오류 문구는 한 번만 보인다', async () => {
    const h = await createAiReviewHarness({
      routes: {
        [GET_AI]: [NONE, fx('ai-review-get__500-server-error')],
        [POST_AI]: fx('ai-review-post__500-server-error'),
      },
    });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    await h.poller.request(POST_ID);
    await h.pollSleeper.settle();
    expect(h.toast.messages).toEqual([t('ai.error.load')]);
    // 새 에피소드(다시 확인)에서는 다시 보인다.
    h.poller.refresh(POST_ID);
    await h.pollSleeper.settle();
    expect(h.toast.messages).toEqual([t('ai.error.load'), t('ai.error.load')]);
  });

  it('clearAll 뒤에는 같은 게시물에서도 로그인 이동이 다시 일어난다(AuthErrorPolicy 기록을 넘기지 않는다)', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: unauthorized() } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.authFlow.calls).toEqual(['login']);
    h.poller.clearAll();
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.authFlow.calls).toEqual(['login', 'login']);
  });
});

describe('AiReviewPoller 상태 정리', () => {
  it('첫 GET 도중 stop하면 phase가 checking에 갇히지 않고 늦은 응답도 반영하지 않는다', async () => {
    const late = gate(COMPLETED);
    const h = await createAiReviewHarness({ routes: { [GET_AI]: late.route } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().phase).toBe('checking');
    h.poller.stop();
    expect(h.poller.getSnapshot().phase).not.toBe('checking');
    late.release();
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot().review).toBeNull();
  });

  it('결과가 있는 상태에서 refresh 도중 stop하면 ready로 돌아온다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: COMPLETED } });
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    h.router.set(GET_AI, gate(COMPLETED).route);
    h.poller.refresh(POST_ID);
    await h.pollSleeper.settle();
    h.poller.stop();
    expect(h.poller.getSnapshot()).toMatchObject({
      phase: 'ready',
      review: { status: 'COMPLETED' },
    });
  });

  it('GET 응답이 느려 창이 끝난 뒤 도착하면 같은 갱신에서 stalled가 되고 더 기다리지 않는다', async () => {
    let advance = () => {};
    const h = await createAiReviewHarness({
      routes: {
        [GET_AI]: () => {
          advance();
          return fixtureResponse(PROCESSING);
        },
      },
    });
    advance = () => h.clock.advance(301 * SEC);
    h.poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(h.poller.getSnapshot()).toMatchObject({
      stalled: true,
      review: { status: 'PROCESSING' },
    });
    expect(h.pollSleeper.calls).toEqual([]);
    expect(h.timesOf(GET_AI)).toHaveLength(1);
  });

  it('폴링 루프가 예기치 않게 던져도 처리되지 않은 거부가 되지 않고 확인 중에 갇히지 않는다', async () => {
    const h = await createAiReviewHarness({ routes: { [GET_AI]: PROCESSING } });
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const poller = new DefaultAiReviewPoller({
      reviews: new AiReviewRepository({ api: h.api }),
      clock: h.clock,
      sleeper: {
        sleep: () => Promise.reject(new Error('sleeper bug')),
      },
      session: h.sessionStore,
      toast: h.toast,
      authFlow: h.authFlow,
    });
    poller.start(POST_ID);
    await h.pollSleeper.settle();
    expect(error).toHaveBeenCalled();
    expect(poller.getSnapshot().phase).toBe('ready');
    error.mockRestore();
  });
});
