import 'analytics_constants.dart';

class AnalyticsEvent {
  const AnalyticsEvent(this.name, this.parameters);

  /// `screen_view`. [screenName]이 허용 목록 밖이면 ArgumentError.
  factory AnalyticsEvent.screenView(String screenName, {String? screenClass}) =>
      throw UnimplementedError();

  /// `bottom_navigation_selected {destination}`.
  factory AnalyticsEvent.bottomNavigationSelected(
    BottomDestination destination,
  ) => throw UnimplementedError();

  final String name;

  /// 값은 문자열뿐. 사용자 식별자·토큰·게시물 내용 금지.
  final Map<String, String> parameters;
}

/// 화면 코드는 SDK가 아니라 이 인터페이스에만 의존한다.
abstract interface class AnalyticsTracker {
  void logEvent(AnalyticsEvent event);
}

/// 어떤 tracker 예외도 삼켜 앱 흐름에 영향을 주지 않는다(TC-ANL-021).
class SafeAnalyticsTracker implements AnalyticsTracker {
  SafeAnalyticsTracker(this._inner);
  // ignore: unused_field
  final AnalyticsTracker _inner;

  @override
  void logEvent(AnalyticsEvent event) => throw UnimplementedError();
}

/// 기본 구현: 로그 출력만 한다(Firebase 설정 없을 때, TC-ANL-020).
class LogAnalyticsTracker implements AnalyticsTracker {
  LogAnalyticsTracker({this._sink});
  // ignore: unused_field
  final void Function(String line)? _sink;

  @override
  void logEvent(AnalyticsEvent event) => throw UnimplementedError();
}
