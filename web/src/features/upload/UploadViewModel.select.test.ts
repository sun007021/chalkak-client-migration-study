import { t } from '../../copy/ko';
import { imageFile } from '../../test/FakeImageDecoder';
import { REFRESH, createUploadHarness, openUpload, pickPhoto, POLICY, prepareReady, sequence, settleMore, UPLOAD_ID, UPLOAD_ID_NEW } from '../../test/uploadHarness';
import { FULL_CROP, IDENTITY_EDIT } from './editModel';
import type { PhotoEdit } from './editModel';

const EDITED: PhotoEdit = { ...IDENTITY_EDIT, crop: { ...FULL_CROP, width: 0.5, height: 0.5 } };
const policies = (h: ReturnType<typeof createUploadHarness>) => h.ff.callsTo('POST /posts/uploads').length;

describe('UploadViewModel 사진 선택 (REQ-UPL-014~021)', () => {
  it('TC-UPL-014 사진을 고르면 보이는 방향의 크기와 함께 선택되고(편집기가 없으면 곧바로 확정) 편집값은 식별값이다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    const file = await pickPhoto(h, { width: 3000, height: 4000 });
    expect(h.vm.state.photo).toEqual({ source: file, width: 3000, height: 4000 });
    expect(h.vm.state.edit).toEqual(IDENTITY_EDIT);
    expect(h.vm.state.editor).toBeNull();
    expect(h.vm.state.errorMessage).toBeNull();
  });

  it('TC-UPL-034 TC-UPL-089 긴 변이 4096을 넘는 사진은 줄인 크기(원본 비율)로 보인다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    await pickPhoto(h, { width: 8000, height: 6000 });
    expect(h.vm.state.photo).toMatchObject({ width: 4096, height: 3072 });
  });

  it('TC-UPL-021 0바이트 사진은 편집기를 열지 않고 준비 실패 문구를 보이며 정책도 요청하지 않는다', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    await pickPhoto(h, { bytes: 0 });
    expect(h.vm.state.errorMessage).toBe('사진을 준비하지 못했어요. 다시 시도해 주세요.');
    expect(h.vm.state.errorMessage).toBe(t('upload.error.prepare'));
    expect(h.vm.state.editor).toBeNull();
    expect(h.vm.state.photo).toBeNull();
    expect(policies(h)).toBe(0);
  });

  it('TC-UPL-021 손상된 사진도 같은 문구이고 이전에 고른 사진과 그 준비는 그대로다', async () => {
    const h = createUploadHarness();
    const good = await prepareReady(h);
    const before = h.vm.state;
    expect(before.preparation).toBe('ready');
    await pickPhoto(h, { corrupt: true });
    expect(h.vm.state.errorMessage).toBe(t('upload.error.prepare'));
    expect(h.vm.state.photo?.source).toBe(good);
    expect(h.vm.state.preparation).toBe('ready');
    expect(policies(h)).toBe(1);
  });

  it('TC-UPL-021 읽을 수 없는 사진 다음에 정상 사진을 고르면 문구가 사라진다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    await pickPhoto(h, { corrupt: true });
    expect(h.vm.state.errorMessage).not.toBeNull();
    await pickPhoto(h);
    expect(h.vm.state.errorMessage).toBeNull();
    expect(h.vm.state.photo).not.toBeNull();
  });

  it('TC-UPL-020 사진 A를 읽는 중 B를 고르면 늦게 끝난 A는 B를 덮지 않는다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    const a = imageFile({ name: 'a.jpg', width: 1000, height: 500 });
    const b = imageFile({ name: 'b.jpg', width: 400, height: 800 });
    const gate = h.decoder.hold(a);
    const selectA = h.vm.selectPhoto(a);
    await settleMore();
    await h.vm.selectPhoto(b);
    await settleMore();
    expect(h.vm.state.photo).toMatchObject({ source: b, width: 400, height: 800 });
    gate.resolve();
    await selectA;
    await settleMore();
    expect(h.vm.state.photo).toMatchObject({ source: b, width: 400, height: 800 });
    expect(h.decoder.images.every((image) => image.released)).toBe(true);
  });

  it('TC-UPL-020 늦게 끝난 A의 실패는 B가 성공한 뒤에 문구를 만들지 않는다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    const a = imageFile({ name: 'a.jpg', corrupt: true });
    const gate = h.decoder.hold(a);
    h.decoder.ignoreAbort = true;
    const selectA = h.vm.selectPhoto(a);
    await settleMore();
    await h.vm.selectPhoto(imageFile({ name: 'b.jpg' }));
    await settleMore();
    gate.resolve();
    await selectA;
    await settleMore();
    expect(h.vm.state.errorMessage).toBeNull();
    expect(h.vm.state.photo).not.toBeNull();
  });

  it('TC-UPL-047 사진이 없으면 전시하기는 비활성이다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    expect(h.vm.state.canSubmit).toBe(false);
  });

  it('TC-UPL-047 사진을 고르면 준비 상태와 무관하게 활성이다(준비 중)', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    h.compressor.hold();
    await pickPhoto(h);
    await settleMore();
    expect(h.vm.state.preparation).toBe('preparing');
    expect(h.vm.state.canSubmit).toBe(true);
  });

  it('TC-UPL-047 준비가 끝나도 활성이고, 준비에 실패한 뒤에도 활성이다', async () => {
    const ready = createUploadHarness();
    await prepareReady(ready);
    expect(ready.vm.state.preparation).toBe('ready');
    expect(ready.vm.state.canSubmit).toBe(true);

    const failed = createUploadHarness({ routes: { [POLICY]: 'upload/posts-uploads__403-banned' } });
    await prepareReady(failed);
    expect(failed.vm.state.preparation).toBe('failed');
    expect(failed.vm.state.canSubmit).toBe(true);
  });
});

describe('UploadViewModel 백그라운드 준비 (REQ-UPL-025~036)', () => {
  it('TC-UPL-023 사진을 고르면 곧바로 정책을 받고 인코딩하며 S3 PUT·게시물 생성은 하지 않는다', async () => {
    const h = createUploadHarness();
    h.compressor.hold();
    await openUpload(h);
    await pickPhoto(h);
    await settleMore();
    expect(h.vm.state.preparation).toBe('preparing');
    expect(sequence(h)).toEqual(['GET /topics', POLICY]);
    expect(h.compressor.compressCount).toBe(1);
  });

  it('TC-UPL-023 준비가 끝나면 ready이고 그 뒤에도 PUT·POST는 없다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    expect(h.vm.state.preparation).toBe('ready');
    expect(sequence(h)).toEqual(['GET /topics', POLICY]);
  });

  it('TC-UPL-025 정책 contentType이 image/png면 인코딩 전에 실패하고 준비 실패 문구를 보인다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: 'upload/posts-uploads__content-type-png' } });
    await prepareReady(h);
    expect(h.vm.state.preparation).toBe('failed');
    expect(h.vm.state.errorMessage).toBe(t('upload.error.prepare'));
    expect(h.compressor.compressCount).toBe(0);
    expect(h.decoder.decodeCount).toBe(1); // 선택 확인(inspect)만
  });

  it('TC-UPL-027 정책 발급 연결 실패는 재시도 뒤 "네트워크 연결을 확인해 주세요."이고 사진은 유지된다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: () => Promise.reject(new TypeError('Failed to fetch')) } });
    await openUpload(h);
    const file = await pickPhoto(h);
    await settleMore();
    await h.clock.advance(1_500);
    await settleMore();
    expect(policies(h)).toBe(3);
    expect(h.vm.state.preparation).toBe('failed');
    expect(h.vm.state.errorMessage).toBe(t('upload.error.network'));
    expect(h.vm.state.photo?.source).toBe(file);
  });

  it('TC-UPL-027 정책 발급 403은 정지 안내 문구이고 다시 요청하지 않는다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: 'upload/posts-uploads__403-banned' } });
    await prepareReady(h);
    await h.clock.advance(5_000);
    expect(h.vm.state.errorMessage).toBe('이용이 정지되어 게시물을 작성할 수 없어요.');
    expect(policies(h)).toBe(1);
  });

  it('TC-UPL-027 정책 발급 500은 재시도 뒤 준비 실패 문구다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: 'upload/posts-uploads__500-server-error' } });
    await openUpload(h);
    await pickPhoto(h);
    await settleMore();
    await h.clock.advance(1_500);
    await settleMore();
    expect(policies(h)).toBe(3);
    expect(h.vm.state.errorMessage).toBe(t('upload.error.prepare'));
  });

  it('TC-UPL-078 정책 발급 중 재인증이 필요하면 문구 없이 세션 만료로 넘긴다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: 'upload/posts-uploads__401-unauthorized', [REFRESH]: 'auth/refresh__reauthentication-required' } });
    await prepareReady(h);
    expect(h.expired.count).toBe(1);
    expect(h.vm.state.errorMessage).toBeNull();
    expect(h.vm.state.preparation).toBe('failed');
  });

  it('TC-UPL-028 다른 사진으로 바꾸면 이전 준비를 취소하고 이미지를 놓으며 새 정책을 발급한다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'] } });
    await openUpload(h);
    h.compressor.hold();
    await pickPhoto(h);
    await settleMore();
    const firstSignal = h.compressor.calls[0]!.signal;
    expect(firstSignal.aborted).toBe(false);
    const second = await pickPhoto(h);
    await settleMore();
    expect(firstSignal.aborted).toBe(true);
    expect(policies(h)).toBe(2);
    expect(h.vm.state.photo?.source).toBe(second);
    expect(h.vm.state.preparation).toBe('ready');
    expect(h.decoder.images.every((image) => image.released)).toBe(true);
  });

  it('TC-UPL-030 준비 중 새 선택 뒤에 끝난 이전 준비(취소에 협조하지 않음)는 새 준비를 덮지 않는다', async () => {
    const h = createUploadHarness({ routes: { [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'] } });
    h.compressor.ignoreAbort = true;
    const gate = h.compressor.hold();
    await openUpload(h);
    await pickPhoto(h);
    await settleMore();
    await pickPhoto(h);
    await settleMore();
    expect(h.vm.state.preparation).toBe('ready');
    gate.resolve(); // 첫 준비가 뒤늦게 끝난다
    await settleMore();
    expect(h.vm.state.preparation).toBe('ready');
    expect(h.vm.state.errorMessage).toBeNull();
    const submit = h.vm.submit();
    await settleMore();
    await submit;
    // 새 선택(두 번째 정책)의 uploadId로 올라갔다
    expect(h.ff.callsTo('PUT /__upload/' + UPLOAD_ID_NEW)).toHaveLength(1);
    expect(h.ff.callsTo('PUT /__upload/' + UPLOAD_ID)).toHaveLength(0);
  });

  it('TC-UPL-029 선제 준비가 실패해도 사진·제목은 유지되고 즉시 문구가 보이며 전시하기가 정책 발급부터 다시 시도한다', async () => {
    const h = createUploadHarness({
      routes: { [POLICY]: ['upload/posts-uploads__500-server-error', 'upload/posts-uploads__500-server-error', 'upload/posts-uploads__500-server-error', 'upload/posts-uploads__issued'] },
    });
    await openUpload(h);
    const file = await pickPhoto(h);
    h.vm.setTitle('하늘');
    await settleMore();
    await h.clock.advance(1_500);
    await settleMore();
    expect(h.vm.state.preparation).toBe('failed');
    expect(h.vm.state.errorMessage).toBe(t('upload.error.prepare'));
    expect(h.vm.state.photo?.source).toBe(file);
    expect(h.vm.state.title).toBe('하늘');
    expect(h.vm.state.canSubmit).toBe(true);

    const submit = h.vm.submit();
    await settleMore();
    await expect(submit).resolves.toEqual({ kind: 'success' });
    expect(policies(h)).toBe(4);
    expect(h.ff.callsTo(`PUT /__upload/${UPLOAD_ID}`)).toHaveLength(1);
  });

  it('TC-UPL-031 화면을 떠나면(dispose) 진행 중인 준비를 취소하고 이미지를 놓으며 상태를 바꾸지 않는다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    const gate = h.compressor.hold();
    await pickPhoto(h);
    await settleMore();
    const signal = h.compressor.calls[0]!.signal;
    h.vm.dispose();
    expect(signal.aborted).toBe(true);
    gate.resolve();
    await settleMore();
    expect(h.vm.state.preparation).toBe('preparing');
    expect(h.decoder.images.every((image) => image.released)).toBe(true);
    expect(h.compressor.compressCount).toBe(1);
  });

  it('TC-UPL-031 선택 확인(inspect) 중에 dispose해도 요청을 취소하고 정책을 요청하지 않는다', async () => {
    const h = createUploadHarness();
    await openUpload(h);
    const file = imageFile();
    h.decoder.hold(file);
    const selecting = h.vm.selectPhoto(file);
    await settleMore();
    h.vm.dispose();
    await selecting;
    await settleMore();
    expect(policies(h)).toBe(0);
    expect(h.vm.state.photo).toBeNull();
  });

  it('TC-UPL-045 편집값 없이 준비하면 편집 재그리기를 하지 않는다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    expect(h.renderer.calls).toHaveLength(0);
  });
});

describe('편집기 연결점 (editorEnabled, 편집기 본체는 W7b)', () => {
  it('편집기가 꺼져 있으면(W7a) requestEdit은 아무 일도 하지 않는다', async () => {
    const h = createUploadHarness();
    await prepareReady(h);
    h.vm.requestEdit();
    expect(h.vm.state.editor).toBeNull();
  });

  it('TC-UPL-014 편집기가 켜져 있으면 사진을 고를 때 first 편집기를 열고, 확정 전에는 사진도 준비도 시작하지 않는다', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    const file = await pickPhoto(h);
    expect(h.vm.state.editor).toEqual({ kind: 'first', source: file, initialEdit: IDENTITY_EDIT });
    expect(h.vm.state.photo).toBeNull();
    expect(h.vm.state.preparation).toBe('idle');
    expect(policies(h)).toBe(0);
    expect(h.vm.state.canSubmit).toBe(false);
  });

  it('TC-UPL-023 first 편집기에서 확정하면 사진이 확정되고 그 편집값으로 준비를 시작한다', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    const file = await pickPhoto(h);
    h.vm.confirmEdit(EDITED);
    await settleMore();
    expect(h.vm.state.editor).toBeNull();
    expect(h.vm.state.photo?.source).toBe(file);
    expect(h.vm.state.edit).toEqual(EDITED);
    expect(h.vm.state.preparation).toBe('ready');
    expect(h.renderer.calls).toHaveLength(1);
    expect(h.renderer.calls[0]!.edit).toEqual(EDITED);
  });

  it('first 편집기를 취소하면 선택을 취소한다(처음이면 사진 없음, 준비 요청 없음)', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    await pickPhoto(h);
    h.vm.cancelEdit();
    expect(h.vm.state.editor).toBeNull();
    expect(h.vm.state.photo).toBeNull();
    expect(policies(h)).toBe(0);
  });

  it('이미 확정한 사진이 있을 때 다른 사진의 first 편집기를 취소해도 이전 사진·편집값·준비는 그대로다', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    const first = await pickPhoto(h);
    h.vm.confirmEdit(EDITED);
    await settleMore();
    await pickPhoto(h);
    h.vm.cancelEdit();
    expect(h.vm.state.photo?.source).toBe(first);
    expect(h.vm.state.edit).toEqual(EDITED);
    expect(h.vm.state.preparation).toBe('ready');
    expect(policies(h)).toBe(1);
  });

  it('requestEdit은 확정한 편집값으로 again 편집기를 열고, 취소하면 편집기만 닫는다', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    const file = await pickPhoto(h);
    h.vm.confirmEdit(EDITED);
    await settleMore();
    h.vm.requestEdit();
    expect(h.vm.state.editor).toEqual({ kind: 'again', source: file, initialEdit: EDITED });
    h.vm.cancelEdit();
    expect(h.vm.state.editor).toBeNull();
    expect(h.vm.state.photo?.source).toBe(file);
    expect(h.vm.state.edit).toEqual(EDITED);
    expect(policies(h)).toBe(1);
  });

  it('TC-UPL-028 같은 편집값(다른 객체)으로 다시 확정하면 준비를 다시 하지 않는다', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    await pickPhoto(h);
    h.vm.confirmEdit(EDITED);
    await settleMore();
    h.vm.requestEdit();
    h.vm.confirmEdit(structuredClone(EDITED));
    await settleMore();
    expect(h.vm.state.editor).toBeNull();
    expect(policies(h)).toBe(1);
    expect(h.vm.state.preparation).toBe('ready');
  });

  it('TC-UPL-028 다른 편집값으로 다시 확정하면 이전 준비를 취소하고 새 정책으로 준비한다', async () => {
    const h = createUploadHarness({ editorEnabled: true, routes: { [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'] } });
    await openUpload(h);
    await pickPhoto(h);
    h.vm.confirmEdit(EDITED);
    await settleMore();
    h.vm.requestEdit();
    h.vm.confirmEdit(IDENTITY_EDIT);
    await settleMore();
    expect(policies(h)).toBe(2);
    expect(h.vm.state.edit).toEqual(IDENTITY_EDIT);
    expect(h.vm.state.preparation).toBe('ready');
  });

  it('requestEdit은 사진이 없거나 제출 중이거나 편집기가 이미 열려 있으면 무시한다', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    h.vm.requestEdit();
    expect(h.vm.state.editor).toBeNull();
    await pickPhoto(h);
    h.vm.confirmEdit(IDENTITY_EDIT);
    await settleMore();
    h.vm.requestEdit();
    const opened = h.vm.state.editor;
    h.vm.requestEdit();
    expect(h.vm.state.editor).toBe(opened);
  });

  it('편집기가 열려 있지 않을 때의 confirmEdit·cancelEdit은 무시한다', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    await pickPhoto(h);
    h.vm.confirmEdit(IDENTITY_EDIT);
    await settleMore();
    const before = h.vm.state;
    h.vm.confirmEdit(EDITED);
    h.vm.cancelEdit();
    await settleMore();
    expect(h.vm.state).toBe(before);
    expect(policies(h)).toBe(1);
  });

  it('편집기가 열려 있는 동안은 전시할 수 없다', async () => {
    const h = createUploadHarness({ editorEnabled: true });
    await openUpload(h);
    await pickPhoto(h);
    h.vm.confirmEdit(IDENTITY_EDIT);
    await settleMore();
    expect(h.vm.state.canSubmit).toBe(true);
    h.vm.requestEdit();
    expect(h.vm.state.canSubmit).toBe(false);
  });
});

