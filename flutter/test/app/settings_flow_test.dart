import 'dart:async';

import 'package:chalkak/app/feedback_route.dart';
import 'package:chalkak/core/auth/session_manager.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/ui/test_ids.dart';
import 'package:chalkak/features/feedback/presentation/feedback_test_ids.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:chalkak/features/navigation/presentation/navigation_test_ids.dart';
import 'package:chalkak/features/notification/presentation/notification_test_ids.dart';
import 'package:chalkak/features/settings/presentation/settings_test_ids.dart';
import 'package:chalkak/features/signature/presentation/signature_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/auth_fakes.dart' show AuthHttpHarness;
import '../support/home_fakes.dart' show fx;
import '../support/net_harness.dart';
import '../support/notification_fakes.dart';
import '../support/onboarding_fakes.dart'
    show changeUploadPutPath, meSignaturePath, meSignatureUploadsPath;
import '../support/settings_fakes.dart' show notificationSettingsPath;

const _sigOk = 'signature/users-me-signature__get-success.json';
const _sigNullThumb = 'signature/users-me-signature__get-thumbnail-null.json';
const _pushAllTrue = 'settings/notification-settings__get-all-true.json';
const _logoutOk = 'auth/logout__no-content.json';
const _deleteOk = 'auth/users-me__delete-no-content.json';
const _deleteError = 'auth/users-me__delete-internal-error.json';
const _changeUploads = 'signature/users-me-signature-uploads__success.json';
const _presignedOk = 'signature/presigned-put__ok.json';
const _changePut = 'signature/users-me-signature__put-success.json';
const _feedbackCreated = 'feedback/feedbacks__created.json';

/// 메인(홈)에 들어온 앱. 탈퇴 API는 실서버가 아니라 FakeAdapter가 받는다.
Future<AppHarness> _enterMain(
  WidgetTester tester, {
  bool guest = false,
  String feedback = _feedbackCreated,
}) async {
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final h = AppHarness(session: guest ? sessionGuest() : sessionAt());
  h.homeFakes.api.standard();
  h.notificationRepository.servePage(1, pageFx1);
  h.notificationRepository.servePage(2, pageFx2Last);
  h.http.adapter
    ..on('GET', meSignaturePath, [fx(_sigOk), fx(_sigNullThumb)])
    ..on('GET', notificationSettingsPath, [fx(_pushAllTrue)])
    ..on('POST', AuthHttpHarness.logoutPath, [fx(_logoutOk)])
    ..on('POST', '$v1/feedbacks', [fx(feedback)]);
  await tester.pumpWidget(h.app);
  await tester.pump(const Duration(milliseconds: 100));
  h.preloader.completer.complete();
  await _settle(tester, ticks: 20);
  return h;
}

Future<void> _settle(WidgetTester tester, {int ticks = 12}) async {
  for (var i = 0; i < ticks; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

Future<void> _openSettings(WidgetTester tester) async {
  await tester.tap(byId(NavigationTestIds.tabSettings));
  await _settle(tester);
}

void main() {
  widgetTest('TC-SET-001 TC-SET-052 설정 탭을 누르면 설정 화면이 열리고 사인과 푸시 설정을 불러온다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    expect(byId(SettingsTestIds.root), findsNothing);
    await _openSettings(tester);
    expect(byId(SettingsTestIds.root), findsOneWidget);
    expect(byId(SettingsTestIds.signatureImage), findsOneWidget);
    expect(byId(SettingsTestIds.pushTopicToggle), findsOneWidget);
    expect(byId(SettingsTestIds.logoutRow), findsOneWidget);
    expect(
      find.descendant(
        of: byId(SettingsTestIds.versionValue),
        matching: find.text(AppHarness.appVersion),
      ),
      findsOneWidget,
    );
    expect(h.analytics.screenNames.where((n) => n == 'settings'), hasLength(1));
    expect(h.http.adapter.count('GET', meSignaturePath), 1);
    expect(h.http.adapter.count('GET', notificationSettingsPath), 1);
  });

  widgetTest('TC-SET-004 REQ-SET-008 다른 탭에 다녀온 뒤 설정 탭이 다시 보이면 재조회한다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    await _openSettings(tester);
    await tester.tap(byId(NavigationTestIds.tabHome));
    await _settle(tester);
    await _openSettings(tester);
    expect(h.http.adapter.count('GET', meSignaturePath), 2);
    expect(h.http.adapter.count('GET', notificationSettingsPath), 2);
    expect(h.analytics.screenNames.where((n) => n == 'settings'), hasLength(2));
  });

  widgetTest('TC-SET-043 로그아웃을 확인하면 로그인 화면이 열리고 세션과 설정 캐시가 지워진다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    await _openSettings(tester);
    await tester.tap(byId(SettingsTestIds.logoutRow));
    await _settle(tester, ticks: 5);
    await tester.tap(byId(SettingsTestIds.logoutConfirmButton));
    await _settle(tester);
    expect(byId(TestIds.loginRoot), findsOneWidget);
    expect(byId(SettingsTestIds.root), findsNothing);
    expect(h.http.store.current, isNull);
    expect(h.http.clearedReasons, [SessionClearReason.userLogout]);
    expect(h.userData.calls, 1);
    expect(h.http.adapter.count('POST', AuthHttpHarness.logoutPath), 1);
  });

  widgetTest('TC-SET-046 TC-AUTH-044 탈퇴가 실패하면 설정 화면과 세션을 유지하고 토스트를 보인다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    h.http.adapter.on('DELETE', AuthHttpHarness.deleteMePath, [
      fx(_deleteError),
    ]);
    await _openSettings(tester);
    await tester.tap(byId(SettingsTestIds.withdrawRow));
    await _settle(tester, ticks: 5);
    await tester.tap(byId(SettingsTestIds.withdrawConfirmButton));
    await _settle(tester, ticks: 11);
    expect(byId(SettingsTestIds.root), findsOneWidget);
    expect(byId(SettingsTestIds.withdrawDialog), findsNothing);
    expect(byId(TestIds.loginRoot), findsNothing);
    expect(h.http.store.current, isNotNull);
    expect(h.userData.calls, 0);
    expect(find.text(Copy.authWithdrawError), findsOneWidget);
  });

  widgetTest('TC-SET-046 TC-AUTH-043 탈퇴가 성공하면 정리하고 로그인 화면으로 간다(Fake 서버)', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    h.http.adapter.on('DELETE', AuthHttpHarness.deleteMePath, [fx(_deleteOk)]);
    await _openSettings(tester);
    await tester.tap(byId(SettingsTestIds.withdrawRow));
    await _settle(tester, ticks: 5);
    await tester.tap(byId(SettingsTestIds.withdrawConfirmButton));
    await _settle(tester);
    expect(byId(TestIds.loginRoot), findsOneWidget);
    expect(h.http.store.current, isNull);
    expect(h.userData.calls, 1);
    expect(h.http.adapter.count('DELETE', AuthHttpHarness.deleteMePath), 1);
  });

  widgetTest('TC-AUTH-033 TC-SET-008 게스트 설정 탭은 로그인 버튼만 있고 누르면 로그인 화면이다', (
    tester,
  ) async {
    final h = await _enterMain(tester, guest: true);
    await _openSettings(tester);
    expect(byId(SettingsTestIds.loginButton), findsOneWidget);
    expect(byId(SettingsTestIds.pushSection), findsNothing);
    expect(h.http.adapter.count('GET', meSignaturePath), 0);
    expect(h.http.adapter.count('GET', notificationSettingsPath), 0);
    await tester.tap(byId(SettingsTestIds.loginButton));
    await _settle(tester);
    expect(byId(TestIds.loginRoot), findsOneWidget);
  });

  widgetTest(
    'TC-SET-050 TC-FDBK-001 피드백 보내기를 누르면 피드백 화면이 열리고 screen_view(feedback)를 한 번 보낸다',
    (tester) async {
      final h = await _enterMain(tester);
      await _openSettings(tester);
      await tester.tap(byId(SettingsTestIds.feedbackRow));
      await _settle(tester);
      expect(byId(FeedbackTestIds.root), findsOneWidget);
      expect(
        h.analytics.screenNames.where((n) => n == 'feedback'),
        hasLength(1),
      );
      await tester.tap(byId(FeedbackTestIds.closeButton));
      await _settle(tester);
      expect(byId(FeedbackTestIds.root), findsNothing);
      expect(byId(SettingsTestIds.root), findsOneWidget);
    },
  );

  widgetTest('TC-FDBK-032 시스템 뒤로 가기로도 피드백 화면이 닫히고 설정으로 돌아간다', (tester) async {
    await _enterMain(tester);
    await _openSettings(tester);
    await tester.tap(byId(SettingsTestIds.feedbackRow));
    await _settle(tester);
    expect(byId(FeedbackTestIds.root), findsOneWidget);
    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(byId(FeedbackTestIds.root), findsNothing);
    expect(byId(SettingsTestIds.root), findsOneWidget);
  });

  widgetTest('TC-FDBK-031 전송이 실패한 뒤 백그라운드 복귀와 화면 크기 변화에도 입력이 유지된다', (
    tester,
  ) async {
    await _enterMain(
      tester,
      feedback: 'feedback/feedbacks__internal-error.json',
    );
    await _openSettings(tester);
    await tester.tap(byId(SettingsTestIds.feedbackRow));
    await _settle(tester);
    final input = find.descendant(
      of: byId(FeedbackTestIds.input),
      matching: find.byType(TextField),
    );
    await tester.enterText(input, '유지되어야 하는 내용');
    await tester.pump();
    await tester.tap(byId(FeedbackTestIds.submitButton));
    await _settle(tester, ticks: 11);
    expect(byId(FeedbackTestIds.errorMessage), findsOneWidget);

    for (final state in [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(state);
    }
    tester.view.physicalSize = const Size(1200, 4000);
    await _settle(tester, ticks: 3);
    expect(tester.widget<TextField>(input).controller?.text, '유지되어야 하는 내용');
    expect(byId(FeedbackTestIds.errorMessage), findsOneWidget);
  });

  widgetTest('TC-FDBK-020 피드백을 보내면 화면이 닫히고 설정으로 돌아오며 감사 토스트가 보인다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    await _openSettings(tester);
    await tester.tap(byId(SettingsTestIds.feedbackRow));
    await _settle(tester);
    await tester.enterText(
      find.descendant(
        of: byId(FeedbackTestIds.input),
        matching: find.byType(TextField),
      ),
      '좋은 앱이에요',
    );
    await tester.pump();
    await tester.tap(byId(FeedbackTestIds.submitButton));
    await _settle(tester);
    expect(byId(FeedbackTestIds.root), findsNothing);
    expect(byId(SettingsTestIds.root), findsOneWidget);
    expect(h.http.adapter.count('POST', '$v1/feedbacks'), 1);
    expect(find.text(Copy.fdbkSuccess), findsOneWidget);
  });

  widgetTest('TC-PUSH-061 피드백 작성 중에는 푸시 탭 이동을 보류하고 화면을 닫으면 처리한다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    await _openSettings(tester);
    await tester.tap(byId(SettingsTestIds.feedbackRow));
    await _settle(tester);
    final draft = find.descendant(
      of: byId(FeedbackTestIds.input),
      matching: find.byType(TextField),
    );
    await tester.enterText(draft, '작성 중인 내용');
    await tester.pump();

    unawaited(
      h.dependencies.notification.coordinator.onTapped(
        pushPayloadFx('payload__notice'),
      ),
    );
    await _settle(tester);
    // 이동하지 않았고 작성 중인 내용도 그대로다.
    expect(find.byType(FeedbackRoute), findsOneWidget);
    expect(byId(NotificationTestIds.detailRoot), findsNothing);
    expect(tester.widget<TextField>(draft).controller?.text, '작성 중인 내용');

    h.notificationRepository.onDetail(notiId(5), [
      Reply.ok(notiDetailFx(detailNoticeFx)),
    ]);
    await tester.tap(byId(FeedbackTestIds.closeButton));
    await _settle(tester, ticks: 20);
    expect(byId(NotificationTestIds.detailRoot), findsOneWidget);
    expect(
      find.byKey(const Key(HomeTestIds.root), skipOffstage: false),
      findsOneWidget,
    );
  });

  widgetTest(
    'TC-SIGN-025 TC-SIGN-026 설정에서 사인을 바꾸면 설정으로 돌아와 토스트를 보이고 사인을 다시 조회한다',
    (tester) async {
      final h = await _enterMain(tester);
      h.http.adapter
        ..on('POST', meSignatureUploadsPath, [fx(_changeUploads)])
        ..on('PUT', changeUploadPutPath, [fx(_presignedOk)])
        ..on('PUT', meSignaturePath, [fx(_changePut)]);
      await _openSettings(tester);
      expect(h.http.adapter.count('GET', meSignaturePath), 1);

      await tester.tap(byId(SettingsTestIds.signatureChangeButton));
      await _settle(tester);
      expect(byId(SignatureTestIds.drawRoot), findsOneWidget);
      await tester.drag(
        byId(SignatureTestIds.drawCanvas),
        const Offset(80, 30),
      );
      await tester.pump();
      await tester.tap(byId(SignatureTestIds.drawSubmitButton));
      await _settle(tester);
      expect(byId(SignatureTestIds.previewRoot), findsOneWidget);
      await tester.tap(byId(SignatureTestIds.previewConfirmButton));
      await _settle(tester, ticks: 8);

      expect(byId(SignatureTestIds.previewRoot), findsNothing);
      expect(byId(SignatureTestIds.drawRoot), findsNothing);
      expect(byId(SettingsTestIds.root), findsOneWidget);
      expect(find.text(Copy.signChangeDone), findsOneWidget);
      expect(h.http.adapter.count('PUT', meSignaturePath), 1);
      expect(h.http.adapter.count('GET', meSignaturePath), 2);
    },
  );

  widgetTest('REQ-SET-004 사인 변경 화면에서 뒤로 가면 설정으로 돌아오고 재조회하지 않는다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    await _openSettings(tester);
    await tester.tap(byId(SettingsTestIds.signatureChangeButton));
    await _settle(tester);
    expect(byId(SignatureTestIds.drawRoot), findsOneWidget);
    await tester.tap(byId(SignatureTestIds.drawBackButton));
    await _settle(tester);
    expect(byId(SignatureTestIds.drawRoot), findsNothing);
    expect(byId(SettingsTestIds.root), findsOneWidget);
    expect(h.http.adapter.count('GET', meSignaturePath), 1);
  });
}
