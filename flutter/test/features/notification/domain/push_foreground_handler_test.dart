import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/push/notification_permission.dart';
import 'package:chalkak/core/push/push_message_source.dart';
import 'package:chalkak/features/notification/domain/push_foreground_handler.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_async_helpers.dart';
import '../../../support/notification_fakes.dart';

class _Rig {
  _Rig({
    OsPermissionStatus status = OsPermissionStatus.granted,
    bool local = true,
  }) : permission = FakeNotificationPermission(status) {
    handler = PushForegroundHandler(
      permission: permission,
      presenter: presenter,
      unread: unread,
      showsLocalNotification: local,
    );
  }

  final FakeNotificationPermission permission;
  final FakeLocalNotificationPresenter presenter =
      FakeLocalNotificationPresenter();
  final FakeUnreadRefresher unread = FakeUnreadRefresher();
  late final PushForegroundHandler handler;
}

void main() {
  fakeTest(
    'TC-PUSH-068 권한이 허용되면 앱이 서버가 준 제목·본문으로 moderation_push 채널에 직접 표시한다',
    (async) {
      final r = _Rig();
      final m = pushMessageFx('payload__post-approved');
      final decision = resolve(async, r.handler.handle(m)) as ShowForeground;
      expect(decision.title, m.title);
      expect(decision.body, m.body);
      expect(r.presenter.shown, hasLength(1));
      expect(r.presenter.shown.single.channelId, 'moderation_push');
      expect(r.presenter.shown.single.channelId, androidPushChannelId);
      expect(r.presenter.shown.single.title, m.title);
      expect(r.presenter.shown.single.body, m.body);
    },
  );

  fakeTest('TC-PUSH-068 본문이 비어 있으면 기본 문구를 쓴다', (async) {
    for (final body in <String?>[null, '']) {
      final r = _Rig();
      final m = PushMessage(
        payload: pushPayloadFx('payload__post-approved'),
        title: '제목',
        body: body,
      );
      final decision = resolve(async, r.handler.handle(m)) as ShowForeground;
      expect(decision.body, Copy.pushDefaultBody);
      expect(r.presenter.shown.single.body, Copy.pushDefaultBody);
    }
  });

  fakeTest('TC-PUSH-068 권한이 거부되면 표시하지 않는다', (async) {
    final r = _Rig(status: OsPermissionStatus.denied);
    final decision = resolve(
      async,
      r.handler.handle(pushMessageFx('payload__post-approved')),
    );
    expect(decision, isA<SuppressForeground>());
    expect(r.presenter.shown, isEmpty);
  });

  fakeTest('TC-PUSH-068 아직 묻지 않은 상태에서도 표시하지 않는다', (async) {
    final r = _Rig(status: OsPermissionStatus.notDetermined);
    expect(
      resolve(async, r.handler.handle(pushMessageFx('payload__post-approved'))),
      isA<SuppressForeground>(),
    );
  });

  fakeTest('TC-PUSH-068 런타임 권한이 없는 환경(Android 12 이하)은 표시할 수 있다', (async) {
    final r = _Rig(status: OsPermissionStatus.notRequired);
    expect(
      resolve(async, r.handler.handle(pushMessageFx('payload__post-approved'))),
      isA<ShowForeground>(),
    );
  });

  fakeTest('TC-PUSH-069 iOS(앱이 직접 만들지 않는 플랫폼)는 배너·사운드를 표시하라는 결정만 돌려준다', (
    async,
  ) {
    final r = _Rig(local: false);
    final decision = resolve(
      async,
      r.handler.handle(pushMessageFx('payload__post-approved')),
    );
    expect(decision, isA<ShowForeground>());
    expect(r.presenter.shown, isEmpty);
  });

  fakeTest('TC-PUSH-071 TC-NOTI-050 포그라운드 푸시를 받으면 미읽음 상태를 1회 다시 조회한다', (async) {
    final r = _Rig();
    resolve(async, r.handler.handle(pushMessageFx('payload__post-approved')));
    expect(r.unread.calls, 1);
  });

  fakeTest('REQ-PUSH-020 권한이 없어 표시하지 않아도 미읽음은 다시 조회한다', (async) {
    final r = _Rig(status: OsPermissionStatus.denied);
    resolve(async, r.handler.handle(pushMessageFx('payload__post-approved')));
    expect(r.unread.calls, 1);
  });

  fakeTest('REQ-PUSH-019 TC-PUSH-073 type으로 거르지 않고 AI 피드백 푸시도 임시 규칙대로 표시한다', (
    async,
  ) {
    final r = _Rig();
    for (final fx in [
      'payload__ai-review-completed',
      'payload__topic',
      'payload__notice',
      'payload__unknown-type',
    ]) {
      expect(
        resolve(async, r.handler.handle(pushMessageFx(fx))),
        isA<ShowForeground>(),
        reason: fx,
      );
    }
    expect(r.presenter.shown, hasLength(4));
  });
}
