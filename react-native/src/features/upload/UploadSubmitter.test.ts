import { json, networkFailure, timeoutFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { reauth, refreshOk, unauthorized } from '../../core/http/__testing__/createNetHarness';
import type { RouteValue } from '../../data/__testing__/FixtureRouter';
import { t } from '../../shared/copy';
import { identityEdit } from '../photo-edit/PhotoEdit';
import {
  countOf,
  createUploadHarness,
  flush,
  PHOTO_URI,
  TOPIC_DATE,
  TOPIC_ID,
  UPLOAD_ID_1,
  UPLOAD_ID_2,
  type UploadHarness,
} from './__testing__/createUploadHarness';

const POLICY = 'POST /posts/uploads';
const CREATE = 'POST /posts';
const TODAY = 'GET /posts/today';
const PUT_1 = `PUT /__upload/${UPLOAD_ID_1}`;
const PUT_2 = `PUT /__upload/${UPLOAD_ID_2}`;
const POST_ID = '22222222-2222-4222-8222-222222222201';
const ISSUED_TWICE: RouteValue = [
  'upload/posts-uploads__issued',
  'upload/posts-uploads__issued-new',
];
const fail500 = 'upload/posts-uploads__500-server-error';

async function setup(routes: Record<string, RouteValue> = {}, options: { start?: boolean } = {}) {
  const h = await createUploadHarness({ routes });
  if (options.start !== false) h.preparation.start({ sourceUri: PHOTO_URI, edit: identityEdit() });
  return h;
}

const submit = (h: UploadHarness, title: string | null = null, signal?: AbortSignal) =>
  h.submitter.submit({ topicId: TOPIC_ID, topicDate: TOPIC_DATE, title }, signal);

const bodyOf = (h: UploadHarness, index = 0) =>
  JSON.parse(h.router.calls(CREATE)[index].body as string) as Record<string, unknown>;

const failed = (message: string) => ({ kind: 'failed', message });

describe('UploadSubmitter - 정상 흐름', () => {
  it('TC-UPL-060·REQ-UPL-040 준비 완료 -> PUT -> POST /posts 순서로 보내고 201 PENDING이면 성공이다', async () => {
    const h = await setup();
    const outcome = await submit(h, '가을 하늘');

    expect(outcome).toEqual({ kind: 'success', postId: POST_ID, moderationStatus: 'PENDING' });
    const sequence = h.transport.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`);
    expect(sequence).toEqual([
      'POST /api/v1/posts/uploads',
      `PUT /__upload/${UPLOAD_ID_1}`,
      'POST /api/v1/posts',
    ]);
  });

  it('TC-UPL-060 201 VALIDATING이면 상태가 VALIDATING이다', async () => {
    const h = await setup({ [CREATE]: 'upload/posts-create__201-validating' });
    await expect(submit(h)).resolves.toMatchObject({
      kind: 'success',
      moderationStatus: 'VALIDATING',
    });
  });

  it('TC-UPL-054 PUT은 Authorization 없이 Content-Type이 정책 값이고 본문은 준비한 파일 바이트다', async () => {
    const h = await setup();
    const prepared = await h.preparation.ready();
    const expectedBytes = Array.from(await h.files.readBytes(prepared.file.uri));
    await submit(h);

    const [put] = h.router.calls(PUT_1);
    expect(put.method).toBe('PUT');
    expect(put.headers.Authorization).toBeUndefined();
    expect(put.headers['Content-Type']).toBe('image/webp');
    expect(Array.from(put.body as Uint8Array)).toEqual(expectedBytes);
  });

  it('TC-UPL-059 POST /posts 본문은 {topicId, photoUploadId, title}이고 Authorization이 있다', async () => {
    const h = await setup();
    await submit(h, '가을 하늘');
    expect(bodyOf(h)).toEqual({
      topicId: TOPIC_ID,
      photoUploadId: UPLOAD_ID_1,
      title: '가을 하늘',
    });
    expect(h.router.calls(CREATE)[0].headers.Authorization).toBe('Bearer access-1');
  });

  it('TC-UPL-082 title이 null이면 null(또는 생략)로 보낸다', async () => {
    const h = await setup();
    await submit(h, null);
    expect(bodyOf(h).title ?? null).toBeNull();
  });

  it('TC-UPL-048 준비가 끝나기 전에는 아무것도 보내지 않고, 끝나면 자동으로 PUT·POST를 진행한다', async () => {
    const h = await setup({}, { start: false });
    const hold = h.engine.holdNext('encodeWebp');
    h.preparation.start({ sourceUri: PHOTO_URI, edit: identityEdit() });
    const pending = submit(h);
    await flush();
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
    expect(countOf(h, CREATE)).toBe(0);

    hold.release();
    await expect(pending).resolves.toMatchObject({ kind: 'success' });
    expect(countOf(h, CREATE)).toBe(1);
  });

  it('TC-UPL-031 PUT이 끝나면 임시 WebP 파일은 더 필요 없어 남지 않는다', async () => {
    const h = await setup();
    await submit(h);
    expect(h.files.existing).toEqual([]);
  });
});

describe('UploadSubmitter - 정책 만료', () => {
  it('TC-UPL-049 발급 후 294.999초면 기존 uploadId로 PUT·POST한다', async () => {
    const h = await setup({ [POLICY]: ISSUED_TWICE });
    await h.preparation.ready();
    h.monotonic.advance(294_999);
    await submit(h);
    expect(countOf(h, PUT_1)).toBe(1);
    expect(bodyOf(h).photoUploadId).toBe(UPLOAD_ID_1);
  });

  it('TC-UPL-050 발급 후 295초면 새 정책을 받아 그 URL로 PUT하고 POST /posts에도 새 uploadId를 쓴다', async () => {
    const h = await setup({ [POLICY]: ISSUED_TWICE });
    await h.preparation.ready();
    h.monotonic.advance(295_000);
    await submit(h);
    expect(countOf(h, PUT_1)).toBe(0);
    expect(countOf(h, PUT_2)).toBe(1);
    expect(bodyOf(h).photoUploadId).toBe(UPLOAD_ID_2);
  });

  it('TC-UPL-076 PUT에는 Authorization이 없고 POST /posts가 401이면 refresh 후 1회 재전송한다', async () => {
    const h = await setup({
      [CREATE]: [unauthorized(), fixtureResponse('upload/posts-create__201-pending')],
      'POST /auth/refresh': refreshOk(),
    });
    await expect(submit(h)).resolves.toMatchObject({ kind: 'success' });
    expect(h.router.calls(PUT_1)[0].headers.Authorization).toBeUndefined();
    expect(countOf(h, CREATE)).toBe(2);
    expect(h.router.calls(CREATE)[1].headers.Authorization).toBe('Bearer access-2');
  });
});

describe('UploadSubmitter - 정책·PUT 실패', () => {
  it('TC-UPL-027 정책 발급 403은 정지 안내이고 재요청하지 않는다', async () => {
    const h = await setup({ [POLICY]: 'upload/posts-uploads__403-banned' });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.gate.banned')));
    expect(countOf(h, POLICY)).toBe(1);
    expect(countOf(h, CREATE)).toBe(0);
  });

  it('TC-UPL-027 정책 발급 500은 준비 실패 문구다', async () => {
    const h = await setup({ [POLICY]: fail500 });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.prepare')));
  });

  it('TC-UPL-025 정책 contentType이 image/png면 준비 실패 문구이고 PUT은 하지 않는다', async () => {
    const h = await setup({ [POLICY]: 'upload/posts-uploads__content-type-png' });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.prepare')));
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
  });

  it('TC-UPL-042 인코딩이 한도를 못 맞추면 준비 실패 문구다', async () => {
    const h = await setup();
    h.engine.sizeFor = () => 99_999_999;
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.prepare')));
    expect(h.files.existing).toEqual([]);
  });

  it('TC-UPL-055 S3 403(서명 불일치)은 업로드 실패 문구이고 다시 보내지 않는다(자동 재시도는 네트워크 오류·5xx만, REQ-UPL-045)', async () => {
    const h = await setup({ [PUT_1]: 'upload/s3-put__403-signature-mismatch' });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.upload')));
    expect(countOf(h, PUT_1)).toBe(1);
    expect(h.sleeper.calls).toEqual([]);
    expect(countOf(h, CREATE)).toBe(0);
  });

  it('TC-UPL-055 S3 5xx도 업로드 실패 문구이고 멱등 PUT은 0.5초·1초로 2회 다시 보낸다', async () => {
    const h = await setup({ [PUT_1]: 'upload/s3-put__500-server-error' });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.upload')));
    expect(countOf(h, PUT_1)).toBe(3);
    expect(h.sleeper.calls).toEqual([500, 1000]);
  });

  it('TC-UPL-055 PUT 연결 실패는 네트워크 문구다', async () => {
    const h = await setup({ [PUT_1]: networkFailure() });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.network')));
  });

  it('TC-UPL-055·REQ-UPL-059 PUT이 거절된 뒤의 다음 제출은 정책 발급부터 다시 하고 새 uploadId를 쓴다', async () => {
    const h = await setup({
      [POLICY]: ISSUED_TWICE,
      [PUT_1]: 'upload/s3-put__403-signature-mismatch',
    });
    await submit(h);
    expect(h.files.existing).toEqual([]);

    await expect(submit(h)).resolves.toMatchObject({ kind: 'success' });
    expect(countOf(h, POLICY)).toBe(2);
    expect(countOf(h, PUT_2)).toBe(1);
    expect(bodyOf(h).photoUploadId).toBe(UPLOAD_ID_2);
  });

  it('TC-UPL-056 http:// 업로드 URL은 전송하지 않고 업로드 실패다', async () => {
    const h = await setup({ [POLICY]: 'upload/posts-uploads__insecure-upload-url' });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.upload')));
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
    expect(countOf(h, CREATE)).toBe(0);
  });

  it('TC-UPL-057 PUT 타임아웃은 네트워크 문구로 실패한다', async () => {
    const h = await setup({ [PUT_1]: timeoutFailure() });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.network')));
  });
});

describe('UploadSubmitter - POST /posts 실패 (D-02)', () => {
  const createError = (name: string): string => `upload/posts-create__${name}`;

  it.each([
    ['이미 작성(서버 문구 그대로)', createError('400-already-posted')],
    [
      '서버 문구가 달라져도 결과가 같다',
      json(400, { errorCode: 'BUSINESS_ERROR', message: '완전히 다른 문장입니다.' }),
    ],
  ])('TC-UPL-062 400 + today isPosted=true -> 중복 문구 (%s)', async (_name, route) => {
    const h = await setup({ [CREATE]: route, [TODAY]: 'home/posts-today__posted-pending' });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.duplicate')));
    expect(countOf(h, TODAY)).toBe(1);
  });

  it.each([
    ['today 404', 'home/posts-today__404-no-open-topic'],
    ['topicDate가 다름', 'upload/posts-today__topic-date-changed'],
  ])('TC-UPL-063 400 + %s -> 주제 변경 문구', async (_name, today) => {
    const h = await setup({ [CREATE]: createError('400-topic-not-open'), [TODAY]: today });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.topic-changed')));
  });

  it('TC-UPL-063 서버 message가 달라도 같은 결과다', async () => {
    const h = await setup({
      [CREATE]: json(400, { errorCode: 'BUSINESS_ERROR', message: 'something else' }),
      [TODAY]: 'upload/posts-today__topic-date-changed',
    });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.topic-changed')));
  });

  it.each([
    ['400-upload-expired', '사진 업로드 유효 시간이 지났습니다.'],
    ['400-upload-used', '이미 사용된 사진입니다.'],
    ['400-rejected-unsupported-format', 'WebP 이미지만 업로드할 수 있습니다.'],
    ['400-rejected-too-large', '더 작은 용량의 이미지를 업로드해 주세요.'],
  ])(
    'TC-UPL-064 %s -> 서버 message 그대로, 다음 제출은 정책 발급부터 다시 한다',
    async (fixture, message) => {
      const h = await setup({
        [POLICY]: ISSUED_TWICE,
        [CREATE]: [createError(fixture), 'upload/posts-create__201-pending'],
        [TODAY]: 'upload/posts-today__not-posted',
      });
      await expect(submit(h)).resolves.toEqual(failed(message));
      expect(h.files.existing).toEqual([]);

      await expect(submit(h)).resolves.toMatchObject({ kind: 'success' });
      expect(countOf(h, POLICY)).toBe(2);
      expect(bodyOf(h, 1).photoUploadId).toBe(UPLOAD_ID_2);
    },
  );

  it('TC-UPL-065 404 "업로드한 사진을 찾을 수 없습니다."는 서버 message를 보여 주고 업로드부터 다시 하게 한다', async () => {
    const h = await setup({
      [POLICY]: ISSUED_TWICE,
      [CREATE]: [createError('404-upload-not-found'), 'upload/posts-create__201-pending'],
    });
    await expect(submit(h)).resolves.toEqual(failed('업로드한 사진을 찾을 수 없습니다.'));
    await submit(h);
    expect(countOf(h, POLICY)).toBe(2);
  });

  it('TC-UPL-065 404 "게시물을 작성할 주제를 찾을 수 없습니다."는 today로 확인해 주제 변경 문구다', async () => {
    const h = await setup({
      [CREATE]: createError('404-topic-not-found'),
      [TODAY]: 'upload/posts-today__topic-date-changed',
    });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.topic-changed')));
    expect(countOf(h, TODAY)).toBe(1);
  });

  it('TC-UPL-075 진입 때 topicId로 POST한 뒤 서버가 이미 다음 주제를 열었으면 주제 변경 문구다', async () => {
    const h = await setup({
      [CREATE]: createError('400-topic-not-open'),
      [TODAY]: 'upload/posts-today__topic-date-changed',
    });
    h.clock.set('2026-10-27T15:01:00Z'); // KST 00:01
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.topic-changed')));
    expect(bodyOf(h).topicId).toBe(TOPIC_ID);
  });

  it('TC-UPL-075 서버 참여 기간이 아직 끝나지 않았다면 자정 이후에도 201로 성공한다', async () => {
    const h = await setup();
    h.clock.set('2026-10-27T15:01:00Z');
    await expect(submit(h)).resolves.toMatchObject({ kind: 'success' });
    expect(bodyOf(h).topicId).toBe(TOPIC_ID);
  });

  it('TC-UPL-083 제목이 너무 길다는 400은 서버 message를 보여 준다', async () => {
    const h = await setup({
      [CREATE]: createError('400-title-too-long'),
      [TODAY]: 'upload/posts-today__not-posted',
    });
    await expect(submit(h, '가나다라마바사아자차카')).resolves.toEqual(
      failed('제목은 10자 이하여야 합니다.'),
    );
  });

  it('TC-UPL-067 403은 정지 안내이고 재요청 0건이다', async () => {
    const h = await setup({ [CREATE]: createError('403-banned') });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.gate.banned')));
    expect(countOf(h, CREATE)).toBe(1);
    expect(countOf(h, TODAY)).toBe(0);
  });

  it('TC-UPL-068 500은 자동 재시도 없이 1회만 보내고 전시 실패 문구다', async () => {
    const h = await setup({ [CREATE]: createError('500-server-error') });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.create')));
    expect(countOf(h, CREATE)).toBe(1);
    expect(h.files.existing).toEqual([]);
  });

  it('TC-UPL-066 401이 재인증이 필요하면 session-expired, 갱신 뒤에도 401이면 login-required다', async () => {
    const expired = await setup({ [CREATE]: unauthorized(), 'POST /auth/refresh': reauth() });
    await expect(submit(expired)).resolves.toEqual({ kind: 'session-expired' });

    const stillUnauthorized = await setup({
      [CREATE]: unauthorized(),
      'POST /auth/refresh': refreshOk(),
    });
    await expect(submit(stillUnauthorized)).resolves.toEqual({ kind: 'login-required' });
  });
});

describe('UploadSubmitter - 응답 유실 복구 (D-07)', () => {
  it('TC-UPL-061 201 본문이 계약을 어기면 today로 확인해 isPosted=true인 상태로 성공 처리한다', async () => {
    const h = await setup({
      [CREATE]: 'upload/posts-create__201-unknown-status',
      [TODAY]: 'home/posts-today__posted-pending',
    });
    await expect(submit(h)).resolves.toEqual({
      kind: 'success',
      postId: POST_ID,
      moderationStatus: 'PENDING',
    });
    expect(countOf(h, CREATE)).toBe(1);
  });

  it('TC-UPL-069 타임아웃 뒤 today가 isPosted=true면 한 번만 성공하고 POST는 다시 보내지 않으며 상태는 today 값이다', async () => {
    const h = await setup({
      [CREATE]: timeoutFailure(),
      [TODAY]: 'home/posts-today__posted-validating',
    });
    await expect(submit(h)).resolves.toEqual({
      kind: 'success',
      postId: POST_ID,
      moderationStatus: 'VALIDATING',
    });
    expect(countOf(h, CREATE)).toBe(1);
    expect(countOf(h, TODAY)).toBe(1);
  });

  it('TC-UPL-070 타임아웃 뒤 today가 isPosted=false면 네트워크 문구이고, 같은 uploadId로 새 정책 없이 다시 제출한다', async () => {
    const h = await setup({
      [CREATE]: [timeoutFailure(), fixtureResponse('upload/posts-create__201-pending')],
      [TODAY]: 'home/posts-today__not-posted',
    });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.network')));

    await expect(submit(h)).resolves.toMatchObject({
      kind: 'success',
      moderationStatus: 'PENDING',
    });
    expect(countOf(h, POLICY)).toBe(1);
    // [가정: REQ-UPL-050은 URL이 살아 있으면 같은 URL로 PUT을 다시 보낸다고 하고 TC-UPL-070/072·TC-UPL-031은 새 정책 없이
    //  POST만 다시 보내고 임시 파일을 남기지 않는다고 한다. 둘 다 허용하도록 PUT 횟수는 1회 이상으로만 검사한다]
    expect(countOf(h, PUT_1)).toBeGreaterThanOrEqual(1);
    expect(countOf(h, CREATE)).toBe(2);
    expect(bodyOf(h, 1).photoUploadId).toBe(bodyOf(h, 0).photoUploadId);
  });

  it('TC-UPL-071 today도 실패하면 네트워크 문구이고, 서버가 이미 만들었다면 재제출은 400 중복 문구다', async () => {
    const h = await setup({
      [CREATE]: [timeoutFailure(), fixtureResponse('upload/posts-create__400-already-posted')],
      // GET은 5xx에 최대 2회 다시 보내므로 3회 실패한 뒤 정상 응답이 온다
      [TODAY]: [
        'home/posts-today__500-server-error',
        'home/posts-today__500-server-error',
        'home/posts-today__500-server-error',
        'home/posts-today__posted-pending',
      ],
    });
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.network')));
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.duplicate')));
  });

  it('TC-UPL-072 재제출이 59분 59초 뒤여도 같은 uploadId로 POST /posts를 보낸다', async () => {
    const h = await setup({
      [CREATE]: [timeoutFailure(), fixtureResponse('upload/posts-create__201-pending')],
      [TODAY]: 'home/posts-today__not-posted',
    });
    await submit(h);
    h.monotonic.advance(3_599_000);
    await expect(submit(h)).resolves.toMatchObject({ kind: 'success' });
    expect(countOf(h, POLICY)).toBe(1);
    expect(bodyOf(h, 1).photoUploadId).toBe(UPLOAD_ID_1);
  });

  it('TC-UPL-072 61분 뒤 서버가 400 "사진 업로드 유효 시간이 지났습니다."를 주면 서버 message를 보이고 정책 발급부터 다시 준비한다', async () => {
    const h = await setup({
      [POLICY]: ISSUED_TWICE,
      [CREATE]: [
        timeoutFailure(),
        fixtureResponse('upload/posts-create__400-upload-expired'),
        fixtureResponse('upload/posts-create__201-pending'),
      ],
      [TODAY]: 'home/posts-today__not-posted',
    });
    await submit(h);
    h.monotonic.advance(3_660_000);
    await expect(submit(h)).resolves.toEqual(failed('사진 업로드 유효 시간이 지났습니다.'));

    await expect(submit(h)).resolves.toMatchObject({ kind: 'success' });
    expect(countOf(h, POLICY)).toBe(2);
    expect(bodyOf(h, 2).photoUploadId).toBe(UPLOAD_ID_2);
  });
});

describe('UploadSubmitter - 취소', () => {
  it('TC-UPL-079 PUT 중 취소하면 cancelled이고 POST /posts는 보내지 않으며 임시 파일이 없다', async () => {
    const h = await setup({ [PUT_1]: () => new Promise(() => undefined) });
    const controller = new AbortController();
    const pending = submit(h, null, controller.signal);
    await flush();
    expect(countOf(h, PUT_1)).toBe(1);

    controller.abort();
    h.preparation.cancel();
    await expect(pending).resolves.toEqual({ kind: 'cancelled' });
    expect(countOf(h, CREATE)).toBe(0);
    expect(h.files.existing).toEqual([]);
  });

  it('TC-UPL-079 준비 중 취소하면 cancelled이고 아무것도 업로드하지 않는다', async () => {
    const h = await setup({}, { start: false });
    const hold = h.engine.holdNext('encodeWebp');
    h.preparation.start({ sourceUri: PHOTO_URI, edit: identityEdit() });
    const controller = new AbortController();
    const pending = submit(h, null, controller.signal);
    await flush();
    controller.abort();
    hold.release();
    await expect(pending).resolves.toEqual({ kind: 'cancelled' });
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
    expect(countOf(h, CREATE)).toBe(0);
  });
});

describe('UploadSubmitter - 본문 크기와 파일 읽기', () => {
  it('REQ-UPL-044 인코딩 결과가 정책 maxBytes를 넘으면 PUT을 보내지 않고 준비 실패 문구를 보인다', async () => {
    const issued = fixtureResponse('upload/posts-uploads__issued');
    const small = {
      ...issued,
      bodyText: JSON.stringify({ ...JSON.parse(issued.bodyText as string), maxBytes: 4 }),
    };
    const h = await setup({ [POLICY]: small });
    h.engine.sizeFor = () => 3; // 보고된 크기는 통과하지만 실제 바이트(6)는 넘는다
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.prepare')));
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
    expect(countOf(h, CREATE)).toBe(0);
    expect(h.files.existing).toEqual([]);
  });

  it('임시 파일을 읽지 못하면 준비 실패 문구를 보이고 다음 제출은 처음부터 다시 준비한다', async () => {
    const h = await setup({ [POLICY]: ISSUED_TWICE });
    await h.preparation.ready();
    const original = h.files.readBytes.bind(h.files);
    let broken = true;
    h.files.readBytes = async (uri: string) => {
      if (broken) throw new Error('read failed');
      return original(uri);
    };
    await expect(submit(h)).resolves.toEqual(failed(t('upload.error.prepare')));
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);

    broken = false;
    await expect(submit(h)).resolves.toMatchObject({ kind: 'success' });
    expect(countOf(h, POLICY)).toBe(2);
  });
});
