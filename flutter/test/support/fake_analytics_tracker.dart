import 'package:chalkak/core/analytics/analytics_constants.dart';
import 'package:chalkak/core/analytics/analytics_tracker.dart';

/// 이벤트를 모으는 Fake. [error]를 지정하면 logEvent가 던진다.
class FakeAnalyticsTracker implements AnalyticsTracker {
  FakeAnalyticsTracker({this.error});

  Object? error;
  final List<AnalyticsEvent> events = [];

  @override
  void logEvent(AnalyticsEvent event) {
    events.add(event);
    final e = error;
    if (e != null) throw e;
  }

  List<String> get screenNames => [
    for (final e in events)
      if (e.name == AnalyticsNames.screenViewEvent)
        e.parameters[AnalyticsNames.screenNameParam]!,
  ];

  List<String> get destinations => [
    for (final e in events)
      if (e.name == AnalyticsNames.bottomNavigationSelectedEvent)
        e.parameters[AnalyticsNames.destinationParam]!,
  ];
}
