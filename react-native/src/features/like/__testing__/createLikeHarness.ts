import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { DefaultLikeController } from '../DefaultLikeController';
import type { LikeChange } from '../LikeController';
import { FakeLikeApi } from './FakeLikeApi';

export const P1 = '22222222-2222-4222-8222-222222222201';
export const P2 = '22222222-2222-4222-8222-222222222202';

/** 소수의 구독자(전시·홈·피드)를 흉내 내는 이벤트 기록이 붙은 컨트롤러. */
export function createLikeHarness() {
  const api = new FakeLikeApi();
  const toast = new FakeToastPresenter();
  const authFlow = new FakeAuthFlowNavigator();
  const controller = new DefaultLikeController({ api, toast, authFlow });
  const events: LikeChange[] = [];
  const unsubscribe = controller.subscribe((change) => events.push(change));
  return { api, toast, authFlow, controller, events, unsubscribe };
}

export type LikeHarness = ReturnType<typeof createLikeHarness>;

/** 마이크로태스크를 비워 응답 처리를 마치게 한다. */
export async function settle(times = 30): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}
