export type KakaoSdkLoginResult = { idToken?: string | null };

/** SDK가 사용자 취소로 끝났을 때 던진다. */
export class KakaoSdkCancelledError extends Error {}
/** 카카오 설정(앱 키, URL 스킴) 누락. */
export class KakaoSdkConfigError extends Error {}

/** 네이티브 카카오 SDK를 감싼 얇은 경계. 실제 구현은 네이티브 모듈 연동 PR에서 붙인다. */
export interface KakaoSdk {
  isTalkAvailable(): Promise<boolean>;
  loginWithTalk(nonceHash: string): Promise<KakaoSdkLoginResult>;
  loginWithAccount(nonceHash: string): Promise<KakaoSdkLoginResult>;
}
