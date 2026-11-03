import type { AdjustmentValues } from '../features/upload/editor/adjustments';

/** 테스트 전용: 모든 조정이 0인 값. 프로덕션 코드는 import하지 않는다. */
export const ZERO_ADJUSTMENTS_FOR_TEST: AdjustmentValues = { exposure: 0, contrast: 0, highlights: 0, shadows: 0, blackPoint: 0, saturation: 0, warmth: 0 };
