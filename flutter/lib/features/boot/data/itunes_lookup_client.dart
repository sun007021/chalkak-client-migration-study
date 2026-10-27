import 'package:dio/dio.dart';

import '../domain/store_version_source.dart';

/// iTunes lookup(`https://itunes.apple.com/lookup`)에서 최신 버전을 읽는다(iOS 계열).
/// 타임아웃은 [timeout](기본 `AppConstants.versionLookupTimeout`, 3초). 초과·연결 실패·
/// 5xx·해석 불가 본문은 예외로 던지고, 판정은 [ItunesUpdateChecker]가 통과로 바꾼다.
class ItunesLookupClient implements StoreVersionSource {
  ItunesLookupClient({
    required String bundleId,
    String? countryCode,
    HttpClientAdapter? adapter,
    Duration? timeout,
    Uri? baseUri,
  });

  /// 국가 코드를 못 읽을 때 쓰는 기본 국가(소문자 alpha-2).
  static const defaultCountry = 'kr';

  /// `…/lookup?bundleId=…&country=…&entity=software`. [countryCode]는 소문자로 바꾸고
  /// null·공백이면 [defaultCountry].
  static Uri buildUri({
    required String bundleId,
    String? countryCode,
    Uri? baseUri,
  }) => throw UnimplementedError();

  @override
  Future<String?> fetchLatestVersion() => throw UnimplementedError();
}
