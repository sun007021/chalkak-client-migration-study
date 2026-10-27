import { createNetHarness } from '../../../core/http/__testing__/createNetHarness';
import { FakePushRegistrar } from '../../../core/push/__testing__/FakePushRegistrar';
import { AuthGate } from '../AuthGate';
import { BootViewModel } from '../BootViewModel';
import { ForceUpdateGate } from '../ForceUpdateGate';
import { FakeHomePreloader, FakeUpdateChecker } from './fakes';
import type { UpdateCheckResult } from '../UpdateChecker';

/** BootViewModel + 실제 AuthGate(Fake 저장소) + Fake 검사기·프리로더·푸시. */
export function createBootHarness(
  options: { updateEnabled?: boolean; results?: (UpdateCheckResult | Error)[] } = {},
) {
  const net = createNetHarness();
  const checker = new FakeUpdateChecker(...(options.results ?? ['up-to-date']));
  const forceUpdateGate = new ForceUpdateGate(checker, options.updateEnabled ?? true);
  const preloader = new FakeHomePreloader();
  const push = new FakePushRegistrar();
  const viewModel = new BootViewModel({
    forceUpdateGate,
    authGate: new AuthGate(net.sessionStore, net.clock),
    homePreloader: preloader,
    pushRegistrar: push,
    events: net.events,
  });
  return { ...net, checker, forceUpdateGate, preloader, push, viewModel };
}

export type BootHarness = ReturnType<typeof createBootHarness>;
