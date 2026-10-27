import { CancelledError, InvalidResponseError, NetworkError } from '../../core/http/ApiError';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { authorizationOf, pathOf, queryOf } from '../__testing__/requestAsserts';
import { BannerRepository } from './BannerRepository';

function setup() {
  const net = createNetHarness();
  return { ...net, repository: new BannerRepository({ api: net.api }) };
}

type BannerFixture = { banners: { id: string; title: string }[] };

describe('BannerRepository.list', () => {
  it('TC-BANR-001 GET /banners?page=1&pageSize=10을 Authorization 없이 부르고 서버 순서대로 매핑한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('banner/banners__page1-10'));

    const page = await h.repository.list(1);

    const [request] = h.transport.requests;
    expect(pathOf(request)).toBe('/banners');
    expect(queryOf(request)).toEqual({ page: '1', pageSize: '10' });
    expect(authorizationOf(request)).toBeUndefined();
    const expected = fixtureBody<BannerFixture>('banner/banners__page1-10').banners;
    expect(page.banners.map((b) => b.id)).toEqual(expected.map((b) => b.id));
    expect(page.banners[0]).toEqual({
      id: '44444444-4444-4444-8444-444444444401',
      title: '이슈 1',
      subtitle: '찰칵 소식 1',
      webViewUrl: 'https://web.example.test/issues/1',
      thumbnailUrl:
        'https://cdn.example.test/banners/44444444-4444-4444-8444-444444444401/thumbnail.webp',
      createdAt: new Date('2026-10-27T01:00:00Z'),
    });
    expect(page).toMatchObject({ currentPage: 1, pageSize: 10, hasNext: true });
  });

  it('TC-BANR-001 로그인 상태에서도 토큰을 붙이지 않는다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('banner/banners__page1-10'));
    await h.repository.list(1);
    expect(authorizationOf(h.transport.requests[0])).toBeUndefined();
  });

  it('TC-BANR-002 만료된 액세스 토큰이 있어도 토큰을 보내지 않아 200으로 받는다', async () => {
    const h = setup();
    await h.signIn({ accessTokenExpiresAt: new Date(h.clock.now().getTime() - 60_000) });
    h.transport.script(fixtureResponse('banner/banners__page1-10'));
    await expect(h.repository.list(1)).resolves.toMatchObject({ hasNext: true });
    expect(authorizationOf(h.transport.requests[0])).toBeUndefined();
  });

  it('TC-BANR-002 서버가 401을 줘도 refresh를 시도하지 않고 HttpError 401로 끝난다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('banner/banners__401-unauthorized'));
    await expect(h.repository.list(1)).rejects.toMatchObject({ name: 'HttpError', status: 401 });
    expect(h.transport.requests).toHaveLength(1);
    expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
  });

  it('TC-BANR-003 page=2는 쿼리 그대로 전달되고 마지막 페이지를 해석한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('banner/banners__page2-last'));
    const page = await h.repository.list(2);
    expect(queryOf(h.transport.requests[0])).toEqual({ page: '2', pageSize: '10' });
    expect(page).toMatchObject({ currentPage: 2, hasNext: false });
    expect(page.banners).toHaveLength(3);
  });

  it('TC-BANR-003 빈 banners와 hasNext=false는 오류 없이 처리한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('banner/banners__empty'));
    await expect(h.repository.list(1)).resolves.toEqual({
      currentPage: 1,
      pageSize: 10,
      hasNext: false,
      banners: [],
    });
  });

  it('TC-BANR-004 hasNext 필드가 없으면 마지막 페이지(false)로 처리한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('banner/banners__no-has-next'));
    const page = await h.repository.list(1);
    expect(page.hasNext).toBe(false);
    expect(page.banners).toHaveLength(3);
  });

  it('TC-BANR-005 400은 갱신도 재시도도 하지 않는다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('banner/banners__400-bad-query'));
    await expect(h.repository.list(1)).rejects.toMatchObject({ name: 'HttpError', status: 400 });
    expect(h.transport.requests).toHaveLength(1);
  });

  it('TC-BANR-005 5xx는 0.5초·1초 백오프로 2회 재시도한 뒤 HttpError', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('banner/banners__500-server-error'));
    await expect(h.repository.list(1)).rejects.toMatchObject({ name: 'HttpError', status: 500 });
    expect(h.transport.requests).toHaveLength(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });

  it('TC-BANR-005 연결 오류도 재시도 뒤 NetworkError', async () => {
    const h = setup();
    h.transport.script(networkFailure());
    await expect(h.repository.list(1)).rejects.toBeInstanceOf(NetworkError);
    expect(h.transport.requests).toHaveLength(3);
  });

  it('TC-BANR-006 깨진 JSON은 InvalidResponseError', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('banner/banners__malformed'));
    await expect(h.repository.list(1)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-BANR-006 REQ-BANR-003 webViewUrl이 http://이면 응답 전체가 잘못된 응답이다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('banner/banners__insecure-url'));
    await expect(h.repository.list(1)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-BANR-006 필수 필드(webViewUrl)가 빠진 배너가 있으면 InvalidResponseError', async () => {
    const h = setup();
    const body = fixtureBody<{ banners: Record<string, unknown>[] }>('banner/banners__page2-last');
    delete body.banners[1].webViewUrl;
    h.transport.script({
      status: 200,
      headers: { 'content-type': 'application/json' },
      bodyText: JSON.stringify(body),
    });
    await expect(h.repository.list(2)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-BANR-007 잘못된 thumbnailUrl은 null로 바꿔 배너를 유지한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('banner/banners__bad-thumbnail'));
    const page = await h.repository.list(1);
    expect(page.banners.map((b) => b.thumbnailUrl === null)).toEqual([false, true, false]);
    expect(page.banners[1].title).toBe('이슈 2');
  });

  it('TC-BANR-008 취소는 CancelledError이고 다른 오류로 바뀌지 않는다', async () => {
    const h = setup();
    const controller = new AbortController();
    h.transport.respond(() => new Promise(() => {}));
    const pending = h.repository.list(1, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(CancelledError);
  });
});
