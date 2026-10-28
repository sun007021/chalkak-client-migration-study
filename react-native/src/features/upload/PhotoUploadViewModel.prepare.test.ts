import { picked } from '../../core/media/__testing__/FakeImagePicker';
import type { RouteValue } from '../../data/__testing__/FixtureRouter';
import { t } from '../../shared/copy';
import {
  countOf,
  createUploadHarness,
  flush,
  PHOTO_URI,
  type UploadHarness,
} from './__testing__/createUploadHarness';
import { pickAndConfirm } from './__testing__/uploadFlow';

const POLICY = 'POST /posts/uploads';
const fail500 = 'upload/posts-uploads__500-server-error';

async function setup(routes: Record<string, RouteValue> = {}) {
  const h = await createUploadHarness({ routes });
  await h.viewModel.start();
  return h;
}
const state = (h: UploadHarness) => h.viewModel.getSnapshot();

describe('PhotoUploadViewModel - 선제 준비와 상태', () => {
  it('TC-UPL-047 사진이 없으면 전시하기는 비활성(canSubmit=false)이고 submit도 아무것도 보내지 않는다', async () => {
    const h = await setup();
    expect(state(h).canSubmit).toBe(false);
    await h.viewModel.submit();
    expect(countOf(h, 'POST /posts')).toBe(0);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-UPL-047 사진을 고르면 준비 상태와 무관하게 활성이다(편집기 확정 전에도 아니고, 확정하면 준비 중에도 활성)', async () => {
    const h = await setup();
    const hold = h.engine.holdNext('encodeWebp');
    await pickAndConfirm(h);
    expect(state(h).photo).not.toBeNull();
    expect(state(h).preparation).toBe('preparing');
    expect(state(h).canSubmit).toBe(true);
    hold.release();
    await flush();
    expect(state(h).preparation).toBe('ready');
    expect(state(h).canSubmit).toBe(true);
  });

  it('TC-UPL-047 준비가 실패한 뒤에도 활성이다', async () => {
    const h = await setup({ [POLICY]: fail500 });
    await pickAndConfirm(h);
    await flush();
    expect(state(h).preparation).toBe('failed');
    expect(state(h).canSubmit).toBe(true);
  });

  it('TC-UPL-029 선제 준비가 실패하면 사진·제목은 유지되고 즉시 실패 문구를 보여 준다', async () => {
    const h = await setup({ [POLICY]: fail500 });
    h.viewModel.setTitle('가을 하늘');
    await pickAndConfirm(h);
    await flush();
    expect(state(h).preparation).toBe('failed');
    expect(state(h).error).toBe(t('upload.error.prepare'));
    expect(state(h).photo).not.toBeNull();
    expect(state(h).title).toBe('가을 하늘');
  });

  it('TC-UPL-029 별도 재시도 없이 "전시하기"가 정책 발급과 준비부터 다시 시도한다', async () => {
    const h = await setup({
      [POLICY]: [fail500, fail500, fail500, 'upload/posts-uploads__issued'],
    });
    await pickAndConfirm(h);
    await flush();
    expect(state(h).preparation).toBe('failed');

    await h.viewModel.submit();
    expect(countOf(h, POLICY)).toBe(4);
    expect(h.navigator.ofType('show-success')).toHaveLength(1);
  });

  it('TC-UPL-029 다시 시도가 시작되면 이전 실패 문구는 지워진다', async () => {
    const h = await setup({
      [POLICY]: [fail500, fail500, fail500, 'upload/posts-uploads__issued'],
    });
    await pickAndConfirm(h);
    await flush();
    const submitting = h.viewModel.submit();
    expect(state(h).error).toBeNull();
    await submitting;
  });

  it('TC-UPL-048 준비 중 "전시하기"는 "전시 중..." 상태가 되고 준비가 끝나면 자동으로 PUT·POST를 진행한다', async () => {
    const h = await setup();
    const hold = h.engine.holdNext('encodeWebp');
    await pickAndConfirm(h);

    const pending = h.viewModel.submit();
    await flush();
    expect(state(h).submitting).toBe(true);
    expect(state(h).canSubmit).toBe(false);
    expect(countOf(h, 'POST /posts')).toBe(0);

    hold.release();
    await pending;
    expect(countOf(h, 'POST /posts')).toBe(1);
    expect(state(h).submitting).toBe(false);
    expect(h.navigator.ofType('show-success')).toHaveLength(1);
  });

  it('TC-UPL-030 준비 중 사진을 바꿔도 이전 작업의 늦은 결과가 새 선택의 상태를 덮지 않는다', async () => {
    const h = await setup({
      [POLICY]: ['upload/posts-uploads__issued', 'upload/posts-uploads__issued-new'],
    });
    const hold = h.engine.holdNext('encodeWebp');
    await pickAndConfirm(h, 'file:///picked/a.jpg');
    expect(state(h).preparation).toBe('preparing');

    await pickAndConfirm(h, 'file:///picked/b.jpg');
    await flush();
    expect(state(h).preparation).toBe('ready');
    expect(state(h).photo?.uri).toBe('file:///picked/b.jpg');

    hold.release();
    await flush();
    expect(state(h).preparation).toBe('ready');
    expect(state(h).photo?.uri).toBe('file:///picked/b.jpg');
  });

  it('TC-UPL-031 화면을 나가면(dispose) 진행 중 준비를 취소하고 임시 파일을 지운다', async () => {
    const h = await setup();
    const hold = h.engine.holdNext('encodeWebp');
    await pickAndConfirm(h);
    await flush();
    const signal = h.engine.callsOf('encodeWebp')[0].signal;

    h.viewModel.dispose();
    expect(signal?.aborted).toBe(true);
    hold.release();
    await flush();
    expect(h.files.existing).toEqual([]);
  });

  it('TC-UPL-031 준비가 끝난 뒤 화면을 나가도 임시 파일을 남기지 않는다', async () => {
    const h = await setup();
    await pickAndConfirm(h);
    expect(h.files.existing).toHaveLength(1);
    h.viewModel.dispose();
    expect(h.files.existing).toEqual([]);
  });

  it('TC-UPL-088 편집기를 열고 닫아도 screen_view는 한 번이다', async () => {
    const h = await setup();
    await pickAndConfirm(h);
    await h.viewModel.editPhoto();
    h.viewModel.editor?.cancel();
    expect(h.analytics.screenNames).toEqual(['photo_upload']);
  });

  it('REQ-UPL-025 앨범에서 고른 사진을 편집 없이 확정해도 준비를 시작한다', async () => {
    const h = await setup();
    h.picker.willPick(picked(PHOTO_URI));
    await pickAndConfirm(h);
    expect(countOf(h, POLICY)).toBe(1);
    expect(h.engine.encodeRequests[0].edit).toBeNull();
  });
});
