import { FakeAnalyticsTracker } from '../../../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../../../core/http/__testing__/createNetHarness';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { SignatureRepository } from '../../../data/signature/SignatureRepository';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { SignatureEncoder } from '../SignatureEncoder';
import { SignatureFlowViewModel } from '../SignatureFlowViewModel';
import { SignatureChangeSubmitter } from '../SignatureSubmitter';
import { CANVAS, drawLine } from './draw';
import { FakeSignatureRasterizer } from './FakeSignatureRasterizer';

/** 설정의 사인 변경 흐름(change 모드) 한 벌: 실제 ViewModel·리포지토리 + Fake transport·래스터라이저·토스트·분석. */
export function createChangeHarness() {
  const net = createNetHarness();
  const repository = new SignatureRepository({ api: net.api });
  const rasterizer = new FakeSignatureRasterizer();
  const analytics = new FakeAnalyticsTracker();
  const toast = new FakeToastPresenter();
  const navigator = new FakeAuthFlowNavigator();
  const hostCalls = { completed: 0, exited: 0 };
  const flow = new SignatureFlowViewModel({
    mode: 'change',
    canvas: CANVAS,
    encoder: new SignatureEncoder(rasterizer),
    submitter: new SignatureChangeSubmitter(repository),
    analytics,
    toast,
    authNavigator: navigator,
    onCompleted: () => (hostCalls.completed += 1),
    onExit: () => (hostCalls.exited += 1),
  });

  /** 인증 세션을 저장하고 그리기 -> 확정까지 진행해 미리보기 단계로 간다. */
  async function reachPreview() {
    await net.signIn();
    flow.start();
    drawLine(flow.draw);
    await flow.draw.confirm();
    return flow.preview!;
  }

  return {
    ...net,
    repository,
    rasterizer,
    analytics,
    toast,
    navigator,
    hostCalls,
    flow,
    reachPreview,
  };
}

export type ChangeHarness = ReturnType<typeof createChangeHarness>;
