/** 로그아웃·탈퇴·계정 전환 때 비워야 하는 사용자별 캐시(홈, 기록, 알림, 좋아요, 미읽음, 사인, 푸시 설정 등). */
export interface UserDataCache {
  clearAll(): Promise<void> | void;
}
