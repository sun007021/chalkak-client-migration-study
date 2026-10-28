import 'dart:async';

import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/features/notification/domain/notification_models.dart';
import 'package:chalkak/features/notification/presentation/notification_detail_screen.dart';
import 'package:chalkak/features/notification/presentation/notification_test_ids.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/notification_fakes.dart';

Future<DetailRig> _open(
  WidgetTester tester,
  int nn, {
  Reply<NotificationDetail>? reply,
  String? fixture,
}) async {
  final rig = DetailRig(notiId(nn));
  rig.repo.onDetail(notiId(nn), [reply ?? Reply.ok(notiDetailFx(fixture!))]);
  await pumpScreen(
    tester,
    NotificationDetailScreen(viewModel: rig.vm, onBack: () {}),
  );
  unawaited(rig.vm.start());
  await settleUi(tester);
  return rig;
}

void main() {
  widgetTest('TC-NOTI-042 반려 상세: 원본 사진과 반려 사유가 보이고 새로 올리기는 없으며 알림함으로 버튼이 있다', (
    tester,
  ) async {
    final rig = await _open(tester, 2, fixture: detailRejectedFx);
    final d = rig.state.detail!;
    expect(find.text(Copy.notiDetailTitle), findsOneWidget);
    expect(byId(NotificationTestIds.detailPhoto), findsOneWidget);
    expect(byId(NotificationTestIds.detailRejectionSection), findsOneWidget);
    expect(find.text(Copy.notiDetailReason), findsOneWidget);
    expect(find.text(d.rejectionReason!), findsOneWidget);
    expect(find.text(d.title), findsOneWidget);
    expect(find.text(d.body), findsOneWidget);
    expect(find.text(Copy.notiDetailReupload), findsNothing);
    expect(byId(NotificationTestIds.detailBackToInboxButton), findsOneWidget);
    expect(find.text(Copy.notiDetailToInbox), findsOneWidget);
  });

  widgetTest('TC-NOTI-042 "알림함으로"를 누르면 알림함으로 돌아간다', (tester) async {
    final rig = await _open(tester, 2, fixture: detailRejectedFx);
    await tester.tap(byId(NotificationTestIds.detailBackToInboxButton));
    await settleUi(tester);
    expect(rig.nav.calls, ['back-to-inbox']);
  });

  widgetTest('TC-NOTI-043 반려 사유 500자도 줄바꿈과 스크롤로 전문이 보인다', (tester) async {
    final rig = await _open(tester, 7, fixture: detailLongFx);
    final reason = rig.state.detail!.rejectionReason!;
    expect(reason.length, 500);
    await tester.scrollUntilVisible(
      byId(NotificationTestIds.detailRejectionReason),
      200,
    );
    expect(find.text(reason), findsOneWidget);
    expect(tester.takeException(), isNull, reason: '오버플로 없음');
  });

  widgetTest('TC-NOTI-044 공지 상세: 제목과 본문 전문이 보이고 사진·반려 사유·알림함으로 버튼은 없다', (
    tester,
  ) async {
    final rig = await _open(tester, 5, fixture: detailNoticeFx);
    final d = rig.state.detail!;
    expect(find.text(d.title), findsOneWidget);
    expect(find.text(d.body), findsOneWidget);
    expect(byId(NotificationTestIds.detailPhoto), findsNothing);
    expect(byId(NotificationTestIds.detailRejectionSection), findsNothing);
    expect(byId(NotificationTestIds.detailBackToInboxButton), findsNothing);
  });

  widgetTest('TC-NOTI-045 상세 404면 notiGone만 보이고 이전 알림 정보는 보이지 않는다', (
    tester,
  ) async {
    await _open(tester, 99, reply: Reply.fail(errorFx(notiDetail404Fx)));
    expect(byId(NotificationTestIds.detailNotFound), findsOneWidget);
    expect(find.text(Copy.notiGone), findsOneWidget);
    expect(byId(NotificationTestIds.detailTitle), findsNothing);
    expect(byId(NotificationTestIds.detailBody), findsNothing);
  });

  widgetTest('TC-NOTI-047 승인 상세: 사진이 있으면 표시하고 알림함으로 버튼은 없다', (tester) async {
    await _open(tester, 1, fixture: detailApprovedFx);
    expect(byId(NotificationTestIds.detailPhoto), findsOneWidget);
    expect(byId(NotificationTestIds.detailRejectionSection), findsNothing);
    expect(byId(NotificationTestIds.detailBackToInboxButton), findsNothing);
  });

  widgetTest('TC-NOTI-047 승인 상세에 사진이 없으면 제목·본문만 보이고 깨지지 않는다', (tester) async {
    final base = notiDetailFx(detailApprovedFx);
    final rig = await _open(
      tester,
      1,
      reply: Reply.ok(
        NotificationDetail(
          id: base.id,
          type: base.type,
          rawType: base.rawType,
          title: base.title,
          body: base.body,
          createdAt: base.createdAt,
        ),
      ),
    );
    expect(byId(NotificationTestIds.detailPhoto), findsNothing);
    expect(find.text(rig.state.detail!.title), findsOneWidget);
    expect(find.text(rig.state.detail!.body), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  widgetTest('REQ-NOTI-027 로딩 중에는 로딩 표시, 실패하면 오류 상태와 다시 시도가 보이고 누르면 재요청한다', (
    tester,
  ) async {
    final gate = Completer<void>();
    final rig = DetailRig(notiId(2));
    rig.repo.onDetail(notiId(2), [
      Reply.fail(errorFx(notiDetail500Fx), gate: gate.future),
      Reply.ok(notiDetailFx(detailRejectedFx)),
    ]);
    await pumpScreen(
      tester,
      NotificationDetailScreen(viewModel: rig.vm, onBack: () {}),
    );
    unawaited(rig.vm.start());
    await settleUi(tester);
    expect(byId(NotificationTestIds.detailLoading), findsOneWidget);
    gate.complete();
    await settleUi(tester);
    expect(byId(NotificationTestIds.detailLoading), findsNothing);
    expect(byId(NotificationTestIds.detailError), findsOneWidget);
    expect(find.text(Copy.notiDetailError), findsOneWidget);
    await tester.tap(byId(NotificationTestIds.detailRetryButton));
    await settleUi(tester);
    expect(rig.repo.detailCalls, [notiId(2), notiId(2)]);
    expect(byId(NotificationTestIds.detailError), findsNothing);
  });
}
