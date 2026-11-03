import type { PushTokenProvider } from '../PushTokenProvider';

/** `@react-native-firebase/messaging`에서 쓰는 모듈러 API 부분. */
export type FirebaseMessagingModule = {
  getMessaging(): unknown;
  getToken(messaging: never): Promise<string>;
  onTokenRefresh(messaging: never, listener: (token: string) => void): () => void;
};

/**
 * 네이티브 모듈은 Firebase 설정(GOOGLE_SERVICES_PLIST)을 넣은 빌드에만 있다.
 * 그래서 쓰는 순간에만 require한다(Jest·Firebase 없는 빌드는 이 파일을 import해도 네이티브 코드를 읽지 않는다).
 */
const loadFirebaseMessaging = (): FirebaseMessagingModule =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-firebase/messaging') as FirebaseMessagingModule;

/**
 * iOS FCM 토큰. 서버는 FCM 토큰만 받으므로 APNs 토큰 대신 Firebase가 바꿔 준 FCM 토큰을 쓴다.
 * 어떤 실패도 던지지 않고 null로 돌려준다(다음 트리거에 다시 시도). 토큰·오류 메시지는 로그에 내지 않는다(REQ-PUSH-018).
 */
export class FirebaseMessagingTokenProvider implements PushTokenProvider {
  constructor(private readonly load: () => FirebaseMessagingModule = loadFirebaseMessaging) {}

  async getToken(): Promise<string | null> {
    try {
      const m = this.load();
      const messaging = m.getMessaging() as never;
      // APNs 등록은 RNFB가 앱 시작 때 자동으로 한다(firebase.json의 messaging_ios_auto_register_for_remote_messages 기본 true).
      // registerDeviceForRemoteMessages를 또 부르면 RNFB가 경고만 내므로 부르지 않는다. APNs 토큰이 아직 없으면 getToken이 던져 null이 되고 다음 트리거에 다시 시도한다.
      const token = await m.getToken(messaging);
      return typeof token === 'string' && token.trim() !== '' ? token : null;
    } catch (error) {
      // 시뮬레이터·APNs 키 없음·권한 거부 등: 토큰이 없는 것으로 보고 다음 트리거에 다시 시도한다.
      console.warn(
        '[FirebaseMessagingTokenProvider] token unavailable',
        error instanceof Error ? error.name : 'unknown',
      );
      return null;
    }
  }

  subscribe(listener: (token: string) => void): () => void {
    try {
      const m = this.load();
      return m.onTokenRefresh(m.getMessaging() as never, (token) => {
        if (typeof token === 'string' && token.trim() !== '') listener(token);
      });
    } catch {
      return () => undefined;
    }
  }
}
