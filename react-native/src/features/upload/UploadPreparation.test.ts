import { CancelledError, HttpError, InvalidResponseError } from '../../core/http/ApiError';
import { json } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import {
  createUploadHarness,
  countOf,
  flush,
  PHOTO_URI,
  UPLOAD_ID_1,
  UPLOAD_ID_2,
  UPLOAD_ID_3,
  type UploadHarness,
} from './__testing__/createUploadHarness';
import { identityEdit, type PhotoEdit } from '../photo-edit/PhotoEdit';
import type { RouteValue } from '../../data/__testing__/FixtureRouter';
import { UnsupportedContentTypeError } from './UploadErrors';

const POLICY = 'POST /posts/uploads';
const fail500 = 'upload/posts-uploads__500-server-error';
const MAX = 5_242_880;

const input = (edit: PhotoEdit = identityEdit(), sourceUri = PHOTO_URI) => ({ sourceUri, edit });
const phase = (h: UploadHarness) => h.preparation.getSnapshot().phase;

async function setup(routes: Record<string, RouteValue> = {}) {
  const h = await createUploadHarness({ routes });
  return h;
}

describe('UploadPreparation - 선제 준비', () => {
  it('TC-UPL-023 시작하면 정책을 발급받고 인코딩하며 S3 PUT은 하지 않는다(본문 없는 POST, Authorization)', async () => {
    const h = await setup();
    h.preparation.start(input());
    const prepared = await h.preparation.ready();

    expect(countOf(h, POLICY)).toBe(1);
    const [request] = h.router.calls(POLICY);
    expect(request.body).toBeUndefined();
    expect(request.headers.Authorization).toBe('Bearer access-1');
    expect(h.engine.encodeRequests).toHaveLength(1);
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
    expect(prepared.policy.uploadId).toBe(UPLOAD_ID_1);
    expect(prepared.file.byteLength).toBeLessThanOrEqual(MAX);
    expect(phase(h)).toBe('ready');
  });

  it('TC-UPL-023 인코딩의 한도는 정책의 maxBytes다', async () => {
    const h = await setup({ [POLICY]: 'upload/posts-uploads__issued-small-max' });
    h.engine.sizeFor = (r) => (r.quality === 90 ? 2_000_000 : 900_000);
    h.preparation.start(input());
    const { file } = await h.preparation.ready();
    expect(file.byteLength).toBe(900_000);
    expect(h.engine.encodeRequests.map((r) => r.quality)).toEqual([90, 80]);
  });

  it('TC-UPL-023 진행 상태가 issuing -> encoding -> ready로 바뀐다', async () => {
    const h = await setup();
    const hold = h.engine.holdNext('encodeWebp');
    const seen: string[] = [phase(h)];
    h.preparation.subscribe(() => seen.push(phase(h)));
    h.preparation.start(input());
    await flush();
    expect(phase(h)).toBe('encoding');
    hold.release();
    await h.preparation.ready();
    expect(seen).toEqual(expect.arrayContaining(['idle', 'issuing', 'encoding', 'ready']));
    expect(seen.indexOf('issuing')).toBeLessThan(seen.indexOf('encoding'));
  });

  it('TC-UPL-025 정책 contentType이 image/png면 인코딩 전에 실패한다', async () => {
    const h = await setup({ [POLICY]: 'upload/posts-uploads__content-type-png' });
    h.preparation.start(input());
    await expect(h.preparation.ready()).rejects.toBeInstanceOf(UnsupportedContentTypeError);
    expect(h.engine.encodeRequests).toHaveLength(0);
    const state = h.preparation.getSnapshot();
    expect(state.phase).toBe('failed');
  });

  it('TC-UPL-026 정책 응답에 필수 필드가 없으면 계약 위반 실패이고 인코딩하지 않는다', async () => {
    const h = await setup({ [POLICY]: 'upload/posts-uploads__missing-fields' });
    h.preparation.start(input());
    await expect(h.preparation.ready()).rejects.toBeInstanceOf(InvalidResponseError);
    expect(h.engine.encodeRequests).toHaveLength(0);
    expect(phase(h)).toBe('failed');
  });

  it('TC-UPL-027 정책 발급 403은 재시도 없이 원인 그대로(HttpError 403)로 실패한다', async () => {
    const h = await setup({ [POLICY]: 'upload/posts-uploads__403-banned' });
    h.preparation.start(input());
    await expect(h.preparation.ready()).rejects.toMatchObject({ status: 403 });
    expect(countOf(h, POLICY)).toBe(1);
    const state = h.preparation.getSnapshot();
    expect(state).toMatchObject({ phase: 'failed' });
    expect((state as { error: unknown }).error).toBeInstanceOf(HttpError);
  });

  it('사진을 고르지 않고 ready를 부르면 거절한다', async () => {
    // [가정: 입력이 없으면 ready는 reject.]
    const h = await setup();
    await expect(h.preparation.ready()).rejects.toBeInstanceOf(Error);
    expect(countOf(h, POLICY)).toBe(0);
  });
});

describe('UploadPreparation - 교체와 세대', () => {
  it('TC-UPL-028 다른 사진으로 바꾸면 이전 작업을 취소하고 임시 파일을 지우고 새 정책을 받는다', async () => {
    const h = await setup({
      [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'],
    });
    h.preparation.start(input(identityEdit(), 'file:///picked/a.jpg'));
    await h.preparation.ready();
    const first = h.files.existing[0];

    h.preparation.start(input(identityEdit(), 'file:///picked/b.jpg'));
    const second = await h.preparation.ready();

    expect(h.files.deleted).toContain(first);
    expect(second.policy.uploadId).toBe(UPLOAD_ID_2);
    expect(countOf(h, POLICY)).toBe(2);
    expect(h.files.existing).toEqual([second.file.uri]);
  });

  it('TC-UPL-028 준비 중에 바꾸면 이전 인코딩의 signal이 취소된다', async () => {
    const h = await setup();
    const hold = h.engine.holdNext('encodeWebp');
    h.preparation.start(input(identityEdit(), 'file:///picked/a.jpg'));
    await flush();
    const oldSignal = h.engine.callsOf('encodeWebp')[0].signal;
    expect(oldSignal?.aborted).toBe(false);

    h.preparation.start(input(identityEdit(), 'file:///picked/b.jpg'));
    expect(oldSignal?.aborted).toBe(true);
    hold.release();
    await h.preparation.ready();
    expect(h.files.existing).toHaveLength(1);
  });

  it('TC-UPL-028 다른 편집값으로 다시 완료하면 다시 준비한다', async () => {
    const h = await setup({
      [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'],
    });
    h.preparation.start(input());
    await h.preparation.ready();
    h.preparation.start(input({ ...identityEdit(), filter: 'vivid' }));
    const prepared = await h.preparation.ready();
    expect(countOf(h, POLICY)).toBe(2);
    expect(h.engine.encodeRequests.at(-1)?.edit?.filter).toBe('vivid');
    expect(prepared.policy.uploadId).toBe(UPLOAD_ID_2);
  });

  it('TC-UPL-028 같은 사진·같은 편집값이면 다시 준비하지 않는다', async () => {
    const h = await setup();
    h.preparation.start(input());
    await h.preparation.ready();
    h.preparation.start(input());
    h.preparation.start(input(identityEdit()));
    await h.preparation.ready();
    expect(countOf(h, POLICY)).toBe(1);
    expect(h.engine.encodeRequests).toHaveLength(1);
  });

  it('TC-UPL-030 뒤늦게 끝난 이전 작업은 새 선택의 상태를 덮지 않고 그 결과 파일은 지워진다', async () => {
    const h = await setup({
      [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'],
    });
    const hold = h.engine.holdNext('encodeWebp');
    h.preparation.start(input(identityEdit(), 'file:///picked/a.jpg'));
    await flush();

    h.preparation.start(input(identityEdit(), 'file:///picked/b.jpg'));
    const prepared = await h.preparation.ready();
    expect(prepared.policy.uploadId).toBe(UPLOAD_ID_2);

    hold.release();
    await flush();
    expect(phase(h)).toBe('ready');
    const again = await h.preparation.ready();
    expect(again.policy.uploadId).toBe(UPLOAD_ID_2);
    expect(h.files.existing).toEqual([prepared.file.uri]);
  });

  it('TC-UPL-030 이전 작업이 늦게 실패해도 새 선택을 실패로 바꾸지 않는다', async () => {
    const h = await setup({
      [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'],
    });
    const hold = h.engine.holdNext('encodeWebp');
    h.preparation.start(input(identityEdit(), 'file:///picked/a.jpg'));
    await flush();
    h.preparation.start(input(identityEdit(), 'file:///picked/b.jpg'));
    await h.preparation.ready();
    hold.fail(new Error('late failure'));
    await flush();
    expect(phase(h)).toBe('ready');
  });
});

describe('UploadPreparation - 실패 뒤 다시 시도', () => {
  it('TC-UPL-029 준비가 실패해도 입력은 유지되고, ready()가 정책 발급부터 다시 한다', async () => {
    const h = await setup({
      [POLICY]: [fail500, fail500, fail500, 'upload/posts-uploads__issued'],
    });
    h.preparation.start(input());
    await expect(h.preparation.ready()).rejects.toBeInstanceOf(HttpError);
    expect(phase(h)).toBe('failed');
    expect(countOf(h, POLICY)).toBe(3);

    const prepared = await h.preparation.ready();
    expect(prepared.policy.uploadId).toBe(UPLOAD_ID_1);
    expect(countOf(h, POLICY)).toBe(4);
    expect(phase(h)).toBe('ready');
  });

  it('TC-UPL-029 인코딩 실패 뒤에도 ready()가 처음부터 다시 한다', async () => {
    const h = await setup({
      [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'],
    });
    h.engine.failNext('encodeWebp', new Error('encoder crashed'));
    h.preparation.start(input());
    await expect(h.preparation.ready()).rejects.toThrow('encoder crashed');

    const prepared = await h.preparation.ready();
    expect(prepared.policy.uploadId).toBe(UPLOAD_ID_2);
  });

  it('REQ-UPL-054·059 invalidate 뒤에는 정책과 파일을 버리고 다음 ready가 처음부터 다시 한다(입력은 유지)', async () => {
    const h = await setup({
      [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'],
    });
    h.preparation.start(input());
    const first = await h.preparation.ready();

    h.preparation.invalidate();
    expect(h.files.deleted).toContain(first.file.uri);

    const second = await h.preparation.ready();
    expect(second.policy.uploadId).toBe(UPLOAD_ID_2);
    expect(countOf(h, POLICY)).toBe(2);
  });
});

describe('UploadPreparation - 만료(단조 시계)', () => {
  const twoPolicies = {
    [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'],
  };

  it('TC-UPL-049 발급 후 294.999초면 기존 정책을 그대로 쓴다', async () => {
    const h = await setup(twoPolicies);
    h.preparation.start(input());
    await h.preparation.ready();
    h.monotonic.advance(294_999);
    const prepared = await h.preparation.ready();
    expect(prepared.policy.uploadId).toBe(UPLOAD_ID_1);
    expect(countOf(h, POLICY)).toBe(1);
  });

  it.each([295_000, 299_000, 301_000])(
    'TC-UPL-050 발급 후 %d ms면 새 정책(다른 uploadId)을 받는다',
    async (elapsed) => {
      const h = await setup(twoPolicies);
      h.preparation.start(input());
      await h.preparation.ready();
      h.monotonic.advance(elapsed);
      const prepared = await h.preparation.ready();
      expect(prepared.policy.uploadId).toBe(UPLOAD_ID_2);
      expect(prepared.policy.uploadUrl).toContain(UPLOAD_ID_2);
      expect(countOf(h, POLICY)).toBe(2);
    },
  );

  it('TC-UPL-051 벽시계를 +10분 바꿔도 실제 경과 100초면 기존 정책을 쓴다', async () => {
    const h = await setup(twoPolicies);
    h.preparation.start(input());
    await h.preparation.ready();
    h.clock.advance(600_000);
    h.monotonic.advance(100_000);
    const prepared = await h.preparation.ready();
    expect(prepared.policy.uploadId).toBe(UPLOAD_ID_1);
  });

  it('TC-UPL-051 벽시계를 -10분 바꿔도 실제 경과 296초면 새 정책을 받는다', async () => {
    const h = await setup(twoPolicies);
    h.preparation.start(input());
    await h.preparation.ready();
    h.clock.advance(-600_000);
    h.monotonic.advance(296_000);
    const prepared = await h.preparation.ready();
    expect(prepared.policy.uploadId).toBe(UPLOAD_ID_2);
  });

  it('TC-UPL-052 재발급된 maxBytes가 파일 크기 이상이면 준비한 파일을 재사용하고 새 uploadId만 바뀐다', async () => {
    const h = await setup(twoPolicies);
    h.preparation.start(input());
    const first = await h.preparation.ready();
    h.monotonic.advance(300_000);
    const second = await h.preparation.ready();
    expect(second.file.uri).toBe(first.file.uri);
    expect(second.policy.uploadId).toBe(UPLOAD_ID_2);
    expect(h.engine.encodeRequests).toHaveLength(1);
    expect(h.files.deleted).not.toContain(first.file.uri);
  });

  it('TC-UPL-052 새 maxBytes가 더 작아 파일이 초과하면 저장한 편집값으로 원본에서 다시 인코딩한다', async () => {
    const h = await setup({
      [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-small-max'],
    });
    h.engine.sizeFor = (r) => (r.quality === 90 ? 3_000_000 : 800_000);
    const edit: PhotoEdit = { ...identityEdit(), quarterTurns: 1, filter: 'vintage' };
    h.preparation.start(input(edit));
    const first = await h.preparation.ready();
    expect(first.file.byteLength).toBe(3_000_000);

    h.monotonic.advance(300_000);
    const second = await h.preparation.ready();

    expect(second.policy.uploadId).toBe(UPLOAD_ID_3);
    expect(second.file.byteLength).toBeLessThanOrEqual(1_000_000);
    const last = h.engine.encodeRequests.at(-1);
    expect(last?.sourceUri).toBe(PHOTO_URI);
    expect(last?.edit).toEqual(edit);
    expect(h.files.deleted).toContain(first.file.uri);
    expect(h.files.existing).toEqual([second.file.uri]);
  });

  it('TC-UPL-053 재발급된 정책의 contentType이 image/webp가 아니면 업로드하지 않고 실패한다', async () => {
    const h = await setup({
      [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__content-type-png'],
    });
    h.preparation.start(input());
    await h.preparation.ready();
    h.monotonic.advance(300_000);
    await expect(h.preparation.ready()).rejects.toBeInstanceOf(UnsupportedContentTypeError);
    expect(phase(h)).toBe('failed');
  });

  it('TC-UPL-076 새 정책 발급은 만료 갱신 후 수행된다: 401이면 refresh 뒤 다시 보낸다', async () => {
    const h = await setup({
      [POLICY]: [
        fixtureResponse('upload/posts-uploads__issued'),
        fixtureResponse('common/error__unauthorized-token-invalid'),
        fixtureResponse('upload/posts-uploads__issued-new'),
      ],
      'POST /auth/refresh': json(200, {
        accessToken: 'access-2',
        expiresIn: 900,
        refreshToken: 'refresh-2',
        refreshTokenExpiresIn: 2_592_000,
      }),
    });
    h.preparation.start(input());
    await h.preparation.ready();
    h.monotonic.advance(300_000);
    const prepared = await h.preparation.ready();
    expect(prepared.policy.uploadId).toBe(UPLOAD_ID_2);
    expect(countOf(h, 'POST /auth/refresh')).toBe(1);
    expect(h.router.calls(POLICY).at(-1)?.headers.Authorization).toBe('Bearer access-2');
  });
});

describe('UploadPreparation - 정리', () => {
  it('TC-UPL-031 cancel은 진행 중 작업을 취소하고 파일을 지운다', async () => {
    const h = await setup();
    const hold = h.engine.holdNext('encodeWebp');
    h.preparation.start(input());
    await flush();
    const signal = h.engine.callsOf('encodeWebp')[0].signal;

    h.preparation.cancel();
    expect(signal?.aborted).toBe(true);
    hold.release();
    await flush();
    expect(h.files.existing).toEqual([]);
    expect(phase(h)).toBe('idle');
    await expect(h.preparation.ready()).rejects.toBeInstanceOf(Error);
  });

  it('TC-UPL-031 완료된 뒤 cancel하면 소유한 WebP 임시 파일을 지운다', async () => {
    const h = await setup();
    h.preparation.start(input());
    const { file } = await h.preparation.ready();
    h.preparation.cancel();
    expect(h.files.deleted).toContain(file.uri);
    expect(h.files.existing).toEqual([]);
  });

  it('TC-UPL-031 dispose도 진행 중 작업을 취소하고 파일을 남기지 않는다', async () => {
    const h = await setup();
    const hold = h.engine.holdNext('encodeWebp');
    h.preparation.start(input());
    await flush();
    h.preparation.dispose();
    hold.release();
    await flush();
    expect(h.files.existing).toEqual([]);
  });

  it('D-20 ready()를 기다리는 중 signal이 취소되면 CancelledError이고 준비 자체는 계속된다', async () => {
    // [가정: ready(signal)의 취소는 기다림만 끝내고 준비 작업은 취소하지 않는다]
    const h = await setup();
    const hold = h.engine.holdNext('encodeWebp');
    h.preparation.start(input());
    const controller = new AbortController();
    const waiting = h.preparation.ready(controller.signal).catch((e: unknown) => e);
    await flush();
    controller.abort();
    expect(await waiting).toBeInstanceOf(CancelledError);
    hold.release();
    await expect(h.preparation.ready()).resolves.toBeDefined();
  });
});
