import { HttpError, InvalidResponseError } from '../../core/http/ApiError';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { json } from '../../core/http/__testing__/FakeTransport';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { KstDate } from '../../core/time/KstDate';
import { authorizationOf, pathOf } from '../__testing__/requestAsserts';
import { PostRepository } from './PostRepository';

const MINE = '22222222-2222-4222-8222-222222222201';
const OTHER = '22222222-2222-4222-8222-222222222202';

async function setup() {
  const net = createNetHarness();
  await net.signIn();
  return { ...net, repository: new PostRepository({ api: net.api }) };
}

describe('PostRepository.getDetail', () => {
  it('TC-FEED-002 GET /posts/{id}를 Authorization과 함께 부르고 필드를 매핑한다(후행 슬래시 base에서도 경로 유지)', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feed/posts-detail__other'));
    const detail = await h.repository.getDetail(OTHER);
    const [request] = h.transport.requests;
    expect(request.method).toBe('GET');
    expect(pathOf(request)).toBe(`/posts/${OTHER}`);
    expect(request.url).not.toContain('//posts');
    expect(authorizationOf(request)).toBe('Bearer access-1');
    expect(detail).toEqual({
      id: OTHER,
      authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      topic: {
        id: '11111111-1111-4111-8111-111111111127',
        title: '가을 하늘',
        topicDate: KstDate.of(2026, 10, 27),
      },
      originalImageUrl: `https://cdn.example.test/posts/${OTHER}/original.webp`,
      thumbnailImageUrl: `https://cdn.example.test/posts/${OTHER}/thumbnail.webp`,
      signatureOriginalImageUrl:
        'https://cdn.example.test/signatures/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/original.png',
      title: '은행잎',
      likeCount: 38,
      isLiked: false,
    });
  });

  it('TC-FEED-003 thumbnailImageUrl이 null이어도 오류가 아니다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feed/posts-detail__null-thumbnail'));
    await expect(
      h.repository.getDetail('22222222-2222-4222-8222-222222222205'),
    ).resolves.toMatchObject({ thumbnailImageUrl: null });
  });

  it('TC-FEED-013 제목이 null이면 null로 해석한다(무제 표시는 화면)', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feed/posts-detail__no-title'));
    await expect(
      h.repository.getDetail('22222222-2222-4222-8222-222222222204'),
    ).resolves.toMatchObject({ title: null });
  });

  it('TC-FEED-009 계약 위반(topic 누락, likeCount 문자열)은 InvalidResponseError', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feed/posts-detail__invalid-schema'));
    await expect(h.repository.getDetail(OTHER)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([-1, '3', 1.5])('TC-FEED-009 likeCount=%p는 InvalidResponseError', async (likeCount) => {
    const h = await setup();
    h.transport.script(
      json(200, { ...fixtureBody<Record<string, unknown>>('feed/posts-detail__other'), likeCount }),
    );
    await expect(h.repository.getDetail(OTHER)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([
    ['feed/posts-detail__404-not-found', 404, 1],
    ['feed/posts-detail__400-invalid-id', 400, 1],
    ['feed/posts-detail__500-server-error', 500, 3],
  ])(
    'TC-FEED-007 TC-FEED-008 %s는 HttpError(%i)이고 요청은 %i번이다',
    async (name, status, calls) => {
      const h = await setup();
      h.transport.script(fixtureResponse(name));
      await expect(h.repository.getDetail(OTHER)).rejects.toMatchObject({
        name: 'HttpError',
        status,
      });
      expect(h.transport.requests).toHaveLength(calls);
    },
  );
});

describe('PostRepository.updateTitle', () => {
  it('TC-FEED-023 PUT /posts/{id}에 JSON 본문 {"title":…}과 Authorization을 보내고 {postId,title}을 해석한다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feed/posts-title-update__200'));
    const result = await h.repository.updateTitle(MINE, '가나다라마바사아자차');
    const [request] = h.transport.requests;
    expect(request.method).toBe('PUT');
    expect(pathOf(request)).toBe(`/posts/${MINE}`);
    expect(authorizationOf(request)).toBe('Bearer access-1');
    expect(request.headers['Content-Type']).toMatch(/application\/json/);
    expect(JSON.parse(String(request.body))).toEqual({ title: '가나다라마바사아자차' });
    expect(result).toEqual({ postId: MINE, title: '가나다라마바사아자차' });
  });

  it('TC-FEED-022 제목 없음은 title 키를 null로 보낸다(키 누락 금지)', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feed/posts-title-update__200-null-title'));
    const result = await h.repository.updateTitle(MINE, null);
    expect(String(h.transport.requests[0].body)).toBe('{"title":null}');
    expect(result).toEqual({ postId: MINE, title: null });
  });

  it('TC-FEED-033 응답 유실 뒤 같은 제목 재저장도 200 멱등 응답을 성공으로 처리한다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feed/posts-title-update__200'));
    await h.repository.updateTitle(MINE, '가나다라마바사아자차');
    await expect(h.repository.updateTitle(MINE, '가나다라마바사아자차')).resolves.toMatchObject({
      title: '가나다라마바사아자차',
    });
  });

  it('TC-FEED-032 5xx는 0.5초, 1초 간격으로 2회 재시도한 뒤 HttpError', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feed/posts-title-update__500-server-error'));
    await expect(h.repository.updateTitle(MINE, 'a')).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requests).toHaveLength(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });

  it.each([
    ['feed/posts-title-update__400-not-editable', 400, 'BUSINESS_ERROR'],
    ['feed/posts-title-update__403-banned', 403, 'FORBIDDEN'],
    ['feed/posts-title-update__404-not-found', 404, 'BUSINESS_ERROR'],
  ])(
    'TC-FEED-027 TC-FEED-029 TC-FEED-030 %s는 HttpError(%i %s)이고 재시도하지 않는다',
    async (name, status, errorCode) => {
      const h = await setup();
      h.transport.script(fixtureResponse(name));
      await expect(h.repository.updateTitle(MINE, 'a')).rejects.toMatchObject({
        status,
        errorCode,
      });
      expect(h.transport.requests).toHaveLength(1);
    },
  );
});

describe('PostRepository.delete', () => {
  it('TC-FEED-036 DELETE /posts/{id}를 본문 없이 Authorization과 보내고 204면 resolve한다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feed/posts-delete__204'));
    await expect(h.repository.delete(MINE)).resolves.toBeUndefined();
    const [request] = h.transport.requests;
    expect(request.method).toBe('DELETE');
    expect(pathOf(request)).toBe(`/posts/${MINE}`);
    expect(request.body).toBeUndefined();
    expect(authorizationOf(request)).toBe('Bearer access-1');
  });

  it('TC-FEED-037 이미 삭제된 게시물에 반복 DELETE해도 204는 성공이다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('feed/posts-delete__204'));
    await h.repository.delete(MINE);
    await expect(h.repository.delete(MINE)).resolves.toBeUndefined();
  });

  it.each([
    ['feed/posts-delete__400-validating', 400],
    ['feed/posts-delete__400-rejected', 400],
    ['feed/posts-delete__403-not-owner', 403],
    ['feed/posts-delete__404-not-found', 404],
  ])('TC-FEED-039 TC-FEED-040 TC-FEED-041 %s는 HttpError(%i)', async (name, status) => {
    const h = await setup();
    h.transport.script(fixtureResponse(name));
    await expect(h.repository.delete(MINE)).rejects.toMatchObject({ name: 'HttpError', status });
  });
});
