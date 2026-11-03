/** 앱을 종료한다. Android 강제 업데이트 다이얼로그의 "취소"와 스토어 열기 실패에서 쓴다(D-15). */
export interface AppExiter {
  exit(): void;
}
