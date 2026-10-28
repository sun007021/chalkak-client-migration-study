import { deferred } from '../../core/http/__testing__/FakeTransport';
import { picked } from '../../core/media/__testing__/FakeImagePicker';
import { t } from '../../shared/copy';
import { ImageDecodeError } from '../photo-edit/ImageErrors';
import {
  countOf,
  createUploadHarness,
  flush,
  PHOTO_URI,
  type UploadHarness,
} from './__testing__/createUploadHarness';
import { pickAndConfirm } from './__testing__/uploadFlow';

const POLICY = 'POST /posts/uploads';
const A = 'file:///picked/a.jpg';
const B = 'file:///picked/b.jpg';

async function setup(platform: 'ios' | 'android' = 'android') {
  const h = await createUploadHarness({ platform });
  await h.viewModel.start();
  return h;
}

const state = (h: UploadHarness) => h.viewModel.getSnapshot();

describe('PhotoUploadViewModel - 앨범', () => {
  it('TC-UPL-014 앨범 선택은 시스템 선택기를 한 번 열고 선택 즉시 편집기를 연다', async () => {
    const h = await setup();
    h.picker.willPick(picked(PHOTO_URI));
    await h.viewModel.pickFromLibrary();
    expect(h.picker.libraryCalls).toBe(1);
    expect(state(h).editing).toBe(true);
    expect(h.viewModel.editor).not.toBeNull();
    // 처음 고른 사진은 편집기에서 완료하기 전까지 확정되지 않는다
    expect(state(h).photo).toBeNull();
  });

  it('REQ-UPL-017 사진을 고르거나 찍으면 항상 편집기를 먼저 연다(바로 준비하지 않는다)', async () => {
    const h = await setup();
    h.picker.willPick(picked(PHOTO_URI));
    await h.viewModel.pickFromLibrary();
    await flush();
    expect(countOf(h, POLICY)).toBe(0);
  });

  it('TC-UPL-014 선택기를 취소하면 상태가 바뀌지 않는다', async () => {
    const h = await setup();
    const before = state(h);
    await h.viewModel.pickFromLibrary();
    expect(state(h)).toEqual(before);
    expect(h.viewModel.editor).toBeNull();
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-UPL-017 앨범에서 고른 사진은 갤러리에 다시 저장하지 않는다(준비·제출 포함)', async () => {
    const h = await setup();
    await pickAndConfirm(h);
    await h.viewModel.submit();
    expect(h.gallery.saved).toEqual([]);
    expect(h.permissions.requests).toBe(0);
  });

  it('REQ-UPL-020 크기를 아는 사진은 원본 비율 그대로 상태에 담는다', async () => {
    const h = await setup();
    h.engine.sizes.set(PHOTO_URI, { width: 3000, height: 4000 });
    await pickAndConfirm(h);
    expect(state(h).photo).toMatchObject({ uri: PHOTO_URI, width: 3000, height: 4000 });
  });

  it('TC-UPL-021 읽을 수 없는 사진(0바이트·손상)은 편집기를 열지 않고 준비 실패 문구를 보여 준다', async () => {
    const h = await setup();
    h.engine.sizes.set(PHOTO_URI, new ImageDecodeError());
    h.picker.willPick(picked(PHOTO_URI));
    await h.viewModel.pickFromLibrary();
    expect(state(h).editing).toBe(false);
    expect(h.viewModel.editor).toBeNull();
    expect(state(h).photoLoading).toBe(false);
    expect(state(h).photo).toBeNull();
    // [가정: 사진 읽기 실패 문구는 토스트가 아니라 state.error(upload.error-message)로 보여 준다]
    expect(state(h).error).toBe(t('upload.error.prepare'));
    expect(countOf(h, POLICY)).toBe(0);
  });

  it('TC-UPL-021 선택기가 던져도 앱은 멈추지 않고 준비 실패 문구를 보여 준다', async () => {
    const h = await setup();
    h.picker.willPick(new Error('picker crashed'));
    await h.viewModel.pickFromLibrary();
    expect(state(h).editing).toBe(false);
    expect(state(h).error).toBe(t('upload.error.prepare'));
  });

  it('TC-UPL-020 사진 A를 읽는 중 B를 고르면 A의 늦은 결과는 버린다', async () => {
    const h = await setup();
    const hold = h.engine.holdNext('readBounds');
    h.picker.willPick(picked(A), picked(B));
    const first = h.viewModel.pickFromLibrary();
    await flush();
    expect(state(h).photoLoading).toBe(true);

    await h.viewModel.pickFromLibrary();
    expect(h.viewModel.editor).not.toBeNull();
    const editor = h.viewModel.editor;

    hold.release();
    await first;
    await flush();
    expect(h.viewModel.editor).toBe(editor);
    expect(h.engine.callsOf('readBounds').map((c) => (c as { uri: string }).uri)).toContain(B);
  });

  it('TC-UPL-020 선택기 응답 자체가 늦게 와도 최신 선택만 반영한다', async () => {
    const h = await setup();
    const slow = deferred<ReturnType<typeof picked>>();
    h.picker.willPick(slow.promise, picked(B));
    const first = h.viewModel.pickFromLibrary();
    await h.viewModel.pickFromLibrary();
    slow.resolve(picked(A));
    await first;
    await flush();

    const editor = h.viewModel.editor;
    expect(editor).not.toBeNull();
    await editor?.start();
    await editor?.done();
    await flush();
    expect(state(h).photo?.uri).toBe(B);
  });
});

describe('PhotoUploadViewModel - 카메라', () => {
  it('TC-UPL-016 촬영본은 갤러리에 한 번만 저장하고(chalkak-photo-*.jpg) 제출할 때 다시 저장하지 않는다', async () => {
    const h = await setup();
    h.picker.willCapture(picked('file:///camera/shot.jpg'));
    await h.viewModel.capture();

    expect(h.gallery.saved).toHaveLength(1);
    expect(h.gallery.saved[0].uri).toBe('file:///camera/shot.jpg');
    expect(h.gallery.saved[0].fileName).toMatch(/^chalkak-photo-.+\.jpg$/);
    expect(state(h).editing).toBe(true);

    const editor = h.viewModel.editor;
    await editor?.start();
    await editor?.done();
    await flush();
    await h.viewModel.submit();
    expect(h.gallery.saved).toHaveLength(1);
  });

  it('TC-UPL-018 갤러리 저장이 거부·실패해도 토스트만 뜨고 사진은 유지되어 업로드를 계속할 수 있다', async () => {
    for (const result of ['permission-denied', 'failed'] as const) {
      const h = await setup();
      h.gallery.result = result;
      h.picker.willCapture(picked('file:///camera/shot.jpg'));
      await h.viewModel.capture();
      await flush();

      expect(h.toast.messages).toEqual([t('upload.camera.save-failed')]);
      expect(state(h).editing).toBe(true);
      expect(state(h).error).toBeNull();

      const editor = h.viewModel.editor;
      await editor?.start();
      await editor?.done();
      await flush();
      expect(state(h).photo?.uri).toBe('file:///camera/shot.jpg');
      await expect(h.viewModel.submit()).resolves.toBeUndefined();
      expect(h.navigator.ofType('show-success')).toHaveLength(1);
    }
  });

  it('TC-UPL-019 화면을 닫은 뒤 늦게 끝난 저장이 실패해도 토스트로 알리고 크래시가 없다', async () => {
    const h = await setup();
    const slow = deferred<'failed'>();
    h.gallery.result = slow.promise;
    h.picker.willCapture(picked('file:///camera/shot.jpg'));
    await h.viewModel.capture();

    h.viewModel.dispose();
    slow.resolve('failed');
    await flush();
    expect(h.toast.messages).toEqual([t('upload.camera.save-failed')]);
  });

  it('TC-UPL-015 카메라가 없는 기기에서는 cameraAvailable=false이고 앨범 선택은 된다', async () => {
    const h = await createUploadHarness();
    // [가정: cameraAvailable은 ViewModel이 start()에서 ImagePicker 값을 읽어 상태로 만든다]
    h.picker.cameraAvailable = false;
    await h.viewModel.start();
    expect(state(h).cameraAvailable).toBe(false);
    h.picker.willPick(picked(PHOTO_URI));
    await h.viewModel.pickFromLibrary();
    expect(h.viewModel.editor).not.toBeNull();
  });

  it('REQ-UPL-013 카메라가 있으면 cameraAvailable=true다', async () => {
    const h = await setup();
    expect(state(h).cameraAvailable).toBe(true);
  });
});

describe('PhotoUploadViewModel - iOS 사진 추가 권한', () => {
  it('iOS는 카메라를 열기 전에 사진 추가 권한을 요청하고 허용되면 촬영·저장한다', async () => {
    const h = await setup('ios');
    h.picker.willCapture(picked('file:///camera/shot.jpg'));
    await h.viewModel.capture();
    expect(h.permissions.requests).toBe(1);
    expect(h.picker.captureCalls).toBe(1);
    expect(h.gallery.saved).toHaveLength(1);
    expect(state(h).permissionPrompt).toBe(false);
  });

  it('iOS에서 권한이 거부되면 카메라를 열지 않고 안내(permissionPrompt)를 띄운다', async () => {
    const h = await setup('ios');
    h.permissions.addPermission = 'denied';
    await h.viewModel.capture();
    expect(state(h).permissionPrompt).toBe(true);
    expect(h.picker.captureCalls).toBe(0);
  });

  it('iOS "저장 없이 촬영"은 저장하지 않고 촬영한 사진을 쓴다', async () => {
    const h = await setup('ios');
    h.permissions.addPermission = 'denied';
    h.picker.willCapture(picked('file:///camera/shot.jpg'));
    await h.viewModel.capture();
    await h.viewModel.captureWithoutSaving();
    expect(state(h).permissionPrompt).toBe(false);
    expect(h.picker.captureCalls).toBe(1);
    expect(h.gallery.saved).toEqual([]);
    expect(state(h).editing).toBe(true);
    expect(h.toast.messages).toEqual([]);
  });

  it('iOS "설정 열기"는 설정 앱을 열고, "취소"는 안내만 닫는다', async () => {
    const h = await setup('ios');
    h.permissions.addPermission = 'denied';
    await h.viewModel.capture();
    h.viewModel.dismissPermissionPrompt();
    expect(state(h).permissionPrompt).toBe(false);
    expect(h.picker.captureCalls).toBe(0);

    await h.viewModel.capture();
    await h.viewModel.openPermissionSettings();
    expect(h.permissions.settingsOpened).toBe(1);
  });

  it('Android는 권한을 묻지 않고 시스템 카메라를 바로 연다', async () => {
    const h = await setup('android');
    h.picker.willCapture(picked('file:///camera/shot.jpg'));
    await h.viewModel.capture();
    expect(h.permissions.requests).toBe(0);
    expect(h.picker.captureCalls).toBe(1);
  });
});

describe('PhotoUploadViewModel - 편집기', () => {
  it('EDIT-006 완료하면 사진이 확정되고 즉시 백그라운드 준비(정책 발급·인코딩)를 시작한다', async () => {
    const h = await setup();
    await pickAndConfirm(h);
    expect(state(h).editing).toBe(false);
    expect(h.viewModel.editor).toBeNull();
    expect(state(h).photo).toMatchObject({ uri: PHOTO_URI });
    expect(countOf(h, POLICY)).toBe(1);
    expect(h.engine.encodeRequests).toHaveLength(1);
    expect(h.transport.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
  });

  it('TC-EDIT-004 처음 고른 사진에서 취소하면 사진 선택 자체가 취소된다(사진 없음, 준비 없음)', async () => {
    const h = await setup();
    h.picker.willPick(picked(PHOTO_URI));
    await h.viewModel.pickFromLibrary();
    h.viewModel.editor?.cancel();
    expect(state(h).editing).toBe(false);
    expect(state(h).photo).toBeNull();
    expect(countOf(h, POLICY)).toBe(0);
    expect(h.engine.encodeRequests).toHaveLength(0);
  });

  it('TC-EDIT-005 이미 편집한 사진을 다시 편집하다 취소하면 이전 선택·편집·준비 결과가 유지된다', async () => {
    const h = await setup();
    await pickAndConfirm(h, PHOTO_URI, (editor) => editor.selectFilter('vivid'));
    const before = state(h).photo;

    await h.viewModel.editPhoto();
    const editor = h.viewModel.editor;
    await editor?.start();
    editor?.selectFilter('mono');
    editor?.cancel();
    await flush();

    expect(state(h).editing).toBe(false);
    expect(state(h).photo).toEqual(before);
    expect(state(h).photo?.edit.filter).toBe('vivid');
    expect(countOf(h, POLICY)).toBe(1);
    expect(state(h).preparation).toBe('ready');
  });

  it('TC-EDIT-006 사진을 탭하면 저장된 편집값으로 편집기가 다시 열린다', async () => {
    const h = await setup();
    await pickAndConfirm(h, PHOTO_URI, (editor) => {
      editor.rotate();
      editor.selectFilter('vintage');
    });
    await h.viewModel.editPhoto();
    expect(state(h).editing).toBe(true);
    const editor = h.viewModel.editor;
    await editor?.start();
    expect(editor?.getSnapshot()).toMatchObject({ filter: 'vintage', quarterTurns: 1 });
  });

  it('TC-EDIT-006 다른 편집값으로 다시 완료하면 새 준비를 시작한다', async () => {
    const h = await setup();
    await pickAndConfirm(h);
    await h.viewModel.editPhoto();
    const editor = h.viewModel.editor;
    await editor?.start();
    editor?.selectFilter('cool');
    await editor?.done();
    await flush();
    expect(countOf(h, POLICY)).toBe(2);
    expect(h.engine.encodeRequests.at(-1)?.edit?.filter).toBe('cool');
  });

  it('TC-EDIT-006·REQ-UPL-035 같은 편집값으로 다시 완료하면 다시 준비하지 않는다', async () => {
    const h = await setup();
    await pickAndConfirm(h);
    await h.viewModel.editPhoto();
    const editor = h.viewModel.editor;
    await editor?.start();
    await editor?.done();
    await flush();
    expect(countOf(h, POLICY)).toBe(1);
    expect(h.engine.encodeRequests).toHaveLength(1);
  });

  it('TC-UPL-028 사진을 다른 사진으로 교체하면 이전 임시 파일이 지워지고 새 정책을 받는다', async () => {
    const h = await setup();
    await pickAndConfirm(h, A);
    const first = h.files.existing[0];
    await pickAndConfirm(h, B);
    expect(h.files.deleted).toContain(first);
    expect(countOf(h, POLICY)).toBe(2);
    expect(state(h).photo?.uri).toBe(B);
  });
});
