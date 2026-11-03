import { createEditorVm, openEditorVm, settle } from '../../../test/editorHarness';
import { NO_AUTO_VALUES } from '../editModel';
import type { PhotoEdit } from '../editModel';
import { AUTO_ANALYSIS_LONG_EDGE } from './autoAdjust';
import type { CropRect } from './cropGeometry';
import { rectToCropRegion } from './cropGeometry';
import { FILTER_THUMBNAIL_LONG_EDGE } from './PhotoEditorViewModel';

const PHOTO = { width: 4000, height: 3000 };
const AUTO = { ...NO_AUTO_VALUES, exposure: 0.4, contrast: 0.2 };

describe('편집기 ViewModel: 조정 (REQ-EDIT-019~027)', () => {
  it('REQ-EDIT-020 TC-EDIT-032 처음 선택된 항목은 "자동"이고 자동 보정은 꺼져(강도 0) 있다. 분석값은 준비되어 있지만 적용되지 않는다', async () => {
    const { vm, fakes } = await openEditorVm();
    expect(vm.state.adjustItem).toBe('auto');
    expect(vm.state.adjustmentLayers.autoStrength).toBe(0);
    expect(vm.state.adjustmentLayers.autoValues).toEqual(AUTO);
    expect(vm.state.adjustValues).toEqual(NO_AUTO_VALUES);
    expect(fakes.analyzer.calls[0]).toMatchObject({ longEdge: AUTO_ANALYSIS_LONG_EDGE, region: { quarterTurns: 0, crop: { centerX: 0.5, centerY: 0.5, width: 1, height: 1 } } });
  });

  it('REQ-EDIT-021 다른 항목에서 "자동"으로 옮겨 오면 꺼져 있을 때만 강도 1로 켠다', async () => {
    const { vm } = await openEditorVm();
    vm.selectAdjustItem('exposure');
    expect(vm.state.adjustItem).toBe('exposure');
    expect(vm.state.adjustmentLayers.autoStrength).toBe(0);
    vm.selectAdjustItem('auto');
    expect(vm.state.adjustItem).toBe('auto');
    expect(vm.state.adjustmentLayers.autoStrength).toBe(1);
    // 켜져 있는 채로 다른 항목에 갔다 오면 그대로 켜져 있다(다시 1로 켤 뿐 끄지 않는다)
    vm.setAutoStrength(0.5);
    vm.selectAdjustItem('contrast');
    vm.selectAdjustItem('auto');
    expect(vm.state.adjustmentLayers.autoStrength).toBe(0.5);
  });

  it('REQ-EDIT-021 TC-EDIT-032 이미 "자동"이 선택된 상태에서 다시 누르면 켜짐(1)과 꺼짐(0)을 번갈아 바꾼다', async () => {
    const { vm } = await openEditorVm();
    expect(vm.state.adjustItem).toBe('auto');
    vm.selectAdjustItem('auto');
    expect(vm.state.adjustmentLayers.autoStrength).toBe(1);
    vm.selectAdjustItem('auto');
    expect(vm.state.adjustmentLayers.autoStrength).toBe(0);
    vm.selectAdjustItem('auto');
    expect(vm.state.adjustmentLayers.autoStrength).toBe(1);
  });

  it('TC-EDIT-032 자동 보정을 켜면 항목마다 분석값 × 강도로 채워지고 미리보기·썸네일에 적용된다', async () => {
    const { vm, fakes } = await openEditorVm();
    vm.toggleAuto();
    await settle();
    expect(vm.state.adjustValues).toMatchObject({ exposure: 0.4, contrast: 0.2, shadows: 0 });
    const preview = fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!;
    expect(preview.edit.adjustmentLayers.autoStrength).toBe(1);
    expect(preview.edit.adjustmentLayers.autoValues).toEqual(AUTO);
    const thumbs = fakes.preview.calls.filter((c) => c.maxLongEdge <= FILTER_THUMBNAIL_LONG_EDGE).slice(-6);
    expect(thumbs).toHaveLength(6);
    for (const call of thumbs) expect(call.edit.adjustmentLayers.autoStrength).toBe(1);
  });

  it('TC-EDIT-032 강도(0~1)를 바꾸면 값이 그만큼 따라가고 끄면 0이 된다', async () => {
    const { vm } = await openEditorVm();
    vm.setAutoStrength(0.5);
    expect(vm.state.adjustValues.exposure).toBeCloseTo(0.2, 12);
    expect(vm.state.adjustValues.contrast).toBeCloseTo(0.1, 12);
    vm.setAutoStrength(2);
    expect(vm.state.adjustmentLayers.autoStrength).toBe(1);
    vm.toggleAuto();
    expect(vm.state.adjustmentLayers.autoStrength).toBe(0);
    expect(vm.state.adjustValues).toEqual(NO_AUTO_VALUES);
  });

  it('TC-EDIT-030 사용자가 만진 항목은 그 값, 아니면 자동값 × 강도다: 사용자 노출 0.3 → (0.3, 0.2), 강도 0.5 → (0.3, 0.1), 자동 끔 → (0.3, 0)', async () => {
    const { vm } = await openEditorVm();
    vm.toggleAuto();
    vm.setAdjustValue('exposure', 0.3);
    expect(vm.state.adjustValues.exposure).toBeCloseTo(0.3, 12);
    expect(vm.state.adjustValues.contrast).toBeCloseTo(0.2, 12);
    vm.setAutoStrength(0.5);
    expect(vm.state.adjustValues.exposure).toBeCloseTo(0.3, 12);
    expect(vm.state.adjustValues.contrast).toBeCloseTo(0.1, 12);
    vm.toggleAuto(); // 0.5 → 꺼짐
    expect(vm.state.adjustValues.exposure).toBeCloseTo(0.3, 12);
    expect(vm.state.adjustValues.contrast).toBe(0);
  });

  it('TC-EDIT-031 자동 보정 몫 위치로 되돌리면 직접 만진 표시가 지워져 다시 자동 보정을 따른다', async () => {
    const { vm } = await openEditorVm();
    vm.toggleAuto();
    vm.setAdjustValue('exposure', 0.1);
    expect(vm.state.adjustmentLayers.manual.exposure).toBeCloseTo(0.1, 12);
    vm.setAdjustValue('exposure', 0.4);
    expect('exposure' in vm.state.adjustmentLayers.manual).toBe(false);
    vm.setAutoStrength(0.5);
    expect(vm.state.adjustValues.exposure).toBeCloseTo(0.2, 12);
  });

  it('TC-EDIT-031 자동 보정을 켜기 전에 만진 항목은 켜도 사용자 값이 유지된다', async () => {
    const { vm } = await openEditorVm();
    vm.setAdjustValue('exposure', 0.3);
    vm.selectAdjustItem('auto');
    expect(vm.state.adjustmentLayers.autoStrength).toBe(1);
    expect(vm.state.adjustValues.exposure).toBeCloseTo(0.3, 12);
    expect(vm.state.adjustValues.contrast).toBeCloseTo(0.2, 12);
  });

  it('TC-EDIT-023 직접 조정 값은 -1~1로 자른다', async () => {
    const { vm } = await openEditorVm();
    vm.setAdjustValue('warmth', 7);
    expect(vm.state.adjustValues.warmth).toBe(1);
    vm.setAdjustValue('warmth', -7);
    expect(vm.state.adjustValues.warmth).toBe(-1);
  });

  it('REQ-EDIT-024 조정 "초기화"는 강도 0, 직접 값 모두 삭제, 분석해 둔 값은 유지(다시 켜도 재분석하지 않음)한다', async () => {
    const { vm, fakes } = await openEditorVm();
    vm.toggleAuto();
    vm.setAdjustValue('exposure', 0.3);
    vm.setAdjustValue('saturation', -0.5);
    vm.resetAdjust();
    expect(vm.state.adjustmentLayers.autoStrength).toBe(0);
    expect(vm.state.adjustmentLayers.manual).toEqual({});
    expect(vm.state.adjustmentLayers.autoValues).toEqual(AUTO);
    expect(vm.state.adjustValues).toEqual(NO_AUTO_VALUES);
    vm.toggleAuto();
    await settle();
    expect(vm.state.adjustValues.exposure).toBeCloseTo(0.4, 12);
    expect(fakes.analyzer.calls).toHaveLength(1);
  });

  it('REQ-EDIT-016 조정 초기화는 회전·자르기·필터를 건드리지 않는다', async () => {
    const { vm } = await openEditorVm();
    vm.rotate();
    vm.selectFilter('cool');
    vm.setAdjustValue('contrast', 0.5);
    vm.resetAdjust();
    expect(vm.state.quarterTurns).toBe(1);
    expect(vm.state.filter).toBe('cool');
  });

  it('REQ-EDIT-027 사진을 분석할 수 없으면(null) 자동 보정은 아무것도 바꾸지 않는다', async () => {
    const { vm, fakes } = createEditorVm();
    fakes.analyzer.result = null;
    vm.start();
    await settle();
    vm.selectAdjustItem('auto');
    expect(vm.state.adjustmentLayers.autoValues).toEqual(NO_AUTO_VALUES);
    expect(vm.state.adjustValues).toEqual(NO_AUTO_VALUES);
    expect(vm.state.identity).toBe(true);
  });

  it('조정 값이 바뀌면 미리보기를 편집값(조정 포함)으로 다시 그린다', async () => {
    const { vm, fakes } = await openEditorVm();
    vm.setAdjustValue('saturation', 0.25);
    await settle();
    const last = fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!;
    expect(last.edit.adjustmentLayers.manual).toEqual({ saturation: 0.25 });
  });
});

describe('편집기 ViewModel: 자동 보정값 분석 시점 (REQ-EDIT-025, TC-EDIT-037)', () => {
  const part: CropRect = { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5 };
  const partRegion = rectToCropRegion(PHOTO, 0, part);

  it('TC-EDIT-037 편집기를 처음 열 때 한 번 분석한다(자른 영역 = 전체)', async () => {
    const { fakes } = await openEditorVm();
    expect(fakes.analyzer.calls).toHaveLength(1);
  });

  it('TC-EDIT-037 자르기를 바꾼 뒤 도구를 옮기면 자른 영역 기준으로 다시 분석한다', async () => {
    const { vm, fakes } = await openEditorVm();
    vm.setCropRect(part);
    await settle();
    expect(fakes.analyzer.calls).toHaveLength(1); // 도구를 옮기기 전에는 분석하지 않는다
    vm.selectTool('adjust');
    await settle();
    expect(fakes.analyzer.calls).toHaveLength(2);
    expect(fakes.analyzer.calls[1]!.region).toEqual({ quarterTurns: 0, crop: partRegion });
    expect(fakes.analyzer.calls[1]!.longEdge).toBe(256);
  });

  it('TC-EDIT-037 같은 자르기로 이미 분석했으면 도구를 오가도 다시 분석하지 않는다', async () => {
    const { vm, fakes } = await openEditorVm();
    vm.setCropRect(part);
    vm.selectTool('adjust');
    await settle();
    vm.selectTool('filter');
    vm.selectTool('crop');
    vm.selectTool('adjust');
    await settle();
    expect(fakes.analyzer.calls).toHaveLength(2);
  });

  it('TC-EDIT-037 회전해도 분석 영역이 바뀌므로 도구를 옮기면 다시 분석한다', async () => {
    const { vm, fakes } = await openEditorVm();
    vm.rotate();
    vm.selectTool('adjust');
    await settle();
    expect(fakes.analyzer.calls).toHaveLength(2);
    expect(fakes.analyzer.calls[1]!.region.quarterTurns).toBe(1);
  });

  it('TC-EDIT-037 분석이 끝나면 새 값이 반영되고 강도·직접 값은 그대로다', async () => {
    const { vm, fakes } = await openEditorVm();
    vm.toggleAuto();
    vm.setAdjustValue('saturation', 0.2);
    fakes.analyzer.result = { ...NO_AUTO_VALUES, exposure: 0.1 };
    vm.setCropRect(part);
    vm.selectTool('filter');
    await settle();
    expect(vm.state.adjustmentLayers.autoValues.exposure).toBeCloseTo(0.1, 12);
    expect(vm.state.adjustmentLayers.autoStrength).toBe(1);
    expect(vm.state.adjustmentLayers.manual.saturation).toBeCloseTo(0.2, 12);
    expect(vm.state.adjustValues.exposure).toBeCloseTo(0.1, 12);
  });

  it('TC-EDIT-037 자동 보정을 켠 채 완료할 때 자른 영역이 분석과 다르면(도구를 옮기지 않았어도) 다시 분석해 그 값을 저장한다', async () => {
    const { vm, fakes, confirmed } = await openEditorVm();
    vm.toggleAuto();
    fakes.analyzer.result = (region) => ({ ...NO_AUTO_VALUES, exposure: region.crop.width === 0.5 ? 0.25 : 0.4 });
    vm.setCropRect(part);
    await vm.confirm();
    expect(fakes.analyzer.calls).toHaveLength(2);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.crop).toEqual(partRegion);
    expect(confirmed[0]!.adjustmentLayers.autoValues.exposure).toBeCloseTo(0.25, 12);
    expect(confirmed[0]!.adjustmentLayers.autoStrength).toBe(1);
  });

  it('TC-EDIT-037 자동 보정을 끄고 완료하면 자동값을 저장하지 않고 다시 분석하지도 않는다', async () => {
    const { vm, fakes, confirmed } = await openEditorVm();
    vm.setCropRect(part);
    vm.setAdjustValue('saturation', 0.2);
    await vm.confirm();
    expect(fakes.analyzer.calls).toHaveLength(1);
    expect(confirmed[0]!.adjustmentLayers.autoStrength).toBe(0);
    expect(confirmed[0]!.adjustmentLayers.autoValues).toEqual(NO_AUTO_VALUES);
    expect(confirmed[0]!.adjustmentLayers.manual).toEqual({ saturation: 0.2 });
  });

  it('TC-EDIT-037 자동 보정을 켠 채 완료한 사진을 같은 자르기로 다시 열면 저장값을 쓰고 재분석하지 않는다', async () => {
    const saved: PhotoEdit = {
      quarterTurns: 0,
      crop: partRegion,
      filter: 'original',
      adjustmentLayers: { autoValues: { ...NO_AUTO_VALUES, exposure: 0.33 }, autoStrength: 1, manual: {} },
    };
    const { vm, fakes } = await openEditorVm({ initialEdit: saved });
    expect(fakes.analyzer.calls).toHaveLength(0);
    expect(vm.state.adjustValues.exposure).toBeCloseTo(0.33, 12);
    // 도구를 옮겨도(자르기가 그대로) 분석하지 않는다
    vm.selectTool('adjust');
    await settle();
    expect(fakes.analyzer.calls).toHaveLength(0);
  });

  it('TC-EDIT-037 저장값으로 다시 연 뒤 자르기를 바꾸면 그때는 다시 분석한다', async () => {
    const saved: PhotoEdit = {
      quarterTurns: 0,
      crop: partRegion,
      filter: 'original',
      adjustmentLayers: { autoValues: { ...NO_AUTO_VALUES, exposure: 0.33 }, autoStrength: 1, manual: {} },
    };
    const { vm, fakes } = await openEditorVm({ initialEdit: saved });
    vm.setCropRect({ centerX: 0.5, centerY: 0.5, width: 0.8, height: 0.8 });
    vm.selectTool('adjust');
    await settle();
    expect(fakes.analyzer.calls).toHaveLength(1);
  });

  it('TC-EDIT-037 자동 보정을 끄고 완료한 사진(저장된 자동값 없음)을 다시 열면 열 때 분석한다', async () => {
    const saved: PhotoEdit = { quarterTurns: 0, crop: partRegion, filter: 'original', adjustmentLayers: { autoValues: NO_AUTO_VALUES, autoStrength: 0, manual: {} } };
    const { fakes } = await openEditorVm({ initialEdit: saved });
    expect(fakes.analyzer.calls).toHaveLength(1);
    expect(fakes.analyzer.calls[0]!.region.crop).toEqual(partRegion);
  });

  it('분석이 끝나기 전에 닫으면(dispose) 결과를 반영하지 않는다', async () => {
    const { vm, fakes } = createEditorVm();
    const gate = fakes.analyzer.hold();
    vm.start();
    await settle();
    vm.dispose();
    gate.resolve();
    await settle();
    expect(vm.state.adjustmentLayers.autoValues).toEqual(NO_AUTO_VALUES);
  });
});
