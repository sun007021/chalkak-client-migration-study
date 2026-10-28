import { HttpError, InvalidResponseError } from '../../core/http/ApiError';
import {
  createNetHarness,
  refreshOk,
  unauthorized,
} from '../../core/http/__testing__/createNetHarness';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { KstDate } from '../../core/time/KstDate';
import { authorizationOf, pathOf, queryOf } from '../__testing__/requestAsserts';
import { PostRepository } from './PostRepository';

const TODAY = KstDate.of(2026, 10, 27);

function setup() {
  const net = createNetHarness();
  return { ...net, repository: new PostRepository({ api: net.api }) };
}

describe('PostRepository.list (전시)', () => {
  it('TC-DISP-002 사진 4종 URL과 likeCount·isLiked·isMine·title을 매핑한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('display/posts-list__recent-page1'));
    const page = await h.repository.list({ topicDate: TODAY, sort: 'recent' });
    expect(queryOf(h.transport.requests[0])).toEqual({
      topicDate: '2026-10-27',
      sort: 'recent',
      page: '1',
      pageSize: '20',
    });
    expect(page).toMatchObject({ currentPage: 1, pageSize: 20, hasNext: true });
    expect(page.posts).toHaveLength(20);
    expect(page.posts[0]).toMatchObject({
      originalImageUrl: expect.stringContaining('/original.webp'),
      thumbnailImageUrl: expect.stringContaining('/thumbnail.webp'),
      signatureOriginalImageUrl: expect.stringContaining('/original.png'),
      signatureThumbnailImageUrl: expect.stringContaining('/thumbnail.png'),
      title: '은행잎',
      likeCount: 38,
      isLiked: false,
      isMine: false,
    });
    expect(page.posts.some((p) => p.isMine)).toBe(true);
  });

  it.each([
    ['recent', 1],
    ['popular', 3],
    ['random', 2],
  ] as const)('TC-DISP-003 sort=%s는 소문자 그대로, pageSize=20, page=%i', async (sort, page) => {
    const h = setup();
    h.transport.script(fixtureResponse('display/posts-list__recent-page1'));
    await h.repository.list({ topicDate: TODAY, sort, page, randomSeed: 'seed_abc123' });
    const query = queryOf(h.transport.requests[0]);
    expect(query).toMatchObject({ sort, page: String(page), pageSize: '20' });
  });

  it('TC-DISP-003 randomSeed는 [A-Za-z0-9_-]{1,64}일 때만 붙고 그 밖의 값은 요청 없이 거부한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('display/posts-list__random-page2'));
    await h.repository.list({
      topicDate: TODAY,
      sort: 'random',
      page: 2,
      randomSeed: 'a-B_9'.repeat(1),
    });
    expect(queryOf(h.transport.requests[0]).randomSeed).toBe('a-B_9');
    await h.repository.list({
      topicDate: TODAY,
      sort: 'random',
      page: 2,
      randomSeed: 'x'.repeat(64),
    });
    h.transport.requests.length = 0;
    for (const bad of ['x'.repeat(65), 'seed!', '']) {
      await expect(
        Promise.resolve().then(() =>
          h.repository.list({ topicDate: TODAY, sort: 'random', page: 2, randomSeed: bad }),
        ),
      ).rejects.toThrow();
    }
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-DISP-003 page 0, pageSize 101, 대문자 sort는 만들 수 없다(요청 없음)', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('display/posts-list__recent-page1'));
    const attempts = [
      () => h.repository.list({ topicDate: TODAY, sort: 'recent', page: 0 }),
      () => h.repository.list({ topicDate: TODAY, sort: 'recent', pageSize: 101 }),
      () => h.repository.list({ topicDate: TODAY, sort: 'RECENT' as never }),
    ];
    for (const attempt of attempts) {
      await expect(Promise.resolve().then(attempt)).rejects.toThrow();
    }
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-DISP-004 로그인 상태면 Authorization을 붙이고 게스트면 붙이지 않는다', async () => {
    const member = setup();
    await member.signIn();
    member.transport.script(fixtureResponse('display/posts-list__recent-page1'));
    await member.repository.list({ topicDate: TODAY, sort: 'recent' });
    expect(authorizationOf(member.transport.requests[0])).toBe('Bearer access-1');

    const guest = setup();
    guest.transport.script(fixtureResponse('display/posts-list__guest-page1'));
    const page = await guest.repository.list({ topicDate: TODAY, sort: 'recent' });
    expect(authorizationOf(guest.transport.requests[0])).toBeUndefined();
    expect(page.posts.every((p) => !p.isLiked && !p.isMine)).toBe(true);
  });

  it('TC-DISP-015 랜덤 첫 페이지 응답의 randomSeed를 해석하고 첫 요청에는 시드를 보내지 않는다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('display/posts-list__random-page1-seed'));
    const page = await h.repository.list({ topicDate: TODAY, sort: 'random' });
    expect(queryOf(h.transport.requests[0])).not.toHaveProperty('randomSeed');
    expect(page.randomSeed).toBe('seed_abc123');
  });

  it('TC-DISP-016 2페이지 요청은 page=2&randomSeed=<저장값>을 보낸다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('display/posts-list__random-page2'));
    const page = await h.repository.list({
      topicDate: TODAY,
      sort: 'random',
      page: 2,
      randomSeed: 'seed_abc123',
    });
    expect(queryOf(h.transport.requests[0])).toMatchObject({
      page: '2',
      randomSeed: 'seed_abc123',
    });
    expect(page).toMatchObject({ currentPage: 2, hasNext: false, randomSeed: 'seed_abc123' });
  });

  it('TC-DISP-019 randomSeed가 null이면 null로 해석한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('display/posts-list__random-no-seed'));
    const page = await h.repository.list({ topicDate: TODAY, sort: 'random' });
    expect(page.randomSeed ?? null).toBeNull();
    expect(page.hasNext).toBe(true);
  });

  it('TC-DISP-023 범위 밖 page=99의 빈 posts·hasNext=false는 오류가 아니다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('display/posts-list__page99-empty'));
    const page = await h.repository.list({ topicDate: TODAY, sort: 'recent', page: 99 });
    expect(page).toMatchObject({ currentPage: 99, hasNext: false, posts: [] });
  });

  it('TC-DISP-002 필수 필드가 없거나 likeCount가 음수인 항목이 있으면 응답 전체가 InvalidResponseError', async () => {
    const h = setup();
    const body = fixtureBody<{ posts: Record<string, unknown>[] }>(
      'display/posts-list__recent-page1',
    );
    body.posts[3].likeCount = -1;
    h.transport.script({
      status: 200,
      headers: { 'content-type': 'application/json' },
      bodyText: JSON.stringify(body),
    });
    await expect(h.repository.list({ topicDate: TODAY, sort: 'recent' })).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it.each([
    ['TC-DISP-007', 'display/posts-list__404-topic-not-found', 404],
    ['TC-DISP-008', 'display/posts-list__400-future-date', 400],
    ['TC-DISP-008', 'display/posts-list__400-bad-query', 400],
  ])('%s %s는 HttpError(%i)이고 재시도하지 않는다', async (_tc, fixture, status) => {
    const h = setup();
    h.transport.script(fixtureResponse(fixture));
    await expect(h.repository.list({ topicDate: TODAY, sort: 'recent' })).rejects.toMatchObject({
      name: 'HttpError',
      status,
    });
    expect(h.transport.requests).toHaveLength(1);
  });

  it('TC-DISP-051 공개 API라도 401이면 refresh 뒤 1회 재전송한다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(
      unauthorized(),
      refreshOk(),
      fixtureResponse('display/posts-list__recent-page1'),
    );
    const page = await h.repository.list({ topicDate: TODAY, sort: 'recent' });
    expect(page.posts).toHaveLength(20);
    expect(h.transport.requests.map((r) => pathOf(r))).toEqual([
      '/posts',
      '/auth/refresh',
      '/posts',
    ]);
    expect(authorizationOf(h.transport.requests[2])).toBe('Bearer access-2');
  });

  it('TC-DISP-052 Retry-After가 있는 503은 지정한 시간(1초)만 기다린 뒤 재시도한다', async () => {
    const h = setup();
    h.transport.script(
      fixtureResponse('display/posts-list__503-retry-after'),
      fixtureResponse('display/posts-list__recent-page1'),
    );
    await h.repository.list({ topicDate: TODAY, sort: 'recent' });
    expect(h.sleeper.calls).toEqual([1000]);
  });

  it('TC-DISP-052 Retry-After 없는 5xx는 0.5초, 1초 백오프로 최대 2회 재시도한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('display/posts-list__500-server-error'));
    await expect(h.repository.list({ topicDate: TODAY, sort: 'recent' })).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(h.transport.requests).toHaveLength(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });
});
