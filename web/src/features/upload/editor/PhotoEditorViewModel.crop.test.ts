import { createEditorVm, openEditorVm, settle } from '../../../test/editorHarness';
import { IDENTITY_EDIT, isIdentityEdit } from '../editModel';
import { FULL_RECT, largestRect, ratioValue, rectToCropRegion, rotateRectClockwise } from './cropGeometry';
import type { CropRect } from './cropGeometry';
import { FILTER_THUMBNAIL_LONG_EDGE } from './PhotoEditorViewModel';

const PHOTO = { width: 4000, height: 3000 };
const ROTATED = { width: 3000, height: 4000 };

function expectRectClose(actual: CropRect, expected: CropRect): void {
  expect(actual.centerX).toBeCloseTo(expected.centerX, 9);
  expect(actual.centerY).toBeCloseTo(expected.centerY, 9);
  expect(actual.width).toBeCloseTo(expected.width, 9);
  expect(actual.height).toBeCloseTo(expected.height, 9);
}

describe('편집기 ViewModel: 자르기·회전 (REQ-EDIT-010~018)', () => {
  it('TC-EDIT-014 비율을 새로 고르면 이전 자르기 영역을 버리고 전체 이미지에서 새 비율로 다시 시작한다', async () => {
    const { vm } = await openEditorVm();
    vm.setCropRect({ centerX: 0.3, centerY: 0.3, width: 0.3, height: 0.3 });
    vm.selectRatio('4-5');
    expect(vm.state.ratio).toBe('4-5');
    expectRectClose(vm.state.cropRect, largestRect(PHOTO, 0.8));
    // 다른 비율로 바꿔도 직전 영역이 아니라 전체 이미지에서 다시 시작한다
    vm.setCropRect({ centerX: 0.2, centerY: 0.5, width: 0.2, height: 0.25 });
    vm.selectRatio('16-9');
    expectRectClose(vm.state.cropRect, largestRect(PHOTO, 16 / 9));
  });

  it('REQ-EDIT-011 "자유"는 현재 영역을 유지하고 비율 고정만 푼다', async () => {
    const { vm } = await openEditorVm();
    vm.selectRatio('1-1');
    const before = vm.state.cropRect;
    vm.selectRatio('free');
    expect(vm.state.ratio).toBe('free');
    expect(vm.state.cropRect).toEqual(before);
  });

  it('REQ-EDIT-012 "원본" 비율은 지금 회전 방향의 사진 비율을 고정 비율로 쓴다', async () => {
    const { vm } = await openEditorVm();
    vm.rotate();
    vm.selectRatio('original');
    expect(vm.state.ratio).toBe('original');
    expectRectClose(vm.state.cropRect, FULL_RECT);
    expect(ratioValue('original', ROTATED)).toBeCloseTo(0.75, 12);
    // 비율이 고정이라 줄이는 끌기를 해도 3:4가 유지된다
    vm.setCropRect({ centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.9 });
    const r = vm.state.cropRect;
    expect((r.width * ROTATED.width) / (r.height * ROTATED.height)).toBeCloseTo(0.75, 6);
  });

  it('TC-EDIT-015 "90도 회전"은 시계 방향으로 90도씩 돌고 4번이면 원상이다', async () => {
    const { vm } = await openEditorVm();
    const turns: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      vm.rotate();
      turns.push(vm.state.quarterTurns);
    }
    expect(turns).toEqual([1, 2, 3, 0]);
    expectRectClose(vm.state.cropRect, FULL_RECT);
  });

  it('TC-EDIT-015 REQ-EDIT-015 영역이 일부인 "자유"는 사진과 함께 돌고 4번이면 처음 영역이다', async () => {
    const { vm } = await openEditorVm();
    const part: CropRect = { centerX: 0.3, centerY: 0.4, width: 0.4, height: 0.6 };
    vm.setCropRect(part);
    vm.rotate();
    expectRectClose(vm.state.cropRect, rotateRectClockwise(part));
    vm.rotate();
    vm.rotate();
    vm.rotate();
    expectRectClose(vm.state.cropRect, part);
  });

  it('TC-EDIT-015 REQ-EDIT-014 고정 비율은 회전 뒤에도 같은 비율을 유지한다', async () => {
    const { vm } = await openEditorVm();
    vm.selectRatio('4-5');
    vm.rotate();
    expect(vm.state.ratio).toBe('4-5');
    expectRectClose(vm.state.cropRect, largestRect(ROTATED, 0.8));
  });

  it('TC-EDIT-015 사진이 준비되기 전에는 회전해도 현재 화면을 유지한다', () => {
    const { vm } = createEditorVm();
    vm.rotate();
    expect(vm.state.quarterTurns).toBe(0);
    expect(vm.state.phase).toBe('loading');
  });

  it('TC-EDIT-015 회전하면 새 회전으로 미리보기를 다시 그리고 편집값의 quarterTurns가 따라간다', async () => {
    const { vm, fakes } = await openEditorVm();
    vm.rotate();
    await settle();
    expect(fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!.edit.quarterTurns).toBe(1);
    expect(vm.draft().quarterTurns).toBe(1);
  });

  it('TC-EDIT-018 프레임 끌기 결과는 사진 밖으로 나가지 않고 최소 크기(짧은 변 0.1배) 아래로 줄지 않는다', async () => {
    const { vm } = await openEditorVm();
    vm.setCropRect({ centerX: 1.4, centerY: -0.2, width: 0.5, height: 0.5 });
    const outside = vm.state.cropRect;
    expect(outside.centerX + outside.width / 2).toBeLessThanOrEqual(1 + 1e-9);
    expect(outside.centerY - outside.height / 2).toBeGreaterThanOrEqual(-1e-9);
    vm.setCropRect({ centerX: 0.5, centerY: 0.5, width: 0.001, height: 0.001 });
    const tiny = vm.state.cropRect;
    expect(Math.min(tiny.width * PHOTO.width, tiny.height * PHOTO.height)).toBeGreaterThanOrEqual(300 - 1e-6);
  });

  it('TC-EDIT-018 고정 비율에서는 프레임을 어떻게 끌어도 비율이 유지된다', async () => {
    const { vm } = await openEditorVm();
    vm.selectRatio('1-1');
    vm.setCropRect({ centerX: 0.5, centerY: 0.5, width: 0.4, height: 0.9 });
    const r = vm.state.cropRect;
    expect((r.width * PHOTO.width) / (r.height * PHOTO.height)).toBeCloseTo(1, 6);
  });

  it('REQ-EDIT-016 TC-EDIT-012 자르기 "초기화"는 회전·자르기 영역·비율만 처음으로 되돌리고 필터와 조정은 유지한다', async () => {
    const { vm } = await openEditorVm();
    vm.rotate();
    vm.selectRatio('4-5');
    vm.selectFilter('warm');
    vm.setAdjustValue('saturation', 0.3);
    vm.resetCrop();
    expect(vm.state.quarterTurns).toBe(0);
    expect(vm.state.ratio).toBe('free');
    expect(vm.state.cropRect).toEqual(FULL_RECT);
    expect(vm.state.filter).toBe('warm');
    expect(vm.state.adjustmentLayers.manual).toEqual({ saturation: 0.3 });
  });

  it('TC-EDIT-012 자르기 초기화 + 조정 초기화 + 필터 원본으로 모두 기본값이 되면 isIdentity다', async () => {
    // REQ-EDIT-016/024에 따라 초기화 버튼은 각 도구의 값만 되돌린다. 카탈로그 TC-EDIT-012의 "모두 기본값"은 세 도구를 모두 되돌린 결과로 확인한다.
    const { vm } = await openEditorVm();
    vm.rotate();
    vm.selectRatio('4-5');
    vm.selectFilter('vivid');
    vm.setAdjustValue('exposure', 0.5);
    expect(vm.state.identity).toBe(false);
    vm.resetCrop();
    vm.resetAdjust();
    vm.selectFilter('original');
    expect(vm.state.identity).toBe(true);
    expect(isIdentityEdit(vm.draft())).toBe(true);
    const draft = vm.draft();
    expect(draft).toMatchObject({ quarterTurns: 0, crop: IDENTITY_EDIT.crop, filter: 'original' });
    expect(draft.adjustmentLayers.autoStrength).toBe(0);
    expect(draft.adjustmentLayers.manual).toEqual({});
  });

  it('TC-EDIT-022 자르기 도구에서는 프레임이 얹히므로 미리보기는 자르지 않은 사진으로 그리고, 다른 도구로 옮기면 자른 영역으로 다시 그린다', async () => {
    const { vm, fakes } = await openEditorVm();
    const part: CropRect = { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5 };
    vm.setCropRect(part);
    await settle();
    expect(fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!.edit.crop).toEqual(IDENTITY_EDIT.crop);
    vm.selectTool('filter');
    await settle();
    const after = fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!;
    expect(after.edit.crop).toEqual(rectToCropRegion(PHOTO, 0, part));
    // 다시 자르기 도구로 오면 프레임 아래는 다시 자르지 않은 사진
    vm.selectTool('crop');
    await settle();
    expect(fakes.preview.previews(FILTER_THUMBNAIL_LONG_EDGE).at(-1)!.edit.crop).toEqual(IDENTITY_EDIT.crop);
  });

  it('TC-EDIT-022 자르기를 바꾼 뒤 도구를 옮기면 잘린 이미지로 필터 썸네일을 다시 만든다', async () => {
    const { vm, fakes } = await openEditorVm();
    const thumbs = () => fakes.preview.calls.filter((c) => c.maxLongEdge <= FILTER_THUMBNAIL_LONG_EDGE);
    const initial = thumbs().length;
    expect(initial).toBeGreaterThanOrEqual(6);
    const part: CropRect = { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5 };
    vm.setCropRect(part);
    vm.selectTool('filter');
    await settle();
    const region = rectToCropRegion(PHOTO, 0, part);
    const regenerated = thumbs().slice(initial).filter((c) => c.edit.crop.width === region.width);
    expect(new Set(regenerated.map((c) => c.edit.filter)).size).toBe(6);
    for (const call of regenerated) expect(call.edit.crop).toEqual(region);
    // 자르기가 그대로면 도구를 오가도 썸네일을 다시 만들지 않는다
    const settled = thumbs().length;
    vm.selectTool('adjust');
    vm.selectTool('filter');
    await settle();
    expect(thumbs()).toHaveLength(settled);
  });

  it('TC-EDIT-045 취소하면 이번 편집에서 바꾼 필터·자르기·조정은 모두 버려지고 처음 편집값으로 확정되지 않는다', async () => {
    const { vm, confirmed, cancels } = await openEditorVm();
    vm.selectFilter('warm');
    vm.rotate();
    vm.cancel();
    expect(cancels.count).toBe(1);
    expect(confirmed).toHaveLength(0);
  });
});
