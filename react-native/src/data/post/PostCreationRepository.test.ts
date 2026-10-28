import {
  AuthenticationRequiredError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import {
  createNetHarness,
  reauth,
  refreshOk,
  unauthorized,
} from '../../core/http/__testing__/createNetHarness';
import { json, networkFailure, timeoutFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { authorizationOf, pathOf } from '../__testing__/requestAsserts';
import { PostCreationRepository, type UploadPolicy } from './PostCreationRepository';

const UPLOAD_ID = '55555555-5555-4555-8555-555555555501';
const TOPIC_ID = '11111111-1111-4111-8111-111111111127';
const POST_ID = '22222222-2222-4222-8222-222222222201';

const POLICY: UploadPolicy = {
  uploadId: UPLOAD_ID,
  uploadUrl: `http://localhost:4010/__upload/${UPLOAD_ID}?X-Amz-Expires=300`,
  expiresInSeconds: 300,
  contentType: 'image/webp',
  maxBytes: 5_242_880,
};

async function setup() {
  const net = createNetHarness();
  await net.signIn();
  return { ...net, repository: new PostCreationRepository({ api: net.api }) };
}

describe('PostCreationRepository.requestUploadPolicy', () => {
  it('TC-UPL-023 POST /posts/uploads를 본문 없이 Authorization과 함께 보낸다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-uploads__issued'));

    await h.repository.requestUploadPolicy();

    const [request] = h.transport.requests;
    expect(request.method).toBe('POST');
    expect(pathOf(request)).toBe('/posts/uploads');
    expect(request.body).toBeUndefined();
    expect(authorizationOf(request)).toBe('Bearer access-1');
  });

  it('TC-UPL-024 uploadId·uploadUrl·expiresInSeconds·contentType·maxBytes를 그대로 읽는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-uploads__issued'));
    await expect(h.repository.requestUploadPolicy()).resolves.toEqual(POLICY);
  });

  it('TC-UPL-024 maxBytes는 32비트를 넘는 정수도 잃지 않는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-uploads__issued-large-max'));
    const policy = await h.repository.requestUploadPolicy();
    expect(policy.maxBytes).toBe(5_000_000_000);
    expect(policy.maxBytes).toBe(
      fixtureBody<{ maxBytes: number }>('upload/posts-uploads__issued-large-max').maxBytes,
    );
  });

  it('TC-UPL-025 contentType이 image/webp가 아니어도 디코더는 값을 그대로 돌려준다(거절은 준비 단계)', async () => {
    // [가정: 정책 contentType 검증은 UploadPreparation의 책임이라 저장소는 문자열로만 해석한다]
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-uploads__content-type-png'));
    await expect(h.repository.requestUploadPolicy()).resolves.toMatchObject({
      contentType: 'image/png',
    });
  });

  it('TC-UPL-026 필수 필드가 빠지면 InvalidResponseError이고 앱은 깨지지 않는다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-uploads__missing-fields'));
    await expect(h.repository.requestUploadPolicy()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it.each([
    ['uploadId', 123],
    ['uploadUrl', null],
    ['expiresInSeconds', '300'],
    ['maxBytes', 'big'],
  ])('TC-UPL-026 %s의 타입이 어긋나면 InvalidResponseError다', async (field, value) => {
    const h = await setup();
    const body = { ...fixtureBody('upload/posts-uploads__issued'), [field]: value };
    h.transport.script(json(200, body));
    await expect(h.repository.requestUploadPolicy()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-UPL-027 401은 refresh 후 1회만 재전송한다', async () => {
    const h = await setup();
    h.transport.script(
      unauthorized(),
      refreshOk(),
      fixtureResponse('upload/posts-uploads__issued'),
    );
    await expect(h.repository.requestUploadPolicy()).resolves.toEqual(POLICY);
    expect(h.transport.requestsTo('POST', '/posts/uploads')).toHaveLength(2);
    expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
  });

  it('TC-UPL-027 REAUTHENTICATION_REQUIRED는 ReauthenticationRequiredError다', async () => {
    const h = await setup();
    h.transport.script(unauthorized(), reauth());
    await expect(h.repository.requestUploadPolicy()).rejects.toBeInstanceOf(
      ReauthenticationRequiredError,
    );
  });

  it('TC-UPL-027 갱신 뒤에도 401이면 AuthenticationRequiredError다', async () => {
    const h = await setup();
    h.transport.script(unauthorized(), refreshOk(), unauthorized());
    await expect(h.repository.requestUploadPolicy()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
  });

  it('TC-UPL-027 403은 재시도 없이 1회만 보내고 HttpError(403)다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-uploads__403-banned'));
    await expect(h.repository.requestUploadPolicy()).rejects.toMatchObject({ status: 403 });
    expect(h.transport.requests).toHaveLength(1);
    expect(h.sleeper.calls).toEqual([]);
  });

  it('TC-UPL-027 500은 멱등 발급이라 0.5초·1초 간격으로 최대 2회 다시 보낸다(총 3회)', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-uploads__500-server-error'));
    await expect(h.repository.requestUploadPolicy()).rejects.toMatchObject({ status: 500 });
    expect(h.transport.requests).toHaveLength(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });

  it('TC-UPL-027 연결 실패도 같은 방식으로 다시 보내고, 끝내 실패하면 NetworkError다', async () => {
    const h = await setup();
    h.transport.script(networkFailure());
    await expect(h.repository.requestUploadPolicy()).rejects.toBeInstanceOf(NetworkError);
    expect(h.transport.requests).toHaveLength(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });

  it('TC-UPL-027 500 뒤 성공하면 정책을 돌려준다', async () => {
    const h = await setup();
    h.transport.script(
      fixtureResponse('upload/posts-uploads__500-server-error'),
      fixtureResponse('upload/posts-uploads__issued'),
    );
    await expect(h.repository.requestUploadPolicy()).resolves.toEqual(POLICY);
  });
});

describe('PostCreationRepository.uploadPhoto', () => {
  const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);

  it('TC-UPL-054 PUT이고 Authorization 없이 Content-Type은 정책 값 그대로, 본문은 WebP 바이트다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/s3-put__200'));

    await h.repository.uploadPhoto(POLICY, bytes);

    const [request] = h.transport.requests;
    expect(request.method).toBe('PUT');
    expect(request.url).toBe(POLICY.uploadUrl);
    expect(authorizationOf(request)).toBeUndefined();
    expect(request.headers['Content-Type']).toBe('image/webp');
    expect(Array.from(request.body as Uint8Array)).toEqual(Array.from(bytes));
  });

  it('TC-UPL-055 S3 403(서명 불일치)·5xx는 HttpError로 던지고 멱등 PUT은 0.5초·1초로 2회 다시 보낸다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/s3-put__500-server-error'));
    await expect(h.repository.uploadPhoto(POLICY, bytes)).rejects.toMatchObject({ status: 500 });
    expect(h.transport.requests).toHaveLength(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });

  it('TC-UPL-055 S3 403은 HttpError(403)이고 errorCode는 없다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/s3-put__403-signature-mismatch'));
    const error = await h.repository.uploadPhoto(POLICY, bytes).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 403, errorCode: null });
  });

  it('TC-UPL-055 PUT 연결 실패는 NetworkError다', async () => {
    const h = await setup();
    h.transport.script(networkFailure());
    await expect(h.repository.uploadPhoto(POLICY, bytes)).rejects.toBeInstanceOf(NetworkError);
  });

  it('TC-UPL-056 http://(loopback 아님) 업로드 URL은 전송하지 않고 InvalidResponseError다', async () => {
    const h = await setup();
    const body = fixtureBody<UploadPolicy>('upload/posts-uploads__insecure-upload-url');
    await expect(h.repository.uploadPhoto(body, bytes)).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-UPL-056 잘못된 형식의 URL도 전송하지 않는다', async () => {
    const h = await setup();
    await expect(
      h.repository.uploadPhoto({ ...POLICY, uploadUrl: 'not a url' }, bytes),
    ).rejects.toBeInstanceOf(InvalidResponseError);
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-UPL-057 PUT 타임아웃은 60초이고 일반 API는 연결 10초·응답 15초다', async () => {
    const h = await setup();
    h.transport.respond((request) =>
      request.method === 'PUT'
        ? fixtureResponse('upload/s3-put__200')
        : fixtureResponse('upload/posts-uploads__issued'),
    );

    await h.repository.uploadPhoto(POLICY, bytes);
    await h.repository.requestUploadPolicy();

    const put = h.transport.requests.find((r) => r.method === 'PUT');
    const post = h.transport.requests.find((r) => r.method === 'POST');
    expect(put?.options).toMatchObject({ connectTimeoutMs: 60_000, responseTimeoutMs: 60_000 });
    expect(post?.options).toMatchObject({ connectTimeoutMs: 10_000, responseTimeoutMs: 15_000 });
  });

  it('TC-UPL-057 PUT이 타임아웃되면 업로드 실패(NetworkError 하위)로 처리된다', async () => {
    const h = await setup();
    h.transport.script(timeoutFailure());
    await expect(h.repository.uploadPhoto(POLICY, bytes)).rejects.toBeInstanceOf(NetworkError);
  });

  it('TC-UPL-076 PUT 401은 토큰을 갱신하지 않는다(서명 URL에는 인증 헤더가 없다)', async () => {
    const h = await setup();
    h.transport.script(unauthorized());
    await expect(h.repository.uploadPhoto(POLICY, bytes)).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
  });
});

describe('PostCreationRepository.create', () => {
  const input = { topicId: TOPIC_ID, photoUploadId: UPLOAD_ID, title: '가을 하늘' };

  it('TC-UPL-059 POST /posts에 JSON {topicId, photoUploadId, title}과 Authorization을 보낸다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-create__201-pending'));

    await h.repository.create(input);

    const [request] = h.transport.requests;
    expect(request.method).toBe('POST');
    expect(pathOf(request)).toBe('/posts');
    expect(request.headers['Content-Type']).toBe('application/json');
    expect(authorizationOf(request)).toBe('Bearer access-1');
    expect(JSON.parse(request.body as string)).toEqual({
      topicId: TOPIC_ID,
      photoUploadId: UPLOAD_ID,
      title: '가을 하늘',
    });
  });

  it('TC-UPL-059·082 제목이 없으면 title은 null이거나 생략된다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-create__201-pending'));
    await h.repository.create({ ...input, title: null });
    const body = JSON.parse(h.transport.requests[0].body as string) as Record<string, unknown>;
    expect(body.title ?? null).toBeNull();
    expect(body.topicId).toBe(TOPIC_ID);
  });

  it.each([
    ['upload/posts-create__201-pending', 'PENDING'],
    ['upload/posts-create__201-validating', 'VALIDATING'],
  ])('TC-UPL-060 %s -> %s', async (fixture, status) => {
    const h = await setup();
    h.transport.script(fixtureResponse(fixture));
    await expect(h.repository.create(input)).resolves.toEqual({
      postId: POST_ID,
      moderationStatus: status,
    });
  });

  it('TC-UPL-061 알 수 없는 moderationStatus는 InvalidResponseError다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-create__201-unknown-status'));
    await expect(h.repository.create(input)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-UPL-061 moderationStatus·postId 누락, APPROVED(생성 직후에는 올 수 없는 값)도 InvalidResponseError다', async () => {
    const h = await setup();
    h.transport.script(json(201, { postId: POST_ID }));
    await expect(h.repository.create(input)).rejects.toBeInstanceOf(InvalidResponseError);
    h.transport.script(json(201, { postId: POST_ID, moderationStatus: 'APPROVED' }));
    await expect(h.repository.create(input)).rejects.toBeInstanceOf(InvalidResponseError);
    h.transport.script(json(201, { moderationStatus: 'PENDING' }));
    await expect(h.repository.create(input)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-UPL-068 500은 자동 재시도 없이 1회만 보낸다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-create__500-server-error'));
    await expect(h.repository.create(input)).rejects.toMatchObject({ status: 500 });
    expect(h.transport.requests).toHaveLength(1);
    expect(h.sleeper.calls).toEqual([]);
  });

  it('TC-UPL-069 타임아웃은 다시 보내지 않고 오류로 던진다(복구는 UploadSubmitter)', async () => {
    const h = await setup();
    h.transport.script(timeoutFailure());
    await expect(h.repository.create(input)).rejects.toBeInstanceOf(NetworkError);
    expect(h.transport.requests).toHaveLength(1);
  });

  it('TC-UPL-064 400 BUSINESS_ERROR는 서버 message를 serverMessage로 보존한다', async () => {
    const h = await setup();
    h.transport.script(fixtureResponse('upload/posts-create__400-upload-expired'));
    await expect(h.repository.create(input)).rejects.toMatchObject({
      status: 400,
      errorCode: 'BUSINESS_ERROR',
      serverMessage: '사진 업로드 유효 시간이 지났습니다.',
    });
  });

  it('TC-UPL-066 401은 refresh 후 1회 재전송한다', async () => {
    const h = await setup();
    h.transport.script(
      unauthorized(),
      refreshOk(),
      fixtureResponse('upload/posts-create__201-pending'),
    );
    await expect(h.repository.create(input)).resolves.toMatchObject({ postId: POST_ID });
    expect(h.transport.requestsTo('POST', '/posts')).toHaveLength(2);
  });
});
