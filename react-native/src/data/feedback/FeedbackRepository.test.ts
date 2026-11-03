import { HttpError, ReauthenticationRequiredError } from '../../core/http/ApiError';
import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import {
  createNetHarness,
  reauth,
  refreshOk,
  unauthorized,
} from '../../core/http/__testing__/createNetHarness';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { authorizationOf, pathOf } from '../__testing__/requestAsserts';
import { FeedbackRepository } from './FeedbackRepository';

async function setup() {
  const net = createNetHarness();
  await net.signIn();
  return { ...net, repository: new FeedbackRepository({ api: net.api }) };
}

describe('FeedbackRepository.submit', () => {
  it('TC-FDBK-015 POST /feedbacks, JSON 바디 {content}만, Bearer, Content-Type application/json', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feedback/feedbacks__created'));
    await h.repository.submit('좋아요');
    const request = h.transport.requests[0];
    expect(request.method).toBe('POST');
    expect(pathOf(request)).toBe('/feedbacks');
    expect(authorizationOf(request)).toBe('Bearer access-1');
    expect(request.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(request.body))).toEqual({ content: '좋아요' });
  });

  it('TC-FDBK-016 201 응답에서 feedbackId와 createdAt(UTC Instant)을 읽는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feedback/feedbacks__created'));
    const body = fixtureBody<{ feedbackId: string; createdAt: string }>(
      'feedback/feedbacks__created',
    );
    const result = await h.repository.submit('좋아요');
    expect(result.feedbackId).toBe(body.feedbackId);
    expect(result.createdAt.toISOString()).toBe(new Date(body.createdAt).toISOString());
  });

  it('TC-FDBK-012 content를 가공하지 않고 그대로 보낸다(앞뒤 정리는 ViewModel 몫)', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feedback/feedbacks__created'));
    await h.repository.submit('첫 줄\n\n  둘째   줄');
    expect(JSON.parse(String(h.transport.requests[0].body)).content).toBe('첫 줄\n\n  둘째   줄');
  });

  it.each([
    ['blank', 'feedback/feedbacks__bad-request-blank'],
    ['too-long', 'feedback/feedbacks__bad-request-too-long'],
  ])('TC-FDBK-021 400 BUSINESS_ERROR(%s)는 HttpError 400으로 던진다', async (_n, fixture) => {
    const h = await setup();
    h.transport.script(fixtureResponse(fixture));
    await expect(h.repository.submit('x')).rejects.toMatchObject({
      status: 400,
      errorCode: 'BUSINESS_ERROR',
    });
  });

  it('TC-FDBK-022 401이면 refresh 뒤 원 요청을 1회 재전송해 성공한다', async () => {
    const h = await setup();
    h.transport.respond((request) => {
      if (pathOf(request) === '/auth/refresh') return refreshOk();
      return authorizationOf(request) === 'Bearer access-2'
        ? fixtureResponse('feedback/feedbacks__created')
        : fixtureResponse('feedback/feedbacks__unauthorized');
    });
    await expect(h.repository.submit('x')).resolves.toBeDefined();
    expect(h.transport.requestsTo('POST', '/feedbacks')).toHaveLength(2);
  });

  it('TC-FDBK-023 401 REAUTHENTICATION_REQUIRED면 ReauthenticationRequiredError다', async () => {
    const h = await setup();
    h.transport.respond((request) =>
      pathOf(request) === '/auth/refresh' ? reauth() : unauthorized(),
    );
    await expect(h.repository.submit('x')).rejects.toBeInstanceOf(ReauthenticationRequiredError);
  });

  it('TC-FDBK-024 500은 자동 재시도 없이 1회만 요청하고 HttpError로 끝난다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feedback/feedbacks__internal-error'));
    await expect(h.repository.submit('x')).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requestsTo('POST', '/feedbacks')).toHaveLength(1);
    expect(h.sleeper.calls).toEqual([]);
  });

  it('TC-FDBK-025 연결 실패도 재시도하지 않는다', async () => {
    const h = await setup();
    h.transport.script(networkFailure());
    await expect(h.repository.submit('x')).rejects.toBeDefined();
    expect(h.transport.requestsTo('POST', '/feedbacks')).toHaveLength(1);
  });

  it('TC-FDBK-027 Retry-After가 있는 503도 재시도하지 않는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('common/error__service-unavailable-503'));
    await expect(h.repository.submit('x')).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requestsTo('POST', '/feedbacks')).toHaveLength(1);
    expect(h.sleeper.calls).toEqual([]);
  });
});
