import { fitLargestCrop, type CropRect } from './CropGeometry';
import { createEditHarness } from './__testing__/createEditHarness';

const LANDSCAPE = { width: 4000, height: 3000 };
const pixelRatio = (r: CropRect, size: { width: number; height: number }) =>
  (r.width * size.width) / (r.height * size.height);

async function started() {
  const h = createEditHarness({ sourceSize: LANDSCAPE });
  await h.viewModel.start();
  return h;
}

describe('PhotoEditViewModel 자르기·회전', () => {
  it('TC-EDIT-014 비율을 새로 고르면 이전 자르기 영역을 버리고 전체 이미지에서 새 비율로 다시 시작한다', async () => {
    const h = await started();
    h.viewModel.resizeCrop('top-left', 0.3, 0.3);
    h.viewModel.moveCrop(0.1, 0);
    h.viewModel.selectAspect('1:1');
    const s = h.viewModel.getSnapshot();
    expect(s.aspect).toBe('1:1');
    const expected = fitLargestCrop(LANDSCAPE, 1);
    expect(s.cropRect.centerX).toBeCloseTo(expected.centerX);
    expect(s.cropRect.centerY).toBeCloseTo(expected.centerY);
    expect(s.cropRect.width).toBeCloseTo(expected.width);
    expect(s.cropRect.height).toBeCloseTo(expected.height);
  });

  it('REQ-EDIT-011 "자유"는 현재 영역을 유지하고 비율 고정을 푼다', async () => {
    const h = await started();
    h.viewModel.selectAspect('1:1');
    const before = h.viewModel.getSnapshot().cropRect;
    h.viewModel.selectAspect('free');
    expect(h.viewModel.getSnapshot().cropRect).toEqual(before);
    h.viewModel.resizeCrop('bottom-right', -0.1, 0);
    const after = h.viewModel.getSnapshot().cropRect;
    expect(pixelRatio(after, LANDSCAPE)).not.toBeCloseTo(1, 3);
  });

  it('REQ-EDIT-012 "원본" 비율은 지금 회전 방향의 사진 가로세로 비율을 고정 비율로 쓴다(회전 뒤에는 가로세로가 바뀐다)', async () => {
    const h = await started();
    h.viewModel.selectAspect('original');
    expect(h.viewModel.getSnapshot().cropRect).toEqual({
      centerX: 0.5,
      centerY: 0.5,
      width: 1,
      height: 1,
    });
    h.viewModel.resizeCrop('bottom-right', -0.2, -0.2);
    expect(pixelRatio(h.viewModel.getSnapshot().cropRect, LANDSCAPE)).toBeCloseTo(4 / 3, 6);
    h.viewModel.rotate();
    const s = h.viewModel.getSnapshot();
    expect(s.aspect).toBe('original');
    expect(s.cropRect).toEqual({ centerX: 0.5, centerY: 0.5, width: 1, height: 1 });
    h.viewModel.resizeCrop('bottom-right', -0.2, -0.2);
    expect(
      pixelRatio(h.viewModel.getSnapshot().cropRect, { width: 3000, height: 4000 }),
    ).toBeCloseTo(3 / 4, 6);
  });

  it('TC-EDIT-015 "90도 회전"은 시계 방향으로 90도씩 돌고 4번이면 처음으로 돌아온다', async () => {
    const h = await started();
    const turns: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      h.viewModel.rotate();
      turns.push(h.viewModel.getSnapshot().quarterTurns);
    }
    expect(turns).toEqual([1, 2, 3, 0]);
    expect(h.viewModel.getSnapshot().isIdentity).toBe(true);
  });

  it('TC-EDIT-015 고정 비율은 회전 뒤에도 같은 비율로 다시 가장 크게 맞춘다', async () => {
    const h = await started();
    h.viewModel.selectAspect('4:5');
    h.viewModel.rotate();
    const s = h.viewModel.getSnapshot();
    expect(s.aspect).toBe('4:5');
    const expected = fitLargestCrop({ width: 3000, height: 4000 }, 0.8);
    expect(s.cropRect.width).toBeCloseTo(expected.width);
    expect(s.cropRect.height).toBeCloseTo(expected.height);
    expect(pixelRatio(s.cropRect, { width: 3000, height: 4000 })).toBeCloseTo(0.8, 6);
  });

  it('TC-EDIT-015 준비되기 전에는 현재 화면을 유지한다(회전 입력 무시) [가정]', async () => {
    const h = createEditHarness({ sourceSize: LANDSCAPE });
    const hold = h.engine.holdNext('prepareEditable');
    const started = h.viewModel.start();
    h.viewModel.rotate();
    expect(h.viewModel.getSnapshot().quarterTurns).toBe(0);
    hold.release();
    await started;
    h.viewModel.rotate();
    expect(h.viewModel.getSnapshot().quarterTurns).toBe(1);
  });

  it('TC-EDIT-016 1회전한 사진의 왼쪽 절반을 자르고 확정하면 CropWindow(0.5, 0.75, 0.5, 1)이다', async () => {
    const h = await started();
    h.viewModel.rotate();
    h.viewModel.resizeCrop('top-right', -0.5, 0);
    await h.viewModel.done();
    const { crop, quarterTurns } = h.done[0];
    expect(quarterTurns).toBe(1);
    expect(crop.centerX).toBeCloseTo(0.5);
    expect(crop.centerY).toBeCloseTo(0.75);
    expect(crop.width).toBeCloseTo(0.5);
    expect(crop.height).toBeCloseTo(1);
  });

  it('TC-EDIT-018 영역을 끌어도 사진 밖으로 나가지 않는다', async () => {
    const h = await started();
    h.viewModel.resizeCrop('bottom-right', -0.5, -0.5);
    h.viewModel.moveCrop(5, 5);
    const r = h.viewModel.getSnapshot().cropRect;
    expect(r.centerX + r.width / 2).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.centerY + r.height / 2).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('REQ-EDIT-016 자르기 "초기화"는 회전과 자르기 영역·비율만 처음으로 되돌리고 필터와 조정은 유지한다', async () => {
    const h = await started();
    h.viewModel.rotate();
    h.viewModel.selectAspect('9:16');
    h.viewModel.selectFilter('warm');
    h.viewModel.setAdjustValue('exposure', 0.3);
    h.viewModel.resetCrop();
    const s = h.viewModel.getSnapshot();
    expect(s.quarterTurns).toBe(0);
    expect(s.aspect).toBe('free');
    expect(s.cropRect).toEqual({ centerX: 0.5, centerY: 0.5, width: 1, height: 1 });
    expect(s.filter).toBe('warm');
    expect(s.adjustValues.exposure).toBeCloseTo(0.3);
  });

  it('TC-EDIT-012 회전·자르기·조정·필터를 각 "초기화"로 되돌리면 모두 기본값이 되고 identity다', async () => {
    const h = await started();
    h.viewModel.rotate();
    h.viewModel.resizeCrop('top-left', 0.2, 0.2);
    h.viewModel.setAdjustValue('contrast', -0.4);
    h.viewModel.selectFilter('vivid');
    expect(h.viewModel.getSnapshot().isIdentity).toBe(false);
    h.viewModel.resetCrop();
    h.viewModel.resetAdjustments();
    h.viewModel.selectFilter('original');
    expect(h.viewModel.getSnapshot().isIdentity).toBe(true);
  });

  it('TC-EDIT-010 편집값에는 EXIF·메타데이터가 아니라 회전 횟수만 담긴다(방향은 편집용 이미지가 이미 반영)', async () => {
    const h = await started();
    await h.viewModel.done();
    expect(Object.keys(h.done[0]).sort()).toEqual([
      'adjustments',
      'crop',
      'filter',
      'quarterTurns',
      'straightenDegrees',
    ]);
  });
});

describe('PhotoEditViewModel 자르기 취소와 필터 유지', () => {
  it('TC-EDIT-022 자르기를 마친 편집값에는 먼저 고른 필터가 그대로 들어간다(필터는 자르기와 별개로 다시 적용)', async () => {
    const h = await started();
    h.viewModel.selectFilter('vintage');
    h.viewModel.selectAspect('1:1');
    h.viewModel.rotate();
    await h.viewModel.done();
    expect(h.done).toHaveLength(1);
    expect(h.done[0]).toMatchObject({ filter: 'vintage', quarterTurns: 1 });
  });

  it('TC-EDIT-022 자르기 중 회전·비율 변경을 취소하면 편집값이 나가지 않고, 같은 초기값으로 다시 열면 이전 자르기가 유지된다', async () => {
    // [가정: 도구별 취소 대신 편집기 전체 "취소"가 회전·비율 변경을 버린다(값만 다루는 편집기)]
    const first = await started();
    first.viewModel.resizeCrop('bottom-right', -0.3, -0.3);
    await first.viewModel.done();
    const saved = first.done[0];

    const second = createEditHarness({ sourceSize: LANDSCAPE, initialEdit: saved });
    await second.viewModel.start();
    const before = second.viewModel.getSnapshot().cropRect;
    second.viewModel.rotate();
    second.viewModel.selectAspect('9:16');
    second.viewModel.cancel();
    expect(second.done).toEqual([]);
    expect(second.cancels).toHaveLength(1);

    const third = createEditHarness({ sourceSize: LANDSCAPE, initialEdit: saved });
    await third.viewModel.start();
    expect(third.viewModel.getSnapshot().cropRect).toEqual(before);
    expect(third.viewModel.getSnapshot().quarterTurns).toBe(saved.quarterTurns);
  });
});
