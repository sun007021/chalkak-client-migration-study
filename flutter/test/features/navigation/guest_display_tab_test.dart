import 'package:chalkak/features/display/data/api_display_repository.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/display/presentation/display_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/display_fakes.dart';
import '../../support/fake_adapter.dart';
import '../../support/fake_async_helpers.dart';
import '../../support/net_harness.dart';

/// 게스트 전시 탭(D-05, F10): 목록은 인증 헤더 없이 불러 오고 좋아요·내 글은 모두 false로 보인다.
void main() {
  netTest(
    'TC-NAV-015 게스트 전시 탭은 GET /posts를 Authorization 없이 부르고 isLiked·isMine이 모두 false다',
    (h, a) {
      h.adapter.on('GET', '$v1/posts', [FakeResponse.fixture(guestP1Fx)]);
      final r = Probe(
        ApiDisplayRepository(client: h.client).fetchPosts(
          topicDate: day('2026-10-27'),
          sort: DisplaySort.recent,
          page: 1,
        ),
      );
      settle(a);
      expect(h.adapter.requests.single.hasAuthorization, isFalse);
      expect(r.value!.posts, isNotEmpty);
      expect(r.value!.posts.every((c) => !c.isLiked && !c.isMine), isTrue);
    },
    session: sessionGuest(),
  );

  fakeTest('TC-NAV-015 게스트 전시 화면 상태의 모든 항목은 isLiked·isMine이 false다', (async) {
    final r = DisplayRig(guest: true);
    r.serveTodayRecent();
    r.vm.load();
    advance(async, Duration.zero);
    expect(r.state.status, DisplayStatus.content);
    expect(r.state.items, isNotEmpty);
    expect(r.state.items.any((c) => c.isLiked || c.isMine), isFalse);
  });
}
