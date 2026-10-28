import {
  AuthenticationRequiredError,
  CancelledError,
  InvalidResponseError,
  NetworkError,
  TimeoutError,
} from '../../core/http/ApiError';
import {
  createNetHarness,
  refreshOk,
  unauthorized,
} from '../../core/http/__testing__/createNetHarness';
import { fixtureBody, fixtureResponse, loadFixture } from '../../core/http/__testing__/loadFixture';
import { json } from '../../core/http/__testing__/FakeTransport';
import { authorizationOf, pathOf } from '../__testing__/requestAsserts';
import { AiReviewRepository } from './AiReviewRepository';

const ID = '22222222-2222-4222-8222-222222222201';
const GET = (name: string) => fixtureResponse(`ai-review/ai-review-get__${name}`);
const POST = (name: string) => fixtureResponse(`ai-review/ai-review-post__${name}`);

async function setup() {
  const net = createNetHarness();
  await net.signIn();
  return { ...net, repository: new AiReviewRepository({ api: net.api }) };
}

/** 완료 fixture를 바탕으로 필드 하나를 바꾼 200 응답. */
function completedWith(change: (body: Record<string, any>) => void) {
  const body = fixtureBody<Record<string, any>>('ai-review/ai-review-get__completed');
  change(body);
  return json(200, body);
}

describe('AiReviewRepository 요청 (TC-AIR-001)', () => {
  it('TC-AIR-001 GET과 POST는 같은 경로와 Authorization을 쓰고 본문을 보내지 않는다', async () => {
    const h = await setup();
    h.transport.script(GET('none'), POST('202-processing'));
    await h.repository.get(ID);
    await h.repository.request(ID);
    const [get, post] = h.transport.requests;
    expect([get.method, post.method]).toEqual(['GET', 'POST']);
    expect([pathOf(get), pathOf(post)]).toEqual([
      `/posts/${ID}/ai-review`,
      `/posts/${ID}/ai-review`,
    ]);
    expect(get.body).toBeUndefined();
    expect(post.body).toBeUndefined();
    expect(authorizationOf(get)).toBe('Bearer access-1');
    expect(authorizationOf(post)).toBe('Bearer access-1');
  });

  it('TC-AIR-001 POST는 연결 실패·5xx 뒤에도 자동 재전송하지 않는다(D-21)', async () => {
    const h = await setup();
    h.transport.script(new NetworkError('offline'));
    await expect(h.repository.request(ID)).rejects.toBeInstanceOf(NetworkError);
    expect(h.transport.requestsTo('POST', '/ai-review')).toHaveLength(1);

    const again = await setup();
    again.transport.script(POST('500-server-error'));
    await expect(again.repository.request(ID)).rejects.toMatchObject({ status: 500 });
    expect(again.transport.requestsTo('POST', '/ai-review')).toHaveLength(1);
    expect(again.sleeper.calls).toEqual([]);
  });

  it('TC-AIR-001 GET은 D-21대로 5xx에서 0.5초, 1초 뒤 다시 보낸다', async () => {
    const h = await setup();
    h.transport.script(GET('500-server-error'), GET('500-server-error'), GET('processing'));
    await expect(h.repository.get(ID)).resolves.toMatchObject({ status: 'PROCESSING' });
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });
});

describe('AiReviewRepository 파싱 (TC-AIR-002~008)', () => {
  it('TC-AIR-002 NONE은 canRequestAgain=false에 시각·result가 모두 null이다', async () => {
    const h = await setup();
    h.transport.script(GET('none'));
    await expect(h.repository.get(ID)).resolves.toEqual({
      status: 'NONE',
      requestedAt: null,
      completedAt: null,
      result: null,
      canRequestAgain: false,
    });
  });

  it('TC-AIR-003 COMPLETED는 점수·기준·독특한 시각·피드백 4항목과 시각을 읽는다', async () => {
    const h = await setup();
    h.transport.script(GET('completed'));
    const review = await h.repository.get(ID);
    expect(review.status).toBe('COMPLETED');
    expect(review.requestedAt).toEqual(new Date('2026-10-27T02:58:00Z'));
    expect(review.completedAt).toEqual(new Date('2026-10-27T02:58:21Z'));
    expect(review.result).toEqual({
      overallScore: 7.5,
      criteria: [{ key: 'COMPOSITION', label: '구도', score: 7.5 }],
      distinctivePerspective: true,
      feedback: {
        summary: '빛을 따라 시선이 흐르는 안정적인 구도',
        strength: '빛이 들어오는 방향을 따라 시선이 자연스럽게 이어집니다.',
        weakness: '수평선이 살짝 기울어 안정감이 조금 떨어집니다.',
        suggestion: '카메라를 낮추고 수평선을 맞춰 한 번 더 찍어 보세요.',
      },
    });
    expect(review.canRequestAgain).toBe(false);
  });

  it('TC-AIR-003 소수초가 있는 UTC ISO-8601 시각도 읽는다', async () => {
    const h = await setup();
    h.transport.script(GET('completed-fractional-seconds'));
    const review = await h.repository.get(ID);
    expect(review.requestedAt).toEqual(new Date('2026-10-27T02:58:00.123Z'));
    expect(review.completedAt).toEqual(new Date('2026-10-27T02:58:21.123Z'));
  });

  it('TC-AIR-003 criteria는 개수를 고정하지 않고 응답 순서대로 읽는다(3개)', async () => {
    const h = await setup();
    h.transport.script(GET('completed-long-text'));
    const review = await h.repository.get(ID);
    const body = loadFixture<{ result: { criteria: { key: string }[] } }>(
      'ai-review/ai-review-get__completed-long-text',
    );
    expect(review.result?.criteria.map((c) => c.key)).toEqual(
      body.result.criteria.map((c) => c.key),
    );
    expect(review.result?.criteria).toHaveLength(3);
  });

  it('TC-AIR-004 COMPLETED인데 result가 null이면 InvalidResponseError', async () => {
    const h = await setup();
    h.transport.script(GET('completed-no-result'));
    await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-AIR-005 점수가 10.1이면 응답 전체가 유효하지 않다', async () => {
    const h = await setup();
    h.transport.script(GET('score-out-of-range'));
    await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([-0.1, 10.1])('TC-AIR-005 overallScore %p는 유효하지 않다', async (score) => {
    const h = await setup();
    h.transport.script(completedWith((b) => (b.result.overallScore = score)));
    await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-AIR-005 criteria[].score가 범위 밖이어도 유효하지 않다', async () => {
    const h = await setup();
    h.transport.script(completedWith((b) => (b.result.criteria[0].score = 11)));
    await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-AIR-005 NaN·문자열 점수는 유효하지 않다', async () => {
    const h = await setup();
    h.transport.script(completedWith((b) => (b.result.overallScore = 'NaN')));
    await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([
    ['completed-score-0', 0],
    ['completed-score-10', 10],
  ])('TC-AIR-005 경계값 %s는 유효하다', async (name, score) => {
    const h = await setup();
    h.transport.script(GET(name));
    await expect(h.repository.get(ID)).resolves.toMatchObject({
      result: { overallScore: score },
    });
  });

  it('TC-AIR-006 FAILED는 result=null이고 canRequestAgain을 서버 값 그대로 읽는다', async () => {
    const h = await setup();
    h.transport.script(GET('failed-can-retry'), GET('failed-cannot-retry'));
    await expect(h.repository.get(ID)).resolves.toMatchObject({
      status: 'FAILED',
      result: null,
      canRequestAgain: true,
    });
    await expect(h.repository.get(ID)).resolves.toMatchObject({
      status: 'FAILED',
      result: null,
      canRequestAgain: false,
    });
  });

  it('TC-AIR-006 canRequestAgain 필드가 없으면 false다', async () => {
    const h = await setup();
    h.transport.script(GET('missing-can-request-again'));
    await expect(h.repository.get(ID)).resolves.toMatchObject({ canRequestAgain: false });
  });

  it('TC-AIR-007 알 수 없는 status는 InvalidResponseError', async () => {
    const h = await setup();
    h.transport.script(GET('unknown-status'));
    await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-AIR-007 PROCESSING인데 result가 있으면 InvalidResponseError', async () => {
    const h = await setup();
    const completed = fixtureBody<Record<string, any>>('ai-review/ai-review-get__completed');
    h.transport.script(json(200, { ...completed, status: 'PROCESSING', completedAt: null }));
    await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each(['NONE', 'FAILED'])(
    'TC-AIR-007 %s인데 result가 있으면 InvalidResponseError',
    async (status) => {
      const h = await setup();
      const completed = fixtureBody<Record<string, any>>('ai-review/ai-review-get__completed');
      h.transport.script(json(200, { ...completed, status }));
      await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
    },
  );

  it('TC-AIR-007 JSON이 아니거나 필수 필드가 없는 본문도 InvalidResponseError', async () => {
    const h = await setup();
    h.transport.script(json(200, { requestedAt: null }), json(200, []), json(200, 'x'));
    await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
    await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
    await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each(['summary', 'strength', 'weakness', 'suggestion'])(
    'TC-AIR-007 feedback.%s가 비어 있으면 유효하지 않다(REQ-AIR-045)',
    async (field) => {
      const h = await setup();
      h.transport.script(completedWith((b) => (b.result.feedback[field] = '')));
      await expect(h.repository.get(ID)).rejects.toBeInstanceOf(InvalidResponseError);
    },
  );

  it('TC-AIR-008 POST 202 PROCESSING과 200 COMPLETED를 status로 해석한다', async () => {
    const h = await setup();
    h.transport.script(POST('202-processing'), POST('200-completed'));
    await expect(h.repository.request(ID)).resolves.toMatchObject({
      status: 'PROCESSING',
      result: null,
    });
    await expect(h.repository.request(ID)).resolves.toMatchObject({
      status: 'COMPLETED',
      result: { overallScore: 7.5 },
    });
  });

  it('TC-AIR-008 POST도 응답 검증을 한다(COMPLETED인데 result 없음)', async () => {
    const h = await setup();
    h.transport.script(json(200, fixtureBody('ai-review/ai-review-get__completed-no-result')));
    await expect(h.repository.request(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

describe('AiReviewRepository 오류 변환 (TC-AIR-009, 029, 030)', () => {
  it.each([
    ['400-limit-reached', 400, '더 이상 AI 리뷰를 다시 요청할 수 없습니다.'],
    ['400-disabled', 400, '지금은 AI 리뷰를 요청할 수 없습니다.'],
    ['403-banned', 403, '차단된 회원입니다.'],
    ['404-not-found', 404, '게시물을 찾을 수 없습니다.'],
  ])('TC-AIR-009 POST %s는 HTTP 상태와 서버 message를 보존한다', async (name, status, message) => {
    const h = await setup();
    h.transport.script(POST(name));
    await expect(h.repository.request(ID)).rejects.toMatchObject({
      name: 'HttpError',
      status,
      serverMessage: message,
    });
  });

  it('TC-AIR-009 요청 취소는 CancelledError로 남고 통신 오류로 바뀌지 않는다', async () => {
    const h = await setup();
    h.transport.script(GET('processing'));
    const controller = new AbortController();
    controller.abort();
    const error = await h.repository.get(ID, controller.signal).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CancelledError);
    expect(error).not.toBeInstanceOf(NetworkError);
  });

  it('TC-AIR-029 POST 401 UNAUTHORIZED는 refresh 뒤 원 요청을 1회 재전송한다', async () => {
    const h = await setup();
    let posts = 0;
    h.transport.respond((request) => {
      if (request.url.endsWith('/auth/refresh')) return refreshOk();
      posts += 1;
      return posts === 1 ? POST('401-unauthorized') : POST('202-processing');
    });
    await expect(h.repository.request(ID)).resolves.toMatchObject({ status: 'PROCESSING' });
    expect(h.transport.requestsTo('POST', '/ai-review')).toHaveLength(2);
    expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
    expect(authorizationOf(h.transport.requestsTo('POST', '/ai-review')[1])).toBe(
      'Bearer access-2',
    );
  });

  it('TC-AIR-029 refresh가 불가하면 AuthenticationRequiredError로 끝나고 재전송하지 않는다', async () => {
    const net = createNetHarness();
    await net.signIn({ refreshTokenExpiresAt: new Date(net.clock.now().getTime() - 1) });
    net.transport.script(unauthorized());
    const repository = new AiReviewRepository({ api: net.api });
    await expect(repository.get(ID)).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it('TC-AIR-030 POST가 응답 없이 타임아웃돼도 다시 보내지 않고 TimeoutError(NetworkError)로 던진다', async () => {
    const h = await setup();
    h.transport.script(new TimeoutError('response timeout'));
    await expect(h.repository.request(ID)).rejects.toBeInstanceOf(NetworkError);
    expect(h.transport.requestsTo('POST', '/ai-review')).toHaveLength(1);
  });
});
