import { ApiError, InvalidResponseError, NetworkError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { networkFailure } from '../../test/fakeFetch';
import { json } from '../../test/fixtureRouter';
import { loadFixture, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import { FeedRepository } from './FeedRepository';

const ID = '22222222-2222-4222-8222-222222222201';

function setup() {
  const env = makeApiEnv(memberSession());
  const repo = new FeedRepository({ api: env.client() });
  const respond = (fixture: string) => () => loadFixture(`${fixture}.json`).toResponse();
  const settled = async <T>(promise: Promise<T>) => {
    const result = track(promise);
    await env.clock.advance(5_000);
    return result;
  };
  return { ...env, repo, respond, settled };
}

describe('FeedRepository.fetchPost (GET /posts/{id})', () => {
  it('TC-FEED-002 Authorization을 붙여 부르고 응답 필드를 모두 매핑한다', async () => {
    const h = setup();
    h.ff.route(`GET /posts/${ID}`, h.respond('feed/posts-detail__mine-today'));
    const post = await h.repo.fetchPost(ID);
    expect(h.ff.calls[0]).toMatchObject({ method: 'GET', path: `/posts/${ID}` });
    expect(h.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(post).toMatchObject({
      id: ID,
      authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      topic: { id: '11111111-1111-4111-8111-111111111127', topicDate: '2026-10-27' },
      originalImageUrl: `https://cdn.example.test/posts/${ID}/original.webp`,
      thumbnailImageUrl: `https://cdn.example.test/posts/${ID}/thumbnail.webp`,
      signatureOriginalImageUrl: 'https://cdn.example.test/signatures/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original.png',
      likeCount: 10,
      isLiked: false,
    });
    expect(post.title).toBe((loadFixture('feed/posts-detail__mine-today.json').json as { title: string }).title);
  });

  it('TC-FEED-003 thumbnailImageUrl이 null이어도 오류가 아니다', async () => {
    const h = setup();
    const id = '22222222-2222-4222-8222-222222222205';
    h.ff.route(`GET /posts/${id}`, h.respond('feed/posts-detail__null-thumbnail'));
    await expect(h.repo.fetchPost(id)).resolves.toMatchObject({ thumbnailImageUrl: null });
  });

  it('TC-FEED-004 제목이 null이면 null로 해석한다', async () => {
    const h = setup();
    const id = '22222222-2222-4222-8222-222222222204';
    h.ff.route(`GET /posts/${id}`, h.respond('feed/posts-detail__no-title'));
    await expect(h.repo.fetchPost(id)).resolves.toMatchObject({ title: null });
  });

  it('TC-FEED-009 응답 계약 위반(likeCount 문자열, topic 누락)은 InvalidResponseError다', async () => {
    const h = setup();
    h.ff.route(`GET /posts/${ID}`, h.respond('feed/posts-detail__invalid-schema'));
    await expect(h.repo.fetchPost(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-FEED-009 likeCount가 음수여도 InvalidResponseError다', async () => {
    const h = setup();
    const body = { ...(loadFixture('feed/posts-detail__mine-today.json').json as object), likeCount: -1 };
    h.ff.route(`GET /posts/${ID}`, () => json(200, body));
    await expect(h.repo.fetchPost(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([
    ['feed/posts-detail__404-not-found', 404],
    ['feed/posts-detail__400-invalid-id', 400],
  ])('TC-FEED-007 TC-FEED-008 %s는 ApiError(%i)이고 재시도하지 않는다', async (fixture, status) => {
    const h = setup();
    h.ff.route(`GET /posts/${ID}`, h.respond(fixture));
    await expect(h.repo.fetchPost(ID)).rejects.toMatchObject({ status, errorCode: 'BUSINESS_ERROR' });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-FEED-008 500은 재시도(0.5초·1초) 뒤 ApiError, 연결 실패는 NetworkError다', async () => {
    const h = setup();
    h.ff.route(`GET /posts/${ID}`, h.respond('feed/posts-detail__500-server-error'));
    const failed = await h.settled(h.repo.fetchPost(ID));
    expect(failed.error).toBeInstanceOf(ApiError);
    expect(h.ff.calls).toHaveLength(3);
    const offline = setup();
    offline.ff.route(`GET /posts/${ID}`, networkFailure);
    expect((await offline.settled(offline.repo.fetchPost(ID))).error).toBeInstanceOf(NetworkError);
  });

  it('TC-FEED-006 D-17 401이면 refresh 1회 뒤 재전송한다', async () => {
    const h = setup();
    h.ff.route(`GET /posts/${ID}`, h.respond('feed/posts-detail__401-unauthorized'), h.respond('feed/posts-detail__mine-today'));
    h.ff.route('POST /auth/refresh', h.respond('auth/refresh__success'));
    await expect(h.repo.fetchPost(ID)).resolves.toMatchObject({ id: ID });
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(h.ff.callsTo(`GET /posts/${ID}`)).toHaveLength(2);
  });
});

describe('FeedRepository.updateTitle (PUT /posts/{id})', () => {
  const route = `PUT /posts/${ID}`;

  it('TC-FEED-023 PUT에 {"title": 문자열} JSON 본문과 Authorization을 보내고 응답 title을 돌려준다', async () => {
    const h = setup();
    h.ff.route(route, h.respond('feed/posts-title-update__200'));
    await expect(h.repo.updateTitle(ID, '가나다라마바사아자차')).resolves.toEqual({ title: '가나다라마바사아자차' });
    const [call] = h.ff.calls;
    expect(call).toMatchObject({ method: 'PUT', path: `/posts/${ID}` });
    expect(JSON.parse(call!.body as string)).toEqual({ title: '가나다라마바사아자차' });
    expect(call!.headers['content-type']).toMatch(/application\/json/);
    expect(call!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('TC-FEED-022 title이 null이면 본문에 title 키를 null로 포함한다(키 누락 금지)', async () => {
    const h = setup();
    h.ff.route(route, h.respond('feed/posts-title-update__200-null-title'));
    await expect(h.repo.updateTitle(ID, null)).resolves.toEqual({ title: null });
    expect(h.ff.calls[0]!.body).toBe('{"title":null}');
  });

  it.each([
    ['feed/posts-title-update__400-not-editable', 400],
    ['feed/posts-title-update__400-title-too-long', 400],
    ['feed/posts-title-update__403-banned', 403],
    ['feed/posts-title-update__404-not-found', 404],
  ])('TC-FEED-027 TC-FEED-029 TC-FEED-030 %s는 ApiError(%i)이고 재시도하지 않는다', async (fixture, status) => {
    const h = setup();
    h.ff.route(route, h.respond(fixture));
    await expect(h.repo.updateTitle(ID, '제목')).rejects.toMatchObject({ status });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-FEED-032 D-21 PUT 500은 멱등이라 0.5초·1초 뒤 최대 2회 재시도하고 모두 실패하면 ApiError(500)다', async () => {
    const h = setup();
    h.ff.route(route, h.respond('feed/posts-title-update__500-server-error'));
    const result = await h.settled(h.repo.updateTitle(ID, '제목'));
    expect(result.error).toMatchObject({ status: 500 });
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-FEED-032 연결 실패는 NetworkError다', async () => {
    const h = setup();
    h.ff.route(route, networkFailure);
    expect((await h.settled(h.repo.updateTitle(ID, '제목'))).error).toBeInstanceOf(NetworkError);
  });

  it('TC-FEED-031 D-17 401이면 refresh 1회 뒤 재전송한다', async () => {
    const h = setup();
    h.ff.route(route, h.respond('feed/posts-title-update__401-unauthorized'), h.respond('feed/posts-title-update__200'));
    h.ff.route('POST /auth/refresh', h.respond('auth/refresh__success'));
    await expect(h.repo.updateTitle(ID, '제목')).resolves.toMatchObject({ title: '가나다라마바사아자차' });
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
  });

  it('TC-FEED-033 응답 유실 뒤 같은 제목으로 다시 저장해도 200 멱등 응답을 성공으로 처리한다', async () => {
    const h = setup();
    h.ff.route(route, h.respond('feed/posts-title-update__200'));
    await h.repo.updateTitle(ID, '가나다라마바사아자차');
    await expect(h.repo.updateTitle(ID, '가나다라마바사아자차')).resolves.toEqual({ title: '가나다라마바사아자차' });
  });

  it('응답 postId가 요청과 다르면 InvalidResponseError다', async () => {
    const h = setup();
    h.ff.route(route, () => json(200, { postId: '22222222-2222-4222-8222-222222222299', title: '제목' }));
    await expect(h.repo.updateTitle(ID, '제목')).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

describe('FeedRepository.deletePost (DELETE /posts/{id})', () => {
  const route = `DELETE /posts/${ID}`;

  it('TC-FEED-036 DELETE를 본문 없이 Authorization과 함께 보내고 204를 성공으로 처리한다', async () => {
    const h = setup();
    h.ff.route(route, h.respond('feed/posts-delete__204'));
    await expect(h.repo.deletePost(ID)).resolves.toBeUndefined();
    expect(h.ff.calls[0]).toMatchObject({ method: 'DELETE', path: `/posts/${ID}`, body: null });
    expect(h.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('TC-FEED-037 이미 삭제한 게시물의 반복 DELETE가 204여도 성공이다', async () => {
    const h = setup();
    h.ff.route(route, h.respond('feed/posts-delete__204'));
    await h.repo.deletePost(ID);
    await expect(h.repo.deletePost(ID)).resolves.toBeUndefined();
  });

  it.each([
    ['feed/posts-delete__400-validating', 400],
    ['feed/posts-delete__400-rejected', 400],
    ['feed/posts-delete__403-not-owner', 403],
    ['feed/posts-delete__404-not-found', 404],
  ])('TC-FEED-039 TC-FEED-040 TC-FEED-041 %s는 ApiError(%i)이고 재시도하지 않는다', async (fixture, status) => {
    const h = setup();
    h.ff.route(route, h.respond(fixture));
    await expect(h.repo.deletePost(ID)).rejects.toMatchObject({ status });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-FEED-042 500은 재시도 뒤 ApiError, 연결 실패는 NetworkError다', async () => {
    const h = setup();
    h.ff.route(route, h.respond('feed/posts-delete__500-server-error'));
    expect((await h.settled(h.repo.deletePost(ID))).error).toMatchObject({ status: 500 });
    const offline = setup();
    offline.ff.route(route, networkFailure);
    expect((await offline.settled(offline.repo.deletePost(ID))).error).toBeInstanceOf(NetworkError);
  });

  it('TC-FEED-042 D-17 401이면 refresh 1회 뒤 재전송한다', async () => {
    const h = setup();
    h.ff.route(route, h.respond('feed/posts-delete__401-unauthorized'), h.respond('feed/posts-delete__204'));
    h.ff.route('POST /auth/refresh', h.respond('auth/refresh__success'));
    await expect(h.repo.deletePost(ID)).resolves.toBeUndefined();
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
  });
});
