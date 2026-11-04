import { createEditorVm, openEditorVm, settle } from '../../../test/editorHarness';
import { FULL_CROP, IDENTITY_EDIT, NO_AUTO_VALUES, isIdentityEdit } from '../editModel';
import type { PhotoEdit } from '../editModel';
import { rectToCropRegion } from './cropGeometry';
import type { CropRect } from './cropGeometry';
import { FILTER_THUMBNAIL_LONG_EDGE } from './PhotoEditorViewModel';

const PHOTO = { width: 4000, height: 3000 };

describe('편집기 ViewModel: 완료 (REQ-EDIT-002, 004~006)', () => {
  it('TC-EDIT-003 "완료"는 선택한 필터·조정·자르기·회전을 편집값 하나로 한 번만 확정한다(렌더는 업로드 준비가 같은 값으로 한다)', async () => {
    const { vm, confirmed, cancels } = await openEditorVm();
    const part: CropRect = { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5 };
    vm.rotate();
    vm.setCropRect(part);
    vm.selectFilter('warm');
    vm.setAdjustValue('saturation', 0.3);
    await vm.confirm();
    expect(confirmed).toHaveLength(1);
    expect(cancels.count).toBe(0);
    const edit = confirmed[0]!;
    expect(edit.quarterTurns).toBe(1);
    expect(edit.filter).toBe('warm');
    expect(edit.adjustmentLayers.manual).toEqual({ saturation: 0.3 });
    expect(edit.crop).toEqual(rectToCropRegion(PHOTO, 1, part));
    expect(edit.crop.width).toBeCloseTo(0.5, 12);
  });

  it('TC-EDIT-003 완료는 마지막 미리보기가 이미 그려져 있으면 추가 렌더 없이 확정한다', async () => {
    const { vm, fakes } = await openEditorVm();
    vm.selectFilter('cool');
    await settle();
    const before = fakes.preview.calls.length;
    await vm.confirm();
    expect(fakes.preview.calls).toHaveLength(before);
  });

  it('TC-EDIT-003 한 번 확정하면 같은 편집기에서 다시 완료·취소해도 한 번만 전달된다', async () => {
    const { vm, confirmed, cancels } = await openEditorVm();
    vm.selectFilter('cool');
    await vm.confirm();
    await vm.confirm();
    vm.cancel();
    expect(confirmed).toHaveLength(1);
    expect(cancels.count).toBe(0);
  });

  it('REQ-EDIT-004 자르기 영역이 전체와 1e-3 이내로 같으면 전체로 확정한다', async () => {
    const { vm, confirmed } = await openEditorVm();
    vm.selectFilter('mono');
    vm.setCropRect({ centerX: 0.5, centerY: 0.5, width: 0.9995, height: 1 });
    await vm.confirm();
    expect(confirmed[0]!.crop).toEqual(FULL_CROP);
  });

  it('REQ-EDIT-004 자동 보정이 꺼져 있으면 분석해 둔 자동 보정값은 버리고 확정한다', async () => {
    const { vm, confirmed } = await openEditorVm();
    vm.selectFilter('mono');
    await vm.confirm();
    expect(vm.state.adjustmentLayers.autoValues.exposure).toBeCloseTo(0.4, 12); // 편집 중에는 분석값이 있다
    expect(confirmed[0]!.adjustmentLayers.autoValues).toEqual(NO_AUTO_VALUES);
  });

  it('TC-EDIT-011 REQ-EDIT-005 편집하지 않은 채 완료하면 isIdentity인 편집값이 나가고 렌더를 기다리지 않는다', async () => {
    const { vm, fakes, confirmed } = await openEditorVm();
    const gate = fakes.preview.hold(); // 미리보기 렌더가 끝나지 않아도
    vm.selectFilter('warm');
    vm.selectFilter('original'); // 바꿨다가 되돌려 다시 편집하지 않은 값
    await settle();
    expect(vm.state.identity).toBe(true);
    const before = fakes.preview.calls.length;
    await vm.confirm();
    expect(confirmed).toHaveLength(1);
    expect(isIdentityEdit(confirmed[0]!)).toBe(true);
    expect(vm.state.confirming).toBe(false);
    expect(fakes.preview.calls).toHaveLength(before); // 완료가 새 렌더를 요청하지 않는다
    gate.resolve();
    await settle();
  });

  it('TC-EDIT-011 편집하지 않은 사진의 확정값은 처음 편집값(IDENTITY_EDIT)과 값이 같다', async () => {
    const { vm, confirmed } = await openEditorVm();
    await vm.confirm();
    expect(confirmed[0]).toEqual(IDENTITY_EDIT);
  });

  it('TC-EDIT-007 렌더 결과를 기다리는 동안(confirming) 완료·취소·도구 조작은 무시되고 렌더링 진행 표시가 켜진다', async () => {
    const { vm, fakes, confirmed, cancels } = await openEditorVm();
    vm.selectFilter('vivid');
    await settle();
    const gate = fakes.preview.hold();
    vm.setAdjustValue('exposure', 0.2); // 마지막 미리보기가 아직 그려지는 중
    const done = vm.confirm();
    await settle();
    expect(vm.state.confirming).toBe(true);
    void vm.confirm();
    vm.cancel();
    vm.selectFilter('mono');
    vm.rotate();
    expect(vm.state.filter).toBe('vivid');
    expect(vm.state.quarterTurns).toBe(0);
    expect(confirmed).toHaveLength(0);
    expect(cancels.count).toBe(0);
    gate.resolve();
    await done;
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.filter).toBe('vivid');
    expect(confirmed[0]!.adjustmentLayers.manual).toEqual({ exposure: 0.2 });
    expect(vm.state.confirming).toBe(false);
  });

  it('TC-EDIT-008 마지막 렌더가 실패했으면 닫지 않고 오류를 보이며 다시 시도할 수 있다', async () => {
    const { vm, fakes, confirmed } = await openEditorVm();
    fakes.preview.failWhen = (call) => call.edit.filter === 'vintage' && call.maxLongEdge > FILTER_THUMBNAIL_LONG_EDGE;
    vm.selectFilter('vintage');
    await settle();
    await vm.confirm();
    expect(confirmed).toHaveLength(0);
    expect(vm.state.error).toBe('render');
    expect(vm.state.confirming).toBe(false);
    expect(vm.state.phase).toBe('ready');
    // 편집 상태는 그대로 남는다
    expect(vm.state.filter).toBe('vintage');
    // 다시 시도: 렌더가 되살아나면 이어서 완료된다
    fakes.preview.failWhen = null;
    vm.retry();
    await settle();
    expect(vm.state.error).toBeNull();
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.filter).toBe('vintage');
  });

  it('TC-EDIT-008 렌더가 여전히 실패하면 다시 오류를 보이고 닫지 않는다', async () => {
    const { vm, fakes, confirmed } = await openEditorVm();
    fakes.preview.failWhen = (call) => call.maxLongEdge > FILTER_THUMBNAIL_LONG_EDGE;
    vm.selectFilter('cool');
    await settle();
    await vm.confirm();
    vm.retry();
    await settle();
    expect(vm.state.error).toBe('render');
    expect(confirmed).toHaveLength(0);
  });

  it('REQ-EDIT-006 편집 중 미리보기 렌더 실패는 완료를 누르기 전에는 오류 알림을 띄우지 않는다(이전 미리보기를 유지)', async () => {
    const { vm, fakes } = await openEditorVm();
    const keep = vm.state.preview;
    fakes.preview.failWhen = (call) => call.maxLongEdge > FILTER_THUMBNAIL_LONG_EDGE;
    vm.selectFilter('cool');
    await settle();
    expect(vm.state.error).toBeNull();
    expect(vm.state.preview).toEqual(keep);
  });
});

describe('편집기 ViewModel: 취소 (REQ-EDIT-003)', () => {
  it('TC-EDIT-004 "취소"는 렌더 없이 취소 이벤트만 한 번 보낸다', async () => {
    const { vm, fakes, confirmed, cancels } = await openEditorVm();
    const before = fakes.preview.calls.length;
    vm.cancel();
    vm.cancel();
    expect(cancels.count).toBe(1);
    expect(confirmed).toHaveLength(0);
    expect(fakes.preview.calls).toHaveLength(before);
  });

  it('TC-EDIT-004 사진을 읽는 중에도 취소할 수 있고 읽기는 취소된다', async () => {
    const { vm, fakes, source, cancels } = createEditorVm();
    const gate = fakes.decoder.hold(source);
    vm.start();
    await settle();
    vm.cancel();
    gate.resolve();
    await settle();
    expect(cancels.count).toBe(1);
    expect(fakes.preview.calls).toHaveLength(0);
  });

  it('TC-EDIT-005 다시 편집하던 사진의 취소는 이번 편집을 모두 버리고 initialEdit을 바꾸지 않는다', async () => {
    const initialEdit: PhotoEdit = { ...IDENTITY_EDIT, filter: 'vintage', quarterTurns: 2 };
    const snapshot = JSON.stringify(initialEdit);
    const { vm, confirmed, cancels } = await openEditorVm({ initialEdit });
    vm.selectFilter('mono');
    vm.rotate();
    vm.setAdjustValue('exposure', 0.5);
    vm.cancel();
    expect(cancels.count).toBe(1);
    expect(confirmed).toHaveLength(0);
    expect(JSON.stringify(initialEdit)).toBe(snapshot);
  });

  it('TC-EDIT-004 dispose 뒤에는 완료·취소가 아무 일도 하지 않는다', async () => {
    const { vm, confirmed, cancels } = await openEditorVm();
    vm.dispose();
    await vm.confirm();
    vm.cancel();
    expect(confirmed).toHaveLength(0);
    expect(cancels.count).toBe(0);
  });

  it('TC-EDIT-003 사진이 준비되기 전(loading)에 완료를 눌러도 확정하지 않는다', async () => {
    const { vm, confirmed } = createEditorVm();
    await vm.confirm();
    expect(confirmed).toHaveLength(0);
  });
});

describe('편집기 ViewModel: 필터 (REQ-EDIT-028)', () => {
  it('필터를 고르면 미리보기가 그 필터로 다시 그려지고 편집값에 들어간다', async () => {
    const { vm, fakes } = await openEditorVm();
    vm.selectFilter('vivid');
    await settle();
    expect(vm.state.filter).toBe('vivid');
    expect(fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!.edit.filter).toBe('vivid');
    expect(vm.draft().filter).toBe('vivid');
    expect(vm.state.identity).toBe(false);
  });

  it('TC-EDIT-039 필터 썸네일은 6종 모두 만들어지고 각각 다른 필터로 그린 결과다', async () => {
    const { vm, fakes } = await openEditorVm();
    expect(Object.keys(vm.state.thumbnails)).toEqual(['original', 'mono', 'warm', 'cool', 'vintage', 'vivid']);
    for (const src of Object.values(vm.state.thumbnails)) expect(src).toMatch(/^preview:/);
    const calls = fakes.preview.calls.filter((c) => c.maxLongEdge <= FILTER_THUMBNAIL_LONG_EDGE);
    expect(new Set(calls.map((c) => c.edit.filter)).size).toBe(6);
  });

  it('TC-EDIT-022 이전 썸네일은 교체될 때 release된다', async () => {
    const { vm, fakes } = await openEditorVm();
    const old = fakes.preview.frames.filter((f) => Object.values(vm.state.thumbnails).includes(f.src));
    expect(old).toHaveLength(6);
    vm.setAdjustValue('exposure', 0.3);
    await settle();
    for (const frame of old) expect(frame.releases).toBe(1);
  });
});
