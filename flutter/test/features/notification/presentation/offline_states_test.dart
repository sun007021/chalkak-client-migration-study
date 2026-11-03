import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/notification/presentation/notification_inbox_screen.dart';
import 'package:chalkak/features/notification/presentation/notification_test_ids.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/notification_fakes.dart';

/// D-20: 오프라인 실패의 화면 처리. 알림함으로 "콘텐츠가 있을 때"와 "없을 때"를 본다.
Future<InboxRig> _open(
  WidgetTester tester, {
  required void Function(InboxRig rig) script,
}) async {
  final rig = InboxRig();
  script(rig);
  addTearDown(rig.vm.dispose);
  await pumpScreen(
    tester,
    NotificationInboxScreen(viewModel: rig.vm, onBack: () {}),
  );
  unawaited(rig.vm.start());
  await settleUi(tester);
  return rig;
}

void main() {
  widgetTest('TC-NET-046 콘텐츠가 보이는 화면의 새로고침이 오프라인으로 실패하면 콘텐츠를 유지하고 토스트만 띄운다', (
    tester,
  ) async {
    final rig = await _open(
      tester,
      script: (r) => r.repo.servePage(1, pageFx1),
    );
    expect(byId(NotificationTestIds.inboxList), findsOneWidget);
    final shownBefore = rig.ids;

    rig.repo.onPage(1, [Reply.fail(networkError())]);
    unawaited(rig.vm.refresh());
    await settleUi(tester);

    expect(rig.toast.messages, hasLength(1));
    expect(byId(NotificationTestIds.inboxList), findsOneWidget);
    expect(byId(NotificationTestIds.inboxError), findsNothing);
    expect(find.text(Copy.notiInboxError), findsNothing);
    expect(rig.ids, shownBefore);
  });

  widgetTest(
    'TC-NET-047 콘텐츠가 없는 화면이 오프라인으로 실패하면 오류 화면과 다시 시도가 보이고 온라인 복귀 뒤 다시 시도하면 성공한다',
    (tester) async {
      final rig = await _open(
        tester,
        script: (r) => r.repo.onPage(1, [
          Reply.fail(networkError()),
          Reply.ok(notiPageFx(pageFx1)),
        ]),
      );
      expect(byId(NotificationTestIds.inboxError), findsOneWidget);
      expect(find.text(Copy.notiNetwork), findsOneWidget);
      expect(find.text(Copy.notiInboxRetry), findsOneWidget);
      expect(byId(NotificationTestIds.inboxList), findsNothing);

      // 온라인으로 돌아온 뒤 다시 시도.
      await tester.tap(byId(NotificationTestIds.inboxRetryButton));
      await settleUi(tester);
      expect(rig.repo.pagesRequested, [1, 1]);
      expect(byId(NotificationTestIds.inboxError), findsNothing);
      expect(byId(NotificationTestIds.inboxList), findsOneWidget);
    },
  );
}
