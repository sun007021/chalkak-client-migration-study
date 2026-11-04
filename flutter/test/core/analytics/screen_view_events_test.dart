import 'dart:io';

import 'package:chalkak/core/analytics/analytics_constants.dart';
import 'package:chalkak/core/copy/ko.g.dart';
import 'package:chalkak/core/time/kst_date.dart';
import 'package:chalkak/features/banner/domain/banner_web_view_model.dart';
import 'package:chalkak/features/home/domain/home_models.dart';
import 'package:chalkak/features/upload/presentation/upload_success_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../features/upload/presentation/upload_vm_driver.dart';
import '../../support/fake_analytics_tracker.dart';
import '../../support/fake_async_helpers.dart';
import '../../support/home_fakes.dart';

void main() {
  test('TC-ANL-006 배너 웹 진입은 issue를 보낸다', () {
    final analytics = FakeAnalyticsTracker();
    final vm = BannerWebViewModel(
      url: Uri.parse('https://web.example.test/issues/1'),
      analytics: analytics,
      toast: RecordingToast(),
      launcher: FakeBannerLinkLauncher(),
    );
    vm.start();
    expect(analytics.screenNames, [ScreenNames.issue]);
  });

  fakeTest('TC-ANL-008 업로드 화면 진입은 photo_upload를 1회 보낸다', (async) {
    final d = UploadDriver(async);
    d.startScreen();
    d.vm.start(); // 다시 불러도 중복 전송하지 않는다.
    d.tick();
    expect(d.rig.analytics.screenNames, [ScreenNames.photoUpload]);
    d.dispose();
  });

  test('TC-ANL-008 성공 화면 진입은 photo_upload_success를 1회 보낸다', () {
    final analytics = FakeAnalyticsTracker();
    final vm = UploadSuccessViewModel(
      topicTitle: '하늘',
      topicDate: const KstDate(2026, 10, 27),
      moderationStatus: ModerationStatus.pending,
      analytics: analytics,
    );
    addTearDown(vm.dispose);
    vm.onShown();
    vm.onShown();
    expect(analytics.screenNames, [ScreenNames.photoUploadSuccess]);
  });

  group('하단 탭 선택', () {
    fakeTest(
      'TC-ANL-014 이미 선택된 탭을 다시 선택해도 선택 동작마다 bottom_navigation_selected를 보낸다(임시안)',
      (async) {
        final r = HomeRig();
        r.shell.start();
        r.shell.selectTab(BottomDestination.home);
        r.shell.selectTab(BottomDestination.display);
        r.shell.selectTab(BottomDestination.display);
        expect(r.analytics.destinations, ['home', 'display', 'display']);
        expect(r.analytics.screenNames, [
          'home',
          'display',
        ], reason: '재선택은 화면 전환이 아니므로 screen_view는 다시 보내지 않는다');
      },
    );

    fakeTest(
      'TC-ANL-016 게스트 제한 토스트로 막힌 기록 탭은 bottom_navigation_selected도 screen_view도 보내지 않는다(임시안)',
      (async) {
        final r = HomeRig(guest: true);
        r.shell.start();
        r.shell.selectTab(BottomDestination.record);
        expect(r.toast.messages, [Copy.navGuestRecord]);
        expect(r.shell.selected, BottomDestination.home);
        expect(r.analytics.destinations, isEmpty);
        expect(r.analytics.screenNames, ['home']);
      },
    );
  });

  group('자동 화면 추적 없음', () {
    test(
      'TC-ANL-019 Flutter는 자동 screen reporting을 쓰지 않고 screen_view를 직접 보낸다',
      () {
        final pubspec = File('pubspec.yaml').readAsStringSync();
        expect(
          pubspec,
          isNot(contains('firebase_analytics')),
          reason: 'Firebase Analytics 플러그인이 없으니 자동 화면 추적이 생기지 않는다',
        );
        final offenders = <String>[];
        for (final f in Directory('lib').listSync(recursive: true)) {
          if (f is! File || !f.path.endsWith('.dart')) continue;
          final text = f.readAsStringSync();
          if (text.contains('FirebaseAnalyticsObserver') ||
              text.contains('setCurrentScreen') ||
              text.contains('FirebaseAnalytics.instance')) {
            offenders.add(f.path);
          }
        }
        expect(offenders, isEmpty);
      },
    );

    test('TC-ANL-019 플랫폼 설정에 자동 화면 보고가 켜져 있지 않다', () {
      final plist = File('ios/Runner/Info.plist').readAsStringSync();
      final iosOn = RegExp(
        r'FirebaseAutomaticScreenReportingEnabled</key>\s*<true/>',
      );
      expect(iosOn.hasMatch(plist), isFalse);
      final manifest = File('android/app/src/main/AndroidManifest.xml')
          .readAsStringSync();
      final androidOn = RegExp(
        r'google_analytics_automatic_screen_reporting_enabled"\s+android:value="true"',
      );
      expect(androidOn.hasMatch(manifest), isFalse);
    });
  });
}
