import 'dart:convert';

import 'package:dio/dio.dart';

import '../../../core/constants/app_constants.dart';
import '../domain/store_version_source.dart';

/// iTunes lookup(`https://itunes.apple.com/lookup`)에서 최신 버전을 읽는다(iOS 계열).
/// 타임아웃은 [timeout](기본 `AppConstants.versionLookupTimeout`, 3초). 초과·연결 실패·
/// 5xx·해석 불가 본문은 예외로 던지고, 판정은 [ItunesUpdateChecker]가 통과로 바꾼다.
class ItunesLookupClient implements StoreVersionSource {
  ItunesLookupClient({
    required String bundleId,
    String? countryCode,
    this._adapter,
    Duration? timeout,
    Uri? baseUri,
  }) : _uri = buildUri(
         bundleId: bundleId,
         countryCode: countryCode,
         baseUri: baseUri,
       ),
       _timeout = timeout ?? AppConstants.versionLookupTimeout;

  final Uri _uri;
  final Duration _timeout;
  final HttpClientAdapter? _adapter;

  /// 국가 코드를 못 읽을 때 쓰는 기본 국가(소문자 alpha-2).
  static const defaultCountry = 'kr';

  /// `…/lookup?bundleId=…&country=…&entity=software`. [countryCode]는 소문자로 바꾸고
  /// null·공백이면 [defaultCountry].
  static Uri buildUri({
    required String bundleId,
    String? countryCode,
    Uri? baseUri,
  }) {
    final country = countryCode?.trim().toLowerCase();
    final base = baseUri ?? Uri.parse('https://itunes.apple.com');
    return base.replace(
      path: '/lookup',
      queryParameters: {
        'bundleId': bundleId,
        'country': (country == null || country.isEmpty)
            ? defaultCountry
            : country,
        'entity': 'software',
      },
    );
  }

  @override
  Future<String?> fetchLatestVersion() async {
    final dio = Dio(
      BaseOptions(
        connectTimeout: _timeout,
        receiveTimeout: _timeout,
        sendTimeout: _timeout,
        responseType: ResponseType.plain,
      ),
    );
    if (_adapter != null) dio.httpClientAdapter = _adapter;
    try {
      final response = await dio.getUri<String>(_uri);
      final json = jsonDecode(response.data ?? '');
      if (json is! Map) throw const FormatException('lookup 응답이 객체가 아니다');
      final results = json['results'];
      if (results is! List || results.isEmpty) return null;
      final first = results.first;
      if (first is! Map) return null;
      final version = first['version'];
      return version is String ? version : null;
    } finally {
      dio.close(force: true);
    }
  }
}
