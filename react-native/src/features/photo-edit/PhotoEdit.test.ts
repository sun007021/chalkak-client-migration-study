import { editsEqual, identityEdit, isIdentityEdit, type PhotoEdit } from './PhotoEdit';

const edited = (patch: Partial<PhotoEdit>): PhotoEdit => ({ ...identityEdit(), ...patch });

describe('isIdentityEdit', () => {
  it('TC-EDIT-011 편집하지 않은 상태(회전 0, 전체 자르기, 조정 0, 필터 원본)는 identity다', () => {
    expect(isIdentityEdit(identityEdit())).toBe(true);
  });

  it.each([
    ['회전', edited({ quarterTurns: 1 })],
    ['자르기', edited({ crop: { centerX: 0.5, centerY: 0.5, width: 0.9, height: 1 } })],
    ['자르기 중심', edited({ crop: { centerX: 0.4, centerY: 0.5, width: 0.8, height: 1 } })],
    ['필터', edited({ filter: 'mono' })],
    [
      '직접 조정',
      edited({ adjustments: { ...identityEdit().adjustments, user: { exposure: 0.1 } } }),
    ],
    [
      '켜진 자동 보정',
      edited({
        adjustments: {
          auto: { ...identityEdit().adjustments.auto, contrast: 0.2 },
          autoStrength: 1,
          user: {},
        },
      }),
    ],
  ])('TC-EDIT-011 %s이 바뀌면 identity가 아니다', (_name, edit) => {
    expect(isIdentityEdit(edit)).toBe(false);
  });

  it('REQ-EDIT-005 자르기 영역이 전체와 1e-3 이내로 같으면 전체로 보고 identity다', () => {
    const nearlyFull = edited({
      crop: { centerX: 0.5004, centerY: 0.4996, width: 0.9996, height: 1.0003 },
    });
    expect(isIdentityEdit(nearlyFull)).toBe(true);
  });

  it('REQ-EDIT-005 분석해 둔 자동 보정값이 있어도 강도가 0이면 적용되는 값이 0이라 identity다', () => {
    const edit = edited({
      adjustments: {
        auto: { ...identityEdit().adjustments.auto, exposure: 0.4 },
        autoStrength: 0,
        user: {},
      },
    });
    expect(isIdentityEdit(edit)).toBe(true);
  });
});

describe('editsEqual', () => {
  it('TC-EDIT-006 값이 모두 같으면(다른 객체여도) 같은 편집값이다', () => {
    expect(editsEqual(identityEdit(), identityEdit())).toBe(true);
    const a = edited({ quarterTurns: 2, filter: 'warm' });
    const b = edited({ quarterTurns: 2, filter: 'warm' });
    expect(editsEqual(a, b)).toBe(true);
  });

  it('TC-EDIT-006 회전·자르기·필터·조정 중 하나라도 다르면 다른 편집값이다', () => {
    const base = identityEdit();
    expect(editsEqual(base, edited({ quarterTurns: 1 }))).toBe(false);
    expect(editsEqual(base, edited({ filter: 'cool' }))).toBe(false);
    expect(
      editsEqual(base, edited({ crop: { centerX: 0.5, centerY: 0.5, width: 0.5, height: 0.5 } })),
    ).toBe(false);
    expect(
      editsEqual(base, edited({ adjustments: { ...base.adjustments, user: { warmth: -0.3 } } })),
    ).toBe(false);
  });
});
