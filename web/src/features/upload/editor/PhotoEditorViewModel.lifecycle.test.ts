import { POST_IMAGE_MAX_LONG_EDGE } from '../../../constants';
import { imageFile } from '../../../test/FakeImageDecoder';
import { createEditorVm, openEditorVm, settle } from '../../../test/editorHarness';
import { FULL_CROP, IDENTITY_EDIT, NO_AUTO_VALUES, isIdentityEdit, sameEdit } from '../editModel';
import type { PhotoEdit } from '../editModel';
import { cropRegionToRect } from './cropGeometry';
import { ADJUST_ITEMS, EDITOR_DECODE_LONG_EDGE, EDITOR_TOOLS, FILTER_THUMBNAIL_LONG_EDGE, PREVIEW_MAX_LONG_EDGE } from './PhotoEditorViewModel';

describe('편집기 ViewModel: 열기와 정리 (REQ-EDIT-001, 007, 018)', () => {
  it('TC-EDIT-001 만들기만 해서는 디코드·분석·렌더링을 하지 않는다', async () => {
    const { vm, fakes } = createEditorVm();
    await settle();
    expect(fakes.decoder.decodeCount).toBe(0);
    expect(fakes.analyzer.calls).toHaveLength(0);
    expect(fakes.preview.calls).toHaveLength(0);
    expect(vm.state.phase).toBe('loading');
  });

  it('TC-EDIT-001 start를 여러 번 불러도 미리보기 원본(디코드)과 자동 보정값 준비는 한 번만 일어난다', async () => {
    const { vm, fakes } = createEditorVm();
    vm.start();
    vm.start();
    await settle();
    vm.start();
    await settle();
    expect(fakes.decoder.decodeCount).toBe(1);
    expect(fakes.analyzer.calls).toHaveLength(1);
    expect(vm.state.phase).toBe('ready');
  });

  it('TC-EDIT-009 편집용 이미지는 긴 변 4096 이하로 읽는다(EXIF 방향이 반영된 보이는 방향 크기가 imageSize)', async () => {
    expect(EDITOR_DECODE_LONG_EDGE).toBe(POST_IMAGE_MAX_LONG_EDGE);
    const { vm, fakes, source } = await openEditorVm({ photo: { width: 8000, height: 6000 } });
    expect(fakes.decoder.calls[0]).toEqual({ source, maxLongEdge: 4096 });
    expect(vm.state.imageSize).toEqual({ width: 4096, height: 3072 });
  });

  it('REQ-EDIT-007 미리보기는 긴 변 1440 이하로, 필터 썸네일은 작은 크기로 그린다', async () => {
    expect(PREVIEW_MAX_LONG_EDGE).toBe(1440);
    const { fakes } = await openEditorVm();
    const previews = fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE);
    expect(previews.length).toBeGreaterThanOrEqual(1);
    for (const call of previews) expect(call.maxLongEdge).toBe(1440);
    const thumbnails = fakes.preview.calls.filter((c) => c.maxLongEdge <= FILTER_THUMBNAIL_LONG_EDGE);
    expect(thumbnails.map((c) => c.edit.filter).sort()).toEqual(['cool', 'mono', 'original', 'vintage', 'vivid', 'warm']);
    for (const call of thumbnails) expect(call.maxLongEdge).toBe(FILTER_THUMBNAIL_LONG_EDGE);
  });

  it('REQ-EDIT-001 REQ-EDIT-010 REQ-EDIT-020 REQ-EDIT-028 처음 상태: 자르기 도구, 비율 자유, 조정 항목 자동(강도 0), 필터 원본, 전체 자르기', async () => {
    expect([...EDITOR_TOOLS]).toEqual(['crop', 'adjust', 'filter']);
    expect([...ADJUST_ITEMS]).toEqual(['auto', 'exposure', 'contrast', 'highlights', 'shadows', 'blackPoint', 'saturation', 'warmth']);
    const { vm } = await openEditorVm();
    expect(vm.state).toMatchObject({
      phase: 'ready',
      tool: 'crop',
      ratio: 'free',
      adjustItem: 'auto',
      filter: 'original',
      quarterTurns: 0,
      confirming: false,
      error: null,
      identity: true,
    });
    expect(vm.state.cropRect).toEqual({ centerX: 0.5, centerY: 0.5, width: 1, height: 1 });
    expect(vm.state.adjustmentLayers.autoStrength).toBe(0);
    expect(vm.state.adjustmentLayers.manual).toEqual({});
    expect(vm.state.preview).not.toBeNull();
  });

  it('TC-EDIT-021 수평 보정 각도는 UI가 없고 편집값에도 없다(항상 0과 같다)', async () => {
    const { vm } = await openEditorVm();
    expect(Object.keys(vm.draft()).sort()).toEqual(['adjustmentLayers', 'crop', 'filter', 'quarterTurns']);
  });

  it('TC-EDIT-004 TC-EDIT-006 다시 열면 이전 편집값(회전·자르기·필터·조정)을 복원한다', async () => {
    const initialEdit: PhotoEdit = {
      quarterTurns: 1,
      crop: { centerX: 0.5, centerY: 0.75, width: 0.5, height: 1 },
      filter: 'warm',
      adjustmentLayers: { autoValues: { ...NO_AUTO_VALUES }, autoStrength: 0, manual: { saturation: 0.3 } },
    };
    const { vm, fakes } = await openEditorVm({ initialEdit });
    expect(vm.state.quarterTurns).toBe(1);
    expect(vm.state.filter).toBe('warm');
    expect(vm.state.adjustValues.saturation).toBeCloseTo(0.3, 12);
    const rect = cropRegionToRect({ width: 4000, height: 3000 }, 1, initialEdit.crop);
    expect(vm.state.cropRect.centerX).toBeCloseTo(rect.centerX, 9);
    expect(vm.state.cropRect.width).toBeCloseTo(0.5, 9);
    // 첫 미리보기는 복원한 회전·필터·조정으로 그린다(자르기 도구에서는 자르기 프레임이 얹혀 사진 전체)
    const first = fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE)[0]!;
    expect(first.edit.quarterTurns).toBe(1);
    expect(first.edit.filter).toBe('warm');
    expect(first.edit.adjustmentLayers.manual).toEqual({ saturation: 0.3 });
    expect(vm.state.identity).toBe(false);
  });

  it('TC-EDIT-006 아무것도 바꾸지 않고 다시 완료하면 처음 편집값과 값이 같다(같은 값이면 업로드 준비를 다시 하지 않는다)', async () => {
    // 부동소수 왕복으로 값이 미세하게 달라지면 안 되므로 어색한 숫자를 쓴다
    const initialEdit: PhotoEdit = {
      quarterTurns: 3,
      crop: { centerX: 0.41, centerY: 0.37, width: 0.62, height: 0.55 },
      filter: 'vintage',
      adjustmentLayers: { autoValues: { ...NO_AUTO_VALUES, exposure: 0.4 }, autoStrength: 0.5, manual: { contrast: -0.17 } },
    };
    const { vm, confirmed } = await openEditorVm({ initialEdit });
    await vm.confirm();
    expect(confirmed).toHaveLength(1);
    expect(sameEdit(confirmed[0]!, initialEdit)).toBe(true);
    expect(confirmed[0]).toEqual(initialEdit);
  });

  it('TC-EDIT-004 처음 고른 사진(IDENTITY_EDIT)은 편집하지 않은 상태로 시작한다', async () => {
    const { vm } = await openEditorVm({ initialEdit: IDENTITY_EDIT });
    expect(isIdentityEdit(vm.draft())).toBe(true);
    expect(vm.state.identity).toBe(true);
  });

  it('읽을 수 없는 사진(손상)이면 phase failed + 오류 알림이고 미리보기를 그리지 않는다', async () => {
    const { vm, fakes } = await openEditorVm({ source: imageFile({ corrupt: true }) });
    expect(vm.state.phase).toBe('failed');
    expect(vm.state.error).toBe('render');
    expect(fakes.preview.calls).toHaveLength(0);
    expect(fakes.analyzer.calls).toHaveLength(0);
  });

  it('TC-EDIT-008 읽기 실패의 "다시 시도"는 디코드부터 다시 한다', async () => {
    const { vm, fakes } = await openEditorVm({ source: imageFile({ corrupt: true }) });
    vm.retry();
    await settle();
    expect(fakes.decoder.decodeCount).toBe(2);
  });

  it('dispose는 진행 중 디코드를 취소하고, 늦게 끝나도 렌더·분석을 하지 않는다', async () => {
    const { vm, fakes, source } = createEditorVm();
    const gate = fakes.decoder.hold(source);
    vm.start();
    await settle();
    vm.dispose();
    gate.resolve();
    await settle();
    expect(fakes.preview.calls).toHaveLength(0);
    expect(fakes.analyzer.calls).toHaveLength(0);
    expect(fakes.decoder.images.filter((i) => !i.released)).toHaveLength(0);
  });

  it('dispose는 디코드한 이미지·미리보기·썸네일을 release한다', async () => {
    const { vm, fakes } = await openEditorVm();
    expect(fakes.decoder.images).toHaveLength(1);
    expect(fakes.preview.frames.length).toBeGreaterThan(0);
    vm.dispose();
    expect(fakes.decoder.images[0]!.released).toBe(true);
    for (const frame of fakes.preview.frames) expect(frame.released).toBe(true);
  });

  it('새 미리보기가 그려지면 이전 미리보기는 release된다(교체당 한 번)', async () => {
    const { vm, fakes } = await openEditorVm();
    const before = fakes.preview.frames.find((f) => f.src === vm.state.preview!.src)!;
    vm.selectFilter('warm');
    await settle();
    expect(before.releases).toBe(1);
    expect(vm.state.preview!.src).not.toBe(before.src);
  });

  it('여러 번 바꾸면 마지막 요청만 반영된다: 앞선 렌더는 취소되고 결과가 화면에 올라오지 않는다', async () => {
    const { vm, fakes } = await openEditorVm();
    const gate = fakes.preview.hold();
    vm.selectFilter('warm');
    vm.selectFilter('cool');
    await settle();
    const requested = fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).map((c) => c.edit.filter);
    expect(requested.slice(-2)).toEqual(['warm', 'cool']);
    gate.resolve();
    await settle();
    const lastCall = fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!;
    expect(lastCall.edit.filter).toBe('cool');
    expect(vm.state.preview!.src).toBe(fakes.preview.frames.at(-1)!.src);
    expect(fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-2)!.aborted()).toBe(true);
  });

  it('상태 알림: 아무것도 바뀌지 않는 호출(같은 필터 다시 선택)은 구독자에게 알리지 않는다', async () => {
    const { vm } = await openEditorVm();
    let notified = 0;
    vm.subscribe(() => {
      notified += 1;
    });
    vm.selectFilter('original');
    expect(notified).toBe(0);
  });

  it('FULL_CROP 상수와 처음 영역은 같다', async () => {
    const { vm } = await openEditorVm();
    expect(vm.draft().crop).toEqual(FULL_CROP);
  });

  it('start 직후 디코드 대기 중에는 phase loading이고 끝나면 ready가 된다', async () => {
    const { vm, fakes, source } = createEditorVm();
    const gate = fakes.decoder.hold(source);
    vm.start();
    await settle();
    expect(vm.state.phase).toBe('loading');
    expect(vm.state.preview).toBeNull();
    gate.resolve();
    await settle();
    expect(vm.state.phase).toBe('ready');
  });
});

