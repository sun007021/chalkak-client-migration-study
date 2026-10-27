import 'package:chalkak/core/analytics/analytics_constants.dart';
import 'package:chalkak/core/analytics/analytics_tracker.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../support/fake_analytics_tracker.dart';

void main() {
  test('TC-ANL-002 screen_name 허용 목록은 19종(철자 고정)', () {
    expect(ScreenNames.all, hasLength(19));
    expect(ScreenNames.all.toSet(), hasLength(19));
    expect(ScreenNames.all, <String>[
      'login',
      'terms',
      'terms_of_service',
      'privacy_policy',
      'onboarding_signature',
      'onboarding_signature_preview',
      'change_signature',
      'change_signature_preview',
      'home',
      'issue',
      'notifications',
      'notification_detail',
      'display',
      'feed',
      'record',
      'settings',
      'feedback',
      'photo_upload',
      'photo_upload_success',
    ]);
  });

  test('TC-ANL-023 이벤트 이름·파라미터 키 철자', () {
    expect(AnalyticsNames.screenViewEvent, 'screen_view');
    expect(
      AnalyticsNames.bottomNavigationSelectedEvent,
      'bottom_navigation_selected',
    );
    expect(AnalyticsNames.screenNameParam, 'screen_name');
    expect(AnalyticsNames.screenClassParam, 'screen_class');
    expect(AnalyticsNames.destinationParam, 'destination');
  });

  group('AnalyticsEvent', () {
    test('TC-ANL-012 screen_view는 screen_name 필수, 다른 파라미터 없음', () {
      final e = AnalyticsEvent.screenView(ScreenNames.home);
      expect(e.name, 'screen_view');
      expect(e.parameters, {'screen_name': 'home'});
    });

    test('TC-ANL-012 screen_class는 선택값으로만 추가된다', () {
      final e = AnalyticsEvent.screenView(
        ScreenNames.feed,
        screenClass: 'FeedScreen',
      );
      expect(e.parameters, {
        'screen_name': 'feed',
        'screen_class': 'FeedScreen',
      });
    });

    test('TC-ANL-002 허용 목록 밖 screen_name은 거부', () {
      expect(() => AnalyticsEvent.screenView('Home'), throwsArgumentError);
      expect(() => AnalyticsEvent.screenView('unknown'), throwsArgumentError);
    });

    test('TC-ANL-013 TC-ANL-015 하단 탭 이벤트는 4종 destination뿐', () {
      expect(BottomDestination.values.map((d) => d.value), [
        'home',
        'display',
        'record',
        'settings',
      ]);
      for (final d in BottomDestination.values) {
        final e = AnalyticsEvent.bottomNavigationSelected(d);
        expect(e.name, 'bottom_navigation_selected');
        expect(e.parameters, {'destination': d.value});
      }
    });
  });

  group('FakeAnalyticsTracker 경유 (TC-ANL-001)', () {
    test('TC-ANL-001 인터페이스에 screen_view를 보내 Fake로 수집한다', () {
      final AnalyticsTracker tracker = FakeAnalyticsTracker();
      tracker.logEvent(AnalyticsEvent.screenView(ScreenNames.home));
      tracker.logEvent(
        AnalyticsEvent.bottomNavigationSelected(BottomDestination.display),
      );
      final fake = tracker as FakeAnalyticsTracker;
      expect(fake.screenNames, ['home']);
      expect(fake.destinations, ['display']);
    });
  });

  group('SafeAnalyticsTracker', () {
    test('TC-ANL-021 tracker가 던져도 호출자에게 예외가 전파되지 않는다', () {
      final inner = FakeAnalyticsTracker(error: StateError('boom'));
      final safe = SafeAnalyticsTracker(inner);
      expect(
        () => safe.logEvent(AnalyticsEvent.screenView(ScreenNames.home)),
        returnsNormally,
      );
      expect(inner.events, hasLength(1), reason: '내부 tracker에는 전달된다');
    });

    test('TC-ANL-021 이후 이벤트도 계속 전달된다', () {
      final inner = FakeAnalyticsTracker(error: Exception('x'));
      final safe = SafeAnalyticsTracker(inner);
      safe.logEvent(AnalyticsEvent.screenView(ScreenNames.home));
      inner.error = null;
      safe.logEvent(AnalyticsEvent.screenView(ScreenNames.feed));
      expect(inner.screenNames, ['home', 'feed']);
    });
  });

  group('LogAnalyticsTracker', () {
    test('TC-ANL-020 기본 구현은 로그 출력만 하고 던지지 않는다', () {
      final lines = <String>[];
      final tracker = LogAnalyticsTracker(sink: lines.add);
      tracker.logEvent(AnalyticsEvent.screenView(ScreenNames.login));
      expect(lines, hasLength(1));
      expect(lines.single, contains('screen_view'));
      expect(lines.single, contains('login'));
    });

    test('TC-ANL-020 sink 없이도 크래시하지 않는다', () {
      expect(
        () => LogAnalyticsTracker().logEvent(
          AnalyticsEvent.bottomNavigationSelected(BottomDestination.home),
        ),
        returnsNormally,
      );
    });
  });
}
