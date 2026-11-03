import { FakeAnalyticsTracker } from '../../../core/analytics/__testing__/FakeAnalyticsTracker';
import { createNetHarness } from '../../../core/http/__testing__/createNetHarness';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { FixtureRouter, type RouteValue } from '../../../data/__testing__/FixtureRouter';
import { FeedbackRepository } from '../../../data/feedback/FeedbackRepository';
import { FakeAuthFlowNavigator } from '../../auth/__testing__/FakeAuthFlowNavigator';
import { FeedbackViewModel } from '../FeedbackViewModel';
import { FakeFeedbackNavigator } from './FakeFeedbackNavigator';

export const POST_FEEDBACK = 'POST /feedbacks';

export type FeedbackHarnessOptions = {
  routes?: Record<string, RouteValue>;
};

/** 피드백 화면 한 벌: 실제 ViewModel·리포지토리 + Fake transport·토스트·분석·내비게이터. */
export async function createFeedbackHarness(options: FeedbackHarnessOptions = {}) {
  const net = createNetHarness();
  await net.signIn();
  const router = new FixtureRouter({
    [POST_FEEDBACK]: 'feedback/feedbacks__created',
    ...options.routes,
  }).install(net.transport);
  const analytics = new FakeAnalyticsTracker();
  const toast = new FakeToastPresenter();
  const navigator = new FakeFeedbackNavigator();
  const authFlow = new FakeAuthFlowNavigator();
  const viewModel = new FeedbackViewModel({
    repository: new FeedbackRepository({ api: net.api }),
    analytics,
    toast,
    navigator,
    authFlow,
  });
  const posts = () => router.calls(POST_FEEDBACK);
  /** 서버로 간 content 값들. */
  const sentContents = () =>
    posts().map((r) => (JSON.parse(String(r.body)) as { content: string }).content);
  return { ...net, router, analytics, toast, navigator, authFlow, viewModel, posts, sentContents };
}

export type FeedbackHarness = Awaited<ReturnType<typeof createFeedbackHarness>>;
