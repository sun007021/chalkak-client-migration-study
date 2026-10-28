import { FakeAnalyticsTracker } from '../../../core/analytics/__testing__/FakeAnalyticsTracker';
import { FakeExternalLinkOpener } from '../../../core/linking/__testing__/FakeExternalLinkOpener';
import { FakeToastPresenter } from '../../../core/toast/__testing__/FakeToastPresenter';
import { IssueWebViewModel } from '../IssueWebViewModel';

export const SAFE_URL = 'https://web.example.test/issues/1';

export function createIssueWebHarness(url: string = SAFE_URL) {
  const analytics = new FakeAnalyticsTracker();
  const toast = new FakeToastPresenter();
  const linkOpener = new FakeExternalLinkOpener();
  const viewModel = new IssueWebViewModel({ url, analytics, toast, linkOpener });
  return { analytics, toast, linkOpener, viewModel };
}

export type IssueWebHarness = ReturnType<typeof createIssueWebHarness>;
