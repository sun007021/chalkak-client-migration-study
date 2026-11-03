import { ApiError, InvalidResponseError, NetworkError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { networkFailure } from '../../test/fakeFetch';
import { memberSession } from '../../test/fixtures';
import { FixtureRouter, json } from '../../test/fixtureRouter';
import { track } from '../../test/track';
import { CREATE, POLICY, POST_ID, TOPIC_DATE, TOPIC_ID, TOPICS, UPLOAD_ID, hangingServer } from '../../test/uploadHarness';
import { UploadRepository } from './UploadRepository';

function setup() {
  const env = makeApiEnv(memberSession());
  const router = new FixtureRouter(env.ff);
  const repo = new UploadRepository({ api: env.client() });
  /** 재시도 백오프(0.5초, 1초)와 응답 타임아웃을 가짜 시계로 소화한다. */
  const settled = async <T>(promise: Promise<T>) => {
    const result = track(promise);
    for (let i = 0; i < 60 && result.state === 'pending'; i += 1) await env.clock.advance(500);
    return result;
  };
  return { ...env, router, repo, settled };
}

describe('UploadRepository.fetchTopic (GET /topics)', () => {
  it('TC-UPL-011 ?date=<topicDate>로 요청해 topicId와 제목을 얻는다', async () => {
    const h = setup();
    h.router.set(TOPICS, 'home/topics__open-2026-10-27');
    const topic = await h.repo.fetchTopic(TOPIC_DATE);
    expect(h.ff.calls).toHaveLength(1);
    expect(h.ff.calls[0]!.query.get('date')).toBe(TOPIC_DATE);
    expect(topic).toMatchObject({ id: TOPIC_ID, title: '가을 하늘', topicDate: TOPIC_DATE });
  });

  it('TC-UPL-011 응답 topicDate가 요청과 다르면 InvalidResponseError다', async () => {
    const h = setup();
    h.router.set(TOPICS, 'upload/topics__mismatch-date');
    await expect(h.repo.fetchTopic(TOPIC_DATE)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-UPL-011 404는 null이 아니라 ApiError로 그대로 던진다', async () => {
    const h = setup();
    h.router.set(TOPICS, () => json(404, { errorCode: 'BUSINESS_ERROR', message: '주제를 찾을 수 없습니다.' }));
    await expect(h.repo.fetchTopic(TOPIC_DATE)).rejects.toMatchObject({ status: 404 });
  });

  it('TC-UPL-011 D-21 5xx는 GET 재시도(0.5초, 1초) 뒤에도 실패하면 ApiError(총 3회)', async () => {
    const h = setup();
    h.router.set(TOPICS, 'upload/topics__500-server-error');
    const result = await h.settled(h.repo.fetchTopic(TOPIC_DATE));
    expect(result.error).toBeInstanceOf(ApiError);
    expect(h.ff.calls).toHaveLength(3);
  });
});

describe('UploadRepository.issuePolicy (POST /posts/uploads)', () => {
  it('TC-UPL-023 본문 없이 Authorization으로 POST한다', async () => {
    const h = setup();
    h.router.set(POLICY, 'upload/posts-uploads__issued');
    await h.repo.issuePolicy();
    const call = h.ff.calls[0]!;
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/posts/uploads');
    expect(call.body).toBeFalsy();
    expect(call.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('TC-UPL-024 uploadId, uploadUrl, expiresInSeconds, contentType, maxBytes를 읽는다', async () => {
    const h = setup();
    h.router.set(POLICY, 'upload/posts-uploads__issued');
    await expect(h.repo.issuePolicy()).resolves.toEqual({
      uploadId: UPLOAD_ID,
      uploadUrl: `http://localhost:4010/__upload/${UPLOAD_ID}?X-Amz-Expires=300`,
      expiresInSeconds: 300,
      contentType: 'image/webp',
      maxBytes: 5_242_880,
    });
  });

  it('TC-UPL-024 maxBytes는 32비트를 넘는 값도 그대로 보존한다', async () => {
    const h = setup();
    h.router.set(POLICY, 'upload/posts-uploads__issued-large-max');
    const policy = await h.repo.issuePolicy();
    expect(policy.maxBytes).toBe(5_000_000_000);
    expect(policy.maxBytes).toBeGreaterThan(2 ** 31);
  });

  it('TC-UPL-026 필수 필드(uploadUrl)가 없으면 InvalidResponseError다', async () => {
    const h = setup();
    h.router.set(POLICY, 'upload/posts-uploads__missing-fields');
    await expect(h.repo.issuePolicy()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-UPL-026 maxBytes가 숫자가 아니면 InvalidResponseError다', async () => {
    const h = setup();
    h.router.set(POLICY, () =>
      json(200, { uploadId: UPLOAD_ID, uploadUrl: `http://localhost:4010/__upload/${UPLOAD_ID}?X-Amz-Expires=300`, expiresInSeconds: 300, contentType: 'image/webp', maxBytes: '5242880' }),
    );
    await expect(h.repo.issuePolicy()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-UPL-027 401은 refresh 뒤 1회 재전송한다', async () => {
    const h = setup();
    h.router.set(POLICY, [
      'upload/posts-uploads__401-unauthorized',
      'upload/posts-uploads__issued',
    ]);
    h.router.set('POST /auth/refresh', 'auth/refresh__success');
    const policy = await h.repo.issuePolicy();
    expect(policy.uploadId).toBe(UPLOAD_ID);
    expect(h.ff.callsTo(`POST /posts/uploads`)).toHaveLength(2);
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
  });

  it('TC-UPL-027 403은 재시도 없이 ApiError(403)다', async () => {
    const h = setup();
    h.router.set(POLICY, 'upload/posts-uploads__403-banned');
    const result = await h.settled(h.repo.issuePolicy());
    expect(result.error).toMatchObject({ status: 403 });
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
  });

  it('TC-UPL-027 D-21 500은 멱등 발급이라 0.5초, 1초 뒤 재시도해 총 3회 보낸다', async () => {
    const h = setup();
    h.router.set(POLICY, 'upload/posts-uploads__500-server-error');
    const result = track(h.repo.issuePolicy());
    await h.clock.advance(0);
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
    await h.clock.advance(499);
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
    await h.clock.advance(1);
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(2);
    await h.clock.advance(1_000);
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(3);
    expect(result.state).toBe('rejected');
    expect(result.error).toMatchObject({ status: 500 });
  });

  it('TC-UPL-027 D-21 연결 실패도 같은 백오프로 재시도한 뒤 NetworkError다', async () => {
    const h = setup();
    h.router.set(POLICY, networkFailure);
    const result = await h.settled(h.repo.issuePolicy());
    expect(result.error).toBeInstanceOf(NetworkError);
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(3);
  });

  it('TC-UPL-027 재시도 중 취소하면 AbortError로 끝나고 더 보내지 않는다', async () => {
    const h = setup();
    h.router.set(POLICY, 'upload/posts-uploads__500-server-error');
    const controller = new AbortController();
    const result = track(h.repo.issuePolicy(controller.signal));
    await h.clock.advance(0);
    controller.abort();
    await h.clock.advance(5_000);
    expect(result.state).toBe('rejected');
    expect((result.error as Error).name).toBe('AbortError');
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
  });
});

describe('UploadRepository.createPost (POST /posts)', () => {
  const input = { topicId: TOPIC_ID, photoUploadId: UPLOAD_ID, title: '하늘' };

  it('TC-UPL-059 JSON {topicId, photoUploadId, title}를 Authorization과 함께 보내고 201을 해석한다', async () => {
    const h = setup();
    h.router.set(CREATE, 'upload/posts-create__201-pending');
    const created = await h.repo.createPost(input);
    expect(created).toEqual({ postId: POST_ID, moderationStatus: 'PENDING' });
    const call = h.ff.calls[0]!;
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/posts');
    expect(call.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(call.headers['content-type']).toMatch(/application\/json/);
    expect(JSON.parse(call.body as string)).toEqual({ topicId: TOPIC_ID, photoUploadId: UPLOAD_ID, title: '하늘' });
  });

  it('TC-UPL-059 title이 null이면 null을 그대로 보낸다', async () => {
    const h = setup();
    h.router.set(CREATE, 'upload/posts-create__201-validating');
    const created = await h.repo.createPost({ ...input, title: null });
    expect(created.moderationStatus).toBe('VALIDATING');
    expect(JSON.parse(h.ff.calls[0]!.body as string)).toEqual({ topicId: TOPIC_ID, photoUploadId: UPLOAD_ID, title: null });
  });

  it('TC-UPL-061 알 수 없는 moderationStatus는 InvalidResponseError다', async () => {
    const h = setup();
    h.router.set(CREATE, 'upload/posts-create__201-unknown-status');
    await expect(h.repo.createPost(input)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-UPL-061 moderationStatus나 postId가 없어도 InvalidResponseError다', async () => {
    const noStatus = setup();
    noStatus.router.set(CREATE, () => json(201, { postId: POST_ID }));
    await expect(noStatus.repo.createPost(input)).rejects.toBeInstanceOf(InvalidResponseError);
    const noId = setup();
    noId.router.set(CREATE, () => json(201, { moderationStatus: 'PENDING' }));
    await expect(noId.repo.createPost(input)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-UPL-061 APPROVED 같은 생성 응답에 나올 수 없는 상태도 받아들이지 않는다', async () => {
    const h = setup();
    h.router.set(CREATE, () => json(201, { postId: POST_ID, moderationStatus: 'APPROVED' }));
    await expect(h.repo.createPost(input)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-UPL-068 D-21 500도 자동 재시도 없이 1회만 보낸다', async () => {
    const h = setup();
    h.router.set(CREATE, 'upload/posts-create__500-server-error');
    const result = await h.settled(h.repo.createPost(input));
    expect(result.error).toMatchObject({ status: 500 });
    expect(h.ff.callsTo('POST /posts')).toHaveLength(1);
  });

  it('TC-UPL-069 응답이 유실돼 타임아웃이 나도 재전송하지 않고 NetworkError(timeout)다', async () => {
    const h = setup();
    h.router.set(CREATE, hangingServer(h.clock));
    const result = await h.settled(h.repo.createPost(input));
    expect(result.error).toMatchObject({ name: 'NetworkError', kind: 'timeout' });
    expect(h.ff.callsTo('POST /posts')).toHaveLength(1);
  });

  it('TC-UPL-069 연결 실패도 재전송하지 않는다', async () => {
    const h = setup();
    h.router.set(CREATE, networkFailure);
    const result = await h.settled(h.repo.createPost(input));
    expect(result.error).toBeInstanceOf(NetworkError);
    expect(h.ff.callsTo('POST /posts')).toHaveLength(1);
  });

  it.each([
    ['upload/posts-create__400-already-posted', 400],
    ['upload/posts-create__400-upload-expired', 400],
    ['upload/posts-create__403-banned', 403],
    ['upload/posts-create__404-topic-not-found', 404],
  ])('TC-UPL-059 %s 는 ApiError(%i)로 그대로 던진다', async (fixture, status) => {
    const h = setup();
    h.router.set(CREATE, fixture);
    await expect(h.repo.createPost(input)).rejects.toMatchObject({ status });
  });
});
