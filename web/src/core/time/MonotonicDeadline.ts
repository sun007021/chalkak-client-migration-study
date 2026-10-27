import type { Clock } from './Clock';

/** 업로드 URL 만료 같은 "발급 후 N초" 판정. 단조 시계 기준이라 기기 시각 변경에 영향받지 않는다(TC-TIME-027). */
export class MonotonicDeadline {
  constructor(_clock: Clock, _ttlMs: number) {}
  /** 만료까지 safetyMarginMs(기본 UPLOAD_URL_SAFETY_MARGIN_MS) 이내이거나 지났으면 true. 정각 경계는 만료로 본다. */
  isExpired(_safetyMarginMs?: number): boolean {
    throw new Error('not implemented');
  }
}
