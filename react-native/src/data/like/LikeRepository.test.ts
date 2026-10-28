import { InvalidResponseError } from '../../core/http/ApiError';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { authorizationOf, pathOf } from '../__testing__/requestAsserts';
import { LikeRepository } from './LikeRepository';

const ID = '22222222-2222-4222-8222-222222222201';

async function setup() {
  const net = createNetHarness();
  await net.signIn();
  return { ...net, repository: new LikeRepository({ api: net.api }) };
}

describe('LikeRepository', () => {
  it('TC-LIKE-001 등록은 본문 없이 PUT /posts/{id}/likes, 취소는 DELETE로 같은 경로를 쓰고 Authorization을 붙인다', async () => {
    const h = await setup();
    h.transport.script(
      fixtureResponse('like/posts-likes-put__liked'),
      fixtureResponse('like/posts-likes-delete__unliked'),
    );
    await h.repository.like(ID);
    await h.repository.unlike(ID);
    const [put, del] = h.transport.requests;
    expect([put.method, del.method]).toEqual(['PUT', 'DELETE']);
    expect([pathOf(put), pathOf(del)]).toEqual([`/posts/${ID}/likes`, `/posts/${ID}/likes`]);
    expect(put.body).toBeUndefined();
    expect(del.body).toBeUndefined();
    expect(authorizationOf(put)).toBe('Bearer access-1');
  });

  it('TC-LIKE-002 응답 {postId, likeCount, isLiked}를 그대로 돌려준다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('like/posts-likes-put__liked'));
    await expect(h.repository.like(ID)).resolves.toEqual({
      postId: ID,
      likeCount: 11,
      isLiked: true,
    });
  });

  it('TC-LIKE-002 postId가 요청과 다르면 계약 위반(InvalidResponseError)', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('like/posts-likes-put__postid-mismatch'));
    await expect(h.repository.like(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-LIKE-002 PUT 응답이 isLiked=false인 모순은 계약 위반', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('like/posts-likes-put__inconsistent-state'));
    await expect(h.repository.like(ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-LIKE-033 이미 좋아요한 글의 PUT은 개수가 늘지 않은 멱등 응답을 성공으로 처리한다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('like/posts-likes-put__already-liked'));
    await expect(h.repository.like(ID)).resolves.toMatchObject({ likeCount: 11, isLiked: true });
  });

  it('TC-LIKE-033 TC-LIKE-012 좋아요 없는 글의 DELETE도 isLiked=false로 정상이다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('like/posts-likes-delete__not-liked'));
    await expect(h.repository.unlike(ID)).resolves.toMatchObject({ isLiked: false });
  });

  it('TC-LIKE-026 500 두 번 뒤 200이면 0.5초, 1초 대기 뒤 성공한다', async () => {
    const h = await setup();
    h.transport.script(
      fixtureResponse('like/posts-likes-put__500-server-error'),
      fixtureResponse('like/posts-likes-put__500-server-error'),
      fixtureResponse('like/posts-likes-put__liked'),
    );
    await expect(h.repository.like(ID)).resolves.toMatchObject({ isLiked: true });
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });

  it('TC-LIKE-026 세 번 모두 실패하면 HttpError', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('like/posts-likes-put__500-server-error'));
    await expect(h.repository.like(ID)).rejects.toMatchObject({ name: 'HttpError', status: 500 });
    expect(h.transport.requests).toHaveLength(3);
  });

  it('TC-LIKE-027 429 Retry-After: 1은 1초 기다린 뒤 재시도한다', async () => {
    const h = await setup();
    h.transport.script(
      fixtureResponse('like/posts-likes-put__429-retry-after'),
      fixtureResponse('like/posts-likes-put__liked'),
    );
    await h.repository.like(ID);
    expect(h.sleeper.calls).toEqual([1000]);
  });

  it.each([
    ['TC-LIKE-010', 'like/posts-likes-put__404-not-found', 404],
    ['TC-LIKE-011', 'like/posts-likes-put__403-banned', 403],
  ])('%s %s는 HttpError(%i)이고 재시도하지 않는다', async (_tc, name, status) => {
    const h = await setup();
    h.transport.script(fixtureResponse(name));
    await expect(h.repository.like(ID)).rejects.toMatchObject({ status });
    expect(h.transport.requests).toHaveLength(1);
  });
});
