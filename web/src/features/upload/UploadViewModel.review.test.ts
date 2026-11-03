import { SessionChangedError } from '../../core/net/errors';
import { deferred } from '../../test/deferred';
import { emptyResponse, networkFailure } from '../../test/fakeFetch';
import { imageFile } from '../../test/FakeImageDecoder';
import { json } from '../../test/fixtureRouter';
import { HomeRepository } from '../home/HomeRepository';
import {
  CREATE,
  POLICY,
  UPLOAD_ID,
  UPLOAD_ID_NEW,
  UPLOAD_ID_SMALL,
  createUploadHarness,
  openUpload,
  pickPhoto,
  prepareReady,
  putKey,
  settleMore,
} from '../../test/uploadHarness';
import type { UploadHarness } from '../../test/uploadHarness';
import { track } from '../../test/track';
import type { UploadOutcome } from './UploadViewModel';

const SECOND_POLICY = ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'];

async function submitAll(h: UploadHarness): Promise<UploadOutcome> {
  const result = track(h.vm.submit());
  for (let i = 0; i < 400 && result.state === 'pending'; i += 1) {
    await settleMore();
    if (result.state !== 'pending') break;
    await h.clock.advance(500);
  }
  expect(result.state).toBe('fulfilled');
  return result.value as UploadOutcome;
}

describe('리뷰 1: 제출 중 사진 선택 경쟁', () => {
  it('리뷰 1 inspect 중에 제출을 시작하면 늦게 끝난 inspect가 제출 중인 사진을 바꾸지 못한다(취소에 협조하지 않는 디코더)', async () => {
    const h = createUploadHarness();
    const first = await prepareReady(h);
    const other = imageFile({ name: 'other.jpg', width: 100, height: 100 });
    const gate = h.decoder.hold(other);
    h.decoder.ignoreAbort = true;
    const selecting = h.vm.selectPhoto(other);
    await settleMore();
    const putGate = deferred<Response>();
    h.router.set(putKey(UPLOAD_ID), () => putGate.promise);
    const submitting = track(h.vm.submit());
    await settleMore();
    expect(h.vm.state.submitting).toBe(true);
    gate.resolve();
    await selecting;
    await settleMore();
    expect(h.vm.state.photo?.source).toBe(first);
    expect(h.vm.state.editor).toBeNull();
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(1);
    putGate.resolve(emptyResponse(200));
    await settleMore();
    expect(submitting.value).toEqual({ kind: 'success' });
    expect(h.ff.callsTo('POST /posts')).toHaveLength(1);
  });

  it('리뷰 1 submit()은 진행 중인 선택(inspect)의 signal을 abort한다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    const other = imageFile({ name: 'other.jpg' });
    h.decoder.hold(other);
    const selecting = h.vm.selectPhoto(other);
    await settleMore();
    const putGate = deferred<Response>();
    h.router.set(putKey(UPLOAD_ID), () => putGate.promise);
    track(h.vm.submit());
    await settleMore();
    await selecting;
    expect(h.vm.state.photo?.source).not.toBe(other);
    putGate.resolve(emptyResponse(200));
    await settleMore();
  });

  it('리뷰 1 편집기가 켜져 있어도 제출 중에 끝난 inspect는 first 편집기를 열지 않는다', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    const first = await pickPhoto(h);
    h.vm.confirmEdit(h.vm.state.edit);
    await settleMore();
    expect(h.vm.state.photo?.source).toBe(first);
    const other = imageFile({ name: 'other.jpg' });
    const gate = h.decoder.hold(other);
    h.decoder.ignoreAbort = true;
    const selecting = h.vm.selectPhoto(other);
    await settleMore();
    const putGate = deferred<Response>();
    h.router.set(putKey(UPLOAD_ID), () => putGate.promise);
    track(h.vm.submit());
    await settleMore();
    gate.resolve();
    await selecting;
    await settleMore();
    expect(h.vm.state.editor).toBeNull();
    putGate.resolve(emptyResponse(200));
    await settleMore();
  });
});

describe('리뷰 3: SessionChangedError는 문구 없이 cancelled', () => {
  const changed = () => new SessionChangedError('account switched');

  it('리뷰 3 정책 발급 중 세션이 바뀌면 준비 실패 문구를 만들지 않는다', async () => {
    const h = createUploadHarness();
    vi.spyOn(h.repository, 'issuePolicy').mockRejectedValue(changed());
    await prepareReady(h);
    expect(h.vm.state.errorMessage).toBeNull();
  });

  it('리뷰 3 ensureFresh 중 세션이 바뀌면 cancelled이고 문구가 없다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY } });
    await prepareReady(h);
    await h.clock.advance(295_000);
    vi.spyOn(h.repository, 'issuePolicy').mockRejectedValue(changed());
    await expect(submitAll(h)).resolves.toEqual({ kind: 'cancelled' });
    expect(h.vm.state.errorMessage).toBeNull();
    expect(h.vm.state.submitting).toBe(false);
  });

  it('리뷰 3 제출 때 다시 하는 준비에서 세션이 바뀌어도 cancelled이다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: 'upload/posts-uploads__500-server-error' } });
    await prepareReady(h);
    await h.clock.advance(1_500);
    expect(h.vm.state.preparation).toBe('failed');
    vi.spyOn(h.repository, 'issuePolicy').mockRejectedValue(changed());
    await expect(submitAll(h)).resolves.toEqual({ kind: 'cancelled' });
  });

  it('리뷰 3 응답 유실 복구(today) 중 세션이 바뀌면 네트워크 문구 없이 cancelled이다', async () => {
    const h = createUploadHarness({ routes: { [CREATE]: networkFailure } });
    await prepareReady(h);
    vi.spyOn(HomeRepository.prototype, 'fetchTodayPost').mockRejectedValue(changed());
    await expect(submitAll(h)).resolves.toEqual({ kind: 'cancelled' });
    expect(h.vm.state.errorMessage).toBeNull();
  });

  it('리뷰 3 400 판정(today) 중 세션이 바뀌면 생성 실패 문구 없이 cancelled이다', async () => {
    const h = createUploadHarness({ routes: { [CREATE]: 'upload/posts-create__400-upload-expired' } });
    await prepareReady(h);
    vi.spyOn(HomeRepository.prototype, 'fetchTodayPost').mockRejectedValue(changed());
    await expect(submitAll(h)).resolves.toEqual({ kind: 'cancelled' });
    expect(h.vm.state.errorMessage).toBeNull();
  });
});

describe('리뷰 7: PUT 거절 뒤 정책만 버리고 파일은 재사용(REQ-UPL-059)', () => {
  it('리뷰 7 S3 403 뒤 다음 제출은 새 정책을 받되 디코드·인코딩을 다시 하지 않고 같은 파일을 새 uploadId로 PUT한다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY, [putKey(UPLOAD_ID)]: 'upload/s3-put__403-signature-mismatch' } });
    await prepareReady(h);
    const decodes = h.decoder.decodeCount;
    const compresses = h.compressor.compressCount;
    await expect(submitAll(h)).resolves.toEqual({ kind: 'stay' });
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(h.ff.callsTo('POST /posts/uploads')).toHaveLength(2);
    expect(h.decoder.decodeCount).toBe(decodes);
    expect(h.compressor.compressCount).toBe(compresses);
    const put = h.ff.callsTo(`PUT /__upload/${UPLOAD_ID_NEW}`)[0]!;
    expect(put.body).toBe(h.compressor.results[0]);
  });

  it('리뷰 7 새 정책의 maxBytes가 파일보다 작으면 원본에서 다시 인코딩한다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-small-max'], [putKey(UPLOAD_ID)]: 'upload/s3-put__403-signature-mismatch' } });
    h.compressor.bytesFor = (_call, index) => (index === 0 ? 2_000_000 : 900_000);
    await prepareReady(h);
    await submitAll(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(h.compressor.compressCount).toBe(2);
    expect((h.ff.callsTo(`PUT /__upload/${UPLOAD_ID_SMALL}`)[0]!.body as Blob).size).toBe(900_000);
  });

  it('리뷰 7 다른 사진을 고르면 재사용 후보를 버리고 새로 준비한다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY, [putKey(UPLOAD_ID)]: 'upload/s3-put__403-signature-mismatch' } });
    await prepareReady(h);
    await submitAll(h);
    await pickPhoto(h, { name: 'b.jpg' });
    await settleMore();
    expect(h.compressor.compressCount).toBe(2);
  });

  it('리뷰 7 POST 404 뒤에는 준비물을 모두 버린다(기존 동작 유지)', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY, [CREATE]: ['upload/posts-create__404-upload-not-found', 'upload/posts-create__201-pending'] } });
    await prepareReady(h);
    await submitAll(h);
    await expect(submitAll(h)).resolves.toEqual({ kind: 'success' });
    expect(h.compressor.compressCount).toBe(2);
  });

  it('리뷰 7 재사용한 파일도 PUT 본문 Content-Type은 image/webp다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: SECOND_POLICY, [putKey(UPLOAD_ID)]: 'upload/s3-put__403-signature-mismatch', [CREATE]: () => json(201, { postId: 'p', moderationStatus: 'PENDING' }) } });
    await prepareReady(h);
    await submitAll(h);
    await submitAll(h);
    expect(h.ff.callsTo(`PUT /__upload/${UPLOAD_ID_NEW}`)[0]!.headers['content-type']).toBe('image/webp');
  });
});
