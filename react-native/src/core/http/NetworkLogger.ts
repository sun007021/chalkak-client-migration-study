export type NetworkLogEntry = {
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  method?: string;
  /** 쿼리 문자열이 제거된 URL. */
  url?: string;
  status?: number;
  errorCode?: string;
  attempt?: number;
  detail?: string;
};

/** 비밀값(토큰, idToken, rawNonce, signupToken, FCM 토큰, presigned URL 쿼리)은 기록하지 않는다(REQ-NET-031). */
export interface NetworkLogger {
  log(entry: NetworkLogEntry): void;
}
