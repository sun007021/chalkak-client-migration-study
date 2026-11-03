import { ApiError, InvalidResponseError, NetworkError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { networkFailure } from '../../test/fakeFetch';
import { loadFixture, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import { LikeRepository } from './LikeRepository';

const ID = '22222222-2222-4222-8222-222222222201';
const PATH = `PUT /posts/${ID}/likes`;

function setup() {
  const env = makeApiEnv(memberSession());
  const repo = new LikeRepository({ api: env.client() });
  const respond = (fixture: string) => () => loadFixture(`${fixture}.json`).toResponse();
  /** 재시도 백오프(0.5초·1초)를 가짜 시계로 소화하고 결과를 돌려준다. */
  const settled = async <T>(promise: Promise<T>) => {
    const result = track(promise);
    await env.clock.advance(5_000);
    return result;
  };
  return { ...env, repo, respond, settled };
}

describe('LikeRepository.like (PUT /posts/{id}/likes)', () => {
  it('TC-LIKE-001 REQ-LIKE-002 본문 없이 Authorization을 붙여 PUT하고 응답을 그대로 해석한다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__liked'));
    await expect(h.repo.like(ID)).resolves.toEqual({ postId: ID, likeCount: 11, isLiked: true });
    const [call] = h.ff.calls;
    expect(call).toMatchObject({ method: 'PUT', path: `/posts/${ID}/likes`, body: null });
    expect(call!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(call!.headers['content-type']).toBeUndefined();
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-LIKE-033 L1 이미 좋아요한 글의 멱등 응답(개수 변화 없음)도 정상 성공이다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__already-liked'));
    await expect(h.repo.like(ID)).resolves.toMatchObject({ isLiked: true, likeCount: 11 });
  });

  it('TC-LIKE-008 응답의 likeCount는 낙관 값과 달라도 그대로 돌려준다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__liked-count-differs'));
    await expect(h.repo.like(ID)).resolves.toMatchObject({ likeCount: 13, isLiked: true });
  });

  it('TC-LIKE-002 REQ-LIKE-003 응답 postId가 요청과 다르면 InvalidResponseError(롤백 대상)다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__postid-mismatch'));
    await expect(h.repo.like(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-LIKE-002 PUT 응답이 isLiked=false인 모순은 InvalidResponseError다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__inconsistent-state'));
    await expect(h.repo.like(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-LIKE-011 REQ-LIKE-007 403 FORBIDDEN은 ApiError(403)이고 재시도하지 않는다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__403-banned'));
    await expect(h.repo.like(ID)).rejects.toMatchObject({ status: 403, errorCode: 'FORBIDDEN' });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-LIKE-010 404 BUSINESS_ERROR는 ApiError(404)이고 재시도하지 않는다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__404-not-found'));
    const error = await h.repo.like(ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, errorCode: 'BUSINESS_ERROR' });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-LIKE-013 D-17 401 UNAUTHORIZED면 refresh 1회 뒤 같은 요청을 1회 재전송해 성공한다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__401-unauthorized'), h.respond('like/posts-likes-put__liked'));
    h.ff.route('POST /auth/refresh', h.respond('auth/refresh__success'));
    await expect(h.repo.like(ID)).resolves.toMatchObject({ isLiked: true });
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(h.ff.callsTo(PATH)).toHaveLength(2);
  });

  it('TC-LIKE-026 REQ-LIKE-012 500 두 번 뒤 200이면 0.5초·1초 백오프로 재시도해 성공한다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__500-server-error'), h.respond('like/posts-likes-put__500-server-error'), h.respond('like/posts-likes-put__liked'));
    const result = track(h.repo.like(ID));
    await h.clock.advance(499);
    expect(h.ff.calls).toHaveLength(1);
    await h.clock.advance(1);
    expect(h.ff.calls).toHaveLength(2);
    await h.clock.advance(999);
    expect(h.ff.calls).toHaveLength(2);
    await h.clock.advance(1);
    expect(h.ff.calls).toHaveLength(3);
    expect(result.state).toBe('fulfilled');
    expect(result.value).toMatchObject({ isLiked: true });
  });

  it('TC-LIKE-026 세 번 모두 500이면 ApiError(500)로 실패한다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__500-server-error'));
    const result = await h.settled(h.repo.like(ID));
    expect(result.state).toBe('rejected');
    expect(result.error).toMatchObject({ status: 500 });
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-LIKE-028 연결 실패는 재시도 소진 뒤 NetworkError다', async () => {
    const h = setup();
    h.ff.route(PATH, networkFailure);
    const result = await h.settled(h.repo.like(ID));
    expect(result.error).toBeInstanceOf(NetworkError);
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-LIKE-027 D-21 429 + Retry-After: 1이면 1초 기다린 뒤 재시도한다', async () => {
    const h = setup();
    h.ff.route(PATH, h.respond('like/posts-likes-put__429-retry-after'), h.respond('like/posts-likes-put__liked'));
    const result = track(h.repo.like(ID));
    await h.clock.advance(999);
    expect(h.ff.calls).toHaveLength(1);
    await h.clock.advance(1);
    expect(h.ff.calls).toHaveLength(2);
    expect(result.state).toBe('fulfilled');
  });
});

describe('LikeRepository.unlike (DELETE /posts/{id}/likes)', () => {
  const DELETE = `DELETE /posts/${ID}/likes`;

  it('TC-LIKE-001 TC-LIKE-007 같은 경로를 DELETE로 부르고 본문은 없다', async () => {
    const h = setup();
    h.ff.route(DELETE, h.respond('like/posts-likes-delete__unliked'));
    await expect(h.repo.unlike(ID)).resolves.toEqual({ postId: ID, likeCount: 10, isLiked: false });
    expect(h.ff.calls[0]).toMatchObject({ method: 'DELETE', path: `/posts/${ID}/likes`, body: null });
    expect(h.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('TC-LIKE-033 L2 좋아요 안 한 글의 DELETE도 isLiked=false로 정상이다', async () => {
    const h = setup();
    h.ff.route(DELETE, h.respond('like/posts-likes-delete__not-liked'));
    await expect(h.repo.unlike(ID)).resolves.toMatchObject({ isLiked: false, likeCount: 10 });
  });

  it('TC-LIKE-002 응답 postId가 다르거나 DELETE 응답이 isLiked=true인 모순은 InvalidResponseError다', async () => {
    const mismatch = setup();
    mismatch.ff.route(DELETE, () => mismatch.respond('like/posts-likes-put__postid-mismatch')());
    await expect(mismatch.repo.unlike(ID)).rejects.toBeInstanceOf(InvalidResponseError);
    const inconsistent = setup();
    inconsistent.ff.route(DELETE, () => inconsistent.respond('like/posts-likes-put__liked')());
    await expect(inconsistent.repo.unlike(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-LIKE-012 L3 정지 회원의 취소는 200이다(막지 않는다)', async () => {
    const h = setup();
    h.ff.route(DELETE, h.respond('like/posts-likes-delete__unliked'));
    await expect(h.repo.unlike(ID)).resolves.toMatchObject({ isLiked: false });
  });

  it('TC-LIKE-010 404는 ApiError(404)다', async () => {
    const h = setup();
    h.ff.route(DELETE, h.respond('like/posts-likes-put__404-not-found'));
    await expect(h.repo.unlike(ID)).rejects.toMatchObject({ status: 404 });
  });
});
