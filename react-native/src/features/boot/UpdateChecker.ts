/** 스토어 조회 결과. 조회 실패·오프라인·해석 불가는 'unavailable'이며 앱을 막지 않는다(D-15). */
export type UpdateCheckResult = 'up-to-date' | 'update-required' | 'unavailable';

/** 플랫폼별 구현: iOS = iTunes lookup, Android = Play In-App Update. */
export interface UpdateChecker {
  check(): Promise<UpdateCheckResult>;
}

/** "업데이트" 버튼이 여는 곳: iOS는 App Store, Android는 Play 즉시 업데이트 흐름. 실패하면 reject. */
export interface StoreOpener {
  open(): Promise<void>;
}
