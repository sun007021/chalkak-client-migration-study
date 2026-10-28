import { analyzeAutoAdjust } from './PhotoAutoAdjuster';
import { identityEdit, type PhotoEdit } from './PhotoEdit';
import { createEditHarness, grayRamp } from './__testing__/createEditHarness';

const lowContrast = () => grayRamp(64, 4, 140, 200);

async function started(options: Parameters<typeof createEditHarness>[0] = {}) {
  const h = createEditHarness({ sample: lowContrast, ...options });
  await h.viewModel.start();
  return h;
}

describe('PhotoEditViewModel 조정', () => {
  it('REQ-EDIT-020 처음 선택된 조정 항목은 "자동"이고 자동 보정은 꺼져 있다', async () => {
    const h = await started();
    const s = h.viewModel.getSnapshot();
    expect(s.selectedAdjust).toBe('auto');
    expect(s.autoOn).toBe(false);
    expect(s.adjustments.autoStrength).toBe(0);
  });

  it('TC-EDIT-023 직접 조정 값은 -1~1이고 소수 둘째 자리(화면 정수 -100~100)로 다룬다', async () => {
    const h = await started();
    h.viewModel.setAdjustValue('exposure', 1.5);
    expect(h.viewModel.getSnapshot().adjustValues.exposure).toBe(1);
    h.viewModel.setAdjustValue('exposure', -3);
    expect(h.viewModel.getSnapshot().adjustValues.exposure).toBe(-1);
    h.viewModel.setAdjustValue('saturation', 0.123);
    expect(h.viewModel.getSnapshot().adjustValues.saturation).toBeCloseTo(0.12, 10);
  });

  it('REQ-EDIT-021 처음 "자동"이 선택된 상태에서 다시 누르면 켜짐(1)과 꺼짐(0)을 번갈아 바꾼다', async () => {
    const h = await started();
    await h.viewModel.selectAdjust('auto');
    expect(h.viewModel.getSnapshot().adjustments.autoStrength).toBe(1);
    expect(h.viewModel.getSnapshot().autoOn).toBe(true);
    await h.viewModel.selectAdjust('auto');
    expect(h.viewModel.getSnapshot().adjustments.autoStrength).toBe(0);
    await h.viewModel.selectAdjust('auto');
    expect(h.viewModel.getSnapshot().adjustments.autoStrength).toBe(1);
  });

  it('REQ-EDIT-021 다른 항목에서 "자동"으로 옮겨 오면 꺼져 있을 때만 강도 1로 켠다', async () => {
    const h = await started();
    await h.viewModel.selectAdjust('exposure');
    expect(h.viewModel.getSnapshot().adjustments.autoStrength).toBe(0);
    await h.viewModel.selectAdjust('auto');
    expect(h.viewModel.getSnapshot().adjustments.autoStrength).toBe(1);

    h.viewModel.setAutoStrength(0.5);
    await h.viewModel.selectAdjust('exposure');
    await h.viewModel.selectAdjust('auto');
    expect(h.viewModel.getSnapshot().adjustments.autoStrength).toBe(0.5);
  });

  it('TC-EDIT-032 자동 보정을 켜면 항목마다 분석값 x 강도로 채워지고, 고른 자동 보정을 다시 누르면 꺼진다', async () => {
    const h = await started();
    const analyzed = analyzeAutoAdjust(lowContrast());
    expect(h.viewModel.getSnapshot().adjustments.auto).toEqual(analyzed);
    await h.viewModel.selectAdjust('auto'); // 켬
    const on = h.viewModel.getSnapshot().adjustValues;
    expect(on.exposure).toBeCloseTo(analyzed.exposure);
    expect(on.blackPoint).toBeCloseTo(analyzed.blackPoint);
    expect(on.contrast).toBeCloseTo(analyzed.contrast);
    h.viewModel.setAutoStrength(0.5);
    expect(h.viewModel.getSnapshot().adjustValues.contrast).toBeCloseTo(analyzed.contrast * 0.5);
    await h.viewModel.selectAdjust('auto'); // 이미 선택됨 -> 끔
    expect(h.viewModel.getSnapshot().autoOn).toBe(false);
    expect(h.viewModel.getSnapshot().adjustValues.contrast).toBeCloseTo(0);
  });

  it('TC-EDIT-030 자동 보정을 켜고 끄거나 강도를 바꿔도 사용자가 직접 만진 항목은 그대로 남는다', async () => {
    const h = await started();
    h.viewModel.setAdjustValue('exposure', 0.3);
    await h.viewModel.selectAdjust('exposure');
    await h.viewModel.selectAdjust('auto');
    const analyzed = analyzeAutoAdjust(lowContrast());
    let v = h.viewModel.getSnapshot().adjustValues;
    expect(v.exposure).toBeCloseTo(0.3);
    expect(v.contrast).toBeCloseTo(analyzed.contrast);
    h.viewModel.setAutoStrength(0);
    v = h.viewModel.getSnapshot().adjustValues;
    expect(v.exposure).toBeCloseTo(0.3);
    expect(v.contrast).toBeCloseTo(0);
  });

  it('TC-EDIT-031 항목을 자동 보정 몫과 같은 값으로 되돌리면 직접 만진 표시가 지워진다', async () => {
    const h = await started();
    await h.viewModel.selectAdjust('auto'); // 켬
    const analyzed = analyzeAutoAdjust(lowContrast());
    h.viewModel.setAdjustValue('contrast', 0.05);
    expect(h.viewModel.getSnapshot().adjustments.user).toHaveProperty('contrast');
    h.viewModel.setAdjustValue('contrast', analyzed.contrast);
    expect(h.viewModel.getSnapshot().adjustments.user).not.toHaveProperty('contrast');
  });

  it('REQ-EDIT-024 조정 "초기화"는 자동 강도를 0으로, 직접 만진 값을 모두 지우되 분석해 둔 값은 유지한다', async () => {
    const h = await started();
    await h.viewModel.selectAdjust('auto');
    h.viewModel.setAdjustValue('warmth', 0.4);
    const analyzed = analyzeAutoAdjust(lowContrast());
    h.viewModel.resetAdjustments();
    const s = h.viewModel.getSnapshot();
    expect(s.autoOn).toBe(false);
    expect(s.adjustments.user).toEqual({});
    expect(s.adjustments.auto).toEqual(analyzed);
    expect(Object.values(s.adjustValues).every((v) => Math.abs(v) < 1e-12)).toBe(true);
  });

  it('REQ-EDIT-027 사진을 분석할 수 없으면 자동 보정은 아무것도 바꾸지 않는다', async () => {
    const h = await started({ sample: () => null });
    await h.viewModel.selectAdjust('auto');
    const s = h.viewModel.getSnapshot();
    expect(s.status).toBe('ready');
    expect(Object.values(s.adjustValues).every((v) => Math.abs(v) < 1e-12)).toBe(true);
  });

  it('TC-EDIT-036 분석 표본은 자른 영역을 긴 변 256 px로 줄여 요청한다', async () => {
    const h = await started();
    const [request] = h.engine.sampleRequests;
    expect(request.maxLongEdge).toBe(256);
    expect(request.quarterTurns).toBe(0);
    expect(request.crop).toEqual({ centerX: 0.5, centerY: 0.5, width: 1, height: 1 });
  });

  it('REQ-EDIT-025 자르기를 바꾼 뒤 탭을 옮길 때 자른 영역 기준으로 다시 분석하고, 같은 자르기면 다시 분석하지 않는다', async () => {
    const h = await started();
    expect(h.engine.sampleRequests).toHaveLength(1);
    h.viewModel.resizeCrop('top-left', 0.2, 0.2);
    await h.viewModel.selectTab('adjust');
    expect(h.engine.sampleRequests).toHaveLength(2);
    expect(h.engine.sampleRequests[1].crop.width).toBeCloseTo(0.8);
    await h.viewModel.selectTab('filter');
    await h.viewModel.selectTab('adjust');
    expect(h.engine.sampleRequests).toHaveLength(2);
  });

  it('REQ-EDIT-025 자동 보정을 켠 채 "완료"할 때 자르기가 바뀌었으면 다시 분석하고, 꺼져 있으면 분석하지 않는다', async () => {
    const on = await started();
    await on.viewModel.selectAdjust('auto');
    on.viewModel.resizeCrop('bottom-right', -0.3, -0.3);
    await on.viewModel.done();
    expect(on.engine.sampleRequests).toHaveLength(2);

    const off = await started();
    off.viewModel.resizeCrop('bottom-right', -0.3, -0.3);
    await off.viewModel.done();
    expect(off.engine.sampleRequests).toHaveLength(1);
  });

  describe('TC-EDIT-037 저장된 자동 보정값', () => {
    const savedOn: PhotoEdit = {
      ...identityEdit(),
      adjustments: {
        auto: { ...identityEdit().adjustments.auto, exposure: 0.4, contrast: 0.2 },
        autoStrength: 1,
        user: {},
      },
    };

    it('자동 보정을 켠 채 완료한 사진을 같은 자르기로 다시 열면 저장값을 쓰고 재분석하지 않는다', async () => {
      const h = await started({ initialEdit: savedOn });
      expect(h.engine.sampleRequests).toHaveLength(0);
      const s = h.viewModel.getSnapshot();
      expect(s.autoOn).toBe(true);
      expect(s.adjustValues.exposure).toBeCloseTo(0.4);
      expect(s.adjustValues.contrast).toBeCloseTo(0.2);
    });

    it('끄고 완료하면 자동값을 저장하지 않아 다시 열면 처음부터 분석한다', async () => {
      const first = await started();
      await first.viewModel.done();
      expect(Object.values(first.done[0].adjustments.auto).every((v) => v === 0)).toBe(true);
      const reopened = await started({ initialEdit: first.done[0] });
      expect(reopened.engine.sampleRequests).toHaveLength(1);
    });

    it('저장된 자르기 영역을 열면 그 영역(편집값 좌표)으로 분석 표본을 요청한다', async () => {
      const cropped: PhotoEdit = {
        ...identityEdit(),
        crop: { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5 },
      };
      const h = await started({ initialEdit: cropped });
      expect(h.engine.sampleRequests).toHaveLength(1);
      expect(h.engine.sampleRequests[0].crop).toEqual(cropped.crop);
    });
  });
});
