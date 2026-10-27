import 'package:chalkak/features/feed/domain/post_event_bus.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/display_fakes.dart';
import '../../../support/fake_async_helpers.dart';
import '../../../support/net_harness.dart' show settle;

void main() {
  fakeTest('TC-FEED-036 삭제 이벤트를 모든 구독자(전시·기록·홈)가 받는다', (async) {
    final bus = PostEventBus();
    final a = <PostEvent>[];
    final b = <PostEvent>[];
    bus.events.listen(a.add);
    bus.events.listen(b.add);
    bus.publishRemoved(myPostId);
    settle(async);
    expect(a.single, isA<PostRemoved>());
    expect(a.single.postId, myPostId);
    expect(b, hasLength(1));
  });

  fakeTest('TC-FEED-024 제목 변경 이벤트는 게시물 id와 새 제목을 싣는다(무제는 null)', (async) {
    final bus = PostEventBus();
    final events = <PostEvent>[];
    bus.events.listen(events.add);
    bus.publishTitleChanged(myPostId, '새 제목');
    bus.publishTitleChanged(myPostId, null);
    settle(async);
    expect(events.map((e) => (e as PostTitleChanged).title), ['새 제목', null]);
    expect(events.every((e) => e.postId == myPostId), isTrue);
  });

  fakeTest('TC-FEED-044 구독자가 없을 때 낸 삭제도 isRemoved로 기억한다', (async) {
    final bus = PostEventBus();
    bus.publishRemoved(myPostId);
    expect(bus.isRemoved(myPostId), isTrue);
    expect(bus.isRemoved(postIdOf(2)), isFalse);
    final late = <PostEvent>[];
    bus.events.listen(late.add);
    settle(async);
    expect(late, isEmpty, reason: '나중에 구독해도 지난 이벤트는 오지 않는다');
  });

  fakeTest('TC-FEED-057 계정이 바뀌면(reset) 기억한 삭제 id를 비운다', (async) {
    final bus = PostEventBus();
    bus.publishRemoved(myPostId);
    bus.reset();
    expect(bus.isRemoved(myPostId), isFalse);
  });

  fakeTest('같은 id를 두 번 삭제해도 isRemoved는 true이고 오류가 없다', (async) {
    final bus = PostEventBus();
    bus.publishRemoved(myPostId);
    bus.publishRemoved(myPostId);
    expect(bus.isRemoved(myPostId), isTrue);
  });
}
