/** "권한 요청함" 표시(REQ-PUSH-001). 앱 설치 단위로 남고 재설치하면 사라진다. */
export interface PushPromptFlagStore {
  wasRequested(): Promise<boolean>;
  markRequested(): Promise<void>;
}
