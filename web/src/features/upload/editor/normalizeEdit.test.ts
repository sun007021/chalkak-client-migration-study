import { CROP_EPSILON, FULL_CROP, IDENTITY_EDIT, NO_AUTO_VALUES } from '../editModel';
import type { PhotoEdit } from '../editModel';
import { normalizeEdit } from './normalizeEdit';

const edit = (patch: Partial<PhotoEdit>): PhotoEdit => ({ ...IDENTITY_EDIT, ...patch });
const withAuto = (autoStrength: number, manual: PhotoEdit['adjustmentLayers']['manual'] = {}): PhotoEdit['adjustmentLayers'] => ({
  autoValues: { ...NO_AUTO_VALUES, exposure: 0.4, contrast: 0.2 },
  autoStrength,
  manual,
});

describe('편집값 확정 정규화 (REQ-EDIT-004)', () => {
  it('REQ-EDIT-004 자르기 영역이 전체와 1e-3 이내로 같으면 전체(0.5, 0.5, 1, 1)로 확정한다', () => {
    const near = edit({ crop: { centerX: 0.5 + CROP_EPSILON / 2, centerY: 0.5 - CROP_EPSILON / 2, width: 1 - CROP_EPSILON / 2, height: 1 } });
    expect(normalizeEdit(near).crop).toEqual(FULL_CROP);
  });

  it('REQ-EDIT-004 자르기 영역이 전체에서 1e-3보다 멀면 그대로 둔다', () => {
    const crop = { centerX: 0.5, centerY: 0.5, width: 0.99, height: 1 };
    expect(normalizeEdit(edit({ crop })).crop).toEqual(crop);
  });

  it('REQ-EDIT-004 자동 보정이 꺼져 있으면(강도 0) 분석한 자동 보정값은 버리고 확정한다', () => {
    const result = normalizeEdit(edit({ adjustmentLayers: withAuto(0, { saturation: 0.3 }) }));
    expect(result.adjustmentLayers.autoValues).toEqual(NO_AUTO_VALUES);
    expect(result.adjustmentLayers.autoStrength).toBe(0);
    expect(result.adjustmentLayers.manual).toEqual({ saturation: 0.3 });
  });

  it('TC-EDIT-037 자동 보정이 켜져 있으면(강도 > 0) 자동 보정값을 그대로 저장한다', () => {
    const layers = withAuto(0.5);
    expect(normalizeEdit(edit({ adjustmentLayers: layers })).adjustmentLayers).toEqual(layers);
  });

  it('회전·필터는 그대로고 입력 편집값을 바꾸지 않는다', () => {
    const input = edit({ quarterTurns: 3, filter: 'vintage', adjustmentLayers: withAuto(0) });
    const snapshot = JSON.stringify(input);
    const result = normalizeEdit(input);
    expect(result.quarterTurns).toBe(3);
    expect(result.filter).toBe('vintage');
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(result).not.toBe(input);
  });

  it('REQ-EDIT-005 아무것도 바꾸지 않은 편집값은 정규화해도 IDENTITY_EDIT과 값이 같다', () => {
    expect(normalizeEdit(IDENTITY_EDIT)).toEqual(IDENTITY_EDIT);
  });
});
