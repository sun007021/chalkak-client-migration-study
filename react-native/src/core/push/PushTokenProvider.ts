/** 푸시 서버(FCM)가 쓰는 기기 토큰. 토큰 원문은 로그·화면에 내지 않는다(REQ-PUSH-018). */
export interface PushTokenProvider {
  /** 현재 토큰. 아직 없으면 null. */
  getToken(): Promise<string | null>;
  /** SDK가 토큰을 갱신할 때마다 새 토큰으로 호출된다. 반환 함수로 해제한다. */
  subscribe(listener: (token: string) => void): () => void;
}
