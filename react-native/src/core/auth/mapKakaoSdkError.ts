import { KakaoSdkCancelledError, KakaoSdkConfigError } from './KakaoSdk';

const CANCELLED = /cancel/i;
// iOS: "ClientFailed(MustInitAppKey)" / Info.plist KAKAO_APP_KEY 누락, Android: 앱 키 미설정.
const MISSING_CONFIG = /MustInitAppKey|KAKAO_APP_KEY|kakao_app_key|app ?key/i;

/**
 * `@react-native-seoul/kakao-login`이 reject한 값을 KakaoSdk 오류로 분류한다.
 * 네이티브가 오류 코드를 따로 주지 않아(`code: 'RNKakaoLogins'` 고정) 메시지로 판별한다.
 * 알 수 없으면 원본 오류를 그대로 돌려줘 호출자가 일반 실패로 다루게 한다.
 */
export function mapKakaoSdkError(error: unknown): Error {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown })?.message ?? error);
  if (CANCELLED.test(message)) return new KakaoSdkCancelledError(message);
  if (MISSING_CONFIG.test(message)) return new KakaoSdkConfigError(message);
  return error instanceof Error ? error : new Error(message);
}
