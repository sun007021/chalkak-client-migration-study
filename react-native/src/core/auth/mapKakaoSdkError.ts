import { KakaoSdkCancelledError, KakaoSdkConfigError } from './KakaoSdk';

// 근거: @react-native-seoul/kakao-login 6.0.4 네이티브 소스.
// iOS는 SdkError를 "ClientFailed(<reason>): ..." 문자열로 reject한다(RNKakaoLogins.swift describe, 취소는 reason Cancelled,
// shouldFallBackToAccountLogin 참조). Android는 Kakao SDK ClientError의 message를 그대로 reject하며 원인 이름은 Cancelled다.
// 둘 다 대소문자를 구분하는 이 토큰만 취소로 본다. Android 실제 문구는 실기기 E2E에서 확정한다.
const CANCELLED = /ClientFailed\(Cancelled\)|\bCancelled\b/;
// iOS: "ClientFailed(MustInitAppKey)"(RNKakaoLogins.swift ensureInitialized) 또는 Info.plist `KAKAO_APP_KEY` 누락.
// Android: string 리소스 `kakao_app_key` 누락(RNKakaoLoginsModule.kt check 메시지).
const MISSING_CONFIG = /MustInitAppKey|KAKAO_APP_KEY|kakao_app_key/;

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
