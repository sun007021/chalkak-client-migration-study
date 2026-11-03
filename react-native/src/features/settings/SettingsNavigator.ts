import type { SignatureChangeNavigator } from '../signature/SignatureCardViewModel';

/** 설정 탭이 화면을 바꾸는 통로(로그인 이동은 AuthFlowNavigator가 맡는다). */
export interface SettingsNavigator extends SignatureChangeNavigator {
  /** 피드백 화면(루트 스택 위)을 연다. */
  openFeedback(): void;
}
