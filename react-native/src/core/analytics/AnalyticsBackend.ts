/** 분석 전송 백엔드(예: Firebase). 이 레포는 Firebase 설정 파일이 있을 때만 구현을 연결한다(REQ-ANL-001). */
export interface AnalyticsBackend {
  logEvent(name: string, params: Record<string, string | number | boolean>): void;
}
