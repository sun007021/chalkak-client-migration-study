import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:chalkak/features/upload/presentation/upload_success_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../../support/fake_analytics_tracker.dart';

UploadSuccessViewModel _vm(
  FakeAnalyticsTracker analytics, {
  ModerationStatus status = ModerationStatus.pending,
}) => UploadSuccessViewModel(
  topicTitle: '하늘',
  topicDate: const KstDate(2026, 10, 27),
  moderationStatus: status,
  analytics: analytics,
);

void main() {
  test('TC-UPL-088 성공 화면은 screen_view photo_upload_success를 한 번만 보낸다', () {
    final analytics = FakeAnalyticsTracker();
    final vm = _vm(analytics);
    addTearDown(vm.dispose);
    vm.onShown();
    vm.onShown();
    expect(analytics.screenNames, ['photo_upload_success']);
  });

  test('TC-UPL-085 문구: 기록 문장과 상태별 안내', () {
    final pending = _vm(FakeAnalyticsTracker());
    final validating = _vm(
      FakeAnalyticsTracker(),
      status: ModerationStatus.validating,
    );
    addTearDown(pending.dispose);
    addTearDown(validating.dispose);
    expect(pending.message, '‘하늘’을 기록했어요.');
    expect(pending.statusMessage, Copy.uploadSuccessPending);
    expect(validating.statusMessage, Copy.uploadSuccessValidating);
  });

  test('REQ-UPL-062 확인했어요를 누르면 업로드한 topicDate의 전시로 이동 이벤트를 낸다', () async {
    final vm = _vm(FakeAnalyticsTracker());
    addTearDown(vm.dispose);
    final events = <UploadSuccessEvent>[];
    vm.events.listen(events.add);
    vm.onConfirmPressed();
    await Future<void>.delayed(Duration.zero);
    expect(events.single, isA<OpenDisplayOn>());
    expect((events.single as OpenDisplayOn).date, const KstDate(2026, 10, 27));
  });
}
