import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/notification/presentation/notification_inbox_screen.dart';
import 'package:chalkak/features/notification/presentation/notification_test_ids.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/notification_fakes.dart';

class _Screen {
  _Screen(this.rig);
  final InboxRig rig;
  int backs = 0;
}

Future<_Screen> _open(
  WidgetTester tester, {
  void Function(InboxRig rig)? script,
  bool load = true,
}) async {
  final rig = InboxRig();
  rig.repo.servePage(1, pageFx1);
  rig.repo.servePage(2, pageFx2Last);
  script?.call(rig);
  addTearDown(rig.vm.dispose);
  final s = _Screen(rig);
  await pumpScreen(
    tester,
    NotificationInboxScreen(viewModel: rig.vm, onBack: () => s.backs++),
  );
  if (load) {
    unawaited(rig.vm.start());
    await settleUi(tester);
  }
  return s;
}

Finder _text(String text) => find.text(text);

void main() {
  widgetTest('TC-NOTI-004 첫 로딩 중에는 로딩 표시와 문구가 보인다', (tester) async {
    final gate = Completer<void>();
    await _open(
      tester,
      script: (r) =>
          r.repo.onPage(1, [Reply.ok(notiPageFx(pageFx1), gate: gate.future)]),
    );
    expect(byId(NotificationTestIds.inboxLoading), findsOneWidget);
    expect(_text(Copy.notiInboxLoading), findsOneWidget);
    expect(byId(NotificationTestIds.inboxList), findsNothing);
    gate.complete();
    await settleUi(tester);
    expect(byId(NotificationTestIds.inboxLoading), findsNothing);
    expect(byId(NotificationTestIds.inboxList), findsOneWidget);
  });

  widgetTest('TC-NOTI-005 빈 응답이면 빈 상태와 두 문구가 보인다', (tester) async {
    await _open(tester, script: (r) => r.repo.servePage(1, pageFxEmpty));
    expect(byId(NotificationTestIds.inboxEmpty), findsOneWidget);
    expect(_text(Copy.notiInboxEmptyTitle), findsOneWidget);
    expect(_text(Copy.notiInboxEmptyBody), findsOneWidget);
    expect(byId(NotificationTestIds.inboxList), findsNothing);
    expect(byId(NotificationTestIds.inboxLoading), findsNothing);
  });

  widgetTest('TC-NOTI-006 목록 로드 실패(콘텐츠 없음)면 오류 화면과 다시 시도가 보이고 누르면 재요청한다', (
    tester,
  ) async {
    final s = await _open(
      tester,
      script: (r) => r.repo.onPage(1, [
        Reply.fail(errorFx(pageFx500)),
        Reply.ok(notiPageFx(pageFx1)),
      ]),
    );
    expect(byId(NotificationTestIds.inboxError), findsOneWidget);
    expect(_text(Copy.notiInboxError), findsOneWidget);
    expect(_text(Copy.notiInboxRetry), findsOneWidget);
    await tester.tap(byId(NotificationTestIds.inboxRetryButton));
    await settleUi(tester);
    expect(s.rig.repo.pagesRequested, [1, 1]);
    expect(byId(NotificationTestIds.inboxError), findsNothing);
    expect(byId(NotificationTestIds.inboxList), findsOneWidget);
  });

  widgetTest('TC-NOTI-007 네트워크 오류 문구가 보인다', (tester) async {
    await _open(
      tester,
      script: (r) => r.repo.onPage(1, [Reply.fail(networkError())]),
    );
    expect(_text(Copy.notiNetwork), findsOneWidget);
  });

  widgetTest(
    'TC-NOTI-011 항목에 제목, 본문, 시각, 썸네일이 보이고 미읽음 표시는 readAt이 null일 때만 있다',
    (tester) async {
      await _open(tester);
      final first = itemFx(pageFx1, notiId(1));
      expect(byId(NotificationTestIds.item(notiId(1))), findsOneWidget);
      expect(
        find.descendant(
          of: byId(NotificationTestIds.itemTitle(notiId(1))),
          matching: _text(first.title),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: byId(NotificationTestIds.itemBody(notiId(1))),
          matching: _text(first.body),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: byId(NotificationTestIds.itemTime(notiId(1))),
          matching: _text(first.timeLabel),
        ),
        findsOneWidget,
      );
      expect(
        byId(NotificationTestIds.itemThumbnail(notiId(1))),
        findsOneWidget,
      );
      expect(byId(NotificationTestIds.itemUnread(notiId(1))), findsOneWidget);
      expect(
        byId(NotificationTestIds.itemUnread(notiId(6))),
        findsNothing,
        reason: '읽은 항목',
      );
    },
  );

  widgetTest('TC-NOTI-011 썸네일이 null인 항목도 대체 이미지 자리를 그린다(공지)', (tester) async {
    await _open(tester);
    expect(itemFx(pageFx1, notiId(5)).thumbnailImageUrl, isNull);
    expect(byId(NotificationTestIds.itemThumbnail(notiId(5))), findsOneWidget);
  });

  widgetTest('TC-NOTI-036 읽음 성공 뒤 그 행의 미읽음 표시가 사라진다', (tester) async {
    final s = await _open(tester);
    expect(byId(NotificationTestIds.itemUnread(notiId(1))), findsOneWidget);
    await tester.tap(byId(NotificationTestIds.item(notiId(1))));
    await settleUi(tester);
    expect(s.rig.repo.readCalls, [notiId(1)]);
    expect(byId(NotificationTestIds.itemUnread(notiId(1))), findsNothing);
    expect(byId(NotificationTestIds.itemUnread(notiId(2))), findsOneWidget);
    expect(s.rig.nav.calls, ['feed:$myPostId']);
  });

  widgetTest('TC-NOTI-015 목록 끝으로 스크롤하면 다음 페이지가 요청되고 로딩 표시는 요청 중에만 있다', (
    tester,
  ) async {
    final gate = Completer<void>();
    final s = await _open(
      tester,
      script: (r) => r.repo.onPage(2, [
        Reply.ok(notiPageFx(pageFx2Last), gate: gate.future),
      ]),
    );
    await tester.drag(
      byId(NotificationTestIds.inboxList),
      const Offset(0, -6000),
    );
    await settleUi(tester);
    expect(s.rig.repo.pagesRequested, [1, 2]);
    expect(byId(NotificationTestIds.inboxLoadMoreIndicator), findsOneWidget);
    gate.complete();
    await settleUi(tester);
    expect(byId(NotificationTestIds.inboxLoadMoreIndicator), findsNothing);
  });

  widgetTest('뒤로 버튼은 onBack을 부른다', (tester) async {
    final s = await _open(tester);
    await tester.tap(byId(NotificationTestIds.inboxBackButton));
    expect(s.backs, 1);
    expect(_text(Copy.notiInboxTitle), findsOneWidget);
  });
}
