import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:chalkak/features/upload/presentation/upload_success_screen.dart';
import 'package:chalkak/features/upload/presentation/upload_success_view_model.dart';
import 'package:chalkak/features/upload/presentation/upload_test_ids.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/app_harness.dart' show byId, pumpScreen, widgetTest;
import '../../../support/fake_analytics_tracker.dart';

Future<(UploadSuccessViewModel, List<UploadSuccessEvent>)> _open(
  WidgetTester tester,
  ModerationStatus status,
) async {
  final vm = UploadSuccessViewModel(
    topicTitle: '하늘',
    topicDate: const KstDate(2026, 10, 27),
    moderationStatus: status,
    analytics: FakeAnalyticsTracker(),
  );
  addTearDown(vm.dispose);
  final events = <UploadSuccessEvent>[];
  await pumpScreen(
    tester,
    UploadSuccessScreen(viewModel: vm, onEvent: events.add),
  );
  return (vm, events);
}

void main() {
  widgetTest('TC-UPL-085 PENDING이면 검수 대기 안내와 확인했어요. 버튼이 보인다', (tester) async {
    await _open(tester, ModerationStatus.pending);
    expect(byId(UploadTestIds.successRoot), findsOneWidget);
    expect(
      find.descendant(
        of: byId(UploadTestIds.successMessage),
        matching: find.text('‘하늘’을 기록했어요.'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byId(UploadTestIds.successStatusMessage),
        matching: find.text(Copy.uploadSuccessPending),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: byId(UploadTestIds.successConfirmButton),
        matching: find.text(Copy.uploadSuccessConfirm),
      ),
      findsOneWidget,
    );
  });

  widgetTest('TC-UPL-085 VALIDATING이면 사진 확인 중 안내이다', (tester) async {
    await _open(tester, ModerationStatus.validating);
    expect(
      find.descendant(
        of: byId(UploadTestIds.successStatusMessage),
        matching: find.text(Copy.uploadSuccessValidating),
      ),
      findsOneWidget,
    );
    expect(find.text(Copy.uploadSuccessPending), findsNothing);
  });

  widgetTest('TC-UPL-085 testID가 Semantics identifier로도 노출된다', (tester) async {
    final handle = tester.ensureSemantics();
    await _open(tester, ModerationStatus.pending);
    for (final id in [
      UploadTestIds.successRoot,
      UploadTestIds.successMessage,
      UploadTestIds.successStatusMessage,
      UploadTestIds.successConfirmButton,
    ]) {
      expect(find.bySemanticsIdentifier(id), findsOneWidget, reason: id);
    }
    handle.dispose();
  });

  widgetTest('REQ-UPL-062 확인했어요.를 누르면 업로드한 날짜의 전시로 이동 이벤트가 나간다', (
    tester,
  ) async {
    final (_, events) = await _open(tester, ModerationStatus.pending);
    await tester.tap(byId(UploadTestIds.successConfirmButton));
    await tester.pump();
    expect(events.single, isA<OpenDisplayOn>());
    expect((events.single as OpenDisplayOn).date, const KstDate(2026, 10, 27));
  });
}
