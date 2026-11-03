import type { PhotoEdit } from '../editModel';

/**
 * "완료"가 확정하는 편집값(REQ-EDIT-004): 자르기 영역이 전체와 CROP_EPSILON(1e-3) 이내로 같으면 FULL_CROP으로,
 * 자동 보정 강도가 0이면 autoValues를 NO_AUTO_VALUES로 버린다. 나머지는 그대로(직접 값 포함). 입력을 바꾸지 않고 새 객체를 돌려준다.
 */
export function normalizeEdit(_edit: PhotoEdit): PhotoEdit {
  throw new Error('not implemented');
}
