import { HttpError, InvalidResponseError, CancelledError } from '../../core/http/ApiError';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { json } from '../../core/http/__testing__/FakeTransport';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { KstDate } from '../../core/time/KstDate';
import { authorizationOf, pathOf, queryOf } from '../__testing__/requestAsserts';
import { TopicRepository } from './TopicRepository';

const TODAY = KstDate.of(2026, 10, 27);

function setup() {
  const net = createNetHarness();
  return { ...net, repository: new TopicRepository({ api: net.api }) };
}

describe('TopicRepository.findByDate', () => {
  it('TC-HOME-015 GET /topics?date=yyyy-MM-dd로 요청하고 응답을 값 객체로 해석한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/topics__open-2026-10-27'));

    const topic = await h.repository.findByDate(TODAY);

    const [request] = h.transport.requests;
    expect(request.method).toBe('GET');
    expect(pathOf(request)).toBe('/topics');
    expect(queryOf(request)).toEqual({ date: '2026-10-27' });
    expect(topic).toEqual({
      id: '11111111-1111-4111-8111-111111111127',
      title: '가을 하늘',
      topicDate: TODAY,
      startsAt: new Date('2026-10-26T15:00:00Z'),
      endsAt: new Date('2026-10-27T15:00:00Z'),
      phase: 'OPEN',
    });
  });

  it('TC-HOME-012 게스트(토큰 없음)는 Authorization 없이 부른다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/topics__open-2026-10-27'));
    await h.repository.findByDate(TODAY);
    expect(authorizationOf(h.transport.requests[0])).toBeUndefined();
  });

  it('REQ-HOME-047 로그인 상태에서는 토큰이 있으면 붙인다(공개 API의 선택 인증)', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('home/topics__open-2026-10-27'));
    await h.repository.findByDate(TODAY);
    expect(authorizationOf(h.transport.requests[0])).toBe('Bearer access-1');
  });

  it('TC-HOME-017 TC-HOME-018 404 "주제를 찾을 수 없습니다."는 오류가 아니라 null이다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/topics__404-not-found'));
    await expect(h.repository.findByDate(TODAY)).resolves.toBeNull();
    expect(h.transport.requests).toHaveLength(1);
  });

  it('REQ-HOME-005 400(미래 날짜)은 null이 아니라 HttpError이고 재시도하지 않는다', async () => {
    const h = setup();
    h.transport.script(
      json(400, { errorCode: 'BUSINESS_ERROR', message: '미래의 주제는 조회할 수 없습니다.' }),
    );
    await expect(h.repository.findByDate(TODAY)).rejects.toMatchObject({
      name: 'HttpError',
      status: 400,
    });
    expect(h.transport.requests).toHaveLength(1);
  });

  it('D-21 5xx는 GET 재시도(0.5초, 1초) 뒤에도 실패하면 HttpError를 던진다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/posts-list__500-server-error'));
    await expect(h.repository.findByDate(TODAY)).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requests).toHaveLength(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });

  it('TC-HOME-015 응답의 topicDate가 요청 날짜와 다르면 InvalidResponseError(응답 검증 실패)', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/topics__open-2026-10-26'));
    await expect(h.repository.findByDate(TODAY)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NET-010 필수 필드(title)가 없으면 InvalidResponseError', async () => {
    const h = setup();
    const { title: _title, ...withoutTitle } = fixtureBody<Record<string, unknown>>(
      'home/topics__open-2026-10-27',
    );
    h.transport.script(json(200, withoutTitle));
    await expect(h.repository.findByDate(TODAY)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NET-009 알 수 없는 phase는 조용히 통과시키지 않고 InvalidResponseError', async () => {
    const h = setup();
    h.transport.script(
      json(200, {
        ...fixtureBody<Record<string, unknown>>('home/topics__open-2026-10-27'),
        phase: 'SOMETHING_NEW',
      }),
    );
    await expect(h.repository.findByDate(TODAY)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NET-009 startsAt이 UTC ISO가 아니면 InvalidResponseError', async () => {
    const h = setup();
    h.transport.script(
      json(200, {
        ...fixtureBody<Record<string, unknown>>('home/topics__open-2026-10-27'),
        startsAt: '2026-10-27 00:00',
      }),
    );
    await expect(h.repository.findByDate(TODAY)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-BANR-008 취소(signal)는 CancelledError이고 응답을 해석하지 않는다', async () => {
    const h = setup();
    const controller = new AbortController();
    h.transport.respond(() => new Promise(() => {}));
    const pending = h.repository.findByDate(TODAY, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(CancelledError);
  });
});
