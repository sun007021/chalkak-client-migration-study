import { InvalidResponseError, NetworkError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { networkFailure } from '../../test/fakeFetch';
import { json } from '../../test/fixtureRouter';
import { guestSession, loadFixture, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import type { StoredSession } from '../../core/auth/SessionStore';
import { BannerRepository } from './BannerRepository';

function setup(session: StoredSession = guestSession) {
  const env = makeApiEnv(session);
  const respond = (fixture: string) => () => loadFixture(`${fixture}.json`).toResponse();
  const settled = async <T>(promise: Promise<T>) => {
    const result = track(promise);
    await env.clock.advance(5_000);
    return result;
  };
  return { ...env, repo: new BannerRepository({ api: env.client() }), respond, settled };
}
type BannerFixture = { banners: { id: string }[] };

describe('BannerRepository.list (GET /banners)', () => {
  it('TC-BANR-001 REQ-BANR-001 ?page=1&pageSize=10을 Authorization 없이 부르고 서버 순서대로 매핑한다', async () => {
    const h = setup();
    h.ff.route('GET /banners', h.respond('banner/banners__page1-10'));
    const page = await h.repo.list(1);
    const call = h.ff.calls[0]!;
    expect(call.method).toBe('GET');
    expect(Object.fromEntries(call.query.entries())).toEqual({ page: '1', pageSize: '10' });
    expect(call.headers['authorization']).toBeUndefined();
    const expected = (loadFixture('banner/banners__page1-10.json').json as BannerFixture).banners;
    expect(page.banners.map((b) => b.id)).toEqual(expected.map((b) => b.id));
    expect(page.banners[0]).toEqual({
      id: '44444444-4444-4444-8444-444444444401',
      title: '이슈 1',
      subtitle: '찰칵 소식 1',
      webViewUrl: 'https://web.example.test/issues/1',
      thumbnailUrl: 'https://cdn.example.test/banners/44444444-4444-4444-8444-444444444401/thumbnail.webp',
      createdAt: Date.parse('2026-10-27T01:00:00Z'),
    });
    expect(page).toMatchObject({ currentPage: 1, pageSize: 10, hasNext: true });
  });

  it('TC-BANR-001 TC-BANR-002 로그인 상태(만료된 access token 포함)에서도 토큰을 붙이지 않아 갱신 호출도 없다', async () => {
    const h = setup(memberSession({ accessTokenExpiresAt: 1 }));
    h.ff.route('GET /banners', h.respond('banner/banners__page1-10'));
    await expect(h.repo.list(1)).resolves.toMatchObject({ hasNext: true });
    expect(h.ff.calls[0]!.headers['authorization']).toBeUndefined();
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(0);
  });

  it('TC-BANR-002 서버가 401을 줘도 refresh를 시도하지 않고 ApiError 401로 끝난다(재시도 없음)', async () => {
    const h = setup(memberSession());
    h.ff.route('GET /banners', h.respond('banner/banners__401-unauthorized'));
    const result = await h.settled(h.repo.list(1));
    expect(result.error).toMatchObject({ status: 401 });
    expect(h.ff.calls).toHaveLength(1);
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(0);
  });

  it('TC-BANR-003 page=2는 쿼리 그대로 전달되고 마지막 페이지를 해석한다', async () => {
    const h = setup();
    h.ff.route('GET /banners', h.respond('banner/banners__page2-last'));
    const page = await h.repo.list(2);
    expect(Object.fromEntries(h.ff.calls[0]!.query.entries())).toEqual({ page: '2', pageSize: '10' });
    expect(page).toMatchObject({ currentPage: 2, hasNext: false });
    expect(page.banners).toHaveLength(3);
  });

  it('TC-BANR-003 빈 banners와 hasNext=false는 오류 없이 처리한다', async () => {
    const h = setup();
    h.ff.route('GET /banners', h.respond('banner/banners__empty'));
    await expect(h.repo.list(1)).resolves.toEqual({ currentPage: 1, pageSize: 10, hasNext: false, banners: [] });
  });

  it('TC-BANR-004 REQ-BANR-002 hasNext 필드가 없으면 마지막 페이지(false)로 처리한다', async () => {
    const h = setup();
    h.ff.route('GET /banners', h.respond('banner/banners__no-has-next'));
    const page = await h.repo.list(1);
    expect(page.hasNext).toBe(false);
    expect(page.banners).toHaveLength(3);
  });

  it('TC-BANR-005 400은 갱신도 재시도도 하지 않는다', async () => {
    const h = setup(memberSession());
    h.ff.route('GET /banners', h.respond('banner/banners__400-bad-query'));
    const result = await h.settled(h.repo.list(1));
    expect(result.error).toMatchObject({ status: 400 });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-BANR-005 D-21 5xx는 0.5초, 1초 백오프로 2회 재시도한 뒤 ApiError(총 3회)', async () => {
    const h = setup();
    h.ff.route('GET /banners', h.respond('banner/banners__500-server-error'));
    const result = track(h.repo.list(1));
    await h.clock.advance(0);
    expect(h.ff.calls).toHaveLength(1);
    await h.clock.advance(500);
    expect(h.ff.calls).toHaveLength(2);
    await h.clock.advance(1_000);
    expect(h.ff.calls).toHaveLength(3);
    await h.clock.advance(10_000);
    expect(h.ff.calls).toHaveLength(3);
    expect(result.error).toMatchObject({ status: 500 });
  });

  it('TC-BANR-005 연결 오류도 재시도 뒤 NetworkError', async () => {
    const h = setup();
    h.ff.route('GET /banners', networkFailure);
    const result = await h.settled(h.repo.list(1));
    expect(result.error).toBeInstanceOf(NetworkError);
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-BANR-006 깨진 JSON(필수 필드 누락)은 InvalidResponseError', async () => {
    const h = setup();
    h.ff.route('GET /banners', h.respond('banner/banners__malformed'));
    const result = await h.settled(h.repo.list(1));
    expect(result.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-BANR-006 REQ-BANR-003 webViewUrl이 http://이면 응답 전체가 InvalidResponseError', async () => {
    const h = setup();
    h.ff.route('GET /banners', h.respond('banner/banners__insecure-url'));
    const result = await h.settled(h.repo.list(1));
    expect(result.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-BANR-006 필수 필드(webViewUrl)가 빠진 배너가 하나라도 있으면 InvalidResponseError', async () => {
    const h = setup();
    const body = loadFixture('banner/banners__page2-last.json').json as { banners: Record<string, unknown>[] };
    delete body.banners[1]!.webViewUrl;
    h.ff.route('GET /banners', () => json(200, body));
    const result = await h.settled(h.repo.list(2));
    expect(result.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-BANR-007 REQ-BANR-003 잘못된 thumbnailUrl은 null로 바꿔 그 배너를 유지한다', async () => {
    const h = setup();
    h.ff.route('GET /banners', h.respond('banner/banners__bad-thumbnail'));
    const page = await h.repo.list(1);
    expect(page.banners.map((b) => b.thumbnailUrl === null)).toEqual([false, true, false]);
    expect(page.banners[1]!.title).toBe('이슈 2');
  });

  it('TC-BANR-008 취소(signal)는 AbortError 그대로이고 다른 오류로 바뀌지 않는다', async () => {
    const h = setup();
    const controller = new AbortController();
    h.ff.route('GET /banners', () => new Promise<Response>(() => {}));
    const pending = track(h.repo.list(1, controller.signal));
    await h.clock.advance(0);
    controller.abort();
    await h.clock.advance(0);
    expect(pending.error).toMatchObject({ name: 'AbortError' });
  });
});
