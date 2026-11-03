import { IDENTITY_EDIT, isIdentityEdit, sameEdit } from './editModel';
import type { PhotoEdit } from './editModel';

const edit = (patch: Partial<PhotoEdit>): PhotoEdit => ({ ...IDENTITY_EDIT, ...patch });
const layers = (patch: Partial<PhotoEdit['adjustmentLayers']>): PhotoEdit['adjustmentLayers'] => ({ ...IDENTITY_EDIT.adjustmentLayers, ...patch });

describe('편집값 모델 isIdentityEdit (REQ-EDIT-005 연결점)', () => {
  it('TC-UPL-045 아무것도 바꾸지 않은 편집값은 편집하지 않은 사진이다', () => {
    expect(isIdentityEdit(IDENTITY_EDIT)).toBe(true);
  });

  it.each([
    ['회전', edit({ quarterTurns: 1 })],
    ['자르기(절반)', edit({ crop: { centerX: 0.5, centerY: 0.5, width: 0.5, height: 1 } })],
    ['자르기(중심 이동)', edit({ crop: { centerX: 0.6, centerY: 0.5, width: 0.8, height: 1 } })],
    ['필터', edit({ filter: 'vivid' })],
    ['직접 조정', edit({ adjustmentLayers: layers({ manual: { exposure: 0.1 } }) })],
    ['자동 보정(강도 1, 분석값 있음)', edit({ adjustmentLayers: layers({ autoStrength: 1, autoValues: { ...IDENTITY_EDIT.adjustmentLayers.autoValues, exposure: 0.2 } }) })],
  ])('TC-UPL-045 %s가 바뀌었으면 편집한 사진이다', (_name, value) => {
    expect(isIdentityEdit(value)).toBe(false);
  });

  it('TC-UPL-045 자르기 영역이 전체와 1e-3 이내로 같으면 전체로 본다', () => {
    expect(isIdentityEdit(edit({ crop: { centerX: 0.5005, centerY: 0.4996, width: 0.9995, height: 1.0004 } }))).toBe(true);
    expect(isIdentityEdit(edit({ crop: { centerX: 0.5, centerY: 0.5, width: 0.998, height: 1 } }))).toBe(false);
  });

  it('TC-UPL-045 조정의 유효값 = 직접 값이 있으면 그 값, 없으면 자동값 × 강도 — 유효값이 모두 0이면 편집하지 않은 사진이다', () => {
    const autoValues = { ...IDENTITY_EDIT.adjustmentLayers.autoValues, exposure: 0.2 };
    // 자동 보정이 꺼져 있으면(강도 0) 분석값이 있어도 적용되지 않는다
    expect(isIdentityEdit(edit({ adjustmentLayers: layers({ autoValues, autoStrength: 0 }) }))).toBe(true);
    // 직접 만진 값 0이 자동값을 덮는다
    expect(isIdentityEdit(edit({ adjustmentLayers: layers({ autoValues, autoStrength: 1, manual: { exposure: 0 } }) }))).toBe(true);
    // 직접 값 0이 다른 항목에는 영향이 없다
    expect(isIdentityEdit(edit({ adjustmentLayers: layers({ autoValues: { ...autoValues, contrast: 0.3 }, autoStrength: 1, manual: { exposure: 0 } }) }))).toBe(false);
  });
});

describe('편집값 비교 sameEdit (REQ-UPL-035)', () => {
  it('TC-UPL-028 값이 같으면 다른 객체여도 같고, 하나라도 다르면 다르다', () => {
    const a = edit({ quarterTurns: 1, filter: 'warm', adjustmentLayers: layers({ manual: { saturation: 0.3 } }) });
    const copy: PhotoEdit = { ...a, crop: { ...a.crop }, adjustmentLayers: { ...a.adjustmentLayers, autoValues: { ...a.adjustmentLayers.autoValues }, manual: { ...a.adjustmentLayers.manual } } };
    expect(sameEdit(a, copy)).toBe(true);
    expect(sameEdit(IDENTITY_EDIT, { ...IDENTITY_EDIT })).toBe(true);
    expect(sameEdit(a, { ...copy, quarterTurns: 2 })).toBe(false);
    expect(sameEdit(a, { ...copy, filter: 'cool' })).toBe(false);
    expect(sameEdit(a, { ...copy, crop: { ...copy.crop, width: 0.9 } })).toBe(false);
    expect(sameEdit(a, { ...copy, adjustmentLayers: { ...copy.adjustmentLayers, manual: { saturation: 0.31 } } })).toBe(false);
    expect(sameEdit(a, { ...copy, adjustmentLayers: { ...copy.adjustmentLayers, autoStrength: 1 } })).toBe(false);
  });
});
