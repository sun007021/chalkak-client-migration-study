import { FakeAnalyticsTracker } from '../../../core/analytics/__testing__/FakeAnalyticsTracker';
import { FakeSleeper } from '../../../core/http/__testing__/FakeSleeper';
import { FakeExternalLinkOpener } from '../../../core/link/__testing__/FakeExternalLinkOpener';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import type { PendingSignUp } from '../../../data/auth/AuthRepository';
import { createAuthHarness } from '../../../data/auth/__testing__/createAuthHarness';
import { SignUpRepository } from '../../../data/auth/SignUpRepository';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { SignatureEncoder } from '../../signature/SignatureEncoder';
import { SignatureFlowViewModel } from '../../signature/SignatureFlowViewModel';
import { SignUpSubmitter } from '../../signature/SignatureSubmitter';
import { CANVAS, drawLine } from '../../signature/__testing__/draw';
import { FakeSignatureRasterizer } from '../../signature/__testing__/FakeSignatureRasterizer';
import { SignUpFlowViewModel } from '../SignUpFlowViewModel';

export const PENDING: PendingSignUp = {
  idToken: 'fixture-id-token',
  rawNonce: 'fixture-raw-nonce',
};

/** 가입 흐름 한 벌: 실제 ViewModel·리포지토리 + Fake transport·저장소·래스터라이저·토스트·분석·푸시·링크 열기. */
export function createSignUpHarness(
  options: { manualSleeper?: boolean; pending?: PendingSignUp } = {},
) {
  const auth = createAuthHarness();
  const signUpRepository = new SignUpRepository({ api: auth.api, authRepository: auth.repository });
  const pollSleeper = new FakeSleeper(options.manualSleeper ?? false);
  const rasterizer = new FakeSignatureRasterizer();
  const analytics = new FakeAnalyticsTracker();
  const toast = new FakeToastPresenter();
  const navigator = new FakeAuthFlowNavigator();
  const linkOpener = new FakeExternalLinkOpener();
  const pending = options.pending ?? PENDING;
  const flow = new SignUpFlowViewModel({
    pending,
    analytics,
    authNavigator: navigator,
    pushRegistrar: auth.push,
    externalLinkOpener: linkOpener,
    createSignatureFlow: (host) =>
      new SignatureFlowViewModel({
        mode: 'onboarding',
        canvas: CANVAS,
        encoder: new SignatureEncoder(rasterizer),
        submitter: new SignUpSubmitter({
          signUpRepository,
          authRepository: auth.repository,
          pending,
          sleeper: pollSleeper,
        }),
        analytics,
        toast,
        authNavigator: navigator,
        onCompleted: host.onCompleted,
        onExit: host.onExit,
      }),
  });

  /** 약관 동의 -> 다음 -> 사인 그리기 -> 확정까지 진행해 미리보기 ViewModel을 돌려준다. */
  async function reachPreview() {
    flow.start();
    flow.terms.toggleAll();
    flow.terms.next();
    drawLine(flow.signature!.draw);
    await flow.signature!.draw.confirm();
    return flow.signature!.preview!;
  }

  return {
    ...auth,
    signUpRepository,
    pollSleeper,
    rasterizer,
    analytics,
    toast,
    navigator,
    linkOpener,
    pending,
    flow,
    reachPreview,
  };
}

export type SignUpHarness = ReturnType<typeof createSignUpHarness>;
