import { FULL_CROP, IDENTITY_EDIT } from './editModel';
import type { PhotoEdit } from './editModel';
import { PrepareError } from './PhotoPreparer';
import type { PreparedUpload } from './PhotoPreparer';
import { deferred } from '../../test/deferred';
import { networkFailure } from '../../test/fakeFetch';
import { loadFixture } from '../../test/fixtures';
import { imageFile } from '../../test/FakeImageDecoder';
import type { RouteValue } from '../../test/fixtureRouter';
import { createUploadHarness, POLICY, REFRESH, UPLOAD_ID, UPLOAD_ID_NEW, UPLOAD_ID_SMALL, settleMore, sequence, submitSequence } from '../../test/uploadHarness';
import type { UploadHarness } from '../../test/uploadHarness';
import { finish } from '../../test/homeHarness';
import { track } from '../../test/track';

const EDITED: PhotoEdit = { ...IDENTITY_EDIT, crop: { centerX: 0.4, centerY: 0.4, width: 0.5, height: 0.5 } };
const SECOND_POLICY = ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'];

function setup(routes: Record<string, RouteValue> = {}) {
  const h = createUploadHarness({ routes });
  const signal = new AbortController().signal;
  const prepare = (photo: Blob = imageFile(), edit: PhotoEdit = IDENTITY_EDIT) => h.preparer.prepare({ photo, edit }, signal);
  return { h, signal, prepare };
}

async function failureOf(promise: Promise<unknown>, h: UploadHarness): Promise<unknown> {
  const result = track(promise);
  for (let i = 0; i < 60 && result.state === 'pending'; i += 1) {
    await settleMore();
    await h.clock.advance(500);
  }
  expect(result.state).toBe('rejected');
  return result.error;
}

describe('PhotoPreparer.inspect (사진 선택 직후 확인)', () => {
  it('TC-UPL-014 읽을 수 있는 사진이면 보이는 방향의 크기를 돌려주고 디코드한 이미지를 곧바로 놓는다', async () => {
    const { h, signal } = setup();
    const size = await h.preparer.inspect(imageFile({ width: 3000, height: 4000 }), signal);
    expect(size).toEqual({ width: 3000, height: 4000 });
    expect(h.decoder.images).toHaveLength(1);
    expect(h.decoder.images[0]!.releases).toBe(1);
  });

  it('TC-UPL-047 긴 변이 4096을 넘는 원본은 4096으로 줄여 읽고(비율 유지) 작은 사진은 확대하지 않는다', async () => {
    const { h, signal } = setup();
    expect(await h.preparer.inspect(imageFile({ width: 8000, height: 6000 }), signal)).toEqual({ width: 4096, height: 3072 });
    expect(h.decoder.calls[0]!.maxLongEdge).toBe(4096);
    expect(await h.preparer.inspect(imageFile({ width: 800, height: 600 }), signal)).toEqual({ width: 800, height: 600 });
  });

  it('TC-UPL-028 inspect는 네트워크 요청을 하지 않는다', async () => {
    const { h, signal } = setup();
    await h.preparer.inspect(imageFile(), signal);
    expect(h.ff.calls).toHaveLength(0);
  });

  it.each([
    ['0바이트 사진', { bytes: 0 }],
    ['손상된 사진', { corrupt: true }],
  ])('TC-UPL-020 %s 은 PrepareError(prepare)다', async (_name, options) => {
    const { h, signal } = setup();
    await expect(h.preparer.inspect(imageFile(options), signal)).rejects.toMatchObject({ name: 'PrepareError', kind: 'prepare' });
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-UPL-049 취소하면 AbortError로 거절하고 디코드한 이미지가 남아 있지 않다', async () => {
    const { h } = setup();
    const photo = imageFile();
    const gate = h.decoder.hold(photo);
    const controller = new AbortController();
    const result = track(h.preparer.inspect(photo, controller.signal));
    await settleMore();
    controller.abort();
    gate.resolve();
    await settleMore();
    expect(result.state).toBe('rejected');
    expect((result.error as Error).name).toBe('AbortError');
    expect(h.decoder.images.every((image) => image.released)).toBe(true);
  });
});

describe('PhotoPreparer.prepare (정책 발급 + 인코딩, S3 PUT 없음)', () => {
  it('TC-UPL-023 POST /posts/uploads를 한 번 부르고 인코딩하되 S3 PUT·게시물 생성은 하지 않는다', async () => {
    const { h, prepare } = setup();
    await finish(h, prepare());
    expect(sequence(h)).toEqual([POLICY]);
    expect(submitSequence(h)).toEqual([POLICY]);
    expect(h.compressor.compressCount).toBeGreaterThan(0);
  });

  it('TC-UPL-025 정책 발급이 디코드·인코딩보다 먼저다(정책을 받기 전에는 이미지를 읽지 않는다)', async () => {
    const { h, prepare } = setup();
    // 정책 응답을 잡아 두고 그동안 디코드·압축이 시작되지 않음을 본다.
    const gate = deferred<Response>();
    h.router.set(POLICY, () => gate.promise);
    const result = track(prepare());
    await settleMore();
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
    expect(h.decoder.decodeCount).toBe(0);
    expect(h.compressor.compressCount).toBe(0);
    expect(result.state).toBe('pending');
    gate.resolve(loadFixture('upload/posts-uploads__issued.json').toResponse());
    await settleMore();
    expect(result.state).toBe('fulfilled');
  });

  it('TC-UPL-024 TC-UPL-045 결과는 정책과 maxBytes 이하의 image/webp, 그린 크기를 담는다', async () => {
    const { h, prepare } = setup();
    const prepared = await finish(h, prepare(imageFile({ width: 4000, height: 3000 })));
    expect(prepared.policy).toMatchObject({ uploadId: UPLOAD_ID, contentType: 'image/webp', maxBytes: 5_242_880 });
    expect(prepared.file.type).toBe('image/webp');
    expect(prepared.file.size).toBeLessThanOrEqual(5_242_880);
    expect(prepared.size).toEqual({ width: 4000, height: 3000 });
    expect(prepared.deadline.isExpired()).toBe(false);
  });

  it('TC-UPL-047 긴 변이 4096을 넘으면 4096으로 줄인 크기로 인코딩한다', async () => {
    const { h, prepare } = setup();
    const prepared = await finish(h, prepare(imageFile({ width: 8000, height: 6000 })));
    expect(prepared.size).toEqual({ width: 4096, height: 3072 });
    expect(h.compressor.calls[0]).toMatchObject({ width: 4096, height: 3072, quality: 90 });
  });

  it('TC-UPL-032 TC-UPL-037 정책 maxBytes가 작으면 품질 사다리로 맞춘다(maxBytes 1,000,000)', async () => {
    const { h, prepare } = setup({ [POLICY]: 'upload/posts-uploads__issued-small-max' });
    h.compressor.bytesFor = (call) => (call.quality >= 80 ? 1_200_000 : 900_000);
    const prepared = await finish(h, prepare());
    expect(prepared.policy.uploadId).toBe(UPLOAD_ID_SMALL);
    expect(prepared.file.size).toBe(900_000);
    expect(h.compressor.attempts().map(([, , q]) => q)).toEqual([90, 80, 60]);
  });

  it('TC-UPL-038 정확히 maxBytes인 결과는 허용한다', async () => {
    const { h, prepare } = setup({ [POLICY]: 'upload/posts-uploads__issued-small-max' });
    h.compressor.bytesFor = () => 1_000_000;
    const prepared = await finish(h, prepare());
    expect(prepared.file.size).toBe(1_000_000);
    expect(h.compressor.compressCount).toBe(1);
  });

  it('TC-UPL-039 maxBytes가 32비트를 넘는 정책에서도 한 번에 통과한다', async () => {
    const { h, prepare } = setup({ [POLICY]: 'upload/posts-uploads__issued-large-max' });
    h.compressor.bytesFor = () => 6_000_000;
    const prepared = await finish(h, prepare());
    expect(prepared.policy.maxBytes).toBe(5_000_000_000);
    expect(prepared.file.size).toBe(6_000_000);
  });

  it('TC-UPL-045 편집하지 않은 사진은 renderer를 부르지 않고 디코드한 이미지를 그대로 압축한다', async () => {
    const { h, prepare } = setup();
    await finish(h, prepare(imageFile(), IDENTITY_EDIT));
    expect(h.renderer.calls).toHaveLength(0);
    expect(h.compressor.calls[0]!.image).toBe(h.decoder.images[0]);
  });

  it('TC-UPL-045 편집값이 있으면 renderer가 만든 이미지를 압축하고 원본 디코드 이미지·편집 결과 모두 놓는다', async () => {
    const { h, prepare } = setup();
    await finish(h, prepare(imageFile(), EDITED));
    expect(h.renderer.calls).toHaveLength(1);
    expect(h.renderer.calls[0]!.edit).toEqual(EDITED);
    expect(h.renderer.calls[0]!.image).toBe(h.decoder.images[0]);
    expect(h.compressor.calls[0]!.image).toBe(h.renderer.outputs[0]);
    expect(h.decoder.images[0]!.releases).toBe(1);
    expect(h.renderer.outputs[0]!.releases).toBe(1);
  });

  it('TC-UPL-045 FULL_CROP만 있는 편집값도 식별 편집으로 보아 renderer를 부르지 않는다', async () => {
    const { h, prepare } = setup();
    await finish(h, prepare(imageFile(), { ...IDENTITY_EDIT, crop: FULL_CROP }));
    expect(h.renderer.calls).toHaveLength(0);
  });

  it('TC-UPL-050 성공해도 디코드한 이미지는 release된다', async () => {
    const { h, prepare } = setup();
    await finish(h, prepare());
    expect(h.decoder.images).toHaveLength(1);
    expect(h.decoder.images[0]!.releases).toBe(1);
  });

  it('TC-UPL-051 deadline은 정책 응답 시각부터 센다: 인코딩에 100초가 걸려도 정책 수명(300초)은 그 100초가 지난 상태다', async () => {
    const { h, prepare } = setup();
    h.compressor.durationMs = 100_000;
    const result = track(prepare());
    await settleMore();
    await h.clock.advance(100_000);
    await settleMore();
    expect(result.state).toBe('fulfilled');
    const { deadline } = result.value as PreparedUpload;
    await h.clock.advance(194_999);
    expect(deadline.isExpired()).toBe(false);
    await h.clock.advance(1);
    expect(deadline.isExpired()).toBe(true);
  });
});

describe('PhotoPreparer.prepare 실패 분류', () => {
  it('TC-UPL-027 연결 실패는 재시도(0.5초, 1초) 뒤에도 안 되면 network다', async () => {
    const { h, prepare } = setup({ [POLICY]: networkFailure });
    const error = await failureOf(prepare(), h);
    expect(error).toBeInstanceOf(PrepareError);
    expect((error as PrepareError).kind).toBe('network');
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(3);
    expect(h.decoder.decodeCount).toBe(0);
  });

  it('TC-UPL-027 403은 forbidden이고 재요청하지 않는다', async () => {
    const { h, prepare } = setup({ [POLICY]: 'upload/posts-uploads__403-banned' });
    const error = await failureOf(prepare(), h);
    expect((error as PrepareError).kind).toBe('forbidden');
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
  });

  it('TC-UPL-027 401을 갱신해도 안 되면(재인증 필요) unauthorized다', async () => {
    const { h, prepare } = setup({ [POLICY]: 'upload/posts-uploads__401-unauthorized', [REFRESH]: 'auth/refresh__reauthentication-required' });
    const error = await failureOf(prepare(), h);
    expect((error as PrepareError).kind).toBe('unauthorized');
  });

  it('TC-UPL-027 500은 재시도 뒤에도 실패하면 prepare다', async () => {
    const { h, prepare } = setup({ [POLICY]: 'upload/posts-uploads__500-server-error' });
    const error = await failureOf(prepare(), h);
    expect((error as PrepareError).kind).toBe('prepare');
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(3);
  });

  it('TC-UPL-026 필수 필드가 빠진 정책은 prepare이고 디코드·인코딩하지 않는다', async () => {
    const { h, prepare } = setup({ [POLICY]: 'upload/posts-uploads__missing-fields' });
    const error = await failureOf(prepare(), h);
    expect((error as PrepareError).kind).toBe('prepare');
    expect(h.compressor.compressCount).toBe(0);
  });

  it('TC-UPL-032 정책 contentType이 image/webp가 아니면(image/png) 디코드·인코딩 없이 prepare다', async () => {
    const { h, prepare } = setup({ [POLICY]: 'upload/posts-uploads__content-type-png' });
    const error = await failureOf(prepare(), h);
    expect((error as PrepareError).kind).toBe('prepare');
    expect(h.decoder.decodeCount).toBe(0);
    expect(h.compressor.compressCount).toBe(0);
  });

  it('TC-UPL-020 손상된 사진은 prepare이고 이미지가 남지 않는다', async () => {
    const { h, prepare } = setup();
    const error = await failureOf(prepare(imageFile({ corrupt: true })), h);
    expect((error as PrepareError).kind).toBe('prepare');
    expect(h.compressor.compressCount).toBe(0);
  });

  it('TC-UPL-042 16번을 모두 초과하면 prepare이고 디코드한 이미지는 놓는다', async () => {
    const { h, prepare } = setup();
    h.compressor.bytesFor = () => 6_000_000;
    const error = await failureOf(prepare(), h);
    expect((error as PrepareError).kind).toBe('prepare');
    expect(h.compressor.compressCount).toBe(16);
    expect(h.decoder.images.every((image) => image.released)).toBe(true);
  });

  it('TC-UPL-032 WebP 인코더가 없으면 PNG로 바꾸지 않고 prepare다', async () => {
    const { h, prepare } = setup();
    h.compressor.mode = 'unsupported';
    const error = await failureOf(prepare(), h);
    expect((error as PrepareError).kind).toBe('prepare');
    expect(h.compressor.compressCount).toBe(1);
  });

  it('TC-UPL-033 압축기가 PNG를 돌려주면 다음 품질로 넘어가지 않고 prepare다', async () => {
    const { h, prepare } = setup();
    h.compressor.mode = 'png';
    const error = await failureOf(prepare(), h);
    expect((error as PrepareError).kind).toBe('prepare');
    expect(h.compressor.compressCount).toBe(1);
    expect(h.decoder.images.every((image) => image.released)).toBe(true);
  });

  it('TC-UPL-043 편집 렌더링이 실패해도 prepare이고 디코드한 이미지는 놓는다', async () => {
    const { h, prepare } = setup();
    h.renderer.fail = new Error('render failed');
    const error = await failureOf(prepare(imageFile(), EDITED), h);
    expect((error as PrepareError).kind).toBe('prepare');
    expect(h.compressor.compressCount).toBe(0);
    expect(h.decoder.images.every((image) => image.released)).toBe(true);
  });

  it('TC-UPL-049 취소하면 AbortError(PrepareError가 아님)로 거절하고 이미지를 놓으며 더 압축하지 않는다', async () => {
    const { h } = setup();
    const controller = new AbortController();
    const gate = h.compressor.hold();
    const result = track(h.preparer.prepare({ photo: imageFile(), edit: IDENTITY_EDIT }, controller.signal));
    await settleMore();
    expect(h.compressor.compressCount).toBe(1);
    controller.abort();
    gate.resolve();
    await settleMore();
    expect(result.state).toBe('rejected');
    expect((result.error as Error).name).toBe('AbortError');
    expect(result.error).not.toBeInstanceOf(PrepareError);
    expect(h.compressor.compressCount).toBe(1);
    expect(h.decoder.images.every((image) => image.released)).toBe(true);
  });

  it('TC-UPL-049 정책 발급 중 취소하면 AbortError다', async () => {
    const { h } = setup();
    const controller = new AbortController();
    const gate = deferred<Response>();
    h.router.set(POLICY, () => gate.promise);
    const result = track(h.preparer.prepare({ photo: imageFile(), edit: IDENTITY_EDIT }, controller.signal));
    await settleMore();
    controller.abort();
    await settleMore();
    expect(result.state).toBe('rejected');
    expect((result.error as Error).name).toBe('AbortError');
    expect(h.decoder.decodeCount).toBe(0);
  });
});

describe('PhotoPreparer.ensureFresh (제출 직전 정책 수명 확인)', () => {
  async function prepared(h: UploadHarness, photo = imageFile()) {
    const input = { photo, edit: IDENTITY_EDIT };
    const value = await finish(h, h.preparer.prepare(input, new AbortController().signal));
    return { value, input };
  }
  const fresh = (h: UploadHarness, p: PreparedUpload, input: { photo: Blob; edit: PhotoEdit }) => h.preparer.ensureFresh(p, input, new AbortController().signal);

  it('TC-UPL-041 발급 후 5분 안(294.999초)이면 같은 준비물을 그대로 돌려주고 요청하지 않는다', async () => {
    const { h } = setup({ [POLICY]: SECOND_POLICY });
    const { value, input } = await prepared(h);
    await h.clock.advance(294_999);
    const before = h.ff.calls.length;
    const result = await finish(h, fresh(h, value, input));
    expect(result).toBe(value);
    expect(h.ff.calls.length).toBe(before);
  });

  it('TC-UPL-041 TC-UPL-052 정확히 295초(300초 - 5초)면 만료로 보고 새 정책(새 uploadId)을 발급한다', async () => {
    const { h } = setup({ [POLICY]: SECOND_POLICY });
    const { value, input } = await prepared(h);
    await h.clock.advance(295_000);
    const result = await finish(h, fresh(h, value, input));
    expect(result.policy.uploadId).toBe(UPLOAD_ID_NEW);
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(2);
    expect(result.deadline.isExpired()).toBe(false);
  });

  it('TC-UPL-041 기기 시각(벽시계)을 앞당겨도 단조 시계 기준이라 만료되지 않는다', async () => {
    const { h } = setup({ [POLICY]: SECOND_POLICY });
    const { value, input } = await prepared(h);
    h.clock.setWallClock(h.clock.nowMs() + 3_600_000);
    expect(await finish(h, fresh(h, value, input))).toBe(value);
  });

  it('TC-UPL-042 새 maxBytes가 파일 이상이면 파일을 다시 만들지 않고 재사용한다(새 정책의 uploadId·deadline만 바뀐다)', async () => {
    const { h } = setup({ [POLICY]: SECOND_POLICY });
    const { value, input } = await prepared(h);
    const decodes = h.decoder.decodeCount;
    const compresses = h.compressor.compressCount;
    await h.clock.advance(295_000);
    const result = await finish(h, fresh(h, value, input));
    expect(result.file).toBe(value.file);
    expect(result.size).toEqual(value.size);
    expect(h.decoder.decodeCount).toBe(decodes);
    expect(h.compressor.compressCount).toBe(compresses);
  });

  it('TC-UPL-042 새 maxBytes가 파일보다 작으면 원본·편집값으로 디코드 → 인코딩을 다시 한다', async () => {
    const { h } = setup({ [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-small-max'] });
    h.compressor.bytesFor = (_call, index) => (index === 0 ? 2_000_000 : 900_000);
    const photo = imageFile();
    const { value } = await prepared(h, photo);
    expect(value.file.size).toBe(2_000_000);
    const decodes = h.decoder.decodeCount;
    await h.clock.advance(295_000);
    const result = await finish(h, fresh(h, value, { photo, edit: EDITED }));
    expect(h.decoder.decodeCount).toBe(decodes + 1);
    expect(h.decoder.calls.at(-1)!.source).toBe(photo);
    expect(h.renderer.calls.at(-1)!.edit).toEqual(EDITED);
    expect(result.policy.uploadId).toBe(UPLOAD_ID_SMALL);
    expect(result.file.size).toBe(900_000);
    expect(result.file).not.toBe(value.file);
    expect(h.decoder.images.every((image) => image.released)).toBe(true);
  });

  it('TC-UPL-041 새 정책의 contentType이 image/webp가 아니면 prepare다', async () => {
    const { h } = setup({ [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__content-type-png'] });
    const { value, input } = await prepared(h);
    await h.clock.advance(295_000);
    const error = await failureOf(fresh(h, value, input), h);
    expect((error as PrepareError).kind).toBe('prepare');
  });

  it('TC-UPL-041 새 정책 발급이 403이면 forbidden이다', async () => {
    const { h } = setup({ [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__403-banned'] });
    const { value, input } = await prepared(h);
    await h.clock.advance(295_000);
    const error = await failureOf(fresh(h, value, input), h);
    expect((error as PrepareError).kind).toBe('forbidden');
  });
});
