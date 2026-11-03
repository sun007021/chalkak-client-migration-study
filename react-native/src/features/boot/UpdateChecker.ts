/** 스토어 조회 결과. 조회 실패·오프라인·해석 불가는 'unavailable'이며 앱을 막지 않는다(D-15). */
export type UpdateCheckResult = 'up-to-date' | 'update-required' | 'unavailable';

/** 플랫폼별 구현: iOS = iTunes lookup, Android = Play In-App Update. */
export interface UpdateChecker {
  check(): Promise<UpdateCheckResult>;
}

/** "업데이트" 버튼이 여는 곳: 모든 플랫폼에서 스토어 앱 상세(iOS App Store, Android Play 스토어). 실패하면 reject. */
export interface StoreOpener {
  open(): Promise<void>;
}
