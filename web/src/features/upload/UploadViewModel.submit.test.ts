import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { emptyResponse } from '../../test/fakeFetch';
import { imageFile } from '../../test/FakeImageDecoder';
import { NOW, loadFixture, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import {
  CREATE,
  POLICY,
  POST_ID,
  REFRESH,
  TOPIC_ID,
  UPLOAD_ID,
  UPLOAD_ID_NEW,
  UPLOAD_ID_SMALL,
  createBody,
  createUploadHarness,
  openUpload,
  pickPhoto,
  prepareReady,
  putKey,
  requireFreshToken,
  settleMore,
  submitSequence,
} from '../../test/uploadHarness';
import type { UploadHarness } from '../../test/uploadHarness';
import { FULL_CROP, IDENTITY_EDIT } from './editModel';

const SECOND_POLICY = ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'];

/** submit()을 시작하고 대기 중인 체인을 비운다. 시계는 움직이지 않는다. */
async function submit(h: UploadHarness) {
  const result = track(h.vm.submit());
  await settleMore();
  return result;
}

const puts = (h: UploadHarness, uploadId = UPLOAD_ID) => h.ff.callsTo(`PUT /__upload/${uploadId}`);
const allPuts = (h: UploadHarness) => h.ff.calls.filter((c) => c.method === 'PUT');

describe('UploadViewModel 제출 흐름 (REQ-UPL-039~045, §3.1)', () => {
  it('TC-UPL-048 TC-UPL-059 준비가 끝나 있으면 정책(준비 때) → PUT → POST /posts 순서로 한 번씩 보내고 성공한다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    const result = await submit(h);
    expect(result.value).toEqual({ kind: 'success' });
    expect(submitSequence(h)).toEqual([POLICY, `PUT /__upload/${UPLOAD_ID}`, CREATE]);
    expect(createBody(h)).toEqual({ topicId: TOPIC_ID, photoUploadId: UPLOAD_ID, title: null });
  });

  it('TC-UPL-048 준비 중에 누르면 "전시 중..." 상태로 준비가 끝나길 기다렸다가 자동으로 PUT·POST를 진행한다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    const gate = h.compressor.hold();
    await pickPhoto(h);
    await settleMore();
    expect(h.vm.state.preparation).toBe('preparing');
    const result = await submit(h);
    expect(result.state).toBe('pending');
    expect(h.vm.state.submitting).toBe(true);
    expect(allPuts(h)).toHaveLength(0);
    expect(h.ff.callsTo('POST /posts')).toHaveLength(0);
    gate.resolve();
    await settleMore();
    expect(result.value).toEqual({ kind: 'success' });
    expect(submitSequence(h)).toEqual([POLICY, `PUT /__upload/${UPLOAD_ID}`, CREATE]);
    expect(h.compressor.compressCount).toBe(1);
  });

  it('TC-UPL-048 제출을 시작하면 이전 실패 문구를 지운다', async () => {
    const h = createUploadHarness({ routes: { [CREATE]: ['upload/posts-create__500-server-error', 'upload/posts-create__201-pending'] } });
    await prepareReady(h);
    await submit(h);
    expect(h.vm.state.errorMessage).toBe(t('upload.error.create'));
    const gate = deferred<Response>();
    h.router.set(CREATE, () => gate.promise);
    const second = await submit(h);
    expect(second.state).toBe('pending');
    expect(h.vm.state.errorMessage).toBeNull();
    gate.resolve(loadFixture('upload/posts-create__201-pending.json').toResponse());
    await settleMore();
    expect(second.value).toEqual({ kind: 'success' });
  });

  it('TC-UPL-054 PUT은 Authorization 없이 정책 Content-Type만 보내고 본문은 인코딩한 WebP 그대로다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    await submit(h);
    const call = puts(h)[0]!;
    expect(call.method).toBe('PUT');
    expect(call.url).toBe(`http://localhost:4010/__upload/${UPLOAD_ID}?X-Amz-Expires=300`);
    expect(Object.keys(call.headers)).toEqual(['content-type']);
    expect(call.headers['content-type']).toBe('image/webp');
    expect(call.body).toBe(h.compressor.results[h.compressor.results.length - 1]);
    expect((call.body as Blob).type).toBe('image/webp');
  });

  it('TC-UPL-059 POST /posts 본문은 {topicId, photoUploadId, title}이고 Authorization이 붙는다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    h.vm.setTitle(' 하늘 ');
    await submit(h);
    expect(createBody(h)).toEqual({ topicId: TOPIC_ID, photoUploadId: UPLOAD_ID, title: '하늘' });
    expect(h.ff.callsTo(CREATE)[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it.each([
    ['PENDING', 'upload/posts-create__201-pending'],
    ['VALIDATING', 'upload/posts-create__201-validating'],
  ] as const)('TC-UPL-060 201 %s이면 결과를 담고 created 변경을 알리며 success다', async (status, fixture) => {
    const h = createUploadHarness({ routes: { [CREATE]: fixture } });
    await prepareReady(h);
    const result = await submit(h);
    expect(result.value).toEqual({ kind: 'success' });
    expect(h.results.get()).toMatchObject({ topicDate: '2026-10-27', topicTitle: '가을 하늘', moderationStatus: status });
    expect(h.results.get()?.photo).toBeInstanceOf(Blob);
    expect(h.published).toEqual([{ type: 'created', postId: POST_ID, topicDate: '2026-10-27', moderationStatus: status }]);
  });
});

describe('UploadViewModel 정책 수명 (REQ-UPL-041~042, 단조 시계)', () => {
  it('TC-UPL-049 발급 후 294.999초에 제출하면 기존 정책(uploadId)으로 PUT한다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY } });
    await prepareReady(h);
    await h.clock.advance(294_999);
    await submit(h);
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
    expect(puts(h)).toHaveLength(1);
    expect(createBody(h).photoUploadId).toBe(UPLOAD_ID);
  });

  it.each([295_000, 299_000, 301_000])('TC-UPL-050 발급 후 %i ms에 제출하면 새 정책을 받아 PUT과 POST /posts에 새 uploadId를 쓴다', async (elapsed) => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY } });
    await prepareReady(h);
    await h.clock.advance(elapsed);
    const result = await submit(h);
    expect(result.value).toEqual({ kind: 'success' });
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(2);
    expect(puts(h, UPLOAD_ID)).toHaveLength(0);
    expect(puts(h, UPLOAD_ID_NEW)).toHaveLength(1);
    expect(createBody(h).photoUploadId).toBe(UPLOAD_ID_NEW);
  });

  it('TC-UPL-051 기기 벽시계를 +10분 바꿔도 실제 경과 100초면 기존 정책을 쓴다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY } });
    await prepareReady(h);
    await h.clock.advance(100_000);
    h.clock.setWallClock(h.clock.nowMs() + 600_000);
    await submit(h);
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
    expect(createBody(h).photoUploadId).toBe(UPLOAD_ID);
  });

  it('TC-UPL-051 기기 벽시계를 -10분 바꿔도 실제 경과 296초면 새 정책이다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY } });
    await prepareReady(h);
    await h.clock.advance(296_000);
    h.clock.setWallClock(h.clock.nowMs() - 600_000);
    await submit(h);
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(2);
    expect(createBody(h).photoUploadId).toBe(UPLOAD_ID_NEW);
  });

  it('TC-UPL-052 재발급 정책의 maxBytes가 기존 파일 이상이면 준비한 파일을 그대로 새 uploadId로 PUT한다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY } });
    await prepareReady(h);
    const decodes = h.decoder.decodeCount;
    await h.clock.advance(295_000);
    await submit(h);
    expect(h.compressor.compressCount).toBe(1);
    expect(h.decoder.decodeCount).toBe(decodes);
    expect(puts(h, UPLOAD_ID_NEW)[0]!.body).toBe(h.compressor.results[0]);
  });

  it('TC-UPL-052 새 maxBytes가 더 작아 파일이 초과하면 저장한 편집값을 다시 적용해 원본에서 재인코딩한다', async () => {
    const h = createUploadHarness({ editorEnabled: true, routes: { [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-small-max'] } });
    h.compressor.bytesFor = (_call, index) => (index === 0 ? 2_000_000 : 900_000);
    const edit = { ...IDENTITY_EDIT, crop: { ...FULL_CROP, width: 0.5, height: 0.5 } };
    await openUpload(h);
    const photo = await pickPhoto(h);
    h.vm.confirmEdit(edit);
    await settleMore();
    expect(h.vm.state.preparation).toBe('ready');
    await h.clock.advance(295_000);
    const result = await submit(h);
    expect(result.value).toEqual({ kind: 'success' });
    expect(h.compressor.compressCount).toBe(2);
    expect(h.decoder.calls.at(-1)!.source).toBe(photo);
    expect(h.renderer.calls).toHaveLength(2);
    expect(h.renderer.calls[1]!.edit).toEqual(edit);
    const put = puts(h, UPLOAD_ID_SMALL)[0]!;
    expect((put.body as Blob).size).toBe(900_000);
    expect(createBody(h).photoUploadId).toBe(UPLOAD_ID_SMALL);
  });

  it('TC-UPL-053 재발급 정책의 contentType이 image/webp가 아니면 업로드하지 않고 준비 실패 문구를 보인다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__content-type-png'] } });
    await prepareReady(h);
    await h.clock.advance(295_000);
    const result = await submit(h);
    expect(result.value).toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(t('upload.error.prepare'));
    expect(allPuts(h)).toHaveLength(0);
    expect(h.ff.callsTo('POST /posts')).toHaveLength(0);
    expect(h.vm.state.photo).not.toBeNull();
    expect(h.vm.state.submitting).toBe(false);
  });

  it('TC-UPL-076 정책 발급 후 5분이 지나 액세스 토큰이 만료되면 새 정책은 갱신 뒤에 받고 PUT에는 Authorization이 없다', async () => {
    const h = createUploadHarness({
      session: memberSession({ accessTokenExpiresAt: NOW + 200_000 }),
      routes: {
        [POLICY]: (req, index) => (index === 0 ? loadFixture('upload/posts-uploads__issued.json').toResponse() : requireFreshToken('upload/posts-uploads__issued-new')(req, index)),
        [REFRESH]: 'auth/refresh__success',
      },
    });
    await prepareReady(h);
    await h.clock.advance(295_000);
    const result = await submit(h);
    expect(result.value).toEqual({ kind: 'success' });
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    const policyCalls = h.ff.callsTo('POST /posts/uploads');
    expect(policyCalls.at(-1)!.headers['authorization']).toBe('Bearer fixture-access-token-2');
    expect(puts(h, UPLOAD_ID_NEW)[0]!.headers['authorization']).toBeUndefined();
    expect(createBody(h).photoUploadId).toBe(UPLOAD_ID_NEW);
  });

  it('TC-UPL-076 POST /posts가 401이면 refresh 뒤 1회 재전송해 성공한다', async () => {
    const h = createUploadHarness({
      routes: { [CREATE]: ['upload/posts-create__401-unauthorized', 'upload/posts-create__201-pending'], [REFRESH]: 'auth/refresh__success' },
    });
    await prepareReady(h);
    const result = await submit(h);
    expect(result.value).toEqual({ kind: 'success' });
    expect(h.ff.callsTo(CREATE)).toHaveLength(2);
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(h.ff.callsTo(CREATE)[1]!.headers['authorization']).toBe('Bearer fixture-access-token-2');
  });
});

describe('UploadViewModel PUT 전 검증 (REQ-UPL-043~044)', () => {
  it('TC-UPL-056 업로드 URL이 안전하지 않으면(http, 허용되지 않은 호스트) PUT을 보내지 않고 업로드 실패 문구를 보인다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: 'upload/posts-uploads__insecure-upload-url' } });
    const photo = await prepareReady(h);
    const result = await submit(h);
    expect(result.value).toEqual({ kind: 'stay' });
    expect(allPuts(h)).toHaveLength(0);
    expect(h.ff.callsTo('POST /posts')).toHaveLength(0);
    expect(h.vm.state.errorMessage).toBe(t('upload.error.upload'));
    expect(h.vm.state.photo?.source).toBe(photo);
    expect(h.vm.state.submitting).toBe(false);
  });

  it('TC-UPL-057 PUT 응답이 61초 걸리면 60초 타임아웃으로 업로드 실패 처리되고 POST /posts는 보내지 않는다', async () => {
    const h = createUploadHarness({
      routes: {
        [putKey(UPLOAD_ID)]: async () => {
          await h.clock.sleep(61_000);
          return emptyResponse(200);
        },
      },
    });
    await prepareReady(h);
    const result = await submit(h);
    await h.clock.advance(59_999);
    await settleMore();
    expect(result.state).toBe('pending');
    expect(h.vm.state.submitting).toBe(true);
    await h.clock.advance(200_000);
    await settleMore();
    expect(result.value).toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(t('upload.error.network'));
    expect(h.ff.callsTo('POST /posts')).toHaveLength(0);
    expect(h.vm.state.submitting).toBe(false);
  });

  it('TC-UPL-058 인코딩 결과가 정책 maxBytes 이하일 때만 PUT한다(정확히 maxBytes는 허용)', async () => {
    const h = createUploadHarness();
    h.compressor.bytesFor = () => 5_242_880;
    await prepareReady(h);
    const result = await submit(h);
    expect(result.value).toEqual({ kind: 'success' });
    expect((puts(h)[0]!.body as Blob).size).toBe(5_242_880);
  });

  it('TC-UPL-058 maxBytes를 넘는 결과는 PUT 전에 막고 준비 실패 문구를 보인다', async () => {
    const h = createUploadHarness();
    h.compressor.bytesFor = () => 5_242_881;
    await prepareReady(h);
    expect(h.vm.state.preparation).toBe('failed');
    const result = await submit(h);
    expect(result.value).toEqual({ kind: 'stay' });
    expect(h.vm.state.errorMessage).toBe(t('upload.error.prepare'));
    expect(allPuts(h)).toHaveLength(0);
    expect(h.ff.callsTo('POST /posts')).toHaveLength(0);
  });
});

describe('UploadViewModel 중복 제출·잠금·이탈 (REQ-UPL-038, 044)', () => {
  it('TC-UPL-073 제출 중 연타해도 PUT·POST /posts는 각 1회이고 나머지는 stay다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    const gate = deferred<Response>();
    h.router.set(putKey(UPLOAD_ID), () => gate.promise);
    const first = track(h.vm.submit());
    const second = track(h.vm.submit());
    const third = track(h.vm.submit());
    await settleMore();
    expect(second.value).toEqual({ kind: 'stay' });
    expect(third.value).toEqual({ kind: 'stay' });
    expect(allPuts(h)).toHaveLength(1);
    gate.resolve(emptyResponse(200));
    await settleMore();
    expect(first.value).toEqual({ kind: 'success' });
    expect(h.ff.callsTo('POST /posts')).toHaveLength(1);
  });

  it('TC-UPL-073 완료 뒤의 반복 탭은 요청을 만들지 않는다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    await submit(h);
    const before = h.ff.calls.length;
    await submit(h);
    await submit(h);
    expect(h.ff.calls).toHaveLength(before);
    expect(h.published).toHaveLength(1);
  });

  it('TC-UPL-073 준비를 기다리는 동안의 연타도 준비·PUT·POST를 한 번씩만 만든다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    const gate = h.compressor.hold();
    await pickPhoto(h);
    await settleMore();
    await submit(h);
    await submit(h);
    gate.resolve();
    await settleMore();
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
    expect(allPuts(h)).toHaveLength(1);
    expect(h.ff.callsTo('POST /posts')).toHaveLength(1);
  });

  it('TC-UPL-048 제출 중에는 사진 선택과 제목 입력을 무시한다', async () => {
    const h = createUploadHarness();
    const photo = await prepareReady(h);
    h.vm.setTitle('하늘');
    const gate = deferred<Response>();
    h.router.set(putKey(UPLOAD_ID), () => gate.promise);
    track(h.vm.submit());
    await settleMore();
    expect(h.vm.state.submitting).toBe(true);
    expect(h.vm.state.canSubmit).toBe(false);
    const decodes = h.decoder.decodeCount;
    await h.vm.selectPhoto(imageFile({ name: 'other.jpg' }));
    h.vm.setTitle('바꿈');
    await settleMore();
    expect(h.vm.state.photo?.source).toBe(photo);
    expect(h.vm.state.title).toBe('하늘');
    expect(h.decoder.decodeCount).toBe(decodes);
    gate.resolve(emptyResponse(200));
    await settleMore();
  });

  it('TC-UPL-079 PUT 중에 화면을 떠나면(dispose) PUT을 취소하고 POST /posts 없이 cancelled이며 결과도 변경 알림도 없다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    const gate = deferred<Response>();
    h.router.set(putKey(UPLOAD_ID), () => gate.promise);
    const result = track(h.vm.submit());
    await settleMore();
    const signal = puts(h)[0]!.signal;
    h.vm.dispose();
    expect(signal?.aborted).toBe(true);
    gate.resolve(emptyResponse(200));
    await settleMore();
    expect(result.value).toEqual({ kind: 'cancelled' });
    expect(h.ff.callsTo('POST /posts')).toHaveLength(0);
    expect(h.results.get()).toBeNull();
    expect(h.published).toEqual([]);
  });

  it('TC-UPL-079 준비를 기다리는 중에 화면을 떠나도 cancelled이고 PUT·POST를 보내지 않는다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    const gate = h.compressor.hold();
    await pickPhoto(h);
    await settleMore();
    const result = track(h.vm.submit());
    await settleMore();
    h.vm.dispose();
    gate.resolve();
    await settleMore();
    expect(result.value).toEqual({ kind: 'cancelled' });
    expect(allPuts(h)).toHaveLength(0);
    expect(h.ff.callsTo('POST /posts')).toHaveLength(0);
  });

  it('TC-UPL-079 POST /posts 응답을 기다리는 중에 화면을 떠나면 성공 결과도 변경 알림도 남기지 않는다(홈은 복귀 때 today로 갱신)', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    const gate = deferred<Response>();
    h.router.set(CREATE, () => gate.promise);
    const result = track(h.vm.submit());
    await settleMore();
    expect(h.ff.callsTo('POST /posts')).toHaveLength(1);
    h.vm.dispose();
    gate.resolve(loadFixture('upload/posts-create__201-pending.json').toResponse());
    await settleMore();
    expect(result.value).toEqual({ kind: 'cancelled' });
    expect(h.results.get()).toBeNull();
    expect(h.published).toEqual([]);
  });
});
