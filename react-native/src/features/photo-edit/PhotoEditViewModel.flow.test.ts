import { CancelledError } from '../../core/http/ApiError';
import { t } from '../../shared/copy';
import { POST_IMAGE_MAX_LONG_EDGE } from '../../shared/constants';
import { ImageDecodeError } from './ImageErrors';
import { identityEdit, isIdentityEdit, type PhotoEdit } from './PhotoEdit';
import { EDIT_SOURCE_URI, createEditHarness, grayRamp } from './__testing__/createEditHarness';

describe('PhotoEditViewModel 시작과 확정', () => {
  it('TC-EDIT-001 만들기만 해서는 이미지 작업을 하지 않고, start를 여러 번 불러도 편집용 이미지·자동 보정 분석은 한 번만 한다', async () => {
    const h = createEditHarness({ sample: () => grayRamp(16, 4, 140, 200) });
    expect(h.engine.calls).toEqual([]);
    await Promise.all([h.viewModel.start(), h.viewModel.start()]);
    await h.viewModel.start();
    expect(h.engine.callsOf('prepareEditable')).toHaveLength(1);
    expect(h.engine.callsOf('samplePixels')).toHaveLength(1);
    expect(h.engine.callsOf('encodeWebp')).toHaveLength(0);
    expect(h.viewModel.getSnapshot().status).toBe('ready');
  });

  it('REQ-EDIT-001 처음에는 자르기 탭, 자유 비율, 필터 원본, 조정 항목 "자동"(꺼짐)이 선택돼 있다', async () => {
    const h = createEditHarness();
    await h.viewModel.start();
    const s = h.viewModel.getSnapshot();
    expect(s.tab).toBe('crop');
    expect(s.aspect).toBe('free');
    expect(s.filter).toBe('original');
    expect(s.selectedAdjust).toBe('auto');
    expect(s.autoOn).toBe(false);
    expect(s.quarterTurns).toBe(0);
    expect(s.isIdentity).toBe(true);
  });

  it('TC-EDIT-009 편집용 이미지는 긴 변 4096 이하로 EXIF를 반영해 준비한다', async () => {
    const h = createEditHarness({ sourceSize: { width: 8000, height: 6000 } });
    await h.viewModel.start();
    const [call] = h.engine.callsOf('prepareEditable');
    expect(call).toMatchObject({ uri: EDIT_SOURCE_URI, maxLongEdge: POST_IMAGE_MAX_LONG_EDGE });
    const { editable } = h.viewModel.getSnapshot();
    expect(editable).not.toBeNull();
    expect(Math.max(editable!.width, editable!.height)).toBeLessThanOrEqual(4096);
  });

  it('TC-EDIT-003 "완료"는 편집값만 한 번 넘기고 편집기에서는 손실 압축(렌더)을 하지 않는다', async () => {
    const h = createEditHarness();
    await h.viewModel.start();
    h.viewModel.selectFilter('mono');
    h.viewModel.rotate();
    await h.viewModel.done();
    await h.viewModel.done();
    expect(h.done).toHaveLength(1);
    expect(h.done[0].quarterTurns).toBe(1);
    expect(h.done[0].filter).toBe('mono');
    expect(h.cancels).toHaveLength(0);
    expect(h.engine.callsOf('encodeWebp')).toHaveLength(0);
  });

  it('TC-EDIT-004 "취소"는 편집값 없이 취소 이벤트만 한 번 보낸다(렌더 없음)', async () => {
    const h = createEditHarness();
    await h.viewModel.start();
    h.viewModel.selectFilter('vintage');
    h.viewModel.cancel();
    h.viewModel.cancel();
    expect(h.cancels).toHaveLength(1);
    expect(h.done).toHaveLength(0);
    expect(h.engine.callsOf('encodeWebp')).toHaveLength(0);
  });

  it('TC-EDIT-007 끝난(확정·취소) 뒤의 입력은 무시한다', async () => {
    const h = createEditHarness();
    await h.viewModel.start();
    h.viewModel.cancel();
    await h.viewModel.done();
    h.viewModel.rotate();
    expect(h.done).toHaveLength(0);
    expect(h.viewModel.getSnapshot().quarterTurns).toBe(0);
  });

  it('TC-EDIT-045 필터를 바꾸고 "취소"하면 편집값이 나가지 않아 들어가기 전 상태가 유지된다', async () => {
    const h = createEditHarness();
    await h.viewModel.start();
    h.viewModel.selectFilter('cool');
    h.viewModel.cancel();
    expect(h.done).toHaveLength(0);
  });

  it('TC-EDIT-011 아무것도 바꾸지 않고 "완료"하면 identity 편집값이다', async () => {
    const h = createEditHarness();
    await h.viewModel.start();
    await h.viewModel.done();
    expect(isIdentityEdit(h.done[0])).toBe(true);
  });

  it('REQ-EDIT-004 자르기 영역이 전체와 1e-3 이내로 같으면 전체 자르기로 확정한다', async () => {
    const h = createEditHarness();
    await h.viewModel.start();
    h.viewModel.resizeCrop('top-left', 0.0004, 0.0004);
    await h.viewModel.done();
    expect(h.done[0].crop).toEqual({ centerX: 0.5, centerY: 0.5, width: 1, height: 1 });
  });

  it('REQ-EDIT-004 자동 보정이 꺼져 있으면 분석한 자동 보정값은 버리고 확정한다', async () => {
    const h = createEditHarness({ sample: () => grayRamp(64, 4, 140, 200) });
    await h.viewModel.start();
    await h.viewModel.done();
    expect(h.done[0].adjustments.autoStrength).toBe(0);
    expect(Object.values(h.done[0].adjustments.auto).every((v) => v === 0)).toBe(true);
  });

  it('TC-EDIT-021 수평 보정 각도는 항상 0이다', async () => {
    const h = createEditHarness();
    await h.viewModel.start();
    h.viewModel.rotate();
    await h.viewModel.done();
    expect(h.done[0].straightenDegrees).toBe(0);
  });

  it('TC-EDIT-008 편집용 이미지 준비가 실패하면 편집기를 닫지 않고 오류 문구를 보이며 "완료"로 다시 시도할 수 있다 [가정: 값만 만드는 편집기의 렌더 실패는 준비 실패다]', async () => {
    const h = createEditHarness();
    h.engine.failNext('prepareEditable', new ImageDecodeError());
    await h.viewModel.start();
    expect(h.viewModel.getSnapshot().status).toBe('error');
    expect(h.viewModel.getSnapshot().errorMessage).toBe(t('edit.error.render'));
    await h.viewModel.done();
    expect(h.viewModel.getSnapshot().status).toBe('ready'); // 다시 시도해 준비됨
    expect(h.cancels).toHaveLength(0);
    await h.viewModel.done();
    expect(h.done).toHaveLength(1);
    expect(h.engine.callsOf('prepareEditable')).toHaveLength(2);
  });

  it('TC-EDIT-008 준비가 계속 실패하면 "완료"해도 닫히지 않고 오류 문구가 남는다', async () => {
    const h = createEditHarness();
    h.engine.failNext('prepareEditable', new ImageDecodeError());
    h.engine.failNext('prepareEditable', new ImageDecodeError());
    await h.viewModel.start();
    await h.viewModel.done();
    expect(h.done).toHaveLength(0);
    expect(h.cancels).toHaveLength(0);
    expect(h.viewModel.getSnapshot().errorMessage).toBe(t('edit.error.render'));
  });

  it('REQ-UPL-034 편집기를 취소하면 진행 중이던 준비는 abort되고 오류로 보이지 않는다', async () => {
    const h = createEditHarness();
    const hold = h.engine.holdNext('prepareEditable');
    const started = h.viewModel.start();
    h.viewModel.cancel();
    hold.fail(new CancelledError('aborted'));
    await started;
    expect(h.viewModel.getSnapshot().errorMessage).toBeNull();
  });
});

describe('PhotoEditViewModel 다시 편집(저장된 편집값 복원)', () => {
  const saved: PhotoEdit = {
    quarterTurns: 1,
    crop: { centerX: 0.5, centerY: 0.75, width: 0.5, height: 1 },
    straightenDegrees: 0,
    filter: 'vintage',
    adjustments: {
      auto: { ...identityEdit().adjustments.auto, exposure: 0.4 },
      autoStrength: 0.6,
      user: { warmth: -0.2 },
    },
  };

  it('TC-EDIT-006 저장된 편집값으로 편집기를 다시 연다(회전, 자르기, 필터, 조정)', async () => {
    const h = createEditHarness({ initialEdit: saved });
    await h.viewModel.start();
    const s = h.viewModel.getSnapshot();
    expect(s.quarterTurns).toBe(1);
    expect(s.filter).toBe('vintage');
    expect(s.cropRect.centerX).toBeCloseTo(0.25);
    expect(s.cropRect.centerY).toBeCloseTo(0.5);
    expect(s.cropRect.width).toBeCloseTo(0.5);
    expect(s.cropRect.height).toBeCloseTo(1);
    expect(s.autoOn).toBe(true);
    expect(s.adjustValues.exposure).toBeCloseTo(0.24);
    expect(s.adjustValues.warmth).toBeCloseTo(-0.2);
    expect(s.isIdentity).toBe(false);
  });

  it('TC-EDIT-006 바꾸지 않고 "완료"하면 저장된 편집값과 같은 값이 나간다', async () => {
    const h = createEditHarness({ initialEdit: saved });
    await h.viewModel.start();
    await h.viewModel.done();
    const edit = h.done[0];
    expect(edit.quarterTurns).toBe(1);
    expect(edit.filter).toBe('vintage');
    expect(edit.crop.centerX).toBeCloseTo(0.5);
    expect(edit.crop.centerY).toBeCloseTo(0.75);
    expect(edit.adjustments.autoStrength).toBeCloseTo(0.6);
    expect(edit.adjustments.user).toEqual({ warmth: -0.2 });
  });

  it('TC-EDIT-005 다시 편집 중 "취소"하면 편집값 없이 취소 이벤트만 나간다(기존 선택은 호출 쪽이 유지한다)', async () => {
    const h = createEditHarness({ initialEdit: saved });
    await h.viewModel.start();
    h.viewModel.selectFilter('mono');
    h.viewModel.cancel();
    expect(h.cancels).toHaveLength(1);
    expect(h.done).toHaveLength(0);
  });
});
