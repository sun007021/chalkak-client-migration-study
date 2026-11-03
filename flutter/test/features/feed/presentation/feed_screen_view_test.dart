import 'package:chalkak/core/analytics/analytics_constants.dart';
import 'package:chalkak/core/post_events/post_event_bus.dart';
import 'package:chalkak/features/feed/presentation/feed_view_model.dart';
import 'package:chalkak/features/like/domain/like_store.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_analytics_tracker.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show settle;

void main() {
  fakeTest('TC-ANL-007 게시물 상세는 진입 경로와 관계없이 screen_view feed를 한 번 보낸다', (async) {
    for (final seedFrom in [recentP1Fx, popularP1Fx]) {
      final analytics = FakeAnalyticsTracker();
      final repo = FakePostRepository();
      final bus = PostEventBus();
      final likes = LikeStore(
        repository: FakeLikeRepository(),
        events: bus,
        isGuest: () => false,
      );
      final id = postIdOf(2);
      repo.onDetail(id, [Reply.ok(detailFx(detailOtherFx))]);
      final vm = FeedViewModel(
        target: targetFromCard(seedFrom, id),
        repository: repo,
        likes: likes,
        postEvents: bus,
        userId: myUserId,
        analytics: analytics,
      );
      vm.onShown();
      vm.onShown(); // 재구성으로 다시 불려도 중복 전송하지 않는다.
      vm.load();
      settle(async);
      vm.load(); // 다시 불러와도 screen_view는 그대로다.
      settle(async);
      expect(analytics.screenNames, [ScreenNames.feed], reason: seedFrom);
      vm.dispose();
    }
  });

  fakeTest('TC-ANL-007 기록·푸시로 시드 없이 열어도 screen_view feed이다', (async) {
    final analytics = FakeAnalyticsTracker();
    final repo = FakePostRepository();
    final bus = PostEventBus();
    final vm = FeedViewModel(
      target: targetFromRecord(postIdOf(2)),
      repository: repo,
      likes: LikeStore(
        repository: FakeLikeRepository(),
        events: bus,
        isGuest: () => true,
      ),
      postEvents: bus,
      userId: null,
      analytics: analytics,
    );
    vm.onShown();
    expect(analytics.screenNames, ['feed']);
    vm.dispose();
  });
}
