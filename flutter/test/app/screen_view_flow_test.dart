import 'dart:async';

import 'package:chalkak/app/feed_route.dart';
import 'package:chalkak/core/analytics/analytics_constants.dart';
import 'package:chalkak/features/display/domain/display_models.dart';
import 'package:chalkak/features/edit/presentation/photo_edit_test_ids.dart';
import 'package:chalkak/features/feedback/presentation/feedback_test_ids.dart';
import 'package:chalkak/features/home/presentation/home_test_ids.dart';
import 'package:chalkak/features/navigation/presentation/navigation_test_ids.dart';
import 'package:chalkak/features/notification/presentation/notification_test_ids.dart';
import 'package:chalkak/features/onboarding/presentation/onboarding_test_ids.dart';
import 'package:chalkak/features/settings/presentation/settings_test_ids.dart';
import 'package:chalkak/features/signature/presentation/signature_test_ids.dart';
import 'package:chalkak/features/upload/presentation/upload_test_ids.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/app_harness.dart';
import '../support/home_fakes.dart' show fx;
import '../support/net_harness.dart';
import '../support/notification_fakes.dart';
import '../support/onboarding_fakes.dart' show meSignaturePath;
import '../support/settings_fakes.dart' show notificationSettingsPath;
import '../support/upload_fakes.dart' show FakePhotoPicker, photoBytes;

Future<AppHarness> _enterMain(WidgetTester tester, {bool guest = false}) async {
  final h = AppHarness(session: guest ? sessionGuest() : sessionAt());
  h.http.adapter
    ..on('GET', meSignaturePath, [
      fx('signature/users-me-signature__get-success.json'),
    ])
    ..on('GET', notificationSettingsPath, [
      fx('settings/notification-settings__get-all-true.json'),
    ]);
  tester.view.physicalSize = const Size(800, 6000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  h.homeFakes.api.standard();
  final display = h.homeFakes.displayRepository;
  display.servePage(today, DisplaySort.recent, 1, recentP1Fx);
  display.servePage(today, DisplaySort.recent, 2, recentP2Fx);
  h.notificationRepository.servePage(1, pageFx1);
  h.notificationRepository.servePage(2, pageFx2Last);
  await tester.pumpWidget(h.app);
  await tester.pump(const Duration(milliseconds: 100));
  h.preloader.completer.complete();
  await _settle(tester, 20);
  return h;
}

Future<void> _settle(WidgetTester tester, [int frames = 10]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _tap(WidgetTester tester, AppHarness h, String fixture) async {
  unawaited(
    h.dependencies.notification.coordinator.onTapped(pushPayloadFx(fixture)),
  );
  await _settle(tester);
}

Future<void> _back(WidgetTester tester, Finder from) async {
  Navigator.of(tester.element(from)).pop();
  await _settle(tester);
}

void main() {
  widgetTest('TC-ANL-017 게시물 상세에서 뒤로 가 홈으로 돌아오면 홈의 screen_view를 다시 보낸다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    h.homeFakes.postRepository.onDetail(myPostId, [
      Reply.ok(detailFx(detailMineTodayFx)),
    ]);
    await _tap(tester, h, 'payload__post-approved');
    expect(find.byType(FeedRoute), findsOneWidget);
    expect(h.analytics.screenNames, ['home', 'feed']);

    await _back(tester, find.byType(FeedRoute));
    expect(byId(HomeTestIds.root), findsOneWidget);
    expect(h.analytics.screenNames, ['home', 'feed', 'home']);
  });

  widgetTest(
    'TC-ANL-017 알림 상세에서 뒤로 가면 알림함, 알림함에서 뒤로 가면 홈의 screen_view를 다시 보낸다',
    (tester) async {
      final h = await _enterMain(tester);
      h.notificationRepository.onDetail(notiId(5), [
        Reply.ok(notiDetailFx(detailNoticeFx)),
      ]);
      await _tap(tester, h, 'payload__unknown-type');
      expect(byId(NotificationTestIds.inboxRoot), findsOneWidget);
      await _tap(tester, h, 'payload__notice');
      expect(byId(NotificationTestIds.detailRoot), findsOneWidget);
      expect(h.analytics.screenNames, [
        'home',
        'notifications',
        'notification_detail',
      ]);

      await _back(tester, byId(NotificationTestIds.detailRoot));
      expect(h.analytics.screenNames.last, 'notifications');
      await _back(tester, byId(NotificationTestIds.inboxRoot));
      expect(byId(HomeTestIds.root), findsOneWidget);
      expect(h.analytics.screenNames.last, 'home');
      expect(h.analytics.screenNames, hasLength(5));
    },
  );

  widgetTest('TC-ANL-017 알림함에서 게시물 상세로 갔다가 뒤로 가면 알림함의 screen_view를 다시 보낸다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    h.homeFakes.postRepository.onDetail(myPostId, [
      Reply.ok(detailFx(detailMineTodayFx)),
    ]);
    await _tap(tester, h, 'payload__unknown-type');
    expect(byId(NotificationTestIds.inboxRoot), findsOneWidget);
    await _tap(tester, h, 'payload__post-approved');
    expect(find.byType(FeedRoute), findsOneWidget);
    expect(h.analytics.screenNames, ['home', 'notifications', 'feed']);

    await _back(tester, find.byType(FeedRoute));
    expect(byId(NotificationTestIds.inboxRoot), findsOneWidget);
    expect(h.analytics.screenNames, [
      'home',
      'notifications',
      'feed',
      'notifications',
    ]);
  });

  widgetTest('TC-ANL-017 업로드에서 사진 편집기로 갔다가 뒤로 가면 업로드의 screen_view를 다시 보낸다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    h.homeFakes.api.today([fx('upload/posts-today__not-posted.json')]);
    await tester.tap(byId(NavigationTestIds.uploadButton));
    await _settle(tester, 20);
    expect(byId(UploadTestIds.root), findsOneWidget);
    expect(h.analytics.screenNames, ['home', 'photo_upload']);

    h.homeFakes.uploadRig.picker.queueAlbum(
      Future.value(FakePhotoPicker.album(photoBytes())),
    );
    await tester.tap(byId(UploadTestIds.albumButton));
    await _settle(tester, 20);
    expect(byId(PhotoEditTestIds.root), findsOneWidget);

    await _back(tester, byId(PhotoEditTestIds.root));
    expect(byId(UploadTestIds.root), findsOneWidget);
    expect(h.analytics.screenNames, ['home', 'photo_upload', 'photo_upload']);
  });

  widgetTest('TC-ANL-017 사인 변경 미리보기에서 다시 그리기로 돌아오면 그리기의 screen_view를 다시 보낸다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    await tester.tap(byId(NavigationTestIds.tabSettings));
    await _settle(tester);
    await tester.tap(byId(SettingsTestIds.signatureChangeButton));
    await _settle(tester);
    await tester.drag(byId(SignatureTestIds.drawCanvas), const Offset(80, 30));
    await tester.pump();
    await tester.tap(byId(SignatureTestIds.drawSubmitButton));
    await _settle(tester);
    expect(byId(SignatureTestIds.previewRoot), findsOneWidget);

    await tester.tap(byId(SignatureTestIds.previewRedrawButton));
    await _settle(tester);
    expect(byId(SignatureTestIds.drawRoot), findsOneWidget);
    expect(h.analytics.screenNames, [
      'home',
      'settings',
      'change_signature',
      'change_signature_preview',
      'change_signature',
    ]);
  });

  widgetTest(
    'TC-ANL-005 메인 탭 4개를 차례로 누르면 home, display, record, settings가 1회씩 전송된다',
    (tester) async {
      final h = await _enterMain(tester);
      for (final tab in [
        NavigationTestIds.tabDisplay,
        NavigationTestIds.tabRecord,
        NavigationTestIds.tabSettings,
      ]) {
        await tester.tap(byId(tab));
        await _settle(tester);
      }
      expect(h.analytics.screenNames, [
        'home',
        'display',
        'record',
        'settings',
      ]);
      expect(h.analytics.destinations, ['display', 'record', 'settings']);
    },
  );

  widgetTest(
    'TC-ANL-006 알림함과 알림 상세 진입은 notifications, notification_detail을 보낸다',
    (tester) async {
      final h = await _enterMain(tester);
      h.notificationRepository.onDetail(notiId(5), [
        Reply.ok(notiDetailFx(detailNoticeFx)),
      ]);
      await _tap(tester, h, 'payload__unknown-type');
      await _tap(tester, h, 'payload__notice');
      expect(h.analytics.screenNames, [
        'home',
        'notifications',
        'notification_detail',
      ]);
    },
  );

  widgetTest(
    'TC-ANL-004 설정에서 사인을 바꾸면 change_signature, change_signature_preview가 1회씩 전송된다',
    (tester) async {
      final h = await _enterMain(tester);
      await tester.tap(byId(NavigationTestIds.tabSettings));
      await _settle(tester);
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
      expect(h.analytics.screenNames, [
        'home',
        'settings',
        'change_signature',
        'change_signature_preview',
      ]);
    },
  );

  widgetTest('TC-ANL-009 피드백 화면에 들어가면 feedback이 1회 전송된다', (tester) async {
    final h = await _enterMain(tester);
    await tester.tap(byId(NavigationTestIds.tabSettings));
    await _settle(tester);
    await tester.tap(byId(SettingsTestIds.feedbackRow));
    await _settle(tester);
    expect(byId(FeedbackTestIds.root), findsOneWidget);
    expect(h.analytics.screenNames.where((n) => n == 'feedback'), hasLength(1));
  });

  widgetTest(
    'TC-ANL-010 TC-ANL-011 설정의 약관 문서는 terms_of_service·privacy_policy로 구분되고 닫을 때 이전 화면 이벤트를 다시 보내지 않는다',
    (tester) async {
      final h = await _enterMain(tester);
      await tester.tap(byId(NavigationTestIds.tabSettings));
      await _settle(tester);
      expect(h.analytics.screenNames, ['home', 'settings']);

      await tester.tap(byId(SettingsTestIds.termsRow));
      await _settle(tester);
      expect(byId(OnboardingTestIds.legalDocSheet), findsOneWidget);
      expect(h.analytics.screenNames.last, ScreenNames.termsOfService);
      await tester.tap(byId(OnboardingTestIds.legalDocCloseButton));
      await _settle(tester);
      expect(byId(OnboardingTestIds.legalDocSheet), findsNothing);
      expect(h.analytics.screenNames, [
        'home',
        'settings',
        'terms_of_service',
      ], reason: '시트를 닫아도 settings를 다시 보내지 않는다');

      await tester.tap(byId(SettingsTestIds.privacyRow));
      await _settle(tester);
      await tester.tap(byId(OnboardingTestIds.legalDocCloseButton));
      await _settle(tester);
      expect(h.analytics.screenNames, [
        'home',
        'settings',
        'terms_of_service',
        'privacy_policy',
      ]);
      expect(h.analytics.screenNames, isNot(contains('terms')));
    },
  );

  widgetTest('TC-ANL-018 같은 화면이 여러 번 다시 그려져도(크기 변경·프레임 반복) screen_view는 1회다', (
    tester,
  ) async {
    final h = await _enterMain(tester);
    tester.view.physicalSize = const Size(6000, 800); // 회전처럼 레이아웃이 바뀐다.
    await _settle(tester);
    tester.view.physicalSize = const Size(800, 6000);
    await _settle(tester, 30);
    expect(h.analytics.screenNames, ['home']);

    await tester.tap(byId(NavigationTestIds.tabSettings));
    await _settle(tester);
    tester.view.physicalSize = const Size(6000, 800);
    await _settle(tester, 30);
    expect(h.analytics.screenNames, ['home', 'settings']);
  });

  widgetTest(
    'TC-ANL-022 게스트와 회원이 같은 화면에 들어가면 같은 screen_view를 보내고 식별자 파라미터가 없다',
    (tester) async {
      final member = await _enterMain(tester);
      await tester.tap(byId(NavigationTestIds.tabDisplay));
      await _settle(tester);
      final memberEvents = _signature(member);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 1));

      final guest = await _enterMain(tester, guest: true);
      await tester.tap(byId(NavigationTestIds.tabDisplay));
      await _settle(tester);
      expect(_signature(guest), memberEvents);
      expect(memberEvents, [
        'screen_view {screen_name: home}',
        'bottom_navigation_selected {destination: display}',
        'screen_view {screen_name: display}',
      ]);
    },
  );
}

List<String> _signature(AppHarness h) => [
  for (final e in h.analytics.events) '${e.name} ${e.parameters}',
];
