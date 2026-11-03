import ko from '../../../shared/copy/ko.json';
import { createDisplayHarness } from '../features/display/__testing__/createDisplayHarness';
import { createHomeHarness } from '../features/home/__testing__/createHomeHarness';
import { createSettingsHarness } from '../features/settings/__testing__/createSettingsHarness';
import { FakeAnalyticsTracker } from '../core/analytics/__testing__/FakeAnalyticsTracker';
import { FakeToastPresenter } from '../core/toast/__testing__/FakeToastPresenter';
import { BottomTabPolicy } from './BottomTabPolicy';

/**
 * 게스트 제한 6종의 토스트 문구는 shared/copy/ko.json의 nav.guest.* 값과 정확히 같아야 한다(D-05).
 * 문구는 각 동작을 일으키는 실제 ViewModel/정책이 내보낸 값으로 확인한다(키 이름이 아니라 화면에 나가는 문자열).
 */
describe('게스트 제한 토스트 문구 (D-05)', () => {
  it('TC-NAV-023 기록·업로드·피드·좋아요·알림·피드백 6종이 ko.json nav.guest.* 값과 같다', async () => {
    const toast = new FakeToastPresenter();
    const policy = new BottomTabPolicy({
      mode: 'guest',
      analytics: new FakeAnalyticsTracker(),
      toast,
    });
    policy.onTabPress('Record');
    policy.onUploadPress();
    expect(toast.messages).toEqual([ko['nav.guest.record'], ko['nav.guest.upload']]);

    const home = await createHomeHarness({ mode: 'guest' });
    await home.viewModel.onShown();
    home.viewModel.onRankingItemPress('popular', firstPostId(home));
    home.viewModel.onRankingLikePress('popular', firstPostId(home));
    home.viewModel.onNotificationPress();
    expect(home.toast.messages).toEqual([
      ko['nav.guest.feed'],
      ko['nav.guest.like'],
      ko['nav.guest.notification'],
    ]);

    const settings = await createSettingsHarness({ mode: 'guest' });
    settings.viewModel.onFeedbackPress();
    expect(settings.toast.messages).toEqual([ko['nav.guest.feedback']]);

    // 전시 탭의 카드·하트도 같은 문구다.
    const display = await createDisplayHarness({ mode: 'guest' });
    await display.viewModel.onShown();
    const id = display.viewModel.getSnapshot().photos[0]?.id ?? '';
    display.viewModel.onPhotoPress(id);
    display.viewModel.onLikePress(id);
    expect(display.toast.messages).toEqual([ko['nav.guest.feed'], ko['nav.guest.like']]);
  });
});

function firstPostId(h: Awaited<ReturnType<typeof createHomeHarness>>): string {
  const popular = h.viewModel.getSnapshot().popular;
  if (popular.status !== 'ready' || !popular.posts.length) throw new Error('랭킹 항목 없음');
  return popular.posts[0].id;
}
